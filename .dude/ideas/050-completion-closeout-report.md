---
title: Completion Closeout Report
slug: completion-closeout-report
status: defined
spec_path: .dude/specs/050-completion-closeout-report/spec.md
---

# Idea: Completion Closeout Report

## Idea

Add a universal final coordinator closeout report to the normal agentic workflow after successful close. This is core behavior, independent of any optional pack.

Before finishing, report the observed worktree and branch status, applicable pull request, tag, and release links, exact optional cleanup, and reusable lessons or learning candidates. Keep the report deterministic, concise, read-only, and evidence-based. Omit categories that do not apply rather than showing empty placeholders.

Never invent links, claim an unobserved clean worktree, execute cleanup, reopen completed work, persist lessons automatically, or create a second audit or state surface. The report is the coordinator's final response after workflow completion, not another Reviewer, task, lane, board, acceptance authority, or hook.

For a long feature, Ship run, or release completion, surface the actual delivery identities and exact optional cleanup. For a bounded task with no pull request, tag, or release, report only the applicable state.

The separate `retrospective-rubber-duck-pack` may contribute advisory feedback before coordinator close when installed, but this closeout report must work without that pack and must not treat it as a core dependency.

Reusable lessons continue to follow existing `dude-learning-promotion` and memory authority. The closeout reports only what was retained or proposed.

## Open Questions

No material outcome-changing questions remain for brainstorm capture.

## Assumptions

No additional assumptions have been provided.

<!-- dude:managed:start -->
## Normalized Intent

- Add one universal core closeout report as the coordinator's final response after any successful workflow close.
- Report only observed, applicable facts: worktree and branch status; actual delivery identities; pull request, tag, and release links; exact optional cleanup; and retained or proposed reusable lessons.
- Scale the content to the completed work. Long feature, Ship, and release completions surface their actual delivery identities and cleanup options, while bounded tasks omit inapplicable delivery categories.
- Keep output deterministic, concise, read-only, and evidence-based. Omit inapplicable categories instead of rendering empty placeholders.
- Never fabricate a link or identity, infer an unobserved clean worktree, perform cleanup, reopen completed work, or change acceptance after close.
- Keep the report inside the existing coordinator response. It is not another Reviewer, task, lane, board, acceptance authority, audit, state surface, workflow stage, or hook.
- Keep reusable-learning authority unchanged. Report only lessons already retained or candidates already proposed through existing `dude-learning-promotion` and memory governance; do not persist lessons from the closeout.
- Keep optional advisory feedback separate. An installed optional retrospective pack may contribute before coordinator close, but the core closeout works independently and has no optional-pack dependency.

## Constraints

- Core behavior must remain functional with no optional pack installed.
- Produce the report only after successful close, as the coordinator's final response.
- Use read-only evidence available at close; do not trigger cleanup, delivery, release, learning promotion, or another workflow action.
- Do not claim cleanliness, branch state, delivery identity, or a link without observing supporting evidence.
- Omit every inapplicable category, including pull request, tag, and release details for bounded work that has none.
- When cleanup is applicable, describe the exact optional action without executing it.
- Do not reopen completed work or introduce a new review, task, lane, board, acceptance decision, hook, audit record, report file, registry, or persistent state.
- Do not persist a lesson automatically. Preserve the existing distinction between retained learning and a proposed learning candidate.
- Do not make `retrospective-rubber-duck-pack` or any other optional pack a core dependency.

## Definition Checklist

- [x] Outcome is clear enough for brainstorm
- [x] Scope is one bounded core workflow outcome
- [x] Final-response timing and coordinator ownership are explicit
- [x] Evidence, applicability, and omission rules are explicit
- [x] Long-form delivery and bounded-task behavior are distinguished
- [x] Cleanup is optional and never executed by the report
- [x] Existing learning and memory authority is preserved
- [x] Optional advisory-pack participation is separated from core behavior
- [x] No outcome-changing open question remains
- [x] Definition and implementation remain deferred to later explicit workflow actions

## Coordinator Log

- 2026-08-31 UTC - brainstorm first-capture draft staged for coordinator publication; definition deferred to explicit `define completion-closeout-report`
- 2026-08-31 UTC - first definition staged for coordinator publication at `.dude/specs/050-completion-closeout-report/spec.md`
- 2026-08-31 UTC - Lightweight task `T001@c10e50a1` claimed for implementation
- 2026-08-31 UTC - Lightweight task `T001@c10e50a1` closed after fresh verification and independent approval
- 2026-08-31 UTC - Lightweight task `T002@c10e50b2` claimed for implementation
- 2026-08-31 UTC - Lightweight task `T002@c10e50b2` closed after focused mutation verification and independent approval
- 2026-08-31 UTC - Lightweight task `T003@c10e50c3` claimed for implementation
- 2026-08-31 UTC - Lightweight task `T003@c10e50c3` closed after fresh documentation verification and independent approval
- 2026-08-31 UTC - Lightweight task `T004@c10e50d4` claimed for final projection and repository validation
- 2026-08-31 UTC - Lightweight task `T004@c10e50d4` closed after full-suite verification and independent feature approval
- 2026-08-31 UTC - Feature 050 closed in Lightweight Execution with all four canonical tasks complete
<!-- dude:managed:end -->
