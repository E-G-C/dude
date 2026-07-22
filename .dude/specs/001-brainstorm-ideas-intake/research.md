# Research: Brainstorm Ideas Intake

## Purpose

Record the implementation decisions that keep the brainstorm/ideas transition lossless, explicit, and consistent across core source, optional packs, generated dogfood output, releases, and documentation.

## Decision 1: Make Flat Ideas Explicit In The Shared Path Model

**Decision**: Introduce a canonical ideas path whose only ledgers are direct `.md` children, and model root `brief/` plus `.dude/brief/` as two distinct legacy inputs that both map by basename directly to `.dude/ideas/`.

**Rationale**: All mutating commands already depend on shared workspace classification. Changing that owner once lets lint, migration, build, authoring, upgrade, and execution gates agree about canonical and legacy state.

**Rejected alternatives**:

- Keep a canonical constant named `BRIEF_DIR` but point it at `.dude/ideas/`: rejected because it preserves misleading identity terminology in controlling code.
- Let consumers read both ideas and briefs: rejected because dual reads permit split ownership and ambiguous `spec_path` identities.
- Redirect old paths during ordinary commands: rejected because migration would become implicit and non-auditable.
- Preserve arbitrary legacy relative paths under `.dude/ideas/`: rejected because lint and Beads intentionally operate on direct children and nested ledgers would create a second, inconsistently scanned identity model.

## Decision 2: Delegate The Deprecated Verb, Not The Storage Model

**Decision**: `draft` remains a recognized coordinator verb but delegates to the same brainstorm intake rules and writes only the canonical idea ledger.

**Rationale**: Compatibility is required at the command boundary, not at the storage boundary. One behavioral owner prevents the alias from drifting while allowing docs and responses to teach the new lifecycle.

**Rejected alternative**: Preserve `.dude/brief/` writes for `draft`; this would create parallel ledgers and make command choice alter canonical identity.

## Decision 3: Treat Idea Text As Stable User Content After Capture

**Decision**: Permit conservative cleanup only on first capture or explicit revision. Reruns preserve the existing `## Idea` bytes unless the user edited the section or asked Dude to revise it.

**Rationale**: Users should be able to speak or type rough ideas without polishing, but repeated normalization must not become silent editorial drift.

**Boundary**:

- Safe cleanup: obvious spelling, grammar, punctuation, speech-to-text defects, filler, and accidental repetition.
- Unsafe cleanup: resolving ambiguity, increasing certainty, finishing an intentionally incomplete thought, changing tone, or replacing user edits.
- Ambiguous cases remain verbatim and may produce an open question.

## Decision 4: Bind Apply To The Reviewed Deterministic Plan

**Decision**: Add ideas migration to `dude-workspace-migration`, retain its literal `migrate-dude-layout` confirmation and atomic rollback machinery, and adopt the digest-bound plan/apply pattern already used by `src/skills/dude-compose/compose.mjs` profile reconciliation.

**Rationale**: Recomputing an unbound plan at apply time proves only that apply sees a valid current state; it does not prove that the current operations are the operations the user reviewed. The local compose pattern solves that gap by hashing a deterministic plan without its digest field and requiring apply to freshly reproduce the reviewed digest before mutation.

**Bound snapshot**:

- migration plan schema/version and normalized root;
- sorted operations with source/destination path and file type;
- source content hashes and exact transformed output hashes;
- the complete direct-child canonical destination inventory, including untouched ideas;
- each relevant `tasks.md` path, type, exact first-line audit breadcrumb, and hash;
- the complete sorted Beads issue id and full-description inventory, including issues with no planned rewrite;
- existing migration inventories, conflicts, warnings, and mutation-relevant worktree state.

The plan uses stable object construction and sorted arrays, excludes volatile timestamps and temporary paths, and computes SHA-256 over its canonical JSON form after removing only `plan_digest`. Apply requires `--plan-digest <digest>` and `--confirm migrate-dude-layout`, reruns the same analysis, and compares before tracker updates, filesystem journaling, temporary writes, or removals. `--allow-dirty` approves only the worktree condition; it cannot override a digest mismatch.

**Rejected alternatives**:

