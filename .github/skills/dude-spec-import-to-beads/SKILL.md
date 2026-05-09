---
name: "dude-spec-import-to-beads"
description: "Use when importing feature tasks from specs/ into Beads, automatically importing defined feature packages during @dude track, converting tasks.md into issues, mapping user stories to tasks, or creating Beads dependencies from Dude-defined feature artifacts."
---

# Spec Import To Beads

How to read Dude-defined feature artifacts and import them into Beads.

Defined brainstorm files may point at definition packages through `spec_path:`. The coordinator can use that pointer for automatic import during `@dude track`.

## Canonical Feature Identity

One value identifies a defined feature across the brainstorm ledger and Beads:

- The brainstorm `spec_path:` field holds the workspace-relative path to the feature's `spec.md` (for example, `specs/001-feature-name/spec.md`).
- Every Beads issue imported from that feature carries the same value as a **structured first line** in its `--description`: `spec: specs/001-feature-name/spec.md`.
- A feature is considered "already represented in Beads" iff at least one Beads issue exists whose description starts with `spec: <spec_path>` (literal string match against the brainstorm's `spec_path` value). To check, run `bd list --json` and filter issue descriptions for the prefix.

The Beads CLI does not have a native `--spec-id` flag. The description prefix is the carrier. Do not use the feature directory, the brainstorm file path, or the epic ID as the identity.

Treat `spec_path:` as Dude-maintained metadata. If it changes after import, or after Lightweight Execution has already recorded non-open task state in `tasks.md`, stop and reconcile the affected identity before continuing.

## Feature Directory Structure

Dude writes feature definitions under `specs/`:

```text
specs/
└── 001-feature-name/
    ├── spec.md
    ├── plan.md
    ├── research.md
    ├── data-model.md
    ├── tasks.md
    ├── contracts/
    │   ├── api.md
    │   └── schemas.md
    └── quickstart.md
```

## Reading Definition Artifacts

### `spec.md`

- prioritized user stories
- acceptance criteria in Given/When/Then format
- functional requirements
- edge cases
- key entities

### `plan.md`

- architecture
- project structure
- technical choices
- implementation phases

### `tasks.md`

- `T001@a1b2c3d4` style task IDs with a human sequence plus durable suffix
- task-state glyphs: `[ ]` not started, `[~]` in progress, `[!]` blocked, `[x]` done
- `[P]` for parallel-safe tasks
- optional indented metadata lines such as `deps:` and `blocked-by:`

Compatible task-header regex (Python `re` syntax, defined in `dude-feature-definition` skill):

```
^- \[( |~|!|x)\] (T\d{3,}(?:@[a-z0-9]{8})?) (\[P\] )?\[(US\d+|Shared)\] (.+)$
```

Every canonical task header line must match this pattern. Indented metadata lines must follow `  deps: ...` or `  blocked-by: ...` and belong to the immediately preceding task header. Lightweight-execution headers may appear as `[ ]`, `[~]`, `[!]`, or `[x]`; import `[ ]`, `[~]`, and `[!]` as open work, and skip `[x]` as completed history. Legacy `T001` lines without a durable suffix remain acceptable during migration. If a task header is malformed, metadata is orphaned, or labels conflict, stop the import and fix `tasks.md` first. Phase headings, Goal, Independent Test, Checkpoint, generated board-region lines, and other structural prose lines are not task headers and are skipped during import.
- `[US1]`, `[US2]` story labels
- `[Shared]` for cross-story setup, foundational, or polish work
- phased ordering

## Active Feature Selection

### Automatic mode (`@dude track`)

- Scan `brainstorm/` for files with `status: defined` and a populated `spec_path:`.
- For each defined entry, run `bd list --json` (or an equivalent query) and check whether any issue's description starts with `spec: <spec_path>`. If none do, import the feature; otherwise skip it.
- Use the brainstorm file as the authoritative pointer during this automatic handoff.
- Do not ask the user for a `specs/<feature>/` path during this automatic mode.

### Manual mode (explicit import prompt)

Manual import still requires a defined brainstorm file as the identity source:

- Resolve the feature directory from the user's input or from `specs/`.
- Scan `brainstorm/` for a file whose `spec_path` matches `<selected-dir>/spec.md`. If no matching brainstorm file exists, stop and tell the user to run `@dude draft <feature>` first so a brainstorm ledger is created and later defined.
- Once the brainstorm file is found, use its `spec_path` as the canonical identity for the import.
- Do not guess when multiple feature directories exist in manual mode.

## After Import

- Beads becomes the only live board for execution state.
- `spec.md`, `plan.md`, `tasks.md`, and supporting artifacts remain as reference context for the specialists.
- `tasks.md` is reference-only after import; do not use it as a second task board.
- If the feature previously used Lightweight Execution, checked `- [x]` task lines remain as history and are not imported again.
- If the feature previously used Lightweight Execution, `[~]` and `[!]` state should map forward into Beads issue status instead of being silently flattened.
- Report how many open tasks were imported and how many checked tasks were skipped as Lightweight Execution history.
- If completed lightweight history no longer reconciles one-to-one by durable task key, or by task ID, story label, and core task intent when a durable key is absent, pause the import, report the surviving IDs versus changed or ambiguous IDs, and ask the user to confirm which completions still survive before creating more Beads work.
- If the intended feature meaning changes, refresh the package via `@dude define <feature>` and reconcile import state instead of hand-editing task status in markdown.
- If execution finds a missing requirement or mismatch, route it back through `@dude flag ...` rather than silently changing canonical metadata.

## Import Algorithm

1. Select the feature directory using the rules above.
2. Before parsing, run the `dude-lint` skill (`pwsh .github/skills/dude-lint/lint.ps1` or `bash .github/skills/dude-lint/lint.sh`). The linter validates the brainstorm's `status:` and `spec_path:` fields, the `## Coordinator Log` heading, the `tasks.md` board fences, glyph values, and durable task IDs. If it reports any `[FAIL]`, stop the import and route the structural fix back through `dude-feature-definition` first; importing a malformed package would corrupt the resulting Beads issues.
3. Read `spec.md` to extract feature intent and user stories.
4. Read `plan.md` to extract architecture, structure, and stack choices.
5. Read `tasks.md` to extract executable task units and ordering. Parse task headers using the canonical glyph-aware format, capture any indented `deps:` or `blocked-by:` metadata, and ignore the generated board region because it is derived guidance, not canonical task state. Import `[ ]`, `[~]`, and `[!]` task units as open work; skip `[x]` as completed Lightweight Execution history. If any task header or metadata line is malformed, ambiguous, or carries conflicting story labels, stop and request a corrected `tasks.md` before import.
6. If checked Lightweight Execution history exists, verify that each checked item still maps one-to-one by durable task key, or by task ID, story label, and core intent when a durable key is absent. When that reconciliation is ambiguous after a re-define, stop automatic import. Report three buckets to the user: surviving checked IDs, changed or removed checked IDs, and ambiguous replacements that need confirmation.
7. Create one Beads epic for the feature if not already represented. The epic exists for grouping, audit, and UI navigation only — it is never an actionable task. Its description must start with `spec: <spec_path>` (the brainstorm's exact `spec_path` value). Keep it out of the ready queue by setting its status to `deferred`; low priority alone is not sufficient.
8. Create Beads task issues for executable task units. Each issue's `--description` must start with `spec: <spec_path>` as the first line, followed by task details. Map `[ ]` to an open Beads task, `[~]` to an in-progress Beads task, `[!]` to a blocked Beads task when blocker data is available, and skip `[x]` as completed markdown history. Example:
    ```
        bd create "T006@c7d2f1a9 [US1] Add CSV row mapping" -t task -p 1 \
      --description="spec: specs/001-invoice-exports/spec.md
        Task: T006@c7d2f1a9 [US1] Add invoice-to-CSV row mapping
    Files: src/modules/invoices/exports/application/map-invoice-to-csv.ts
    Story: US1 — Filtered CSV exports" --json
    ```
    Do not attach imported task issues to the epic with `--parent` or any `parent-child` dependency. In Beads, that relationship blocks readiness; the epic stays as a non-blocking grouping marker, and child tasks are linked to the feature via the description `spec:` prefix and labels instead.
9. After the `spec:` first line, preserve these details in each issue description:
     - original task key (e.g., `T012@d4e5f6a7`)
    - original markdown state (e.g., `[~]` or `[!]`)
   - story label (e.g., `US1`)
   - relevant file paths
    - explicit `deps:` values when present
    - `blocked-by:` reason when present
   - acceptance hints or checkpoint text
   - source artifact path
10. Verify that every created issue's description starts with `spec: <spec_path>` using the brainstorm's exact `spec_path` value. If a single feature ends up with mixed `spec:` prefixes across issues, automatic handoff cannot reliably detect it as imported. Stop and reconcile before continuing.
11. If existing issues already use the feature's `spec:` prefix but the brainstorm now points at a different `spec_path`, stop and reconcile the canonical identity before creating or updating more issues.
12. Derive dependencies using the task structure rules:
    - explicit `deps:` values become direct issue dependencies first
    - every task in Phase N+1 depends on all tasks in Phase N unless the source already modeled the same blockers explicitly
    - non-`[P]` tasks depend on all earlier tasks in the same phase when no explicit dependency already covers that ordering
    - `[P]` tasks do not depend on sibling tasks unless `deps:` or the source text states a real blocker
13. If any create or update operation fails mid-import, stop and report the partial state. Do not declare the migration complete while the feature is split across markdown-only state and partial Beads state.
14. Report created issue count, imported in-progress count, imported blocked count, skipped completed-task count, dependency count, and actionable ready task count.

## Mapping Rules

- feature title -> Beads epic title
- user story -> label, section marker, or child grouping in issue description
- `[Shared]` -> setup/foundational/polish work not tied to a single user story
- `[ ]` -> open Beads task issue
- `[~]` -> in-progress Beads task issue
- `[!]` -> blocked Beads task issue
- `[x]` -> completed markdown history, not imported again
- `[P]` marker -> parallel-eligible within the phase
- checkpoint text -> acceptance or completion notes

## Priority Mapping

When creating Beads issues, translate spec priorities:

- P1 story tasks → `bd -p 1` (high)
- P2 story tasks → `bd -p 2` (medium)
- P3 story tasks → `bd -p 3` (low)
- Setup/foundational tasks → `bd -p 1`
- Polish tasks → `bd -p 3`

## Guardrails

- Do not auto-import from `@dude status` or other read-only commands.
- Do not guess a defined feature when the brainstorm file is missing `spec_path:` or points to a missing package.
- Do not keep going when the brainstorm's `spec_path` and imported Beads issue prefixes disagree; reconcile first.
- Do not keep going when `spec_path` drift or task-reconciliation ambiguity makes completed lightweight history unreliable; reconcile first.
- Do not leave the feature epic as actionable ready work. Defer it or otherwise keep it out of `bd ready` selection.
- Do not continue to use `tasks.md` as the live execution board after import.
- Do not parse or import the generated board region as if it were canonical task state.
- Do not attach imported task issues to the feature epic with `--parent` or any other `parent-child` dependency; it blocks the ready queue.
- Do not ignore partial import failure. Stop and report what was created, what was skipped, and what still needs repair.
- Do not skip phase gating: later-phase tasks must not become ready before the prior phase is complete.
- Do not invent extra sibling dependencies beyond what `deps:`, `[P]`, ordering, and source text justify.
- Do not guess at malformed task headers or orphaned metadata. Stop import and request a corrected `tasks.md` when task IDs, labels, state glyphs, or dependency structure are ambiguous.
- Do not collapse multiple materially different tasks into one issue unless the source task is too granular to execute independently.
- When something in the spec is ambiguous, resolve it before import instead of guessing.
- `spec.md` is the source of truth for WHAT to build; `plan.md` is the source for HOW.
