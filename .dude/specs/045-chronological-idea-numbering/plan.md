# Implementation Plan: Chronological Idea Numbering

## Summary

Add one strict lifecycle-number model to the existing feature identity layer,
then make first capture, first definition, lint, backlog, selectors, and exact
owner callers consume it. Keep frontmatter `slug:` unnumbered and preserve
exact `spec_path:` as the only package-owner relation.

Publish this package first at
`.dude/specs/045-chronological-idea-numbering/spec.md`, exactly owned at
publication time by
`.dude/ideas/chronological-idea-numbering.md`. Implementation then performs one
bounded dogfood migration that renames all current ledgers without changing
their bytes, updates structured active owner references, and finally refreshes
the generated core projection after the workspace is fully numbered.

The ordering is deliberate. Strict source behavior is implemented and tested
before migration, but the currently installed `.github/` runtime remains
unchanged until the dogfood owner paths and this package's audit breadcrumb
have moved together. This lets the coordinator rename this feature's own owner
without publishing a generated runtime that rejects the still-unmigrated
workspace.

No supporting definition artifact is needed. This feature has no task-keyed
progress objective, so zero active ObjectiveRegistry regions is the applicable
case for Feature 045. Existing active ObjectiveRegistry owner paths elsewhere
remain migration inputs.

## Technical Context

**Language/Version**: Node.js >= 20, dependency-free ESM with `// @ts-check`

**Primary Dependencies**: Node standard library; existing feature identity,
workspace-path, frontmatter, task, atomic-file, backlog, and build helpers

**Storage**: Existing direct `.dude/ideas/*.md` ledgers and direct
`.dude/specs/<feature>/` packages only; no new durable state

**Testing**: `node:test` fixture matrices, current-format contract checks,
dogfood inventory/reference verification, generated projection parity, full
discovered suite, workspace lint, backlog freshness, Tester, and Code Reviewer

**Target Platform**: Cross-platform local Dude workspaces

**Project Type**: CLI-assisted workflow and deterministic Markdown inventory

**Performance Goals**: One bounded linear scan of each direct inventory and
stable numeric ordering; no recursive search or network dependency

**Constraints**: Exact three-digit range `001`-`999`; direct regular children
only; exact slug and exact-owner semantics; byte-preserving current migration;
source-owned generated core; no registry, counter, database, service, alternate
state, reusable migration framework, recycled number, or four-digit widening

## Specification Quality Validation

- Five prioritized, independently testable stories cover first capture, first
  definition, selectors and current callers, dogfood migration, and consistent
  shipped surfaces.
- Acceptance scenarios distinguish lifecycle number, semantic slug, physical
  path, exact package owner, active current references, historical text, and
  migration-boundary evidence from valid later append-only execution drift.
- FR-001 through FR-029 state observable behavior without prescribing source
  modules or test implementation.
- Edge cases cover empty and gapped inventories, draft/defined/resolved state,
  duplicate and malformed prefixes, cross-inventory collisions, `999`
  exhaustion, values above `999`, manual deletion limits, historical references,
  and tracked integrations.
- SC-001 through SC-011 are measurable through fixture outcomes, direct
  inventory counts, byte comparison, exact-reference validation, retained
  boundary evidence, classified later drift, report output, projection parity,
  and final path inspection.
- No unresolved clarification marker remains.

The specification satisfies its WHAT/WHY gate by inspection. This is not a
lint, publication, execution, or readiness claim.

## Guardrail Check

- Reuse and extend existing identity, inventory, publication, lint, backlog, and
  build owners.
- Keep deterministic allocation and diagnostics in code rather than model
  arithmetic.
- Preserve source/generated ownership: core edits under `src/`, generated
  `.github/` refreshed only through `node scripts/build-dev.mjs`.
- Keep exact owner resolution fail-closed and independent of filename
  resemblance.
- Add only the migration required for the current dogfood workspace; retain no
  general migration capability afterward.
- Add no state merely to defend against unsupported manual destruction of all
  direct identity evidence.

No new durable guardrail is proposed. Existing project and bundle guardrails
already require deterministic tooling, source/generated ownership, YAGNI, and
the smallest current-caller design.

## Verified Current Topology

1. The direct specification inventory contains exactly 44 package directories,
   numbered `001` through `044`. No `045-*` package exists in the inspected
   inventory.
2. The direct idea inventory contains 49 unnumbered regular Markdown ledgers.
   Forty-four are defined exact owners for packages `001` through `044`;
   `chronological-idea-numbering` is the selected draft; and four other ledgers
   are package-less.
