---
applyTo: "**"
description: "Dude Coder bundle — coordinator, definition, and execution rules. Loaded alongside any existing workspace instructions."
---

# Copilot Instructions — Dude Coder

This workspace uses the Dude model under `.github/` with native feature definition and execution from `specs/<feature>/tasks.md`. Tracked execution via Beads is available through the optional **beads pack**.

These instructions live at `.github/instructions/dude.instructions.md` so they coexist with any existing `.github/copilot-instructions.md` your repo already ships. Both files are loaded together by Copilot.

The coordinator (`@dude`) is defined in `.github/agents/dude.agent.md` and owns
all routing, memory, skill, and team-management logic. These workspace-level
instructions provide only the shared rules that apply to **every** agent.

## Core Rules

1. Use the coordinator for routing, memory, and team management; specialists own domain work.
2. Prefer existing project conventions over built-in bundle defaults.
3. Do not assume a specific issue tracker, specification system, or backlog model unless the project explicitly documents one.
4. Do not create duplicate planning, tracking, or state files unless the user asks for them.
5. The coordinator may directly edit coordinator-maintenance artifacts under `.github/`; project work should be routed to specialists by default.
6. For engine updates (refreshing default agents, default skills, or bundle instructions from upstream), route to `dude-bundle-upgrade`. Do not hand-edit base-owned files in response to upgrade requests; the upgrade skill preserves project memory, repository docs, root files, and active work automatically.
7. Project-local agents and skills use the reserved `dude-local-` namespace: `.github/agents/dude-local-<slug>.agent.md` and `.github/skills/dude-local-<slug>/`. Upstream/base Dude artifacts must never claim `dude-local-` names or include them in the bundle manifest.

## Brainstorm + Feature Definition + Execution

1. Dude accepts early feature input in `brainstorm/<slug>.md` and defines it into `specs/<feature>/`.
2. The `@dude-spec-lead` specialist owns the intake and feature-definition lifecycle.
3. `brainstorm/<slug>.md` is the only pre-spec intake ledger. Keep `status: draft|defined` and `spec_path:` there instead of creating extra state files.
4. Users edit brainstorm content in place, but workflow metadata such as `status:`, `spec_path:`, and `## Coordinator Log` remain Dude-maintained.
5. Project-level guardrails in `.github/dudestuff/guardrails.md` provide durable planning and execution constraints.
6. If only bundle defaults exist, users may `accept`, `edit`, `reject`, or `skip` inferred project guardrails. `skip` means continue with bundle defaults only. If no new project-specific guardrails are inferred, definition may continue without a separate guardrail pause.
7. `spec.md` must be technology-agnostic. Maximum 3 `[NEEDS CLARIFICATION]` markers, prioritized: scope > security > UX > technical.
8. `spec.md` must pass a quality gate (all sections complete, requirements testable, no impl details) before `plan.md` is written.
9. During intake and feature definition, `@dude-spec-lead` is the planning authority for `brainstorm/<slug>.md` and `specs/<feature>/` artifacts; during implementation, `@dude-lead` owns implementation architecture unless the user overrides it.
10. Definition packages do not go to `@dude-tester` by default. Use `@dude-lead` for architecture sanity and `@dude-reviewer` for optional independent readiness judgment.
11. `@dude track` is the normal handoff into Beads. It may import defined brainstorms automatically. Explicit `@dude import tasks from specs/<feature>/ into Beads` is a manual fallback.

Execution is optional after definition. The core execution lane is **Lightweight Execution** from `specs/<feature>/tasks.md`: when the user wants implementation, default to it and do not ask them to choose a lane. Tracked execution via Beads is provided by the optional **beads pack** (the `dude-beads-workflow` and `dude-spec-import-to-beads` skills); it activates only when that pack is installed and the user opts in with `@dude track`. Rules 12-17 are lane-agnostic.

