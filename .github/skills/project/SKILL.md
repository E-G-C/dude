---
name: "project"
description: "Project-specific domain knowledge, conventions, and patterns. Update this skill as the project evolves so Dude and specialists can use it as shared context."
---

# Project Knowledge

## Project Shape

- **Domain**: reusable Dude Coder bundle for markdown-based multi-agent feature definition plus optional lightweight or Beads-tracked execution
- **Primary artifacts**: user-facing docs in `README.md`, agent and skill definitions under `.github/`, and bundle memory files
- **Coordinator**: `@dude` owns routing, memory, skills, and team management
- **Current roster**: `@spec-lead`, `@lead`, `@backend`, `@frontend`, `@electron`, `@copilot-sdk`, `@release-manager`, `@tester`, and `@reviewer` alongside the coordinator
- **Default first-run path**: ask whether the user wants to implement now or just define; if they want implementation and do not explicitly ask for Beads, default to Lightweight Execution, otherwise start with Definition Only

## Working Conventions

- The human decides desired outcome, hard constraints, and approvals; Dude owns normalization, routing, metadata bookkeeping, and handoff.
- If the user's first substantive request already answers the three onboarding questions, treat onboarding as satisfied and move directly to the next workflow step.
- `brainstorm/<slug>.md` is the working ledger before definition.
- Refresh `specs/<feature>/` artifacts via `@dude define` instead of hand-maintaining generated state.
- `@dude status` is a read-only orientation command across definition, Lightweight Execution, and Tracked Execution; it must not import or mutate work.
- `status:`, `spec_path:`, and `## Coordinator Log` (legacy name: `## Definition Record`) are Dude-maintained workflow metadata.
- `@dude track` means import or resume tracked execution in Beads; it does not compile the app.
- When Beads is unavailable or intentionally not used, `specs/<feature>/tasks.md` is the first-class markdown execution board.
- Supporting checklist files are advisory during Lightweight Execution; `tasks.md` remains the single live execution board before import, and any Dude-generated board region inside that file is derived guidance rather than a second board.
- In Lightweight Execution, canonical task headers may use `[ ]`, `[~]`, `[!]`, and `[x]`, with optional indented `deps:` and `blocked-by:` metadata lines.
- In Lightweight Execution, only the coordinator mutates task-state glyphs or task metadata after routed workflow changes and fresh verification evidence.
- New or refreshed lightweight task lines should prefer durable task IDs such as `T001@a1b2c3d4`; legacy `T001` lines may still appear during migration.
- One bounded task may combine closely related code, tests, and docs when one fresh verification step proves the slice.
- Once imported, Beads is the only live execution board and `tasks.md` becomes reference-only.
- Typed `@dude flag` prefixes are preferred, but plain-language blocker reports should still be classified when the intended type is clear.
- Guardrail ratification accepts `accept`, `edit`, `reject`, or `skip`; `skip` means continue with bundle defaults only.
- For clearly solo, exploratory, or hobby-style repos, inferred candidate guardrails should stay minimal.
- If guardrail inference yields no new project-specific entries beyond bundle defaults, continue definition without a separate guardrail pause.
- Surface the Windows Dolt server-mode path early whenever tracked execution is being enabled.
- Users may not know when worktrees would help; if a risky/high-churn change or truly independent parallel work would materially reduce risk or checkout contention, Dude may suggest them briefly with the concrete benefit and a simpler fallback instead of waiting for the user to ask.
- Ask the smallest set of questions that materially change scope, constraints, approvals, or routing.

## Domain Knowledge

- This repository's primary deliverable is the reusable Dude Coder bundle itself, so most changes target `.github/` and `README.md` rather than product code.
- `@release-manager` owns reusable guidance for tag-driven release versioning, package manifest write-back policy, and GitHub Actions versus Azure Pipelines release parity.
- First-time users are often unfamiliar with Beads, guardrails, `spec_path`, when `tasks.md` is live, what `[ ]` / `[~]` / `[!]` / `[x]` mean, and why a generated board region may appear there; prefer plain language, short examples, and explicit file ownership.
- Guardrail ratification is a normal pause point in definition, not a failure state.
- A lean definition package is valid; omit placeholder artifacts for domains that do not materially apply.
- If a draft clearly spans several bounded outcomes, split or narrow it before definition instead of letting one brainstorm file become a roadmap.
