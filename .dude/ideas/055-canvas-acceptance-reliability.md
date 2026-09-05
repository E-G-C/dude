---
title: Canvas Acceptance Reliability
slug: canvas-acceptance-reliability
status: defined
spec_path: .dude/specs/055-canvas-acceptance-reliability/spec.md
---

# Idea: Canvas Acceptance Reliability

## Idea

Harness stability and reliability are more important than new UI. Repeated
Feature 052 canvas mismatches escaped to human dogfood. Make browser acceptance
reproducible and required, exercise one rendered flow through the real provider,
and cover the observed interactions before asking for human host validation.

The user accepted browser reliability first, separately from Ship orphan cleanup:
"That sounds good, go ahead and ship it. Do not over engineer it, keep it simple.
YAGNI". Keep the existing dependency-free Node/Chrome DevTools Protocol (CDP)
runner. Feature 052 shipped only the read-only Now cockpit; this work does not
reopen its deferred interactive UI.

## Open Questions

None from the accepted scope. True host-only behavior remains the explicit
human smoke boundary below, not something browser-tab evidence can establish.

## Assumptions

Working assumptions, not additional user answers:

- Existing project guardrails are sufficient; no new rule is proposed.
- The static findings identify acceptance gaps. They do not establish a newly
  reproduced product regression or justify speculative runtime hardening.
- Browser-first is prioritization only. This outcome has no dependency on the
  separate Ship cleanup outcome or on lifecycle allocation order.

<!-- dude:managed:start -->
## Scope And Evidence

The coordinator/reviewer supplied four static findings. Source inspection
confirms the CI setup, hardcoded paths, fixture-backed browser entry point, and
760/light selected-open case. No browser run was performed during capture or
definition. Keep these findings in one small sequence, with both P1 gaps first:

1. **P1: Required browser acceptance.** `.github/workflows/ci.yml` runs recursive
   tests on Ubuntu without installing scoped UI dependencies.
   `scripts/dude-canvas-ui/browser.test.mjs` hardcodes a macOS Edge executable
   and skips when that executable or scoped dependencies are absent. Preserve
   intentional dependency-free local and recursive skipping. Add an explicit
   required browser CI path with scoped lockfile installation and a supplied
   headless executable; missing prerequisites or skipped browser coverage must
   not produce a passing result. Reuse existing build-parity checks against the
   committed artifacts and keep dependency directories out of recursive test
   discovery. Use the existing runner, with no new browser or test framework.
   Release consumers remain install-, network-, and build-free.
2. **P1: One rendered real-provider flow.** The rendered tests use
   `createFixtureServer` and invented projection responses, including
   `refreshPayload`; production server tests fetch the bundle without executing
   it. Exercise the committed bundle through actual `openInstance`,
   `readNowProjection`, and production refresh/freshness routes in a disposable
   realistic repository with at least 50 features, using the existing `bd`
   process-fixture pattern. Reach 052 and preserve committed selection versus
   typed query versus pending target across delayed reads, successful selection,
   and refusal/error transitions. Cover exact no-database exit 1 fallback and
   generic nonzero/error results that retain a truthful prior projection.
   `src/extensions/dude/projection.test.mjs` already covers exact no-database
   fallback; preserve it rather than claiming a new product fix. Exercise
   changed-source detection and explicit fresh refresh through their existing
   caller. Keep runtime payload contracts unchanged. Delete impossible
   two-digit canonical fixture paths rather than hardening hypothetical input.
3. **P2: Run-bounded evidence output.** The artifact root points at an earlier
   absolute user-session path. Use a unique per-run child under temporary storage
   or a caller-specified output parent, and report its location. Include this
   small portability correction with required execution because the fixed path
   otherwise blocks CI. Screenshots are evidence only; add no general
   screenshot-comparison infrastructure.
4. **P2: Selected-open matrix.** The existing selected-open case runs at
   760/light. Extend it to 360, 760, and 1440 pixels in light and dark appearance
   for full committed-row visibility, no unintended clipping/overflow, actual
   pointer hitability, and WCAG 2.2 AA target sizes or applicable measured
   criterion exceptions. Preserve current click-count, full-list,
   canonical-number, query-semantics, Tab-noncommit, long Next source text,
   focus, accessibility-tree, and contrast coverage. Add no UI redesign or
   surface.

## Success Boundary

