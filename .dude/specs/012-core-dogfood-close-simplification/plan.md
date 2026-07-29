# Implementation Plan: Core Dogfood Close Retirement

## Summary

Delete the project-local promotion skill and its live project policy, remove the ceremony-only static contracts and Feature 009/T009 packet machinery, preserve generic build and routing coverage, and document the ordinary contributor workflow on one existing page. This is a project-local policy, test, and documentation change; it adds no replacement system and plans no `src/**` write.

Canonical feature identity is `.dude/specs/012-core-dogfood-close-simplification/spec.md`.

## Technical Context

**Language/Version**: Markdown policy and documentation plus dependency-free JavaScript ES modules tested on Node.js >= 20.

**Primary Dependencies**: Node built-ins, the existing `node:test` suites, `scripts/build-dev.mjs`, Dude lint, Dude compose, Git, and the existing release builder. No dependency is added.

**Storage**: No runtime storage. Existing `.dude/**` history is read-only during implementation; this definition transaction is the only new package state.

**Testing**: Focused `scripts/current-format-contract.test.mjs` and `scripts/build-dev.test.mjs`, recursively discovered tests, Dude lint, compose verification, pristine release build and lint, source/generated parity, diff checks, and independent review.

**Target Platform**: Maintainer worktrees and CI runners supported by the repository on Node.js 20 and 22.

**Project Type**: Reusable bundle repository with project-local dogfood policy, generated dev bundle, pack catalog, and contributor documentation.

**Performance Goal**: Keep a representative small preview under two minutes for focused tests, parity, and the local build, excluding manual reload and external behavior latency. Add no persistent benchmark or report.

## Guardrail Check

| Guardrail | Plan response |
|---|---|
| Keep intent separate from implementation | The specification defines retirement behavior and preserved guarantees; this plan selects exact files and test surgery. |
| Prefer deterministic scripts for reproducible validation | Existing tests, lint, compose verify, release build/lint, parity, searches, and diff checks provide deterministic evidence. |
| Keep instructions concise and non-redundant | Delete the large ceremony and put the ordinary workflow on one existing canonical page with links. |
| Choose the smallest design that satisfies proven requirements | Delete policy and ceremony tests, genericize one fixture, update three existing docs files, and add no command, helper, state, or replacement protocol. |

No new guardrail is proposed.

## Inspection Findings

The live retirement surface is bounded to:

- `.github/skills/dude-local-core-dogfood-promotion/SKILL.md`: the sole file in the local promotion skill directory.
- `.github/skills/project/SKILL.md`: the large `## Core Dogfood Close` section, including the Feature 009/T009 route and definition-time `declared-src:` rule.
- `scripts/current-format-contract.test.mjs`: a distinct sequence of Core Dogfood policy tests and helpers, including the T006 first-adopter fixtures and the T007 transient repository, packet, accepted-line, and close machinery.
- `scripts/build-dev.test.mjs`: one otherwise-generic protected-tree test uses the promotion skill directory, nested binary, symlink, and empty directory as its `dude-local-*` fixture.

The repository has no `src/**`, pack-source, documentation, or workflow route to the local promotion skill. Generic current-format routing contracts precede the ceremony block, while generic CI source and shell contracts follow it. `scripts/build-dev.mjs` already preserves pack, local, project, workflow, and `.dude` ownership tiers and requires no implementation change.

The smallest documentation home is the existing maintainer section in `docs/commands.md`, adjacent to `### Repo layout: source vs built bundle`. Add a canonical `### Repository development workflow` section there and link directly to it from `README.md` and `docs/README.md`. Do not create another docs file or duplicate the full workflow in the entry points.

## Implementation Boundary

Expected implementation writes are exactly:

- Delete `.github/skills/dude-local-core-dogfood-promotion/SKILL.md` and remove its now-empty directory.
- Update `.github/skills/project/SKILL.md`.
- Update `scripts/current-format-contract.test.mjs`.
- Update `scripts/build-dev.test.mjs`.
- Update `docs/commands.md`.
- Update `README.md`.
- Update `docs/README.md`.

Do not modify `src/**`, `scripts/build-dev.mjs`, `.github/workflows/ci.yml`, `library/packs/**`, generic `dude-work` review-envelope handling, release tooling, or any historical `.dude/**` artifact.

No active ObjectiveRegistry is needed. The feature has no runtime progress objective.

## Selected Architecture

### 1. Delete Live Ceremony Ownership And Routing

- Delete the local promotion skill rather than thinning or renaming it.
- Remove the complete `## Core Dogfood Close` section from the project skill, including special definition readiness, resolver/preflight, baseline, serialization, route, and first-adopter text.
- Leave the surrounding project knowledge and ordinary working conventions intact.
- Do not add a successor route or definition exception.

### 2. Remove Ceremony Contracts Without Losing Generic Coverage

- In `scripts/current-format-contract.test.mjs`, remove constants, helpers, fixtures, and tests whose only subject is Core Dogfood policy, the promotion skill, `declared-src:`, Feature 009/T009 first-adopter authority, the transient packet repository, baseline/accepted-line identities, special materialization, or event-only close.
- The removable test sequence begins with `T001 Core Dogfood Close source contract proves policy coverage only, not future Spec Lead, Reviewer, or close behavior` and ends with `T004 Core Dogfood baseline predicates reject tracked, hidden, untracked, and ignored dirt`.
- Preserve the generic routing, ownership, workflow, and recovery tests before that sequence and the generic CI source, shell, temporary-Git, and autonomous-governance tests after it.
- Some generic CI tests currently reuse dogfood-named ownership roots or temporary-Git predicates. Retain those generic checks under neutral CI/build names and remove only ceremony-specific consumers. Remove imports only when no retained generic test uses them.
- Do not change shared `dude-work` accepted-feature or independent-review-envelope behavior merely because the retired packet tests imported it.

