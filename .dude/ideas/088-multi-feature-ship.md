---
title: Epic And Multi-Feature Ship
slug: multi-feature-ship
status: defined
spec_path: .dude/specs/088-multi-feature-ship/spec.md
---

# Idea: Epic And Multi-Feature Ship

## Idea

At 2026-10-19T21:58:17.885Z, while discussing progress reporting in `.dude/ideas/067-work-type-presentation.md`, the user wrote:

> does it needs to be in a different draft? or would it be better if we plan ahead in 067? This situation  also brings an interesting scenario that I've seen before. There aer some features that are related or depedents. Currentl Dude does not haev a continuity between features. This gives makes me think we need somethign like an Epic where many features are related and depend on each others. SO we can launch a ship loop thru an Epic covering a longer workscope and deliverring all thiose features. Thoughts ?

At 2026-10-19T22:09:13.223Z, after Dude suggested keeping progress reporting in 067 and capturing this direction on its own, the user replied:

> yes, balance oout the agreements, and capture them,  break them down as needed, consolidate the epic/ship multistep  in a new feature as needed

The user sees related and dependent features without continuity between them and is considering something like an Epic, which would tie many interdependent features into one longer scope of work so that one Ship loop could deliver all of them. The user asked for Dude's thoughts, so what an Epic means in Dude is still open.

## Open Questions

For definition; no answer is needed to capture this idea.

1. Should a first release only run features in dependency order, or also add a named Epic with its own goal and outcome check?
   Answer:
2. What is the smallest durable record that can hold an Epic's members, goal, acceptance condition, and the decisions and outputs passed between features?
   Answer:
3. When does a prerequisite count as satisfied, and how should the user approve prerequisites that would widen the requested scope?
   Answer:
4. When a feature stops at a blocker or human gate, should the run end or continue with independent features, and from which points may a request start or restart a run under Work's existing rules?
   Answer:
5. May a run include features already imported into tracked Beads execution, or only Lightweight features?
   Answer:

## Assumptions

No additional user assumptions supplied.

<!-- dude:managed:start -->
## Definition And Split

During the user's explicit Ship of this idea, requested at 2026-11-03T01:14:38Z, the Spec Lead staged this first definition at `.dude/specs/088-multi-feature-ship/spec.md`, with `plan.md` and two serial open units. `T001@c4e81f2a` adds a read-only plan form that lists a target's unfinished declared prerequisites in dependency order. `T002@7b39d0e6`, which depends on T001, wires Ship to show that plan, ask before adding any feature the user did not name, run the approved features one at a time, and end at the first stop.

The definition covers proposed increment 1 only. The Epic part, proposed increment 2, was split into its own draft idea, `.dude/ideas/094-epic-continuity.md`, which now owns it. The capture-time sections below remain as history. Where they differ from this section, this section wins, including Diagram 1's open combined-outcome step, the statement that both slices stay in this idea, and the pointers to open questions 4 and 5.

The answer slots above remain the user's and stay blank. Before the Ship, Dude recommended a first version that only runs features in dependency order and asked the user to choose; the user's Ship command did not answer that question. The dispositions below are Ship-authorized definition-owner decisions drawn from accepted intent and recorded evidence, not user answers:

- Question 1: the first release only runs features in dependency order, and the named Epic, with its own goal and outcome check, moved to `.dude/ideas/094-epic-continuity.md`. The user's 2026-10-19 reply asked Dude to break the direction down as needed, Agreed So Far already sets a first scope that runs features one at a time, and the Keep it simple guardrail rules out an Epic record whose goal and acceptance test are not yet settled. Either answer needs dependency order, so this choice forecloses nothing: the Epic idea can be defined next and build on it.
- Question 2: this package creates no Epic record. Each feature keeps its own idea, package, and log as its record, and an approved plan lasts only for the Ship request that showed it. The question moved with the Epic part.
- Question 3: a prerequisite is satisfied only when it is defined, its own package reads cleanly, it has at least one task, and every task is done, which is the Completed stage that `@dude status` already shows. A resolved prerequisite never satisfies a dependency, so its plan is refused before anything starts. Adding any feature the user did not name needs the user's explicit approval of the exact plan shown, and no Ship disposition supplies that approval.
- Question 4: the run ends at the first existing stop, including a human-only gate such as mockup approval, and does not continue with independent features. A new explicit Ship request builds a fresh plan from current records, skips satisfied prerequisites, and asks again before adding any. It revives no stopped Work, bypasses no retained claim, and reopens no resolved idea.
- Question 5: only Lightweight features. When imported tracked work exists, Ship keeps its existing tracked precedence and builds no plan, and it never imports work or falls back between lanes.

