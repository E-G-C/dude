# Implementation Plan: Transactional Pack Refresh

## Summary

Add one `refresh` subcommand to the existing pack composer at `src/skills/dude-compose/compose.mjs`. The new `cmdRefresh` reuses the canonical install staging/projection/namespace/inventory pipeline (extracted once from `cmdAdd`), proves installed-side authority exactly as `cmdRemove` already does, computes the old-versus-new destination-set difference from the recorded and freshly staged inventories, and applies replacements, additions, and removals plus the profile update as one all-or-restored transaction that mirrors the union of `cmdAdd`'s staged-copy rollback and `cmdRemove`'s back-up-before-mutate, reread-before-apply, and residue-sweep design.

Refresh is a distinct-intent operation: it treats the current source as the desired new state, so it deliberately does not call `verifyAvailableInventorySource` (the uninstall recorded-source digest guard). Its authority comes entirely from the exact authorized profile bytes and the installed-side hashes, which it verifies before touching anything.

The behavior code, CLI help, and machine output all live in `compose.mjs`; the maintainer-facing guidance lives in `src/skills/dude-compose/SKILL.md`, the project pack-lifecycle rule in `.dude/memory/guardrails.md`, and the user command reference in `docs/`. Generated `.github/` core is refreshed only through `node scripts/build-dev.mjs`.

The canonical feature identity is `.dude/specs/031-transactional-pack-refresh/spec.md`, prospectively owned by `.dude/ideas/transactional-pack-refresh.md`.

This feature has no progress objective and no active ObjectiveRegistry region.

## Technical Context

**Language/Version**: Node.js >= 20, dependency-free ESM with `// @ts-check`, synchronous filesystem and child-process APIs, and `node:test`.

**Primary Dependencies**: The existing `compose.mjs` helpers (`resolvePackDir`, `packArtifacts`, `artifactInNamespace`, `loadProjectionDependencies`, `buildPackInventory`, `hashArtifact`, `resolveProfileArtifact`, `firstNonCurrentProfileEvidence`, `serializeProfile`, `writeProfileDocument`, `sweepProfileTransactionResidue`, `copyRecursive`, `removePath`, `ensureDir`); `src/skills/dude-engine/lib/profile.mjs` (`parseProfileDocument`, `resolveProfileArtifact`, `inventoryDigest`, `PROFILE_INVENTORY_VERSION`, `PACK_NAME_RE`); `src/skills/dude-engine/lib/ownership.mjs` (`belongsToPack`); and `src/skills/dude-engine/lib/workspace-paths.mjs` (`resolveMutationPath`, `WORKSPACE_PATHS`).

**Storage**: Installed artifacts under `.github/{agents,skills,instructions,prompts}` and the install record at `.dude/metadata/profile.md`. Transient staging and transaction working directories under the OS temp dir, always removed.

**Testing**: `node --test src/skills/dude-compose/compose.test.mjs` for focused regressions; the full recursively discovered suite; `node .github/skills/dude-lint/lint.mjs .`; `node scripts/build-dev.mjs` idempotency and source/generated parity; and `node .github/skills/dude-compose/compose.mjs verify`.

**Target Platform**: Supported macOS, Linux, and Windows local Dude workspaces.

**Project Type**: Reusable coordination bundle core; product source under `src/`, generated Copilot core under `.github/`.

**Performance Goals**: Complete exactly one local refresh transaction per invocation; no latency or throughput target beyond ordinary local CLI completion applies, and none is user-required.

**Constraints**: `src/` and `library/packs/` are authoritative; generated `.github/` core comes only from `node scripts/build-dev.mjs`. Reuse the canonical install machinery rather than forking a renderer or inventory format. Synchronous operations only; no locking primitive is introduced.

## Specification Quality Validation

- The specification defines four prioritized, independently testable stories: transactional refresh, pre-mutation authority and refusal, all-or-restored atomicity, and documentation lead.
- Acceptance scenarios cover same-set replacement, addition, removal, rename, all four artifact kinds, every refusal condition, record-drift and stale-authorization refusal, and exact rollback.
- FR-001 through FR-017 state observable behavior without naming modules, functions, or generated paths; SC-001 through SC-009 are measurable and technology-agnostic.
- No `[NEEDS CLARIFICATION]` marker remains.

