# Feature Specification: Automatic Core Dogfood Promotion

## Purpose

Make this repository's accepted main-core projection a required final-close concern for features that change authoritative source under `src/**`.

Before the first source mutation, always-available project guidance establishes a clean, immutable baseline, records it through the coordinator, and starts one serialized core-work interval. The terminal-loaded procedure must validate and consume that existing baseline; it cannot create, repair, or retroactively establish one.

The reusable post-readiness promotion procedure belongs to the project-local `.github/skills/dude-local-core-dogfood-promotion/SKILL.md`. Dude discovers and loads it only when the canonical terminal promotion task is ready after every source-contributing dependency and pre-promotion acceptance prerequisite has cleared. Completing or reviewing a specification alone never loads the skill and never authorizes generated-core changes.

For accepted core work, the procedure promotes accepted source into generated core, proves current source/generated parity and protected-boundary preservation, requires independent final acceptance, and permits close only against current bounded evidence. Static contract checks support this process but do not prove future model decisions or lifecycle behavior; fresh authority exercises and independent review remain required.

This is repository-local lifecycle behavior. It does not apply to optional packs, technical-docs work, release publication, downstream upgrades, or user-facing Dude capabilities, and the local skill is not shipped as core or end-user behavior.

## User Stories & Testing

### User Story 1: Define And Route Core Close Work (Priority: P1)

As a maintainer defining and executing future core work, I receive one explicit terminal task for planned source writes, and the reusable local procedure is loaded only when that task is genuinely ready for promotion.

**Independent Test:** Exercise the actual definition and independent-review authorities against planned-source, no-source, not-ready, ready, and malformed scenarios. Results are current behavioral evidence, not proof of future model behavior.

**Acceptance Scenarios:**

1. **Given** planned writes to exact files under `src/**`, **When** canonical tasks are staged, **Then** exactly one open shared terminal task declares the complete source set and depends on every source contributor.
2. **Given** an incomplete, ambiguous, duplicate, or non-file source declaration, **When** definition readiness is reviewed, **Then** the review rejects it.
3. **Given** a missing source-contributing dependency, **When** definition readiness is reviewed, **Then** the review rejects it.
4. **Given** a terminal task with an incomplete source dependency, an uncleared blocker, or missing pre-promotion acceptance, **When** readiness is considered, **Then** the task is not ready and the local promotion skill is not loaded.
5. **Given** every source-contributing dependency and pre-promotion acceptance prerequisite has cleared, **When** the canonical terminal becomes ready, **Then** the project convention routes to and Dude discovers and loads `.github/skills/dude-local-core-dogfood-promotion/SKILL.md` for the reusable procedure.
6. **Given** a completed specification but no ready canonical terminal, **When** definition completes, **Then** the local skill is not loaded and generated core remains unchanged.
7. **Given** a missing, parallel, closed, malformed, incomplete, or dependency-deficient terminal task, **When** independent definition readiness review runs, **Then** the Reviewer returns `REJECT`.
8. **Given** no planned `src/**` write, **When** tasks are staged, **Then** no normal core terminal task is derived.
9. **Given** the current package, **When** bootstrap acceptance is staged, **Then** its explicit no-source terminal task remains a one-time exception and does not establish a general no-source derivation rule.
10. **Given** execution in either supported lane, **When** the source declaration is consulted, **Then** exactly one lane-appropriate live authority is used and mirrors or notes cannot override it.

### User Story 2: Establish A Clean Baseline Before Source Work (Priority: P1)

As a maintainer starting core work, I can prove that the exact feature owner and terminal began from a clean immutable source/generated state before any source mutation.

**Independent Test:** Exercise clean, dirty, stale, concurrent, and ambiguous pre-source packets. Only a clean packet with exact ownership, current parity, coordinator-recorded baseline evidence, and an immediate successful recheck may proceed to source mutation.

**Acceptance Scenarios:**

1. **Given** exact owner and terminal resolution, immutable repository and source-tree identities, clean source and generated boundaries, and current parity, **When** core work begins, **Then** the coordinator records bounded baseline evidence in the unique owner's existing log only after every preflight condition passes.
2. **Given** recorded baseline evidence, **When** the first source mutation is about to occur, **Then** the same ownership, identity, cleanliness, and parity conditions are rechecked immediately and any mismatch blocks.
3. **Given** an accepted baseline, **When** source work proceeds, **Then** one serialized interval remains in force through promotion and every changed source path remains declared.
4. **Given** observed or suspected concurrency, **When** isolation cannot be trusted, **Then** work blocks without assigning actor identity.
5. **Given** an unavailable clean boundary, **When** an isolated worktree could provide one, **Then** it is used only after explicit user opt-in; otherwise work waits.
6. **Given** a missing, stale, mismatched, or retroactively proposed baseline, **When** the terminal promotion procedure is loaded, **Then** it refuses to proceed and does not invent or repair the baseline.