- Recompute and immediately apply without a reviewed digest: rejected because source, destination, task, or tracker changes can silently alter the operation set.
- Bind only source files: rejected because destination creation, audit-breadcrumb changes, and tracker drift can alter safety or side effects without changing source bytes.
- Bind only Beads issues selected for rewrite: rejected because addition, removal, or description drift in any issue changes the reviewed tracker world and may affect identity validation.
- Persist a mutable plan file and trust it directly: rejected because apply must derive writes from fresh state, not deserialize stale mutation instructions.

## Decision 5: Preflight Roots Before Inventory And Keep Ideas Flat

**Decision**: Validate the workspace root, every legacy/canonical root, and all existing path components to each source/destination with `lstat` before recursive inventory. For intake roots, inventory only direct regular `.md` children and reject directories, nested paths, non-Markdown files, links, and other file types.

**Rationale**: Rejecting only links encountered during traversal leaves a time and boundary gap at the root and ancestor level. Flat intake makes the destination set deterministic and matches the direct-child scans used by lint and Beads.

**Migration normalization**:

| Source | Destination |
|---|---|
| `brief/<slug>.md` | `.dude/ideas/<slug>.md` |
| `.dude/brief/<slug>.md` | `.dude/ideas/<slug>.md` |
| `.dude/ideas/<slug>.md` | unchanged canonical state |

Before scheduling writes, group transformed direct-child sources by final destination. Identical transformed bytes may deduplicate; differing bytes are an actionable conflict. Existing destinations follow the same rule. A nested source is always a conflict rather than an alternate destination mapping.

## Decision 6: Use One Pure Structure-Aware Transform

**Decision**: Limit content transformation to recognized machine or ledger structure.

- Recognize CommonMark fences opened by backticks or tildes and ignore heading-like lines until a matching close.
- Rename exactly one real level-two `## User Draft` heading outside fenced examples to `## Idea`.
- Accept exactly one existing `## Idea` with no old heading as already normalized.
- Stop on a missing ledger heading, duplicate matching headings, or both old and new headings.
- Rewrite only the exact first line of `tasks.md` when it is one of the two canonical legacy audit-comment forms; an audit-like comment elsewhere is ordinary prose.
- Retain only the migrator's existing explicitly parsed machine forms beyond that comment: frontmatter `spec_path:` and `preview_path:` scalars, known task-state JSON keys, fenced manifest JSON, and first-line Beads `spec:` identity.
- Preserve newline style, frontmatter quoting, all other body bytes, and all existing Coordinator Log entries.
- Append the fixed `- migrated intake ledger: canonical location is .dude/ideas/` line once at the end of the existing Coordinator Log. Include it in the transformed-output hash and do not add a timestamp.

**Rationale**: One pure transform guarantees preview and apply hash the same output. A global `brief` replacement or loose Markdown search would corrupt unrelated design/site briefs, fenced examples, historical prose, and user-authored language. The deterministic log event reconciles audit visibility with byte-preservation claims: pre-existing bytes stay stable outside explicitly listed edits, but total file identity is not promised.

## Decision 7: Keep `spec_path` And Audit Ownership Coupled

**Decision**: Preserve exact `.dude/specs/<feature>/spec.md` identity and move only its owning ledger from brief to idea.

**Rationale**: Definition packages and Beads descriptions already use exact `spec_path` equality. Changing that identity would add unrelated reconciliation risk.

**Additional validation**: Lint and Beads import planning must reject multiple defined ideas that claim the same `spec_path`, reporting every owner. Lint must also read the exact first line of every `tasks.md`, resolve its idea target, and require that target's exact `spec_path` to be the package's companion `spec.md`; missing, cross-wired, and duplicate ownership are distinct actionable errors.

## Decision 8: Separate Read-Only Legacy Diagnosis From Mutation Safety

**Decision**: Read-only lint, status, and self-check warn for structurally migratable legacy-only intake, fail canonical-plus-legacy mixed state or malformed/conflicting legacy input, and never mutate. Every ordinary mutating workflow blocks on any non-empty root `brief/` or `.dude/brief/`, including otherwise migratable legacy-only state.

**Rationale**: A blanket lint failure for all legacy-only state prevents users from inspecting a workspace that must be migrated, while allowing ordinary mutation would create parallel ledgers. Root `brief/` and `.dude/brief/` need the same policy, with paths named distinctly in diagnostics.

