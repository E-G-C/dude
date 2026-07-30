# Implementation Plan: Autonomous Review Escalation Precedence

## Summary

Correct one under-specified noun so the coordinator's prompt surfaces state a single rule for a repeated review rejection under an explicit `autonomous` policy. Four surfaces carry a deferral to `dude-work` learning governance whose object is "disposition", which reads as the affected target's fate and leaves user escalation looking like a separate surviving obligation. Two surfaces still state the escalation with no autonomous qualifier. The change corrects the deferral object on the four deferral sentences, scopes the two escalation statements so they no longer contradict it, updates the pinned contract strings in lockstep, and rebuilds the generated dev bundle so the corrected text reaches what the runtime loads.

This is a prose-contract correction with no runtime change. No file under `src/skills/dude-work/recovery.mjs` or any other runtime module is touched, no stop is reclassified, and no lane, board, command, store, or stop reason is added. `src/skills/dude-work/SKILL.md` is not edited at all: its `## Autonomous Learning Governance` section already refuses generic escalation while a learning requirement is unresolved, and its own "disposition" vocabulary is correct and must not be disturbed.

This plan contains **zero active ObjectiveRegistry regions**. No measurable runtime optimization objective is bound to any durable task in this feature.

## Technical Context

**Language/Version**: Markdown prompt surfaces under `src/` plus one Node.js >= 20 `node:test` contract suite; no product code changes
**Primary Dependencies**: `src/instructions/dude.instructions.md`, `src/agents/dude.agent.md`, `src/skills/dude-reviewer-protocol/SKILL.md`, `src/skills/dude-receiving-code-review/SKILL.md`; the `T007` and `T008` contract blocks in `scripts/current-format-contract.test.mjs`; `scripts/build-dev.mjs` for the `src/` to `.github/` projection
**Storage**: none; no state, schema, or persistent store is added or changed
**Testing**: `node --test scripts/current-format-contract.test.mjs`; `node --test scripts/build-dev.test.mjs scripts/build-release.test.mjs`; the full discovered suite via `find . -path ./dist -prune -o -name '*.test.mjs' -print0 | xargs -0 node --test`; `node .github/skills/dude-lint/lint.mjs .`; independent Code Reviewer evidence
**Target Platform**: the Dude bundle itself — `src/` is the edit surface and `.github/` is the built, committed dev bundle the coordinator loads
**Project Type**: prompt-contract correction inside the bundle core; no runtime, engine, or pack change
**Performance Goals**: none; the corrected sentences must not grow the instruction surface, and each governance pointer must stay within its existing single-sentence and byte budget
**Constraints**: no runtime code change; no stop reclassification; no new stop reason, lane, board, command, or store; guarded and non-Work behavior byte-for-byte unchanged in meaning; the contract pin mechanism unchanged with only its pinned strings updated; `src/skills/dude-work/SKILL.md` untouched; `.github/` regenerated only through `node scripts/build-dev.mjs` and never hand-edited

## Spec Quality Validation

- The specification stays technology-neutral: it names roles (governing surface, deferral pointer, escalation statement, learning-governance owner, prose-contract pin) and no source paths, file names, or test identifiers.
- Four independently testable stories — three P1 and one P2 — cover non-interruption under autonomous Work, single-rule readability from any surface, no behavior or safety change, and durable enforcement plus runtime reach.
- FR-001 through FR-009 cover ownership of the outcome, the corrected deferral object, cross-surface consistency, term-correction-not-carve-out with budget limits, unchanged guarded and non-Work behavior, no reclassification or new surface, unchanged pin strength in lockstep, untouched governance vocabulary, and runtime parity.
- SC-001 through SC-009 are measurable by inspection and by the existing contract and lint runs.
- Edge cases cover the mid-rejection reader, the surviving-notification misreading, the shared guarded and autonomous surface, pointer count and byte budget pressure, blanket term sweep into correct governance vocabulary, an inert source-only fix, and out-of-lockstep pins.
- The specification carries no implementation detail and no `[NEEDS CLARIFICATION]` markers.

The specification passed its definition quality gate before this plan was written. This statement is not a lint or readiness claim; coordinator lint remains pending.

## Guardrail Check

- Smallest design that satisfies the proven requirement: correct the object of four existing sentences and scope two more. No new rule, section, carve-out sentence, state, schema, or safeguard is introduced, and the concrete failure mode is already documented on the surfaces themselves.
- Model-facing instructions stay concise and non-redundant: the corrected surfaces must not gain sentences, must keep exactly one governance pointer each, and must stay under the existing pointer byte budget.
- Lean by default: only `spec.md`, `plan.md`, and `tasks.md` are created.
- Intent versus implementation stays split: `spec.md` names roles and outcomes, this plan names the exact paths, pins, and budgets.
- `src/` is authoritative and `.github/` is built. Regenerate with `node scripts/build-dev.mjs` and never hand-edit `.github/` core files.
- Deterministic enforcement is preferred over reasoning: the contract test keeps its exact-string pin, which is the only thing making this prose a contract.

No new durable guardrail is proposed. Existing smallest-design, concise-instruction, lean-by-default, spec/plan-separation, and build-dev guardrails fully cover this correction.

