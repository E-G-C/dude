# Dude Decisions

Durable project and process decisions that Dude should preserve.

## Entries

- `brainstorm/<slug>.md` is the file-based intake ledger before definition.
- Feature definition is handled natively through Dude under `specs/<feature>/`.
- Default first-run path is one small feature through Definition Only before moving into Lightweight Execution or Beads-tracked execution.
- When a user wants implementation now and does not explicitly ask for Beads, default to Lightweight Execution instead of requiring a three-way lane choice first.
- On the first substantive message in a fresh repo with no active `brainstorm/` or `specs/` workflow artifacts, proactively open with the three-question onboarding sequence.
- If the user's first substantive request already supplies feature count, implement-now versus define, and hard constraints, treat onboarding as satisfied and move directly to the next workflow step instead of re-asking.
- `@dude track` is the normal handoff from defined features into Beads, and explicit import prompts are a manual fallback.
- When Beads is unavailable or intentionally not used, `specs/<feature>/tasks.md` is the first-class markdown execution board.
- Supporting checklist files are advisory during Lightweight Execution and import preparation; `tasks.md` remains the only live execution board before Beads import.
- Lightweight task headers should prefer durable task IDs such as `T001@a1b2c3d4`; legacy `T001` lines remain acceptable during migration.
- Lightweight Execution uses four canonical task states: `[ ]` not started, `[~]` in progress, `[!]` blocked, and `[x]` done.
- Optional indented `deps:` and `blocked-by:` metadata lines are part of the canonical task unit when needed.
- A Dude-generated board region may live inside `tasks.md` with `## Ready Now`, `## In Progress`, `## Blocked`, and `## Done` sections as derived guidance. It does not count as a second board or source of truth.
- In Lightweight Execution, only the coordinator mutates task-state glyphs and task metadata after fresh verification evidence or routed workflow changes.
- A single bounded task may cover closely related code, tests, and docs when one fresh verification step proves the slice.
- Tracked execution uses Beads as the single live work board after import.
- After import, `tasks.md` is reference-only and should not be used as the live board.
- Parallel execution is an internal Dude responsibility during Beads work, not a user-managed workflow step.
- Git worktrees are opt-in and not part of the default workflow. Dude may recommend them for risky/high-churn changes or truly independent parallel implementation when isolation has a concrete benefit, but not as a blanket response to parallel dispatch or overlapping file edits.
- If a user declines a worktree suggestion, do not repeat it in the same session unless conditions materially change.
- TDD is opt-in, not a global rule.
- Project-wide guardrails live in `.github/dudestuff/guardrails.md`; if no project-specific guardrails exist yet, `@spec-lead` may infer candidate guardrails from repo and definition context, keep them minimal for clearly solo or exploratory repos, and continue with bundle defaults only when the user says `skip`.
- If guardrail inference yields no new project-specific guardrails beyond bundle defaults, definition continues without a separate guardrail approval pause.
- Definition packages are lean by default: create only artifacts that materially apply to the feature and omit placeholder files for non-applicable domains.
- Feature numbering under `specs/` is monotonic: use `max existing prefix + 1` and do not reuse deleted numbers.
- `status:`, `spec_path:`, and `## Coordinator Log` (legacy name: `## Definition Record`) are Dude-maintained workflow metadata.
- During Beads-tracked execution, only the coordinator calls `bd close`; specialists report results back.
- Typed blockage escalation uses these categories: `spec-gap`, `plan-gap`, `contract-mismatch`, `test-failure`, and `external-dependency`.
- Plain-language blocker reports are accepted when the intended escalation type is clear; typed prefixes remain the preferred shorthand.
- `draft`, `define`, `track`, `flag`, and `status` are the primary workflow verbs, and other supported commands such as `remember`, `remove`, and explicit manual import remain available.
- `@dude status` is a read-only orientation command across definition, Lightweight Execution, and tracked-execution lanes; it includes Beads details only when tracked execution has started.
- Canonical feature identity is shared across definition and execution: brainstorm `spec_path` must match the Beads issue description `spec:` prefix. See `spec-import-to-beads` `## Canonical Feature Identity`.
- If `spec_path` changes after import, or after Lightweight Execution has already recorded checked task history, reconcile before continuing execution or import.
- If checked lightweight history cannot be reconciled one-to-one after a re-define, prefer durable task keys first, then fall back to task ID, story label, and core intent; if that is still ambiguous, pause `@dude track`, report surviving versus changed or ambiguous completions, and ask the user to confirm which checkmarks survive.
- Ask humans only the questions that materially change scope, hard constraints, approvals, or routing.
