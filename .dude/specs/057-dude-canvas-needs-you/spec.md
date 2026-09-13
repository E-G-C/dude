---
title: Dude Canvas Needs You
slug: dude-canvas-needs-you
work_type: design
design_status: approved
approved_direction: "rev-8.2: unified work landing and same-session response interface"
preview_path: .dude/specs/057-dude-canvas-needs-you/design/needs-you-workspace.html
---

# Feature Specification: Dude Canvas Needs You

## Outcome

Users can discover what needs their attention and respond visually in Dude Canvas, starting with an installed blank workspace and continuing through captured ideas and defined features. Each request explains why a human is needed, what response is expected, and what that response unblocks. The active agent applies the response through the existing workflow; Canvas shows the resulting owner-confirmed state.

This replaces routine chat-only discovery and response for this attention loop. A count of unanswered questions, a read-only report, or copied commands alone would not deliver the outcome. For HTML mockup feedback, the first delivery includes working on-mock Sharpie annotation, report and image return to the same agent, revision, and repeated review until explicit approval of the current revision.

## Scope And Surfaces

The surface is the existing single Dude Canvas in the current workspace. The first functional delivery includes:

- A useful blank-slate welcome and visual idea capture through the existing `brainstorm` route.
- Discovery of every captured draft idea, its intent and current input needs, and known nonurgent or deferred work, without requiring a feature package or tasks.
- Current idea-, feature-, and session-scoped requests, including requests before feature selection.
- Visual responses and iteration for the six request classes below, with owner acknowledgment, refreshed state, and safe handling of stale or unavailable context.
- User-entered Sharpie Review of an exact current HTML mockup within Canvas, preserving annotations and immutable submitted report/image evidence under the mock's actual owning package.
- Continued discovery of deferred items and honest coverage information across reloads and session changes.

For an unfiled live matter with no canonical source, Canvas offers an explicit **Save as idea** action that explains its effect: capture the user-selected intent through the existing brainstorm workflow. This is separate from ordinary **Defer** and requires the user's capture instruction at use time. The resulting canonical draft remains discoverable through ordinary idea discovery; Canvas does not persist the request queue or promise to restore every pending session request after restart. Already-source-backed matters retain their existing owner and source.

All four user stories and all six request classes belong to the first delivery. Story priorities guide attention to user risk; they do not authorize silently omitting a lower-priority story. Displaying a request and submitting its response are in scope. Executing the underlying approved operation remains with its existing owner and safety gates. Coverage is context-dependent: a blank workspace supports discovery, capture, and applicable current questions, not a fabricated preview for every form. Annotatable canonical mocks require explicit definition and an exactly owned package; a draft without one shows the Define-first prerequisite without automatic definition, storage allocation, or a blank artboard.

Image evidence follows FR-022's fresh-render alignment contract. Native-pixel capture, glyph-level equivalence, whole-page paint equivalence, and arbitrary interaction-state replay are not delivery guarantees.

Out of scope: a second board, independent backlog manager, persistent request database, general notification platform, runtime chat mining, cross-repository aggregation, priority reordering, a new agent session, automatic orphan cleanup or takeover, new Ship/Work rules, a Git UI, and changes to team or pack management. Sharpie reuse is limited to HTML mockup review; PDF, export, standalone Sharpie operation, every upstream feature, external-repository synchronization, and a general visual-capture platform are excluded. Review opens on user entry from a current request, not automatically on every mock update.

Related work stays separate: 052 and 055 remain closed, 056 remains deferred, and 053/054 are not reopened or absorbed. The 025 report remains functional until its actual replacement; this feature does not replace full backlog management. Cross-feature references are research bookmarks, not dependencies or implied execution order.

## User Stories And Independent Acceptance

### US1 — Start from a blank workspace (P1)

As a user with Dude installed but no ideas, features, tasks, or selection, I want a visual next step so I can capture intent without learning commands or creating setup artifacts.

**Independent test:** Start in an installed empty directory, then repeat in an empty repository. Use Canvas to submit an idea to the joined active agent.

1. Given no project work exists, opening Canvas shows a welcome, explains the useful next step, and offers working idea-entry and submission controls rather than a missing-feature error.
2. Given the user submits intent, the existing brainstorm workflow captures the draft. Canvas waits for owner confirmation and rereads the captured result; it creates no fake task, spec, selection, or execution request.
3. Given the submitted intent already supplies onboarding facts, the agent does not ask for those facts again. Any remaining outcome-changing question appears through the same visual response path.
4. Given the agent connection becomes unavailable, the welcome and entered intent remain understandable, submission is unavailable with a reason, and no capture success is claimed.

### US2 — Find work before and after definition (P1)

As a user with several ideas and features, I want to see their intent, current requests, and later work without knowing which file to open or which feature was most recently used.

**Independent test:** Use a workspace containing multiple drafts, a defined feature, a deferred item, and an idea whose blank answer has a valid owner disposition.

