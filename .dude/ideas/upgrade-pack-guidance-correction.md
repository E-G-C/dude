---
title: Upgrade Pack Guidance Correction
slug: upgrade-pack-guidance-correction
status: draft
spec_path:
---

# Idea: Upgrade Pack Guidance Correction

## Idea

Shipped upgrade guidance still tells users to remove and re-add a pack to update
it, even though `compose refresh <pack>` has existed since Feature 031. The
instructions users actually follow after an upgrade are wrong, and they steer
people into the fragile recipe the refresh command was built to replace.

## Open Questions

### Q1: Should remove-then-add remain documented as an explicit fallback for a released bundle whose installed engine predates the `refresh` command?

**Your answer:** _Pending._

## Established Evidence

- `src/skills/dude-bundle-upgrade/SKILL.md` line 261 says: "through
  `compose remove <pack>` followed by `compose add <pack>`."
- `src/skills/dude-bundle-upgrade/SKILL.md` line 301 says: "installed pack
  profiles refresh only through `compose remove` then `compose add`."
- The "Refreshing installed packs" section of `docs/upgrading.md` (around lines
  92-101) prescribes `@dude remove pack <name>` and then
  `@dude add pack <name>`.
- Feature 031's documentation task updated
  `src/skills/dude-compose/SKILL.md`, `.dude/memory/guardrails.md`,
  `docs/commands.md`, and `docs/reference.md` to lead with `compose refresh`,
  but did not update the upgrade skill or `docs/upgrading.md`. Those are the
  surfaces a user reads immediately after upgrading, exactly when the correct
  instruction is needed.
- `.github/skills/dude-bundle-upgrade/SKILL.md` is generated from `src/`, so the
  source is edited and the generated copy is rebuilt via
  `node scripts/build-dev.mjs`.

## Assumptions

- Brainstorm intake only; no definition package, no implementation.
- This is a documentation-correctness fix; it changes no engine behavior.
- This may remain a separate draft, but whichever sibling pack outcome
  implements first may absorb the correction rather than duplicate its scope.
- `remove` and `add` remain documented for ordinary uninstall and install.

<!-- dude:managed:start -->
## Normalized Intent

- Correct the upgrade guidance users encounter after an upgrade so it leads
  with the existing `compose refresh <pack>` operation rather than the fragile
  remove-then-add update recipe.
- Keep `remove` and `add` documented for ordinary uninstall and install.
- Decide whether remove-then-add remains an explicit fallback for bundles whose
  installed engine predates `refresh`.
- Make only a documentation-correctness change; add no engine behavior.
- Allow the first implementing sibling to absorb this correction; do not
  duplicate the same documentation scope.

## Constraints

- Limit the outcome to documentation and guidance; change no engine behavior.
- Keep `src/` authoritative and rebuild generated `.github/` core only via
  `node scripts/build-dev.mjs`.
- Keep `remove` and `add` documented for their own purposes.
- Do not reopen Feature 031.
- Do not duplicate this scope if a sibling absorbs it first.
- Keep this as brainstorm-only scope; create no definition package and perform
  no implementation.

## Definition Checklist

- [x] Documentation-correctness outcome is clear enough for brainstorm
- [x] Stale guidance locations and Feature 031 coverage gap are captured
- [x] Source and generated-core ownership rule is explicit
- [x] Engine behavior is explicitly out of scope
- [x] Test placement is deferred to planning rather than treated as a user
  outcome choice
- [ ] Resolve fallback wording before definition

## Coordinator Log

- 2026-08-14 UTC - brainstorm captured
- 2026-08-14 UTC - brainstorm revised after independent review
<!-- dude:managed:end -->