3. The prospective path
   `.dude/specs/045-chronological-idea-numbering/spec.md` and future numbered
   idea path `.dude/ideas/045-chronological-idea-numbering.md` are absent in the
   inspected inventory. Publication still requires the coordinator's fresh
   collision preflight.
4. `src/skills/dude-engine/lib/feature.mjs` owns the current flat,
   symlink-safe, exact-`spec_path` feature inventory and global fail-closed owner
   resolver. Its current filename handling accepts arbitrary direct `.md`
   basenames and inventories only defined owners.
5. `src/skills/dude-engine/lib/feature-identity.mjs` owns strict frontmatter and
   spec identity parsing. It has no canonical numbered idea identity parser.
6. `src/skills/dude-engine/feature.mjs` is the thin read-only JSON adapter for
   inventory and exact owner resolution. It is the existing deterministic
   command surface to extend rather than adding another identity CLI.
7. `src/skills/dude-feature-definition/publish-first-definition.mjs` already
   performs expected-byte first-definition publication and protected-section
   validation. It currently accepts any direct idea basename and does not bind
   package prefix to an idea number.
8. `src/skills/dude-lint/lint.mjs` validates idea structure, exact owner
   metadata, task grammar, and exact task audit breadcrumbs. Its breadcrumb
   path grammar already admits numbered filenames.
9. `src/skills/dude-lightweight-execution/backlog.mjs` independently enumerates
   direct ideas and uses idea-path identity in collection, sorting, and
   rendering. Its work-order and dependency semantics must remain separate from
   lifecycle chronology.
10. Lightweight board mutation, Work acquisition and recovery, first-definition
    ownership, and the optional Beads pack already consume exact owner paths.
    Their path grammars admit numbered basenames, but fixtures and guidance need
    to prove they bind the resolver result and never rebuild a path from a slug.
11. Canonical task files carry active comments in the form
    `<!-- audit log: .dude/ideas/<current-owner>.md#coordinator-log -->`.
    Work and lint require these to match the current exact owner.
12. Active ObjectiveRegistry regions, when present, carry
    `owner.ideaPath`. Feature 045 has no measurable progress objective and needs
    no region of its own.
13. `.dude/state/task-state.json` is keyed by package `tasks.md` paths, not idea
    paths. Package paths remain unchanged, so this state file is not a migration
    target.
14. `.dude/backlog.md` and `.dude/backlog.html` are generated projections and
    must be regenerated after authoritative owner paths move.
15. Core source is authoritative under `src/`; `node scripts/build-dev.mjs`
    refreshes committed `.github/` projections while preserving project state
    and installed packs.
16. Package-less capture evidence is deterministic:
    `good-enough-delivery` was captured on 2026-07-20,
    `core-dogfood-preview` was created by split on 2026-07-29,
    `backlog-canvas` was captured on 2026-08-07, and
    `visual-systems-pack` was captured on 2026-08-24.

## Chosen Design

### 1. Extend the existing identity and inventory owners

Extend `src/skills/dude-engine/lib/feature-identity.mjs` with one strict parser
for canonical numbered idea paths and feature package prefixes:

- canonical idea path:
  `.dude/ideas/<NNN>-<slug>.md`;
- canonical package identity:
  `.dude/specs/<NNN>-<slug>/spec.md`;
- number range: integer `1` through `999`, rendered as exactly three ASCII
  digits;
- `000`, shorter or longer widths, non-ASCII digits, separators, traversal,
  backslashes, and invalid current slug shapes reject;
- the parser returns the original exact path, the three-character number, its
  numeric value, and the unnumbered slug.

Keep parsing pure. Do not add allocation state, a class hierarchy, or an
identity registry.

Refactor `src/skills/dude-engine/lib/feature.mjs` just enough to expose one
shared direct idea/package inventory used by:

- existing defined-feature inventory;
- exact owner resolution;
- exact idea selector resolution;
- next lifecycle-number projection; and
- lint and report callers that need the same diagnostics.

Each idea record carries exact path, number, slug, status, and exact
`spec_path:`. Each package record carries exact directory/spec path and number.
Validate:

1. flat real roots and direct regular entries with existing symlink safety;
2. exact numbered filename and frontmatter slug agreement;
3. unique idea number and semantic slug;
4. unique package number;
5. one idea plus at most its exact defined package at a shared number;
6. defined owner number/package-prefix agreement; and
7. the existing exact status and `spec_path:` rules.

