---
title: Work Type Presentation
slug: work-type-presentation
---

# Work Type Presentation

Dude keeps three separate answers for every work item: what the work tries to do (intent), what kind of deliverable it is (domain), and how far it has got (stage). People never supply intent or domain. They describe the outcome they want in their own words, and Dude records a classification as its internal note only when the description and the project make it clear. This definition puts those concepts in place without changing any Canvas screen. The record Dude already keeps for each item can hold the classification, one shared rule derives the stage, and Dude assembles one read-only progress report for any work item. `@dude status` is the first reader: its overview shows each item's stage, and a status request about one item shows that item's report.

The classification is Dude's advisory note, not the user's words. It selects no specialist or workflow, changes no stage, and starts, approves, or closes nothing.

On 2026-10-29 the user chose to split this feature (owner ledger, `## Idea`). Everything that would change what Canvas shows moved to `.dude/ideas/089-dude-canvas-redesign.md`, so this definition changes no screen and needs no mock. Until 089 presents these concepts in Canvas, people see them only in chat.

## User Scenarios

### US1 - Ask how one item is going (P1)

The user asks Dude about one work item and gets a short, read-only report of where it stands, built only from what Dude has recorded.

Independent test: ask for the report of a draft; a defined item with no started tasks; Lightweight work in one phase and in two concurrent phases; blocked, completed, and closed items; a design definition awaiting approval, once with a readable task file and once with one that cannot be read; an item whose specification cannot be read; and an item while tracked work is authoritative. Compare each report with the recorded files.

1. The report shows the stage and, where evidence exists, the current phase or phases, the recorded design status, the checkpoint reached, and required gates. Each part names its source.
2. Parts with nothing recorded are summarized in one plain sentence.
3. A part whose evidence cannot be read shows as unavailable, with the reason, and the other parts still show. A design definition whose task file cannot be read still shows its design status, checkpoint, and approval gate.
4. The request part says that current requests cannot be read there and gives the reason. It never says None, and a blank answer slot never shows that anyone is waiting.
5. Nothing in the report claims live agent activity, a percentage, verification, review, or release.
6. While tracked work is authoritative, the report shows the stage as unavailable and the phase as not exposed, and takes neither from the mirrored task list.
7. Asking for the report changes no file.

### US2 - See each item's stage in the status overview (P2)

The user asks Dude for status and sees how far each item has got, in the overview they already know.

Independent test: prepare records covering every stage, a record whose task file cannot be read, and a record waiting on an unmet declared dependency. Compare the overview before and after the change.

1. Each record in the overview shows its stage, the same stage its report shows.
2. The groups, their order, the summary, the dependency and order notes, and the diagrams are otherwise unchanged.
3. A record whose stage evidence cannot be read shows its stage as unavailable.
4. A record waiting on an unmet declared dependency keeps its group and note, and its stage still follows its own lifecycle and tasks.
5. Producing the overview changes no file.

### US3 - Describe work without classifying it (P2)

The user describes new work in chat in their own words. Nothing asks them what kind of work it is.

Independent test: in a disposable installed project, brainstorm one clearly described defect and one vague description through chat. Inspect both records, then ask for each item's report.

1. Dude asks no question only to classify either item.
2. Dude records a classification for the clear defect only, and that item's report shows it as plain words beside its name, such as Fix · Code.
3. The vague item's report shows no classification text, placeholder, warning, or instruction.
4. The user's description stays unchanged, and recording the classification changes no stage, lifecycle status, task, approval, or permission.
5. Definition, Work, Ship, the maintainer check, and Canvas keep reading the classified record, and definition and Work leave its classification unchanged.

### US4 - Correct a wrong classification (P3)

The user notices that an item's report reads Writing where it should be Design.

Independent test: start from a record with a recorded classification, stage, and tasks. Tell Dude in chat, in your own words, that it is design work, then ask for the item's report.

