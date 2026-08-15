# Implementation Plan: Bulk Pack Refresh

## Summary

Add an opt-in post-core pack phase to the existing bundle-upgrade workflow.
Plain upgrade remains byte-for-byte and behaviorally core-only. For
`@dude upgrade --all`, the existing reviewed core plan, confirmation, safety tag,
upgrade branch, lint, and core commit complete first. A new invocation of the
now-upgraded engine then reads the canonical installed map, previews every
installed pack through Compose's ordinary projection path, and waits for a
separate `confirm packs` decision.

Compose gains one read-only preview mode by extracting the preparation half of
its existing refresh path. Preview and mutation therefore share source
resolution, upgraded model loading, projection, ownership checks, old/new
destination classification, profile authority, and cleanup. The upgrade engine
does not render or transact pack files itself.

After pack confirmation, the upgrade engine invokes Compose refreshes in sorted
installed-map order, stops at the first refusal, runs lint, and makes at most one
aggregate pack-output commit containing every successful refresh. That one
commit is created after all success or immediately after the first failure, so
success and partial failure return from a clean upgrade branch. The existing
safety tag remains the rollback boundary for both the core commit and the later
pack commit. Nothing pushes or merges.

The canonical feature identity is
`.dude/specs/038-bulk-pack-refresh/spec.md`, prospectively and exactly owned by
`.dude/ideas/bulk-pack-refresh.md`.

This feature has no task-keyed runtime objective and no active ObjectiveRegistry
region.

## Technical Context

**Language/Version**: Dependency-free ECMAScript modules with `// @ts-check`
under Node.js 20 or newer; Markdown operational guidance and user documentation

**Primary Dependencies**: Existing upgrade schema-v1 plans and apply flow;
existing Git safety tag, branch, lint, exact-path staging, and hook-disabled
commit helpers; Compose's profile parser, `cmdStatus`, source resolver, packaged
projection loader, `stagePackFromSource`, destination-set classification,
`cmdRefresh`, caught-failure rollback, and result reporting

**Storage**: Existing upgrade plan cache under the operating-system temp
directory and the canonical `.dude/metadata/profile.md`. Add no project state,
pack-phase ledger, second profile, registry, or persistent orchestration record.
Preparation stages remain operation-local temporary directories and are removed.

**Testing**: Focused `node:test` upgrade and Compose regressions with local
filesystem and `file://` Git fixtures; existing build tests; prose contracts only
for directly changed command guidance; recursive Node suite; workspace lint;
Compose verification; development and release build checks; diff hygiene

**Target Platform**: Supported macOS, Linux, and Windows Dude workspaces with
Node.js 20 or newer and Git available for remote sources and upgrade safety

**Project Type**: Reusable coordination bundle core. Authoritative code and
skills live under `src/`; generated dogfood core lives under `.github/`; direct
user documentation lives under `docs/`.

**Performance Goals**: One post-core preview and at most one refresh per
installed pack, followed by at most one aggregate pack commit. No background,
parallel, cached-preview, or scheduling behavior applies.

**Constraints**: Preserve existing core plan/apply evidence; run the pack phase
only after the core commit; use the installed upgraded Compose engine; bind
remote packs to the core plan's concrete commit; retain local target precedence;
generate `.github/` only through `node scripts/build-dev.mjs`

## Specification Quality Validation

- Four prioritized, independently testable stories cover the opt-in all-success
  path, pack/source authority, partial progress, and unchanged ordinary upgrade.
- Acceptance scenarios cover a separate post-core preview and confirmation,
  additions/replacements/removals, empty installed maps, confirmation refusal,
  first and later pack failures, aggregate commits, local precedence, remote
  concrete-revision binding, release bundles without `library/`, dry-run,
  rollback, and clean-tree safety.
- FR-001 through FR-018 describe observable WHAT/WHY behavior without selecting
  modules, helper names, schemas, or test fixtures.
- SC-001 through SC-011 are measurable through commit order, mutation snapshots,
  local Git fixtures, report categories, regression gates, and prohibited-surface
  inspection.
- No unresolved clarification or `[NEEDS CLARIFICATION]` marker remains.

The specification satisfies its WHAT/WHY gate by inspection. This is not a lint,
execution, publication, or readiness claim.

## Verified Current Topology

1. `src/skills/dude-bundle-upgrade/upgrade.mjs` owns `status`, `plan`, `apply`,
   and `rollback`. `plan` records the requested and resolved refs plus a concrete
   upstream commit in a canonical schema-v1 envelope. `apply` validates exact
   reviewed evidence, requires a clean tree, creates the safety tag and upgrade
   branch, writes only persisted core buckets plus manifest/log, runs lint, and
   commits with hooks disabled.
