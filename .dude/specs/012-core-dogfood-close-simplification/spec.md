# Feature Specification: Core Dogfood Close Retirement

## Purpose

Retire the project-local automatic core dogfood promotion ceremony because its special baseline, declaration, evidence, routing, and close requirements obstruct ordinary iteration without adding enough value beyond the repository's existing build, parity, verification, and review protections.

Retirement is deletion, not redesign. Contributors use the existing development tools and normal feature-close expectations. The feature introduces no replacement command, helper, state, risk model, evidence record, or renamed ceremony.

## User Stories & Testing

### User Story 1: Remove The Special Promotion Ceremony (Priority: P1)

As a maintainer, I can change and close work without a project-specific dogfood terminal or promotion route, while retaining the repository's ordinary verification and review requirements.

**Independent Test:** Inspect all live project guidance, local skills, routing surfaces, and tests outside historical `.dude/**` records. The promotion skill, Core Dogfood Close procedure, `declared-src:` definition rule, Feature 009/T009 carve-out, baseline and accepted-line contracts, and special route are absent.

**Acceptance Scenarios:**

1. **Given** the live project-local promotion skill, **When** retirement is complete, **Then** `.github/skills/dude-local-core-dogfood-promotion/` no longer exists and no live route names it.
2. **Given** the project skill's Core Dogfood Close procedure, **When** retirement is complete, **Then** the procedure and its special definition, baseline, declaration, preflight, routing, evidence, and close requirements are absent.
3. **Given** ceremony-only static policy contracts and Feature 009/T009 packet fixtures, **When** retirement is complete, **Then** those tests and fixture machinery are removed rather than rewritten as another ceremony.
4. **Given** a new feature that plans a core source change, **When** it is defined, **Then** ordinary definition guidance does not require a dogfood terminal or a `declared-src:` clause.
5. **Given** historical core-dogfood records under `.dude/**`, **When** live policy is retired, **Then** those records remain byte-for-byte audit history.

### User Story 2: Follow One Ordinary Contributor Workflow (Priority: P1)

As a contributor, I can classify a change by ownership, follow the correct existing development loop, and distinguish an informational preview from final acceptance.

**Independent Test:** Starting from the canonical contributor workflow page, a reader can select core, pack, project-local, or docs-only ownership and complete the applicable workflow without consulting retired dogfood policy. The page includes one concise core example and one concise pack example.

**Acceptance Scenarios:**

1. **Given** a core change under `src/**`, **When** a contributor follows the documented loop, **Then** they run focused tests, run `node scripts/build-dev.mjs`, reload or restart when discovery or frontmatter requires it, exercise one named behavior against `.github/`, iterate, and later use fresh normal verification and review for final acceptance.
2. **Given** concurrent core edits, **When** the contributor runs `build-dev`, **Then** the documentation makes clear that all current `src/**` edits are projected together and are not separately attributed.
3. **Given** a pack change under `library/packs/<name>/`, **When** a contributor follows the documented loop, **Then** they run focused pack tests and compose verification, live-test through a disposable install, clean up the disposable target, and commit pack source without core promotion.
4. **Given** a change to `.github/skills/project/`, `.github/skills/dude-local-*`, workflows, or `.dude/**`, **When** ownership is classified, **Then** it is treated as a direct project-owned change rather than generated core.
5. **Given** a docs-only change, **When** ownership is classified, **Then** it is edited directly and receives only relevant documentation checks plus normal review.
6. **Given** successful preview evidence, **When** final acceptance begins, **Then** the preview has no baseline, digest, accepted-line, task-state, close, or evidence-reuse effect.

### User Story 3: Preserve Generic Build And Quality Protections (Priority: P1)

As a maintainer, I retain the reusable protections that are independent of the retired ceremony, including source/generated parity, protected-boundary preservation, CI drift detection, normal routing, tests, lint, pack verification, release verification, and independent review.

