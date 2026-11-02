---
title: Work Type Presentation
slug: work-type-presentation
work_type: design
design_status: proposed
approved_direction:
preview_path: .dude/specs/067-work-type-presentation/design/work-type-presentation.html
---

# Design Proposal: Work Type Presentation

Canvas labels every saved record an idea or a feature because it reads one lifecycle value. A confirmed bug therefore reads "Draft idea" and "This feature is still an idea." This definition gives every work item three separate answers: what the work is trying to do (intent), what kind of work it is (domain), and how far it has got (stage). Canvas capture, the work list, and work details show all three, from one saved classification and from evidence Dude already records. Work details also gain a minimal, read-only progress report with the current phase, the recorded design status and checkpoints, required gates, and any current request for the user, where evidence supports them. Dude assembles one shared report, so Canvas and any later reader get the same meaning.

The classification describes work and grants nothing. It selects no specialist or workflow, changes no stage, and starts, approves, or closes nothing.

Design is `proposed`. The canonical mock at `preview_path` renders the direction described under Proposed Direction, and it is not approved. The user's explicit approval of that exact mock is required before UI source changes or implementation-task derivation. This Ship invocation does not supply it. All wording and vocabulary below are provisional until that approval.

## User Scenarios

### US1 - Read any work item truthfully (P1)

The user scans the work list and opens a record, including a captured bug, without being told it is an idea or a feature.

Independent test: prepare records covering every stage, with intent and domain recorded, not set, and unrecognized. Open the list and each record's details.

1. Every row and details view uses neutral work-item wording. No record is called an idea or a feature because of its lifecycle state.
2. A record with a recorded intent and domain shows them, for example Fix · Code, in its list row and in its details.
3. A record without them shows no classification text in its list row; its details say Not set for each value.
4. The list row and the details show the same stage, derived from recorded evidence.
5. Mockup and Review guidance appears only for records whose definition uses the design workflow or that have a current preview request.

### US2 - Choose intent and domain when capturing work (P1)

The user captures new work in Canvas and may say what kind of work it is.

Independent test: in a fresh session, capture three items: one with both values chosen, one with intent only, and one with neither.

1. The capture form offers optional Intent and Domain choices that start at Not set. Leaving them unchanged is valid.
2. Submit and Save keep their current meanings and carry the chosen values with the captured text.
3. Canvas reports Saved only after the saved record is read back, then shows the values that record holds.
4. If capture reused an existing item that already holds different values, Canvas says the existing values were kept and explains how to change them. Nothing is overwritten silently.
5. An uncertain delivery is never resent. The draft text and choices stay in the form.

### US3 - See where the work stands (P2)

The user opens a record to learn its stage, its current phase, what has been reached, and what is required next.

Independent test: open a draft; a design definition awaiting approval with a live approval request; records with a current blocking request and a current advisory request, neither using the design workflow; Lightweight work in one phase; Lightweight work in two concurrent phases; blocked, completed, closed, and tracked work; and any record while the request source is unavailable or partial.

1. Details show the stage and, where evidence exists, the current phase or phases, the recorded design status, required gates, and current requests for the user, each with its source.
2. Parts without evidence are summarized in one plain sentence instead of empty rows.
3. A current request for this exact record shows Waiting for you as supporting detail, whether its owner marks it blocking or advisory. Only design approval appears as a required gate. An unavailable or partial request source says so instead of implying that nothing is waiting, and a blank answer slot never shows that anyone is waiting.
4. Nothing in the report claims live agent activity, a percentage, verification, review, or release.
5. Details show exactly the report Dude assembled for that record, the same report any other reader receives. Canvas adds no phase, checkpoint, gate, or waiting state of its own.

### US4 - Correct a wrong value (P2)

The user notices that an item's domain is Writing where it should be Design.

Independent test: start from a record with intent, domain, stage, and tasks recorded. Request a correction in chat.

1. Details explain how to change the values: ask Dude in chat. Canvas shows no control that cannot change them.
2. After the explicit request, the one saved record changes, and the list and details show the new values on their next read.
3. Stage, lifecycle status, tasks, approvals, and permissions are unchanged.

## Edge Cases

