---
title: Annotation Direct Manipulation
slug: annotation-direct-manipulation
work_type: design
design_status: approved
approved_direction: "Selected handles resize, selected borders/strokes move, and drawing continues elsewhere with the tool armed; revision baa97f8c"
preview_path: .dude/specs/059-annotation-direct-manipulation/design/review-direct-manipulation.html
---

# Design Proposal: Annotation Direct Manipulation

## Purpose

Review already keeps a newly drawn annotation selected and displays its handles, but those handles cannot be used while a drawing tool is armed. The reviewer must switch to Select to adjust the mark or open its comment. Make the displayed affordances work without interrupting continued drawing.

Correct the related comment gesture at the same time: moving a mark away and back must never turn a later single press, or a moving second press, into a request to open Comments.

## Scope And Surfaces

The surface is the existing Review annotation viewport and its current Comments interaction. With Box, Circle, Arrow, Line, or Highlight armed, existing selected handles resize and selected shape borders or strokes move. Other locations remain available for drawing, including interiors away from borders. The current visible selection is eligible regardless of when it was created.

Retain the existing Review appearance, floating seven-tool palette, comment pins, keyboard alternatives, Undo/Redo, working-save behavior, and report/image workflow. The new drawing-mode targets concern drawn shapes; comment pins retain their present Comment/Select behavior and gain no resize handles.

Out of scope: grabbing or selecting unselected objects while drawing, newest-only rules, new handles or tools, multiple selection, new saved annotation formats, a second annotation controller, and changes to the broader 062 shell, Settings, or Kanban. The lifecycle number identifies capture chronology, not priority or execution order.

The primary proposal is `.dude/specs/059-annotation-direct-manipulation/design/review-direct-manipulation.html`. Its required prototype files, assets, and preserved variants belong under the same `design/` directory. The working proposal and its viewing limits are recorded under Proposed Direction; it remains unapproved.

## User Scenarios & Testing

### User Story 1 - Adjust a selected shape and keep drawing (Priority: P1)

As a reviewer marking a design, I want to adjust the selected shape without changing tools, then draw another mark where I need it.

**Independent Test**: Start with a fresh review and a visible selected shape. Exercise the five armed drawing tools against existing corner and endpoint handles, borders/strokes, safe interiors, and other marks. Repeat with an older annotation selected through an existing selection control.

**Acceptance Scenarios**:

1. **Given** a newly drawn shape and its drawing tool still armed, **When** the reviewer drags an existing handle, **Then** that shape resizes, no extra annotation is created, and the tool stays armed.
2. **Given** a selected shape, **When** the reviewer drags its border or stroke away from a handle, **Then** the entire shape moves without changing its dimensions or creating another mark.
3. **Given** a sufficiently large selected closed shape, **When** the reviewer starts a drawing inside it away from the border and handles, **Then** a new mark is drawn with the armed tool and the original shape is unchanged.
4. **Given** an older selected shape and a different drawing tool armed, **When** the reviewer manipulates a handle or border, **Then** the same rules apply as for the newest shape.
5. **Given** a location that belongs only to an unselected mark or a number badge, **When** a drawing begins there, **Then** no object is grabbed or selected instead. A coincident selected handle or border still follows normal target precedence.
6. **Given** an editable review, **When** the pointer crosses a selected handle, selected border/stroke, and drawing space, **Then** its cursor respectively indicates resize, move, and draw without changing selection or geometry.

### User Story 2 - Open the intended comment without accidental activation (Priority: P1)

As a reviewer, I want two unmoved presses on the selected shape to open its comment, while moving or resizing remains only an adjustment.

**Independent Test**: Use a selected shape in a fresh review. Test a qualifying pair of border/stroke presses, an out-and-back first press followed by one unmoved press, and an unmoved first press followed by an out-and-back second press. Observe Comments, selection, geometry, and Undo/Redo separately.

**Acceptance Scenarios**:

1. **Given** a drawing tool is armed and a shape is selected, **When** two unmoved presses qualify on its border/stroke, **Then** releasing the second press opens Comments once and focuses that annotation's Comment field. The tool stays armed and no mark is added.
2. **Given** a selected shape moves away and returns to its exact starting geometry before release, **When** one unmoved press follows at the same point within the normal double-press interval, **Then** Comments does not open.
3. **Given** one qualifying unmoved press, **When** the second press moves the shape away and back before release, **Then** Comments does not open. That moving second press cannot prime the next single press either.
4. **Given** a handle resize, an interior drawing, a cancelled press, or a nonqualifying press pair, **When** the gesture ends, **Then** it does not open Comments as a drawing-mode border/stroke double press.
5. **Given** an out-and-back adjustment with no final geometry change, **When** the reviewer uses Undo or Redo, **Then** no extra geometry-history step was introduced and an existing redo opportunity was not lost.
6. **Given** a selected annotation and focus on the review viewport, **When** the reviewer presses Enter, **Then** the existing comment-opening and caret behavior remains available without a pointer gesture.

### User Story 3 - Keep the established Review workflow (Priority: P2)

As a reviewer with saved or anchored markup, I want the new gesture to preserve the selection, keyboard, and evidence behavior I already use.

**Independent Test**: In a separate review, select overlapping marks and badges with explicit Select, create a comment pin, edit coordinates and comment text by keyboard, adjust a shape, save and reopen the same eligible work, and produce the existing sealed report and image. Repeat the relevant targeting checks after document and nested scrolling.

**Acceptance Scenarios**:

1. **Given** explicit Select, **When** a point hits overlapping marks, a box/highlight face, or a number badge, **Then** existing topmost selection, movement, resizing, and comment-opening semantics remain intact.
2. **Given** the existing Comment tool or element-based comment action, **When** a pin is added and edited, **Then** it uses the current Comments path, remains non-resizable, and preserves literal text and the remembered caret.
3. **Given** a valid adjustment with a final geometry change, **When** the reviewer undoes and redoes it, **Then** one Undo restores the preceding geometry and one Redo restores the adjustment.
4. **Given** an annotation anchored to the reviewed content, **When** the content is scrolled or the host panel is made smaller, **Then** the mark retains its original anchor and reviewed geometry rules. Hidden or clipped-away targets do not become drawing-mode grab targets.
5. **Given** valid adjusted markup, **When** it is saved, reopened through the existing eligible path, and sealed, **Then** its geometry and literal comments survive and the report and annotated image describe the same current reviewed source. Saving or sealing does not imply delivery or approval.
6. **Given** unavailable, stale, or read-only review authority, **When** the reviewer attempts the new gesture, **Then** no annotation is edited, no live authority is restored, and retained work is not retargeted.

## Functional Requirements