Retain `resolveFeatureOwner({root,specPath})` as the only package-owner
resolver. It may consume the richer inventory but must still return an owner
only for one exact `status: defined` plus exact `spec_path:` match and must stop
on any global error diagnostic.

Add closed read-only idea inventory and selector operations to the existing thin
`src/skills/dude-engine/feature.mjs` JSON adapter. Do not add filesystem
mutation or child-process logic to that adapter. The inventory result exposes
the clean next number or explicit exhaustion; selector resolution accepts only:

- an exact unnumbered frontmatter slug; or
- an explicit exact workspace-relative direct idea path.

A numbered-looking bare selector remains a slug candidate as written. It is
never stripped or translated. Duplicate slug or path evidence returns no
selection.

### 2. Make first capture and first definition use the shared result

Keep brainstorm and definition lifecycle authority in
`src/skills/dude-feature-definition/`.

For a first brainstorm:

1. derive the semantic slug through the existing intake convention;
2. run the shared clean direct inventory;
3. reject an exact existing slug as a new capture and route it to refresh
   semantics instead;
4. select `max(valid idea numbers, valid package numbers) + 1`, with `001` for
   an empty inventory;
5. reject exhaustion at `999`;
6. stage the ledger at `.dude/ideas/<NNN>-<slug>.md`;
7. re-read the complete inventories immediately before expected-missing
   creation; and
8. stop on any drift, collision, or diagnostic.

Use the existing atomic expected-byte pattern for creation. If a small
first-capture publication entry point is needed to make the recheck mechanical,
keep it beside `publish-first-definition.mjs`, limit it to this current caller,
and cover it in the existing feature-definition test area. Do not create a
general ledger transaction framework, lock service, or persisted reservation.

Refresh, resolved-preservation, and explicit reopen reuse the selected exact
path and never call allocation.

Update `publish-first-definition.mjs` and its focused tests so ordinary
post-migration first definition requires:

- one exact selected numbered draft;
- target `.dude/specs/<same-NNN>-<same-slug>/spec.md`;
- a clean re-read of direct identities;
- absent target package and no conflicting numeric claim; and
- the existing protected-section, log-prefix, expected-byte, and lint gates.

The publisher does not choose a next feature number. Redefinition continues to
follow exact `spec_path:` and does not derive a new path from the idea filename.

Feature 045 publication itself intentionally uses the currently shipped
publisher and the current unnumbered owner path before these implementation
changes exist.

### 3. Adopt the identity in lint, backlog, and current callers

Update `src/skills/dude-lint/lint.mjs` to consume the shared identity semantics
or an equivalent pure parser from the same owner. After dogfood migration it
must reject:

- unnumbered direct current-format ledgers;
- malformed, `000`, or above-`999` prefixes;
- duplicate idea or package numbers;
- duplicate semantic slugs;
- filename/frontmatter slug mismatch;
- defined owner/package prefix mismatch;
- stale task audit breadcrumbs; and
- stale active ObjectiveRegistry owner paths.

Keep task breadcrumb authority unchanged: the comment names the resolver's exact
current `ideaPath` plus `#coordinator-log`.

Update `src/skills/dude-lightweight-execution/backlog.mjs` so collection parses
and retains the lifecycle number once, renders it visibly, and sorts generic
idea inventory by numeric lifecycle identity. Preserve:

- Current, Planned, and Completed lifecycle semantics;
- explicit backlog ordering;
- declared dependencies;
- task phase, glyph, and readiness semantics;
- historical activity ordering; and
- deterministic Markdown/HTML parity.

Within a view whose primary grouping is lifecycle or work state, use number as
the stable chronological identity/order inside that grouping. Do not turn
number into a global roadmap or dispatch order.

Inspect and update only real basename assumptions in:

- `src/skills/dude-lightweight-execution/board.mjs`;
- `src/skills/dude-work/recovery.mjs`;
- `src/skills/dude-work/host-adapter-runner.mjs`;
- first-definition publication and definition recovery;
- status, diff, and self-check workflow guidance;
- Ship and pre-Work intake;
- audit and ObjectiveRegistry validation; and
- optional Beads import, mirror, and Work wrappers under
  `library/packs/beads/`.

Where the existing caller already binds `resolveFeatureOwner().owner.ideaPath`
and accepts a numbered direct basename, change no production logic. Add a
numbered fixture or focused assertion instead. Do not duplicate the shared
parser in each caller.