2. Existing `apply` commits core before returning and reports the safety tag and
   branch. Its committed upgrade-log entry contains the reviewed `plan_id`.
   Plain status, plan, apply, skip-removals, and rollback have extensive
   no-mutation and exact-bucket regressions.
3. Upgrade ownership deliberately excludes pack artifacts and
   `.dude/metadata/profile.md`. This boundary remains unchanged; bulk refresh is
   a later explicit phase, not an expansion of core ownership.
4. `src/skills/dude-compose/compose.mjs` reads the installed map as canonical
   membership, sorts status output, and exposes one-pack `cmdRefresh`. Refresh
   loads projection dependencies from the installed engine, stages current
   source through `stagePackFromSource`, classifies replacements/additions/
   removals, rereads profile authority, and applies one all-or-restored
   transaction.
5. `resolvePackDir` gives a requested local target precedence even when explicit
   source/ref values are provided. A missing local target fetches remotely; a
   released bundle therefore works without `library/`.
6. Remote Compose source resolution freshly clones on every invocation and
   records a full concrete commit. Passing the core plan's resolved commit as
   the pack ref freezes remote preview and refresh to the selected core
   revision. Direct local sources intentionally remain live local authority.
7. Compose currently has no read-only refresh preview. Copying its projection or
   destination-diff logic into upgrade would create the prohibited second path;
   the smallest coherent change is a shared operation-local preparation helper
   used by both preview and refresh.
8. Compose performs no Git commit. If several one-pack refreshes succeed before
   a later refusal, their valid output remains in the working tree. One aggregate
   post-loop commit is sufficient; per-pack commits add noise without improving
   the accepted recovery boundary.
9. `src/skills/dude-compose/compose.test.mjs` already supplies released-root,
   local/remote Git, local-precedence, source-revision, projection, profile,
   rollback, and mutation-snapshot fixtures. `upgrade.test.mjs` supplies
   end-to-end plan/apply, commit, clean-tree, safety, rollback, and exact-path
   fixtures. Extend those suites rather than creating another harness.
10. `scripts/build-dev.mjs` projects authoritative non-test core from `src/` to
    `.github/`. Release builds exclude `library/`, making a pristine release
    fixture the direct distribution proof for remote bulk refresh.

## Guardrail And Smallest-Design Check

Existing project-specific guardrails already cover YAGNI, deterministic
mechanisms, authoritative source, generated-core discipline, profile opt-in, and
Compose refresh. No genuinely new durable project rule is required.

| Kept surface | Reachable need | Specification proof |
|---|---|---|
| One `--all` route in upgrade guidance | The user needs an explicit bulk workflow while plain upgrade stays core-only. | FR-001, FR-002; SC-001, SC-009 |
| One Compose refresh preparation seam | Post-core preview and actual refresh must use identical projection, ownership, and classification. | FR-004, FR-007; SC-001, SC-011 |
| Two internal upgrade pack-phase commands | Conversation orchestration must preview after the core process exits, pause for a second confirmation, then apply and commit. | FR-003 through FR-005, FR-012; SC-001, SC-005 |
| Existing core plan as source-revision evidence | Remote packs must use the exact commit already selected and reviewed for core. | FR-009; SC-007, SC-008 |
| Sorted sequential refresh plus one aggregate commit | First-failure stop and clean partial progress need deterministic order and a commit, not per-pack history. | FR-011 through FR-013; SC-002, SC-003 |
| Existing safety tag and rollback | Both commits live after the same pre-upgrade boundary. | FR-016, FR-017; SC-009 |

Rejected designs:

- Adding pack fields to the pre-core core plan. The authoritative pack projection
  does not exist until the upgraded engine is installed.
- A speculative renderer, isolated planned-core engine, current-core estimate, or
  copied destination-diff implementation.
- A pack plan file, confirmation ledger, resume state, second profile, registry,
  queue, scheduler, daemon, workflow lane, or general orchestration framework.
- Treating all packs and core as one transaction or rolling core back when one
  pack refuses.
- Installing available-but-unselected packs, scanning the catalog for bulk
  membership, or inferring ownership from leftover namespaced files.
- Re-resolving the core's moving remote selector for each pack. Remote work uses
  the concrete core-selected commit.
- Per-pack commits. One aggregate commit preserves the same accepted successful
  output with less history.
- Parallel pack refresh. The profile is shared authority, first-failure reporting
  is ordered, and no throughput need justifies concurrent mutation.
