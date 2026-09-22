---
title: Ship Orphan Cleanup
slug: ship-orphan-cleanup
status: defined
spec_path: .dude/specs/056-ship-orphan-cleanup/spec.md
---

# Idea: Ship Orphan Cleanup

## Idea

Avoid unnecessary orphan-style confirmation when the same coordinator is still
alive, retains legitimate invocation/owner context, independently retained
invocation identity, and authoritative RunState, and can safely terminally
finalize only its own exact Work ownership-claim/checkpoint pair. True-orphan
cleanup is outside the current proposal.

A possible clean new claim for the same requested Ship goal remains subject to
later definition of legitimate Work-owned authority and fresh admission. This
is not an automatic retry, a revived hard-stopped invocation, or general
automatic goal continuation.

The user's chat reply `2` selected `brainstorm-narrower`: explore safe
finalization while the coordinator is still alive, with definition remaining a
separate step. The selection supplies brainstorm authority, not real-incident
evidence or permission to execute.

### Historical Intent (before the September 21 narrowing)

The original goal and Ship/browser-first direction below are retained as
history, not the current scope or fresh execution authority:

Remove the unnecessary user echo when an explicit Ship request encounters a
proven-dead exact Work ownership-claim/checkpoint pair. Permit only bounded safe
cleanup and a new clean claim when legitimately authorized. Keep confirmation
for ambiguity, live ownership, unproven absence, unrelated effects, or genuinely
destructive effects.

The user accepted capturing this separately from browser reliability and
proceeding through Ship, with browser reliability first: "Do not over engineer
it, keep it simple. YAGNI". Never resurrect lost RunState, revive a dead
invocation, seize live ownership, or infer safety from age or a PID alone.

### Refresh Request (2026-09-19T11:01:43.096-04:00)

> Do a reconciliation analysis between all your findings and then go ahead and update 060 and 056 accordingly.Always prefer deterministic when possible.

## Open Questions

For later explicit definition to investigate; no additional user choice is
needed to capture the selected narrowing:

1. Which reachable production path lets the same surviving coordinator retain
   and use legitimate owner context, independently retained invocation identity,
   and authoritative RunState for its own exact claim/checkpoint pair?
   Definition must establish the caller and ownership checks, not infer them
   from a test fixture or public runner state.
2. Which terminal conditions permit that owner to finalize its unchanged exact
   pair safely, without overriding user cancellation or Work hard stops?
   Definition must establish eligibility and refusal behavior; a live owner,
   terminal reason, or cleanup failure alone is insufficient.
3. What legitimate Work-owned authority, if any, would permit a clean new claim
   for the same requested Ship goal, through fresh admission after eligible
   finalization? Definition must keep the prior invocation terminal and
   preserve current limits and gates; this capture authorizes no automatic retry.

### Historical True-Orphan Question (unanswered; outside current scope)

The original question remains unanswered. The narrowing supplies no
supervisor-absence proof; the investigation instructions below belong to that
historical goal:

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
## Historical Evidence And Existing Contracts

The retained true-orphan findings below describe the original proposal and why
definition could not proceed under that goal. They supply no missing proof and
do not make true-orphan cleanup part of the selected narrowing.

- The original capture cited a then-current `.dude/memory/context.md` report of
  an explicit Ship stop requiring another human authorization after the
  coordinator reportedly proved the supervisor absent. That report supplies
  historical motivation, not an independently established proof mechanism.
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

The September 4 read-only Architect inspection found an unresolved evidence and
authority boundary. These retained source locations are historical, not a fresh
inspection; paths below are under `src/skills/dude-work/`:

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
- That inspection established no production-supported proof of original
  supervisor loss from terminal result, externally retained identity, and
  observed child exit. A caller "dead" boolean, age/PID inference, or test-only
  injected proof would invent the missing basis. The live adapter can finalize
  through `end('hard-stop-recorded')` (`3941-3955`), but live-owner terminal
  finalization is a different, narrower outcome, not proof for the accepted
  orphan goal.

The September 19 reconciliation supplies no missing production proof. Child
exit, PID, age, EOF, empty-looking state, and model assertions still cannot
establish supervisor absence. No real orphan files or host processes were
inspected or removed. The 018 v1 manual-orphan contract, 039 pre-Work
answerability, and 040 same-invocation continuity remain unchanged.

