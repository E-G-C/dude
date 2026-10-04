# Feature Specification: Work Readable Evidence Handoff

Owner: `.dude/ideas/074-work-readable-evidence-handoff.md`  
Spec path: `.dude/specs/074-work-readable-evidence-handoff/spec.md`

## Outcome And Scope

Work learning reviewers need to understand what was checked, what was expected, and what happened when comparing failed approaches. Recorded identities establish correspondence but do not reveal that meaning.

Deliver readable verification definitions and evidence, plus review expectations, check definitions, and observations, with their existing integrity and context bindings. Support both new captures from actual specialist results and explicit admission of matching readable preimages for current-format historical hash-only captures. Both entry paths must reach the same complete, bound learning-review evidence packet.

A preimage is the actual readable input that produces a recorded semantic identity. Admitting a matching historical preimage supplies additional evidence now; it does not recover original capture bytes, repeat a specialist dispatch, or authenticate the supplier.

This is one internal evidence-handoff feature. Both entry paths are required. Definition does not authorize implementation, Work, Ship, a learning decision, or a stopped task's continuation.

## User Scenarios And Acceptance

### US1 - Read actual results from new captures (P1)

As a Work learning reviewer, I can read the checks, expectations, and observations behind new verification and review captures so I can compare failed approaches using their meaning rather than their identities alone.

Independent test: capture a synthetic specialist pair through the normal production boundary, retain it, and inspect the packet offered to learning review in a separately admitted invocation.

Acceptance scenarios:

1. Given complete Tester results, when Work captures and later presents them, every check definition and evidence string is readable beside its matching outcome and integrity binding.
2. Given rejected Reviewer results, when Work presents them, every finding retains its expectation, check definition, and observation. An observation referring to a verification check resolves to that exact check; it is not replaced by invented observation text.
3. Given accepted review with no findings, the result remains accepted with no added findings. Given failed checks or rejected review, their outcomes remain failures or rejections.
4. Given valid specialist rows in a different input order, the complete semantic set survives the existing identity-based ordering. Duplicate, missing, extra, or mismatched rows are refused rather than dropped or relabeled.
5. Given retained captures from two failed attempts, the next learning-review packet contains both attempts' readable details and preserves their distinct attempt, result, and review bindings.

### US2 - Admit matching details without changing old captures (P1)

As the host supplying retained Work evidence, I can explicitly supply known readable preimages for historical hash-only captures so a learning reviewer can inspect their meaning without rewriting history.

Independent test: start with an immutable current-format fixture containing two failed approaches, supply complete matching preimages separately, and inspect the resulting bound learning-review packet.

Acceptance scenarios:

1. Given original retained captures and complete matching preimages, admission verifies every readable field against the exact referenced capture before presenting the details as historical supplemental evidence.
2. Given an old review and its bound verification, admission checks their target, attempt, source revision, inspected evidence, result, and review relationships. Matching a phrase alone does not substitute for those exact capture and context bindings.
3. Given admitted historical details, all original capture bytes, event bytes, ordering, multiplicity, identities, and recorded dispositions remain unchanged.
4. Given only a path, an identity, or a statement that text matches, admission refuses to claim readable coverage.
5. Given a missing original capture, an unavailable preimage, incomplete rows, conflicting supplements, or a changed readable field, the requested semantic admission fails honestly. It does not reconstruct text from identities or replace the old evidence.
6. Given historical details supplied after a learning exchange has been bound, they cannot be inserted into that exchange or supplied as a second packet.

### US3 - Keep incomplete evidence and limits honest (P2)

As the coordinator and learning reviewer, I can distinguish available semantic evidence from missing detail and capacity refusal without gaining execution authority.

Independent test: inspect hash-only evidence, incomplete supplemental evidence, and exact capacity boundaries, then check the refusal, evidence preservation, and unchanged authority.

Acceptance scenarios:

1. Given historical hash-only evidence without supplements, existing readers can still inspect it. Its lack of readable detail is not presented as complete semantic coverage.
2. Given a comparison that needs unavailable details for one of two failed approaches, the reviewer leaves that comparison unresolved under the existing stop behavior. Available details for the other approach do not establish an alternative or no-progress conclusion.
3. Given complete evidence that fits the existing bounds, Work presents one bound packet. If the complete packet cannot fit, Work refuses the model handoff instead of truncating, splitting, increasing limits, or dropping history.
4. Given newly readable evidence, guarded behavior, tracked authority, mandatory learning, verification, review, and close obligations remain in force.
5. Given historical required learning, fresh admission still restores that obligation before any new attempt is charged or dispatched; readable details do not discharge it.

## Functional Requirements