1. Every draft can be discovered before it has a `spec_path` or tasks. Its input needs and known nonurgent work remain distinguishable from active requests on defined features.
2. A request outside the selected feature remains discoverable. Selecting or filtering one context does not globally dismiss another context's requests, and one feature's block does not block unrelated features.
3. A valid deferred disposition remains discoverable without appearing urgent or resolved. An empty answer slot does not resurrect a question that the current owner has already disposed of.
4. A partial or failed source read reports the missing coverage. It never produces an unqualified "nothing needs you" result.

### US3 — Respond to the actual request (P1)

As a user, I want the right context, input, and choices in Canvas so I can answer, revise, approve, consent, or report a manual result without routine chat-only handoffs.

**Independent test:** Present one current owner-bound request for each class in the request coverage table. Complete its visual interaction through the active agent and inspect the owner's resulting state. For the preview class, annotate and submit two successive mock revisions under FR-022, then explicitly approve the current revision.

1. Each request identifies its context, current owner, source, revision, human-only need, and expected response. Each class supplies its specified visual interaction rather than a generic "go to chat" control.
2. Submitting a response shows that it was sent or is awaiting acknowledgment. Acceptance or application appears only after current owner confirmation and a fresh read; a declined response remains distinguishable from a fulfilled request. Owner-confirmed results take precedence over local sent-state copy.
3. From the current preview request, the user opens the exact mock revision in Sharpie Review, annotates on the mock, and sends semantic feedback with an annotated page image to the same active agent. Sending feedback does not approve the preview. The design owner revises the canonical mock, acknowledges with fresh evidence, and requests review of the new revision; the user repeats until explicitly approving that revision.
4. Returning from Review retains the selected Needs You context and useful annotation/focus/viewport state for the unchanged revision. Prior submissions remain inspectable with their original source revision and cannot overwrite a later review.
5. An admitted permission response reaches the operation owner but cannot execute the operation directly. Missing eligibility evidence or a mismatched target leaves the existing stop intact.
6. Requests that the owner can already resolve under current authority remain agent work. Normal debugging, reviewer failure, progress, and successful completion do not become human requests merely because they appear in activity.
7. A fresh rendering with verified source and target identity, geometry, and visible regions can be submitted despite renderer-specific style notation. A geometry, clipping, identity, visibility, or containment mismatch, or instability within either view, instead retains the markup and explains the failed check without claiming delivery.

### US4 — Return without losing or repeating decisions (P2)

As a returning user, I want deferred work and response status to remain understandable so I do not repeat an answer, approve an old revision, or mistake missing context for completion.

**Independent test:** Submit and defer source-backed requests, explicitly save an unfiled live matter as an idea, reload Canvas and restart the provider, edit an answer outside Canvas, revise a preview, and change the joined session.

1. After reload or provider restart, acknowledged responses and deferrals reflect their current authoritative sources. Source-backed deferred work and an owner-confirmed saved idea remain discoverable without restoring a pending-session queue; no response is silently resent.
2. An answer supplied through chat or a file edit is recognized through the current owner. Canvas refreshes without duplicating the prompt, overwriting the edit, or defining the idea automatically.
3. An old preview, choice, or operation target cannot inherit approval after a revision or selection change. Canvas rejects the stale response or obtains fresh owner context and reconfirmation. Source or asset drift prevents old annotation coordinates or selectors being applied to the new revision.
4. Loss of an acknowledgment or a prior session leaves an explicit uncertain or unavailable result. Canvas neither claims fulfillment nor revives the old invocation; a fresh owner request is needed to act again. Saved review files preserve work and evidence, not live request authority.
5. For an unfiled live matter, **Save as idea** clearly requests brainstorm capture of the intent the user chooses to retain. The owner applies normal matching and duplicate handling; capture is confirmed only after owner acknowledgment and a reread of the canonical result. Ordinary **Defer** does not create an idea. Without an acknowledged canonical source, Canvas must not claim durable deferral or hide the matter as successfully saved; it explains the limitation and offers explicit capture.

## Request Coverage

This table defines the first delivery's interaction coverage. The cited cases are analysis provenance from the selected idea's Session Scenarios, not runtime pending requests.

