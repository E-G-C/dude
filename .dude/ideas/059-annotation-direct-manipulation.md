---
title: Annotation Direct Manipulation
slug: annotation-direct-manipulation
status: draft
spec_path:
---

# Idea: Annotation Direct Manipulation

## Idea

From trying the newly landed double-click-to-comment gesture on the real desktop Canvas. The user's words, with only clear transcription slips corrected:

> "to be able to add a comment I have to select the selection tool, and then double click the shape. if I create and double click it won't open, what I see is that after a markup is created it should retain focus and the user should be able to double click to add a comment, some "hotspot" ( not sure how to call it ) to move it and resize it if lines are dragged."

> "you could use inspiration from Snagit for example"

On sequencing:

> "I would like to move forward with our main purpose so I think we're gonna brainstorm it and push it for later as a fix. I'm more excited about keep building the main goal about Dude's UI"

## Open Questions

For later definition and design; these do not block this brainstorm capture.

1. **Drawing versus grabbing:** With a drawing tool still armed, how should a press on an existing shape distinguish starting a new overlapping shape from grabbing the existing one? The Snagit reference keeps the just-drawn object live with handles while treating presses elsewhere as new shapes. Is that the desired interaction here, or should the overlap case work differently? This is a reference to consider, not a chosen solution.

   **Your answer:**

2. **Which shape stays live:** Should direct manipulation while drawing apply only to the most recently created shape, or to any selected annotation?

   **Your answer:**

3. **Armed tool after interaction:** What should happen to the armed tool after the user interacts with an existing shape? Should the deliberate "drawing tool stays selected" behavior otherwise survive unchanged so several shapes can still be drawn in a row?

   **Your answer:**

## Assumptions

No additional assumptions supplied. The interaction choices above remain open.

<!-- dude:managed:start -->
## Normalized Intent

One deferred idea about direct manipulation of annotations in the Review surface: newly created markup should feel live for double-click-to-comment, moving, and resizing without first switching to Select. Preserve the user's uncertainty about the "hotspot"; the conventional term is a selection handle, but that terminology does not settle the interaction design.

Snagit is an intentional, relevant reference for the transition between drawing and manipulating markup, not approval to copy its entire interaction model.

## Core Problem And Verified Context

The following source diagnosis and review history were supplied as verified facts by the coordinator. This capture does not claim a new reproduction, review, or test run.

- After drawing a shape, `ui/review/engine.mjs:502` sets `state.selectedId = a.id`: the new shape **is already selected**.
- `ui/review/engine.mjs:504` then reports `"<tool> added. The drawing tool stays selected."` This is deliberate, allowing several shapes to be drawn in a row.
- In `ui/review/shapes.mjs:62-68`, `renderSelection` paints the dashed outline **and the 9x9 grab handles** whenever an annotation is selected, regardless of the active tool.
- But `ui/review/engine.mjs:590-592` gates **both handle-grabbing and marker hit-testing** on `state.tool === 'select'`.

**The core problem is a false affordance:** the UI draws working-looking grab handles that do nothing until the user switches to Select. Selection is retained, but the visible manipulation affordances are not actionable. This explains why the behavior feels broken rather than merely incomplete; it is not simply a failure to select the newly drawn shape.

## Known Issue: Out-And-Back Drag Opens Comments

The already-landed double-click-to-comment gesture has a known, independently reviewed, still-unfixed defect in `ui/review/engine.mjs`:

- The recognizer decides whether a press was a drag that cannot prime a comment-opening click using **final annotation equality**, `!same(state.annotations, current.before)`, rather than whether movement actually occurred.
- `pointerMove` rebuilds geometry from `drag.origin`, so dragging a shape out and back to its starting position restores exact equality.
- Drag a shape away and back, release, then single-click the same point within 500 ms: Comments opens on that **single click**.
- A qualifying second press that itself drags out and back opens Comments too.

The reviewer's required correction is behavioral: once a press actually moves or resizes an annotation, disqualify both its own double-press intent and its candidacy for the next press, even if the geometry later returns to origin. Final equality may remain the history-commit condition. No recognizer implementation is chosen during intake.

This was reviewed twice. The second round found this continuation, it was escalated to the user, and the user chose to defer it here. Keep it in this one idea because the direct-manipulation work will rework the same gesture recognizer; a separate record would scatter that work.

Everything else in that change landed and is reported green: box interiors and number badges are hit-testable, double-click-to-comment works from the Select tool, Enter parity works, and focus correctly lands in the **Comment (optional)** field. Preserve that context without treating the known defect as fixed.

## Scope And Deferral

Capture this as a later fix, not an interruption to building Dude's main UI. Scope stays with Review annotation direct manipulation and the known defect in its comment-opening gesture; no broader Canvas redesign or additional outcome is introduced.

Definition and design must settle the drawing-versus-grabbing ambiguity and tool behavior. This brainstorm chooses no solution and creates no definition package or tasks. Existing project guardrails apply; no new project-specific guardrail candidates are proposed.

## Coordinator Log

- 2026-09-12 13:39:13 UTC - First-capture brainstorm staged for `annotation-direct-manipulation` from the user's desktop Canvas feedback and coordinator-verified findings, including the reviewed unfixed gesture defect. Deferred for later; awaiting coordinator publication. No lifecycle number or definition package assigned.
<!-- dude:managed:end -->
