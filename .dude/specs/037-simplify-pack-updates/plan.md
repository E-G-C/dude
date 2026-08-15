# Implementation Plan: Simplify Pack Updates

## Summary

Replace the versioned hash-rich installed-pack inventory with one canonical,
minimal profile model in `src/skills/dude-engine/lib/profile.mjs` and
`src/skills/dude-compose/compose.mjs`. The installed map itself becomes the
opt-in inventory. Each entry keeps only a sorted exact `files` list and a
discriminated source identity. Status derives `enabled_packs` from installed map
keys; the duplicate persisted list and unused install timestamp disappear.

Remote fetches record repository, requested ref, and the fetched tree's resolved
commit. Direct local sources record only an honest local location. The sole
transition accepts the exact immediately preceding complete version-1
hash-rich profile, validates it before discarding evidence, and emits the new
shape on the next successful profile write. Because predecessor remote records
did not persist a resolved commit, their canonical converted identity uses an
explicit `null` commit until a later remote-backed refresh records a concrete
one. This is transition state, not rendered-output identity.

Remove source and installed hashing, manifest and inventory digests, installed
drift refusal, source parity refusal, and their dead normalizer paths. Keep
exact file-list deletion, source selection, projection, namespace and path
validation, collisions, record rereads, and caught-failure rollback. Update
authoritative docs and project memory, then regenerate committed `.github/`
core only with `node scripts/build-dev.mjs`.

The canonical feature identity is
`.dude/specs/037-simplify-pack-updates/spec.md`, prospectively and exactly owned
by `.dude/ideas/simplify-pack-updates.md`.

This feature has no task-keyed runtime objective and no active ObjectiveRegistry
region.

## Technical Context

**Language/Version**: Dependency-free ECMAScript modules with `// @ts-check`
under Node.js 20 or newer; Markdown documentation and project memory

**Primary Dependencies**: Existing compose profile parser/serializer, pack
source resolution, release-channel resolution, packaged projection loader,
ownership and mutation-path validators, synchronous filesystem and child-process
APIs, release profile seed, and `node:test`

**Storage**: `.dude/metadata/profile.md` remains the sole installed-pack record.
No second profile, migration ledger, cache metadata, or compatibility store.

**Testing**: Focused profile and compose regressions, remote local-Git fixtures,
build/release profile-seed coverage, documentation contracts, source/generated
parity, recursively discovered tests, workspace lint, compose verification,
pristine release build and lint, and diff hygiene

**Target Platform**: Supported macOS, Linux, and Windows Dude workspaces with
Node.js 20 or newer; Git remains required for remote sources

**Project Type**: Reusable coordination bundle core with authoritative source
under `src/`, pack source under `library/packs/`, generated dogfood core under
`.github/`, docs under `docs/`, and project memory under `.dude/memory/`

**Performance Goals**: Reduce persistent installed-pack bookkeeping to one exact
file list and one source identity per pack. No unchanged optimization or new
performance target applies.

**Constraints**: Preserve existing lifecycle verbs and source selection; keep
catalog freshness separate; preserve path/ownership security and caught-failure
rollback; edit `src/` first and generate `.github/` only through build-dev

## Specification Quality Validation

- Four prioritized, independently testable stories cover replaceable
  projections, preserved lifecycle safety, honest source identity plus bounded
  transition, and accurate guidance.
- Acceptance scenarios cover deliberate installed-edit replacement, exact
  uninstall, collisions and unsafe paths, caught-failure rollback, remote and
  local identity, predecessor continuity, rejection boundaries, status, and
  verification.
- FR-001 through FR-020 state observable product behavior without selecting
  implementation functions or file layouts.
- SC-001 through SC-011 are measurable through profile inspection, lifecycle
  fixtures, mutation snapshots, source-identity fixtures, transition fixtures,
  regression gates, and prohibited-surface inspection.
- No unresolved clarification remains.

The specification satisfies its definition-time document gate by inspection.
This is not a lint, execution, publication, or readiness claim.

## Verified Current Topology

1. `src/skills/dude-engine/lib/profile.mjs` is the strict profile parser and path
   validator. It currently accepts `enabled_packs` plus `installed`, recognizes
   legacy entries, validates version-1 nested inventories, recomputes the
   inventory digest, validates manifest and per-artifact hashes, and binds
   artifact source/kind/path rows.