### 4. Perform one bounded current-workspace migration

The migration is a coordinator-owned implementation operation after Feature 045
publication and after strict source helpers pass focused tests, but before
`build-dev` publishes strict generated core.

Quiesce ordinary owner mutations for the bounded operation. Capture exact source
bytes and all target/reference preconditions, stage the complete mapping, then
apply renames and structured reference edits as one rollback-capable batch. No
normal resolver, Work transition, lint mutation, or backlog regeneration runs
against an intermediate state.

For each defined ledger, derive the target prefix only from its exact
`spec_path:`. For remaining package-less ledgers, use the settled capture
evidence order. The exact mapping is:

| Current direct idea path | Numbered direct idea path |
|---|---|
| `.dude/ideas/brainstorm-ideas-intake.md` | `.dude/ideas/001-brainstorm-ideas-intake.md` |
| `.dude/ideas/remove-legacy-compatibility.md` | `.dude/ideas/002-remove-legacy-compatibility.md` |
| `.dude/ideas/guarded-directory-artifact-import.md` | `.dude/ideas/003-guarded-directory-artifact-import.md` |
| `.dude/ideas/pre-work-log-learning.md` | `.dude/ideas/004-pre-work-log-learning.md` |
| `.dude/ideas/autonomous-work-modes.md` | `.dude/ideas/005-autonomous-work-modes.md` |
| `.dude/ideas/simplify-context-footprint-audit.md` | `.dude/ideas/006-simplify-context-footprint-audit.md` |
| `.dude/ideas/technical-docs-pack-remediation.md` | `.dude/ideas/007-technical-docs-pack-remediation.md` |
| `.dude/ideas/automatic-core-dogfood-promotion.md` | `.dude/ideas/008-automatic-core-dogfood-promotion.md` |
| `.dude/ideas/autonomous-learning-governance.md` | `.dude/ideas/009-autonomous-learning-governance.md` |
| `.dude/ideas/core-autonomous-event-round-trip.md` | `.dude/ideas/010-core-autonomous-event-round-trip.md` |
| `.dude/ideas/historical-core-dogfood-fixture-repair.md` | `.dude/ideas/011-historical-core-dogfood-fixture-repair.md` |
| `.dude/ideas/core-dogfood-close-simplification.md` | `.dude/ideas/012-core-dogfood-close-simplification.md` |
| `.dude/ideas/unattended-work-continuity.md` | `.dude/ideas/013-unattended-work-continuity.md` |
| `.dude/ideas/autonomous-review-escalation-precedence.md` | `.dude/ideas/014-autonomous-review-escalation-precedence.md` |
| `.dude/ideas/automatic-unchanged-intent-redefinition.md` | `.dude/ideas/015-automatic-unchanged-intent-redefinition.md` |
| `.dude/ideas/simplify-work-command.md` | `.dude/ideas/016-simplify-work-command.md` |
| `.dude/ideas/ship-command.md` | `.dude/ideas/017-ship-command.md` |
| `.dude/ideas/autonomous-runstate-continuity.md` | `.dude/ideas/018-autonomous-runstate-continuity.md` |
| `.dude/ideas/specialist-attestation-producer.md` | `.dude/ideas/019-specialist-attestation-producer.md` |
| `.dude/ideas/task-scoped-skill-resolution.md` | `.dude/ideas/020-task-scoped-skill-resolution.md` |
| `.dude/ideas/topology-first-enforcement-reset.md` | `.dude/ideas/021-topology-first-enforcement-reset.md` |
| `.dude/ideas/runner-reason-code-coverage-fix.md` | `.dude/ideas/022-runner-reason-code-coverage-fix.md` |
| `.dude/ideas/first-definition-publish.md` | `.dude/ideas/023-first-definition-publish.md` |
| `.dude/ideas/feature-focus-order.md` | `.dude/ideas/024-feature-focus-order.md` |
| `.dude/ideas/backlog-report.md` | `.dude/ideas/025-backlog-report.md` |
| `.dude/ideas/remove-unused-authority-surfaces.md` | `.dude/ideas/026-remove-unused-authority-surfaces.md` |
| `.dude/ideas/backlog-report-usability.md` | `.dude/ideas/027-backlog-report-usability.md` |
| `.dude/ideas/agent-orchestration-metadata.md` | `.dude/ideas/028-agent-orchestration-metadata.md` |
| `.dude/ideas/bounded-owner-log-projection.md` | `.dude/ideas/029-bounded-owner-log-projection.md` |
| `.dude/ideas/backlog-lifecycle-sync.md` | `.dude/ideas/030-backlog-lifecycle-sync.md` |
| `.dude/ideas/transactional-pack-refresh.md` | `.dude/ideas/031-transactional-pack-refresh.md` |
| `.dude/ideas/theme-agnostic-design-workflow.md` | `.dude/ideas/032-theme-agnostic-design-workflow.md` |
| `.dude/ideas/conversational-brainstorm-intake.md` | `.dude/ideas/033-conversational-brainstorm-intake.md` |
| `.dude/ideas/github-issue-work-intake.md` | `.dude/ideas/034-github-issue-work-intake.md` |
| `.dude/ideas/pack-catalog-refetch.md` | `.dude/ideas/035-pack-catalog-refetch.md` |
| `.dude/ideas/upgrade-pack-guidance-correction.md` | `.dude/ideas/036-upgrade-pack-guidance-correction.md` |
| `.dude/ideas/simplify-pack-updates.md` | `.dude/ideas/037-simplify-pack-updates.md` |
| `.dude/ideas/bulk-pack-refresh.md` | `.dude/ideas/038-bulk-pack-refresh.md` |
| `.dude/ideas/ship-checkpoint-autonomy.md` | `.dude/ideas/039-ship-checkpoint-autonomy.md` |
| `.dude/ideas/recovery-continuation.md` | `.dude/ideas/040-recovery-continuation.md` |
| `.dude/ideas/pack-discovery-metadata.md` | `.dude/ideas/041-pack-discovery-metadata.md` |
| `.dude/ideas/pack-visual-neutrality.md` | `.dude/ideas/042-pack-visual-neutrality.md` |
| `.dude/ideas/github-issue-intake-guidance.md` | `.dude/ideas/043-github-issue-intake-guidance.md` |
| `.dude/ideas/persistent-design-mockups.md` | `.dude/ideas/044-persistent-design-mockups.md` |
| `.dude/ideas/chronological-idea-numbering.md` | `.dude/ideas/045-chronological-idea-numbering.md` |
| `.dude/ideas/good-enough-delivery.md` | `.dude/ideas/046-good-enough-delivery.md` |
| `.dude/ideas/core-dogfood-preview.md` | `.dude/ideas/047-core-dogfood-preview.md` |
| `.dude/ideas/backlog-canvas.md` | `.dude/ideas/048-backlog-canvas.md` |
| `.dude/ideas/visual-systems-pack.md` | `.dude/ideas/049-visual-systems-pack.md` |

