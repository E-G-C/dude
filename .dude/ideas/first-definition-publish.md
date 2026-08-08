---
title: First-Definition Publish
slug: first-definition-publish
status: defined
spec_path: .dude/specs/023-first-definition-publish/spec.md
---

# Idea: First-Definition Publish

## Idea

Ship a small fix for the first-definition bootstrap gap.

Today, the Spec Lead can stage a complete first definition but cannot create the missing package parent. Prior raw chat/`awk` extraction was unsupported byte transport rather than an atomic transaction.

Add one thin coordinator-owned first-definition publish path that reuses the existing `applyAtomicFileBatch` primitive.

The transaction covers only the selected draft idea owner transition plus the lean package core trio: `spec.md`, `plan.md`, and `tasks.md`.

It must:

- Safely create missing parent directories.
- Require expected missing state for new package files.
- Apply exact staged bytes.
- Run lint inside the rollback boundary.
- Restore all pre-write bytes and remove newly created paths on failure.

Do not add a new transaction engine, manifest, receipt, registry, hash ledger, persistent stage, workflow state, or general-purpose publishing framework. Do not support redefinition, arbitrary supporting-artifact batches, or tracked execution in this fix.

Governing rule: `No current production caller, no capability. Delete it rather than harden it for hypothetical use.` Follow YAGNI and keep the design as small as possible.

## Open Questions

No open questions remain.

## Assumptions

No additional assumptions have been provided.

<!-- dude:managed:start -->
## Normalized Intent

- Close the first-definition bootstrap gap with one thin coordinator-owned publish path that reuses `applyAtomicFileBatch`.
- Atomically transition the selected draft idea owner and create only `spec.md`, `plan.md`, and `tasks.md`.
- Create missing parents safely, enforce expected-missing package files, apply exact staged bytes, and keep lint within the rollback boundary.
- Restore every pre-write byte and remove every newly created path if publishing or lint fails.

## Constraints

- Keep this as brainstorm intake only; create no `.dude/specs/` content and mutate no execution state.
- Add no transaction engine, manifest, receipt, registry, hash ledger, persistent stage, workflow state, or general-purpose publishing framework.
- Support only first definition; exclude redefinition, arbitrary supporting-artifact batches, and tracked execution.
- Follow YAGNI: no capability without a current production caller.

## Definition Checklist

- [x] Outcome is clear enough for brainstorm
- [x] Scope is coherent as one idea ledger
- [x] Open questions are resolved or consciously assumed

## Coordinator Log

- 2026-08-07 UTC - brainstorm captured
- 2026-08-07 UTC - defined as feature 023 (via ship)
- 2026-08-07 UTC - work(023): claimed T001 [~]
- 2026-08-07 UTC - work(023): closed T001 [x] (fixed publisher + 18 focused CLI cases; Code Reviewer finding resolved)
- 2026-08-07 UTC - work(023): claimed T002 [~]
- 2026-08-07 UTC - work(023): closed T002 [x] (procedure + section contract + generated projection; 108 focused/integration tests, parity 2/2)
- 2026-08-07 UTC - work(023): claimed T003 [~] (acceptance)
- 2026-08-07 UTC - work(023): closed T003 [x] (full suite 2283/0, lint 0/0, 16-pack verify, pristine release lint; Reviewer APPROVE)
- 2026-08-07 UTC - ship(023): all tasks complete; natural stop: no ready task
<!-- dude:managed:end -->
