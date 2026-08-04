---
title: Task-Scoped Skill Resolution
slug: task-scoped-skill-resolution
status: defined
spec_path: .dude/specs/020-task-scoped-skill-resolution/spec.md
---

# Idea: Task-Scoped Skill Resolution

## Idea

A task can route to the right specialist and still miss installed guidance that applies to its outcome. Agent routing answers who owns the task. Task-scoped skill resolution answers which installed knowledge, procedures, and constraints apply while the task is performed and checked. These concerns are separate because a relevant skill may be agentless, sit outside the selected agent's usual scope, arrive through a later import, or be absent from generated task text.

The design hypothesis is a small execution-time lifecycle:

1. Resolve potentially applicable installed skills from the task outcome and acceptance criteria, target artifacts or paths, specification and plan context, project conventions, and selected agent scope.
2. Select only the relevant guidance and carry those skills explicitly into specialist dispatch.
3. Make applicable guidance available to verification and review.

This is not a settled implementation. Definition may describe the obligations or capabilities a task needs without always pinning exact installed skill IDs, then let execution map those needs to the current installation. Exact IDs can still be appropriate when a contract requires them. That split is provisional.

The Feature 017 Ship documentation remains the concrete reproduction. It was written across `README.md`, `docs/setup.md`, `docs/commands.md`, `docs/workflow.md`, `docs/walkthrough.md`, and `docs/reference.md`:

- The clause `remains the advanced form for custom limits, recovery, and policy` appears verbatim in five files.
- `Work stop fires` appears in six files; `exactly one optional target and no flags` appears in four.
- `docs/commands.md` has three consecutive paragraphs opening with `Ship performs no ...` or `Ship never ...`, which is anaphora the tropes skill calls a pattern failure.
- The same tricolon repeats across the doc set, so the pages read as one template rather than six documents.
- New `Illustrative result -- <label>:` headings introduced em dashes where that file's convention was a plain colon.

Those documents pass their static contract tests. The tests pin required content but do not assess prose quality, so templated writing receives a green check. The incident suggests several possible gaps: the writing pack has skills but no agent, documentation work routes to a code specialist, generated task text and dispatch omit the writing skills, applicability is considered at intake rather than per task, and the specialist sees only the context supplied by the coordinator. Content-only tests are another contributor. These remain hypotheses, not a chosen root cause.

The broader failure class can affect human-facing prose and other task outputs. Design guidance, Microsoft branding, accessibility, security, and domain procedures are illustrative cases only; their mention does not claim that a corresponding skill is installed or should activate for every semantic match.

Activation policy remains open. Intrinsic quality guidance may be safe to apply automatically, contextual constraints may depend on artifacts or project conventions, and domain procedures may depend on the task. Opt-in workflows and destructive or authority-bearing procedures must not activate from loose inference.

## Open Questions

1. Where should the boundary sit between automatic intrinsic guidance, conditional contextual constraints, and task-dependent domain procedures?
   Answer: Open. Opt-in, destructive, and authority-bearing procedures require stronger intent than a loose semantic match.
2. Should definition record exact skill IDs or the obligations and capabilities a task needs?
   Answer: Provisionally prefer meaningful obligations and capabilities, with execution mapping them to installed skills. Keep exact IDs when they are contractually required.
3. Which output surfaces belong in scope?
   Answer: Human-facing prose and other task outputs are in scope conceptually. The treatment of prompts, agent and skill authority text, PR and commit content, release content, UI, and similar surfaces remains open.
4. Which failures deserve deterministic checks, and which remain reviewer judgment?
   Answer: Use deterministic checks for measurable failures where practical. Semantic quality remains reviewer judgment; optional style preferences should not become brittle universal lint, and legitimate repeated contract wording must remain possible.
5. What is the smallest dispatch and review handoff that makes selected guidance explicit without creating a second routing system?
   Answer: Open. The candidate lifecycle requires an explicit handoff, but does not assume a registry, tags, a metadata schema, scoring, or persistent resolution state.

## Assumptions

These are the Spec Lead's working assumptions. The user may overturn any of them.

- The two writing skills named by the reproduction, `dude-pack-writing-avoid-ai-tropes` and `dude-pack-writing-style`, are installed and adequate for that job.
- The general gap is task-level applicability and activation, not the quality of any one skill.
- Correcting the Feature 017 documentation is separate work and is not part of this idea.
- Agent selection and skill applicability can remain separate. Closed-roster routing does not change, a skill does not manufacture an agent, and no agent is required for every skill.
- The execution-time lifecycle and obligation-to-installed-skill mapping are design hypotheses, not settled requirements.
- Examples beyond the verified writing incident are illustrative; no installed status is inferred for them.

<!-- dude:managed:start -->
## Normalized Intent

- Start with the verified Feature 017 writing incident and determine which concrete existing step failed before selecting a remedy; the listed causes remain hypotheses.
- Evaluate the smallest existing mechanisms first, including whether current dispatch prompts or agent instructions can make applicable installed guidance available during work and review.
- Keep agent ownership separate from guidance applicability without presuming an obligation vocabulary, runtime mapper, explicit handoff, or new resolution lifecycle.
- Generalize beyond the verified writing incident only when another concrete failure and acceptance test justify the additional output surface or guidance class.
- Keep deterministic checks limited to measurable failures and leave semantic prose quality to reviewer judgment.

