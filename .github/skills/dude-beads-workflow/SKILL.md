---
name: "dude-beads-workflow"
description: "Use when working with Beads issue tracking: bd ready, bd create, bd update, bd close, claiming tasks, resume-first execution, pending work, blocked work, discovered bugs, or execution status."
---

# Beads Workflow

Standard workflow for all Dude specialists when working on tasks tracked in Beads. This skill applies only after Beads import; when Beads is unavailable or intentionally not used, load `dude-lightweight-execution` instead.

## Coordinator Handoff

- `@dude track` normally resumes in-progress work first.
- Before selecting new work, the coordinator may import defined brainstorms whose `spec_path` is not yet represented in Beads.
- When tracked execution is active, `@dude status` reports Beads state and defined features waiting for execution, but it must not import or mutate work.
- If tracked execution is being enabled on Windows and Beads is not initialized yet, point the user to the Dolt server-mode setup instead of retrying plain `bd init` after embedded-Dolt or CGO failures.

## Feature Lifecycle After Import

- A feature's identity is the brainstorm `spec_path:` value (full path to `spec.md`, e.g. `specs/001-feature-name/spec.md`). Every Beads issue imported from that feature carries the same value as a `spec:` prefix in the first line of its description. See `dude-spec-import-to-beads` for the canonical-identity rule.
- A feature is considered `imported` when at least one Beads issue has a description starting with `spec: <spec_path>` matching the brainstorm's `spec_path` (literal match).
- A feature is considered `active` when it currently has ready or in-progress Beads work.
- After import, Beads is the live board and source of truth.
- After import, `tasks.md` is not used for readiness or completion decisions. It may be kept as a one-way, non-authoritative portability mirror of Beads state so the feature can later be reconciled back to Lightweight Execution.

## Beads-To-Markdown Mirror

The mirror is one-way: Beads -> `tasks.md`. While tracked execution is active, never use `tasks.md` to override Beads.

When the coordinator changes Beads execution state, mirror the result to the matching canonical task unit in `specs/<feature>/tasks.md` when all of these are true:

- the Beads issue description starts with `spec: <spec_path>`
- the Beads issue title or description contains an original task key such as `T012@a1b2c3d4`, or a legacy task ID such as `T012` when no durable suffix exists
- exactly one canonical task header in that feature's `tasks.md` has the same durable key; if no durable key exists, exactly one header matches by task ID, story label, and core task intent

Mirror status mapping:

| Beads status | Markdown glyph |
|--------------|----------------|
| `open` | `[ ]` |
| `in_progress` | `[~]` |
| `blocked` | `[!]` |
| `closed` | `[x]` |

Mirror only the task-state glyph and Beads-derived blocker metadata when needed. Preserve the task key, labels, description, explicit `deps:`, and human-authored task text. If a generated board region is present, regenerate it as a complete replacement from the canonical task units.

Append a concise line to the companion brainstorm's `## Coordinator Log` for every successful mirror write, for example:

```text
2026-05-19 14:22 — mirrored Beads close dude-abc to tasks.md T012@a1b2c3d4
```

After mutating `tasks.md`, run the `dude-lint` skill (`pwsh .github/skills/dude-lint/lint.ps1` or `bash .github/skills/dude-lint/lint.sh`) and fix any `[FAIL]` before reporting the mirror as successful.

If the task key is missing, `tasks.md` is missing, the key maps to zero or multiple task headers, fallback matching is ambiguous, the board fence is malformed, or the companion brainstorm cannot be identified, do not guess. Keep the Beads state as authoritative, report that the Beads operation succeeded but markdown mirroring was skipped, and ask the user to run an explicit Beads-to-markdown sync or reconcile the task identity.

`@dude sync Beads to tasks.md` is the explicit reconciliation command for manual Beads changes, machine switching, or stale mirrors. It scans Beads issues by `spec:` prefix, applies the status mapping above to every unambiguous task key, regenerates the board region, appends Coordinator Log entries, runs `dude-lint`, and reports imported, mirrored, skipped, and ambiguous counts. It is mutating and must not run as part of `@dude status`.

## Before Starting Work

```bash
# Find your next task (coordinator usually tells you, but you can check)
bd ready --json --limit 5
```

Ignore epics or other non-executable grouping issues if they appear in the ready output.