1. Dude records what the user said, and the next report shows the new words.
2. The user's text, stage, lifecycle status, tasks, approvals, and permissions are unchanged.
3. A later brainstorm of the item never replaces the corrected value by inference.

## Edge Cases

| Condition | Required behavior |
| --- | --- |
| Record created before this feature | Show no classification. The record stays unclassified until a capture or explicit brainstorm of that record establishes a value. Never fill values in bulk. |
| Description too unclear to classify | Record nothing and show nothing. Ask no question only to classify. |
| Outcome, scope, or route unclear | During brainstorm, Dude may ask one plain-language question about the outcome, never one only about classification. |
| Recorded value outside the vocabulary, or empty | Treat that value as unrecorded on that item. Other items, captures, and definitions continue. The maintainer check reports a warning. |
| Stage evidence cannot be read | Show the stage and phase as unavailable, with the reason. Never describe a missing classification as unavailable. |
| Task file cannot be read, but the specification can | Show the stage and phases as unavailable, with the reason, and still show what the specification records. A design definition with design status Proposed still shows that status, the checkpoint reached, and the design approval gate. |
| Specification or the item's record cannot be read | Show the stage, phases, and design status as unavailable, with the reason. Never present the item as one without a design workflow. |
| Only open or ready tasks recorded | The stage is Defined. Open or ready tasks never establish In progress. |
| Every recorded task done | The stage is Completed. Claim no verification, review, or release. |
| Resolved without a definition package | The stage is Closed, and the report says that closing does not mean the work was implemented. |
| Several phases with work in progress or blocked | Name each current phase; do not pick one as the step. |
| Tracked work is authoritative | Take a defined item's stage only from tracked task states. A reader that cannot read them shows the stage as unavailable and the phase as not exposed, and never fills either from the mirrored task list. |
| Design definition exploring or proposed | Show the recorded design status and the required design approval gate. |
| Current requests for the user | Report request status as unavailable, with its reason; never None. A blank answer slot never shows that anyone is waiting. |
| Unmet declared dependency or recorded backlog order | Keep the existing group and note. The note does not change the stage. |
| New draft with no evidence beyond capture | Show Captured and one sentence saying that no definition, phase, or gate is recorded yet. |
| Report requested for an item that cannot be identified exactly | Say so and change nothing. Never fall back to a similar number, file name, or title. |
| Canvas | Canvas shows every record as it does today. A classified record looks exactly like the same record without a classification. |

## Functional Requirements

Requirement IDs from the earlier definition stay stable. An ID that moved in part keeps its retained part here, and Moved To 089 lists what moved.

### Classification

- FR-004: Each work item has at most one intent and one primary domain, recorded once as Dude's internal note in the record Dude already keeps for that item. No second store, label, copy, confidence score, or approval queue holds them.
- FR-005: The intent vocabulary is create, fix, maintain, and explore. An unrecorded intent means that Dude has not established one.
- FR-006: The domain vocabulary is code, design, writing, and video. An unrecorded domain means that Dude has not established one, including for work outside these four. A domain does not depend on which producers are installed.
- FR-007: Recorded values are stable identifiers kept separate from the words shown for them, so wording can change without rewriting records.
- FR-008: Dude records a value only while capturing or explicitly brainstorming that item, and only when the user's unchanged description and the actual project context make the value clear. Canvas, the browser, and every other path never infer one.
- FR-009: When a value is unclear, Dude leaves it unrecorded. An unrecorded value never prompts a question, blocks capture, definition, or Work, or causes existing records to be filled in bulk.
- FR-010: An unrecognized recorded value is treated as unrecorded on that item and reported to maintainers as a warning. It blocks no other item, capture, definition, or Work.
- FR-011: Definition, re-definition, Work, and Ship leave recorded values unchanged.

### Questions and correction

- FR-015: Dude never asks a question only to complete a classification. When the outcome, scope, or route is unclear, Dude may still ask one plain-language question about it during brainstorm.
- FR-017: The user changes a classification by telling Dude in chat, in their own words, and Dude records what the user said. Dude never replaces a recorded value by inference.
- FR-018: Recording or changing an intent or domain changes no user text, stage, lifecycle status, task state, approval, or permission.