| Condition | Required behavior |
| --- | --- |
| Record created before this feature | Show Not set until the user explicitly classifies it. Never infer a value from a title, description, label, issue type, or history, and never fill values in bulk. |
| Saved value outside the vocabulary, or empty | Show that value as unrecognized for that item only. Other items, captures, and definitions continue. The maintainer check reports a warning. |
| Record cannot be read | Show classification and stage as unavailable, not as Not set. |
| Capture matched an existing item | Fill only values that item does not hold. Keep any different saved value and report the difference. |
| Retry after a known-unsent capture failure | Send the same text and choices again only on the user's action; the user may change them first. |
| Uncertain capture delivery | Do not resend. Keep the draft text and choices until the owner reconciles the capture. |
| Only open or ready tasks recorded | The stage is Defined. Open or ready tasks never establish In progress. |
| Every recorded task done | The stage is Completed. Claim no verification, review, or release. |
| Resolved without a definition package | The stage is Closed, and details say that closing does not mean the work was implemented. |
| Several phases with work in progress or blocked | Name each current phase; do not pick one as the step. |
| Tracked work is authoritative | Derive the stage from tracked task states. Show phase as not exposed; never fill it from a Markdown mirror. |
| Design definition exploring or proposed | Show the recorded design status and the required design approval gate. |
| Current request for the item, marked blocking or advisory by its owner | Show Waiting for you as supporting detail. Add no required gate or recorded blocker, and leave the stage unchanged. |
| Request source unavailable or partial | Say that request status is unavailable or partial; never show None. |
| Unmet declared dependency or recorded backlog order | Keep the existing waiting or order note beside the stage. The note does not change the stage. |
| New draft with no evidence beyond capture | Show Captured and one sentence saying that no definition, phase, or gate is recorded yet. |

## Functional Requirements

### Wording

- FR-001: Canvas uses neutral work-item wording in capture entry points and actions, the work list, and work details.
- FR-002: Canvas never names an item's kind as idea or feature on the basis of its lifecycle state.
- FR-003: Canvas shows mockup and Review guidance for an item only when its definition records the design workflow or a current preview request exists for it.

### Classification

- FR-004: Each work item has at most one intent and one primary domain, saved once in the record Dude already keeps for that item. No second store, label, or copy holds them.
- FR-005: The intent vocabulary is Create, Fix, Maintain, and Explore. Not set means that no intent is saved.
- FR-006: The domain vocabulary is Code, Design, Writing, Video, and Other. Other means a domain outside the list, and Not set means that no domain is saved. A domain does not depend on which producers are installed.
- FR-007: Saved values are stable identifiers kept separate from their on-screen words, so wording can change without rewriting records.
- FR-008: Dude saves a value only from the user's explicit choice for that item. It may suggest values in conversation, but it saves a suggestion only after the user confirms it.
- FR-009: A record without a saved choice stays Not set. No value is inferred or filled in bulk.
- FR-010: An unrecognized saved value is shown as unrecognized for that item and reported to maintainers as a warning. It blocks no other item, capture, definition, or Work.
- FR-011: Definition, re-definition, Work, and Ship leave saved values unchanged.

### Capture and correction

- FR-012: Canvas capture offers optional Intent and Domain choices that start at Not set.
- FR-013: A capture carries the chosen values, unaltered, with the user's literal text through submission, delivery, and the owner's read-back.
- FR-014: Canvas refuses a capture with a value outside the vocabulary before consuming the capture, and keeps the draft.
- FR-015: When capture reuses an existing item, a chosen value fills only a value that item does not hold. A different saved value is kept, and the difference is reported.
- FR-016: After a confirmed save, Canvas shows the values the saved record holds and flags any difference from the user's choices.
- FR-017: The user changes saved values by explicit request in chat. Canvas explains this and shows no change control it cannot honor.
- FR-018: Changing an intent or domain changes no stage, lifecycle status, task state, approval, or permission.

### Stage

- FR-019: The work list and work details derive the stage with one shared rule, so both show the same stage for the same evidence.
- FR-020: Stage values are:
  - Captured: the item is captured but not defined.
  - Defined: the item is defined, and no task is recorded in progress, done, or blocked.
  - In progress: at least one task is recorded in progress or done, not every task is done, and no unfinished task is blocked.
  - Blocked: at least one unfinished task is recorded blocked or carries a recorded blocker reason.
  - Completed: the item has at least one task, and every recorded task is done.
  - Closed: the item was resolved without a definition package.
- FR-021: Open or ready tasks alone never establish In progress.
- FR-022: Completed and Closed claim no verification, review, implementation, or release.
- FR-023: When the evidence for a stage cannot be read, the stage is shown as unavailable.
- FR-024: Existing notes for an unmet declared dependency or a recorded backlog order stay beside the stage and do not change it.

### Progress report

