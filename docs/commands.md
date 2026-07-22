# Commands And Prompt Shapes

[Back to root README](../README.md) | [Docs index](README.md) | [Workflow modes](workflow.md)

## Command Reference

Examples below use preferred invocation forms. The short rule is: `brainstorm`
creates one flat idea file without creating a spec package, `define` turns that
idea into a reusable package, `work` runs the next few ready tasks in whichever
execution lane is already live, `status` reports the current lane and live
artifact, and `flag` routes execution-time gaps back into definition. The
lifecycle is `brainstorm -> idea -> define -> spec -> work`. Tracked execution (`track`,
`sync Beads to tasks.md`) is provided by the optional **beads pack** — install
it with `@dude add pack beads`.

### Concise Command List

| Command | Description |
| ------- | ----------- |
| `@dude brainstorm <idea>` | Create or refresh one flat `.dude/ideas/<slug>.md` collaboration file without creating a spec package. |
| `@dude define <slug>` | Turn the matching idea into a reusable package under `.dude/specs/<feature>/`. |
| `@dude status` | Read-only report of the current lane, live artifact, next step, and blockers. |
| `@dude work [<feature>] [--max <N\|unlimited>] [--until blocked] [--parallel <N>] [--recover-on-block] [--recovery-cycles <N\|unlimited>] [--policy guarded\|autonomous]` | Run the next few ready tasks back-to-back inside whichever execution lane is already live, with optional guarded recovery and an optional autonomous policy. Not a new lane. |
| `@dude list packs` | Read-only list of available and installed optional packs. |
| `@dude add pack <name>` / `@dude remove pack <name>` | Install or uninstall an optional capability pack (e.g. `beads`, `release`, `web`, `practices`). |
| `@dude track` | Import or resume tracked execution on a tracked board. Requires the `beads` pack. |
| `@dude sync Beads to tasks.md` | Refresh the non-authoritative markdown mirror from the tracked board (beads pack). |
| `@dude flag [<type>:] <details>` | Route a real blocker or mismatch back to the right owner. Typed prefixes are preferred, but plain language is accepted. |
| `@dude diff` | Read-only summary of coordinator-owned writes since your previous message. |
| `@dude self-check` | Read-only verification that Dude followed its own rules (banner, fences, log, no silent `[x]` drift). |
| `@dude hire a <role>` | Add a new specialist to the active roster (creates `.github/agents/dude-local-<slug>.agent.md` for project-local agents). |
| `@dude list the team` / `@dude show roster` | Read-only summary of the current specialists and their scopes. |
| `@dude remove <role>` / `@dude modify <role>` | Remove or adjust an existing specialist. |
| `@dude remember: <fact>` | Save a durable constraint, decision, or project fact. |
| `@dude upgrade [--dry-run|--rollback|--ref <ref>]` | Refresh the installed Dude bundle from upstream while preserving project memory and active work. |
| `@dude import tasks from .dude/specs/<feature>/ into Beads` | Manually import a defined package into Beads when you do not want the normal automatic handoff. Requires the `beads` pack. |

Preferred workflow verbs are `brainstorm`, `define`, `status`, `track`, `work`, `flag`, `diff`, and `self-check`. `hire`, `remember`, `upgrade`, `sync Beads to tasks.md`, and the team-management verbs are coordinator-maintenance verbs and may be invoked any time.

### `@dude brainstorm`

Use this when you have a raw feature idea, a PRD, or incomplete requirements.
Dude captures that input in exactly one flat idea file that you can edit
directly. Brainstorming and defining are separate actions: this command never
creates or refreshes `.dude/specs/`.

Preferred form:

```text
@dude brainstorm authentication
```

Meaning: create or refresh the idea collaboration file for a feature.

Supported input shapes:

- Short feature name: `@dude brainstorm authentication`
- Free-text feature description:
  `@dude brainstorm a feature for email/password sign-in`
