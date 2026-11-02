---
title: Work Type Presentation
slug: work-type-presentation
work_type: design
design_status: proposed
approved_direction:
preview_path: .dude/specs/067-work-type-presentation/design/work-type-presentation.html
---

# Design Proposal: Work Type Presentation

Canvas labels every saved record an idea or a feature because it reads one lifecycle value. A confirmed bug therefore reads "Draft idea" and "This feature is still an idea." This definition keeps three answers apart for every work item: what the work is trying to do (intent), what kind of work it is (domain), and how far it has got (stage). People never supply intent or domain. They describe the outcome they want in their own words, and Dude classifies the work internally when the description and the project make it clear. Canvas leads with the title, the stage, the next step, any current request for the user, and truthful progress, and it shows a recorded classification only as quiet plain words, such as Fix · Code. Work details also gain a minimal, read-only progress report with the current phase, the recorded design status and checkpoints, required gates, and any current request for the user, where evidence supports them. Dude assembles one shared report, so Canvas and any later reader get the same meaning.

The classification is Dude's advisory note, not the user's words. It selects no specialist or workflow, changes no stage, and starts, approves, or closes nothing.

Design is `proposed`. On 2026-10-23 the user rejected the round 2 proposal's request for intent and domain at capture, calling them internal concepts that make no sense to ask people about (owner ledger, `## Idea`). This revision removes every classification question, placeholder, and instruction from Canvas. The round 3 canonical mock at `preview_path` renders it, and nothing is approved. The user's explicit approval of that exact mock is required before UI source changes or implementation-task derivation. All wording below is provisional until that approval.

## User Scenarios

### US1 - Read any work item truthfully (P1)

The user scans the work list and opens a record, including a captured bug, without being told it is an idea or a feature and without being shown gaps in Dude's classification.

Independent test: prepare records covering every stage, with a classification recorded, not recorded, and unrecognized, plus one record that cannot be read. Open the list and each record's details.

1. Every row and details view uses neutral work-item wording. No record is called an idea or a feature because of its lifecycle state.
2. A record with a recorded classification shows it as quiet plain words, for example Fix · Code, in its list row and in its details.
3. A record without a recorded classification, or with an unrecognized one, shows no classification text, placeholder, warning, or instruction in its list row or details.
4. The list row and the details show the same stage, derived from recorded evidence. A record that cannot be read shows its stage and progress as unavailable and says nothing about classification.
5. Mockup and Review guidance appears only for records whose definition uses the design workflow or that have a current preview request.

### US2 - Capture work in your own words (P1)

The user captures new work in Canvas by describing the outcome they want. Nothing asks them what kind of work it is.

Independent test: in a fresh session, capture one description with Submit and another with Save, then try to capture a third while a question is pending in Needs you.

1. The capture form asks only for the description and offers Submit, Save, and Cancel. It has no intent or domain field, category choice, hidden required value, classification confirmation, or text explaining categories.
2. Submit saves the description and continues brainstorming in chat. Save keeps it for later and starts nothing else. Cancel returns to Needs you and keeps the draft.
3. Canvas reports Saved only after Dude confirms the capture and Canvas reads the saved work item back. The capture carries the user's text unchanged.
4. While a question is pending in Needs you, Canvas says to finish it first and keeps the draft. Every other condition that prevents sending also states its reason and the next available step in plain words.
5. An uncertain delivery is never resent. The draft stays in the form.
6. Dude asks no question only to classify the work.

### US3 - See where the work stands (P2)

The user opens a record to learn its stage, its current phase, what has been reached, and what is required next.

Independent test: open a draft; a design definition awaiting approval with a live approval request; records with a current blocking request and a current advisory request, neither using the design workflow; Lightweight work in one phase; Lightweight work in two concurrent phases; blocked, completed, closed, and tracked work; and any record while the request source is unavailable or partial.

