# Commands And Prompt Shapes

[Back to root README](../README.md) | [Docs index](README.md) | [Workflow modes](workflow.md)

## Command Reference

Examples below use preferred invocation forms. The short rule is: `draft`
creates the working feature document, `define` turns it into a reusable package,
`track` hands that package into Beads when you choose Tracked Execution,
`status` reports state in all three lanes, `sync Beads to tasks.md` refreshes the
markdown mirror from Beads, and `flag` routes execution-time gaps back into
definition.

### Concise Command List

| Command | Description |
| ------- | ----------- |
| `@dude draft <feature>` | Create or refresh the brainstorm ledger for one feature. |
| `@dude define <feature>` | Turn a drafted feature into a reusable package under `specs/<feature>/`. |
| `@dude status` | Read-only report of the current lane, live artifact, next step, and blockers. |
| `@dude track` | Import or resume tracked execution in Beads. |
| `@dude sync Beads to tasks.md` | Refresh the non-authoritative markdown mirror from Beads. |
| `@dude flag [<type>:] <details>` | Route a real blocker or mismatch back to the right owner. Typed prefixes are preferred, but plain language is accepted. |
| `@dude diff` | Read-only summary of coordinator-owned writes since your previous message. |
| `@dude self-check` | Read-only verification that Dude followed its own rules (banner, fences, log, no silent `[x]` drift). |
| `@dude hire a <role>` | Add a new specialist to the active roster (creates `.github/agents/dude-local-<slug>.agent.md` for project-local agents). |
| `@dude list the team` / `@dude show roster` | Read-only summary of the current specialists and their scopes. |
| `@dude remove <role>` / `@dude modify <role>` | Remove or adjust an existing specialist. |
| `@dude remember: <fact>` | Save a durable constraint, decision, or project fact. |
| `@dude upgrade [--dry-run|--rollback|--ref <ref>]` | Refresh the installed Dude bundle from upstream while preserving project memory and active work. |
| `@dude import tasks from specs/<feature>/ into Beads` | Manually import a defined package into Beads when you do not want the normal automatic handoff. |

Preferred workflow verbs are `draft`, `define`, `status`, `track`, `flag`, `diff`, and `self-check`. `hire`, `remember`, `upgrade`, `sync Beads to tasks.md`, and the team-management verbs are coordinator-maintenance verbs and may be invoked any time.

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
- Review the brainstorm, then edit the draft or answer any open-question prompts
- Run @dude define authentication when the draft is ready
```

Edit `brainstorm/<slug>.md` to replace `**Your answer:** _Type your answer
here._` below each open question or adjust `## Assumptions`, then rerun
`@dude draft <feature>` to re-normalize the same file or `@dude define
<feature>` when you are ready to continue.

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
the only live board and source of truth for task state. `tasks.md` may still be
updated as a one-way portability mirror from Beads.

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
- Beads is now authoritative; tasks.md will mirror successful Dude-owned closes
- Selected ready task T001@a1b2c3d4 for implementation
Next:
- Let Dude continue the routed work
- Or run @dude status for a read-only snapshot
```

### `@dude sync Beads to tasks.md`

Use this when Beads is active but you want to refresh the markdown mirror, such
as before switching machines, falling back to Lightweight Execution, or after a
manual Beads change.

**Automatic mirror (no command needed):** when Dude itself closes or updates a
Beads issue, it mirrors the new status glyph back into the matching task row in
`tasks.md` and regenerates the derived board region. You only need the explicit
command below when the auto-mirror cannot run or has fallen behind.

**Run this command manually when:**

- Beads was changed outside Dude (for example a direct `bd update` or `bd close`).
- A discovered Beads issue was created mid-flight; close-time auto-mirror never
  appends new task headers and reports the mirror as skipped until you sync.
- You are about to switch machines, fall back to Lightweight Execution, or hand
  the feature off.
- `@dude status` reports `Mirror: stale — run @dude sync Beads to tasks.md`.

Preferred form:

```text
@dude sync Beads to tasks.md
```

Meaning: read Beads as the source of truth, map issue state back to canonical
task units by durable task key, update `tasks.md` as a non-authoritative
mirror, refresh the derived board region, record Coordinator Log entries, and
run the Dude linter. This command is mutating and is never implied by
`@dude status`.

Illustrative result:

```text
Lane: Tracked Execution · Live: Beads
Action: sync Beads to tasks.md
Updated:
- Mirrored 8 Beads tasks into specs/001-authentication/tasks.md
- Appended 1 discovered Beads issue under ## Discovered During Execution as T9001@4f2a91c0 [Shared] ... (Beads: dude-abc)
- Refreshed the derived board region
- Appended Coordinator Log entries for mirrored state changes
Skipped:
- 1 Beads issue lacked a matching durable task key and was closed (not appended)
Next:
- Continue with @dude track while Beads is available
- Or resume Lightweight Execution from tasks.md if you are intentionally falling back
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
- Mirror: stale — run @dude sync Beads to tasks.md
Next:
- Run @dude track when you want Dude to continue tracked execution
- Run @dude sync Beads to tasks.md before planned fallback to Lightweight Execution
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
- Routed to @dude-spec-lead for definition updates
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

