# Feature Specification: Brainstorm Ideas Intake

## User Scenarios & Testing

### User Story 1 - Shape an unpolished idea before definition (Priority: P1)

A user gives Dude an early, possibly rough or incomplete idea and receives one editable idea ledger without having to polish the input or enter feature definition yet.

**Why this priority**: This is the primary workflow change and the first user-visible step in every later definition or execution flow.

**Independent Test**: In a workspace with no active intake state, brainstorm a rough idea, inspect the resulting ledger and lifecycle guidance, then rerun the action without requesting a revision or definition.

**Acceptance Scenarios**:

1. **Given** a workspace with no idea ledger for the requested feature, **When** the user runs `@dude brainstorm <idea>`, **Then** Dude creates one `.dude/ideas/<slug>.md` ledger with `## Idea`, normalized intent, focused questions or assumptions as needed, and no spec package.
2. **Given** input containing clear transcription errors, filler, or accidental repetition, **When** Dude captures it for the first time, **Then** Dude may lightly clean those defects while preserving the user's meaning, tone, uncertainty, and unfinished or creative intent.
3. **Given** input whose wording is materially ambiguous, **When** Dude captures it, **Then** the ambiguity remains visible in `## Idea` or becomes a focused open question rather than being silently resolved.
4. **Given** an existing idea ledger, **When** the user reruns `brainstorm` without editing the idea or requesting revision, **Then** the existing `## Idea` content is preserved while Dude-managed normalization may refresh.
5. **Given** an idea ledger that is not yet defined, **When** the user asks for status or next-step guidance, **Then** Dude presents `brainstorm -> idea -> define -> spec -> work` and treats `brainstorm` as a peer of `define`, not as a request to define.

### User Story 2 - Use the former command during a compatibility period (Priority: P1)

A user or automation that still invokes `@dude draft` receives the same intake behavior without recreating the legacy ledger path.

**Why this priority**: Existing users must not lose a working entry point while the canonical vocabulary and path change.

**Independent Test**: Invoke `@dude draft` in a clean workspace and verify that it produces only the canonical idea ledger, preserves brainstorm semantics, and is identified as deprecated in user guidance.

**Acceptance Scenarios**:

1. **Given** no existing intake ledger, **When** the user runs `@dude draft <idea>`, **Then** Dude performs brainstorm behavior and writes only `.dude/ideas/<slug>.md`.
2. **Given** an existing canonical idea ledger, **When** the user reruns `draft`, **Then** Dude refreshes that same ledger without creating `.dude/brief/` state.
3. **Given** documentation or command help, **When** intake commands are presented, **Then** `brainstorm` is primary and `draft` is clearly identified as a deprecated compatibility alias.

### User Story 3 - Migrate legacy intake state explicitly and safely (Priority: P1)

A user with legacy brief ledgers can review one deterministic, digest-bound migration plan and apply only that exact plan into the canonical ideas directory without hidden moves, collisions, symlink traversal, stale tracker assumptions, or split state.

**Why this priority**: Changing the canonical path without a safe transition would strand existing definitions and audit history.

**Independent Test**: Preview and apply direct-child migration fixtures for root `brief/` and `.dude/brief/`; verify the reviewed plan digest, pure content transform, preservation exceptions, and no-op rerun; then introduce source, destination, task-audit, symlink, and tracked-issue drift between preview and apply and prove every mismatch blocks before any mutation.

**Acceptance Scenarios**:

1. **Given** a safe legacy inventory, **When** the user previews migration, **Then** the plan reports a deterministic `plan_digest`, every sorted operation and bound inventory needed to review it, and performs no tracker or filesystem mutation.
2. **Given** a reviewed ready plan, **When** the user applies with both the literal `migrate-dude-layout` confirmation and that plan's `--plan-digest <digest>`, **Then** apply freshly recomputes the complete plan and proceeds only when the digest matches exactly.
3. **Given** a direct-child `.dude/brief/<slug>.md` or root `brief/<slug>.md`, **When** the matching reviewed plan is applied, **Then** it moves directly to `.dude/ideas/<slug>.md`, preserves frontmatter and prior Coordinator Log history, performs only the permitted structure-aware edits, and appends one deterministic idempotent migration log event.
4. **Given** the source content changes, a destination is created or changed, a relevant task audit breadcrumb changes, a checked path becomes a symbolic link, or the complete tracked-issue id/description inventory drifts after preview, **When** apply recomputes the plan, **Then** the digest mismatch blocks before any tracker or filesystem mutation.
5. **Given** a nested legacy path, legacy subdirectory, non-Markdown entry, source/destination collision, incompatible heading shape, duplicate target identity, or unsafe root/ancestor symbolic link, **When** migration is previewed or applied, **Then** it reports each actionable conflict and performs no partial migration.
6. **Given** both legacy and canonical intake contain state, **When** any ordinary mutating command runs, **Then** the command stops and directs the user to explicit migration or reconciliation without creating another ledger.
7. **Given** generic prose or an audit-like comment outside the exact supported machine-owned location, **When** migration runs, **Then** that content remains byte-for-byte unchanged.

### User Story 4 - Continue definition and execution from the idea identity (Priority: P2)

A user can define an idea and use status, validation, lightweight execution, or optional tracked execution without any component looking for the retired canonical brief directory.

**Why this priority**: The new intake artifact must remain the single companion and audit source throughout the existing feature lifecycle.

**Independent Test**: Define an idea, validate it, inspect status and self-check behavior, exercise task audit links and execution mirrors, and plan an optional tracked import using exact `spec_path` identity.

**Acceptance Scenarios**:

1. **Given** a ready idea ledger, **When** the user runs `@dude define <slug>`, **Then** Dude writes the definition package, marks the idea `defined`, records the exact `spec_path`, and appends its Coordinator Log.
2. **Given** two defined ideas with the same `spec_path`, **When** validation or tracked-import planning runs, **Then** duplicate canonical identity is rejected with both conflicting idea paths.
3. **Given** a task file associated with an idea, **When** lightweight or tracked execution records an audited state change, **Then** its audit breadcrumb and mirror operation resolve the companion `.dude/ideas/<slug>.md` ledger.
4. **Given** canonical ideas, legacy briefs, or mixed intake state, **When** status, diff, self-check, lint, portability, or upgrade safety checks run, **Then** each operation recognizes canonical state, reports legacy state accurately, and preserves the canonical idea ledger.
5. **Given** any definition package with `tasks.md`, **When** lint validates its exact first-line audit breadcrumb, **Then** the target must be the one and only idea whose exact `spec_path` names that package's `spec.md`; missing, mismatched, or duplicate owners fail with actionable paths.

### User Story 5 - Receive a coherent built and documented bundle (Priority: P2)

A bundle consumer encounters the brainstorm and idea terminology consistently in installed core behavior, optional packs, examples, diagrams, validation, and release output.

**Why this priority**: Source-only changes are insufficient when users run generated bundle files, install packs, or learn the workflow from documentation.

**Independent Test**: Build development and release outputs, compare generated core files with their authoritative sources, run the focused compatibility suite, and inspect command reference and lifecycle examples.

**Acceptance Scenarios**:

1. **Given** authoritative core changes, **When** the development bundle is regenerated, **Then** generated coordinator, spec-lead, instruction, and skill surfaces match their sources.
2. **Given** a release build, **When** its contents are inspected, **Then** it contains the new canonical workflow behavior while still excluding tests and project-specific Dude state.
3. **Given** user documentation, **When** a reader follows intake through execution, **Then** examples and diagrams lead with `brainstorm` and `.dude/ideas/`, explain the deprecated `draft` alias, and describe explicit legacy migration consistently.
4. **Given** this repository's live package still occupies `.dude/brief/`, **When** the coordinator reaches the rollout task after core consumers and migration/lint support pass, **Then** it uses the new source migrator to review and apply the digest-bound move before the first live development build or installed-layout Beads suite, immediately rebuilds and lints generated core, and proves a second source plan is a no-op.
5. **Given** this repository's dogfood memory and project-local workflow knowledge are preserved by development regeneration, **When** the coordinator performs that rollout, **Then** active ledger guidance is reconciled to `brainstorm`, `.dude/ideas/`, `## Idea`, and deprecated `draft` before generated-core validation, while unrelated project knowledge and memory history remain intact.