- FR-025: Dude assembles one read-only progress report for a work item from recorded lifecycle, task, and design evidence and from current requests, naming each part's source and coverage. Canvas work details and any later reader receive that same report and derive no phase, checkpoint, gate, or waiting state of their own from task counts or other parts.
- FR-026: Phases come only from recorded task groupings and their recorded task states. Every current phase is shown. Tracked work shows phase as not exposed.
- FR-027: Recorded checkpoints are limited to the recorded design statuses Proposed and Approved. Task counts are never presented as checkpoints.
- FR-028: Required gates are limited to design approval, which the design workflow requires while the recorded design status is not Approved. A request's presence, its own blocking or advisory label, a blank answer slot, and task counts never make a required gate.
- FR-029: A current owner-qualified request for that exact item appears as Waiting for you, with its kind and owner, as supporting detail. It adds no required gate or recorded blocker and does not change the stage. An unavailable or partial request source is reported as such, never as None. Blank answer slots, history, and inventory never show that anyone is waiting.
- FR-030: Parts without evidence appear in one plain summary sentence.
- FR-031: The report shows no percentage beyond recorded task counts, no inferred live activity, and no verification, review, or release result. It advances, approves, retries, and closes nothing.

### Authority and continuity

- FR-032: Intent, domain, stage, and the progress report select no specialist, workflow, or route, and grant or withhold no permission.
- FR-033: The change keeps the existing Canvas workspace: 052's desktop workspace; 062's single search with Working on and Clear, the expandable rail, the compact list below 620px of list width, and the docked task detail at 1080px and wider; 057's capture and response behavior; and 085's ordinary and app-following light and dark appearance.
- FR-034: UI source changes and implementation-task derivation wait for the user's explicit approval of the exact canonical mock.

## Key Entities

- Work item: one recorded piece of work, from capture onward, identified by its existing record. Its lifecycle number shows capture order only.
- Intent: what the work tries to do (Create, Fix, Maintain, or Explore), or Not set.
- Domain: the kind of deliverable being accepted (Code, Design, Writing, Video, or Other), or Not set.
- Stage: how far the item has got overall, derived from its lifecycle status and recorded task states.
- Phase: a recorded task grouping that currently holds work in progress or blocked.
- Checkpoint: a recorded condition that has been met. In this feature, design proposed or design approved.
- Required gate: a condition that the owning workflow requires before work advances. In this feature, only design approval, while a design definition is not yet approved.
- Current request: a live, owner-qualified request for the user's response about one exact item. The report shows it as supporting detail; by itself it is neither a required gate nor a blocker.
- Progress report: the read-only combination of stage, phase, recorded design status, checkpoint, required gate, and current requests for one item, with sources, coverage, and unknowns. Dude assembles it in one place, and every reader receives the same report.

## Success Criteria

- SC-001: Across fixtures covering all six stages and the unavailable case, every record shows the same stage in the list and in details, and no record's kind is shown as idea or feature.
- SC-002: Each stage fixture yields exactly the stage defined in FR-020. The open-only, all-done, and resolved fixtures never show In progress, a verification claim, or Completed, respectively.
- SC-003: Captures using every intent value, every domain value, and Not set for each save exactly the chosen values. Canvas reports Saved only after read-back, and zero captures are resent after uncertain delivery.
- SC-004: Comparing every existing record before and after implementation shows zero intent or domain values added without an explicit user choice.
- SC-005: One explicit correction changes only that item's classification. The list and details show the new values on the next read, and its stage, lifecycle status, tasks, and approvals are unchanged.
- SC-006: In every progress fixture, details show exactly the parts of the report assembled for that item, and each part names its source. Multiple current phases are all named. Design approval is the only required gate shown, and the blocking- and advisory-request fixtures show Waiting for you with no added gate or blocker. The unavailable- and partial-request fixtures say unavailable or partial, and blank answer slots produce no waiting indicator.
- SC-007: One unrecognized saved value affects only its own item. All other items read normally, and the maintainer check reports one warning and no new failure.
- SC-008: Explicit approval of the exact canonical mock is recorded before any UI source change or implementation-task derivation.

## Visual Intent

Follow GitHub Issues: an issue's type sits beside its workflow status, the list row and the issue page read the same record, and an issue with no type shows nothing in the list and an explicit empty value on its page. Follow GitHub check runs for the report's split between one common status and tool-specific detail, without adopting that API or its values.

The proposed mock resolves this intent as Option A below: intent and domain are quiet secondary metadata in the existing workspace.

