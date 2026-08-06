<!-- audit log: .dude/ideas/topology-first-enforcement-reset.md#coordinator-log -->

<!-- canonical task units — edit task descriptions here, but let @dude mutate state glyphs -->

# Tasks: Topology-First Enforcement Reset

Three all-open canonical units implement the contract at `.dude/specs/021-topology-first-enforcement-reset/spec.md`, owned exactly by `.dude/ideas/topology-first-enforcement-reset.md`.

The change is deliberately small: two prose edits woven into existing review-loop skills, plus one acceptance pass. If any task starts growing a new skill, agent, state file, board, command, lane, registry, or a stored topology-evidence record, stop with `plan-gap` instead of building it — that is exactly the machinery this feature exists to discourage.

No task carries `[P]`. T001 and T002 both extend `scripts/current-format-contract.test.mjs`, and T003 validates the integrated result, so their write and proof surfaces are intentionally sequential. Durable suffixes are fixed lowercase hexadecimal encodings of `trig`, `eval`, and `acce`.

Core source lives under `src/`; `.github/` core is generated only by `node scripts/build-dev.mjs` and is never hand-edited.

Execution may read but must not write any `.dude/specs/021-topology-first-enforcement-reset/**` artifact. This feature must not fix the separate unattended-runner attribution and coverage defects owned by the `runner-reason-code-coverage-fix` idea, and no task may mutate another feature's package or execution state. A required normative change stops as `contract-mismatch: redefine-required`.

## Phase 1: Reset Triggers And Topology Check

**Goal**: Name the reset triggers and require the planning authority's topology evidence before the next revision, without weakening any existing gate.

- [x] T001@74726967 [Shared] Add one short section to `src/skills/dude-receiving-code-review/SKILL.md` within the revision procedure that: names the three reset triggers (a control-boundary concern surviving two review cycles; a revision introducing a new gate, store, checkpoint, or cross-session state; enforcement expanding across modules or workflow boundaries) and states any one calls for a topology-first reset; requires the planning authority, when a trigger fires, to establish the six-part topology evidence (production entry point and actual call path; which actor controls each operation and input; the concrete reachable failure prevented; the narrowest existing enforcement point covering it; a focused check that could disprove the topology assumption; why each proposed stateful mechanism covers a reachable path) before the next revision; states that evidence showing a mechanism covers a reachable path the narrowest existing point does not lets the revision proceed rather than blocking it, while an existing chokepoint that already covers the failure means the added machinery is not carried forward; exempts ordinary local fixes that introduce none of that machinery even across two cycles; and adds this obligation without relaxing any existing safety, verification, or independent-review requirement. Pin the new prose and the no-new-artifact expectation in `scripts/current-format-contract.test.mjs`, run `node scripts/build-dev.mjs`, and verify with `node --test scripts/current-format-contract.test.mjs scripts/build-dev.test.mjs` plus a read-only check that `.github/skills/dude-receiving-code-review/SKILL.md` is the only generated core change. (US1, US2 -> FR-001, FR-002, FR-005, FR-006, FR-007, FR-008, FR-009)

## Phase 2: Review Evaluation Against Evidence

**Goal**: Make the reviewer judge the revised design against the topology evidence and hold new machinery to a reachable failure and a test.

- [x] T002@6576616c [US3] Add one short addition to `src/skills/dude-reviewer-protocol/SKILL.md` requiring that, when a reset is active, the verdict judge the revised design against the topology evidence, verify every topology claim against the current source and call sites before approval, and admit new enforcement machinery (a new gate, store, checkpoint, or cross-session state) only with a demonstrated reachable failure and a covering acceptance test, routing any rejection through the existing rejection procedure with no new path and no relaxed existing gate. Pin the new prose in `scripts/current-format-contract.test.mjs`, run `node scripts/build-dev.mjs`, and verify with `node --test scripts/current-format-contract.test.mjs scripts/build-dev.test.mjs` plus a read-only check that `.github/skills/dude-reviewer-protocol/SKILL.md` is the only additional generated core change. (US3 -> FR-003, FR-004, FR-006, FR-008)
    deps: T001@74726967

## Phase 3: Acceptance

**Goal**: Prove the woven guidance against the specification's success criteria and confirm no new persistent artifact was introduced.

- [x] T003@61636365 [Shared] Run acceptance over the unchanged integrated revision: rehearse each reset trigger firing and an ordinary local fix that fires none, showing the reset is called for only on triggers; rehearse a fired trigger whose topology evidence shows a mechanism covers a reachable path and confirm the revision proceeds on that evidence rather than being blocked; rehearse new enforcement machinery admitted only with a reachable failure and a covering acceptance test and rejected without either; confirm existing safety, verification, and independent-review behavior is unchanged on no-trigger scenarios; inspect the complete diff for zero new skills, agents, state files, boards, commands, lanes, or registries and confirm the topology evidence has no stored form; run the full discovered suite with `find . -path ./dist -prune -o -name '*.test.mjs' -print0 | xargs -0 node --test`, `node .github/skills/dude-lint/lint.mjs .` at zero warnings and zero failures, `git status --porcelain -- .github` showing only intended generated files, and `git diff --check` clean; then route one fresh unchanged evidence set independently for review. Do not touch the `runner-reason-code-coverage-fix` ledger or any other feature's package or execution state. (US1, US2, US3 -> FR-001 through FR-010)
    deps: T002@6576616c

## Requirements And Success Traceability

| Specification coverage | Plan ownership | Tasks |
|---|---|---|
| FR-001, FR-002, FR-007 / SC-001, SC-002 | Reset triggers and the planning-authority topology check in the receiving-review skill | T001@74726967, T003@61636365 |
| FR-003, FR-004 / SC-003, SC-004 | Review evaluation against evidence and the reachable-failure-plus-test admission gate | T002@6576616c, T003@61636365 |
| FR-005 / SC-007 | Evidence-backed proceed rather than an automatic veto | T001@74726967, T003@61636365 |
| FR-006, FR-009 / SC-006 | Existing safety, verification, and review gates unchanged | T001@74726967, T002@6576616c, T003@61636365 |
| FR-008 / SC-005 | No new persistent workflow artifact; transient evidence | T001@74726967, T002@6576616c, T003@61636365 |
| FR-010 / SC-008 | Cross-feature non-mutation, full validation, independent acceptance | T003@61636365 |