| Request class and evidence | Required display and visual response | Owner boundary |
| --- | --- | --- |
| No feature yet: blank-slate and pre-selection cases | Welcome, intent entry, capture submission, and a choice of existing context without preselecting by recency or number. Show remaining onboarding questions only if needed. | The coordinator routes existing brainstorm or context selection. Capture does not authorize definition or execution. |
| Factual intent clarification: scope and Canvas constraints from the current session | Show the specific missing fact and what it changes. Provide suitable text input or bounded choices and a way to revise the answer. | The definition or requesting owner records the response. Technical research is not reassigned to the user. |
| Specific preview approval or revision: selector and completion-card design iterations, 052/054, and Q4 | Make the exact current HTML mock viewable in Sharpie Review, support on-mock annotations and semantic report/image submission, and return to Needs You for further revision review or explicit approval. Missing preview, exact owner, or capture capability has an explained unavailable/prerequisite state. | Feedback requests revision of the canonical mock by the design owner, not production UI changes. Approval applies only to the current reviewed revision. No automatic opening on every update or new session is implied. |
| Manual host action or host-only observation: relaunch/reload/reopen and screenshot reports, 052/055 | Show the exact revision, bounded steps, why automation cannot do the step, and the requested observation or evidence. Provide controls to report completion, a problem, or the observation. | The user performs only the unavailable host step or subjective judgment. The owner evaluates evidence and owns diagnosis, fixes, and verification. "Done" alone is not technical proof. |
| Exact operation-specific consent: the recorded cleanup/fresh-claim requests | Show exact targets, current preview, consequences, required confirmation, and eligibility context. Provide the specific permission response required by that operation, not a reusable approval. | The operation owner revalidates safety and executes, or refuses. Historical permission, typed/copied tokens, generic assent, and user testimony do not substitute for current authorization or technical proof. |
| Genuine priority, recovery, or scope choice: 052 stops, 056 deferral, and the reported 040 continuation case | Explain the human choice that changes the outcome, alternatives and consequences, and what each response unblocks. Provide the relevant choice and clarification controls. | Existing Work and coordinator owners decide eligibility and continuation. No permanent per-task Resume approval, cleanup authority, or revival of a dead supervisor is added. |

## Requirements

### Discovery and response

- **FR-001:** In an installed blank directory or repository, Canvas must provide a helpful welcome and a working visual path to capture intent through the same active agent's existing brainstorm workflow. Users must not first type commands, open files, create tasks/specs, or select a nonexistent feature.
- **FR-002:** Canvas must make all captured drafts in the current workspace discoverable before definition, showing their intent, current input needs, and known nonurgent/deferred work alongside defined-feature discovery. Discovery must not depend on a task board, a populated `spec_path`, or the current selection.
- **FR-003:** Each displayed context must retain its authoritative identity and scope. Draft identity comes from its exact idea ledger; defined-feature ownership comes from exact `spec_path` ownership; a session-only request stays session-scoped. Lifecycle numbers and recency must not infer selection, urgency, priority, dependency, or execution order. Context filtering must not dismiss other requests or make an unrelated feature appear blocked.
- **FR-004:** An actionable request must be explicitly current and owner-qualified, with request identity, source, idea/feature/session context, revision or equivalent freshness evidence, expected response, why a human is required, and what the response unblocks. Missing or conflicting authority must produce an unavailable or ambiguous item, not an actionable guess.
- **FR-005:** Existing owners must perform already-authorized decisions, research, automation, diagnosis, and continuation before requesting human intervention. Canvas must reflect their admitted requests and dispositions rather than add a central policy gate. Blank answers, historical reports, reviewer failures, normal debugging, progress, and completion alone must not create requests. Ordinary define ratification, eligible explicit-Ship pre-Work owner dispositions, and post-Work stops retain their existing distinct rules and attribution.
- **FR-006:** Canvas must support visual discovery, response, and iteration for every class in the request coverage table. Inputs and choices must fit the requested fact, preview decision, observation, or exact permission. Show all admitted requests, but prompt only one current blocking clarification at a time within the active interaction. Exact copied commands or messages may remain an expert fallback, never the primary response path.
- **FR-007:** Canvas submissions must reach the same joined active agent/coordinator, which applies them through the existing owning workflow. Canvas must not directly edit answer files, task state, approval state, or execution authority. After owner application, Canvas must reread the relevant state rather than treating its submitted value as authoritative. Scoped review working files and submitted evidence are legitimate feature outputs, not permission to change protected workflow metadata.
- **FR-008:** Canvas must distinguish an unanswered request, a submitted response awaiting acknowledgment, owner-accepted/applied results, declined responses, deferral, and stale/unavailable context. Only the current owner can acknowledge a response from Canvas, chat, or external edits; submission is not fulfillment. A current owner acknowledgment, including declined or unavailable, must take precedence over local sent-state copy. User-authored intent and answer prose must retain its wording, meaning, and intentional formatting through handoff and recording, except for an explicit user edit. Transport escaping or source markup must not alter that content; unrelated source prose must remain unchanged.

### Freshness and safety

