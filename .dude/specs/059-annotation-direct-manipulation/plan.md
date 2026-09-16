# Implementation Plan: Annotation Direct Manipulation

**Spec**: `.dude/specs/059-annotation-direct-manipulation/spec.md`  
**Exact owner**: `.dude/ideas/059-annotation-direct-manipulation.md`  
**Canonical preview**: `.dude/specs/059-annotation-direct-manipulation/design/review-direct-manipulation.html`

## Definition Gate

The staged spec received the definition content gate before this plan and the tasks were written: three independently testable stories, numbered requirements, measurable behavior and visual criteria, edge cases, intent basis, and no unresolved clarification markers. It specifies outcomes rather than implementation.

This is first-definition staging against the selected draft preimage and coordinator-reported clean inventory, not a published package or a lint/readiness result. The coordinator independently reviews the four staged files and uses the fixed first-definition publisher. After publication, every definition/design mutation and rendered-task validation requires exactly one defined owner by the exact spec path above.

Design starts at `exploring`; `approved_direction` is empty. Only the design proof may proceed before approval. No approval request is due until a faithful working revision and evidence exist.

## Technical Context

**Language/Version**: JavaScript ES modules and JSX; Node >=20 for the extension/tooling, Node 22+ for the required WebSocket-based browser harness.  
**Primary Dependencies**: Existing React 19.2.8, Fluent UI React Components 9.74.7 and installed icons, esbuild 0.28.2, and the adopted Review modules. No new runtime dependency.  
**Storage**: Existing owner-bound `reviews/<submission-id>/working.json` and sealed evidence. No new state schema, persistence field, or API. Gesture/cursor bookkeeping remains transient.  
**Testing**: `node:test`, the existing direct-CDP Chromium harnesses, the real Review/Needs You adapters, build parity checks, and the explicitly invoked installed-host acceptance driver.  
**Target Platform**: Existing locally served Canvas Review in the embedded host; current light/dark, compact/desktop, and device-scale coverage. Browser automation does not establish native desktop embedding.  
**Project Type**: Extension UI with Fluent chrome around one imperative annotation/history owner.  
**Performance Goals**: Keep pointer preview and hover local. Add no per-hover network, storage, or inspector request and no hit scan of unselected objects for drawing-mode grabs. Preserve the existing annotation limit and event-driven rendering.  
**Constraints**: Working real-engine proof and explicit exact-revision approval before live UI edits; source-first changes, unchanged ownership/visibility/scroll/capture guards, no 062 shell work, and no new controller or recency state.

## Source Findings And Chosen Structure

The coordinator supplied `main` at `9c26aebdc` as base context. The following are source reads, not fresh execution evidence:

| Actual source | Relevant behavior and consequence |
| --- | --- |
| `src/extensions/dude/frontend/review.jsx` | `ReviewWorkspace` mounts `entry.module.mountReview`; `loadReviewEngine` imports `/review/engine.mjs`. `review_comment_open` and `review_comment_added` feed `revealComments` and the existing caret effects. Retain this ownership; only user guidance should need a frontend change. |
| `src/extensions/dude/ui/review/engine.mjs` | `add` selects the new mark and retains the tool. `render` paints the selection independently of tool. `pointerDown` gates handles and `markerAt` on Select; `pointerMove` rebuilds from `drag.origin`; `pointerUp` uses final annotation equality for both history and drag disqualification. Change routing and separate those last two decisions. |
| `src/extensions/dude/ui/review/geometry.mjs` | `handlesFor`, `moveBy`, `resizeBy`, `projectAnnotation`, and clip helpers already exist. `hitTest` includes number badges and full box/highlight faces; it must remain the Select predicate, not become the drawing-mode predicate. |
| `src/extensions/dude/ui/review/shapes.mjs` | `renderSelection` supplies the existing dashed outline and 9x9 handles; `markerSvg` owns live/capture marker paint. No new renderer or handles are needed. |
| `src/extensions/dude/ui/review/styles.css` | Cursor rules distinguish only Select/default from other-tools/crosshair. A transient action cursor must agree with pointer targeting. |
| `src/extensions/dude/review.test.mjs` | Existing tests pin Select face/badge semantics, circle-ring/segment behavior, geometry, caret, scroll projection, literal data, adapter ownership, and report/PNG validation. Extend the geometry tests without weakening these oracles. |
| `scripts/dude-canvas-ui/browser.test.mjs` | `createT010ReviewHarness` mounts the actual engine through a real provider, HTTP server, and Review adapter. It exposes native pointer input, engine observations, working bytes, save barriers, nested-scroll inverse edits, Escape/cancel and autosave coverage. Reuse these mechanisms. |
| `scripts/dude-canvas-ui/t011-browser.test.mjs` | Runs the published UI and real Comments, toolbar, saves, and sealed PNG. Its native press counts and `pairMetrics` already verify the 500 ms/4 px gesture bounds. Extend this real interaction, not a simulator. |