**Boundary**: Empty legacy directories are ignored. Two legacy roots without canonical ideas may receive a warning only when their flat destination claims are valid and non-conflicting; nested entries, collisions, or malformed ledgers fail diagnosis.

## Decision 9: Test Inherited Mutation Consumers Before Editing Them

**Decision**: Make explicit terminology and preservation changes in upgrade and portability. For bundle import, compose, skill scaffold, and team expansion, add focused fixtures proving their existing shared mutation assertion accepts canonical ideas and blocks legacy/mixed state; edit production only if a fixture exposes a bypass or wrong guidance.

**Rationale**: Those consumers already inherit the controlling behavior. Duplicating path checks or mechanically renaming unaffected code would increase drift and obscure the shared owner.

## Decision 10: Cut Over Dogfood And Reconcile Preserved Project Knowledge

**Decision**: Keep this package under `.dude/brief/` during definition. After all required core consumers and migration/lint support are updated and tested, the coordinator runs the new `src/` migrator plan, reviews its digest, applies with digest plus literal confirmation and deliberate `--allow-dirty`, and verifies exact preservation/rewrites. Before build-dev, the coordinator then reconciles `.dude/memory/decisions.md` and `.dude/memory/context.md` by superseding or consolidating stale active ledger statements while preserving unrelated entries and history, records the durable brainstorm/ideas/Idea/deprecated-draft contract, and updates only ledger-specific conventions in `.github/skills/project/SKILL.md`. The coordinator immediately runs `node scripts/build-dev.mjs`, lints through generated `.github`, and requires a fresh source plan to be a no-op. Only then may the Beads installed-layout suite run.

**Rationale**: The repository is the migration's most consequential realistic fixture. Using stale generated migration code would test the old behavior, while building generated core before moving the live package would miss the intended self-hosting boundary. Build-dev intentionally preserves project memory and the project skill, so source regeneration cannot repair their controlling terminology. Coordinator ownership makes both the live state transition and the semantic dogfood cutover explicit and auditable.

**Rejected alternative**: Move the package during this definition revision. That would violate planning-only scope and erase the exact legacy fixture T008 is meant to migrate.

## Decision 11: Validate Prompt-Controlled Behavior Statically And By Scenario

**Decision**: Use executable filesystem tests for paths, lint, migration, Beads, build, and release behavior; add a focused source/docs consistency test for prompt-controlled command and terminology contracts; retain a small manual scenario checklist for meaning-preserving language behavior. Extend the final static audit to `.dude/memory/*.md` and `.github/skills/project/SKILL.md`, allowlisting intentional legacy migration specifications and fixtures while failing any contradictory active dogfood statement.

**Rationale**: Coordinator verbs and status responses are authored in Markdown rather than a conventional parser. Static contract assertions can prevent stale canonical paths and missing deprecation guidance, while semantic editing quality still needs scenario review. Migration tests separately inject every bound drift category and assert zero tracker/filesystem mutation on stale digest.

## Decision 12: Regenerate Core Dogfood, Preserve Non-Core State

**Decision**: Edit core only under `src/`, edit pack catalog only under `library/packs/`, then first run `node scripts/build-dev.mjs` inside the coordinator-owned T008 cutover and rerun it later for parity. Do not hand-edit generated core output.

**Rationale**: This preserves source/generated parity and avoids losing installed packs, project knowledge, or `.dude` state that build-dev intentionally keeps. Because preservation also retains stale controlling knowledge, T008 must reconcile that state before using build-dev as a validation boundary.

**Release expectation**: The staged release contains updated core behavior and only seeded `.dude/metadata`; it contains no tests, ideas, legacy briefs, specs, memory, or execution state. It keeps the existing generic project-skill stub behavior and does not copy this repository's project-local skill content.

## Materially Unchanged Areas

- `status: draft|defined` values and `spec_path` meaning.
- Sequential feature numbering and spec/plan/tasks package layout.
- Open-question and managed-fence ownership.
- Lightweight versus tracked execution authority.
- The literal workspace-migration confirmation token and deliberate `--allow-dirty` policy.
- Generic design briefs, site briefs, writing briefs, PRD source files, and ordinary prose.
- Beads as an optional execution system rather than a definition requirement.
- Generic release-state behavior: no project ideas or memory, and only the existing project-skill stub rather than dogfood project-skill content.
