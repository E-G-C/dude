---
name: "dude-feature-definition"
description: "Use when drafting a brief (brainstorm) file, defining a brief into specs/<feature>/, defining a new feature, clarifying requirements, writing spec.md, planning implementation, deriving tasks.md, or analyzing consistency."
---

# Feature Definition

Dude owns feature definition natively. This skill defines the file-based brief intake plus the internal spec -> plan -> tasks workflow that starts at definition.

## Purpose

Maintain a single brief ledger under `brief/<slug>.md`, then create a complete reusable definition package under `specs/<feature>/` when the feature is defined.

## Brief Intake File

Before definition, keep feature intake in:

```text
brief/
└── feature-name.md
```

Use this structure. The minimal default template is short on purpose:

```markdown
---
title: Feature title
slug: feature-name
status: draft
spec_path:
---

# Brief: Feature title

## User Draft
[raw user input]

## Open Questions

Review the draft above. Either edit it directly or answer the questions below.

### Q1. [focused clarification question]

**Your answer:** _Type your answer here._

<!-- dude:managed:start -->
## Coordinator Log
- No coordinator events yet
<!-- dude:managed:end -->
```

Dude adds the additional managed sections (`## Normalized Intent`, `## Constraints`, `## Definition Checklist`) and user-edited sections (`## Assumptions`, `## Deferred Clarifications`) only when they have content. The full layout when populated is:

```markdown
## User Draft
[raw user input]

## Open Questions

Review the draft above. Either edit it directly or answer the questions below.

### Q1. ...

**Your answer:** _Type your answer here._

<!-- dude:managed:start -->
## Normalized Intent
- ...

## Constraints
- ...
<!-- dude:managed:end -->

## Assumptions
- ...

## Deferred Clarifications
- [questions that did not make the top-3 cap; never silently dropped]

<!-- dude:managed:start -->
## Definition Checklist
- [ ] Outcome is clear
- [ ] Scope is bounded
- [ ] Open questions are resolved or consciously assumed

## Coordinator Log
- YYYY-MM-DD HH:MM — defined -> specs/NNN-slug/spec.md
<!-- dude:managed:end -->
```

Keep `## User Draft` intact. Place `## Open Questions` immediately after it so the user reads their original idea first, then either edits that draft or answers the active questions. Format each active question as `### QN. <question>` followed by `**Your answer:** _Type your answer here._`; when the user responds, preserve the question and replace the placeholder with their answer.

The `<!-- dude:managed:start -->` / `<!-- dude:managed:end -->` HTML comment fences identify Dude-owned regions. Users should not hand-edit content inside those fences; if they do, restore the correct structure on the next `draft` or `define` and explain what was reset. Comments are invisible in rendered markdown but visible in editors, so they make ownership obvious without disrupting reading.

The `## Open Questions`, `## Assumptions`, and `## Deferred Clarifications` sections sit outside the managed fences because users edit them in place. Omit any of these sections (and any optional managed sections) until they have real content; do not emit empty scaffolding. When there are active open questions, `## Open Questions` must be the first section after `## User Draft`.

Treat `status:`, `spec_path:`, and `## Coordinator Log` as Dude-maintained workflow metadata. Users edit the feature content in place, but Dude keeps the bookkeeping consistent for later `define` and `track` steps.

Valid `status:` values are `draft` and `defined`.

`## Coordinator Log` is an append-only audit trail of coordinator-owned mutations. Append one line per event with a UTC timestamp, for example:

- `2026-04-20 14:02 — defined -> specs/001-slug/spec.md`
- `2026-04-20 15:11 — re-defined after open-question update`
- `2026-04-20 16:33 — board region regenerated in tasks.md`
- `2026-04-20 17:05 — reverted T003@a1b2c3d4 from [x] to [~]: no verification evidence`
- `2026-04-20 17:40 — reconciliation: kept 4, changed 1, dropped 0, new 2`
- `2026-04-20 18:02 — accepted manual completion of T003@a1b2c3d4 (user attestation)`

Do not rewrite history. The `@dude diff` and `@dude self-check` verbs read this log to report what changed and to detect drift.

