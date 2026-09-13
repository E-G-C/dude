# Implementation Plan: Dude Canvas Needs You

**Spec:** `.dude/specs/057-dude-canvas-needs-you/spec.md`  
**Exact defined owner:** `.dude/ideas/057-dude-canvas-needs-you.md`  
**Mode:** Staged re-definition of the existing package. This invocation authorizes no execution.

## Definition Basis

The user-controlled idea and all four answers remain the intent authority. The explicit refresh keeps all four stories, all six request classes, and the working HTML annotation/report/image loop. It introduces no second feature or package.

FR-022 already allowed fresh rendering. This correction removes impossible host-versus-Chromium signature/style comparisons so the existing source identity, target identity, geometry, visibility, and containment checks can run. It adds no observation subsystem. Native-pixel, glyph-level, whole-page paint equivalence, and host interaction-state replay remain outside the guarantee.

Recorded completion of T003, T007, T008, T009, T010, and T011 remains valid. The approved direction is rev-8.2, `design_status` remains `approved`, and all approved mock artifacts stay frozen. T013 carries this bounded correction. T012 remains the surviving integrated acceptance and documentation task.

Existing project guardrails apply. There are no new guardrail candidates or outcome-changing user questions for this refresh. The diagnostic and verification gaps below remain open engineering work, not invented user answers.

## Technical Context

**Language/Version:** JavaScript ESM with JSDoc, Node >=20, JSX, and the host-provided Copilot SDK.  
**Primary Dependencies:** Existing React 19.2.8, React DOM 19.2.8, Fluent UI React v9 9.74.7, and esbuild 0.28.2 in `scripts/dude-canvas-ui/package.json`. Review uses native DOM/SVG/Canvas and Node. Capture requires an actually available Chromium-family executable; no new npm or Playwright dependency, browser download, SDK installation path, or installer is introduced.  
**Storage:** Existing canonical idea/spec/execution sources and exact-owner `reviews/<submission-id>/` working and sealed outputs. Provider/session handles and delivery receipts stay ephemeral. No request database, second receipt store, browser-persisted replies/tokens, or new durable surface.  
**Testing:** Existing Node tests, required-browser Chrome DevTools Protocol (CDP) suite, real `createFixtureServer`/`openInstance` fixtures, raw installed owner profiles, and actual Copilot-host text/image roundtrips.  
**Target Platform:** Existing single Dude Canvas and joined Copilot session. Installed blank non-Git directories and Git repositories remain required. Retained host/CLI evidence establishes specific supported seams, not every desktop or operating-system capture case.  
**Project Type:** Existing core extension, Fluent/React shell, mounted vanilla Review engine, and committed browser/static runtime assets.  
**Performance Goals:** Preserve bounded projection reads, cancellation, complete 50-draft discovery, and current capture limits. Review bodies remain bounded at 1 MiB, working data at 512 KiB, reports at 64 KiB, PNGs at 8 MiB, annotations at 300, image dimensions at 4096 pixels, and image area at 16 Mi pixels. Oversized input remains an explicit refusal, not silent truncation or a reason to add state recording.  
**Constraints:** WCAG 2.2 AA; 360/768/1440-pixel light/dark verification; approved rev-8.2 preserved; install/build-free consumers; source/deployed byte parity; exact source isolation; immutable evidence; once-only original-waiter delivery. Keep the 10-second first browser handshake, 4-second subsequent command bounds, and 30-second overall capture/provider bound.

## Chosen Inline Review And Capture Approach

Keep the existing topology:

1. The desktop host renders the exact canonical HTML inline for review.
2. The existing owned Chromium capture process renders the same admitted source and local assets at the reviewed viewport, device-pixel ratio (DPR), theme, and scroll positions.
3. Shared marker composition overlays the validated annotations on the real captured PNG.
4. The existing adapter validates and seals one report, PNG, and provenance record before the existing Needs You waiter can consume the response.

The honest report claim is:

> The PNG is a fresh Chromium rendering of the exact source with verified annotation geometry, not captured native pixels.

The architect's SDK inspection found no embedded-page screenshot API in the installed `canvas.d.ts:76–118`. Displaying Chromium bitmaps in the host would require frame, scroll, and inspection transport plus input remoting to retain native HTML interaction. That is reachable engineering, but it is not needed for this delivery and is not planned.

Do not add a service, browser-view transport, general interaction replay, state freezer, capture registry, or alternate sender. If the bounded checks cannot establish a required case, return the concrete limitation rather than growing that architecture.

## Evidence For The Decision