Existing project and bundle guardrails cover this feature. No guardrail candidate arose, so nothing was adopted, narrowed, rejected, or skipped. The feature changes no user interface, so the design gate does not apply to it. Each disposition is reversible before implementation. The material residual risk is that the user wanted the Epic in the first release; the Epic idea can still deliver it next without undoing this package. Publication, the authoritative ownership recheck, and lint remain with the coordinator, and this staged package is not a readiness claim.

## Agreed So Far

The user's reply above accepted Dude's suggestion to capture this direction separately. Agreed at brainstorm level:

- 067 keeps its read-only progress reporting, and this idea holds continuity and execution across features.
- The work reuses what Dude already has, and a first scope runs features one at a time.
- Every feature keeps its own lifecycle, identity, authority, review, and approval rules.

The sections below are Dude's analysis and proposals for definition. They approve no command, storage, schema, or implementation.

## What Exists Today

Dude already records and shows some relationships between features. What it lacks is the loop the user describes, one that carries several dependent features through their lifecycles.

- `.dude/ideas/024-feature-focus-order.md` recorded the user's earlier wish for a Ship that implements several dependent features, and added `depends-on:` to idea frontmatter for read-only dependency and order views. It chose not to design for that Ship because nothing would call it then.
- `src/skills/dude-lightweight-execution/backlog.mjs` derives Blocked and Next groups and dependency notes from that field. A dependency counts as met only when its target is defined with every task done, so a target resolved without a package never meets it.
- Ship (`src/skills/dude-work-intake/SKILL.md`, `## Ship`) takes at most one target and never widens it, asks one disambiguation question instead of ranking candidates, and adds no scheduler. Work runs one task at a time in the lane it detects at the start; in tracked execution it ignores the feature selector and takes whatever Beads reports ready.
- The Beads import (`library/packs/beads/skills/dude-pack-beads-spec-import/SKILL.md`) creates one epic per feature to group that feature's tasks. It stays deferred and never executes, so it is not the cross-feature Epic meant here.

## Proposed Increment 1: Dependency Order

Dude proposes starting with dependency-aware sequential Ship. It would resolve the requested target and its declared prerequisites through exact identities and owners, show the exact features and order, and ask before adding anything the user did not request. It would then run one ready feature at a time through the existing lifecycle and Ship, moving on only after a successful authoritative result and a fresh check of the next feature's prerequisites.

Diagram 1, proposed from this discussion: one run over an approved scope. Nothing in it is implemented. The stops follow Dude's first-slice recommendation, question 4 holds the alternatives, and the outcome check belongs to increment 2.

```mermaid
graph TD
  A[User asks to ship a target feature or Epic] --> B{Target and prerequisites resolve to exact identities?}
  B -->|No, missing, cyclic, or ambiguous| X[Stop and report the dependency diagnosis]
  B -->|Yes| C[Show the exact features and order, including added prerequisites]
  C --> D{User approves that exact scope?}
  D -->|No| Y[Stop with nothing started]
  D -->|Yes| E{Next feature has its prerequisites satisfied?}
  E -->|No| Z[Stop and report the unmet prerequisite]
  E -->|Yes| F[Run that one feature through its existing lifecycle and Ship]
  F --> G{Successful authoritative result?}
  G -->|No| W[Stop at that existing Work stop or human gate and report it]
  G -->|Yes| H{Approved features remain?}
  H -->|Yes| E
  H -->|No| I[NEEDS CLARIFICATION: combined outcome check, increment 2]
  I --> R[Report each feature result, with no commit, push, or release]
```

Order comes only from declared dependencies, never from lifecycle numbers, titles, or relatedness. A prerequisite may already be satisfied, resolved without delivering anything, or still unfinished; how each case counts, and what evidence proves it, is question 3.

## Proposed Increment 2: Epic Continuity

