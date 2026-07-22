---
name: "dude-pack-beads-workflow"
description: "Use when working with Beads issue tracking: bd ready, bd create, bd update, bd close, claiming tasks, resume-first execution, pending work, blocked work, discovered bugs, execution status, mirroring Beads state back to tasks.md, or running @dude sync Beads to tasks.md."
---

# Beads Workflow

Standard workflow for all Dude specialists when working on tasks tracked in Beads. This skill applies only after Beads import; when Beads is unavailable or intentionally not used, load `dude-lightweight-execution` instead.

## Coordinator Handoff

- `@dude track` normally resumes in-progress work first.
- Before selecting new work, the coordinator may import defined ideas whose exact `spec_path` is not yet represented in Beads.
- When tracked execution is active, `@dude status` reports Beads state and defined features waiting for execution, but it must not import or mutate work.
- If tracked execution is being enabled on Windows and Beads is not initialized yet, point the user to the Dolt server-mode setup instead of retrying plain `bd init` after embedded-Dolt or CGO failures.
- When new work is discovered during tracked execution, create a linked Beads issue rather than silently expanding scope.

## Feature Lifecycle After Import

- A feature's identity is the uniquely owning defined idea's exact `spec_path:` value (full path to `spec.md`, e.g. `.dude/specs/001-feature-name/spec.md`). Every Beads issue imported from that feature carries the exact first description line `spec: <spec_path>`. See `dude-pack-beads-spec-import` for the canonical-identity rule.
- A feature is considered `imported` when at least one issue from `bd list --all --limit 0 --json` has `description.split(/\r?\n/, 1)[0] === 'spec: <spec_path>'`, using the idea's exact `spec_path`. Prefix collisions do not match.
- The owning idea keeps the user's feature intent under `## Idea` and the coordinator's append-only execution audit under `## Coordinator Log`; neither section becomes an execution board.
- A feature is considered `active` when it currently has ready or in-progress Beads work.
- After import, Beads is the live board and source of truth.
- After import, `tasks.md` is not used for readiness or completion decisions. It may be kept as a one-way, non-authoritative portability mirror of Beads state so the feature can later be reconciled back to Lightweight Execution.

## Beads-To-Markdown Mirror

The mirror is one-way: Beads -> `tasks.md`. While tracked execution is active, never use `tasks.md` to override Beads.

### Mechanical helper (`beads.mjs mirror`)

The glyph-application core of the mirror is scripted:

```bash
node .github/skills/dude-pack-beads-workflow/beads.mjs mirror .dude/specs/<feature>/tasks.md --from bd-list.json --spec .dude/specs/<feature>/spec.md --write
```

Given captured `bd list --all --limit 0 --json` bytes, it uses the same strict
inventory parser as `plan-import`: only a JSON array or an `{issues: [...]}`
envelope whose entries are objects with string descriptions is accepted. Before
mapping or applying state, it rejects every `tasks.md` parser warning and any
unbalanced, duplicate, nested, reversed, or stray exact board-fence marker.
It filters issues whose `type` or `issue_type` equals `epic`, case-insensitively,
before task-key or status mapping. The mirror accepts only the supported
executable status set — `open`, the in-progress spellings (`in_progress`,
`in-progress`, `inprogress`), `blocked`, `closed`, and `done`. Every other
executable status — `deferred` on a non-epic issue, `paused`, any future or
unknown value, or a missing/empty status — aborts both inspection and write as
unsupported before the glyph map is built, naming its issue ID, durable key, and
normalized status; it is never silently ignored.
Representable issues map each task key + status to a canonical glyph and apply
the batch to `tasks.md` (skipping keys with no matching header).

Write mode requires canonical sibling
`.dude/specs/<feature>/{spec.md,tasks.md}` regular files and exactly one flat
`.dude/ideas/*.md` owner with `status: defined` and that exact `spec_path`.
Issue descriptions must carry that exact value on their first line. Duplicate
or conflicting task-key mappings are refused. Successful writes report the
exact `idea_path`; the helper does not append its `## Coordinator Log`.

