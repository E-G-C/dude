<!-- audit log: .dude/ideas/022-runner-reason-code-coverage-fix.md#coordinator-log -->

<!-- canonical task units — edit task descriptions here, but let @dude mutate state glyphs -->

# Tasks: Runner Reason-Code And Coverage Fix

Three all-open canonical units implement the contract at `.dude/specs/022-runner-reason-code-coverage-fix/spec.md`, owned exactly by `.dude/ideas/runner-reason-code-coverage-fix.md`.

The change is deliberately small: two localized edits to the unattended runner plus two runner tests and one acceptance pass. If any task starts growing a new skill, agent, state file, board, command, lane, registry, a broader recovery refactor, or a change to the evidence-derived halt-report contract, stop with `plan-gap` instead of building it.

No task carries `[P]`. T002 tests the code T001 writes and T003 validates the integrated result, so the write and proof surfaces are intentionally sequential. Durable suffixes are fixed lowercase hexadecimal encodings of `code`, `test`, and `gate`.

Core source lives under `src/`; `.github/` core is generated only by `node scripts/build-dev.mjs` and is never hand-edited.

Execution may read but must not write any `.dude/specs/022-runner-reason-code-coverage-fix/**` artifact. This feature must not reopen or rework Feature 013 and must not touch the topology-first reset owned by Feature 021, and no task may mutate another feature's package or execution state. A required normative change stops as `contract-mismatch: redefine-required`.

## Phase 1: Code Fixes

**Goal**: Constrain exchange-failure attribution to runner-owned reason codes and make the fallback terminal identify its target, without changing any recovery flow or the evidence-derived halt report.

- [x] T001@636f6465 [Shared] Apply two localized edits in `src/skills/dude-work/host-adapter-runner.mjs`. First, define a frozen module-level runner-owned exchange-reason allow-list `{ supervisor-context-lost, challenge-response-invalid, exchange-context-lost }` and, in the exchange-failure catch (around lines 592-601), use the caught `error.code` as the orphan reason only when it is a string and a member of that allow-list, otherwise the runner-owned default `exchange-context-lost`, so a caller-supplied foreign code can never become the halt reason while the three runner-owned codes still pass through. Second, add `target: clone(target)` to the `orphan()` row fields (around lines 440-453) in both the `adapter === null` (`initialStateResult`) branch and the adapter-snapshot (`stateResult`) branch, so every fallback terminal identifies the target it orphaned; this row field is distinct from the evidence-derived `haltReport`, which `finish` derives from `describeUnattendedHalt({ state, reason }, currentInspection)` and never reads from the row target, so the Feature 013 T006 A halt-report contract is preserved. Do not hand-edit `.github/`; projection and the suite run in T002. (US1, US2 -> FR-001, FR-002, FR-003, FR-006)

## Phase 2: Coverage

**Goal**: Prove both fixes through the real production path so neither defect can silently return.

- [x] T002@74657374 [Shared] Add two runner tests to `src/skills/dude-work/host-adapter.test.mjs`, both driven through the production entry point `runHostAdapter(request, { exchange })`. First, a regression test whose host `exchange` throws an error carrying an arbitrary, non-runner `code`, driving the real `exchange -> orphan -> finish` path, and asserts the terminal halt reason is the runner-owned default `exchange-context-lost` and never the foreign code, and that a legitimate runner-owned code (`supervisor-context-lost` or `challenge-response-invalid`) still passes through unchanged. Second, an integration test from the real terminal safety writer that asserts the fallback terminal carries both a runner-owned reason and the `target` it orphaned, and that the evidence-derived `haltReport` is unchanged (no top-level `haltReport.target`; Feature 013 T006 A still passes). Run `node scripts/build-dev.mjs` to project the T001 runtime edit into `.github/skills/dude-work/host-adapter-runner.mjs`, run the full discovered suite `find . -path ./dist -prune -o -name '*.test.mjs' -print0 | xargs -0 node --test`, and confirm `git status --porcelain -- .github` shows only the intended generated runner projection. (US1, US2, US3 -> FR-001, FR-002, FR-003, FR-004, FR-005, FR-006)
    deps: T001@636f6465

## Phase 3: Acceptance

**Goal**: Prove the integrated fix against the specification and confirm no new artifact and an unchanged halt-report contract.

- [x] T003@67617465 [Shared] Run acceptance over the integrated fix: the full discovered suite `find . -path ./dist -prune -o -name '*.test.mjs' -print0 | xargs -0 node --test` green; `node .github/skills/dude-lint/lint.mjs .` at zero warnings and zero failures; `git status --porcelain` showing only the intended `src/skills/dude-work/host-adapter-runner.mjs` edit, the added tests in `src/skills/dude-work/host-adapter.test.mjs`, and the single generated `.github/skills/dude-work/host-adapter-runner.mjs` projection, with no new skill, agent, state file, board, command, lane, or registry; and `git diff --check` clean. Confirm the runner "owns the stop and its attribution" contract holds, the evidence-derived halt report is unchanged, and Feature 013 is not reopened; then route one fresh evidence set for independent review. Do not touch any other feature's package or execution state. (US1, US2, US3 -> FR-001 through FR-006)
    deps: T002@74657374

## Requirements And Success Traceability

| Specification coverage | Plan ownership | Tasks |
|---|---|---|
| FR-001, FR-002 / SC-001, SC-002 | Runner-owned exchange-reason allow-list in the exchange-failure catch | T001@636f6465, T002@74657374, T003@67617465 |
| FR-003 / SC-003, SC-005 | Target on the fallback row, distinct from the evidence-derived halt report | T001@636f6465, T002@74657374, T003@67617465 |
| FR-004, FR-005 / SC-004 | Regression and integration coverage from the real terminal writer | T002@74657374, T003@67617465 |
| FR-006 / SC-005 | Halt-report contract preserved; Feature 013 not reopened | T001@636f6465, T002@74657374, T003@67617465 |
| — / SC-006 | Full validation, no new artifact, cross-feature non-mutation | T003@67617465 |
