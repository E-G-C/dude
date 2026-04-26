# Commands And Prompt Shapes

[Back to root README](../README.md) | [Docs index](README.md) | [Workflow modes](workflow.md)

## Command Reference

Examples below use preferred invocation forms. The short rule is: `draft`
creates the working feature document, `define` turns it into a reusable package,
`track` hands that package into Beads when you choose Tracked Execution,
`status` reports state in all three lanes, and `flag` routes execution-time
gaps back into definition.

### Concise Command List

| Command | Description |
| ------- | ----------- |
| `@dude draft <feature>` | Create or refresh the brainstorm ledger for one feature. |
| `@dude define <feature>` | Turn a drafted feature into a reusable package under `specs/<feature>/`. |
| `@dude status` | Read-only report of the current lane, live artifact, next step, and blockers. |
| `@dude track` | Import or resume tracked execution in Beads. |
| `@dude flag [<type>:] <details>` | Route a real blocker or mismatch back to the right owner. Typed prefixes are preferred, but plain language is accepted. |
| `@dude diff` | Read-only summary of coordinator-owned writes since your previous message. |
| `@dude self-check` | Read-only verification that Dude followed its own rules (banner, fences, log, no silent `[x]` drift). |
| `@dude hire a <role>` | Add a new specialist to the active roster (creates `.github/agents/<name>.agent.md`). |
| `@dude list the team` / `@dude show roster` | Read-only summary of the current specialists and their scopes. |
| `@dude remove <role>` / `@dude modify <role>` | Remove or adjust an existing specialist. |
| `@dude remember: <fact>` | Save a durable constraint, decision, or project fact. |
| `@dude import tasks from specs/<feature>/ into Beads` | Manually import a defined package into Beads when you do not want the normal automatic handoff. |

Preferred workflow verbs are `draft`, `define`, `status`, `track`, `flag`, `diff`, and `self-check`. `hire`, `remember`, and the team-management verbs are coordinator-maintenance verbs and may be invoked any time.

### `@dude draft`

Use this when you have a raw feature idea, a PRD, or incomplete requirements.
Dude turns that input into a brainstorm file that you can edit directly.

Preferred form:

```text
@dude draft authentication
```

Meaning: create or refresh the brainstorm ledger for a feature.

Supported input shapes:

- Short feature name: `@dude draft authentication`
- Free-text feature description:
  `@dude draft a feature for email/password sign-in`
- Markdown file path: `@dude draft docs/prd/billing.md`

Illustrative result:

```text
Action: draft
Updated:
- brainstorm/authentication.md created or refreshed
Next:
- Review the brainstorm and answer any open questions
- Run @dude define authentication when the draft is ready
```

Edit `brainstorm/<slug>.md` to answer `## Open Questions` or adjust
`## Assumptions`, then rerun `@dude draft <feature>` to re-normalize the same
file or `@dude define <feature>` when you are ready to continue.

### `@dude define`

Use this when the brainstorm captures one bounded feature. Dude refreshes the
reusable package under `specs/<feature>/` and may pause once for guardrail
approval before planning continues.

Preferred form:

```text
@dude define authentication
```

Meaning: create or refresh the reusable definition package for a drafted
feature.

Illustrative results:

Definition completed:

```text
Action: define
Updated:
- specs/001-authentication/spec.md created or refreshed
- brainstorm/authentication.md updated with status: defined and spec_path
Next:
- Read specs/001-authentication/spec.md first, then plan.md
- Stop here for definition-only work
- Or continue from tasks.md, starting with the generated board view, if you want Lightweight Execution without Beads
- Or run @dude track if you want tracked execution
```

Guardrail ratification required:

```text
Action: define
Updated:
- specs/001-authentication/spec.md created or refreshed
- Candidate guardrails inferred from the repo, current feature, and remembered context
Next:
- Accept, edit, reject, or skip the proposed guardrails
- Planning will continue after guardrails are ratified
Blockers:
- plan.md and later definition artifacts are paused until guardrails are ratified or bundle defaults are accepted
```

### `@dude track`

Use this when you want tracked execution in Beads. After import, Beads becomes
the only live board for task state.

Preferred form:

```text
@dude track
```

Meaning: resume or import tracked execution work in Beads; it does not compile
the application.

If Beads is unavailable or you intentionally do not want it yet, stay in
Lightweight Execution instead of using `@dude track`.

Illustrative result:

```text
Action: track
Updated:
- Imported specs/001-authentication/spec.md into Beads
- Selected ready task T001@a1b2c3d4 for implementation
Next:
- Let Dude continue the routed work
- Or run @dude status for a read-only snapshot
```

### `@dude status`

Use this when you want a read-only snapshot of the current workflow state
without changing anything.

Preferred form:

```text
@dude status
```

Meaning: report the current lane, live artifact, next expected action, blockers,
and tracked execution state when Beads is active, without importing or mutating
anything. Read-only means Dude may still query Beads and the filesystem for the
current state; it does not create, import, update, or close work.

Illustrative result:

```text
Lane: Definition Only · Live: specs/001-authentication/
Action: status
Updated:
- Current lane: Definition Only
- Live artifact: specs/001-authentication/
- Defined features waiting for track: 1
Next:
- Stop here for definition-only work
- Or continue in Lightweight Execution from tasks.md
- Or run @dude track when you want tracked execution
```

When Lightweight Execution is active, the same command should point to
`tasks.md` instead:

```text
Lane: Lightweight Execution · Live: specs/001-authentication/tasks.md
Action: status
Updated:
- Current lane: Lightweight Execution
- Live artifact: specs/001-authentication/tasks.md
- Not started: 5
- In progress: 1
- Blocked: 1
- Done: 3
- Ready now: T004@91ac4e2f
Next:
- Continue execution from tasks.md
- Or use @dude flag ... if the current blocker is a real definition or plan gap
```

When tracked execution has already started, the same command can include Beads
state:

```text
Lane: Tracked Execution · Live: Beads
Action: status
Updated:
- Current lane: Tracked Execution
- Ready tasks: 2
- In progress: 1
- Defined features waiting for track: 1
Next:
- Run @dude track when you want Dude to continue tracked execution
```

Every reply that touches execution state, routes implementation work, reports
`status`, or mutates `tasks.md` carries a `Lane: <lane> · Live: <artifact>`
banner on the first line. The `Active roster:` line only appears when the
roster changed since the last reply that listed it, or when a `Roster gap:`
warning is also printed for the current lane. A `Roster gap:` line is
actionable, not a pointer — it tells you the exact `@dude hire ...` verb to
run. Use `@dude self-check` if you want the full roster on demand.

### Pending prompt replies

When Dude is waiting on a specific reply (a reconciliation gate or a manual
completion accept), the reply opens with `Awaiting: <prompt name>` and Dude
will not raise a second prompt until the open one resolves. Reply with the
tokens documented in the relevant section (`confirm reconcile`, `accept T0NN`,
etc.). If you reply with an ambiguous short token while a prompt is open,
Dude will route it to that prompt's vocabulary first.

### `@dude flag`

Use this when execution finds a real gap, mismatch, or external blocker that
should route back through Dude. The wording can be plain language; Dude handles
the internal routing.

Preferred predictable form:

```text
@dude flag spec-gap: the authentication feature does not define lockout behavior after repeated failed sign-in attempts
```

Plain-language form is also valid:

```text
@dude flag the authentication feature does not define lockout behavior after repeated failed sign-in attempts
```

Meaning: record a blocking definition problem and route it back to the right
owner.

Illustrative result:

```text
Lane: Lightweight Execution · Live: specs/001-authentication/tasks.md
Action: flag
Classified as: spec-gap
Updated:
- Blockage recorded as spec-gap
- Routed to @spec-lead for definition updates
Next:
- Review the revised package when the flagged gap is resolved
Blockers:
- Current implementation work is blocked on the missing definition
```

The `Classified as:` line is always present on `flag` replies, even when you
typed a typed prefix yourself. It teaches the typed vocabulary by example so
later plain-language flags get routed correctly.

In Lightweight Execution, `@dude flag ...` does not create a Beads issue. It
keeps the current task unchecked in `tasks.md` until the blocker is resolved or
the plan changes.

### `@dude diff`

Use this when you want a read-only summary of what Dude changed since your
previous message. Dude reads `## Coordinator Log` and reports a compact bulleted
list grouped by file (state changes, board regenerations, reconciliations,
reverted human edits). Nothing is mutated.

```text
@dude diff
@dude show changes since my last message
@dude what did you do
```

### `@dude self-check`

Use this when you want to verify Dude is following its own rules. Read-only.
Reports `OK` or `Drift: <one-line>` for each of:

- lane banner present on the last 3 routing replies
- no human-applied `[x]` drift sitting unreverted and unrecorded
- both fence pairs intact (`<!-- dude:managed:start --> ... <!-- dude:managed:end -->` and `<!-- dude:board:start --> ... <!-- dude:board:end -->`)
- `## Coordinator Log` is append-only since the last self-check
- every defined feature's `spec_path:` resolves to an existing `spec.md`
- the full active roster (always printed by self-check, unlike status)

```text
@dude self-check
```

### Reconciliation prompt replies

When `@dude define` reruns against a `tasks.md` that has Lightweight Execution
state and any task with `[x]`, `[~]`, or `[!]` would be dropped, Dude pauses
and prints a reconciliation table (kept / changed / dropped / new). Reply with
one or more of these tokens (Dude also accepts plain language and classifies
it):

- `confirm reconcile` — accept the table; proceed with the write
- `reject reconcile` — abort; keep the existing `tasks.md`
- `keep T0NN` — force-preserve a row Dude wanted to drop
- `drop T0NN` — force-drop a row Dude wanted to keep
- `archive dropped` — move dropped rows into a `## Lightweight Execution History` block at the bottom of `tasks.md` instead of discarding them

Multiple tokens may be combined: `keep T003, drop T005, confirm reconcile`.

## Prompt Cookbook

Examples below include flexible natural-language prompts beyond the core verbs
already documented in this file. Use this section for memory, debugging, team
changes, and other exploratory requests, not as a second command contract.

### Preferred prompt shapes

Prefer short, explicit prompts that name the feature and the lane you want:

```text
@dude draft authentication
@dude define authentication
@dude status
@dude implement the next task for authentication without Beads
@dude track
@dude flag spec-gap: authentication does not define lockout behavior
```

Good prompt-shape rules:

- name one feature, not a whole roadmap
- if the request spans several bounded outcomes, split them before `draft`
- say `without Beads` when you want Lightweight Execution
- typed `flag` prefixes are preferred for real blockers, but plain language is accepted when the intended type is obvious
- use `status` when you want orientation without changing state

### First-run orientation

If you want Dude to keep the opening conversation narrow, use prompts like:

```text
@dude help me start my first feature with the minimum questions
@dude I have one feature and want to just define it first
@dude I have one feature and want to implement now without Beads
@dude I want to implement from tasks.md without Beads
@dude I want tracked execution on Windows; use the shortest reliable setup path
```

The intended first-run interview is small:

1. Is this one feature or several separate outcomes?
2. Do you want to implement now or just define?
3. What hard constraints must Dude honor?

If you answer `implement now` and do not explicitly ask for Beads, Dude should
default to Lightweight Execution.

After that, Dude should recommend one next step, usually
`@dude draft <feature>`, instead of broadening the interview.

### Feedback / flagging

```text
@dude flag the export spec does not define timezone handling
@dude flag contract-mismatch: the documented payload does not match the backend route
```

### No-Beads execution

```text
@dude status
@dude implement the next task for exports without Beads
```

### Manual import fallback

```text
@dude import tasks from specs/<feature>/ into Beads
```

Requires a defined brainstorm file whose `spec_path` matches the feature. If
none exists, run `@dude draft <feature>` and `@dude define <feature>` first.

### Memory and team changes

The roster under `.github/agents/` is not fixed. Dude can add, remove, or
modify specialists at any time, and any newly hired agent becomes a routing
candidate immediately. You will also see this surfaced automatically as a
`Roster gap:` line in `@dude status` when a routing-relevant role is missing
for the current lane (e.g. `Roster gap: tester missing for implementation. Run
@dude hire a tester to add one, or proceed without verification at your own
risk.`).

Common prompt shapes:

```text
@dude hire a security specialist for auth and secrets review
@dude hire a tester
@dude list the team
@dude show roster
@dude modify backend to also cover background jobs
@dude remove frontend
@dude create a skill for contract versioning
@dude remember: exports must always include the internal audit identifier
```

Under the hood Dude follows the [team-expansion](../.github/skills/team-expansion/SKILL.md)
skill: it infers the role, creates `.github/agents/<name>.agent.md` with scope
and boundaries, and reports the addition. Routing picks up the new specialist
on the very next dispatch.

### Optional isolated worktree setup

```text
@dude create a worktree for the auth refactor
@dude set up an isolated branch workspace before changing the billing flow
```

### Debugging and completion discipline

```text
@dude debug why the invoice export tests are failing
@dude verify whether this fix is actually complete before closing the task
@dude address the reviewer feedback on export history
```

### Optional tests-first implementation

```text
@dude fix this bug with tests first
@dude implement this feature using TDD
```