- **FR-009:** Responses and approvals must remain bound to the request's current context and relevant revision. Changed artifacts, choices, targets, selections, or session ownership must invalidate affected stale actions or require owner revalidation and user reconfirmation. Neither a reload nor a new session may transfer authority from an old invocation.
- **FR-010:** Multiple appearances of the same owner-qualified request in chat, task, or design context must resolve to one attention item without merging distinct requests. Repeated clicks, reloads, and uncertain delivery must not silently submit duplicates. Missing acknowledgment must remain uncertain until reconciled with the owner; retry must not mean automatic resubmission.
- **FR-011:** Owner-acknowledged deferral must remain discoverable from existing authoritative workflow sources after reread, reload, or provider restart, distinguishable from urgent and resolved work. A request to defer remains awaiting acknowledgment until the owner applies it. For an unfiled live matter, Canvas must offer explicit **Save as idea** through existing brainstorm, with its capture effect clear before submission; ordinary **Defer** must not create a ledger or imply durable retention without a canonical source. The brainstorm owner must require current user capture intent, apply existing matching and duplicate rules, and confirm the canonical result before Canvas reports it saved. Source-backed deferred matters must use their existing owner/source rather than duplicate ideas. Capture preserves the selected intent and appropriate provenance, not a request-card dump, claim tokens, privileged raw details, stale consent, or sensitive payloads by default. Saving intent grants no approval, execution authority, or automatic definition and introduces no new deferred status or request store. Current user/owner reactivation is required before treating deferred work as urgent again. Missing or lost source evidence must remain uncertain or unavailable, never a successful deferral, silent disappearance, resurrected blank question, or promise of pending-request restoration from transient session state.
- **FR-012:** Canvas must expose whether attention coverage is loading, current, partial, stale, or unavailable and identify the affected scope. A no-current-requests result must be qualified by coverage and retain entry points to ideas and deferred work. Unknown data must never be reported as "0 needs you."
- **FR-013:** A consent or approval control must communicate its exact effect and preserve the source owner's permission and evidence rules. Typing or copying a token, selecting an artifact, submitting unrelated assent, or reusing historical consent must not authorize an operation. Current preview, exact confirmation, target eligibility, and safety proof remain the operation owner's responsibility; Canvas must not bypass refusals or execute cleanup, takeover, Git, or Work actions itself.
- **FR-014:** Manual requests must identify the unavailable automation or human-only judgment and the evidence needed to finish the handoff. Existing automatable checks and retrievable Canvas context must be handled by the agent first. Canvas must not make host restart automatic during an active invocation or delegate ordinary debugging and whole-feature quality assurance to the user.

### Visual and delivery quality

- **FR-015:** Every state in the user stories must have a usable visual treatment: blank, draft, defined, current request, responding, awaiting acknowledgment, accepted/applied, declined, deferred, successful completion, no current requests, loading, partial, stale, and unavailable. Review adds editing, capture failure, sealed evidence, and source drift within that same surface. Send must show progress and actionable failures beside the action, including numbered annotation blockers and Inspect annotations. Known loading, timeout, and mismatch causes must not be presented as interchangeable facts; an undiagnosed failure must remain honestly unidentified. Every actionable control must have a real supported outcome. Unavailable actions must explain why without presenting dead controls; successful completion must not look like an error.
- **FR-016:** The interface must inherit the existing Fluent 2 visual language within one fluid Dude Canvas, usable from 360 to 1440 pixels wide in light and dark modes. Required context and response controls must remain readable and operable without clipping or page-level horizontal scrolling. All interactions must support keyboard operation, visible focus, meaningful accessible names and status communication, and inherited WCAG 2.2 AA conformance, including contrast and SC 2.5.8 target size (24 by 24 CSS pixels or a qualifying exception).
- **FR-017:** The new interaction design must receive explicit user preview approval before UI implementation. Definition must precede the first managed mock render/export/capture. The primary preview is the exact frontmatter `preview_path`; the revision and artifact identities in Proposed Direction bind the design decision. Existing visual constraints alone do not constitute approval of this feature's layout or controls.
- **FR-018:** The first installed delivery must provide the complete attention loop through the real provider, with source-build and packaged artifact byte parity and no consumer-side dependency installation or build. Acceptance evidence must exercise the full user-observable interactions, realistic data, state changes, keyboard/focus, geometry, screenshots, accessibility, and contrast before human handoff. Human verification is limited to documented host-unique behavior the harness cannot automate. Required image capture must use an actually available supported host capability; absent capability is an explicit prerequisite failure, not optional evidence or silent new dependency acquisition.

### On-mock feedback and revision

