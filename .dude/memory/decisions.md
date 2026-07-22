# Dude Decisions

Durable project and process decisions that Dude should preserve.

## Entries

### Lanes And Onboarding

- Brainstorm-first workflow: `@dude brainstorm <idea>` captures one flat `.dude/ideas/<slug>.md` ledger with user-controlled `## Idea`; `@dude define <slug>` promotes it into `.dude/specs/<feature>/`. `@dude draft` is a deprecated compatibility alias that delegates to brainstorm and never selects legacy storage. `@dude track` remains the normal handoff into Beads, with explicit manual import as a fallback.
- First-run default: one small feature through Definition Only. If the user wants implementation and does not explicitly ask for Beads, default to Lightweight Execution instead of requiring a three-way lane choice. Ask humans only the questions that materially change scope, hard constraints, approvals, or routing.
- Onboarding: in a fresh repo with no active `.dude/ideas/` or `.dude/specs/` artifacts, proactively open with the three-question sequence (one feature vs many, implement-now vs define, hard constraints). If the first substantive request already answers them, treat onboarding as satisfied and move on without re-asking.

### Lightweight And Tracked Execution

- Lightweight Execution model: when Beads is unavailable or intentionally not used, `.dude/specs/<feature>/tasks.md` is the first-class live markdown board. Canonical state lives in the phased task units below the optional Dude-generated board fence; the fenced `## Ready Now / In Progress / Blocked / Done` region is a derived view, not a second source of truth. Supporting checklist files stay advisory.
- Task units: use durable IDs such as `T001@a1b2c3d4`. Four canonical states: `[ ]`, `[~]`, `[!]`, `[x]`. Optional indented `deps:` and `blocked-by:` metadata lines are part of the canonical task unit. A bounded task may cover closely related code, tests, and docs when one fresh verification step proves the whole slice.
- Coordinator-only mutation: in Lightweight Execution only the coordinator mutates task-state glyphs and task metadata, after fresh verification evidence or routed workflow changes; specialists report results back. During Beads-tracked execution only the coordinator calls `bd close`.
- After Beads import: Beads is the single live execution board and source of truth. `tasks.md` may be maintained only as a one-way, non-authoritative Beads mirror for portability and fallback. After Dude closes Beads work, the coordinator mirrors the result to the matching canonical task unit when the durable task key maps cleanly, regenerates any derived board region, records the write-back in the uniquely owning idea's Coordinator Log, and runs `dude-lint`. Parallel execution is an internal coordination decision during Beads work, not a user-managed workflow step.
- Optional continuous work: `@dude work` is an execution accelerator, not a new workflow lane. It runs ready tasks in whichever lane is currently live — `bd ready` when Beads is active, otherwise the canonical task units in `.dude/specs/<feature>/tasks.md`. It does not require prior Lightweight Execution to start on Beads, and does not require Beads to start on Lightweight. Default cap is `--max 3` iterations; `--until blocked` extends to the soft ceiling of 25. Stops on blockers, failed verification, reviewer rejection, required clarification, two consecutive failed attempts on the same task, ambiguous state, tool error, or the configured iteration limit. Coordinator-only mutation and the active lane's close protocol still apply per iteration. Ordinary Work never imports features, auto-commits, edits definition artifacts, or creates a new state file. The sole definition exception is explicit guarded recovery of unchanged-intent derived artifacts in an existing Lightweight package through exact ownership, Spec Lead staging, coordinator reconciliation, atomic application, fresh verification, lint, and independent review; tracked definition recovery refuses before writes.

### Definition Packages

- Lean by default: create only artifacts that materially apply to the feature; omit placeholder files for non-applicable domains.
- `.dude/specs/` numbering is monotonic — use `max existing prefix + 1` and never reuse deleted numbers.
- `status:`, `spec_path:`, and `## Coordinator Log` are Dude-maintained workflow metadata.

### Guardrails