## Edge Cases

- Initial input is empty, only filler, or too vague to derive a stable slug.
- Initial input mixes correctable transcription defects with meaningful uncertainty that must remain intact.
- An existing `## Idea` was edited by the user between brainstorm runs.
- A user explicitly asks Dude to revise an existing idea rather than merely rerunning brainstorm.
- A legacy ledger has no real level-two intake heading, has duplicate matching headings, already has exactly one `## Idea`, or mixes `## User Draft` and `## Idea`.
- A heading-like string appears inside a CommonMark backtick or tilde fenced block, a block quote, or ordinary prose and must not be treated as the ledger heading.
- A legacy root contains a nested directory, nested Markdown file, non-Markdown file, socket, device, or other unsupported entry; canonical ideas remain flat direct children only.
- Legacy and canonical directories contain different files with the same slug, identical files with the same slug, or files that share a `spec_path` under different slugs.
- A migration root, any ancestor from the workspace root, source, destination, intermediate directory, or contained file is a symbolic link before inventory.
- A checked regular file or directory is replaced by a symbolic link after preview but before apply.
- Migration preview succeeds, then source bytes change, a destination is created or changed, or the canonical destination inventory changes before apply.
- The exact first-line audit breadcrumb in a relevant `tasks.md` changes after preview, while an audit-like comment elsewhere remains non-machine prose.
- A Beads issue is added or removed, an issue id changes, or any issue description changes after preview, including an issue that needs no identity rewrite.
- The deterministic migration log event already exists and must not be appended twice.
- An audit breadcrumb uses root `brief/...#coordinator-log` or `.dude/brief/...#coordinator-log` as the exact first line of an existing task file.
- A defined idea points to a missing package, a directory instead of `spec.md`, or a non-canonical path.
- A task breadcrumb points to a real idea whose `spec_path` belongs to another package, no idea owns the package, or multiple ideas own it.
- A deprecated `draft` invocation encounters only legacy brief state or mixed legacy and canonical state.
- Documentation uses "brief" in an unrelated design, site, writing, or ordinary-language context.
- A release or upgrade operation encounters project-specific `.dude/ideas/` state that must never be overwritten or shipped as generic state.
- Development regeneration preserves active project-local memory or skill guidance that still names the retired canonical ledger, while intentional old-path references in migration specifications or fixtures must remain distinguishable from contradictory active guidance.

## Functional Requirements