The assignment gives Feature 045 its settled package identity before applying
capture-evidence order to the remaining package-less legacy ledgers. Existing
defined package identity takes precedence during legacy bootstrap by explicit
user decision; it is not a claim that all historical package numbers reflect
original brainstorm timestamps.

Migration invariants:

1. Every target is absent and every source is a direct regular file with the
   expected bytes.
2. Renaming changes no idea file bytes, including frontmatter, protected
   sections, managed content, or Coordinator Log.
3. Existing `.dude/specs/001-*` through `.dude/specs/045-*` directories and all
   ledger `spec_path:` bytes remain unchanged.
4. Update each canonical package `tasks.md` audit comment from the old exact
   owner path to the mapped new path. This includes Feature 045's initial
   `.dude/ideas/chronological-idea-numbering.md#coordinator-log` breadcrumb.
5. Update only active parsed ObjectiveRegistry `owner.ideaPath` fields. Preserve
   archived registry text and historical execution evidence.
6. Do not rewrite idea-body references, Coordinator Log events, historical
   archive text, or incidental prose.
7. At the migration boundary, leave `.dude/state/task-state.json` unchanged
   because all package task paths are unchanged.
8. Validate one exact owner per package and one canonical task breadcrumb per
   package before ordinary Work resumes.
9. Regenerate `.dude/backlog.md` and `.dude/backlog.html` only after the
   authoritative migration is valid.
10. Retain transaction-bound evidence proving 49 of 49 idea-byte matches, 45 of
    45 task files reverse exactly after replacing only the authorized
    breadcrumb, and the exact pre/post task-state hash match. Later authorized
    append-only Feature 045 execution events do not alter this checkpoint.
11. Retain no committed migration command, manifest, registry, mapping file, or
    compatibility state after this one dogfood operation. The plan table and
    normal version-control history are sufficient definition and audit context.

### 5. Update workflow guidance, docs, and generated core

