---
title: Recovery Continuation
slug: recovery-continuation
status: defined
spec_path: .dude/specs/040-recovery-continuation/spec.md
---

# Idea: Recovery Continuation

## Idea

I hit an unplanned stop in a different session on another project. After manual
recovery resolved a blocker and the recovered task (`T001`) was closed, Dude
stopped instead of continuing my original `@dude ship` request. I had to ask why
it stopped. When I asked what instruction would prevent this from happening
again, an agent proposed:

> ## Recovery Continuation
>
> When manual recovery resolves a blocker encountered during an active `@dude ship` or autonomous `@dude work` request, recovery does not replace or terminate the original request.
>
> After the recovered task passes verification, review, and closure:
>
> 1. Resume the original target with its original normalized Work policy.
> 2. Continue automatically with the next ready task.
> 3. Treat task completion as progress, not a stopping condition.
> 4. Stop only for an explicit user stop/pause or a documented Work natural or hard stop.
> 5. If the original supervisor cannot legally resume, start a fresh Work invocation with the same target and policy after confirming no stale ownership remains.
>
> Never require the user to rerun `ship` merely because a manually recovered task was closed.

I want recovery to return control to the original request and keep working,
rather than making me rerun `ship` because the recovered task closed. I am
bringing the proposed text here as the raw idea; its relationship to the current
Work contract and the legal supervisor-continuity boundary still needs to be
settled.

## Open Questions

1. Is this a new Work contract, or enforcement and clarification of the existing
   autonomous stop discipline, which already says progress and milestone reports
   do not end the loop?
   Answer: enforcement and clarification of the existing
   autonomous
2. What exactly counts as "manual recovery," and when does the original Ship or
   autonomous Work request remain active? In particular, must the same
   coordinator supervisor and invocation identity still exist?
   Answer: enforcement athe ship polici, minimal human /user intervation 
3. If the original supervisor, its context, or its retained invocation identity
   is lost, may Dude automatically start a fresh Work invocation after proving
   stale ownership is absent, must the user confirm that new invocation, or must
   the loss remain a hard stop?
   Answer: choose best alternatives based on previous answers  
4. Should this continuation rule apply to autonomous Work generally, whether
   invoked directly or through Ship, or only when Ship supplied the normalized
   Work policy?
   Answer: yes
5. Is guarded (non-autonomous) Work deliberately excluded?
   Answer:yes

## Assumptions

- Reuse the existing Work stop set and active-lane authority.
- Add no command, mode, lane, state store, scheduler, daemon, registry, or
  duplicate workflow.
- Never weaken verification, independent review, ownership, task settlement, or
  close gates.
- Preserve every existing hard stop and the closed stop-reason set.
- Do not silently retry a failed task.
- The current Work and supervisor-continuity contracts remain authoritative
  unless an explicit definition later changes them.
- In this repository, `src/` is the authoritative bundle source and `.github/`
  is regenerated with `node scripts/build-dev.mjs`. A `dude-local-` instruction
  or local skill is advice for a consuming project, not the source repository.
  This records the repository boundary without choosing an implementation
  surface.

<!-- dude:managed:start -->
## Normalized Intent

- Enforce and clarify the existing autonomous Work stop discipline. This is not
  a new mode, policy, stop reason, or stop contract.
- Define manual recovery as bounded human, operator, or coordinator assistance
  that resolves a blocker while the same autonomous Work invocation remains
  active.
- Require the original coordinator supervisor, its context, and the
  independently retained invocation identity to survive through recovery of the
  current task. Exclude stale-orphan cleanup, recovery after a hard stop, and
  cross-invocation or cross-session continuation.
- Keep loss of the supervisor, context, or invocation identity as a hard stop.
  Do not start fresh Work automatically. Manual orphan cleanup may permit a
  later user-authorized clean claim, but it never resumes the original
  invocation.
- Apply the clarification to autonomous Work invoked directly or through Ship.
  Exclude guarded and other non-autonomous Work.
- Require fresh verification, independent review, exact settlement, and closure
  of the recovered task before continuation. Treat successful closure as
  progress inside the still-active invocation, then select the next ready task
  under the original target and normalized policy with a fresh task claim.
- Preserve every existing natural and hard stop, authority boundary, gate,
  budget, learning-governance rule, and stop reason. Never silently retry a
  failed task.
- Keep Feature 039's explicit-Ship answerability boundary limited to pre-Work
  decisions. Once Work begins, the recovery-continuation rule is Work-owned.

## Current Evidence

- The reported incident occurred in another session on another project and is
  motivating evidence rather than a locally reproduced runtime defect.
- The single-task host adapter deliberately returns a clean
  `ended`/`task-settled` result after exact task closure. The accepted topology
  review found no production outer-loop caller that turns this per-task result
  into termination of the whole Work request; outer iteration is owned by the
  coordinator and Work guidance.
- Direct Work parses its policy through the existing recovery implementation.
  Ship normalizes the same autonomous policy before handing off and gains no
  authority after Work begins.
- The narrow missing contract is in the authoritative Work iteration and stop
  guidance: successful per-task settlement must return control to the same live
  autonomous coordinator invocation for next-ready selection.