- **FR-001**: Dude MUST expose `@dude brainstorm <idea>` as the primary pre-definition coordinator action.
- **FR-002**: `brainstorm` MUST create or refresh exactly one canonical flat `.dude/ideas/<slug>.md` collaboration ledger for one bounded feature; nested idea paths are not canonical.
- **FR-003**: `brainstorm` MUST normalize intent and maintain focused questions, assumptions, constraints, and workflow metadata without producing spec artifacts unless the user requests `define`.
- **FR-004**: User-facing lifecycle guidance MUST present `brainstorm -> idea -> define -> spec -> work`, with `brainstorm` and `define` as distinct peer actions.
- **FR-005**: New idea ledgers MUST use `## Idea` as the user-controlled content heading.
- **FR-006**: On initial capture, Dude MAY correct clear spelling, grammar, punctuation, transcription errors, filler, and accidental repetition, but MUST preserve meaning, tone, uncertainty, unfinished intent, creative intent, and user edits.
- **FR-007**: Dude MUST preserve ambiguous wording or surface it as an open question rather than silently choosing an interpretation.
- **FR-008**: On rerun, Dude MUST preserve existing `## Idea` content unless the user edited it or explicitly requested revision.
- **FR-009**: Idea frontmatter MUST retain the existing `status: draft|defined` and exact-file `spec_path:` semantics.
- **FR-010**: The idea ledger MUST remain the canonical companion and append-only audit source for its definition package and any execution mirror.
- **FR-011**: `@dude define <slug>` MUST consume the matching canonical idea ledger and write or refresh `.dude/specs/<feature>/` without introducing a second intake ledger.
- **FR-012**: `@dude draft` MUST remain available as a deprecated compatibility alias for brainstorm behavior and MUST write only `.dude/ideas/`.
- **FR-013**: Command help and user documentation MUST lead with `brainstorm` and explicitly label `draft` as deprecated.
- **FR-014**: Existing `.dude/brief/` and root `brief/` state MUST move to `.dude/ideas/` only through an explicit previewable migration workflow, never as an ordinary-command side effect.
- **FR-015**: Direct-child root `brief/<slug>.md` state MUST migrate directly to `.dude/ideas/<slug>.md`; migration MUST NOT preserve arbitrary relative nesting from either legacy root.
- **FR-016**: Migration MUST preserve frontmatter, prior Coordinator Log entries, newline convention, and all bytes outside the permitted edits: one real intake-heading rename when needed, exact enumerated machine-owned pointer rewrites, and one fixed `- migrated intake ledger: canonical location is .dude/ideas/` event appended at the end of the existing `## Coordinator Log` section using the source newline convention. The event MUST be idempotent and MUST NOT use a changing timestamp.
- **FR-017**: One pure structure-aware ledger transform MUST recognize CommonMark backtick and tilde fenced blocks, locate exactly one real level-two intake heading outside those blocks, rename exactly one `## User Draft` to `## Idea`, accept exactly one existing `## Idea`, and conflict on missing, duplicate, or mixed intake headings.
- **FR-018**: Migration preview and apply MUST stop with actionable conflicts for incompatible source and destination state, nested or unsupported entries, ambiguous headings, duplicate canonical identities, unsafe symbolic links, or stale reviewed state; a conflict MUST leave tracker and filesystem state untouched.
- **FR-019**: Every ordinary mutating workflow MUST block on any non-empty root `brief/` or `.dude/brief/` state, whether legacy-only or mixed with canonical ideas, and MUST NOT create parallel ledgers.
- **FR-020**: Read-only status and diagnostics MUST warn, without failing solely for path age, when intake is legacy-only and otherwise structurally migratable; MUST fail conflicting canonical-plus-legacy state; and MUST identify root `brief/` and `.dude/brief/` distinctly without mutating either.
- **FR-021**: Lint MUST accept valid idea ledgers and task audit links; warn for structurally migratable legacy-only root or `.dude` intake with explicit migration guidance; and fail malformed status or structure, dangling or duplicate `spec_path`, unsupported legacy entries, destination collisions, conflicting mixed state, and invalid audit ownership.
- **FR-022**: Lightweight and optional tracked execution MUST resolve feature identity and append-only audit history through the canonical idea ledger.
- **FR-023**: Tracked import and mirror behavior MUST use exact `spec_path` equality from one defined idea and reject missing or duplicate identity owners.
- **FR-024**: Portability and upgrade behavior MUST preserve project-specific `.dude/ideas/` state and MUST continue to block or route explicit migration for legacy intake state.
- **FR-025**: Generated development artifacts MUST remain reproducible from authoritative bundle sources after the terminology and path change.
- **FR-026**: Release output MUST contain canonical brainstorm and idea behavior while excluding tests and project-specific Dude state; it MUST NOT add this repository's ideas, memory, or project-local skill content beyond the existing generic project-skill stub behavior.
- **FR-027**: Automated compatibility coverage MUST include the deprecated alias, canonical idea creation, explicit migration and rewrites, collisions, symbolic-link safety, lint identity rules, execution import and mirrors, status and diagnostics where executable, generated-source parity, release contents, and documentation consistency.
- **FR-028**: Changes MUST leave unrelated uses of the generic noun "brief" unchanged when they do not identify the Dude intake ledger.
- **FR-029**: Migration preview MUST emit a deterministic versioned `plan_digest` computed from a canonical representation of the complete reviewed plan, excluding only the digest field itself.
- **FR-030**: The digest-bound plan MUST include the plan schema/version, sorted operations, each source and destination path plus file type, source content hashes, transformed output hashes, the complete canonical destination inventory, hashes of every relevant exact first-line task audit breadcrumb, and a deterministic complete tracker snapshot containing every Beads issue id and full description, whether or not that issue requires a rewrite.
- **FR-031**: Every apply invocation MUST require both the literal existing confirmation token and `--plan-digest <digest>`, freshly recompute all preflight inputs, and compare the reviewed digest before any tracker or filesystem mutation; a missing or mismatched digest MUST block without side effects.
- **FR-032**: Migration MUST accept only direct Markdown file children from each legacy intake root and MUST report nested directories, nested paths, non-Markdown files, and non-regular entries as actionable conflicts rather than copying their relative structure.
- **FR-033**: Preflight MUST validate the workspace root, every legacy and canonical intake root, and every existing ancestor of each inventoried source and destination against symbolic links before recursive inventory, then bind file types so post-plan symlink substitution changes the digest and blocks apply.
- **FR-034**: Lint and identity validation MUST require the exact first line of every `tasks.md` to be the canonical audit breadcrumb for the unique idea whose exact `spec_path` owns that package, with actionable errors naming missing, mismatched, and duplicate owners.
- **FR-035**: This repository's rollout MUST keep the current package at `.dude/brief/brainstorm-ideas-intake.md` until a coordinator-owned implementation task uses the new source migrator to review/apply its digest with deliberate dirty-worktree approval, verifies the exact heading/breadcrumb/preservation changes, immediately rebuilds and lints generated core, and proves a repeated new-source plan is a no-op before installed-layout tracked tests.
- **FR-036**: Upgrade and portability MUST receive explicit ideas terminology and preservation updates; bundle import, compose, skill scaffold, and team expansion MUST receive focused regression fixtures for their inherited shared mutation assertion, with production edits limited to gaps those fixtures expose.
- **FR-037**: During the coordinator-owned rollout, this source repository's active dogfood project knowledge and durable memory MUST be reconciled to the canonical `brainstorm` action, `.dude/ideas/` ledger, `## Idea` heading, and deprecated `draft` alias. Superseded statements MUST be consolidated or clearly made non-active rather than left contradictory, while unrelated project knowledge, memory entries, and history remain intact.

