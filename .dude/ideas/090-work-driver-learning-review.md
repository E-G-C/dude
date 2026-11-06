---
title: Work Driver Learning Review
slug: work-driver-learning-review
status: defined
spec_path: .dude/specs/090-work-driver-learning-review/spec.md
---

# Idea: Work Driver Learning Review

## Idea

At 2026-11-01T22:35:53Z, the user replied:

> capture it

This selected Dude's offered option:

> "capture it": I'll start a brainstorm for a Dude feature that adds a learning-review step to the Work driver (proposed slug work-driver-learning-review).

The reply authorizes one draft capture only.

## Open Questions

For later investigation; no answer is needed to capture.

1. Is any supported path available for 089's stopped `T002@c3a86f51`?
   Answer:

## Assumptions

No additional user assumptions supplied.

<!-- dude:managed:start -->
## Normalized Intent

Extend the shipped core Work driver to support the existing `learning-review` challenge through the established Work authority and validation flow. An eligible live run should not need to cancel solely because the driver has no learning-review response maker. This extends the core driver, not an optional pack or a new governance route.

## Verified Context And References

- `.github/skills/dude-work/COOKBOOK.md:262` says the challenge occurs only after a proven repeat. With no response maker, the documented action is `respond --cancel`.
- `.dude/ideas/086-work-driver.md` explicitly excluded that response maker. `.dude/ideas/009-autonomous-learning-governance.md` records the existing governance authority; `.github/skills/dude-work/SKILL.md` owns its current rules.
- The coordinator reports that 089's seven-challenge Work run returned `ended`/`cancelled` when it could not answer the required learning review. The last two Coordinator Log entries in `.dude/ideas/089-github-login-pack-reads.md` record the cancellation and a later release-message fix with fresh verification and independent reviewer acceptance. Learning remains required, no close was authorized, and `.dude/specs/089-github-login-pack-reads/tasks.md` still marks `T002@c3a86f51` in progress.
- `src/skills/dude-work/host-adapter-runner.mjs` already accepts a bound learning-review result and owns its projection and branch handling. `src/skills/dude-work/driver.mjs` currently builds only specialist and cancellation responses; the definition addresses that transport gap.

## Existing Constraints And Scope

- Use actual learning review through the current owner, complete bound evidence, existing validation, and freshly verified projections. Preserve verification, independent review, learning, close, and ownership gates.
- Keep the existing sequential Work flow and its capacities. Add no lane, board, store, registry, daemon, alternate persistence system, or unauthorized Git operation.
- Keep semantic equivalence detection changes, different incident recovery, UI, and the GitHub-token race outside this idea unless later verified as inseparable and explicitly accepted.
- This definition covers the independent live-run driver outcome only. It authorizes no 089 recovery, takeover, supervisor revival, task-state change, or completion.

## Stopped-Run Uncertainty

Dude's earlier suggestion that a later Ship could review learning and continue 089 is unverified. Cancellation, lost live supervision, retained-evidence admission, and the current post-terminal gate may still bar this exact old invocation or T002. Historical 089 details are context, not a recovery mandate.

Capturing, defining, or implementing this idea does not itself revive an old invocation, allow takeover, authorize close, or resume Ship. Assess supported fresh admission and retained evidence separately from post-terminal authority before making any continuation claim. Never invent or reconstruct missing evidence, or silently retry without it.

## Definition Package

- Exact package identity: `.dude/specs/090-work-driver-learning-review/spec.md`.
- `spec.md` defines the live learning exchange and safety boundaries; `plan.md` chooses the existing response form and shared contextual validation; `tasks.md` contains one new open unit, `T001@5b7c2d90`, with no dependencies or inherited state.
- The stopped-089 question remains unanswered and outside this package's success criteria. The package creates no 089 dependency or execution authority.
<!-- dude:managed:end -->

## Coordinator Log

- 2026-11-01T22:37:15Z - brainstorm: Staged the user's literal "capture it" reply to Dude's offered work-driver-learning-review option as one draft idea. No definition, implementation, incident recovery, or Ship continuation.
- 2026-11-01T23:22:27Z - define: Staged the first definition for .dude/specs/090-work-driver-learning-review/spec.md with spec.md, plan.md, and tasks.md; derived one new open unit T001@5b7c2d90 (no deps), with no inherited task state or completion evidence. Scope is live-run learning-review transport; no 089 recovery, execution, or task completion.
- 2026-11-02T00:09:56Z - work: Claimed T001@5b7c2d90 for the user-authorized autonomous Work invocation; implementation has not started.
- 2026-11-02T02:15:48Z - work: Closed T001@5b7c2d90 and completed Ship for Work Driver Learning Review. One autonomous attempt settled with 16 fresh Tester checks and independent Code Reviewer acceptance; the ownership pair is absent. The contract-suite failure on three untracked 089 files matches the pre-change baseline. The cancelled 089 task remains outside scope and was not changed. No Git action was performed.