## Evidence For The Narrower Investigation

This subsection retains the source lead supplied during the completed
brainstorm. The current definition findings follow it.

The completed read-only eligibility assessment still found no
production-supported independent original-supervisor absence proof bound to
the unchanged exact pair. The user then selected the narrower brainstorm
direction in chat; that choice does not resolve the historical proof question.

The coordinator supplied a concrete surviving-owner surface:
`src/skills/dude-work/host-adapter.mjs:4333-4347,4430-4548` permits a retained
adapter handle to finalize through `end('hard-stop-recorded')` and preserves the
original invocation identity for handoff. Later definition must establish the
reachable production owner context and eligible conditions. This surface alone
grants no fresh-claim authority; synthetic supervisor ports and retained-owner
tests do not prove supervisor death. These are supplied findings, not a new
source inspection or test run during this refresh.

## Definition Findings

The separate explicit `define ship-orphan-cleanup` request authorizes this first
definition. The following are source-backed technical dispositions, not new
user-supplied answers.

1. **Reachable owner context.** The production `runHostAdapter` call in
   `src\skills\dude-work\host-adapter-runner.mjs` constructs `supervisorSession`,
   admits its adapter, and retains both in the same unreturned call.
   `supervisorSession` keeps invocation identity and worker identity outside
   checkpoint bytes. The adapter retains accepted RunState and the checkpoint
   host. This is usable before that call returns, not from a later public
   `stateResult`, a dead runner, or a replacement coordinator.
2. **Eligible terminal condition.** Define automatic finalization only for an
   invalid or stale Assessment payload returned in the correctly bound response
   to the first Assessment challenge for that claim, before any attempt
   authorization or effect-producing operation under it. `requestAssessment`
   currently sends those rejections to `orphan`, which leaves the pair behind.
   The new path must freshly establish original supervisor/worker authority,
   unchanged accepted state and owner/lane binding, a settled checkpoint, and
   both exact artifact versions. It must retain the terminal result before
   invoking the existing end boundary. Other rejection sites and terminal
   conditions do not gain this behavior.
3. **Clean new claim.** This definition grants no automatic new invocation or
   replacement claim for the stopped Ship goal. Successful finalization ends
   only ownership of the old pair. A later separate, explicit Work or Ship
   execution request uses existing admission, evidence, policy, and absence
   checks. The original invocation stays terminal; its returned state or
   retained handle is not restart authority.

The current store clear checks worker identity and host revision but does not
compare the complete claim and checkpoint against both retained versions.
Exact-pair comparison is therefore a proposed implementation requirement, not
a claimed existing guarantee. The current Work owner already permits clearing
an irreducible hard stop after its required result or audit is safely recorded;
this package defines the narrow production routing and checks for that
resource-finalization boundary.

No real claim/checkpoint pair, process, live provider, or historical incident
was inspected. Focused test source supplies regression structure only.

## Defined Outcome

The package defines terminal release of one unchanged ownership pair by its
original surviving owner, without an extra orphan-cleanup confirmation, at the
bounded first-Assessment rejection described above.

Successful release preserves the Work hard stop, its reason, accepted RunState,
accounting, and task state. It does not correct the Assessment, request another
response, dispatch work, close a task, or continue the Ship goal. A failed or
partial release reports unresolved cleanup and grants no replacement authority.

The implementation uses the existing Work owner, runner, adapter end boundary,
and temporary checkpoint store. Both artifacts must match retained
owner-established identities immediately before removal; both must be freshly
absent before cleanup is reported successful. Detected drift, partial artifacts,
reappearance, or an operation failure stops further cleanup.

The full requirements, chosen integration, and three open task units are in:

- `.dude/specs/056-ship-orphan-cleanup/spec.md`
- `.dude/specs/056-ship-orphan-cleanup/plan.md`
- `.dude/specs/056-ship-orphan-cleanup/tasks.md`

## Relationship To Handoff Prevention