- Current continuity and cleanup rules already make supervisor, context, or
  invocation-identity loss a hard stop; prohibit takeover; and allow cleanup
  only as preparation for a later clean claim.
- The existing current-format contract suite owns focused section-bounded prose
  checks, and the development build owns projection from authoritative `src/`
  guidance to generated `.github/` guidance.
- Feature 039 governs eligible explicit Ship dispositions before Work begins and
  requires every Work outcome to pass through unchanged. This definition does
  not reopen that boundary.

## Constraints

- Create exactly the lean core package at
  `.dude/specs/040-recovery-continuation/`; no supporting artifact or
  ObjectiveRegistry is needed.
- Change the authoritative Work guidance and its generated projection only
  after focused contract coverage establishes the missing behavior.
- Do not add or change runtime code, public documentation, another prompt
  authority, project memory, state, or Feature 039 without new reachable
  topology evidence.
- Continuation is legal only inside the same still-active autonomous Work
  invocation while its original supervisor, context, and independently retained
  invocation identity survive.
- Successful continuation requires fresh verification, independent review,
  exact settlement, and closure. The next task receives a fresh claim under the
  original target and normalized policy.
- Do not turn manual cleanup, a later clean claim, a new invocation, or a new
  session into continuation of the original invocation.
- Do not extend the behavior to guarded Work, weaken any existing stop or gate,
  add a stop reason or persistent surface, or silently retry a failed task.

## Remaining Questions

None.

## Definition Checklist

- [x] The outcome is one bounded clarification of autonomous Work iteration
- [x] Direct and Ship-originated autonomous Work are covered
- [x] Manual assistance and same-invocation continuity are defined
- [x] Verification, independent review, settlement, closure, next-ready
      selection, and fresh-claim prerequisites are explicit
- [x] Guarded Work, continuity loss, stale-orphan cleanup, hard-stop recovery,
      and cross-invocation or cross-session continuation are excluded
- [x] Existing stops, boundaries, budgets, learning governance, and stop reasons
      remain unchanged
- [x] Feature 039's pre-Work answerability boundary remains distinct
- [x] Existing project guardrails are sufficient; no new candidate is needed
- [x] The technology-agnostic specification passed its quality gate before
      planning
- [x] Only the core trio applies; no ObjectiveRegistry or supporting artifact is
      needed
- [x] No unresolved clarification remains
- [x] First-definition ownership is staged for the exact prospective path

## Coordinator Log

- 2026-08-22 UTC - brainstorm captured; definition deferred to explicit `define recovery-continuation`
- 2026-08-22 UTC - brainstorm refreshed; managed clarification resolved for same-invocation recovery continuation under existing autonomous Work stop discipline, with continuity hard stops preserved, automatic fresh-Work fallback rejected, guarded Work excluded, and Feature 039's pre-Work boundary unchanged
- 2026-08-22 UTC - defined -> .dude/specs/040-recovery-continuation/spec.md
- 2026-08-22T20:33:36Z - Autonomous Ship Work started T001@74657374: add focused recovery-continuation contracts through the installed Tester.
- 2026-08-22T20:40:08Z - Autonomous Ship Work closed T001@74657374 through the host-adapter permit and receipt path. Tester added the section-bounded contract group, then resolved three independent review findings by proving every falsifier against a complete in-memory source, covering every prohibited surface, and requiring the same invocation to remain active during assistance. Evidence: focused falsifier proof 1/1, syntax and whitespace checks passed, Reviewer APPROVE; runner `ended / task-settled`, occurrence `2f6b96fc377fa5301894c901fbf72f0d85d5b4323c74ef73fe61a683c90871f0`.
- 2026-08-22T20:42:37Z - Autonomous Ship Work started T002@736b696c: refine the authoritative Work guidance through the installed Skill Smith.
- 2026-08-22T20:50:12Z - Autonomous Ship Work closed T002@736b696c through the host-adapter permit and receipt path. Skill Smith added the same-invocation settlement-as-progress bridge, next-ready selection under the original target and policy, a fresh-claim requirement, preserved stops and exclusions, and the explicit end of Ship pre-Work answerability at Work start. Evidence: focused contracts 2/2, syntax, repetition, and whitespace checks passed; Reviewer APPROVE; runner `ended / task-settled`, occurrence `1cf1ee616c58805ff86bb4d82384b1448120de5d84a13a92ac27f8e81d2a4c6d`.
- 2026-08-22T20:50:24Z - Autonomous Ship Work started T003@76657269: project and verify the accepted Work guidance through the installed Tester.
- 2026-08-22T20:55:08Z - Autonomous Ship Work closed T003@76657269 through the host-adapter permit and receipt path. Tester rebuilt the installed Work skill, proved byte-identical and idempotent projection, and completed the bounded integrated checks. Evidence: focused recovery continuation 1/1, current-format 124/124, named projection 1/1, lint 0/0, clean whitespace, and Reviewer APPROVE; runner `ended / task-settled`, occurrence `38d52adb923a8ab3816c304d8c272b36dfcbd64beca44c52786c4e5f45b04fd8`.
<!-- dude:managed:end -->
