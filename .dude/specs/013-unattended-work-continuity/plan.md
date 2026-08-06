# Implementation Plan: Unattended Work Continuity

## Summary

Under an explicit unattended policy, the loop keeps working through ready work and ends only on a genuine stop; every halt carries a report that either resolves to exactly one named reason from the existing closed stop set with actionable cause detail — affected target, specific subject or condition, and next owner action — or is explicitly unresolved, naming the fields that could not be established and presenting no reason outside the closed set; progress reporting is decoupled from stopping; and no safety floor, hard stop, verification gate, or independent review is weakened or reclassified.

The enforcement locus is the deterministic autonomous runner `src/skills/dude-work/host-adapter-runner.mjs` at its single terminal chokepoint `finish(row)`. The runner is the only production driver of the host adapter and the model submits no protocol operations, so continuation is decided by the deterministic runner, not the model. The change attaches one bounded terminal field, `haltReport`, at `finish(row)`: on `row.outcome === 'hard-stop'` it is the report `describeUnattendedHalt(...)` returns; on `row.outcome === 'ended'` it is `null`. The two primitives this reuses — `endsUnattendedLoop` and `describeUnattendedHalt`, already landed in `src/skills/dude-work/recovery.mjs` (+190 lines) — are reused unchanged. It adds no optimizer, lane, board, command, persistent store, or new stop reason.

This feature has no measurable runtime optimization objective bound to a durable task. This plan therefore contains **zero active ObjectiveRegistry regions**.

The audit-trail continuity outcome and the round-trip invariant are owned by defined Feature 010 (`.dude/specs/010-core-autonomous-event-round-trip/spec.md`); this plan adds no overlapping guard and does not touch that scope.

## Technical Context

**Language/Version**: Node.js >= 20, dependency-free ESM with `// @ts-check`
**Primary Dependencies**: the landed `dude-work` recovery primitives `endsUnattendedLoop` and `describeUnattendedHalt` (`src/skills/dude-work/recovery.mjs`), with `OUTCOME_REASON_CLASSES`, `HALT_NEXT_ACTIONS`, and `HALT_STATE_CONDITIONS`; the deterministic autonomous runner `src/skills/dude-work/host-adapter-runner.mjs` and its single terminal chokepoint `finish(row)`; the settled closed stop set from Feature 005 and Feature 009
**Storage**: no new durable store; existing transient run state plus existing current-run and lane-history surfaces only
**Testing**: `node:test` table fixtures in `src/skills/dude-work/host-adapter.test.mjs` and `src/skills/dude-work/recovery.test.mjs`; prompt and current-format contract fixtures (`scripts/current-format-contract.test.mjs`); build projection tests (`scripts/build-dev.test.mjs`, `scripts/build-release.test.mjs`); the full discovered suite; independent Tester and Code Reviewer evidence
**Target Platform**: cross-platform local Dude workspaces using Lightweight or optional Beads-tracked execution
**Project Type**: reusable coordination workflow with a deterministic runtime and one detailed Work prompt owner
**Performance Goals**: no new resource ceilings; `haltReport` is a bounded, constant-size terminal field attached once at the chokepoint
**Constraints**: reclassify no stop; introduce no new stop reason, lane, board, command, or store; the deterministic runner owns stop detection, named-reason attribution, and the resolved-versus-unresolved decision; guarded and non-unattended behavior byte-for-byte unchanged (the runner is autonomous-only); reuse the landed primitives unchanged; honor the purity guard at `src/skills/dude-work/recovery.test.mjs:26817` (the identifier `describeUnattendedHalt` must occur exactly once inside `recovery.mjs`); do not touch Feature 005, 009, or 010 packages

## Spec Quality Validation