`spec_path` is the **canonical identity** of a defined feature. It must hold the workspace-relative path to the feature's `spec.md` file (for example, `specs/001-feature-name/spec.md`), not the feature directory and not any other artifact. Beads issues created from this feature carry the same value as a `spec:` prefix in the first line of their description, and the automatic-handoff detection compares them literally. See `dude-spec-import-to-beads` `## Canonical Feature Identity` for the full rule.

## Feature Directory

When they materially apply, write feature artifacts under:

```text
specs/
└── 001-feature-name/
    ├── spec.md
    ├── plan.md
    ├── research.md
    ├── data-model.md
    ├── quickstart.md
    ├── tasks.md
    ├── contracts/
    │   ├── api.md
    │   └── schemas.md
    └── checklists/
        ├── ux.md
        ├── test.md
        └── security.md
```

Number features sequentially by scanning existing `specs/` folders and using `max existing prefix + 1`, ignoring deletions.

When definition succeeds, write the chosen `spec_path` back into the brief file (full path to `spec.md`, e.g. `specs/001-feature-name/spec.md`) and set `status: defined`.

## Step 0: Draft And Maintain `brief/<slug>.md`

### Section Responsibilities

- Users control `## User Draft`.
- Users answer `## Open Questions` in place, below each visible `**Your answer:**` prompt.
- Users may edit `## Assumptions` when clarifying or overriding defaults.
- Dude maintains `## Normalized Intent`, `## Constraints`, `## Definition Checklist`, and `## Coordinator Log`.
- Dude maintains the brief frontmatter bookkeeping: `status:` and `spec_path:`.
- Dude may update `## Assumptions` when documenting explicit defaults or resolved ambiguities.
- Preserve existing assumption bullets by default unless the latest request or a resolved clarification explicitly changes them.
- Once `## User Draft` is created, do not overwrite it.
- Re-running `draft` against an existing brief is a re-normalize operation, not a regenerate operation.
- Re-running `draft` must preserve questions the user already answered or intentionally resolved.
- Re-running `draft` may add new focused open questions only when the latest request introduces new ambiguity or materially changes scope.
- If a user edits Dude-maintained bookkeeping without clear intent, restore the correct structure and explain the change instead of silently carrying broken metadata forward.

If the feature later enters Lightweight Execution, `tasks.md` may serve as the live markdown execution board until Beads import. It may also carry a Dude-generated board region inside the same file with `## Ready Now`, `## In Progress`, `## Blocked`, and `## Done` sections; those sections are derived guidance, not a second ledger. If the feature is later imported into Beads, Beads becomes authoritative and `tasks.md` may only be updated as a one-way portability mirror from Beads. Refresh generated artifacts through `define`; do not create a second execution ledger.

On `draft` or other early-stage requests:

1. Create or identify `brief/<slug>.md`.
2. Preserve the raw user draft in `## User Draft`.
3. Normalize the requested outcome in `## Normalized Intent`.
4. Record constraints, assumptions, and any new focused open questions in the same file without discarding or reopening questions the user already resolved, and without changing existing assumption bullets unless the latest request explicitly requires it. Keep active open questions immediately after `## User Draft` and use the `### QN.` / `**Your answer:** _Type your answer here._` format.
5. Keep the file in `status: draft` until definition is requested.
6. Do not create `specs/<feature>/` yet unless the user has asked for definition or the workflow explicitly moves to that stage.

### Scope Sanity During Draft

Before treating a draft as one feature, check whether the request looks more like several separate outcomes or a roadmap. Strong signals include:

- 3 or more distinct user outcomes with separate success tests or acceptance expectations
- multiple disjoint user journeys with different success tests
- unrelated artifact areas or domains that would naturally become separate packages
- wording like "and also" repeated across separate deliverables
- a PRD or brief that reads like a backlog rather than one bounded slice

When those signals are present, do not silently carry the scope forward. Ask one narrow split question or recommend separate brief files before definition.

## Step 1: Write `spec.md`

`spec.md` defines WHAT to build and WHY. It must be technology-agnostic — no languages, frameworks, or API details.

Definition creates or refreshes the feature package under `specs/<feature>/`. A lean package is valid when some standard artifacts do not materially apply. From that point onward, the internal workflow stays the same.

Re-running `define` against an in-flight package is a resume operation: re-read the brief, apply newly answered questions or updated assumptions, and refresh the package instead of starting from scratch.

### Required Sections (in order)

#### User Scenarios & Testing

