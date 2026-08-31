<!-- audit log: .dude/ideas/026-remove-unused-authority-surfaces.md#coordinator-log -->

# Tasks: Remove Unused Authority Surfaces

Five all-open canonical units implement the contract at `.dude/specs/026-remove-unused-authority-surfaces/spec.md`, owned prospectively and exactly by `.dude/ideas/remove-unused-authority-surfaces.md`.

The two-pass topology audit and the delete/KEEP manifests in `plan.md` are the implementation boundary. If any mandatory-delete symbol has an unexpected ordinary production caller, stop with `contract-mismatch: redefine-required`; do not delete the caller, wire the dead subsystem, or expand scope. Never delete by broad line range.

No task carries `[P]`. Each deletion and verification batch depends on the evidence from the previous task, so the work is intentionally sequential. Durable suffixes are fixed lowercase hexadecimal encodings of `mani`, `rout`, `obje`, `docs`, and `acpt`.

Core source lives under `src/`; `.github/` core is generated only by `node scripts/build-dev.mjs` and is never hand-edited. Direct dead-export tests are deleted rather than recreated one-for-one. Focused replacement checks may prove only the closed production topology and preserved live behavior; they must not retain dead exports, add a scanning framework, or introduce new state.

Execution may read but must not write this package, its idea ledger, or any other `.dude/ideas/**` or `.dude/specs/**` artifact. No task may mutate task glyphs, task metadata, boards, mirrors, execution history, another feature's Coordinator Log, or historical provenance.

## Phase 1: Freeze Manifest And Live Behavior

**Goal**: Confirm the current symbol topology at implementation time and pin only the live behavior needed to protect the KEEP carve-outs.

- [x] T001@6d616e69 [Shared] Before editing production code, resolve all 40 mandatory-delete symbols/routes and all 26 named KEEP symbols from `plan.md` against current `src/skills/dude-work/recovery.mjs`, `host-adapter.mjs`, and `host-adapter-runner.mjs`; record definitions and references in transient task evidence and confirm no mandatory-delete entry is called by `host-adapter-runner.mjs` or another ordinary production entry. Confirm the runner constructs exactly `review-learning`, `bind-alternative`, `verify-no-progress`, and `controlled-end`, and retains exactly the ten semantic operations listed in FR-003. In `src/skills/dude-work/host-adapter.test.mjs` and `recovery.test.mjs`, add only missing focused regression checks for the closed runner action/operation sets, `runHostAdapter -> finish(row)`, hard-stop reporting through `describeUnattendedHalt`, ordinary inspect/audit/lane behavior, emitted result bytes, Objective Registry inspection, and retained RunState validation. Do not add a topology framework, persisted manifest, new schema, or dead-name compatibility fixture. Run the focused Work runtime suites and establish the pre-change authoritative source-and-test line-count baseline. Stop immediately on any unexpected live caller rather than expanding scope. (US1, US2, US3 -> FR-001, FR-002, FR-003, FR-010 through FR-015, FR-021)

## Phase 2: Delete Isolated Dead Routes

**Goal**: Remove the legacy renderer, halt attribution, suspension scheduling, and optional halt-audit transport while preserving ordinary audit and halt reporting.

- [x] T002@726f7574 [US1] Delete from `src/skills/dude-work/recovery.mjs` the mandatory route cluster `renderAuditSummary`, `haltGovernanceV2`, `classifyHaltScopeV2`, `deriveImmediateHaltEndV2`, `suspendTargetV2`, and `mayScheduleAfterStop`, together with only their proven-exclusive private helpers/constants and the `transition/halt` and `suspend-target` command/action branches. In `src/skills/dude-work/host-adapter.mjs`, remove halt/suspend mappings and the optional `audit.halt` request transport and branch while preserving the `audit-run` operation and ordinary versioned audit. Delete corresponding direct imports, fixtures, and dead-export tests from `recovery.test.mjs` and `host-adapter.test.mjs`; do not retain aliases or test-only exports. After the batch, verify `immediateHaltProjectionEvidenceV2`, all seven named live audit/validation symbols, the live halt-reporting chain, the ten operations, and the four runner actions remain referenced and focused tests remain byte-stable. Scan references before removing each symbol and stop on any unexpected production caller. (US1 -> FR-004, FR-005, FR-006, FR-008, FR-014, FR-015)
    deps: T001@6d616e69

## Phase 3: Delete Objective Execution

**Goal**: Remove the unwired objective execution cluster symbol-by-symbol without deleting live registry, RunState, recovery, projection, or audit code.

