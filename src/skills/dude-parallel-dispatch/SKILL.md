---
name: "dude-parallel-dispatch"
description: "Use to decide and coordinate safe fan-out for independent ready work."
---

# Parallel Dispatch

`[P]` is only a candidate signal. Parallelize ready tasks only when there is no dependency or blocker relation and their declared implementation write/file sets are known and disjoint; unknown sets, shared files or state, dependencies, and blockers stay sequential.

## Rules

- Default fan-out cap is 2. Explicit user opt-in is required above 2, with a warning.
- Prefer different companion ideas and spec packages. Same-companion and same-package tasks may run together only when each is `[P]` and the no-relation, known-disjoint-write proof passes.
- Preserve tracker ready order; re-query the authoritative board after each round.
- Never parallelize implementation with its review, sequential phases, unresolved ownership, or competing edits.
- Specialists may execute concurrently, but synthesis, state mutation, mirror, log append, and close are serialized through the coordinator.

Worktrees remain optional. Offer one only for an already-safe split where risky or high-churn work materially benefits from checkout isolation; never use one to excuse overlap. State the benefit, cost, and sequential fallback, and do not repeat a declined suggestion without changed conditions.

Report each specialist's exact ownership, why the split is safe, what capped fan-out, and any worktree choice.
