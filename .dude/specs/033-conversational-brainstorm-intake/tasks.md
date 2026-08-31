<!-- audit log: .dude/ideas/033-conversational-brainstorm-intake.md#coordinator-log -->

# Tasks: Continuous Work-Intake Reassessment

Two all-open, sequential canonical units implement `.dude/specs/033-conversational-brainstorm-intake/spec.md`, prospectively and exactly owned by `.dude/ideas/conversational-brainstorm-intake.md`.

The implementation is a bounded prompt-authority change: one detailed reassessment owner in `dude-work-intake`, concise coordinator orchestration, one shared direct-work pre-write stop, static contracts, and generated projections. It adds no command, parser, counter, state, registry, daemon, lane, workflow, or supporting artifact.

No task carries `[P]`. T002 validates the integrated authority established by T001, so the units are intentionally sequential. Durable suffixes are fixed lowercase hexadecimal encodings of `intk` and `gate`.

Core source lives under `src/`; `.github/` core is generated only by `node scripts/build-dev.mjs` and is never hand-edited. Execution may read but must not write this definition package, its idea ledger, another feature package, task state, boards, mirrors, execution history, or Coordinator Logs. A required normative expansion stops as `contract-mismatch: redefine-required`.

## Phase 1: Authority, Contracts, And Projection

**Goal**: Establish continuous reassessment in the smallest existing authority surfaces, pin the contract, and project only those source changes.

- [x] T001@696e746b [Shared] Implement `plan.md` Chosen Design sections 1 through 5. Add one visible `## Continuous Reassessment` section after `## Triage` in `src/skills/dude-work-intake/SKILL.md` as the sole complete policy owner: rerun classification when a conversation or task changes character; encode the accepted advice-to-brainstorm threshold, exact `This has become a feature brainstorm.` announcement, slug and split assessment, inferred confirmation versus explicit natural-language capture, existing idea-only brainstorm and explicit-definition lifecycle, complete bounded-direct-task conditions, before-next-repository-write reclassification, concrete boundary explanation, all three choices, mandatory checkpoint and scope-drop-only continuation, preservation of valid completed work, qualitative/no-size-threshold controls, large-mechanical counterexample, existing-route reuse, GitHub issue separation, and no-new-machinery boundary. Add a concise `## Continuous Intake` orchestration section to `src/agents/dude.agent.md` that delegates classification to that owner, presents the required single checkpoint prompt, routes existing brainstorm/definition behavior, and grants no direct continuation after boundary crossing unless expanded scope is dropped. Add one numbered shared rule to `src/instructions/dude.instructions.md` requiring directly dispatched writers to stop before another repository write and report the crossed FR-011 condition, without granting capture, definition, or state authority; state that size alone does not trigger and valid completed work is preserved. Extend `scripts/current-format-contract.test.mjs` with the exact test `continuous work-intake reassessment is section-bound and mutation-resistant`, using existing visibility/section/mutation helpers to pin each owning rule and reject deleted, fenced, commented, and wrong-section mutations; add no classifier, parser, test-only state, or new test module. Do not modify `src/skills/dude-generic-routing/SKILL.md`, `src/skills/dude-work/SKILL.md`, public docs, or GitHub issue intake. Run `node scripts/build-dev.mjs`; confirm the only feature-caused generated changes are `.github/skills/dude-work-intake/SKILL.md`, `.github/agents/dude.agent.md`, and `.github/instructions/dude.instructions.md`; then run `node --test --test-name-pattern='continuous work-intake reassessment' scripts/current-format-contract.test.mjs` and `node --test scripts/build-dev.test.mjs`. (US1, US2, US3, US4 -> FR-001 through FR-017; SC-001 through SC-008)

## Phase 2: Integrated Acceptance And Independent Review

**Goal**: Prove the unchanged integrated revision satisfies both transition cases, preserves proportional direct work, and introduces no alternate workflow or state.

- [x] T002@67617465 [Shared] Run acceptance over the unchanged T001 revision. Execute `find . -path ./dist -prune -o -name '*.test.mjs' -print0 | xargs -0 node --test`; require `node .github/skills/dude-lint/lint.mjs .` at zero warnings and zero failures; require `node .github/skills/dude-compose/compose.mjs verify` exit zero; run `node scripts/build-release.mjs --out dist` and require `node .github/skills/dude-lint/lint.mjs dist` at zero warnings and zero failures; rerun `node scripts/build-dev.mjs` and confirm it causes no additional projection drift; require `git status --porcelain -- .github` to show only the three intended generated files from T001 and `git diff --check` to pass. Inspect source, generated output, release output, and repository-owned paths for zero new command, skill, parser, counter, classifier service, state store, registry, daemon, lane, workflow, capture path, or GitHub issue-intake change. Route the same unchanged diff and fresh evidence to an independent reviewer against the specification matrices: qualifying/non-qualifying advice, inferred/explicit capture, one/several outcomes, each of the six direct-task triggers, all three choices, a large mechanical bounded control, expansion then narrowing, and valid work predating reclassification. Require the review to confirm the exact announcement and before-write checkpoint timing without creating a numeric oracle or runtime classifier. Do not modify this package, its owner ledger, or task state while obtaining review. (US1, US2, US3, US4 -> FR-001 through FR-017; SC-001 through SC-008)
    deps: T001@696e746b

## Requirements And Success Traceability

| Specification coverage | Plan ownership | Tasks |
|---|---|---|
| FR-001 through FR-005 / SC-001, SC-002 | Detailed reassessment owner; coordinator brainstorm announcement; qualifying/non-qualifying matrices | T001@696e746b, T002@67617465 |
| FR-006 through FR-010 / SC-003, SC-006 | Inferred-versus-explicit capture, split handling, and existing brainstorm/definition lifecycle | T001@696e746b, T002@67617465 |
| FR-011 through FR-016 / SC-004, SC-005, SC-007 | Direct-task conditions, universal pre-write stop, three choices, mandatory narrowing, preservation, and qualitative controls | T001@696e746b, T002@67617465 |
| FR-017 / SC-008 | YAGNI exclusions, unchanged routing/Work/docs/issues, generated projection, release and path inspection | T001@696e746b, T002@67617465 |
| All FR / all SC | Full bundle gate and independent scenario review over one unchanged revision | T002@67617465 |
