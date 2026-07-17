---
applyTo: "**"
description: "Universal Dude authority, safety, and execution rules."
---

# Dude Shared Rules

1. The coordinator exclusively owns execution-lane and tracked state, task glyphs and metadata, generated boards and mirrors, archive/discovered/execution-history state, execution, execution-reconciliation, and close log events, and close. During explicit `brainstorm` or `define`, the Spec Lead is the delegated definition writer for idea/package artifacts, `status:`, exact `spec_path:`, managed definition regions, and definition `## Coordinator Log` events, following `dude-feature-definition`; on re-definition it stages reconciliation and proposed canonical task units but never applies coordinator-owned state. Specialists otherwise do not mutate workflow state.
2. Follow project conventions and applicable skills. Do not invent facts, identities, workflow systems, duplicate boards, or state files.
3. Routing is closed over the actual direct `.github/agents/*.agent.md` roster. Zero or ambiguous matches fail closed; never invent a specialist.
4. Canonical `brainstorm` captures feature intent in `.dude/ideas/<slug>.md`; users own `## Idea`, question answers, and assumptions. The delegated Spec Lead preserves those fields and maintains definition metadata and history only during the explicit definition workflow.
5. Defined-package mutation requires exactly one `status: defined` owner whose exact canonical `spec_path:` matches the package. Any diagnostic, zero owner, or multiple owners stops before writes; never fall back to slug, directory, or name.
6. In Lightweight Execution, canonical task units in `tasks.md` are the sole live board and generated views are derived. After tracked import, Beads is the sole authority and `tasks.md` is only a one-way, non-authoritative mirror. Work is not a lane.
7. `status`, `diff`, and `self-check` are read-only. Only the coordinator mutates lane state, after routed changes or fresh evidence.
8. No completion claim, `[x]`, or `bd close` without fresh verification evidence. Review is independent; rejection follows `dude-reviewer-protocol`.
9. Planning authority controls structure, quality authority controls readiness, and unresolved cross-authority conflict escalates to the user.
10. Current-only rule: a retired Dude workflow, layout, state, or migration request is unsupported. Do not scan, translate, migrate, delete, or mutate retired Dude state; direct the user to external or manual recovery. No retired migration provider exists.
11. Destructive rule: if the required persisted or fresh preview/plan, expected current state, or literal exact confirmation is missing or mismatched, refuse before any write. Never claim an unobserved review or confirmation.
12. New Dude project state uses `.dude/`; project-local agents and skills use `dude-local-`; `.dude/metadata/bundle-manifest.md` is the sole bundle manifest.

Load detailed procedures only when their mode applies: `dude-feature-definition`, `dude-lightweight-execution`, installed tracked execution, `dude-work`, `dude-parallel-dispatch`, `dude-verification-before-completion`, and the review skills.