2. `src/skills/dude-compose/compose.mjs` owns profile serialization and every
   lifecycle operation. `buildPackInventory` hashes `pack.md`, raw source
   artifacts, and projected destinations; `verifyAvailableInventorySource`
   enforces the uninstall source guard; `hashArtifact` includes the narrow
   generated-agent model-line normalizer.
3. `cmdRemove` and `cmdRefresh` currently require complete hash-rich inventories,
   exact files-to-artifact-row parity, whole-profile currency, and installed
   hash matches. Remove additionally checks available source bytes. Both retain
   exact authorized profile bytes, reread before apply, back up before mutation,
   restore on caught failure, and sweep profile transaction residue.
4. `cmdAdd` stages through `stagePackFromSource`, applies namespace and collision
   checks, projects agents with packaged renderer/model dependencies, and writes
   the hash-rich profile. Its existing `--force` behavior is separate from
   refresh and remains reachable.
5. `resolveSourceTree` distinguishes direct local directories from freshly
   cloned remote sources and already resolves moving release selectors before
   clone. It does not currently return the clone's concrete commit.
   `resolvePackDir` converts the result into the old `{type, location, ref}`
   source block. Feature 035 already owns fresh remote checkout behavior.
6. `cmdStatus` returns the persisted enabled list and installed entries.
   `cmdVerify` diagnoses the profile, temp-installs each catalog pack, lints,
   removes it, and checks all four installation roots for leftovers.
7. `src/skills/dude-compose/compose.test.mjs` directly covers remote branch/tag/
   release/SHA selection, local precedence, released bundles, add, remove,
   refresh, status, verification, installed drift, source drift, rollback,
   collision, ownership, path safety, and projection dependencies. Several
   assertions and fixtures exist only for hashes and drift refusal.
8. `src/skills/dude-engine/lib/profile.test.mjs` pins the hash-rich schema,
   digest validation, source/destination bindings, path ownership, and symbolic
   link refusal. The latter security checks remain; hash-rich current-model
   assertions must be replaced by canonical-model and predecessor-transition
   assertions.
9. `scripts/build-release.mjs` owns the fresh release `PROFILE_STUB`, while
   `scripts/build-release.test.mjs` pins the staged profile and historical
   bootstrap. `scripts/build-dev.mjs` projects non-test core source to
   `.github/` while preserving installed pack and project-local tiers.
10. `src/skills/dude-compose/SKILL.md`, bundle-upgrade guidance, `docs/setup.md`,
    `docs/upgrading.md`, command/reference docs, the checked-in profile, and
    `.dude/memory/guardrails.md` and `.dude/memory/lessons.md` contain direct
    descriptions of the hash-rich authority or removed drift/source guards.
    Historical feature packages remain history and are not rewritten.

## Guardrail And Smallest-Design Check

The binding rules are YAGNI, deterministic checks for state transitions,
authoritative source before generated output, and preservation of current
ownership/path safety. The current callers are compose add, remove, refresh,
status, and verify plus release profile seeding.

| Kept surface | Reachable need | Specification proof |
|---|---|---|
| One canonical installed map with exact files and source identity | Lifecycle operations need opt-in membership, exact deletion scope, and honest publisher/source orientation. | FR-001, FR-005, FR-006, FR-010; SC-001, SC-003, SC-006 |
| One exact predecessor converter | Current valid installations must remain usable without reinstall. | FR-015 through FR-017; SC-007 |
| Existing namespace, ownership, containment, collision, and symlink validation | File-list authority must not escape pack-owned safe paths. | FR-010, FR-011; SC-004 |
| Existing operation-local backup, reread, rollback, and residue cleanup | Caught application failures must remain all-or-restored. | FR-012; SC-005 |
| Existing source resolver and projection path | Add and refresh still need current source selection and generated outputs. | FR-008, FR-009, FR-018; SC-008, SC-009 |
| Focused parser, lifecycle, source-identity, transition, and docs regressions | The deliberate removals and retained guards need direct falsifiers. | All FR; all SC |

Rejected designs:

- **Warnings for removed hashes**: computing or persisting the same evidence as a
  warning retains the complexity without an accepted authority use.
- **Rendered-output, renderer, or model identity**: no current production caller
  needs reproducible projection identity.