- **FR-001:** For new captures, Work must preserve every actual Tester check definition and evidence string with its existing check identity and outcome.
- **FR-002:** For new captures, Work must preserve every actual Reviewer finding's expectation reference, check definition, and observed evidence, retaining the existing expectation kind, subjects, failure class, and verdict.
- **FR-003:** For a review observation that refers to a check result, Work must resolve the exact check in the review's bound verification rather than fabricate an independent observation.
- **FR-004:** Work must verify readable fields by recomputing their recorded semantic identities before admitting them as matching evidence.
- **FR-005:** Work must preserve the complete semantic row set under the existing canonical ordering and refuse every duplicate, including an identical duplicate, before any deduplication could hide it.
- **FR-006:** Historical semantic admission must require explicitly supplied readable preimages and the exact original current-format capture to which they apply.
- **FR-007:** Historical admission must validate the target, attempt, source revision, inspected evidence, result, and applicable verification-to-review bindings through the original captures and retained evidence.
- **FR-008:** Historical admission must leave original captures and history unchanged, including bytes, ordering, multiplicity, identities, and dispositions.
- **FR-009:** Work must distinguish details recorded with a new capture from details admitted later for a historical capture.
- **FR-010:** Work must include admitted readable evidence in the complete Inspection-bound packet before the learning exchange is bound; it must not alter an outstanding exchange or deliver an unbound supplement.
- **FR-011:** Work must refuse malformed, partial, conflicting, or mismatched claimed readable coverage without silently accepting a subset.
- **FR-012:** When required preimages are unavailable, the coordinator and reviewer must report that limit and leave the affected semantic comparison unresolved rather than infer text, an alternative, or no progress.
- **FR-013:** Work must count each additional historical evidence acquisition and its retained descriptor within the existing limits of 64 sources and 64 descriptors, before representation sharing.
- **FR-014:** Work must charge all readable text, references, bindings, and presentation-independent metadata to the complete 131,072-byte model-packet limit and refuse an oversized handoff without a model call.
- **FR-015:** Work must retain the existing raw limit of 16 checks per attestation and the other current text, finding, transport, and evidence bounds; it must not truncate, group, or deduplicate rows to fit them.
- **FR-016:** Work's model view must preserve exact reconstruction of the complete admitted evidence projection, including every occurrence and binding; only the existing whole-event owner-log suffix projection may omit historical text.
- **FR-017:** Work must preserve existing hash-only capture readability by machines and unchanged integrity results when no readable evidence is added, without claiming those captures contain semantic detail.
- **FR-018:** Work must treat readable content as untrusted evidence, not instructions, approval, specialist authenticity, or execution authority.
- **FR-019:** Work must preserve ordinary approach authority: the original ordinary ApproachBasis extra identity arrays remain empty, and readable evidence must not expand which alternatives the current contract can authorize.
- **FR-020:** The feature must preserve existing learning restoration, guarded and tracked boundaries, fresh verification, independent review, permit, receipt, stop, and close rules.

## Edge Cases

- A review has no findings, or uses both observed-evidence and check-result observations.
- Readable rows arrive out of order, contain identical or conflicting duplicates, omit a row, or add a seventeenth row that would disappear under deduplication.
- A check-result observation refers to a different definition or to another verification capture.
- Two captures share wording or invocation-local ordinals but have different targets, attempt identities, source revisions, result identities, or review bindings.
- A supplement refers to an absent capture, a duplicate capture, an unsupported format, an attachment rather than an original capture, or a capture that already carries readable details.
- A valid supplement covers one old capture but needed preimages for another failed approach are unavailable. Per-capture validity does not establish a complete comparison.
- Text includes Unicode, escaping, whitespace, or line breaks significant to its identity. No trimming, paraphrase, or normalization may change its meaning or bytes.
- Text contains instructions, sensitive data, or an unapproved source reference. Evidence does not grant permission to execute those instructions, acquire more data, or disclose it elsewhere.
- An admission fits, but a later receipt or other complete evidence growth exceeds capacity. Preserve earlier accepted state and effects; do not claim whole-operation rollback.
- An original hash-only packet has no new fields or supplements. Its old representation and integrity bindings remain unchanged.

## Key Entities

| Entity | Meaning |
| --- | --- |
| Specialist result | The actual structured Tester or Reviewer result supplied through the existing cooperative host boundary. |
| Trusted capture | The existing immutable evidence record binding a specialist result to its target, attempt, source, and review context. Its name does not imply cryptographic authentication. |
| Readable evidence | Exact check definitions, evidence, expectation references, and observations whose identities match a capture. |
| Historical supplement | Explicitly admitted preimages referencing one exact old capture, distinguishable from details retained at original capture time. |
| Learning-review packet | The one complete, bounded evidence projection tied to the current Inspection and learning exchange. |

