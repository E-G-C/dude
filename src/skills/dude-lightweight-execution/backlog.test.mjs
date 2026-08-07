// @ts-check
/**
 * Backlog-derivation tests for `backlog.mjs`. The five-bucket base is canonical
 * task T002@6275636b (Feature 024); the six-bucket extension is canonical task
 * T002@73697862 (Feature 025). Covers the plan `## Chosen Design` bucket list
 * plus the ratified own-package blocking interpretation:
 *
 *   1. exactly-one-of-six-bucket assignment (disjoint buckets whose union is the input)
 *   2. the unmet-dependency rule across not-defined / not-done / all-done / dangling
 *   3. a dependency cycle leaving both endpoints Blocked without looping
 *   4. several ideas Active at once, with no cap
 *   5. no-signal ideas landing in Backlog; any ordering signal moves an idea out
 *   6. RATIFIED: a done package carrying a `blocked-by:` on its `[x]` task is NOT Blocked
 *   7. tie-break Next/Later from `.dude/state/backlog-order.md` (unknown slug ignored; absence -> no Later)
 *   8. `parseBacklogOrder` parsing an ordered slug list, ignoring heading/blank/non-slug lines
 *   9. read-only: the FS collectors write nothing and importing the module runs nothing
 *
 * Feature 025 T002 extends the same pure derivation with a Shipped-first rule:
 *
 *   10. Shipped is evaluated first and captures a completed idea named as another idea's dependency
 *   11. every idea lands in exactly one of the six buckets (Shipped included)
 *   12. the Backlog rename preserves the former Unordered membership rule
 *   13. setting Shipped aside reproduces the prior five-bucket membership exactly
 *
 * Cases 1-5 and 10-13 drive the PURE `deriveBuckets` with in-memory records. The
 * ratified case 6 and the tie-break/read-only cases 7 and 9 exercise the real
 * filesystem collector against a throwaway temp workspace, which is the only
 * place the `tasks.md` -> `ownBlocked`/`packageComplete` reduction and the
 * optional-file reader actually run. Case 8 is a pure parser test.
 *
 * @see .dude/specs/025-backlog-report/plan.md section 3 (six-bucket derivation).
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
  parseBacklogOrder,
  renderBuckets,
  renderFlowchart,
  renderKanban,
  renderMarkdown,
  renderReport,
  safeMermaidId,
} from './backlog.mjs';

/** file:// URL to the module under test, for a side-effect-free import probe. */
const BACKLOG_URL = new URL('./backlog.mjs', import.meta.url).href;

/** Absolute path to the source module under test, for spawn-based CLI checks. */
const BACKLOG_PATH = fileURLToPath(new URL('./backlog.mjs', import.meta.url));