- New crash-proof guarantees or a generalized Git transaction abstraction.

## Chosen Design

### 1. Preserve the core phase and user-facing grammar

Update `src/skills/dude-bundle-upgrade/SKILL.md` so:

- `@dude upgrade` keeps the current status/plan/core-confirm/apply/report flow.
- `@dude upgrade --all` runs that exact core flow, remembers the reviewed plan
  identity for the current conversation, and after successful core apply starts
  the post-core pack phase.
- `@dude upgrade --all --dry-run` remains write-free and stops after the core
  report with a direct explanation that authoritative pack preview requires the
  applied upgraded engine.
- Status and rollback keep their existing grammar. `--all` adds no status mode,
  pack-only rollback, global rollback, or changed `--skip-removals` semantics.
- The existing core confirmation token remains unchanged. After post-core
  preview, only the explicit user phrase `confirm packs` maps to the internal
  token `confirm-packs`; ordinary yes/ok/go does not authorize pack mutation.
- A cancelled pack phase reports committed core and a clean branch without
  invoking pack apply.

Do not add a top-level workflow command or change the existing core plan schema
for pack projections.

### 2. Share Compose refresh preparation

Refactor only the preparation portion of `cmdRefresh` in
`src/skills/dude-compose/compose.mjs` into one internal
`prepareRefresh`-equivalent seam. It performs the existing steps:

1. validate the pack name and exact installed-map membership;
2. retain exact authorized profile bytes and safely resolve every recorded path;
3. load projection dependencies from the current installed engine;
4. stage the current source through `stagePackFromSource`;
5. classify same-path replacements, new-only additions, and old-only removals;
6. run existing other-pack claim, occupied-addition, path, namespace, ownership,
   and profile-serialization preflight; and
7. reread exact profile authority immediately before any mutation-capable caller
   proceeds.

The operation-local result contains only what the two current callers need:
pack name, source identity, sorted replaced/added/removed/files lists, staged
destinations, authorized profile bytes, and the next profile body. The helper
owns cleanup on preparation failure; a successful caller owns final cleanup.
Do not export a renderer, transaction primitive, inventory abstraction, or
persistent preview representation.

Add a read-only `cmdPreviewRefresh` and CLI form
`compose.mjs refresh <name> --dry-run --json`. It calls the shared preparation,
returns `{previewed,replaced,added,removed,files,source}`, mutates neither
artifacts nor profile, and removes its stage. Rewire `cmdRefresh` to consume the
same preparation result and retain its current backup/apply/reverse-rollback
transaction and result shape. Ordinary `compose refresh <name>` remains
unchanged.

### 3. Add bounded post-core upgrade entry points

Add exactly two coordinator-facing subcommands to the upgraded
`src/skills/dude-bundle-upgrade/upgrade.mjs`:

```text
packs-preview --plan <id|path> [--format text|json]
packs-apply --plan <id|path> --confirm confirm-packs [--format text|json]
```

Both parse the existing canonical core plan without modifying it and validate a
post-core boundary before pack work:

- the current workspace is the plan's exact workspace;
- the current branch is the upgrade branch produced for that plan;
- the tree is clean;
- `HEAD` is the committed core apply result associated with the plan's
  `plan_id`, selected source, and installed ref;
- the manifest and latest committed upgrade-log entry reflect that core plan;
  and
- the installed profile parses through Compose.

Keep this post-core check narrow. Reuse existing plan parsing, manifest parsing,
Git helpers, path validation, and plan-id log evidence; do not add a session
record or modify the plan after review.

Load Compose dynamically from the current
`.github/skills/dude-compose/compose.mjs` only after those checks, ensuring the
post-core process uses upgraded code and model configuration. Obtain sorted pack
names from Compose status. For a remote core source, pass the plan's source
location and full `resolved_commit` to every preview and refresh. For a local
target, Compose's existing local precedence wins before those values are used.
A missing local target may use the selected source; no catalog scan expands
installed membership.

`packs-preview` calls only `cmdPreviewRefresh` for every sorted installed name.
It returns all per-pack additions, replacements, and removals. With no installed
packs it returns an empty successful result that tells the coordinator to skip
pack confirmation.

### 4. Apply sequentially and commit once

`packs-apply` requires the literal internal confirmation token before any pack
mutation, repeats the post-core clean-boundary check, and reads the sorted
installed set again. A profile edit inside the workspace would make the tree
dirty and refuse before application.

For each pack in order:

1. invoke Compose `cmdRefresh` with the same source and concrete revision rules
   as preview;
