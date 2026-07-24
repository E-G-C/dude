# Implementation Plan: Retire Context Footprint Audit

## Summary

Execute one recoverable authoring-pack lifecycle: baseline protected state, snapshot every source write path, remove original authoring while its inventory matches, perform the audit deletion while authoring is absent, and install reduced authoring from local source.

Installed `.github` artifacts and `.dude/metadata/profile.md` are compose-owned evidence, never rollback payloads. The source snapshot remains external and available until final acceptance or verified rollback.

A dependent acceptance task runs complete validation, self-consistent filtered catalog verification, history checks, and the exact release handoff.

## Technical Context

**Language/Version**: Node.js >= 20 dependency-free ESM, Markdown, JSON
**Dependencies**: `dude-compose`, Dude lint, build-dev, build-release, `node:test`, SHA-256
**Storage**: external temporary source snapshot and filtered bundle only; no permanent replacement storage
**Testing**: focused syntax and behavior tests, complete intended-tree discovery, lint, build parity, compose verification, pristine release validation
**Platform**: cross-platform repository tooling; this execution occurs on macOS
**Project Type**: reusable bundle and optional pack catalog
**Constraints**: baseline after re-definition; remove original authoring before source changes; never close while authoring is absent; preserve coding, writing, history, and protected work

## Guardrail Check

- Deletion is the smallest design satisfying the accepted intent.
- Deterministic hashes, inventories, lifecycle checks, and test results own acceptance.
- No speculative replacement, permanent recovery artifact, or new state mechanism is introduced.

## Source Write Inventory

The external restore payload contains exactly these thirteen regular files under their repository-relative paths.

| # | Path | Mutation |
|---|---|---|
| 1 | `scripts/prompt-audit-profiles.json` | Delete |
| 2 | `scripts/prompt-audit.mjs` | Delete |
| 3 | `library/packs/authoring/skills/dude-pack-authoring-prompt-audit/SKILL.md` | Delete |
| 4 | `library/packs/authoring/skills/dude-pack-authoring-prompt-audit/prompt-audit.mjs` | Delete |
| 5 | `library/packs/authoring/tests/dude-pack-authoring-prompt-audit.test.mjs` | Delete |
| 6 | `docs/context-footprint.md` | Delete |
| 7 | `docs/context-footprint-snapshots/baseline.json` | Delete |
| 8 | `docs/context-footprint-snapshots/post-deletion.json` | Delete |
| 9 | `docs/context-footprint-snapshots/post-reduction.json` | Delete |
| 10 | `library/packs/authoring/pack.md` | Update |
| 11 | `scripts/current-format-contract.test.mjs` | Update |
| 12 | `scripts/canonicalize-installed-agents.mjs` | Update |
| 13 | `src/skills/dude-engine/lib/agent-frontmatter.test.mjs` | Update |

No other source path belongs to the transaction.

## History And Scope Boundary

Capture the implementation baseline only after this revised definition and both idea-log appends are applied.

Record:

- exact owner identity;
- paths, lengths, and SHA-256 hashes for every unrelated idea and specification package;
- current `spec.md`, `plan.md`, and `research.md` hashes;
- current Coordinator Log entries as an ordered prefix;
- task durable IDs, labels, descriptions, ordering, and dependencies;
- any discovered-work or execution-history sections;
- Git `HEAD`, relevant refs, and changed-path state;
- status and byte fingerprints for `library/packs/README.md` and `library/packs/technical-docs/**`.

After baseline, permit only coordinator-appended log events and coordinator-owned task glyph, blocker, and derived-board changes. Preserve all other recorded history and structure.

Protected catalog paths are evidence only. Do not edit, import, classify, test-discover, stale-reference-scan, or include them in filtered verification.

## Transaction And Recovery

### 1. Snapshot And Installed Evidence

Create one external transaction directory before mutation.

Copy all thirteen source paths byte-for-byte under their repository-relative names. Reject any missing, additional, symbolic-link, or non-regular entry. Write a sorted SHA-256 manifest containing each path, byte length, and hash; require copied bytes and live source to match it exactly.

Separately record compose status, the original nine-artifact authoring inventory, profile evidence, coding and writing subtrees and artifact hashes, changed paths, and protected-path evidence. Installed `.github` and profile bytes must never be copied back.

Retain the transaction directory until final acceptance succeeds or rollback is fully verified.

### 2. Remove Original Authoring

Require compose status to show exactly enabled `authoring`, `coding`, and `writing`, a complete hash-matching nine-artifact authoring inventory, and unchanged coding and writing evidence.

Use the original workspace compose CLI to remove authoring before changing any source path. Require authoring absent, coding and writing unchanged, and a valid profile. Stop if removal refuses or preservation evidence changes.

### 3. Mutate Source

Delete the nine inventory paths marked `Delete`.

Apply only these four updates:

- In `library/packs/authoring/pack.md`, remove the audit skill from `provides.skills` and its prose while retaining five agents and three convention skills.
- In `scripts/current-format-contract.test.mjs`, remove `PROJECT_STANDING_GUIDANCE`, the dogfood-footprint manifest test, and the two footprint documentation exclusions. Preserve current-only memory and generic historical-package checks; add no absence test.
- In `scripts/canonicalize-installed-agents.mjs`, replace only audit-measurement wording with compose-parity wording.
- In `src/skills/dude-engine/lib/agent-frontmatter.test.mjs`, remove only audit wording and preserve every test.

### 4. Install Reduced Authoring

While authoring remains absent, require the local authoring manifest to contain the same five agents and these skills:

- `dude-pack-authoring-instruction-conventions`
- `dude-pack-authoring-pack-conventions`
- `dude-pack-authoring-prompt-conventions`

