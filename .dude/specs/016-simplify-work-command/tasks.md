<!-- audit log: .dude/ideas/016-simplify-work-command.md#coordinator-log -->

<!-- canonical task units — edit task descriptions here, but let @dude mutate state glyphs -->

# Tasks: Simplify Work Command

Three all-open canonical units implement the Feature 016 contract at `.dude/specs/016-simplify-work-command/spec.md`. They remove the no-op Work option and dead policy field, preserve sequential Work and internal safe dispatch, align current guidance and Beads import terminology, and complete fresh acceptance.

No task carries `[P]`. T001 and T002 both project source changes into `.github/`, T002 consumes the runtime contract established by T001, and T003 validates the integrated result. Their write and proof surfaces are therefore intentionally sequential.

Durable suffixes are fixed lowercase hexadecimal encodings of `rmov`, `guid`, and `accp`.

Every task that edits `src/` runs `node scripts/build-dev.mjs` before parity-sensitive tests. `.github/` core files are generated only by that command and are never hand-edited. Beads pack source is edited only under `library/packs/beads/` and validated through the disposable compose lifecycle.

Execution may read but must not write any `.dude/specs/016-simplify-work-command/**` artifact. Historical idea and definition packages remain unchanged audit evidence. A required normative change stops with `contract-mismatch: redefine-required`.

## Phase 1: Runtime Contract Removal

**Goal**: Remove the obsolete Work option and dead policy state while preserving sequential scheduling and `[P]` metadata.

- [x] T001@726d6f76 [US1] Remove `--parallel`, `policy.parallel`, its exact-state validation, scheduling commentary, and suspension-evidence field from `src/skills/dude-work/recovery.mjs`; update normalized-policy, parser, state, and sequential-scheduling coverage in `src/skills/dude-work/recovery.test.mjs` plus direct policy fixtures in `src/skills/dude-feature-definition/atomic-file-batch.test.mjs`, `src/skills/dude-lightweight-execution/board.test.mjs`, and `library/packs/beads/skills/dude-pack-beads-workflow/beads.test.mjs`. Use the existing unknown-option rejection path with no warning, alias, migration, or compatibility branch. Preserve one pending authorization, sequential Work, `task.parallel` parsing for `[P]`, and generic scheduling safeguards. Run `node scripts/build-dev.mjs`, then verify with `node --test src/skills/dude-work/recovery.test.mjs src/skills/dude-feature-definition/atomic-file-batch.test.mjs src/skills/dude-lightweight-execution/board.test.mjs library/packs/beads/skills/dude-pack-beads-workflow/beads.test.mjs`. (US1, US2 -> FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-014)

## Phase 2: Authority, Guidance, Pack, And Parity

**Goal**: Present the simple Work forms first, retain useful advanced controls, and describe `[P]` accurately everywhere current behavior is defined.

- [x] T002@67756964 [Shared] Update `src/skills/dude-work/SKILL.md`, `README.md`, `docs/commands.md`, `docs/workflow.md`, `docs/reference.md`, and `docs/walkthrough.md` so current grammar omits `--parallel`, primary examples lead with `@dude work` and `@dude work <feature>`, detailed reference retains supported advanced controls, and sequential behavior is stated without compatibility capacity. Correct `[P]` wording in `docs/reference.md` and authoritative `library/packs/beads/skills/dude-pack-beads-spec-import/SKILL.md`: retain planning/import/dependency candidate semantics, but state that the marker alone neither proves safety nor authorizes fan-out. Update `scripts/current-format-contract.test.mjs` to pin the reduced flag set, simple forms, sequential authority, source/generated parity, and candidate-only `[P]` contract while deleting obsolete compatibility assertions. Run `node scripts/build-dev.mjs`, verify with `node --test scripts/current-format-contract.test.mjs scripts/build-dev.test.mjs scripts/build-release.test.mjs`, then run `node .github/skills/dude-compose/compose.mjs verify` for disposable pack install/lint/remove/leftover validation. Do not install Beads into or edit any `.github/dude-pack-beads-*` projection. (US2, US3 -> FR-008, FR-009, FR-010, FR-011, FR-012, FR-013, FR-014)
    deps: T001@726d6f76

## Phase 3: Final Acceptance

**Goal**: Prove complete removal from current surfaces, unchanged sequential behavior, correct candidate semantics, generated parity, and pack lifecycle safety.

- [x] T003@61636370 [Shared] Run final acceptance over the integrated Feature 016 change: focused Work, atomic-recovery, Lightweight-boundary, Beads-host, static-contract, and build suites; the full discovered test suite; `node .github/skills/dude-lint/lint.mjs .`; `node .github/skills/dude-compose/compose.mjs verify`; a pristine release build and lint; intended-only `.github/` diff inspection; and `git diff --check`. Scan `src/`, generated `.github/` core, `scripts/`, `library/`, `docs/`, and `README.md` for zero current `--parallel`, `policy.parallel`, `parallel-safe`, or `parallel-eligible` contract references while leaving historical `.dude/ideas/` and `.dude/specs/` evidence untouched. Route the same fresh evidence independently to the Tester and Code Reviewer. Prove plain and feature-selecting Work remain sequential; removed forms receive no warning, alias, hidden acceptance, normalization, migration, or compatibility field; all other Work controls and safety boundaries remain unchanged; `[P]` stays a candidate signal only; generic safe dispatch remains internal; source/generated and release projections agree; the Beads disposable lifecycle leaves no residue; zero active ObjectiveRegistry regions exist; and no queue, lock, scheduler, lane, command, state surface, or concurrency setting was added. (US1, US2, US3 -> FR-001 through FR-014)
    deps: T002@67756964