Inspection-only mirror is intentionally less restrictive: without `--write`, it
may parse and report without an idea owner. When `--spec` is supplied, it still
validates the canonical sibling `.dude/specs/<feature>/{spec.md,tasks.md}`
identity, but unique idea ownership is a write-only requirement. This preserves
spec-less inspection while keeping every mutation fail-closed. It does **not**
resolve ambiguity, append discovered-work sections, or manage
`(Beads: <id>)` tags — those match and reconcile rules below stay with the
coordinator. Run `dude-lint` after.

Throughout this skill, an **executable Beads issue** is one for which neither Beads `type` nor `issue_type` equals `epic`, case-insensitively. Non-executable grouping issues — specifically the deferred feature epic created by `dude-pack-beads-spec-import` and any other epic issue — never participate in mirror writes or mirror verification. Missing or unknown issue types remain executable for compatibility. A **representable** issue is an executable issue whose Beads status maps to a markdown glyph in the table below; every other executable status — `deferred` on a non-epic issue, `paused`, any future or unknown value, or a missing/empty status — is reported as `unsupported` and is never silently mirrored.

When the coordinator changes Beads execution state, mirror the result to the matching canonical task unit in `.dude/specs/<feature>/tasks.md` when all of these are true:

- the Beads issue's first description line equals `spec: <spec_path>`
- the issue is executable (see definition above)
- exactly one canonical task header in that feature's `tasks.md` matches the Beads issue by one of the following channels, evaluated in this order:
  1. **durable key** — the Beads issue title or description contains an original task key such as `T012@a1b2c3d4`, and exactly one task header carries the same durable key
  2. **Beads tag** — exactly one task header in the feature's `tasks.md` carries a previously generated `(Beads: <id>)` tag whose `<id>` is the closed/updated Beads issue ID (recognized by the regex `\(Beads:\s*([A-Za-z0-9_-]+)(?:\s*;[^)]*)?\)`)

Mirror status mapping:

| Beads status | Markdown glyph |
|--------------|----------------|
| `open` | `[ ]` |
| `in_progress` / `in-progress` / `inprogress` | `[~]` |
| `blocked` | `[!]` |
| `closed` / `done` | `[x]` |
| any other status (`deferred` on a non-epic issue, `paused`, future/unknown, or missing) | unsupported: skip grouping epics; reject executable issues before any dry-run or write |

`deferred` is reserved by Dude for non-executable grouping issues such as the feature epic created by `dude-pack-beads-spec-import`. Those issues do not correspond to any canonical task header in `tasks.md`, so mirror skips them silently and does not report them as ambiguous. If an executable issue instead carries any status outside the supported set above — `deferred` on a non-epic issue, `paused`, any future or unknown value, or a missing/empty status — do not silently drop it: the mirror rejects the whole batch before any dry-run report or write, naming the issue id, task key, and normalized status, and leaving `tasks.md` and its owner ledger unchanged. Ask whether to keep the issue only in Beads, reopen it, or represent it as blocked.

Mirror only the task-state glyph and Beads-derived blocker metadata when needed. Preserve the task key, labels, description, explicit `deps:`, and human-authored task text. If a generated board region is present, regenerate it as a complete replacement from the canonical task units.

Before every mirror or sync mutation, resolve exactly one direct regular Markdown child of flat `.dude/ideas/` with `status: defined` whose exact canonical `spec_path` equals the feature spec. Never infer an idea slug from the feature directory or translate an alternate identity. Missing, malformed, dangling, noncanonical, or duplicate ownership stops the write. For mechanical mirror writes, require the exact `idea_path` returned by the helper; if it is absent or differs from the coordinator's resolved owner, stop.

The coordinator, not `beads.mjs`, appends exactly one concise UTC line to that idea's append-only `## Coordinator Log` for each successful mirror, explicit sync, Beads close, or derived-board regeneration event. If one coordinator operation produces several of those events, append one line per event; never combine them or let the helper write them. Use one of these stable forms:

```text
2026-05-19T14:22:00Z — mirrored Beads close dude-abc to tasks.md T012@a1b2c3d4
2026-05-19T14:23:00Z — mirrored Beads status in_progress dude-def to tasks.md T013@77aa11bb
2026-05-19T14:24:00Z — appended discovered Beads issue dude-xyz to tasks.md as T9001@4f2a91c0
2026-05-19T14:25:00Z — sync reported mirror drift: 2 stale, 0 ambiguous, 1 unsupported
```

