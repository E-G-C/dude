---
title: Ship Orphan Cleanup
slug: ship-orphan-cleanup
status: draft
spec_path:
---

# Idea: Ship Orphan Cleanup

## Idea

Remove the unnecessary user echo when an explicit Ship request encounters a
proven-dead exact Work ownership-claim/checkpoint pair. Permit only bounded safe
cleanup and a new clean claim when legitimately authorized. Keep confirmation
for ambiguity, live ownership, unproven absence, unrelated effects, or genuinely
destructive effects.

The user accepted capturing this separately from browser reliability and
proceeding through Ship, with browser reliability first: "Do not over engineer
it, keep it simple. YAGNI". Never resurrect lost RunState, revive a dead
invocation, seize live ownership, or infer safety from age or a PID alone.

## Open Questions

1. What existing, independently verifiable host evidence can prove that no
   invocation or coordinator supervisor remains for the exact workspace-target
   key, and safely bind cleanup to the unchanged claim/checkpoint pair?
   Unresolved evidence boundary; no user answer recorded. Definition must inspect the existing
   integration surfaces, without inspecting actual orphan files. If reachable
   evidence cannot supply safe proof, return the missing basis rather than
   inventing proof or assuming authority. Any material product choice remains
   for the user; the current confirmed-manual-cleanup contract stays in force.

## Assumptions

Working assumptions, not additional user answers:

- Existing project guardrails cover this scope; no new candidate is needed.
- The reported incident motivates a deliberate contract change. This capture
  does not verify an actual orphan or authorize cleanup under existing rules.
- Browser acceptance reliability has independent success conditions.
  Browser-first does not create a dependency or derive order from numbering.

<!-- dude:managed:start -->
## Current Evidence And Contract Change

- The last `.dude/memory/context.md` entry reports an explicit Ship stop that
  required another human authorization after the coordinator reportedly proved
  the supervisor absent. That report supplies motivation, not an independently
  established proof mechanism for this feature.
- `.dude/ideas/018-autonomous-runstate-continuity.md:50-110` deliberately requires
  confirmed manual orphan cleanup in v1. Supervisor, context, or independently
  retained invocation-identity loss terminates the invocation.
- `.dude/ideas/039-ship-checkpoint-autonomy.md` limits Ship answerability to
  eligible pre-Work decisions after owner gates. Work outcomes remain
  authoritative and unchanged by that policy.
- `.dude/ideas/040-recovery-continuation.md` permits continuation only with the
  same surviving supervisor and invocation. It excludes orphans and automatic
  fresh invocations. Do not rewrite that completed scope or its user answers.
- `src/skills/dude-work/SKILL.md`, especially `Supervisor And Worker Continuity`
  and `Checkpoint Lifecycle And Manual Cleanup`, owns the current hard stops and
  exact-pair cleanup prerequisites. The proposed exception must be defined at
  this existing Work owner, with corresponding existing integration changes
  only where reachable behavior requires them. Global Ship pre-Work policy
  cannot override Work hard stops.

Architect source inspection (read-only) found a real unresolved evidence and
authority boundary; paths below are under `src/skills/dude-work/`:

- `SKILL.md:74-80` identifies the active coordinator as supervisor. Child exit
  is not supervisor death; true supervisor/context/identity loss is terminal.
- `host-adapter-runner.mjs:351-371,1066-1080` creates invocation identity/token
  internally. Public `stateResult` (`258-268`) exports state, revisions, and
  generation, not retained caller identity or exact pair fingerprints.
  Terminal orphan handling (`526-538`) explicitly attempts no cleanup; CLI EOF
  (`1462-1488`) reports `supervisor-context-lost`, but input closure is not
  independent proof that the coordinator died.
- `host-adapter.test.mjs:3591-3676` uses externally retained identity and
  observed child exit for handoff under the same live supervisor, not
  production deceased-supervisor proof. CLI orphan tests establish retained
  collision, not permission to clean.
