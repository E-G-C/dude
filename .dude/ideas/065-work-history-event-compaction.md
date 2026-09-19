---
title: Work History Event Compaction
slug: work-history-event-compaction
status: defined
spec_path: .dude/specs/065-work-history-event-compaction/spec.md
---

# Idea: Work History Event Compaction

## Idea

Close the measured remaining evidence-growth gap by sharing identical event bodies losslessly between Work's model-facing task history and current-run history. Preserve every occurrence, ordering, exact reconstruction, source hashes, capture and authority bindings, raw evidence, and append-only audit.

Keep this lean. Reuse existing runtime rendering, acquisition/preflight, and checks. Choose the smallest representation change, not a generic compression or dictionary framework.

Keep existing resource limits and genuine-capacity fail-closed behavior. Do not drop history, shorten or summarize evidence, or add external lookup, a store, cache, registry, workflow, or lane. There is no promise of unlimited growth.

Later implementation must establish real net savings and exact round-trip fidelity using the full retained 062 incident and complete relevant projection/receipt path. Erasing only the first 547-byte excess or manufacturing a passing endpoint is insufficient. These measurements are acceptance evidence to be produced, not existing results.

Keep this to one outcome. Exclude the separate historical custom-transport hash-attribution discrepancy, Canvas browser fixes, restart/cleanup, and other old features. 064 remains completed; do not rewrite its definition or history. 062 stays stopped.

Use only this idea ledger and the required spec, plan, and tasks in the later definition package, with the minimum independently verifiable implementation slices. Add no supporting research, architecture, or checklist documents unless a concrete unavoidable gap is returned to the coordinator first.

## Open Questions

No outcome-changing clarification is unresolved at capture.

## Assumptions

No particular encoding or amount of net savings is assumed.

<!-- dude:managed:start -->
## Incident Context

Read-only source:
`/Users/eg/.copilot/session-state/6548ab4a-a610-4b77-bce6-4f630599ef4c/files/062-capacity-readonly-investigation.json`.
These are retained report findings, not measurements re-executed for this capture or new Work authority.

- Current complete input: 130,975 bytes, 20 original descriptors, 19 available occurrences, and 15 physical items.
- Predicted `approach-occurrence` lane-first state: 129,151 bytes; its both-surfaces state: 130,678. The next `finding-occurrence` lane-first state needs 131,619 bytes against 131,072. The batch refuses before mutation, with the owner log already at its minimum one event at the first failure.
- At that failing prefix, task-history and current-run items total 90,890 bytes, or 69.06% of 131,619. The report also identifies 15 exact shared event bodies totaling 31,036 canonical bytes. This is measured redundancy, not proven net savings for a future representation.

The accepted `.dude/specs/064-work-receipt-overflow-handling/plan.md:38-65` keeps task-history and current-run bodies literal and explicitly defers event factoring. This follow-up is a separate extension of that completed baseline. Existing runtime rendering and budget checks are in `src/skills/dude-work/recovery.mjs`.

## Coordinator Log

