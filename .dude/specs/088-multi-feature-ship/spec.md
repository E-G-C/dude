---
title: Epic And Multi-Feature Ship
slug: multi-feature-ship
---

# Epic And Multi-Feature Ship

One Ship request can deliver a feature together with the unfinished features it depends on. When the target declares prerequisites that are not complete, Dude shows every feature it would run, in dependency order, and asks once before adding any feature the user did not name. After the user approves that exact plan, Dude carries the features through their existing lifecycle and Work one at a time, and moves on only when a fresh check shows the previous feature complete. The run ends at the first existing stop. A target without unfinished prerequisites ships exactly as it does today.

This definition covers the dependency-order part of the direction the user described on 2026-10-19. The named Epic, with its own goal, shared decisions, and a check that the combined outcome works, moved to its own draft idea, `.dude/ideas/094-epic-continuity.md`. This package adds no Epic record and claims no combined outcome.

Every feature keeps its own lifecycle, identity, authority, review, and approval rules. Dude stores no plan or approval and adds no queue, lane, or parallel work. Work runs each feature exactly as it runs a single feature today.

## User Scenarios

### US1 - See and approve the whole plan before anything starts (P1)

The user ships a feature whose declared prerequisites are not all complete. Before anything is defined or worked, Dude shows every feature it would run, in order, marks the ones the user did not ask for, lists the prerequisites it would skip because they are already complete, and asks one approval question.

Independent test: in a disposable installed project, add draft A, which declares draft B as a prerequisite, record the project's files, and ship A. Note the plan Dude shows and the question it asks, decline, and compare the files with the record.

1. Given A declares B and B is not complete, when the user ships A, then Dude shows B before A, marks B as not requested, and asks one approval question before any definition or Work.
2. Given a prerequisite that is already complete, when Dude shows the plan, then that prerequisite is listed as skipped and does not run.
3. Given A declares B and then C, and both declare D, when Dude builds the plan, then D appears once, before B and C, and B comes before C.
4. Given the user declines, or replies with anything other than approval of the exact plan, when the run ends, then nothing has been defined, worked, or written.
5. Given unchanged files, when Dude builds the plan twice, then both plans are identical.

### US2 - Deliver the approved features one at a time (P1)

After the user approves, Dude carries each feature through its existing lifecycle and Work in plan order. Before each feature, it checks the plan again and moves on only when the previous feature is complete and the rest of the plan is unchanged. It ends at the first stop and reports that stop as definition or Work reported it.

Independent test: with plan fixtures, mark every task of the first feature done and confirm that the rebuilt plan skips it and keeps the remaining order; leave one of its tasks blocked and confirm that it stays in the plan; declare a new prerequisite and confirm that it appears outside the approved plan. Then confirm that the Ship guidance states each run rule below and that deleting any one of them fails its check. Delivering several features end to end needs a live coordinator, the host, and real specialist dispatches, so this test does not exercise it.

1. Given an approved plan, when a feature is about to start, then Dude rebuilds the plan and continues only when the features left to run are exactly the approved features not yet completed, in the approved order.
2. Given a draft feature, when its turn comes, then all of its prerequisites are already complete, Dude defines it, and the definition receives the exact packages of those prerequisites as read-only context.
3. Given a feature that is already defined, when its turn comes, then it goes to Work as-is, without redefinition.
4. Given a feature's Work ends because no task is ready, when the rebuilt plan shows that feature complete, then Dude starts the next feature; otherwise the run ends.
5. Given a feature's definition stops, or its Work stops for any other reason, including a human-only gate such as mockup approval, then the run ends there and Dude reports that stop unchanged.
6. Given a feature's Work starts, then it carries no Work state, counters, claims, or task authority from another feature.
7. Given the run ends, then the final response gives each feature's result and claims no combined outcome.

### US3 - Get a clear refusal when the plan cannot be followed safely (P2)

The user ships a feature whose declared prerequisites cannot be followed safely. Dude refuses before anything starts and names the cause and the next action.

