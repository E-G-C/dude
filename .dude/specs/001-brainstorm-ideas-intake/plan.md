# Implementation Plan: Brainstorm Ideas Intake

## Summary

Replace the canonical pre-spec ledger contract with flat `.dude/ideas/<slug>.md` files and make `@dude brainstorm` the primary intake action while preserving `@dude draft` as a deprecated behavioral alias. Implement from the shared path contract outward, extending the existing atomic workspace migrator with the same digest-bound plan/apply pattern used by profile reconciliation, a pure CommonMark-aware ledger transform, complete destination/task/tracker snapshots, and strict pre-mutation drift checks. After core consumers and migration/lint tests pass, a coordinator-owned dogfood cutover migrates this live package and reconciles the project memory and project-local skill that build-dev preserves before generated-core or Beads installed-layout validation; optional packs, docs, development output, and release output follow that cutover.

## Technical Context

**Language/Version**: Node.js ECMAScript modules with `// @ts-check`; Markdown agent, instruction, skill, and documentation artifacts  
**Primary Dependencies**: Node.js standard library including cryptographic hashing, existing Dude engine helpers, the digest-bound profile reconciliation pattern in `dude-compose`, the workspace migration journal, and optional Beads CLI integration  
**Storage**: File-backed project state under `.dude/ideas/` and `.dude/specs/`; optional Beads issue descriptions retain exact `spec_path` identity  
**Testing**: `node:test`, temporary filesystem fixtures, spawned CLI integration tests, source/generated parity checks, Dude lint, and a scoped terminology consistency test  
**Target Platform**: VS Code/Copilot workspaces on macOS, Linux, and Windows; symbolic-link cases remain platform-gated where filesystem semantics differ  
**Project Type**: Reusable agent bundle with file-based workflow CLIs, optional packs, generated dogfood output, and a staged release bundle  
**Performance Goals**: Keep intake, lint, hashing, and migration inventory linear in the number and size of managed files, with deterministic sorting bounded by inventory size; add no network dependency or background work  
**Constraints**: Preserve exact-file `spec_path` semantics; keep ideas flat; perform no implicit legacy migration; bind apply to the exact reviewed source, destination, task-audit, and tracker snapshot; validate roots and ancestors before inventory; prevent split ledgers and symbolic-link substitution; avoid generic prose replacement; preserve unrelated dirty worktree changes and dogfood knowledge/history; reconcile active project-local ledger guidance before build-dev; and keep release output free of project state beyond its existing generic project-skill stub

## Spec Quality Validation

- Required spec sections are complete and ordered.
- All five user stories have independent tests and Given/When/Then acceptance scenarios.
- Functional requirements are testable and success criteria are measurable without prescribing implementation technology.
- Edge cases cover rough input, reruns, flat-layout violations, mixed state, migration collisions, both CommonMark fence styles, source/destination/task/tracker drift, symbolic-link substitution, identity failures, preserved contradictory dogfood guidance, build output, and unrelated generic prose.
- No unresolved clarification markers remain.

Result: passed before technical planning.

## Guardrail Check

- **Intent versus implementation**: `spec.md` remains technology-agnostic; implementation details are confined to this plan and tasks.
- **Execution tracking**: No Beads import or implementation occurs during definition. The plan only preserves optional tracked-execution contracts for later work.
- **Optional disciplines**: No worktree or tests-first mandate is introduced. Focused regression coverage is feature scope.
- **Project convention**: Core source remains under `src/`, pack source under `library/packs/`, and base-owned dogfood files under `.github/` are regenerated with `node scripts/build-dev.mjs` rather than hand-edited. The project-owned `.github/skills/project/SKILL.md` and `.dude/memory/` ledger survive regeneration and require coordinator-owned semantic reconciliation.
- **Specialist visibility**: No subagent dispatch is part of this definition-only pass.

No guardrail is violated and no new durable guardrail is needed. Re-check after design: the chosen approach extends existing ownership and migration abstractions, keeps compatibility local to this feature, and adds no parallel state system.

## Technical Design

### 1. Canonical And Legacy Path Contract

