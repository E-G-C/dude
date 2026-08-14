<!-- audit log: .dude/ideas/pack-catalog-refetch.md#coordinator-log -->

# Tasks: Pack Catalog Re-fetch

Four canonical units implement
`.dude/specs/035-pack-catalog-refetch/spec.md`, exactly owned by
`.dude/ideas/pack-catalog-refetch.md`.

The binding behavior is fresh upstream bytes on every remote `list`, `add`, or
`refresh` invocation for every ref form. Tags and all other non-SHA refs are
mutable; a full commit SHA remains an exact immutable selector but is cloned
again rather than reusing an earlier checkout. A failed required fetch never
falls back to stale bytes or reports stale or empty success. Local catalog and
local target precedence, explicit source/ref authority, manifest fallback,
`--no-fetch`, released-bundle remote behavior, pack safety, and Feature 031's
refresh transaction remain unchanged. No task may add a TTL, freshness database,
registry, persistent cache metadata or format, configuration surface, daemon,
scheduler, lane, revision display, persistent pack identity, or distribution
infrastructure.

Core source lives under `src/`. Generated `.github/**` core is refreshed only
through `node scripts/build-dev.mjs` and is never hand-edited. A required change
outside the plan's boundaries stops as
`contract-mismatch: redefine-required`.

## Phase 1: Remote Freshness Behavior

**Goal**: Make every remote invocation fresh by construction and make required
remote failures refuse without changing established source authority.

- [x] T001@66726573 [US1] Implement `plan.md` Chosen Design sections 1 through 3 in `src/skills/dude-compose/compose.mjs` and update the corresponding source guidance in `src/skills/dude-compose/SKILL.md`: delete the full-commit-SHA predicate and every conditional remote-checkout reuse path; resolve `latest` on each invocation; remove every keyed remote destination unconditionally before cloning, including for a full SHA; preserve the SHA as the exact checkout selector; remove failed clone residue and return the fetch error without stale fallback; add no caller-controlled refresh mode or alternate reuse capability; and retain the corrected selected-remote `list` fetch or missing-catalog refusal `{ ok: false, code: 2, error }` instead of successful stale or empty output. Preserve whole-local-catalog and local-target precedence, missing-target remote fallback, explicit source/ref authority, manifest fallback, `--no-fetch`, released-bundle remote operation without `library/`, the already-installed add no-op, release selection, pack projection/inventory/ownership, and every Feature 031 installed-side and all-or-restored refresh step. Specifically preserve manifest source and ref fallback when source is not explicit, and preserve the existing `main` default when source is explicit and ref is omitted. Update only directly stale compose comments/help, add no public helper or state surface, and regenerate `.github/skills/dude-compose/{compose.mjs,SKILL.md}` only through `node scripts/build-dev.mjs`. (US1, US2, US3 -> FR-001 through FR-014; SC-001 through SC-008)

## Phase 2: Focused Remote Regressions

**Goal**: Prove moving refs, exact SHA bytes without checkout reuse, failures,
and preserved precedence through deterministic local Git remotes.

- [x] T002@72656772 [US1] Implement `plan.md` Chosen Design section 4 in `src/skills/dude-compose/compose.test.mjs`. Add one bounded offline Git fixture exposed through a `file://` remote and focused regressions that: seed with remote list, advance the same branch, and prove the next list, add, and refresh each consume current bytes; force-move a concrete tag and prove the next operation sees corrected bytes; publish a higher stable release and prove `latest` re-resolves; pin a full commit SHA, prove branch/tag movement cannot change its exact selected bytes, then make the upstream unavailable after a successful SHA invocation and prove a repeat refuses rather than reusing the prior checkout; and make a previously fetched mutable remote unavailable and prove list fails, add installs nothing, and refresh preserves byte-identical artifacts and profile with no stale or empty success. Reuse existing mutation snapshots to preserve Feature 031, and pin whole-local-list precedence, local-target add/refresh precedence, missing-target remote fallback amid other local content, explicit source/ref authority, explicit source with omitted ref retaining the `main` default, manifest source with explicit ref, manifest source/ref fallback, `--no-fetch`, and released-bundle remote list/add/refresh without `library/`, without building an exhaustive matrix or adding a cache-inspection API. Run `node --test src/skills/dude-compose/compose.test.mjs`. (US1, US2, US3 -> FR-001 through FR-014; SC-001 through SC-008)
    deps: T001@66726573