- **FR-019:** A current preview request for an exactly owned HTML mock must offer user-entered Sharpie Review inside the same Canvas. Preserve Sharpie's annotation interaction grammar, repeated tool use, undo/redo, comment editing and caret behavior, tool selection, selector-anchored feedback, captured text/styles, and keyboard interaction. Marker text is optional; a blank numbered pin is valid when its target, geometry, and visibility are valid. Reject a new annotation that would be invisible or outside its permitted region before accepting it into the review. Retained invalid markup remains listed and editable without silent movement or deletion. The set of annotations hidden for invalid visibility or containment must also block submission. Every submitted marker and its number must respect the applicable paint region. Return to Needs You must preserve selected context and useful markers, comment focus, and the pinned reviewed viewport for the unchanged revision. Resizing the surrounding panel must not rebase the review. Definition is required before canonical mock review; drafts remain discoverable without fabricated review storage.
- **FR-020:** Sending annotations must deliver a semantic report and an actual annotated page image satisfying FR-022, both bound to the exact request, mock revision, assets, and viewed context, to the original waiting active agent. A reference to an image without the image is insufficient. The owner must treat the feedback as a request to revise the canonical mock, not as approval or authority to write production UI. After revision acknowledgment and a fresh request, the user can review and annotate again. Only explicit approval of the current reviewed revision completes its approval request; changed revisions inherit no approval.
- **FR-021:** Review working markup and viewport may be saved only beneath the exactly owned target spec's `reviews/<submission-id>/`; each submitted report, image, and provenance must be sealed without overwriting earlier submissions. Bind evidence to source and asset revisions, viewed dimensions and scroll, image dimensions, capture renderer/version, capture mode, verified checks, limitations, and selector match counts. Historical evidence must remain verifiable according to its recorded format and claims; a refresh must not rewrite sealed evidence or upgrade its guarantee by assertion. Restore work from files as evidence only. No matching owner, ambiguous ownership, source drift, or changed selector binding permits a write or retargeting by path/name fallback.
- **FR-022:** Successful image evidence must be a fresh rendering of the exact reviewed HTML source with verified annotation alignment. It must not be described as captured native pixels or proof of glyph-level or whole-page paint equivalence.
    - Verify unchanged owner, request, source, and asset identities; matching reviewed viewport, display scale, theme, and root/nested scroll positions; and stable observations in each view.
    - For each anchored annotation, verify one selector-addressed target with matching tag and text identity, the matching projected target rectangle, compatible effective clipping and visibility, and annotation containment in both views. Geometry must match at the established measurement precision; tolerances must not be widened to admit a mismatch.
    - Unanchored drawings remain bound to the verified viewport and source revision. They carry no verified semantic target.
    - Captured target text and styles must be identified as observations from the host review. Their presence in a report does not prove identical capture-renderer styling. Differing renderer-specific style notation alone must not invalidate otherwise verified evidence, and equal boxes must never be presented as proof of equal painting.
    - Disclose these limits with the image and report. Markers-only output or an approximation that fails this contract cannot pass as valid page evidence. If the checks or capture fail, retain annotations, explain the failure, and leave the current request unconsumed unless it was independently invalidated by source or lifecycle change.
    - Recheck current source, report/image correspondence, and delivery context before submission. Exactly one report and its actual image may reach the original waiter once; uncertain delivery must not trigger a second send or a new session.

## Applicable Concepts

- **Context:** A current-workspace idea, exactly owned defined feature, or live session scope. A draft needs no manufactured spec owner.
- **Human request:** An explicit current request from a responsible owner, with the identity, freshness, human need, and response context required by FR-004. A historical example is not one.
- **Response and disposition:** User input and the owner's acknowledgment, application, refusal, or deferral. These are distinguishable observations of existing workflow authority, not a new persistent request lifecycle.
- **Review submission:** Working markup and then immutable report, image, and provenance for one exact mock revision under its owning spec. Historical evidence does not restore pending authority.
- **Verified alignment:** Agreement of viewport coordinates, projected target boxes, effective visible regions, and annotation containment under FR-022. It does not establish identical painting.
- **Coverage:** Which contexts and authoritative sources are currently readable and fresh enough to support the attention view. Coverage uncertainty is separate from an empty request set.

## Visual Intent

Canvas should make the useful next action easy to find while preserving the context needed to make a safe decision. Draft discovery and later work should remain reachable without competing with the current human request. Use plain language to distinguish "sent," "accepted," and "applied," and make success look successful.

The existing Fluent 2 system, fluid single-canvas composition, light/dark behavior, and accessibility constraints are inherited. Keep navigation stable and use plain action names. One work finder should support discovery without a permanent feature sidebar, duplicate selectors, or a diagnostic panel in the normal workflow.

The primary mock is `.dude/specs/057-dude-canvas-needs-you/design/needs-you-workspace.html`. Its source-traceable presentation is the implementation baseline; its static examples do not establish live delivery, saved state, or completed product acceptance.

## Proposed Direction

The approved direction is **rev-8.2**, preserved at the primary preview path and as an immutable reference in `design/variants/rev-8.2/`. The user explicitly approved this mock on 2026-09-07 at 14:25:48 UTC and requested implementation, with remaining polish deferred until integration.