- **An unchanged optimization**: refresh is an explicit reprojection request.
- **A second profile version authority or migration registry**: one strict
  canonical model plus one exact predecessor parser is sufficient.
- **A general legacy migration framework**: only the immediately preceding
  complete hash-rich shape has a current caller.
- **Inventing a predecessor remote commit**: a mutable ref's current target does
  not prove the commit used for older installed bytes. Canonical `null` records
  that bounded unknown honestly until refresh.
- **Persisting artifact kind/source rows**: exact safe destination paths already
  provide current deletion and ownership authority; projection reconstructs
  transient source bindings when needed.
- **A new transaction framework, lock, daemon, scheduler, state store, command,
  or workflow lane**: existing operation-local transactions satisfy the retained
  caught-failure requirement.
- **Catalog fetch changes**: Feature 035 already owns freshness and must not be
  duplicated.

No new project-specific guardrail is needed. Existing YAGNI, deterministic
transition, ownership, and source/generated rules cover the feature.

## Chosen Design

### 1. Define one canonical minimal profile

In `src/skills/dude-engine/lib/profile.mjs`, replace the current profile and
inventory types with:

```json
{
  "installed": {
    "<pack>": {
      "files": [".github/<kind>/dude-pack-<pack>-<artifact>"],
      "source": {
        "type": "remote",
        "repository": "<selected repository>",
        "requested_ref": "<caller-selected ref>",
        "resolved_commit": "<full commit or null only after predecessor conversion>"
      }
    }
  }
}
```

A direct local source instead uses exact keys
`{"type":"local","location":"<recorded local source>"}`. The installed map keys
are the opt-in inventory; do not persist a duplicate `enabled_packs` list.
Remove `installed_at` because no current behavior consumes it. Sort pack keys and
file lists during serialization.

Canonical validation requires:

- one top-level `installed` object and no other top-level fields;
- valid, unique pack names and no hyphen-prefix pack-name collisions;
- each entry has exactly `files` and `source`;
- non-empty, duplicate-free file lists whose paths pass the existing approved
  root, suffix, pack namespace, containment, cross-pack claim, and symlink-safe
  checks;
- a local identity with a non-empty location and no commit/ref fields;
- a remote identity with non-empty repository and requested ref, plus either a
  full concrete commit or `null`;
- no inventory version, artifact rows, hash, digest, manifest evidence,
  timestamp, renderer, or output-identity field.

`resolved_commit: null` is accepted only to carry the one predecessor transition
honestly. Every newly fetched remote add or refresh writes a concrete full commit.
It is not used to skip projection or to attest output bytes. Keep
`resolveProfileArtifact` as the single path/namespace/symlink validator, simplify
its signature to the exact destination plus pack, and delete artifact-row and
legacy-loose ownership branches that no canonical caller needs.
(FR-001, FR-002, FR-005 through FR-007, FR-010, FR-017; SC-001, SC-004, SC-006)

### 2. Add exactly one predecessor transition

Keep `parseProfilePayload` as the single fenced-JSON extraction boundary. The
document parser accepts only:

1. the canonical minimal shape above; or
2. the exact immediately preceding whole-document shape:
   `enabled_packs` plus `installed`, where every installed entry has exactly
   `files`, `installed_at`, and one complete version-1 inventory with valid
   source, manifest hash, artifact rows, source/output hashes, digest, exact
   files parity, and matching enabled/installed pack sets.

Use a private, bounded predecessor validator/converter rather than broadening
canonical validation. Reuse the predecessor validation logic only long enough
to prove the input is the complete prior shape, then convert:

- preserve every installed pack name and sorted exact file list;
- map `library` source records to local identity;
- map an old `source` record whose location is unambiguously a direct local path
  to local identity;
- map an unambiguous remote repository/ref to remote identity with
  `resolved_commit: null`, because the predecessor did not retain that commit;
- reject unsupported source types, missing or ambiguous locations, partial
  inventories, enabled/installed ghosts, old inventory-less entries, unsupported
  versions, malformed hashes/digests, mixed old/new entries, and unknown fields.