12. `@dude status` is read-only. It may report current workflow state across definition and execution, including defined features waiting for execution, but it must not import or mutate work state.
13. Specialists follow `.github/skills/dude-lightweight-execution/SKILL.md` for selecting and executing tasks. When the beads pack is installed and tracked execution is active, the pack's tracked-execution skill governs claiming and execution instead.
14. Only the coordinator mutates canonical task state, and only after fresh verification evidence or routed workflow changes, preserving the durable task key, optional dependency metadata, and the rest of the task unit.
15. Supporting checklist files remain reference context; `specs/<feature>/tasks.md` is the single live execution board, and any Dude-generated board region inside that file is derived guidance rather than a second board.
16. When multiple ready tasks are truly independent, Dude may dispatch them in parallel as an internal coordination decision.
17. `@dude work` is the optional continuous-execution accelerator. It runs ready tasks back-to-back inside the active lane, defaults to `--max 3` iterations, and is not a new lane. It never auto-commits, never edits definition artifacts, never bypasses the close protocol for the active lane, and stops on the first natural boundary (no ready task, blocker, failed verification, reviewer rejection, required clarification, two consecutive failed attempts on the same task, ambiguous state, tool error, or `--max` reached).

Tracked-execution specifics — Beads as the source of truth after import, the one-way `tasks.md` mirror, and discovered-work issue creation — live in `dude-beads-workflow` and apply only when the beads pack is installed.

## Skill Awareness

All agents — coordinator and specialists — should check for relevant skills
before starting work:

1. Check `.github/skills/project/SKILL.md` for project conventions.
2. Scan `.github/skills/` for any skill whose description matches the task.
3. Load matching skills and follow their guidance.
4. Treat `dude-using-git-worktrees` as opt-in by default. If isolation would materially reduce risk or working-tree contention for a risky change or truly independent parallel work, you may suggest a worktree with a brief explanation of the benefit, the extra branch/directory/merge cost, and a simpler fallback, but ask before setting it up. Do not suggest it just because work is parallel.

## Operational Discipline

1. For bugs, failing tests, and unexpected behavior, use `dude-systematic-debugging` before proposing or implementing fixes.
2. Before claiming work is complete, fixed, passing, or ready, use `dude-verification-before-completion` and rely on fresh evidence.
3. When receiving review feedback or rejection findings, use `dude-receiving-code-review` before implementing or disputing the requested changes.
4. `dude-test-driven-development` is available as an optional implementation aid when the user explicitly wants tests-first work, when project conventions require it, or when a bugfix benefits from a regression-first workflow.

## Conflict Resolution

When specialists disagree on a design or implementation choice:

1. The current planning authority has final say on structure and design questions.
2. The current quality authority has final say on acceptance and readiness.
3. If the disagreement crosses both domains or authority is unassigned, escalate to the user.

## Change Closure

- For feature-definition artifacts under `specs/<feature>/`, default to `@dude-spec-lead` -> optional `@dude-lead` architecture sanity -> optional `@dude-reviewer` readiness judgment.
- For implementation and other executable artifacts, default to implementation -> verification (usually `@dude-tester`, if present) -> optional independent review -> coordinator close unless the user explicitly asks for lighter handling.
- For direct answers, roster updates, memory updates, and other coordinator-maintenance work, avoid forcing the full delivery pipeline.
- Any completion claim must be backed by fresh verification evidence before `@dude` marks an execution task `[x]` (or closes tracked-execution work when the beads pack is installed).

## Project Stance

- Respect existing project conventions.
- Ask only the smallest set of clarification questions that materially change scope, hard constraints, approvals, or routing.
- Avoid introducing process overhead for simple tasks.
- Prefer the Definition Only lane for a user's first real feature unless the user explicitly wants implementation now. If they want implementation, default to Lightweight Execution from `specs/<feature>/tasks.md`.
- Keep new agents narrow and useful instead of creating overlapping roles.
- Keep new skills reusable and scoped to recurring patterns, not one-off tasks.
- Keep memory entries concise, durable, and worth reusing.
- Routing and authority adapt to the current roster; there are no permanent defaults.
