---
title: Work Driver In Core
slug: work-driver
status: defined
spec_path: .dude/specs/086-work-driver/spec.md
---

# Idea: Work Driver In Core

## Idea

> remind me about the work driver

> Ship it in core

The user sent these at 2026-10-17T21:26:24Z and 2026-10-17T21:27:29Z. Dude corrected only "reminde" to "remind". The first followed Dude's learning pass, which had proposed making the Work driver durable. Dude's reply explained the driver and offered three options: ship it in core `dude-work`, keep it project-local as a `dude-local` skill, or leave it as is. The second message chose the first option, which Dude had described as the larger change that goes through brainstorm and define.

## Open Questions

The user answered all three at 2026-10-17T22:53:03Z with the literal reply "use your recommendations using YAGNI principles, the simplest implementation thjat would satisfy the requiremetns". Each answer below records the recommendation that reply accepted.

1. What form should the core driver take? Dude recommends one command under `dude-work` with subcommands for the kit's steps (select, claim, run, assess, respond, cancel, diff, ownership) that keeps the proven file bridge, because the coordinator answers each runner challenge in a separate tool call and cannot hold one in-process session open.
   Answer: Dude's recommendation: one command under `dude-work` whose subcommands cover the kit's steps and keep the file bridge, built as simply as the requirements allow.
2. Where should run files live (challenges, responses, baselines, retained evidence)? Dude recommends a directory the caller names, outside the workspace, defaulting to a short folder under the operating system's temporary directory, so nothing lands in the repository and Windows path limits hold.
   Answer: Dude's recommendation: a folder the caller names outside the workspace, defaulting to a short folder under the operating system's temporary directory.
3. Should the kit's cookbook become part of the `dude-work` skill text or a separate reference file in the skill folder? Dude recommends a separate reference file read only when running Work, because the skill text is already about 86 KB and coordinators load it on every Work invocation.
   Answer: Dude's recommendation: a separate reference file in the `dude-work` skill folder, read only when running Work.

## Assumptions

No additional user assumptions supplied.

<!-- dude:managed:start -->
## Intent And Scope

One bounded outcome: the Dude bundle ships a supported driver for autonomous Work, so any coordinator can run Work and Ship through the official runner without rebuilding or borrowing a kit.

- The driver covers what the 085 kit does today: lane detection and next-ready selection; the claim setup order the `dude-work` skill prescribes (fresh inspection, `initial-claim` permit, apply, receipt, controlled end); running `host-adapter-runner.mjs` and passing its challenges; building and preflighting Assessment and specialist-pair responses with the official validators; cancel; changed-path scope checks against the attempt baseline; and ownership-pair checks.
- It calls the official modules and validators and adds no route, state, bypass, or second authority. The runner, adapter, and validators stay unchanged.
- The `dude-work` skill points coordinators to it, so nobody has to learn the protocol from tests or find old session folders.
- Release builds ship it with the rest of the core.
- Build the simplest implementation that satisfies these requirements, as the user directed (YAGNI): carry over the 085 kit's proven behavior and add nothing the success test does not need.

Success test: in a fresh project that installed the release bundle, a coordinator runs `@dude ship <idea>` with only the bundle's own driver and docs, and Work settles a task through the runner with the same receipts and history lines the kit produced.

Out of scope:

- Changing the runner protocol or its validators.
- Automatic Git.
- A maker for learning-review responses. The kit has none, and cancel stays the documented path.
- Deleting the kits already in session folders.

This capture creates no package, tasks, or mock and runs no Work.

## Current Context And Investigation

Coordinator-verified facts from 2026-10-17, not user answers:

1. `host-adapter-runner.mjs` reads one request line and passes each challenge over standard input and output. The skill and `docs/commands.md` describe the setup order for a pending task, but no code in the repository performs it, and `host-adapter.mjs` exports no claim-setup helper.
2. Kits exist only in this computer's Copilot session folders under `~/.copilot/session-state/`. `setup-task.mjs` and `run-task.mjs` drove features 080 through 084 (2026-10-09 to 2026-10-13). The `085-work-kit`, built on 2026-10-15 for 085-dude-canvas-app-theme, has eight scripts plus `lib.mjs` (79,403 bytes of code) and a 33,932-byte `COOKBOOK.md`.
3. 085-retire-backlog-report reused that kit unchanged on 2026-10-17; its task settled on the first attempt with 2 challenges and 13 runtime calls. Finding it first took a long detour through the 873 KB `host-adapter.test.mjs` and a search of session folders. Its location is recorded in `.dude/memory/context.md` as machine-local.
4. The kit imports the official modules from `<root>/.github/skills` and checks every response with `validateAssessment`, `prepareSpecialistResult`, and `validateHostAdapterRequest` before writing it.

## Related References

