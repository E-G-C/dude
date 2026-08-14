# Implementation Plan: Pack Catalog Re-fetch

## Summary

Change the existing remote-source resolver in
`src/skills/dude-compose/compose.mjs` so every remote catalog-consuming
invocation removes its keyed destination and clones again, including when the
requested ref is a full commit SHA. Update the corresponding source guidance in
`src/skills/dude-compose/SKILL.md`. The SHA remains the exact immutable content
selector; it no longer enables checkout reuse. A failed fetch removes the
unusable destination and returns an operation error; `list` must not convert a
required remote-fetch failure into a successful stale or empty result.

Keep all source-selection rules around that resolver unchanged. `list` still
prefers a whole local catalog. `add` and `refresh` still prefer the requested
local target but may fetch a missing target even when other local content
exists. Explicit source/ref values, manifest fallback, `--no-fetch`, projection,
inventory, ownership, and Feature 031's refresh transaction keep their current
authority.

The canonical feature identity is
`.dude/specs/035-pack-catalog-refetch/spec.md`, exactly owned by
`.dude/ideas/pack-catalog-refetch.md`.

This feature has no progress objective and no ObjectiveRegistry region.

## Technical Context

**Language/Version**: Dependency-free ECMAScript modules with `// @ts-check`
under Node.js 20 or newer

**Primary Dependencies**: Existing synchronous filesystem and child-process
APIs; Git; `resolveReleaseRef`; the current `resolveSourceTree`,
`resolvePackDir`, `resolveCatalogDir`, `stagePackFromSource`, `cmdList`,
`cmdAdd`, and `cmdRefresh` flow

**Storage**: Existing temporary clone root under the operating-system temp
directory. No new storage, metadata, format, registry, or persistent identity.

**Testing**: Focused `node:test` compose regressions using local Git remotes,
existing compose tests, source/generated parity, the recursively discovered
suite, Dude lint, compose verification, pristine release build and lint, and
diff hygiene

**Target Platform**: Supported macOS, Linux, and Windows local Dude workspaces
with Node.js 20 or newer and Git available for remote sources

**Project Type**: Reusable coordination bundle core; authoritative source under
`src/`, generated dogfood core under `.github/`

**Performance Goals**: One fresh foreground fetch per remote catalog-consuming
invocation for every ref form, including a full SHA.

**Constraints**: Preserve local and explicit source authority; never fall back
to stale bytes after a required fetch failure; do not alter Feature 031's
transaction; regenerate `.github/` only with `node scripts/build-dev.mjs`

## Specification Quality Validation

- Three prioritized, independently testable stories cover fresh remote bytes,
  preserved source selection, and fail-closed behavior.
- Acceptance scenarios cover branches, concrete tags, moving release selectors,
  full SHAs without checkout reuse, all three remote catalog consumers, released
  bundles without `library/`, local precedence, explicit and manifest inputs,
  local-only operation, and offline or failed fetches.
- FR-001 through FR-014 state observable behavior without selecting an
  implementation function or test fixture.
- SC-001 through SC-008 are measurable through remote Git fixtures, byte
  snapshots, source-selection outcomes, regression gates, and prohibited-surface
  inspection.
- No unresolved clarification remains.

The specification satisfies its definition-time document gate by inspection.
This is not a lint, execution, or readiness claim.

## Verified Current Topology

1. `src/skills/dude-compose/compose.mjs` owns all pack catalog source selection.
   `resolveSourceTree` resolves `latest`, keys
   `os.tmpdir()/dude-compose-cache` by `source|resolvedRef`, and otherwise uses
   the keyed path as its clone destination.
2. The in-progress T001 implementation introduced a private
   `isFullCommitSha` predicate and returns an existing keyed checkout for that
   ref form. That conditional capability contradicts the accepted ledger and
   must be deleted.
3. A remote branch or concrete tag keeps the same source-and-resolved-ref key
   when it moves. The in-progress T001 implementation now removes that keyed
   destination before cloning; retain that correction and make the same
   replacement unconditional for full SHAs.
