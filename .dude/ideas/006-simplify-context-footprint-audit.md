---
title: Simplify Context Footprint Audit
slug: simplify-context-footprint-audit
status: defined
spec_path: .dude/specs/006-simplify-context-footprint-audit/spec.md
---

# Idea: Simplify Context Footprint Audit

## Idea

Retire, rather than simplify, the context-footprint audit unless it has a named consumer, a defined trigger and failure threshold, and a required corrective action. Today the six profiles do not serve an operational purpose, so remove all six. If no one uses the active context-footprint system, remove it completely: the audit runtime and wrapper, profile manifest, the authoring pack's prompt-audit skill plus its installation and manifest entries, audit-specific tests and contracts, current active references, `docs/context-footprint.md`, and every context-footprint snapshot.

Do not create a permanent historical note or replacement document merely for archaeology. Git history and the eventual removal commit or PR explanation are enough. Add release notes only if removal affects a user-invocable shipped surface. Do not replace the audit with another metric, budget, report, cache, profile system, ledger, CI gate, or state artifact.

Preserve independent build source/generated parity, compose source/installed verification, lint, behavior tests, and release validation because each already has consumers, defined failure behavior, and corrective actions. Remove duplicate parity logic that exists only inside the retired audit. Existing Dude workflow history, including append-only Coordinator Log entries, and Git history remain historical records rather than active replacement context-footprint artifacts; do not rewrite them.

The governing principle is that a maintained check or artifact must have a named consumer, a defined trigger or failure condition, and an expected action; otherwise remove it. Static size did not measure runtime context, token usage, latency, cost, or quality. This is brainstorm only; no implementation starts.

## Assumptions

- Later definition can inventory the current repository to confirm any named consumers, triggers, failure thresholds, required actions, and user-invocable shipped surfaces; file-by-file inventory details do not block this brainstorm.
- An artifact or reference is audit-specific only when its active purpose depends on the context-footprint audit. Shared validation remains independent unless definition evidence shows otherwise.
- Existing append-only Dude workflow history and Git history remain untouched historical records and require no replacement context-footprint artifact.

<!-- dude:managed:start -->
## Normalized Intent

### Retire Active Audit-Specific Artifacts

- Apply one operational-purpose test: a maintained check or artifact needs a named consumer, a defined trigger or failure condition, and an expected action; otherwise remove it.
- Remove all six context-footprint profiles because they have no operational purpose today.
- If current inventory confirms no operational use, remove the active context-footprint system completely: its runtime and wrapper, profile manifest, authoring-pack prompt-audit skill and installation or manifest entries, audit-specific tests and contracts, current active references, documentation, and snapshots.

### Preserve Independent Validation

- Preserve build source/generated parity, compose source/installed verification, lint, behavior tests, and release validation because they have independent consumers, failure behavior, and corrective actions.
- Remove duplicate parity logic owned only by the retired audit; do not classify independent validation as audit infrastructure merely because the audit also checked it.

### Preserve History Without A Replacement

- Leave existing append-only Dude workflow history and Git history intact as historical records, without treating either as an active context-footprint artifact or rewriting prior Coordinator Log entries.
- Rely on Git history and the eventual removal commit or PR explanation; create no permanent archaeology note or replacement document.
- Add release notes only if definition confirms that removal affects a user-invocable shipped surface.
- Make no claim that static size measured runtime context, token usage, latency, cost, or quality.

## Constraints

- Do not replace the audit with another metric, budget, report, cache, profile system, ledger, CI gate, or state artifact.
- Keep deletion limited to active audit-specific artifacts and duplicate audit-owned checks; preserve independently justified validation.
- Keep this as brainstorm intake only. Do not create a definition package or begin implementation.

## Definition Checklist

- [x] Outcome is clear enough for brainstorm
- [x] Scope is coherent as one idea ledger
- [x] Open questions are resolved or consciously assumed

## Coordinator Log

- 2026-07-22 UTC - brainstorm captured
- 2026-07-22 UTC - defined -> .dude/specs/006-simplify-context-footprint-audit/spec.md
- 2026-07-22 UTC - definition-review rejected: accepted gaps in filtered compose verification, complete rollback snapshot coverage, release-handoff acceptance boundaries, and execution-safe history preservation
- 2026-07-22 UTC - definition-revised -> .dude/specs/006-simplify-context-footprint-audit/spec.md
- 2026-07-22 UTC - execution reconciliation applied: dropped four open unexecuted units, added open T005@4f8a2c71 and T006@b3d9e560, and transferred no task state, archive, discovered work, board, or execution history
- 2026-07-22 UTC - Work iteration 1 claimed T005@4f8a2c71 under autonomous policy; pre-start Inspection af0a09b88780ac1b8547c01710f701ff04e3504c74ad798c869546cf858b2887 had no blockers and no ObjectiveRegistry entry
- 2026-07-22 UTC - Work iteration 1 closed T005@4f8a2c71: reduced authoring installed with eight artifacts; focused checks passed 67/67 and lint 0/0; Tester PASS and Code Reviewer APPROVE; retained 13-file recovery snapshot fc68d11059c9cfca911cc2af874b1bcb407e18708263a8dd6635b08109b9ad43 for T006
- 2026-07-22 UTC - Work iteration 2 claimed T006@b3d9e560 under autonomous policy; pre-start Inspection 6acb2b745655480f0e90459676082d3cb843c8bb1c642bb69a5ac983fcd5ae75 confirmed T005 done, the recovery snapshot retained, no blockers, and no ObjectiveRegistry entry
- 2026-07-22 UTC - Work iteration 2 recovery cycle 1 authorized after Tester verification failure: post-failure Inspection 6e89e1c8b30924dfdbe6aa9ae3642b821a19c8e05e490d5a5db7ebba87059c4a classified `.dude/ideas/technical-docs-pack-remediation.md` as a post-baseline concurrent addition to preserve; retry is limited to baseline-member comparison plus fresh lint and verification, with no concurrent-ledger mutation
- 2026-07-22 UTC - Work iteration 2 recovery cycle 1 verified: all 47 frozen members and 28 unrelated baseline files remained unchanged; the concurrent technical-docs ledger remained byte-untouched; focused recovery checks passed 16/16 and lint 0/0; full acceptance evidence remained green with 1,252/1,256 tests passing and four platform skips
- 2026-07-22 UTC - Work iteration 2 closed T006@b3d9e560: focused 71/71 and full 1,252/1,256 tests passed with four platform skips; filtered verification passed all 15 packs with zero failures or leftovers; pristine release lint and active-reference checks passed; Code Reviewer APPROVE; verified 13-file recovery snapshot fc68d11059c9cfca911cc2af874b1bcb407e18708263a8dd6635b08109b9ad43 was removed and confirmed absent
- 2026-07-22 UTC - T006@b3d9e560 close gate reopened: final filesystem verification found the retired `docs/context-footprint-snapshots/` directory empty but still present; task returned to in progress for directory cleanup and fresh verification
- 2026-07-22 UTC - T006@b3d9e560 corrected close: removed only the verified-empty retired snapshot directory with non-recursive `rmdir`; filesystem retirement surface and active-reference scans passed with zero matches; exact owner, lint 0/0, reduced authoring, concurrent-ledger preservation, snapshot absence, and diff checks all revalidated
<!-- dude:managed:end -->