Coordinator-supplied paired reproductions at 2026-09-11 21:55:00.193 and 21:55:00.322 UTC used the unchanged saved review at 989x728 CSS pixels and DPR2. Viewport, scrolls, loaded fonts, absence of images/animations, and projected anchor geometry matched. Host and capture observations still differed in font-family notation, an input's default border color, and overflow serialization:

- `BlinkMacSystemFont` versus `"system-ui"`.
- An input border using `rgb(128,128,128)` versus `rgb(118,118,118)`.
- `visible` versus `clip`.

The verified source establishes one cause at four gates: engine-dependent computed CSS is compared across WebKit host review and Chromium capture. `ui/review/inspector.mjs:83-86` includes all three differing properties in `STYLE_KEYS`. The cross-renderer signature comparison, style-inclusive `anchorMatches`, server-side signature comparisons, and full-element `elementRevision` hashes impose the same invalid equality. The existing portable checks are blocked by the first signature gate.

The supplied Sharpie inspection establishes that its 473-line capture path performs no fresh-render-versus-reviewed verification: headless Chromium renders the page and `ui/js/capture.mjs` composites a plain-SVG marker layer. On capture failure it still returns a PNG with `mode: "markers-only"` and a `warning`; Dude deliberately does not adopt that fallback. Dude already reuses the real-PNG-plus-plain-SVG compositor. Its added cross-renderer signature/style equality is the defect to subtract.

The capture cause is established by the supplied source and reproduction findings. The separate scroll-time readiness-message issue remains undiagnosed. This definition correction is not a runtime fix or an acceptance result.

### Sharpie Reuse Boundary

Retain the already-adapted local seams:

| Seam | Current bounded use |
| --- | --- |
| `ui/review/geometry.mjs` and `shapes.mjs` | Original coordinates, scroll projection, shape rendering, marker numbering, badge containment, and shared clipping rules. |
| `ui/review/inspector.mjs` | Existing selector/tag/text/rectangle descriptions, scroll readback, effective visibility/clipping, and renderer-local stability observations. No extension is needed. |
| `ui/review/panel.mjs` and `engine.mjs` | Annotation editing, repeat tool use, undo/redo, caret/focus, pinned viewport, native admission, and same-submission restoration. |
| `ui/review/capture.mjs` | Real page PNG plus plain-SVG marker composition. The current source already follows this shape; retain it unchanged. |
| `lib/review/data.mjs` and `lib/review.mjs` | Bounded annotation data, semantic report, exact-owner storage, seal validation, and the existing submission handoff. |
| `lib/review/browser.mjs` and `png.mjs` | Owned Chromium execution, CDP viewport/DPR/nested-scroll control, PNG capture, and source/overlay/composite verification. |

Do not copy full-document cropping, DPR1 assumptions, markers-only fallback, PDF/export/file-picker paths, standalone sending, global preferences/latest services, or upstream package dependencies. Do not import Sharpie wholesale or read it at runtime. Preserve the notices required by the adopted files and their existing dev/release copy coverage.

## Existing Integration Structure

The package extends one Canvas and its existing provider:

- `lib/projection.mjs` supplies exact blank/draft/defined discovery, source-declared nonurgent work, lane-qualified orientation, and scoped coverage. Inventory does not establish pending requests.
- `extension.mjs` registers `dude_needs_you`; `lib/needs-you.mjs` owns bounded request/reply/acknowledgment correlation, cancellation, invalidation, idle capture, and ephemeral receipts.
- `lib/canvas-server.mjs` exposes the existing closed same-origin operations and server-sent events (SSE).
- `lib/review.mjs` serves only the admitted mock/assets and owns review files, capture, sealing, and validated preview evidence. It reuses Needs You receipts.
- `frontend/{app.jsx,styles.js,theme.js}` provides the approved shell, forms, Review entry/return, inline status, and owner-confirmed response presentation.
- `ui/review/` remains the mounted vanilla annotation workspace. It adds no independent application or authority.

Core edits belong under `src/`. Existing builders project committed runtime output; do not hand-edit generated `.github/` core files. Keep unrelated model-map output and other extensions outside this change.

### Discovery And Source Authority

Preserve complete exact inventory, explicit selection, separate finder query, root changes, and scoped source failures. Missing idea/spec directories remain a valid blank workspace. Drafts need neither a package nor tasks; Review requires an exactly owned canonical mock and otherwise shows Define-first.

Canonical ideas and valid source-backed dispositions remain discoverable without a live publisher. Blank Answer slots, historical activity, or a prose excerpt do not create actionable requests. Coverage distinguishes inventory, selected/other readable contexts, and live handoff availability.