[060 recoverable handoffs](060-recoverable-work-handoffs.md) records the detailed
September 19 reconciliation. It addresses complete, ordered, validated Work
handoffs upstream, including a fresh authorized run's missing historical-evidence
handoff and lost diagnostics. That prevention remains separate from 056's
terminal release by the original retained owner. Neither handoff errors nor zero
attempted work alone establish finalization or new-claim authority.

040 and Work `Iterate` retain next-ready selection within the same surviving
autonomous invocation after successful task settlement. This package does not
extend that invocation through a hard stop. The later browser repair did not
restart Ship. Neither 056 nor 060 changes learning policy or supplies automatic
semantic redefinition to keep going.

Existing 055 browser reliability remains independent. These relationships create
no dependency, priority, or execution order from lifecycle numbers.

## Definition Boundary

The original refusal remains applicable to true-orphan cleanup. Its historical
question stays unanswered and outside this package. The earlier refresh's
no-package boundary applied to that brainstorm; the subsequent explicit define
request supplies the distinct definition authority used here.

This definition uses the existing numbered owner and the exact spec path above.
Publication uses the existing atomic first-definition transaction. The
coordinator reports readiness only after independent review and successful
publication with zero-failure lint. Definition alone does not establish
implementation, cleanup, execution, or readiness.

No UI or design-approval stage applies. Existing project guardrails suffice, and
no new guardrail is proposed.

YAGNI excludes a liveness service, lease or TTL, lock service, daemon, database,
duplicate evidence store, scheduler, batch cleanup, new command or workflow,
cross-machine recovery, ownership takeover, and broad hard-stop retry. Lost
supervisor/context/identity/RunState, stale or foreign artifacts, uncertain
effects, and true orphans keep their existing stops and manual boundaries.
Cancellation, verification, independent review, settlement, closure, history,
and Work limits retain their existing authority.

## Coordinator Log