1. Details show the stage and, where evidence exists, the current phase or phases, the recorded design status, required gates, and current requests for the user, each with its source.
2. Parts without evidence are summarized in one plain sentence instead of empty rows.
3. A current request for this exact record shows Waiting for you as supporting detail, whether its owner marks it blocking or advisory. Only design approval appears as a required gate. An unavailable or partial request source says so instead of implying that nothing is waiting, and a blank answer slot never shows that anyone is waiting.
4. Nothing in the report claims live agent activity, a percentage, verification, review, or release.
5. Details show exactly the report Dude assembled for that record, the same report any other reader receives. Canvas adds no phase, checkpoint, gate, or waiting state of its own.

### US4 - Correct a wrong classification (P2)

The user notices that an item reads Writing where it should be Design.

Independent test: start from a record with a recorded classification, stage, and tasks. Tell Dude in chat, in your own words, that it is design work.

1. Dude records what the user said, and the list and details show the new words on their next read.
2. The user's text, stage, lifecycle status, tasks, approvals, and permissions are unchanged.
3. Canvas offers no classification control and shows no instructions for changing it.
4. A later capture or brainstorm of the item never replaces the corrected value by inference.

## Edge Cases

| Condition | Required behavior |
| --- | --- |
| Record created before this feature | Show no classification. The record stays unclassified until a capture or explicit brainstorm of that record establishes a value. Never infer values in Canvas, and never fill them in bulk. |
| Description too unclear to classify | Record nothing and show nothing. Ask no question only to classify. |
| Outcome, scope, or route unclear | During Submit's brainstorm, Dude may ask one plain-language question about the outcome. Save asks nothing. |
| Recorded value outside the vocabulary, or empty | Treat that value as unrecorded on that item. Other items, captures, and definitions continue. The maintainer check reports a warning. |
| Record cannot be read | Show stage and progress as unavailable. Say nothing about classification. |
| Capture matched an existing item | Report Saved for the existing item that the read-back names, with any note from the owner. Keep that item's recorded classification unless the user changes it. |
| Capture cannot be sent now | State the actual condition and the next available step in plain words, and keep the draft. Send nothing later without the user's action. |
| Retry after a known-unsent capture failure | Send the same text again only on the user's action; the user may edit it first. |
| Uncertain capture delivery | Do not resend. Keep the draft until the owner reconciles the capture. |
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

- FR-004: Each work item has at most one intent and one primary domain, recorded once as Dude's internal note in the record Dude already keeps for that item. No second store, label, copy, confidence score, or approval queue holds them.
- FR-005: The intent vocabulary is create, fix, maintain, and explore. An unrecorded intent means that Dude has not established one.
- FR-006: The domain vocabulary is code, design, writing, and video. An unrecorded domain means that Dude has not established one, including for work outside these four. A domain does not depend on which producers are installed.
- FR-007: Recorded values are stable identifiers kept separate from their on-screen words, so wording can change without rewriting records.
- FR-008: Dude records a value only while capturing or explicitly brainstorming that item, and only when the user's unchanged description and the actual project context make the value clear. Canvas, the browser, and every other path never infer one.
- FR-009: When a value is unclear, Dude leaves it unrecorded. An unrecorded value never prompts a question, blocks capture, definition, or Work, or causes existing records to be filled in bulk.
- FR-010: An unrecognized recorded value is treated as unrecorded on that item and reported to maintainers as a warning. It blocks no other item, capture, definition, or Work.
- FR-011: Definition, re-definition, Work, and Ship leave recorded values unchanged.

### Capture and correction

- FR-012: Canvas capture asks only for the user's description of the outcome. It shows no intent or domain field, renamed category question, hidden required value, classification confirmation, or explanation of the classification.
- FR-013: A capture carries the user's literal text, unaltered, and the choice between Submit and Save through submission, delivery, and the owner's read-back. It carries no classification.
- FR-014: When a capture cannot be sent now, Canvas states the actual condition and the next available step in plain words and keeps the draft. It never sends the capture later without the user's action.
- FR-015: Dude never asks a question only to complete a classification. If the outcome, scope, or route is unclear, Dude may ask one plain-language question about it during Submit's brainstorm; Save asks nothing.
- FR-016: After a confirmed save, Canvas says the work was saved, identifies the saved work item, and shows any note from the owner. It shows no classification result or comparison.
- FR-017: The user changes a classification by telling Dude in chat, in their own words, and Dude records what the user said. Dude never replaces a recorded value by inference.
- FR-018: Recording or changing an intent or domain changes no user text, stage, lifecycle status, task state, approval, or permission.

