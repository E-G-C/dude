# Implementation Plan: Canvas Without Beads

**Owner:** `.dude/ideas/066-canvas-without-beads.md`
**Specification:** `.dude/specs/066-canvas-without-beads/spec.md`

## Technical Context

**Language/Version:** JavaScript ES modules, Node.js >= 20.
**Primary Dependencies:** Node standard library and existing core feature, task, path, and backlog helpers. Beads remains optional; core must not import an optional pack.
**Storage:** Existing canonical files and read-only authority evidence; no new persistent state.
**Testing:** Node's test runner, disposable filesystem fixtures, the real default process boundary, and the existing injected `runBd` seam.
**Target Platform:** Existing Windows and non-Windows Canvas hosts, including supported Git, non-Git, and linked-worktree roots.
**Project Type:** Canvas extension backend.
**Performance Goals:** Retain the shared five-second acquisition deadline, subprocess buffer limits, and bounded package reads. Add no background probes or retries.
**Constraints:** Read-only operation, unchanged public reader signatures and projection shapes, private typed failures, and no new installation requirement.

## Current Boundary

Both `readWorkIndex` and `readNowProjection` use `queryTrackedIssues` in `src/extensions/dude/lib/projection.mjs`. `invokeBd` currently collapses missing-executable errors into `TRACKED_AUTHORITY_UNAVAILABLE`; the empty-board and exact no-database paths instead reach canonical lifecycle reads. Source verification and freshness query the same boundary again.

Production invokes `bd` with `cwd: root`, inherited environment, and `shell: false`. A populated complete list wins globally, regardless of local marker presence or whether the selected feature has matching issues. Keep those successful-query semantics. The captured failure and synthetic control remain supplied evidence, not fresh verification.

## Chosen Approach

1. **Classify the narrow failure at the shared boundary (FR-001, FR-003, FR-005).** Retain an identifiable missing-`bd` acquisition cause through the existing typed error path instead of losing it in `invokeBd`. Only `queryTrackedIssues` may admit this optional-absence case. Validate the working root so a missing or inaccessible `cwd` cannot masquerade as a missing executable. Cancellation, exhausted deadlines, signals, buffer overflow, permission errors, other exits, and malformed results retain their existing failures. Do not use error-message substring matching or relax `queryReadyIssues`.
2. **Require a conservative absence basis (FR-002 through FR-004).** Use a small private read-only check at that boundary, not a second tracker resolver. A `.beads` footprint at the applicable root or inherited ancestor, explicit inherited Beads configuration, or known tracked facts requires a working authority read. For a linked worktree, account for the main-worktree location through the existing local `.git`/`commondir` relationship before claiming absence; malformed, unreadable, unsafe, or unresolved indirection is uncertainty. Reuse `isMissing`, safe path/stat conventions, and `resolveMutationPath` for workspace-contained inputs. Do not follow `.beads` links or inspect database contents.
   - The missing-tool allowance covers default local discovery only after the relevant locations are safely established absent. Nonempty inherited `BEADS_*` settings, including location overrides such as `BEADS_DIR` or `BEADS_DB`, disqualify this local-only inference; their presence is uncertainty, not proof of an imported board. Git-location overrides such as `GIT_DIR`, `GIT_COMMON_DIR`, or `GIT_WORK_TREE` likewise must not silently redirect an absence check.
   - Keep database selection delegated to runnable `bd`; do not add a home-directory search, configuration parser, server probe, or general support for external Beads layouts. Successful parsed `[]` remains authoritative evidence of an empty board. The existing exact `isAbsentDatabaseResult` recognition remains narrow and may permit canonical reads only without conflicting tracked evidence. A marker alone does not select the tracked lane.
3. **Use the same rule throughout acquisition (FR-006, FR-007).** Reuse existing query-source identities, final source verification, and freshness/refresh paths. Distinguish admitted optional absence from a successful board capture so source evidence does not claim a successful Beads read. Recheck the absence basis rather than caching it. Positive tracked facts already available in the operation or its existing previous projection preclude missing-tool/no-database fallback. A changing authority withholds current status; failed refresh preserves the prior complete projection. Add no stored lane flag or registry.
4. **Leave canonical interpretation intact (FR-006, FR-008).** Continue using exact-owner selection, `parseVisibleTasks`, canonical readiness, and backlog grouping. Keep independent inventory discovery on enrichment failure. Do not alter task bodies, state, history, selection rules, or the renderer. Add only a short optional-Beads behavior note in the existing Canvas section of `docs/commands.md`, preserving its pending edits.

This follows graceful degradation for an unused optional integration while keeping required-authority failures visible. It adds no visual or interaction contract. Existing Canvas design approval remains in force; any material UI change requires the normal design gate before UI source work.