Prioritized user stories ordered by importance. Each story must be independently testable — implementing just one should deliver a viable MVP slice.

For each story:

- **Title and priority** (`P1`, `P2`, `P3`)
- **Why this priority**: value justification
- **Independent test**: how to verify it works on its own
- **Acceptance scenarios**: Given/When/Then format

```markdown
### User Story 1 — [Title] (Priority: P1)

[Plain language description]

**Why this priority**: [value justification]

**Independent Test**: [how to verify this story alone]

**Acceptance Scenarios**:

1. **Given** [state], **When** [action], **Then** [outcome]
2. **Given** [state], **When** [action], **Then** [outcome]
```

#### Edge Cases

Boundary conditions and error scenarios the spec must address.

#### Functional Requirements

Numbered, testable requirements:

- `FR-001`: System MUST [capability]
- `FR-002`: Users MUST be able to [interaction]

#### Key Entities (when data is involved)

Domain objects, relationships, and key attributes — without implementation details.

#### Success Criteria

Measurable, technology-agnostic outcomes:

- `SC-001`: [quantitative or qualitative measure]
- `SC-002`: [verifiable without implementation details]

#### Assumptions

Reasonable defaults for unspecified details. Document what was assumed and why.

### Clarification Rules

- Mark genuine ambiguity with `[NEEDS CLARIFICATION: specific question]`.
- **Maximum 3 markers per spec.** Prioritize by impact: scope > security/privacy > user experience > technical details.
- For everything else, make an informed default and document it in Assumptions.
- Do not plan or derive tasks until all markers are resolved.
- **Never silently drop overflow questions.** When more than 3 ambiguities exist, place the lowest-priority items into `## Deferred Clarifications` in `brief/<slug>.md` so the user can see what was set aside.
- **Re-rank deferred items on every `define` rerun.** Compare each `## Deferred Clarifications` entry against the current active `[NEEDS CLARIFICATION]` markers using the same scope > security > UX > technical priority. If a deferred item now outranks an active marker, surface a one-line prompt in the response: `Promote D2 "<question>" over <FR-ID> marker?` and wait for `yes` / `no` before swapping. Do not silently rotate items in or out.

## Step 2: Write `plan.md`

`plan.md` defines HOW to build the feature.

### Required Sections

#### Summary

One paragraph: primary requirement plus technical approach.

#### Technical Context

Fill these fields (mark unknowns as `NEEDS CLARIFICATION`):

```markdown
**Language/Version**: [e.g., Python 3.11, TypeScript 5.x]
**Primary Dependencies**: [e.g., FastAPI, React]
**Storage**: [e.g., PostgreSQL, SQLite, N/A]
**Testing**: [e.g., pytest, vitest]
**Target Platform**: [e.g., Linux server, browser, iOS]
**Project Type**: [e.g., library, CLI, web-service, mobile-app]
**Performance Goals**: [domain-specific or NEEDS CLARIFICATION]
**Constraints**: [domain-specific or NEEDS CLARIFICATION]
```

#### Guardrail Check

Validate against `.github/dudestuff/guardrails.md`. If only bundle defaults exist, infer candidate project guardrails from the current repo, remembered context, and early definition artifacts, keep the set minimal for clearly solo or exploratory repos, and continue planning without a separate pause when that inference yields no new project-specific guardrails. Only present accept/edit/reject/skip choices before planning when there are actual new project-specific guardrails to ratify. `skip` means continue with bundle defaults only and no new project-specific guardrails. Re-check after design.

#### Project Structure

Concrete directory layout for this feature (not options — a single chosen structure with rationale).

#### Complexity Tracking

Only if the guardrail check has violations that must be justified:

```markdown
| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
```

#### Phases

High-level phase breakdown that will feed into `tasks.md`.

## Step 2a: Validate Spec Before Planning

Before writing `plan.md`, validate `spec.md` against these criteria:

- No implementation details (languages, frameworks, APIs) in the spec
- All mandatory sections completed
- Requirements are testable and unambiguous
- Success criteria are measurable and technology-agnostic
- All acceptance scenarios defined
- Edge cases identified
- No unresolved `[NEEDS CLARIFICATION]` markers remain

If validation fails, fix the spec first. Maximum 3 validation-fix iterations before warning the user.

## Step 3: Write Supporting Artifacts

Create only the artifacts the feature actually needs:

- `research.md` for technical decisions and unknowns
- `data-model.md` for entities and relationships
- `contracts/api.md` for endpoints and shapes
- `contracts/schemas.md` for validation or shared data contracts
- `quickstart.md` for feature smoke-test steps and manual verification flows
- `checklists/` for focused domain checks when useful

A lean package is preferred over scaffolding placeholder files for domains that do not apply to the feature.

### Checklist Files

Checklists are optional, domain-specific quality gates kept alongside the spec. Create a file only when that domain materially applies to the feature.

- `checklists/ux.md` — user-facing quality checks: content copy, empty/loading/error states, accessibility (WCAG 2.1 AA), keyboard navigation, responsive breakpoints, and any design-system conformance the feature must satisfy.
- `checklists/test.md` — verification coverage the tester must confirm before acceptance: acceptance scenarios from `spec.md`, edge cases, regression hotspots, and any manual QA steps that cannot be automated.
- `checklists/security.md` — security-relevant checks for the feature: authN/authZ boundaries, input validation at trust boundaries, secret handling, sensitive-data storage and logging, and relevant OWASP Top 10 risks.

Each checklist is a plain markdown list of `- [ ]` items. Keep items testable and specific to this feature — do not restate generic project rules that already live in `.github/dudestuff/guardrails.md` or `.github/skills/project/SKILL.md`.

During Lightweight Execution and Beads import preparation, checklist files are advisory reference, not a second live execution board. Do not mirror `tasks.md` completion state into checklist files unless the project explicitly requires that extra workflow.

## Step 4: Derive `tasks.md`

`tasks.md` converts the plan into executable work.

### Task Format

Each canonical task header follows this format:

```markdown
- [ ] T001@a1b2c3d4 [P] [US1|Shared] Description with file paths
    deps: T000@e4f5g6h7, T002@91ac4e2f
    blocked-by: spec-gap: contract still needs a retry policy
```

- `T001` — sequential task ID that stays easy for humans to scan
- `a1b2c3d4` — durable task key suffix used for reconciliation across re-define and later Beads handoff
- `[P]` — parallel-safe (no dependencies within phase)
- `[US1]` — maps to User Story 1 from `spec.md`
- `[Shared]` — setup, foundational, or polish work that supports multiple stories
- task-state glyphs are: `[ ]` not started, `[~]` in progress, `[!]` blocked, `[x]` done
- optional indented `deps:` lines list explicit durable-key blockers in addition to the normal phase-order rules
- optional indented `blocked-by:` lines summarize a blocker and are expected when the task header is `[!]`
- Description should include concrete file paths when possible

Canonical regex for task header lines (Python `re` syntax):

```
^- \[( |~|!|x)\] (T\d{3,}@[a-z0-9]{8}) (\[P\] )?\[(US\d+|Shared)\] (.+)$
```

Lines starting with a task-state glyph (`- [ ]`, `- [~]`, `- [!]`, or `- [x]`) that do not match this pattern should be treated as malformed. Stop import and request a corrected `tasks.md`. Indented metadata lines must follow `  deps: ...` or `  blocked-by: ...` and belong to the immediately preceding task header.

`tasks.md` may also contain a Dude-generated board region near the top of the file, fenced by HTML comments such as `<!-- dude:board:start -->` and `<!-- dude:board:end -->`. The first line inside the fence must be the literal notice `<!-- generated by @dude — do not hand-edit; regenerated on every status/define refresh -->`. The region may include `## Ready Now`, `## In Progress`, `## Blocked`, and `## Done`, is derived wholesale from the canonical task units below it, and is regenerated as a complete replacement (not patched in place); do not parse it as canonical task state.

The **first line of `tasks.md`** (above the board fence) must be an audit-log breadcrumb pointing at the companion brief so users editing `tasks.md` can find where coordinator events are recorded:

```markdown
<!-- audit log: brief/<slug>.md#coordinator-log -->
```

If `tasks.md` may also include a `## Lightweight Execution History` block (created when the user replies `archive dropped` to a reconciliation prompt), that block must be the **final task section** of the file — when `## Discovered During Execution` is also present, the discovered section is preserved immediately above it. The history block holds dropped task rows that previously carried `[x]` / `[~]` / `[!]` state, and is **read-only context**:

- it is never re-parsed as canonical task units on later `define` runs
- it is never regenerated, rewritten, or pruned by `define`
- it does not appear in the generated board region
- once a row lands there, it stays there as evidence of work that was completed before a re-define dropped the task

The import-readiness checks and parallel-dispatch rules ignore this block entirely.

`tasks.md` may also include a `## Discovered During Execution` section, owned by `@dude sync Beads to tasks.md` and described in `dude-beads-workflow`. This section holds task headers in the reserved **`T9001`–`T9999`** range that mirror Beads issues created mid-flight (each carries a `(Beads: <id>)` tag in its description). `@dude define` must treat it as preserved context:

- it is never re-parsed as spec-derived canonical task units on later `define` runs
- it is never regenerated, rewritten, pruned, or re-keyed by `define`; preserve the section verbatim when refreshing the rest of `tasks.md`
- when `## Lightweight Execution History` is also present, preserve `## Discovered During Execution` immediately before it because the history block is terminal archive context
- it does not appear in the generated board region
- it is excluded from the Re-define Reconciliation Gate (its rows never appear in the `kept`, `changed`, `dropped`, or `new` buckets)

Spec-derived task headers emitted by `define` must use `TNNN` values **below `T9000`**, leaving the `T9001`–`T9999` range exclusively for sync-appended discovered work. This keeps re-define and sync free of TNNN collisions even if discovered work was appended between two `define` runs.

A single bounded task may cover closely related code, tests, and documentation when one independent test or verification command proves the whole slice. Do not split tasks mechanically just to separate artifact types.

During Lightweight Execution, task headers may move between `[ ]`, `[~]`, `[!]`, and `[x]`. Keep the human task ID stable where the task still means the same work, and preserve the durable task key whenever the same task survives a re-define, so state can be reconciled instead of silently lost.

Only preserve a non-open task automatically when the durable task key still matches. If the durable key is missing or differs, treat the task as new and leave it open. If a task is split, merged, re-scoped, or moved to a different story or goal, do not silently carry completion or blockage forward. Explain the reconciliation in the coordinator response and leave the resulting tasks open unless the mapping is truly one-to-one.

### Re-define Reconciliation Gate

When `@dude define` refreshes a `tasks.md` that already carries Lightweight Execution state (any `[~]`, `[!]`, or `[x]` task headers), the coordinator response must include a reconciliation table before writing the new file:

| Status | Old key | New key | Action |
|--------|---------|---------|--------|
| kept | T003@a1b2c3d4 | T003@a1b2c3d4 | state preserved |
| changed | T004@e4f5g6h7 | T004@77aa11bb | re-keyed; state preserved |
| dropped | T005@91ac4e2f | — | task removed; prior `[x]`/`[~]`/`[!]` will be lost |
| new | — | T009@bb22cc33 | added in this refresh |

This gate is a hard stop, not advisory:

- If any row in `dropped` previously held `[x]`, `[~]`, or `[!]` state, **pause writing the file** and require explicit user confirmation before discarding that history. Suggest moving the dropped task into a Lightweight Execution history block in `tasks.md` if the user wants to keep evidence of completed work.
- If `dropped` is empty or only contains `[ ]` rows, proceed without confirmation but still surface the table in the response.
- Always report the table in the coordinator's `Updated:` block so the reconciliation is auditable, and append a one-line summary to `## Coordinator Log` (`reconciliation: kept N, changed N, dropped N, new N`).

**Reply tokens for the reconciliation prompt** (Dude also accepts plain language and classifies it):

- `confirm reconcile` — accept the table as shown; proceed with the write
- `reject reconcile` — abort; keep the existing `tasks.md` and revisit the brief
- `keep T003` / `keep T003@a1b2c3d4` — force-preserve a row Dude wanted to drop
- `drop T003` / `drop T003@a1b2c3d4` — force-drop a row Dude wanted to keep
- `archive dropped` — move dropped rows into a `## Lightweight Execution History` block at the end of `tasks.md` (preserved below any existing `## Discovered During Execution` section so history remains the terminal archive) instead of discarding them

Multiple tokens may be combined in one reply (`keep T003, drop T005, confirm reconcile`).

Phase headings, Goal, Independent Test, Checkpoint, generated board-region lines, and other structural prose lines are not task headers and are skipped during import. Indented `deps:` and `blocked-by:` lines are task metadata, not standalone task headers.

