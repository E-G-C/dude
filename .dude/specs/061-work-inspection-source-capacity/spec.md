# Feature Specification: Work Inspection Source Capacity

**Owner:** `.dude/ideas/061-work-inspection-source-capacity.md`  
**Date basis:** 2026-09-15T10:09:21Z

## Purpose And Scope

Repair Work's inspection capacity accounting so ordinary inventory growth does not displace the evidence needed to finish a task. The coordinator reproduced the current failure with 63 direct ideas before execution, and previously with 60 ideas when valid verification and review arrived after implementation.

The user explicitly requested definition and normal Lightweight repair of 061 before implementing 062. This prerequisite is user-directed, not inferred from lifecycle numbering. This package covers runtime accounting, admission, bounded diagnostics, regressions, and directly related guidance. It does not authorize another invocation of the stopped Work run.

## User Scenarios & Testing

### US1 - Inspect a growing canonical workspace (P1)

A maintainer can inspect an exactly owned task without unrelated ideas consuming completion-evidence slots.

Independent test: inspect inventories of 60, 63, and 999 small canonical ideas with otherwise admissible evidence. Verify complete owner discovery, including a duplicate owner discovered late in the inventory.

Acceptance: a valid inventory produces one owner-log evidence item regardless of inventory size; a late duplicate still blocks; the first directory entry beyond the inventory bound refuses before any candidate body is read.

### US2 - Check completion capacity before spending an attempt (P1)

A Work user is not admitted to expensive execution when the known evidence entries required by that attempt's completion cannot fit.

Independent test: compare admission immediately at and beyond each applicable entry threshold, including initially empty streams and retained evidence from prior attempts.

Acceptance: admission accounts for the active policy, action, and current completion path before counters or dispatch change. Existing results do not substitute for a new attempt's required results. Optional, unavailable session history does not become mandatory.

### US3 - Understand a capacity refusal (P2)

An operator can identify the exhausted budget, affected source or canonical target, and safe next action without reading internal exceptions.

Independent test: provoke each supported capacity refusal through direct inspection, the CLI, and the host boundary. Compare output fields and predecessor state.

Acceptance: diagnostics contain bounded, runtime-established facts rather than evidence bodies or arbitrary exception text. A refusal preserves accepted state and makes no task write.

## Functional Requirements

- **FR-001:** Complete exact-owner inventory acquisition has its own ceiling of 999 direct entries, matching the canonical lifecycle's natural maximum. Every direct child counts, including unsupported files, directories, and symlinks. Entry 1,000 refuses before candidate body acquisition; no filtering, early-owner shortcut, or unbounded scan is permitted.
- **FR-002:** Retain the 64-source-entry ceiling independently. Charge one owner source, the task and lane sources, the autonomous definition-plan source when applicable, each existing tracked-issue acquisition, each supplied capture entry, and an optional supplied session. Count captures before normalization or deduplication. Inventory bodies remain fully acquired and byte-charged.
- **FR-003:** Before authorization changes attempt state or permits implementation dispatch, verify entry headroom for the next mandatory completion captures and their retained evidence. Account for empty placeholders accurately at descriptor and model-item boundaries. Use only existing policy, action, and production completion behavior; add no reservation state or caller control.
- **FR-004:** Keep the existing ceilings: 1,048,576 bytes per acquired body; 4,194,304 aggregate decoded bytes; 6,291,456 encoded CLI-request bytes; 64 retained descriptors; 16 model-packet items and 131,072 canonical packet bytes; and 8,192 bytes per error response. Exact limits pass that budget check; the first excess refuses. Admission guarantees entry headroom, not unknown future body sizes; fresh acquisition rechecks byte limits.
- **FR-005:** Malformed, duplicate, missing, unreadable, symlinked, conflicting, and raced ownership/evidence paths retain their fail-closed behavior. Keep complete exact-owner discovery and the separate complete-log-bound suffix projection. Do not drop required evidence, combine specialist results, or raise the 16-check attestation ceiling.
- **FR-006:** Acquisition and admission capacity refusals identify the budget, fixed limit, required amount, relevant safe source/target, and an owner-directed correction before fresh inspection. Preserve sanitization and unknown-failure hard stops. Do not fabricate an Inspection or evidence hash when acquisition failed. Existing descriptor-only packet overflow still makes no model call.
- **FR-007:** A capacity refusal leaves RunState bytes, accepted revision, attempt/recovery counters, pending entries, and completed tuples unchanged and performs no task or lane write. It grants no retry, cleanup, claim takeover, learning resolution, or close authority.
- **FR-008:** Preserve verification, independent review, ownership, learning, recovery, capture, and approval gates. Actual 062 is a read-only inspection case; its frozen mock and approval/contrast issue, 063 Settings, and 060/056 remain outside this repair.

## Key Entities

- Inventory: all direct idea entries acquired to establish complete exact ownership.
- Evidence source: one charged acquisition unit, distinct from normalized descriptors and model items.
- Capacity refusal: a bounded observation of a fixed budget failure, not execution authority or durable state.

## Success Criteria

- **SC-001:** The historical 60-idea plus verification/review case and the actual 63-idea workspace's exact 062 T001 inspection no longer fail solely from inventory consuming source slots. Read-only cases include valid current-run, verification, review, lint, and session streams without claiming those fixtures are real 062 completion evidence.
- **SC-002:** Exact inventory, source-entry, descriptor, and model-item boundaries and boundary-plus-one produce the specified admission/refusal shapes. Mixed and unsupported-only over-limit directories stop before bodies; a late duplicate among many small canonical ideas is still detected.
- **SC-003:** Individual, aggregate, transport, and packet byte-boundary regressions retain their limits, precedence, bounded reads, and fail-closed behavior under both policies and direct/CLI acquisition.
- **SC-004:** Pre-execution headroom refusal occurs before any attempt charge, pending authorization, or implementation dispatch. New results alongside prior retained results are counted; optional session absence is nonblocking.
- **SC-005:** CLI and host diagnostics expose the correct bounded capacity facts, reject forged diagnostic lookalikes, and retain unknown-failure sanitization. Refusal-state and task preimages compare byte-for-byte.
- **SC-006:** A disposable realistic workspace completes a valid task through the production capture, projection, settlement, and receipt path with fresh verification and independent review. Source tests, directly related docs, and verified generated core outputs agree; unrelated workspace edits remain unchanged.

## Assumptions And Exclusions

The coordinator supplied the fresh reproduction and clean canonical selection; they were not executed during definition. Technical accounting and reporting choices belong to the plan, not invented answers in the idea. Existing guardrails suffice. There is no rendered UI change or design gate for 061, no new command/configuration, no objective execution, and no new state version, scheduler, registry, or supporting schema.