After migration validates, update authoritative prompt and workflow surfaces:

- `src/skills/dude-feature-definition/SKILL.md`;
- `src/skills/dude-work-intake/SKILL.md`;
- `src/skills/dude-lightweight-execution/SKILL.md`;
- `src/skills/dude-work/SKILL.md` only where it directly binds idea paths;
- `src/agents/dude.agent.md`;
- `src/agents/dude-spec-lead.agent.md`;
- `src/instructions/dude.instructions.md`; and
- any other current `src/` owner found by the direct-path inventory.

Guidance must say:

- first brainstorm allocates and writes `<NNN>-<slug>.md`;
- normal selectors remain exact unnumbered frontmatter slugs;
- exact paths are accepted only as exact paths;
- first definition reuses the idea number;
- redefinition and all package mutation use exact `spec_path:` ownership;
- resolved and reopened ledgers retain numbers;
- diagnostics and exhaustion stop mutation; and
- number is never work order.

Update reachable examples and explanations in `README.md`,
`docs/commands.md`, `docs/reference.md`, and `docs/workflow.md`. Update optional
Beads pack prose only where it currently describes direct idea filenames or
owner selection; keep `spec_path:` as Beads feature identity.

Run `node scripts/build-dev.mjs` only after all direct dogfood ledgers and active
references satisfy the strict numbered contract. Never hand-edit generated core
files under `.github/`. Installed non-core packs remain under their existing
Compose ownership.

### 6. Keep allocation and deletion semantics deliberately bounded

The allocator knows only the direct inventories. Supported Dude lifecycle
actions never delete an idea ledger; `resolved` is the terminal retained form,
and explicit reopen keeps the same path. Therefore normal operation preserves
the high-water evidence and `max + 1` never recycles a gap.

Do not add tombstones or a counter to address arbitrary filesystem destruction.
If a user manually removes all direct evidence for the sole highest
package-less number, the remaining inventories cannot prove that lost identity.
Documentation must call this unsupported corruption rather than claim
impossible recovery. A future need for deletion or more than 999 ideas requires
an explicit new definition.

## Test Strategy

### Focused identity and allocation tests

Extend existing tests beside:

- `src/skills/dude-engine/lib/feature.mjs`;
- `src/skills/dude-engine/feature.mjs`;
- `src/skills/dude-feature-definition/publish-first-definition.mjs`; and
- any narrowly added first-capture publisher.

Use table-driven fixtures for:

- empty inventory -> `001`;
- idea max, package max, and mixed max;
- lower gaps and resolved maxima;
- draft capture followed by later package growth and eventual definition;
- refresh and explicit reopen retaining identity;
- `000`, short, long, Unicode-digit, above-`999`, and unnumbered paths;
- duplicate idea numbers, package numbers, slugs, and exact owners;
- valid one-idea/one-package pairing and invalid cross-pairing;
- filename/frontmatter slug mismatch;
- exact slug selection, exact path selection, and rejected prefix stripping;
- `999` exhaustion;
- inventory drift and target collision immediately before creation; and
- first definition reusing the selected number instead of current max.

Each mutating failure fixture snapshots the workspace and proves zero changed
paths.

### Lint, backlog, and caller regressions

Extend existing focused suites rather than creating parallel integration
frameworks:

- linter fixtures for all identity diagnostics, task breadcrumbs, active
  ObjectiveRegistry owner paths, and numbered draft/defined/resolved ledgers;
- backlog fixtures proving numeric display/order, all records exactly once,
  deterministic Markdown/HTML, and no lifecycle-number effect on explicit
  order, dependencies, readiness, or history;
- first-definition protected-byte and exact-owner cases;
- Lightweight board and Work owner reacquisition using numbered paths;
- status, diff, self-check, Ship, and prompt contracts in
  `scripts/current-format-contract.test.mjs`;
- optional Beads installed-layout import, mirror, and Work recovery fixtures
  using numbered exact owners; and
- build-dev and release projection expectations for any added core files.

If a caller already passes the exact owner path unchanged, its regression should
prove that behavior without adding source branching.

### Dogfood migration verification

Before migration, retain coordinator-owned preimage hashes and bytes for all 49
idea files, all 45 package task files, all package `spec_path:` lines, every
active ObjectiveRegistry owner path, and `.dude/state/task-state.json`. These
are transient operation evidence, not a new repository state file.

At T002 migration close, bind and retain evidence proving:

1. exactly 49 direct numbered idea files and no unnumbered direct idea file;
2. the exact `001` through `049` mapping from the plan table;
3. 49 of 49 mapped idea files equal their old-path preimages byte-for-byte;
4. 45 of 45 package task files reverse to their preimages by replacing only
   their authorized audit breadcrumb;
5. unchanged package directory names and exact `spec_path:` values;
6. exact owner resolution for every defined package;
7. exact current paths for every active ObjectiveRegistry owner;
8. an exact `.dude/state/task-state.json` pre/post hash match;
9. no stale active unnumbered reference;
10. preserved historical and protected old-path text;
11. deterministic regenerated backlog outputs; and
12. rollback completeness under one injected mid-batch failure in a disposable
    migration fixture.

Do not retain the one-time migration mechanism merely to test hypothetical
future migrations. Keep reusable tests on the permanent identity and caller
contracts; retain the original T002 transaction evidence as the proof of the
dogfood move.

### Integrated verification

After migration, docs, and generated projection are all complete, Tester runs
the focused suites first, then the normal integrated checks over one unchanged
revision:

The later snapshot is intentionally not required to equal every T002 preimage,
because authorized Work may change Feature 045's definition-owned verification
units and coordinator-owned execution state after that checkpoint. Tester must
first verify the retained T002 transaction evidence above, unchanged and
mandatory, then freshly prove:

1. all 48 unaffected historical idea ledgers still equal their migration
   preimages, while Feature 045 differs only by valid append-only Coordinator
   Log events after T002;
2. all 44 unaffected pre-existing package task files reverse to their
   preimages by replacing only the breadcrumb;
3. Feature 045's task comparison starts from the retained T002 task preimage,
   applies the one authorized breadcrumb migration, and then applies only the
   exact definition-owned T004/T005 canonical-unit replacements bound to the
   newest independently approved Work-authorized repair, its coordinator
   reconciliation event, and its final descriptors;
4. the retained repair review identity and final descriptors, or the exact task
   postimage hash recorded by the coordinator, bind the current bytes; all five
   durable keys and their dependencies are unchanged; the complete prior
   `## Lightweight Execution History` prefix is exact; and current canonical
   definitions match that latest reviewed definition-owned baseline;
5. after that baseline, only coordinator-owned glyph, history, and Feature 045
   lane-state changes recorded by the coordinator remain, with unrelated
   package entries byte-for-byte or semantically unchanged; and
6. no other task prose change, later intent change presented as execution
   drift, or waived migration defect is accepted. A later intent or definition
   change uses normal redefinition rather than this comparison.

```bash
node --test src/skills/dude-engine/lib/feature.test.mjs
node --test src/skills/dude-engine/feature.test.mjs
node --test src/skills/dude-feature-definition/publish-first-definition.test.mjs
node --test src/skills/dude-lightweight-execution/backlog.test.mjs
node --test scripts/current-format-contract.test.mjs
node scripts/build-dev.mjs
find . -path ./dist -prune -o -name '*.test.mjs' -print0 | xargs -0 node --test
node .github/skills/dude-lint/lint.mjs .
node .github/skills/dude-lightweight-execution/backlog.mjs check --root .
node .github/skills/dude-compose/compose.mjs verify
git diff --check
git status --porcelain --untracked-files=all
```

Include any focused linter or first-capture test file actually introduced by
implementation. Run existing build-release checks when the source inventory or
release contents change. Require zero lint failures and a current backlog pair.
Inspect the final changed-path set for hand-edited generated core, stale old
active paths, unsupported migration residue, or new state.

Tester reports implementation defects to the responsible specialist and does
not mutate definition metadata, task state, Coordinator Logs, or execution
history.

Reviewer receives the unchanged verified revision, focused failure/deletion
evidence, retained T002 migration-boundary proof, fresh 48-ledger and 44-task
unaffected-surface comparisons, the exact latest review-bound T004/T005
definition baseline, its coordinator reconciliation event and final descriptors
or coordinator-recorded task postimage hash, durable-key/dependency and exact
history-prefix comparisons, classified later Feature 045 coordinator-owned
glyph/history/lane-state drift, exact owner/reference inventory, backlog parity,
generated-core parity, full-suite results, lint result, Compose result, diff
hygiene, and final path inspection. Reviewer confirms no other task prose or
intent drift passed and no migration defect was waived, remains read-only, and
returns `APPROVE`, `REJECT`, or `ESCALATE`.

## Phases And Task Mapping

