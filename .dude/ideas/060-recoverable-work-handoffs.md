---
title: Recoverable Work Handoffs
slug: recoverable-work-handoffs
status: draft
spec_path:
---

# Idea: Recoverable Work Handoffs

## Idea

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
## Motivating Incident

The following findings were verified by the coordinator and supplied for this
capture. They were not re-executed here and are not a fresh task-status check.

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
  code. Consider preserving the concrete reason, affected subject, and bounded
  correction or missing-evidence guidance through the existing report.

## Bounded Outcome

Keep one outcome: schema-compliant handoff preflight and recoverable correction
of proven no-effect failures, without losing valid implementation or review
evidence. Use the existing correction route only when its real conditions hold
and the same supervising invocation remains valid.

Unchanged accepted state alone does not prove recoverability. Missing no-effect,
identity, or authority evidence retains the existing stop; do not downgrade all
hard stops. Preserved implementation and review evidence does not bypass
verification or authorize acceptance of a malformed completion.

Keep exact ownership, authorized file scope, independent review, verification,
and close gates intact. Changed authorization must never be silently broadened.
Do not solve the gap by increasing check limits or silently dropping/coalescing
authoritative results. Any grouping must retain every required check and actual
owner provenance.

## Related Idea And Scope Limits

[Ship Orphan Cleanup](056-ship-orphan-cleanup.md) remains a separate deferred
draft at `.dude/ideas/056-ship-orphan-cleanup.md`. It concerns safe removal of
proven-dead claim/checkpoint pairs and a fresh claim after an orphan exists; its
proof/authority question remains unresolved. This idea concerns upstream
prevention or correction of malformed handoffs while the supervising invocation
can remain valid. Do not merge, reopen, redefine, implement, or answer 056
through this capture.

Stay within the current production handoff and correction surfaces. Do not
design a new runtime, versioned state format, registry, daemon, lock, retry
framework, or recovery platform. Bounded diagnostics belong to this handoff
outcome, not a separate observability platform.

This capture authorizes no implementation, live Canvas/provider access,
orphan-file or process-state inspection, cleanup, or execution.

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

## Coordinator Log

- 2026-09-12T22:45:06.838-04:00 - First-capture brainstorm staged for `recoverable-work-handoffs` at the user's request, for recording only and deferred until after T012 / Feature057. Retained coordinator-attributed incident evidence and the separate 056 boundary; later definition questions remain unanswered. Draft status and empty spec_path; awaiting coordinator first-capture publication, with no lifecycle number or package path assigned here. No definition, implementation, execution, or cleanup performed by this capture.
<!-- dude:managed:end -->