## Key Entities

- **Idea Ledger**: The canonical pre-spec collaboration and audit artifact, identified by slug and carrying a user-controlled `## Idea`, Dude-managed normalization, `status`, `spec_path`, and Coordinator Log.
- **Brainstorm Action**: The primary intake operation that creates or refreshes an idea ledger but does not define it.
- **Draft Alias**: A deprecated command spelling that delegates to brainstorm behavior without retaining a separate storage path or lifecycle.
- **Definition Package**: The spec, plan, and tasks associated with a defined idea through exact `spec_path` identity.
- **Legacy Brief Ledger**: Intake state under root `brief/` or `.dude/brief/` accepted only as explicit migration input after this feature ships.
- **Migration Plan**: A previewable, versioned, deterministically ordered description of all source, destination, transformed content, canonical inventory, task-audit, and complete tracker state, identified by a digest that apply must freshly reproduce before mutation.
- **Audit Reference**: A machine-readable link from tasks or execution activity to the companion idea ledger's Coordinator Log.
- **Tracker Snapshot**: The deterministic sorted inventory of every tracked issue id and full description observed during planning, including issues that require no rewrite, so any tracked-state drift invalidates the reviewed plan.
- **Dogfood Project Knowledge**: This source repository's durable workflow decisions, context facts, and project-local conventions, which survive generated-core rebuilds and therefore require an explicit semantic cutover distinct from product source or generic release state.

## Success Criteria