/** Absolute path to the committed, self-contained report template (T004). */
const TEMPLATE_PATH = fileURLToPath(new URL('./backlog-template.html', import.meta.url));

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
 *   backlog: string[],
 *   shipped: string[],
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
 * Assert the six buckets are pairwise disjoint and that their union is exactly
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
    ['backlog', buckets.backlog],
    ['shipped', buckets.shipped],
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
function writeBacklogOrder(root, lines) {
  writeFile(root, '.dude/state/backlog-order.md', `${lines.join('\n')}\n`);
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

test('exactly one bucket: a mixed input partitions cleanly across all six buckets', () => {
  // Arrange: a representative input that populates every bucket.
  const ideas = [
    record('active-one', { defined: true, hasInProgress: true }),
    record('active-two', { defined: true, hasInProgress: true }),
    record('blocked-dep', { dependsOn: ['missing-idea'] }),   // unmet dependency
    record('blocked-own', { defined: true, ownBlocked: true }), // own-package evidence
    record('next-one'),                                        // tie-break signal, front
    record('later-one'),                                       // tie-break signal, behind
    record('backlog-one'),                                     // no ordering signal
    record('shipped-one', { defined: true, packageComplete: true }), // every task done
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
  assert.deepEqual(twoCycle.backlog, []);
  assert.deepEqual(twoCycle.shipped, []);

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
// 5. No-signal ideas land in Backlog.
// ---------------------------------------------------------------------------

test('no-signal ideas land in Backlog; any ordering signal moves an idea out', () => {
  // Arrange:
  //   lonely      -> no dependency, no tie-break position, named by nobody
  //   ordered-one -> gains a signal from the tie-break order
  //   named       -> defined but unfinished, so it stays in-flight; gains a signal
  //                  only by being someone else's dependency
  //   namer       -> depends on `named` (unfinished, so the dependency is unmet)
  const ideas = [
    record('lonely'),
    record('ordered-one'),
    record('named', { defined: true }),
    record('namer', { defined: true, dependsOn: ['named'] }),
  ];

  // Act
  const buckets = deriveBuckets({ ideas, order: ['ordered-one'] });

  // Assert
  assert.ok(buckets.backlog.includes('lonely'), 'a no-signal idea is Backlog');
  assert.equal(buckets.backlog.includes('ordered-one'), false, 'a tie-break position is an ordering signal');
  assert.equal(buckets.backlog.includes('named'), false, 'being named as a dependency is an ordering signal');
  assert.ok(buckets.next.includes('named'), 'the named idea gains a Next signal from being a dependency');
  assert.ok(buckets.blocked.includes('namer'), 'the depender on an unfinished idea is Blocked');
  assertPartition(buckets, ['lonely', 'ordered-one', 'named', 'namer']);
});

// ===========================================================================
// Feature 025 T002@73697862: the six-bucket extension (Shipped-first).
// ===========================================================================

/**
 * A frozen, verbatim copy of the PRIOR five-bucket `deriveBuckets` (Feature 024,
 * before the Shipped bucket) used only as a test oracle. It is intentionally NOT
 * imported from the module so the equivalence test cannot drift with the source:
 * the equivalence claim ("set Shipped aside and the remaining five buckets equal
 * the prior five-bucket membership") is checked against this fixed reference.
 * @param {FocusInputs} inputs
 * @returns {{ active: string[], next: string[], later: string[], blocked: string[], unordered: string[] }}
 */
function deriveFiveBuckets(inputs) {
  /** @param {string} left @param {string} right */
  const compareSlug = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
  const order = Array.isArray(inputs?.order) ? inputs.order : [];

  /** @type {Map<string, IdeaRecord>} */
  const bySlug = new Map();
  for (const idea of inputs?.ideas ?? []) {
    if (idea && typeof idea.slug === 'string' && !bySlug.has(idea.slug)) bySlug.set(idea.slug, idea);
  }

  /** @param {string} slug */
  const isMet = (slug) => {
    const dep = bySlug.get(slug);
    return Boolean(dep && dep.defined && dep.packageComplete);
  };

  /** @type {Map<string, number>} */
  const orderIndex = new Map();
  for (const slug of order) {
    if (bySlug.has(slug) && !orderIndex.has(slug)) orderIndex.set(slug, orderIndex.size);
  }

  /** @type {Set<string>} */
  const namedAsDep = new Set();
  for (const idea of bySlug.values()) {
    for (const dep of idea.dependsOn ?? []) namedAsDep.add(dep);
  }

  /** @type {string[]} */ const blocked = [];
  /** @type {string[]} */ const active = [];
  /** @type {IdeaRecord[]} */ const pool = [];

  for (const idea of bySlug.values()) {
    const hasUnmetDep = (idea.dependsOn ?? []).some((dep) => !isMet(dep));
    if (hasUnmetDep || idea.ownBlocked) {
      blocked.push(idea.slug);
      continue;
    }
    if (idea.hasInProgress) {
      active.push(idea.slug);
      continue;
    }
    pool.push(idea);
  }

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
    if (unfinishedAhead) later.push(idea.slug);
    else next.push(idea.slug);
  }

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

// ---------------------------------------------------------------------------
// 10. Shipped is evaluated first: a completed idea named as another idea's
//     dependency reads as Shipped, not Next.
// ---------------------------------------------------------------------------

test('shipped-first: a completed idea named as another idea dependency is Shipped, not Next', () => {
  // Arrange: `dep` is finished (defined + every task done) AND named as a
  // dependency by `user` — the exact case that, under the five-bucket logic,
  // would have made it a Next (a met dependency with an ordering signal).
  const ideas = [
    record('dep', { defined: true, packageComplete: true }),
    record('user', { defined: true, dependsOn: ['dep'] }),
  ];

  // Act
  const buckets = deriveBuckets({ ideas, order: [] });

  // Assert: Shipped wins over every ordering bucket.
  assert.ok(buckets.shipped.includes('dep'), 'a completed idea is Shipped');
  assert.equal(buckets.next.includes('dep'), false, 'Shipped is evaluated before Next');
  assert.equal(buckets.backlog.includes('dep'), false, 'a completed idea is not Backlog');
  assert.equal(buckets.blocked.includes('dep'), false, 'a completed idea is not Blocked');
  // And its met dependency still lets the depender read as Next.
  assert.ok(buckets.next.includes('user'), 'the depender on a completed idea is ready (Next)');
  assertPartition(buckets, ['dep', 'user']);
});

// ---------------------------------------------------------------------------
// 11. Every idea lands in exactly one of the six buckets (Shipped included),
//     even a finished idea that also carries an unmet dependency.
// ---------------------------------------------------------------------------

test('six-way partition: every idea lands in exactly one of the six buckets, Shipped first', () => {
  // Arrange: a finished idea (`done-dangling`) that ALSO declares an unmet
  // dependency. Under five buckets it would be Blocked; Shipped-first claims it.
  const ideas = [
    record('active-one', { defined: true, hasInProgress: true }),
    record('blocked-one', { defined: true, dependsOn: ['ghost'] }),
    record('next-one'),
    record('later-one'),
    record('backlog-one'),
    record('shipped-plain', { defined: true, packageComplete: true }),
    record('done-dangling', { defined: true, packageComplete: true, dependsOn: ['ghost'] }),
  ];
  const order = ['next-one', 'later-one'];

  // Act
  const buckets = deriveBuckets({ ideas, order });

  // Assert: a clean six-way partition and Shipped claims the finished idea that
  // would otherwise have been Blocked by its unmet dependency.
  assertPartition(buckets, ideas.map((idea) => idea.slug));
  assert.ok(buckets.shipped.includes('done-dangling'), 'Shipped-first claims a finished idea over Blocked');
  assert.equal(buckets.blocked.includes('done-dangling'), false, 'a finished idea is not also Blocked');
  assert.deepEqual(buckets.shipped, ['done-dangling', 'shipped-plain'], 'Shipped is exactly the finished ideas, slug-sorted');
});

// ---------------------------------------------------------------------------
// 12. The Backlog rename preserves the former Unordered membership rule.
// ---------------------------------------------------------------------------

test('backlog rename: the Backlog bucket keeps the former Unordered membership rule (no ordering signal)', () => {
  // Arrange: the same signal matrix as case 5 — only no-signal ideas belong.
  const ideas = [
    record('no-signal-a'),
    record('no-signal-b'),
    record('has-order'),                              // tie-break position -> not Backlog
    record('has-dep', { dependsOn: ['no-signal-a'] }), // declares a dependency -> not Backlog
  ];

  // Act
  const buckets = deriveBuckets({ ideas, order: ['has-order'] });

  // Assert: Backlog holds exactly the no-signal ideas; `no-signal-a` is named as
  // a dependency by `has-dep`, so it gains a signal and leaves Backlog.
  assert.deepEqual(buckets.backlog, ['no-signal-b'], 'only a truly no-signal idea is Backlog');
  assert.equal(buckets.backlog.includes('no-signal-a'), false, 'being named as a dependency is a signal');
  assert.equal(buckets.backlog.includes('has-order'), false, 'a tie-break position is a signal');
  assert.equal(buckets.backlog.includes('has-dep'), false, 'declaring a dependency is a signal');
});

// ---------------------------------------------------------------------------
// 13. Setting Shipped aside reproduces the prior five-bucket membership.
// ---------------------------------------------------------------------------

test('set-aside: the six buckets minus Shipped equal the prior five-bucket membership', () => {
  // Arrange: a rich input spanning every bucket, including finished ideas that
  // would land in different five-bucket homes (Next via being named; Backlog via
  // no signal; Blocked via an unmet dependency) — all now claimed by Shipped.
  const ideas = [
    record('active-one', { defined: true, hasInProgress: true }),
    record('active-two', { defined: true, hasInProgress: true }),
    record('blocked-own', { defined: true, ownBlocked: true }),
    record('blocked-dep', { defined: true, dependsOn: ['nowhere'] }),
    record('front'),
    record('behind'),
    record('backlog-one'),
    record('backlog-two'),
    // Finished ideas that the five-bucket logic would scatter:
    record('done-named', { defined: true, packageComplete: true }),          // named below -> five-bucket Next
    record('done-idle', { defined: true, packageComplete: true }),           // no signal   -> five-bucket Backlog
    record('done-dangling', { defined: true, packageComplete: true, dependsOn: ['nowhere'] }), // -> five-bucket Blocked
    record('namer', { defined: true, packageComplete: false, dependsOn: ['done-named'] }),      // met dep -> Next
  ];
  const order = ['front', 'behind'];

  // Act
  const six = deriveBuckets({ ideas, order });
  const five = deriveFiveBuckets({ ideas, order });

  // Assert: setting Shipped aside, each remaining bucket equals the prior five —
  // with the shipped slugs removed from the five-bucket homes they used to hold.
  const shippedSet = new Set(six.shipped);
  /** @param {string[]} slugs */
  const withoutShipped = (slugs) => slugs.filter((slug) => !shippedSet.has(slug));

  assert.deepEqual(six.active, withoutShipped(five.active), 'Active membership is preserved');
  assert.deepEqual(six.next, withoutShipped(five.next), 'Next membership is preserved');
  assert.deepEqual(six.later, withoutShipped(five.later), 'Later membership is preserved');
  assert.deepEqual(six.blocked, withoutShipped(five.blocked), 'Blocked membership is preserved');
  assert.deepEqual(six.backlog, withoutShipped(five.unordered), 'Backlog equals the former Unordered');

  // And Shipped is exactly the finished ideas (the only members set aside).
  assert.deepEqual(
    six.shipped,
    ['done-dangling', 'done-idle', 'done-named'],
    'Shipped is exactly the finished ideas, slug-sorted',
  );
});


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
    assert.ok(buckets.shipped.includes('done-stale'), 'an all-[x] package is Shipped');

    // Assert boundary: current blocking evidence still blocks.
    assert.equal(recordFor(ideas, 'live-block').ownBlocked, true, 'a blocked-by on a non-done task blocks');
    assert.equal(recordFor(ideas, 'bang-block').ownBlocked, true, 'a [!] task blocks');
    assert.ok(buckets.blocked.includes('live-block'), 'live-block is Blocked');
    assert.ok(buckets.blocked.includes('bang-block'), 'bang-block is Blocked');
  });
});