Reading is side-effect free. Status may return the normalized in-memory shape but
does not write it. The next successful add, remove, or refresh serializes the
whole profile in canonical form inside that operation's existing transaction.
No conversion command, marker file, backup profile, second authority, or support
for still older shapes is added. Add direct transition tests that compare pack
names and exact file lists and prove every refusal leaves bytes unchanged.
(FR-013, FR-015 through FR-017; SC-007)

### 3. Expose honest source identity from source resolution

In `src/skills/dude-compose/compose.mjs`, change the existing source-resolution
result, not its selection policy:

- direct local catalog and local-path sources return
  `{type:'local', location:<real path>}` and no commit, even when the directory
  is a Git working tree;
- a remote clone retains the original selected repository and requested ref,
  then resolves the fetched tree's `HEAD^{commit}` to one full commit and returns
  `{type:'remote', repository, requested_ref, resolved_commit}`;
- a failed or non-concrete remote commit resolution fails the source operation
  and removes its temporary clone just as a failed fetch does;
- `latest` continues to be resolved and fetched under Feature 035, while
  `requested_ref` remains the caller's literal selector and the concrete fetched
  commit is recorded;
- local catalog precedence, local target precedence, explicit source/ref rules,
  manifest fallback, explicit-source `main` default, `--no-fetch`, and released
  bundle behavior do not change.

`stagePackFromSource` returns the source identity and staged destinations. Replace
`buildPackInventory` with a minimal entry builder that carries only `files` and
`source`. Do not add commit comparison, output hashing, cache identity, or
unchanged logic. Use the existing local-Git remote fixtures to assert branch,
tag, release selector, and full-SHA commit identity, plus direct Git and non-Git
local identity without commits.
(FR-005 through FR-009, FR-018; SC-006, SC-008, SC-009)

### 4. Simplify add, status, and verification

Update `cmdAdd` to use installed map membership, retain the current pack-name
prefix collision and destination preflight, and write `{files, source}` after
the staged apply succeeds. Keep its current force semantics and caught-failure
restoration.

Update `cmdStatus` to derive sorted `enabled_packs` from installed map keys and
return canonical installed entries. It performs no hash calculation, source
fetch, transition write, or drift diagnosis.

Keep `cmdVerify`'s current profile diagnostic, four-root throwaway copy,
temp-install, lint, exact remove, and leftover sweep. It uses the simplified
add/remove path and introduces no alternate verification profile.

Update the release `PROFILE_STUB` to the canonical empty
`{"installed":{}}` shape and adjust its existing tests. Convert the dogfood
profile through the authoritative parser/serializer path rather than manually
inventing profile bytes.
(FR-001, FR-009, FR-011 through FR-014, FR-017; SC-001, SC-005, SC-008)

### 5. Make remove exact and hash-free

Simplify `cmdRemove` while preserving its transaction:

1. Read exact authorized profile bytes through the canonical/predecessor parser.
2. Require the target installed entry and its exact non-empty file list.
3. Resolve every listed destination through canonical namespace, pack ownership,
   containment, suffix, and symbolic-link checks. Refuse duplicate/cross-pack or
   unsafe paths before mutation.
4. Do not inspect source availability or bytes. Do not hash installed
   destinations. A missing listed destination stays missing; never infer a
   replacement path.
5. Build the next canonical profile without the target, reread the exact
   authorized bytes immediately before apply, and refuse stale authorization.
6. Back up every existing listed destination before deleting any, delete only
   listed destinations, write the canonical profile, and retain reverse rollback
   plus residue sweep for caught failures.

Delete `verifyAvailableInventorySource`, raw-source hashing, installed tree
hashing, model-line normalization from compose, whole-profile inventory-currency
gates, files-to-artifact-row checks, and source/installed drift errors. Keep
hashing that still serves unrelated cache keys or module loading.
(FR-002, FR-009, FR-010, FR-012, FR-015 through FR-017, FR-019; SC-003 through SC-005, SC-007)

### 6. Make refresh replaceable and hash-free

Simplify `cmdRefresh` around exact old and new file sets:

1. Authorize the old set from the installed entry's exact `files` list and
   resolve each path through the same namespace, ownership, containment, suffix,
   and symbolic-link validation as remove.
2. Do not require old destinations to exist or match recorded bytes. Existing
   listed destinations are replaceable generated output.
3. Stage the current source through `stagePackFromSource`, obtaining the new
   exact file list and source identity.