### Stage

- FR-019: Every reader derives the stage with one shared rule, so the same evidence always yields the same stage.
- FR-020: Stage values are:
  - Captured: the item is captured but not defined.
  - Defined: the item is defined, and no task is recorded in progress, done, or blocked.
  - In progress: at least one task is recorded in progress or done, not every task is done, and no unfinished task is blocked.
  - Blocked: at least one unfinished task is recorded blocked or carries a recorded blocker reason.
  - Completed: the item has at least one task, and every recorded task is done.
  - Closed: the item was resolved without a definition package.
- FR-021: Open or ready tasks alone never establish In progress.
- FR-022: Completed and Closed claim no verification, review, implementation, or release.
- FR-023: When the evidence for a stage cannot be read, the stage is unavailable, and every reader says so.
- FR-024: Existing notes for an unmet declared dependency or a recorded backlog order keep their place and do not change the stage.
- FR-041: While tracked work is authoritative, readers take a defined item's stage only from tracked task states. A reader that cannot read them shows the stage as unavailable and never uses the mirrored task list instead.

### Progress report

- FR-025: Dude assembles one read-only progress report for a work item from recorded lifecycle, task, and design evidence, naming each part's source and coverage. Every reader receives that same report and derives no phase, checkpoint, gate, or waiting state of its own from task counts or other parts. If some of that evidence cannot be read, only the parts drawn from it are unavailable, each with its reason, and the other parts still come from the evidence that can be read.
- FR-026: Phases come only from recorded task groupings and their recorded task states. Every current phase is shown. Tracked work shows phase as not exposed.
- FR-027: Recorded checkpoints are limited to the recorded design statuses Proposed and Approved. Task counts are never presented as checkpoints.
- FR-028: Required gates are limited to design approval, which the design workflow requires while the recorded design status is not Approved. A request's presence, its own blocking or advisory label, a blank answer slot, and task counts never make a required gate.
- FR-029: When a reader cannot see current requests for the user, the report's request part is unavailable, with its reason and no source. It is never None or an empty list. Blank answer slots, history, and inventory never show that anyone is waiting.
- FR-030: The report names the parts that have no recorded evidence, and the status reply summarizes them in one plain sentence. A part whose evidence cannot be read is reported as unavailable, never as one with nothing recorded.
- FR-031: The report shows no percentage beyond recorded task counts, no inferred live activity, and no verification, review, or release result. It advances, approves, retries, and closes nothing.
- FR-040: When a classification is recorded, the report shows it as plain words beside the item's name, never as a labeled field. For an unrecorded or unrecognized value, it shows nothing: no placeholder, warning, or instruction.

### Status

- FR-038: The cross-idea status overview shows each record's stage beside the record. Its groups, group order, summary, dependency and order notes, and diagrams stay as they are.
- FR-039: A status request about one work item shows that item's full progress report. Producing the overview or a report writes nothing.

### Authority and continuity

- FR-032: Intent, domain, stage, and the progress report select no specialist, workflow, or route, and grant or withhold no permission.
- FR-042: This change alters nothing Canvas shows. Canvas shows a classified record exactly as it shows the same record without a classification.

## Key Entities

- Work item: one recorded piece of work, from capture onward, identified by its existing record. Its lifecycle number shows capture order only.
- Captured description: the user's own words for the outcome, kept as written. A classification never replaces or rewrites it.
- Intent: Dude's internal note of what the work tries to do (create, fix, maintain, or explore), recorded only when clear.
- Domain: Dude's internal note of the kind of deliverable being accepted (code, design, writing, or video), recorded only when clear.
- Stage: how far the item has got overall, derived from its lifecycle status and recorded task states.
- Phase: a recorded task grouping that currently holds work in progress or blocked.
- Checkpoint: a recorded condition that has been met. In this feature, design proposed or design approved.
- Required gate: a condition that the owning workflow requires before work advances. In this feature, only design approval, while a design definition is not yet approved.
- Progress report: the read-only combination of stage, phase, recorded design status, checkpoint, required gate, and request status for one item, with sources, coverage, and unknowns, plus any recorded classification in plain words. Dude assembles it in one place, and every reader receives the same report.

