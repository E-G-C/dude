# Feature Specification: Recoverable Work Handoffs

## Purpose

Work should receive complete, correctly ordered handoffs. Detect known contract
and prerequisite mistakes before they create ownership or reach an effectful
operation. A rejected handoff may be corrected through the existing route only
when the rejection applied nothing and the exact original authority still
survives.

The motivating cases are a completion containing 18 checks where 16 are
allowed, an omitted legitimately changed file, a pending task sent to an
in-progress-only receiver, and a fresh invocation missing historical evidence
required by retained task history. These are one handoff outcome, not a new
recovery workflow. A separate governance refusal has an unisolated cause; it
supports better validation and reporting, not a change to learning policy.

## User Scenarios And Testing

### US1 - Submit a complete handoff in the permitted order (P1)

As the coordinator, I want known prerequisites and the actual receiver contract
checked before submission so that my own packaging or sequencing error does
not unnecessarily halt Work.

Independent test: exercise a pending task, an oversized result, and an omitted
changed file through the supported caller and receiver boundaries.

1. Given an eligible pending Lightweight task, when Work prepares execution,
   then its existing permit-bound initial claim precedes entry into the
   in-progress-only runner. Bypassing that claim still refuses.
2. Given a completion with 18 check rows, when it is preflighted, then it is
   rejected without truncation, silent grouping, completion, or lane mutation.
   A valid 16-row result remains admissible when every other gate passes.
3. Given a legitimate intended test-file edit, when the attempt is prepared,
   then the authorized file scope includes that file before the writer acts.
   If a submitted result names an unauthorized changed file, completion refuses;
   the caller cannot repair it by hiding the file or widening old authority.

### US2 - Supply real historical evidence to a fresh invocation (P1)

As the coordinator starting independently authorized Work, I want existing
historical captures checked against current task history before ownership is
acquired, so missing evidence produces a useful refusal rather than another
avoidable claim.

Independent test: retain genuine captures from a completed evidence-producing
exchange in a fixture, then start a separately authorized invocation with those
captures, with missing captures, and with altered captures.

1. Given complete host-retained historical captures, when a fresh invocation
   inspects them, then it verifies the exact target, attempts, provenance,
   hashes, and retained occurrences before using them as history. They supply
   no prior invocation authority or fresh completion.
2. Given 21 retained task events but no matching current-run, verification, or
   independent-review captures, when fresh admission is preflighted, then it
   refuses for missing evidence before creating ownership where those missing
   inputs are already knowable. It identifies the missing source.
3. Given no supported complete source, when admission is attempted, then it
   refuses rather than reconstructing proof from summaries or task history.
   Given conflicting, wrong-target, or incomplete captures, it also refuses.

### US3 - Correct only a proven no-effect rejection (P1)

As the supervising coordinator, I want an eligible handoff correction to stay
inside my surviving invocation without weakening genuine stop conditions.

Independent test: compare a local contract rejection with an effectful failure,
an indeterminate effect, and a lost or changed authority binding.

1. Given an exact active owner and supervisor and a rejection proven to have
   applied nothing, when the caller provides a valid correction under the
   existing incident identity, then the same invocation continues without an
   extra attempt charge. It still verifies, reviews, settles, and closes through
   the existing gates.
2. Given a consumed or unsuccessful correction, when another submission is
   considered, then fresh inspection and reclassification are required; host
   revision changes do not mint another correction.
3. Given an unknown effect, lost supervisor, stale identity, changed scope, or
   unresolved semantic failure, when correction is considered, then the
   existing refusal or stop remains. Equal accepted-state bytes or zero charged
   attempts alone do not qualify.

### US4 - Receive a useful, truthful refusal (P2)

As a coordinator or maintainer, I want the supported reason, affected subject,
and next responsible action preserved so I can distinguish a caller error from
missing evidence, learning policy, or a genuine hard stop.

Independent test: drive actual refusals through the adapter and terminal
report, including a known occurrence-retention blocker and a governance refusal
without an established underlying cause.

1. Given an evidence refusal with a known occurrence-retention subject, when
   the terminal report is produced, then the reason and subject are preserved
   with the existing next-action guidance and exact evidence binding.
2. Given a governance refusal whose packet is 131020 bytes and is not marked
   overflow, when it is reported, then it is not described as capacity
   exhaustion or proven safely retryable. Known facts remain visible and the
   unestablished cause stays explicit.
3. Given a repair proposal or a required permission, when the next step is
   reported, then the report distinguishes work actually underway from a
   specific decision being requested. A refusal is not itself permission.

## Functional Requirements

- **FR-001:** Preflight the complete actual receiver payload with the receiver's
  authoritative rules at the earliest safe boundary. Check operation order,
  target and attempt bindings, result shape, file scope, and known capacity.
  Repeat fresh checks at the operation boundary; preflight grants no authority.
- **FR-002:** Establish complete intended write scope before writers act,
  including testing and generated deliverables. Compare every reported changed
  file with that authorization. Scope expansion requires explicit authorization
  through the existing owner before additional writing; an existing pending
  attempt cannot be silently widened or replaced.
- **FR-003:** Use the existing permit-based initial claim for an eligible
  pending Lightweight task before invoking a receiver that requires
  in-progress state. Preserve dependency, blocker, owner, lane, permit, and
  receipt checks. Neither direct task-state editing nor a weaker receiver
  precondition is an acceptable fix.