### Showing classification

- FR-035: Where a classification is recorded, the work list and details show it as quiet plain words near the title, never as labeled fields.
- FR-036: Where a value is unrecorded or unrecognized, Canvas shows nothing for it: no placeholder such as Not set, Other, or Unrecognized, no warning, and no instruction to set or confirm it.
- FR-037: Classification never replaces or hides the title, captured description, stage, next step, current requests, or progress. An unavailable state describes only a record, request source, or run evidence that could not be read, never an unrecorded classification.

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
- Captured description: the user's own words for the outcome, kept as written. A classification never replaces or rewrites it.
- Intent: Dude's internal note of what the work tries to do (create, fix, maintain, or explore), recorded only when clear.
- Domain: Dude's internal note of the kind of deliverable being accepted (code, design, writing, or video), recorded only when clear.
- Classification words: the plain on-screen words for a recorded intent and domain, such as Fix · Code. Nothing stands in for an unrecorded value.
- Stage: how far the item has got overall, derived from its lifecycle status and recorded task states.
- Phase: a recorded task grouping that currently holds work in progress or blocked.
- Checkpoint: a recorded condition that has been met. In this feature, design proposed or design approved.
- Required gate: a condition that the owning workflow requires before work advances. In this feature, only design approval, while a design definition is not yet approved.
- Current request: a live, owner-qualified request for the user's response about one exact item. The report shows it as supporting detail; by itself it is neither a required gate nor a blocker.
- Progress report: the read-only combination of stage, phase, recorded design status, checkpoint, required gate, and current requests for one item, with sources, coverage, and unknowns. Dude assembles it in one place, and every reader receives the same report.

## Success Criteria

- SC-001: Across fixtures covering all six stages and the unavailable case, every record shows the same stage in the list and in details, and no record's kind is shown as idea or feature.
- SC-002: Each stage fixture yields exactly the stage defined in FR-020. The open-only, all-done, and resolved fixtures never show In progress, a verification claim, or Completed, respectively.
- SC-003: Across capture fixtures, every capture carries only the user's text and the Submit or Save choice, and the form shows zero classification fields, choices, or instructions. Canvas reports Saved only after read-back, and zero captures are resent after uncertain delivery.
- SC-004: Comparing every existing record before and after implementation shows zero intent or domain values added by the implementation itself.
- SC-005: One explicit change in chat alters only that item's classification. The list and details show the new words on the next read, and the item's text, stage, lifecycle status, tasks, and approvals are unchanged.
- SC-006: In every progress fixture, details show exactly the parts of the report assembled for that item, and each part names its source. Multiple current phases are all named. Design approval is the only required gate shown, and the blocking- and advisory-request fixtures show Waiting for you with no added gate or blocker. The unavailable- and partial-request fixtures say unavailable or partial, and blank answer slots produce no waiting indicator.
- SC-007: One unrecognized recorded value shows nothing on its own item and affects no other item. The maintainer check reports one warning and no new failure.
- SC-008: Explicit approval of the exact canonical mock is recorded before any UI source change or implementation-task derivation.
- SC-009: Across list and details fixtures, records without a recorded classification show zero classification placeholders, such as Not set, Other, Unrecognized, or Unavailable, and every readable record still shows its title, stage, and progress.
- SC-010: In installed-host acceptance, capturing one clearly described defect and one vague description records a classification only for the first, and Dude asks no question only to classify either one.

## Visual Intent