Keep one structure:

```text
.dude/specs/059-annotation-direct-manipulation/
  spec.md
  plan.md
  tasks.md
  design/
    review-direct-manipulation.html   # sole canonical interactive entrypoint
    prototype/                       # only required source-derived modules, bootstrap, build/fixture driver and assets
    fixtures/                        # declared stable reviewed content
    screenshots/                     # rendered evidence when produced
    variants/                        # preserved artifact sets when an iteration is superseded
```

Only the core trio and staged owner transition are in the first-definition transaction. Create design files during the proof task, not as empty scaffolding. No research, model, contract, checklist, or objective-registry file/region is needed.

The broader design reference remains `.dude/specs/052-dude-canvas-ui/design/fluent-desktop-workspace.html` and the delivered 057+ Review. Neither that baseline nor the rejected 062 simulated controller supplies approval of 059.

## Phase 1 - Real-Engine Design Proof

**Task**: `T001@59a10f01`

Coder owns the engine behavior and must declare an attainable capability before the first render. The declaration must identify the actual source-derived engine/components to be executed, how their required files stay within the design set, how the reviewed child and fixture transport remain guarded, and what the demonstration can and cannot prove. Retain the existing Fluent visuals; this is not a visual-system assignment.

Use a design-only bootstrap to mount the actual `ReviewWorkspace` with its normal `entry.module.mountReview` interface. Keep source-derived copies of the required Review modules and components under `design/prototype/`; preserve their notices and compare them with the current authoritative sources. Confine the exploratory routing, gesture, cursor, and instruction differences to those copies. There must still be one real `mountReview` state/history owner. An unchanged engine reproducing the defect or a rewritten imitation of its controller cannot satisfy the task.

Bundle required React/Fluent component dependencies into design-local assets using the existing scoped toolchain. Keep all required prototype source, HTML, scripts, styles, notices, fixtures, and retained evidence under `design/`. Do not run the normal Canvas build entry during exploration: it writes `src/extensions/dude/ui/assets/`. A design-only build/fixture wrapper may reuse current tooling and services read-only, but must write its proposal outputs only inside `design/`.

The chosen proof route is an outer Review host loaded from the canonical HTML by a design-only loopback fixture driver, with separate declared stable child content reviewed through the existing adapter. Reuse the real `createNeedsYou`, `createReview`, and Canvas fixture mechanisms rather than fabricated success responses. The driver must map the existing fixed `/review/*` module/style requests to the exact design-local counterparts without changing production serving code. This route is to be established by Coder, not an already-declared capability.

Keep the controller outside the opaque reviewed-source iframe. Do not add `allow-same-origin`, widen CSP, expose provider commands to mock content, remove source/asset revision checks, or change production routes to make the proof work. Test-owned runtime workspaces and browser profiles may be disposable execution scratch; they are not alternate mocks or source authority. The canonical artifact set must remain self-contained for the demonstrated revision.

If a fixture needs request handles, working saves, or sealed output, obtain them from its real isolated provider/adapter operations and label them fixture-only. Never attribute a fixture waiter, receipt, annotation, saved file, or approval to the user's live session. Displayed controls must perform their declared real local/fixture action or report the actual limitation; dummy Send/Save success is unacceptable.

Before seeking approval:

1. Inspect the loaded module/component identity and the bounded exploratory diff from current source. Keep the original provenance and complete prior variants in the design set.
2. Execute the US1 routing matrix with real pointer events; show new and older selections, handles versus borders/interiors, tool retention, and computed cursors.
3. Execute the US2 qualifying pair and both out-and-back defects, observing intermediate geometry, release results, next-press eligibility, and independent history/save outcomes.
4. Exercise the existing Comments focus/caret and numeric keyboard alternative through the actual component. Inspect light/dark and existing compact/desktop presentation, with screenshots and accessibility/geometry observations.
5. Retain the exact artifact/asset revisions with the existing design evidence. Describe fixture-only transport and any remaining native-host observation separately.

