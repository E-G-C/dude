---
title: Runner Reason-Code And Coverage Fix
slug: runner-reason-code-coverage-fix
status: defined
spec_path: .dude/specs/022-runner-reason-code-coverage-fix/spec.md
---

# Idea: Runner Reason-Code And Coverage Fix

## Idea

A small, bounded follow-up fix for the unattended-runner attribution and coverage defects:

- Restrict exchange failures to runner-owned reason codes.
- Include `target` in the fallback shape.
- Add an arbitrary-`error.code` regression test.
- Add a runner integration test from the actual safety writer. If it is unreachable, document the boundary instead of fabricating a fixture.

This was split out of the `topology-first-enforcement-reset` idea because issue E-G-C/dude#3 marks it a Non-Goal for that feature.

## Open Questions

No open questions remain.

## Assumptions

- No rollback is needed.
- No Feature 013 reopening is needed.
- The no-shell lesson already exists; do not duplicate it.

<!-- dude:managed:start -->
## Normalized Intent

- A small follow-up fix restricting exchange failures to runner-owned reason codes.
- Add `target` to the fallback shape.
- Add an arbitrary-`error.code` regression test.
- Add a runner integration test from the actual safety writer, with a documented-boundary fallback when it is unreachable.

## Constraints

- Keep this as brainstorm intake only; do not create a definition package or begin implementation.
- Keep the change small and bounded.
- No rollback.
- No Feature 013 reopening.
- Do not duplicate the existing no-shell lesson.

## Definition Checklist

- [x] Outcome is clear enough for brainstorm
- [x] Scope is coherent as one idea ledger
- [x] Open questions are resolved or consciously assumed

## Coordinator Log

- 2026-08-06 UTC - brainstorm captured (split from topology-first-enforcement-reset per issue E-G-C/dude#3)
- 2026-08-06 UTC - defined as feature 022 (via ship)
- 2026-08-06 UTC - work(022): claimed T001 [~]
- 2026-08-06 UTC - work(022): closed T001 [x] + T002 [x] (allow-list + target-on-fallback; regression + integration tests; full suite 2265/0, runner parity, both mutations bite)
- 2026-08-06 UTC - work(022): claimed T003 [~] (acceptance)
- 2026-08-06 UTC - work(022): closed T003 [x] — acceptance: suite 2265/0, lint 0/0, no new artifact, halt-report contract unchanged; Reviewer APPROVE
- 2026-08-06 UTC - ship(022): all tasks complete; natural stop: no ready task
<!-- dude:managed:end -->