// ---------------------------------------------------------------------------
// 7. Tie-break Next/Later from the optional backlog-order.md.
// ---------------------------------------------------------------------------

test('tie-break: order front is Next and the rest Later; unknown slug ignored; absence yields no Later', () => {
  withWorkspace((root) => {
    // Arrange: three signal-free drafts whose only ordering signal is the file,
    // plus a `ghost` slug in the file that names no idea.
    writeIdea(root, 'alpha', { status: 'draft' });
    writeIdea(root, 'bravo', { status: 'draft' });
    writeIdea(root, 'charlie', { status: 'draft' });
    writeBacklogOrder(root, ['# Backlog order', '', '- alpha', '- bravo', '- charlie', '- ghost']);

    // Act
    const withOrder = computeFocus({ root });
    const collected = collectFocusInputs({ root });

    // Assert: the front of the order is Next and the remainder is Later.
    assert.deepEqual(withOrder.next, ['alpha']);
    assert.deepEqual(withOrder.later, ['bravo', 'charlie']);

    // Assert: the unknown slug is read from the file but ignored by the derivation.
    assert.ok(collected.order.includes('ghost'), 'parseBacklogOrder keeps the raw slug token');
    const placed = [
      ...withOrder.active, ...withOrder.next, ...withOrder.later, ...withOrder.blocked,
      ...withOrder.backlog, ...withOrder.shipped,
    ];
    assert.equal(placed.includes('ghost'), false, 'a slug naming no idea is ignored');

    // Act: remove the optional tie-break file.
    fs.rmSync(path.join(root, '.dude', 'state', 'backlog-order.md'));
    const noOrder = computeFocus({ root });

    // Assert: with no tie-break signal, nothing is Later; the ideas fall to Backlog.
    assert.deepEqual(noOrder.later, []);
    assert.deepEqual(noOrder.backlog, ['alpha', 'bravo', 'charlie']);
  });
});