## Source And Generated Output

Author only `src/extensions/dude/lib/projection.mjs`; test changes belong in `src/extensions/dude/projection.test.mjs` and `src/extensions/dude/work-index.test.mjs`.

Project exactly `.github/extensions/dude/lib/projection.mjs` using the existing `listCoreOutputs` and `writeCoreOutput` helpers from `scripts/build-release.mjs`, which `build-dev.mjs` already uses. Select that one exact output, preflight its destination with the existing safe-path helper, and write no other output. Verify byte equality with source afterward. Do not add a generation script or invoke the whole-tree `buildDev` cleanup in this dirty workspace.

Retain before-images of touched files and the protected `.github/instructions/dude.instructions.md`. The latter intentionally differs from source and must remain byte-identical to its preimage, not be regenerated. Preserve all unrelated changes, including `.dude` backlog/state, Feature 062, the existing Canvas harness edits, and ideas 067/068. No Git, commit, push, release, or cleanup action is part of this plan.

## Focused Regression Matrix

Extend the two current reader suites; name the new boundary tests with the `066 optional-Beads` prefix. Reuse their fixtures and canonical assertions.

| Case | Required observation |
| --- | --- |
| Truly missing executable, valid root, confirmed unused tracking | Exercise source and generated readers with the default process runner, not an injected empty list. Inventory and selected detail show the four-state fixture's exact counts, current coverage, instructions, next task, and blocker without an optional-only warning. |
| Successful empty list and exact no-database response | Both readers preserve existing lifecycle behavior; all-open packages remain definition-only. No-database near-misses, nonempty output, or conflicting tracked evidence remain failures. |
| Actual populated authority | Preserve global precedence for exact matches, absent selected features, all-closed boards, and grouping-only boards. Ready-query failure and unsupported tracked facts expose no live markdown backfill. |
| Authority evidence and uncertainty | Contrast safely absent ordinary/non-Git and resolvable linked-worktree locations with `.beads` footprints, explicit environment overrides, unresolved links/metadata, unsafe roots, and read failures. Only the confirmed absence cases qualify. |
| Other acquisition failures | Permission errors, invalid working roots, thrown/returned non-missing errors, malformed payloads, cancellation, timeout, signals, and oversized output retain bounded typed diagnostics. Do not leak raw errors or absolute paths. |
| Revalidation and previous tracked view | Tracking appearing during an absence-based read, or a tracker disappearing after positive evidence, cannot publish live mirror facts. Freshness reports change/unavailability and failed refresh retains the last complete view. |
| Canonical agreement and read-only behavior | Inventory and selected counts agree on visible units; hidden/generated/history rows stay excluded. Draft/resolved discovery, source-race qualification, and before/after artifact bytes and inventories remain correct. No mutating tracker command runs. |

Run the focused Node selector from the repository root after implementation and bounded projection:

```text
node --test --test-concurrency=1 --test-reporter=tap --test-name-pattern="066 optional-Beads|injected tracked command failures|deadline and cancellation|runtime projection boundary|T011 populated Beads|T003 work index and selected detail" src/extensions/dude/projection.test.mjs src/extensions/dude/work-index.test.mjs
```

For the real missing-executable case, isolate command lookup and inherited authority overrides in a test-owned child using the existing Node executable and a valid disposable workspace. A synthetic `[]` result or a Windows `.cmd` shim is not proof of the default missing-executable path. Keep required cases executable on the current host; report unrelated platform-limited fixtures honestly instead of rebuilding fixture infrastructure or installing tools. Expand within these suites only for an uncovered affected behavior or failure.

Check source/generated equality, the protected override, and unrelated before-images. Run `node --test scripts/current-format-contract.test.mjs` for the bounded docs edit. The coordinator owns publication and `node .github/skills/dude-lint/lint.mjs .`; no execution result is asserted here. Browser/Review/Mac acceptance and native UI approval do not verify this backend-only restoration and are not added to this task.

## Guardrail Check And Delivery

Existing substantive project and bundle guardrails apply unchanged; no new candidates or memory writes are needed. The work stays read-only at runtime, preserves tracked authority, keeps core independent of packs, and uses existing parsers and generation helpers.

One phase and one task, `T001@c066b7a1`, deliver US1 and FR-001 through FR-008 with SC-001 through SC-004. The code, directly related tests, docs note, and bounded projection prove one outcome; no setup, mockup, or polish task is warranted. Independent verification and review remain with their existing owners.

The main implementation risks are confusing executable absence with a bad root or external configuration, admitting a mirror after tracked authority disappears, and overwriting the protected generated override. The regression matrix and bounded projection address those risks without adding a new workflow or persistent state.
