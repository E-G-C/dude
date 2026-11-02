---
title: Dude Canvas Redesign
slug: dude-canvas-redesign
status: draft
spec_path:
---

# Idea: Dude Canvas Redesign

## Idea

At 2026-10-29T12:52:47.779Z, the user wrote:

> a note, I'm not statisfied wit the current UI, however for the current features shoul I focus on the concepts rather that UI , i owuld tha be a fair statemett?

Dude agreed and recommended splitting 067: 067 would keep the concepts and change no screens, its Canvas parts would move to a later UI feature along with the user's UI concerns, and 087 would wait for that feature too.

At 2026-10-29T12:56:40.960Z, the user replied:

> split 067

## Open Questions

For definition; no answer is needed to capture this idea.

1. What about the current Canvas UI does not work for you, and on which screens?
   Answer:
2. Should the redesign keep 052's approved desktop workspace as its baseline and change parts of it, or start from a new direction? Either way, the Canvas continuity guardrail requires showing layout and navigation departures from that baseline and getting your explicit approval.
   Answer:
3. Should the first slice show the kind of work, stage, and progress that moved from 067, or should that wait until the overall direction is settled?
   Answer:

## Assumptions

No additional user assumptions supplied.

<!-- dude:managed:start -->
## Intent And Scope

Rework the Canvas UI that the user is not satisfied with, and present 067's concepts in Canvas: the kind of work Dude records for each item (its classification), the shared stage rule, and the read-only progress report. The user has not said what does not work for them or on which screens; question 1 asks.

With the split the user chose, 067 keeps those concepts and changes no screens, so the user will not see most of 067's concept changes until this idea shows them in Canvas. These Canvas parts move here from 067:

- Neutral work-item wording in place of idea and feature labels
- Capture form copy and status messages
- Quiet classification words in the work list and details
- The stage and progress report shown in the work list and details
- Waiting for you, based on the Canvas request feed
- 067's design gate and its continuity list of existing workspace parts to keep

067's re-definition records the exact requirement IDs that moved.

## Transfer From 067

`.dude/specs/067-work-type-presentation/design/pre-split-spec.md` and `.dude/specs/067-work-type-presentation/design/pre-split-plan.md` keep 067's spec and plan word for word as they stood before the split. Together they are the complete record of what moved here, including every moved requirement, plan section, and acceptance check. 067's spec lists the moved IDs and maps the removed plan sections under Moved To 089.

The obligations below come from that pre-split definition and cover what the six bullets above leave out. They are inherited obligations, not an approved design: no mock, wording, or layout among them is approved, and this idea's definition revisits each one alongside the open questions above. Question 2 decides the baseline they apply to, and question 3 decides whether the first slice carries them. Each group names the pre-split IDs it carries, and some bullets add checks from the pre-split plan.

Wording and guidance (FR-001 to FR-003):

- Use neutral work-item wording in capture entry points and actions, the work list, and details, and never call an item an idea or a feature because of its lifecycle state.
- Show mockup and Review guidance only when the item's definition records the design workflow or a current preview request exists for it. When Canvas cannot read all current requests, say that it cannot confirm whether a preview request is waiting, never that none is.

Classification (FR-007 in part, FR-035 to FR-037, SC-009, and the Canvas parts of SC-005 and SC-007):

- Show a recorded classification only as quiet plain words near the title, such as Fix · Code, never as labeled fields. Keep the recorded values available beside the words, so a later reader such as 087 never has to parse the words.
- Show nothing for an unrecorded or unrecognized value: no Not set, Other, Unrecognized, or Unavailable text, no warning or warning styling, and no instruction to set, confirm, or change it. Offer no classification control. After the user corrects a value in chat, the list and details show the new words on their next read.
- Classification never replaces or hides the title, captured description, stage, next step, current requests, or progress. Unavailable describes only a record, request source, or run evidence that could not be read, never an unrecorded classification.

Stage, report, and requests (SC-001 and the Canvas parts of FR-019, FR-023 to FR-025, FR-029, FR-030, and SC-006):

- Show the same stage in the list and details, from 067's shared stage rule, in place of today's stage words such as Idea, Verified, and Completed without a package. Dependency and order notes stay beside the stage and never change it.
- A record that cannot be read shows its stage and progress as unavailable and says nothing about its classification.
- Details show exactly the report Dude assembles for the item on screen, never one left over from an earlier read or another item, and add no phase, checkpoint, gate, waiting state, live-activity claim, or percentage of their own. Parts with nothing recorded go into one plain sentence.
- Show Waiting for you, with the request's kind and owner, only for a current request for the user's response about this exact item, whether its owner marks it blocking or advisory. Its source is the live request feed, never a file. It adds no required gate or blocker, leaves the stage unchanged, and is answered only through the existing Respond to request entry, which agrees with it for the same requests. Design approval stays the only required gate.
- When the request source is unavailable or partial, say so with the reason, never None or an empty list. A blank answer slot, history, or inventory never shows that anyone is waiting.

Capture (FR-012 to FR-014, FR-016, the Canvas part of FR-015, SC-003, and VSC-005):