Keep the existing refresh behavior after confirmed publication and acknowledgment, preserving selection, query, and unsent input. Relevant outside source edits invalidate affected actions and require owner reread; an edit itself is not owner acceptance. Preserve final source checks, including incoming-declaration effects, without adding another resolver or dependency graph.

### Bounded Handoff Contract

The existing producer path remains conditional guidance in `src/skills/dude-work-intake/SKILL.md`, with references from the actual coordinator, Spec Lead, feature-definition, and Work caller sites. Owners admit requests only after their existing eligibility, prerequisite, authority, and safety gates.

The Spec Lead returns an admitted definition/design request to the coordinator and receives the literal reply through normal delegation. It gains no terminal or publication tools. Labels and tool identities are cooperative routing, not cryptographic proof of specialist identity or permission.

`dude_needs_you` retains two closed operations, `request` and `acknowledge`, and six classes: `onboarding`, `fact`, `preview`, `manual_observation`, `permission`, and `scope_choice`.

A request binds the current workspace/session, exact idea or spec scope, owner request reference, source/revision, expected response, human-only need, and what the answer unblocks. Preview and permission requests also bind exact artifacts or operation targets and consequences. The provider adds its generation, actual tool-call identity, cancellation signal, and opaque UI handle.

Deduplicate only the same owner-qualified request/reference/scope. A second publication must not create another waiter. Shared provider/session correlation must not become per-Canvas-instance authority. Capacity or receipt loss produces explicit uncertainty, not replay.

UI operations remain closed:

- Read projection, handoffs, and coverage; receive existing SSE refresh.
- Submit a class-specific response with the current handle and revision.
- Submit explicit idle idea-capture intent with a provider-bound receipt.
- Open, restore, save, or seal Review through fixed preview-only operations.

Require expected loopback Host, exact same Origin for mutation, bounded bodies, valid fields/options, safe rendering, and lifecycle cancellation. The read-only absent-Origin allowance grants no mutation permission. There is no caller-selected output path, arbitrary operation, endpoint, script, or tool name.

### Original Waiter And Owner Acknowledgment

A valid response consumes its current handle once. Annotation feedback must first pass source, capture, report, PNG, seal, and current-context validation. It then resolves the original `request` tool with `textResultForLlm` containing the report and `binaryResultsForLlm` containing actual `image/png` bytes. Annotation delivery never queues `session.send`.

The owner's continuation rereads the source and applies or refuses the response through the existing owning workflow. Design feedback requests revision of the canonical mock and grants neither approval nor premature production-UI authority.

The coordinator acknowledges the same receipt/request/scope with `accepted`, `applied`, `declined`, `deferred`, or `unavailable` and fresh evidence. Accepted is distinct from applied. Canonical state is reread before presentation; current owner outcomes take precedence over local sent copy.

A revision acknowledgment may identify both the reviewed old revision and the owner's new revision. A fresh preview request is required for the successor. Only explicit approval of that current revision can complete its approval request.

Missing acknowledgment stays awaiting or uncertain. Cancellation, outside-input/source invalidation, receipt expiry, and session replacement preserve their typed non-answer behavior. No timer, session-wide idle, queue presence, historical file, or latest assistant prose implies acceptance or revives a request.

### Capture And Deferral

Idle idea capture uses the existing joined-session `send` path only after the supported idle boundary and absence of a blocking handoff are established. It carries literal selected intent and a provider-bound capture receipt. Delivery alone is not capture: the brainstorm owner applies normal exact matching, and acknowledgment plus canonical reread precede saved status. Keep the active-turn conflict regression and no-replay behavior.

For an unfiled live request, Save as idea returns explicit capture intent through the waiting tool first. The owner then uses normal brainstorm capture; it must not queue a turn behind its own blocking request. Save selected intent and appropriate provenance, not privileged card payloads, claim tokens, stale consent, or a request queue.

Ordinary Defer creates no idea. A source-backed disposition uses its existing source and owner; an unfiled matter remains visibly unsaved/non-durable until explicit capture is acknowledged. Reconnect within the same provider may reconcile existing receipts without replay. Provider/session replacement loses pending authority and requires fresh publication. Reactivation remains a current user/owner decision.

## Hard Host And Capture Prerequisite

T007's completed feasibility proof remains preserved. Its evidence covers installed blank Git/non-Git discovery, coordinator tool exposure, restricted-owner delegation, pending text/image delivery, acknowledgment, cancellation/outside-input handling, and the idle capture path within the recorded environment.

