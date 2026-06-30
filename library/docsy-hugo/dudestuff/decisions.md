# Dude Decisions

Durable project and process decisions that Dude should preserve.

## Entries

### Lanes And Onboarding

- Brainstorm-first workflow: `brainstorm/<slug>.md` is the file-based intake ledger before definition; feature definition is native under `specs/<feature>/`; `@dude track` is the normal handoff into Beads, and explicit manual import is a fallback.
- First-run default: one small feature through Definition Only. If the user wants implementation and does not explicitly ask for Beads, default to Lightweight Execution instead of requiring a three-way lane choice.
- Onboarding: in a fresh repo with no active `brainstorm/` or `specs/` artifacts, proactively open with the three-question sequence (one feature vs many, implement-now vs define, hard constraints). If the first substantive request already answers them, treat onboarding as satisfied and move on without re-asking.
- Ask humans only the questions that materially change scope, hard constraints, approvals, or routing.

### Lightweight And Tracked Execution

- Lightweight Execution model: when Beads is unavailable or intentionally not used, `specs/<feature>/tasks.md` is the first-class live markdown board. Canonical state lives in the phased task units below the optional Dude-generated board fence; the fenced `## Ready Now / In Progress / Blocked / Done` region is a derived view, not a second source of truth. Supporting checklist files stay advisory.
- Task units: use durable IDs such as `T001@a1b2c3d4`. Four canonical states: `[ ]`, `[~]`, `[!]`, `[x]`. Optional indented `deps:` and `blocked-by:` metadata lines are part of the canonical task unit. A bounded task may cover closely related code, tests, and docs when one fresh verification step proves the whole slice.
- Coordinator-only mutation: in Lightweight Execution only the coordinator mutates task-state glyphs and task metadata, after fresh verification evidence or routed workflow changes; specialists report results back. During Beads-tracked execution only the coordinator calls `bd close`.
- After Beads import: Beads is the single live execution board and source of truth. `tasks.md` may be maintained only as a one-way, non-authoritative Beads mirror for portability and fallback. After Dude closes Beads work, the coordinator mirrors the result to the matching canonical task unit when the durable task key maps cleanly, regenerates any derived board region, records the write-back in the brainstorm Coordinator Log, and runs `dude-lint`. Parallel execution is an internal coordination decision during Beads work, not a user-managed workflow step.
- Optional continuous work: `@dude work` is an execution accelerator, not a new workflow lane. It runs ready tasks in whichever lane is currently live — `bd ready` when Beads is active, otherwise the canonical task units in `specs/<feature>/tasks.md`. It does not require prior Lightweight Execution to start on Beads, and does not require Beads to start on Lightweight. Default cap is `--max 3` iterations; `--until blocked` extends to the soft ceiling of 25. Stops on blockers, failed verification, reviewer rejection, required clarification, two consecutive failed attempts on the same task, ambiguous state, tool error, or the configured iteration limit. Coordinator-only mutation and the active lane's close protocol still apply per iteration. `@dude work` never imports features, never auto-commits, never edits definition artifacts, and never creates a new state file.

### Definition Packages

- Lean by default: create only artifacts that materially apply to the feature; omit placeholder files for non-applicable domains.
- `specs/` numbering is monotonic — use `max existing prefix + 1` and never reuse deleted numbers.
- `status:`, `spec_path:`, and `## Coordinator Log` are Dude-maintained workflow metadata.

### Guardrails

- Project-wide guardrails live in `.github/dudestuff/guardrails.md`. When only bundle defaults exist, `@dude-spec-lead` may infer minimal candidate guardrails from repo and definition context (kept minimal for clearly solo or exploratory repos); the user may `skip` to continue with bundle defaults only. If inference yields no new project-specific guardrails, definition continues without a separate guardrail pause.

### Optional Disciplines

- Optional disciplines (worktrees, TDD) are opt-in and not part of the default workflow. Worktrees may be recommended only for risky/high-churn or truly independent parallel work where isolation has a concrete benefit; if a user declines, do not repeat the suggestion in the same session unless conditions materially change.

### Verbs And Blockage

- Workflow verbs: `draft`, `define`, `track`, `work`, `flag`, `status`, `diff`, and `self-check` are primary. `hire`, `remember`, `remove`, `import`, explicit manual import, and explicit `sync Beads to tasks.md` remain available as coordinator-maintenance verbs. `import` covers single-artifact pulls (one agent or one skill at a time) via the `dude-bundle-import` skill; whole-bundle save/deploy stays in `dude-portability`. `@dude work` is the optional continuous-execution accelerator and is documented under Lightweight And Tracked Execution above; it iterates inside whichever lane is already live and is not a new lane. `@dude status` is read-only across all lanes; Beads details appear only when tracked execution has started.
- Blockage classification: typed prefixes are preferred (`spec-gap`, `plan-gap`, `contract-mismatch`, `test-failure`, `external-dependency`); plain-language blocker reports are accepted when the intended type is clear.

### Identity And Reconciliation

- Canonical feature identity is shared across definition and execution: brainstorm `spec_path` must match the Beads issue description `spec:` prefix (see `dude-spec-import-to-beads` `## Canonical Feature Identity`). If `spec_path` changes after import — or after Lightweight Execution has already recorded checked task history — reconcile by durable task key. If the mapping is ambiguous, pause `@dude track`, report surviving versus changed or ambiguous completions, and ask the user to confirm which checkmarks survive.

### Release

- Tag-driven release versioning is the project standard for both GitHub Actions and Azure Pipelines: derive the package version from the `v*` tag before packaging, and sync `package.json` plus `package-lock.json` back to the default branch (direct push when allowed, PR fallback when branch protection blocks it).