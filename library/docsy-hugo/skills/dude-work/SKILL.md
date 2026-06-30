---
name: "dude-work"
description: "Use when the user wants Dude to continuously implement ready tasks until a natural stop condition, including @dude work, @dude work <feature>, @dude work --max N, @dude work --until blocked, keep going, autoloop, or repeat the next ready task in either Lightweight Execution or Tracked Execution."
---

# Continuous Work

Run ready tasks back-to-back in whichever execution lane is currently live, with a default cap, predictable stop conditions, and the usual close protocol per iteration.

## Purpose

Give the user one boring verb that says "keep going" without inventing a new workflow lane, a new state file, or a way to bypass verification.

`@dude work` is an execution accelerator. It does not replace `@dude track`, `@dude define`, or any close protocol. It iterates inside the lane that is already live and stops on the first natural boundary.

## When This Skill Activates

Load this skill when the user says any of:

- `@dude work`
- `@dude work <feature>`
- `@dude work --max N`
- `@dude work --until blocked`
- `@dude work --parallel N`
- "keep going on <feature>"
- "auto-loop the ready work"
- "run the next few ready tasks"

Do not activate this skill for `@dude track` (handoff into Beads) or `@dude status` (read-only orientation). Those verbs have their own semantics.

## Grammar

```text
@dude work [<feature>] [--max <N>] [--until blocked] [--parallel <N>]
```

- `<feature>` — optional Lightweight-Execution feature slug. Ignored when Tracked Execution is the active lane (Beads has its own ready set).
- `--max <N>` — maximum number of iterations. Default `3`. Hard floor `1`, soft ceiling `25`.
- `--until blocked` — alias for "run until the first natural stop", capped at the soft ceiling. Implies `--max 25` unless the user passes a different `--max`.
- `--parallel <N>` — fan-out width. Default `1`. Soft ceiling `2` (Dude warns and requires explicit user confirmation above `2`); respect `dude-parallel-dispatch` rules when greater than `1`.

## Lane Detection

Before the first iteration, detect the active execution lane in this order:

1. **Tracked Execution.** If `bd list --json` succeeds and returns one or more issues, the active lane is Tracked Execution (per `dude-beads-workflow`: after import, Beads is the live board regardless of whether ready work is currently executable). Within Tracked, resume any `in_progress` issue first; otherwise pull from `bd ready --json`. If neither returns executable work, stop with reason `no ready Beads work` — do **not** fall through to Lightweight. The feature argument is informational only — Beads decides the ready order.
2. **Lightweight Execution.** Otherwise (Beads is uninitialized or empty), if the user named a `<feature>` and `specs/<feature>/tasks.md` has at least one non-`[x]` canonical task unit, the active lane is Lightweight Execution for that feature. If no `<feature>` was named and exactly one defined feature under `specs/` has non-`[x]` canonical task units, use that feature. If more than one candidate exists, stop and ask which feature to work on.
3. **Definition Only / no lane.** If no execution lane is live (no defined feature, no Beads work), refuse with a one-line message: `Action: work / Next: No active execution lane. Run @dude define <feature> to define one, or @dude track to enable Beads tracking, then @dude work.`

Lane detection runs **once** at the start of `@dude work`. If the user moves between lanes mid-loop (e.g. runs `@dude track` separately), they must restart `@dude work` to pick up the new lane.

## Iteration Protocol

Each iteration is one of two shapes depending on the detected lane. The coordinator-only mutation rule, the lane banner, and the close protocol still apply per iteration; `@dude work` does not bypass any of them.

### Lightweight Execution branch

For each iteration, until a stop condition fires:

1. Read `specs/<feature>/tasks.md` and select the next eligible ready task using the rules in `dude-lightweight-execution` (resume `[~]` first, then prefer the generated `## Ready Now` section, then fall back to phase order with `deps:` respected).
2. If no eligible task remains, stop with reason `no ready task`.
3. Coordinator moves the task header from `[ ]` to `[~]` and routes it to the narrowest credible specialist using `dude-generic-routing`.
4. Run the specialist's implementation pass and collect the result.
5. Apply the **Lightweight Close Protocol** from `dude-lightweight-execution`: route verification to `@dude-tester` when relevant, route optional readiness judgment to `@dude-reviewer` when present, load `dude-verification-before-completion`, then have the coordinator mark the task `[x]` and refresh the derived board region. Run `dude-lint` after the write.
6. If verification fails, mark the task `[!]` with a `blocked-by:` note and stop with reason `verification failed`.
7. If the specialist reports a blocker, mark the task `[!]`, add `blocked-by:` when practical, route the blocker via `@dude flag ...`, and stop with reason `task blocked`.
8. Append a one-line entry to the brainstorm `## Coordinator Log` summarizing the iteration outcome.
9. Increment the iteration counter and continue.

### Tracked Execution branch

For each iteration, until a stop condition fires:

1. Run `bd list --status in_progress --json`. If an `in_progress` issue exists, resume it first; otherwise run `bd ready --json --limit 5` and discard non-executable grouping issues (epics, deferred, etc.).
2. If no executable ready issue exists, stop with reason `no ready Beads work`.
3. Coordinator picks the next ready issue and routes it to the narrowest credible specialist. The specialist follows `dude-beads-workflow`: `bd update <id> --claim --json`, reads context from the `spec:` prefix, executes, and reports back.
4. Apply the **Beads Close Protocol** from `dude.agent.md`: route verification to `@dude-tester` when relevant, route optional readiness judgment to `@dude-reviewer` when present, load `dude-verification-before-completion`, then have only the coordinator call `bd close <id> --reason "..." --json`.
5. After `bd close` succeeds, mirror the close to the matching canonical task unit in `tasks.md` when the durable task key maps cleanly (per `dude-beads-workflow` mirror rules), regenerate any derived board region, append to the brainstorm `## Coordinator Log`, and run `dude-lint`. A mirror failure does not undo the Beads close; report it and continue.
6. If the specialist reports a blocker, run `bd update <id> --status blocked --json`, route the blocker via `@dude flag ...`, and stop with reason `task blocked`.
7. If verification fails, leave the Beads issue claimed, do not call `bd close`, and stop with reason `verification failed`.
8. Increment the iteration counter and continue.

### Parallel iterations

When `--parallel N > 1`, follow `dude-parallel-dispatch`: cap at 2 by default, only fan out across tasks with disjoint artifact areas, and treat each parallel sub-iteration as one count against `--max`. Synthesis (close protocol, mirror, log append) still serializes through the coordinator.

## Stop Conditions

Iteration ends — uniformly across both lanes — on the first of:

1. **No ready task remains.** Reason: `no ready task` (Lightweight) or `no ready Beads work` (Tracked).
2. **Task blocks.** Specialist reports a blocker; coordinator marks `[!]` or runs `bd update --status blocked` and routes the flag. Reason: `task blocked: <typed-classification>`.
3. **Verification fails.** `dude-verification-before-completion` returns negative evidence. Reason: `verification failed on <task-id>`.
4. **Reviewer rejects.** When `@dude-reviewer` is on the roster and returns a rejection. Reason: `reviewer rejected <task-id>`.
5. **Clarification required.** The specialist returns a question that materially affects scope, contracts, or guardrails. Reason: `clarification required: <one-line>`.
6. **Two consecutive failed attempts on the same task.** Per `dude-systematic-debugging` step 6, stop stacking patches. Reason: `two failed attempts on <task-id>`.
7. **Ambiguous state.** Lane drift (Beads became initialized mid-loop, `tasks.md` fence imbalance, multiple matching task headers for one Beads close, brainstorm identity mismatch). Reason: `ambiguous state: <one-line>`.
8. **`--max` reached.** Reason: `max iterations reached (<N>)`.
9. **Tool error during an iteration.** Filesystem write error, `bd` non-zero exit, lint `[FAIL]` that cannot be auto-resolved. Reason: `tool error: <one-line>`.