4. Classify same-path replacements, new-only additions, and old-only removals.
   Keep other-pack claim refusal and occupied new-destination refusal. A listed
   same-pack destination is replaceable even when its bytes changed.
5. Build the next canonical profile with the new file list and source identity,
   reread exact authorized profile bytes, then keep the existing back-up,
   removal, replacement, addition, profile-write, reverse-rollback, and cleanup
   order.
6. Always execute the ordinary refresh path, including when source identity and
   projected bytes appear unchanged. Preserve existing result reporting.

Retain no compatibility branch for installed hashes and no warning about drift.
Feature 031's caught-failure transaction remains; its hash-based authority is
intentionally superseded.
(FR-003, FR-004, FR-008 through FR-012, FR-019; SC-002, SC-004, SC-005, SC-009)

### 7. Replace focused tests rather than preserving dead guards

Refactor `src/skills/dude-engine/lib/profile.test.mjs` around:

- strict canonical local, remote concrete-commit, and remote-null-transition
  identities;
- exact fields, sorted unique files, pack-name prefix collision, cross-pack path
  claims, namespace/suffix/containment, traversal, and symlink refusal;
- exact complete predecessor conversion and equality of pack/file sets;
- rejection of partial, inventory-less, unsupported-version, malformed-hash,
  wrong-digest, mixed, unknown-field, and ambiguous predecessor fixtures;
- absence of current-model hash/digest/version compatibility surfaces.

Refactor `src/skills/dude-compose/compose.test.mjs` to retain current projection,
source-selection, collision, rollback, dependency, remote freshness, and
verification coverage while replacing obsolete assertions with:

- add writes only exact files plus local or remote identity;
- remote branch, tag, latest, and SHA operations record the requested ref and
  exact fetched commit;
- direct local Git and non-Git sources record no commit;
- remove succeeds after source or installed bytes change, deletes only listed
  existing destinations, tolerates missing listed destinations, and still
  refuses unsafe paths;
- refresh overwrites installed edits, reprojects same-set and same-byte sources,
  handles add/replace/remove, and preserves collision/path gates;
- add/remove/refresh caught-failure snapshots restore profile and artifacts with
  no residue;
- status is read-only and derives enabled names;
- exact predecessor profiles support status and lifecycle use without reinstall,
  then serialize only canonical state;
- older/malformed/ambiguous profiles fail closed;
- verify still temp-installs, lints, exactly removes, and detects leftovers.

Delete source-tamper refusal, installed-hash drift, model-normalizer, inventory
digest, manifest hash, artifact hash, whole-profile currency, and dead
compatibility tests. Extend release/build and bounded prose contracts only where
they directly pin the new profile seed or removed guidance.
(All FR; SC-001 through SC-010)

### 8. Correct docs, memory, dogfood state, and generated core

Update only surfaces that directly describe the changed authority:

- `src/skills/dude-compose/SKILL.md`: minimal profile, exact file-list uninstall,
  replaceable refresh, source identity, predecessor transition, rollback limits,
  and `dude-local-*` customization;
- applicable source upgrade guidance plus `docs/setup.md`, `docs/upgrading.md`,
  `docs/commands.md`, `docs/reference.md`, and root/package guidance that still
  claims inventory-backed hashes or drift refusal;
- `.dude/memory/guardrails.md`: replace the source/hash-current and installed
  drift rules with source-only pack development, explicit refresh, exact
  file-list authority, and replaceable projections;
- `.dude/memory/lessons.md`: remove or revise lessons whose only current advice
  is to fabricate or preserve profile hashes;
- `.dude/metadata/profile.md`: canonicalize the current valid predecessor through
  the bounded transition, preserving the same six pack names and exact files;
- `scripts/build-release.mjs` and existing tests: canonical empty profile seed.

Do not rewrite historical Feature 031 or 035 packages. Do not change the bundle
manifest: it remains separate upgrade/catalog source metadata and is not the
removed per-pack manifest hash.

After authoritative `src/` edits, run `node scripts/build-dev.mjs` to regenerate
affected `.github/` core. Never hand-edit generated core. Require source/generated
parity and an idempotent second build. Keep local/project-owned `.github/`
artifacts outside generated core under their existing ownership rules.
(FR-004, FR-012, FR-018 through FR-020; SC-005, SC-008, SC-010, SC-011)

## Test Strategy