### Validating bundle hygiene

Use the `dude-lint` skill to catch structural drift in the bundle itself:
malformed brainstorms, fence imbalance, stale `spec_path:` pointers, duplicate
or non-durable task IDs, oversized memory files, orphaned agent-handle
references, and missing coordinator-only boundary blocks. The linter is
read-only, dependency-free, and ships parity scripts for both shells.

```pwsh
pwsh .github/skills/dude-lint/lint.ps1
```

```bash
bash .github/skills/dude-lint/lint.sh
```

Exit code is `0` when no failures are reported; warnings do not fail the run.
Run it before `@dude track`, before exporting the bundle, or whenever you want
a fast structural check of the bundle.

`@dude self-check` covers the runtime drift that a static linter cannot see
(lane banner presence, manual `[x]` flips, append-only log). The two are
complementary.

### Importing agents and skills

Use the `dude-bundle-import` skill to bring a single agent (`*.agent.md`) or skill
(`<name>/SKILL.md`) into the bundle from an external repository. The skill
fetches the source, produces a structured **adaptation report** listing every
adaptation it would apply (frontmatter strips, Anthropic/Claude tool-name
references, MCP assumptions, sibling files, referenced skills, overlap with
local artifacts, missing coordinator-only block, persona drift), and waits
for explicit per-category confirmation before any write.

No runtime is installed and no remote state is modified. Python or Bash
siblings are refused by default; the user must confirm them per file.
Transitive dependencies are never auto-fetched: each one requires a fresh
`dude-bundle-import` invocation.

Use the import verb when the user supplies a URL or names an external repo:

```text
@dude import this agent from https://github.com/<owner>/<repo>/blob/<ref>/path/to/file.agent.md
@dude import this skill from https://github.com/<owner>/<repo>/tree/<ref>/path/to/skill
@dude dry-run import https://raw.githubusercontent.com/<owner>/<repo>/<ref>/SKILL.md
```

Whole-bundle save and deploy stays in the `dude-portability` skill; this
skill is single-artifact only.

### Upgrading the bundle

Use the `dude-bundle-upgrade` skill to refresh the installed Dude engine from its
source repo. The skill reads `.github/dudestuff/bundle-manifest.md`, compares
the live upstream ref HEAD against the locally recorded `installed_sha`,
fetches the configured upstream ref into an OS temp directory for
dry-run/apply, produces an upgrade report, and waits for the explicit
`confirm upgrade` token before writing.

The simple flow is status, dry-run, upgrade, rollback if needed:

```text
@dude status
@dude upgrade --dry-run
@dude upgrade
@dude upgrade --rollback
```

Useful variants:

```text
@dude upgrade --ref v1.4.0
@dude upgrade --source https://github.com/<owner>/<repo>
@dude upgrade --allow-dirty
```

Only base-owned files — those matching the namespace convention
(`.github/agents/dude.agent.md`, `.github/agents/dude-<slug>.agent.md`,
`.github/skills/dude-<slug>/**`, `.github/instructions/dude.instructions.md`,
excluding the reserved `dude-local-<slug>` namespace) — are candidates for
replacement. Project memory, `.github/skills/project/`, custom agents/skills,
`.github/copilot-instructions.md`, `brainstorm/`, `specs/`, Beads, and product
source are preserved. Root files and repository docs are intentionally excluded
from the upgrade payload. A seeded `bundle-manifest.md` is required.

> Base files matching the upstream namespace convention are upstream-owned and
> are silently overwritten on apply. To customize a default agent or skill,
> copy it under `dude-local-<slug>` first and edit there — direct edits to
> base files are discarded by `@dude upgrade`.

`installed_sha` identifies the last applied upstream source for orientation.
`@dude status` reports upgrade availability when the live upstream ref HEAD
differs from the locally recorded `installed_sha`; the upstream HEAD is read
with `git ls-remote` (remote sources) or `git rev-parse HEAD` (local-path
sources), so an upstream contributor never has to manually bump a field inside
the upstream manifest for downstream installs to see new bundle changes.

Use reserved `dude-local-` paths for project-owned artifacts:
`.github/agents/dude-local-<slug>.agent.md` and `.github/skills/dude-local-<slug>/`.
The namespace convention guarantees those will never collide with upstream
`dude-<slug>` artifacts on upgrade.
If users bypass Dude and create unprefixed custom agents or skills by hand,
`dude-lint` warns so they can rename before a future upstream artifact appears
at the same path.

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
- `archive dropped` — move dropped rows into a `## Lightweight Execution History` block at the end of `tasks.md` (preserved below any existing `## Discovered During Execution` section) instead of discarding them

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

Under the hood Dude follows the [dude-team-expansion](../.github/skills/dude-team-expansion/SKILL.md)
skill: it infers the role, creates `.github/agents/dude-local-<slug>.agent.md` with scope
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