- `.github/skills/dude-work/SKILL.md`: Host Adapter Runtime Boundary and the setup order for pending tasks.
- `docs/commands.md`: the autonomous Lightweight runner setup.
- `.dude/memory/context.md`: the kit location entry.
- `.dude/ideas/056-ship-orphan-cleanup.md` and `.dude/ideas/060-recoverable-work-handoffs.md`: runner ownership and handoff work.
- `.dude/ideas/085-retire-backlog-report.md`: the latest Ship that used the kit.

These references establish continuity, not execution dependencies or order. Lifecycle numbers record capture chronology only.

## Definition Package

Definition package: `.dude/specs/086-work-driver/spec.md`, with `plan.md` and two proposed open units: `T001@e7c66e22` for the complete driver and its tests, then `T002@ae927870` for the cookbook, coupled guidance contract, and final acceptance. T002 depends on T001. The package contains 28 functional requirements and 10 success criteria.

During the user's explicit `ship work-driver`, the Spec Lead applied the normal first-definition gates and used the Architect's 2026-10-17 recommendation as the plan's basis. The three user answers above remain unchanged. These scope refinements are Ship-authorized definition-owner dispositions, not new user answers or user-ratified guardrails:

- Preserve step coverage with seven subcommands: `claim`, `run`, `assess`, `respond` (including cancellation), `snapshot`, `diff`, and `ownership`. Selection stays with the existing feature and board readers; claim independently rechecks every prerequisite. The accepted recommendation covers the kit's steps rather than requiring a second selector or a separate cancel command. This is the smaller implementation without losing the outcome.
- Limit the driver to the kit's existing autonomous Lightweight boundary, with static imports of the co-versioned official runtime and forwarded Work arguments instead of a hard-coded Ship policy. Keep the file bridge, outside-workspace run files, and separate cookbook the user accepted. Only successful task settlement offers state for same-invocation continuation; cleanup, cancellation, or a hard stop never does. Tracked execution, guarded policy, new resume/takeover, and a learning-review response maker remain out of scope.
- Port only the kit's consumed path. Remove the separate library and templates, duplicate selection, alternate module loading, deleted-workspace probing, placeholder ownership, unrelated-store counts, redundant overrides, and debug/dry-run scaffolding. Use ordinary path checks, official validators, and the required driver-boundary tests rather than speculative defenses or duplicate runtime test matrices. All of the Architect's named minimum negative cases remain because each proves a driver refusal or a required outcome.

Existing project guardrails continue unchanged; no new candidate set or guardrail pause arose. There is no UI and no design gate. The result still depends on an attached live runner and actual specialist dispatches; lost supervision, unavailable retained evidence, and learning review keep their existing stop/cancel rules. The addition is reversible without a state migration, but recorded Work receipts and history remain evidence, and old session kits are not deleted. Publication, authoritative ownership recheck, and lint remain with the coordinator; this staged package is not a readiness claim.
<!-- dude:managed:end -->

## Coordinator Log

- 2026-10-17T21:29:33Z - brainstorm: Captured the user's choice to ship the Work driver in core `dude-work` so any project can run autonomous Work and Ship through the official runner, with coordinator-verified context and three open questions for later definition. Capture only, with no package, tasks, or implementation.
- 2026-10-17T22:53:32Z - brainstorm: Recorded the user's answers to questions 1-3 (Dude's recommendations, built as the simplest implementation that satisfies the requirements) and added that YAGNI direction to Intent And Scope; still draft, with no definition.
- 2026-10-17T23:12:19Z - define: Staged first definition at .dude/specs/086-work-driver/spec.md with spec, plan, and two proposed open units T001@e7c66e22 and T002@ae927870; Ship-authorized definition-owner refinements keep the required kit behavior in one core driver and reuse existing selection readers without changing user answers. Publication and lint remain with the coordinator.
- 2026-10-17T23:32:25Z - work: Claimed T001@e7c66e22 for the user-authorized autonomous Ship invocation; implementation has not started.
- 2026-10-18T01:54:47Z - work: Claimed T002@ae927870 for the user-authorized autonomous Ship invocation; implementation has not started.
- 2026-10-18T04:08:13Z - work: Closed Work Driver In Core: both live canonical tasks are done through autonomous Work in the Ship invocation. T001@e7c66e22 settled on its second attempt: the first was review-rejected for dropped retained captures and a skipped Windows lane test, and the address-review revision passed fresh Tester verification (12 checks, including a mutation check) and a fresh independent Code Reviewer's acceptance. T002@ae927870 settled on its first attempt with fresh Tester verification (15 checks; the full per-file suite showed no new failures against the recorded baseline, and a cookbook-only walkthrough from a release build reached settlement) and independent Code Reviewer acceptance with three non-blocking notes. The core release now ships dude-work/driver.mjs and COOKBOOK.md, and the Work skill points to both. Recorded limits: one reviewer failure class needed a case-only change to lowercase before the validator admitted it, two finer mutants survived the retained-capture regression, and the blanket engine-script exit-code sentence in docs/commands.md does not hold for the driver. The one Rubber Duck retrospective dispatch completed and is recorded in retrospective.md. Nothing is committed; Git delivery awaits the user's decision.
