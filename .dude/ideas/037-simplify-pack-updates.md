---
title: Simplify Pack Updates
slug: simplify-pack-updates
status: defined
spec_path: .dude/specs/037-simplify-pack-updates/spec.md
---

# Idea: Simplify Pack Updates

## Idea

Sometimes the whole thing with hashes feels super overcomplicated and
over-engineered. When I publish a pack correction to GitHub, a user on another
install should just be able to grab the latest pack and bring it down. This is
not a "cross-machine" problem; it is simply publisher-to-consumer through
GitHub.

I want simplification. You're not gonna need it: YAGNI. Installed packs should
just track what is published on GitHub, with the smallest bookkeeping that
works.

## Open Questions

### Q1: How deep should the cut go? In particular, should source-byte checks, installed-output drift refusal, the manifest hash, and the inventory digest be removed, downgraded to warnings, or retained?

**Your answer:** Remove persistent source-byte checks, installed-output hashes
and drift refusal, the manifest hash, and the inventory digest from the
authoritative installed-pack profile. Keep the exact `files` list,
namespace/path ownership checks, opt-in pack inventory, and the existing
rollback-on-caught-failure transaction.

### Q2: What is the smallest honest identity for an installed pack: a source revision where one exists, rendered-output identity, or source plus renderer/model identity?

**Your answer:** For a remotely fetched pack, record the source repository,
requested ref, and resolved commit. For a local or non-Git source, record an
honest local identity without inventing a commit. Do not add rendered-output
identity or renderer/model identity; reprojection is acceptable.

### Q3: Should that identity replace the current `source`/`ref` inventory block, and how should existing, non-Git, or uncommitted local installations transition?

**Your answer:** Use that source identity in the simplified authoritative
profile. Existing valid current profiles must remain usable without reinstall.
Provide one bounded, deterministic transition from only the immediately
preceding hash-rich profile shape. Do not build a general legacy migration,
duplicate authority, or unchanged-pack optimization.

### Q4: Should the catalog re-fetch defect stay folded into this idea or have its own bounded outcome?

**Your answer:** Keep it separate. `.dude/ideas/pack-catalog-refetch.md` owns
freshness; this ledger owns bookkeeping simplification.

## Established Evidence

- `.dude/metadata/profile.md` is 324 lines for six installed packs, with 58
  `sha256` or `digest` lines. Its local-source records use an empty `ref`, so the
  profile carries substantial evidence without naming an installed revision.
- `source_sha256` supports an uninstall refusal when recorded source bytes
  remain locally available. `cmdRefresh` deliberately skips that source guard.
- `installed_sha256` protects a reachable behavior: refresh refuses a
  hand-edited installed artifact and preserves its bytes. Removing it would
  intentionally give up that drift refusal (or turn it into a warning).
- The inventory `digest` validates the profile's own source, manifest, and
  artifact evidence. It is tamper/inconsistency evidence inside the profile,
  not a check Git automatically supplies. `manifest_sha256` is part of that
  evidence, which the accepted direction deliberately removes.
- Local catalogs and local-path sources can be non-Git or contain uncommitted
  bytes. A commit can therefore be a source identity only where one is
  available.
- Installed agent bytes also depend on the installed renderer and
  `agent-models.json`, loaded by `loadProjectionDependencies`. A source commit
  alone neither identifies rendered output nor proves that a refresh is
  unchanged.
- The current add/remove/refresh transactions restore backups when a caught
  application failure occurs. They do not establish crash-proof atomicity.

### Exploration directions resolved by the accepted answers

- Removing the checks intentionally surrenders installed-output drift refusal
  and internal profile-tamper evidence.
- Use a resolved commit as source identity only where one exists, without
  treating it as rendered-output identity.
- Retain the unhashed `files` list as ownership and deletion authority for
  dropped artifacts and exact uninstall.

## Assumptions

- This rerun changes only the brainstorm ledger. The user wants the normal
  explicit definition and implementation lifecycle to follow as separate
  actions.
- YAGNI governs the outcome: retain bookkeeping only for a concrete reachable
  behavior the user chooses to preserve.
- Packs remain opt-in and retain their existing namespace and ownership tier.
- Installed pack artifacts are generated projections that refresh may replace.
  Project customizations belong under `dude-local-*`, not in installed pack
  output.
- This does not reopen Feature 031 (`transactional-pack-refresh`).

<!-- dude:managed:start -->
## Normalized Intent