Compose-add local authoring with fetching disabled. Require exactly eight installed artifacts, no installed prompt-audit skill, expected lifecycle-owned authoring metadata changes, and byte-identical coding and writing profile subtrees and artifacts.

Run the focused checks before declaring the transaction checkpoint. Keep the source snapshot for dependent final acceptance.

### 5. State-Specific Rollback

**Authoring absent**: Restore all thirteen source paths from the snapshot, verify every live SHA-256, then compose-add original authoring from restored local source. Require the original nine artifacts and unchanged coding and writing.

**Reduced authoring installed**: While reduced source and installed hashes still match, compose-remove reduced authoring. Restore and hash-verify all thirteen source paths, then compose-add original authoring. Require the original nine artifacts and unchanged coding and writing.

**Ambiguous or failed state**: Stop and retain all evidence. Do not copy installed files, restore profile bytes, edit the profile, force compose, or invent another transition.

Delete the external snapshot only after successful final acceptance or verified rollback of source, authoring, coding, writing, profile validity, and protected paths.

## Validation

### Focused And Repository Checks

While authoring is absent, check updated syntax and run preserved normalizer tests.

After reduced authoring installation, require successful compose status, current-format and normalizer tests, and Dude lint.

Final validation must also:

- run `build-dev` and focused current-format, build-dev, and build-release tests;
- discover the complete sorted `*.test.mjs` set recursively, excluding `dist/**` and protected `library/packs/technical-docs/**`, and pass that set to `node --test`;
- rerun Dude lint;
- build and lint a pristine external release without creating a tag;
- scan active surfaces for audit identifiers while excluding `.git/**`, `dist/**`, `.dude/ideas/**`, `.dude/specs/**`, `library/packs/README.md`, and `library/packs/technical-docs/**`;
- compare history, coding, writing, Git refs, protected paths, and profile evidence with baseline;
- require exactly the nine source deletions, four source updates, installed-skill removal, and compose-owned profile update;
- require no replacement, changelog, release-note, archaeology, or state artifact.

Bare `node --test` is not sufficient because it under-discovers nested tests.

## Filtered Compose Verification

Create one external temporary bundle root `<filtered-root>`.

1. Copy current post-build `.github/` to `<filtered-root>/.github/`.
2. Copy current `.dude/metadata/` to `<filtered-root>/.dude/metadata/`.
3. Copy current `library/` to `<filtered-root>/library/`, excluding `library/packs/README.md` and `library/packs/technical-docs/**`.
4. Require exactly these catalog directories: `authoring`, `beads`, `coding`, `copilot-sdk`, `design`, `docsy`, `fluent-ui`, `hugo`, `ms-brand`, `newsroom`, `practices`, `release`, `rust`, `web`, and `writing`.
5. Use the original workspace compose CLI with `--root <filtered-root>` to inspect copied status.
6. Remove every pack enabled in the copied profile through compose against `<filtered-root>`. Do not edit the copied profile.
7. Require copied status to contain no enabled or installed pack and no optional-pack leftover.
8. Run `verify --root <filtered-root> --library <filtered-root>/library/packs --json` through the original workspace CLI.
9. Require `ok: true`, a valid copied profile, exactly the fifteen sorted names above, no missing, duplicate, additional, or `technical-docs` result, no result error, zero failures, and zero leftovers.

Both arguments are mandatory because verification enumerates `--library` but copies `<root>/library` into its per-pack verification roots.

## Final Acceptance And Handoff

Final acceptance requires every validation and preservation check to succeed while reduced authoring is installed.

The final implementation handoff must consist solely of:

`Removed the optional dude-pack-authoring-prompt-audit capability, including its six static-footprint profiles, reports, snapshots, and documentation. No replacement audit is provided.`

Do not add a permanent release artifact or claim an authored commit, pull request, generated note, tag, or publication.

After the handoff check succeeds, delete the retained source snapshot and verify its transaction directory is gone. If acceptance fails, retain it for state-specific rollback.

## Traceability

| Specification coverage | Plan coverage | Task |
|---|---|---|
| FR-001, FR-005, FR-011 / SC-001 | Source inventory; source mutation | T005@4f8a2c71 |
| FR-002 / SC-005 | Guardrail check; diff validation | T005@4f8a2c71, T006@b3d9e560 |
| FR-003 / SC-006 | History and scope boundary | T005@4f8a2c71, T006@b3d9e560 |
| FR-004 / SC-004 | Validation | T005@4f8a2c71, T006@b3d9e560 |
| FR-006, FR-007 / SC-003 | Remove and install authoring | T005@4f8a2c71 |
| FR-008 / SC-006 | Protected scope boundary | T005@4f8a2c71, T006@b3d9e560 |
| FR-010 / SC-007 | Final acceptance and handoff | T006@b3d9e560 |
| FR-012 / SC-002 | Active-reference validation | T006@b3d9e560 |
| FR-013, FR-014 / SC-008 | Snapshot and state-specific rollback | T005@4f8a2c71 |
| FR-015 / SC-004, SC-005 | Filtered compose verification | T006@b3d9e560 |

## Risks

- Inventory drift may prevent original authoring removal before source mutation.
- An incomplete or raced snapshot would invalidate recovery; exact path-set and live-byte verification must fail closed.
- Reduced-source drift may prevent lifecycle-authorized rollback removal.
- Incorrect temporary-root construction could verify the unfiltered catalog.
- Broad discovery or scanning could consume protected technical-docs work.
- Whole-profile comparison would falsely reject expected authoring metadata changes.
- Whole-task-file hashing would falsely reject permitted coordinator-owned state changes.
- Premature snapshot deletion would remove the only authorized source recovery payload.