The retained SDK inspection identified tool invocation identity/cancellation and text/image tool results; the raw installed-profile proof later established actual owner/delegation behavior without SDK capability augmentation. Neither establishes the current desktop capture contract merely by type shape or a separately rendered Edge page.

T012 retains the supported-target check: demonstrate the actual available capture executable and the new contract without consumer dependency installation, compilation, or automatic browser acquisition. A missing required capability is a concrete prerequisite gap, not permission to make the image optional or narrow blank-directory support.

Use disposable installed fixtures and existing production routes. Host lifecycle actions require their existing authority and occur outside active Work adapter claims/supervisors. No proof-only route, retired flag, automatic relaunch, cleanup, or takeover is added.

## Portable Cross-Renderer Evidence Contract

Every remaining evidence row below is already implemented, not a new requirement. `lib/review/browser.mjs:332-344` contains the existing numeric viewport/scroll comparisons and `readAnchors()` checks for unique selector identity, matching scroll basis, projected target geometry, visibility, and `clipHidesAnchor`/`insideClip` containment. Source, image, and seal bindings stay at their existing boundaries. T013 removes impossible comparisons so these checks become reachable; it does not add an evidence subsystem.

Keep two distinct comparisons:

- Native admission, refresh, and restoration compare observations within the host renderer.
- Cross-renderer capture compares only the existing portable alignment contract below.

`geometry.mjs:anchorMatches` currently deep-compares the projected element, including styles. Retain native matching semantics for admission/restore, and give capture an explicit portable matcher. `describeElement` already returns `selector`, `selectorMatches`, `tag`, `text`, and `rect` alongside `styles`; no inspector, bridge, or engine extension is needed.

| Evidence | Required comparison |
| --- | --- |
| Owner/request/source/assets | Same exact owner, current request/revision, canonical source bytes, and admitted local asset identities. Check before capture, after capture, at seal, and before waiter consumption. |
| Display context | Matching CSS viewport width/height, DPR, theme, and root scroll readback. Preserve the pinned frame. Actual PNG dimensions must equal the verified viewport multiplied by DPR. |
| Nested scroll | Restore and reread the complete bounded selector-addressed scroll snapshot, including zero offsets. Require unique selectors, matching ancestor basis, and actual offsets; reject clamping, missing ports, or unknown legacy bases rather than guessing. |
| Anchored identity | Exactly one selector match with the same tag and captured text identity. Do not use a style-inclusive full-element hash as the cross-renderer identity. |
| Target geometry | Compare the freshly measured rectangle with the original target projected through its recorded ancestor-scroll basis. Retain the current hundredth-CSS-pixel measurement precision and equality policy; add no broader tolerance. |
| Clipping and visibility | Derive effective clipping and visible target regions in common CSS coordinates. Require compatible visible regions and containment in both renderers, using the existing `clipHidesAnchor` rule rather than raw overflow-string equality. |
| Annotation geometry | Project original coordinates once; verify the paint envelope and numbered badge against the applicable region. Use the same geometry and effective clipping for live markers and captured composition. |
| Unanchored drawing | Verify viewport/revision binding and containment only. Record the absence of a verified semantic target. |

Keep the existing inspected-node, scroll-record, byte, and target bounds; exceeding them is an explicit refusal, not silent omission. Keep resource references tied to the admitted source/asset identities and existing serving normalization.

Clipping compatibility is about effect. If a clip contains the entire target, it must not constrain a wide annotation beyond the existing viewport rule. If it hides part of the target, preserve the effective visible region and require the annotation to fit the applicable region in both views. Do not automatically treat `visible` and `clip` as equivalent; their actual geometric effect decides.

Do not canonicalize, substitute, whitelist, or force equality for the reported font-family, border, or overflow differences. Remove their use as cross-renderer proof. A difference that changes target identity, measured geometry, visible regions, or containment must still fail.

Capture renders the canonical source bytes fresh in a clean browser; it does not replay host-only interaction state. The existing fresh-render warning and `review_transient_unsupported` refusal already carry that limitation. Add no DOM structure/order, attribute, or form-state observation projection.

Equal boxes cannot prove equal painting. The alignment contract does not promise arbitrary hover/focus state, application replay, glyph identity, or whole-page visual equality. Preserve existing source isolation, loading checks, active-animation and unsupported transient-content refusals; geometry alone must not bypass them.

### Minimal Production Changes

Only four production edit sites are required, relative to `src/extensions/dude/`:

- `ui/review/geometry.mjs` — add a capture-only portable matcher comparing the projected element descriptor with `styles` excluded: `selector`, `selectorMatches`, `tag`, `text`, and `rect`. Leave native `anchorMatches` semantics unchanged for admission/restore.
- `lib/review/browser.mjs` — drop the `before.signature !== state.view.signature` clause at line 333; use the capture-only matcher in the existing `readAnchors()` path and hash the portable subset for `elementRevision` at lines 368-369. Keep the viewport/scroll and identity/geometry/visibility/containment checks at lines 332-344 enforced and reachable. Leave the Chromium before/after signature check at line 357 unchanged.
- `lib/review.mjs` — drop the `capture.beforeSignature === state.view.signature` and `capture.afterSignature === state.view.signature` comparisons at lines 326-327, retaining `capture.beforeSignature === capture.afterSignature` as the renderer-local stability re-check. Hash the same portable subset for `elementRevision` at lines 333-337.
- `lib/review/data.mjs` — accept the revised capture shape; keep `styles` in the stored descriptor and the report, labeled as host observations.

Styles remain captured and reported because they describe what the reviewer saw; they simply stop being cross-renderer proof. No schema change to `view.signature` is needed, so saved reviews and version-1 history stay valid.

### Renderer-Local Stability And Races

Keep `engine.mjs:311–353`'s before/after host checks and `browser.mjs:321–356`'s Chromium settling and capture-race checks. Each renderer's signature may continue to include computed styles and paint-sensitive observations for its own stability checks.

Host-before must match host-after for the relevant operation. Chromium-before must match Chromium-after around capture. A host signature does not have to equal a Chromium signature.

Preserve existing local signature semantics needed for native restoration and version-1 history. A view or scroll change during bounded anchor inspection invalidates the partial snapshot; it is not permission to adopt mixed observations. Keep epoch/cancellation checks and unchanged source/working-byte checks at the existing boundaries.

## Review Files, Versioning, And Sealing

Resolve exactly one defined owner by exact `spec_path` before writable open and again at save/seal. Resolver diagnostics, no owner, ambiguity, unsafe paths, missing mock/assets, and source drift refuse the affected action without fallback.

The existing adapter chooses one UUID for its current review allocation:

```text
<exact-target-spec-directory>/reviews/<submission-id>/
  working.json
  report.md
  annotated.png
  provenance.json
```

Working data retains original annotation geometry and anchor observations, scroll basis, selected tool/comment, useful caret/focus, pinned view, and source/asset binding. Explicit restoration is the existing same-submission path; do not invent a second allocation for the same live request.

Freeze the actual working bytes before capture. Create report and PNG exclusively, then write provenance last as the immutable seal. Recheck owner, source, current allocation, and unchanged working bytes around the write boundary. A caught pre-seal failure may remove only outputs created by that attempt; it must not remove or overwrite existing evidence. An uncertain or sealed-but-undelivered result remains historical/uncertain, never automatically replayed.

### Versioned Evidence And Historical Validation

Version only the revised capture/report/seal semantics, with new seals recording provenance version 2. There is no new portable-observation payload or working-data, inspector, bridge, or engine schema change. Keep capture, report, seal, and delivery validation coherent at the four edit sites above.

Keep the version-1 reader, capture validation, full-element/hash expectations, and report construction for historical version-1 evidence. `lib/review.mjs:340–360` reconstructs and byte-checks reports; applying the new wording to old reports would corrupt that validation. Do not relax version-1 checks, relabel old claims, or regenerate old report bytes.

New live seals bind the existing portable descriptor fields to the frozen working snapshot and owned capture result, with stability evidence kept renderer-local. Saved markup already contains the needed descriptor; no new observations or hash-derived substitutes are required. Existing exact-source/native restoration rules still apply. No automatic migration, resave-on-open, successor allocation, or recovery of historical request authority is added.

Keep any necessary old-format behavior only for these current saved-work/history callers. Do not create a general migration framework or duplicate the provider's receipt state.

### Report Contract

`lib/review/data.mjs` must produce the version-2 report with:

- Exact owner, request, source, asset, submission, and revision identities.
- Capture browser/version, mode, actual image dimensions, reviewed CSS dimensions, DPR, theme, root scroll, and selector-addressed nested scroll.
- The verified identity, target-rectangle, visibility/clipping, containment, and renderer-local stability checks, using the existing observations or digests.
- Original and projected annotation geometry, selector counts, and the distinction between anchored and unanchored drawings.
- Captured target text and styles explicitly labeled as host-review observations, not styles proven identical in Chromium.
- The fresh-render, non-native-pixel, non-glyph-equivalence, and non-whole-page-paint limitations.

