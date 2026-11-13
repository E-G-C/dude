---
title: Epic Continuity
slug: epic-continuity
status: defined
spec_path: .dude/specs/094-epic-continuity/spec.md
---

# Idea: Epic Continuity

## Idea

At 2026-10-19T21:58:17.885Z, while discussing progress reporting in `.dude/ideas/067-work-type-presentation.md`, the user wrote:

> does it needs to be in a different draft? or would it be better if we plan ahead in 067? This situation  also brings an interesting scenario that I've seen before. There aer some features that are related or depedents. Currentl Dude does not haev a continuity between features. This gives makes me think we need somethign like an Epic where many features are related and depend on each others. SO we can launch a ship loop thru an Epic covering a longer workscope and deliverring all thiose features. Thoughts ?

At 2026-10-19T22:09:13.223Z, after Dude suggested keeping progress reporting in 067 and capturing this direction on its own, the user replied:

> yes, balance oout the agreements, and capture them,  break them down as needed, consolidate the epic/ship multistep  in a new feature as needed

The Epic part of this direction was split from `.dude/ideas/088-multi-feature-ship.md` during the user's 2026-11-03 Ship of that idea, as a definition-owner decision.

## Open Questions

For definition; no answer is needed to capture this idea.

1. Is an ordinary feature that declares the other features as prerequisites, and holds their shared goal and combined check in its own definition, enough to act as an Epic, or does an Epic need its own name, goal, acceptance condition, combined-outcome check, or progress view?
   Answer:
2. If an Epic needs its own record, what is the smallest durable record that can hold its members, goal, acceptance condition, and the decisions and outputs passed between its features?
   Answer:

## Assumptions

No additional user assumptions supplied.

<!-- dude:managed:start -->
## Split From 088

This idea holds the Epic part of the direction quoted under Idea above. During the user's 2026-11-03 Ship of `.dude/ideas/088-multi-feature-ship.md`, the Spec Lead limited 088's definition to running a target's declared prerequisites in dependency order and split the Epic part into this idea, so that it has its own owner and stays visible in the backlog. The split is a Ship-authorized definition-owner decision, not a user choice, and the answer slots in 088 stay blank. The analysis below moved here from 088's ledger, which keeps its copy as history.

Agreed at brainstorm level in 088 and carried here:

- The work reuses what Dude already has.
- Every feature keeps its own lifecycle, identity, authority, review, and approval rules.

The following capture analysis is preserved as context. The current definition scope and Ship-authorized owner dispositions are recorded under Definition Dispositions below; the capture proposals alone approve no command, storage, schema, or implementation.

## What 088 Covers

088 now covers only this: one Ship request delivers a target together with its unfinished declared prerequisites. Dude shows the plan in dependency order, asks before adding any feature the user did not name, runs the approved features one at a time through their existing lifecycle and Work, and ends at the first stop. It keeps nothing after the request ends: no Epic record, goal, acceptance condition, shared decisions, or check that the combined outcome works.

That already allows one Epic-like pattern. An ordinary feature that declares the other features as prerequisites gets them delivered first, in dependency order and otherwise in the order it declares them, and its own definition and tasks can state the shared goal and check that the features work together. Question 1 asks whether that pattern is enough. Definition here should test it before adding an Epic record, and add a record only for what the pattern cannot do.

## Proposed Epic Continuity

The capture considered whether prerequisites alone might miss the shared outcome. It proposed an Epic with agreed members, a goal and acceptance condition, shared decisions, outputs handed from one feature to the next, progress derived from its features, and a final check that the combined outcome works.

At capture, an Epic's storage, identity, command, and schema were open under questions 1 and 2. The current definition below uses ordinary feature artifacts and creates no `.dude/epics/` folder, registry, or shadow task board.

## Continuity Between Features

Continuity means carrying accepted contracts, decisions, artifacts, and evidence from one feature to the next. A shared title, or every member's tasks being done, does not prove that the whole works end to end. A feature that is already defined is not rewritten automatically to fit a new upstream result; changed intent or contracts go back through explicit brainstorm or define.

## Permissions, Completion, And Delivery

Approving a scope authorizes that scope and nothing more. A run does not enroll features silently, import into Beads, switch or fall back between lanes, or revive terminal Work, and it adds no automatic retry or resume after cancellation or supervisor loss. It commits, pushes, merges, and releases nothing, and it never bypasses UI mockup approval or another human-only gate. Every current Work outcome and stop keeps its meaning; reporting on an Epic weakens none of them.

Finishing a feature's implementation, accepting an Epic's combined outcome, and delivering through Git or a release are separate events. A request to ship an Epic never silently includes Git or release work.

## Definition Dispositions

These are Ship-authorized definition-owner decisions during the explicit `define epic-continuity` subroute of the user's Ship request, not user answers, ratification, or changes to the blank answer slots.

- Question 1: use an ordinary target feature for the presently evidenced Epic need. Its normal name and definition hold the shared goal and combined acceptance condition, its declared prerequisites supply the members and order, and its tasks verify the combined behavior. The current planner retains that target separately from completed prerequisites; the existing definition handoff already passes their exact packages as read-only context. This is the smallest supported design, and no evidence requires a separate identity or aggregate progress view.
- Question 2: the condition requiring another record is unmet. Add no Epic record or schema. Keep relevant accepted contracts, decisions, outputs, and evidence as references in ordinary definitions. This selects no hypothetical future record and incurs no new storage migration.
- Guardrails: applicable project and bundle rules already cover the work. No new project-specific candidate emerged, so there is no adoption, narrowing, rejection, skip, or guardrail-memory write. UI and Canvas changes are excluded; no mockup approval is inferred.