- The specification stays technology-neutral and defines five independently testable P1 stories; it names no runtime file, function, field, or the runner, its chokepoint, or the halt-report field.
- FR-001 through FR-011 preserve keep-working continuity, decoupled reporting, the resolved-or-explicitly-unresolved halt report, no new stop reason with out-of-set dispositions never presented as closed-set reasons, actionable resolved detail, fail-closed on missing reason or detail, no reclassification, verification/review as non-approval, no new surface, the deterministic/model boundary, and the behavior-level guarantee that every unattended work-loop halt carries the report while single-correction incidents and learning-governance settlements keep their routes.
- SC-001 through SC-008 measure continuation-on-report, the resolved-or-unresolved report, actionable detail with fail-closed, non-terminal progress reporting, safety-floor preservation with honest unresolved, unchanged guarded behavior, no new surface, and the behavior-level report over the work loop.
- Edge cases cover report-vs-stop coincidence, opaque named halts, out-of-set dispositions, missing reason or detail, safety-floor coincidence, clean governance-controlled ends, single-correction incidents, Feature 009 closed-set extension, and unchanged guarded behavior.
- The specification contains no implementation field names, storage formats, source paths, or `[NEEDS CLARIFICATION]` markers.

The specification passed its definition quality gate before this plan was written. This statement is not a lint or readiness claim; coordinator lint remains pending.

## Guardrail Check

- Reuse the existing `dude-work` stop, report, and evidence surfaces instead of adding a parallel path, ledger, or store; the report rides the existing terminal row.
- Keep stop detection, named-reason attribution, closed-set membership checks, and the resolved-versus-unresolved decision deterministic in the runner; reserve model reasoning for composing the actionable cause narrative from existing evidence, which remains non-authoritative.
- Keep `src/` authoritative and `src/skills/dude-work/SKILL.md` the single detailed runtime prompt owner; rebuild generated core with `node scripts/build-dev.mjs` and never hand-edit `.github/` core files.
- Choose the smallest design with a concrete failure test: attach one bounded terminal field at one existing chokepoint and reuse two landed primitives unchanged — no new module, lane, board, command, store, or stop reason, and no session gate, per-operation gate, or cross-interaction threading.
- Avoid duplicating a defined owner: the continuity and round-trip-invariant outcomes stay owned by Feature 010.

No new durable guardrail is proposed. Existing determinism, smallest-design, authority, no-second-ledger, and concise-instruction guardrails fully cover this tightening.

## Architecture

### 1. Single deterministic locus at the terminal chokepoint

Every terminal result of an unattended run flows through `finish(row)` in `src/skills/dude-work/host-adapter-runner.mjs`: hard stops via `orphan(...)` and the top-level `catch`, and clean completions via `adapter.end(...)`. Because that chokepoint sees 100% of terminal rows, attaching the halt report there covers 100% of halts with no other insertion point. The runner is the only production driver of the host adapter, and the model submits no protocol operations, so FR-010 is satisfied by construction: the deterministic runner, not the model, establishes the stop, its named-reason attribution, and the resolved-versus-unresolved determination. This resolves the wired-versus-unwired dilemma the prior verification surfaced — wiring here is safe because the establishing actor is deterministic.

### 2. The `haltReport` attachment

In `finish(row)`, when `row.outcome === 'hard-stop'`, attach `haltReport = describeUnattendedHalt({ state: <RunState decoded from row.stateBase64>, reason: row.reason }, currentInspection)`, defensively wrapped so `finish` never throws — any failure yields the fail-closed unresolved report. When `row.outcome === 'ended'` (a task-settled, controlled-end, or cancelled settlement), attach `haltReport: null`. The report is restricted to hard-stop only so benign ended reasons never classify as halts. An out-of-set disposition or diagnostic yields `{halted:true, resolved:false, unresolved:[…]}`; a closed-set stop with a bound blocker or a deterministic probe yields a resolved report with `target`, `subject`, and `nextAction`.

### 3. Reused landed primitives, unchanged

`describeUnattendedHalt` and `endsUnattendedLoop` in `src/skills/dude-work/recovery.mjs` (+190 lines already landed) are reused as-is; this feature adds no line to `recovery.mjs` and does not modify `src/skills/dude-work/host-adapter.mjs`. The purity guard at `src/skills/dude-work/recovery.test.mjs:26817` — which asserts `describeUnattendedHalt` occurs exactly once inside `recovery.mjs` — stays satisfied precisely because the wiring lives in `host-adapter-runner.mjs`; the in-`recovery.mjs` reference count remains 1.

### 4. Preserved safety floor and gates

The safety-floor categories, every hard stop, verification, and independent review keep their exact existing behavior and precedence; none is reclassified to continuable, and a failed verification or reviewer rejection is never approval. A safety/authority stop resolves fully only when the re-derived Inspection carries the matching blocker binding its evidence hash; otherwise it fails closed to an honest unresolved report — but it still halts and still requests human input. Default and explicit `guarded` runs never enter this path: the runner is autonomous-only, so guarded and non-unattended bytes are untouched by construction.