Do not persist live handles, permission tokens, unrelated raw diagnostics, or arbitrary failure payloads. Optional marker text remains optional; geometry and target evidence still describe a valid blank numbered pin. Preserve literal authored prose and safe report fencing.

Update `browser.mjs`, `data.mjs`, and `lib/review.mjs` together. The current `validateCapture` signature equality and full-element selector hashes must not survive as hidden version-2 cross-renderer gates. The provider must validate the closed evidence contract and its correspondence with frozen work and the owned capture result, not trust browser-supplied success flags.

### PNG And Composite Verification

Retain viewport capture with `captureBeyondViewport: false`, the controlled sRGB pipeline, DPR control including the owned child frame, and actual nested-scroll readback. Do not use full-document resizing/cropping or silent downscaling to make the image fit.

Keep real source PNG plus plain-SVG marker composition through shared `markerSvg`. Include the same effective annotation clips used for admission and live painting. Preserve badge containment, source/overlay/composite verification, actual PNG decoding/MIME/dimensions, and the existing image-verification bounds.

Source and overlay bytes may remain ephemeral inputs to verification; no additional durable image store is needed. Before waiter delivery, reread and validate the exact-owner sealed files, hashes, PNG bytes, dimensions, report correspondence, source context, and in-memory seal attestation. SDK result shape alone is insufficient.

## Required Non-regressions

These are retained delivery behaviors, not approval to redesign the interface.

| Behavior | Obligation |
| --- | --- |
| Invisible-annotation prevention | Reject an invalid new candidate before history, viewport pinning, or autosave. Retain pre-existing invalid work for explicit correction without silently moving or deleting it. |
| Hidden equals blocks-submission | Keep one visibility/containment answer across live painting and capture admission. Preserve `clipHidesAnchor`, fully contained anchors, badge containment, and real clipping effect. |
| Inline Send feedback | Preserve progress, numbered blockers beside Send, and Inspect annotations leading to existing correction controls. Avoid an inert action or a hidden-only explanation. |
| Owner acknowledgment | Accepted/applied/declined/unavailable owner evidence overrides local sent copy. Sending annotations, saving markup, and closing the comment editor never imply approval. |
| Optional marker text | Blank numbered pins remain valid when their target and geometry pass. The recent implementation is reported landed and independently approved; Tester confirmation remains pending. |
| Pinned reviewed viewport | Pin before accepting the first annotation; panel resize may pan the stage but must not reflow or rebase the review. Preserve genuine frame/theme/DPR/source invalidation and validated same-submission restoration. |
| ZoomIt arrow gesture | New arrows capture the head at pointer-down through endpoint assignment. Preserve stored endpoint meaning and existing SVG rendering so previously saved arrows do not reverse. |
| Capture deadlines | First browser handshake: 10 seconds. Subsequent commands: 4 seconds. Overall capture/provider bound: 30 seconds. Preserve bounded cleanup and honest cleanup uncertainty; do not widen deadlines to hide a mismatch. |
| Failure and delivery | Capture/validation failure retains markup and does not consume the still-current waiter. Existing sealed evidence never overwrites. One report and its actual PNG reach the original waiter once; no report-only success, automatic replay, or new session send. |
| Approved UI and accessibility | Preserve rev-8.2, subsequent approved integration behavior, reachable floating tools, meaningful selected/comment/saved states, focus indicators, caret behavior, and source/static/legal parity. |

## Acceptance Matrix

T013 supplies focused contract and format evidence. T012 retains complete integrated acceptance, including all FR-015 states and all six forms at every SC-006 width/theme combination.