- Replace the ambiguous canonical `BRIEF_DIR` concept with an explicit canonical ideas directory in `src/skills/dude-engine/lib/workspace-paths.mjs`.
- Represent root `brief/` and `.dude/brief/` as separate explicit legacy inputs. Both map directly to `.dude/ideas/`; neither is a normal read or write fallback.
- Classify `.dude/brief/` as legacy before the broader `.dude/` workspace classification.
- Treat only direct `.md` children of `.dude/ideas/` as canonical idea ledgers. Do not expose a relative-path mapping that can preserve legacy subdirectories.
- Include `.dude/ideas/` in managed-root and symbolic-link checks. Scan both legacy brief locations in mutation gates so every ordinary command blocks before writing when either contains any state, even when no canonical idea exists yet.
- Preserve empty-directory tolerance, canonical specs/memory/state/metadata behavior, and existing safe path resolution.

### 2. Brainstorm And Idea Semantics

- Route `brainstorm`, `draft`, and `define` through the existing intake and feature-definition authority. `brainstorm` is primary; `draft` delegates to the same behavior and is always described as deprecated.
- Change the collaboration artifact vocabulary from brief to idea and the user-owned heading from `## User Draft` to `## Idea`.
- On first capture, permit only conservative, meaning-preserving cleanup. On rerun, treat `## Idea` as stable user content unless the user edited it or explicitly requested revision.
- Keep open-question placement, Dude-managed fences, status values, exact `spec_path`, definition numbering, Coordinator Log ownership, reconciliation, and handoff semantics unchanged except for the companion path.
- Update status, diff, self-check, onboarding, lane banners, result examples, and failure guidance to recognize ideas and to block on legacy or mixed intake state.

### 3. Explicit Migration

Extend `src/skills/dude-workspace-migration/migrate.mjs`; do not add a second migration command. Use `src/skills/dude-compose/compose.mjs` profile reconciliation as the local model: one analysis function produces the complete non-mutating plan, a helper hashes the plan with only `plan_digest` omitted, and apply calls that same analysis afresh before comparing the reviewed digest.

#### 3.1 Root And Inventory Preflight

1. Before recursive inventory anywhere in the migrator, `lstat` the workspace root, each legacy/canonical managed root, and every existing path component from the workspace root to each source and destination. Reject a symbolic link at any checked root or ancestor without traversing it.
2. Inventory root `brief/` and `.dude/brief/` as flat directories. Accept only direct regular files ending in `.md`; report each subdirectory, nested path, non-Markdown file, symbolic link, and non-regular entry as an actionable conflict.
3. Map each accepted legacy file by basename directly to `.dude/ideas/<slug>.md`. Group converging source claims and existing destinations before scheduling writes; never preserve a relative subdirectory.
4. Inventory every direct canonical idea destination with normalized relative path, file type, and content hash, including destinations not touched by an operation, so creation, deletion, replacement, or content drift invalidates the plan.
5. Inventory every relevant definition package's `tasks.md` exact first line with path, file type, and hash. The content rewrite recognizes only the canonical first-line audit comment; a similar comment later in a file remains ordinary bytes.
6. Inspect Beads once with `bd list --all --limit 0 --json`, validate every issue id and full description, and sort the complete inventory deterministically. Include issues that need no rewrite; an addition, removal, id change, or any description change is plan drift.

#### 3.2 Pure Ledger And Pointer Transform

Implement one side-effect-free byte transform used by both plan and apply analysis:

- Preserve the source newline convention and all bytes outside exact permitted line replacements and insertion.
- Track CommonMark fenced blocks opened by at least three backticks or tildes and closed by the same marker with sufficient length; ignore heading-like text inside either fence style.
- Require exactly one real level-two intake heading outside fences. Rename one `## User Draft` to `## Idea`; accept one existing `## Idea`; conflict on missing, duplicate, or mixed forms.
- Require an existing real `## Coordinator Log`. Append the fixed line `- migrated intake ledger: canonical location is .dude/ideas/` at the end of that section using the source newline convention, but do nothing when that exact event is already present.
- Rewrite only an exact first-line task comment in either legacy form, `<!-- audit log: brief/<slug>.md#coordinator-log -->` or `<!-- audit log: .dude/brief/<slug>.md#coordinator-log -->`, to the corresponding `.dude/ideas/` comment.
- Retain the existing broader layout migrator's other explicitly parsed machine-owned forms: frontmatter `spec_path:` and design `preview_path:` scalars, known task-state JSON keys, the fenced bundle-manifest JSON object, and the first-line Beads `spec:` identity. Do not add free-form Markdown replacement or rewrite audit-like prose elsewhere.
- Hash the exact transformed bytes scheduled for each destination. The fixed log event is therefore part of the reviewed output rather than an unbound apply-time mutation.