- **FR-001**: Retain the current selection after drawing and tool changes. Apply direct manipulation to the current visible selected shape, including an older reselected shape, without a recency rule.
- **FR-002**: While any of the five drawing tools is armed, route a selected handle to resize, a selected border/stroke to move, and other locations to the existing drawing behavior. Handles win where targets overlap. Do not use whole faces, number badges alone, or unselected annotations as new grab targets.
- **FR-003**: Preserve the current move/resize constraints and geometry validity rules. Manipulation must affect only its selected target, create no additional annotation, and leave the drawing tool armed. A successful new drawing keeps the existing new-selection behavior.
- **FR-004**: Show a resize cursor at an actionable selected handle, a move cursor at an actionable selected border/stroke, and the drawing cursor elsewhere in drawing mode. Hover must not mutate markup, save work, or suggest an unavailable manipulation.
- **FR-005**: Open Comments through the existing selected-annotation action after two completed unmoved border/stroke presses on the same selected shape. Preserve the existing double-press timing and proximity behavior and decide opening on the second release. Handles and drawing-only locations do not qualify.
- **FR-006**: Any actual move or resize during either press disqualifies that press from opening Comments and from priming the next press, even if its final geometry equals its starting geometry. Cancellation and nonqualifying targets must not leave an eligible half-gesture.
- **FR-007**: Keep comment recognition separate from geometry history. A valid adjustment with a final geometry change produces one undoable change; an unmoved or out-and-back adjustment with no final geometry change produces none and preserves existing redo history. Uncommitted pointer previews must not replace the last committed geometry in a working save.
- **FR-008**: Preserve explicit Select's existing topmost hit order, box/highlight whole-face and badge targeting, circle/segment targeting, move/resize behavior, and double-press comment opening. FR-006 also corrects out-and-back recognition in Select.
- **FR-009**: Preserve Enter on the selected annotation, the existing Comments entry controls, literal text, comment-field focus, remembered caret/range, and close/reopen behavior. Keep numeric coordinate editing and the current keyboard alternatives usable.
- **FR-010**: Retain all seven tools, the floating palette and its movement/orientation controls, Line and existing arrow drawing behavior, comment-pin creation, Undo/Redo, and existing shortcuts. Do not add a new tool or resize handle.
- **FR-011**: Preserve working saves, eligible restoration, sealing, the paired report and annotated image, and their source/asset and ownership checks. Gestures grant no delivery, acknowledgment, approval, or renewed request authority.
- **FR-012**: Use the existing reviewed frame, scroll projection, visibility, clipping, and editability boundaries. New targeting must not reach hidden or clipped-away selected affordances, move the reviewed frame, rewrite an anchor, or allow edits during unavailable review states. Existing invalid-edit and cancellation behavior retains committed work.
- **FR-013**: Demonstrate the proposed interaction working with the actual Review functionality before requesting design approval. The implementation owner must declare what can be faithfully demonstrated before the first render. Keep exploration within the canonical design artifact set, preserve variants, and obtain explicit approval of the exact demonstrated primary artifact and asset revisions before changing the live UI. Disclose fixture-only behavior; never substitute a simulation, inherited approval, or weakened safety boundary for proof.

## Edge Cases

- Handle/border intersections use resize. A circle's enclosing rectangle or a segment's bounding-box interior is not a new whole-face move target.
- Very small shapes may have no interior outside the existing handle/border tolerance. Only interiors away from those targets are drawing space; this feature does not shrink handles or change minimum valid sizes.
- A selected older shape may overlap a newer unselected shape. Drawing-mode targeting considers only the selected shape's eligible affordances; explicit Select retains its different topmost behavior.
- A badge may overlap a genuine selected target. The underlying handle/border rule applies there; the badge adds no drawing-mode target of its own.
- Presses separated beyond the existing time or distance tolerance, presses on different annotations, handle interactions, interior drawings, and cancelled gestures cannot be treated as the specified border/stroke pair.
- Test both first-press and second-press out-and-back movement, plus out-and-back resizing. Final equality does not erase the fact that manipulation occurred.
- Exercise cancellation during a preview, a working save during a preview, invalid final geometry, and Undo/Redo after a no-net-change gesture.
- Exercise document scrolling, nested scrolling, outer panning, display scaling, and clipped selection chrome. A pointer outside the reviewed frame or effective visible region must not become a clamped grab point.
- A changed source, lost request authority, or missing faithful preview capability remains a refusal or design gap, not permission to create a replacement authority or relax the review boundary.

## Key Concepts

- **Selected annotation**: The one annotation already selected by Review; creation time does not give another annotation special authority.
- **Armed tool**: The current drawing or selection action, separate from which annotation is selected.
- **Manipulation gesture**: One press through release or cancellation, including whether it actually moved or resized a mark and whether the final geometry changed.
- **Reviewed view and evidence**: The original source, viewport, scroll and anchor context, working markup, and sealed report/image. Their existing ownership and meaning are unchanged.

These concepts require no new persistent record or public contract.