## Scope

In scope: two optional internal classification values in the record Dude already keeps, every workflow that must accept and preserve them, Dude's rule for recording them, the maintainer warning, the shared stage rule, the read-only progress report, and `@dude status` as their first reader.

Out of scope: every Canvas change, listed under Moved To 089; any intent or domain question, field, choice, or confirmation anywhere; a classifier, confidence score, provenance record, or approval queue; filters or sorting by classification; filling existing records in bulk; contributing domains; type-specific workflows or routing; discovered-defect capture; direct-work records; release status; listing current requests outside Canvas; the 087 routing map; multi-feature or Epic orchestration (088); workflow composition; new checkpoint writers; a generic gate engine; polling; and boards. Lifecycle numbers do not imply execution order.

## Success Criteria

- SC-002: Each stage fixture yields exactly the stage defined in FR-020. The open-only, all-done, and resolved fixtures never show In progress, a verification claim, or Completed, respectively.
- SC-004: Comparing every existing record before and after implementation shows zero intent or domain values added by the implementation itself.
- SC-005: One explicit change in chat alters only that item's classification. The item's next report shows the new words, and the item's text, stage, lifecycle status, tasks, and approvals are unchanged.
- SC-006: In every progress fixture, the report contains exactly the parts evidenced for that item, and each part names its source. Multiple current phases are all named, and design approval is the only required gate. The request part is unavailable with its reason in every fixture, blank answer slots produce no waiting indicator, and the tracked fixture shows the stage as unavailable and the phase as not exposed. The fixture with design status Proposed and a task file that cannot be read shows that status, the checkpoint, and the design approval gate, with the stage and phases unavailable. The fixture whose specification cannot be read shows its design status as unavailable, with the reason.
- SC-007: One unrecognized recorded value shows nothing in its own item's report and affects no other item. The maintainer check reports one warning and no new failure.
- SC-010: In installed-host acceptance, brainstorming one clearly described defect and one vague description through chat records a classification only for the first, and Dude asks no question only to classify either one.
- SC-011: Across fixtures covering all six stages, the unavailable case, and authoritative tracked work, the overview shows each record's stage, equal to the stage in that record's report. Apart from the added stage information, its groups, group order, summary, notes, and diagrams are unchanged from the output before this change.
- SC-012: Every existing Canvas check passes unchanged, and Canvas shows a classified record exactly as it shows the same record without a classification.
- SC-013: Producing the overview or any item's report changes zero files.

## Moved To 089

The user's 2026-10-29 split moved every Canvas part of this definition to `.dude/ideas/089-dude-canvas-redesign.md`. IDs that moved whole are retired here, and an ID that moved in part keeps its retained part here, so each earlier ID still traces to one place.

`design/pre-split-spec.md` and `design/pre-split-plan.md` keep this package's spec and plan exactly as they stood before the split, including the wording of every moved requirement, every plan section, and every acceptance check, so 089 inherits the complete record. The lists below index that record, and 089's ledger restates the moved obligations in plain words under Transfer From 067.

Moved whole:

- FR-001 to FR-003: neutral work-item wording in Canvas, and mockup guidance only where it applies.
- FR-012 to FR-014: the Canvas capture form, the text and choice a capture carries, and its messages when it cannot be sent.
- FR-016: the saved confirmation in Canvas.
- FR-033 and FR-034: the Canvas continuity list and the mock approval gate.
- FR-035 to FR-037: classification words in the Canvas list and details, no placeholders, and nothing hidden behind classification.
- SC-001, SC-003, SC-008, SC-009, and VSC-001 to VSC-005.

Moved in part:

- FR-007: the on-screen words for recorded values.
- FR-015: when Canvas capture's Submit and Save may lead to a clarifying question.
- FR-019: the same stage in the Canvas list and details.
- FR-023: showing an unavailable stage in Canvas.
- FR-024: the notes beside the stage in Canvas.
- FR-025: Canvas work details receiving the report.
- FR-029: Waiting for you, with the request's kind and owner, from current requests that Canvas can read.
- FR-030: the summary sentence in Canvas details.
- SC-005, SC-006, SC-007, and SC-010: their Canvas list, details, and capture checks.

Sections moved: the design frontmatter (`work_type`, `design_status`, `approved_direction`, and `preview_path`), the Canvas introduction, the earlier US1 (Read any work item truthfully) and the Canvas parts of the earlier US2 to US4, the screen and capture edge cases, the Classification words and Current request entities, the visual assumptions, Visual Intent, Scope And Surfaces, Brand Fit, Direction Options, Proposed Direction, Mock Scenario Matrix, and Visual Success Criteria.

Sections 1 to 3 of the earlier plan, the brainstorm guidance and key reference in its section 7, its classification-admission checks, its non-Canvas guardrail checks and risks, and its steps that protect private local bytes stay in this definition's plan. The rest of the earlier plan has this disposition:

| Earlier plan material | Disposition | Reason |
| --- | --- | --- |
| Section 4: classification words and recorded values on every Canvas record, the stage in the Canvas list and details in place of today's stage words, the design status in details, neutral wording in Canvas's orientation text, and delivering the report, with current requests, to Canvas | Moved to 089 | Each changes what Canvas shows or how Canvas receives the report. |
| Section 4: a stage rule and report assembler built inside Canvas | Superseded by the split | This definition now owns the one stage rule and the one report outside Canvas, and every reader, Canvas included, receives that report. |
| Section 5, capture: the unchanged capture request, which carries the literal text and the Submit or Save choice through the read-back that confirms Saved; the form copy; one notice naming the first condition that prevents sending; the capture messages; the notice on saving a request's text for later; and today's retry and no-replay rules | Moved to 089 | Capture is a Canvas screen. |
| Section 6, Canvas presentation: labels, list rows and their accessible names, the details header, the report section, adopting a fresh report, and when Review guidance appears | Moved to 089 | These are Canvas screens. |
| Section 7: the Canvas capture labels in the intake guidance, and the Canvas parts of the command documentation and maintainer acceptance | Moved to 089 | They describe Canvas. |
| Contracts: the Canvas record fields, request items with their live source, and the unchanged capture request | Moved to 089 | They define what Canvas reads and sends. |
| Contracts: the earlier report shape | Superseded by the split | This definition's report contract replaces it, and its request part stays unavailable until a reader that can see current requests supplies them. |
| The Canvas rows of Technical Context, Error And Authority Behavior, Guardrail Checks, Change Surface, and Risks And Reversibility | Moved to 089 | They apply only to Canvas work, including capture failures, the request feed, and the changed stage words. |
| Verification rows for the Canvas, browser, and installed-host capture checks | Moved to 089 | This definition checks only that Canvas output stays the same. |
| The UI rebuild, its legal file, and the hash and size pins | Moved to 089 | Only a Canvas change rebuilds the interface. |
| The design loop: approval of the exact round 3 mock before UI source or task derivation, and the Design Close Protocol | Superseded by the split; the design gate moved to 089 | This definition changes no screen. 089 runs its own design gate, and the round 3 mock stays unapproved reference input. |
| The slice order: classification foundation, shared projection and report, then capture copy and Canvas presentation | Superseded by the split | This definition's two task units carry the non-Canvas work, and 089 sets its own slices. |

## Assumptions

Items 1 and 2 follow the user's 2026-10-23 feedback and the correction the user authorized; their mechanics are definition-owner choices within that direction. Items 3 to 6 remain the earlier Ship-authorized definition-owner dispositions grounded in the ledger's accepted direction and recorded evidence. Items 7 to 11 are definition-owner decisions made under the user's 2026-10-29 `split 067`, which accepted Dude's recommendation to split. None is a user answer, and the ledger's answer slots stay unchanged. Each is reversible before implementation.