- 2026-09-04T21:22:30-04:00 - Brainstorm capture staged for `ship-orphan-cleanup` as a distinct proposed Work-owned contract amendment; safe independent proof remains unresolved. Awaiting first-capture publication and a separate explicit definition subaction; no lifecycle number or package path assigned.
- 2026-09-04T21:40:41-04:00 - Brainstorm-evidence refresh of the published 056 draft: recorded Architect source inspection and the unresolved supervisor-loss/exact-pair authority boundary. Existing question remains unanswered; defer/manual confirmation versus explicit narrower recapture remains a user choice, with no autonomous disposition. Preserved user-controlled sections, draft status, and empty spec_path; no package, tasks, or execution changes.
- 2026-09-19T15:03:42Z - Brainstorm refresh (coordinator-supplied timestamp): retained the proven-dead exact-pair goal and unresolved supervisor-absence proof; separated deterministic cleanup checks from evidence/authority and 060's upstream handoffs. Draft and empty spec_path preserved; no cleanup, new invocation, or package.
- 2026-09-21T15:28:43Z - Brainstorm refresh (coordinator-supplied timestamp): recognized the user's literal chat reply `2` as `brainstorm-narrower` and recaptured 056 around safe terminal finalization by the same surviving coordinator holding legitimate invocation/owner context for its own exact claim/checkpoint pair. Retained the original true-orphan intent/evidence and unanswered proof question as history; true-orphan cleanup is outside current scope. Possible fresh-claim authority remains for separate definition and fresh admission. Preserved draft status, empty spec_path, identity, assumptions, and prior log entries; no package, cleanup, Work, Ship, or automatic retry authorized.
- 2026-09-21T16:26:32Z - First definition staged under explicit `define ship-orphan-cleanup` for `.dude/specs/056-ship-orphan-cleanup/spec.md`: defined bounded original-owner finalization after a correctly bound first-Assessment payload rejection before authorization, with exact-pair checks and the Work hard stop preserved. Granted no automatic fresh claim or retry. Preserved complete user-controlled sections and prior history; staged the core trio and three new open task units for atomic publication. No cleanup, Work, implementation, lint execution, or readiness verdict.
- 2026-09-21T18:20:40Z - Started explicit guarded Work with an overall limit of three tasks and recovery disabled. Beads reported no initialized database; exact-owner resolution and the task-bound adapter Inspection found T001@6f3a2c18 ready with no evidence blockers. Claimed T001@6f3a2c18 in progress through the Lightweight board helper and regenerated its derived board. Implementation authorization and specialist dispatch remain next; no task is complete.
- 2026-09-21T18:57:48Z - Guarded Work stopped on verification failed on T001@6f3a2c18. Retained the Coder's changes to `src/skills/dude-work/host-adapter.mjs` and `src/skills/dude-work/host-adapter.test.mjs`. The independent Tester ran the required focused adapter selection: 83 passed, 1 failed, 0 skipped, exit 1; all 63 new `056 owner finalization` regressions passed. The existing temporary-backend fixture could not create a Windows file symlink (`EPERM`, test line 4097), so its symlink-rejection check remains unverified. The same-supervisor adapter recorded `verification-failed`, performed the post-failure Inspection, consumed the one pending attempt without refund, and ended through its normal controlled-end boundary. Marked T001 blocked with `test-failure` and regenerated its board; no task closed, no independent code review ran, and T002/T003 remain unstarted. Recovery was disabled and no retry was made. Next: restore a symlink-capable verification environment, then explicitly request Work to resume verification and review.
- 2026-09-21T19:20:48Z - Explicit guarded Work with `--recover-on-block` authorized one verification-only `address-test` recovery for T001@6f3a2c18, with no repository writer paths. The independent Tester reran the same required selection once: 83 passed, 1 failed, 0 skipped, exit 1; Windows again rejected the existing file-symlink fixture setup with `EPERM` at test line 4097. Required lint passed with zero failures and two existing unrelated warnings. The adapter recorded `verification-failed`, retained both verifier results, performed the post-failure Inspection, consumed the single recovery cycle without refund, and ended through its normal controlled-end boundary. Implementation and task states are unchanged: T001 remains blocked, T002/T003 remain unstarted, and no task closed. No tests were weakened or skipped, no machine permissions were changed, and no usable alternative verification host was established. Next: restore file-symlink capability for the Windows test process before another Work request.
- 2026-09-21T20:21:10Z - Fresh explicit guarded Work with recovery followed the user's Developer Mode change. The independent Tester completed the focused selection with 84 passed, 0 failed, 0 skipped, exit 0; both previously EPERM-blocked symlink cases also passed in the full suite. The full adapter suite then produced no output for more than 480 seconds and was stopped without a final exit code or runner summary; 205 pass markers, zero failure markers, and one skip marker were observed before the stall, not a completed-suite result. Its last completed case was descriptor-only post-apply overflow; the next source-ordered case was the forked-runner known-growth test at line 11405, with nontermination cause unconfirmed. Independent Code Reviewer reported a blocking T001 defect at `src/skills/dude-work/host-adapter.mjs:4774-4780`: resume adopts freshly loaded claim/checkpoint versions without comparing the handoff-retained versions. Required follow-up is to bind both hashes through the transient handoff receipt and reject valid rehashed drift between handoff and resume before writes or removal, with separate regressions. Lint passed with zero failures and two existing unrelated warnings. The adapter recorded verification failure and ended normally after the one recovery cycle; complete verification and review evidence was retained. Replaced the obsolete EPERM blocker with the full-suite and code-review blockers and rendered the board. Implementation is unchanged, T001 remains incomplete, T002/T003 remain unstarted, and no task closed. Next: a fresh authorized repair must validate/address the review finding and diagnose the suite stall before verification and independent re-review.
- 2026-09-21T21:20:06Z - Started explicit guarded Work with `--max 5 --recover-on-block --recovery-cycles 2`. Fresh exact-owner and task-bound Inspection checks admitted the retained review and verification evidence without capacity or source blockers. Claimed T001@6f3a2c18 in progress for review repair and removed its blocking metadata while the defects are actively investigated; the findings are not resolved or approved. The planned implementation scope remains `src/skills/dude-work/host-adapter.mjs` and its test file, covering handoff/resume version binding and diagnosis of the recorded full-suite stall. Rendered the task board; T002/T003 remain unstarted.
- 2026-09-21T22:41:20Z - Closed T001@6f3a2c18 after the authorized review repair. The transient handoff receipt now retains both artifact hashes and resume refuses drift before effects or commit; separate valid-rehash regressions failed before the fix and pass afterward. The test harness yields through `setImmediate` between cases to drain reporting, with a deterministic scheduling regression; this establishes the reproduced mechanism without attributing the older untraced interruption. Independent Tester completed the full host-adapter suite once: exit 0, 278 tests, 277 passed, zero failed, one existing Windows symlinked-root skip, zero cancelled/todo, 542611.7218 ms. Independent Code Reviewer resolved the original blocker with no new findings, and Reviewer approved T001 only. Exact source revisions and ownership were rechecked; the adapter accepted the successful address-review result and ended normally. Set T001 done and rendered the board. One of five overall attempts and one of two T001 recovery cycles were used; T002/T003 remain unstarted and feature completion is not claimed.
- 2026-09-21T22:44:00Z - Continued the same guarded Work invocation to T002@4b7d9e02 after T001 closed. Fresh task-bound Inspection confirmed the completed dependency and no evidence blockers. Claimed T002 in progress and rendered its board; the accepted overall/recovery accounting is preserved. Planned scope is the source runner, source adapter, and their shared test file for the narrow first-Assessment finalization behavior. T003 remains unstarted.
- 2026-09-22T00:01:47Z - Closed T002@4b7d9e02 after implementation and one bounded test-repair recovery. The runner now finalizes only the eligible original-owner first-Assessment payload rejection, retaining the hard stop and reporting cleanup separately without retry or a new claim; independent Code Reviewer found no supported blockers. The first combined adapter/recovery verification completed with 750 passed, one failed, and three skipped: an existing composition test compared native Windows relative paths with canonical slash-separated names. A separately authorized `address-test` attempt changed only `src/skills/dude-work/recovery.test.mjs` to normalize snapshot-key separators, preserving the exact four-file assertion and all later receipt/settlement/replay/permission checks; no product or definition behavior changed. A different independent Tester then completed both full suites once with exit 0: 754 tests, 751 passed, zero failed, three expected skips, zero cancelled/todo, 576805.7087 ms. Fresh lint had zero failures and two existing unrelated warnings; Reviewer approved T002 only. Exact owner and all four verified source revisions were rechecked, the adapter accepted the repair result and ended normally, and T002 was set done with its board rendered. Three of five attempts are used, with one recovery cycle each for T001 and T002. T003 remains pending.
- 2026-09-22T00:09:49Z - Selected and claimed T003@c581e6af in the same guarded Work invocation after T002 closed. Fresh task-bound Inspection confirmed the dependency and no evidence blockers; rendered the in-progress board. The existing build output enumerator previewed 83 core outputs, with only the two implemented Work runtime projections currently different and no removal without replacement. Planned writers are the authoritative Work skill, command documentation, current-format contract tests, and the three corresponding generated Work files; source policy prose and test/build work will be routed separately. No new workflow, command, permission, or execution continuation is introduced.
- 2026-09-22T01:21:47Z - Closed T003@c581e6af and the accepted narrowed Feature056 after final independent Reviewer approval. Work guidance and command documentation now match the implemented original-owner first-Assessment finalization boundary, with section-bounded contract checks and ten deletion falsifiers; all 83 generated core outputs were freshly verified byte-identical to their authoritative sources. Independent T003 verification completed with four focused contract checks passed and full runtime suites at exit 0: 754 total, 751 passed, zero failed, three expected skips. The broad contract/build command remains exit 1 with 176 total, 172 passed, three failed, and one skipped. Independent comparison proved the three failure conditions unchanged from HEAD: the literal regression-owner signal, catalog Tester heading mismatch, and existing historical audit-carrier path; no baseline suite was executed and audit contents were not inspected. Final Reviewer explicitly accepted these as nonblocking baseline qualifications for this feature, not repository-wide approval. Runtime settlement retained the complete qualified evidence, accepted T003 completion, and ended normally. The one eligible Rubber Duck retrospective returned no issues; its advisory entry was recorded without new work or learning writes. Set T003 done and rendered the board. All three canonical tasks are closed; four of five attempts were used, including one recovery each for T001 and T002. Work stops at no ready task. No commit, push, release, true-orphan cleanup, or automatic fresh invocation was performed.
<!-- dude:managed:end -->