Follow GitHub Issues for the split between what the work is and where it stands: an issue's type sits beside its workflow status, and the list row and the issue page read the same record. Depart from GitHub in one place on purpose. GitHub asks people to choose an issue's type, but here the type is Dude's internal note, so capture never asks for it and an unrecorded type shows nothing anywhere. For that part, follow Gmail's inbox categories: Gmail sorts mail into categories automatically, a person can move a message to correct it, and nobody is asked to categorize each message. Follow GitHub check runs for the report's split between one common status and tool-specific detail, without adopting that API or its values.

The revised Option A below resolves this intent: people describe the work, and any recorded classification is quiet secondary text.

### Should Feel

- Like today's Canvas, where describing the work in your own words is all you have to do.
- Calm and scannable: the title, stage, and next step lead, and any recorded classification reads as quiet secondary text.
- Honest: unknowns about progress are plain statements, not alarms, and an unrecorded classification is simply not mentioned.

### Should Never Feel

- Like a ticket form with categories to fill in, a quiz about Dude's internals, or a dashboard of empty boxes.
- Like an automation console that implies agents are running or that labels control work.

## Scope And Surfaces

In scope: the Overview work list in wide and compact layouts, the Now work details (header, progress report, and existing blockers and tasks), the capture form and its messages, the capture action in Needs you, and the blank-workspace prompt. Navigation keeps its current destinations and order; only capture labels change to neutral wording.

The Architect's declared capability envelope bounds every actionable element in the mock:

- Existing: work search and Show, Working on and Clear, the expandable rail, row selection into Now, task inspection, Respond to request, Review entry for a current preview request, and capture through a provider receipt with Submit, Save, and Cancel.
- Added by this feature: read-only display of recorded classification words and the stage, the read-only progress report, and plainer capture messages. The feature adds no actionable element.
- Mock-only scenario controls may sit outside product chrome when labeled as fixtures.

Out of scope: any intent or domain field, choice, confirmation, hint, or instruction in Canvas; a classifier in Canvas or the browser; confidence scores, provenance records, or classification approval; an in-Canvas control that edits recorded values; filters or sorting by intent or domain; filling existing records in bulk; contributing domains; type-specific workflows or routing; discovered-defect capture; direct-work records; release status; the 087 routing map; multi-feature or Epic orchestration (088); workflow composition; new checkpoint writers; a generic gate engine; polling; and boards. Navigation is not redesigned.

Continuity references: `.dude/ideas/052-dude-canvas-ui.md`; `.dude/specs/052-dude-canvas-ui/design/fluent-desktop-workspace.html`; `.dude/specs/062-dude-canvas-workspace-integration/design/workspace-integration.html`; `.dude/specs/057-dude-canvas-needs-you/design/needs-you-workspace.html`; and `.dude/specs/085-dude-canvas-app-theme/design/app-theme.html`, extended by the current working Canvas. Lifecycle numbers do not imply execution order.

## Brand Fit

- Use existing Fluent components, tokens, type ramp, and spacing. Do not invent a color system or colored type badges.
- Never convey classification, stage, or a gate by color alone, and never give an unrecorded classification warning or error styling.
- Meet WCAG 2.2 AA for text and essential controls in ordinary and app-following light and dark. Keep keyboard operation and accessible names, including the stage and any recorded classification words in each row's accessible label.

## Direction Options

### Option A - Description-first capture with quiet classification words

- Mood: the current Canvas. People describe the work, and Dude keeps its classification in the background unless it has something useful to show.
- Layout: list rows add any recorded classification words as secondary text in the Name cell, with no new column and nothing when none is recorded. Status shows the stage, followed by any existing dependency or order note. The details header pairs a neutral eyebrow with the title, the stage, and any recorded classification words. The existing Lifecycle and progress section becomes the progress report. The capture form keeps one description field with Submit, Save, and Cancel.
- Components: existing Text styles, Field, Textarea, Notice, and ProgressBar.
- Proposed labels: "New work item" for the capture entry and "Save as work item" for the Needs you action. That action's form says "Text to save" and "Save this text", and the details section that shows the captured text says "Captured description". They replace "Intent to retain", "Capture this intent", "Captured intent", and "What you wanted to do", so Intent names only Dude's internal classification and never appears as a label.
- Capture messages: each status and each condition that prevents sending gets a short plain message with its reason and next step, for example "Finish the pending question in Needs you before submitting. Your draft is kept." Wording such as "Waiting for the joined agent" and explanations of unfiled scope, owners, or internal metadata leave the capture form.
- Primary mock: [`work-type-presentation.html`](design/work-type-presentation.html), round 3.