// ---------------------------------------------------------------------------
// 8. parseBacklogOrder grammar.
// ---------------------------------------------------------------------------

test('parseBacklogOrder reads an ordered slug list, ignoring heading, blank, and non-slug lines', () => {
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
  const slugs = parseBacklogOrder(content);

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
    writeBacklogOrder(root, ['- follower', '- lonely']);
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
  const probe = 'const m = await import(process.env.BACKLOG_URL);'
    + ' process.stdout.write("EXPORTS:" + Object.keys(m).sort().join(","));';
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', probe], {
    encoding: 'utf8',
    env: { ...process.env, BACKLOG_URL: BACKLOG_URL },
  });

  // Assert: clean import, no CLI side effects, and the full export surface present.
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '', 'importing must not write to stderr');
  assert.match(result.stdout, /^EXPORTS:/, 'only the probe output should appear');
  assert.doesNotMatch(result.stdout, /Active:|Usage:/, 'the guarded CLI entry must not run on import');
  for (const name of [
    'collectFocusInputs', 'computeFocus', 'deriveBuckets', 'parseArgs', 'parseBacklogOrder', 'renderBuckets', 'run',
  ]) {
    assert.ok(result.stdout.includes(name), `export '${name}' should be present`);
  }
});

// ===========================================================================
// Renderer tests for `backlog.mjs` (canonical task T003@64726177, Feature 024).
// Appended to the T002 suite above; those cases are unchanged. Covers exactly
// the plan `## Chosen Design` section 8 renderer items (FR-008 through FR-011):
//
//   1. kanban lanes equal the text buckets for the same input (six lanes in a
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
// the source `backlog.mjs` against a throwaway workspace and reuse the existing
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
 * Parse the bucket membership out of a rendered `.dude/backlog.md`: each `##
 * <Title>` section collects its `- <slug>` list items (the first token after the
 * marker), mapping the six bucket titles back to their keys. The `## Board`
 * section and the `_(none)_` placeholder contribute nothing.
 * @param {string} md
 * @returns {FocusBuckets}
 */
