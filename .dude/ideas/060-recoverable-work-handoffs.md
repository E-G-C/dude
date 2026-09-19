---
title: Recoverable Work Handoffs
slug: recoverable-work-handoffs
status: defined
spec_path: .dude/specs/060-recoverable-work-handoffs/spec.md
---

# Idea: Recoverable Work Handoffs

## Idea

### Original Intake (2026-09-12)

Latest user request, verbatim:

> Go ahead and brainstorm /  doa work intake for that gap just to record it. and then we continue the work in T zero twelve and later we tackle that brainstomed gap

The question that prompted the diagnosis, verbatim:

> why didn't  you try yourslef? is something missing in Dude preventing the continuation?

Record the gap now, finish T012 / Feature057 first, and tackle this gap later.
This is the user's requested sequence, not a task dependency inferred from
numbers. This request is for recording only, with implementation deferred.

Ordinary coordinator handoff mistakes should be detected before submission or
safely correctable when the rejected handoff applied nothing, instead of forcing
the user into an avoidable continuation or cleanup loop. This does not authorize
weakening ownership, file-scope, verification, or close gates.

### Refresh Request (2026-09-19T11:01:43.096-04:00)

> Do a reconciliation analysis between all your findings and then go ahead and update 060 and 056 accordingly.Always prefer deterministic when possible.

## Open Questions

Questions for later definition, not requests for answers now. No question blocks
this single-outcome, record-only capture; no answers are recorded here.

1. Where can the current handoff schema be preflighted before submission?
2. How is file-scope completeness established in the authorized material inputs
   before writers work?
3. When must changed scope receive explicit reauthorization?
4. What exact no-effect, identity, and authority evidence admits correction under
   the existing route while the same supervising invocation remains valid?

## Assumptions

Working assumptions, not additional user answers:

- Existing project guardrails cover this scope; no new candidate is needed.
- The coordinator's retained evidence supports recording the gap. It does not
  authorize a live correction, cleanup, continuation, or task close.

<!-- dude:managed:start -->
## Definition Summary

Explicit `define recoverable-work-handoffs` stages the lean core trio at
`.dude/specs/060-recoverable-work-handoffs/`, with this exact numbered ledger as
its prospective owner. Publication and coordinator lint remain separate gates.
The capture and refresh records below retain their historical scope; they do
not describe a new execution or supply live authority.

The derived definition keeps one outcome: complete, correctly ordered and
validated Work handoffs. It reuses receiver validators, existing permit-based
initial claim, and the bounded correction route. The plan specifies
host-supplied original historical captures with an early missing-source
refusal, preserves validated blocker diagnostics, and leaves semantic learning
policy and orphan authority unchanged. Technical dispositions are derived from
current source evidence; no user-controlled question answer or assumption is
changed. Existing project guardrails suffice.

## Historical Motivating Incident

The coordinator supplied these findings for the September 12 capture. Task
state, verification results, and source locations below describe that incident,
not current task status or fresh execution during this refresh.

- `T012@a57c1212` in Feature057 was implemented and accepted by a sole Tester and
  an independent finalReviewer. The coordinator's final suite passed 292/292,
  with 0 failures and 0 skips. Seven other canonical tasks were done; T012
  remained `[~]` because the coordinator never closed it.
- The coordinator prepared an invalid completion handoff. The actual Tester's
  structured result had 18 check rows;
  `src/skills/dude-work/specialist-attestation.mjs:20,352-354` allows at most 16.
  The coordinator also omitted `src/extensions/dude/review.test.mjs` from the
  attempt's authorized `materialInputs.targets`, although the Tester legitimately
  changed that file within T012 scope. Both were coordinator mistakes. The file
  omission is a separate detected binding mismatch, not evidence that it was the
  first throw.
- `src/skills/dude-work/host-adapter.mjs:1434-1438` catches any
  `specialistAttestation` validation failure and immediately returns
  `hardStop('attempt-result-contract-mismatch')`. That branch never reaches the
  low-level completion invocation.
- The coordinator's authoritative before/after comparison found
  `acceptedStateBase64` and its hash identical; `acceptedRevision` stayed 1 -> 1,
  `overallUsed` 1 -> 1, `pending` 1 -> 1, and `completed` 0 -> 0. The exact owner
  idea, spec, plan, and tasks preimage bytes were unchanged. The runner exited 1.
  This establishes no accepted execution-state or task/definition mutation from
  the rejected completion. It does not mean implementation files had not changed
  earlier.
- The adapter already lists `record-attempt-result` among correctable operations,
  with `malformed-request` / `tool-contract` incident classes, but this catch
  bypasses that route. Its actual no-effect, identity, and authority conditions
  still have to be proven for any proposed correction.