## Visual Intent

### Should Feel

Use the Snagit-inspired selected-object convention requested by the user: handles adjust size, selected borders or strokes move a mark, and drawing continues elsewhere without a mode switch. Newly drawn and older selected marks have the same working affordances. Keep the drawing tool armed, and let the cursor describe the action that will actually happen.

### Should Never Feel

Avoid inert handles, an invisible newest-only exception, interior presses unexpectedly grabbing another mark, and comment drawers opening after a drag. This is an interaction correction within the existing Review, not a visual redesign.

## Brand Fit

Retain the current desktop Review styling, marker appearance, focus treatment, and responsive controls. Continue the established Canvas design baseline and delivered Review capabilities rather than recreating the shell. No new color, typography, spacing, or icon system is needed.

Retain WCAG AA contrast and existing keyboard-equivalent paths for small geometry handles. The drawing gesture must not be the only way to edit geometry or open a comment.

## Proposed Direction

**Selected handles and boundaries, with drawing still armed.** This working direction is proposed for exact-revision approval. Handles take precedence over boundaries; safe interiors and other locations remain drawing space. Two unmoved selected-border/stroke presses open the intended comment, while any actual manipulation disqualifies the press even if the mark returns to its starting geometry. Explicit Select retains its whole-face, topmost, and badge behavior.