Report-only entries (the last form) are appended only by explicit `@dude sync` runs that surface drift, never by `@dude status`.

After mutating `tasks.md`, run the `dude-lint` skill (`node .github/skills/dude-lint/lint.mjs`) and fix any `[FAIL]` before reporting the mirror as successful.

If the task key is missing, `tasks.md` is missing, the key maps to zero or multiple task headers, the board fence is malformed, or the unique defined idea owner cannot be identified, do not guess. Keep the Beads state as authoritative, report that the Beads operation succeeded but markdown mirroring was skipped, and ask the user to run an explicit Beads-to-markdown sync or reconcile the task identity.

`@dude sync Beads to tasks.md` is the explicit reconciliation command for manual Beads changes, machine switching, or stale mirrors. It scans Beads issues by exact first-line `spec: <spec_path>` equality, applies the status mapping above to every unambiguous task key, regenerates the board region, appends exactly one UTC line per sync or board event to the uniquely owning idea's Coordinator Log, runs `dude-lint`, and reports imported, mirrored, skipped, ambiguous, unsupported, and appended counts. It is mutating and must not run as part of `@dude status`.

### Discovered Beads Work

Beads issues created mid-flight (for example with `bd create ... --deps discovered-from:<id>`) carry the feature's exact `spec: <spec_path>` first line but have no matching task header in `tasks.md` until the first sync. The close-time auto-mirror never appends new headers; once a discovered issue has been surfaced by `@dude sync Beads to tasks.md`, however, the `(Beads: <id>)` tag arm of the mirror match rules above lets later close-time mirror writes update that appended header (for example, flipping it to `[x]` when the discovered Beads issue closes).

`@dude sync Beads to tasks.md` is the only path that surfaces discovered work in `tasks.md`. When the sync finds an executable open, in-progress, or blocked Beads issue with the feature's exact `spec: <spec_path>` first line and no matching durable key or previously generated `(Beads: <id>)` tag in that feature's `tasks.md`, it appends a new canonical task unit under a `## Discovered During Execution` section (creating that section if it does not yet exist). If `## Lightweight Execution History` is present, insert `## Discovered During Execution` immediately above it; otherwise append `## Discovered During Execution` as the final section in the file. The history block, when present, must remain the terminal archive section. The appended unit must use the normal task-header schema so `dude-lint`, Lightweight Execution, and future imports still understand it:

- TNNN is allocated from the **reserved discovered range `T9001`–`T9999`**, using the next free integer above the highest existing `T9NNN` header in that file (start at `T9001` when none exists). Spec-derived tasks emitted by `dude-feature-definition` stay below `T9000`, so re-defining the feature cannot collide with appended discovered work.
- the durable suffix is **the first 8 hex characters of `sha256(<beads-id>)` (lowercase)** — this is a rule, not an example, so two machines syncing the same Beads database always produce the same header. On the rare event of a collision against an existing suffix in the same file, append `-1`, `-2`, ... to the Beads ID input before hashing and record the salt in the matching parenthetical (e.g. `Beads: dude-xyz; suffix-salt: 1`).
- `[Shared]` as the story label unless the Beads issue unambiguously maps to a specific user story
- the Beads issue title as the task text, ending with a stable `(Beads: <id>)` tag and, when present, `; discovered from: <parent-id>` inside the same parenthetical
- the original status glyph from the mapping above

Do not introduce a separate `D...` task namespace or new metadata keys such as `discovered-from:`; those are not part of the canonical task format. The generated `(Beads: <id>)` tag is the future matching anchor when the Beads issue itself still lacks a generated task key, and the close-time mirror match rules above explicitly accept it as the second match channel.

The sync report lists every appended entry separately from regular mirror writes so the user can keep, retitle, or remove them before continuing. Closed Beads issues with no matching task header are reported as skipped rather than appended, because back-filling completed history into `tasks.md` is the user's decision.

### Mirror Verification

`@dude status` is read-only and does not perform a sync. When tracked execution is active, treat the mirror line as a trustworthy portability check, not a cheap mtime hint. Query Beads with `bd list --all --limit 0 --json`, group issues by exact first-line `spec:` identity, read the matching `tasks.md`, and verify the markdown snapshot against Beads without writing anything.