### User Story 3: Close Only Against Bound Accepted Evidence (Priority: P1)

As a maintainer closing core work, I can prove that one serialized, independently accepted source revision produced the generated core without adopting dirty, undeclared, concurrent, or drifted work.

**Independent Test:** Exercise fresh read-only close packets for missing baseline, undeclared path, declaration mismatch, post-review source drift, generated drift, failed verification, and rejected review. Every packet must block without mutation.

**Acceptance Scenarios:**

1. **Given** accepted source changes and a ready terminal, **When** the loaded local procedure begins promotion, **Then** the existing baseline and reviewed identities must still match before generated core changes.
2. **Given** an accepted source change with no generated destination, **When** promotion runs, **Then** the source lifecycle still applies even if generated output is unchanged.
3. **Given** successful promotion, **When** preservation and parity are checked, **Then** generated core exactly reflects current authoritative source and protected project boundaries are unchanged.
4. **Given** successful verification, **When** an independent Reviewer accepts the bound evidence, **Then** the coordinator records bounded acceptance evidence and immediately rechecks every bound identity.
5. **Given** drift after review or acceptance evidence, **When** close is considered, **Then** fresh affected verification, a new independent review, and later matching evidence are required.
6. **Given** no accepted source change in this bootstrap package, **When** terminal acceptance runs, **Then** promotion is a verified no-op and current parity is proved without changing generated core.
7. **Given** a missing or mismatched baseline, declaration, source identity, generated projection, verification result, or accepted review, **When** close is considered, **Then** close blocks without corrective mutation or delivery claim.

### User Story 4: Keep CI A Bounded Verification Backstop (Priority: P2)

As a maintainer, I receive an early CI failure for repository-visible build drift or normally excluded entries in owned boundaries without granting CI repository-write or release authority.

**Independent Test:** Exercise clean and dirty owned-boundary cases and confirm that CI accepts only a current generated projection while retaining read-only repository authority.

**Acceptance Scenarios:**

1. **Given** a clean checkout, **When** CI verifies the generated projection, **Then** it confirms a clean state before and after projection.
2. **Given** pre-existing visible or normally excluded drift in the named owned boundaries, **When** CI verifies the projection, **Then** CI fails and reports the drift without repairing it.
3. **Given** normally excluded output outside the named owned boundaries, **When** CI runs, **Then** that output is not represented as covered by this guarantee.
4. **Given** CI checkout and validation, **When** repository authority is inspected, **Then** it is read-only and contains no commit, push, tag, release, publish, credential persistence, or remote mutation behavior.

## Edge Cases

- A specification completes while the terminal task is absent, blocked, or dependency-incomplete.
- The project route names the wrong skill, the local skill is missing, or its frontmatter name does not match its directory.
- Static contract tests pass but a future model does not discover or follow the procedure.
- A planned source-writing task produces no accepted source change.
- A source path is added, deleted, renamed, or modified.
- A declaration contains duplicate, unsorted, directory, or glob entries.
- A contributing task is omitted from terminal dependencies.
- The live Lightweight declaration and live tracked declaration disagree after import.
- The current package has no source declaration but retains its explicit bootstrap terminal exception.
- The immutable repository or source-tree identity changes after baseline capture.
- Source or base-owned generated core contains pre-existing changes or normally excluded entries before baseline.
- Pending repository states offset so baseline-visible file bytes appear unchanged while an intermediate state remains dirty.
- Source changes after independent source review or final acceptance.
- A changed source path was not declared.
- An authoritative source file with no generated destination changes while every projectable source file remains unchanged.
- Generated core is hand-edited or reflects another source revision.
- Installed packs, project-local guidance, workflows, or `.dude/**` change during promotion.
- A stale accepted line remains in the append-only log after later drift.
- Transient review input is lost before close.
- Concurrent activity is suspected even though actor attribution is not mechanically available.
- Full validation fails because of unrelated active work.
- CI sees repository-visible drift but cannot identify every possible filesystem mutation.
- Normally excluded output exists outside the named owned-boundary guarantee.

## Functional Requirements