The specification satisfies its definition-time document gate by inspection. This is not a lint or readiness claim.

## Verified Current Topology

1. `cmdAdd` (`compose.mjs` ~677-856) returns `{ alreadyInstalled: true, files: [] }` before source resolution or staging when the pack is already in `enabled_packs`, so `--force` never refreshes an installed pack. Its staging pipeline — `resolvePackDir`, `frontmatterName` match, prefix-collision guard, `packArtifacts`, `artifactInNamespace`, agent `parseAgentSource`/`validateAgentSet`, staged copy/projection into a temp `install/` tree, `normalizePath` for non-local origins, and `buildPackInventory` — is exactly the machinery refresh must reuse.
2. `cmdAdd`'s destination conflict rule refuses an existing destination unless `--force` and non-instruction/non-prompt: `exists(destination) && (!force || artifact.kind === 'instructions' || artifact.kind === 'prompts')`. This is a first-install exception and MUST NOT be the authority for refresh replacing its own instruction/prompt destinations.
3. `cmdRemove` (~913-1047) is the authority template: read exact `authorizedProfileBytes`; require `entry` + `inventory`; `firstNonCurrentProfileEvidence` whole-profile currency gate; exact `files` ↔ inventory congruence; `verifyAvailableInventorySource` (uninstall-only recorded-source guard); per-target `resolveProfileArtifact` + `exists` + `hashArtifact === installed_sha256`; reread-and-compare `authorizedProfileBytes` before mutation; a two-phase `transactionRoot` that backs up every present target before deleting any, then writes the profile; reverse rollback with `sweepProfileTransactionResidue`; and a `finally` that removes the transaction root.
4. `verifyAvailableInventorySource` (~423-447) enforces Feature 028 FR-017 by comparing recorded `source_sha256` against the available raw source and throwing on mismatch. Refresh expects that mismatch, so refresh does not call it; uninstall keeps calling it unchanged.
5. `resolveProfileArtifact` (`profile.mjs` ~258-313) validates namespace, kind suffixes, `dude-pack-<name>-*` ownership, reserved core instruction names, path safety, and symbolic links. A same-pack destination is `intrinsicallyOwned` via `belongsToPack`, so instruction and prompt replacements pass on namespace authority without the first-install force exception. `serializeProfile`/`validateProfile` enforce version 1, `files` ↔ inventory parity, and cross-pack path claims.
6. `parseArgs`, `HELP`, `report`, and `main` (~1174-1314) are the CLI surface; `cmdRefresh` must be wired into all four and added to the module `export` list beside `cmdAdd`/`cmdRemove`.
7. `compose.test.mjs` provides `createRoot`, `writePack`, `scaffold`, `mutationSnapshot`/`assertMutationUnchanged`, `assertNoPackLeftovers`, `snapshotTree`, `trackStageDirectories`, and `cloneRoot`. `writePack` currently emits only agents and a skill; refresh tests extend the fixture to also emit `instructions/dude-pack-<name>-*.instructions.md` and `prompts/dude-pack-<name>-*.prompt.md`, which `packArtifacts` already enumerates.

## Guardrail And Smallest-Design Check

The binding guardrails are YAGNI (no capability without a current production caller), keeping intent and implementation separate, and preserving the existing pack-lifecycle safety. The named caller is the dogfood pack-maintainer refresh path.

| Kept | Reachable need | Proof |
|---|---|---|
| One `refresh` subcommand in `compose.mjs` | Maintainers have no one-step, safe refresh; the manual restore-uninstall-restore-install recipe breaks on add/rename/delete. | SC-001, SC-002 |
| Extract the install staging pipeline once and reuse it | The current source must be staged, projected, namespaced, and inventoried exactly like install, with no second renderer. | FR-005; SC-003 |
| Installed-side authority gate copied from `cmdRemove` | A hand-edited artifact or drifted record must never be silently overwritten. | FR-002, FR-003; SC-004, SC-007 |
| Old/new destination-set diff | Rename and delete must remove old-only destinations with no leftover; content edits replace in place; new files are added. | FR-006, FR-009; SC-002 |
| Union rollback transaction (add's staged copy + remove's backup-before-mutate + reread + sweep) | A multi-kind mutation plus the record must be all-or-restored. | FR-010, FR-012, FR-013; SC-005 |
| Skip `verifyAvailableInventorySource` for refresh only | Refresh expects a changed source; the uninstall guard must stay intact for uninstall. | FR-011; SC-006 |
| Lead help, output, guidance, and the pack-lifecycle rule with refresh | The smooth path must be discoverable instead of the fragile recipe. | FR-016; SC-008 |

