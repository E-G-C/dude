# Implementation Plan: Unattended Work Continuity

## Summary

Tighten the `dude-work` runtime and its detailed prompt so that, under an explicit unattended policy, the loop keeps working through ready work and ends only on a condition from the existing closed stop set; every halt echoes exactly one named reason from that set (making an unnameable halt structurally impossible); every halt also carries actionable cause detail — affected target, specific subject or condition, and next owner action — sufficient to act without reading the runtime's internals; progress reporting is decoupled from stopping; and no safety floor, hard stop, verification gate, or independent review is weakened or reclassified.

The change stays inside the existing recovery runtime (`src/skills/dude-work/recovery.mjs`) and its single detailed prompt owner (`src/skills/dude-work/SKILL.md`). It adds no optimizer, lane, board, command, persistent store, or new stop reason. It reuses the existing stop-detection, report, and evidence surfaces; the "named halt" and "actionable halt detail" are structural attributes attached to the existing stop path, and "progress report" is an existing report-surface concept made explicitly non-terminal.

This feature has no measurable runtime optimization objective bound to a durable task. This plan therefore contains **zero active ObjectiveRegistry regions**.

The audit-trail continuity outcome and the round-trip invariant are owned by defined Feature 010 (`.dude/specs/010-core-autonomous-event-round-trip/spec.md`); this plan adds no overlapping guard and does not touch that scope.

## Technical Context

**Language/Version**: Node.js >= 20, dependency-free ESM with `// @ts-check`
**Primary Dependencies**: the existing `dude-work` recovery runtime (`src/skills/dude-work/recovery.mjs`); its `RunState`, Inspection, stop-detection, and report surfaces; the settled closed stop set from Feature 005 and Feature 009; the active Lightweight or tracked lane owner
**Storage**: no new durable store; existing transient run state plus existing current-run and lane-history surfaces only
**Testing**: `node:test` table fixtures in `src/skills/dude-work/recovery.test.mjs`; prompt and current-format contract fixtures (`scripts/current-format-contract.test.mjs`); build projection tests; full discovered suite; independent Tester and Code Reviewer evidence
**Target Platform**: cross-platform local Dude workspaces using Lightweight or optional Beads-tracked execution
**Project Type**: reusable coordination workflow with a deterministic runtime and one detailed Work prompt owner
**Performance Goals**: no new resource ceilings; the named-reason and actionable-detail attributes are bounded, constant-size additions to the existing halt path
**Constraints**: reclassify no stop; introduce no new stop reason, lane, board, command, or store; deterministic runtime owns stop detection, named-reason attribution, and the fail-closed decision; guarded and non-unattended behavior byte-for-byte unchanged; do not touch Feature 005, 009, or 010 packages

## Spec Quality Validation

- The specification stays technology-neutral and defines five independently testable P1 stories.
- FR-001 through FR-010 preserve keep-working continuity, decoupled reporting, mandatory named-reason echo, no new stop reason, actionable halt detail, fail-closed on missing detail, no reclassification, verification/review as non-approval, no new surface, and the deterministic/model boundary.
- SC-001 through SC-007 measure continuation-on-report, named-reason echo, actionable detail with fail-closed, non-terminal progress reporting, safety-floor preservation, unchanged guarded behavior, and no new surface.
- Edge cases cover report-vs-stop coincidence, opaque named halts, missing closed-set reason, missing actionable detail, safety-floor coincidence, Feature 009 closed-set extension, and unchanged guarded behavior.
- The specification contains no implementation field names, storage formats, source paths, or `[NEEDS CLARIFICATION]` markers.

The specification passed its definition quality gate before this plan was written. This statement is not a lint or readiness claim; coordinator lint remains pending.

## Guardrail Check

- Reuse the existing `dude-work` stop, report, and evidence surfaces instead of adding a parallel path, ledger, or store.
- Keep stop detection, named-reason attribution, closed-set membership checks, and the fail-closed decision deterministic; reserve model reasoning for composing the actionable cause narrative from existing evidence, which remains non-authoritative.
- Keep `src/` authoritative and `src/skills/dude-work/SKILL.md` the single detailed runtime prompt owner; rebuild generated core with `node scripts/build-dev.mjs` and never hand-edit `.github/` core files.
- Choose the smallest design with a concrete failure test: attach two structural attributes (named reason, actionable detail) to the existing halt path and make progress reporting explicitly non-terminal — no new module, lane, board, command, store, or stop reason.
- Avoid duplicating a defined owner: the continuity and round-trip-invariant outcomes stay owned by Feature 010.

No new durable guardrail is proposed. Existing determinism, smallest-design, authority, no-second-ledger, and concise-instruction guardrails fully cover this tightening.

## Architecture

### 1. Named, closed-set halt attribution

Every unattended loop-end path in `recovery.mjs` resolves to exactly one reason from the existing closed stop set (the `dude-work` Stops list plus the Feature 009 additions). The runtime attaches that named reason structurally to the halt so a halt cannot be produced without one; a turn-end that carries no closed-set reason is not a halt and does not end the loop. No new stop reason is introduced.

### 2. Actionable halt detail

Alongside the named reason, the halt path carries the affected target, the specific subject or condition that caused the stop, and the next owner action, composed from existing Inspection and evidence surfaces. Model reasoning may phrase the narrative, but the runtime owns the fields and fails closed when actionable detail cannot be established rather than emitting a named-but-opaque halt.

### 3. Reporting decoupled from stopping

Progress reporting uses the existing report surface but is explicitly non-terminal: surfacing a milestone consumes no stop reason and leaves the loop free to continue to ready work. Only a closed-set stop condition ends the loop.

### 4. Preserved safety floor and gates

The safety-floor categories, every hard stop, verification, and independent review keep their exact existing behavior and precedence; none is reclassified to continuable, and a failed verification or reviewer rejection is never approval. Default and explicit `guarded` runs never enter the unattended discipline and stay byte-for-byte unchanged.

### 5. Prompt and generated-core parity

`src/skills/dude-work/SKILL.md` remains the single detailed owner of the tightened Stops discipline; other prompt surfaces carry only terse pointers. `docs/` references and `scripts/current-format-contract.test.mjs` stay in exact parity, and generated core is rebuilt from `src/` without hand-editing `.github/`.

## Supporting Artifacts

Lean by default. Only `spec.md`, `plan.md`, and `tasks.md` apply. No `data-model.md`, `contracts/`, `research.md`, `quickstart.md`, or checklist artifacts are created: this feature adds no new schema, entity store, or external research surface — the named-reason and actionable-detail attributes ride the existing `dude-work` stop and evidence structures, which their owning runtime and prompt already document.

## Complexity Tracking

No complexity deviations. The design attaches two bounded structural attributes to the existing halt path and marks progress reporting non-terminal, with no new module, lane, board, command, store, or stop reason.

## Phases

- **Phase 1 — Continuity discipline**: inverted default in the runtime — only a closed-set stop ends the loop; a progress report is never a stop (T001).
- **Phase 2 — Halt observability**: mandatory named-reason echo plus actionable halt detail, with fail-closed on missing detail; unnameable halt structurally impossible (T002).
- **Phase 3 — Safety preservation**: prove no safety-floor category, hard stop, verification, or review is reclassified or weakened (T003).
- **Phase 4 — Docs and parity**: update docs, prompt-contract parity, and rebuild generated core (T004).
- **Phase 5 — Verification and review**: full verification and independent review over the complete contract (T005).