- [x] T003@6f626a65 [US2] Delete the 31-symbol objective-execution manifest from `src/skills/dude-work/recovery.mjs` in bounded reference-checked groups: candidate checkpoint lifecycle and identities; comparator and evaluator normalization; `buildGateSet` plus the five gate normalizers and keep decision; objective comparison and sequence-close event builders/validators; comparison-reference admission/eviction used only by this flow; and `resolveComparison`, `closeEvaluationSequence`, and `settleTaskBoundary`. Delete their direct imports, fixtures, and dead-export tests from `recovery.test.mjs` instead of replacing them one-for-one. After every group, positively verify the complete KEEP manifest: Objective Registry acquisition; evaluation-sequence and learning-review RunState validation; `deriveSequenceIdentity`; projection-reference and sequence-row handling; learning-review binding and active-sequence authorization/close guards; optional RunState carry; definition-recovery write sets, file-state descriptors, identities, and limits; shared event/projection and live acquisition helpers; halt reporting; and versioned audit. Add no alternative objective engine, weakened validator, migration, alias, replacement state, or broad line-range deletion. Any unexpected live caller stops as `contract-mismatch: redefine-required`. Run focused inspect, validation, definition-recovery, projection, audit, and host-adapter suites after the batch. (US2 -> FR-007, FR-009, FR-010, FR-011, FR-012, FR-013, FR-021)
    deps: T002@726f7574

## Phase 4: Correct Contracts And Regenerate

**Goal**: Make current documentation truthful, rebuild generated core, and prove dead names are absent while KEEP symbols remain.

- [x] T004@646f6373 [US3] Update current documentation and assertions without rewriting history. In `src/skills/dude-work/SKILL.md`, remove or correct the section that presents autonomous objective candidate execution, five gates, comparison events, and sequence settlement as active; retain truthful Objective Registry acquisition, learning governance, ordinary audit, live halt reporting, ten-operation adapter, and four-action runner descriptions. Correct the corresponding autonomous-objective prose in `docs/reference.md` and `docs/workflow.md`; inspect `docs/commands.md` and other current public docs and edit only demonstrably false descriptions. Update `scripts/current-format-contract.test.mjs` to pin the positive closed runner topology and corrected current documentation without preserving dead compatibility names in authoritative source. Run `node scripts/build-dev.mjs`; never edit `.github/` directly. Using the plan manifest as transient input, negative-scan all 40 mandatory-delete symbols/routes across authoritative `src/` and generated `.github/`, positive-scan all 26 named KEEP symbols plus the ten operations and four actions, and confirm a second build produces no additional projection change. Confirm all historical `.dude/ideas/**` and `.dude/specs/**` artifacts remain untouched. (US3 -> FR-016, FR-017, FR-018, FR-020)
    deps: T003@6f626a65

## Phase 5: Acceptance And Independent Review

**Goal**: Prove the integrated revision is a net-negative deletion with unchanged live behavior and no replacement machinery.

- [x] T005@61637074 [Shared] Run acceptance over the unchanged integrated revision: rerun focused `recovery.test.mjs`, `host-adapter.test.mjs`, runner, current-format-contract, and build-dev suites; run the full discovered suite with `find . -path ./dist -prune -o -name '*.test.mjs' -print0 | xargs -0 node --test`; run `node scripts/build-dev.mjs` and confirm source/generated byte parity with no second-build drift; repeat the 40-entry negative scan and the 26-entry KEEP scan; confirm the runner still constructs exactly four governance actions and exposes exactly ten semantic operations; compare live `runHostAdapter -> finish(row)` settlement, hard-stop halt reports, audit, inspect, lane effects, and emitted bytes with the Phase 1 baseline; calculate authoritative source-and-test line counts and require a net reduction; inspect the diff for no replacement framework, state, schema, authority abstraction, alias, migration, capability, broad deletion, or historical `.dude` mutation; run `git diff --check`; and run `node .github/skills/dude-lint/lint.mjs .` with zero failures. Route the same fresh evidence and the symbol-level diff for independent review, requiring explicit confirmation of the deletion manifest, KEEP carve-outs, generated projection, net deletion, byte preservation, and provenance non-mutation. Do not modify this package or any task state while obtaining review. (US1, US2, US3 -> FR-001 through FR-021)
    deps: T004@646f6373

## Requirements And Success Traceability

| Specification coverage | Plan ownership | Tasks |
|---|---|---|
| FR-001, FR-002, FR-003, FR-014 / SC-003 | Production topology, closed sets, finish behavior, halt reporting, byte baseline | T001@6d616e69, T005@61637074 |
| FR-004, FR-005, FR-006, FR-008, FR-015 / SC-001, SC-002, SC-003 | Halt, suspension, optional audit transport, legacy renderer, live audit carve-outs | T002@726f7574, T005@61637074 |
| FR-007, FR-009, FR-010, FR-011, FR-012, FR-013, FR-021 / SC-001, SC-002, SC-004 | Objective deletion and positive KEEP verification | T001@6d616e69, T003@6f626a65, T005@61637074 |
| FR-016, FR-017, FR-018 / SC-005, SC-006 | Current docs/contracts, direct-test deletion, generation, scans | T004@646f6373, T005@61637074 |
| FR-019, FR-020 / SC-007, SC-008 | Net deletion, no replacement machinery, provenance, independent review | T005@61637074 |