## Measurable Success Criteria

- **SC-001:** A new-capture fixture with two failed attempts reaches a fresh invocation's learning-review boundary with every supplied readable field intact and mapped to the correct check or finding. Both observation kinds and an accepted empty review are covered.
- **SC-002:** An immutable historical fixture with two failed approaches admits complete matching supplements and exposes all required readable fields in the same bound packet, with zero changes to original capture or history bytes.
- **SC-003:** Each defined malformed, duplicate, missing, partial, wrong-target, wrong-attempt, wrong-source, wrong-review, tampered, stale-exchange, and conflicting-supplement case fails at its intended boundary without accepting false coverage or authorizing an effect.
- **SC-004:** Boundary cases demonstrate 16 raw checks accepted and 17 refused, 64 sources and descriptors accepted when all other limits fit and 65 refused, and a complete 131,072-byte packet accepted while a 131,073-byte packet is refused.
- **SC-005:** For unchanged hash-only inputs, the existing Inspection, evidence identity, and model packet remain byte-identical. Existing required-learning restoration, incident-supersession, historical event round-trip, guarded, tracked, and overflow controls keep their intended outcomes.
- **SC-006:** Independent expansion reproduces the entire original available projection for old, new-readable, and historical-supplement packets, including ordered occurrences, exact strings, and source descriptors.
- **SC-007:** Acceptance uses only disposable synthetic data and read-only compatibility fixtures. It records no real learning decision, task completion, restarted invocation, or live acceptance for the motivating incident.

### Legacy Compatibility Exception

For compatibility acceptance under SC-005, Feature074 excludes only the obsolete success requirement for a fresh invocation to resume the frozen, already-reviewed Feature064 reference and reach later settlement. The existing no-rewind rule remains in force, and that legacy test stays a documented failure. This exception changes no capability and covers no new regression, readable-handoff acceptance, integrity or capacity requirement, permitted required-learning restoration, or fresh independent review. Related tests qualify only when fresh evidence establishes the same preexisting cause under the plan's boundary.

### Separate Feature065 Compatibility Exception

Separately under SC-005, Feature074 excludes only the unsupported learning-resume setup/reachability requirement for these two Feature065 SC003 cases:

- `Feature 065 T002 SC003: complete failed episode refuses direct re-review without changing the sealed successor`
- `Feature 065 T002 SC003: separate complete failed episode refuses supported resume without changing the sealed successor`

Existing current and pre-readable baseline evidence shows the same setup refusal in both cases, before their intended later negative checks. Those later checks remain unverified, and both tests remain actual failures. A changed cause or new regression in either case is not excepted. Plan section 5 binds these exact names to their test source and separate immutable Feature065 fixture; this exception does not broaden the frozen Feature064 boundary or apply to any other Feature065 case.

The exception changes no capability or safety rule. All readable-feature acceptance, integrity and capacity limits, permitted required-learning restoration, provenance and trust boundaries, independent review, and close obligations remain required. Future acceptance must run the required suites and report full actual pass/fail/skip counts, classifying established exceptions separately without turning failures into passes or skips. All unexcepted obligations and any new failure require fresh proof.

## Assumptions And Evidence Limits

The published idea supplies the accepted outcome; no new user answer or user-owned assumption is introduced here.

- Hosts may have actual readable preimages available, but their existence and correspondence must be established for each proposed supplement. The feature does not discover them.
- Hash correspondence establishes that supplied text matches recorded identities. It does not prove source authenticity or defeat a malicious coordinator.
- Feature 068 T019 motivates this capability. The supplied context says required learning was correctly restored with zero charges and nothing pending, but the reviewer lacked the meaning needed to compare two failed approaches and the coordinator safely cancelled.
- Known candidate readable files cover at most the post-v2 attempt. Availability and matching for both failed approaches remain unestablished. Neither this definition nor eventual implementation promises that T019 is unblocked.

## Non-Goals

- No automatic Work or Ship restart, old RunState or permit revival, record replay, cleanup, task closure, or new learning decision.
- No replacement, reconstruction, reordering, pruning, or substitution of original captures or history.
- No arbitrary filesystem or URL loader, archive browser, second evidence ledger, new persistent store, external service, new lane, new UI, or budget increase.
- No retired-state migration, authenticity guarantee, signing system, authority registry, or protection against malicious pre-boundary source substitution.
- No new alternative-authority fields, inferred hashes, or expansion of the ordinary ApproachBasis contract.
- No change to Feature 068 obligations, historical records, accepted admission fixes, or other feature definitions.