Rejected designs:

- A refresh mode of `add`/`remove` or a repurposed `--force`. Refresh is a distinct-intent verb; overloading either would blur the preserved guards. (FR-011, FR-017)
- A generalized transaction framework, second board, store, daemon, scheduler, inventory version, or workflow lane. (FR-017)
- A second renderer, projection, namespace check, or inventory format. Reuse the canonical pipeline. (FR-005)
- Rename detection or content-diff heuristics. A rename is one addition plus one removal. (Edge Cases)
- A locking primitive for concurrent record changes. The exact reread-and-compare of authorized bytes matches uninstall's protection without locks. (FR-012)
- A broad refactor of `compose.mjs` for aesthetics beyond the one staging extraction the reuse requires.

## Chosen Design

### 1. CLI surface

Add `refresh` to `parseArgs` positional handling and the `main` switch: `refresh <name>` requires a pack name (`refresh requires a pack name` as a usage error, code 1, matching `add`/`remove`). Add a `refresh <name>` line to `HELP`. Extend `report` with a `res.refreshed` branch that prints `[OK] refreshed pack "<name>" (<r> replaced, <a> added, <d> removed)` and, in `--json`, returns `{ ok: true, refreshed: <name>, replaced: [...], added: [...], removed: [...], files: [...] }`. Export `cmdRefresh` beside `cmdAdd`/`cmdRemove`. (FR-001, FR-015)

### 2. Extract the shared staging pipeline

Factor the source-shape-only portion of `cmdAdd` into one internal helper (not exported — YAGNI):

`stagePackFromSource({ root, library, name, projection, stageRoot, fetch, source, ref })` returns `{ origin, sourceIdentity, staged, inventory }` or `{ error }`.

It performs `resolvePackDir`, the `frontmatterName` directory-match check, `packArtifacts`, the `artifactInNamespace` loop, agent `parseAgentSource`/`validateAgentSet`, the staged copy/projection into `stageRoot/install`, `normalizePath` for non-local origins, and `buildPackInventory`. The caller owns the `stageRoot` (so `cmdAdd` keeps its `dude-compose-add-<name>-` prefix and `cmdRefresh` uses `dude-compose-refresh-<name>-`) and owns all profile, collision, conflict, and transaction logic. `cmdAdd` is rewired to call the helper with behavior unchanged; the existing `cmdAdd` tests are the regression guard for the extraction. (FR-005)

### 3. Authority gate (before any staging or mutation)

`cmdRefresh({ root, library, name, fetch, source, ref })`:

1. `resolveMutationPath(root, WORKSPACE_PATHS.PROFILE)`; validate `PACK_NAME_RE.test(name)` (code 1 on failure).
2. Read exact `authorizedProfileBytes` and `parseProfileDocument`. Require `entry = profile.installed[name]`, `entry.inventory`, and `authorizedProfileBytes`; otherwise refuse `pack "<name>" refresh requires a complete current inventory` (code 2). (FR-002)
3. `firstNonCurrentProfileEvidence(profile)` — refuse if the whole profile is not fully current, so reserialization never rewrites unrelated legacy/partial evidence. (FR-002)
4. Require exact `files` ↔ `inventory.artifacts` path congruence (same count, same set), mirroring `cmdRemove`. (FR-002)
5. For every recorded target: `resolveProfileArtifact(root, path, name, record)` then require `exists(abs)` and `hashArtifact(abs) === record.installed_sha256`; otherwise refuse `installed artifact '<path>' no longer matches pack "<name>" inventory; refusing refresh` and leave it untouched. This is the drift and unsafe-path gate. (FR-003, FR-014)
6. Deliberately do NOT call `verifyAvailableInventorySource`; refresh expects a changed source. (FR-011)

