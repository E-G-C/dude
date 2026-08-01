---
title: Simplify Work Command
slug: simplify-work-command
status: defined
spec_path: .dude/specs/016-simplify-work-command/spec.md
---

# Idea: Simplify Work Command

## Idea

Simplify `@dude work` so users have one obvious, predictable mental model and do not face controls that appear to do something but do not. `@dude work` remains sequential: it continues ready work one task at a time.

Remove `--parallel` completely from the current command grammar, parser/runtime contract, instructions, tests, examples, and documentation. Do not provide backward compatibility, deprecation behavior, warnings, aliases, hidden acceptance, migration, or any other legacy-support path. Remove dead no-op parallel compatibility state or validation where it exists, but do not turn this feature into a broad runtime refactor.

Keep safe generic parallel dispatch as an internal coordinator capability outside `@dude work`; users should not need to configure concurrency. Keep `[P]` only where it remains useful as planning, import, or dependency metadata and as a candidate signal for internal safe fan-out. Correct language that calls `[P]` inherently `parallel-safe` or implies that it alone authorizes concurrency.

Correct all affected user-facing documentation and reference material. Lead with the simple forms `@dude work` and `@dude work <feature>`, while keeping genuinely useful advanced controls in the detailed reference without burdening the primary path.

Choose simplification over complication and avoid user friction. Do not build parallel Work, concurrent recovery, queues, locks, a scheduler, new state, a new command, or a new concurrency setting.

## Open Questions

No open questions remain.

## Assumptions

No additional assumptions are needed.

<!-- dude:managed:start -->
## Normalized Intent

### Keep One Sequential Work Model

- Keep `@dude work` sequential, continuing ready work one task at a time.
- Give users one obvious, predictable mental model without controls that appear functional but are not.
- Present `@dude work` and `@dude work <feature>` as the primary forms; reserve genuinely useful advanced controls for the detailed reference.

### Remove The Parallel Work Surface

- Remove `--parallel` completely from the current command grammar, parser/runtime contract, instructions, tests, examples, documentation, and reference material.
- Provide no backward compatibility, deprecation behavior, warning, alias, hidden acceptance, migration, or other legacy-support path for `--parallel`.
- Remove dead no-op parallel compatibility state and validation where found, without broadening the work into a general runtime refactor.

### Preserve Internal Safe Dispatch

- Keep safe generic parallel dispatch as an internal coordinator capability outside `@dude work`; do not make users configure concurrency.
- Retain `[P]` only where useful as planning, import, or dependency metadata and as a candidate signal for internal safe fan-out.
- Correct wording that describes `[P]` as inherently `parallel-safe` or treats it alone as authorization for concurrency.

## Constraints

- Prefer simplification and low user friction over added compatibility or control surfaces.
- Do not build parallel Work, concurrent recovery, queues, locks, a scheduler, new state, a new command, or a new concurrency setting.
- Keep the change bounded to removal of the `--parallel` surface, directly related dead compatibility state or validation, retained internal dispatch semantics, and affected guidance.
- Keep this as brainstorm intake only. Do not create a definition package or begin implementation.

## Definition Checklist

- [x] Outcome is clear enough for brainstorm
- [x] Scope is coherent as one idea ledger
- [x] Open questions are resolved or consciously assumed

## Coordinator Log

- 2026-07-31 UTC - brainstorm captured
- 2026-07-31 UTC - defined as Feature 016; spec_path `.dude/specs/016-simplify-work-command/spec.md`. Staged a lean three-file package with three all-open canonical tasks in linear dependency order: T001@726d6f76, T002@67756964, and T003@61636370. No active ObjectiveRegistry region and no new project-specific guardrail candidate.
- 2026-07-31 UTC - definition review revision: corrected SC-001 so zero-ready fixtures permit zero activity while every active Work fixture remains strictly one-task-at-a-time.
- 2026-07-31 UTC - automatic unchanged-intent definition repair: restored the owner ledger terminal LF required by append-only Work logging; spec, plan, tasks, and user intent remained unchanged.
- 2026-07-31 UTC - execution reconciliation after automatic definition repair: kept T001@726d6f76, T002@67756964, and T003@61636370 one-to-one with no task-state or metadata change.
<!-- dude:managed:end -->
- 2026-07-31 UTC - Work iteration 1/3 started T001@726d6f76: remove the no-op Work parallel option and dead policy field.
- 2026-07-31 UTC - T001@726d6f76 closed: removed the Work `--parallel` option and dead policy field; fresh focused verification passed 639/639 and independent Code Reviewer approved.
- 2026-07-31 UTC - Work iteration 2/3 started T002@67756964: simplify Work authority and documentation, correct `[P]` wording, and validate generated/pack parity.
- 2026-08-01 UTC - T002@67756964 closed: simplified Work authority and docs, corrected `[P]` candidate wording, passed 91/91 contract/build tests, verified all 16 packs with zero failures or leftovers, and independent Code Reviewer approved after revision.
- 2026-08-01 UTC - Work iteration 3/3 started T003@61636370: run final Feature 016 acceptance without further implementation unless a concrete defect is found.
- 2026-08-01 UTC - T003@61636370 closed: final acceptance passed 2,042/2,046 tests with 4 capability skips and 0 failures; lint 0/0, all 16 packs verified with zero failures or leftovers, pristine release lint passed, and independent Code Reviewer approved with no findings.