The package at `.dude/specs/094-epic-continuity/spec.md` defines concise continuity guidance, a concrete ordinary-target regression fixture, and evidence-based reporting. It explicitly qualifies 088's blanket combined-outcome reporting restriction: prerequisite completion alone proves nothing combined; only normal target completion with its specified combined check accepted through Work verification and independent review can support that claim, with the condition and evidence named. No new acceptance state or post-Work stage is created, and 088's other execution and approval rules stay unchanged.

The remaining evidence limit is explicit: fixture and written-rule checks do not prove live model compliance or guarantee completion of a long Ship run. Already-defined packages are not synchronized automatically. These limits require no outcome-changing user choice for this guidance increment; existing definition and Work stops still apply.
<!-- dude:managed:end -->

## Coordinator Log

- 2026-11-03T01:30:30Z - brainstorm: Staged the first capture of the Epic part of .dude/ideas/088-multi-feature-ship.md, split off during the user's 2026-11-03 Ship of that idea as a Ship-authorized definition-owner decision, with the user's two 2026-10-19 messages as provenance, the moved increment 2 and continuity analysis, and two open questions, for coordinator first-capture publication; no definition package, tasks, or implementation.
- 2026-11-12T21:33:57Z - define: Staged the first definition using an ordinary target feature for shared-outcome continuity, with Ship-authorized owner dispositions for questions 1 and 2, read-only prerequisite context, a bounded combined check, and evidence-qualified reporting; no Epic record, UI, new guardrail, or execution, pending coordinator publication and lint.
- 2026-11-12T21:54:56Z - work: Claimed T001@e4c7n2p9 for the user-authorized autonomous Work invocation; implementation has not started.
- 2026-11-12T23:09:56Z - close: T001@e4c7n2p9 settled through the autonomous Work adapter on attempt 1. The feature-definition skill and its generated copy now have a Cross-Feature Continuity section: an accepted shared outcome over declared prerequisites becomes an ordinary target that states the shared goal, an acceptance scenario using the prerequisite outputs together, and a bounded verification task, with no extra stage for dependent features without that intent; a definition reads only the exact completed prerequisite packages from the existing handoff as read-only context, cites relevant accepted material by source, keeps proposals and old evidence apart from accepted decisions and fresh verification, and sends missing material or an unresolved fact or conflict through existing clarification or contract-mismatch handling (widened after testing to match FR-009). Four new backlog cases prove the existing planner and lifecycle pattern with ordinary invoice fixtures, and 21 new format-contract cases bind each sentence with isolated deletion checks. Independent verification passed all 11 rows: 094 selectors 4/4 and 21/21, backlog 92/92 (baseline 88/88), format-contract 228/228 (baseline 207/207), the build-copy projection check, lint, deletion spot checks, and the US1/US2 semantic check; the independent Code Reviewer accepted with no findings. No runtime or production JavaScript changed.
- 2026-11-12T23:10:03Z - work: Claimed T002@r8m3v6k1 for the user-authorized autonomous Work invocation; implementation has not started.
- 2026-11-13T00:31:46Z - close: T002@r8m3v6k1 settled through the autonomous Work adapter on attempt 1. In dude-work-intake Declared Prerequisites, step 5 now points definition to Cross-Feature Continuity, and step 7 replaces the blanket "claim no combined outcome" with the evidence-qualified rule: completed prerequisites or one Ship request prove no combined outcome; a combined outcome is claimed only when the target completes normally and its specified combined check was accepted through Work's existing verification and independent review, naming the checked condition and its evidence; an absent, not-run, failed, or blocked check or an unfinished target is reported as it stands, with no combined success. The coordinator's Ship paragraph and docs/commands.md say the same, and the command reference gains an ordinary invoice-roundtrip example. Nineteen new format-contract cases bind the rule on all three surfaces with isolated deletion checks; only the three affected 088 reporting expectations were rebound, as this spec's amendment to 088 FR-031 allows. Independent verification passed all 15 rows: 094/088 selectors 76/76, format-contract 247/247 (baseline 228/228), backlog 92/92, build-dev 27 passed with the known Windows symlink skip, projection, lint, and 42 single-mutation checks; the independent Code Reviewer accepted with no findings and noted two optional wording refinements. No runtime changed.
- 2026-11-13T00:31:46Z - close: Feature 094 epic-continuity is complete under the explicit Ship invocation: T001@e4c7n2p9 and T002@r8m3v6k1 are done, each settled on attempt 1 with independent verification and Code Reviewer acceptance. An Epic is an ordinary target feature that declares its members as prerequisites and holds the shared goal and the combined check; no Epic record, command, state, UI, or Git action was added. Known limits: the written-contract tests do not prove live coordinator compliance or a completed multi-feature Ship; an "and" to "or" change inside the claim condition is not caught by the lexical checks; and dude-feature-definition Brainstorm still does not tell the owner to record depends-on:. The one advisory Rubber Duck retrospective was recorded in retrospective.md. Nothing was committed.
