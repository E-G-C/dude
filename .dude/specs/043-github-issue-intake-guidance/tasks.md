<!-- audit log: .dude/ideas/043-github-issue-intake-guidance.md#coordinator-log -->

# Tasks: GitHub Issue Intake Guidance

Two all-open sequential canonical units implement
`.dude/specs/043-github-issue-intake-guidance/spec.md`, prospectively and
exactly owned by `.dude/ideas/github-issue-intake-guidance.md`.

The work is documentation-only under current evidence. The canonical compact
decision model lives in `docs/workflow.md`; `README.md`, `docs/commands.md`, and
`docs/reference.md` provide concise orientation and links without duplicating
large policy prose. No task may add `admit`, another issue command, runtime or
source behavior, generated-core changes, persistent admission state, a GitHub
lane, tracker, cache, registry, daemon, poller, automatic processing, issue-21
repair, specialist-scope prevention work, a supporting artifact, generated
board, or ObjectiveRegistry region. A demonstrated Feature 034 source failure
stops as `contract-mismatch: redefine-required`.

## Phase 1: Public Decision Guidance

**Goal**: Make the existing issue routes discoverable while keeping one compact
decision model and preserving all current authority boundaries.

**Independent Test**: Starting from each changed public surface, reach the same
six-outcome model and distinguish inspect-only, Ship execution, feature
definition, bounded direct work, active-work flagging, and ambiguity without
learning a new command.

- [x] T001@4c8e2a71 [US1] Implement `plan.md` Chosen Design sections 1 and 2 only in `README.md`, `docs/commands.md`, `docs/workflow.md`, and `docs/reference.md`. Put the compact six-outcome decision model in `docs/workflow.md`; add concise onboarding, command, and reference orientation without repeating the full policy. Preserve exact `@dude ship issue <number>` usage, inspect-only behavior with no admission, feature routing with `Origin: <canonical issue URL>`, bounded debugging/implementation/testing/independent review with the direct-task boundary, active-work-only flagging, exactly one ambiguity question with no admission, contextual admission without persistent state, and the conditional `gh pr create --base main`, `Fixes #<number>`, and base-verification contract. Add no `admit` command or new surface. Run the installed writing repetition report over the four files and inspect its findings without treating them as an automatic verdict. (US1, US2 -> FR-001 through FR-011; SC-001 through SC-006)

**Checkpoint**: The four existing public surfaces expose one consistent model,
and no source, runtime, generated-core, issue-21, or specialist-scope prevention
path has changed.

## Phase 2: Documentation Contracts And Verification

**Goal**: Pin the discoverability improvement and prove that it changes no
Feature 034 behavior or workflow surface.

**Independent Test**: Delete or weaken each newly owned decision rule in memory
and confirm its focused contract fails independently while the unchanged
Feature 034 owner and generated contracts continue to pass.

- [x] T002@91d5b603 [US2] Implement `plan.md` Chosen Design section 3 and the Test Strategy only in `scripts/current-format-contract.test.mjs`. Extend the existing GitHub-issue documentation contracts with section-bound requirements and useful deletion or weakening falsifiers for discovery from all four public surfaces, exact `@dude ship issue <number>` usage, inspect-only no-admission behavior, feature Origin and lifecycle routing, bounded direct work and its definition boundary, standalone bounded work versus active-work-only flagging, exactly one ambiguity question, contextual admission without persistent workflow state, absence of an `admit` command, and unchanged conditional pull-request linkage. Reuse existing helpers and add no parser or test module. Run the focused GitHub-issue tests, the complete current-format contract file, the recursive suite, workspace lint, and diff hygiene; inspect changed paths and require only the four documentation files plus this existing test file. If a pre-existing Feature 034 source-owner failure appears, stop as `contract-mismatch: redefine-required` before any source or generated-core edit. (US1, US2 -> FR-001 through FR-013; SC-001 through SC-007)
    deps: T001@4c8e2a71

**Checkpoint**: Focused and integrated evidence covers the compact model and
prohibited boundaries over one unchanged revision for independent review.

## Requirements And Success Traceability

