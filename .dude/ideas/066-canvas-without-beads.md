---
title: Canvas Without Beads
slug: canvas-without-beads
status: defined
spec_path: .dude/specs/066-canvas-without-beads/spec.md
---

# Idea: Canvas Without Beads

## Idea

The user asked whether Windows might probe for Beads even when it is not installed and whether that could explain a failure. They plan to restart the app soon and said, "if this is a problem we need to record to be fixed". Record any confirmed problem for later repair, without defining or implementing a fix now.

## Open Questions

1. In a confirmed Lightweight-only workspace, should Canvas mention that optional Beads is unavailable, or show normal Lightweight status without a warning?
   Answer:

## Assumptions

No user-supplied assumptions recorded.

<!-- dude:managed:start -->
## Observed Behavior And Reproduction

Coordinator-supplied evidence, not rerun by the Spec Lead:

- Windows, Node `v24.21.0`: `Get-Command bd` found no executable on this session's `PATH`; `Test-Path .beads` returned false. The source and generated `.github/extensions/dude/lib/projection.mjs` bytes are identical.
- Source tracing shows `readWorkIndex({root})` unconditionally reaches `queryTrackedIssues -> invokeBd -> execFile('bd', ['list', '--all', '--limit', '0', '--json'], ...)`. Missing-executable errors become `TRACKED_AUTHORITY_UNAVAILABLE`; with no established board, the Lightweight branch is not entered. The selected `readNowProjection` path returns `failedProjection` for this query failure. This code is not Windows-only, and absent-database handling differs from unavailable-executable handling. Authored-source anchors: `execFile` at 179, `invokeBd` at 249-280, `queryTrackedIssues` at 454-468, and tracked probes at 1568 and 1904.
- The real generated `readWorkIndex`, using its default process runner, returned Feature 062 with `lane: null`, `basis: 'not-established'`, `group: null`, `taskCounts: null`, and unavailable status: "Work status has not been established."
- A synthetic empty-tracked-board control, `runBd: () => ({status: 0, stdout: '[]', stderr: ''})`, against the same root returned Feature 062 with lane `lightweight`, basis `canonical-lifecycle`, group `active`, current availability, and counts of 5 total, 1 open, 1 in progress, 0 blocked, and 3 done. This control does not prove installed or functioning Beads. The read-only reproduction changed no repository files.

## Goal, Boundaries, And Evidence Limits

The confirmed problem is loss of Canvas Lightweight status when optional `bd` is unavailable in this environment. The goal is reliable optional-Beads handling without selecting an implementation. Any future fix must preserve genuine initialized/imported-tracked precedence and failure safety; a blanket fallback must not promote a markdown mirror to a live board when tracked authority fails.

Feature 062 is only a reproduction subject. Its separate stopped Ship admission for `T004@d062f4a7` supplied `lane: {kind: 'lightweight'}` directly and invoked no `bd` probe. That stop was `evidence-incomplete`, detail `retainedEvidence: invalid current-run`, subject `occurrence-retention`; the original capture covers 14 of 21 canonical T004 events. This draft neither explains that stop nor reopens, alters, or duplicates Feature 062, its tasks/history, or its evidence-recovery request. No dependency or priority is declared.

Session `PATH` absence does not establish that Beads is uninstalled. Installation success, post-restart `PATH` and behavior, and other-platform runtime results remain unverified.

## Definition Scope

Restore normal Canvas inventory and selected-feature status for confirmed Lightweight-only workspaces without an optional-Beads warning. Preserve populated tracked authority and visible failures where authority is configured, required, or uncertain.

The first-definition package at `.dude/specs/066-canvas-without-beads/` contains the specification, implementation plan, and one bounded open task. It changes no visual contract or execution workflow. The captured evidence above remains historical; the user's question answer and assumptions remain unchanged.
<!-- dude:managed:end -->

## Coordinator Log

- 2026-09-19: First capture staged as a draft for later repair from the corrected user intent and coordinator-supplied evidence. No definition or implementation performed.
- 2026-09-21: First definition staged for .dude/specs/066-canvas-without-beads/spec.md with one open task, T001@c066b7a1, to restore optional-Beads Canvas reads while preserving tracked authority. No implementation, execution-state change, or new reproduction performed.
- 2026-09-21T01:02:01Z - Work initial claim: T001@c066b7a1 under Ship canvas-without-beads. Restore optional-Beads reads with focused regressions, bounded projection, and related documentation; preserve tracked authority and all unrelated 062 work. No Git or release action.
- 2026-09-21T03:21:53.687Z - Closed T001@c066b7a1 through the autonomous adapter's committed lane receipt; the runner ended task-settled after two admitted attempts and no 066 task remains ready. Final independent verification passed 117 focused tests and 14 current-slice predicates; Reviewer approved. Four unchanged documentation-contract failures remain recorded as qualified baseline defects. Source/generated parity and unrelated work were preserved. The single retrospective recorded an unexecuted Major advisory about final-validation failure followed by absence refresh; no additional work was created. No history rewrite or Git/release action.