- The terminal halt report left reason/subject unresolved despite the raw reason
  code.

## Reconciled Handoff Evidence

The coordinator supplied the following retained-record and source observations
for the September 19 refresh; they were not re-executed here. Source paths in
this section are under `src/skills/dude-work/`.

- September 16, Feature062 T002: the coordinator passed a pending task to a
  runner requiring in-progress state, received
  `runner-refused/lane-prestate-mismatch`, and asked to repair Work. Its later
  answer admitted, "Yes. I asked unnecessarily." Existing permit-based
  `initial-claim` already supplied the missing step. This is caller sequencing
  and preflight, not an established need for a new runtime capability.
- September 19 04:52Z, Feature062 T004: `result-37` accepted
  `verification-failed` while the session remained active with governance phase
  `alternative-authorized`. The `result-39` audit reported
  `projectionDisposition=rederive-required`; `advance-governance` with
  `action: resume-learning` returned `governance-unresolved` in `result-40`,
  preserving accepted state. The halt reason and subject were unresolved.
  The packet was 131020 bytes with `overflow=false`, so this was not a capacity
  overflow. The exact code-level cause of the rederivation refusal was not
  isolated. Scope here is handoff diagnosis, validation, and useful diagnostics,
  not a declaration that this was a malformed, no-effect, safely retryable
  handoff. Any semantic governance-policy change remains separate and unsettled.
- September 19 14:20-14:24Z, a fresh Ship for the same T004: canonical task
  history retained 21 events, but the runner supplied zero current-run records
  and zero matching verification/review captures. Authorization appropriately
  returned `evidence-incomplete` before an attempt (`overallUsed=0`,
  `pending=[]`); the halt report lost the subject.
  - `runHostAdapter` in `host-adapter-runner.mjs:426-428,621-639` initializes
    `currentRun=[]` and empty verification/review/lint `observedStreams`;
    `rawInput`/`runtimeInput` carry empty evidence streams until current-run
    captures arrive.
    The initial request's closed optional fields are `assessment` and
    `specialistResult`, not a retained-evidence seed. No existing loader or seed
    API was established.
  - `dualRetainedOccurrenceEventsV2` in `recovery.mjs:8487-8524` requires exact
    matching current-run and lane retained events.
    `authorizeInspectedAttempt` at `9671-9685` refuses missing or conflicting
    retention with blocker subject `occurrence-retention`.
  - `handleAuthorization` in `host-adapter.mjs:1169-1172` preserves
    `fields.capacity` on `hardStop` but drops `fields.blocker`, losing the known
    subject. This diagnostic loss and the missing historical-evidence handoff
    are mechanical integration gaps; another browser change or acknowledgment
    cannot supply the missing inputs.
  - The runner already inspects before creating ownership. The failing
    dual-retention authorization check occurs later, after the claim; zero
    attempts does not prove a no-effect rejection.

## Bounded Outcome

Keep one outcome: complete, correctly ordered and validated Work handoffs, with
early prerequisite checking and safe correction of proven no-effect rejected
handoffs while existing authority survives. Reuse the current validators,
adapter, correction route, and state transitions.

- Mechanical checks should enforce known schemas, exact identities/hashes,
  authorized file completeness, resource accounting, and permitted operation
  ordering, including the existing permit-based initial claim when required.
  Move known prerequisite checks before ownership acquisition where possible,
  retaining fresh checks at the operation boundary. Preflight the exact
  receiver payload and preserve structured reason, subject, and next-owner
  guidance through the existing report.
- Correction mechanics remain conditional on proven no effect, exact identity,
  and surviving authority in the same supervising invocation. Unchanged
  accepted-state or owner/package bytes alone do not establish those conditions.
  Missing proof retains the existing stop; no blanket failure allowlist or
  generic retry engine may turn every hard stop into a recoverable handoff.
- Model reasoning diagnoses unfamiliar causes and proposes semantic repairs;
  owners and reviewers judge intent, repair suitability, and acceptance
  equivalence. Readiness judgments, UI approval, changed intent, destructive
  permission, cancellation, and ambiguous live ownership keep their existing
  gates. Deterministic checks never infer permission from a confidence score.

For an independently authorized fresh invocation, supply required historical
evidence only from real, available authoritative captures, validated against
exact target/attempt identities, hashes, and provenance. The derived plan uses
actual host-retained raw inputs from the existing runtime capture boundary;
availability remains conditional. If none can supply the required captures,
retain a concrete missing-source refusal; do not guess files, reconstruct proof
from summaries, or trust model-synthesized evidence. This handoff does not
resurrect old RunState, ownership, counters, or permits.
Preserve the selected goal and policy context subject to fresh ownership, lane,
and evidence checks; old acceptance is never fresh completion.