- Markdown file path: `@dude brainstorm docs/prd/billing.md`

Illustrative result:

```text
Action: brainstorm
Updated:
- .dude/ideas/authentication.md created or refreshed
Next:
- Review ## Idea, then edit it or answer any open-question prompts
- Run @dude define authentication when the idea is ready
```

The file starts with `# Idea: <title>` and frontmatter containing
`status: draft` plus an empty `spec_path:`. `## Idea` is user-controlled; active
`## Open Questions` appear immediately after it. Users may also edit
`## Assumptions` and `## Deferred Clarifications`. Dude maintains managed
`## Normalized Intent`, `## Constraints`, and `## Definition Checklist`
sections when they have content, plus `status:`, `spec_path:`, and the
append-only `## Coordinator Log`.

Informal, typo-heavy, dictated, and speech-to-text input is valid. On initial
capture, Dude may conservatively clean clear spelling, grammar, punctuation,
transcription, filler, or repetition problems while preserving meaning, tone,
uncertainty, incomplete thought, and creative intent. On rerun, it preserves
`## Idea`, answered or resolved questions, assumptions, and other user edits
unless you provide new material or request a revision. Replace each visible
`**Your answer:** _Type your answer here._` prompt or adjust assumptions, then
rerun brainstorm to re-normalize the same file or `@dude define <slug>` to
continue.

### `@dude define`

Use this when one idea captures a bounded feature. Define consumes the idea by
slug, refreshes the reusable package under `.dude/specs/<feature>/`, and may
pause once for guardrail approval before planning continues.

Preferred form:

```text
@dude define authentication
```

Meaning: create or refresh the reusable definition package for the matching
idea.

Illustrative results:

Definition completed:

```text
Action: define
Updated:
- .dude/specs/001-authentication/spec.md created or refreshed
- .dude/ideas/authentication.md updated with status: defined and exact spec_path
- Definition event appended to .dude/ideas/authentication.md Coordinator Log
Next:
- Read .dude/specs/001-authentication/spec.md first, then plan.md
- Stop here for definition-only work
- Or continue from tasks.md, starting with the generated board view, if you want Lightweight Execution without Beads
- Or run @dude track if you want tracked execution
```

Guardrail ratification required:

```text
Action: define
Updated:
- .dude/specs/001-authentication/spec.md created or refreshed
- Candidate guardrails inferred from the repo, current feature, and remembered context
Next:
- Accept, edit, reject, or skip the proposed guardrails
- Planning will continue after guardrails are ratified
Blockers:
- plan.md and later definition artifacts are paused until guardrails are ratified or bundle defaults are accepted
```

On success, define updates the same idea to `status: defined`, records the exact
workspace-relative `spec_path:` to `spec.md` (for example,
`.dude/specs/001-authentication/spec.md`), and appends to its Coordinator Log.
That exact path is the feature's canonical identity. If intent changes later,
edit the user-controlled `## Idea` and any relevant answers or assumptions,
then rerun `@dude define <slug>`; do not treat generated `spec.md` or `plan.md`
as the intent source.

### `@dude track`

