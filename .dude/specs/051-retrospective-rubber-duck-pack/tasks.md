<!-- audit log: .dude/ideas/051-retrospective-rubber-duck-pack.md#coordinator-log -->

# Tasks: Retrospective Rubber Duck Pack

## Phase 1: Optional Pack And Coordinator Contract

**Goal:** Add one read-only retrospective provider and make the coordinator use it only at eligible installed-pack feature closes.

**Independent Test:** Source inspection proves the pack has one read/search-only agent and the coordinator conditionally attempts it exactly once after final review and before successful feature or Ship close, with no extension runtime.

- [x] T001@51a0d001 [P] [Shared] Create `library/packs/rubber-duck/pack.md` and `library/packs/rubber-duck/agents/dude-pack-rubber-duck-retrospective.agent.md` with the exact provider, balanced model, read/search-only boundary, concise advisory return contract, empty dependencies, no skill, and inert `hooks: []`
- [x] T002@51a0d002 [P] [Shared] Add the optional roster-presence, eligible timing, exact-once final dispatch, coordinator-owned append, exclusion, failure, and no-closeout-citation contract to `src/agents/dude.agent.md`

**Checkpoint:** The pack and core source share one exact provider stem, but core remains complete and unchanged in outcome when that provider is absent.

## Phase 2: Contract Verification And Documentation

**Goal:** Make every material behavior deletion-falsifiable and explain the optional capability without adding commands or lifecycle concepts.

**Independent Test:** Focused source contract checks fail when a trigger, exclusion, read-only boundary, append rule, or optional-independence clause is deleted, and docs match the same behavior.

- [x] T003@51a0d003 [P] [Shared] Extend `scripts/current-format-contract.test.mjs` with section-scoped manifest, agent, coordinator, retrospective-artifact, Feature 050 independence, prohibited-mechanism, and labeled deletion-falsifier checks
    deps: T001@51a0d001, T002@51a0d002
- [x] T004@51a0d004 [P] [Shared] Add `rubber-duck` to `library/packs/README.md` and `README.md`, update the catalog count, and document timing, exclusions, stable artifact discovery, and universal-closeout independence in `README.md` and `docs/workflow.md`
    deps: T001@51a0d001, T002@51a0d002

**Checkpoint:** Tests and documentation describe one optional advisory pass, not a reviewer, command, hook, or close requirement.

## Phase 3: Generated Projection And Final Validation

**Goal:** Project the authoritative core change and validate the pack through its existing install/remove lifecycle.

**Independent Test:** Generated core is source-equivalent, temporary pack installation and removal are clean, focused and full tests pass, lint reports zero failures, and the diff contains only intended source, generated, test, and documentation changes.

- [x] T005@51a0d005 [Shared] Build the generated `.github/agents/dude.agent.md`, run focused and full current-format tests, Compose/manifest tests and `compose verify`, source/generated parity, workspace lint, the full repository suite, and final diff consistency checks without committing an installed Rubber Duck projection or profile change
    deps: T003@51a0d003, T004@51a0d004

**Checkpoint:** The implementation is ready for independent review with no skill, external runtime, objective registry, extension infrastructure, optional-pack dependency, or unverified generated artifact.