| Phase | Deliverable | Task |
|---|---|---|
| 1 | Strict source identity, allocation, selector, first-definition, lint, and backlog behavior with focused fixtures; generated runtime intentionally unchanged | `T001@6964656e` |
| 2 | Quiescent coordinator-owned 49-ledger dogfood rename, active owner-reference reconciliation, and backlog regeneration | `T002@6d696772` |
| 3 | Workflow guidance, docs, optional caller fixtures, and generated core projection after migration | `T003@67756964` |
| 4 | Focused and integrated verification over one unchanged numbered workspace using retained T002 proof, the latest review-bound T004/T005 definition baseline, and only later coordinator-owned state | `T004@74657374` |
| 5 | Independent read-only acceptance of the retained checkpoint, reviewed definition baseline, and later-state sequence | `T005@61636370` |

## Requirements Traceability

| Specification coverage | Plan ownership | Tasks |
|---|---|---|
| FR-001 through FR-006 / SC-001 through SC-003 | Strict identity, direct inventory, first-capture allocation, diagnostics, retention, and exhaustion | `T001@6964656e`, `T004@74657374`, `T005@61636370` |
| FR-007 through FR-012 / SC-002, SC-003 | First-definition reuse, exact selectors, consistency validation, and exact owner semantics | `T001@6964656e`, `T003@67756964`, `T004@74657374`, `T005@61636370` |
| FR-013 through FR-020 / SC-004, SC-007 through SC-009 | Draft/defined/resolved inventory, lint, breadcrumbs, ObjectiveRegistry, backlog, Work, Ship, Lightweight, and tracked callers | `T001@6964656e`, `T002@6d696772`, `T003@67756964`, `T004@74657374`, `T005@61636370` |
| FR-021 through FR-025, FR-028, FR-029 / SC-005 through SC-008, SC-011 | Exact 49-ledger migration, mandatory T002 boundary preservation, later unaffected-surface proof, latest review-bound Feature 045 T004/T005 definition baseline, exact key/dependency/history preservation, only later coordinator-owned state, active-reference updates, and rollback | `T002@6d696772`, `T004@74657374`, `T005@61636370` |
| FR-026, FR-027 / SC-009, SC-010 | Guidance, docs, generated projection, current-caller consistency, and prohibited-state boundary | `T003@67756964`, `T004@74657374`, `T005@61636370` |

## Risks

- A parallel branch can allocate the same next number from a different direct
  inventory snapshot. The publication coordinator must rerun collision preflight
  against the actual publication workspace; merge conflicts or duplicate
  prefixes stop rather than auto-renumber.
- Switching the generated runtime before dogfood migration would make the live
  unnumbered inventory invalid and could block the migration itself. Keep
  strict changes in `src/` until the bounded rename and active references are
  complete, then run `build-dev`.
- Renaming Feature 045's owner while its task file still names the old path
  would break canonical audit ownership. The migration batch must move the idea
  and update that breadcrumb under coordinator authority before normal Work
  resumes.
- Broad text replacement could corrupt protected user content or append-only
  history. Update only parsed active task and ObjectiveRegistry fields; preserve
  all idea bytes and historical prose.
- A partial multi-file migration could produce duplicate or missing exact
  owners. Quiesce callers, preflight the complete batch, keep preimages, roll
  back on failure, and validate all owners before resuming.
- Numeric backlog sorting could accidentally become execution ordering. Tests
  must independently pin explicit order, dependency, lifecycle bucket, and task
  readiness precedence.
- Manually deleting the sole highest package-less ledger destroys the only
  permitted evidence of its number. The supported lifecycle never does this;
  adding a tombstone or counter would violate the accepted single-authority
  design.
- The fixed three-digit range can exhaust. The correct current behavior is an
  actionable stop at `999`, not speculative widening.
- Comparing a later Work snapshot directly to every T002 preimage would
  misclassify independently approved T004/T005 definition repairs or later
  coordinator-owned Feature 045 state as migration defects. Keep the T002 proof
  bound; normalize Feature 045 tasks only through the breadcrumb and latest
  review-bound definition baseline; verify its review/final descriptor or
  coordinator-recorded postimage-hash binding, unchanged keys/dependencies, and
  exact history prefix; then admit only coordinator-owned state recorded after
  that baseline. Treat any other task prose, intent drift, unrelated state, or
  missing binding as a failure, not as a waived migration defect.

## Supporting Artifacts

None. The specification, this plan, and canonical tasks contain the complete
contract and current migration mapping.
