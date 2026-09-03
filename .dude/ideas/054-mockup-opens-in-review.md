---
title: Mockup Opens in Review
slug: mockup-opens-in-review
status: draft
spec_path:
---

# Idea: Mockup Opens in Review

## Idea

> "also one functionlaity that is not in Sharpie yet, is when a mockup is requested, to open directly in sharpie, rather that user having to locate the file and open it"

Today, when Dude produces or updates a design mockup, the user has to find the
file and open it themselves. The user wants the mockup to open directly in the
visual review canvas instead. In the user's framing, this functionality does
not exist in Sharpie yet.

## Open Questions

1. Where should this capability live: as a change to Sharpie itself, as a
   change to the design workflow that opens the existing Sharpie canvas, or
   split across both?
   Recommendation: the design workflow should own the decision to open, and
   Sharpie should stay a general-purpose viewer that accepts a path. That keeps
   Sharpie reusable and puts the workflow knowledge where the exact
   `preview_path` already lives. The user framed this as "not in Sharpie yet",
   so their framing may differ.
   Answer:

2. When should it open automatically: on every mock create or update, only on
   first creation, only when the user asks to see it, or on an explicit
   approval checkpoint?
   Recommendation: open on creation and on an explicit request to view, and on
   later updates focus the already-open panel rather than reopening. Automatic
   reopening on every incremental edit risks stealing focus during a fast
   iteration loop.
   Answer:

3. How should the panel be addressed so repeated opens do not spawn
   duplicates?
   Recommendation: derive a stable `instanceId` from the feature identity so
   the same feature's mock always reuses one panel, since re-opening a known
   `instanceId` focuses and reloads instead of duplicating. Leave the exact
   derivation to definition.
   Answer:

4. What happens when the review canvas is unavailable or not installed?
   Recommendation: degrade to reporting the exact `preview_path` as today,
   never fail the design loop, and never block mock creation. State plainly
   that review is unavailable and how to enable it.
   Answer:

5. Does this cover only the primary `preview_path` artifact, or also supporting
   files, screenshots, and multi-file mocks?
   Recommendation: scope it to the one canonical primary artifact first,
   since the design workflow already treats that as the sole orientation
   entrypoint and live authority.
   Answer:

6. Does this depend on the Sharpie code being copied into this repository, as
   feature 052 plans for its later Review cycle, or should it work against
   Sharpie as a separately installed extension?
   Recommendation: define the behavior against the canvas contract rather than
   against a particular copy, so it holds either way. Sequencing against 052's
   later Review cycle remains a real open question.
   Answer:

## Assumptions

- **Coordinator working assumption:** This is one bounded connection
  capability: remove the manual step between Dude producing or updating a
  mockup and the user viewing it in the visual review canvas.
- **Coordinator working assumption:** This idea remains separate from feature
  052 and idea 053; neither is expanded by this capture.
- **Coordinator working assumption:** The verified context below records the
  current evidence and available contracts without resolving the open product
  choices on the user's behalf.

<!-- dude:managed:start -->
## Normalized Intent

- Remove the repeated need for the user to locate and manually open a design
  mockup after Dude creates or updates it.
- Connect the design workflow's known mockup path to the visual review canvas
  so the intended artifact can open directly for review.
- Preserve the user's framing that this capability does not exist in Sharpie
  yet while leaving component ownership open for definition.
- Keep this as a focused connection between existing endpoints rather than
  folding in critique, a broader Review surface, or unrelated canvas behavior.

## Coordinator-Verified Findings

### Demonstrated friction

- During feature 052's design work, several mockups were produced under
  `.dude/specs/052-dude-canvas-ui/design/`. Each time, the user had to be handed
  a URL or path and open it themselves.
- A local static file server was started purely so those artifacts could be
  viewed. That manual step is exactly what this idea would remove.

### Existing pieces that can connect

- The `dude-pack-design-workflow` already names one exact primary artifact
  through `preview_path` in the feature's `spec.md`. Every design-loop response
  that creates, updates, or resumes the mock must report that exact current
  path, so the system already knows which file should open.
- Sharpie is a working Copilot canvas extension in the separate `E-G-C/sharpie`
  repository at `.github/extensions/sharpie/`.
- Sharpie's canvas declares `id: "sharpie"` and an open `inputSchema` with
  `path` for a project-relative HTML, image, or PDF file, `page` as a number for
  PDFs, and `blank` as a boolean for a blank artboard.
- Sharpie exposes `list_sources`, `load_page`, `set_page`, `set_device`, and
  `get_latest_submission`.
- The mechanism plausibly exists on both sides already: the design workflow
  knows the exact path, and the Sharpie canvas accepts a path when opened. The
  missing piece is the connection, not either endpoint.
- On the host side, `open_canvas` takes a `canvasId` and a caller-chosen
  `instanceId`. Re-opening the same `instanceId` focuses and reloads the
  existing panel instead of creating a duplicate. This is directly relevant to
  repeatedly opening the same mock across a design loop without spawning
  panels.

### Relationship to existing work

- Feature `052-dude-canvas-ui` deliberately defers all copied Sharpie/Review
  behavior to a later cycle and ships only the read-only Now cockpit. This idea
  must not be folded into 052.
- Idea `053-design-stage-critique` concerns adversarial critique during design
  and is separate from opening a mockup for review.
- The standing project guardrail requires every UI feature to have an approved
  mockup before UI source is written. This makes mockup review a mandatory,
  repeated step and raises the value of removing the manual-open friction.

## Constraints

- Preserve the user's framing that the functionality is not in Sharpie yet.
- Do not fold this outcome into feature 052 or idea 053.
- Do not resolve component ownership, automatic-open timing, panel identity,
  unavailable-canvas behavior, artifact breadth, or sequencing against 052's
  later Review cycle without the user's answers.
- Keep the first definition focused on the demonstrated manual-open friction;
  do not introduce speculative viewer, workflow, state, or review capabilities.
- This brainstorm creates one idea ledger only. Definition, package artifacts,
  tasks, and implementation require a later explicit workflow action.

## Definition Checklist

- [x] One bounded capability is captured
- [x] The user's original wording and Sharpie framing are preserved
- [x] The demonstrated feature-052 friction is recorded
- [x] The design workflow's exact `preview_path` contract is recorded
- [x] Sharpie's canvas input and action contracts are recorded
- [x] The host's stable-`instanceId` reuse behavior is recorded
- [x] Separation from feature 052 and idea 053 is explicit
- [ ] Component ownership is unresolved
- [ ] Automatic-open timing is unresolved
- [ ] Stable panel addressing is unresolved
- [ ] Unavailable-canvas fallback is unresolved
- [ ] Primary-artifact versus multi-file scope is unresolved
- [ ] Sequencing against feature 052's later Review cycle is unresolved

## Coordinator Log

- 2026-09-02 UTC - brainstorm first-capture draft staged for coordinator publication; captured the request to open Dude-produced or updated mockups directly in the visual review canvas, the demonstrated feature-052 friction, the existing design-workflow and Sharpie canvas contracts, six unanswered questions, and separation from feature 052 and idea 053; definition deferred to explicit `define mockup-opens-in-review`
<!-- dude:managed:end -->