- 2026-09-18 - Explicit first-capture brainstorm staged by Spec Lead for `work-history-event-compaction`. Coordinator-relayed provenance: the user accepted the narrow lossless-sharing recommendation with `do it`, then added `we need to keep things lean`. Draft with empty `spec_path`; no lifecycle number or canonical idea path assigned here. First-capture publication and the separate definition subaction remain pending. No implementation, Work/Ship, Git change, task-state change, or ended-invocation revival performed by this capture.
- 2026-09-18 - Explicit DEFINE staged by Spec Lead for first-definition publication: exact owner `.dude/ideas/065-work-history-event-compaction.md`, exact `spec_path` `.dude/specs/065-work-history-event-compaction/spec.md`, defined metadata, and the spec/plan/tasks core. The plan selects packet-local event references into unchanged literal task history and two serial open tasks. Existing guardrails continue with no new candidates or outcome-changing clarification. Coordinator publication and lint remain pending; 062 remains stopped and 064 completed. This definition performs no implementation, Work/Ship, Git write, execution-state change, or old-artifact mutation.
<!-- dude:managed:end -->
- 2026-09-18T20:56:41Z - Started T001@e065a1c8 through the authorized autonomous Work adapter for packet-local history event sharing; 062 stays stopped and prior evidence remains unchanged.
- 2026-09-18T21:33:44Z - Closed T001@e065a1c8 after independent Tester verification (474 passed, zero failed/skipped), Code Reviewer no supported findings, and Reviewer APPROVE. Exact event sharing, portable retained-incident inversion and same-projection savings are verified; T002 integration, later growth and delivery remain open. Completion evidence and lane receipts were retained through the Work adapter.
- 2026-09-18T21:35:45Z - Started T002@e065b2d9 in the same autonomous Work invocation after T001's exact settlement. Scope is complete retained-path/later-growth proof, unchanged refusal boundaries, active guidance and isolated generated delivery; 062 remains stopped.
- 2026-09-18T22:24:32Z - Blocked T002@e065b2d9 as contract-mismatch after independently verified host/board failure (199 passed, 8 failed) and Reviewer REJECT, all retained with exact projection receipts. Architect and Spec Lead identified SC-003's later-episode requirement as an unchanged-runtime contradiction; an isolated resume-learning falsifier returned governance-unresolved with byte-identical accepted state. Ordinary automatic definition-reconciliation attestation is unsupported, so no definition or runtime-policy workaround was applied. T001 remains done; 062 remains stopped. Next: explicit define work-history-event-compaction, preserving full failed evidence and actual receipt/settlement coverage.
- 2026-09-18T22:40:34Z - Ordinary explicit DEFINE staged by Spec Lead for the unchanged exact owner/spec path. Corrected SC-003's derived timing overconstraint: require genuinely new bound captures and later event growth within the reachable recovery episode, complete dual-surface receipts and verification-failed settlement, and unchanged-state refusals of sealed continuation through re-review and resume. The prior compulsory second recovery after that seal was not implemented. Proposed one-to-one definition mapping keeps T001@e065a1c8 byte-identical and changes only T002@e065b2d9's proof criterion; prior log, task metadata, and failed history remain intact. Seven related regression failures, guidance, generated parity, and full revised acceptance remain T002 work. Existing guardrails continue with no new candidates or unresolved intent. Coordinator review, state reconciliation, publication, and lint remain pending; this staging grants no Work/Ship resume, implementation, task closure, or runtime-policy change.
- 2026-09-18T22:52:29Z - Explicit re-definition execution reconciliation: preserved T001@e065a1c8 as done with its unchanged canonical unit and completion evidence; retained T002@e065b2d9 one-to-one with the corrected proof criterion, removed only the reconciled contract-mismatch blocker, and returned it to todo for a separately authorized fresh repair. Preserved all 8054 bytes of execution history, including the failed attempt and review findings. No task was dropped, split, added, or newly completed. Failed checks, guidance, generated parity, and revised acceptance remain outstanding; neither the ended Ship nor 062 is resumed. The definition, task snapshot, and derived backlog are published together under rollback-bound lint.
- 2026-09-18T22:59:13Z - Fresh explicit Ship authorized address-test for T002@e065b2d9 under the reconciled definition. Acquired the complete prior failed verification/review and all four T002 occurrence records as evidence, without restoring the ended RunState or worker. Scope remains the approved test/guidance/generated delivery paths; T001 stays done and 062 remains stopped.
- 2026-09-19T03:05:25Z - Closed T002@e065b2d9 and completed Feature065 through a fresh no-change Ship completion on the repaired runtime. Fresh independent verification passed 695 runtime, 86 tracked, 11 selected contract, and 2 isolated packaging checks; Reviewer APPROVE covers the approved compaction scope. All prior failed checks, rejections, and distinct reused-ordinal records remain retained. Four historical unrelated full-checkout delivery failures and two lint warnings are not reclassified. The one advisory retrospective returned no issues. Exact completion projection and receipt were settled before this terminal close; 062 was not resumed and no Git delivery was performed.