| Case | Observable pass/fail target |
| --- | --- |
| Installed blank non-Git directory and empty Git repository | Host discovers the correct workspace; Canvas capture reaches brainstorm; acknowledgment and canonical reread reveal the draft without tasks/specs or command-first interaction. |
| Missing directories; drafts without tasks/specs; mixed defined work and 50 drafts | Complete discoverability, separate query/selection, no recency selection or owner fabrication, and Define-first only for ineligible Review. |
| Deferred source, blank Answer with disposition, historical resolved request | Visible nonurgent context; no invented request, automatic Defer ledger, duplicate source-backed idea, or history-based restoration. |
| All six current request classes | Real-provider responses reach the same owner and reflect explicit acknowledgment/reread, including declined responses and the annotation loop. |
| Several cards and similarly named requests across scopes | Deduplicate only the same request; keep distinct contexts accessible and one current blocking clarification within the active interaction. |
| Preview A -> B; operation X -> Y; wrong literal permission | No inherited approval, generic-assent bypass, or operation executed by Canvas. |
| Outside chat/file answer and source edit during submission | Owner recognition or stale refusal; literal text preserved; no duplicate prompt, overwritten edit, or automatic definition. |
| Repeated click, SSE reconnect, close/reopen, uncertain send, cancellation, and session replacement | At most one response/send per receipt, owner-confirmed presentation, no automatic replay or revived invocation. |
| Save as idea, existing-intent match, and lost acknowledgment | Explicit selected intent follows normal brainstorm matching; canonical reread precedes saved status; ordinary Defer remains non-durable without a source. |
| Partial inventory, removed deferred source, stale and healthy contexts together | Scoped coverage and retained healthy interactions; no unqualified zero or implicit reactivation. |
| Actual inline host plus owned Chromium at 989x728 DPR2 and other required fixtures | Equivalent portable evidence succeeds despite different computed-CSS serialization. Use synthetic/disposable source and markup, not protected user review data. Same-engine-only tests do not establish this case. |
| One changed identity, scroll readback, selector/tag/text, projected rectangle, clipping effect, visibility, or containment | Refuse the failed check without widened geometry tolerance, retargeting, sealing success, or waiter consumption. |
| Host-local or Chromium-local change during observation/capture | Before/after stability check rejects the race without requiring host and Chromium signatures to equal each other. |
| Anchored nested scroll, sticky/vh layouts, fully contained and partly clipped anchors, free drawings | Correct projected coordinates, effective paint regions, badge containment, and viewport-to-image scaling. No full-document crop or DPR1 assumption. |
| New invalid candidates and retained invalid annotations | No invisible candidate enters history/pinning/autosave; retained invalid work stays editable; hidden and blocks-submission are the same set. |
| Valid blank pin; new and previously stored arrows | Blank text does not block Send; the image carries its number. New head-at-press input and old endpoint rendering both remain correct. |
| Inline blockers and later declined/unavailable acknowledgment | Numbered Send errors and Inspect annotations remain actionable; current owner outcome wins over local sent copy. |
| First handshake, later commands, and overall timeout | Late valid first reply is accepted within 10 seconds; missing first reply refuses at its bound; later commands remain at 4 seconds; the overall 30-second bound and cleanup behavior hold. |
| Scroll-time readiness message | Distinguish actual font/image/animation readiness, bridge-query timeout, and view-refresh mismatch with bounded evidence. An unidentified cause remains open rather than being relabeled as loading or as this capture defect. |
| Version-1 history and version-2 evidence in synthetic fixtures | Old report bytes validate under the old builder/validator; new reports carry the new limits and checks. Unknown/malformed versions, forged evidence, wrong hashes, and report/image mismatch refuse. No real review file is migrated or used as a fixture. |
| Exact owned mock revisions A, B, and C | Two report/actual-PNG responses reach their original waiting tools once; owner revisions/acknowledgments yield fresh requests; explicit approval applies only to C. |
| Other-feature Review, missing/ambiguous owner, unsafe path/symlink | Correct target-owner storage and provenance; no fallback to 057, unrelated workspace reads, or unsafe writes. |
| Missing executable, capture failure, malformed PNG, wrong provenance, partial or sealed writes | Retained markup, current request unconsumed where still valid, no report-only/marker-only success, no overwrite, installer, or automatic retry. |
| Untrusted Host/Origin/frame message, extra fields, forged handles, unsafe/oversized text | Refuse without protected mutation, cross-scope disclosure, token logging, or silently altered intent. |
| Editing, leave/return, panel resize, restoration, keyboard/focus/caret | Preserve the pinned frame, tools, annotations, usable focus, text selection, undo/redo, and genuine invalidation boundaries. |
| Source, packaged, and installed builds | Exact runtime/static/legal parity, no frontend/test/dependency leakage, no runtime Sharpie/optional-pack read, and no consumer install/build. |

Use `scripts/dude-canvas-ui/browser.test.mjs` with `DUDE_CANVAS_BROWSER_REQUIRED=1`, real `createFixtureServer`/`openInstance`, realistic filesystem data, and existing Beads-process fixtures where applicable. Preserve the established click-count, discovery, geometry, screenshot, accessibility-tree, contrast, error-transition, and caret oracles. Test transient observations atomically where the existing diagnosis requires it; do not weaken behavior assertions.

Use a positive cross-renderer fixture that fails if the old equality gate is restored, plus focused negative cases that fail if existing identity/geometry/visibility/containment checks, renderer-local stability, or evidence-before-consumption guards are removed.

