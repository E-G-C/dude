<!-- audit log: .dude/ideas/050-completion-closeout-report.md#coordinator-log -->

# Tasks: Completion Closeout Report

## Phase 1: Core Closeout Contract

**Goal:** Make one evidence-based, read-only closeout part of the coordinator's final response after successful closes.

**Independent Test:** Inspect the authoritative coordinator section and execution pointers and verify that they cover bounded, feature, Ship, release, and mixed-result closes without adding runtime or persistent surfaces.

- [x] T001@c10e50a1 [US1] Author the sole detailed completion-closeout contract in `src/agents/dude.agent.md` and add narrow successful-close pointers in `src/skills/dude-work/SKILL.md` and `src/skills/dude-lightweight-execution/SKILL.md`

**Checkpoint:** Core source defines one same-response closeout, evidence and omission rules, proportional task reporting, and unchanged close/learning authority.

## Phase 2: Verification and Documentation

**Goal:** Pin the contract against deletion and explain the behavior to users.

**Independent Test:** The focused current-format contract checks pass, and docs describe the same timing, evidence, applicability, and optional-pack boundaries as core source.

- [x] T002@c10e50b2 [P] [US1] Add section-scoped contract checks and labeled deletion falsifiers for closeout behavior in `scripts/current-format-contract.test.mjs`
    deps: T001@c10e50a1
- [x] T003@c10e50c3 [P] [US2] Document universal and proportional closeout behavior in `README.md`, `docs/commands.md`, and `docs/workflow.md`
    deps: T001@c10e50a1

**Checkpoint:** Required behavior is independently pinned and documented without empty-category examples or optional-pack coupling.

## Phase 3: Generated Projection and Final Validation

**Goal:** Publish authoritative source into the dogfood bundle and verify repository consistency.

**Independent Test:** Generated core matches `src/`, focused and full tests pass, workspace lint reports zero failures, and the final diff contains only intended source, generated, test, and documentation changes.

- [x] T004@c10e50d4 [Shared] Rebuild generated `.github/` core from `src/` and run focused contract, full-suite, projection, lint, and diff-consistency validation
    deps: T002@c10e50b2, T003@c10e50c3

**Checkpoint:** The implementation is ready for independent review with no new runtime, state, hook, cleanup execution, learning persistence, or optional-pack dependency.