Use this when you want tracked execution on a Beads board. It requires the
**beads pack** — if it is not installed yet, run `@dude add pack beads` first.
After import, Beads becomes the only live board and source of truth for task
state. `tasks.md` may still be updated as a one-way portability mirror from
Beads.

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
- Imported .dude/specs/001-authentication/spec.md into Beads
- Beads is now authoritative; tasks.md will mirror successful Dude-owned closes
- Selected ready task T001@a1b2c3d4 for implementation
Next:
- Let Dude continue the routed work
- Or run @dude status for a read-only snapshot
```

### `@dude work`

Use this when you want Dude to run the next few ready tasks back-to-back
without re-issuing one verb per task. It is **not a new workflow lane**. It
iterates inside whichever execution lane is already live (Lightweight from
`.dude/specs/<feature>/tasks.md` or Tracked from Beads) and stops on the first
natural boundary.

Preferred form:

```text
@dude work [<feature>] [--max <N|unlimited>] [--until blocked] [--parallel <N>] [--recover-on-block] [--recovery-cycles <N|unlimited>] [--policy guarded|autonomous]
```

Meaning: keep running the next ready task back-to-back in the active execution
lane until a stop condition fires.

Flags:

- `<feature>` — optional Lightweight-Execution feature selector. It must appear
  before every flag, disambiguates Lightweight work only, and is ignored when
  Tracked Execution is active.
- `--max <N|unlimited>` — overall authorization budget. The default is `3`.
  A finite value must be a positive integer; `unlimited` removes only this
  numeric cap.
- `--until blocked` — keep going until the first natural stop. It implies an
  overall max of `25` only when `--max` is omitted.
- `--parallel <N>` — compatibility-only input. It accepts a positive ASCII safe
  integer, but every accepted value is discarded after validation and
  normalizes the effective recovery capacity and `policy.parallel` to `1`; it
  grants no concurrency or fan-out authority.
- `--recover-on-block` — explicitly permit guarded recovery after the required
  post-block or post-failure inspection. Without it, inspection never
  authorizes a retry.
- `--recovery-cycles <N|unlimited>` — per-exact-target recovery budget. A
  finite value must be a positive integer. With explicit recovery, it defaults to `1`;
  without `--recover-on-block`, this flag is invalid.
- `--policy guarded|autonomous` — execution policy mode. The default is
  `guarded`; `autonomous` is an explicit opt-in. Unknown, duplicate, or
  otherwise invalid values are rejected before any mutation. Autonomy relaxes
  no hard stop, budget, verification, review, owner, evidence, lane, or close
  rule. It is orthogonal to the numeric budgets and to the compatibility-only
  `--parallel` input.

The complete invocation is validated before any claim or mutation. A second
selector, a selector after flags, invalid values, recovery cycles without
recovery opt-in, and recovery combined with `--until blocked` are rejected.
For `--parallel`, zero, signed, unsafe, non-ASCII, `unlimited`, symbolic,
missing, malformed, or duplicate values are invalid and rejected before
mutation.

The fully uncapped numeric form is experimental:

```text
@dude work --max unlimited --recover-on-block --recovery-cycles unlimited
```

`unlimited` affects only numeric budgets. It does not relax inspection,
dispatchability, no-progress detection, verification, review, or any authority
or safety stop.

Lane detection runs **once** at the start. When the **beads pack** is installed
and `bd list --all --limit 0 --json` returns one or more issues, the active lane is Tracked
Execution (per the pack's `dude-pack-beads-workflow`, after import the tracked
board is authoritative even when no work is currently executable); if the board
has issues but nothing ready or in-progress, the verb stops with `no ready Beads
work` rather than falling through to Lightweight. Otherwise the active lane is
Lightweight Execution for the named `<feature>`
(or the single unambiguous defined feature with non-`[x]` task units). If no
execution lane is live, the verb refuses with a one-line message pointing to
`@dude define` or `@dude track`.

Each iteration still runs the active lane's close protocol (Lightweight Close
Protocol or Beads Close Protocol). `dude-verification-before-completion`,
coordinator-only mutation of task glyphs, and `dude-lint` after every write
all still apply per iteration. The coordinator remains the only owner of lane
state and close events. Workflow metadata (`## Coordinator Log`, `status:`,
`spec_path:`) is Dude-managed, not user-managed. During explicit
`brainstorm`/`define` the Spec Lead maintains definition metadata and
definition-log events; the coordinator exclusively owns execution-state and
close events. `@dude work` itself only appends coordinator execution events. It
never imports features, auto-commits, or creates a new lane, board, or persisted
recovery state.

