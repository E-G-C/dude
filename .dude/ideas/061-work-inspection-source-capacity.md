---
title: Work Inspection Source Capacity
slug: work-inspection-source-capacity
status: draft
spec_path:
---

# Idea: Work Inspection Source Capacity

## Idea

User request, verbatim:

> is the **64-source-entry limit** **an issue we should track,** if so capture it thru work intake , to tackle later.

Record this reproducible Work inspection capacity issue now and tackle it later.
This is capture-only intent; definition and implementation remain deferred.

## Open Questions

Questions for later definition, not requests for answers now. None blocks this
record-only capture; no answers are recorded here.

1. Which inputs belong to the evidence-entry budget versus complete exact-owner
   inventory acquisition, and how should resource, memory, and byte bounds apply
   to those inputs?
   Answer:
2. How should Work check completion capacity before expensive execution,
   accounting for required verification and review evidence and any mandatory
   later current-run, lint, or session streams under the active policy?
   Answer:
3. What should an exhaustion diagnostic report so the exhausted budget, affected
   subject, and permitted next action are clear while accepted state remains
   unchanged?
   Answer:

## Assumptions

Working assumptions, not additional user answers:

- Existing project and bundle guardrails cover this scope; no new candidate is
  needed.
- The coordinator's supplied evidence supports recording an actual operational
  block. It does not authorize a live retry, cleanup, continuation, or close.

<!-- dude:managed:start -->
## Capacity Accounting

The findings below were verified by the coordinator and supplied for this
capture. They were not re-executed here. Source references and session results
describe the observed incident, not a fresh task-status check or authority to act.

- `src/skills/dude-work/recovery.mjs:111` sets `MAX_SOURCE_ENTRIES = 64`.
- `assertSourceEntryLimit` at lines 1926-1946 starts at `directIdeaCount + 2`,
  adds each current-run, review, verification, and lint entry plus an optional
  session entry, and adds one for autonomous policy.
- `readDirectIdeas` at line 2234 onward enumerates the entire direct
  `.dude/ideas/` directory. Lines 2297-2299 reject when
  `candidateEntries.length + 1 + sourceEntryTail` exceeds 64. Inventory discovery
  consumes the same overall source-entry budget as completion evidence; this is
  neither merely a model-packet limit nor a 64-idea-only limit.
- Before this capture on 2026-09-13, the coordinator freshly confirmed 60 valid
  Markdown ideas, 60 total direct entries, and zero other entries. The canonical
  idea inventory had zero diagnostics and no matching capacity, budget, limit,
  or inspection slug.
- In the observed autonomous inspection, no result streams meant
  `60 + 2 + 1 = 63` entries and passed. Adding one valid Tester verification
  stream and one Reviewer stream made 65 and threw. Later current-run, lint, or
  session streams can also consume capacity, so 60 ideas is not a universal
  failure threshold.

## Valid Completion Evidence And Failure

The second, newly authorized `T012@a57c1212` close attempt had an actual sole-Tester
result with 10 unique checks, all passed. Its grouping retained all 18 prior
obligations, SC001-SC008, 26 acceptance-matrix rows, and 10 nonregressions. Both
actual verification and review attestation builders accepted the exact result.
The full authorized material scope included all six paths; `changedTargets: []`
was truthful for this closure-only attempt. The independent Reviewer returned
`APPROVE`, and 437 fresh Node tests passed.

The coordinator's read-only control returned an Inspection with `overflow: false`
and no blockers without result streams. Its evidence hash was
`a62962d4d02214d550c1d7f80237689e1f95abd6ca4058e38f75398d869a4c4c`.
The same current workspace and target with the actual valid result streams threw
`inspect input exceeds the resource limit of 64 total source entries`, at
`readDirectIdeas:2299` and `acquireInspection:2541` in the same source file.
That reproduction performed no authorization, completion, projection, lane
change, or parser workaround.

The actual Work runner exited 1 with hard-stop reason `inspection-incomplete`
and detail `runtime-threw`; its halt reason/subject report remained unresolved.
The retained `acceptedStateBase64` and its hash were unchanged,
`acceptedRevision` remained 1, and all 11 recorded canonical/implementation
preimages stayed unchanged. At that stop, T012 remained `[~]` despite
implementation/readiness approval. This is a Work capacity and diagnostics
issue, not a Dude Canvas UI defect.

## Bounded Outcome

Work should have coherent source-capacity accounting for a legitimately growing
workspace and the evidence needed to finish an admitted task. Capacity should be
knowable and checked before expensive execution. Exhaustion should give a
bounded, actionable diagnostic while preserving accepted state.

A later definition should decide what belongs to the evidence-entry budget
versus owner-inventory acquisition and how mandatory later streams are accounted
for. This capture chooses no implementation or replacement limit.

Retain resource, memory, and byte limits and complete exact-owner discovery.
Do not use unbounded scans, hide/remove/unlist ideas to fit, drop required
evidence, blindly inflate limits, or bypass close gates. Keep ownership,
verification, and independent review requirements intact.

No new registry, service, daemon, queue, framework, or configuration surface is
chosen here. Bounded exhaustion reporting belongs to this same capacity and
late-failure outcome.

## Related Ideas And Capture Boundary

- [Recoverable Work Handoffs](060-recoverable-work-handoffs.md) at
  `.dude/ideas/060-recoverable-work-handoffs.md` remains separate. It concerns
  malformed handoff preflight and proven no-effect correction, including the
  earlier 18-versus-16 check mismatch and omitted file binding. This incident
  rejected valid completion evidence because of source-capacity accounting.
- [Ship Orphan Cleanup](056-ship-orphan-cleanup.md) at
  `.dude/ideas/056-ship-orphan-cleanup.md` concerns orphan cleanup and retains its
  separate unresolved proof/authority boundary.

Neither related idea is merged, reopened, defined, implemented, or changed by
this capture. No execution order or dependency is inferred from lifecycle
numbers.

T012's separate ordinary Lightweight-close permission remains pending. This
request approves no cleanup or closure and no Work-claim change. This capture
authorizes no actual checkpoint-file inspection or deletion, existing
task/state/log edits, implementation, tests, review or design changes, live
Canvas/provider access, commits, or pushes.

## Evidence Bookmarks

Coordinator-retained, session-only research bookmarks, not authority. These
files were not opened for this brainstorm. No claim data, consent tokens, or
raw tool payloads are included.

Base directory:
`/Users/eg/.copilot/session-state/5c18f926-9e5b-4303-b236-cb926acfde82/files/t012-clean-close-bd57ea7b519e3fa9/`

- `read-only-inspection-diagnosis.json`
- `completion-result.json`
- `completion-preflight.json`
- `tester/grouped-check-coverage-map.json`
- `tester/verification-manifest.json`

## Coordinator Log

- 2026-09-13T10:14:12.269-04:00 - First-capture brainstorm staged for `work-inspection-source-capacity` at the user's explicit request to record it for later. Preserved coordinator-attributed valid-evidence capacity findings and separation from 060 and 056; later definition questions remain unanswered. Draft status and empty spec_path; awaiting coordinator publication with no lifecycle number or package path assigned here. No workspace, execution-state, implementation, or cleanup changes performed by this capture.
<!-- dude:managed:end -->