- Simplify publisher-to-consumer pack updates through GitHub with the smallest
  authoritative profile that preserves only deliberately selected behavior.
- Remove persistent source-byte checks, installed-output hashes and drift
  refusal, the manifest hash, and the inventory digest. Installed artifacts are
  replaceable generated projections; project customizations live under
  `dude-local-*`.
- Identify remotely fetched packs by source repository, requested ref, and
  resolved commit. Identify local and non-Git sources honestly without an
  invented commit.
- Keep the exact files list, namespace/path ownership checks, opt-in pack
  inventory, and rollback on caught application failure.
- Keep valid current profiles usable without reinstall through one bounded,
  deterministic transition from only the immediately preceding hash-rich
  profile shape.
- Preserve rollback on caught application failure without claiming crash
  safety. Keep catalog freshness separate in `pack-catalog-refetch` and do not
  reopen Feature 031's completed scope.

## Constraints

- The definition package is exactly
  `.dude/specs/037-simplify-pack-updates/` and contains only the core trio.
- Add no speculative workflow lane, daemon, store, scheduler, or second board.
- Add no rendered-output identity, unchanged-pack optimization, general legacy
  migration, or duplicate profile authority; reprojection is acceptable.
- Keep packs opt-in, preserve their namespace and path ownership tier, and
  retain containment and collision checks.
- Preserve exact file-list-driven uninstall, existing pack operations, and
  released/local-source behavior except for the deliberately removed evidence
  checks and replaceable installed projections.
- Preserve the existing rollback-on-caught-failure transaction without claiming
  crash safety.
- Update authoritative profile readers and writers coherently, and delete dead
  compatibility machinery rather than retaining unused paths.
- Update applicable docs and memory with the implementation. Edit authoritative
  source first; regenerate `.github/` only through `build-dev`.
- Keep catalog freshness in `pack-catalog-refetch`.
- Do not reopen Feature 031.

## Definition Checklist

- [x] Outcome, deliberate safety tradeoff, and YAGNI boundary are explicit
- [x] Remote and local source identity rules are settled without output identity
- [x] The predecessor-profile transition is bounded to one exact prior shape
- [x] Preserved operations, rollback, ownership, containment, and collisions are
  traceable through the specification, plan, and canonical tasks
- [x] Catalog freshness and Feature 031 remain separate
- [x] The technology-agnostic specification has no unresolved clarification
- [x] Only the core trio is required

## Coordinator Log

- 2026-08-14 UTC - brainstorm captured
- 2026-08-14 UTC - brainstorm rerun: freshness split into pack-catalog-refetch
- 2026-08-14 UTC - brainstorm rerun: removed freshness scope now owned by pack-catalog-refetch
- 2026-08-14 UTC - brainstorm revised after independent review
- 2026-08-15 UTC - brainstorm rerun: accepted simplified profile authority and bounded transition
- 2026-08-15 UTC - first definition -> .dude/specs/037-simplify-pack-updates/spec.md
- 2026-08-15 UTC - T001@70726f66 closed: singular canonical installed-pack profile and bounded predecessor conversion implemented; review findings for exact artifact kind/root binding, 40/64-character Git object IDs, and nullable transitioned remote identity resolved with focused regression evidence
- 2026-08-15 UTC - T002@6c696665 closed: add, remove, refresh, status, verify, source resolution, lint, and release seeding simplified while exact file deletion, replaceable reprojection, path and ownership guards, stale-profile rereads, and caught-failure rollback remain
- 2026-08-15 UTC - T003@74657374 closed: obsolete hash and drift tests removed or replaced; canonical profile, predecessor refusal, remote/local identity, lifecycle, exact deletion, collision and containment, and rollback regressions pass
- 2026-08-15 UTC - T004@646f6373 closed: compose and upgrade guidance, user docs, project memory, and dogfood profile aligned with replaceable pack projections; generated core rebuilt through build-dev with source parity and idempotency
- 2026-08-15 UTC - T005@76657269 closed: revised full gate passed — 2313 recursive tests with 2309 passed, 0 failed, and 4 skipped; lint 0/0; compose verify 16 packs with 0 failures and 0 leftovers; pristine release lint only the documented FEATURE_IDEAS_ROOT_MISSING warning; build-dev, backlog, and diff checks clean
- 2026-08-15 UTC - T006@72657677 closed: domain re-review reported no findings and independent Reviewer APPROVE confirmed FR-001 through FR-020, SC-001 through SC-011, and prose quality; feature complete
<!-- dude:managed:end -->