#### 3.3 Deterministic Plan Digest

Bump the migration plan schema/version and emit `plan_digest` on ready, blocked, and no-op plans. Construct a canonical object with stable field insertion and sorted arrays; hash its JSON serialization with SHA-256 after removing only `plan_digest`. Do not include timestamps, temporary paths, or other volatile analysis data.

The bound plan contains at minimum:

- schema/version, status, normalized workspace root, conflicts, warnings, and dirty-worktree decision inputs;
- sorted operations with action, source path/type/hash, destination path/current type/current hash, and transformed output hash;
- the full canonical `.dude/ideas/` destination inventory, not only touched files;
- every relevant `tasks.md` path, type, exact first-line audit value, and audit hash;
- the complete sorted Beads issue id/full-description snapshot plus planned rewrites;
- all other existing migration inventories and outputs whose drift could change tracker or filesystem mutation.

Determinism tests build the same fixture in equivalent order and require the same digest. Focused stale-plan tests alter one bound dimension at a time: source bytes, destination creation/content, task breadcrumb, regular-file-to-symlink substitution, issue addition/removal, and issue description. Each must change the digest.

#### 3.4 Apply Contract And Atomicity

- Add CLI parsing and help for `--plan-digest <digest>`. Every apply invocation, including a no-op, requires both that option and the literal existing `--confirm migrate-dude-layout` token.
- Apply freshly runs the complete analysis with the production tracker adapter, validates confirmation and conflicts, and compares the supplied digest with the recomputed `plan.plan_digest` before calling tracker updates, creating a filesystem journal, writing temporary files, or removing paths.
- A missing or mismatched digest returns a blocked result containing the current plan/digest and records zero tracker calls and zero filesystem mutations. `--allow-dirty` remains a separate deliberate approval and cannot bypass digest mismatch.
- After a matching digest and dirty-worktree decision, retain tracker-first verification, atomic filesystem writes, exact tracker rollback inspection, and filesystem rollback. A blocked plan never enters this mutation section.
- Successful apply must be followed immediately by lint and a fresh source-migrator plan whose status is `noop`.

### 4. Validation And Identity

- Make lint scan direct `.dude/ideas/*.md` children, report idea counts and paths, and validate status, exact canonical `spec_path`, managed fences, one user-facing `## Idea`, and Coordinator Log shape.
- Track defined `spec_path` owners across all ideas and fail with every conflicting path when an identity has more than one owner.
- For every `.dude/specs/<feature>/tasks.md`, require the exact first line to point to one idea. Resolve that idea's `spec_path` and require exact equality with the package's `.dude/specs/<feature>/spec.md`; report the package, breadcrumb target, and all candidate owners for missing, mismatched, or duplicate ownership.
- Use this read-only diagnostic matrix:

| Intake State | Lint / Status / Self-check | Ordinary Mutation |
|---|---|---|
| Canonical ideas only | Validate normally | Allowed when otherwise valid |
| Structurally migratable root `brief/` and/or `.dude/brief/` only | Warn with exact source and migration guidance | Block |
| Any canonical ideas plus either non-empty legacy root | Fail as conflicting mixed state | Block |
| Nested, unsupported, colliding, or malformed legacy state | Fail with actionable paths | Block |
| Empty legacy directories | Ignore | Allowed |

- Root `brief/` follows the same warning/blocking rules as `.dude/brief/`; when both legacy roots exist without canonical ideas, diagnostics may warn only if their direct destination claims are non-conflicting, otherwise they fail.
- Keep `src/skills/dude-engine/lib/feature-identity.mjs` focused on strict frontmatter and spec identity; rename ledger-specific comments or consumer APIs where they would otherwise preserve obsolete canonical terminology.
- Update task audit breadcrumbs, lightweight work logs, automatic status selection, self-check and diff expectations, upgrade preservation, and portability guidance to resolve the idea ledger.