### Should Feel

- Like today's Canvas, with one more line of meaning on each record.
- Calm and scannable: intent and domain read as quiet secondary text.
- Honest: unknowns are plain statements, not alarms.

### Should Never Feel

- Like a ticket form with required fields, or a dashboard of empty boxes.
- Like an automation console that implies agents are running or that labels control work.

## Scope And Surfaces

In scope: the Overview work list in wide and compact layouts, the Now work details (header, progress report, and existing blockers and tasks), the capture form, the capture action in Needs you, and the blank-workspace prompt. Navigation keeps its current destinations and order; only capture labels change to neutral wording.

The Architect's declared capability envelope bounds every actionable element in the mock:

- Existing: work search and Show, Working on and Clear, the expandable rail, row selection into Now, task inspection, Respond to request, Review entry for a current preview request, and capture through a provider receipt with Submit, Save, and Cancel.
- Added by this feature: two optional single-choice fields in the capture form, read-only display of recorded intent, domain, and stage, the read-only progress report, and a plain instruction for correcting values in chat.
- Mock-only scenario controls may sit outside product chrome when labeled as fixtures.

Out of scope: an in-Canvas control that edits saved values, filters or sorting by intent or domain, bulk classification, contributing domains, agent-suggested values in the form, type-specific workflows or routing, discovered-defect capture, direct-work records, release status, the 087 routing map, multi-feature or Epic orchestration, workflow composition, new checkpoint writers, a generic gate engine, polling, and boards. Navigation is not redesigned.

Continuity references: `.dude/ideas/052-dude-canvas-ui.md`; `.dude/specs/052-dude-canvas-ui/design/fluent-desktop-workspace.html`; `.dude/specs/062-dude-canvas-workspace-integration/design/workspace-integration.html`; `.dude/specs/057-dude-canvas-needs-you/design/needs-you-workspace.html`; and `.dude/specs/085-dude-canvas-app-theme/design/app-theme.html`, extended by the current working Canvas. Lifecycle numbers do not imply execution order.

## Brand Fit

- Use existing Fluent components, tokens, type ramp, and spacing. Do not invent a color system or colored type badges.
- Never convey intent, domain, stage, or a gate by color alone.
- Meet WCAG 2.2 AA for text and essential controls in ordinary and app-following light and dark. Keep keyboard operation and accessible names, including intent, domain, and stage in each row's accessible label.

## Direction Options

### Option A - Secondary metadata in the existing workspace

- Mood: the current Canvas, with classification as quiet supporting text.
- Layout: list rows add recorded intent and domain as secondary text in the Name cell, with no new column. Status shows the stage, followed by any existing dependency or order note. The details header pairs a neutral eyebrow with intent and domain. The existing Lifecycle and progress section becomes the progress report. The capture form adds two optional fields under the text.
- Components: existing Text styles, Field, Dropdown, Notice, and ProgressBar.
- Proposed labels: "New work item" for the capture entry and "Save as work item" for the Needs you action. That action's form says "Text to save" and "Save this text", and the details section that shows the captured text says "Captured description". They replace "Intent to retain", "Capture this intent", "Captured intent", and "What you wanted to do", so Intent names only the classification.
- Primary mock: [`work-type-presentation.html`](design/work-type-presentation.html), round 2.

## Proposed Direction

Option A is the proposed direction, and it is not approved. The round 2 canonical mock at [`work-type-presentation.html`](design/work-type-presentation.html) renders it inside today's Canvas with the product's own Fluent UI v9 style and theme files, copied byte for byte. It adds no palette, column, filter, or sort, navigation keeps its destinations and order, and its fixture controls sit in a dashed strip outside the product chrome. Option A fits because it follows the GitHub Issues split between type and status inside a workspace users already know, and it keeps the continuity that FR-033 lists.

Each shown value has a stated origin. Records from this repository come from a read-only snapshot that the product's own projection readers took before this settle. No ledger records a classification yet, so each of them reads Not set. Records 901 to 913, the request feeds, and the capture outcomes are labeled fixtures traced to this spec and the plan. The mock implements nothing and changed no product source.

Round 1 stays unchanged under `design/variants/round-1-initial/` for comparison. Its verification found that, with request coverage unavailable or partial, the details header still said no preview request was waiting. Round 2 fixes that, names the source of the Requests row, keeps today's Browsing label, corrects the Overview's closed-count sentence for a count of one, and puts each capture status in a polite status region.