Keep full historical bytes, exact limits, and all file-scope, verification,
independent review, settlement, and close boundaries. Do not delete history,
alter counters, silently broaden authorization, inflate limits, or truncate
results. Any grouping must preserve every required check and actual owner
provenance.

## Related Idea And Scope Limits

[Ship Orphan Cleanup](056-ship-orphan-cleanup.md) remains the separate downstream
outcome: bounded cleanup of an independently proven-dead exact owner-derived
claim/checkpoint pair, then a legitimately authorized new claim. Its production
proof of supervisor absence remains unresolved. This idea should prevent
avoidable halt -> orphan -> cleanup-confirmation cycles upstream; it supplies
neither orphan proof nor cleanup authority. The relationship creates no
dependency, priority, or execution order from lifecycle numbers.

Existing [040 recovery continuation](040-recovery-continuation.md) and Work
`Iterate` already require next-ready selection within the same surviving
autonomous invocation after verification, review, settlement, and closure.
Failure to follow those rules is not a new continuation capability. The
September 19 "go ahead" / "keep going" exchange followed a bounded browser-test
correction whose completion explicitly said Ship was not restarted; the
original invocation had ended. General automatic post-hard-stop goal
continuation, including cases with no orphan, is not authorized here or by the
separate 056 idea.

That browser correction addressed 360 pixels of delivered wheel input producing
356.5-357.5 pixels of movement through fractional rounding. The accepted repair
kept delivered-input and behavioral checks without demanding identical document
displacement. Diagnosis, repair selection, and acceptance equivalence were
semantic owner/reviewer work. Existing response guidance must distinguish a
repair actually underway from a specific approval requested; "Next: a bounded
repair" alone left the user asking which it meant.

Feature065's unreachable sealed continuation required explicit definition;
ordinary `recordAttemptResult` rejects `reconcile-derived-definition` with
`definition-reconciliation-attestation-unsupported`
(`src/skills/dude-work/host-adapter.mjs:1455-1460`). Neither draft implements
automatic semantic redefinition or changes learning policy to keep going.
This definition preserves that boundary.
061, 064, and 065 retain their separate capacity/accounting/compaction history;
do not reopen them or conflate the empty-evidence refusal with earlier overflow.

Stay on reachable production handoff surfaces. Add no new runtime, versioned
state format, duplicate evidence store, database, registry, daemon, lease/TTL,
scheduler, workflow, command, or observability/recovery platform. The September
19 brainstorm refresh authorized no definition package, implementation, live
Canvas/provider access, orphan/process inspection, cleanup, or execution.
This explicit first-definition stage adds only the prospective owner transition
and core trio, not authority for those execution actions.

## Deferred Technical Questions

The capture's questions are retained verbatim below. Their technical
dispositions now live in the derived plan; no user answers were added.

1. Which supported source can supply complete historical captures to a fresh
   authorized invocation with the required target, attempt, hash, and provenance
   bindings? The runner's initial request has no retained-evidence seed today.
2. What caused T004's `rederive-required` / `governance-unresolved` refusal, and
   which handoff validation or diagnostics can improve without changing
   semantic governance policy?

The plan supplies an optional `retainedEvidence` entry from actual host-retained
raw inputs at the existing runtime capture boundary. It does not assume an
archive or loader exists, recover missing data, or accept a reconstructed
capture. Where the host lacks complete captures, admission retains a concrete
missing-source refusal before ownership where knowable. The particular T004
governance cause remains unisolated; definition covers receiver validation and
truthful diagnostic propagation without a semantic policy change.

## Evidence Bookmarks

Coordinator-retained evidence outside the repository, supplied as research
bookmarks only, not live authority. These files were not opened for this
brainstorm.

Base directory:
`/Users/eg/.copilot/session-state/5c18f926-9e5b-4303-b236-cb926acfde82/files/ship-t012-4307237a5d6132e9/`

- `response-01.json`
- `response-02.json`
- `challenge-02.json`
- `response-after-completion.json`
- `coordinator-final-verification.tap`
- `tester/final-verification-result.json`
- `final-review-result.json`

September 19 T004 governance records, read by the coordinator:
`/Users/eg/.copilot/session-state/6548ab4a-a610-4b77-bce6-4f630599ef4c/files/062-post-compaction-ship-WHH7K2/t004/`

- `result-37.json`, `result-39.json`, `result-40.json`, `hard-stop-report.json`