If no faithful working proof is attainable inside these boundaries, return `design-gap` with the concrete limitation. Do not render a fake substitute, edit live UI in advance, or treat a capability failure as a question the user must solve.

## Phase 2 - Exact-Revision Design Approval

**Task**: `T002@59a10f02`; depends on Phase 1.

Once the working direction settles, the definition/design owner uses the existing authorized path to set `design_status: proposed`, update Visual Intent/Proposed Direction and the Revision Log, and have the coordinator record the corresponding design event. Preserve all explored variants; there remains one current `preview_path`.

Return a bounded preview request to the coordinator under `dude-work-intake` Needs You Handoff. It must identify the exact current HTML and every required asset revision, name what was demonstrated and any material fixture limitation, and ask for approval of that revision or a revision request. The Spec Lead receives the literal response through delegation and applies it only through the existing design path; it does not publish or acknowledge the tool itself.

Annotations are revision feedback, not approval. Where annotation transport is used, the existing adapter-validated sealed report and source-aligned PNG boundary remains mandatory. A changed mock or asset requires fresh review/approval of its successor. The 059-next implementation sequence, positive native Review feedback, and earlier feature approvals do not count as current design sign-off.

Only explicit approval of the exact demonstrated current revision allows `design_status: approved` and a nonempty `approved_direction` through the existing owner/coordinator process. A completed task glyph alone cannot substitute for these conditions.

## Phase 3 - Apply The Approved Behavior And Focused Regressions

**Task**: `T003@59a10f03`; depends on Phase 2 and its current exact-revision approval.

### Targeting And Hover

Apply the approved bounded differences to `src/extensions/dude/ui/review/engine.mjs`, `geometry.mjs`, and `styles.css`. Keep `shapes.mjs` and the existing handle inventory unchanged.

Use one local target classifier for hover and pointer-down so the cursor and action cannot disagree. Reuse `point`, `withinFrame`, `pointable`, `paintClip`, and the projected current selection. No selection changes occur during hover.

| Mode | Target precedence |
| --- | --- |
| Select | Preserve existing selected handle targeting first, then `markerAt` with reversed topmost `hitTest`, including faces and badges, then the existing pick behavior. |
| Box/Circle/Arrow/Line/Highlight | Current visible selected shape's existing handle first, then that shape's boundary/stroke, otherwise the existing create branch. Do not call the all-annotation `markerAt` scan for a grab. |
| Comment | Keep the existing comment pick/add path and Select-based pin manipulation. Add no pin handles or new pin gesture. |

Add only the small boundary-only geometry helper needed by this caller. For Box/Highlight, test the rectangle edge band rather than the whole face; for Circle, test the ellipse ring, not its enclosing rectangle; for Line/Arrow, test the segment/stroke. Do not include `hitBadge`. Reuse the current geometry tolerance scale (8 document CSS pixels for body hits, the existing segment stroke allowance, and 9 for handle reach); preserve Select's existing predicate and dimensions. New drawing-mode hits must also lie in the same effective paint clip as the selected affordance.

Keep corner cursors direction-appropriate (`nwse-resize`/`nesw-resize`), use a direction-appropriate native resize cursor for segment endpoints, `move` on the selected boundary/stroke, and `crosshair` on drawing space. Store only a transient overlay action/cursor, never a persistent annotation field. Refresh or clear it when hover, tool/selection, visibility, or active gesture changes; blocked editing cannot retain a misleading resize/move cue. Preserve native focus treatment.

### Comment Recognition And History

Keep the existing pointer-stream recognizer. Repainting removes marker DOM targets, so replacing it with a browser `dblclick` listener would lose the real gesture. Preserve the existing same-ID, at-most-500-ms, at-most-4-document-pixel pairing and second-release reveal through `revealComment` / `review_comment_open`.

Add a monotonic flag to the existing in-flight move/resize drag: once an effective annotation coordinate changes during that press, it stays manipulated until the press ends. Use actual geometry change, not only the release location or final equality. Do not add a movement dead zone; the 4 px pair-proximity limit is not permission to treat a small adjustment as a click.