### 5. Mutation Consumers And Preservation

- Update upgrade and portability explicitly for `.dude/ideas/` terminology, preservation, and legacy migration guidance.
- Bundle import, compose, skill scaffold, and team expansion already call the shared canonical mutation assertion. Add focused canonical/legacy/mixed fixtures around those entry points to prove they inherit the new behavior.
- Do not edit those four production consumers merely to rename local variables or duplicate the shared check. Make a production change only if its focused regression test exposes bypass, incorrect guidance, or a path-specific assumption.
- Keep intentional root `brief/` and old-layout fixtures that test migration/recovery behavior.

### 6. Coordinator-Owned Dogfood Cutover And Knowledge Reconciliation

The current definition deliberately remains at `.dude/brief/brainstorm-ideas-intake.md`, and `tasks.md` deliberately retains that first-line audit breadcrumb during this definition revision. T008 is rollout, not feature-definition work.

After T001-T007 have updated and tested all required core `src/` path, migration, lint, brainstorm, alias, lifecycle, upgrade, and portability behavior, the coordinator performs these steps before any live `node scripts/build-dev.mjs` or Beads installed-layout suite:

1. Run `node src/skills/dude-workspace-migration/migrate.mjs plan --root . --json` from the newly edited source, never the stale generated `.github` migrator.
2. Review every operation, conflict, inventory, tracker snapshot, and `plan_digest`; retain the literal reviewed digest.
3. Deliberately accept the known implementation worktree with `node src/skills/dude-workspace-migration/migrate.mjs apply --root . --plan-digest <reviewed-digest> --confirm migrate-dude-layout --allow-dirty --json`.
4. Verify the brief moved to `.dude/ideas/brainstorm-ideas-intake.md`; exactly one real `## User Draft` became `## Idea`; the exact first-line task breadcrumb moved to `.dude/ideas/...#coordinator-log`; frontmatter and all prior log entries are unchanged; and exactly one fixed migration event was appended.
5. Reconcile `.dude/memory/decisions.md` and `.dude/memory/context.md` under the memory-ledger convention: supersede or consolidate the stale active brief-first, onboarding, and empty/missing-directory statements; record the durable `brainstorm`, `.dude/ideas/`, `## Idea`, and deprecated-`draft` contract; and preserve unrelated entries plus memory history. Update only ledger-specific working conventions in `.github/skills/project/SKILL.md` to the same contract.
6. Immediately run `node scripts/build-dev.mjs`, then `node .github/skills/dude-lint/lint.mjs .` through the newly generated lint implementation, confirming the three project-owned dogfood files remain intact and semantically current.
7. Rerun `node src/skills/dude-workspace-migration/migrate.mjs plan --root . --json` and require `status: noop` with no conflicts.

Any mismatch stops rollout before Beads integration. The coordinator owns this live-state mutation and verification; an implementation specialist must not silently move the package while editing source.

The two memory files and project skill are coordinator-owned dogfood state, not core or release source. Build-dev must preserve them. Generic release behavior remains unchanged: releases include no project ideas or memory and retain only the existing generic project-skill stub rather than this repository's project-local skill content.

### 7. Optional Packs And Distribution

- Change Beads import planning to require exactly one defined idea with exact `spec_path`; update mirror/sync guidance and tests to use the idea Coordinator Log and `.dude/ideas/` audit breadcrumb.
- Run Beads installed-layout integration only after T008 has regenerated `.github/`; its migration tests bind the complete id/description inventory, including issues requiring no rewrite.
- Update the design workflow only where it refers to the Dude intake ledger; leave unrelated design-brief terminology intact.
- Keep root `brief/` fixtures where they intentionally exercise legacy mutation gates. Update expected destinations and messages only where canonical behavior changes.
- Add source-level consistency coverage for the primary command, deprecated alias, canonical path, heading, and intentional legacy allowlist.
- Regenerate base-owned `.github/agents`, `.github/instructions`, and `.github/skills/dude-*` from `src/` first during T008 and again only as a final parity check. Do not manually patch generated core files; preserve installed packs and project-owned dogfood artifacts.
- Verify release staging includes the updated core, excludes all tests, contains only seeded `.dude/metadata` rather than ideas, briefs, specs, memory, or execution state, and retains the existing generic project-skill stub without copying this repository's project-local skill content.

