<!-- audit log: .dude/ideas/ship-command.md#coordinator-log -->

<!-- canonical task units — edit task descriptions here, but let @dude mutate state glyphs -->

# Tasks: Ship Command

Three all-open, sequential canonical units implement the Feature 017 contract at `.dude/specs/017-ship-command/spec.md`, owned by `.dude/ideas/ship-command.md`. Ship remains a thin lifecycle resolver and fixed Work preset; it adds no workflow implementation, runtime, skill, or state.

No task carries `[P]`. T002 depends on the source authority established by T001, and T003 validates their integrated result.

Durable suffixes are fixed lowercase hexadecimal encodings of `ship`, `docs`, and `vali`.

Every task that edits `src/` runs `node scripts/build-dev.mjs`; `.github/` core files are generated only by that command and are never hand-edited. Execution may read but must not write any `.dude/specs/017-ship-command/**` artifact. A required normative change stops with `contract-mismatch: redefine-required`.

## Phase 1: Ship Authority And Projection

**Goal**: Add the smallest source authority for lifecycle resolution and exact Work delegation, then prove the generated projection.

- [~] T001@73686970 [Shared] Add the detailed Ship resolver to `src/skills/dude-work-intake/SKILL.md` and concise orchestration plus mode routing to `src/agents/dude.agent.md`. Validate one optional target and no flags before mutation; encode raw idea -> existing brainstorm -> existing define -> Work, draft -> existing define -> Work, defined package -> Work as-is, and bare one-target resolution; ask one exact-candidate disambiguation question with fresh rerun; retain hard ownership diagnostics and tracked precedence; delegate the exact normalized Work policy without until-blocked; preserve all existing checkpoints, stops, authority, Git, and no-new-state boundaries. Add focused source contracts to `scripts/current-format-contract.test.mjs`, including absence of a Ship-specific skill or runtime. Run `node scripts/build-dev.mjs`, verify with `node --test --test-name-pattern='Ship' scripts/current-format-contract.test.mjs` and the named byte-identical projection test in `scripts/build-dev.test.mjs`, then inspect that only the intended generated counterparts `.github/agents/dude.agent.md` and `.github/skills/dude-work-intake/SKILL.md` changed for this feature. (US1, US2, US3 -> FR-001 through FR-020, FR-023, FR-024)

## Phase 2: Guidance And Documentation Contracts

**Goal**: Make Ship the usual convenience verb while keeping explicit lifecycle control and Work's advanced interface clear.

- [ ] T002@646f6373 [US4] Update `README.md`, `docs/setup.md`, `docs/commands.md`, `docs/workflow.md`, `docs/walkthrough.md`, and `docs/reference.md` with concise, consistent Ship guidance and examples: optional target only, advance until done or an existing Work stop, exact raw/draft/defined/bare resolution, pre-mutation ambiguity and tracked precedence, unchanged clarification and guardrail checkpoints, no proactive refresh or intent merge, no tracking/import/Git/release action, and Work retained for custom controls. Add the command row and dedicated Ship reference without changing Work's exact grammar. Extend `scripts/current-format-contract.test.mjs` with static documentation contracts and mutation checks. Verify with `node --test scripts/current-format-contract.test.mjs` and `git diff --check -- README.md docs scripts/current-format-contract.test.mjs`. (US1, US3, US4 -> FR-002 through FR-004, FR-011 through FR-025)
    deps: T001@73686970

## Phase 3: Integrated Acceptance

**Goal**: Prove Ship composes current behavior exactly and introduces no extra workflow or shipped surface.

- [ ] T003@76616c69 [Shared] Run final acceptance over the integrated Feature 017 change: rebuild with `node scripts/build-dev.mjs`; run focused Ship/static contracts, the full discovered `node --test` suite, `node .github/skills/dude-lint/lint.mjs .`, `node .github/skills/dude-compose/compose.mjs verify`, build-dev and release-build suites, a pristine `node scripts/build-release.mjs --out <fresh-temp-dir> --tag v0.0.0` plus lint of that output, `git diff --check`, and complete status/source-generated diff inspection. Route the same fresh evidence independently to the installed Tester and Code Reviewer. Prove every lifecycle and invalid-input matrix, one-question ambiguity rerun, tracked precedence and no fallback, exact normalized Work policy without until-blocked, unchanged clarification/guardrail/review/verification/ownership/reconciliation/close/audit/reporting/learning behavior, explicit brainstorm and define controls, optional Git isolation, and zero new skill, parser, runtime, lane, board, state, ledger, alias, configuration, profile, scheduler, report, release action, or task-count checkpoint. (US1, US2, US3, US4 -> FR-001 through FR-025)
    deps: T002@646f6373