Movement must invalidate both the current `doubled` intent and `lastPress` candidacy, for Select and the five drawing tools. Handle and drawing-only presses cannot prime a comment pair. Preserve cancellation, error, unavailable-view, and pointer-capture cleanup; a cancelled or failed manipulation cannot leave a comment half-gesture.

In `pointerUp`, final annotation equality still decides whether a valid geometry edit needs `pushHistory` / `changed`. Independently, the monotonic manipulation flag decides whether comment recognition is allowed. This must fix both:

- first press out and back, release, then one timely same-point press;
- first unmoved press, second press out and back, release, then one further timely same-point press.

The first sequence opens no comment; in the second, neither the moving second press nor the following single press opens one. Net-equal motion adds no history entry and does not clear redo. Preserve `save` freezing `drag.before` during a preview and existing inverse projection through `projectAnnotation`; do not add new history, save, or anchoring state.

### Existing UI And Regression Adaptation

In `src/extensions/dude/frontend/review.jsx`, update only the relevant guidance to explain selected handles/borders while drawing and retain explicit Select face/badge and Enter instructions. Update the overlay's accessible instruction in `engine.mjs` consistently. Reuse the existing message, `revealComments`, pending-caret, and field-focus effects; do not create another React gesture controller.

Extend `src/extensions/dude/review.test.mjs` and the two browser suites with the verification matrix below. Preserve the old Select assertions. One concrete fixture requires adaptation: the T011 gesture scenario draws a second box from `(644, 64)` immediately after selecting the newly created box beginning at `(640, 60)`. That point is inside the selected handle reach and must now resize. Establish no selection through existing UI before arranging the overlapping-badge fixture, or choose a drawing-only start; keep its topmost-badge oracle rather than weakening the new routing rule. Its empty-space drawing-mode double-press remains a negative case, not a claim that all drawing-mode double presses open nothing.

Record current source/runtime identities before changing the live target. After the approved source changes, rebuild with `node scripts/dude-canvas-ui/build.mjs`, then project with `node scripts/build-dev.mjs`. Generated `src/extensions/dude/ui/assets/app.js`, its legal companion, and `.github/extensions/dude/` are build outputs, not hand-edited implementation targets. Update existing exact-current-bundle test pins only from the verified rebuilt bytes; never bless an old or untested engine.

## Phase 4 - Installed Acceptance And Documentation

**Task**: `T004@59a10f04`; depends on Phase 3.

Update the Canvas interaction explanation in `docs/commands.md`: its current “a press on the mock starts a new mark instead” description must distinguish selected handles/borders from drawing space. Retain Select, Enter, optional comment text, save/send separation, and source/anchoring limitations.

Run the named current maintainer acceptance set from `docs/commands.md#canvas-maintainer-acceptance`, including `build.test.mjs`, both heavy browser suites, and the real-provider source tests. Use required-browser mode and `--test-concurrency=1`; report executed, failed, and skipped counts. Missing required coverage is not a pass.

Use the existing `scripts/dude-canvas-ui/t012-installed-host.mjs` path for fresh installed CLI/extension acceptance of the rebuilt artifact. Extend only its bounded Review gesture checks or current-source identity pins when necessary; do not create another host or model simulator. Verify the shipped engine bytes as well as the frontend bundle, so an installed run cannot silently use the pre-fix static modules. This driver uses a deterministic local model and an Edge-rendered returned URL; it does not prove unscripted reasoning or native desktop rendering.

Before asking for human host smoke, complete the automatable user-visible script in the real browser/provider harness, including gesture counts, selected versus focused state, comment typing/caret, screenshots, frame/scroll geometry, accessibility, contrast, and invalid/unavailable transitions. Then limit any owner-qualified manual observation to the real embedded host's sizing/theme/focus/reload/Review-entry behavior that the harness cannot establish.

Use the normal source/deployed/static/legal parity checks, current bundle size ceiling, and all nine Review static files including `NOTICE.txt`. Require coordinator-reported zero lint failures for the published package and independent acceptance through the existing workflow. This plan executes none of those checks, changes no task state, and grants no Git or release action.

## Verification Matrix