On a stop, **always** report the partial result, the stop reason, and the recommended next action. Never silently retry the failed iteration.

## Default Limits

- `--max` default: **3**. Conservative. Users can raise per call.
- `--max` hard floor: **1**. `--max 0` is rejected.
- `--max` soft ceiling: **25**. Values above 25 are accepted but Dude warns once in the result that the cap is unusual.
- `--parallel` default: **1**. Soft ceiling **2**; values above 2 are accepted only with explicit user opt-in and Dude warns once in the result.
- `--until blocked`: implies `--max 25` unless the user passes a different `--max`.

## Reporting Shape

`@dude work` uses the standard coordinator result shape from `dude.agent.md`, with iteration summaries inside `Updated:`. The lane banner is mandatory (reusing the active lane's banner format).

Lightweight example:

```text
Lane: Lightweight Execution · Live: specs/001-expense-entry/tasks.md
Action: work
Updated:
- Iteration 1/3: T003@a1b2c3d4 implemented, verified, marked [x]
- Iteration 2/3: T004@e4f5g6h7 implemented, verified, marked [x]
- Iteration 3/3: T005@91ac4e2f implemented, verified, marked [x]
- 3 Coordinator Log entries appended to brainstorm/expense-entry.md
- dude-lint: ok after each iteration
Next:
- Run @dude work expense-entry --max 3 to continue
- Or @dude status for a read-only snapshot
```

Tracked example with a stop:

```text
Lane: Tracked Execution · Live: Beads
Action: work
Updated:
- Iteration 1/5: dude-abc closed, mirrored to T012@a1b2c3d4
- Iteration 2/5: dude-def claimed and implemented; verification failed
Blockers:
- Stopped after iteration 2: verification failed on dude-def. Specialist report stored in chat context.
Next:
- Run @dude flag test-failure: <details> to route the failure, or fix the test and re-run @dude work
```

Refusal example (no active lane):

```text
Action: work
Next: No active execution lane. Run @dude define <feature> to define one, or @dude track to enable Beads tracking, then @dude work.
```

## Boundaries

`@dude work` does **not**:

- introduce a new workflow lane (it runs inside Lightweight or Tracked Execution)
- import features into Beads (use `@dude track` first if Beads is desired)
- edit `spec.md`, `plan.md`, user-authored brainstorm content (`## User Draft`, open-question answers, `## Assumptions`), or any definition artifact (use `@dude flag` for gaps); coordinator-maintained metadata (`## Coordinator Log`, `status:`, `spec_path:`) is still updated per the coordinator-only mutation rule and the iteration protocol above
- bypass `dude-verification-before-completion`, the Lightweight Close Protocol, or the Beads Close Protocol
- bypass coordinator-only mutation of `tasks.md` task glyphs or Beads close calls
- commit, push, or otherwise modify VCS state (no auto-commit in v1)
- silently retry a failed iteration
- carry state across separate `@dude work` invocations beyond what `tasks.md` and Beads already record
- create a new state file (no `ralph_state.md`, no autoloop log; reuse `## Coordinator Log` and Beads history)

If a user asks for any of the above as part of `@dude work`, refuse the bundled request and recommend the right verb instead.

## References

- `dude-lightweight-execution` — selection rules, canonical task units, Lightweight Close Protocol
- `dude-beads-workflow` — claim/close discipline, ready loop, mirror rules
- `dude-verification-before-completion` — per-iteration evidence gate
- `dude-systematic-debugging` — used when a task fails verification mid-loop
- `dude-parallel-dispatch` — caps `--parallel`, governs fan-out safety
- `dude-receiving-code-review` — used when reviewer rejection ends an iteration
- `dude-generic-routing` — specialist selection per iteration
- `dude-lint` — final structural check after every write