- **Overview:** a useful landing page with current work, recorded progress, and eligible navigation into the current design. One inline work finder provides search and **Open / Closed / All** scopes. Closed includes completed features and resolved ideas without treating every resolved idea as implemented. Source-backed grouping is not agent activity or invented priority.
- **Navigation and Context:** keep Overview, Context, Needs you, and New idea as stable destinations. Context shows the selected record without another work picker or Browse popup. Finder query, scope, and inner-list position survive a Context round trip; switching roots resets that presentation state. Browsing selection remains independent of an unfiled idea.
- **New idea:** place **Submit / Save / Cancel** directly below the input with inline validation and feedback. Submit uses the existing brainstorm handoff; Save uses explicit capture for later without continuing discussion or starting execution. Both preserve literal intent. Cancel returns to Needs you and retains unsaved input in the current tab. Real saved/sent states still require the owner handoff and acknowledgment rules above.
- **Needs you:** show current owner-qualified questions and the appropriate response form, independently of feature browsing. Selecting a request keeps the user in that flow. Unknown request coverage is unavailable, not an empty inbox. Historical examples or blank answer slots do not create current requests.
- **Review:** provide eligible entry to the current canonical HTML design, local annotation tools, and return to the previous working context. Sending feedback and approving a revision remain separate. Production must replace the prototype's prepared-only output with the report, actual image, source binding, and acknowledgment required by FR-019–022.
- **Presentation:** preserve the existing Fluent components and tokens, compact controls, readable hierarchy, keyboard operation, and responsive light/dark layouts. Keep routine prototype information quiet while retaining real eligibility, stale-source, and unavailable-data warnings. Do not restore the removed Details diagnostics drawer.

### Baseline Artifact Identities

Paths below are relative to `design/`. The approval decision is carried by this specification and the owning idea's Coordinator Log; frozen prototype captions are not workflow authority.

| Artifact | SHA-256 |
| --- | --- |
| `needs-you-workspace.html` | `6cd15f3e695e9129356f70f6b55e0ad7b7e12023b6a2926da4dec29dced5d5ee` |
| `needs-you-workspace.jsx` | `0299120a73a03663935fc7dbe59dfdf1677df2bfea7d66792cec0060e58043a0` |
| `assets/workspace-snapshots.js` | `b426d55f2bafe52ade76dd501a72bec075a19decaa08c3848bb9d91c8c0e48ea` |
| `assets/overview-snapshots.js` | `967d5283282424263e3c40d4deb864e699f00aa7bd69b21b5d0d81448def71c2` |
| `assets/needs-you-workspace.js` | `c4af6948b7b08c29430eea4e9dac4804e1ece432a467fd330f235084e0829bfd` |
| `assets/needs-you-workspace.js.LEGAL.txt` | `38a227b01622013560f87b78b61c5ad917bc0408073e9c39d7443bbf5f76cc16` |

### Implementation Follow-through

The approved design, discovery, handoff runtime, Review engine, and production UI remain valid completed work within their recorded task scopes. The evidence-contract refresh does not reopen rev-8.2 or change the frozen mock and assets. Recently approved integration behavior remains subject to regression verification, not another visual-direction decision.

Actual desktop sending and final integrated acceptance remain required. The revised image guarantee must be implemented and verified rather than treated as satisfied by the earlier cross-renderer equality checks. Retained host reports and prior test limitations remain evidence with their original scope; this refresh does not call them fixed.

Existing-material intake was discussed separately and is not added to the approved capability envelope by this design decision. No new file-ingestion, persistent queue, tracker, or execution authority is introduced here.

## Revision Log

- 2026-09-07 14:42:07 UTC - Settled the iterated rev-8.2 direction and bound its six artifact identities before recording approval. All explored revisions remain preserved.
- 2026-09-07 14:43:37 UTC - Recorded the user's explicit rev-8.2 approval and instruction to proceed. Remaining polish is deferred to integration; required live behavior, safety, and final acceptance are not waived.
- 2026-09-11 - Staged the explicit inline preview/capture refresh. Defined fresh-render alignment and semantic-state evidence without native-pixel or whole-page paint equivalence, updated the corresponding failure and acceptance cases, and retained approved rev-8.2 and completed implementation work. No design reopening or completion is recorded.

## Edge Cases