| Coverage | Existing mechanism and decisive checks |
| --- | --- |
| US1, FR-001–004, SC-001, VSC-001 | Pure geometry tests distinguish boundary/ring/segment from interiors and badge-only areas, including reversed and minimum-valid geometry. Native engine tests cross the five armed tools with five selected shape types; cover corner/endpoint handles, overlaps, no selection, and older selection. Observe selected ID, tool, annotation count, coordinates, and computed cursor before acting. |
| US2, FR-005–007, SC-002–003 | Real pointer press logs prove event delivery, same target, interval and distance. Observe intermediate out-of-origin geometry before returning exactly to origin. Test first and second out-and-back moves, out-and-back resize, small effective motion, cancellation, slow/displaced/different-target pairs, handles, and interior negatives. Independently assert no comment, no extra history, and preserved redo/committed save bytes. |
| Comments, FR-008–010, SC-004, VSC-002–003 | The published T011 component must open the right Comment field once for the new pair and for Enter. Type literal text, restore a non-collapsed backward caret, close/reopen, and edit coordinates by keyboard. Retain Select topmost faces/badges, Comment pins, Line/arrow behavior, seven-tool palette movement/orientation, Undo/Redo, and focus isolation from inputs/menus. |
| View and save integrity, FR-007/011/012 | Extend existing real-engine nested-scroll and preview/cancel/save-barrier coverage. Confirm projected/inverse coordinates and original anchor data, clipped/hidden targets, frame panning, outside-frame presses, and unavailable/stale views. A net-equal gesture on an already selected, saved baseline introduces no geometry save or history change; unrelated metadata saves are not misclassified. |
| Evidence and deployment, FR-011/013, SC-004–005, VSC-004 | Real adapter save/reopen/seal checks pair the report with actual source-aligned PNG and preserve all ownership/source guards. Compare the approved proof with rebuilt and installed behavior. Retain 360/768/1440 CSS-pixel light/dark coverage and representative DPR 2/pinned-frame cases without making cross-renderer whole-page pixel-equality claims. |

US1, US2, and US3 use separately arranged reviews or explicit resets, not a shared happy-path chain that can hide a failing story. Keep geometry/history and comment-opening assertions separate in the same regression cases: fixing the comment bug by creating no-op undo entries is not an acceptable result.

## Requirement, Plan, And Task Traceability

| Spec obligations | Plan decisions | Canonical tasks |
| --- | --- | --- |
| US1; FR-001–004; SC-001; VSC-001 | Selected-only target classifier, boundary-only geometry, matching cursor, retained tool | `T001@59a10f01`, `T003@59a10f03`, `T004@59a10f04` |
| US2; FR-005–007; SC-002–003 | Existing recognizer with monotonic manipulation; final equality remains history-only | `T001@59a10f01`, `T003@59a10f03`, `T004@59a10f04` |
| US3; FR-008–012; SC-004; VSC-002–003 | Existing Select/Comments/keyboard, save/anchor/capture and toolbar retained; focused source and installed checks | `T001@59a10f01`, `T003@59a10f03`, `T004@59a10f04` |
| FR-013; SC-005; VSC-004 | Source-derived working design set, Coder capability before render, explicit exact-revision approval before source application | `T001@59a10f01`, `T002@59a10f02`; gates `T003@59a10f03` and `T004@59a10f04` |

## Guardrail Checks And Risks

- Existing project and bundle guardrails apply; there are no new candidates or ratification writes.
- The only added live behavior serves the current Review caller. One boundary helper and one transient manipulation flag are sufficient; no controller abstraction, recency state, persistence, new public command, or speculative rollout machinery.
- The proof's fixed module paths and opaque-source boundary are the main feasibility risk. Coder must establish the design-local route before rendering; inability to do so is `design-gap`, not permission to change the production provider.
- Similar-looking hit regions differ by mode. Preserve the current Select tests and demonstrate interior/badge-only drawing so simplification does not make whole faces draggable while drawing.
- Gesture recognition and final-history equality must remain independent. Both out-and-back sequences and redo/save checks are required to prevent an incomplete fix.
- A source-derived prototype can drift from the live source or installed bundle. Retain source/asset revisions, the bounded diff, and fresh deployed-engine identity evidence; explicit approval covers only the demonstrated revision.
- Existing fixture and installed CLI evidence do not prove native desktop rendering or user approval. Report those limitations plainly; no inherited approval and no fabricated waiter or receipt.
