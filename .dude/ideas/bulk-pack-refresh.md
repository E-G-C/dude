---
title: Bulk Pack Refresh
slug: bulk-pack-refresh
status: draft
spec_path:
---

# Idea: Bulk Pack Refresh

## Idea

I think plain `@dude upgrade` should keep updating core only. An opt-in form —
my suggestion is `@dude upgrade --all` — should also bring the packs I already
installed up to date, so I do not have to remember to refresh each pack by hand
after upgrading.

## Open Questions

### Q1: Should the opt-in form use the proposed `--all` spelling or a more descriptive name such as `--with-packs`?

**Your answer:** _Pending._

### Q2: How much preview should the opt-in operation provide: current-core estimates, a planned-core isolated preview, or results only after core is applied?

**Your answer:** _Pending._

### Q3: If one pack cannot refresh after the core upgrade, should successful core/pack changes remain with a report, or should the operation attempt to roll everything back?

**Your answer:** _Pending._

### Q4: When a target pack exists locally, should bulk refresh keep using that local source, or should the opt-in upgrade be able to select the same exact upstream revision as core?

**Your answer:** _Pending._

### Q5: Must `pack-catalog-refetch` or `simplify-pack-updates` land first, or should this outcome remain independently definable?

**Your answer:** _Pending._

## Established Evidence

- `@dude upgrade` currently enumerates core-owned paths and preserves installed
  pack artifacts and `.dude/metadata/profile.md`. Core renderer/model bytes can
  therefore change while installed pack projections remain unchanged.
- `compose refresh <pack>` updates one installed pack. There is no current bulk
  operation over `profile.enabled_packs`.
- Current Compose rendering loads the installed renderer and model config. It
  cannot authoritatively preview post-upgrade rendering through that installed
  engine before core apply. Rendering in isolation with staged/planned core
  bytes is technically possible, but would be an additional mechanism whose
  value remains subject to YAGNI.
- Compose itself performs no Git commit. Upgrade rollback refuses a dirty
  working tree, so leaving refreshed pack output uncommitted would block the
  current rollback command. Per-pack commits are one possible response, not a
  requirement.
- Refresh has a whole-profile currency gate. One incomplete installed record or
  enabled-pack ghost can currently block refresh even when the target pack's
  own inventory is current.
- `resolvePackDir` gives a local target pack precedence over `--source` and
  `--ref`. Exact core-revision binding therefore does not work through current
  Compose when that local target exists.
- Current rollback-on-caught-failure behavior is scoped to one pack refresh;
  there is no existing core-plus-all-packs transaction.

### Candidate directions from exploration (not yet accepted)

- Let upgrade orchestrate the existing pack operation, or add a minimal bulk
  Compose entry point, rather than duplicating projection logic.
- Preview after core apply or use an isolated planned-core stage; do not call
  current-core rendering an authoritative post-upgrade preview.
- Use one combined pack commit, per-pack commits, or another clean-worktree
  integration; choose partial-failure and source-revision behavior explicitly.

## Assumptions

- Brainstorm intake only; no definition package, no implementation.
- Only packs already listed in `profile.enabled_packs` are refreshed; bulk
  refresh never installs a new pack, because packs stay opt-in.
- Plain `@dude upgrade` stays core-only and unchanged by default.
- The architecture, commit shape, preview timing, source binding, and
  partial-failure policy are not yet accepted.
- This does not reopen Feature 031's completed per-pack refresh scope.

<!-- dude:managed:start -->
## Normalized Intent

- Keep plain `@dude upgrade` core-only and add, only if explicitly selected, a
  bulk path for refreshing packs already present in `profile.enabled_packs`.
- Let the user request one installed-pack update rather than remember one
  manual refresh command per pack.
- Keep all sequencing, preview, commit, failure, source-selection, and component
  ownership choices open until definition.
- Evaluate those choices against current source behavior and YAGNI without
  turning exploration recommendations into user requirements.
- Keep the sibling freshness and simplification outcomes separate and do not
  reopen Feature 031.

## Constraints

- Add no workflow lane, persistent artifact, daemon, store, scheduler, or second
  board.
- Never install a pack that the user has not opted into.
- Do not refresh packs during plain `@dude upgrade`; pack refresh remains
  explicit.
- Do not claim planned-core preview is impossible, require per-pack commits, or
  promise exact revision binding through unchanged local-source precedence.
- Keep this as brainstorm-only scope; create no definition package and perform
  no implementation.

## Definition Checklist

- [x] Outcome is clear enough for brainstorm
- [x] The user's core-only default and opt-in installed-pack proposal are
  preserved in first person
- [x] Verified preview, rollback, profile, and local-source behavior is captured
- [x] Exploration architecture is clearly unaccepted
- [ ] Resolve naming, preview, partial-failure, source-selection, and sibling
  dependency choices before definition

## Coordinator Log

- 2026-08-14 UTC - brainstorm captured
- 2026-08-14 UTC - brainstorm revised after independent review
<!-- dude:managed:end -->