1. Question 1, recording and correcting values: Dude records classification internally while capturing or explicitly brainstorming an item, only when the description and project context make it clear, and leaves it unrecorded otherwise. People never choose or confirm it. A user's statement in chat wins, and inference never replaces a recorded value. Existing records stay unclassified until such a capture or brainstorm; nothing is filled in bulk. Basis: the user's 2026-10-23 feedback that intent and domain are internal concepts that make no sense to ask people about, and the user's authorization of this correction; the agreed direction that stores values once in the existing record; recommendation 1's rejection of guessing from titles and bulk rewrites. This replaces the 2026-10-20 disposition that saved values only from an explicit user choice.
2. Question 2, vocabulary and wording: internal intents create, fix, maintain, and explore; internal domains code, design, writing, and video; stages as in FR-020. Improve is not added. Other is dropped, because nobody picks a domain and an unrecorded domain already covers work outside the list. One table sets the plain words a report shows, such as Fix · Code, and 089 may revise them for Canvas. Basis: the 2026-10-15 scenario pass found no unmet need beyond four types, and adding a value later breaks no record, while removing one would.
3. Questions 1 and 2, contributing domains: one primary domain only. Basis: no reader in this definition needs contributing domains.
4. Question 10, report contents: stage, current phases, recorded design status, checkpoint, required gates, and request status, with sources, coverage, and one summary of unknowns, assembled in one place for every reader. Basis: the agreed progress-reporting limits, the agreed direction that every reader, including Canvas through 089 and later 087, shares one report meaning, and the recorded sources the Architect confirmed.
5. Question 11, phases and waiting: definitions may already name task phases in their domain's terms, and the report shows the recorded headings. A blank answer slot never shows that anyone is waiting. Showing Waiting for you needs a reader that can see current requests, and that moved to 089 with the Canvas request feed. Basis: existing task grouping and request coverage.
6. Questions 4 to 7: outside this package. Basis: the user's answer to question 3 and the agreed scope keep type-specific workflows and other outcomes out.
7. Two serial units: classification admission first, then the status-backed progress report. This definition changes no Canvas screen, so the design workflow and the mock approval gate no longer apply to it. Basis: the user's `split 067`, and the Architect's finding that classification already has workflow consumers that must accept it before anything records it.
8. `@dude status` is the first reader of the stage rule and the report. The overview adds each record's stage and keeps everything else. A status request about one item shows its full report, which shows a recorded classification as plain words and nothing otherwise. The request part is unavailable from chat, with its reason. Basis: the user's 2026-10-19 wish, under Progress Reporting in the owner ledger, for an interface through which a meta process asks for a work item's status or stage and the work reports back; the user's 2026-10-23 correction that a classification appears, if at all, only in plain words once established; and the Architect's finding that without status wiring the stage rule and report would have no reader outside Canvas.
9. Everything that changes what Canvas renders moved to 089, including the stage words Canvas shows today. Until 089 adopts the shared rule, Canvas keeps its current stage words, such as Idea, Verified, and Completed without a package, while status uses the FR-020 stages. Basis: the split, and the Architect's finding that changing those words would change Canvas immediately.
10. The design folder at `.dude/specs/067-work-type-presentation/design/` stays in place as reference input for 089. Nothing in it is deleted or moved, and it approves nothing. Basis: the split, and 089's ledger, which names those mocks as inputs rather than a baseline.
11. Tracked work: status cannot read tracked task states, so while tracked work is authoritative it shows a defined item's stage as unavailable and its phase as not exposed. Basis: the Architect's rule that tracked facts are authoritative or unavailable and never filled from the Markdown mirror, and Canvas's existing refusal to fill tracked task details from that mirror.

The Architect's read-only assessments supplied technical couplings, the capability envelope, and the scope of the split as advice, not user approval. With no user interface change, this definition has no design gate. No new guardrail candidate arose.

