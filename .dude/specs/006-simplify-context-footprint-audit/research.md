# Research: Retire Context Footprint Audit

## Decision

Retire the active context-footprint and prompt-audit system completely.

| Operational-purpose requirement | Evidence |
|---|---|
| Named consumer | None found |
| Defined trigger or failure threshold | None found |
| Prescribed corrective action | None found |

Its output is a static source-size proxy, not evidence of runtime prompt membership, token use, latency, cost, or quality. Keeping the capability would retain implementation, installation, test, documentation, and report cost without an operational decision.

## Active Deletion Inventory

| Path | Current role | Disposition |
|---|---|---|
| `scripts/prompt-audit-profiles.json` | Six profiles and audit inventory | Delete |
| `scripts/prompt-audit.mjs` | Repository audit wrapper | Delete |
| `library/packs/authoring/skills/dude-pack-authoring-prompt-audit/SKILL.md` | User-invocable skill | Delete |
| `library/packs/authoring/skills/dude-pack-authoring-prompt-audit/prompt-audit.mjs` | Audit runtime | Delete |
| `library/packs/authoring/tests/dude-pack-authoring-prompt-audit.test.mjs` | Audit-only tests | Delete |
| `docs/context-footprint.md` | Active audit documentation | Delete |
| `docs/context-footprint-snapshots/baseline.json` | Stored report | Delete |
| `docs/context-footprint-snapshots/post-deletion.json` | Stored report | Delete |
| `docs/context-footprint-snapshots/post-reduction.json` | Stored report | Delete |
| `library/packs/authoring/pack.md` | Advertises audit skill | Remove only audit entries |
| `scripts/current-format-contract.test.mjs` | Contains audit-specific contract blocks | Remove only those blocks |
| `scripts/canonicalize-installed-agents.mjs` | Independent compose normalizer with audit wording | Preserve behavior; revise wording |
| `src/skills/dude-engine/lib/agent-frontmatter.test.mjs` | Independent normalizer tests with audit wording | Preserve tests; revise wording |

The six deleted profiles are `core-coordinator`, `definition-common`, `lightweight-common`, `tracked-common`, `bundle-maintenance`, and `review-common`.

Original authoring has five agents and four skills. Reduced authoring retains the five agents and the three instruction, pack, and prompt convention skills.

Installed prompt-audit files and authoring profile rows are removed or regenerated only through compose. Installed `.github` and profile bytes are evidence only, not source-restoration material.

## Preserved Boundaries

### Independent Validation

Preserve:

- build-dev source/generated projection;
- compose source, profile, installed inventory, and catalog verification;
- Dude lint;
- all non-audit behavior tests;
- build-release and pristine release lint;
- shared agent-frontmatter normalization and canonicalization behavior.

The audit runtime's private duplicate parity logic disappears with the runtime.

### History

Baseline after the revised definition is finalized.

Preserve every unrelated idea and specification package, current static definition artifacts, prior Coordinator Log entries as an ordered prefix, task identity and structure, discovered work, execution history, and Git history.

Only coordinator-appended log events and coordinator-owned task glyph, blocker, and derived-board changes may follow the baseline.

Historical `.dude/ideas/**` and `.dude/specs/**` remain outside active stale-reference scanning. The current package is validated structurally against its baseline.

### Protected Work

`library/packs/README.md` and `library/packs/technical-docs/**` are unrelated. They are not edited, imported, ownership-classified, copied into filtered verification, catalog-verified, test-discovered, or stale-reference-scanned. Status and byte fingerprints are preservation evidence only.

Only coding and writing profile subtrees and installed artifacts are immutable. Authoring metadata is expected to change through compose.

## Review Corrections

### 1. Self-Consistent Filtered Verification

The rejected procedure changed only catalog enumeration. Verification also copies `<root>/library`, so enumeration and installation could use different trees.

Use one external filtered bundle root containing copied current `.github`, `.dude/metadata`, and `library` without protected paths. Remove every copied enabled pack through compose, then verify with that root as both `--root` and owner of `--library`. Require exactly fifteen established names, zero failures, and zero leftovers.

### 2. Complete Source Rollback

The rejected rollback did not preserve every source write path.

Before mutation, copy all nine deletion paths and four update paths to an external snapshot under repository-relative names. Record byte lengths and SHA-256 values in an exact-path manifest and verify live and copied bytes. Retain the snapshot through final acceptance or verified rollback.

When authoring is absent, restore source before adding original authoring. When reduced authoring is installed, remove it while reduced source matches, then restore source and add original authoring. Stop on ambiguity or failure.

### 3. Bounded Release Acceptance

Implementation cannot guarantee later commit text, pull-request text, generated notes, tags, or publication.

Acceptance is limited to the exact release-note-ready handoff defined by FR-010 and confirmation that no permanent release, archaeology, or replacement artifact was added.

### 4. Execution-Safe History Preservation

Whole-file immutability would reject legitimate coordinator execution updates.

Baseline after re-definition. Preserve unrelated package hashes, static current-definition artifacts, the prior log as an ordered prefix, and immutable task structure and history. Permit only coordinator-appended log events and coordinator-owned glyph, blocker, and derived-board changes.