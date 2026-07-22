---
name: "dude-lightweight-execution"
description: "Use to select, mutate, close, and report execution directly from a defined feature's tasks.md while Beads is not active."
---

# Lightweight Execution

Use this lane when a defined feature is executing without an active tracked import.

## Authority And Ownership

`tasks.md` is the sole live execution board in Lightweight Execution. Canonical state is in its phased task units. A generated board view is derived, not canonical or another live source of truth; supporting artifacts and checklists are reference context.

After Beads import, Beads is the sole authority and live board. `tasks.md` becomes only a one-way, non-authoritative mirror; stop this lane and load the tracked workflow.

Before selection or mutation, require exactly one `status: defined` owner by exact `spec_path:` to the sibling package spec. Any resolver diagnostic, no owner, or multiple owners stops before mutation. Never infer or fall back from slug, directory, or name. Read-only diagnosis may continue. The unique owner supplies the append-only `## Coordinator Log` and exact task audit breadcrumb.

## Canonical Tasks And Board

Task states are:

- `- [ ]` not started
- `- [~]` in progress
- `- [!]` blocked
- `- [x]` done

Task headers retain durable keys such as `T001@a1b2c3d4`, labels, descriptions, optional `deps:`, and optional `blocked-by:` metadata. Only the coordinator mutates glyphs or metadata. Specialists report claims, results, and blockers.

The deterministic board helper parses, selects, renders, mutates, and detects manual completion:

```bash
node .github/skills/dude-lightweight-execution/board.mjs next   .dude/specs/<feature>/tasks.md
node .github/skills/dude-lightweight-execution/board.mjs ready  .dude/specs/<feature>/tasks.md --json
node .github/skills/dude-lightweight-execution/board.mjs render .dude/specs/<feature>/tasks.md --write
node .github/skills/dude-lightweight-execution/board.mjs set    .dude/specs/<feature>/tasks.md T0NN@sha8 done --write
node .github/skills/dude-lightweight-execution/board.mjs diff   .dude/specs/<feature>/tasks.md
```

`render` and `set` print unless `--write` is present. Only the coordinator runs mutating commands. Every coordinator state change, render, reconciliation, accepted manual completion, and close outcome appends one UTC log event.

The coordinator-state snapshot at `.dude/state/task-state.json` is optional: its absence is valid and simply means no baseline yet. Unreadable, malformed, wrong-schema, or symlinked corruption fails closed before any mutation — a corrupt snapshot blocks the write so `tasks.md` and the snapshot both stay byte-unchanged. A validated `--write` preserves every unrelated feature's entries.

## Select And Route

After ownership passes, read applicable spec, plan, and supporting artifacts. Stop if tasks are absent, malformed, or empty. Resume a clear `[~]` task first; otherwise select an eligible `[ ]` task, preferring a consistent generated Ready view, then respecting `[!]`, durable `deps:`, phase order, and `[P]` candidate work. `[P]` alone never authorizes fan-out; use `dude-parallel-dispatch` for that proof. Route through `dude-generic-routing`. Use `dude-work` only for continuous iteration.

During continuous work, `dude-work` (`## Inspection And Recovery`) owns inspection and recovery policy. This skill retains Lightweight selection, claim and block mutation, close gates, history, rendering, and lint for each authorized action.

On claim, only the coordinator sets `[~]`. On a routed blocker, only the coordinator sets `[!]` and maintains `blocked-by:`. Resolved blockers return to `[ ]` or `[~]`. Scope changes return to the owning idea and explicit `define`; never invent task lines or a second ledger.

## Manual `[x]` Drift

Read-only status may compare a human-applied `[x]` with the coordinator snapshot and report what would revert, but it never writes. On the next mutating pass, an unverified `[x]` is coordinator-downgraded to `[~]`, rendered, snapshotted, and logged unless the user supplied `accept T0NN` with evidence or attestation. Accepted manual completion remains `[x]` and is logged. Do not silently accept or repeatedly downgrade an accepted task.

## Lightweight Close Protocol

For a completion claim:

1. Re-resolve the exact unique owner; stop on every diagnostic or ambiguity.
2. Collect the implementation result and fresh verification from a matching verification specialist when available.
3. Obtain independent readiness judgment when required or requested.
4. Load `dude-verification-before-completion`. Fresh evidence must exist before `[x]`.
5. Only the coordinator runs `board.mjs set ... done --write`, regenerates the derived view, appends state/render/close events, and runs `dude-lint`.

Implementation alone never closes a task. If evidence, review, ownership, render, or lint fails, do not mark `[x]`; report or route the blocker.

## Status And Handoff

`@dude status` is read-only. The coordinator first determines the active lane per its Status precedence; this detailed status applies only once that active lane is Lightweight Execution. A single defined package whose tasks are all `[ ]` with no execution evidence stays `Definition Only`, so do not report `tasks.md` counts for it. When Lightweight Execution is the active lane, report lane, live `tasks.md`, exact companion or `Ownership: ambiguous`, state counts, in-progress work, ready set, blockers, completion, tracked-not-started state, and unverified manual `[x]` drift. It may recompute a view in the response but must not set/render, log, snapshot, reconcile, or mutate.

If Beads is enabled later, hand off through `@dude track`; after import, never continue Lightweight. To return from tracked execution, first sync Beads to the one-way markdown mirror. If Beads is unavailable, disclose that the mirror may be stale and require the user's choice before treating that snapshot as live again.