The required CI path executes browser acceptance and cannot pass by skipping.
A positive execution witness and a deliberately broken existing assertion in a
disposable copy demonstrate the gate. The real-provider flow demonstrates the
existing read-only cockpit against realistic canonical data; the responsive
matrix and isolated output cover the two P2 gaps. Complete the automatable
user-observable interaction script before host dogfood.

Provider discovery inside the actual host, iframe theme/focus/resizing, and host
reload lifecycle remain a narrow human smoke check. A standalone browser tab
does not provide real-host evidence.

Needs You, answers, commands, Sharpie/Review, backlog, memory, team, and packs
remain deferred. Feature 052 stays closed; do not create further UI ledgers or
change the shipped scope. Ship orphan work belongs to captured 056 and is not a
dependency. The unrelated model-map edit and profile generation remain outside
this package.

## Definition Package

The core trio is staged for
`.dude/specs/055-canvas-acceptance-reliability/spec.md`, with three proposed
implementation tasks: required portable acceptance, a real-provider browser
flow, and the selected-open matrix. Existing guardrails suffice and no
clarification remains. Publication, lint, and independent readiness review
remain coordinator-owned handoffs; this log does not claim their completion.

## Coordinator Log

- 2026-09-04T21:22:30-04:00 - Brainstorm capture staged for `canvas-acceptance-reliability` from accepted intent and attributed static findings; awaiting first-capture publication. Definition is a separate explicit subaction; no lifecycle number or package path assigned.
- 2026-09-04T21:25:58-04:00 - Explicit definition staged for `.dude/specs/055-canvas-acceptance-reliability/spec.md` from `.dude/ideas/055-canvas-acceptance-reliability.md` as a pre-Work Ship subaction; core trio and three initial tasks cover all four acceptance gaps, with existing guardrails and unchanged user intent, pending transactional publication and coordinator lint.
- 2026-09-05T01:44:02Z - Ship selected Lightweight Execution after confirming no Beads database, resolved this exact owner, and claimed T001@055ci001 for portable required browser acceptance and isolated evidence output. Independent definition review approved the three-task package; publication and coordinator lint succeeded after correcting the audit breadcrumb position. Feature 056 remains an independent draft with an unresolved supervisor-absence proof boundary.
- 2026-09-05 02:02:25 UTC - The initial Work invocation stopped before authorization with evidence-incomplete on owner-log because the event reader rejected the generated ISO date-times. The user authorized a bounded compatibility repair and a fresh Ship run. Coder extended only event-start recognition, Tester supplied exact-byte and malformed-content regressions, and independent Reviewer approved; nine focused checks and coordinator lint passed. Existing log bytes and the user model mapping were preserved. A new invocation now selects the already-claimed T001@055ci001; 056 remains deferred.
- 2026-09-05 02:28:29 UTC - The prior fresh invocation refused admission because T001@055ci001 still had a claim/checkpoint pair. The user supplied the exact requested cleanup and fresh-Ship confirmation. With no active shell sessions, the coordinator re-resolved the owner and task, matched both artifacts to the approved byte fingerprints and exact target, removed only that pair, and confirmed both paths absent. A new Ship invocation will take a fresh exclusive claim; no old RunState is resumed and 056 remains deferred.
- 2026-09-05 02:55:14 UTC - Work settled T001@055ci001 with one authorized implementation attempt and committed lane receipts after independent Tester and Reviewer acceptance. The coordinator continues the same Ship request and normalized policy with newly claimed T002@055real2 for the real-provider browser flow; T003 remains pending and 056 remains deferred.
- 2026-09-05 03:16:05 UTC - Work settled T002@055real2 after the real-provider flow and independent acceptance, preserving two authorized attempts and zero recovery charges across the request. The coordinator now claims the remaining T003@055grid3 selected-open matrix task under the same Ship policy; prior completed work and deferred 056 remain unchanged.
- 2026-09-05 03:44:11 UTC - Closed Canvas Acceptance Reliability after Work settled T003@055grid3 with committed lane receipts and all three canonical tasks done. The final independent Tester and coordinator runs each passed 118 focused checks, the final Reviewer approved the bounded feature, and the single advisory retrospective found no issues. The request ended at no ready task with three authorized attempts and zero recovery charges. Hosted CI and actual host execution are not claimed; 056 remains deferred, the original UI scope is unchanged, and no commit or push was performed.
<!-- dude:managed:end -->