2. on success, retain the result's replaced, added, removed, and final files as
   the exact candidate Git path union;
3. on failure, record that pack as failed, mark every later installed pack
   not-attempted, and stop; Compose's own transaction has already restored the
   failed pack.

After all success or the first failure, run workspace lint once through the
existing upgrade lint helper. If at least one successful refresh produced a net
tracked change, stage only the union of its reported old/new pack paths plus
`.dude/metadata/profile.md` with `git add -A -- ...` and create one hook-disabled
commit:

```text
chore: refresh installed Dude packs after <to-ref>
```

The aggregate commit includes successful pack output whether the loop ended in
success or partial failure. If successful refreshes produce no net Git change,
create no empty commit. Verify the branch is clean before returning success or
partial failure. Report:

- core retained and its commit;
- successful pack names;
- the one failed pack and reason, if any;
- not-attempted pack names;
- pack commit SHA or `none`;
- lint result;
- safety tag, upgrade branch, review command, and rollback command.

A lint failure follows the existing upgrade precedent: preserve and commit the
generated output so the branch is not stranded dirty, return an operational
failure, and recommend review/rollback. A Git staging or commit failure is also
an operational failure, never a success or partial-failure completion; report
the actual branch state and recovery command without claiming cleanliness.
Never push, merge, or modify remote state.

### 5. Preserve ordinary and rollback behavior

Do not alter existing `status`, `plan`, `apply`, or `rollback` semantics, plan
fields, exit meanings, exact core buckets, source/ref overrides,
`--skip-removals`, confirmation token, safety naming, lint behavior, or no-op
handling. The pack subcommands reject use before a matching committed core
apply, on another branch, or with a dirty tree.

Rollback remains the existing hard reset to the pre-upgrade safety tag followed
by its uncommitted rollback-log entry and lint. Because all successful pack
output is committed before normal/partial return, rollback remains usable
without a new pack-specific rollback path.

### 6. Update only directly affected guidance

Update:

- `src/skills/dude-bundle-upgrade/SKILL.md` for `--all`, core-first sequence,
  post-core preview, separate confirmation, reports, partial progress, aggregate
  commit, concrete remote revision, empty installed set, and preserved ordinary
  commands;
- `src/skills/dude-compose/SKILL.md` only for the new read-only refresh preview
  contract used by upgrade, while retaining one-pack refresh as canonical;
- `docs/upgrading.md` for the user workflow, transaction boundaries, release
  bundles without `library/`, clean-branch behavior, and rollback scope; and
- `docs/commands.md` where the concise command list and upgrade reference
  enumerate supported forms.

Update project memory only if implementation inspection finds a live entry that
would otherwise become false. The current profile-authority, Compose-refresh,
release-shape, and source/generated rules remain accurate and need no
opportunistic rewrite. Historical feature packages are immutable history.

Run `node scripts/build-dev.mjs` after authoritative source changes. Never
hand-edit generated `.github/` core.

### 7. Add focused regression coverage

Extend `src/skills/dude-compose/compose.test.mjs` with:

- read-only refresh preview returning the same add/replace/remove classification
  as subsequent refresh and leaving profile/artifacts byte-identical;
- preview cleanup and refusal coverage through existing mutation snapshots;
- local target precedence when source and exact ref are supplied; and
- remote exact-commit preview/refresh from a released root without `library/`.

Extend `src/skills/dude-bundle-upgrade/upgrade.test.mjs` with a bounded
end-to-end fixture whose upstream publishes core plus several packs:

1. all success: core commit precedes preview and one aggregate pack commit;
2. first-pack refusal: no pack commit, later packs not attempted, clean branch;
3. partial progress: successful output committed, failed/not-attempted report,
   clean branch;
4. empty installed map: no pack confirmation or pack commit;
5. explicit pack-confirmation refusal and wrong-token refusal with no mutation;
6. local target precedence;
7. moving remote selector after core plan/apply while pack work remains bound to
   the plan's concrete commit;
8. released bundle with no `library/`;
9. plain status/plan/apply/dry-run/rollback and existing flags unchanged; and
10. dirty-tree refusal before core apply and before each pack-phase entry point.

Use deterministic local and `file://` Git fixtures only. Reuse existing plan,
snapshot, safety-tag, commit-tree, and Compose fixtures. Avoid a Cartesian
matrix: each case targets one distinct boundary.

## Test Strategy

### Focused authoring and regression checks

```bash
node --test src/skills/dude-compose/compose.test.mjs
node --test src/skills/dude-bundle-upgrade/upgrade.test.mjs
node --test scripts/build-dev.test.mjs scripts/build-release.test.mjs
```