History: on 2026-11-03 this analysis moved to `.dude/ideas/094-epic-continuity.md`, which now owns it. The text below stays as proposed at capture.

Prerequisites alone may not capture the shared outcome the user wants from an Epic. A later slice could add an Epic with agreed members, a goal and acceptance condition, shared decisions, outputs handed from one feature to the next, progress derived from its features, and a final check that the combined outcome works.

Both slices stay in this one idea for now, and definition may split them if each proves independently deliverable. An Epic's storage, identity, command, and schema are open under questions 1 and 2, so this capture creates no `.dude/epics/` folder, registry, or shadow task board.

## Continuity Between Features

Continuity means carrying accepted contracts, decisions, artifacts, and evidence from one feature to the next. A shared title, or every member's tasks being done, does not prove that the whole works end to end. A feature that is already defined is not rewritten automatically to fit a new upstream result; changed intent or contracts go back through explicit brainstorm or define.

## Permissions And Stops

Approving a scope authorizes that scope and nothing more. A run does not enroll features silently, import into Beads, switch or fall back between lanes, or revive terminal Work, and it adds no automatic retry or resume after cancellation or supervisor loss. It commits, pushes, merges, and releases nothing, and it never bypasses UI mockup approval or another human-only gate. Every current Work outcome and stop keeps its meaning; reporting on an Epic weakens none of them.

For a first slice, Dude recommends ending the run at the first existing stop and reporting it instead of working around it. Questions 4 and 5 hold the open choices on blocked independent features, human gates, start and restart points, and tracked features.

## Worked Example: 067 And 087

The pair is an example only. 067 plans classification and progress information that `.dude/ideas/087-dude-canvas-routing-map.md` could later read. This capture writes no dependency field between them and does not assume 087 needs all of 067 deployed before its design starts. Once a shared contract is stable and accepted, 087's design could begin early, while implementation and mockups follow real evidence and dependencies. Dude's earlier chat suggestion that 087's mockup come after 067 ships was only a proposal for that pair.

## Completion And Delivery

Finishing a feature's implementation, accepting an Epic's combined outcome, and delivering through Git or a release are separate events. A request to ship an Epic never silently includes Git or release work.

## Left Out Of A First Version

A first version leaves out arbitrary composition or enforcement of pack workflows, which stays with 067's question 7, along with task-level interleaving across features, parallel scheduling, full portfolio tooling, a graph editor, and generic checkpoints or telemetry.
<!-- dude:managed:end -->

## Coordinator Log

- 2026-10-19T22:10:35Z - brainstorm: Staged the first capture of the user's Epic and multi-feature Ship direction from the 067 progress-reporting discussion, with current groundwork, two proposed increments, permission boundaries, a 067 and 087 worked example, and five open questions, for coordinator first-capture publication; no definition package, tasks, or implementation.
- 2026-11-03T01:30:30Z - define: Staged first definition at .dude/specs/088-multi-feature-ship/spec.md under the user's explicit Ship, covering dependency-ordered multi-feature Ship only with the Epic part split to .dude/ideas/094-epic-continuity.md, with spec, plan, and two serial open units T001@c4e81f2a and T002@7b39d0e6 (T002 depends on T001), Ship-authorized definition-owner dispositions for questions 1 to 5 that leave every answer slot blank, no new guardrails, and no implementation, task state, or Git action.
- 2026-11-03T02:05:22Z - work: Claimed T001@c4e81f2a for the user-authorized autonomous Work invocation; implementation has not started.
- 2026-11-03T04:12:08Z - work: Claimed T002@7b39d0e6 for the user-authorized autonomous Work invocation; implementation has not started.
- 2026-11-03T06:53:50Z - work: Closed Epic And Multi-Feature Ship: both live canonical tasks (T001@c4e81f2a, T002@7b39d0e6) are done through autonomous Work in the Ship invocation. T001 passed on its first attempt. T002 passed on its second attempt, after its installed-host chat check failed because the host model passed a backslash idea path to ship-plan; the retry requires the forward-slash form. Independent Tester and Reviewer acceptance covered every attempt, with no Canvas change. The one Rubber Duck retrospective dispatch completed and is recorded in retrospective.md. Nothing is committed; Git delivery awaits the user's decision.