4. `latest` is resolved with `resolveReleaseRef` before cache lookup. A newly
   named highest stable tag changes the cache key, but a force-moved selected tag
   does not. The requested selector and every resulting tag remain mutable under
   this feature's contract.
5. `resolvePackDir` checks only the requested local target. When that target is
   absent, it preserves explicit `source` and `ref`. With no explicit source,
   `.dude/metadata/bundle-manifest.md` supplies the source and, unless the ref is
   explicit, its ref. With an explicit source and no explicit ref, the existing
   `main` default remains in effect. Both `stagePackFromSource` callers,
   `cmdAdd` and `cmdRefresh`, use this path.
6. `resolveCatalogDir` gives any local `library/packs/` directory whole-catalog
   precedence. Otherwise it uses the same explicit-source/default-ref and
   manifest-source/ref selection described above and `resolveSourceTree`. The
   in-progress T001 implementation now propagates a selected remote fetch or
   missing-catalog failure so `cmdList` returns an operation error rather than
   empty or stale-looking success; retain that corrected behavior.
7. `cmdAdd` returns before source resolution when the pack is already installed;
   that no-op does not consume a remote catalog. When add does stage a missing
   target, source-resolution failure already refuses before installation.
8. `cmdRefresh` proves installed-side authority before staging, then calls the
   same source pipeline and performs Feature 031's destination diff and
   all-or-restored transaction. A source-resolution failure already refuses
   before its transaction and leaves installed state unchanged.
9. `src/skills/dude-compose/compose.test.mjs` has comprehensive local add,
   remove, refresh, ownership, rollback, and profile fixtures, but no remote
   freshness regression. It can add a small local-Git remote fixture without a
   network dependency.
10. `scripts/build-dev.mjs` projects authoritative non-test core from `src/` to
    `.github/`. The authoritative changes to
    `src/skills/dude-compose/{compose.mjs,SKILL.md}` must be projected to
    `.github/skills/dude-compose/{compose.mjs,SKILL.md}` through that build;
    generated files are never edited directly.

## Guardrail And Smallest-Design Check

The binding rules are YAGNI, preserving established pack authority, and choosing
the smallest design that fixes a proven caller. The current callers are remote
`list`, a remote-backed `add` for a missing local target, and a remote-backed
Feature 031 `refresh`.

| Kept | Reachable need | Proof |
|---|---|---|
| Unconditional destination replacement at the existing source resolver | Every remote invocation, including a full SHA, must obtain upstream bytes again. | FR-001 through FR-004; SC-001 through SC-003 |
| Required remote-list failures returned as failures | A successful empty/stale-looking list would violate fail-closed freshness. | FR-005; SC-004 |
| Existing source-selection and staging paths | The selected source is already correct; only its remote bytes are stale. | FR-007 through FR-012; SC-005 through SC-007 |
| Focused local-Git regressions | Mutable refs and offline failure need deterministic proof without network access. | All FR; all SC |

Rejected designs:

- A TTL, timestamp, freshness database, registry, persistent cache metadata,
  cache-format version, configuration knob, daemon, scheduler, or background
  fetcher. Every remote invocation has one direct freshness requirement.
- A fetch/pull update path for the existing clone. Replacing the clone uses the
  current bounded mechanism and avoids new branch, tag, detached-head, and
  partial-update state.
- Reusing an earlier checkout for a full SHA. The SHA remains semantically exact,
  but accepted freshness requires another clone and a clear refusal when the
  upstream cannot be reached.
- Treating tags as immutable. The accepted intent explicitly classifies every
  non-SHA ref as mutable.
- A revision display or persistent installed-pack identity. That belongs to
  `simplify-pack-updates`.
- A new remote catalog abstraction or generalized Git client. The current
  resolver is the sole production path and needs unconditional destination
  replacement plus corrected failure propagation.
- Changes to pack projection, profile schema, ownership, transaction, or release
  selection. Feature 031 and existing source authority already own them.

No new project-specific guardrail is needed. Existing YAGNI and pack-lifecycle
rules cover this feature.

## Chosen Design

### 1. Replace the destination for every remote invocation

In `src/skills/dude-compose/compose.mjs`, delete the private
`isFullCommitSha` predicate and its existing-checkout return. Keep one
unconditional path after release-channel resolution:

- Local-directory sources continue to return their working tree directly.
- Resolve `latest` on every invocation exactly as today.
- Compute the existing source-and-resolved-ref destination key, then remove that
  destination before every remote clone, even when the requested ref is a full
  SHA and a valid prior checkout exists.
- Keep the existing shallow branch/tag clone first and ordinary clone plus
  checkout fallback. On failure, remove the destination and return the existing
  actionable fetch error.

Do not replace the deleted predicate with a caller mode, option, or alternate
reuse path. Freshness is an invariant of every selected remote source. Retain
the current temporary root and key shape only as a destination naming mechanism;
it carries no reusable checkout semantics, metadata, or format.

### 2. Make a required remote list fail closed

Keep `resolveCatalogDir`'s local branches unchanged:

- an existing local catalog returns the local catalog;
- `fetch: false` returns the local-only view;
- no selected remote source retains the current local result.

When remote resolution was selected, return its fetch or missing-catalog error
as an operation error rather than degrading it into a successful local result.
Update `cmdList` to return `{ ok: false, code: 2, error }` for that case before
enumerating packs. Do not fall back to the keyed clone or report an informational
note as success.

`resolvePackDir`, `stagePackFromSource`, `cmdAdd`, and `cmdRefresh` already
propagate selected remote failures before installation or refresh mutation.
Keep those paths and their error wording unless a focused assertion requires
one consistent list error.

### 3. Preserve source authority and Feature 031

Do not change:

- whole-local-catalog precedence in `resolveCatalogDir`;
- local target-pack precedence in `resolvePackDir`;
- remote fallback for a missing local target amid other local content;
- explicit `source` and `ref` authority; manifest source and ref fallback when
  source is not explicit; and the existing `main` default when source is
  explicit and ref is omitted;
- `--no-fetch`;
- release-channel selection rules;
- pack namespace, ownership, projection, inventory, or profile shape;
- `cmdAdd`'s already-installed no-op;
- `cmdRefresh`'s installed-side authority, source staging, destination-set diff,
  profile reread, all-or-restored application, or rollback.

Update only stale comments and source guidance in
`src/skills/dude-compose/{compose.mjs,SKILL.md}` that describe remote source
flags as applying to add/list while the existing refresh caller also accepts
them. Add no revision output or persistent identity.

### 4. Add deterministic remote freshness regressions

Extend `src/skills/dude-compose/compose.test.mjs` with a bounded Git fixture that
creates a repository, publishes commits and tags, and exposes it to compose
through a `file://` remote URL so the production path treats it as remote while
tests remain offline.

Cover these distinct boundaries:

1. **Moving branch across all consumers**: seed the remote cache with `list`,
   advance the same branch, and prove the next list sees catalog membership
   changes, add installs changed bytes, and refresh projects a later branch
   change. The consumer has no local target source.
2. **Mutable concrete tag**: install or list through a concrete tag, force-move
   that tag to corrected bytes, and prove the next remote operation sees the
   correction.
3. **Moving release selector**: publish a higher stable release tag after the
   first invocation and prove `latest` resolves and consumes it on the next
   invocation. Include the same-selected-tag case where practical through the
   concrete-tag test rather than duplicating fixtures.
4. **Full SHA without reuse**: pin an old full commit SHA, move branches and
   tags, and prove repeated successful use selects exactly the pinned catalog.
   Then make the upstream unavailable after one successful SHA invocation and
   prove the repeat refuses instead of using the earlier checkout. Do not add a
   public cache-inspection API.
5. **Required fetch failure**: after a successful mutable-ref fetch, make the
   remote unavailable and prove list fails, add installs nothing, and refresh
   preserves byte-identical artifacts and profile rather than using stale cache.
6. **Preserved precedence and release shape**: retain or add focused assertions
   for whole-local list precedence, local target add/refresh precedence,
   missing-target remote fallback, explicit source/ref authority, explicit
   source with omitted ref retaining the `main` default, manifest source with
   explicit ref, manifest source/ref fallback, `--no-fetch`, and remote
   list/add/refresh from a released-bundle fixture with no `library/`.