## Design History

This package began as a design definition. Its round 1 to round 3 mocks, their preserved variants, and their verification stay under `.dude/specs/067-work-type-presentation/design/` as reference input for `.dude/ideas/089-dude-canvas-redesign.md`. Round 3, the last canonical mock, at `design/work-type-presentation.html`, was `proposed` and never approved. This re-definition adds `design/pre-split-spec.md` and `design/pre-split-plan.md` to that folder: byte-exact copies of this package's spec and plan as they stood before the split, kept because the package was never committed and its earlier text would otherwise be lost. The folder approves nothing, and this definition reads nothing in it and changes nothing else there. The design entries in the Revision Log below remain as history.

## Revision Log

- 2026-10-20 01:57 UTC - First definition staged under explicit Ship. Design is exploring, and no mock exists yet.
- 2026-10-20T05:53:08Z - Settled Option A as proposed, rendered by the round 2 canonical mock (HTML `sha256:6eaf6bc8642e31d8e523a818ba9b9802ec63f2755a70cb48a92e10e07bc4cdc5`, runtime `sha256:27646058794769c0f2bd8be825939969d0e5323978ce48174aec783bfd3ec2e3`). Round 1 stays under `design/variants/round-1-initial/`. The Tester's final verification passed with four observations. Not approved.
- 2026-10-20T13:36:57Z - Repackaged the round 2 canonical mock as one self-contained HTML file after it rendered blank in the GitHub Copilot app's preview. The HTML at the same `preview_path` (raw `sha256:c5c35834d4394a34d25ad99c6c853e97d4b75e5ef11bb6a7597ce194e0406529`) embeds the unchanged runtime (`sha256:27646058794769c0f2bd8be825939969d0e5323978ce48174aec783bfd3ec2e3`); the UI, fixtures, and themes are unchanged, and the pre-fix files stay under `design/variants/round-2-before-embedded-fix/`. An independent replica check in headless Edge passed, but a refresh in the app is still needed to confirm that the mock renders there. Not approved.
- 2026-10-23T16:35:12Z - Returned the design to exploring after the user rejected asking people for intent and domain. Capture now asks only for the description and keeps Submit, Save, and Cancel; Dude records classification internally when it is clear, and Canvas shows recorded values as quiet words and nothing otherwise. Other is dropped from the internal domains, and capture messages state their reason and next step in plain words. The round 2 mock at the unchanged `preview_path` (raw `sha256:c5c35834d4394a34d25ad99c6c853e97d4b75e5ef11bb6a7597ce194e0406529`) and its verification are history for the earlier proposal; the revised mock is not yet rendered. Not approved.
- 2026-10-23T18:22:14Z - Settled the revised Option A as proposed, rendered by the round 3 canonical mock at the unchanged `preview_path` (raw `sha256:a583bd230b85e3bdabf9932e6d42f49252b3fb833c19732c3999625e9a24aeb2`, embedded runtime `sha256:c0fb9406dda7ec20d5f8a410dbd09d833d63d8c406a5d433be586c8d6feb7e4a`). Capture has one description field with Submit, Save, and Cancel; recorded classification appears only as quiet words, unknown values show nothing, and statuses give their actual reasons in plain words. Round 2 stays under `design/variants/round-2-embedded/`, and the initial round 3 under `design/variants/round-3-before-unavailable-fix/`. Not approved.
- 2026-10-29T13:15:05Z - Re-defined without a design workflow after the user's `split 067`. Classification, the shared stage rule, and the read-only progress report stay, with `@dude status` as their first reader; every Canvas part, including the mock approval gate, moved to `.dude/ideas/089-dude-canvas-redesign.md`, and Moved To 089 lists the IDs and maps the removed plan material. The design folder stays as reference input and approves nothing, and `design/pre-split-spec.md` and `design/pre-split-plan.md` keep the pre-split spec and plan word for word. Two serial open task units replace the design-approval hold.
