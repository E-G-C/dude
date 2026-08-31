---
title: Add A Topology-First Reset When Review Revisions Expand Enforcement Scope
slug: topology-first-enforcement-reset
status: defined
spec_path: .dude/specs/021-topology-first-enforcement-reset/spec.md
---

# Idea: Add A Topology-First Reset When Review Revisions Expand Enforcement Scope

## Idea

The core feature is a **topology-first reset**: workflow guidance that forces a call-graph recheck before review revisions keep accumulating enforcement machinery.

The problem: repeated review cycles can cause a design to accumulate gates, checkpoint state, and cross-session coordination around an *assumed* enforcement point. Review findings may be valid, but each revision can grow the design without rechecking where production behavior is actually controlled. Feature 013 demonstrated this — after several revisions, tracing the production call graph showed the deterministic runner was the sole driver and every admitted work-loop terminal passed through `finish(row)`. One bounded attachment at that `finish(row)` chokepoint satisfied the requirement; the proposed session/checkpoint machinery covered no additional reachable path. (Feature 013 is the illustrative example only; it is NOT reopened.)

Add a topology-first reset when any of these triggers fire:

- The same control-boundary concern survives two review cycles.
- A revision introduces a new gate, store, checkpoint, or cross-session state.
- Enforcement expands across modules or workflow boundaries.

Before another revision, the planning authority must identify:

- The production entry point and actual call path.
- Which actor controls each operation and input.
- The concrete reachable failure being prevented.
- The narrowest existing enforcement point covering that failure.
- A focused check that could disprove the topology assumption.
- Why each proposed stateful mechanism covers a reachable path.

Review then evaluates the revised design against this evidence.

This reset is **workflow guidance** woven into existing workflow/skill instructions — not a new standalone artifact and not merely a memory lesson. It creates no new persistent workflow artifact. Existing safety, verification, and independent review requirements remain unchanged, and ordinary local review fixes do not trigger the reset.

The runner/coverage fix (runner-owned reason codes, `target` in fallback, an arbitrary-`error.code` regression test, and a runner integration test) has been split out into its own idea ledger `runner-reason-code-coverage-fix` per issue E-G-C/dude#3 Non-Goals.

No rollback or Feature 013 reopening is needed. Do not add another no-shell lesson; it already exists.

## Open Questions

No open questions remain — the authoritative issue (E-G-C/dude#3) resolved the first two questions, and the third is resolved by splitting the runner/coverage fix into its own ledger:

1. RESOLVED — Is the runner integration test reachable from the real safety writer, or should the boundary be documented?
   Answer: Out of scope for this feature. The issue's Non-Goals explicitly exclude "the separate unattended-runner attribution and coverage defects." The runner reason-code fix, `target`-in-fallback, arbitrary-`error.code` regression test, and coverage/integration-test work are a SEPARATE concern, recorded above as separated scope.
2. RESOLVED — Where should the topology lesson and the `gh pr create --base main` PR-base guardrail live?
   Answer: The topology-first reset is actual workflow guidance (reset triggers + required planning-authority topology checks + review evaluation), not merely a memory lesson, and it creates no new persistent workflow artifact — it is woven into existing workflow/skill instructions. The `gh pr create --base main` PR-base rule is a separate minor guardrail concern the issue does not cover; it is a deferred guardrail candidate to be resolved at define-time (guardrail checkpoint).

3. Should the scoped-out runner/coverage fix become its own separate idea ledger?
   Answer: Yes — split into its own ledger `runner-reason-code-coverage-fix` (created). This ledger keeps only the topology-first reset workflow guidance.

## Assumptions

- No rollback is needed.
- No Feature 013 reopening is needed.
- The no-shell lesson already exists; do not duplicate it.
- The PR base is `main`.
- The runner attribution/coverage fix is out of scope per the issue's Non-Goals.
- The topology reset creates no new persistent workflow artifact.
- Ordinary local review fixes do not trigger the reset.

<!-- dude:managed:start -->
## Normalized Intent

### Reset Triggers

Add a topology-first reset when any of these fire:

- The same control-boundary concern survives two review cycles.
- A revision introduces a new gate, store, checkpoint, or cross-session state.
- Enforcement expands across modules or workflow boundaries.

### Required Topology Check

Before another revision, the planning authority must identify:

- The production entry point and actual call path.
- Which actor controls each operation and input.
- The concrete reachable failure being prevented.
- The narrowest existing enforcement point covering that failure.
- A focused check that could disprove the topology assumption.
- Why each proposed stateful mechanism covers a reachable path.

### Review Evaluation Against Evidence

- Review evaluates the revised design against the topology evidence above.
- Topology claims are verified against current source and call sites.

### Acceptance Criteria (distilled)

- Workflow guidance defines the reset triggers.
- The planning authority performs the topology check before further expansion.
- New enforcement machinery requires a reachable failure and an acceptance test.
- Existing safety, verification, and independent review requirements remain unchanged.
- The reset creates no new persistent workflow artifact.
- Ordinary local review fixes do not require an architecture reset.

## Constraints

- Keep this as brainstorm intake only; do not create a definition package or begin implementation.
- Do not dismiss or weaken review findings.
- Do not bypass safety or approval gates.
- Do not require architecture review after every rejection.
- Do not fix the separate unattended-runner attribution and coverage defects (out of scope per the issue's Non-Goals).
- Create no new persistent workflow artifact.
- Keep existing safety, verification, and independent-review requirements unchanged.
- Ordinary local review fixes are exempt from the reset.
- No rollback.
- No Feature 013 reopening.
- Do not duplicate the existing no-shell lesson.

## Definition Checklist

- [x] Outcome is clear enough for brainstorm
- [x] Scope is coherent as one idea ledger
- [x] Open questions are resolved or consciously assumed

## Coordinator Log

- 2026-08-06 UTC - brainstorm captured
- 2026-08-06 UTC - brainstorm refreshed from issue E-G-C/dude#3
- 2026-08-06 UTC - split runner/coverage fix into ledger runner-reason-code-coverage-fix
- 2026-08-06 UTC - defined as feature 021 (via ship); guardrail checkpoint skipped, PR-base candidate dropped
- 2026-08-06 UTC - work(021): claimed T001 [~]
- 2026-08-06 UTC - work(021): closed T001 [x] (contract pin + full suite green, projection parity)
- 2026-08-06 UTC - work(021): claimed T002 [~]
- 2026-08-06 UTC - work(021): closed T002 [x] (contract pin + full suite green, both projections parity)
- 2026-08-06 UTC - work(021): claimed T003 [~] (acceptance)
- 2026-08-06 UTC - work(021): closed T003 [x] — Tester PASS (suite 2263/0, lint 0/0, additive +60/-0, no new artifact); Reviewer APPROVE
- 2026-08-06 UTC - work(021): applied reviewer finding 1 (lowercase "must"); finding 2 (no-artifact static pin) satisfied via T003 diff inspection per smallest-design guardrail
- 2026-08-06 UTC - ship(021): all tasks complete; natural stop: no ready task
<!-- dude:managed:end -->