- **SC-001**: In all supported new-intake and deprecated-alias scenarios, 100% of created or refreshed ledgers are under `.dude/ideas/`, with zero ordinary writes to `.dude/brief/`.
- **SC-002**: A brainstorm-only request creates zero definition-package artifacts until `define` is explicitly requested.
- **SC-003**: Across migration fixtures, all frontmatter, pre-existing Coordinator Log entries, newline convention, and bytes outside permitted edits are preserved exactly; the only allowed changes are the one heading rename when required, enumerated machine-owned pointer rewrites, and one idempotent fixed migration event appended inside the existing Coordinator Log.
- **SC-004**: Every tested collision, nested/unsupported entry, mixed-state conflict, source edit, destination creation/change, task-breadcrumb edit, symlink substitution, and Beads inventory/description drift stops before tracker or filesystem mutation and reports a concrete resolution path.
- **SC-005**: Canonical identity checks consistently select exactly one defined idea by exact `spec_path`, require each package breadcrumb to target that owner, and reject 100% of missing, dangling, mismatched, or duplicate owners in the compatibility suite.
- **SC-006**: Focused tests cover every category named in FR-027 and pass together with workspace definition lint.
- **SC-007**: Development output has no unintended drift from authoritative sources, and release inspection finds no tests or project-specific intake, spec, memory, execution, or project-local skill content beyond the existing generic project-skill stub.
- **SC-008**: Primary command tables, lifecycle diagrams, setup guidance, walkthroughs, migration guidance, and reference examples consistently use `brainstorm`, `idea`, and `.dude/ideas/`, while every retained `draft` mention identifies compatibility or deprecation.
- **SC-009**: A scoped terminology audit across product surfaces, dogfood memory, and project-local conventions leaves zero stale active canonical `.dude/brief/`, `## User Draft`, or primary `@dude draft` references outside allowlisted intentional migration specifications/fixtures, compatibility, explicitly superseded history, or unrelated generic-brief contexts.
- **SC-010**: The same unchanged migration state produces the same `plan_digest`; each required drift fixture produces a different digest; and apply with a missing or stale digest records zero tracker updates and zero filesystem writes.
- **SC-011**: The dogfood cutover moves exactly this package to `.dude/ideas/`, preserves its frontmatter and existing log history, rewrites only its required heading and first-line audit breadcrumb plus the one migration event, reconciles preserved dogfood project knowledge before regenerating and linting `.github/`, and leaves the next source migration plan at `noop` before the Beads installed-layout suite.
- **SC-012**: After rollout, every active ledger-specific statement in this source repository's durable decisions, context, and project-local skill uses the canonical brainstorm/ideas contract and deprecated-draft status; unrelated entries and memory history remain preserved, and intentional legacy migration specifications or fixtures remain allowlisted rather than rewritten.

## Assumptions

- This is one bounded feature because every affected surface participates in the same canonical intake-ledger transition and compatibility contract.
- Existing coordinator argument and slug-resolution conventions remain valid for `brainstorm`; the feature changes the primary verb and artifact semantics, not general command parsing.
- The permitted initial light edit is conservative and meaning-preserving; uncertain cases remain verbatim and may generate an open question.
- Canonical idea storage is intentionally flat; a nested legacy intake requires manual flattening or conflict resolution before migration.
- A canonical deterministic serialization and collision-resistant digest are sufficient to bind the reviewed plan; the technical plan selects the local compose reconciliation pattern and hash algorithm.
- The complete Beads id/description inventory is the deterministic tracker snapshot even when no issue needs rewriting.
- The fixed migration log event is a permitted, visible audit mutation and is included in each transformed output hash; no claim of total byte identity includes that new line.
- Legacy-only lint is diagnostic and non-mutating, while every ordinary mutation remains blocked until explicit migration.
- Compatibility is feature scope rather than a durable project guardrail.
- Optional tracked execution remains optional; this feature only keeps its import and mirror contracts coherent with canonical ideas.
- Bundle import, compose, skill scaffold, and team expansion already inherit the shared mutation assertion; tests should prove that contract before any production edits are considered.
- The current definition artifacts intentionally remain on the legacy path until the coordinator-owned rollout task executes during implementation.
- Generic release staging retains its existing project-skill stub and does not acquire this repository's ideas, memory, or project-local skill content.
- No unresolved clarification is required before planning.

## Out of Scope

- Removing the deprecated `@dude draft` alias.
- Changing `status` values or the exact-file meaning of `spec_path`.
- Automatically migrating legacy state during brainstorm, define, work, upgrade, or other ordinary commands.
- Renaming unrelated design briefs, site briefs, PRD drafts, or ordinary prose that uses "brief" generically.
- Preserving nested legacy intake directory structures under `.dude/ideas/`.
- Migrating this live definition package during the present re-definition pass.
- Implementing this definition package, importing it into Beads, or changing live execution state during definition.