Before every task start or resume, and again after every block or failure, Work
inspects all available current-format history exactly bound to that task and
feature. Under `autonomous`, that Inspection additionally acquires exactly one
`definition-plan` evidence item — the sibling `plan.md` — ordered between
`task-history` and `lane-history`; `guarded` opens no plan path and reads no
plan. An explicit feature-only inspection is read-only: it cannot authorize
work, consume a budget, or mutate workflow state. Optional session history is
used only when it can be exactly bound; its unavailability alone is not a
blocker. Inspection admits one bounded complete evidence packet and one
Assessment bound to that Inspection's `evidenceHash`. Before authorization,
Work freshly rebuilds the Inspection; substantive drift returns
`evidence-drift` without changing state, counters, pending authorization, or
completed attempts. If the available evidence cannot fit, Work reports
descriptors only, makes no recovery assessment, and refuses recovery rather
than truncating or splitting the history. At the CLI byte boundary, captures use
canonical base64 with padded RFC 4648 encoding; fixed source-specific envelopes keep
presentation changes separate from substantive evidence without changing the
user-facing report format.

Inspection enforces fixed, non-configurable resource ceilings before it buffers
or processes evidence, so a malformed or oversized request is refused instead of
exhausting memory. Each exact ceiling is accepted; the first byte or entry past
it is refused before further work:

- `6,291,456` bytes for the complete encoded CLI request
- `1,048,576` bytes for each workspace file or decoded capture body
- `4,194,304` aggregate decoded evidence bytes per inspection
- `64` total source entries per inspection
- `64` total retained evidence descriptors per inspection
- `8,192` UTF-8 bytes for a deterministic error response

These are separate from the model-facing packet's own limit of `16` items and
`65,536` canonical bytes.

Ordinary Work always performs that post-block inspection, reports the finding,
and stops. Only `--recover-on-block` can authorize another attempt. Its overall
budget and each exact target's recovery-cycle budget are independent, and an
authorized recovery consumes both. No-progress detection still stops repeated
substantive attempts. Exact identity or required-evidence failures, changed or
ambiguous intent, required approval, unavailable dependencies, reconciliation
ambiguity, and authority or safety failures remain hard stops even when both
numeric budgets are unlimited. Fresh verification or lint failure and review
rejection stop completion and become evidence for a later inspection.

Ordinary Work does not revise definition artifacts. Explicit recovery may
repair an unchanged-intent derived definition defect only in an existing
Lightweight package and across exactly four paths: the exact owner idea ledger
plus its sibling `spec.md`, `plan.md`, and `tasks.md`. Recovery byte-preserves
the complete `## Idea`, `## Open Questions`, and `## Assumptions` sections.
`contracts/schemas.md` is outside runtime recovery and may change only through
explicit `@dude define`. The Spec Lead stages definition changes; the
coordinator owns reconciliation and execution-state changes; the guarded file
batch applies atomically; and fresh verification, lint, and independent review
still follow. Changed or ambiguous user intent returns to the user-controlled
idea and explicit definition. Tracked definition recovery is inspection-first:
only after a fresh Inspection and Assessment validation does it refuse as
unsupported, before any helper or write. These exceptions do not transfer
lane-state or close authority away from the coordinator.

Inspection findings remain transient by default. Project-reusable knowledge is
proposed through the existing memory workflow; broader recurring knowledge is
routed through the existing learning-promotion and skill-authoring workflows.
Durable retention requires the memory or skill owner to freshly inspect current
artifacts, duplicates, overlaps, and destinations. Caller or model claims of
absence, collision freedom, owner state, or write authority cannot establish
them. Work does not automatically make either form durable.

Illustrative result — Lightweight Execution:

```text
Lane: Lightweight Execution · Live: .dude/specs/001-expense-entry/tasks.md
Action: work
Updated:
- Iteration 1/3: T003@a1b2c3d4 implemented, verified, marked [x]
- Iteration 2/3: T004@e4f5g6h7 implemented, verified, marked [x]
- Iteration 3/3: T005@91ac4e2f implemented, verified, marked [x]
- 3 Coordinator Log entries appended to .dude/ideas/expense-entry.md
- dude-lint: ok after each iteration
Next:
- Run @dude work expense-entry --max 3 to continue
- Or @dude status for a read-only snapshot
```

Illustrative result — Tracked Execution with an early stop:

```text
Lane: Tracked Execution · Live: Beads
Action: work
Updated:
- Iteration 1/5: dude-abc closed, mirrored to T012@a1b2c3d4
- Iteration 2/5: dude-def claimed and implemented; verification failed
- Post-failure inspection reviewed exact issue and feature history; ordinary Work authorized no retry
Blockers:
- Stopped after iteration 2: verification failed on dude-def
Next:
- Run @dude flag test-failure: <details> to route the failure, or explicitly choose guarded recovery on a later Work run
```

Illustrative result — refusal when no execution lane is live:

```text
Action: work
Next: No active execution lane. Run @dude define <slug> to define one, or @dude track to enable Beads tracking, then @dude work.
```

Stop conditions (uniform across both lanes):

- no ready task remains
- task blocks after the required inspection (ordinary Work stops)
- verification fails (`dude-verification-before-completion`)
- reviewer rejects (`@dude-reviewer` when present)
- clarification required from the user
- no substantive progress on a recovery target
- recovery budget exhausted
- ambiguous state (lane drift, fence imbalance, identity mismatch)
- tool error during an iteration
- `--max` reached

`@dude work` is the optional accelerator described in
[docs/workflow.md](workflow.md). The full skill lives at
[.github/skills/dude-work/SKILL.md](../.github/skills/dude-work/SKILL.md).

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
- Mirrored 8 Beads tasks into .dude/specs/001-authentication/tasks.md
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
Lane: Definition Only · Live: .dude/specs/001-authentication/
Action: status
Updated:
- Current lane: Definition Only
- Live artifact: .dude/specs/001-authentication/
- Defined features waiting for track: 1
Next:
- Stop here for definition-only work
- Or continue in Lightweight Execution from tasks.md
- Or run @dude track when you want tracked execution
```

When Lightweight Execution is active, the same command should point to
`tasks.md` instead:

```text
Lane: Lightweight Execution · Live: .dude/specs/001-authentication/tasks.md
Action: status
Updated:
- Current lane: Lightweight Execution
- Live artifact: .dude/specs/001-authentication/tasks.md
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
- Tracked board from Beads: 2 ready, 1 in progress (tracker-provided, not coordinator-computed counts)
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

Meaning: record the execution blocker and route definition analysis to the right
owner. For a spec gap or contract mismatch, definition writes wait for an
explicit `@dude define <slug>`.

Illustrative result:

```text
Lane: Lightweight Execution · Live: .dude/specs/001-authentication/tasks.md
Action: flag
Classified as: spec-gap
Updated:
- Blockage recorded as spec-gap
- Routed to @dude-spec-lead for analysis and recommendations
Next:
- Run @dude define authentication before any definition artifacts are changed
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
malformed ideas, fence imbalance, stale `spec_path:` pointers, duplicate
or non-durable task IDs, oversized memory files, orphaned agent-handle
references, and missing coordinator-only boundary blocks. The linter is
read-only and runs on Node (>= 20 LTS).

```bash
node .github/skills/dude-lint/lint.mjs
```

Exit code is `0` when no failures are reported; warnings do not fail the run.
Run it before `@dude track`, before exporting the bundle, or whenever you want
a fast structural check of the bundle.

Pack **sources** under `library/packs/` are not scanned by `dude-lint` directly
(it validates installed `.github/` artifacts and `.dude/` workspace state). `dude-compose verify` closes that gap by temp-
installing every catalog pack into a throwaway bundle, linting the result, then
removing it and checking for leftovers:

```bash
node .github/skills/dude-compose/compose.mjs verify
```

It exits `2` if any pack lints with a failure or leaves artifacts behind.
Expected sibling-pack **warnings** (e.g. `hugo` referencing `docsy`/`ms-brand`
when they are not installed alongside) do not fail the run.

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

The deterministic prep behind the report — the GitHub `blob` -> `raw` URL
rewrite, the frontmatter strip plan (`compatibility`, `model`, Claude-style
`tools`), the `dude-local-*` destination naming, line-ending normalization, and
token-overlap scoring against existing local artifacts — is computed by
`dude-bundle-import/import.mjs`:

```bash
node .github/skills/dude-bundle-import/import.mjs analyze <url|path> --json   # adaptation report
node .github/skills/dude-bundle-import/import.mjs apply   <url|path> --plan plan.json
```

`analyze` never writes; `apply` executes a confirmed plan and refuses unless a
`license_disposition` is recorded when the source carries license metadata.

Use the import verb when the user supplies a URL or names an external repo:

```text
@dude import this agent from https://github.com/<owner>/<repo>/blob/<ref>/path/to/file.agent.md
@dude import this skill from https://github.com/<owner>/<repo>/tree/<ref>/path/to/skill
@dude dry-run import https://raw.githubusercontent.com/<owner>/<repo>/<ref>/SKILL.md
```

Whole-bundle save and deploy stays in the `dude-portability` skill; this
skill is single-artifact only.

### Engine scripts (deterministic helpers)

The bundle ships small, dependency-free Node (>= 20 LTS) scripts that do the
mechanical, error-prone work — parsing, deriving, validating, normalizing — so
agents keep the judgment (routing, “is it really done”, license/scope calls).
The coordinator invokes them; they are not a background service.

| Script | Purpose |
|---|---|
| `dude-lint/lint.mjs` | structural hygiene of the bundle (read-only) |
| `dude-compose/compose.mjs` | `list` / `status` / `add` / `remove` / `verify` optional packs and their versioned inventories |
| `dude-bundle-upgrade/upgrade.mjs` | refresh core files from the upstream source |
| `dude-lightweight-execution/board.mjs` | `parse` / `ready` / `next` / `render` / `set` / `apply-states` / `diff` on `tasks.md` |
| `dude-team-expansion/scaffold-agent.mjs` | emit a lint-clean `.agent.md` skeleton (`--pack` updates `pack.md`) |
| `dude-skill-authoring/scaffold-skill.mjs` | emit a lint-clean `SKILL.md` skeleton (`--pack` updates `pack.md`) |
| `dude-bundle-import/import.mjs` | `analyze` / `apply` the mechanical import prep |
| `dude-memory-ledger/memory.mjs` | `append` a memory entry, refusing near-duplicates |
| `dude-engine/lib/*.mjs` | shared engine libraries (ownership, tasks, text, text-analysis, pack-manifest) |

Installed packs may ship their own scripts too — e.g. the `beads` pack's
`dude-pack-beads-workflow/beads.mjs` (`plan-import` a `tasks.md` into `bd`
commands after a complete `bd list --all --limit 0 --json` identity preflight,
and `mirror` captured Beads state back into `tasks.md`).

The mutating commands (`board render`/`set`/`apply-states`, `beads mirror`) are
**non-mutating by default** — they print a preview; pass `--write` to apply and
refresh the coordinator snapshot. `memory append` refuses a near-duplicate unless
`--force`. Every engine script exits `0` on success, `1` on usage error, `2` on
operation error.

### Repo layout: source vs built bundle

This repository keeps the product **core** in `src/` — the `dude` / `dude-<slug>`
agents, `dude-<slug>` skills (including the engine libraries and their tests),
and `dude.instructions.md`. `.github/` holds the **built dev bundle**: the core
synced from `src/` by `scripts/build-dev.mjs`, plus the installed `authoring`
pack, so the maintainer's own `@dude` works. Consumers never see `src/`.

- `scripts/build-release.mjs` stages a test-free core bundle from `src/` plus
  only `.dude/metadata/{bundle-manifest.md,profile.md}` as seeded release metadata.
- `scripts/build-dev.mjs` syncs `src/` core into `.github/` (minus tests), while
  preserving `project`, `.dude/`, `workflows`, and installed packs.
- Run `scripts/build-dev.mjs` after editing `src/`; CI fails if `.github/` drifts
  out of sync with `src/`.

### Releases and CI

`.github/workflows/ci.yml` runs on every push and PR (Node 20 + 22): unit tests,
bundle lint, pack-source verify, a product build + lint, and the dev-bundle
drift check. `.github/workflows/release.yml` runs on a `v*` tag: it gates on the
same checks, builds the core bundle with `scripts/build-release.mjs`, and
publishes a `dude-bundle-<tag>.zip` to a GitHub Release. Unzip it at a repo root
to drop `.github/` engine files and seeded `.dude/metadata/` into place.

### Upgrading the bundle

Use the `dude-bundle-upgrade` skill to refresh the installed Dude engine from its
source repo. The skill reads the sole manifest at
`.dude/metadata/bundle-manifest.md`, compares
the locally recorded `installed_ref` against the newest release tag on the
source, fetches the resolved release into an OS temp directory for
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
```

Only base-owned files — those matching the namespace convention
(`.github/agents/dude.agent.md`, `.github/agents/dude-<slug>.agent.md`,
`.github/skills/dude-<slug>/**`, `.github/instructions/dude.instructions.md`,
excluding the reserved `dude-local-<slug>` namespace) — are candidates for
replacement. All `.dude/` project state, `.github/skills/project/`, custom agents/skills,
`.github/copilot-instructions.md`, Beads, and product
source are preserved. Root files and repository docs are intentionally excluded
from the upgrade payload. The canonical manifest is required locally and in the
upstream tree; only that path is accepted.

> Base files matching the upstream namespace convention are upstream-owned and
> are silently overwritten on apply. To customize a default agent or skill,
> copy it under `dude-local-<slug>` first and edit there — direct edits to
> base files are discarded by `@dude upgrade`.

`installed_ref` identifies the installed release version for orientation.
`@dude status` reports upgrade availability when `installed_ref` differs from the
newest release the source offers; on the `latest` channel the newest stable
`vX.Y.Z` tag is discovered with `git ls-remote --tags` (remote) or `git tag`
(local-path), so an upstream contributor never has to manually bump a field
inside the upstream manifest for downstream installs to see new releases.

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
@dude brainstorm authentication
@dude define authentication
@dude status
@dude work authentication --max 1
@dude track
@dude flag spec-gap: authentication does not define lockout behavior
```

Good prompt-shape rules:

- name one feature, not a whole roadmap
- if the request spans several bounded outcomes, split them into separate idea files before `define`
- prefer `@dude work <feature> --max 1` (Lightweight) or `@dude work` (Tracked) over natural-language paraphrases like `implement the next task`; the natural-language form still works as a fallback
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
`@dude brainstorm <idea>`, instead of broadening the interview.

### Feedback / flagging

```text
@dude flag the export spec does not define timezone handling
@dude flag contract-mismatch: the documented payload does not match the backend route
```

### No-Beads execution

```text
@dude status
@dude work exports --max 1
```

### Manual import fallback

```text
@dude import tasks from .dude/specs/<feature>/ into Beads
```

Requires exactly one flat defined idea whose exact `spec_path:` matches the
selected `.dude/specs/<feature>/spec.md`. If none exists, run
`@dude brainstorm <idea>` and `@dude define <slug>` first. Beads remains
optional; stay in Lightweight Execution from `tasks.md` when you do not want
the beads pack.

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