**Independent Test:** Focused and complete verification pass after retirement. Generic tests still prove the canonical development build, byte parity, preservation of pack, local, project, workflow, and `.dude` boundaries, and ordinary routing behavior.

**Acceptance Scenarios:**

1. **Given** the existing development build CLI and API, **When** the ceremony is retired, **Then** both remain available with their current source-to-generated behavior.
2. **Given** a development build over protected project content, **When** it runs, **Then** pack-owned, generic project-local, project-skill, workflow, and `.dude` fixtures remain protected.
3. **Given** CI and release tooling, **When** retirement is complete, **Then** the dev-bundle drift check, release build, release lint, and ordinary quality gates remain in force.
4. **Given** generic independent-review-envelope handling in `dude-work`, **When** dogfood policy is deleted, **Then** that shared behavior remains unchanged.

## Edge Cases

- Historical `.dude/**` records still contain `core-dogfood-*`, Feature 009, T009, promotion-skill, and `declared-src:` text; searches must distinguish audit history from live policy.
- The ceremony tests share a file with generic routing and CI contracts; retirement must remove only ceremony-specific tests and helpers.
- The current development-build preservation test uses the retiring skill as its project-local fixture; replacing that fixture must retain nested binary, symlink, mode, empty-directory, and idempotence coverage.
- A contributor runs `build-dev` while unrelated `src/**` edits exist; all such edits appear in the generated projection.
- A generated `.github/**` core file was hand-edited; preview and final parity must not bless it as authoritative.
- A discovery or frontmatter change appears correct on disk but is not visible to the active agent session until reload or restart.
- A disposable checkout, worktree, or pack-install target is interrupted; it remains optional, carries no acceptance authority, and is removed manually after use.
- A docs change spans ownership classes; the contributor follows each affected class rather than treating the whole change as docs-only.

## Functional Requirements

- **FR-001:** The live `.github/skills/dude-local-core-dogfood-promotion/` skill MUST be deleted.
- **FR-002:** The live `## Core Dogfood Close` procedure and all special dogfood routing and definition requirements MUST be removed from `.github/skills/project/SKILL.md`.
- **FR-003:** Ceremony-specific static contracts and fixture logic in `scripts/current-format-contract.test.mjs`, including Feature 009/T009 transient packet and accepted-line machinery, MUST be removed.
- **FR-004:** No live guidance MAY require a dogfood terminal, `declared-src:` clause, baseline line, declaration or evidence digest, accepted line, or promotion-specific review envelope.
- **FR-005:** No live reference or route to the deleted promotion skill MAY remain outside historical `.dude/**` records.
- **FR-006:** Every pre-existing historical `.dude/ideas/**`, `.dude/specs/**`, task, archive, execution-history, and Coordinator Log byte MUST remain unchanged except the two explicitly refreshed idea ledgers and this new definition package.
- **FR-007:** `scripts/build-dev.mjs`, its CLI and API, complete-current-`src/**` projection behavior, generated-core byte parity, CI dev-bundle drift check, and release tooling MUST remain available.
- **FR-008:** Ordinary feature verification MUST retain focused tests, fresh full verification where normal close requires it, byte parity, lint, and independent review, with no extra dogfood gate.
- **FR-009:** Generic tests MUST continue to cover development-build behavior, source/generated parity, protected pack, local, project, workflow, and `.dude` preservation, and normal routing.
- **FR-010:** The promotion-specific fixture in `scripts/build-dev.test.mjs` MUST be replaced by a generic project-local fixture if replacement is needed to retain generic preservation coverage.
- **FR-011:** One existing documentation page MUST be the canonical contributor workflow, with direct links from existing documentation entry points and no redundant docs hierarchy.
- **FR-012:** The contributor workflow MUST classify core, pack, project-local, and docs-only changes and identify the authoritative edit surface for each class.
- **FR-013:** The documented core loop MUST be: edit `src/**`; run focused tests; run `node scripts/build-dev.mjs`; reload or restart when discovery or frontmatter requires it; exercise one named behavior against `.github/`; iterate; then run fresh normal final verification and review, confirm parity, and commit `src/**` plus generated `.github/**` core.
- **FR-014:** The documented trustworthy preview check set MUST be focused tests, source/generated parity, and one named behavior against `.github/`; contributors MAY run less while iterating.
- **FR-015:** A small preview SHOULD target less than two minutes, excluding manual reload and the named behavior's own external latency.
- **FR-016:** Preview evidence MUST remain informational and MUST NOT create or reuse a baseline, digest, accepted line, persistent report, task-state transition, close decision, or final-acceptance evidence.
- **FR-017:** The documented pack loop MUST be: edit `library/packs/<name>/`; run focused pack tests and compose verification; live-test through a disposable install; remove the disposable target; and commit pack source without core promotion.
- **FR-018:** Project-local `.github/skills/project/`, `.github/skills/dude-local-*`, workflows, and `.dude/**` MUST be documented as direct project-owned surfaces; docs-only files MUST be documented as direct edits with relevant checks.
- **FR-019:** Documentation MUST explain invocation, generated output, complete-worktree scope, reload, optional isolation, and cleanup semantics and MUST include one concise worked core example and one concise worked pack example.
- **FR-020:** The feature MUST NOT introduce a replacement command, helper, state store, baseline, ledger, persistent report, risk-tier system, or renamed ceremony.