### Import-Readiness Checks

Before handing a defined package back to the coordinator as import-ready, verify that:

- `spec.md` has no unresolved `[NEEDS CLARIFICATION]` markers
- the brief file is ready to carry `status: defined`
- `spec_path` points to the exact `spec.md` path that will identify the feature later
- every canonical task header in `tasks.md` matches the canonical task format, any metadata lines are well-formed, and any non-open lightweight-execution headers preserve the same durable key and labels
- any generated board region is clearly derived and may be regenerated without changing canonical task state
- the handoff notes make clear that `tasks.md` may be the live markdown execution board before import, but becomes only a non-authoritative Beads mirror after Beads import

### Phase Pattern

Use this sequence when it fits the feature:

1. **Phase 1: Setup** — project initialization and basic structure
2. **Phase 2: Foundational** — blocking prerequisites for all stories (no story work until this phase is complete)
3. **Phase 3+: User Story N** — one phase per user story, in priority order from `spec.md`
4. **Final: Polish** — cross-cutting concerns

Setup, foundational, and polish tasks may use `[Shared]` instead of a story label when they unblock multiple stories.

Each user story phase includes:

- **Goal**: brief description of what the story delivers
- **Independent Test**: how to verify this story on its own
- **Tests** (optional, only if requested): test tasks FIRST, ensure they fail, then implementation
- **Implementation**: concrete tasks with file paths
- **Checkpoint**: "At this point, User Story N should be fully functional"

### Priority Mapping (for Beads import)

- P1 story tasks → priority 1 (high)
- P2 story tasks → priority 2 (medium)
- P3 story tasks → priority 3 (low)
- Setup/foundational → priority 1
- Polish → priority 3

### Dependency Rules

- Tasks marked `[P]` within a phase have no blocking dependencies on each other.
- Non-`[P]` tasks depend on all earlier tasks in the same phase.
- Cross-phase: every task in Phase N+1 depends on ALL tasks of Phase N completing.
- Optional `deps:` lines add explicit blockers by durable task key and should be used when the default phase ordering is not specific enough.
- Do not invent dependencies from mere adjacency — only where a real blocker exists.

## Step 5: Analyze Consistency

Before handoff, verify:

- every task traces to a real plan decision or requirement
- every plan section traces to the spec
- contracts match the plan
- no unresolved clarification markers remain
- each user story is independently testable
- tasks do not invent scope absent from the spec

## Step 6: Run `dude-lint`

After writing or refreshing `brief/<slug>.md`, `specs/<feature>/spec.md`, `specs/<feature>/tasks.md`, or any other definition artifact, run the `dude-lint` skill. It catches structural mistakes in the files this skill just mutated:

- brief frontmatter, `status:`, `spec_path:` resolution, fence balance, `## Coordinator Log` heading
- task file board fences, glyph values, durable task IDs, duplicate IDs

Run it with Node:

```bash
node .github/skills/dude-lint/lint.mjs
```

If the linter reports `[FAIL]`, fix the structural issue before declaring the package defined. Warnings are advisory but should be reviewed in the same pass. The linter is read-only and runs on Node.

## Handoff To Beads

After the definition package is clean:

1. Tell the coordinator the feature is defined and ready.
2. If architecture sanity is useful, route the package to `@dude-lead`.
3. If an independent readiness judgment is needed, route the package to `@dude-reviewer`.
4. Do not route definition packages to `@dude-tester` by default.
5. The normal workflow lets `@dude track` import defined features into Beads automatically.
6. Explicit manual import is a fallback when the user asks for it.
7. Before import, `tasks.md` may be the live markdown execution board only in Lightweight Execution.
8. Treat Beads as the live execution board and source of truth after import; any `tasks.md` updates after that are one-way Beads-derived mirror writes only.

## Guardrails

- Do not split one feature across multiple brief files unless the user wants separate defined packages.
- Do not hide pre-spec clarification in chat when it belongs in the brief file.
- Do not invent a second execution ledger when Lightweight Execution is active; use `tasks.md` until Beads import.
- Do not bury execution state in markdown after Beads import.
- Do not mix implementation code into spec artifacts.
- Do not skip clarification when the spec is materially ambiguous.
- Do not derive tasks before the plan is coherent.
- Do not let `tasks.md` drift away from the plan.
