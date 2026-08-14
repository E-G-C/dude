---
title: Simplify Pack Updates
slug: simplify-pack-updates
status: draft
spec_path:
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

**Your answer:** _Pending._

### Q2: What is the smallest honest identity for an installed pack: a source revision where one exists, rendered-output identity, or source plus renderer/model identity?

**Your answer:** _Pending._

### Q3: Should that identity replace the current `source`/`ref` inventory block, and how should existing, non-Git, or uncommitted local installations transition?

**Your answer:** _Pending._

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
  evidence and still needs an explicit keep/remove disposition.
- Local catalogs and local-path sources can be non-Git or contain uncommitted
  bytes. A commit can therefore be a source identity only where one is
  available.
- Installed agent bytes also depend on the installed renderer and
  `agent-models.json`, loaded by `loadProjectionDependencies`. A source commit
  alone neither identifies rendered output nor proves that a refresh is
  unchanged.
- The current add/remove/refresh transactions restore backups when a caught
  application failure occurs. They do not establish crash-proof atomicity.

### Candidate directions from exploration (not yet accepted)

- Remove or downgrade checks only with the explicit tradeoff that drift refusal
  or profile tamper evidence is being surrendered.
- Use a resolved commit as candidate source identity where available, without
  treating it as sufficient rendered-output identity.
- Retain the unhashed `files` list as candidate ownership and deletion
  authority for dropped artifacts and uninstall.

## Assumptions

- Brainstorm intake only; no definition package or implementation.
- YAGNI governs the outcome: retain bookkeeping only for a concrete reachable
  behavior the user chooses to preserve.
- Packs remain opt-in and retain their existing namespace and ownership tier.
- Installed pack artifacts are generated output rather than the intended
  hand-edit surface, but hand edits are reachable and their treatment remains
  an explicit tradeoff.
- This does not reopen Feature 031 (`transactional-pack-refresh`).

<!-- dude:managed:start -->
## Normalized Intent

- Simplify publisher-to-consumer pack updates through GitHub with the smallest
  bookkeeping that preserves only deliberately selected behavior.
- Decide the cut depth with honest tradeoffs: removing checks may surrender
  installed-drift refusal or internal profile-tamper evidence.
- Choose an identity that accounts for local/non-Git source and rendered-output
  dependencies instead of assuming a source commit alone is sufficient.
- Preserve rollback on caught application failure without claiming crash
  safety, and keep this separate from Feature 031's completed scope.

## Constraints

- Keep this as brainstorm intake only; create no definition package or
  implementation.
- Add no speculative workflow lane, daemon, store, scheduler, or second board.
- Keep packs opt-in and preserve their namespace and ownership tier.
- Preserve the existing rollback-on-caught-failure behavior.
- Do not reopen Feature 031.

## Definition Checklist

- [x] Outcome is clear enough for brainstorm
- [x] User voice and publisher-to-consumer framing are preserved
- [x] Current checks and their concrete tradeoffs are stated without claiming
  Git replaces them
- [ ] Resolve cut depth, representation identity, and existing-install
  transition before definition

## Coordinator Log

- 2026-08-14 UTC - brainstorm captured
- 2026-08-14 UTC - brainstorm rerun: freshness split into pack-catalog-refetch
- 2026-08-14 UTC - brainstorm rerun: removed freshness scope now owned by pack-catalog-refetch
- 2026-08-14 UTC - brainstorm revised after independent review
<!-- dude:managed:end -->
