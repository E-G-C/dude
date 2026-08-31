---
title: Bulk Pack Refresh
slug: bulk-pack-refresh
status: defined
spec_path: .dude/specs/038-bulk-pack-refresh/spec.md
---

# Idea: Bulk Pack Refresh

## Idea

I think plain `@dude upgrade` should keep updating core only. An opt-in form —
my suggestion is `@dude upgrade --all` — should also bring the packs I already
installed up to date, so I do not have to remember to refresh each pack by hand
after upgrading.

## Open Questions

### Q1: Should the opt-in form use the proposed `--all` spelling or a more descriptive name such as `--with-packs`?

**Your answer:** Use `@dude upgrade --all`. Plain `@dude upgrade` remains
core-only.

### Q2: How much preview should the opt-in operation provide: current-core estimates, a planned-core isolated preview, or results only after core is applied?

**Your answer:** Do not build a speculative planned-core renderer. Apply and
commit the reviewed core upgrade first, then use the upgraded engine to produce
the authoritative installed-pack preview, including additions, replacements,
and removals. Require a separate explicit confirmation before mutating packs.

### Q3: If one pack cannot refresh after the core upgrade, should successful core/pack changes remain with a report, or should the operation attempt to roll everything back?

**Your answer:** Keep the successful core upgrade. Stop when one pack fails and
report the successful, failed, and not-attempted packs; do not automatically
roll back core. Commit successful pack refresh output before completion or
partial failure so the upgrade branch is never left dirty. Planning should
choose the leanest coherent commit grouping.

### Q4: When a target pack exists locally, should bulk refresh keep using that local source, or should the opt-in upgrade be able to select the same exact upstream revision as core?

**Your answer:** Preserve local target-pack precedence for local development.
Remote consumers should use the same concrete upstream revision selected by the
core upgrade.

### Q5: Must `pack-catalog-refetch` or `simplify-pack-updates` land first, or should this outcome remain independently definable?

**Your answer:** The sibling dependency is satisfied, not open. At
`76379cda1d5895427f95887241c884986b0fa268`, Features 035 and 037 and their
tasks are complete, Compose removes and reclones remote sources on every
invocation, and the profile's minimal `installed` map is canonical authority.

### Q6: Which packs may `--all` refresh?

**Your answer:** Only packs already enabled by membership in the profile's
canonical `installed` map. It must never install another pack or weaken the
profile's opt-in authority.

### Q7: Are core and installed-pack changes one atomic transaction?

**Your answer:** No. Core mutation and pack mutation are separate transaction
boundaries; do not claim global atomicity.

## Established Evidence

- The prerequisite state was independently verified at `HEAD` / `origin-main`
  `76379cda1d5895427f95887241c884986b0fa268`. Features 035 and 037 and their
  tasks are complete, so their sibling dependency is satisfied rather than
  open.
- Compose removes and reclones remote sources on every invocation. The
  profile's minimal `installed` map is the canonical installed-pack and opt-in
  authority.
- `@dude upgrade` currently enumerates core-owned paths and preserves installed
  pack artifacts and `.dude/metadata/profile.md`. Plain upgrade can therefore
  remain core-only.
- `compose refresh <pack>` is the canonical projection and refresh path for one
  installed pack, including additions, replacements, and removals. There is no
  current bulk operation over the installed map.
- Compose rendering uses the installed engine. An authoritative post-upgrade
  pack preview therefore follows the applied core upgrade; a separate
  planned-core renderer would add a speculative mechanism.
- Compose itself performs no Git commit. Upgrade rollback refuses a dirty
  working tree, so leaving refreshed pack output uncommitted would block the
  current rollback command.
- `resolvePackDir` gives a local target pack precedence over `--source` and
  `--ref`, which is the accepted authority for local development.
- Current rollback-on-caught-failure behavior is scoped to one pack refresh;
  there is no existing core-plus-all-packs transaction.

## Assumptions

- Brainstorm intake only; no definition package, no implementation.
- `@dude upgrade --all` refreshes only packs already represented in the
  profile's canonical `installed` map; it never installs another pack.
- Plain `@dude upgrade` stays core-only and unchanged by default.
- The reviewed core upgrade is applied and committed before the upgraded engine
  produces an authoritative preview of installed-pack additions, replacements,
  and removals.
- Pack mutation requires its own explicit confirmation after that preview.
- A pack failure stops further pack attempts, keeps the successful committed
  core upgrade, preserves successful pack results in commits, reports
  successful, failed, and not-attempted packs, and does not auto-rollback core.
- Successful pack output is committed before completion or partial-failure
  return so the upgrade branch is never left dirty; planning chooses the
  leanest coherent grouping.
- Local target-pack precedence remains authoritative for local development.
  Remote consumers use the concrete upstream revision selected by the core
  upgrade.
- Core and pack mutation are separate transaction boundaries, with no global
  atomicity claim.
- Features 035 and 037 satisfy the sibling prerequisite at the independently
  verified revision; this is not an open dependency.
- This does not reopen Feature 031's completed per-pack refresh scope.

<!-- dude:managed:start -->
## Normalized Intent

- Add `@dude upgrade --all` as the explicit bulk path for refreshing every pack
  already enabled in the profile's canonical `installed` map. Keep plain
  `@dude upgrade` core-only, preserve profile opt-in authority, and never install
  another pack.
- Reuse Compose's canonical projection and refresh path rather than duplicating
  pack rendering, ownership, or transaction behavior.
