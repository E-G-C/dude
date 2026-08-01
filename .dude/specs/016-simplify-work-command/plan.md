# Implementation Plan: Simplify Work Command

## Summary

Make the smallest contract change that removes the no-op Work concurrency surface while preserving sequential execution and generic safe dispatch elsewhere.

The Work invocation parser will stop recognizing `--parallel`. Its normalized policy and exact state validator will drop `parallel`, and scheduling evidence will stop carrying that field. The generic unknown-option path will reject every former spelling before mutation, with no dedicated warning, compatibility branch, alias, or migration. Existing task-level `parallel` metadata representing `[P]` remains separate and unchanged.

Update the single Work authority, static contracts, current documentation, examples, and authoritative Beads import wording. Primary documentation will show `@dude work` and `@dude work <feature>` first; detailed references will retain supported advanced limits, recovery, and policy controls.

## Technical Context

**Language/Version**: Node.js >= 20, dependency-free ESM with checked JavaScript and JSDoc types; Markdown authority and documentation contracts
**Primary Dependencies**: Existing Work recovery runtime, canonical task parser, Lightweight scheduling boundary, generic parallel-dispatch policy, build-dev projection, Dude static-contract helpers, and pack composer; no external package
**Storage**: Existing transient Work run state and existing Markdown authority files; no new persistent state, compatibility field, migration record, queue, or store
**Testing**: `node:test` runtime, state-validation, atomic-recovery, Lightweight-boundary, Beads-host, static-contract, dev-build, and release-build suites; full discovered suite; workspace lint; compose pack verification; source/generated diff checks
**Target Platform**: Cross-platform local Node.js execution in a Dude workspace consumed through VS Code or Copilot
**Project Type**: Coordinator command runtime, Markdown authority contracts, user documentation, and optional pack catalog
**Performance Goals**: Add no runtime work; retain one linear invocation-token pass and sequential one-task-at-a-time scheduling with no queue or concurrency bookkeeping
**Constraints**: Remove the option and dead field completely; no warning, deprecation, alias, hidden acceptance, migration, or compatibility path; preserve `[P]` task metadata and generic safe parallel dispatch; avoid broad refactoring; preserve all unrelated Work controls and safety boundaries

## Spec Quality Validation

- Three independently testable stories cover sequential Work behavior, preserved internal dispatch semantics, and clear guidance.
- FR-001 through FR-014 encode the complete settled intent, including unsupported-option behavior, removal of dead state, `[P]` candidate semantics, primary documentation order, and explicit exclusions.
- SC-001 through SC-008 are measurable through accepted/rejected invocation matrices, exact policy shapes, scheduling fixtures, static content contracts, and regression evidence.
- Edge cases cover option placement and combination, obsolete state, ready-set cardinality, `[P]` dependency and overlap cases, import semantics, generic dispatch, documentation depth, and historical evidence.
- The specification contains no implementation path, implementation language, verification command, or unresolved clarification marker.

The specification passed its document quality gate before this plan was derived. Coordinator lint remains pending.

## Guardrail Check

- Deterministic code continues to own parsing, exact state shape, scheduling facts, static contracts, builds, and pack verification.
- The smallest design deletes one accepted option, one dead policy field, its derived evidence, and directly related prose and fixtures.
- Model-facing authority remains concise and centralized in the Work skill.
- `spec.md` owns behavior and outcomes; this plan owns files, implementation structure, commands, and build ordering.
- `src/` remains authoritative and `.github/` remains generated.
- Beads pack source remains authoritative under `library/packs/beads/`; validation uses a disposable install/remove lifecycle and never edits an installed projection in place.

No new project-wide guardrail is proposed.

## Verified Existing Surface

### Runtime and state contract

`src/skills/dude-work/recovery.mjs` currently:

- includes `--parallel` in the Work option allowlist;
- validates and discards its positive value through a catch-all branch;
- emits `parallel: 1` in the normalized policy;
- requires that field in the exact `RunState.policy` shape;
- validates it as literal `1`;
- refers to it in sequential scheduling commentary; and
- includes it in suspension readiness evidence.

The same module also carries task-level `task.parallel` values derived from `[P]`. Those values are a separate canonical-task concern and remain unchanged.

`src/skills/dude-work/recovery.test.mjs` owns parser, normalized-policy, exact-state, sequential-pending, and scheduling behavior. Direct policy fixtures also exist in:

- `src/skills/dude-feature-definition/atomic-file-batch.test.mjs`
- `src/skills/dude-lightweight-execution/board.test.mjs`
- `library/packs/beads/skills/dude-pack-beads-workflow/beads.test.mjs`