| Case | Required result |
| --- | --- |
| Missing or empty idea/spec directories | Treat as a valid blank workspace, not a project failure; offer US1. |
| Several drafts, no feature selection, and a live session request | Keep drafts discoverable and the request session-scoped; do not attach it to the newest or highest-numbered idea. |
| Blank answer with a current assumption, settled disposition, or deferral | Preserve the user's answer bytes; use valid owner evidence or label ambiguity instead of inventing a prompt or answer. |
| Duplicate request appearances alongside a similar question in another feature | Deduplicate only the same owner-qualified request; keep the unrelated request visible. |
| File edit races a Canvas submission | Preserve the current source, reject or reconcile the stale submission through its owner, and do not overwrite either meaning silently. |
| Preview changes while approval is being entered | Do not apply the old approval to the new revision; require the current view and owner validation. |
| Review source/assets or selector bindings change | Preserve old evidence; require a fresh review, never remap old coordinates to the changed mock. |
| Draft mock lacks an exact defined owner; owner becomes ambiguous | Show Define-first or ownership failure; no fabricated package, path fallback, or review write. |
| Fresh rendering has different renderer-specific style notation but all FR-022 checks pass | Permit fresh-render evidence with the stated limits. Do not claim native pixels or identical painting. |
| Capture is unavailable, incomplete, unstable, or fails identity, geometry, clipping, visibility, or containment checks | Preserve markup, identify the failed check when known, and refuse successful submission. A warning cannot substitute for the missing evidence. |
| Target boxes match but unsupported transient content is present | Preserve the existing capture refusal; equal geometry and unchanged source do not promise host interaction-state replay or equal painting. |
| A drawing has no semantic anchor | Bind it to the verified viewport and revision and report that no semantic target was verified. |
| New candidate would be invisible; retained annotation later becomes hidden | Refuse the new candidate before accepting it. Retain old work for correction, and keep hidden and blocks-submission as the same set. |
| Valid numbered pin has no comment text | Keep it valid and include its marker, geometry, and target evidence; do not require filler prose. |
| Panel is resized around a pinned review | Preserve the reviewed frame and coordinates. A genuine source, frame, theme, or display-scale change still requires validation or refusal. |
| Scroll-time status has no established cause | Show uncertainty and retain markup. Do not assert asset loading, timeout, or view mismatch without evidence. |
| Sealed submission reopened after session loss or evidence-format change | Historical report/image remain readable under their original validation rules; no overwritten evidence, revived handle, inherited approval, or automatic send. |
| User reports "none active" or "done" for a sensitive/manual operation | Treat as testimony or an observation; the owner still establishes required technical evidence. |
| Submission outcome is lost during reload or session change | Show uncertainty, do not retry silently, and do not claim the prior invocation is live. |
| Owner declines or reports unavailable after a local send | Show the owner-confirmed outcome rather than overriding it with local sent copy. |
| Deferred source becomes unreadable | Show unavailable coverage and any verifiable deferred context without treating it as active or resolved; require fresh owner evidence to act. |
| Unfiled live matter has no canonical source | Offer explicit Save as idea with its capture effect explained. Ordinary Defer creates no ledger and cannot claim durable retention; missing context remains uncertain or unavailable. |
| Save as idea matches existing intent, or its acknowledgment is lost | Let the brainstorm owner apply existing matching/duplicate rules and reread the canonical result. Do not create a duplicate, silently resubmit, or infer capture success from delivery alone. |
| One context is stale while another has a valid request | Restrict the unavailable action to the affected context; preserve unrelated discovery and valid interaction. |
| Current owner can complete a qualifying Ship pre-Work disposition | Show the owner decision through existing activity rather than solicit a redundant user answer; do not apply that permission to ordinary define or Work. |

## Success Criteria

- **SC-001:** In both blank-directory and blank-repository acceptance runs, a user captures an idea through Canvas and sees the owner-confirmed draft without typing a command, opening a file, or first creating feature/task artifacts. Covers US1 and FR-001/007/008.
- **SC-002:** In the mixed-context acceptance workspace, every draft, current owner-qualified request, and acknowledged deferred item is discoverable. There are zero requests manufactured from blank answers, historical evidence, or ordinary agent work. Covers US2 and FR-002–005/011/012.
- **SC-003:** Each of the six request classes completes its specified visual response handoff through the real provider to an owner-confirmed result, including a revision or declined response where applicable. None requires the expert copy/chat fallback as its normal path. The preview class must also pass SC-008; text-only revision feedback is insufficient. Underlying operations remain subject to their existing owners. Covers US3 and FR-006–008/013/014/018–022.
- **SC-004:** Every stale-revision, changed-target, external-edit, duplicate-delivery, reload, and lost-session acceptance case produces zero unauthorized applications, silent resubmissions, overwritten user prose, or false fulfillment claims. Covers US4 and FR-008–010/013/021/022.
- **SC-005:** After reload and provider restart, every source-backed deferred item and explicitly saved, owner-confirmed idea remains discoverable and nonurgent. Ordinary Defer produces zero automatic idea captures; missing source or capture acknowledgment produces no durable-retention or all-clear claim. Existing-source cases create no duplicate ideas, and historical session evidence alone restores no actionable request. Selecting or blocking one feature leaves unrelated current requests accessible. Covers US2/US4 and FR-003/011/012.
- **SC-006:** Every FR-015 state and all six interaction classes, including Sharpie Review editing and return, are inspected at 360, 768, and 1440 pixels in light and dark modes. All primary interactions work by keyboard, essential content remains visible, WCAG 2.2 AA including contrast and target sizing is met, and no dead affordance is present. The implementation matches the explicitly approved preview and preserves the specified admission, blocker, numbering, and owner-acknowledgment behavior. Covers FR-015–017/019.
- **SC-007:** Source-build, packaged, and installed acceptance runs establish the same first-delivery behavior and exact shipped artifact bytes without consumer-side dependency installation or compilation. Real-provider harness evidence precedes any request for human host smoke; each remaining manual check names the host-specific limitation. Required capture capability is demonstrated in the supported environment, not inferred from an installation-free claim. Covers FR-018/022.
- **SC-008:** Through the real installed provider, complete two annotation/report/image submissions on successive revisions of an exactly owned HTML mock to the same active agent, followed by its revisions and explicit approval of the current revision. Both actual images reach their original waiting requests once with matching semantic reports, source provenance, verified checks, and FR-022 limitations; all submissions remain immutable under the target owner. Return context and saved working markup survive an unchanged-source reopen. A controlled cross-renderer case succeeds despite style-notation differences when the alignment checks pass. Cases with changed identity, projected geometry, visible regions or containment, instability within either view, or unsupported transient content refuse without consuming the current request. Source/asset drift, ambiguous selectors, missing capture, duplicate click, acknowledgment loss, and session replacement produce zero retargeted evidence, inherited approvals, or automatic resends. Blank valid pins remain sendable, and all submitted markers and numbers appear within their permitted regions. Report-only, path-only, or marker-only output cannot pass this criterion. Covers US3/US4 and FR-019–022.

