<!-- audit log: .dude/ideas/core-dogfood-close-simplification.md#coordinator-log -->

<!-- canonical task units - only the coordinator mutates task state -->

# Tasks: Core Dogfood Close Retirement

Three all-open canonical units implement `.dude/specs/012-core-dogfood-close-simplification/spec.md`.

T001 and T002 have disjoint implementation write sets and are `[P]` parallel candidates. T003 performs no implementation write and depends on both. No `src/**` write is planned, so this package derives no special Core Dogfood terminal and contains no `declared-src:` clause.

Execution may read but must not write this definition package. A required normative change stops with `contract-mismatch: redefine-required`. Historical `.dude/**` artifacts other than this package and its two explicitly refreshed idea ledgers remain read-only.

Durable suffixes are the fixed lowercase hexadecimal encodings of `reti`, `docs`, and `veri`.

## Phase 1: Retire Live Policy And Ceremony Contracts

**Goal**: Remove every live dogfood-promotion route and ceremony-only contract while preserving generic build, parity, protected-boundary, CI, and normal-routing coverage.

**Implementation Write Set**:

- Delete `.github/skills/dude-local-core-dogfood-promotion/SKILL.md`.
- Update `.github/skills/project/SKILL.md`.
- Update `scripts/current-format-contract.test.mjs`.
- Update `scripts/build-dev.test.mjs`.

**Execution Details**:

- Delete the complete local promotion skill and `## Core Dogfood Close` project-policy section; add no successor route or definition exception.
- Remove ceremony-specific current-format constants, imports, helpers, fixtures, and tests for the promotion skill, `declared-src:`, Feature 009/T009 first-adopter authority, transient packet, baseline and accepted lines, materialization, and special close.
- Retain generic current-format routing and recovery tests before the ceremony sequence and generic CI source, shell, temporary-Git, and governance tests after it; rename shared generic predicates only where needed to remove dogfood terminology.
- Replace the protected local fixture with `.github/skills/dude-local-preservation-fixture/**` while retaining nested binary, symlink where supported, mode, empty-directory, protected-tier snapshot, exact projection, cleanup, and idempotence assertions.
- Do not modify `src/**`, `scripts/build-dev.mjs`, CI, release tooling, pack source, generic `dude-work` review evidence, or historical `.dude/**` records.

**Focused Verification**:

```bash
node --test scripts/current-format-contract.test.mjs scripts/build-dev.test.mjs
node --test --test-name-pattern='checked-in dev core is a byte-identical non-mutating projection of authoritative source' scripts/build-dev.test.mjs
rg -n 'dude-local-core-dogfood-promotion|Core Dogfood Close|declared-src:|core-dogfood-(baseline|accepted)|T009@696e6369' .github scripts src library docs README.md
```

**Independent Test**: The focused suites pass; the live-reference search is empty; generic routing tests remain; the development-build test still proves exact projection, parity, and preservation of pack, neutral local, project, workflow, and `.dude` fixtures.

- [x] T001@72657469 [P] [US1] Delete `.github/skills/dude-local-core-dogfood-promotion/SKILL.md`; remove the complete Core Dogfood Close procedure and special definition/route from `.github/skills/project/SKILL.md`; remove ceremony-only Feature 009/T009, transient-packet, baseline, accepted-line, materialization, and close contracts from `scripts/current-format-contract.test.mjs` while retaining generic routing/CI coverage; genericize the protected local fixture in `scripts/build-dev.test.mjs`; run the focused retirement, parity, preservation, and zero-live-reference checks without changing `src/**`, shared review handling, tooling, or historical `.dude/**` records.

## Phase 2: Document The Ordinary Contributor Workflow

**Goal**: Make one existing page the canonical development workflow for core, pack, project-local, and docs-only changes, with explicit preview/final semantics and two examples.

**Implementation Write Set**:

- `docs/commands.md`
- `README.md`
- `docs/README.md`

**Execution Details**:

- Add `### Repository development workflow` beside the existing source-versus-built-bundle section in `docs/commands.md`.
- Cover ownership classification; the exact core `build-dev` invocation and complete-worktree output; focused tests, parity, reload/restart, named behavior, iteration, fresh final verification/review, and commit semantics; the distinct pack verify/disposable-install path; direct project-local and docs-only edits; optional manual isolation; cleanup; and preview's lack of acceptance authority.
- Present focused tests, parity, and one named behavior as the trustworthy preview loop while allowing less during iteration; state the under-two-minute target and exclusions.
- Include one concise end-to-end core example and one concise end-to-end pack example.
- Add direct canonical-section links from `README.md` and `docs/README.md`; do not duplicate the workflow or add a docs file.

**Focused Verification**:

```bash
node --test scripts/current-format-contract.test.mjs
git diff --check -- README.md docs/README.md docs/commands.md
```

**Independent Test**: A contributor can enter from either index, classify each of the four ownership classes, perform the applicable workflow, understand invocation/output/reload/isolation/cleanup behavior, and distinguish preview from fresh final acceptance using only the canonical section and its two examples.

- [x] T002@646f6373 [P] [US2] Make `docs/commands.md#repository-development-workflow` the single canonical contributor page for core, pack, project-local, and docs-only ownership; document the trustworthy informational preview, final acceptance, exact build/compose invocation, complete-worktree output, reload, optional isolation, cleanup, and commit semantics with one core and one pack example; link directly from `README.md` and `docs/README.md` without adding or duplicating a docs hierarchy.

## Phase 3: Complete Verification And Independent Review

**Goal**: Prove retirement removed only the special ceremony, preserved history and generic protections, and introduced no replacement mechanism.

**Validation Write Set**: None.

**Execution Details**:

- Re-run both focused suites, the named non-mutating parity test, and the zero-live-reference search.
- Run the recursively discovered full suite, Dude lint, compose verification, a pristine release build and release lint, and `git diff --check`.
- Inspect the complete diff and require the implementation write set to match the seven paths in the plan, including one deletion and no `src/**`, workflow, pack-source, tooling, or historical `.dude/**` implementation change.
- Exercise one named behavior against `.github/` after direct `build-dev` preview and record the elapsed local focused/parity/build time separately from manual reload and external behavior latency.
- Obtain fresh independent review of test-coverage deletion risk, generic fixture preservation, live-reference removal, docs completeness, history preservation, and absence of replacement ceremony or state.

**Full Verification**:

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

**Independent Test**: All specified verification passes; live retirement references are absent; generic coverage and historical bytes are preserved; the canonical docs meet every workflow requirement; and independent review approves without adding implementation writes.

- [x] T003@76657269 [Shared] After T001 and T002, run the focused and recursively discovered full tests, named byte-parity check, Dude lint, compose verify, pristine release build/lint, zero-live-reference search, history and exact-scope inspection, representative preview timing plus one named `.github/` behavior, and `git diff --check`; obtain fresh independent review centered on accidental generic-coverage deletion and replacement-ceremony risk; make no implementation write.
    deps: T001@72657469, T002@646f6373

## Requirements And Success Traceability

| Specification coverage | Tasks |
|---|---|
| FR-001 through FR-005, FR-007 through FR-010, FR-020 / SC-001 through SC-003, SC-007 | T001@72657469 |
| FR-011 through FR-019, FR-020 / SC-004, SC-005 | T002@646f6373 |
| FR-006 through FR-020 / SC-001 through SC-008 | T003@76657269 |