T002 and fresh-T004 main-session observations:
`/Users/eg/.copilot/session-state/6548ab4a-a610-4b77-bce6-4f630599ef4c/events.jsonl`,
root coordinator messages `2026-09-16T19:06:36.926Z` and
`2026-09-19T14:24:24.048Z`, recorded diagnostic `2026-09-19T14:22:56.782Z`.
Only the coordinator-supplied observations were used; this refresh did not read
that log.

## Coordinator Log

- 2026-09-12T22:45:06.838-04:00 - First-capture brainstorm staged for `recoverable-work-handoffs` at the user's request, for recording only and deferred until after T012 / Feature057. Retained coordinator-attributed incident evidence and the separate 056 boundary; later definition questions remain unanswered. Draft status and empty spec_path; awaiting coordinator first-capture publication, with no lifecycle number or package path assigned here. No definition, implementation, execution, or cleanup performed by this capture.
- 2026-09-19T15:03:42Z - Brainstorm refresh (coordinator-supplied timestamp): reconciled handoff ordering, preflight, fresh-run evidence, bounded no-effect correction, and diagnostic gaps with deterministic-first guidance. Governance/evidence-source questions and the separate 056 boundary remain unresolved. Draft and empty spec_path preserved; record-only, no package or execution.
- 2026-09-19T15:27:41.800Z - First-definition staging (coordinator-supplied observedAt context): staged spec.md, plan.md, tasks.md, and the prospective defined-owner transition to exact spec_path `.dude/specs/060-recoverable-work-handoffs/spec.md`. Reused lifecycle number 060 and the selected numbered idea path. Preserved user-controlled intent, questions, assumptions, and prior log; derived bounded historical-input, preflight, correction, and reporting contracts with existing guardrails unchanged. Awaiting coordinator review, fresh selection check, atomic publication, and lint; no implementation, execution, cleanup, or closure performed.
<!-- dude:managed:end -->
- 2026-09-19T15:53:07Z - Work initial claim: T001@d060a101 for explicit Ship recoverable-work-handoffs after reviewed atomic definition publication. Existing permit-based claim only; implementation awaits separate fresh attempt authorization. Preserve unrelated 056/062 state and all prior history.
- 2026-09-19T16:58:16Z - Work close: T001@d060a101 completed through the original adapter's accepted completion, exact lane receipt, audit, and task-settled end. Sole independent Tester passed 14 focused cases with no skips and Code Reviewer approved the six-path slice; close lint had zero failures. The concurrent concision-only instruction edit remains unattributed and preserved outside this work. T002-T004 remain.
- 2026-09-19T16:58:16Z - Work initial claim: T002@d060b202 selected next in the same continuous autonomous Ship after T001 settlement. Existing permit-based claim and unchanged overall budget; full-result preflight and same-authority no-effect correction remain subject to a separate fresh attempt authorization.
- 2026-09-19T19:39:00Z - Work close: T002@d060b202 completed through accepted review remediation, exact lane receipt, audit, and task-settled end. The first rejection and resumed-supervisor finding remain in canonical history; the narrow revision reproduced six failures and preserved two compatibility controls, then sole independent verification passed 41 focused cases and Code Reviewer approved. Close lint had zero failures. T003/T004 remain.
- 2026-09-19T19:39:00Z - Work initial claim: T003@d060c303 selected next in the same autonomous Ship with the prior attempt and recovery budgets preserved. Scope is validated current refusal reporting without governance-policy or authority changes; implementation awaits its fresh attempt authorization.
- 2026-09-19T20:30:22Z - Work close: T003@d060c303 completed through accepted verification/review, exact lane receipt, audit, and task-settled end. Independent reporting and compatibility selection passed 19 cases with no skips; Code Reviewer approved current blocker propagation and the explicitly synthetic governance limits. Close lint had zero failures. T004 remains.
- 2026-09-19T20:30:22Z - Work initial claim: T004@d060d404 selected as the final ready task in this same Ship. Scope is four generated Work mirrors via disposable projection, integrated checks, and preservation of unrelated dirty work; final verification and independent readiness remain required.
- 2026-09-19T22:28:41Z - Work close: T004@d060d404 completed after accepted address-test recovery, full independent source verification (744 passed, zero failures or skips), exact generated Work parity, preservation, lint, and final independent scoped approval. The unchanged staged aggregate remains 174 passed and two pre-060 coding-profile failures; their 21 causal inputs remain unchanged and full CI green is not claimed. Prior failed attempts and findings remain retained.
- 2026-09-19T22:28:41Z - Ship completion: recoverable-work-handoffs has all four canonical tasks completed. Existing handoff, correction, reporting, evidence and authority limits are preserved. One optional advisory retrospective dispatch completed after final review and before close, with no issues reported. No Git delivery, 056 cleanup, or 062 restart is claimed.