- `Mirror: verified current` when every executable, representable Beads issue for the feature maps to exactly one canonical task header by durable task key or generated `(Beads: <id>)` tag, and each mapped header has the glyph required by the status mapping above
- `Mirror: stale — run @dude sync Beads to tasks.md` when any executable open, in-progress, blocked, or closed Beads issue is missing from `tasks.md`, maps ambiguously, or has a mismatched glyph
- `Mirror: unsupported — executable Beads task <id> status outside supported set` when the feature contains an executable issue whose status cannot be represented by the current markdown glyph set (`deferred` on a non-epic issue, `paused`, any future or unknown value, or a missing status)
- `Mirror: not present` when no `tasks.md` exists for the active feature
- `Mirror: unknown — <reason>` when Beads or the filesystem cannot be read well enough to verify the snapshot

When more than one condition would apply for a single feature, report the most actionable one in this priority order: `unknown` > `stale` > `unsupported` > `not present` > `verified current`. Additional non-actionable conditions for the same feature may be appended as a secondary `Mirror notes:` line so nothing is hidden.

Non-executable grouping issues, including deferred epics, do not participate in mirror verification. The check is informational but must be accurate: do not report `verified current` from file modification times alone.

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

- `.dude/specs/<feature>/plan.md` — technical architecture
- `.dude/specs/<feature>/contracts/` — API contracts, schemas
- `.dude/specs/<feature>/data-model.md` — entity definitions

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
2. A verification specialist validates the work when one is on the roster and verification is relevant or required.
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

After `bd close` succeeds, the coordinator must run the Beads-to-markdown mirror for the closed issue before reporting completion. The mirror updates the matching canonical task header in `tasks.md` to `[x]`, refreshes the derived board region when present, records exactly one UTC event in the uniquely owning idea's Coordinator Log, and runs `dude-lint`. If mirroring cannot be completed safely, report the skipped mirror separately from the successful Beads close.

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

## Coordinator Orchestration

These are the coordinator-side flows for tracked execution. They apply only when this pack is installed and the user has opted into tracked execution. In lean core (pack absent), the coordinator uses Lightweight Execution from `.dude/specs/<feature>/tasks.md` instead. Only the coordinator calls `bd close`.

### Manual Import

Use this only when the user explicitly asks to import execution work from `.dude/specs/` into Beads instead of using `@dude track`. Manual import still requires one uniquely owning defined idea as the identity source:

1. Resolve the feature directory from the user's input or from `.dude/specs/`.
2. Scan only direct regular `.md` children of flat `.dude/ideas/` and require exactly one `status: defined` idea whose exact canonical `spec_path` matches `<selected-dir>/spec.md`. If no matching owner exists, stop and tell the user to run `@dude brainstorm <feature>` and then `@dude define <slug>`.
3. Load `dude-pack-beads-spec-import` and follow the Import Algorithm for reading artifacts, parsing task lines, creating Beads issues, deriving dependencies, and mapping priorities.
4. After import, run `bd ready --json`, discard epics or other non-executable grouping issues from that ready set, and report how many task issues were created and how many actionable tasks are ready.

### Automatic Feature Handoff

Use this during `@dude track` before selecting new ready work.

1. Load `dude-pack-beads-spec-import` and follow its `## Canonical Feature Identity` rule: the unique defined idea's exact `spec_path` and the Beads issue description `spec:` first line must carry the same value (the full path to the feature's `spec.md`).
2. Scan only direct regular `.md` children of flat `.dude/ideas/` for files marked `status: defined` with a populated canonical `spec_path:`. Unsafe entries and malformed defined identities fail closed.
3. Reject duplicate defined-idea `spec_path:` values, then run `beads.mjs plan-import` for each candidate. Before reading package files or loading Beads inventory, the helper validates canonical sibling feature files and the unique idea owner. It then queries `bd list --all --limit 0 --json`, uses exact first-line equality, and rejects duplicate durable-key mappings or feature epics before emitting any create command. Import only when the helper reports no exact existing representation.
4. Require the plan's `idea_path` to equal the exact scanned owner. If it is missing, ambiguous, or different, stop before running any emitted command.
5. Do not ask the user for a `.dude/specs/<feature>/` path during this automatic handoff; the idea file is the pointer.
6. If a defined idea points to a missing or malformed package, stop and report the fix needed instead of guessing.

