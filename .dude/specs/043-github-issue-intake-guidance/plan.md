# Implementation Plan: GitHub Issue Intake Guidance

## Summary

Improve the discoverability of the existing GitHub issue intake model through
four current public documentation surfaces. Keep one compact six-outcome model
in the workflow guide, then use short contextual summaries and links from the
README onboarding, command reference, and detailed reference.

Extend only the existing section-aware documentation contracts. Do not change
the intake owner, coordinator, runtime, generated core, command grammar, or
workflow state. Current evidence matches completed Feature 034; a newly
demonstrated source-contract failure is a definition stop rather than implicit
scope for this documentation change.

The exact prospective feature identity is
`.dude/specs/043-github-issue-intake-guidance/spec.md`, prospectively owned by
`.dude/ideas/github-issue-intake-guidance.md`.

This feature has no progress objective and no ObjectiveRegistry region.

## Technical Context

**Language/Version**: Markdown documentation; dependency-free ECMAScript
modules under Node.js 20 or newer for the existing static contract test.

**Primary Dependencies**: Completed Feature 034; current GitHub issue intake
guidance in `src/skills/dude-work-intake/SKILL.md`; existing public sections in
`README.md`, `docs/commands.md`, `docs/workflow.md`, and `docs/reference.md`;
section-aware helpers in `scripts/current-format-contract.test.mjs`.

**Storage**: Existing tracked documentation files only. No workflow state,
metadata, cache, registry, tracker, admission record, or generated projection.

**Testing**: Existing section-aware prose contracts, deletion falsifiers,
focused GitHub-issue test selection, complete current-format contracts,
cross-file repetition inspection, and diff hygiene.

**Target Platform**: Supported Dude repositories using GitHub Copilot in VS
Code or the Copilot CLI.

**Project Type**: Reusable Markdown coordination bundle with repository-local
documentation.

**Performance Goals**: Not applicable; no runtime or processing path changes.

**Constraints**: Preserve exact `@dude ship issue <number>` behavior, direct
inspection without admission, feature routing with Origin, bounded direct work,
active-work-only flagging, one-question ambiguity, contextual admission, and
conditional pull-request linkage. Add no command, parser, source behavior,
state, infrastructure, or supporting artifact.

## Specification Quality Validation

- Two prioritized, independently testable stories cover route discovery and
  preservation of existing authority.
- Acceptance scenarios cover all six decision outcomes, the direct-task
  boundary, standalone work versus flag, contextual admission, and conditional
  pull-request linkage.
- FR-001 through FR-013 state observable documentation and workflow outcomes.
  Exact command strings are public interface contracts, not implementation
  choices.
- SC-001 through SC-007 are measurable through section inspection, contract
  falsifiers, prohibited-capability checks, and changed-path review.
- Edge cases cover terminology conflicts, boundary crossing, false blockers,
  staged user requests, repetition, contract mismatch, and excluded issue work.
- No unresolved clarification marker remains.

The specification satisfies its WHAT/WHY gate by inspection. This is not a
lint, publication, execution, or readiness claim.

## Verified Current Topology

1. Feature 034 already defines and completed single-issue retrieval,
   surrounding-request authority, feature capture with visible Origin, bounded
   bug and chore routing, active-work flag behavior, one-question ambiguity,
   conditional pull-request linkage, and the prohibition on GitHub-specific
   workflow infrastructure.
2. `src/skills/dude-work-intake/SKILL.md` `## GitHub Issue Intake` is the sole
   detailed behavior owner. It already distinguishes direct answers, feature
   capture, bounded execution, active-work blockers, and ambiguity.
3. `src/agents/dude.agent.md` delegates issue routing, Ship handling, and
   response shape to that intake owner. No coordinator behavior change is
   needed.
4. `README.md` `## GitHub Issue Input` states that a reference supplies input
   rather than authority and that inspection or display does not authorize
   execution. Its earlier `## Your First Feature` onboarding remains primarily
   feature-first.
5. `docs/commands.md` `### GitHub Issue Input` owns supported forms and the
   four substance routes. Its `### @dude ship` section owns the conditional
   `gh pr create --base main`, closing-reference, and base-verification
   contract.
6. `docs/workflow.md` `### GitHub Issue Intake` already explains that issue
   intake creates no lane or tracker and briefly describes feature, bounded,
   flag, and unadmitted routes. It is the smallest existing home for one compact
   decision model.
7. `docs/reference.md` `### GitHub Issue Intake` already owns raw-input,
   direct-answer, failure, and ambiguity details.
8. `scripts/current-format-contract.test.mjs` already provides normalized
   paragraph checks, section-bound deletion falsifiers, source/generated
   assertions, prohibited-capability checks, and focused GitHub-issue
   documentation contracts.
9. The current source and documentation evidence shows no completed Feature 034
   contract failure. Therefore no source, generated-core, runtime, or build-dev
   task applies.

## Guardrail And Smallest-Design Check

Existing project guardrails already require the smallest proven design and
concise, non-redundant model-facing prose. No new durable guardrail is needed.

Kept:

- One compact six-outcome decision model in the existing workflow section.
- Short orientation and links in the existing README, command, and reference
  sections.
- Focused additions to the existing documentation contract test.

Rejected:

- An `admit` verb or any new issue command.
- Repeating the full issue-intake policy on every documentation surface.
- A new guide, test module, parser, runtime helper, state record, lane, tracker,
  cache, registry, daemon, poller, or automatic processor.