Independent test: prepare a missing prerequisite, a two-feature cycle, a feature that declares itself, a resolved prerequisite, an unreadable prerequisite task file, malformed declared prerequisites, a duplicate idea name, and conflicting ownership. Build the plan for each, and compare the files before and after.

1. Given a declared prerequisite names no idea, when the user ships the target, then Dude refuses before any definition or Work and names the missing prerequisite.
2. Given declared prerequisites form a cycle, then Dude refuses and names the features in the cycle.
3. Given a prerequisite is resolved, then Dude refuses, says that a resolved idea never counts as complete, and points to an explicit brainstorm that reopens it or changes the declared prerequisites.
4. Given a prerequisite's records cannot be read, or the lifecycle records report an identity or ownership error, then Dude refuses with that diagnosis.
5. Given any refusal, then the project files are unchanged.

### US4 - Ship a feature without unfinished prerequisites as before (P2)

The user ships a feature that declares no prerequisites, or whose prerequisites are all complete. Ship behaves exactly as it does today.

Independent test: build the plan for a target that declares no prerequisites and for one whose prerequisites are all complete, and confirm that each plan holds only the target. Then confirm that every existing Ship guidance, documentation, and Work check passes unchanged.

1. Given a target that declares no prerequisites, when the user ships it, then Dude asks no new question and runs the same lifecycle stages and Work as today.
2. Given a target whose prerequisites are all complete, when the user ships it, then the same holds, and the complete prerequisites do not run again.
3. Given imported tracked work, when the user ships, then Ship keeps its existing tracked behavior and builds no plan.

## Edge Cases

| Condition | Required behavior |
| --- | --- |
| Target is a new raw idea | Ship's existing brainstorm capture runs first, and the plan then reads the new idea. A new idea that declares no prerequisites ships as today. |
| Bare `@dude ship` | Once the one unambiguous target resolves, the same plan rules apply. |
| Prerequisite is a draft | Dude defines it during the run, just before its Work and after its own prerequisites are complete. |
| Prerequisite is defined and in progress or blocked | It goes to Work as-is. If a task is still unfinished when its Work ends, it is not complete and the run ends. |
| Prerequisite is complete, but its own prerequisites are not | It counts as complete, and its own prerequisites are not added. |
| Prerequisite is resolved | Refusal before anything starts. A resolved idea never counts as complete. |
| Target is resolved | Ship's existing refusal applies; reopening needs an explicit brainstorm. |
| Target's own task records cannot be read | The plan still lists the target, with its stage unavailable. Ship meets the problem at the target's turn, as it does today. |
| Several features share a prerequisite | It is listed and run once, before every feature that declares it. |
| Prerequisites change after the plan is shown or during the run | The rebuilt plan differs from the approved one, so the run ends before the next feature and reports the change. A new Ship request shows the new plan. |
| Reply approves only part of the plan or asks for a change | Treated as not approved. The run ends with nothing started. |
| Work ends because no task is ready, but tasks remain unfinished | The feature is not complete. The run ends and reports Work's outcome unchanged. |
| Cancellation, supervisor loss, or a Work hard stop | The run ends with Work's existing stop. The run itself retries, resumes, and cleans up nothing. |
| New Ship request after a stop | Dude builds a fresh plan from current records, skips complete features, and asks again before adding unfinished ones. A retained claim or an in-progress task meets Work's existing rules. |
| Project with draft ideas only | The plan works without any definition package. |
| Lifecycle numbers | They never add, skip, or order a feature. |

## Functional Requirements

### Building the plan

