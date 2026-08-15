<!-- audit log: .dude/ideas/simplify-pack-updates.md#coordinator-log -->

# Tasks: Simplify Pack Updates

Six all-open canonical units implement
`.dude/specs/037-simplify-pack-updates/spec.md`, owned prospectively and exactly
by `.dude/ideas/simplify-pack-updates.md`.

The binding outcome is one minimal installed map containing exact file lists and
honest source identities. Persistent source/output hashes, the per-pack manifest
hash, inventory digest, installed drift refusal, rendered-output identity, and
unchanged optimization are removed. Exact uninstall, pack opt-in, namespace and
path ownership, collision and containment checks, existing source selection,
status/verify, and caught-failure rollback remain. Only the exact immediately
preceding complete hash-rich profile may transition; older, malformed, partial,
mixed, or ambiguous shapes refuse. Catalog freshness remains Feature 035's
separate concern.

Core source lives under `src/`; generated `.github/**` core is refreshed only
through `node scripts/build-dev.mjs` and is never hand-edited. Historical feature
packages remain unchanged. A required capability or migration beyond the plan's
boundaries stops as `contract-mismatch: redefine-required`.

No generated board is needed.

## Phase 1: Singular Profile Model, Transition, And Source Identity

**Goal**: Establish the minimal canonical profile, one exact predecessor
transition, and honest remote/local source identities without output identity.

- [x] T001@70726f66 [Shared] Implement `plan.md` Chosen Design sections 1 through 3 in `src/skills/dude-engine/lib/profile.mjs` and `src/skills/dude-compose/compose.mjs`: make the installed map the sole opt-in inventory; keep only sorted exact `files` plus local `{type,location}` or remote `{type,repository,requested_ref,resolved_commit}` source identity; derive a concrete commit from every successful remote fetch while direct local Git/non-Git sources claim no commit; permit `resolved_commit: null` only as the honest canonical result of converting the exact immediately preceding complete version-1 hash-rich profile; validate that predecessor fully before discarding evidence; preserve pack/file sets; reject inventory-less, partial, unsupported-version, malformed-hash/digest, enabled/installed-ghost, mixed, unknown-field, unsafe, or ambiguous shapes; simplify `resolveProfileArtifact` to current exact path/pack authority; and add no output identity, commit comparison, unchanged optimization, second authority, command, or general migration. Keep Feature 035 source selection and freshness unchanged. Add the smallest implementation-owned unit checks needed while leaving comprehensive regression replacement to T003@74657374. (US3 -> FR-001, FR-002, FR-005 through FR-009, FR-015 through FR-018; SC-001, SC-006 through SC-009)

## Phase 2: Lifecycle Operations And Retained Safety

**Goal**: Remove byte-evidence refusals while preserving exact paths, collisions,
stale-profile authorization, caught-failure rollback, status, and verification.

- [x] T002@6c696665 [Shared] Implement `plan.md` Chosen Design sections 4 through 6 in `src/skills/dude-compose/compose.mjs` and the release profile seed in `scripts/build-release.mjs`: update add to write only exact files and source identity while preserving current force semantics; derive status `enabled_packs` from installed keys without writing or hashing; keep verify's four-root temp-install/lint/exact-remove/leftover flow; make remove authorize only exact listed pack-owned safe paths, tolerate changed source/installed bytes and missing listed destinations, delete no unlisted destination, reread authorized profile bytes, and retain backup/delete/profile-write/reverse-rollback/residue cleanup; make refresh overwrite listed installed edits, stage normally, diff exact old/new sets, preserve occupied/foreign addition refusal and path/namespace/symlink checks, always reproject without an unchanged shortcut, and retain result reporting plus all-or-restored application. Delete source/output hashing, pack-manifest and inventory digest construction, model-line hash normalization, source and installed drift refusal, whole-profile inventory currency, artifact-row parity, and only-now-dead helpers/exports while retaining unrelated cache/module hashes. Add bounded implementation checks for each changed transaction boundary. (US1, US2, US3 -> FR-001 through FR-014, FR-017, FR-019, FR-020; SC-001 through SC-006, SC-008, SC-009, SC-011)
    deps: T001@70726f66

## Phase 3: Comprehensive Focused Regression Replacement

**Goal**: Prove the new authority and retained safety directly, deleting tests
that exist only for removed guards.

- [x] T003@74657374 [Shared] Implement `plan.md` Chosen Design section 7 in `src/skills/dude-engine/lib/profile.test.mjs`, `src/skills/dude-compose/compose.test.mjs`, `scripts/build-release.test.mjs`, and only directly applicable existing contract tests. Cover strict canonical fields and source unions; exact predecessor conversion with preserved pack/file sets; refusal of partial, older, malformed, mixed, unknown, and ambiguous shapes; namespace, suffix, traversal, containment, symlink, pack-prefix, and cross-pack claims; branch, tag, latest, and full-SHA requested-ref/resolved-commit identity; direct local Git and non-Git identity without commits; add's simplified record; status read-only derivation; remove after source/output edits, exact listed-only deletion, missing listed destinations, and unsafe-path refusal; refresh overwrite, add/replace/remove, same-byte normal reprojection, collision refusal, stale-profile reread, and rollback; verify leftovers; and add/remove/refresh injected caught-failure byte restoration with no residue. Delete obsolete source-tamper, installed-drift, hash normalizer, artifact hash, manifest hash, inventory digest, whole-profile currency, and dead compatibility tests rather than inverting them into warnings. Use deterministic local and `file://` Git fixtures only; run the three focused test commands from `plan.md`. (US1, US2, US3 -> all FR except FR-004 documentation; SC-001 through SC-009)
    deps: T002@6c696665