### Work Loop

Use this when the user asks to track work, continue work, or take the next ready issue. Each dispatched specialist follows this skill for claiming and context reading; specialists report results back and only the coordinator calls `bd close`.

1. Run `bd list --status in_progress --json`.
2. If one or more tasks are already in progress, resume or report them before claiming new work.
3. Run the automatic feature handoff for defined ideas.
4. Run `bd ready --json --limit 5`.
5. Discard epics or other non-executable grouping issues from the ready set before dispatch.
6. If no actionable tasks are ready, report that all work is done, in progress, or blocked, and include any defined features that still need manual repair before they can be imported.
7. Preserve Beads ready order as the default dispatch order.
8. For each ready task: match it to the best specialist using normal roster-driven routing (load `.github/skills/dude-generic-routing/SKILL.md` and its `## Task Matching` section if useful); include ID, title, description, labels, and the exact `spec: <spec_path>` first line in the delegation; dispatch to the owning specialist.
9. If multiple ready tasks are truly independent, use the normal parallel-dispatch rules; launch at most 2 specialists in parallel by default; do not parallelize tasks that compete for the same artifacts or feature decision point.
10. After delegated work completes, run `bd ready --json` again to check for newly unblocked work.
11. Report round progress, including completed work and newly ready issues.

### Status (tracked)

When `@dude status` runs and a tracked board is initialized, append:

1. Pre-check Beads initialization only if tracked execution has started; if not initialized, report that tracked execution has not started yet and point to setup before any further `bd` commands.
2. Run `bd list --all --limit 0 --json` (filter by status and exact first-line `spec:` identity) and `bd ready --json`.
3. Report total / done / in progress / ready / blocked; who is working on what; which defined features await `@dude track`; what is ready next.
4. Add a trustworthy `Mirror:` line per active feature by reading the feature's `tasks.md` and verifying every executable, representable Beads issue with that exact first-line identity maps to exactly one canonical task header with the expected glyph (match by durable task key first, then the `Beads: <id>` tag). Report `Mirror: verified current`, `Mirror: stale — run @dude sync Beads to tasks.md`, `Mirror: unsupported — <reason>`, `Mirror: not present`, or `Mirror: unknown — <reason>`. Informational only; status must not run the sync.
5. Run `bd graph` when the user asks for dependency shape.

Status is read-only.

### Discipline

- `@dude track` is the normal automatic handoff from defined features into Beads; explicit manual import is a fallback.
- Do not use `@dude status` to import or mutate work.
- `tasks.md` may be the live markdown board only during Lightweight Execution before import; after import it receives only one-way Beads-derived mirror writes or explicit `@dude sync Beads to tasks.md` results.
- Claim, close, import, or mirror only issues whose first description line is the exact canonical and uniquely owned `spec: .dude/specs/<feature>/spec.md`. An unsupported alternate identity stops the operation without translation.
- Do not use the idea ledger or `tasks.md` as the live board after import, and do not create tasks outside Beads once Beads is the execution system.

### Completion

When a specialist returns from tracked work:

- If complete, run the delivery pipeline (verification via a verification specialist if one is on the roster, then acceptance via the quality authority if assigned), load `dude-verification-before-completion`, call `bd close` with a reason, and mirror the close to `tasks.md` when the task key maps cleanly.
- If no verification specialist or quality authority exists, load `dude-verification-before-completion` directly, call `bd close`, and mirror.
- If blocked, call `bd update <id> --status blocked --json` with the blocker reason.
- If new work is uncovered, create linked Beads issues.
- If review rejects an artifact, route revision to a different agent when possible, not the original author.

### Continuous Work

In Tracked Execution, the local `@dude work` host captures the complete Beads list plus detail and history for every selected issue, then must internally supply existing `normalizeRecoveryEvidence` as trusted `normalizeTrackedEvidence` to core recovery through the sealed `collectRecoveryEvidence`, `inspectRecovery`, and `authorizeRecoveryAttempt` wrappers. `dude-work` owns detailed inspection and recovery policy; Beads retains tracked claim, block, coordinator-only close, mirror, history, and lint duties for each authorized action.