- FR-001: After Ship resolves its one target to an exact idea and finds no imported tracked work, Dude builds a dependency plan for that target before any definition or Work.
- FR-002: The plan follows only the prerequisites declared on ideas, transitively from the target. Lifecycle numbers, titles, file names, and relatedness never add, skip, or order a feature.
- FR-003: The plan orders features so that each unfinished prerequisite comes before every feature that declares it, with each feature listed once and the target last.
- FR-004: Where declared prerequisites leave the order open, the plan follows the order in which each feature declares its prerequisites.
- FR-005: A prerequisite is complete, which satisfies the dependency, only when it is defined, its own definition package reads cleanly, it has at least one task, and every task is done.
- FR-006: The plan lists each complete prerequisite once as skipped and does not follow that prerequisite's own declared prerequisites.
- FR-007: The plan identifies each feature by its exact idea path and, when defined, its exact package path, with its stage and whether the user named it.
- FR-008: Building the plan writes nothing.

### Refusals

- FR-009: Dude refuses the plan when a declared prerequisite names no idea.
- FR-010: Dude refuses the plan when declared prerequisites form a cycle, including a feature that declares itself, and names the features in the cycle.
- FR-011: Dude refuses the plan when a prerequisite it would need to run is resolved, because a resolved idea never counts as complete.
- FR-012: Dude refuses the plan when the lifecycle records report an identity or ownership error, when the target's declared prerequisites cannot be read, or when a prerequisite's lifecycle, package, task, or declared-prerequisite records cannot be read.
- FR-013: A refused plan ends the Ship before any definition or Work, and Dude names the cause and the next action, such as an explicit brainstorm that reopens a resolved idea or changes declared prerequisites.

### Approval

- FR-014: When the plan holds any feature the user did not name, Dude shows the whole plan in its reply and asks one approval question before any definition or Work.
- FR-015: Only the user's explicit approval, given in reply to that question, authorizes running the planned features; Ship's pre-Work dispositions never supply it.
- FR-016: When the user declines, or replies with anything other than approval of the exact plan shown, the run ends with no definition, Work, or write, and Dude does not ask the approval question again in that request.
- FR-017: An approval covers only the features and order shown, lasts only for the current Ship request, and is never saved.

### Ship without unfinished prerequisites

- FR-018: When the plan holds only the target, Ship asks no new question, adds nothing to its reply, makes no new write, and runs the same lifecycle stages and Work as before this feature.
- FR-019: When imported tracked work exists, Ship keeps its existing tracked behavior and builds no plan.

### Running the approved plan

- FR-020: Dude runs the approved features one at a time, in plan order.
- FR-021: Before each feature starts, Dude rebuilds the plan and continues only when the features left to run are exactly the approved features not yet completed in this run, in the approved order.
- FR-022: After the first feature, Dude starts the next feature only when the rebuilt plan shows the feature just run as complete.
- FR-023: Each feature goes through Ship's existing single-target stages as its own target: a draft is defined and then worked, and a defined package goes to Work as-is.
- FR-024: When Dude hands a feature to definition, it gives the exact package of each of that feature's complete prerequisites as read-only context.
- FR-025: Ship's pre-Work dispositions apply to each feature's own pre-Work stages and end when that feature's Work begins.
- FR-026: Each feature's Work starts with fresh admission under Ship's normal autonomous policy and carries no accepted Work state, counters, claims, or task authority from another feature.
- FR-027: When a feature's definition stops, or its Work ends for any reason other than no task being ready, the run ends there and Dude reports that stop unchanged.
- FR-028: After the run ends, Dude starts no other feature and adds no retry, resume, or cleanup of its own.
- FR-029: A new explicit Ship request after a stop builds a fresh plan from current records and needs fresh approval for any feature the user did not name.

### Reporting

- FR-030: The final response gives each planned feature's result, including the features that did not start, and names the feature and stop where the run ended.
- FR-031: The final response claims no combined outcome for the features delivered together.

## Key Entities

- Target: the one feature Ship was asked to deliver, named in the request or found as the single live target of a bare request.
- Declared prerequisite: a feature that an idea names as needing to be finished first. Declarations are the only source of order.
- Complete prerequisite: a prerequisite that meets FR-005. A resolved idea is never complete.
- Plan: the ordered list of features to run, with prerequisites first and the target last, plus the complete prerequisites it skips and any refusal causes. Dude builds it on demand and never stores it.
- Approved plan: the exact plan the user approved in the current Ship request. It lasts only for that request.
- Run: one Ship request carrying an approved plan, one feature at a time, until the plan ends or a stop occurs.

