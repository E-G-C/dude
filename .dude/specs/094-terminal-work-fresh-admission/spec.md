# Specification: Terminal Work disposition and fresh admission

Owner: `.dude/ideas/094-terminal-work-fresh-admission.md`

## Outcome and scope

Let a new explicit Ship request start genuinely fresh Work for a conclusively qualified terminal target, without reviving the old invocation or losing its evidence. Prevent avoidable packet growth as part of the same outcome. When proof is unavailable, report the first missing proof once instead of repeatedly asking the user to supply technical facts.

The supported path is autonomous Lightweight Work whose original, still-live owner can fence its own authority before returning. A fence permanently prevents that old Work capability from executing again. Automatic disposition covers only no effects or completely settled, directly observed effects under that owner. A terminal outcome alone grants no fresh permission.

Already-returned runs without an original-owner fence and runs with escaped or unobserved implementation/specialist authority remain ineligible. This feature does not promise to unstick the reported old Feature 089 run.

## User scenarios and acceptance

### US1 — Preserve a terminal failure while releasing only proved ownership (P1)

As the coordinator, I need the original Work owner to retain its failure and evidence, then release only controls it can conclusively account for.

1. Given the exact original owner, a settled exchange, only directly observed built-in reads, and a terminal evidence refusal, when the owner establishes its fence and retains complete proof, then it may release its exact controls and return the original failure unchanged.
2. Given a pure authorization refusal or fully settled supported synchronous effects with no escaped dispatch authority, when their actual entry, result, and current surfaces are proved, then disposition may qualify without treating equal counters as proof.
3. Given missing owner provenance, uncertain effects, changed controls, or incomplete retained evidence, when disposition is considered, then it removes nothing and reports the first missing proof once.
4. Given a failure after only part of removal succeeds, then the original failure, retained preimages, remaining controls, and exact known removal facts survive; no replacement is removed and no automatic retry occurs.

Independent test: exercise the original attached producer through eligible and refused terminal results in disposable targets, comparing the original state, evidence, and control identities.

### US2 — Admit new Work without resetting the old task or learning (P1)

As a user making a new explicit Ship request, I want eligible fresh admission to happen automatically, without redundant cleanup confirmation.

1. Given intact original proof, current exact ownership, absent controls, unchanged obligations, complete evidence, readiness, capacity, and current learning eligibility, when a new request selects the same unblocked in-progress task, then a new invocation starts with fresh accounting and identities. The task stays in progress and the old invocation stays terminal.
2. Given a repeat that current learning rules can derive at the required stage, then the new invocation passes that learning gate before Assessment or attempt authorization. Later or resolved old learning is neither imported nor rewound.
3. Given a consumed handoff, replayed runner request, stale target, changed obligations, blocker, conflicting claim, or missing proof, then admission refuses before a second unauthorized claim or execution.
4. Given an ordinary pending task, tracked precedence, guarded Work, a resolved ledger, or Feature 075 manual acceptance, then its existing route and authority remain unchanged.

Independent test: use a real newly produced terminal handoff to admit one new request, then test replay and each eligibility failure without modifying the old evidence.

### US3 — Fit complete evidence without hiding growth (P1)

As the Work owner, I need one readable, lossless evidence packet and an early refusal when a fully known completion cannot fit.

1. Given 1, 2, 4, 8, and 16 distinct payloads with repeated validated readable text and event content, then each admitted packet reconstructs the complete available evidence and uses strictly fewer measured bytes when the smaller representation qualifies.
2. Given unique evidence or a representation that saves no bytes, then growth remains visible; the existing representation remains available and the fixed capacity still applies.
3. Given complete packets of 262,143, 262,144, and 262,145 bytes, then the first two fit and the last produces a descriptor-only refusal with no model call.
4. Given an actual completion whose accumulated capture or known downstream write/receipt footprint exceeds capacity, then refusal precedes acceptance of that new capture or predictable write. The rejected pair and all earlier evidence and actual effects remain available.

Independent test: compare matched evidence and owner-log suffixes, reconstruct every admitted projection, and observe state and writes at the first known excess.