| Specification coverage | Plan ownership | Tasks |
|---|---|---|
| FR-001 through FR-008 / SC-001 through SC-004 | Compact model, discovery links, and route distinctions | T001@4c8e2a71, T002@91d5b603 |
| FR-009, FR-010 / SC-001, SC-005 | Contextual admission and non-duplicative documentation structure | T001@4c8e2a71, T002@91d5b603 |
| FR-011 / SC-006 | Conditional pull-request contract | T001@4c8e2a71, T002@91d5b603 |
| FR-012, FR-013 / SC-007 | Documentation-only boundary and excluded defect work | T002@91d5b603 |

## Lightweight Execution History

- dude-run-event: {"basis":{"action":"execute-task","assumptionIdentities":[],"evidenceAcquisitionIdentities":[],"materialInputs":{"checks":["verification"],"operations":["execute-task"],"targets":["README.md","docs/commands.md","docs/reference.md","docs/workflow.md"]},"mechanismIdentities":[],"target":{"lane":"lightweight","specPath":".dude/specs/043-github-issue-intake-guidance/spec.md","taskKey":"T001@4c8e2a71"},"validationPlanIdentities":[],"version":1},"eventHash":"d403c054b477098420a64f2cb714038d8f0f17f744f114a2e0e4a669b738994e","occurrence":{"attemptIdentity":"e6a36b981201c8f404c4c23c79622862f4c1db3f95f543cfb86a957b38aa709f","authorizationEvidenceHash":"92fa19ecdeda6561047321e37e943610542f5527edc386ab02198066970af0f9","basisIdentity":"9410584c69b0fe244b35d9d77c92d6832ad84eae80ccd47be7e56ad3860eefa3","chronology":{"attemptOrdinal":1},"disposition":"accepted","resultIdentity":"0ee817d12cb2fb98882977197ab209255c21a00f9a50d573a47a86701fe5d34d","version":1},"occurrenceIdentity":"bdbab7ebf313971d8595f260a5f51ea787220d015cb3f8bca6644bf5e2362cf2","reviewEnvelopeIdentity":"d051d014ddf19d36c0c55a44314ef3f0ea806dbb46dd22b7a6baa83037889760","target":{"lane":"lightweight","specPath":".dude/specs/043-github-issue-intake-guidance/spec.md","taskKey":"T001@4c8e2a71"},"type":"approach-occurrence","verificationEnvelopeIdentity":"e8eed74d7c9a77b351603f34f84bb7bc477486993ec0c22e18153a7b03dab9f0","version":1}
- dude-run-event: {"basis":{"action":"execute-task","assumptionIdentities":[],"evidenceAcquisitionIdentities":[],"materialInputs":{"checks":["verification"],"operations":["execute-task"],"targets":["README.md","docs/commands.md","docs/reference.md","docs/workflow.md","scripts/current-format-contract.test.mjs"]},"mechanismIdentities":[],"target":{"lane":"lightweight","specPath":".dude/specs/043-github-issue-intake-guidance/spec.md","taskKey":"T002@91d5b603"},"validationPlanIdentities":[],"version":1},"eventHash":"b0c15677edbbfeef6b7558e61406a2a8242ba554217cb14364ad4dad45b44184","occurrence":{"attemptIdentity":"4edacb03e04baafeae7f08844e3c1e4a4d8f4b12c833d5d19705aed46d96ad7e","authorizationEvidenceHash":"9ec5cc9c0e0e4221a6cec7d9b6101624829efe68914d5af9e0eac465eaa81e04","basisIdentity":"6cfc166745a360eae3daee0ee2573a29df2069aec4cdcdde7a016518ed741706","chronology":{"attemptOrdinal":1},"disposition":"accepted","resultIdentity":"8a84436bd5f6dedef165a7d80365ee60c3db9dc63c4f83a4f63413701a035db4","version":1},"occurrenceIdentity":"ec9c32ffddae60c2772230e62efc2445d91de5fc01fe2754be01dd77c5e6b2c1","reviewEnvelopeIdentity":"5d1db3980e46450d7e81f598968d067ac4e90b7491ac8c23eb498f65c46296a6","target":{"lane":"lightweight","specPath":".dude/specs/043-github-issue-intake-guidance/spec.md","taskKey":"T002@91d5b603"},"type":"approach-occurrence","verificationEnvelopeIdentity":"670557843be6ac0aa12a8b5381c482f2b776de8a3fc1de27db45805439283c5c","version":1}