## Scope

In scope: building and showing the plan, the refusals, the single approval question, running the approved features one at a time through their existing lifecycle stages and Work, the check between features, and the final report.

Out of scope:

- A named Epic and everything it would hold: members, goal, acceptance condition, shared decisions, outputs handed between features, progress across features, and a check that the combined outcome works. These moved to `.dude/ideas/094-epic-continuity.md`.
- Continuing with independent features after a stop.
- Running features in parallel, interleaving their tasks, or task-level dependencies across features.
- Running a plan under tracked execution.
- New ways to declare, edit, or display prerequisites, including a graph editor.
- Redefining a defined feature automatically to fit an upstream result.
- Saved plans or approvals, run records, queues, and background runs.
- Changes to Work, `@dude work`, or `@dude status`, and any Canvas change.
- Git and release actions. Ship's existing no-Git rule covers the whole run.

Feature 017 made Ship advance one selected target. This feature lets Ship also advance that target's unfinished declared prerequisites, and only after the user approves the exact plan. Feature 017's command shape, target resolution, tracked precedence, resolved-idea refusal, canonical ownership, lifecycle authority, and Work delegation stay in force, as do its limits: no state file, ledger, lane, board, concurrency, configuration, or saved default. The plan is a read-only view that Dude rebuilds when needed. Feature 039's pre-Work policy applies to each feature's own pre-Work stages, as FR-025 states. Lifecycle numbers show capture order only.

## Success Criteria

- SC-001: In 100% of plan fixtures (a chain, a diamond, a complete prerequisite whose own prerequisite is unfinished, draft, in-progress, and blocked prerequisites, no prerequisites, only complete prerequisites, and a project with draft ideas only), the plan lists exactly the expected features in the expected order and the expected skipped prerequisites. Building it twice, or in two differently named copies of the project, gives identical results.
- SC-002: In 100% of refusal fixtures (a missing prerequisite, a two-feature cycle, a self-declared prerequisite, a resolved prerequisite, an unreadable prerequisite task file, malformed declared prerequisites on the target and on a prerequisite, a duplicate idea name, and conflicting ownership), the plan is refused with its named cause, and the project files are byte-identical before and after.
- SC-003: In recheck fixtures, completing every task of the first planned feature moves it to skipped and keeps the remaining order; one blocked task keeps it in the plan; and a newly declared prerequisite appears as a feature outside the earlier plan.
- SC-004: For a target with no declared prerequisites and for one whose prerequisites are all complete, the plan holds only the target, and every existing Ship guidance and documentation check passes unchanged.
- SC-005: The Ship guidance states each rule in FR-001 and FR-013 to FR-031, and deleting any one of those rules fails its check. This proves the written rules, not the model's compliance.
- SC-006: In the installed-host check, shipping draft A that declares draft B shows B before A, marks B as not requested, asks exactly one approval question, and starts no definition or Work. After the user declines, the project files are byte-identical to the record taken before the request.
- SC-007: Every existing Work, driver, status, and Canvas test gives the same per-file result as its baseline from before implementation.

## Assumptions

- Prerequisites are declared on ideas with the existing declared-dependency field, kept current through brainstorm. This feature adds no other way to declare them.
- Complete is the Completed stage that `@dude status` already shows for each record, so Ship and status agree on which prerequisites are finished.
- Declared prerequisites rarely change during a run. When they do, the check before the next feature ends the run instead of widening it.
- Finishing a long run depends on a live coordinator, the host, and real specialist dispatches. Each feature's Work keeps its existing stops, budgets, and cancellation, and those bound the run.
- Existing project and bundle guardrails remain in force. The definition-owner dispositions recorded in the owner idea are Dude's decisions under the user's Ship, not user answers.