### 5. Prompt, docs, and generated-core parity

`src/skills/dude-work/SKILL.md` `## Stops` remains the single detailed owner of the tightened discipline and now records that it is wired at the runner's terminal chokepoint; other prompt surfaces carry only terse pointers. `docs/` references and `scripts/current-format-contract.test.mjs` stay in exact parity, and generated core is rebuilt from `src/` without hand-editing `.github/`.

### Eliminated vs. Kept

| Considered enforcement point | Disposition | Why |
| --- | --- | --- |
| A per-operation `runOperation` gate | Eliminated | The model submits no protocol operations; there is nothing to gate. |
| A session-level continuation gate | Eliminated | The single terminal chokepoint `finish(row)` already sees every terminal row. |
| Checkpoint / handoff / resume threading | Eliminated | The report is bounded and terminal; no cross-interaction state is needed. |
| A lane permit / apply / receipt disposition chain | Eliminated | The no-progress branch settles via a terminal `controlled-end`; the lane chain is unreachable for halt reporting. |
| "Across subsequent interactions" report threading | Eliminated | The report attaches once, at the terminal row. |
| The `finish(row)` terminal chokepoint attach | Kept | 100% of terminal rows flow through it; hard-stop → report, ended → null. |
| The landed `endsUnattendedLoop` / `describeUnattendedHalt` primitives | Kept (unchanged) | Reused as-is; the +190 lines already landed in `recovery.mjs`. |

### Assumptions and conscious rulings

1. **No-progress lane disposition is out of scope.** The runner's no-progress branch drives a terminal `controlled-end` only; the lane permit/apply/receipt chain is an unreachable branch for halt reporting, and an unreachable guard cannot be honestly covered.
2. **The lane-ledger apply→commit crash window is pre-existing and unowned by 013.** It is recorded as an out-of-scope backlog note, not a requirement.
3. **`ended` outcomes are clean settlements, not halts, and carry `haltReport: null`.** This is not suppression: forcing a no-progress controlled-end to emit a named halt was consciously rejected because it would reclassify a clean governance settlement as a stop.
4. **Some real safety halts report unresolved honestly.** A safety/authority stop resolves fully only when the re-derived Inspection carries the matching blocker binding its evidence hash; otherwise it fails closed to unresolved with the missing fields named. Every safety category still halts and requests human input; unresolved is honest, not a defect.
5. **A future streaming driver would need adapter-level enforcement.** A driver that streams adapter operations with a live model in the loop would require enforcement at the adapter, not just the runner; that is not built now (smallest design). Today's runner is autonomous-only and submits no model operations, so the single terminal chokepoint is sufficient.

## Supporting Artifacts

Lean by default. Only `spec.md`, `plan.md`, and `tasks.md` apply. No `data-model.md`, `contracts/`, `research.md`, `quickstart.md`, or checklist artifacts are created: this feature adds no new schema, entity store, or external research surface — the halt report rides the existing `dude-work` stop and evidence structures, which their owning runtime and prompt already document.

## Complexity Tracking

No complexity deviations. The design attaches one bounded terminal field at a single existing chokepoint and reuses two landed primitives unchanged, with no new module, lane, board, command, store, or stop reason.

## Phases

- **Phase 1 — Continuity discipline**: the loop-continuation predicate keeps working through ready work and ends only on a genuine stop; a progress report is never a stop (T001).
- **Phase 2 — Halt observability**: the deterministic reporter returns a resolved report (named reason plus actionable detail) or an explicitly unresolved report (missing fields named, no out-of-set reason) (T002).
- **Phase 3 — Safety preservation**: prove no safety-floor category, hard stop, verification, or review is reclassified or weakened (T003).
- **Phase 4 — Runner wiring**: attach `haltReport` at the single terminal chokepoint `finish(row)` — hard-stop → report, ended → null — reusing the landed primitives unchanged (T006).
- **Phase 5 — Docs and parity**: document the wired discipline, hold prompt-contract parity, and rebuild generated core (T004).
- **Phase 6 — Verification and review**: full fresh verification and independent review over the reduced surface (T005).