## Functional requirements

### Terminal disposition

- **FR-001:** The original live Work owner must produce the terminal fence proof before its call returns; a later caller cannot fabricate or backfill it.
- **FR-002:** Before releasing controls, Work must prove either no effect-producing authority was entered or every supported owned effect is settled from actual entry/result evidence and exact current surfaces.
- **FR-003:** Work must refuse automatic disposition when dispatch authority escaped, an effect is unobserved, ownership was replaced or lost, an exchange remains unresolved, or the execution boundary cannot establish original provenance.
- **FR-004:** Work must preserve the original terminal outcome, reason, halt evidence, accepted state and revision, counters, recovery usage, completed records, pending obligations, learning, and histories without correction or reset.
- **FR-005:** Before removal, the original owner must retain immutable, readable original control bytes, terminal state, captures, fence proof, and effect evidence, and verify that retention succeeded.
- **FR-006:** Work must release only the exact bound control pair using its existing guarded removal order and fresh absence checks; a changed or reappeared artifact is not removable under the old proof.
- **FR-007:** A retention or removal failure must leave the owner fenced where fencing succeeded, preserve remaining artifacts and known partial effects, and prohibit restoration of old live controls or automatic retry.
- **FR-008:** Resource disposition must remain auxiliary to the original terminal result and must not imply task success, obligation discharge, continuation, or another invocation.

### Fresh admission and reporting

- **FR-009:** Fresh admission requires a new explicit execution request; an old request, cancellation, retrospective question, saved state, or cleanup consent supplies no new execution authority.
- **FR-010:** Work must recheck the current lane, unique exact defined owner, durable task identity, unchanged requirements, dependencies, blockers, and normal task precedence before admission.
- **FR-011:** Work must establish current absence of the old control pair and absence of conflicting ownership before obtaining new exclusive authority.
- **FR-012:** Fresh admission must validate complete original retained sources and their current authority, including readable evidence and any required agreement between evidence surfaces.
- **FR-013:** Fresh admission must use current learning rules: ordinary Assessment when no repeat exists, the existing required-learning route for an eligible repeat, and refusal for later, resolved, conflicting, stale, one-sided, or unavailable learning.
- **FR-014:** A qualified same-key claim must leave an unblocked in-progress task in progress, preserve its obligations, and make both the admission basis and its new runner request single-use.
- **FR-015:** A new invocation must obtain new identities and fresh accounting from its current policy; old accepted state remains evidence and conveys neither imported authority nor refunded budgets.
- **FR-016:** Ship must automatically use an eligible Work-owned admission and otherwise return exactly its first missing-proof report, naming the affected proof and responsible next action without asking the user to invent technical facts.
- **FR-017:** Ship must preserve every new Work outcome unchanged once Work begins; finishing the old invocation must never trigger fresh admission.

### Packet growth and completion acceptance

- **FR-018:** Each admitted packet must remain readable, self-contained, and lossless for its complete available projection, preserving order, duplicate occurrences, original descriptors, and authority bindings. Only the established whole-event owner-log suffix exception remains.
- **FR-019:** Work may choose a new lossless representation only when its complete measured packet is strictly smaller than the existing representation for the same evidence; ties and non-saving cases retain the existing form.
- **FR-020:** Work must preserve the exact 262,144-byte packet limit and all independent limits: 64 raw sources, 64 retained descriptors, 1,048,576 bytes per source body, 4,194,304 aggregate body bytes, 6,291,456 transport/graph bytes, 65,536 checkpoint bytes, 1,048,576 response bytes, 16 specialist checks, and existing 16,384-byte semantic-field limits where applicable.
- **FR-021:** Once the actual completion is known, Work must check its full accumulated capture and every fully known remaining write/receipt footprint before accepting a new provisional capture or effect.
- **FR-022:** A failed completion-fit check must retain the actual rejected pair as unadmitted evidence while preserving accepted predecessor state, pending authorization, counters, and earlier effects; it must not manufacture completion, learning, or a failed approach.
- **FR-023:** Later use must revalidate current evidence and capacity after drift; overflow must yield one descriptor-only stop without a model call, evidence splitting, truncation, or a predictable subsequent write.