## Constraints

- Brainstorm intake only. Do not create or modify a definition package, execution state, tasks, or implementation.
- Do not repair the Feature 017 documentation under this idea.
- Keep agent routing and skill applicability separate. Do not manufacture an agent from a skill, change closed-roster routing, or require an agent for every skill.
- Do not assume every semantic match should activate. Loose inference must not trigger opt-in, destructive, or authority-bearing procedures.
- Do not over-engineer it. Be pragmatic. Prefer simplification over complication.
- Test existing dispatch prompts and agent instructions before proposing an explicit handoff or another mechanism.
- Reject speculative taxonomies, obligation or capability schemas, runtime mappings, resolvers, activation tiers, policy engines, registries, tags, scoring, or persistent state unless a concrete failure and acceptance test require them.
- Do not treat "human-facing prose and other task outputs" as a settled boundary; broader scope must follow evidence rather than semantic possibility.
- Do not manufacture exact skill IDs or claim a root cause that has not been established.
- Limit deterministic enforcement to measurable failures where it helps. Preserve reviewer judgment, optional style choices, and legitimate repeated contract wording.

## Definition Checklist

- [x] Outcome is clear enough for brainstorm
- [x] Scope is coherent as one idea ledger
- [x] The verified writing incident provides the initial evidence
- [x] Root cause, broader scope, and mechanism remain open for later definition

## Coordinator Log

- 2026-08-04 UTC - brainstorm captured
- 2026-08-04 UTC - brainstorm refreshed as Task-Scoped Skill Resolution; preferred file rename deferred because the source path could not be removed safely
- 2026-08-04 UTC - draft identity renamed from `writing-skill-activation` to `task-scoped-skill-resolution`
- 2026-08-04 UTC - brainstorm refreshed around verified evidence, existing mechanisms, and minimal design
- 2026-08-04 UTC - defined as `.dude/specs/020-task-scoped-skill-resolution/spec.md` with spec, plan, and three open tasks; no supporting artifacts applied
- 2026-08-04 UTC - ship: Lightweight Execution started under guarded review; T001@62696e64 claimed `[~]`
- 2026-08-04 UTC - T001 review rejected: coordinator routing pointer omitted `## Applicable Skills`, FR-007 line unpinned, verdict obligation weaker than FR-003; revised by Agent Smith, Skill Smith, and Tester
- 2026-08-04 UTC - T001 dispositioned `src/agents/dude.agent.md` as in scope, so three generated core files change rather than two; T003 diff inspection expects three
- 2026-08-04 UTC - T001@62696e64 closed `[x]` after full suite 2204 passed / 0 failed, lint 0/0, negative checks N1-N4, and independent approval
- 2026-08-04 UTC - carried forward to T003: rehearse that a missing prose judgment never blocks a verdict when the writing pack is absent; `docs/reference.md` routing description deferred beyond this feature
- 2026-08-04 UTC - T002@6368656b claimed `[~]`; repetition report, tests, skill docs, and pack line added
- 2026-08-04 UTC - discovered gap: compose has no refresh path for an installed pack whose source changed, so `remove` refuses on hash mismatch and `add` no-ops; refreshed by restoring recorded source, removing, restoring new source, then adding
- 2026-08-04 UTC - T002 review found reported phrases could merge across block boundaries, violating FR-008 contiguity; fixed with a block-boundary token break plus a pinning test, Feature 017 findings unchanged at 15
- 2026-08-04 UTC - T002 review approved; documented invocation corrected to the installed path and projection refreshed
- 2026-08-04 UTC - T002@6368656b closed `[x]` after 11/11 pack tests, full suite 2226 passed / 0 failed, compose verify 16/16, lint 0/0
- 2026-08-04 UTC - deferred follow-ups: wrapped inline code spans across a line break (false negative, zero measured impact), untested exit-2 path, fence-adjacent block merge, indented code blocks; `tasks.md` line 11 `[P]` rationale is stale because T002 did not touch the contract test
- 2026-08-04 UTC - T003@61637074 claimed `[~]`; added the plan-mandated repetition-tool contract pin that no task had carried
- 2026-08-04 UTC - T003 release lint reports 1 pre-existing `FEATURE_IDEAS_ROOT_MISSING` warning rather than the literal zero; an identical warning from a clean `git archive HEAD` build isolates it as a release-shape property, not a regression
- 2026-08-04 UTC - SC-002 rehearsed: independent review sustained a prose-only rejection of the Feature 017 documentation with no other finding, and judged the navigation footer legitimate without altering the tool or its thresholds
- 2026-08-04 UTC - T003@61637074 closed `[x]` after full suite 2227 passed / 0 failed, lint 0/0, compose verify 16/16, negative checks M1-M5, and independent approval of all eight success criteria
- 2026-08-04 UTC - feature complete; carry-forward: strip wrapped inline spans, reword SC-004 to an observable property, resolve release-shape lint warning, reconcile the plan agent-file write boundary, correct the stale `[P]` rationale, and repair the Feature 017 prose under its own feature
<!-- dude:managed:end -->