## Proposed Direction

Option A, revised on 2026-10-23, is the current direction. The round 3 canonical mock at `preview_path` renders it, and it is proposed, not approved. Round 3 made these changes to the round 2 mock:

- Capture: removed the Intent and Domain choices, their Not set options and hints, the line about leaving them Not set, the unfiled-draft explanation, and the refused, kept-value, and unrecorded-value notices. One description field with Submit, Save, and Cancel remains, and every status and every condition that prevents sending has a short plain message with its actual reason and next step.
- Details: replaced the Intent, Domain, and Stage list, with its Not set, Unrecognized, and Unavailable values, and the chat correction instruction with the stage and any recorded classification words. A record that cannot be read says that its tasks and activity are unavailable.
- List and accessible names: show recorded classification words only, with no Unrecognized or Classification unavailable text and no spoken "not set".
- Save as work item: dropped the unfiled-request and intent-or-domain sentences from its notice.
- Fixtures: classification on fixtures 901 to 913 stands for what Dude recorded during capture or brainstorm. Fixture 911 has no recorded domain, because Other is no longer a value.

Everything else in round 2 stays: the progress report, the stage rule, the design status and gate, request coverage, the Respond and Review entries, the list grid and compact list, the task dock, the light and dark appearances, navigation, and the single self-contained HTML file, which runs only inline scripts. The flow changes no authority, route, or gate. Round 2 stays under `design/variants/round-2-embedded/` for comparison, and the user's explicit approval of the exact round 3 mock is the next gate.

The current HTML is raw `sha256:a583bd230b85e3bdabf9932e6d42f49252b3fb833c19732c3999625e9a24aeb2`, with embedded runtime `sha256:c0fb9406dda7ec20d5f8a410dbd09d833d63d8c406a5d433be586c8d6feb7e4a`. The independent Tester's run on the initial round 3 passed 28 of 29 checks in `design/verification/round-3/report.json`; the one failure was that unreadable fixture 912 still said no tasks or activity were recorded, wording left from the earlier mock. The Coder changed only those unavailable fallbacks, kept the initial round 3 under `design/variants/round-3-before-unavailable-fix/`, and recorded a passing 62-assertion self-check in `design/verification/round-3-revision/report.json`. The designer's 16-frame capture log, `design/screenshots/round-3/capture-log.json`, shows the initial round 3, not the current HTML. The independent final run's report is expected at [`design/verification/round-3-final/report.json`](design/verification/round-3-final/report.json), and this definition records no result from it. These runs used headless Edge, from a file URL or a replica of the app's preview origin, not the GitHub Copilot app or a screen reader. The mock's title and header comment still say exploring.

### Round 2 history

The round 2 canonical mock at [`work-type-presentation.html`](design/work-type-presentation.html) rendered the earlier Option A, including optional Intent and Domain choices at capture, inside today's Canvas with the product's own Fluent UI v9 style and theme files, copied byte for byte. It added no palette, column, filter, or sort, navigation kept its destinations and order, and its fixture controls sat in a dashed strip outside the product chrome. Option A fit because it followed the GitHub Issues split between type and status inside a workspace users already know, and it kept the continuity that FR-033 lists.

Each shown value had a stated origin. Records from this repository came from a read-only snapshot that the product's own projection readers took before the round 2 settle. No ledger records a classification, so under the revision those records show none. Records 901 to 913, the request feeds, and the capture outcomes were labeled fixtures traced to this spec and the plan. The mock implements nothing and changed no product source.