function parseMarkdownBuckets(md) {
  const titleToKey = new Map([
    ['Active', 'active'], ['Next', 'next'], ['Blocked', 'blocked'],
    ['Later', 'later'], ['Backlog', 'backlog'], ['Shipped', 'shipped'],
  ]);
  /** @type {FocusBuckets} */
  const out = { active: [], next: [], later: [], blocked: [], backlog: [], shipped: [] };
  /** @type {string | null} */
  let current = null;
  for (const line of md.split('\n')) {
    const heading = /^## (.+)$/.exec(line);
    if (heading) {
      current = titleToKey.get(heading[1]) ?? null;
      continue;
    }
    if (!current) continue;
    const item = /^- (\S+)/.exec(line);
    if (item) out[/** @type {keyof FocusBuckets} */ (current)].push(item[1]);
  }
  return out;
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
  // Arrange: a mixed input that reaches all six buckets, with a deliberate mix
  // of defined and draft ideas. The annotation is supplied through `meta`,
  // exactly as the CLI builds it for defined ideas (a `spec-<number>` string).
  const ideas = [
    record('active-one', { defined: true, hasInProgress: true }),
    record('active-two', { defined: true, hasInProgress: true }),
    record('blocked-dep', { dependsOn: ['missing-idea'] }),      // draft, unmet dependency
    record('blocked-own', { defined: true, ownBlocked: true }),  // defined, own-package block
    record('next-one'),                                          // draft, tie-break front
    record('later-one'),                                         // draft, tie-break behind
    record('backlog-one'),                                       // draft, no ordering signal
    record('shipped-one', { defined: true, packageComplete: true }), // defined, every task done
  ];
  const order = ['next-one', 'later-one'];
  // The SAME buckets object drives both the text and kanban views.
  const buckets = deriveBuckets({ ideas, order });
  // meta mirrors the CLI: only the DEFINED ideas carry a spec-number annotation.
  const meta = new Map([
    ['active-one', 'spec-100'],
    ['active-two', 'spec-101'],
    ['blocked-own', 'spec-102'],
    ['shipped-one', 'spec-103'],
  ]);

  // Act
  const text = renderBuckets(buckets);
  const kanban = renderKanban(buckets, meta);
  const parsed = parseKanban(kanban);

  // Assert: a fenced ```mermaid kanban block (structural fence only; no dep).
  assert.ok(parsed.fenced, 'kanban must be a fenced ```mermaid kanban block');

  // Assert: exactly six lanes, in the fixed section-3 order, kept even so.
  assert.deepEqual(
    parsed.lanes.map((lane) => lane.id),
    ['active', 'next', 'blocked', 'later', 'backlog', 'shipped'],
    'six lanes in the fixed backlog-bucket order',
  );
  assert.deepEqual(
    parsed.lanes.map((lane) => lane.title),
    ['Active', 'Next', 'Blocked', 'Later', 'Backlog', 'Shipped'],
    'lane titles match the bucket names',
  );

  // Assert: each lane's card slug set equals the matching bucket's slug set.
  const laneById = new Map(parsed.lanes.map((lane) => [lane.id, lane]));
  /** @type {[string, string[]][]} */
  const laneBuckets = [
    ['active', buckets.active],
    ['next', buckets.next],
    ['blocked', buckets.blocked],
    ['later', buckets.later],
    ['backlog', buckets.backlog],
    ['shipped', buckets.shipped],
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
  assert.equal(cardText('backlog-one'), 'backlog-one', 'a draft card has no annotation');

  // Assert: the text view over the SAME buckets names the same slugs.
  for (const slug of allCardSlugs) assert.ok(text.includes(slug), `the text view must also list '${slug}'`);

  // Assert: empty lanes are still emitted, in the same fixed order.
  const sparse = parseKanban(renderKanban(
    { active: ['solo'], next: [], later: [], blocked: [], backlog: [], shipped: [] },
    new Map(),
  ));
  assert.deepEqual(
    sparse.lanes.map((lane) => lane.id),
    ['active', 'next', 'blocked', 'later', 'backlog', 'shipped'],
    'all six lanes are kept even when empty',
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
    const runCli = (args) => spawnSync(process.execPath, [BACKLOG_PATH, ...args, '--root', root], { encoding: 'utf8' });

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
      { active: ['a'], next: [], later: [], blocked: [], backlog: ['b'], shipped: [] },
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
    const kanban = spawnSync(process.execPath, [BACKLOG_PATH, 'kanban', '--root', root], { encoding: 'utf8' });
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
    const flow = spawnSync(process.execPath, [BACKLOG_PATH, 'flowchart', 'charter', '--root', root], { encoding: 'utf8' });
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

// ===========================================================================
// Markdown renderer for `backlog.mjs` (canonical task T003@6d6b646e, Feature
// 025). The single derivation feeds one Markdown artifact (`.dude/backlog.md`):
// the six buckets as headed lists plus a fenced board the host renders inline,
// with per-idea membership identical to the derivation (FR-007, FR-009), and a
// pure, deterministic renderer that writes nothing on its own (FR-017).
// ===========================================================================

// ---------------------------------------------------------------------------
// 1. Markdown buckets and board membership equal the derivation.
// ---------------------------------------------------------------------------

test('renderer: the Markdown shows the six buckets and an inline board whose membership equals the derivation', () => {
  // Arrange: a mixed input reaching all six buckets, defined ideas annotated.
  const ideas = [
    record('active-one', { defined: true, hasInProgress: true }),
    record('blocked-one', { defined: true, dependsOn: ['ghost'] }),
    record('next-one'),
    record('later-one'),
    record('backlog-one'),
    record('shipped-one', { defined: true, packageComplete: true }),
  ];
  const order = ['next-one', 'later-one'];
  // The SAME buckets object feeds both the lists and the board (one derivation).
  const buckets = deriveBuckets({ ideas, order });
  const meta = new Map([['active-one', 'spec-100'], ['shipped-one', 'spec-101']]);

  // Act
  const md = renderMarkdown(buckets, meta);

  // Assert: the six bucket headings appear in the fixed order, then the board.
  const headings = md.split('\n').filter((line) => line.startsWith('## ')).map((line) => line.slice(3));
  assert.deepEqual(
    headings,
    ['Active', 'Next', 'Blocked', 'Later', 'Backlog', 'Shipped', 'Board'],
    'the six bucket headings render in the fixed order, followed by the board',
  );

  // Assert: per-idea membership parsed from the Markdown lists equals the derivation.
  const listed = parseMarkdownBuckets(md);
  for (const key of ['active', 'next', 'blocked', 'later', 'backlog', 'shipped']) {
    assert.deepEqual(
      listed[/** @type {keyof FocusBuckets} */ (key)],
      buckets[/** @type {keyof FocusBuckets} */ (key)],
      `Markdown list bucket '${key}' equals the derivation`,
    );
  }

  // Assert: the inline board is a fenced ```mermaid kanban (diagram in Markdown
  // only) whose per-lane membership also equals the derivation.
  const board = md.slice(md.indexOf('```mermaid'));
  const parsed = parseKanban(board);
  assert.ok(parsed.fenced, 'the board is a fenced ```mermaid kanban block');
  const laneById = new Map(parsed.lanes.map((lane) => [lane.id, lane]));
  for (const key of ['active', 'next', 'blocked', 'later', 'backlog', 'shipped']) {
    const cardSlugs = (laneById.get(key)?.cards ?? []).map((card) => card.slug);
    assert.deepEqual(
      [...cardSlugs].sort(),
      [...buckets[/** @type {keyof FocusBuckets} */ (key)]].sort(),
      `board lane '${key}' equals the derivation`,
    );
  }

  // Assert: a defined idea carries its annotation; membership parsing ignores it.
  assert.match(md, /^- active-one \(spec-100\)$/m, 'a defined idea list item carries its spec number');
  assert.match(md, /^- shipped-one \(spec-101\)$/m, 'a Shipped idea list item carries its spec number');
  assert.match(md, /^- next-one$/m, 'a draft list item is the bare slug');
});

// ---------------------------------------------------------------------------
// 2. renderMarkdown is a pure, deterministic function that writes nothing.
// ---------------------------------------------------------------------------

test('renderer: renderMarkdown is a pure, deterministic function of the derived result and writes nothing', () => {
  withWorkspace((root) => {
    const before = snapshotTree(root);
    /** @type {FocusBuckets} */
    const buckets = { active: ['a'], next: [], later: [], blocked: [], backlog: ['b'], shipped: ['c'] };
    const meta = new Map([['a', 'spec-1']]);

    // Act
    const first = renderMarkdown(buckets, meta);
    const second = renderMarkdown(buckets, meta);

    // Assert: a non-empty string, deterministic across calls, and no FS writes.
    assert.equal(typeof first, 'string', 'renderMarkdown returns a string');
    assert.ok(first.length > 0, 'renderMarkdown produces output');
    assert.equal(second, first, 'renderMarkdown is deterministic for identical input');
    assert.deepEqual(snapshotTree(root), before, 'renderMarkdown writes nothing on its own');

    // Empty buckets render a placeholder, not a phantom member.
    assert.match(first, /## Next\n\n_\(none\)_/, 'an empty bucket renders a (none) placeholder');
    assert.deepEqual(parseMarkdownBuckets(first).next, [], 'an empty bucket parses to no members');
  });
});

// ===========================================================================
// Report template for `backlog.mjs` (canonical task T004@746d706c, Feature 025).
// The committed template is fully self-contained: no network, no service, no
// in-file scripting, no external reference, no bundled diagram runtime, and no
// drop shadow (depth is planes + 1px rules). It carries a baked copy of the
// spectrum token values and the component styling, and generation reads no
// installed visual pack (FR-008, FR-012, FR-013).
// ===========================================================================

test('template: the committed report template is self-contained and reads no installed pack', () => {
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');

  // Self-contained: exactly one inline <style>, no in-file scripting.
  assert.match(template, /<style>[\s\S]*<\/style>/, 'the template carries a baked inline stylesheet');
  assert.equal(/<script\b/i.test(template), false, 'no in-file <script> element');
  assert.equal(/javascript:/i.test(template), false, 'no javascript: URL');
  assert.equal(/\son[a-z]+\s*=/i.test(template), false, 'no inline on<event>= handler attribute');

  // No external reference of any kind: no remote URL, link, import, or asset src.
  assert.equal(/https?:\/\//i.test(template), false, 'no absolute http(s) URL');
  assert.equal(/<link\b/i.test(template), false, 'no <link> to an external stylesheet');
  assert.equal(/@import/i.test(template), false, 'no CSS @import');
  assert.equal(/@font-face/i.test(template), false, 'no @font-face (no bundled or remote font)');
  assert.equal(/\bsrc\s*=/i.test(template), false, 'no asset src= reference');
  assert.equal(/url\(/i.test(template), false, 'no CSS url() reference');

  // No drop shadow anywhere: depth is planes + 1px rules (the strata model).
  assert.equal(template.includes('box-shadow'), false, 'no box-shadow anywhere in the template');

  // Baked, not linked: the spectrum token values and the component styling are
  // present inline (a validated copy), so the report needs no external pack.
  assert.ok(template.includes('--strata-series-1: #1552E0'), 'the spectrum series values are baked in');
  assert.ok(template.includes('--strata-canvas:  #FAFBFF'), 'the spectrum plane values are baked in');
  for (const tone of ['primary', 'info', 'success', 'warning', 'danger', 'muted']) {
    assert.ok(template.includes(`[data-tone="${tone}"]`), `the traffic-light tone '${tone}' is defined`);
  }

  // Accessibility rule preserved: a vivid series colour is never used as TEXT on
  // a light plane. Every coloured `color:` uses a -deep / -text / -tint-ink
  // variant or a role/plane token — never a bare `--strata-series-N`.
  const vividText = template.match(/color:\s*var\(--strata-series-\d\)/g);
  assert.equal(vividText, null, `coloured text must use a -deep/-text variant, found: ${vividText}`);

  // Generation reads no optional pack: neither the template nor the generation
  // module names the installed strata pack path.
  assert.equal(template.includes('dude-pack-strata-visual'), false, 'the template names no installed pack path');
  const moduleSource = fs.readFileSync(BACKLOG_PATH, 'utf8');
  assert.equal(moduleSource.includes('dude-pack-strata-visual'), false, 'generation names no installed pack path');
  assert.equal(/dude-pack-/.test(moduleSource), false, 'generation references no installed pack at all');
});

// ===========================================================================
// Report renderer and the `generate` write path (canonical task T005@68746d6c,
// Feature 025). The renderer fills the committed template from the single
// derivation with the four views (summary counts, the lane board with
// per-feature task progress, the per-feature task-order chains, and recent
// activity from idea coordinator logs) plus the portfolio rollup and work-item
// cards. `generate` produces both artifacts and prints unless `--write`, which
// writes exactly `.dude/backlog.md` and `.dude/backlog.html`. Per-idea bucket
// membership is identical across the derivation, the Markdown, and the report
// (FR-009, FR-010, FR-011, FR-016).
// ===========================================================================

/**
 * Parse the lane membership out of a rendered report: each work-item card
 * carries `data-bucket` and `data-slug`, so the six buckets are recovered
 * directly, preserving the order in which the cards appear.
 * @param {string} html
 * @returns {FocusBuckets}
 */
function parseHtmlBuckets(html) {
  /** @type {FocusBuckets} */
  const out = { active: [], next: [], later: [], blocked: [], backlog: [], shipped: [] };
  const card = /<article class="card" data-bucket="([a-z]+)" data-slug="([^"]+)"/g;
  let match;
  while ((match = card.exec(html)) !== null) {
    const bucket = /** @type {keyof FocusBuckets} */ (match[1]);
    if (Array.isArray(out[bucket])) out[bucket].push(match[2]);
  }
  return out;
}

test('report: renderReport fills the committed template self-contained, with the four views, and no leftover slots', () => {
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  /** @type {FocusBuckets} */
  const buckets = { active: [], next: ['bravo'], later: [], blocked: ['alpha'], backlog: [], shipped: [] };
  const items = new Map([
    ['alpha', {
      slug: 'alpha', title: 'Alpha Feature', defined: true, kind: 'F-025', dependsOn: ['bravo'],
      done: 1, total: 2,
      tasks: [
        { id: 'T001@aaaaaaaa', state: 'done', description: 'First task done' },
        { id: 'T002@bbbbbbbb', state: 'in-progress', description: 'Second task in progress' },
      ],
      log: ['2026-07-23 UTC - defined -> spec'],
    }],
    ['bravo', {
      slug: 'bravo', title: 'Bravo Groundwork', defined: false, kind: 'IDEA', dependsOn: [],
      done: 0, total: 0, tasks: [], log: ['2026-07-21 UTC - brainstorm captured'],
    }],
  ]);
  const model = { buckets, items, title: 'demo-workspace', generatedAt: '2026-01-01 00:00 UTC', sourceRev: 'abc1234' };

  // Act
  const html = renderReport(template, model);
  const again = renderReport(template, model);

  // Deterministic pure function of the template and model.
  assert.equal(again, html, 'renderReport is deterministic for identical input');

  // Every placeholder slot is filled — no `{{...}}` survives.
  assert.equal(/\{\{[A-Z_]+\}\}/.test(html), false, 'all template slots are substituted');
  assert.ok(html.includes('demo-workspace'), 'the title slot is filled');
  assert.ok(html.includes('2026-01-01 00:00 UTC'), 'the generation stamp is filled');
  assert.ok(html.includes('abc1234'), 'the source revision is filled');

  // The report opens with no network, service, in-file script, or external
  // reference. Idea text is escaped, so these structural constructs — which the
  // renderer never emits — cannot be introduced by the injected data either.
  for (const banned of ['<script', '</script', 'javascript:', '<link', ' src=', '@import', 'url(', 'box-shadow', 'href="http']) {
    assert.equal(html.includes(banned), false, `the report must contain no '${banned}'`);
  }

  // The four views render. (1) summary counts:
  assert.ok(html.includes('In flight'), 'view 1: summary counts render');
  assert.ok(html.includes('<div class="stat">'), 'view 1: stat tiles render');
  // (2) the lane board with per-feature task progress:
  assert.equal((html.match(/class="lane"/g) || []).length, 6, 'view 2: all six lanes render');
  assert.ok(html.includes('<div class="bar"><span style="width:50%"></span></div>'), 'view 2: per-feature task progress renders');
  // (3) per-feature task-order chains:
  assert.ok(html.includes('<section class="chain">'), 'view 3: a task-order chain renders');
  assert.ok(html.includes('>T001</code>') && html.includes('>T002</code>'), 'view 3: chain lists the ordered task ids');
  // (4) recent activity from idea coordinator logs:
  assert.ok(html.includes('<ul class="activity">'), 'view 4: recent activity renders');
  assert.ok(html.includes('defined -&gt; spec'), 'view 4: a coordinator-log entry renders (escaped)');

  // Lane membership in the report equals the derived buckets exactly.
  assert.deepEqual(parseHtmlBuckets(html), buckets, 'report lane membership equals the derivation');
});

test('report: per-idea membership is identical across the derivation, .dude/backlog.md, and .dude/backlog.html', () => {
  withWorkspace((root) => {
    // Arrange a mixed workspace that populates several buckets.
    writeIdea(root, 'shipped-one', { feature: '810-shipped' });
    writePackage(root, '810-shipped', ['- [x] T001@10101010 done a', '- [x] T002@20202020 done b']);
    writeIdea(root, 'active-one', { feature: '811-active' });
    writePackage(root, '811-active', ['- [~] T001@30303030 in progress']);
    writeIdea(root, 'blocked-one', { feature: '812-blocked', dependsOn: 'active-one' });
    writePackage(root, '812-blocked', ['- [ ] T001@40404040 pending']);
    writeIdea(root, 'backlog-one', { status: 'draft' });

    // Act: derive once, then render both artifacts from that single derivation.
    const buckets = computeFocus({ root });
    const { ideas } = collectFocusInputs({ root });
    const meta = new Map();
    for (const idea of ideas) if (idea.defined && idea.specPath) {
      const number = /(\d+)/.exec(idea.specPath)?.[1] ?? '';
      meta.set(idea.slug, `spec-${number}`);
    }
    const md = renderMarkdown(buckets, meta);
    const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
    // Build the report over the SAME derived buckets so the surfaces cannot drift.
    const items = new Map(ideas.map((idea) => [idea.slug, {
      slug: idea.slug, title: idea.slug, defined: idea.defined,
      kind: meta.has(idea.slug) ? `F-${meta.get(idea.slug).replace(/^spec-/, '')}` : 'IDEA',
      dependsOn: idea.dependsOn, done: 0, total: idea.packageComplete ? 1 : 0, tasks: [], log: [],
    }]));
    const html = renderReport(template, { buckets, items, title: 'x', generatedAt: 'x', sourceRev: 'x' });

    // Assert: all three surfaces report identical per-idea bucket membership.
    assert.deepEqual(parseMarkdownBuckets(md), buckets, 'Markdown membership equals the derivation');
    assert.deepEqual(parseHtmlBuckets(html), buckets, 'report membership equals the derivation');
  });
});

test('generate: --write writes exactly the two artifacts; the default run writes nothing', () => {
  withWorkspace((root) => {
    // Arrange a real workspace with a package and a coordinator log.
    writeIdea(root, 'charter', { feature: '820-charter' });
    writePackage(root, '820-charter', ['- [x] T001@aabbccdd shipped task']);
    writeFile(root, '.dude/ideas/charter.md',
      ['---', 'title: Charter', 'slug: charter', 'status: defined',
        'spec_path: .dude/specs/820-charter/spec.md', '---', '', '# Idea: Charter', '',
        '## Coordinator Log', '', '- 2026-07-20 UTC - brainstorm captured', ''].join('\n'));

    /** @param {string[]} args */
    const runCli = (args) => spawnSync(process.execPath, [BACKLOG_PATH, 'generate', '--root', root, ...args], { encoding: 'utf8' });

    // The default run prints both artifacts and writes nothing.
    const before = snapshotTree(root);
    const dry = runCli([]);
    assert.equal(dry.status, 0, dry.stderr);
    assert.ok(dry.stdout.includes('# Backlog'), 'the default run prints the Markdown artifact');
    assert.ok(dry.stdout.includes('<!doctype html>'), 'the default run prints the HTML artifact');
    assert.deepEqual(snapshotTree(root), before, 'the default run writes nothing');

    // `--write` writes EXACTLY the two artifacts and nothing else.
    const wrote = runCli(['--write']);
    assert.equal(wrote.status, 0, wrote.stderr);
    const added = snapshotTree(root)
      .filter((entry) => !before.includes(entry))
      .map((entry) => entry.replace(/^file /, '').replace(/ [0-9a-f]{64}$/, ''));
    assert.deepEqual(added.sort(), ['.dude/backlog.html', '.dude/backlog.md'], 'exactly the two artifacts are written');

    // Their membership agrees with the derivation, end to end.
    const buckets = computeFocus({ root });
    const md = fs.readFileSync(path.join(root, '.dude', 'backlog.md'), 'utf8');
    const html = fs.readFileSync(path.join(root, '.dude', 'backlog.html'), 'utf8');
    assert.deepEqual(parseMarkdownBuckets(md), buckets, 'the written Markdown membership equals the derivation');
    assert.deepEqual(parseHtmlBuckets(html), buckets, 'the written report membership equals the derivation');
  });
});