## Scope Traceability

The intent authority is `.dude/ideas/057-dude-canvas-needs-you.md`, including all four existing user responses. This spec does not replace or rewrite those responses. The 2026-09-11 explicit re-definition request supplies the current preview/capture refresh without creating another feature.

| Intent or constraint | Specification coverage |
| --- | --- |
| Q1 and Current Direction: blank-slate guidance and draft discovery | US1/US2; FR-001–003; SC-001/002 |
| Q2 and Capture Boundary: visual-first interaction through the active agent, not historical read-only I2 or direct-answer-write I3 | US3; request coverage table; FR-006–008; SC-003 |
| Q3: continued discoverability, no approval to hide deferred work | US2/US4; FR-011/012; SC-005 |
| Q4: working Sharpie HTML annotation loop, same-agent revision until current approval | US3/US4; FR-019–022; SC-008 |
| Explicit inline preview/capture refresh and reuse direction | FR-019–022; verified alignment concept; capture edge cases; SC-008 |
| Session Scenarios: clarification, preview, manual observation, consent, recovery/scope, and pre-selection cases | All six request coverage rows; US1/US3; FR-004/006/013/014 |
| Ship-Owned Work Versus Genuinely Needs You: minimize avoidable turns without changing authority | FR-005/013/014; policy and evidence edge cases |
| Admission And Handoff and Source Gap: current owner, deduplication, acknowledgment, freshness, honest coverage | US4; FR-003/004/007–012; SC-004/005 |
| Capture Boundary and related-work constraints: one Canvas, existing workflow authority, no new backlog/store or bundled automation | Scope And Surfaces; applicable concepts; FR-013/016/018/021 |
| Existing design approval, accessibility, packaging, and harness constraints | Visual Intent; FR-015–018; SC-006/007 |

## Assumptions And Remaining Definition Dependencies

- All four questions have user responses. Q3 does not approve hiding deferred requests; Q4 requires the working loop in this delivery. No new user clarification or guardrail ratification is inferred.
- Durable discoverability uses existing authoritative workflow sources, including explicit brainstorm capture for otherwise unfiled intent. Save as idea is a specified user option, not a user-supplied answer or advance capture permission. Historical checkpoint summaries, ledger research, model prose, and blank-answer scans cannot supply runtime pending state. Structured session history may corroborate owner evidence but cannot establish a current pending request by itself.
- Existing discovery, current-owner handoff, Review, and production UI work remain the implementation baseline. This refresh corrects the image-evidence contract and its verification; it does not authorize a second request system or a replacement interface.
- Retain the already-adapted Sharpie HTML subset and required author/third-party notices. Leave the external repository untouched without synchronization, divergence tracking, or a runtime dependency. Standalone, PDF, and export behavior remains unnecessary.
- T007's feasibility evidence and the approved rev-8.2 mock remain valid within their recorded scope. Completed T003 and T009–T011 work is preserved. T013 must implement the revised evidence boundary; T012 retains integrated and actual-desktop acceptance. A missing required host/browser capability must stop dependent work with the concrete material scope choice if it cannot be satisfied without a new consumer prerequisite; it cannot relax the install/build-free contract or make screenshots optional.
- The source owners keep `.dude/` and Beads authority, operation eligibility, execution, review, recovery, and stops. Scoped review artifacts do not grant protected metadata write permission. The coordinator arranges any host lifecycle actions outside an active Work adapter claim or supervisor; this prerequisite grants no cleanup or restart authority. An unavailable source or ended invocation requires honest limitation and fresh owner context, not takeover.