## Claiming a Task

Always claim before starting. This is atomic — prevents two agents from working on the same task.

```bash
bd update <id> --claim --json
```

If the claim fails (someone else got it first), pick the next ready task.

## Reading Context

Every imported bead has a `spec:` line as the first line of its description — the workspace-relative path to the feature's `spec.md`. Always read it before starting:

```bash
bd show <id> --json
# → parse the first line of description for "spec: <path>" → read that spec.md file for acceptance criteria, plan, and contracts
```

Also check for related context:

- `specs/<feature>/plan.md` — technical architecture
- `specs/<feature>/contracts/` — API contracts, schemas
- `specs/<feature>/data-model.md` — entity definitions

## During Work

If you discover a bug, missing requirement, or new task while working:

```bash
bd create "<title>" -t bug -p <priority> --deps discovered-from:<current-task-id> --json
```

The `discovered-from` link maintains traceability. The new bead enters the ready queue after the current task closes.

## Blockage Escalation

If your work is blocked by a problem in the spec, plan, contracts, or architecture — not just a new task — escalate to the coordinator instead of working around it:

1. Create a Beads issue describing the blockage:
   ```bash
   bd create "Spec gap: <description>" -t bug -p 1 --deps discovered-from:<current-task-id> --json
   ```
2. Block your current task:
   ```bash
   bd update <current-task-id> --status blocked --json
   ```
3. Report to the coordinator with a structured return:
   - what was attempted
   - what failed or is missing
   - **blockage type**: `spec-gap` | `plan-gap` | `contract-mismatch` | `test-failure` | `external-dependency`
   - the created Beads issue ID

The coordinator triages by blockage type and routes to the right specialist for resolution. Do not try to fix spec, plan, or contract problems yourself — those artifacts belong to other specialists.

## Completing a Task

Use this completion pipeline:

1. The implementation specialist reports what changed and what was verified.
2. `@dude-tester` validates the work when verification is relevant or required.
3. `@dude-reviewer` provides independent readiness judgment when that role is present or requested.
4. Only then does the coordinator decide whether to call `bd close`.

When your work is done, **report results to the coordinator**. Do not call `bd close` yourself — the coordinator owns the close decision so the delivery pipeline (verification, review) can run first.

Return to the coordinator:

- what was done
- what was verified
- blockers or follow-up items discovered

The coordinator calls `bd close` after the pipeline completes:

```bash
bd close <id> --reason "Completed: <one-line summary of what was done>" --json
```

This automatically unblocks any tasks that were waiting on this one.

After `bd close` succeeds, the coordinator must run the Beads-to-markdown mirror for the closed issue before reporting completion. The mirror updates the matching canonical task header in `tasks.md` to `[x]`, refreshes the derived board region when present, records the sync in the brainstorm Coordinator Log, and runs `dude-lint`. If mirroring cannot be completed safely, report the skipped mirror separately from the successful Beads close.

## Status Values

| Status | Meaning |
|--------|---------|
| `open` | Ready to be claimed |
| `in_progress` | Claimed, being worked on |
| `blocked` | Waiting on another task |
| `deferred` | Intentionally postponed |
| `closed` | Done |

## Priority Values

| Priority | Meaning |
|----------|---------|
| 0 | Critical — security, data loss, broken builds |
| 1 | High — major features, important bugs |
| 2 | Medium — standard work |
| 3 | Low — polish, optimization |
| 4 | Backlog — future ideas |

## Rules

- Always use `--json` flag for reliable output parsing.
- Never create tasks outside Beads — it is the single source of truth while tracked execution is active.
- Do not read `tasks.md` as the live board after import. It may only receive Beads-derived mirror updates or explicit Beads-to-markdown sync results.
- Always claim before working — never skip the claim step.
- Do not call `bd close` yourself — report results to the coordinator, who owns the close decision.
- Ignore epics or other grouping issues in `bd ready` output; they are not executable tasks.
- If you can't complete a task, update its status: `bd update <id> --status blocked --json`

## Ready Work Loop

1. Query `bd ready --json`.
2. Filter out epics or other non-executable grouping issues.
3. Pick one or more safe tasks.
4. Execute and validate.
5. Report results to the coordinator.
6. Query ready work again.