Round 1 stays unchanged under `design/variants/round-1-initial/` for comparison. Its verification found that, with request coverage unavailable or partial, the details header still said no preview request was waiting. Round 2 fixed that, named the source of the Requests row, kept today's Browsing label, corrected the Overview's closed-count sentence for a count of one, and put each capture status in a polite status region.

The Tester's final verification of round 2 before the packaging fix described below, in `design/verification/round-2-independent/report.json`, reports PASS for 80 checks: 76 passed, none failed, and 4 are observations, across 4,768 assertions, 156 frames, and 66 screenshots. The run bound that revision's exact HTML (`sha256:6eaf6bc8642e31d8e523a818ba9b9802ec63f2755a70cb48a92e10e07bc4cdc5`), runtime, and legal file by hash, opened the HTML from a file URL in headless Edge 156, and confirmed that the runtime bytes the browser received matched their hash. The run covered ordinary and app-following light and dark, the list grid at 620px and the compact list at 619px of content width, the docked task detail at 1080px and wider, the in-flow detail at 768px, emulated 200% zoom, M1 to M14, the nine capture states, and five local capture outcomes. It ran no screen reader and no other browser engine. These results cover round 2 only and are not evidence for the revision.

One observation, that the plan's progress contract lacked the recorded design status and request source the mock shows, was resolved in the plan. Three remained as known limits:

- On the New work item tab, moving keyboard focus through the search field opens its results popup, which can cover the new fields. Today's Canvas has the same rule, so 067 inherits it.
- The designer's capture log in `design/screenshots/` predates the final round 2 revision and binds no artifact hash, so it is not evidence for round 2.
- Each capture status reaches assistive technology through two channels, Fluent's announcer and a polite status region, observed within 2 ms of each other. Today's import and pack-source screens use the same pattern. Whether a screen reader speaks a status twice was not tested.

The revision removes the new fields, but the inherited search-popup rule and the untested double announcement still apply to the capture form.

In the GitHub Copilot app, the original round 2 HTML rendered blank. The app's preview history, recorded in `design/verification/embedded-preview/evidence.json`, shows that it loaded the page from `http://browser-preview-local.localhost/<id>/work-type-presentation.html`, although the address bar showed the file path. That HTML's content security policy (CSP) allowed external scripts only from `file:` and `http://127.0.0.1:*`, so its separate runtime script could not load from that origin. The HTML at the same `preview_path`, raw `sha256:c5c35834d4394a34d25ad99c6c853e97d4b75e5ef11bb6a7597ce194e0406529`, now embeds the exact unchanged runtime, allows only inline scripts, keeps `connect-src 'none'`, and shows a short message if scripts never run; its UI, fixtures, and themes are unchanged, and the pre-fix files stay byte for byte under `design/variants/round-2-before-embedded-fix/`. The independent Tester's headless Edge 156 run in `design/verification/embedded-preview-independent/` reproduced the CSP block and blank page with the old HTML at a replica of that origin. At the replica and from a file URL, the current HTML rendered all 13 rows with no CSP violation and no request other than the HTML, and a regression subset covering search, Now, the nine capture states, Submit, and the four light and dark appearances matched round 2 in the same engine. The replica is not the app's WebView2, and the app's console was not inspected, so the mock still needs a refresh in the app to confirm that it renders there.

The round 2 mock's title and header comment say exploring, which matched the recorded status again.

## Mock Scenario Matrix

Every shown value either comes from current repository data or is labeled as a fixture. No repository record holds a classification, so repository rows show none. Fixture classifications stand for values Dude recorded during capture or brainstorm.