Actual installed-host evidence remains independent of SDK types, mocked owner writes, augmented profiles, or a separately rendered Edge URL. Run the complete automatable interaction script first; request only a named host-unique observation through the existing owner handoff.

## Protected Material And Execution Boundary

All existing content under `.dude/specs/057-dude-canvas-needs-you/reviews/` is protected. Do not write, migrate, rewrite, or use it as fixtures. This includes the supplied current review `ee8a558b-e0cb-49f6-9205-7e0b5c885f86`, whose supplied identity is `sha256:42052b25ce2c2689b74f2c3b42c70b459bb444b26e69c66e9854a018ae777130`.

The approved mock, JSX, three assets, legal notice, preserved variants, and screenshots remain unchanged. Their approved identities are in the spec. Contract and version tests use disposable synthetic owners, sources, annotations, and evidence; they do not create a second production Feature 057 package.

This staging grants no access to drive or write `http://127.0.0.1:58865/`, touch provider PID `63484`, restart a host, execute Work, or commit Git changes. Later runtime actions require their existing authorization. Definition changes may stale a current request whose source revision includes the changed artifacts; do not preserve that authority by replay, retargeting, or editing saved review files.

## Phases And Traceability

| Task | Retained or proposed outcome | Spec basis |
| --- | --- | --- |
| T007@a57c0707 | Retain completed actual-host and installed text/image feasibility proof | US1/US3/US4; FR-001/007/009/018/020/022 |
| T008@a57c0808 | Retain the approved rev-8.2 mock and preserved design variants | FR-015–017/019; SC-006 |
| T003@a57c0303 | Retain exact discovery, source dispositions, and scoped coverage | US1/US2/US4; FR-001–005/011/012; SC-001/002/005 |
| T009@a57c0909 | Retain bounded publication/reply/acknowledgment, typed image handoff, capture, and producer guidance | All stories; FR-004–014/020/022 |
| T010@a57c1010 | Retain the adapted HTML engine, owner-bound files, capture, and sealing baseline | FR-019–022; SC-004/006–008 |
| T011@a57c1111 | Retain the approved production interface and Review integration | All stories; FR-001–022 |
| T013@a57c1313 | Remove cross-renderer style/signature equality at the four existing edit sites; retain local stability, versioned validation/reporting, and focused falsifiers | FR-019–022; SC-004/006–008 |
| T012@a57c1212 | Complete integrated/desktop acceptance, retained regression checks, diagnostics, documentation, and shipped parity after T013 | SC-001–008 |

The first two phases remain recorded capability/design and implementation work. The final phase retains T011 and T012 and inserts the bounded T013 correction before final acceptance. No completed key is replaced or dropped. T012 survives one-to-one; its acceptance outcome remains unchanged, with a corrected oracle and a new prerequisite. T013 inherits no state or completion evidence.

No parallel marker is proposed: the correction and acceptance work share Review, provider, and browser-test surfaces. No ObjectiveRegistry is needed because no current runtime caller requires a compiled evaluation contract for this feature.

## Guardrail Check And Remaining Risks

- The formal guarantee is narrower than whole-view equality. Source/target identity and geometry can establish useful aligned feedback while painting still differs. Reports and acceptance must carry that distinction consistently.
- The cross-engine comparison defect is established; removing it still requires focused tests and actual-desktop acceptance. This definition correction supplies neither runtime evidence nor deployment authority.
- The scroll-time readiness message conflates actual loading, query timeout, and view-refresh mismatch. Its reported incident remains undiagnosed; the cross-engine capture explanation must not be used to close it.
- Optional marker text is accepted behavior with reported implementation/review evidence, but Tester verification remains outstanding.
- Old-format evidence is a real current caller. Preserve its validation and exact report bytes; new capture semantics must not rewrite historical files or change the saved descriptor and `view.signature` schemas.
- Current provider/source revisions may differ from staged or deployed code. A definition refresh neither proves runtime deployment nor authorizes restarting the protected provider.
- Supported-platform capture and the actual desktop path require fresh acceptance. Do not widen geometry/timeout limits, install a browser, make screenshots optional, or add bitmap/input transport to avoid an honest prerequisite gap.
- Existing owner, source-isolation, consent, Work, and task-state authority remain unchanged. No new project guardrails or durable workflow state are introduced.

The coordinator owns fresh exact-owner/preimage checks, execution reconciliation, transactional publication, and lint. Both definition and coordinator halves must be restored if either half or lint fails. This stage records no execution or validation result.