- `host-adapter.mjs:2750-2761` diagnostics expose key, presence, timestamps,
  and manual guidance. Clear (`3431-3454`) checks live worker identity/revision,
  not an independent unchanged snapshot of both orphan artifacts. Admission
  (`3804-3845`) refuses occupied ownership; absence checks are not liveness
  evidence.
- No production-supported combination of terminal result, externally retained
  identity, and observed child exit establishes original supervisor loss.
  A caller "dead" boolean, age/PID inference, or test-only injected proof would
  invent the missing basis. The live adapter can finalize through
  `end('hard-stop-recorded')` (`3941-3955`), but live-owner terminal finalization
  is a different, narrower outcome, not proof for the accepted orphan goal.

No real orphan files or host processes were inspected or removed. The 018 v1
manual-orphan contract, 039 pre-Work answerability, and 040 same-invocation
continuity remain unchanged.

## Bounded Outcome

For the exact current Ship target, independently proven dead ownership may
qualify for cleanup of only the owner-derived claim/checkpoint pair under a
newly defined Work-owned authorization rule. Explicit Ship may supply that
bounded cleanup and new-claim authority only after the rule's prerequisites
pass. This authority is proposed, not already granted by the old contract.

Preserve fresh post-clean validation proving both artifacts absent before a
new exclusive claim. Partial cleanup, changed artifacts, reappearance,
operation failure, or failed absence validation continue to block replacement.
Keep target selection, exact ownership, lane, verification, review, settlement,
and other safety gates intact.

Loss of the original supervisor, context, identity, or authoritative RunState
still terminates that invocation. Any authorized replacement starts clean with
fresh authority; it never resumes the orphan or reconstructs its lost state.
The proposal does not authorize generic retries around returned Work stops.

Success means no extra user echo for the narrowly proven-safe case, while
ambiguous, live, unproven, or destructive cases retain confirmation or refusal
under their existing owners. Show the distinction in focused coverage at the
existing integration boundary; do not claim proof from a mock-only capability.

## Definition Boundary

The Architect inspection leaves the existing open question unanswered: there
is no established production proof of original supervisor loss bound to the
unchanged exact pair. This draft is not yet executable. Explicit Ship's
owner-first pre-Work gates do not authorize inventing evidence or changing the
accepted outcome.

The material user choice is to defer 056 and preserve manual confirmation for
true orphan cases, OR explicitly narrow/recapture it around surviving-coordinator
terminal finalization and new-claim authority after its own scope and safety
analysis. Neither option is selected here; bounded delegation cannot silently
substitute the narrower outcome. Keep draft status and an empty package path,
without marking the feature blocked or resolved.

YAGNI forbids inventing a liveness service, registry, leases, timers, persistent
state, or recovery platform merely to finish this package. Add no TTL, lock
service, daemon, batch cleanup, new user command, speculative cross-machine
recovery, broad automatic cleanup, or ownership takeover. Do not inspect or
delete actual orphan/checkpoint files during definition.

Existing 055 browser reliability remains independent; 056 is not a dependency
or blocker in its task graph.

## Coordinator Log

- 2026-09-04T21:22:30-04:00 - Brainstorm capture staged for `ship-orphan-cleanup` as a distinct proposed Work-owned contract amendment; safe independent proof remains unresolved. Awaiting first-capture publication and a separate explicit definition subaction; no lifecycle number or package path assigned.
- 2026-09-04T21:40:41-04:00 - Brainstorm-evidence refresh of the published 056 draft: recorded Architect source inspection and the unresolved supervisor-loss/exact-pair authority boundary. Existing question remains unanswered; defer/manual confirmation versus explicit narrower recapture remains a user choice, with no autonomous disposition. Preserved user-controlled sections, draft status, and empty spec_path; no package, tasks, or execution changes.
<!-- dude:managed:end -->
