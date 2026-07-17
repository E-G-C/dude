---
name: "dude-work"
description: "Use for @dude work continuous execution inside the active Lightweight or Tracked lane until a named natural stop."
---

# Continuous Work

`@dude work` is an execution accelerator, not a new workflow lane. It repeats ready work inside the lane detected at start and never bypasses that lane's close protocol.

## Grammar And Limits

```text
@dude work [<feature>] [--max <N>] [--until blocked] [--parallel <N>]
```

`--max`: Default `3`, Hard floor `1`, soft ceiling `25`. `--until blocked` implies 25 unless another max is supplied. `--parallel` defaults to 1 with Soft ceiling `2`; above 2 requires explicit opt-in and a warning.

## Detect The Lane Once

1. If `bd list --all --limit 0 --json` returns any imported issue, use Tracked Execution. Resume executable in-progress work, otherwise use `bd ready --json`. `no ready Beads work` stops; do not fall through to Lightweight.
2. Otherwise use the named Lightweight feature with non-done canonical tasks, or the only unambiguous defined feature with such tasks. Multiple candidates are `ambiguous state`.
3. If neither lane is live, refuse and point to explicit `define` or `track`. Work never imports a feature or invents a lane.

Lane drift during the loop is `ambiguous state`; restart Work to redetect.

## Canonical Mutation Gate

For either lane, require exactly one `status: defined` owner by exact `spec_path:` from the sibling spec or tracked issue `spec:` identity. Any resolver diagnostic, no owner, or multiple owners stops before mutation. Never infer or fall back from slug, directory, or name.

After the canonical ownership gate passes but before the first claim, apply any deferred manual-completion reconciliation through the active lane. The unique owner is the only append-only coordinator log; it is audit context, not a second board.

## Iterate

For Lightweight, use `dude-lightweight-execution` to select, claim, block, close, render, log, and lint each task. For Tracked, use the installed tracked-execution skill to resume or select, claim, block, close, mirror, log, and lint. Route every implementation through `dude-generic-routing`; use `dude-verification-before-completion` and independent review as required by the lane.

When `--parallel > 1`, load `dude-parallel-dispatch`; `[P]` is only a candidate signal. Prefer different companion ideas or spec packages, but same-companion and same-package `[P]` tasks may fan out when neither has a dependency or blocker relation and their declared implementation write/file sets are known and disjoint. Unknown write sets, shared files or state, dependencies, or blockers stay sequential. Each sub-iteration counts toward max; coordinator synthesis, state mutation, and close remain serialized.

## Stops

Stop on the first natural boundary and report partial results, exact reason, and next action:

- `no ready task`
- `no ready Beads work`
- `task blocked: <classification>`
- `verification failed on <task-id>`
- `reviewer rejected <task-id>`
- `clarification required: <detail>`
- `two failed attempts on <task-id>`
- `ambiguous state: <detail>`
- `tool error: <detail>`
- `iteration limit reached (<N>)`

Never silently retry a failed iteration.

## Boundaries

- Work is not a lane and never imports a feature.
- Do not edit user intent or definition artifacts; return intent changes to the idea and explicit `define`.
- Never create new state; reuse canonical lane state and the unique owner log.
- No auto-commit, push, or other VCS mutation.
- Never bypass verification, independent review when required, or coordinator-only state and close authority.
- Parallel dispatch still requires independent tasks and serialized coordinator close.

## Report

Use the active lane banner and coordinator `Action / Updated / Next / Blockers` shape. Report each iteration, verification/close result, stopped reason when applicable, warnings for limits above soft ceilings, and the next executable action.
