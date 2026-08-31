---
title: Transactional Pack Refresh
slug: transactional-pack-refresh
status: defined
spec_path: .dude/specs/031-transactional-pack-refresh/spec.md
---

# Idea: Transactional Pack Refresh

## Idea

Add a dedicated, one-command `compose refresh <pack>` operation for an
already-installed Dude capability pack. It safely updates the installed
`.github/` representation from the pack's current authoritative source, so a
maintainer no longer has to restore the old source bytes, remove the pack,
restore the edited source bytes, and add it again just to pick up a source
change.

I accepted the recommended approach: a single transactional refresh command that
proves installed-side authority before it replaces anything, expects the
authoritative source to have changed, and never weakens the existing removal
safety.

The refresh must:

- require the pack to be currently installed with complete current inventory authority;
- retain `remove`'s existing source-digest guard and retain `add --force`'s current semantics; do not weaken or repurpose either;
- verify every currently installed target against its recorded `installed_sha256` before any mutation, so a hand-edited installed artifact is never silently overwritten;
- stage and validate the complete current source using the same canonical add/projection/namespace machinery;
- compute the destination-set difference and transactionally replace same-path artifacts, add new artifacts, and remove old-only artifacts, leaving no untracked leftovers when a source artifact is renamed or deleted;
- support every current pack artifact kind, including agents, skills, instructions, and prompts;
- update `.dude/metadata/profile.md` to the new exact files and inventory only as part of the same all-or-restored transaction;
- recheck authorization and profile bytes before apply, and restore all installed artifacts and profile bytes on any failure;
- remain one existing Compose capability, not a new workflow lane, persistent artifact, daemon, store, or broad build-system redesign;
- update CLI help and the `dude-compose` skill guidance so the smooth path is `compose refresh <pack>`, while `remove` and `add` stay for ordinary uninstall and install;
- add focused regressions for source changes, same-set replacement, artifact addition/removal/rename, installed-drift refusal, all artifact kinds, profile drift and stale authorization, apply and profile-write rollback, cleanup with no leftovers, and non-installed refusal, using realistic reachable cases rather than exhaustive contrived permutations.

### Established evidence (verified in a throwaway bundle)

A fresh, controlled, throwaway-bundle investigation established the following and
changed no repository files:

1. After inventory is recorded against the fixture-local source, editing a pack source makes `compose remove <pack>` exit 2 with `persisted inventory source artifact ... no longer matches its recorded digest`.
2. `compose add <pack> --force` exits 0 as `alreadyInstalled: true` with `files: []`, and changes neither installed bytes nor profile bytes.
3. Simply allowing installed packs past that early return fails because profile validation then sees a duplicate enabled pack.
4. A two-line experimental bypass can update an unchanged agents/skills file set, but it leaves removed source artifacts installed and untracked, silently overwrites hand-edited installed artifacts, and fails any pack with existing instruction or prompt destinations.
5. Entire source unavailability still permits removal by design.
6. The focused existing digest regression passes.
7. No repository files were changed by that investigation.

### Why this is a new operation, not a fix to the existing guard

The raw-source digest guard on `remove` is not accidental and is not attached to
the wrong verb. It is an explicit Feature 028 safety requirement: `FR-017` states
that removal may use an optional raw-source digest comparison when source is
available, and `verifyAvailableInventorySource` in `compose.mjs` enforces it.
This new operation has a different intent: refresh expects the authoritative
source to have changed, while it still proves installed-side authority before it
replaces anything. `compose refresh <pack>` should supersede the awkward manual
restore-remove-restore-add recipe for future refreshes without weakening removal.

This is a new bounded outcome. It does not reopen or redefine Feature 028
(`agent-orchestration-metadata`), and it is not part of Feature 030
(`backlog-lifecycle-sync`).

## Open Questions

No open questions remain. The dedicated `compose refresh <pack>` command and its
safety contract are accepted, and the reachable behaviors, boundaries, and test
surface above are sufficient for definition. Reasonable implementation details
belong in later planning.

## Assumptions

- Proceed to explicit definition next; this action is brainstorm intake only.
- Use Lightweight Execution by default; no tracked-work import is requested.
- `refresh` is a peer subcommand of `add`, `remove`, `list`, `status`, and `verify` under the existing `compose.mjs`, reusing the current flag and exit-code conventions rather than a new entry point.
- The pack's authoritative source is available at refresh time (local catalog, or the same source resolution `add` already uses); a pack whose source cannot be resolved cannot be refreshed and is reported, not silently skipped.
- The existing add-time projection, namespace, and validation machinery is the single staging path; refresh does not fork a second renderer or inventory format.
- Updating the pack-lifecycle guardrail and `dude-compose` guidance to lead with `compose refresh <pack>` is part of this feature's own documentation scope, not a separate guardrail ratification.