All must adopt the new exact policy shape in the same change.

### Work authority and generated core

`src/skills/dude-work/SKILL.md` is the sole detailed Work grammar and recovery owner. It currently advertises and explains the compatibility-only option. Its generated projection is `.github/skills/dude-work/SKILL.md`.

`src/skills/dude-work/recovery.mjs` projects to `.github/skills/dude-work/recovery.mjs`.

Both generated files are produced only by:

```bash
node scripts/build-dev.mjs
```

They are never edited directly.

The following existing authorities already describe the intended retained behavior and need no semantic change:

- `src/skills/dude-feature-definition/SKILL.md`
- `src/skills/dude-lightweight-execution/SKILL.md`
- `src/skills/dude-parallel-dispatch/SKILL.md`

They already state that `[P]` is only a candidate signal and that actual fan-out requires dependency, blocker, and disjoint-write proof.

### Static contracts and documentation

`scripts/current-format-contract.test.mjs` currently pins the obsolete grammar, compatibility behavior, invalid-value matrix, detailed documentation prose, and flag inventory. It must instead pin the exact reduced grammar, sequential authority, supported remaining flags, simple primary forms, and `[P]` candidate semantics.

Directly affected documentation is:

- `README.md`
- `docs/commands.md`
- `docs/workflow.md`
- `docs/reference.md`
- `docs/walkthrough.md`

`docs/setup.md` already leads with `@dude work <feature>` and needs no expected edit.

### Authoritative pack source

`library/packs/beads/skills/dude-pack-beads-spec-import/SKILL.md` currently calls `[P]` tasks `parallel-safe` and `parallel-eligible`. Its real import behavior remains valid: `[P]` suppresses inferred sibling ordering unless explicit dependencies or source text require it. The wording must identify a candidate signal and state that import metadata alone does not authorize fan-out.

The Beads pack is not installed in the current profile. No `.github/dude-pack-beads-*` projection should be created or edited. `dude-compose verify` provides the required disposable temp-install, lint, remove, and leftover check.

### Historical records

Earlier idea and definition packages document the former accepted contract. They are historical workflow evidence, not current implementation or user guidance, and remain unchanged.

## Implementation Design

### 1. Remove the Work option and dead policy field

In `src/skills/dude-work/recovery.mjs`:

1. Remove `--parallel` from the accepted option list.
2. Remove the value-discard branch so the remaining option cases are explicit.
3. Return policies containing only `overall`, `recovery`, `recover`, `untilBlocked`, and `mode`.
4. Remove `parallel` from required `RunState.policy` fields and delete its literal-one validation.
5. Remove the field from suspension readiness evidence and sequential scheduling commentary.
6. Retain the one-pending-authorization rule and every existing sequential scheduling check.
7. Retain task-level `task.parallel` handling for `[P]`.

There is no special removed-option branch. Generic unknown-option validation supplies the complete behavior.

Update every direct policy fixture to the reduced exact shape. Delete compatibility-specific parser and invalid-value cases; generic unknown-option and exact-record tests remain the governing rejection coverage.

### 2. Align Work authority and current documentation

In `src/skills/dude-work/SKILL.md`, lead with:

```text
@dude work
@dude work <feature>
```

Keep one detailed grammar line for remaining advanced controls. Remove all compatibility prose and describe sequential scheduling directly without referring to a capacity field.

Update `README.md`, `docs/workflow.md`, and `docs/walkthrough.md` so their first runnable examples use the two simple forms. Keep useful advanced examples in `docs/commands.md` and detailed reference sections.

Remove obsolete option prose from `docs/commands.md`, `docs/workflow.md`, and `docs/reference.md`. Preserve `--max`, `--until blocked`, recovery controls, policy controls, lane behavior, hard stops, verification, review, and ownership rules.

Correct `docs/reference.md` so `[P]` is a candidate or independence signal. State explicitly that it does not prove safety and does not authorize fan-out.

### 3. Align static and pack contracts

Update `scripts/current-format-contract.test.mjs` to:

- pin the reduced exact Work grammar and remaining flag inventory;
- remove compatibility and invalid-value assertions for the deleted option;
- retain the one-pending and no-concurrency requirements;
- require simple primary Work forms;
- require `[P]` candidate wording in core documentation and authoritative Beads source; and
- retain source/generated parity checks.

Update `library/packs/beads/skills/dude-pack-beads-spec-import/SKILL.md` without changing its import algorithm. `[P]` continues to suppress synthetic sibling dependencies where appropriate, but the skill must not call that marker proof of parallel safety or dispatch eligibility.