### 4. Stage the current source

`loadProjectionDependencies(root)` (as `add` does); `mkdtempSync` a `dude-compose-refresh-<name>-` `stageRoot`; call `stagePackFromSource`. A source-resolution failure, namespace violation, or agent-set validation failure refuses before any mutation (code 2). Produce `newInventory` and `newFiles = staged.map(destRel)`. (FR-004, FR-005)

### 5. Destination-set difference and additive preflight

Build `oldByPath` from `entry.inventory.artifacts` and `newByPath` from `newInventory.artifacts`. Classify:

- **replacements** = paths in both old and new (authorized by step 3's inventory + installed-hash proof);
- **additions** = new-only paths;
- **removals** = old-only paths (authorized by step 3's proof).

Compute `claimedBy` from every other pack's `entry.files`. For each addition: refuse if another pack claims the path; `resolveProfileArtifact(root, path, name, newByPath.get(path))` for namespace/ownership/path/symlink safety; and refuse if the destination already `exists` on disk (a new destination occupied by a core, project, or foreign artifact), with no force exception for any kind. For each replacement: `resolveProfileArtifact` with the new record for path/ownership safety; existence is expected and authorized because the path is a step-3-verified same-pack destination. Collect all conflicts and refuse before mutation if any exist. (FR-006, FR-007, FR-008, FR-009, FR-014)

### 6. Build the next profile and reread authority

`structuredClone(profile)`; set `installed[name] = { files: newFiles, installed_at: new Date().toISOString(), inventory: newInventory }` (leaving `enabled_packs` unchanged); `serializeProfile` to `nextProfileBody` (validates version 1, parity, digest). Then reread the current profile bytes and refuse `profile changed after authorizing refresh of pack "<name>"; refusing refresh` unless they still equal `authorizedProfileBytes`. (FR-010, FR-012)

### 7. All-or-restored transaction

`mkdtempSync` a `dude-compose-refresh-<name>-txn-` `transactionRoot`. Track an ordered `mutations` list of `{ relPath, destination, stagedAbs|null, action: 'replace'|'add'|'remove', backup: string|null }`.

- **Phase 1 (back up):** for every replacement and removal destination, `copyRecursive(destination, backup)` before deleting or overwriting any of them (matching `cmdRemove`'s "back up every present artifact before deleting any"). Additions record `backup: null`.
- **Phase 2 (apply):** removals `removePath(destination)`; replacements `removePath(destination)` then `copyRecursive(stagedAbs, destination)`; additions `copyRecursive(stagedAbs, destination)`; finally `writeProfileDocument(root, nextProfileBody)`. Record each mutation as applied as it happens.
- **On any failure:** reverse the applied mutations — additions `removePath(destination)`; replacements `removePath(destination)` then `copyRecursive(backup, destination)`; removals `copyRecursive(backup, destination)`; then restore the record with `fs.writeFileSync(currentProfilePath, authorizedProfileBytes)` and `sweepProfileTransactionResidue(currentProfilePath)`. Return the rolled-back (or rollback-failed) error exactly as `cmdAdd`/`cmdRemove` phrase theirs.
- **`finally`:** `removePath(transactionRoot)` and `removePath(stageRoot)`.

Return `{ ok: true, code: 0, result: { refreshed: name, replaced, added, removed, files: newFiles.sort() } }`. (FR-010, FR-013, FR-015; SC-005)

### 8. Documentation, guidance, and generated parity

- `compose.mjs` header comment, `HELP`, and `report` describe refresh (FR-016 code surface).
- `src/skills/dude-compose/SKILL.md`: add a Refresh Flow and update the "Parity, Refresh, And Inventory" section to lead with `compose refresh <pack>` while keeping the remove-then-add and never-hand-edit rules for their own purposes.
- `.dude/memory/guardrails.md`: update the existing pack-refresh entry so the smooth path leads with `compose refresh <pack>`, retaining the recorded-source-guard rationale for the manual recipe as the fallback. This is this feature's own documentation scope, not a new guardrail ratification.
- `docs/commands.md` (and `docs/reference.md` if it enumerates compose verbs): mention `compose refresh <pack>`.
- Rebuild generated core with `node scripts/build-dev.mjs`; never hand-edit `.github/skills/dude-compose/*`. (FR-016; SC-008)

## Test Strategy

Focused regressions extend `src/skills/dude-compose/compose.test.mjs`, reusing `scaffold`, `writePack` (extended to emit an instruction and a prompt), `mutationSnapshot`/`assertMutationUnchanged`, `assertNoPackLeftovers`, `snapshotTree`, and a `dude-compose-refresh-` stage/transaction tracker modeled on `trackStageDirectories`:

1. **Mixed refresh (US1/SC-003)**: one fixture with agents, a skill, an instruction, and a prompt; edit the source to replace one destination's content, add one destination, and remove one destination. Assert new destinations exist with new bytes, the replaced destination holds the new projected bytes, old-only destinations are absent on disk (falsifying assertion, not merely missing from the record), the record's `files`/inventory update, and stage/transaction dirs are cleaned.
2. **Changed source, same set (US1/Edge)**: content-only change across the same destination set; assert `files` unchanged, inventory hashes changed, destinations updated in place.
3. **Installed drift refusal (US2/SC-007)**: hand-edit one installed artifact; assert refusal, `assertMutationUnchanged`, and the drifted bytes preserved.
4. **Not-installed and non-current record refusal (US2/SC-004)**: refresh an absent pack and a legacy/incomplete-inventory profile; assert refusal and `assertMutationUnchanged`.
5. **Unresolvable source refusal (US2/SC-004)**: remove the local source and run with `fetch: false`; assert refusal and `assertMutationUnchanged`.
6. **Occupied/foreign new destination refusal (US2/SC-004)**: pre-place a foreign file at a would-be addition path (and a separate case owned by another installed pack); assert refusal and `assertMutationUnchanged`.
7. **Stale authorization refusal (US3/SC-005)**: using a targeted `fs.readFileSync` wrapper in the style of the existing `fs.mkdtempSync` tracker, change the profile bytes on the reread; assert refusal and `assertMutationUnchanged`.
8. **Rollback with no leftovers (US3/SC-005)**: inject a failure during Phase 2 (for example an unwritable destination or a wrapped throwing write); assert every artifact and the profile are byte-identical to a pre-refresh snapshot, no addition remains, no removal is missing, and no stage or transaction directory survives.
9. **Preserved guards (SC-006)**: confirm the existing `cmdRemove` recorded-source and `cmdAdd --force` regressions still pass, and add one case where the source has changed (as the existing remove-tamper test changes it) and refresh nonetheless succeeds — the FR-011 falsifier that refresh does not trip the uninstall digest guard.

Avoid exhaustive cartesian coverage: the single mixed fixture proves all four kinds and add/replace/remove; other cases target only distinct failure boundaries.

Full validation commands (already used by this repo):

- Focused: `node --test src/skills/dude-compose/compose.test.mjs`
- Full suite: `find . -name '*.test.mjs' -not -path '*/node_modules/*' -print0 | xargs -0 node --test`
- Lint: `node .github/skills/dude-lint/lint.mjs .`
- Build parity/idempotency: `node scripts/build-dev.mjs` (run twice; second run makes no change) and `node --test scripts/build-dev.test.mjs`
- Compose verification: `node .github/skills/dude-compose/compose.mjs verify`

## Design-To-Requirement Traceability

- CLI surface and reporting (section 1) -> FR-001, FR-015
- Shared staging extraction (section 2) -> FR-005
- Authority gate (section 3) -> FR-002, FR-003, FR-011, FR-014
- Source staging (section 4) -> FR-004, FR-005
- Destination-set diff and additive preflight (section 5) -> FR-006, FR-007, FR-008, FR-009, FR-014
- Next profile and reread (section 6) -> FR-010, FR-012
- All-or-restored transaction (section 7) -> FR-010, FR-013
- Documentation and generated parity (section 8) -> FR-016
- Bounded scope preserved throughout -> FR-017