- **FR-001:** The lifecycle MUST apply only to this repository's authoritative core under `src/**` and its base-owned generated projection under `.github/**`.
- **FR-002:** Dude MUST discover and load the local promotion skill only when the canonical terminal task is ready after every source-contributing dependency and pre-promotion acceptance prerequisite has cleared. Specification or definition completion alone MUST NOT load the skill, invoke materialization, or authorize promotion.
- **FR-003:** `.github/skills/project/SKILL.md` MUST remain concise while carrying the complete executable pre-terminal baseline contract that must be available before the first source mutation. `.github/skills/dude-local-core-dogfood-promotion/SKILL.md` MUST own the detailed post-readiness evidence, materialization, verification, and final-close procedure and MUST remain project-only.
- **FR-004:** A future definition with planned writes to exact `src/**` files MUST stage exactly one open shared terminal task with a complete, unambiguous exact-file declaration and dependencies on every source-contributing task.
- **FR-005:** Independent definition readiness review MUST reject a missing, multiple, closed, parallel, malformed, incomplete, or dependency-deficient terminal task.
- **FR-006:** A future definition with no planned source write MUST normally derive no core terminal task. This package's no-source terminal task is an explicit bootstrap exception.
- **FR-007:** Each supported execution lane MUST have exactly one declaration authority. Mirrors and notes MUST NOT override or duplicate live declaration or evidence authority.
- **FR-008:** Before the first source mutation, the coordinator MUST resolve the exact defined owner and terminal, bind immutable repository and source-tree identities, prove clean source and base-owned generated boundaries across every relevant pre-existing-change category, and prove current source/generated parity.
- **FR-009:** The coordinator MUST record bounded baseline evidence in the unique owner's existing append-only log only after every preflight condition passes, then MUST immediately recheck the same conditions before the first source mutation.
- **FR-010:** Core work MUST remain serialized from baseline through promotion. Observed or suspected concurrency MUST block without claims of actor attribution.
- **FR-011:** If a clean serialized boundary is unavailable, work MUST wait or use an isolated worktree only after explicit user opt-in.
- **FR-012:** The terminal-loaded local skill MUST validate and consume the existing baseline. It MUST NOT invent, repair, replace, or retroactively establish missing or stale pre-terminal evidence.
- **FR-013:** Every accepted changed source path MUST be declared, and the active declaration MUST match the declaration bound by acceptance.
- **FR-014:** Baseline, declaration, complete source, changed source, verification, and independent-review evidence MUST be bounded, reproducible, drift-sensitive, and sufficient to bind one accepted revision without storing source or generated file contents in the owner log.
- **FR-015:** Promotion MUST run only from the ready terminal procedure for an independently accepted source-changing revision whose bound evidence remains current. Source changes with no generated destination MUST still participate in the lifecycle.
- **FR-016:** A revision with no accepted source change MUST be a verified no-op that proves current parity without changing generated core.
- **FR-017:** Promotion MUST preserve installed optional-pack artifacts, project-local guidance, workflows, and `.dude/**`, and MUST produce exact source/generated parity.
- **FR-018:** Final acceptance MUST include applicable focused and full repository verification, project and release-artifact integrity checks, feature-scope checks, final parity, and fresh independent review.
- **FR-019:** Acceptance evidence MUST be coordinator-owned, append-only, recorded only after fresh independent acceptance, and immediately revalidated. Close MUST use only the latest matching evidence.
- **FR-020:** Later source, declaration, generated, verification, or review drift MUST require fresh affected verification, independent re-review, and later matching evidence.
- **FR-021:** Missing or mismatched ownership, baseline, declaration, source identity, generated projection, verification, preservation, or review evidence MUST block mutation, close, and delivery claims.
- **FR-022:** Static checks MUST verify only visible contracts and reproducible predicates. Definition acceptance MUST also include fresh, non-persisted authority exercises for valid, not-ready, no-source, malformed, and close-blocking scenarios.
- **FR-023:** CI MUST act only as a verification backstop: detect relevant pre-existing or promotion-produced drift in named owned boundaries, fail without repair, retain read-only repository authority, and perform no commit, push, tag, release, publish, credential persistence, or remote mutation.
- **FR-024:** This feature MUST make no planned `src/**` or base-owned generated-core mutation and MUST treat its explicit no-source terminal as a bootstrap exception.
- **FR-025:** No optional-pack, technical-docs, release-source, downstream, user-facing, or shipped-skill change is permitted. The new `dude-local-*` skill is project-owned, not shipped.
- **FR-026:** No new command, framework, helper file, state store, ledger, ObjectiveRegistry, compiler, runtime, or persistent scenario report is permitted.

## Key Entities