Reuse existing mutation snapshots and refresh fixtures. Avoid an exhaustive
matrix: one branch sequence proves all three consumers, while separate tests
pin only tag, release-selector, SHA, failure, and precedence boundaries.

### 5. Regenerate and accept the integrated change

Run `node scripts/build-dev.mjs` after the authoritative compose source changes.
The intended generated semantic changes are limited to
`.github/skills/dude-compose/{compose.mjs,SKILL.md}`; the test file remains
source-only.

Acceptance runs focused compose tests, the complete recursively discovered
suite, workspace lint, compose verification, build idempotency and
source/generated parity, pristine release build and lint, and diff hygiene over
one unchanged revision. Inspect the diff for every prohibited state or identity
surface and for unintended Feature 031 changes, then route the same unchanged
diff and evidence to the independent Reviewer.

## Test Strategy

- Focused behavior:

```bash
node --test src/skills/dude-compose/compose.test.mjs
```

- The Git fixtures use local repositories and `file://` URLs only. No test
  depends on GitHub, credentials, network availability, or a mutable external
  repository.
- Snapshot the consumer's `.github/` tree and profile before failed add/refresh
  operations and assert exact preservation afterward.
- Assert list failure through its returned `ok`, code, and error rather than
  accepting an empty successful result with a note.
- Keep existing local refresh, rollback, ownership, add-force, and remove-digest
  regressions unchanged as Feature 031 boundary evidence.
- Full validation:

```bash
node scripts/build-dev.mjs
node --test src/skills/dude-compose/compose.test.mjs
find . -path ./dist -prune -o -name '*.test.mjs' -print0 | xargs -0 node --test
node .github/skills/dude-lint/lint.mjs .
node .github/skills/dude-compose/compose.mjs verify
node --test scripts/build-dev.test.mjs scripts/build-release.test.mjs
git diff --check
```

- Run `node scripts/build-dev.mjs` a second time and require no further change
  and exact source/generated parity for both `compose.mjs` and `SKILL.md`. Build
  a pristine release into a fresh temporary directory and lint it.
- Do not add tests for TTLs, clone updating, abbreviated-SHA handling,
  concurrency locks, revision output, identity state, or hypothetical catalog
  consumers.

## Phases

- Phase 1, freshness behavior: delete full-SHA reuse, replace every prior remote
  checkout unconditionally, and fail closed for required remote list fetches.
- Phase 2, focused regressions: add local-Git branch, tag, latest, SHA, failure,
  and precedence coverage without external network access.
- Phase 3, integrated gates: regenerate core and run the complete repository,
  release, and hygiene checks over one unchanged revision.
- Phase 4, independent review: review the unchanged implementation and evidence
  against the complete specification and Feature 031 boundaries.

## Requirements Traceability

| Specification coverage | Plan ownership | Phase |
|---|---|---|
| FR-001 through FR-004 / SC-001 through SC-003 | Unconditional remote destination replacement, exact-SHA content without reuse, repeated release resolution, and remote Git fixtures (Chosen Design 1, 4) | Phase 1, Phase 2 |
| FR-005, FR-006 / SC-004 | Failed-fetch cleanup and required remote-list/add/refresh refusal with byte snapshots (Chosen Design 1, 2, 4) | Phase 1, Phase 2 |
| FR-007 through FR-010 / SC-005, SC-006 | Unchanged local/remote precedence, explicit source/ref authority, explicit-source `main` default, manifest source/ref fallback, and local-only regressions (Chosen Design 3, 4) | Phase 2 |
| FR-011, FR-012 / SC-007 | Preserved pack and Feature 031 behavior plus existing regression suite (Chosen Design 3, 5) | All phases |
| FR-013, FR-014 / SC-006, SC-008 | No new state, identity, or distribution surface; released-bundle behavior; and deletion of full-SHA reuse (Guardrail check; Chosen Design 1, 4, 5) | Phase 1, Phase 2, Phase 3, Phase 4 |
| All FR / all SC | Integrated build, recursive tests, lint, compose, release, diff inspection, and independent review | Phase 3, Phase 4 |