| ID | Surface | State | Must show |
| --- | --- | --- | --- |
| M1 | Overview, wide list | Rows at each stage, with classification recorded, unrecorded, and unrecognized | Recorded classification as quiet words; nothing for unrecorded or unrecognized values; stage in Status; numbers and capture order unchanged; no new column |
| M2 | Overview, list narrower than 620px | Same rows | Number, title, any recorded classification, stage, and progress in the compact list |
| M3 | Now, captured draft with no recorded classification | Captured | Neutral eyebrow; title and captured description; one summary sentence; no classification text, placeholder, or instruction; no mock guidance |
| M4 | Now, design definition with a live approval request | Defined, design exploring or proposed | Recorded design status; design approval gate; Waiting for you; Respond to request |
| M5 | Now, Lightweight work, one current phase, 1080px or wider | In progress | Phase from its recorded heading; docked task detail |
| M6 | Now, two current phases | In progress | Both phases named |
| M7 | Now, blocked work | Blocked, plan-gap | Blocker class and reason |
| M8 | Now, all tasks done | Completed | No verification, review, or release claim |
| M9 | Now, resolved without a package | Closed | Closing does not mean implemented |
| M10 | Now, tracked work | Any | Phase not exposed |
| M11 | Now, request source unavailable or partial | Any | Request status unavailable or partial, not None |
| M12 | Capture form | Default; sending; waiting for Dude to save; delivery uncertain; saved after Submit, after Save, and to an existing work item; not sent; and each condition that prevents sending: no connection, an unfinished import, a pending question, an earlier capture not yet confirmed, and a busy session | One description field with Submit, Save, and Cancel; a plain reason and next step for each state; draft retained; no classification anywhere |
| M13 | Appearance and size | Ordinary and app-following light and dark; 768x900; 200% zoom | Contrast, reflow, and no clipping |
| M14 | Now, current blocking or advisory request without the design workflow | Defined or In progress | Waiting for you as supporting detail; Respond to request; no required gate |

## Visual Success Criteria

- VSC-001: At 1440x900, at 768x900, and with list content narrower than 620px, every row shows its number, title, stage, progress, and any recorded classification words without a new column, clipped text, or page-wide horizontal scrolling. Content reflows at 200% zoom.
- VSC-002: Details keep the docked task detail at 1080px and wider, and the in-flow detail below it. The progress report shows only evidenced parts plus one summary sentence.
- VSC-003: Text and essential controls meet WCAG 2.2 AA in ordinary and app-following light and dark. Meaning never depends on color alone, and keyboard focus and accessible names cover every new element.
- VSC-004: The rendered implementation matches the approved canonical mock at the agreed sizes and appearances.
- VSC-005: The capture form shows one description field and Submit, Save, and Cancel, with no classification control. Its own messages avoid internal terms such as joined agent, owner, receipt, unfiled, reconcile, and metadata, and every state that prevents sending shows its reason and next step.

## Assumptions

Items 1 and 2 follow the user's 2026-10-23 feedback and the correction the user authorized; their mechanics are definition-owner choices within that direction. Items 3 to 6 remain the earlier Ship-authorized definition-owner dispositions grounded in the ledger's accepted direction and recorded evidence. None is a user answer, and the ledger's answer slots stay unchanged. Each is reversible before implementation. The user's approval of the exact revised mock confirms or changes the wording it shows; nothing here approves the design.