## Architecture

### 1. Deferral object correction on four surfaces

Each of these carries exactly one deferral sentence whose object must be widened from the affected target's disposition to explicitly include user escalation and notification:

- `src/instructions/dude.instructions.md` rule 13.
- `src/agents/dude.agent.md` `## Work`.
- `src/skills/dude-reviewer-protocol/SKILL.md`, the line above `## Rejection Procedure`.
- `src/skills/dude-receiving-code-review/SKILL.md`, the line above `## Revision Procedure`.

Each surface keeps its existing guarded and non-Work parity clause, which the contract independently asserts.

### 2. Escalation statements scoped, without a second pointer

Two statements currently direct an unconditional user interruption and must stop contradicting the deferral:

- `src/agents/dude.agent.md` `## Review Rejection`, final sentence.
- `src/skills/dude-reviewer-protocol/SKILL.md` `## Rejection Procedure` step 5.

Hard design constraint: `scripts/current-format-contract.test.mjs` requires **exactly one** sentence matching `learning governance` on each governance pointer surface, and both files are pointer surfaces. Neither corrected escalation statement may use that phrase; each must scope itself by naming the autonomous policy and pointing at the surface's own existing deferral instead. The same test also forbids any detailed governance marker (state field names, phase names, `transition` routes, batch bounds, comparison bases, end-form authority) from appearing on a pointer surface, and forbids the reviewer from regaining autonomous repeat disposition — the corrected text must satisfy all three.

### 3. Pointer count and byte budget

Every governance pointer sentence is capped at 260 bytes. The tightest current pointer is the `dude-receiving-code-review` sentence at roughly 215 bytes, leaving on the order of 40 bytes of headroom; the `dude.agent.md` `## Work` pointer is next tightest. Measure each corrected sentence rather than assuming headroom, and prefer the shortest object that unambiguously includes user escalation.

### 4. Contract pins updated in lockstep, mechanism unchanged

`scripts/current-format-contract.test.mjs` pins these sentences by exact string. The mechanism is deliberately left as-is; only the pinned strings change, in the same commit as the surfaces:

- `T008` block: the `## Review Rejection` needle (line 1335), the full `ruleLine` for that section (line 1337), and the reviewer-protocol `## Rejection Procedure` needle (line 1347).
- `T007` block: the four deferral `ruleLine` entries for the reviewer protocol, receiving-review, `dude.agent.md` `## Work`, and `dude.instructions.md` rule 13 (lines 2680, 2685, 2690, 2695).

Line numbers are current-session observations and must be re-resolved by content before editing.

### 5. Untouched by design

`src/skills/dude-work/SKILL.md` is not edited. Its `## Autonomous Learning Governance` section already states that an unresolved requirement refuses generic escalation alongside no-progress, block, close, and resolving status, and the contract asserts that paragraph. Its uses of "ordinary target disposition" and "the exact target disposition" are governance's own correct vocabulary; a blanket term rename across the repository is explicitly out of scope.

`src/instructions/dude.instructions.md` rule 8 routes rejection to `dude-reviewer-protocol` with no autonomous qualifier. Assess it during implementation and add a pointer only if the corrected reviewer protocol does not already make the autonomous case unambiguous from rule 8's own route; the default is no change, since rule 13 is adjacent and adding text would work against the concise-instruction guardrail.

### 6. Generated dev bundle parity

`scripts/build-dev.mjs` syncs `src/` into `.github/`, and CI runs it and fails if `.github/` would change. A `src/`-only edit is inert at runtime and breaks the drift check, so the rebuild is part of the change set, not a follow-up.

### 7. Documentation

`docs/workflow.md` and `docs/reference.md` already state that a proven repeat seals escalation along with retry, block, close, and no-progress, so they are already consistent with the corrected rule. Verify rather than assume, and change documentation only if that verification finds real drift.

## Supporting Artifacts

Lean by default. Only `spec.md`, `plan.md`, and `tasks.md` apply. No `data-model.md`, `contracts/`, `research.md`, `quickstart.md`, or domain checklist is created: this feature adds no entity, schema, interface, external research surface, or user-facing flow. It rewords sentences that already exist and updates the strings that pin them.

## Complexity Tracking

No complexity deviations. The design changes the object of four sentences, scopes two more, updates seven pinned strings, and rebuilds the generated bundle. Nothing is added.

## Phases

- **Phase 1 — Deferral object**: widen the deferral on all four pointer surfaces to cover user escalation and notification, update the four matching `T007` pins in lockstep, and rebuild `.github/` from `src/` inside the same task (T001).
- **Phase 2 — Escalation consistency**: scope the two unconditional escalation statements so they defer under an explicit autonomous policy without introducing a second governance pointer, update the three matching `T008` pins in lockstep, and rebuild `.github/` from `src/` inside the same task (T002).
- **Phase 3 — Verification and review**: confirm documentation is already consistent, then run full verification over the complete contract plus independent review (T004).

Section 6 governs the phase boundary: the `src/` to `.github/` rebuild belongs to whichever task edits `src/` and is never a separate later phase, because an unrebuilt `src/` edit is both inert at runtime and unverifiable by that task's own gate.