## Project Structure

```text
src/
|-- agents/
|   |-- dude.agent.md
|   `-- dude-spec-lead.agent.md
|-- instructions/dude.instructions.md
`-- skills/
    |-- dude-engine/lib/
    |   |-- workspace-paths.mjs
    |   `-- workspace-paths.test.mjs
    |-- dude-compose/compose.mjs             # digest-bound local pattern; no planned production edit
    |-- dude-feature-definition/SKILL.md
    |-- dude-work-intake/SKILL.md
    |-- dude-generic-routing/SKILL.md
    |-- dude-lint/{lint.mjs,lint.test.mjs,SKILL.md}
    |-- dude-workspace-migration/{migrate.mjs,migrate.test.mjs,SKILL.md}
    |-- dude-lightweight-execution/{SKILL.md,board.test.mjs}
    |-- dude-work/SKILL.md
    |-- dude-parallel-dispatch/SKILL.md
    |-- dude-bundle-upgrade/{upgrade.mjs,upgrade.test.mjs,SKILL.md}
    `-- dude-portability/SKILL.md

library/packs/
|-- beads/skills/
|   |-- dude-pack-beads-workflow/{beads.mjs,beads.test.mjs,SKILL.md}
|   `-- dude-pack-beads-spec-import/SKILL.md
`-- design/skills/dude-pack-design-workflow/SKILL.md

scripts/
|-- build-dev.test.mjs
|-- build-release.test.mjs
`-- brainstorm-ideas-intake.test.mjs       # focused source/docs consistency contract

docs/
|-- commands.md
|-- prd-drafts.md
|-- reference.md
|-- setup.md
|-- upgrading.md
|-- walkthrough.md
`-- workflow.md

README.md
.github/                                   # regenerated base-owned dogfood output
.dude/brief/brainstorm-ideas-intake.md     # intentionally remains until coordinator rollout T008
.dude/specs/001-brainstorm-ideas-intake/  # definition package; task audit rewrites during T008
```

The implementation stays in existing owners. The only proposed new product test file is the focused cross-artifact consistency contract; it is justified because command/path terminology spans Markdown behavior, executable code, packs, generated output, and documentation but must retain a deliberate legacy/deprecation allowlist.

## Phases

### Phase 1: Shared Workspace Contract (T001)

Introduce flat canonical ideas and explicit dual legacy-brief classifications in the shared engine, with path mapping, mutation-gate, mixed-state, empty-directory, and root/ancestor symbolic-link regression coverage.

### Phase 2: Digest-Bound Migration And Identity Foundation (T002-T003)

First extend plan/apply with flat inventory, pure transformation, complete digest binding, drift checks, rollback, and no-op behavior. Then move lint to ideas, implement the read-only diagnostic matrix, and validate task-breadcrumb ownership; T003 depends on T002 because both share identity and transform contracts.

### Phase 3: Primary Brainstorm Workflow (T004-T005)

Update coordinator, spec-lead, instructions, intake, definition, and routing behavior for the brainstorm action, idea ledger, conservative first capture, stable reruns, and deprecated draft delegation.

### Phase 4: Lifecycle And Preservation Consumers (T006-T007)

Update status, diff, self-check, and lightweight lifecycle in T006. In parallel only where files remain disjoint, T007 handles explicit upgrade/portability work plus inherited-mutation regression fixtures.

### Phase 5: Coordinator-Owned Dogfood Cutover And Knowledge Reconciliation (T008)

Use the new source migrator to digest-plan and deliberately apply this repository's live move, verify exact preservation and rewrites, reconcile the dogfood decisions, context, and ledger-specific project skill that build-dev preserves, immediately regenerate/lint `.github`, and require a no-op source plan. This phase occurs after required core consumers and before any generated-core or installed-layout suite.

### Phase 6: Tracked Integration (T009)

Update Beads import/mirror and run its installed-layout integration against the generated core from T008.

### Phase 7: Independent Domain Terminology (T010)

Update design-pack ledger references without changing unrelated briefs. Its explicit dependency on T005 and `[P]` marker permit it to run alongside later-numbered core work only while files remain genuinely disjoint.

### Phase 8: Documentation And Distribution (T011-T012)