The Tester's final verification of round 2 before the packaging fix described below, in `design/verification/round-2-independent/report.json`, reports PASS for 80 checks: 76 passed, none failed, and 4 are observations, across 4,768 assertions, 156 frames, and 66 screenshots. The run bound that revision's exact HTML (`sha256:6eaf6bc8642e31d8e523a818ba9b9802ec63f2755a70cb48a92e10e07bc4cdc5`), runtime, and legal file by hash, opened the HTML from a file URL in headless Edge 156, and confirmed that the runtime bytes the browser received matched their hash. The run covered ordinary and app-following light and dark, the list grid at 620px and the compact list at 619px of content width, the docked task detail at 1080px and wider, the in-flow detail at 768px, emulated 200% zoom, M1 to M14, the nine capture states, and five local capture outcomes. It ran no screen reader and no other browser engine.

One observation, that the plan's progress contract lacked the recorded design status and request source the mock shows, is now resolved in the plan. Three remain as known limits:

- On the New work item tab, moving keyboard focus through the search field opens its results popup, which can cover the new fields. Today's Canvas has the same rule, so 067 inherits it.
- The designer's capture log in `design/screenshots/` predates this revision and binds no artifact hash, so it is not evidence for round 2.
- Each capture status reaches assistive technology through two channels, Fluent's announcer and a polite status region, observed within 2 ms of each other. Today's import and pack-source screens use the same pattern. Whether a screen reader speaks a status twice was not tested.

In the GitHub Copilot app, the original round 2 HTML rendered blank. The app's preview history, recorded in `design/verification/embedded-preview/evidence.json`, shows that it loaded the page from `http://browser-preview-local.localhost/<id>/work-type-presentation.html`, although the address bar showed the file path. That HTML's content security policy (CSP) allowed external scripts only from `file:` and `http://127.0.0.1:*`, so its separate runtime script could not load from that origin. The HTML at the same `preview_path`, raw `sha256:c5c35834d4394a34d25ad99c6c853e97d4b75e5ef11bb6a7597ce194e0406529`, now embeds the exact unchanged runtime, allows only inline scripts, keeps `connect-src 'none'`, and shows a short message if scripts never run; its UI, fixtures, and themes are unchanged, and the pre-fix files stay byte for byte under `design/variants/round-2-before-embedded-fix/`. The independent Tester's headless Edge 156 run in `design/verification/embedded-preview-independent/` reproduced the CSP block and blank page with the old HTML at a replica of that origin. At the replica and from a file URL, the current HTML rendered all 13 rows with no CSP violation and no request other than the HTML, and a regression subset covering search, Now, the nine capture states, Submit, and the four light and dark appearances matched round 2 in the same engine. The replica is not the app's WebView2, and the app's console was not inspected, so the mock still needs a refresh in the app to confirm that it renders there.

The mock's title and header comment still say exploring because they predate this settle; this spec's `design_status` is the recorded status. The next gate is the user's explicit approval of the exact mock.

## Mock Scenario Matrix

Every shown value either comes from current repository data or is labeled as a fixture. Existing records appear Not set unless a fixture is labeled as following an explicit classification.

| ID | Surface | State | Must show |
| --- | --- | --- | --- |
| M1 | Overview, wide list | Rows at each stage, with classification recorded, Not set, and unrecognized | Classification as secondary text; stage in Status; numbers and capture order unchanged; no new column |
| M2 | Overview, list narrower than 620px | Same rows | Number, title, classification, stage, and progress in the compact list |
| M3 | Now, captured draft, Not set | Captured | Neutral eyebrow; Not set per value; one summary sentence; chat correction instruction; no mock guidance |
| M4 | Now, design definition with a live approval request | Defined, design exploring or proposed | Recorded design status; design approval gate; Waiting for you; Respond to request |
| M5 | Now, Lightweight work, one current phase, 1080px or wider | In progress | Phase from its recorded heading; docked task detail |
| M6 | Now, two current phases | In progress | Both phases named |
| M7 | Now, blocked work | Blocked, plan-gap | Blocker class and reason |
| M8 | Now, all tasks done | Completed | No verification, review, or release claim |
| M9 | Now, resolved without a package | Closed | Closing does not mean implemented |
| M10 | Now, tracked work | Any | Phase not exposed |
| M11 | Now, request source unavailable or partial | Any | Request status unavailable or partial, not None |
| M12 | Capture form | Default, choices made, sending, uncertain, saved as chosen, saved with kept different values, saved without recorded values, invalid input, waiting for an idle session | Truthful status for each; draft and choices retained |
| M13 | Appearance and size | Ordinary and app-following light and dark; 768x900; 200% zoom | Contrast, reflow, and no clipping |
| M14 | Now, current blocking or advisory request without the design workflow | Defined or In progress | Waiting for you as supporting detail; Respond to request; no required gate |