Add section-bounded documentation assertions only where an existing contract
suite directly owns the upgrade command prose. Each required behavior gets a
deletion-sensitive labeled assertion; do not add broad contradiction regexes.

### Full integrated verification

```bash
node scripts/build-dev.mjs
find . -path ./dist -prune -o -name '*.test.mjs' -print0 | xargs -0 node --test
node .github/skills/dude-lint/lint.mjs .
node .github/skills/dude-compose/compose.mjs verify
node --test scripts/build-dev.test.mjs scripts/build-release.test.mjs
git diff --check
```

Run `node scripts/build-dev.mjs` a second time and require no additional change.
Compare every changed authoritative core file with its generated `.github/`
counterpart and require exact parity. Inspect generated changes as build-dev
output only.

Build a pristine release into a fresh external temporary directory with the
existing `scripts/build-release.mjs` CLI, then lint that untouched release.
Accept only the documented release warning baseline and zero failures. Exercise
the released-root bulk fixture before any pack installation mutates the pristine
inspection root.

Backlog freshness is applicable only if coordinator-owned task/log state changes
make `.dude/backlog.md` and `.dude/backlog.html` stale. Specialists do not mutate
that state. When applicable, the coordinator refreshes the pair through its
existing generator and reruns the freshness/lint check; otherwise record it as
not applicable rather than touching backlog files.

Tester verification runs after implementation, focused tests, docs, and
generated output are frozen. It must independently verify all-success,
one-pack refusal, partial progress, empty installed set, local precedence,
remote revision binding, plain upgrade, pack-confirmation refusal, released
bundle without `library/`, and dirty-branch prevention, plus every full command
above over one unchanged revision.

Code Reviewer then reviews that unchanged software diff for correctness,
maintainability, path/ownership safety, exact commit boundaries, source binding,
failure cleanup, and YAGNI. The independent Reviewer receives the same unchanged
diff and Tester evidence and decides requirements acceptance. Any rejection
returns to the owning Architect/Coder/Tester/Skill Smith task and requires a
fresh complete Tester pass before either review repeats.

## Phases

- **Phase 1 — Architecture handoff**: confirm the shared Compose preparation
  seam, post-core evidence check, exact source binding, aggregate commit path
  union, and failure taxonomy without changing accepted behavior.
- **Phase 2 — Core implementation and focused tests**: add Compose preview,
  upgrade pack-phase entry points, sequential refresh, aggregate commit, and the
  focused fixture coverage.
- **Phase 3 — Guidance and generated parity**: update authoritative skills and
  direct docs, update memory only if stale, then run build-dev and establish
  source/generated parity.
- **Phase 4 — Independent verification and reviews**: Tester runs the complete
  gate, Code Reviewer reviews software quality, and Reviewer decides acceptance
  on the same unchanged revision.

## Requirements Traceability

| Specification coverage | Plan ownership | Phase |
|---|---|---|
| FR-001, FR-002, FR-015, FR-016 / SC-004, SC-009 | User grammar and preserved core flow (Chosen Design 1, 5) | Phase 2, Phase 3 |
| FR-003 through FR-005 / SC-001, SC-005 | Core-first postcondition, upgraded-engine preview, separate confirmation (Chosen Design 1, 3) | Phase 1, Phase 2 |
| FR-006 / SC-002 through SC-004 | Sorted installed-map membership and no installation (Chosen Design 3, 4) | Phase 2 |
| FR-007, FR-010 / SC-001 through SC-003, SC-011 | Shared Compose preparation and retained per-pack transaction (Chosen Design 2, 4) | Phase 1, Phase 2 |
| FR-008, FR-009 / SC-006 through SC-008 | Local precedence and concrete core-selected remote revision (Chosen Design 3) | Phase 1, Phase 2 |
| FR-011 through FR-014 / SC-001 through SC-005 | First-failure stop, aggregate commit, clean reports, empty profile (Chosen Design 4) | Phase 1, Phase 2 |
| FR-017, FR-018 / SC-009, SC-011 | Separate boundaries, existing rollback, and prohibited-surface inspection (Chosen Design 5; guardrail check) | All phases |
| All FR / all SC | Focused regressions, full Tester gate, Code Reviewer, and independent Reviewer (Chosen Design 7; Test Strategy) | Phase 2, Phase 4 |

## Supporting Artifacts

Only `spec.md`, `plan.md`, and `tasks.md` apply. Existing core plan and profile
formats remain authoritative; no separate research, schema, contract, data
model, quickstart, checklist, or pack-phase state artifact is needed.
