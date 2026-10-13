---
title: Dude Canvas One-Step Pack Actions
slug: one-step-pack-actions
status: defined
spec_path: .dude/specs/083-one-step-pack-actions/spec.md
---

# Idea: Dude Canvas One-Step Pack Actions

## Idea

> currently installing a pack is a two step process , check available packs, select install from the right , then leaving the pack management and confirming the installation later in Dude needs you. The process is slow with hoops, implying change of context for the user. This needs to be simplified and improved,
>
> It should be , the user clicks install, the new popup should display some information if any and present the confirmation.
>
> the install process should be as deterministic ( code based) as much as possible rather than delegating the processing on the agent/llm.
>
> do a review and critique rubber duck analysis yourself, think in best practices for user experience ,

The user sent this message at 2026-10-12T15:52:31Z; Dude corrected only clear spelling and transcription slips, doubled spaces, and a doubled comma. The user attached two screenshots, described under Current Context And Investigation. After Dude's analysis, the user confirmed capture with "yes Dude capture it as a brainstorm" and asked: "include the analysis you made as well". The analysis is recorded under Dude's Analysis.

## Open Questions

For later definition; no answer is needed to capture this intention.

1. When a pack comes from a source the project added (a third-party source), should the dialog require an extra trust step, such as a "trust this source" checkbox, or are the third-party warning and one Install click enough?
   Answer: what will the checkbox means? Permanent trust? or warning because a thitrd party
   In chat at 2026-10-12T16:18:45Z, the user declined an extra trust checkbox: the install dialog is the confirmation, and for a third-party pack it shows a warning naming the source. Literal reply: "I read the question, It sounds good at first, but then I wonder,  what will the checkbox means? Permanent trust? or  serve as warning because a thitrd party? we'll always have to confirm before installing a package if it's kind of a warning say in disclosure you're confirming you are adding a third-party pack from whoever blah that's okay but you are already in a confirmation step so if you added the source if you click install and then you are asking for confirmation i don't think i don't see the need to add another thing in there because you already have gone through like many steps three or four steps to get there so the user intention is to install it. so my answer would be no, do not add a checkbosx I'm open to hear the reasoning behind that"

## Assumptions

No additional user assumptions supplied.

<!-- dude:managed:start -->
## Intent And Scope

