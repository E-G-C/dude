<!-- audit log: .dude/ideas/automatic-core-dogfood-promotion.md#coordinator-log -->

# Tasks: Automatic Core Dogfood Promotion

Four canonical units preserve the accepted project-local and CI implementation, finish the in-progress materializer contract, retain the complete pre-terminal baseline guidance while extracting the post-readiness procedure, and complete the explicit terminal bootstrap acceptance.

T001 remains done one-to-one. T002 remains in progress one-to-one; its resolved external blocker is omitted in this staged proposal for coordinator reconciliation. New T004 depends on T001 and carries no transferred state. T003 remains the sole non-parallel terminal and depends on T001, T002, and T004.

No generated board is included.

## Phase 1: Existing Project-Local Close And CI Contract

**Goal**: Preserve the accepted model-facing procedural convention, policy-only static coverage, and bounded CI drift backstop as the extraction baseline.

**Write Set**:

- `.github/skills/project/SKILL.md`
- `.github/workflows/ci.yml`
- `scripts/current-format-contract.test.mjs`

**Execution Details**:

- T001 is complete historical implementation. T004 redistributes procedure ownership without reopening it or transferring state.
- Preserve its accepted CI boundary and evidence semantics as specified in Plan Sections 5, 6, and 10.

**Independent Test**: The accepted focused contract test and independent review remain historical execution evidence; fresh final validation occurs in T003.

- [x] T001@8f2c1a47 [P] [Shared] Write policy-coverage and temporary-Git tests first, then implement the project-local `Core Dogfood Close` convention and early bounded CI drift contract in `.github/skills/project/SKILL.md`, `.github/workflows/ci.yml`, and `scripts/current-format-contract.test.mjs`; verify with `node --test scripts/current-format-contract.test.mjs`.

## Phase 2: Materializer Preservation And Parity Contract

**Goal**: Prove the existing materializer preserves the complete protected boundary and remains an exact idempotent projection.

**Execution Details**:

- Primary write-set: `scripts/build-dev.test.mjs`.
- Conditional write-set: `scripts/build-dev.mjs` only if a correctly scoped new test demonstrates a production defect.
- Implement the focused preservation, exact projection, source-test exclusion, stale cleanup, and repeatability design in Plan Section 12.
- Make no production change without the specified focused failing test.

**Independent Test**: A fixture mutation to any protected path, unexpected generated path, missing or changed projection, generated source test, or non-idempotent second run fails the focused test.

- [~] T002@5b7d930e [P] [Shared] Strengthen `scripts/build-dev.test.mjs` first to prove complete installed-pack, project-skill, workflow, and `.dude/**` path/type/content preservation plus exact parity, source-test exclusion, stale cleanup, and idempotence; modify `scripts/build-dev.mjs` only if that focused test proves a concrete defect, and verify with `node --test scripts/build-dev.test.mjs`.

## Phase 3: Retain Baseline Guidance And Extract The Terminal Procedure

**Goal**: Keep the project skill concise and complete before source mutation while making the local skill the detailed post-readiness procedure owner.

**Execution Details**:

- Follow Plan Sections 1 and 7 for the concise complete project-side terminal and pre-terminal baseline contract.
- Follow Plan Sections 5, 6, and 8 for the terminal-loaded local skill's evidence, materialization, verification, and close runbook.
- Write the section-aware ownership and contract assertions in Plan Section 11 before extraction, including independent repository-layer predicates and deterministic rejection of ordinary staged-only, unstaged-only, offsetting, deletion, type-change, and conflict dirt for source and generated-core boundaries.
- Preserve the accepted CI implementation unless a focused contradiction requires a narrow change; retain every scope exclusion in the plan.

**Independent Test**: Removing the route, exact skill identity, readiness trigger, required procedure clause, independent layer predicate, or fail-closed ownership filter fails the focused source-contract test; temporary-repository cases reject every Plan Section 11 dirt variant, and the test itself disclaims behavioral proof.

- [ ] T004@e2a91f6c [Shared] Write contract tests first, create `.github/skills/dude-local-core-dogfood-promotion/SKILL.md` with the reusable post-readiness promotion procedure, retain the complete executable pre-terminal baseline contract plus concise trigger and route in `.github/skills/project/SKILL.md`, and update `scripts/current-format-contract.test.mjs`; make no `src/**` or base-owned generated-core write and verify with `node --test scripts/current-format-contract.test.mjs`.
    deps: T001@8f2c1a47

## Phase 4: Terminal Bootstrap No-Op Acceptance

**Goal**: Accept the project-local lifecycle and new procedure ownership without manufacturing source work, persisting model scenarios, or absorbing unrelated changes.

**Execution Details**:

- This task has no implementation write path and no `[P]` marker.
- `declared-src: none` remains this package's explicit bootstrap exception.
- Execute the bootstrap sequence and write-set proof in `## This Feature's Bootstrap No-Source Acceptance` and Plan Phase 4.
- Run the transient baseline, including ordinary and offsetting repository-state dirt, ready/not-ready routing, malformed-derivation, missing-baseline refusal, and close-blocking exercises in Plan Section 9.
- Keep every exercise non-persisted and read-only; do not create a helper, runtime, state, ledger, or report.
- Any ownership, baseline, declaration, source, generated, verification, preservation, routing, skill, or review failure leaves this task open or blocked.

**Independent Test**: The accepted feature contains no source or base-owned generated-core delta, repository `build-dev` was not invoked as a feature mutation, the ready/not-ready skill trigger is exercised, ordinary and offsetting dirty pre-source packets plus all malformed derivations and invalid close packets receive the required read-only rejection, all project validation is fresh, and an independent Reviewer accepts the exact final identities and evidence.

- [ ] T003@c4e6812d [Shared] Complete the explicit bootstrap no-source acceptance; declared-src: none; prove no accepted `src/**` or base-owned generated-core delta, do not run repository `build-dev` as a mutation, validate the complete pre-terminal baseline contract and terminal-readiness route to the reusable local skill, run fresh non-persisted authority and close-blocking exercises, complete the Plan Phase 4 verification and bounded owner-log evidence, and obtain independent final review; leave the task open or blocked on any failure.
    deps: T001@8f2c1a47, T002@5b7d930e, T004@e2a91f6c

## Requirements And Success Traceability

| Specification coverage | Tasks |
|---|---|
| FR-001 through FR-003 / SC-001, SC-011 | T004@e2a91f6c, T003@c4e6812d |
| FR-004 through FR-007 / SC-001 through SC-003 | T001@8f2c1a47, T004@e2a91f6c, T003@c4e6812d |
| FR-008 through FR-012 / SC-004, SC-005, SC-011 | T001@8f2c1a47, T004@e2a91f6c, T003@c4e6812d |
| FR-013 through FR-021 / SC-006 through SC-008 | T001@8f2c1a47, T002@5b7d930e, T004@e2a91f6c, T003@c4e6812d |
| FR-022 / SC-001 through SC-007, SC-011 | T004@e2a91f6c, T003@c4e6812d |
| FR-023 / SC-009 | T001@8f2c1a47, T003@c4e6812d |
| FR-024 through FR-026 / SC-010 | T001@8f2c1a47, T002@5b7d930e, T004@e2a91f6c, T003@c4e6812d |