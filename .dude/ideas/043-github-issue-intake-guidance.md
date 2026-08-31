---
title: GitHub Issue Intake Guidance
slug: github-issue-intake-guidance
status: defined
spec_path: .dude/specs/043-github-issue-intake-guidance/spec.md
---

# Idea: GitHub Issue Intake Guidance

## Idea

Document how GitHub issues fit Dude's existing workflow when the issue is a
bounded bug or chore that does not need an idea or specification package. Users
who remember the classic `brainstorm -> define -> work` path and Ship need a
prominent explanation of why some issue requests take a shorter route.

Use the existing one-verb execution path, `@dude ship issue <number>`. Do not add
an `admit` verb or any other issue-admission command. The issue reference and
the surrounding requested action already provide intake context.

Make this decision model easy to find in the command, reference, and onboarding
surfaces where it materially helps:

1. `look at issue 21`, or an equivalent request, fetches and classifies the
   issue, answers directly, and admits no work.
2. `@dude ship issue 21` fetches and classifies the issue, then executes the
   path appropriate to its substance.
3. A feature request follows the existing `brainstorm -> idea -> define ->
   Work` lifecycle and preserves `Origin: <canonical issue URL>`.
4. A bounded bug or chore goes directly through systematic debugging,
   implementation, testing, and independent review. It creates no idea or spec
   unless investigation crosses the existing direct-task boundary.
5. A blocker against active work uses existing flag behavior, and only when it
   is attached to real active work.
6. Ambiguous intake produces exactly one classification question. Without an
   answer, no work is admitted.

Clearly distinguish `@dude flag` from standalone bounded issue work. Flag marks
a blocker against active execution; it is not a generic issue-admission
command.

Admission is contextual permission to route the current request. It creates no
GitHub lane, duplicate tracker, issue cache, registry, persistent admission
record, daemon, or automatic issue processing. GitHub remains the external
source, discussion, and closure record.

When existing delivery behavior creates a pull request, retain the current
contract: use `gh pr create --base main`, include `Fixes #<number>` for a
same-repository issue, and verify the base. Issue intake and Ship do not create
the pull request automatically.

After this guidance is implemented, processing `E-G-C/dude#21` through
`@dude ship issue 21` is separate bounded-bug work. It is not part of this
feature or its completion criteria. The separate specialist-scope prevention
idea also remains outside this feature.

## Open Questions

None.

## Assumptions

- Feature 034's completed issue-intake behavior remains authoritative unless
  definition finds evidence that the current implementation violates that
  contract.
- The main usability gap is discoverability and orientation, not missing issue
  intake behavior.
- Existing documentation plus small contract-test adjustments should be enough
  unless a current behavior failure is demonstrated.

<!-- dude:managed:start -->
## Normalized Intent

- Make the existing GitHub issue routes easy to discover for users who know the
  feature lifecycle but do not expect bounded bugs and chores to bypass idea
  and spec creation.
- Present `@dude ship issue <number>` as the existing one-verb execution path,
  without adding an admission command.
- Put one concise decision model in the command, reference, and onboarding
  surfaces where it materially improves orientation.
- Distinguish direct answers, feature capture, bounded bug or chore execution,
  active-work flagging, and ambiguous intake.
- Explain that admission grants contextual routing for the current request and
  creates no persistent GitHub workflow state.
- Preserve GitHub's external source, discussion, and closure role, including
  the current conditional pull-request linkage contract.
- Keep implementation deliberately lean: documentation and small contract
  tests unless evidence shows a failure in Feature 034's existing behavior.

## Current Evidence

- `.dude/specs/034-github-issue-work-intake/spec.md` `## Purpose`, User Story 3,
  and FR-008 through FR-019 already define surrounding-request authority,
  direct bounded bug and chore routing, active-work flag behavior, one-question
  ambiguity handling, conditional pull-request linkage, and the prohibition on
  GitHub-specific workflow infrastructure.
- `.dude/specs/034-github-issue-work-intake/plan.md` `## Verified Current
  Topology` item 10 and `## Chosen Design` section 5 identify `README.md`,
  `docs/commands.md`, `docs/workflow.md`, and `docs/reference.md` as the current
  public guidance set. The completed Phase 2 task in
  `.dude/specs/034-github-issue-work-intake/tasks.md` records that those
  surfaces and their documentation contracts were delivered.
- `docs/commands.md` `### GitHub Issue Input` already lists supported issue
  forms and substance-based routes, while its `### @dude ship` section owns the
  conditional pull-request rule.