- Apply and commit the reviewed core upgrade first. Then use the upgraded engine
  to produce the authoritative preview of installed-pack additions,
  replacements, and removals; require a separate explicit confirmation before
  pack mutation.
- Preserve local target-pack precedence for local development. For remote
  consumers, refresh from the same concrete upstream revision selected by the
  core upgrade, including when the release bundle does not vendor `library/`.
- Treat core mutation and pack mutation as separate transaction boundaries.
  Make no global atomicity claim.
- On a pack failure, keep the successful core upgrade, stop further pack
  attempts, report successful, failed, and not-attempted packs, and do not
  automatically roll back core. Preserve successful pack output in a commit
  before returning.
- Keep the safety branch/tag, usable rollback, no-push, and no-auto-merge
  behavior. Never leave the upgrade branch dirty after success or partial
  failure.
- Cover the core-only default, installed-map selection, authoritative preview,
  separate confirmation, additions/replacements/removals, local and remote
  source authority, released bundles without `library/`, successful and partial
  failure paths, clean-branch guarantees, rollback usability, and reporting.
- Treat Features 035 and 037 as satisfied prerequisites and do not reopen
  Feature 031.

## Constraints

- Add no workflow lane, registry, daemon, scheduler, second persistent state, or
  second board.
- Never install a pack that the user has not opted into.
- Do not refresh packs during plain `@dude upgrade`; pack refresh remains
  explicit.
- Do not add a speculative planned-core renderer or treat a current-core
  estimate as the authoritative installed-pack preview.
- Do not weaken local target-pack precedence, profile authority, the existing
  safety branch/tag, rollback usability, no-push, or no-auto-merge behavior.
- Do not require per-pack commits when one aggregate successful-pack commit
  satisfies the clean-branch and partial-failure requirements.
- Do not claim crash-proof or global atomicity across core and pack mutation.
- Follow YAGNI: add no alternate renderer, duplicate projection path, persistent
  orchestration state, or capability without a current production caller.

## Definition Checklist

- [x] Outcome and one bounded package are clear
- [x] Naming, sequencing, preview, confirmation, partial-failure, commit, and
  transaction-boundary decisions are settled
- [x] Profile opt-in, local/remote source authority, released-bundle operation,
  and Compose reuse are binding
- [x] Safety, coverage, YAGNI, and prohibited-surface constraints are explicit
- [x] Features 035 and 037 are satisfied prerequisites
- [x] No unresolved clarification remains

## Coordinator Log

- 2026-08-14 UTC - brainstorm captured
- 2026-08-14 UTC - brainstorm revised after independent review
- 2026-08-15 UTC - brainstorm refreshed with accepted bulk pack upgrade decisions
- 2026-08-15 UTC - first definition staged for .dude/specs/038-bulk-pack-refresh/spec.md
- 2026-08-15 UTC - Lightweight task T001@61726368 claimed for architecture handoff
- 2026-08-15 UTC - Lightweight task T001@61726368 closed after independent architecture approval and zero-failure lint
- 2026-08-15 UTC - Lightweight task T002@696d706c claimed for implementation
- 2026-08-15 UTC - Lightweight task T003@74657374 claimed for focused regression coverage
- 2026-08-15 UTC - Lightweight task T004@736b696c claimed for authoritative skill guidance
- 2026-08-15 UTC - T002-T004 readiness review rejected dirty-success reporting and contradictory upgrade boundary prose; revision assigned
- 2026-08-15 UTC - Lightweight tasks T002@696d706c, T003@74657374, and T004@736b696c closed after revised focused suites passed 156/156, independent approval, and zero-failure lint
- 2026-08-15 UTC - Lightweight task T005@696e7467 claimed for integration and generated parity
- 2026-08-15 UTC - Lightweight task T005@696e7467 closed after idempotent build-dev parity, 25/25 build tests, and zero-failure lint
- 2026-08-15 UTC - Lightweight task T006@76657269 claimed for independent full verification
- 2026-08-15 UTC - T006@76657269 blocked after full-suite test failure; T005@696e7467 reopened for current-format guidance repair while coordinator refreshes backlog projections
- 2026-08-15 UTC - T005@696e7467 reclosed after 107/107 current-format contracts passed; T006@76657269 resumed with current backlog projections
- 2026-08-15 UTC - T006@76657269 blocked again after the refresh-guidance contract passed alone but failed under recursive concurrency; T005@696e7467 reopened for suite-interference diagnosis
- 2026-08-15 UTC - Deterministic diagnosis found a source boundary regression, not concurrency; T005@696e7467 reclosed after restoring the canonical refresh rule and 107/107 contract tests, and T006@76657269 resumed
- 2026-08-15 UTC - Lightweight task T006@76657269 closed after the full bundle gate passed with 2320/2324 recursive tests passing, 4 skipped, zero failures, zero-failure lint, and pristine-release verification
- 2026-08-15 UTC - Lightweight task T007@63726576 claimed for independent software review
- 2026-08-15 UTC - Lightweight task T007@63726576 closed after independent software approval with one non-blocking sentinel-fixture hardening suggestion
- 2026-08-15 UTC - Lightweight task T008@72657677 claimed for final independent requirements acceptance
- 2026-08-15 UTC - Lightweight task T008@72657677 and Feature 038 closed after final independent requirements approval; all eight canonical tasks are complete
<!-- dude:managed:end -->