- Project-wide guardrails live in `.dude/memory/guardrails.md`. When only bundle defaults exist, `@dude-spec-lead` may infer minimal candidate guardrails from repo and definition context (kept minimal for clearly solo or exploratory repos); the user may `skip` to continue with bundle defaults only. If inference yields no new project-specific guardrails, definition continues without a separate guardrail pause.

### Optional Disciplines

- Optional disciplines (worktrees, TDD) are opt-in and not part of the default workflow. Worktrees may be recommended only for risky/high-churn or truly independent parallel work where isolation has a concrete benefit; if a user declines, do not repeat the suggestion in the same session unless conditions materially change.

### Verbs And Blockage

- Workflow verbs: `brainstorm`, `define`, `track`, `work`, `flag`, `status`, `diff`, and `self-check` are primary. `draft` remains only as a deprecated compatibility alias for `brainstorm`. `hire`, `remember`, `remove`, `import`, explicit manual import, and explicit `sync Beads to tasks.md` remain available as coordinator-maintenance verbs. `import` covers single-artifact pulls (one agent or one skill at a time) via the `dude-bundle-import` skill; whole-bundle save/deploy stays in `dude-portability`. `@dude work` is the optional continuous-execution accelerator and is documented under Lightweight And Tracked Execution above; it iterates inside whichever lane is already live and is not a new lane. `@dude status` is read-only across all lanes; Beads details appear only when tracked execution has started.
- Blockage classification: typed prefixes are preferred (`spec-gap`, `plan-gap`, `contract-mismatch`, `test-failure`, `external-dependency`); plain-language blocker reports are accepted when the intended type is clear.

### Identity And Reconciliation

- Canonical feature identity is shared across definition and execution: the uniquely owning idea's exact `spec_path` must match the Beads issue description `spec:` prefix (see `dude-pack-beads-spec-import` `## Canonical Feature Identity`). If `spec_path` changes after import — or after Lightweight Execution has already recorded checked task history — reconcile by durable task key. If the mapping is ambiguous, pause `@dude track`, report surviving versus changed or ambiguous completions, and ask the user to confirm which checkmarks survive.

### Architecture And Packs

- Generic-core refactor: the coordinator core is domain-agnostic. Software specialists (coder, tester, architect, code-reviewer) live in the **coding pack**; bundle-authoring smiths (agent/skill/instruction/prompt/pack) live in the **authoring pack**. Core agents are `dude`, `dude-spec-lead`, and `dude-reviewer`; the old `dude-lead` and `dude-tester` core agents were removed (any lingering `dude-lead` / `dude-tester` `@`-handle in shipped core fails `dude-lint`). Vocabulary A stands: keep the `spec.md` / `plan.md` / `tasks.md` names and defer artifact genericization — domain artifacts (data-model, contracts, schemas, quickstart, test/security checklists) stay optional per "Lean by default" above.
- Pack catalog fetch policy: releases do not vendor `library/`, so both `compose add` and `compose list` fall back to fetching the catalog from the bundle manifest's `source_repo` / `source_ref` (or `--source` / `--ref`) when no local `library/` exists. `source_ref: main` is deliberate — packs track the latest catalog, not the built release sha. `--no-fetch` forces local-only.

### Release

- Tag-driven release versioning is the project standard for both GitHub Actions and Azure Pipelines: derive the package version from the `v*` tag before packaging, and sync `package.json` plus `package-lock.json` back to the default branch (direct push when allowed, PR fallback when branch protection blocks it).

### Current-Only Supersessions
- Current-only workflow: `@dude brainstorm <idea>` is the sole intake command and `@dude define <slug>` promotes its canonical ledger; supported lifecycle verbs are `brainstorm`, `define`, `track`, `work`, `flag`, `status`, `diff`, and `self-check`, with no active compatibility aliases; project state uses only canonical `.dude/` surfaces, and unsupported older Dude layouts require external/manual recovery rather than an in-bundle migration or reconciliation path.