- **Local Promotion Skill:** The project-only reusable procedure loaded from `.github/skills/dude-local-core-dogfood-promotion/SKILL.md` only at canonical terminal readiness.
- **Concise Project Route:** The always-available project convention that carries the complete pre-terminal baseline contract, defines the terminal trigger, and routes ready work to the local skill without duplicating the post-readiness runbook.
- **Terminal Readiness:** The state in which every source-contributing dependency and pre-promotion acceptance prerequisite is cleared and no blocker prevents terminal promotion work.
- **Declared Source Set:** The complete unique sorted exact source-file paths in the terminal task's `declared-src:` clause.
- **Terminal Core Task:** The one open, non-parallel shared task that declares source paths and depends on every source contributor.
- **Lane Declaration Authority:** The one live declaration source selected by the active Lightweight or tracked execution lane.
- **Core Baseline:** The exact immutable repository and source-tree identities, clean source/generated boundaries, current parity, and coordinator-owned evidence established before source mutation.
- **Bound Acceptance Evidence:** Reproducible identities for the declaration, complete source, changed source, verification, and independent review that bind one accepted revision.
- **Coordinator Log Evidence:** Bounded append-only audit records in the unique owner's existing Coordinator Log.
- **Generated Core Projection:** The base-owned `.github/**` output expected from the complete projectable source inventory.
- **Protected Project Boundary:** Installed packs, project-local guidance including the local promotion skill, workflows, and `.dude/**` bytes that materialization must preserve.
- **Fresh Authority Exercise:** A current-session read-only Spec Lead, Reviewer, route, or close decision over supplied scenarios, with no persistent fixture or report.

## Success Criteria

- **SC-001:** A fresh valid planned-source exercise stages exactly one open shared terminal task with a complete exact-file declaration and all contributor dependencies; the ready case routes to the local skill and the not-ready case does not.
- **SC-002:** A fresh no-source exercise stages no normal terminal task.
- **SC-003:** Fresh malformed exercises cause independent Reviewer `REJECT` for every missing, parallel, malformed, incomplete, and dependency-deficient terminal case.
- **SC-004:** In fresh pre-source exercises, no source mutation is authorized unless exact ownership, immutable identities, every cleanliness boundary, current parity, coordinator-recorded baseline evidence, and immediate recheck all pass.
- **SC-005:** Fresh concurrency exercises block on observed or suspected overlap, and isolated-worktree fallback proceeds only with explicit user opt-in.
- **SC-006:** Every accepted changed source path is declared, and any repository, source, declaration, generated, verification, or review drift prevents use of older evidence.
- **SC-007:** Fresh close exercises block all required invalid packets without mutating tasks, lane state, logs, source, generated output, or repository state.
- **SC-008:** Promotion verification preserves 100% of protected paths and contents and produces exact, repeatable generated output.
- **SC-009:** CI exercises accept the clean case, reject covered visible and normally excluded drift, preserve read-only authority, and perform no remote mutation or release operation.
- **SC-010:** The bootstrap revision contains no `src/**` or base-owned generated-core delta, performs no generated-core mutation, validates the route and local procedure with fresh non-persisted exercises, passes all required fresh verification, and receives independent final acceptance.
- **SC-011:** Static contract checks fail when the complete pre-terminal baseline contract, exact local-skill route, terminal-readiness trigger, or required post-readiness procedure clauses are absent, while explicitly making no claim about future model behavior.

## Assumptions

- The canonical terminal becomes ready only after all source-contributing dependencies and their pre-promotion acceptance prerequisites have cleared.
- Procedure ownership is settled: the project skill carries the concise complete pre-terminal baseline contract and route, while the project-local skill carries the detailed post-readiness procedure.
- The local skill is repository-specific and is neither shipped as core nor exposed as an end-user skill.
- The coordinator-before-close plus CI-verification model is settled: accepted `src/` changes are projected before close, while CI independently checks that projection is current.
- Project-local scope and no CI auto-commit are settled. This feature does not alter downstream bundle behavior or grant CI release authority.
- Dogfood promotion ends at accepted `src/` to generated `.github/` projection and validation. Release promotion remains a separate merge, tag, and publish concern.
- The interval from baseline through materialization is locally controlled. Actor identity is not mechanically inferred from filesystem or Git state.
- Transient review input remains available through the immediate accepted-line and close checks. An interruption that loses it requires fresh review.

## Out of Scope

- Optional packs under `library/packs/**`.
- Technical-docs implementation or remediation.
- Changes to release source, release workflows, merge, commit, tag, publish, or downstream upgrade behavior.
- A user-facing promotion command or capability.
- A shipped core or end-user promotion skill; the project-local `dude-local-*` skill is the only new skill artifact.
- A deterministic definition compiler, skill-discovery runtime, or close runtime.
- An ObjectiveRegistry.
- A persistent promotion ledger, state file, schema artifact, helper file, framework, or scenario report.
- Tracked-note duplication of audit evidence.
- Automatic worktree creation.
- Mechanical attribution of a changed file to a particular actor.
- Detection of every possible repository-invisible filesystem mutation in CI.
- Cleanup, adoption, or reclassification of unrelated work.