- `docs/workflow.md` `### GitHub Issue Intake` already states that issue intake
  creates no lane or tracker and distinguishes feature capture, bounded
  execution, flag behavior, and unadmitted display.
- `README.md` `## GitHub Issue Input` says a reference supplies input rather
  than authority. `docs/reference.md` `### GitHub Issue Intake` says questions
  receive direct answers and only capture or execution requests follow a route.
- The behavior is documented, but a reader must combine several sections to
  understand why a bounded bug or chore does not enter the familiar feature
  lifecycle.

## Constraints

- Improve guidance and usability without inventing workflow behavior.
- Add no `admit` verb, runtime parser, command, state, lane, tracker, cache,
  registry, persistent admission record, daemon, poller, or automatic issue
  processing.
- Change runtime or source behavior only if current behavior demonstrably fails
  the completed Feature 034 contract.
- Keep `@dude flag` limited to a real blocker against active work; never present
  it as the generic path for a standalone bounded bug or chore.
- Preserve the direct-task boundary: unresolved product intent, architecture,
  or multi-stage planning returns the work to brainstorm and explicit
  definition.
- Preserve the current GitHub and pull-request contract, including no automatic
  Git or pull-request action.
- Prefer focused edits to current documentation and small contract tests. Do
  not add surfaces merely to repeat the same guidance.
- Exclude the later `E-G-C/dude#21` repair and the separate specialist-scope
  prevention idea from this feature and its completion criteria.

## Definition Checklist

- [x] The user problem and desired documentation outcome are clear
- [x] The command choice and six-way decision model are settled
- [x] No material product question remains open
- [x] The scope is bounded to discoverability, orientation, and decision guidance
- [x] New runtime behavior and persistent issue state are excluded absent a demonstrated Feature 034 contract failure
- [x] Issue 21 execution and specialist-scope prevention remain separate outcomes
- [x] The technology-agnostic specification passed its quality gate before planning
- [x] Only the lean core trio applies; no supporting artifact or ObjectiveRegistry region is needed
- [x] First-definition ownership is staged for the exact prospective path

## Coordinator Log

- 2026-08-29 UTC - brainstorm captured; definition deferred to explicit `define github-issue-intake-guidance`
- 2026-08-29 UTC - defined -> .dude/specs/043-github-issue-intake-guidance/spec.md (via ship)
- 2026-08-29 UTC - Ship entered autonomous Lightweight Execution and claimed T001@4c8e2a71 `[~]` for the public issue-intake decision guidance
- 2026-08-29 UTC - T001@4c8e2a71 closed after fresh Tester verification and independent Reviewer approval; T002@91d5b603 claimed `[~]` for documentation contracts and integrated verification
- 2026-08-29 UTC - T002@91d5b603 Code Reviewer rejected the first green contract revision: fenced command examples escaped the `admit` prohibition, pull-request checks shared an overfitted paragraph anchor, and the model did not exclude a seventh outcome; task remains `[~]` for bounded revision
- 2026-08-29 UTC - T002@91d5b603 Code Reviewer rejected the revised checks on the same three boundaries: fenced headings still truncated raw-section scanning, the no-automatic-PR falsifier was self-fulfilling, and exact-six counting remained syntax- and wrap-sensitive; autonomous recovery selected an Architect-led topology reset before another revision
- 2026-08-29 UTC - T002@91d5b603 topology-reset review resolved fenced command handling, raw-section boundaries, paragraph ownership, and the primary seventh-route check but retained two bounded gaps: `N)` ordered markers escaped exact-six counting and one pull-request mutation fixture hard-coded a line break; task remains `[~]`
- 2026-08-29 UTC - T002@91d5b603 review accepted all earlier correctness fixes but rejected one new YAGNI issue: the revised test duplicated Feature 034's pull-request requirement set; task remains `[~]` for consolidation onto one owning assertion
- 2026-08-29 UTC - T002@91d5b603 consolidation review found one assertion/falsifier duplication, wrap-sensitive raw pull-request mutations, and an ineffective commented-heading falsifier; task remains `[~]` for the focused test-only correction
- 2026-08-29 UTC - T002@91d5b603 closed after focused and full contract verification, the recursive Node suite, Dude lint, software review PASS, and independent Reviewer APPROVE; Feature 043 completed 2/2 Lightweight tasks with no source, generated-core, issue-21, or remote-state change
<!-- dude:managed:end -->