<!-- dude:managed:start -->
## Normalized Intent

- Provide one transactional `compose refresh <pack>` subcommand that updates an already-installed pack's `.github/` projection from its current authoritative source in a single step, replacing the manual restore-remove-restore-add recipe.
- Gate refresh on the pack being installed with complete current inventory authority; refuse a non-installed pack and refuse a pack whose authoritative source cannot be resolved.
- Prove installed-side authority before mutation: verify every installed target against its recorded `installed_sha256`, and recheck authorization and profile bytes before apply, so hand-edited installed artifacts and profile drift are never silently overwritten.
- Reuse the existing add-time staging, projection, and namespace validation to stage and validate the complete current source; add no second renderer or inventory format.
- Compute the destination-set difference and apply it transactionally: replace same-path artifacts, add new ones, remove old-only ones, and update `.dude/metadata/profile.md` to the new exact files and inventory within the same all-or-restored transaction, leaving no untracked leftovers on rename or delete.
- Cover every current pack artifact kind: agents, skills, instructions, and prompts.
- Restore all installed artifacts and profile bytes on any staging, apply, or profile-write failure.
- Preserve, do not weaken: keep `remove`'s Feature 028 raw-source digest guard and `add --force`'s current semantics unchanged; refresh is a distinct-intent operation that expects source to have changed.
- Keep it one Compose capability: no new workflow lane, persistent artifact, daemon, store, scheduler, or build-system redesign.
- Lead documentation with `compose refresh <pack>`: update CLI help and `dude-compose` guidance, keep `remove` and `add` for ordinary uninstall and install, and refresh the pack-lifecycle guardrail recipe accordingly.
- Add focused, reachable regressions for the enumerated scenarios rather than exhaustive contrived permutations.

## Constraints

- Keep this as brainstorm intake only; do not create a definition package or begin implementation.
- Do not weaken, repurpose, or bypass `remove`'s source-digest guard or `add --force`'s existing semantics.
- Never silently overwrite a hand-edited installed artifact or a drifted profile; refuse and report instead.
- Never leave untracked leftovers when a source artifact is renamed or deleted.
- Apply all-or-nothing: on any staging, apply, or profile-write failure, restore every installed artifact and the profile bytes.
- Do not add a new workflow lane, persistent artifact, daemon, store, scheduler, second board, or broad build-system redesign; `refresh` is one subcommand of the existing Compose capability.
- Do not fork a second projection, renderer, namespace check, or inventory format; reuse the canonical add machinery.
- Refuse a pack that is not currently installed with complete current inventory authority, and refuse a pack whose authoritative source cannot be resolved.
- Do not reopen or redefine Feature 028, and do not fold this work into Feature 030.
- Keep `src/` and `library/packs/` authoritative and rebuild any generated `.github/` core only through the sanctioned build.

## Definition Checklist

- [x] Outcome is clear enough for brainstorm
- [x] Scope is coherent as one idea ledger
- [x] The safety contract (installed-side authority, transactional all-or-restored, no leftovers, preserved remove/add semantics) is explicit
- [x] Boundaries against a new lane, daemon, store, or build redesign are explicit
- [x] Relationship to Features 028 and 030 is clear: a new bounded outcome, neither reopened nor absorbed
- [x] Open questions are resolved or consciously assumed

## Coordinator Log

- 2026-08-11 UTC - brainstorm captured (via ship)
- 2026-08-11 UTC - defined as feature 031 (via ship)
- 2026-08-11 UTC - T001@72656672 closed: transactional `compose refresh <pack>` implemented in `src/skills/dude-compose/compose.mjs` with nine focused regressions; independent review APPROVE with zero blocking findings; fresh evidence 34/34 compose tests, lint 0/0, build-dev idempotent with source parity
- 2026-08-11 UTC - T002@646f6373 closed: guidance leads with `compose refresh <pack>` across `src/skills/dude-compose/SKILL.md`, guardrail entry 19, `docs/commands.md`, and `docs/reference.md`, with remove-then-add retained for ordinary uninstall/install and as the released-bundle fallback; independent review APPROVE, its one advisory alignment applied; lint 0/0 and source/generated parity fresh
- 2026-08-11 UTC - T003@61637074 closed: integrated acceptance over one unchanged revision — full suite 2308 tests 2304 pass 0 fail 4 pre-existing skips, lint 0/0, compose verify 16 packs clean, build-dev idempotent with source/generated parity, release build 64 files whose single lint warning is identical at HEAD, `git diff --check` clean, and an end-to-end smoke test in a throwaway real bundle where the edited-source case that refuses `remove` now succeeds as `refreshed pack "coding" (5 replaced, 0 added, 0 removed)`; independent review APPROVE with no blocking findings; feature complete
<!-- dude:managed:end -->