The proposal reuses the actual Review interface and its single annotation/history owner, including the movable seven-tool palette, Comments focus and caret, Enter, Undo/Redo, and working saves. The [implementation owner's capability declaration](design/evidence/capability-declaration.md) records the real functionality and fixture boundary. No new controller, visual system, or layout direction is proposed.

Inspect the working link supplied with the approval request. The canonical HTML is an outer host that needs its existing fixture driver; opening it directly or inside a static source wrapper shows fallback copy, not the working interaction. Save writes real fixture work, and Send seals and delivers feedback within the isolated fixture provider. These fixture operations create no live owner response, design approval, or acknowledgment, and do not touch the user's live review. Give approval or revision feedback through the current owner handoff, not the fixture's Send control.

The final coordinator reruns below are the T001 behavior basis. They were read during this settle, not executed by the Spec Lead; the adversarial report's filename does not give this rerun independent Tester attribution.

| Report | Recorded result |
| --- | --- |
| [Unavailable-cursor regression, 22:40:50](design/evidence/regression-unavailable-cursor-2026-09-15T22-40-50-620Z.json) | 3/3 cases pass across both availability-loss entry paths. |
| [Working interaction proof, 22:40:58](design/evidence/proof-2026-09-15T22-40-58-223Z.json) | 11/11 groups pass, including 25 armed-tool/selected-shape cells, comment exclusion, history/redo, committed-only saves, keyboard, and rendered observations. |
| [Adversarial rerun, 22:41:28](design/evidence/independent-t001-2026-09-15T22-41-28-757Z.json) | 6/6 groups pass with zero failures or skips, including backward-caret restoration and real fixture Save/Send ending at `awaiting_acknowledgment` with no acknowledgment. |

The evidence includes light/dark views at 1280x900 and 640x780, plus a matched parent/child device-scale-2 run with a pinned frame. The mismatched scale-1/scale-2 refusal is the existing readiness boundary, not a product limitation at high display scale. Broader installed, native-desktop, full-breakpoint, and scroll acceptance remains in T004.

This settle changes only the factual static fallback wording in the primary HTML, not the demonstrated gestures or runtime assets. The T001 reports describe the pre-clarification HTML; they do not verify the successor's served bytes or approve it. The coordinator must bind fresh current artifact/asset revisions and verify the working link's served bytes before presenting the approval request. `approved_direction` remains empty. Revision feedback, the accepted 059-next sequence, code-review approval, and any earlier feature approval cannot supply this design approval.

## Success Criteria

- **SC-001**: The routing matrix covers all five armed drawing tools and all five selected shape types, including newly created and older reselected marks. Every tested handle resizes its target, every tested selected border/stroke moves only its target, and drawing-only locations add the armed shape rather than grabbing an object.
- **SC-002**: Each qualifying unmoved border/stroke pair opens the intended comment once, with focus in its Comment field and zero added annotations. Every nonqualifying case in User Story 2 opens Comments zero times, including both out-and-back defects and the single press following a moved second press.
- **SC-003**: A final changed adjustment has exactly one geometry-history step. A net-equal adjustment adds zero steps, preserves redo, and does not save transient geometry. Verify these outcomes independently of comment visibility.
- **SC-004**: The independent retained-workflow scenarios preserve literal comments/caret, numeric editing, seven tools, frame/anchor alignment, and saved/sealed evidence. No new persistence or request authority is introduced.
- **SC-005**: Before any live UI change, the canonical working proof and its required assets have been inspected, its fixture limitations disclosed, and that exact revision explicitly approved. No earlier 052, 057, or 062 approval satisfies this criterion.

## Visual Success Criteria

- **VSC-001**: The demonstrated resize, move, and draw cursors match the corresponding press behavior at handles, borders/strokes, and safe interiors in both light and dark appearances.
- **VSC-002**: At the existing compact and desktop review sizes, all seven tools and keyboard alternatives remain reachable. Opening Comments focuses the intended field without resizing or rebasing the pinned reviewed frame.
- **VSC-003**: Retain normal-text contrast of at least 4.5:1 and large-text/essential non-text contrast of at least 3:1, with visible keyboard focus. Existing small handles keep their equivalent numeric/keyboard controls; no enlargement or restyling is required by this feature.
- **VSC-004**: The implemented interaction matches the exact approved working proof while retaining the existing Review chrome. Screenshots alone cannot establish working manipulation or comment recognition.

## Assumptions And Intent Basis

The handle/border/interior rule and armed-tool retention come from the accepted summarized feedback. Current-visible-selection scope is a definition-owner derivation from the existing single selection and identical displayed affordances, not a new user answer. A newest-only exception would require unsupported recency behavior and leave older selected handles inert.

The idea's original blank answer slots, uncertainty, and Assumptions text remain untouched. No human-only definition clarification or new guardrail candidate remains. Working-prototype capability and exact-revision design approval are still required before live implementation.

## Revision Log

- 2026-09-15 19:44:44 UTC - First definition staged with the direct-manipulation and coupled out-and-back requirements. Design remains exploring; the canonical HTML entrypoint is selected but not rendered, proposed, or approved.
- 2026-09-15 22:57:12 UTC - DESIGN / definition-settle within `T002@59a10f02`: proposed **Selected handles and boundaries, with drawing still armed** from the working T001 proof. Read the canonical host, capability declaration, final coordinator reports, and preserved variants before editing. The pre-clarification primary HTML `sha256:82fe71ee9ef4887c18a74289bca648af236b058ee4d23f81f7b2441a2ae96a66` remains preserved in both `design/variants/2026-09-15-t001-initial-real-engine-proof/` and `design/variants/2026-09-15-t001-r1-update-path-fix/`. Corrected only its static fallback to distinguish real fixture Save/Send from live owner delivery, design approval, and acknowledgment. No gesture, host/bootstrap/runtime, layout, work type, or preview-path change; no new asset copy or approval transfer. Exact-revision approval of the successor remains pending through the owner handoff.
- 2026-09-15 23:40:11 UTC - DESIGN / approval within `T002@59a10f02`: recognized and applied the user's literal chat reply `looks good`, received at `2026-09-15T23:36:49.281Z`, as approval of the unchanged presented revision `baa97f8c`. The reply directly answered the coordinator's explicit request to open or reload that working preview and reply with approval or changes; it contained no caveat or requested change. Supplied user context showed the canonical HTML editor and two browser tabs at `http://127.0.0.1:50084`. This records the contextual approval without expanding the user's quoted words or attributing test steps to them.

  Approved direction: **Selected handles and boundaries, with drawing still armed**. Selected handles resize, selected borders/strokes move, and safe interiors and other locations allow continued drawing. The demonstrated comment-opening and out-and-back behavior remains part of the unchanged proposal. Set `design_status: approved` and the revision-bound `approved_direction`. This entry supersedes only the earlier unapproved/proposed, empty-direction, and pending-binding statements; the direction, requirements, viewing limits, and prior history remain unchanged.

  Approval used the existing owner-selected chat fallback because native Open Review cannot establish the viewed state of this driver-backed working demo. No provider approval request was published and no receipt exists. Fixture Save/Send is neither the approval response nor a live owner acknowledgment.

  Approved asset-set revision: `sha256:baa97f8c0aa521133358f833f8e4375098d3f4952e3e3db86c608670b843ac10`.

  Primary: `.dude/specs/059-annotation-direct-manipulation/design/review-direct-manipulation.html`, `sha256:a062753c5e4675e2974736737b1be8318549331b6f156b8976d9151123aa27b5`.

  Request source: `.dude/specs/059-annotation-direct-manipulation/spec.md`, `sha256:5a65d655c78b08371e2f7a88dcdb800feba99ed744162a2ae5a2c15e46490feb`. This is the pre-approval source-spec binding; recording approval changes that source revision, not the approved prototype or asset-set revision.

  The following 23 exact asset bindings come from the existing coordinator binding record. The coordinator's `2026-09-15T23:38:49.067Z` preflight reported one exact defined owner with zero diagnostics, unchanged canonical owner/spec bindings, primary and all 23 assets, all 60 protected live UI files byte/mode-exact, and no tracked installation. The Spec Lead read the canonical sources and consumed that verification; this action ran no hashing, terminal commands, lint, or tests.

  | Exact asset path | Revision |
  | --- | --- |
  | `.dude/specs/059-annotation-direct-manipulation/design/prototype/assets/host.js` | `sha256:fd259e8a4be1318123923a13cd0e37f02dbde2ed1916be5b70d83789685e95a7` |
  | `.dude/specs/059-annotation-direct-manipulation/design/prototype/assets/host.js.LEGAL.txt` | `sha256:a4c2748c7e8caaa345a8fd4baeedf3cd18a2ef01a946df06fe0ce8e340d4dc53` |
  | `.dude/specs/059-annotation-direct-manipulation/design/prototype/review/engine.mjs` | `sha256:ea85f7f964e3b7817e1547faca9e8611d1f63dff03f108bb4048d18227b9256d` |
  | `.dude/specs/059-annotation-direct-manipulation/design/prototype/review/geometry.mjs` | `sha256:235d2c05039581c40429f41cdf9a0c8e2a63e946fc3da37b8c273691dbf943a9` |
  | `.dude/specs/059-annotation-direct-manipulation/design/prototype/review/shapes.mjs` | `sha256:0df6a9f23c62b80c2571e9bfdad7bd4d7d65935270c779ae4997394eb3f4f1af` |
  | `.dude/specs/059-annotation-direct-manipulation/design/prototype/review/inspector.mjs` | `sha256:4e3a09cbdc9bfad89accc7161f73c294b64a7347b5571b9291edd0db0ee623b0` |
  | `.dude/specs/059-annotation-direct-manipulation/design/prototype/review/panel.mjs` | `sha256:02ccc01579b03836a3530d958c3606a7db73e9ea7637fa307298c1b835947916` |
  | `.dude/specs/059-annotation-direct-manipulation/design/prototype/review/capture.mjs` | `sha256:34d78de45f96ba11f2d78cec95cc1ed1957cc8facaaf22ca4673c8822e88768d` |
  | `.dude/specs/059-annotation-direct-manipulation/design/prototype/review/bridge.mjs` | `sha256:fca42f64869e183767e1b8127c2a077239a351b0e4c9efd4297d6ce580268eab` |
  | `.dude/specs/059-annotation-direct-manipulation/design/prototype/review/styles.css` | `sha256:1e73e9a1e4558601cc5f164e9f3acf5412938ba130048b2d5b064bb8e9ab668f` |
  | `.dude/specs/059-annotation-direct-manipulation/design/prototype/review/NOTICE.txt` | `sha256:ee4f325c692f81403ae0981320736904e618499113a785b24c7bf4f750f96ce7` |
  | `.dude/specs/059-annotation-direct-manipulation/design/prototype/fixture-driver.mjs` | `sha256:8fe18d5880659af556954fbcaf9da0edc547dd60bf82abf23e564aba24adf5f4` |
  | `.dude/specs/059-annotation-direct-manipulation/design/prototype/serve-preview.mjs` | `sha256:b77385d20ceb9ecff801c8bdf19c18c100093755f6d2d57f2c6349be2f47015b` |
  | `.dude/specs/059-annotation-direct-manipulation/design/fixtures/reviewed-content/mock.html` | `sha256:298ce9ec02d7ba1f68b00751f7a8e0c5cecef6427a44a0f7197666d6efb14e81` |
  | `.dude/specs/059-annotation-direct-manipulation/design/fixtures/reviewed-content/mock.css` | `sha256:2728012595da123a03daf10d404778f949fbc07b89b18c329adf19bc2b081d3d` |
  | `.dude/specs/059-annotation-direct-manipulation/design/fixtures/reviewed-content/logo.svg` | `sha256:deec39c96de5a6ee5db07e656ff3d3b66d78649d84866fd83b8e62a42c13d5f7` |
  | `.dude/specs/059-annotation-direct-manipulation/design/prototype/host.jsx` | `sha256:0004c0caf286b26574eaf762b3241df28dbf505b8b9d768b05ddd6cff350d244` |
  | `.dude/specs/059-annotation-direct-manipulation/design/prototype/build-design-assets.mjs` | `sha256:47fa097a49ec64457f5726ac3e021ab0d21951b390825213db19525d96b2b74f` |
  | `.dude/specs/059-annotation-direct-manipulation/design/prototype/frontend/review.jsx` | `sha256:bc2b6612afd45c6736242290feeefcc3ee15d994c0af557d8b50974265ba788f` |
  | `.dude/specs/059-annotation-direct-manipulation/design/prototype/frontend/needs-you.jsx` | `sha256:721fc328e752d67507a2da90cb7081633b0497c6a85635ad161d8e5bfd2c907b` |
  | `.dude/specs/059-annotation-direct-manipulation/design/prototype/frontend/styles.js` | `sha256:022a9e916674841f72c9b596a71353b069cb0e04c8b3ce698de7e9f09ada9880` |
  | `.dude/specs/059-annotation-direct-manipulation/design/prototype/frontend/theme.js` | `sha256:5ea6de69561e8affbcc35933ef17c797491e6c481caac2f1323fff03db20618f` |
  | `.dude/specs/059-annotation-direct-manipulation/design/prototype/frontend/use-canvas-data.js` | `sha256:32291e8b3f24108fa25f68c78b6d46cc568cae80d5cf55b5957f023b4c6b4b47` |

  Approval covers only this demonstrated 059 direction and exact artifact set. It does not approve 062, certify the live UI, installed/native host, or whole feature, or authorize Git or delivery. Prior T001 proof and the coordinator-reported 23:14:30 successor retest remain evidence, not new execution by this action. The accepted 059-next sequence is unchanged; T003/T004 implementation and acceptance remain separate. Only this spec's design metadata/Revision Log and one approval design event in the exact owner are changed. User-controlled idea sections, canonical identity, plans, tasks, boards, prior logs, proof history, variants, prototype/runtime/assets/guards, and provider records are untouched. Coordinator validation and any task transitions remain pending.