- **FR-004:** A fresh authorized invocation may consume only complete existing
  historical captures actually supplied by their host, validated against
  current authoritative history and exact target, attempt, hash, and provenance
  bindings. Missing or invalid required captures cause a concrete refusal
  before ownership where deterministically knowable. Optional unavailable
  session history alone remains nonblocking.
- **FR-005:** Historical input must not restore old ownership, counters,
  permits, pending effects, or execution state. Preserve the selected goal and
  policy subject to fresh eligibility and evidence checks. Historical
  acceptance never substitutes for fresh verification or independent review.
- **FR-006:** Admit correction only for a proven no-effect rejected handoff
  under the same surviving supervisor and exact accepted authority, target,
  attempt, and incident bindings. Preserve accepted bytes and hash, accepted
  revision, counters, pending entries, and authoritative task/definition bytes
  across that rejection. Earlier authorized implementation edits do not become
  evidence of a new effect by the rejected handoff.
- **FR-007:** Preserve the existing one-immediate-correction allowance,
  consumption across host revisions or valid worker handoff, fresh-inspection
  fallback, and one-shot successful-recovery notice. A closed refusal stays
  nonterminal only while its existing authority and safety conditions hold.
  Never turn all contract failures or hard stops into a retry policy.
- **FR-008:** Carry validated reason, subject, evidence binding, and existing
  next-action guidance through the existing adapter and report. Do not replace
  known fields with an unresolved placeholder, accept arbitrary caller error
  text as authority, borrow an older evidence hash, or invent an unknown cause.
- **FR-009:** Keep complete historical bytes and all existing limits, including
  16 checks per attestation, 64 acquired source entries, 64 retained descriptors,
  and 131072 model-packet bytes. Do not delete history, truncate evidence,
  collapse occurrences to evade accounting, or silently group owner results.
  Only the actual result owner can reformulate a result without losing any
  required check or provenance.
- **FR-010:** Preserve verification, independent review, projection, receipt,
  settlement, audit, and close boundaries. Genuine test/review failures,
  learning-governance decisions, changed intent, approvals, destructive
  permission, cancellation, ambiguous ownership, and supervisor loss retain
  their existing policies. This feature changes no semantic learning rule.

## Key Entities

- Handoff: one operation's complete payload and its current authorization.
- Historical capture: retained source bytes and their existing provenance and
  identity bindings, used as evidence rather than live authority.
- Correction incident: the existing exact rejection identity and its consumed
  or available correction allowance.
- Refusal: supported diagnostic facts and the next permitted action, with
  unknowns distinguished from known cause or subject.

## Edge Cases

- A file is within feature intent but absent from the pending attempt's
  authorization: intent alone does not permit its inclusion after the fact.
- A source was never retained versus a host forgot to pass a retained source:
  both refuse incomplete admission; only the latter has an available mechanical
  handoff repair.
- Two historical attempts reuse an invocation-local ordinal: exact attempt
  identity and authoritative history order, not ordinal magnitude, bind them.
- Historical captures fit initial inspection but later evidence exceeds a
  fixed limit: the fresh operation still refuses, preserving earlier effects
  honestly rather than promising whole-run rollback.
- An ownership claim already exists with zero charged attempts: this is not
  proof that the invocation applied nothing.
- A live owner records a hard stop and ends through its existing route:
  that is not proof of supervisor absence or authority to clean an orphan.

## Success Criteria

- **SC-001:** The pending-task, 18-check, and omitted-file cases are detected
  at their earliest supported boundary; no invalid completion or unauthorized
  file change is admitted. A valid handoff still completes through all gates.
- **SC-002:** The fresh-history case accepts complete genuine captures as
  historical input and rejects absent, incomplete, conflicting, or wrong-bound
  captures without creating a claim when the defect is knowable beforehand.
  Historical bytes remain exact and fresh counters remain independent.
- **SC-003:** A qualifying corrected handoff continues in the same invocation
  without an extra attempt charge. Lost authority, observed or uncertain
  effects, and exhausted correction allowance never gain continuation.
- **SC-004:** Known blocker facts survive the actual terminal reporting path.
  The non-overflow governance case preserves its refusal and uncertainty;
  it gains neither a capacity diagnosis nor automatic recovery.
- **SC-005:** Boundary checks prove the unchanged evidence ceilings, history
  preservation, and verification/review/settlement/close behavior. No unrelated
  feature definition or execution history is changed by implementation.

## Assumptions And Limits

Existing project guardrails cover the outcome. Evidence availability is
conditional: this feature supplies a missing handoff, not missing historical
data. Cooperative host attestations do not prove that a malicious host reported
honestly. The particular historical governance cause remains unisolated and is
not an implementation prerequisite for preserving its known diagnostics.

## Out Of Scope

No new registry, database, persistent evidence store, checkpoint state format,
background process, liveness proof, general retry policy, workflow lane, or
command. No orphan inspection, cleanup, takeover, automatic post-hard-stop
continuation, semantic redefinition, or silent authorization expansion.
Prior packages 018, 039, 040, 056, 057, 061, 062, 064, and 065 remain untouched.
