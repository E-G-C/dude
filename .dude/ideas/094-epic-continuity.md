---
title: Epic Continuity
slug: epic-continuity
status: draft
spec_path:
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

The sections below are Dude's analysis and proposals for definition. They approve no command, storage, schema, or implementation.

## What 088 Covers

088 now covers only this: one Ship request delivers a target together with its unfinished declared prerequisites. Dude shows the plan in dependency order, asks before adding any feature the user did not name, runs the approved features one at a time through their existing lifecycle and Work, and ends at the first stop. It keeps nothing after the request ends: no Epic record, goal, acceptance condition, shared decisions, or check that the combined outcome works.

That already allows one Epic-like pattern. An ordinary feature that declares the other features as prerequisites gets them delivered first, in dependency order and otherwise in the order it declares them, and its own definition and tasks can state the shared goal and check that the features work together. Question 1 asks whether that pattern is enough. Definition here should test it before adding an Epic record, and add a record only for what the pattern cannot do.

## Proposed Epic Continuity

Prerequisites alone may not capture the shared outcome the user wants from an Epic. A later slice could add an Epic with agreed members, a goal and acceptance condition, shared decisions, outputs handed from one feature to the next, progress derived from its features, and a final check that the combined outcome works.

An Epic's storage, identity, command, and schema are open under questions 1 and 2, so this capture creates no `.dude/epics/` folder, registry, or shadow task board.

## Continuity Between Features

Continuity means carrying accepted contracts, decisions, artifacts, and evidence from one feature to the next. A shared title, or every member's tasks being done, does not prove that the whole works end to end. A feature that is already defined is not rewritten automatically to fit a new upstream result; changed intent or contracts go back through explicit brainstorm or define.

## Permissions, Completion, And Delivery

Approving a scope authorizes that scope and nothing more. A run does not enroll features silently, import into Beads, switch or fall back between lanes, or revive terminal Work, and it adds no automatic retry or resume after cancellation or supervisor loss. It commits, pushes, merges, and releases nothing, and it never bypasses UI mockup approval or another human-only gate. Every current Work outcome and stop keeps its meaning; reporting on an Epic weakens none of them.

Finishing a feature's implementation, accepting an Epic's combined outcome, and delivering through Git or a release are separate events. A request to ship an Epic never silently includes Git or release work.
<!-- dude:managed:end -->

## Coordinator Log

- 2026-11-03T01:30:30Z - brainstorm: Staged the first capture of the Epic part of .dude/ideas/088-multi-feature-ship.md, split off during the user's 2026-11-03 Ship of that idea as a Ship-authorized definition-owner decision, with the user's two 2026-10-19 messages as provenance, the moved increment 2 and continuity analysis, and two open questions, for coordinator first-capture publication; no definition package, tasks, or implementation.