- Source or generated-core edits without evidence of a Feature 034 contract
  failure.
- Work on `E-G-C/dude#21` or the separate specialist-scope prevention idea.

## Chosen Design

### 1. Publish one compact decision model

Use `docs/workflow.md` `### GitHub Issue Intake` as the canonical compact
decision model because it already explains how issue intake fits the lifecycle.

Present six concise outcomes:

1. Inspect only: an issue question or lookup receives a direct answer and admits
   no work.
2. Ship issue: `@dude ship issue <number>` fetches, classifies, and executes the
   existing route appropriate to the issue.
3. Feature: brainstorm, accepted idea with
   `Origin: <canonical issue URL>`, define, then Work.
4. Bounded bug or chore: direct debugging, implementation, testing, and
   independent review without an idea or package until the direct-task boundary
   is crossed.
5. Active-work blocker: existing flag behavior only when the issue clearly
   blocks real active work.
6. Ambiguity: exactly one classification question and no admission without an
   answer.

State next to the model that contextual admission creates no persistent
authority or GitHub workflow state.

### 2. Improve discovery from existing surfaces

Edit only:

- `README.md`
  - connect the feature-first onboarding to the shorter bounded-issue route;
  - retain the current `## GitHub Issue Input` authority explanation;
  - point readers to the compact workflow model.
- `docs/commands.md`
  - emphasize `@dude ship issue <number>` as the existing execution form;
  - distinguish inspection from execution and standalone bounded work from
    flag;
  - retain the conditional pull-request contract exactly.
- `docs/reference.md`
  - add a short orientation to the compact model;
  - retain detailed raw-input, failure, ambiguity, and authority rules.
- `docs/workflow.md`
  - own the compact six-outcome model described above.

Keep each non-owning surface concise. Do not add `docs/setup.md`, the
walkthrough, a new guide, or repeated large policy blocks.

### 3. Extend existing documentation contracts

Modify only `scripts/current-format-contract.test.mjs`.

Extend the current GitHub-issue documentation contracts to pin:

- discovery of the compact model from all four public surfaces;
- the exact `@dude ship issue <number>` execution form;
- inspect-only behavior with no admission;
- feature routing with visible Origin;
- bounded direct debugging, implementation, testing, and independent review;
- the direct-task boundary;
- standalone bounded work versus active-work-only flag behavior;
- exactly one ambiguity question and no admission without an answer;
- contextual admission without persistent workflow state;
- absence of `admit` as a command;
- the unchanged conditional `gh pr create --base main`,
  `Fixes #<number>`, and base-verification contract; and
- unchanged exclusion of runtime, source behavior, issue-21 repair, and
  specialist-scope prevention work.

Reuse existing normalized-paragraph, section-bound, mutation-falsifier, and
prohibited-capability helpers. Add no new parser or test module.

If the focused contract reveals a pre-existing failure in the Feature 034
source owner rather than a documentation omission, stop as
`contract-mismatch: redefine-required` before editing source or generated core.

## Test Strategy

### Focused documentation checks

1. Inspect the four changed public sections and confirm that each exposes or
   links to the compact workflow model.
2. Confirm that the workflow model contains each of the six outcomes exactly
   once in a concise form.
3. Confirm that `@dude flag` is limited to blockers against active work and is
   not presented as the route for standalone bounded issues.
4. Confirm that no `admit` command, persistent admission concept, new lane, or
   automatic processing promise appears.
5. Run the installed repetition report over the four documentation files and
   use its findings as reviewer evidence rather than an automatic verdict.

### Contract checks

Run:

```bash
node --test --test-name-pattern='GitHub issue' scripts/current-format-contract.test.mjs
node --test scripts/current-format-contract.test.mjs
git diff --check -- README.md docs/commands.md docs/workflow.md docs/reference.md scripts/current-format-contract.test.mjs
```

Each newly required rule must have a section-bound deletion or weakening
falsifier where the existing helper supports one. Existing Feature 034 source
and generated-owner contracts remain unchanged and must continue to pass.

### Integrated acceptance

- Run the repository's recursively discovered Node.js suite.
- Run workspace lint and require zero failures.
- Inspect changed paths and confirm that only the four documentation files and
  `scripts/current-format-contract.test.mjs` changed.
- Confirm there is no `src/`, generated `.github/`, issue-21 implementation,
  specialist-scope prevention, state, metadata, or supporting-artifact change.
- Route the unchanged revision and the same evidence to independent review.

No build-dev or GitHub network smoke is required because no authoritative core
source or retrieval behavior changes.

## Phases And Task Mapping

| Phase | Deliverable | Task |
|---|---|---|
| 1 | Compact decision model and discovery links across existing public surfaces | `T001@4c8e2a71` |
| 2 | Focused documentation contracts and integrated verification | `T002@91d5b603` |

## Requirements Traceability

| Specification coverage | Plan ownership | Tasks |
|---|---|---|
| FR-001 through FR-008 / SC-001 through SC-004 | Chosen Design sections 1 and 2 | `T001@4c8e2a71`, `T002@91d5b603` |
| FR-009, FR-010 / SC-001, SC-005 | Compact ownership, contextual admission, and concise cross-links | `T001@4c8e2a71`, `T002@91d5b603` |
| FR-011 / SC-006 | Preserved conditional pull-request guidance and contract | `T001@4c8e2a71`, `T002@91d5b603` |
| FR-012, FR-013 / SC-007 | Documentation-only changed-path boundary and excluded work | `T002@91d5b603` |