## Phase 4: Docs, Memory, Dogfood State, And Generated Parity

**Goal**: Align every current authority description and generated core surface
with the simplified model.

- [x] T004@646f6373 [Shared] Implement `plan.md` Chosen Design section 8. Update `src/skills/dude-compose/SKILL.md`, directly affected source upgrade guidance, `docs/setup.md`, `docs/upgrading.md`, `docs/commands.md`, `docs/reference.md`, and any root/package guidance that still claims hash-rich inventory, source-byte refusal, or installed-output drift refusal. Update `.dude/memory/guardrails.md` and `.dude/memory/lessons.md` only where they directly describe removed guards, leading customization to `dude-local-*` and describing caught-failure rollback without crash safety. Canonicalize `.dude/metadata/profile.md` through the authoritative bounded transition, preserving the same six pack names and exact files; update the release empty-profile seed and its docs/contracts; leave the bundle manifest and historical Features 031/035 unchanged. Regenerate affected `.github/` core only with `node scripts/build-dev.mjs`, run it twice, and require exact source/generated parity and no generated drift on the second run. Confirm inspection finds no live helper, test, doc, or memory rule asserting removed evidence and no catalog-freshness duplication or speculative framework. (US4 and Shared -> FR-004, FR-012, FR-018 through FR-020; SC-005, SC-008, SC-010, SC-011)
    deps: T003@74657374

## Phase 5: Independent Verification And Review

**Goal**: Obtain fresh Tester evidence and then an independent review decision on
the same unchanged integrated revision.

- [x] T005@76657269 [Shared] Dispatch the repository's Tester, with the installed verification skills applicable at execution time, to independently verify the unchanged T004@646f6373 revision. Run focused profile and compose tests; release/build tests; predecessor conversion and rejection fixtures; remote/local source identity; exact uninstall after edits and with missing listed destinations; replaceable refresh including same-byte reprojection; collision, traversal, namespace, symlink, stale-profile, and caught-failure rollback cases; the recursively discovered full suite; workspace lint with zero failures; compose verify; build-dev idempotency and exact generated parity; pristine release build and lint against the documented warning baseline; and `git diff --check`. Record evidence and findings only; do not mutate definition artifacts or task state. Any failure returns to its owning implementation/test/docs task and requires a fresh complete Tester pass. (US1, US2, US3, US4 -> all FR; all SC)
    deps: T004@646f6373

- [x] T006@72657677 [Shared] Route the unchanged T005@76657269 revision and fresh Tester evidence to an independent Reviewer. Require explicit review of every FR-001 through FR-020 and SC-001 through SC-011; the deliberate loss of source/output drift and profile-tamper evidence; minimal exact-files/source-identity authority; concrete commits for new remote fetches and no invented local or predecessor commit; predecessor-only conversion and rejection boundary; exact uninstall; replaceable refresh; retained namespace/path/collision/symlink and caught-failure rollback guards; status/verify and released/local source behavior; no unchanged optimization or rendered identity; Feature 035 freshness separation; dead-code/test/docs/memory removal; source/generated parity; and every YAGNI prohibition. A rejection returns to the owning task and requires refreshed Tester evidence before re-review. The Reviewer reports a decision only and does not mutate definition artifacts or task state. (US1, US2, US3, US4 -> all FR; all SC)
    deps: T005@76657269

## Requirements And Success Traceability

| Specification coverage | Plan ownership | Tasks |
|---|---|---|
| FR-001, FR-002, FR-007 / SC-001 | Canonical minimal profile (Chosen Design 1) | T001@70726f66, T003@74657374, T005@76657269, T006@72657677 |
| FR-005, FR-006, FR-009, FR-018 / SC-006, SC-008 | Honest source resolution identity (Chosen Design 3) | T001@70726f66, T003@74657374, T005@76657269, T006@72657677 |
| FR-015 through FR-017 / SC-007 | Exact predecessor transition (Chosen Design 2) | T001@70726f66, T003@74657374, T005@76657269, T006@72657677 |
| FR-009, FR-011 through FR-014 / SC-005, SC-008 | Add, status, verify, and transaction preservation (Chosen Design 4) | T002@6c696665, T003@74657374, T005@76657269, T006@72657677 |
| FR-010, FR-012 / SC-003 through SC-005 | Exact hash-free remove (Chosen Design 5) | T002@6c696665, T003@74657374, T005@76657269, T006@72657677 |
| FR-003, FR-004, FR-008, FR-011, FR-012 / SC-002, SC-004, SC-005, SC-009 | Replaceable hash-free refresh (Chosen Design 6) | T002@6c696665, T003@74657374, T005@76657269, T006@72657677 |
| FR-019 / SC-010 | Focused regression replacement and dead-surface deletion (Chosen Design 7) | T003@74657374, T004@646f6373, T005@76657269, T006@72657677 |
| FR-004, FR-012, FR-018 through FR-020 / SC-005, SC-008, SC-010, SC-011 | Docs, memory, dogfood state, release seed, and generated parity (Chosen Design 8) | T004@646f6373, T005@76657269, T006@72657677 |
| All FR / all SC | Independent Tester verification and Reviewer acceptance | T005@76657269, T006@72657677 |