## Phase 3: Integrated Gates

**Goal**: Prove the complete change and generated bundle over one unchanged
revision.

- [x] T003@67617465 [Shared] Implement `plan.md` Chosen Design section 5. Run `node scripts/build-dev.mjs`, `node --test src/skills/dude-compose/compose.test.mjs`, `find . -path ./dist -prune -o -name '*.test.mjs' -print0 | xargs -0 node --test`, `node .github/skills/dude-lint/lint.mjs .`, `node .github/skills/dude-compose/compose.mjs verify`, `node --test scripts/build-dev.test.mjs scripts/build-release.test.mjs`, a pristine release build and release lint, and `git diff --check`; run build-dev a second time and require idempotency and exact source/generated parity for both `compose.mjs` and `SKILL.md`. Inspect that automated regressions use only local Git remotes, every required remote failure including a repeated full-SHA invocation refuses without earlier-checkout reuse or stale/empty success, released-bundle operation without `library/` remains covered, Feature 031's authority and transaction remain unchanged, the only intended generated semantic changes are `.github/skills/dude-compose/{compose.mjs,SKILL.md}`, and no prohibited freshness, identity, revision, workflow, cache-format, registry, metadata, or distribution surface was introduced. Preserve one unchanged diff and evidence set for review. (US1, US2, US3 -> FR-001 through FR-014; SC-001 through SC-008)
    deps: T002@72656772

## Phase 4: Independent Review

**Goal**: Obtain an independent decision on the unchanged implementation and
fresh evidence.

- [x] T004@72657677 [Shared] Route the unchanged diff and T003@67617465 evidence to the independent Reviewer. Require explicit coverage of every FR-001 through FR-014 and SC-001 through SC-008; remote list/add/refresh; branch advance after a prior checkout; moved concrete tag; `latest`; exact full-SHA bytes with no earlier-checkout reuse; unavailable/offline refusal without stale or empty success; released-bundle behavior without `library/`; whole-local and exact-target precedence; explicit `--source`/`--ref`, manifest fallback only when source is not explicit, the explicit-source omitted-ref `main` default, and `--no-fetch`; pack opt-in, namespace, ownership, release channel, and Feature 031 safety; deletion of the full-SHA predicate and reuse capability; every YAGNI prohibition; generated parity for both `compose.mjs` and `SKILL.md`; and Feature 031's unchanged installed-side authority, destination diff, profile update, rollback, and transaction boundaries. Address any rejection through the owning implementation or test task and rerun the affected gates before requesting another review; do not mutate definition artifacts or task state from the reviewer. (US1, US2, US3 -> FR-001 through FR-014; SC-001 through SC-008)
    deps: T003@67617465

## Requirements And Success Traceability

| Specification coverage | Plan ownership | Tasks |
|---|---|---|
| FR-001 through FR-004 / SC-001 through SC-003 | Unconditional remote replacement, exact-SHA content without checkout reuse, release re-resolution, and remote Git regressions | T001@66726573, T002@72656772, T003@67617465, T004@72657677 |
| FR-005, FR-006 / SC-004 | Failed-fetch cleanup and fail-closed list/add/refresh snapshots | T001@66726573, T002@72656772, T003@67617465, T004@72657677 |
| FR-007 through FR-010 / SC-005, SC-006 | Preserved local precedence, selected remote fallback, explicit source/ref authority, explicit-source `main` default, manifest source/ref fallback, and local-only behavior | T001@66726573, T002@72656772, T004@72657677 |
| FR-011, FR-012 / SC-007 | Existing pack safety and unchanged Feature 031 transaction | T001@66726573, T002@72656772, T003@67617465, T004@72657677 |
| FR-013, FR-014 / SC-006, SC-008 | Released-bundle remote behavior, prohibited-surface inspection, and reuse-capability deletion | T001@66726573, T002@72656772, T003@67617465, T004@72657677 |
