---
title: Upgrade Pack Guidance Correction
slug: upgrade-pack-guidance-correction
status: defined
spec_path: .dude/specs/036-upgrade-pack-guidance-correction/spec.md
---

# Idea: Upgrade Pack Guidance Correction

## Idea

Shipped upgrade guidance still tells users to remove and re-add a pack to update
it, even though `compose refresh <pack>` has existed since Feature 031. The
instructions users actually follow after an upgrade are wrong, and they steer
people into the fragile recipe the refresh command was built to replace.

## Open Questions

### Q1: Should remove-then-add remain documented as an explicit fallback for a released bundle whose installed engine predates the `refresh` command?

**Your answer:** Do not preserve remove-then-add as a legacy update fallback. Current documentation describes the current engine. Keep `remove` and `add` documented only for ordinary uninstall and installation.

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

- Correct the two shipped upgrade-guidance surfaces users encounter after an
  upgrade so installed-pack updates lead with `compose refresh <pack>`.
- Remove installed-pack update claims that require remove-then-add, including
  any legacy fallback wording; the guidance describes the current engine.
- Preserve `remove` and `add` only for ordinary uninstall and installation.
- Keep the correction documentation-only and add no engine behavior.
- Edit authoritative `src/` guidance and regenerate its `.github/` projection
  only through `node scripts/build-dev.mjs`.
- Avoid duplicate implementation if a sibling has already absorbed the exact
  correction before work begins.

## Constraints

- Limit implementation to `src/skills/dude-bundle-upgrade/SKILL.md`,
  `docs/upgrading.md`, the generated upgrade-skill projection, and the smallest
  useful existing documentation contract.
- Do not change upgrade, compose, refresh, add, or remove engine behavior.
- Do not document remove-then-add as an installed-pack update path or legacy
  fallback.
- Keep remove and add available and documented for ordinary uninstall and
  installation.
- Generate `.github/skills/dude-bundle-upgrade/SKILL.md` only with
  `node scripts/build-dev.mjs`; never hand-edit it.
- Do not reopen or redefine Feature 031.
- Do not edit `.dude/memory/guardrails.md` as part of this feature.

## Definition Checklist

- [x] The accepted current-engine guidance and no-fallback decision are explicit
- [x] Both requested shipped guidance surfaces are independently testable
- [x] Ordinary uninstall and installation remain distinct from pack refresh
- [x] Authoritative and generated-core ownership is explicit
- [x] Engine behavior and memory edits are out of scope
- [x] The technology-agnostic specification has no unresolved clarification
- [x] One bounded canonical task covers the documentation slice and fresh proof

## Coordinator Log

- 2026-08-14 UTC - brainstorm captured
- 2026-08-14 UTC - brainstorm revised after independent review
- 2026-08-14 UTC - brainstorm refreshed
- 2026-08-14 UTC - first definition -> .dude/specs/036-upgrade-pack-guidance-correction/spec.md
- 2026-08-15 UTC - claimed T001@75706764 for Lightweight Execution
- 2026-08-15 UTC - completed T001@75706764: current upgrade guidance now uses `compose refresh <pack>` without a remove-then-add update fallback; the focused contract, 2,328-test recursive suite, workspace lint, compose verification, generated parity and idempotency, pristine release lint, and diff hygiene passed; independent review approved
<!-- dude:managed:end -->
