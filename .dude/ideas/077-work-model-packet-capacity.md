---
title: Work Model Packet Capacity
slug: work-model-packet-capacity
status: defined
spec_path: .dude/specs/077-work-model-packet-capacity/spec.md
---

# Idea: Work Model Packet Capacity

## Idea

Repair the Work evidence-capacity blocker using the simplest, more elegant YAGNI solution. Keep it simple and move forward; consult the Architect as needed.

## Open Questions

None for capture.

## Assumptions

No additional user assumptions supplied.

<!-- dude:managed:start -->
## Scope and Proposals

Architect choice: raise only fixed `MAX_PACKET_BYTES` from 131072 to 262144. One outcome and one task, `T001@b7c9e2a4`: the constant, applicable tests, current guidance, and two generated Work files.

The locally retained incident for 062 T004 exhausted packet bytes after a new Tester/Review pair: smallest packet 132430 B, 1358 B over the old cap; the pair needed 7891 B against 6533 B headroom. Current non-owner content is 131577 B, and three pending lane events add 5593 B. Sources use 25/64 and descriptors 26/64; sharing already works.

Keep derived item capacity 64, all other resource and authority limits, `dude-work-model-view-v1`, complete evidence/history, trusted bindings, order, duplicates, and maximal whole owner-event suffix selection. No compactor, new format, pruning, splitting, configuration, or state. Complete-owner known postimages are expected near 165 KB but must be measured with the revised runtime. This remains bounded capacity with higher possible model-context demand.

Use ordinary non-Work Lightweight implementation. Existing guardrails apply; no UI or additional human questions. Leave 061/064/065 specs unchanged. Preserve 062 intent/history, original incident files, and its stopped RunState/orphan pair. Windows `bd.cmd` fixture/POSIX coverage failures remain separate and unfixed. No cleanup, resume, retry, or Git authority; fresh Ship needs separate authorization and normal admission.

## Related References

- `.dude/ideas/062-dude-canvas-workspace-integration.md`
- `.dude/ideas/061-work-inspection-source-capacity.md`
- `.dude/ideas/064-work-receipt-overflow-handling.md`
- `.dude/ideas/065-work-history-event-compaction.md`
- `src/skills/dude-work/recovery.mjs`
<!-- dude:managed:end -->

## Coordinator Log

- 2026-09-28T01:11:45Z - brainstorm: Captured packet-capacity repair; definition follows separately.
- 2026-09-28T01:14:24Z - define: Defined .dude/specs/077-work-model-packet-capacity/spec.md with one open task T001@b7c9e2a4 for the fixed packet-capacity revision; existing guardrails apply.
- 2026-09-28T01:33:01Z - execution: Claimed T001@b7c9e2a4 in ordinary Lightweight execution under the user's instruction to choose the simplest solution and move forward. The generated task board and snapshot reflect the claim. Scope is the Architect-selected fixed packet ceiling revision, with unchanged evidence and authority semantics; the stopped 062 invocation and its checkpoint remain untouched.
- 2026-09-28T02:53:48Z - execution: Authorized the requested one-line current-limit assertion update in library/packs/beads/skills/dude-pack-beads-workflow/beads.test.mjs as a directly consuming check for T001@b7c9e2a4. It changes no task meaning, production behavior, package membership, or other limit. Fresh independent verification and review remain required.
- 2026-09-28T03:12:07Z - close: Closed T001@b7c9e2a4 after independent Tester verification and Code Reviewer APPROVE with zero findings. The only production change is the fixed model-packet ceiling from 131072 to 262144 bytes. All 67 fresh focused tests passed without skips; the hash-qualified full Work result remains 801 passed, zero failed, and three Windows skips, not a fresh full-suite rerun. Independent replay prepared the saved incident and all six known postimages, largest 164894 bytes; 262144 bytes admitted and 262145 refused with state and evidence preserved. The stopped 062 invocation, its history and checkpoint, and the separate Windows/POSIX verification gaps remain unchanged. No Git delivery or Work restart occurred.
- 2026-09-28T03:12:07Z - render: Regenerated and checked the derived 077 task board after the coordinator snapshot recorded T001 as done; no ready tasks remain. The single advisory retrospective dispatch completed with no issues or suggestions.