1. Question 1, recording and correcting values: Dude records classification internally while capturing or explicitly brainstorming an item, only when the description and project context make it clear, and leaves it unrecorded otherwise. People never choose or confirm it. A user's statement in chat wins, and inference never replaces a recorded value. Existing records stay unclassified until such a capture or brainstorm; nothing is filled in bulk. Basis: the user's 2026-10-23 feedback that intent and domain are internal concepts that make no sense to ask people about, and the user's authorization of this correction; the agreed direction that stores values once in the existing record; recommendation 1's rejection of guessing from titles and bulk rewrites. This replaces the 2026-10-20 disposition that saved values only from an explicit user choice.
2. Question 2, vocabulary and wording: internal intents create, fix, maintain, and explore; internal domains code, design, writing, and video; stages as in FR-020; "work item" as the neutral term. Improve is not added. Other is dropped, because nobody picks a domain and an unrecorded domain already covers work outside the list. On-screen words, such as Fix · Code, stay provisional until the revised mock is approved. Basis: the 2026-10-15 scenario pass found no unmet need beyond four types, and adding a value later breaks no record, while removing one would.
3. Questions 1 and 2, contributing domains: one primary domain only. Basis: no screen in this feature needs contributing domains.
4. Question 10, report contents: stage, current phases, recorded design status, required gates, and current requests, with sources, coverage, and one summary of unknowns, assembled in one place for every reader. Basis: the agreed progress-reporting limits, the agreed direction that lists, details, and later 087 share one report meaning, and the recorded sources the Architect confirmed.
5. Question 11, phases and waiting: definitions may already name task phases in their domain's terms, and Canvas shows recorded headings; Waiting for you appears only for a current request for that exact item, as supporting detail rather than a required gate. Basis: existing task grouping and request coverage; a request's presence or its own blocking or advisory label establishes no requirement, and blank slots are not requests.
6. Questions 4 to 7: outside this package. Basis: the user's answer to question 3 and the agreed scope keep type-specific workflows and other outcomes out.

The Architect's 2026-10-19 read-only assessment supplied technical couplings and the capability envelope as advice, not user approval. The mandatory human gate is explicit approval of the exact canonical mock. No new guardrail candidate arose.

## Revision Log

- 2026-10-20 01:57 UTC - First definition staged under explicit Ship. Design is exploring, and no mock exists yet.
- 2026-10-20T05:53:08Z - Settled Option A as proposed, rendered by the round 2 canonical mock (HTML `sha256:6eaf6bc8642e31d8e523a818ba9b9802ec63f2755a70cb48a92e10e07bc4cdc5`, runtime `sha256:27646058794769c0f2bd8be825939969d0e5323978ce48174aec783bfd3ec2e3`). Round 1 stays under `design/variants/round-1-initial/`. The Tester's final verification passed with four observations. Not approved.
- 2026-10-20T13:36:57Z - Repackaged the round 2 canonical mock as one self-contained HTML file after it rendered blank in the GitHub Copilot app's preview. The HTML at the same `preview_path` (raw `sha256:c5c35834d4394a34d25ad99c6c853e97d4b75e5ef11bb6a7597ce194e0406529`) embeds the unchanged runtime (`sha256:27646058794769c0f2bd8be825939969d0e5323978ce48174aec783bfd3ec2e3`); the UI, fixtures, and themes are unchanged, and the pre-fix files stay under `design/variants/round-2-before-embedded-fix/`. An independent replica check in headless Edge passed, but a refresh in the app is still needed to confirm that the mock renders there. Not approved.
- 2026-10-23T16:35:12Z - Returned the design to exploring after the user rejected asking people for intent and domain. Capture now asks only for the description and keeps Submit, Save, and Cancel; Dude records classification internally when it is clear, and Canvas shows recorded values as quiet words and nothing otherwise. Other is dropped from the internal domains, and capture messages state their reason and next step in plain words. The round 2 mock at the unchanged `preview_path` (raw `sha256:c5c35834d4394a34d25ad99c6c853e97d4b75e5ef11bb6a7597ce194e0406529`) and its verification are history for the earlier proposal; the revised mock is not yet rendered. Not approved.
- 2026-10-23T18:22:14Z - Settled the revised Option A as proposed, rendered by the round 3 canonical mock at the unchanged `preview_path` (raw `sha256:a583bd230b85e3bdabf9932e6d42f49252b3fb833c19732c3999625e9a24aeb2`, embedded runtime `sha256:c0fb9406dda7ec20d5f8a410dbd09d833d63d8c406a5d433be586c8d6feb7e4a`). Capture has one description field with Submit, Save, and Cancel; recorded classification appears only as quiet words, unknown values show nothing, and statuses give their actual reasons in plain words. Round 2 stays under `design/variants/round-2-embedded/`, and the initial round 3 under `design/variants/round-3-before-unavailable-fix/`. Not approved.