### Focused implementation checks

```bash
node --test src/skills/dude-engine/lib/profile.test.mjs
node --test src/skills/dude-compose/compose.test.mjs
node --test scripts/build-release.test.mjs scripts/build-dev.test.mjs
```

Use deterministic local filesystem and `file://` Git fixtures only. No focused
test depends on GitHub, credentials, network availability, or a mutable public
repository. Snapshot exact profile/artifact bytes around refusals and injected
caught failures. Use deletion-sensitive falsifiers for retained path, collision,
rollback, transition, and source-identity checks; do not preserve tests whose
only purpose is a removed guard.

### Full integrated validation

```bash
node scripts/build-dev.mjs
find . -path ./dist -prune -o -name '*.test.mjs' -print0 | xargs -0 node --test
node .github/skills/dude-lint/lint.mjs .
node .github/skills/dude-compose/compose.mjs verify
node --test scripts/build-dev.test.mjs scripts/build-release.test.mjs
git diff --check
```

Run build-dev a second time and require no additional change. Confirm exact
source/generated parity for every changed core module and skill. Build a pristine
release in a fresh external directory and lint it, accepting only the repository's
documented release warning baseline. Inspect `.github/` changes as generated
output only.

Tester verification runs after implementation and documentation are frozen. It
must independently exercise the focused profile/compose suites, predecessor
conversion, remote/local identity, exact uninstall, replaceable refresh,
rollback/security guards, full recursive suite, lint, compose verify,
build/release tests, pristine release, generated parity/idempotency, and diff
hygiene over one unchanged revision.

Independent review follows Tester verification on that same unchanged revision
and evidence set. Review must confirm every deliberate evidence removal, every
retained path/ownership/rollback guard, bounded predecessor-only transition,
honest null predecessor commit, no output identity or unchanged optimization,
catalog-freshness separation, docs/memory accuracy, and no speculative
framework. A rejection returns to the owning implementation or test task and
requires fresh verification before re-review.

## Phases

- **Phase 1 — Profile foundation**: canonical minimal model, exact predecessor
  transition, and honest remote/local source identity.
- **Phase 2 — Lifecycle simplification**: hash-free add/remove/refresh/status/
  verify with exact paths, collisions, stale-profile reread, and existing
  caught-failure rollback.
- **Phase 3 — Focused regression replacement**: comprehensive profile, compose,
  source-identity, transition, security, and rollback tests; delete dead guards.
- **Phase 4 — Guidance and generated parity**: docs, memory, release seed,
  dogfood profile conversion, build-dev projection, and bounded contracts.
- **Phase 5 — Independent acceptance**: Tester verification, then independent
  review on one unchanged integrated revision.

## Requirements Traceability

| Specification coverage | Plan ownership | Phase |
|---|---|---|
| FR-001, FR-002, FR-007 / SC-001 | Canonical minimal profile (Chosen Design 1) | Phase 1 |
| FR-005, FR-006, FR-009, FR-018 / SC-006, SC-008 | Source resolution identity (Chosen Design 3) | Phase 1 |
| FR-015 through FR-017 / SC-007 | Exact predecessor transition (Chosen Design 2) | Phase 1 |
| FR-009, FR-011 through FR-014 / SC-005, SC-008 | Add, status, verify, and transaction preservation (Chosen Design 4) | Phase 2 |
| FR-010, FR-012 / SC-003 through SC-005 | Exact hash-free remove (Chosen Design 5) | Phase 2 |
| FR-003, FR-004, FR-008, FR-011, FR-012 / SC-002, SC-004, SC-005, SC-009 | Replaceable hash-free refresh (Chosen Design 6) | Phase 2 |
| All FR / SC-001 through SC-010 | Focused regression replacement (Chosen Design 7) | Phase 3 |
| FR-004, FR-012, FR-018 through FR-020 / SC-005, SC-008, SC-010, SC-011 | Docs, memory, release seed, dogfood state, and generated parity (Chosen Design 8) | Phase 4 |
| All FR / all SC | Tester verification and independent review (Test Strategy) | Phase 5 |

## Supporting Artifacts

Only `spec.md`, `plan.md`, and `tasks.md` apply. The profile model is fully
specified in this plan; no separate schema, research, data-model, quickstart,
checklist, or contract artifact is needed.