## Visual Success Criteria

- VSC-001: At 1440x900, at 768x900, and with list content narrower than 620px, every row shows its number, title, stage, progress, and any recorded intent and domain without a new column, clipped text, or page-wide horizontal scrolling. Content reflows at 200% zoom.
- VSC-002: Details keep the docked task detail at 1080px and wider, and the in-flow detail below it. The progress report shows only evidenced parts plus one summary sentence.
- VSC-003: Text and essential controls meet WCAG 2.2 AA in ordinary and app-following light and dark. Meaning never depends on color alone, and keyboard focus and accessible names cover every new element.
- VSC-004: The rendered implementation matches the approved canonical mock at the agreed sizes and appearances.

## Assumptions

The choices below are Ship-authorized definition-owner dispositions grounded in the ledger's accepted direction and recorded evidence. They are not user answers, and the ledger's answer slots stay unchanged. Each is reversible before implementation. The user's approval of the exact mock confirms or changes the wording and vocabulary it shows; nothing here approves the design.

1. Question 1, setting and correcting values: values live once in the existing record, set only by explicit user choice through capture or chat; chat is the correction route; existing records stay Not set. Basis: the agreed direction stores values once in the existing record; recommendation 1 rejects guessing and bulk rewrites; the Architect found that an in-Canvas editor would need a new write path as large as capture, which no current need justifies.
2. Question 2, vocabulary and wording: intents Create, Fix, Maintain, and Explore; domains Code, Design, Writing, Video, and Other; stages as in FR-020; "work item" as the neutral term. Improve is not added now. Basis: the 2026-10-15 scenario pass found no unmet need beyond four types; adding a value later breaks no record, while removing one would; Other keeps a closed list from misdescribing domains outside it, as the user's "such as" examples require.
3. Questions 1 and 2, contributing domains: one primary domain only. Basis: no screen in this feature needs contributing domains.
4. Question 10, report contents: stage, current phases, recorded design status, required gates, and current requests, with sources, coverage, and one summary of unknowns, assembled in one place for every reader. Basis: the agreed progress-reporting limits, the agreed direction that lists, details, and later 087 share one report meaning, and the recorded sources the Architect confirmed.
5. Question 11, phases and waiting: definitions may already name task phases in their domain's terms, and Canvas shows recorded headings; Waiting for you appears only for a current request for that exact item, as supporting detail rather than a required gate. Basis: existing task grouping and request coverage; a request's presence or its own blocking or advisory label establishes no requirement, and blank slots are not requests.
6. Questions 4 to 7: outside this package. Basis: the user's answer to question 3 and the agreed scope keep type-specific workflows and other outcomes out.

The Architect's 2026-10-19 read-only assessment supplied technical couplings and the capability envelope as advice, not user approval. The mandatory human gate is explicit approval of the exact canonical mock. No new guardrail candidate arose.

## Revision Log

- 2026-10-20 01:57 UTC - First definition staged under explicit Ship. Design is exploring, and no mock exists yet.
- 2026-10-20T05:53:08Z - Settled Option A as proposed, rendered by the round 2 canonical mock (HTML `sha256:6eaf6bc8642e31d8e523a818ba9b9802ec63f2755a70cb48a92e10e07bc4cdc5`, runtime `sha256:27646058794769c0f2bd8be825939969d0e5323978ce48174aec783bfd3ec2e3`). Round 1 stays under `design/variants/round-1-initial/`. The Tester's final verification passed with four observations. Not approved.
- 2026-10-20T13:36:57Z - Repackaged the round 2 canonical mock as one self-contained HTML file after it rendered blank in the GitHub Copilot app's preview. The HTML at the same `preview_path` (raw `sha256:c5c35834d4394a34d25ad99c6c853e97d4b75e5ef11bb6a7597ce194e0406529`) embeds the unchanged runtime (`sha256:27646058794769c0f2bd8be825939969d0e5323978ce48174aec783bfd3ec2e3`); the UI, fixtures, and themes are unchanged, and the pre-fix files stay under `design/variants/round-2-before-embedded-fix/`. An independent replica check in headless Edge passed, but a refresh in the app is still needed to confirm that the mock renders there. Not approved.