### Compatibility and delivery

- **FR-024:** Keep Feature 056's narrow original-owner first-Assessment release and Feature 075's outside-Work manual acceptance distinct; neither becomes general cleanup or fresh-admission permission.
- **FR-025:** Deliver the proof producer, consumer, policy, and installed path together through existing Work surfaces, without adding a workflow, daemon, registry, hidden live ownership store, optional runtime dependency, or automatic Git action.

## Key entities

| Entity | Meaning |
| --- | --- |
| Original invocation | The exact admitted Work authority and its unchanged terminal state. |
| Terminal evidence | Immutable original controls, captures, state, fence, and observed-effect proof retained by that invocation. |
| Disposition | Known resource-removal facts or one precise missing proof; never permission to execute. |
| Fresh admission | A new request's current target, policy, evidence basis, and single-use authority. |
| Evidence packet | One bounded readable projection whose inverse preserves all admitted evidence and bindings. |

## Edge cases

- PID, age, end-of-input, a terminal reason, equal counters, an empty changed-path list, or matching workspace hashes do not prove owner or external-effect settlement.
- An injected boundary that copies a trusted identity is still not the actual original built-in boundary.
- Missing receipts, one-sided publication, uncertain rollback, or partially committed setup preserve the accepted predecessor and actual writes; they cannot be silently settled or replayed.
- A new marker followed by a zero-event failure still consumes the old admission basis. A failed or uncertain runner start cannot reuse its request.
- Changed task/spec/plan obligations require their existing reconciliation authority; task numbers, names, and glyphs cannot supply it.
- Noncanonical history, alternate line endings, unknown records, Unicode, unavailable sources, duplicate captures, and unique text must remain represented honestly.
- Sharing must not buy another raw source, descriptor, check, or body allowance. Evidence arriving after an earlier preflight remains subject to current limits.

## Success criteria

- **SC-001:** Eligible original-owner cases release only their exact pair once; every refused or partial case preserves the original failure and reports exactly one first missing proof.
- **SC-002:** Original accepted state, control preimages, captures, accounting, obligations, and histories remain byte-identical wherever retained; no old authority is revived.
- **SC-003:** One new eligible request reaches ordinary learning/Assessment and subsequent Work gates through the installed path; replay, changed obligations, later learning, and unsupported authority produce no fresh execution.
- **SC-004:** The 1/2/4/8/16 distinct-payload repetition experiment records complete packet bytes, original counts, representation overhead, selected owner suffix, and inverse equality. Saving cases show strict net savings against matched existing packets; paired unique-evidence cases grow honestly.
- **SC-005:** Exact 262,143/262,144/262,145-byte cases and independent 64/65-source, 64/65-descriptor, body, transport, field, and 16/17-check boundaries retain their specified accept/refuse behavior.
- **SC-006:** The first predictable completion overflow occurs before new capture acceptance or downstream mutation, with the actual rejected pair and prior effects retained; later unpredictable failures make no whole-operation rollback claim.
- **SC-007:** Installed eligible and refused journeys, current policy contracts, and declared source/generated parity receive fresh independent verification and review; proposed tests are not reported as observed passes.

## Assumptions and exclusions

No new user-supplied assumptions or outcome-changing questions are needed. Eligibility is limited by the actual cooperative Work owner and its observable effects; it is not physical isolation of upstream tools or proof that an operating-system process died.

Exclude retrospective proof fabrication, post-dispatch orphan cleanup, old-state import, learning rewind, task reset/rekey/close, blocker removal, native consent or execution, Feature 089 operations, evidence/archive rewrites, a capacity increase, and persistent compaction. Preserve unrelated dirty source, generated files, docs, and workflow history. Arbitrarily growing unique evidence cannot fit indefinitely in a fixed-size lossless packet.

This definition grants no current live-target capability. Implementation, publication, verification, independent review, and any later execution remain with their existing owners.