- The form asks only for the description and offers Submit, Save, and Cancel. Submit saves it and continues brainstorming in chat, Save keeps it for later and starts nothing else, and Cancel returns to Needs you and keeps the draft. It has no intent or domain field, category choice, hidden required value, classification confirmation, or text explaining categories.
- A capture carries the user's literal text unchanged, and the Submit or Save choice, through sending, delivery, and the owner's read-back. It carries no classification.
- Show Saved only after Dude confirms the capture and Canvas reads the saved item back. Then name the saved item and show any note from the owner, with no classification result or comparison. If the read-back fails, do not show Saved. When the capture matched an existing item, report Saved for the item the read-back names and keep that item's recorded classification.
- When a capture cannot be sent, keep the draft and say why in plain words, with the next step. Name the first condition that applies, in this order: no connection, an unfinished import, a pending request in Needs you, which the user is asked to finish first, an earlier capture not yet confirmed, then a busy session. Keep that notice linked to the disabled Submit and Save buttons for assistive technology. Never send the capture later without the user's action. After a failure known to be unsent, send the same text again only when the user acts, and let the user edit it first.
- Never resend a capture after uncertain delivery. Keep the draft until the owner reconciles the capture.
- During Submit's brainstorm, Dude may ask one plain-language question when the outcome, scope, or route is unclear, never one only to classify. Save asks nothing.
- Capture messages avoid internal terms such as joined agent, owner, receipt, unfiled, reconcile, and metadata. The Needs you action that keeps a request's text for later, today Save as idea, says that it neither answers the request nor gives permission.

Continuity, approval, and checks (FR-033, FR-034, SC-008, VSC-001 to VSC-004, and the Canvas part of SC-010):

- Keep 067's continuity list and navigation's current destinations and order unless the user approves a departure, as the Canvas continuity guardrail requires. The list is 052's desktop workspace; 062's single search with Working on and Clear, the expandable rail, the compact list below 620px of list width, and the docked task detail at 1080px and wider; 057's capture and response behavior; and 085's ordinary and app-following light and dark appearance.
- Record the user's explicit approval of the exact mock before any UI source change or implementation-task derivation.
- At 1440x900, at 768x900, and with list content narrower than 620px, every row shows its number, title, stage, progress, and any classification words without a new column, clipped text, or page-wide horizontal scrolling, and its accessible name includes the same facts. Content reflows at 200% zoom, and below 1080px the task detail stays in the page flow.
- Text and essential controls meet WCAG 2.2 AA in ordinary and app-following light and dark, meaning never depends on color alone, and keyboard focus and accessible names cover every new element. The built screens match the approved mock.
- Run the complete automated interaction checks before any human check in the host. Then, in an installed project, capture one clearly described defect with Submit and one vague description with Save: only the first gets a classification, and Dude asks no question only to classify either one.
- Describe the new wording, classification words, stage meanings and the changed stage words, report, and capture messages in the Canvas documentation, and add the new checks to Canvas maintainer acceptance.

The pre-split plan also records how 067 meant to build these parts, including the UI rebuild, its legal file, and the hash pins. That is reference input for this idea's definition, which makes its own technical choices.

## Design History

067's round 1 to round 3 mocks, their preserved variants, and their verification stay under `.dude/specs/067-work-type-presentation/design/` as reference input. Round 3, the canonical mock at `.dude/specs/067-work-type-presentation/design/work-type-presentation.html`, is `proposed`, not approved, and nothing in that folder is approved for this idea. It renders 067's proposal inside today's Canvas workspace, and the user's editor had it open when they wrote the first message above. Because the user is not satisfied with the current UI, these mocks are inputs, not a baseline.

## Constraints

- Follow the UI mockup approval, Canvas continuity, and Canvas work-list presentation guardrails in `.dude/memory/guardrails.md`.
- Keep the user's 2026-10-23 correction that people are never asked what kind of work they are describing, recorded in `.dude/ideas/067-work-type-presentation.md` under `## Correction: Classification Stays Internal`.

## Related

- `.dude/ideas/067-work-type-presentation.md` supplies the concepts this idea presents.
- `.dude/ideas/087-dude-canvas-routing-map.md` waits for this idea's UI direction.
- `.dude/ideas/052-dude-canvas-ui.md` holds the current Canvas product vision, and `.dude/specs/052-dude-canvas-ui/design/fluent-desktop-workspace.html` is its approved workspace design.
- `.dude/ideas/062-dude-canvas-workspace-integration.md` combines 052's Now view with 057's working interactions in one workspace.
- `.dude/ideas/085-dude-canvas-app-theme.md` covers the optional setting that makes Canvas follow the GitHub app's theme.

Lifecycle numbers show capture order only, never priority, dependency, or execution order. 087's wait for this idea is a sequencing recommendation the user accepted with `split 067`, not a declared dependency.
<!-- dude:managed:end -->

## Coordinator Log

- 2026-10-29T13:01:42Z - brainstorm: Staged the first capture of the later UI feature from the user's `split 067` reply for coordinator first-capture publication, recording the user's dissatisfaction with the current UI, the Canvas parts moving out of 067, 067's mocks as reference input, and three open questions; no definition package, mock, tasks, or implementation.
- 2026-10-29T14:47:43Z - brainstorm: Added Transfer From 067, which names byte-exact copies of 067's pre-split spec and plan under .dude/specs/067-work-type-presentation/design/ as the complete record of the moved Canvas work and restates in plain words the wording, guidance, classification, stage, report, request, capture, continuity, approval, and visual-check obligations that the six moved-part bullets left out, as obligations inherited from 067's pre-split definition that are not an approved design and that this idea's definition revisits; status stays draft with an empty spec_path, and the idea, open questions, and assumptions are unchanged.
