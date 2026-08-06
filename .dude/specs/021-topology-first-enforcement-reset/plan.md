# Implementation Plan: Topology-First Enforcement Reset

## Summary

Two small prose edits to existing core review-loop skills. No new subsystem, artifact, or state.

First, `src/skills/dude-receiving-code-review/SKILL.md` already owns the revision procedure the reviser and planning authority follow before another revision. Give it one short section that names the three reset triggers and, when any fires, requires the planning authority to establish the six-part topology evidence before the next revision — with the ordinary-local-fix exemption and the explicit carve-out that evidence proving a mechanism covers a reachable path lets the revision proceed rather than blocking it.

Second, `src/skills/dude-reviewer-protocol/SKILL.md` already owns the verdict. Give it one short addition requiring, when a reset is active, that the verdict judge the revised design against the topology evidence, verify every topology claim against the current source and call sites, and admit new enforcement machinery only with a demonstrated reachable failure and a covering acceptance test.

`src/` is authoritative; `node scripts/build-dev.mjs` projects both edits into `.github/skills/dude-receiving-code-review/SKILL.md` and `.github/skills/dude-reviewer-protocol/SKILL.md`. Static prose pins go in `scripts/current-format-contract.test.mjs`.

The canonical feature identity is `.dude/specs/021-topology-first-enforcement-reset/spec.md`, owned exactly by `.dude/ideas/topology-first-enforcement-reset.md`.

This feature has no progress objective and no active ObjectiveRegistry region.

## Technical Context

**Language/Version**: Markdown model-facing skill contracts; Node.js >= 20 dependency-free ESM `node:test` for the static prose pins only. No runtime code path changes.

**Primary Dependencies**: Node built-ins for the contract test; the existing `build-dev` projection. No new module, package, or tool.

**Storage**: None. The topology evidence is transient within the existing review and revision exchange. No file, state surface, board, or record is added or read.

**Testing**: Static prose pins in `scripts/current-format-contract.test.mjs`; `scripts/build-dev.test.mjs` projection parity; `dude-lint`; the full discovered suite; one fresh independent review. No new test harness.

**Target Platform**: Supported macOS, Linux, and Windows local Dude workspaces.

**Project Type**: Reusable coordination bundle core (domain-agnostic review-loop skills).

**Performance Goals**: None affected; the change is guidance prose. No runtime work, scan, or network call is added.

**Constraints**: `src/` is authoritative and `.github/` core comes only from `node scripts/build-dev.mjs`; generated files are never hand-edited. Weave into existing skills only — no new skill, agent, state file, board, command, lane, or registry.

## Spec Quality Validation

- The specification is technology-neutral and carries three independently testable stories: the triggers firing correctly, the planning-authority topology check before the next revision, and review evaluating the revised design against the evidence.
- Acceptance scenarios cover each trigger, the ordinary-fix exemption, multiple triggers collapsing to one reset, the evidence-backed proceed, the narrow-onto-existing-point case, the absent-reachable-failure case, the source-contradiction rejection, and the reachable-failure-plus-test admission gate.
- FR-001 through FR-010 define the triggers, the six-part topology check, the review evaluation and source verification, the reachable-failure-plus-test gate, the evidence-backed proceed, the unchanged existing gates, the ordinary-fix exemption, the no-new-artifact constraint, the Non-Goals, and cross-feature non-mutation.
- SC-001 through SC-008 are measurable without naming an implementation.
- Edge cases, key entities, assumptions, and out-of-scope items are complete. There are no unresolved clarification markers and no implementation detail in the specification.

The specification passed its definition-time document gate before this plan was written. That is a document gate, not a lint or execution-readiness claim; coordinator lint remains pending.

## Guardrail And Smallest-Design Check

The binding project guardrail is: "Choose the smallest design that satisfies proven requirements; reject speculative abstractions, state, schemas, or safeguards without a concrete failure mode or acceptance test."

This feature is that guardrail turned into workflow. Its entire purpose is to stop review revisions from accumulating enforcement machinery that no reachable failure or acceptance test justifies. FR-004 restates the guardrail as an admission gate: new enforcement machinery requires a demonstrated reachable failure and a covering acceptance test. The design itself is held to the same rule — every surviving edit is justified against a concrete failure below, and everything else was cut.

| Kept | Concrete failure it prevents | Acceptance proof |
|---|---|---|
| Reset-trigger + topology-check section in `dude-receiving-code-review` | Review revisions accumulate gates, checkpoints, and cross-session state around an unrechecked enforcement point (the Feature 013 pattern). | SC-001, SC-002, SC-007 |
| Evaluation addition in `dude-reviewer-protocol` | The reviewer has no obligation to test the topology claims or hold new machinery to a reachable failure, so unjustified machinery passes review. | SC-003, SC-004 |
| Static prose pins in `scripts/current-format-contract.test.mjs` | Both edits are prose and silently reversible by an unrelated rewrite. | Contract test in the full suite |

Rejected as speculative, with the reason:

- **A new `dude-topology-reset` skill or agent.** It would be the very "new persistent workflow artifact" FR-008 forbids, and the guidance belongs where revisions and verdicts already happen.
- **Editing the coding-pack architect agent for "planning authority".** That would scope the reset to coding features only and drag in the pack compose lifecycle. The reviser and planning authority already load `dude-receiving-code-review` by its description when addressing findings, so the core skill reaches every domain with no agent edit.
- **Adding the guidance to `dude-systematic-debugging`.** That skill governs root-cause debugging, not the review then revision loop; placing the reset there would misfile it and broaden its trigger surface.
- **A stored topology-evidence record, checklist file, or board.** The evidence is transient to the review exchange; a store would be the stateful machinery this feature exists to discourage and would go stale.
- **A memory lesson instead of guidance.** The idea is explicit that the reset is actual workflow guidance, not merely a lesson; a lesson would not carry the obligation into the revision and verdict steps.
- **A new guardrail entry.** The guardrail checkpoint was skipped for this feature; no new durable guardrail is persisted, and the existing smallest-design, deterministic-script, and concise-prompt guardrails already cover this work.

No new durable project guardrail is proposed. No new persistent workflow artifact is created: both targets are existing files, and the topology evidence has no stored form.

## No-New-Artifact Justification

FR-008 and SC-005 require zero new persistent workflow artifacts. The implementation edits exactly two files that already exist and are already loaded in the review then revision loop, plus the existing static-contract test and the generated projections of those two files. It adds no new skill file, agent file, state file, board, command, execution lane, or registry, and the topology evidence lives only in the transient review and revision exchange. The "no new artifact" acceptance criterion therefore holds by construction.

## Architecture

### 1. Reset triggers and topology check in `dude-receiving-code-review`

Add one short section to `src/skills/dude-receiving-code-review/SKILL.md` within the revision procedure. It states:

1. the three reset triggers — a control-boundary concern surviving two review cycles; a revision introducing a new gate, store, checkpoint, or cross-session state; enforcement expanding across modules or workflow boundaries — and that any one calls for a topology-first reset;
2. when a trigger fires, the planning authority establishes the six-part topology evidence (entry point and call path, controlling actor, concrete reachable failure, narrowest existing enforcement point, a disproving check, and why each stateful mechanism covers a reachable path) before the next revision;
3. that when the evidence shows a mechanism covers a reachable path the narrowest existing point does not, the revision proceeds on that evidence rather than being blocked, and when an existing chokepoint already covers the failure, the added machinery is not carried forward;
4. that ordinary local fixes introducing none of that machinery are exempt even across two cycles; and
5. that the reset adds this evidence obligation without weakening any existing safety, verification, or independent-review requirement.

Expected size is roughly a dozen added lines. If it grows past a short section, stop as `plan-gap` rather than expanding into a procedure or a new artifact.

### 2. Evaluation against evidence in `dude-reviewer-protocol`

Add one short addition to `src/skills/dude-reviewer-protocol/SKILL.md` requiring that, when a reset is active, the verdict judge the revised design against the topology evidence, verify every topology claim against the current source and call sites, and admit new enforcement machinery only with a demonstrated reachable failure and a covering acceptance test. Rejection on that basis uses the existing rejection procedure with no new path.

### 3. Static pins and projection

Extend `scripts/current-format-contract.test.mjs` to pin the reset-trigger and topology-check section in the receiving-review skill, the evaluation obligation in the reviewer protocol, and the absence of any new skill, agent, state, board, or registry surface introduced by the change.

Run `node scripts/build-dev.mjs` after the `src/` edits. Expected generated changes, and only these:

- `.github/skills/dude-receiving-code-review/SKILL.md`
- `.github/skills/dude-reviewer-protocol/SKILL.md`

Generated files are never hand-edited.

## Source Layout

Core source (authoritative edit surface):

- `src/skills/dude-receiving-code-review/SKILL.md`
- `src/skills/dude-reviewer-protocol/SKILL.md`

Static contract:

- `scripts/current-format-contract.test.mjs`

Generated only (produced by `node scripts/build-dev.mjs`, never hand-edited):

- `.github/skills/dude-receiving-code-review/SKILL.md`
- `.github/skills/dude-reviewer-protocol/SKILL.md`

No feature package, `.dude/state`, agent file, command parser, pack, or execution surface is an implementation write target.

## Objective Registry

This feature has no measurable, task-keyed runtime objective. The reset is guidance woven into review-loop instructions; it exposes nothing a runtime evaluator reads. Per `dude-feature-definition`, zero markers is the valid `none` case, so this plan carries no active `dude:objective-registry` region.

## Supporting Artifacts

Only `spec.md`, `plan.md`, and `tasks.md` apply. No research, data model, API or schema contract, quickstart, UX checklist, test checklist, or security checklist is materially useful for this bounded guidance change. No supporting artifact is created.

## Phases

- **Phase 1 - Reset triggers and topology check (T001@74726967)**: add the trigger + topology-check section to the receiving-review skill, pin it statically, and project it into `.github/`.
- **Phase 2 - Review evaluation against evidence (T002@6576616c)**: add the evaluation obligation to the reviewer protocol, pin it, and project it.
- **Phase 3 - Acceptance (T003@61636365)**: run the full validation set, prove no new persistent artifact and unchanged existing gates, rehearse the evidence-backed proceed, and obtain fresh independent review.

## Traceability

| Task | Stories | Requirements | Primary proof |
|---|---|---|---|
| T001@74726967 | US1, US2 | FR-001, FR-002, FR-005, FR-006, FR-007, FR-008, FR-009 | Static prose pin, projection parity, trigger/exemption inspection |
| T002@6576616c | US3 | FR-003, FR-004, FR-006, FR-008 | Static prose pin, projection parity, evaluation-gate inspection |
| T003@61636365 | US1, US2, US3 | FR-001 through FR-010 | Full suite, lint, no-new-artifact inspection, independent review |