After lifecycle, migration, optional packs, and cutover behavior settle, update all public docs and consistency coverage, then rerun build-dev parity and validate pristine release contents.

### Phase 9: Final Gates And Handoff (T013)

Run every focused and repository-wide gate, no-op migration, generated lint, compose verification, fresh release lint, terminology audit, and diff hygiene. Do not import into Beads or claim implementation completion during this definition revision.

## Verification Strategy

### Pre-Cutover Source Suites

```text
node --test src/skills/dude-engine/lib/workspace-paths.test.mjs src/skills/dude-workspace-migration/migrate.test.mjs src/skills/dude-lint/lint.test.mjs src/skills/dude-lightweight-execution/board.test.mjs
node --test src/skills/dude-bundle-upgrade/upgrade.test.mjs src/skills/dude-bundle-import/import.test.mjs src/skills/dude-compose/compose.test.mjs src/skills/dude-skill-authoring/scaffold-skill.test.mjs
node --test scripts/brainstorm-ideas-intake.test.mjs
node src/skills/dude-lint/lint.mjs .
```

These checks must not run live `node scripts/build-dev.mjs` and must not run the Beads installed-layout suite. Source lint may warn for this intentionally legacy-only package before T008; any failure blocks cutover.

### Dogfood Cutover Gate

```text
node src/skills/dude-workspace-migration/migrate.mjs plan --root . --json
node src/skills/dude-workspace-migration/migrate.mjs apply --root . --plan-digest <reviewed-digest> --confirm migrate-dude-layout --allow-dirty --json
node scripts/build-dev.mjs
node .github/skills/dude-lint/lint.mjs .
node src/skills/dude-workspace-migration/migrate.mjs plan --root . --json
```

The first plan must be reviewed from new source, apply must use that literal digest and token, and the final plan must report `noop`. Verify the live path, exact heading, first-line task audit comment, frontmatter, prior Coordinator Log bytes, and one fixed event between apply and build-dev.

After successful apply verification and before build-dev, inspect the active statements in `.dude/memory/decisions.md`, `.dude/memory/context.md`, and `.github/skills/project/SKILL.md`. The memory files must consolidate or clearly supersede stale controlling statements while retaining unrelated entries and history; the project skill must change only ledger-specific conventions. Build-dev and generated lint must then prove those project-owned edits survived regeneration.

### Post-Cutover Integration Suites

```text
node --test library/packs/beads/skills/dude-pack-beads-workflow/beads.test.mjs
node --test scripts/brainstorm-ideas-intake.test.mjs scripts/build-dev.test.mjs scripts/build-release.test.mjs
```

The Beads pack suite runs only here because its installed-layout fixture stages generated core.

### Bundle Gates

```text
node scripts/build-dev.mjs
node .github/skills/dude-lint/lint.mjs .
node .github/skills/dude-compose/compose.mjs verify
find . -path ./dist -prune -o -name '*.test.mjs' -print0 | xargs -0 node --test
node src/skills/dude-workspace-migration/migrate.mjs plan --root . --json
node scripts/build-release.mjs --out <fresh-temporary-directory>
node <fresh-temporary-directory>/.github/skills/dude-lint/lint.mjs <fresh-temporary-directory>
git diff --check
git status --porcelain -- .github
```

The repeated source migration plan must remain `noop`. Final `build-dev` is a parity rerun after the required T008 cutover, not the first live generation.

### Consistency Audit

Run a scoped exact-term search across `src/`, `library/packs/`, `scripts/`, `README.md`, `docs/`, `.dude/memory/*.md`, and `.github/skills/project/SKILL.md`. Every remaining `.dude/brief`, `## User Draft`, primary `@dude draft`, ledger-specific "brief" identity, or obsolete path constant must be classified as one of:

- explicit legacy migration input,
- deprecated alias behavior,
- intentional legacy migration specification or fixture,
- explicitly superseded, non-active memory history,
- intentionally unrelated generic prose.

Intentional legacy references in migration specifications and fixtures are allowlisted by path and purpose. Any unclassified match blocks completion, and any active contradictory statement in `.dude/memory/*.md` or `.github/skills/project/SKILL.md` fails the audit even when a similar legacy token is allowlisted elsewhere.
