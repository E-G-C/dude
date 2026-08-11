<!-- audit log: .dude/ideas/transactional-pack-refresh.md#coordinator-log -->

# Tasks: Transactional Pack Refresh

Three all-open canonical units implement `.dude/specs/031-transactional-pack-refresh/spec.md`, owned prospectively and exactly by `.dude/ideas/transactional-pack-refresh.md`.

No task carries `[P]`. The refresh command and its focused regressions land first; the maintainer-facing guidance and generated parity follow; final acceptance runs over one unchanged integrated revision and routes fresh evidence to independent review.

Core source lives under `src/`; generated `.github/**` core is refreshed only through `node scripts/build-dev.mjs` and is never hand-edited. `library/packs/` stays authoritative pack source.

The plan's normative boundaries are binding: refresh is a distinct subcommand, not a mode of add or remove and not `--force`; it must reuse the canonical install staging/projection/namespace/inventory machinery with no second renderer or inventory version; it must preserve `cmdRemove`'s recorded-source digest guard and `cmdAdd --force` semantics and must not call `verifyAvailableInventorySource`; and it must never silently overwrite installed drift or a drifted profile. No task may weaken a safety gate or add a lane, store, daemon, scheduler, second board, inventory version, or broad build redesign. A required change outside those boundaries stops as `contract-mismatch: redefine-required`.

## Phase 1: Refresh Command And Focused Regressions

**Goal**: Add the transactional `refresh` subcommand and prove its diff, authority, atomicity, and preserved guards with focused regressions.

- [x] T001@72656672 [Shared] Implement `plan.md` Chosen Design sections 1 through 7 in `src/skills/dude-compose/compose.mjs`: extract the install staging pipeline from `cmdAdd` into an internal `stagePackFromSource` helper with `cmdAdd` behavior unchanged (caller-owned `stageRoot`, preserving the `dude-compose-add-` prefix); add `cmdRefresh` with the installed-side authority gate copied from `cmdRemove` (exact authorized profile bytes, `firstNonCurrentProfileEvidence`, exact files-to-inventory congruence, per-target `resolveProfileArtifact` plus `hashArtifact === installed_sha256`), the current-source stage via a `dude-compose-refresh-` `stageRoot`, the old/new destination-set diff (same-path replacements, new-only additions, old-only removals), the additive preflight (other-pack claim, `resolveProfileArtifact` safety, and refusal of any existing occupied or foreign new destination with no force exception for instructions or prompts), the next-profile build plus reread-and-compare of authorized bytes, and the all-or-restored transaction (back up every replacement and removal before mutating, apply removals then replacements then additions then `writeProfileDocument`, reverse-rollback with `sweepProfileTransactionResidue`, and a `finally` that removes both temp roots); deliberately do not call `verifyAvailableInventorySource`. Wire `refresh <name>` into `parseArgs`, `HELP`, the `main` switch, and `report` (human summary plus `--json` `{ refreshed, replaced, added, removed, files }`), and add `cmdRefresh` to the module exports. Add the Test Strategy regressions to `src/skills/dude-compose/compose.test.mjs`, extending `writePack` to emit an instruction and a prompt and adding a `dude-compose-refresh-` stage/transaction tracker: mixed agents/skills/instructions/prompts refresh with add, replace, and remove; changed-source same-set; installed-drift refusal; not-installed and non-current-record refusal; unresolvable-source refusal; occupied and foreign-owned new-destination refusal; stale-authorization refusal via a targeted `fs.readFileSync` wrapper; Phase-2 rollback with byte-identical artifacts and profile, no leftovers, and cleaned temp dirs; and preserved `cmdRemove` recorded-source and `cmdAdd --force` guards including a changed-source refresh that still succeeds. Assert old-only destinations are absent on disk (not merely missing from the record) and that every refusal leaves artifacts and profile byte-identical. Run `node --test src/skills/dude-compose/compose.test.mjs`, then refresh generated core with `node scripts/build-dev.mjs`. (US1, US2, US3 -> FR-001 through FR-015, FR-017; SC-001 through SC-007, SC-009)

## Phase 2: Guidance, Guardrail, And Generated Parity

**Goal**: Lead the documented smooth path with the refresh command while keeping uninstall and install documented for their own purposes.

- [x] T002@646f6373 [Shared] Implement `plan.md` Chosen Design section 8. Update `src/skills/dude-compose/SKILL.md` to add a Refresh Flow and lead the "Parity, Refresh, And Inventory" guidance with `compose refresh <pack>`, retaining the never-hand-edit and remove-then-add rules for their own purposes; update the pack-refresh entry in `.dude/memory/guardrails.md` so the smooth path leads with `compose refresh <pack>` while keeping the recorded-source-guard rationale for the manual fallback; and mention `compose refresh <pack>` in `docs/commands.md` (and `docs/reference.md` if it enumerates compose verbs). Keep `remove` and `add` documented for ordinary uninstall and install. Refresh generated core with `node scripts/build-dev.mjs` and confirm the generated `.github/skills/dude-compose/SKILL.md` is byte-identical to source. Run `node .github/skills/dude-lint/lint.mjs .` and require zero failures. (US4 -> FR-016; SC-008)
    deps: T001@72656672

## Phase 3: Integrated Acceptance And Review

**Goal**: Prove the integrated feature end to end and hand one fresh evidence set to independent review.

- [x] T003@61637074 [Shared] Run integrated acceptance over one unchanged revision: `node --test src/skills/dude-compose/compose.test.mjs`; the full recursively discovered suite `find . -name '*.test.mjs' -not -path '*/node_modules/*' -print0 | xargs -0 node --test`; `node .github/skills/dude-lint/lint.mjs .` with zero failures; `node scripts/build-dev.mjs` run twice with an idempotent second run and source-to-generated parity; `node .github/skills/dude-compose/compose.mjs verify`; a pristine release build and release lint; and `git diff --check`. Confirm the only generated changes come from build-dev, the preserved `cmdRemove` recorded-source and `cmdAdd --force` guards are intact, refresh never calls `verifyAvailableInventorySource`, and no lane, store, daemon, scheduler, second renderer, inventory version, or broad build redesign was introduced. Route the unchanged diff and the same evidence to an independent reviewer without mutating this definition package or any task state. (US1, US2, US3, US4 -> FR-001 through FR-017; SC-001 through SC-009)
    deps: T002@646f6373

## Requirements And Success Traceability

| Specification coverage | Plan ownership | Tasks |
|---|---|---|
| FR-001, FR-015 / SC-001 | CLI surface, reporting, exports (section 1) | T001@72656672, T003@61637074 |
| FR-002, FR-003, FR-011, FR-014 / SC-004, SC-006, SC-007 | Installed-side authority gate, preserved guards (section 3) | T001@72656672, T003@61637074 |
| FR-004, FR-005 / SC-003 | Shared staging extraction and current-source stage (sections 2, 4) | T001@72656672, T003@61637074 |
| FR-006, FR-007, FR-008, FR-009 / SC-002, SC-003 | Destination-set diff and additive preflight (section 5) | T001@72656672, T003@61637074 |
| FR-010, FR-012, FR-013 / SC-005 | Next profile, reread, all-or-restored transaction (sections 6, 7) | T001@72656672, T003@61637074 |
| FR-016 / SC-008 | Guidance, guardrail, and generated parity (section 8) | T002@646f6373, T003@61637074 |
| FR-017 / SC-009 | Bounded scope preserved throughout | T001@72656672, T002@646f6373, T003@61637074 |