## Key Entities

- **Live promotion ceremony**: The project-local skill, project guidance, route, definition rule, evidence formats, and static tests that impose special core promotion and close behavior.
- **Informational core preview**: The existing source-derived development build plus focused checks and one named behavior; it changes generated working-tree output but grants no acceptance authority.
- **Ownership class**: One of core, pack, project-local, or docs-only, each with a distinct authoritative edit surface and verification path.
- **Historical dogfood record**: Existing `.dude/**` intent, definition, task, archive, execution-history, or log bytes retained solely as audit history.

## Success Criteria

- **SC-001:** A live-tree search outside `.dude/**` finds zero references or routes to `dude-local-core-dogfood-promotion` after retirement.
- **SC-002:** Live definition and project guidance contains zero requirements for a dogfood terminal or `declared-src:` clause.
- **SC-003:** Ceremony-only policy and Feature 009/T009 tests are absent, while all pre-existing generic build-dev, parity, protected-boundary, CI, and normal-routing tests remain present and pass.
- **SC-004:** The canonical contributor workflow covers all four ownership classes, preview versus final evidence, invocation, output, reload, isolation, cleanup, and both worked examples, with direct links from the root and docs indexes.
- **SC-005:** A representative small preview completes its focused tests, source/generated parity check, and local build step in less than two minutes, excluding manual reload and external named-behavior latency.
- **SC-006:** Focused tests, the recursively discovered full suite, Dude lint, compose verification, a pristine release build and release lint, and the repository diff check all pass.
- **SC-007:** Generic development-build preservation still covers at least one pack-owned tree, one generic `dude-local-*` tree, the project skill, workflows, and `.dude/**`, including its existing binary, symlink where supported, mode, empty-directory, and idempotence assertions.
- **SC-008:** Aside from the two refreshed owner/intake ledgers and this new package, historical `.dude/**` records have zero byte changes.

## Assumptions

- The existing direct development build is sufficient for implementation-time preview even though it projects all current core-source edits together.
- Optional manual checkout or worktree isolation is sufficient for rare isolated previews.
- The existing normal verification, review, CI, compose, and release mechanisms provide the protections worth retaining.
- The canonical contributor documentation can live on an existing page; no new documentation file is required.

## Out Of Scope

- Repairing CI-green failures or introducing accepted-failure baselines.
- Pack-agent Scope conformance.
- Technical-docs T009 or broader technical-docs work.
- Release tagging or release-version policy.
- Changing generic `dude-work` review-envelope handling.
- Changing `src/**`, the development-build implementation, parity semantics, compose implementation, CI workflow, or release tooling.