One bounded outcome: Install, Remove, and Refresh in Settings > Packs each run from one in-place dialog. The dialog shows a deterministic preview and one confirmation, and code (Compose) does the work, with no agent turn and no Needs you step. For a pack from a source the project added, the dialog also shows a prominent third-party warning naming the source and its exact commit; Install is the only confirmation, with no checkbox or stored trust (the user's answer to question 1).

Success test: from Available, click Install on a pack, review the preview in the dialog, confirm once, and see the pack in Installed without leaving the dialog or involving the agent. Remove and Refresh work the same way from Installed.

Out of scope:

- Add/import, which keeps its Needs you path. If the user wants the same change there, capture a separate idea later.
- Changes to what Compose installs.
- Chat `@dude add pack`, which keeps its flow and may reuse the new deterministic preview.

For these three pack actions, this idea changes the choice the user accepted in 063: option 1, pack management "through existing confirmation flows".

This capture creates no package, tasks, or mock and authorizes no pack operation.

## Definition Package

Definition package: `.dude/specs/083-one-step-pack-actions/spec.md`, with a lean `plan.md` and a header-only `tasks.md`. Design is `exploring`: the canonical mock at `.dude/specs/083-one-step-pack-actions/design/pack-actions.html` is not yet created, and the user's explicit approval of it is pending. Product implementation and task derivation wait for that approval.

The package follows the user's answer to question 1, with no checkbox and no stored trust, and the Architect's recommendation of 2026-10-12, which also declares the mock's capability envelope.

During the user's explicit `ship one-step-pack-actions`, the Spec Lead applied four Ship-authorized definition-owner dispositions. They are not user answers, and the user confirms or changes them only through the mandatory mock approval.

- Preview content: the dialog lists each item a pack adds by name and kind (Agent, Skill, Prompt, or Instructions), without descriptions. Basis: Details (080) already shows the pack's documents, and the user asked for "some information if any".
- Required tools: a missing required tool blocks Install, as the current pack request flow does. Basis: this keeps today's rule, which the user did not ask to change.
- No Canvas lint: Canvas runs no lint after applying. Compose's own checks gate the change, and the chat flows keep their lint. Basis: the keep-it-simple guardrail; no concrete failure is known that Compose's checks miss and a Canvas lint run would fix, and Remove undoes an install.
- Old path deleted: the pack half of Needs you, the `/api/packs/request` route, its request dialog with 11 phases, and Compose `--envelope` are deleted. Add/import and the `permission` class stay for their remaining callers. Basis: no production caller remains once the dialog ships, and keeping both paths would double the maintenance.

## Dude's Analysis

The user asked for this review, critique, and rubber duck analysis in the quoted message, then asked at capture to include it. The findings and recommendations below are Dude's, restated from the chat reply in neutral voice; they are not user answers or accepted requirements.

Dude agreed with the user's assessment. Compose installs a pack in about 130 ms, but the install currently travels through Dude and the Needs you tab, with four confirmations across two tabs. Dude recommended putting the install in one dialog with one confirmation and having code run the whole thing.

### What the technical-docs install cost

- The user's click reached Dude at 15:43:41 UTC. Dude spent until 15:46:04 building the preview, before the user had anything to confirm.
- Compose wrote the files at 15:49:33, almost six minutes after the click. The write itself took about 130 ms.
- Dude made 15 tool calls. The user confirmed four times across two tabs: Install, the typed phrase, the checkbox, and Send permission.

### UX critique

- The confirmation is in a different tab. The user starts in Packs, finds the request in Needs you, then comes back. Confirmation belongs where the action started.
- The ceremony outweighs the risk. An install only adds files, stays local, commits nothing, and Remove undoes it exactly. A typed phrase suits irreversible actions like deleting a repository. Requiring it for routine actions teaches people to click through warnings.
- The dialog uses internal terms: receipts, "owner reconciliation", "a permission response is not an applied result", and revision hashes. The user needs to know what they get, what could block it, and what changed.
- "Waiting for owner result" sat there for minutes, and Install stayed disabled the whole time.
- Defer and Save as idea do not make sense for an install.
- What the user sees depends on the agent. Dude wrote the wall of paths and hashes in the user's second screenshot. Another run could word it differently or get it wrong.

### Determinism critique

- Compose already makes every install decision in code: it finds the source, lists the files, applies the pack naming rules, checks conflicts, rechecks the profile before writing, and rolls back on failure. Dude's checks repeated those rules and added no judgment of their own.
- The step that matters is the user's informed consent, and code can tie it to exactly what the user saw. The Canvas server would issue a single-use token with the preview and refuse the install if the profile, source, or target files changed since.
- Canvas already writes pack sources directly after validation (from feature 073). The server's localhost and same-origin checks guard that path.

### Proposed flow

1. The user clicks Install. The dialog opens right away, and the Canvas server builds the preview with Compose. No agent is involved.
2. The dialog shows: what the user gets (agents, skills, and prompts by name); required tools and conflicts, either of which disables Install with the reason; the source, with a third-party warning and the exact commit for packs from a source the project added; and a note that new agents load in a new session. File paths stay hidden until the user opens Show files, and no hashes appear.
3. The only buttons are Install and Cancel. Progress shows in the dialog, then the result: the pack moves to Installed, or a plain error says whether anything changed.
4. Remove and Refresh use the same dialog. Remove lists the files it will delete. Refresh shows what it will replace, add, and remove, and warns that it overwrites local edits.

`@dude add pack` in chat keeps working and can reuse the same preview.

### Risks to resolve in definition

- Packs from a source the project added bring agents and instructions that steer the AI. Keep the third-party warning prominent there. If any case deserves a stronger confirmation, it is this one.
- An agent may be working at the same time. Compose rechecks the profile before writing, and pack file names cannot collide with other files, so the install will not silently overwrite the agent's work.
- A GitHub pack can take up to 120 seconds to fetch. Compose must run in a separate process with progress and Cancel, and the install must use the exact commit the preview showed.
- The user loses the consent record that Needs you kept. The profile and Git history already show what was installed and from where, which Dude considers enough.
- Once all three actions use the dialog, delete the old Needs you path: its request handling, the agent handoff in the Compose skill, the dialog's 11 request states, and their tests. Keeping both paths would double the maintenance.
- Compose needs a dry-run option for install and remove; refresh already has one.

## Current Context And Investigation

Coordinator-verified facts, not user answers:

1. Timeline of the 2026-10-12 technical-docs install:
   - The Canvas handoff reached the agent at 15:43:41Z.
   - The agent finished the preview at 15:46:04Z.
   - Compose `add` started at 15:49:32.862Z, and its envelope was written at 15:49:32.993Z, about 130 ms including process start. The profile was written at 15:49:32.982Z.
   - The agent made 15 tool calls.
   - The user acted four times across Packs and Needs you.
2. Current machinery:
   - The Settings pack request dialog shows 11 request phases: prepared, admitted, delivered, waiting_permission, waiting_owner, and six outcomes.
   - The closed `POST /api/packs/request` route in `src/extensions/dude/lib/canvas-server.mjs` takes prepare and submit bodies.
   - `src/extensions/dude/lib/needs-you.mjs` (2,627 lines) holds the pack-request plumbing, sends the "Dude Canvas explicit pack request" handoff to the agent session, and receives the `pack_result` acknowledgment.
   - `.github/skills/dude-compose/SKILL.md` has the `## Canvas Pack Requests And Results` section.
3. Compose:
   - `add`, `remove`, and `refresh` support `--envelope`.
   - `refresh --dry-run` exists, but `add` and `remove` have no dry-run.
   - `resolvePackDir` and `packArtifacts` are exported.
   - Compose rechecks the profile bytes before writing and rolls back a caught failure.
   - A selected GitHub pack fetch is bounded at 120 seconds.
4. Precedent: 073 writes `.dude/metadata/pack-sources.md` directly from Canvas after validation, without Needs you. The server's `isTrustedRequest` guard (loopback Host, Sec-Fetch-Site, and Origin) applies to requests.
5. The user's two screenshots:
   - Screenshot 1 shows Settings > Packs > Available with technical-docs selected. Install is disabled with the message "Another pack request needs owner reconciliation. Nothing will be resent." The "Workspace pack request" dialog shows "Waiting for owner result", a receipt ID, and protocol wording. Arrows mark the disconnect between the dialog and the details pane.
   - Screenshot 2 shows the Needs you permission card: a long monospace target list with revision hashes, the required literal confirmation "INSTALL PACK technical-docs", a text box, the checkbox "I grant permission for this operation on these exact targets", and the buttons Send permission, Decline, Defer, and Save as idea, with an arrow at Send permission.

## Related References

- `.dude/ideas/063-dude-canvas-settings.md`: its accepted choice of confirmation flows for pack actions is the one this idea changes.
- `.dude/ideas/073-dude-canvas-artifact-import.md`: Add/import (excluded here) and pack sources (the direct-write precedent).
- `.dude/ideas/080-dude-canvas-pack-documentation.md`: its Details section and reader dialog share the same details pane as these pack actions.
- `.dude/ideas/082-targeted-pack-acquisition.md`: the GitHub fetch bounds.

These references establish continuity, not execution order. Lifecycle numbers record capture chronology only.
<!-- dude:managed:end -->

## Coordinator Log

- 2026-10-12T16:08:21Z - brainstorm: Captured the user's request to turn Canvas pack install, remove, and refresh into one-step in-place dialogs that Compose runs deterministically, with Dude's analysis included at the user's request; capture only, with no definition, mock, approval, or implementation.
- 2026-10-12T16:27:39Z - brainstorm: Recorded the user's answer to question 1 (no extra trust checkbox; the dialog's third-party warning and one Install confirmation suffice) and reflected it in Intent And Scope; still draft, with no definition.
- 2026-10-12T17:24:15Z - define: Staged first definition at .dude/specs/083-one-step-pack-actions/spec.md with spec, plan, and header-only tasks; design is exploring, canonical mock creation and explicit user visual approval remain pending. No product implementation or task-state change.
- 2026-10-12T17:24:36Z - route: Assigned the canonical mock at .dude/specs/083-one-step-pack-actions/design/pack-actions.html to FluentUI, starting from 080's approved pack-documentation.html and staying inside the Architect's declared capability envelope; design remains exploring and needs the user's explicit approval before implementation.
- 2026-10-12T18:35:12Z - define: Settled the initial pack action design to proposed at .dude/specs/083-one-step-pack-actions/design/pack-actions.html; the artifact hash and proposal evidence are bound in the spec Revision Log, FR-019 gained a heading naming the failed action, FR-002 now names Remove's loading line, and Scope's example packs were corrected to match the mock. The user's explicit visual approval remains pending. No product implementation, plan or task changes, or task derivation.
- 2026-10-12T19:05:34Z - define: Staged approval of the round-1 pack action design from the user's explicit chat reply "approved" at 2026-10-12T18:48:22Z, bound to .dude/specs/083-one-step-pack-actions/design/pack-actions.html at SHA256 `74eb80edf17166d13700f09bf02fef781b1434db9d493d5ea44e58e4037a6f2e`, which the coordinator re-hashed after the reply and found unchanged. The approval confirms the four Ship dispositions: item names and kinds in the preview, a missing required tool blocking Install, no Canvas lint after applying, and deletion of the old pack request path. Derived three new sequential implementation units, T001@4e7b0c92, T002@9a1f6d35 (deps: T001@4e7b0c92), and T003@c38e5b17 (deps: T002@9a1f6d35), with no inherited completion evidence. No execution or task completion is claimed.
- 2026-10-12T19:05:34Z - execution-reconciliation: Applied the checked approval stage and three new serial open task units, T001@4e7b0c92, T002@9a1f6d35 (deps: T001@4e7b0c92), and T003@c38e5b17 (deps: T002@9a1f6d35), with no inherited state; kept 0, changed 0, dropped 0, new 3. Preserved user sections and append-only history, retained the approved mock bytes at SHA256 74eb80edf17166d13700f09bf02fef781b1434db9d493d5ea44e58e4037a6f2e, and observed zero lint failures inside the rollback boundary. Definition is ready for the existing Ship execution path; no implementation has started.
- 2026-10-12T19:05:51Z - work: Claimed T001@4e7b0c92 for the user-authorized autonomous Ship invocation; implementation has not started.
- 2026-10-12T20:21:00Z - work: Stopped the autonomous Ship Work invocation by cancelling T001@4e7b0c92's pending specialist-pair exchange before verification. Classified as plan-gap: T001 adds refresh's mutation field to Compose add and remove failures, as the plan requires, but the old Canvas pack-request validator in src/extensions/dude/lib/needs-you.mjs accepts mutation only for refresh, so the canvas-server test "T003 actual caught Compose failures preserve none, restored and uncertain owner outcomes" fails for install restored and remove restored (reproduced; 0 failures at HEAD). T001's writer paths exclude needs-you.mjs, and T003 deletes that path later. T001 stays [~] with the implementation in the worktree; resuming needs an explicit define.
- 2026-10-12T20:43:45Z - define: Re-defined T001@4e7b0c92 in plan.md and tasks.md for the plan gap, after the user's reply "define". T001's writer paths add src/extensions/dude/lib/needs-you.mjs and its .github projection, only so the old packResult validator accepts mutation on install and remove failures until T003 deletes that path, and its acceptance adds canvas-server.test.mjs and needs-you.test.mjs, which must stay green unchanged. The spec and intent are unchanged, as are T002@9a1f6d35 and T003@c38e5b17.
- 2026-10-12T20:43:45Z - execution-reconciliation: Re-definition kept T002@9a1f6d35 [ ] and T003@c38e5b17 [ ], and changed T001@4e7b0c92 one-to-one with [~] preserved, adding src/extensions/dude/lib/needs-you.mjs and its .github projection (the old packResult validator accepts mutation on install and remove failures until T003 deletes it) and the canvas-server and needs-you suites to its acceptance after the user's define; dropped 0, new 0, archived 0. The spec is byte-unchanged.
- 2026-10-12T22:01:02Z - work: Claimed T002@9a1f6d35 for the user-authorized autonomous Ship invocation; implementation has not started.
- 2026-10-12T23:56:18Z - work: Claimed T003@c38e5b17 for the user-authorized autonomous Ship invocation; implementation has not started.
- 2026-10-13T09:58:03Z - work: Closed Dude Canvas One-Step Pack Actions: all three live canonical tasks (T001@4e7b0c92, T002@9a1f6d35, T003@c38e5b17) are done through autonomous Work in the Ship invocation. T001's first invocation stopped on a plan gap and resumed after the user's "define" re-definition, and T002 passed on its first attempt. T003 took four attempts: the retries fixed focus after Remove, stale pack-request docs, and three spacing gaps against the approved mock (design close: matches approved spec). An independent Tester and Reviewer checked every attempt, and both accepted the last. The one Rubber Duck retrospective dispatch completed and is recorded in retrospective.md. Nothing is committed; Git delivery awaits the user's decision.