### 3. Genericize The Protected Local Fixture

- In `scripts/build-dev.test.mjs`, replace `.github/skills/dude-local-core-dogfood-promotion/**` fixture paths with a neutral `.github/skills/dude-local-preservation-fixture/**` tree.
- Keep the local skill file, nested binary, supported-platform symlink, empty directory, mode checks, snapshot comparison, and first/second-build idempotence assertions.
- Keep the existing pack-owned, project-skill, workflow, `.dude`, source filtering, stale-core cleanup, and exact projection assertions unchanged.

### 4. Document The Ordinary Workflow Once

Add `### Repository development workflow` to `docs/commands.md` with:

- A four-row ownership table for core, pack, project-local, and docs-only changes.
- The trustworthy core preview loop: focused tests, `node scripts/build-dev.mjs`, source/generated parity, reload or restart when discovery/frontmatter changes require it, and one named behavior against `.github/`.
- Explicit output semantics: all current `src/**` edits project together; generated core is non-authoritative; stale core output is removed; pack, local, project, workflow, and `.dude` content is preserved.
- Explicit final semantics: preview is informational only; fresh normal verification and independent review decide acceptance; commit authoritative `src/**` with generated `.github/**` core.
- The pack loop: focused pack tests, `node .github/skills/dude-compose/compose.mjs verify`, then a disposable install using the existing compose `add <name> --root <tmp> --library <repo>/library/packs --no-fetch` interface, live behavior exercise, and removal of the disposable target.
- Optional manual checkout/worktree isolation and cleanup, with no new isolation tooling.
- One concise core example and one concise pack example.

Change the existing docs links in `README.md` and `docs/README.md` to point directly to `docs/commands.md#repository-development-workflow`. Keep only a short link description in each index.

## Verification Strategy

### Focused Retirement And Preservation

```bash
node --test scripts/current-format-contract.test.mjs scripts/build-dev.test.mjs
node --test --test-name-pattern='checked-in dev core is a byte-identical non-mutating projection of authoritative source' scripts/build-dev.test.mjs
rg -n 'dude-local-core-dogfood-promotion|Core Dogfood Close|declared-src:|core-dogfood-(baseline|accepted)|T009@696e6369' .github scripts src library docs README.md
```

The final search must return no live matches. Historical `.dude/**` is deliberately excluded.

### Full Validation

```bash
find . -path ./dist -prune -o -name '*.test.mjs' -print0 | xargs -0 node --test
node .github/skills/dude-lint/lint.mjs .
node .github/skills/dude-compose/compose.mjs verify
RELEASE_ROOT="$(mktemp -d)"
node scripts/build-release.mjs --out "$RELEASE_ROOT/bundle" --tag v0.0.0
node "$RELEASE_ROOT/bundle/.github/skills/dude-lint/lint.mjs" "$RELEASE_ROOT/bundle"
rm -rf "$RELEASE_ROOT"
git diff --check
```

Inspect the final diff for exact implementation scope and verify that no historical `.dude/**` path changed. Obtain fresh independent review focused on accidental generic-coverage loss, stale live routes, documentation completeness, and prohibited replacement machinery.

## Phases

| Phase | Outcome | Task |
|---|---|---|
| 1 | Live promotion skill/policy and ceremony-only tests are gone; the generic local-preservation fixture and generic routing/CI/build coverage remain. | T001@72657469 |
| 2 | One existing canonical docs page explains all four ownership classes, preview/final semantics, cleanup, and both examples; root and docs indexes link to it. | T002@646f6373 |
| 3 | Focused and full verification, lint, compose, pristine release, diff inspection, history preservation, and independent review pass. | T003@76657269 |

T001 and T002 have disjoint write sets and are parallel candidates. T003 depends on both.

## Traceability

| Requirement | Plan decision | Task |
|---|---|---|
| FR-001 through FR-005 | Selected Architecture 1 and 2 | T001@72657469 |
| FR-006 | Implementation Boundary and Full Validation | T003@76657269 |
| FR-007 through FR-010 | Selected Architecture 2 and 3 | T001@72657469, T003@76657269 |
| FR-011 through FR-019 | Selected Architecture 4 | T002@646f6373, T003@76657269 |
| FR-020 | All architecture sections and scope review | T001@72657469, T002@646f6373, T003@76657269 |
| SC-001 through SC-003, SC-007 | Focused Retirement And Preservation | T001@72657469, T003@76657269 |
| SC-004, SC-005 | Documentation workflow and timed representative preview | T002@646f6373, T003@76657269 |
| SC-006, SC-008 | Full Validation and history inspection | T003@76657269 |

## Complexity Tracking

No complexity exception is claimed. A replacement command, helper, state store, baseline, ledger, persistent report, risk tier, compatibility layer, or renamed ceremony would exceed the selected retirement outcome and is rejected.

## Omitted Artifacts

- `research.md`: repository inspection and the retire-versus-thin decision are settled in the owner ledger and this plan.
- `data-model.md`: no runtime or persistent data model is added.
- `contracts/api.md` and `contracts/schemas.md`: no API, command, evidence, or schema contract is introduced.
- `quickstart.md`: the user-facing workflow belongs in the existing canonical documentation page.
- Test, security, UX, and OWASP checklists: the three canonical tasks carry the complete bounded verification and review contract.

## Out Of Plan

- Any `src/**` or generated-core implementation change.
- Any rewrite, cleanup, migration, or deletion of historical `.dude/**` records.
- Any change to generic `dude-work` review-envelope handling.
- CI-green failure policy, accepted-failure baselines, pack-agent Scope conformance, technical-docs T009, or release tagging.
- Any new preview, promotion, isolation, baseline, evidence, or close subsystem.