### 4. Preserve source/generated parity

Every task that edits `src/` runs `node scripts/build-dev.mjs` before parity-sensitive tests. Expected generated changes are limited to:

- `.github/skills/dude-work/recovery.mjs`
- `.github/skills/dude-work/SKILL.md`

No generated core file is edited manually.

### 5. Validate the pack lifecycle

Because authoritative Beads pack source changes, run:

```bash
node .github/skills/dude-compose/compose.mjs verify
```

This must temp-install, lint, remove, and check leftovers without changing the current dogfood profile. Do not install Beads into the active `.github/` tree for validation.

## Test Strategy

### Runtime and policy tests

Update focused fixtures to prove:

- plain and feature-selecting Work forms retain exact defaults;
- all remaining options retain their accepted and rejected forms;
- an unknown option fails before mutation through the generic path;
- normalized policies and exact RunState validation contain no removed field;
- only one authorization may be pending;
- Work scheduling remains sequential;
- task-level `[P]` metadata remains parsed and considered separately; and
- suspension evidence remains deterministic without a concurrency field.

Run:

```bash
node --test src/skills/dude-work/recovery.test.mjs src/skills/dude-feature-definition/atomic-file-batch.test.mjs src/skills/dude-lightweight-execution/board.test.mjs library/packs/beads/skills/dude-pack-beads-workflow/beads.test.mjs
```

### Contract and documentation tests

Update static contracts for the reduced grammar, supported flags, primary examples, advanced-reference retention, no-concurrency authority, and `[P]` candidate wording.

Run:

```bash
node scripts/build-dev.mjs
node --test scripts/current-format-contract.test.mjs scripts/build-dev.test.mjs scripts/build-release.test.mjs
```

### Pack validation

Run the focused Beads workflow suite and `dude-compose verify`. Verify that the active profile remains unchanged and no `dude-pack-beads-*` artifact remains after disposable validation.

### Full acceptance

Run the focused suites, the full discovered suite, workspace lint, compose verification, a pristine release build and lint, generated-core diff inspection, and whitespace checks. Scan current implementation, generated core, tests, pack source, examples, and user documentation for obsolete option, dead-field, and inaccurate `[P]` terminology while excluding historical `.dude/ideas/` and `.dude/specs/` evidence.

Route the same fresh evidence independently to the Tester and Code Reviewer.

## Source And Generated Parity

`src/` is authoritative. `.github/` is the committed generated runtime projection. Run `node scripts/build-dev.mjs` after each source-editing unit and before any test that reads generated core. The final diff must contain no hand-authored generated-only change.

## Pack Source Validation

`library/packs/beads/` is authoritative for the optional Beads pack. The active profile does not include Beads, so no installed projection is updated. `dude-compose verify` is the required disposable install/lint/remove/leftover proof.

## Supporting Artifacts

Only `spec.md`, `plan.md`, and `tasks.md` apply. No research, data model, API contract, schema contract, quickstart, UX checklist, test checklist, or security checklist is materially useful for this bounded command-contract simplification.

## Objective Registry

This feature has no objective and contains zero active ObjectiveRegistry regions.

## Complexity Tracking

No guardrail deviation is required. The implementation deletes compatibility behavior and dead state rather than replacing them. It adds no abstraction, migration, state version, scheduler, queue, lock, concurrency setting, command, or alias.

## Phases

- **Phase 1 - Runtime contract removal (T001)**: remove option recognition, dead policy state, derived evidence, and all live policy fixtures while preserving sequential behavior and `[P]` task metadata.
- **Phase 2 - Authority, docs, pack, and parity (T002)**: simplify Work authority and primary examples, correct `[P]` wording, update static contracts and Beads source, rebuild generated core, and validate the disposable pack lifecycle.
- **Phase 3 - Final acceptance (T003)**: run focused and complete verification, prove source/generated and pack parity, scan current surfaces, and obtain independent acceptance.

## Traceability

| Task | Stories | Requirements | Primary proof |
|---|---|---|---|
| T001@726d6f76 | US1, US2 | FR-001 through FR-010, FR-014 | Invocation, exact policy/state, one-pending, scheduling, `[P]`, and integration-fixture tests |
| T002@67756964 | US2, US3 | FR-008 through FR-014 | Authority and documentation contracts, generated parity, Beads wording, and disposable pack verification |
| T003@61636370 | US1 through US3 | FR-001 through FR-014 | Full regression, current-surface scan, lint, compose, release, and independent acceptance |