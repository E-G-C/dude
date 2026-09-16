---
title: Work Inspection Source Capacity
slug: work-inspection-source-capacity
status: defined
spec_path: .dude/specs/061-work-inspection-source-capacity/spec.md
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

## Definition Disposition

On 2026-09-15 the user explicitly requested: "take 061 through definition and
repair first, as a prerequisite to implementing 062". The capture-only wording
above remains historical intent. This first definition reuses the exact selected
061 path, title, and slug; it allocates no identity and adds no dependency metadata.

The coordinator freshly reported zero canonical diagnostics, 63 ideas, and 51
packages. Its read-only Node 26.8.1 inspection of actual 062 task `T001@a062c1d4`
under Lightweight/autonomous policy with empty current-run, review, verification,
and lint streams threw the 64-total-source-entry error. Supplied idea/spec/tasks/
task-state hashes were unchanged. This definition did not rerun that inspection.

Plan sections 1-3 resolve the historical technical questions through researched
definition-owner choices, not new user answers: a separate 999-direct-entry
inventory bound with one owner source inside the unchanged 64-entry budget;
per-attempt headroom derived from actual completion callers, including new
verification/review and required lint/current-run entries; and bounded typed
capacity diagnostics through existing CLI/host reporting. Full ownership,
byte/model limits, optional-session policy, and unchanged refusal state remain.
No new guardrail candidate or human clarification is needed.

The staged core trio targets
`.dude/specs/061-work-inspection-source-capacity/spec.md` with one open proposed
task, `T001@61c8a4e2`. After publication and coordinator lint, repair uses normal
non-Work Lightweight Execution, with fresh Tester evidence and independent
Reviewer judgment before any coordinator close. It does not ask the blocked
Work engine to authorize its own repair.

This staging changes no repository or execution state. It grants no old-run
restart or claim cleanup. Actual 062 is read-only for capacity verification;
its mock/approval/contrast issue, 063 Settings, and 060/056 remain untouched.
Generated delivery must use the plan's isolated builder and selective output
application to preserve existing user edits.

## Coordinator Log

- 2026-09-13T10:14:12.269-04:00 - First-capture brainstorm staged for `work-inspection-source-capacity` at the user's explicit request to record it for later. Preserved coordinator-attributed valid-evidence capacity findings and separation from 060 and 056; later definition questions remain unanswered. Draft status and empty spec_path; awaiting coordinator publication with no lifecycle number or package path assigned here. No workspace, execution-state, implementation, or cleanup changes performed by this capture.
- 2026-09-15T10:09:21Z - First definition staged at the user's explicit request to define and repair 061 before implementing 062; preserved the selected numbered identity, all user-controlled sections, and prior log bytes. Proposed exact spec_path .dude/specs/061-work-inspection-source-capacity/spec.md and one new open task T001@61c8a4e2. Technical choices resolve accounting, completion headroom, and bounded diagnostics without invented user answers or new guardrails. Normal non-Work Lightweight repair follows publication and coordinator lint; no repository mutation, old Work restart, claim cleanup, implementation, verification, review, or close performed by this staging.
- 2026-09-15 UTC - Published the independently reviewed first definition with zero lint failures, resolved its exact owner, and set T001@61c8a4e2 in progress through normal Lightweight execution with its derived board rendered. This user-authorized repair precedes 062; it starts no Work invocation and preserves 062, 063, and the existing instruction/model edits.
- 2026-09-15T12:29:27Z - Final acceptance for T001@61c8a4e2: independent testing and review drove corrections to diagnostic provenance, inert validation, target/effect/hash attribution, scalar coercion, and CLI refusal guidance; Code Reviewer then approved. Fresh coordinator acceptance passed 21 focused checks and lint had zero failures; the broader 694-check run had only the known whole-core parity failure caused by the preserved user instruction edit. All four repair-owned generated outputs match source. Generated-runtime inspection of actual 062 with labeled fixture streams admitted every required evidence class without overflow, blockers, or authority-file changes; no real 062 result or Work authorization is claimed. The one advisory retrospective found no issues. The capacity repair is ready for coordinator close; 062's independent contrast refinement remains pending.
- 2026-09-15 UTC - Closed T001@61c8a4e2 and completed Work Inspection Source Capacity through normal Lightweight execution after fresh verification and independent approval. The canonical task is done, its derived board is rendered, and post-close lint reports zero failures. No old Work invocation was resumed, no 062 task or approval state changed, and no commit or push was performed.
<!-- dude:managed:end -->
