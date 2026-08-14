# Implementation Plan: Continuous Work-Intake Reassessment

## Summary

Add continuous intake reassessment as strengthened prompt authority, not machinery. Use one detailed normative owner and two thin consumers:

1. `src/skills/dude-work-intake/SKILL.md` owns the complete qualitative classification and transition contract in a new `## Continuous Reassessment` section.
2. `src/agents/dude.agent.md` applies that contract at the coordinator entry point, presents the exact brainstorm announcement or the direct-task choice checkpoint, and routes the selected path through existing lifecycle behavior.
3. `src/instructions/dude.instructions.md` carries one concise shared pre-write stop so a directly dispatched specialist cannot continue writing after the bounded-task conditions fail.

Pin the three source surfaces with section-aware static contracts in `scripts/current-format-contract.test.mjs`, then regenerate their committed `.github/` projections with `node scripts/build-dev.mjs`. Do not change `dude-generic-routing`, `dude-work`, public documentation, or any workflow implementation: routing already decides who handles an accepted task, Work already governs defined execution, and this feature adds no command or user-facing workflow surface.

The canonical feature identity is `.dude/specs/033-conversational-brainstorm-intake/spec.md`, prospectively owned by `.dude/ideas/conversational-brainstorm-intake.md`.

This feature has no task-keyed runtime objective and no active ObjectiveRegistry region.

## Technical Context

**Language/Version**: Markdown prompt-authority source; Node.js >= 20 dependency-free ESM static-contract tests.

**Primary Dependencies**: Existing `dude-work-intake`, coordinator agent, shared universal instruction, `scripts/current-format-contract.test.mjs`, source-to-dev projection through `scripts/build-dev.mjs`, `dude-lint`, `dude-compose verify`, and release build tooling.

**Storage**: No new storage. Existing idea ledgers, definition packages, Lightweight task state, and optional tracked state remain authoritative under their current owners.

**Testing**: Section-aware and mutation-resistant assertions in `scripts/current-format-contract.test.mjs`; `scripts/build-dev.test.mjs` for source/generated projection; full recursively discovered tests; workspace and release lint; compose verification; generated-diff and whitespace checks; independent scenario review.

**Target Platform**: Supported Dude hosts and local workspaces on macOS, Linux, and Windows.

**Project Type**: Reusable Markdown coordination bundle with generated committed development output.

**Performance Goals**: None applicable. Reassessment is model judgment at normal routing and continuation points; no parser, scan loop, counter, cache, daemon, or background process is added.

**Constraints**: `src/` is authoritative and `.github/` core is generated only by `node scripts/build-dev.mjs`. Keep the intake rule qualitative; preserve valid completed work; reuse existing brainstorm, definition, routing, and Work authority; keep GitHub issue intake separate; add no alternate state or workflow.

## Specification Quality Validation

- The specification defines four prioritized, independently testable stories covering advice-to-brainstorm recognition, direct-task boundary enforcement, natural-language lifecycle reuse, and proportional non-retroactive behavior.
- Acceptance scenarios cover qualifying and non-qualifying advice, inferred versus explicit capture, split handling, all six direct-task boundary triggers, all three checkpoint choices, large mechanical work, scope narrowing, and preservation of prior valid work.
- FR-001 through FR-017 state observable behavior without source paths or implementation mechanisms.
- SC-001 through SC-008 provide explicit acceptance matrices, zero-false-positive controls, before-write timing, lifecycle outcomes, preservation checks, and a zero-new-machinery inspection.
- No clarification marker remains.

The specification satisfies its definition-time document gate by inspection. This is not a lint or readiness claim.

## Verified Current Topology

1. `src/skills/dude-work-intake/SKILL.md` `## Triage` classifies an incoming request once as a direct answer, specialist task, subtasks, brainstorm input, or explicit definition. Its `## Brainstorm` section already owns flat-ledger capture, user-intent preservation, and split handling. It has no continuous reassessment rule or either transition boundary.
2. `src/agents/dude.agent.md` already loads `dude-work-intake`, owns user-facing routing and response conventions, and invokes existing brainstorm, definition, direct specialist, and Work behavior. It does not currently announce an advice-to-brainstorm transition or hold a direct task before the next write when its character changes.
3. `src/instructions/dude.instructions.md` already applies to all work and protects authority, ownership, verification, and YAGNI. It has no concise shared stop that prevents a direct specialist from writing expanded durable-feature scope.
4. `src/skills/dude-generic-routing/SKILL.md` owns closed-roster specialist selection and applicable-skill matching after an outcome is known. It does not own lifecycle classification and needs no change.
5. `src/skills/dude-work/SKILL.md` already governs defined task execution, stops on clarification or changed intent, and routes changed or ambiguous intent to explicit definition rather than recovery. Reimplementing the new intake boundary there would duplicate existing Work authority.
6. `scripts/current-format-contract.test.mjs` already inventories all three chosen source files and provides section-aware visibility, paragraph, exact-rule, and in-memory mutation helpers. There is no colocated test beside `src/skills/dude-work-intake/SKILL.md`; the existing current-format suite is the smallest established test surface.
7. `node scripts/build-dev.mjs` projects the three chosen source files to `.github/agents/dude.agent.md`, `.github/skills/dude-work-intake/SKILL.md`, and `.github/instructions/dude.instructions.md`. Generated core is never hand-edited.

## Guardrail And Smallest-Design Check

Binding project rules already require deterministic checks, concise non-redundant model guidance, source/generated ownership, and YAGNI.

| Kept surface | Reachable need | Specification proof |
|---|---|---|
| One detailed `dude-work-intake` section | Intake needs a single normative owner for both transition cases and their counterexamples. | FR-001 through FR-017; SC-001 through SC-006 |
| Concise coordinator application | The coordinator must recognize the transition, speak the exact checkpoint, and invoke existing lifecycle routes. | FR-004 through FR-010, FR-013, FR-014; SC-001, SC-003, SC-006 |
| One shared pre-write specialist rule | Direct implementation is performed by specialists; without a shared stop, an expanded task can write before the coordinator reclassifies it. | FR-011 through FR-016; SC-004, SC-005, SC-007 |
| Existing static-contract suite | Prompt behavior needs regression coverage without introducing a runtime classifier or test-only parser. | FR-017; SC-008 |
| Existing build projection | The committed dogfood bundle must receive the authoritative source changes without hand edits. | FR-017; SC-008 |

Rejected designs:

- **A parser, score, counter, state store, registry, or daemon**: the boundary is qualitative model judgment, and no production caller needs new machinery. This would violate FR-016 and FR-017.
- **A new skill, command, workflow lane, or capture path**: existing intake and lifecycle authority already provide every required route. This would violate FR-007 through FR-010 and FR-017.
- **Detailed duplication in the coordinator or universal instruction**: `dude-work-intake` remains the sole complete owner. The coordinator carries only orchestration and response behavior; the shared instruction carries only the direct-write stop.
- **A `dude-generic-routing` change**: that skill decides which installed specialist owns an accepted task, not whether conversational intent has changed character.
- **A `dude-work` change**: Work already governs defined tasks and changed-intent escalation. The new shared stop applies to writers without creating alternate Work semantics.
- **Public documentation changes**: no command, persisted artifact, or lifecycle step is added. Runtime guidance in the existing authority surfaces is sufficient for the proven need.
- **Numeric thresholds or size heuristics**: they misclassify large mechanical work and are explicitly forbidden by FR-016.

No guardrail deviation or new project-specific guardrail is required.

## Chosen Design

### 1. Make `dude-work-intake` the sole detailed reassessment owner

Add `## Continuous Reassessment` immediately after `## Triage` in `src/skills/dude-work-intake/SKILL.md`.

The section defines one continuous rule: rerun classification whenever a conversation or task materially changes character; do not treat the first route as permanent. It then defines both cases and their controls:

- Advice or exploration becomes a brainstorm checkpoint only after the user accepts a direction and the conversation describes a nameable project outcome with meaningful scope, constraints, or tradeoffs.
- The checkpoint uses the exact sentence `This has become a feature brainstorm.`, proposes a slug, assesses one versus several outcomes, waits for confirmation when inferred, and treats explicit natural-language capture as sufficient intent.
- Capture delegates to the existing `## Brainstorm` behavior and remains idea-only; split handling and explicit later definition are unchanged.
- Direct work remains eligible only under the complete FR-011 condition. When any condition fails, it pauses before the next repository write, explains the boundary, and offers the exact three paths from FR-013.
- The checkpoint is mandatory after crossing; direct continuation requires dropping expanded scope. Prior valid work stays valid.
- Reassessment uses no numeric threshold, and a large mechanical change alone is not feature work.
- Existing brainstorm, definition, routing, and Work behavior is reused; GitHub issue intake and all prohibited machinery remain outside the feature.

This section is the only complete copy of the policy. (FR-001 through FR-017; SC-001 through SC-008)

### 2. Add concise coordinator orchestration and response behavior

Add a `## Continuous Intake` section to `src/agents/dude.agent.md` near routing and lifecycle guidance.

The coordinator:

- invokes `dude-work-intake` reassessment when a conversation, direct task, or requested continuation changes character;
- presents the exact brainstorm sentence, slug, split assessment, and one confirmation prompt for an inferred transition;
- routes explicit natural-language capture directly through the existing brainstorm delegation;
- refuses another direct repository write after the direct-task boundary, reports the concrete crossed condition, and offers the three choices as one user prompt;
- resumes direct work only with the original bounded scope after expansion is dropped; otherwise invokes existing brainstorm and, only for settled intent selected by the user, the existing explicit definition route; and
- preserves existing response shape, authority, completed work, and at-most-one-open-prompt behavior.

The section points to the detailed intake owner instead of restating its full criteria. (FR-001, FR-004 through FR-010, FR-012 through FR-017; SC-001, SC-003, SC-004, SC-006, SC-007)

### 3. Add one universal pre-write enforcement rule

Add one concise numbered rule to `src/instructions/dude.instructions.md`:

- direct repository work remains bounded only under the FR-011 conditions;
- if those conditions fail or the original focused verification stops proving completion, the specialist stops before another write and reports the crossed boundary to the coordinator;
- size alone does not trigger the stop, and valid completed work is not rolled back.

The universal rule does not capture, define, choose among the three paths, or mutate workflow state. Those actions remain with the coordinator and existing lifecycle owners. (FR-011 through FR-017; SC-004, SC-005, SC-007, SC-008)

### 4. Pin the contract without implementing a classifier

Extend `scripts/current-format-contract.test.mjs` with a focused test named `continuous work-intake reassessment is section-bound and mutation-resistant`.

Use existing Markdown visibility and section helpers to prove:

- `dude-work-intake` has one visible `## Continuous Reassessment` section containing the continuous trigger, complete advice threshold, exact announcement, slug/split behavior, inferred-versus-explicit capture distinction, idea-only lifecycle, complete direct-task conditions, before-write timing, explanation, three choices, mandatory checkpoint, scope-drop exception, work preservation, qualitative controls, no size-only trigger, existing-route reuse, GitHub issue separation, and no-new-machinery boundary;
- `dude.agent.md` has one visible `## Continuous Intake` section that delegates to the intake owner and carries only the required user-facing orchestration;
- the shared instruction contains one exact direct-work pre-write rule and grants no capture, definition, or workflow-state authority to specialists; and
- deleting, fencing, commenting, or moving each owning rule out of its required section fails its own in-memory assertion.

Do not add a classifier helper, behavioral parser, fixture state store, or new test module. Static contracts pin the model-facing authority; an independent reviewer exercises the specification's qualitative scenario matrix. (All FR; all SC)

### 5. Regenerate only the authoritative projections

Run `node scripts/build-dev.mjs` after the source and test edit. The intended generated changes are exactly:

- `.github/skills/dude-work-intake/SKILL.md`
- `.github/agents/dude.agent.md`
- `.github/instructions/dude.instructions.md`

`scripts/current-format-contract.test.mjs` remains source-only. Do not hand-edit any generated path. Confirm no change to `src/skills/dude-generic-routing/SKILL.md`, `src/skills/dude-work/SKILL.md`, public docs, or any project state beyond the definition transaction. (FR-017; SC-008)

## Test Strategy

### Focused contract and projection checks

```bash
node scripts/build-dev.mjs
node --test --test-name-pattern='continuous work-intake reassessment' scripts/current-format-contract.test.mjs
node --test scripts/build-dev.test.mjs
```

Inspect the focused source and generated diff. The static contract must fail under its own in-memory deleted, fenced, commented, and wrong-section mutations. Generated files must be projections of source, not independent edits.

### Scenario acceptance

Route one unchanged authority diff to an independent reviewer with the specification's matrices:

- qualifying versus non-qualifying advice;
- inferred versus explicit natural-language capture;
- one versus several outcomes;
- all six direct-task boundary triggers;
- all three user choices;
- a large mechanical bounded control;
- scope expansion followed by narrowing; and
- valid work completed before boundary discovery.

This review evaluates qualitative model-facing semantics. Do not create a runtime classifier or numeric oracle solely to automate those judgments.

### Full bundle gate

```bash
find . -path ./dist -prune -o -name '*.test.mjs' -print0 | xargs -0 node --test
node .github/skills/dude-lint/lint.mjs .
node .github/skills/dude-compose/compose.mjs verify
node scripts/build-release.mjs --out dist
node .github/skills/dude-lint/lint.mjs dist
node scripts/build-dev.mjs
git status --porcelain -- .github
git diff --check
```

Require the full suite green; workspace and `dist` lint at zero warnings and zero failures; compose verification exit zero; a release containing the projected authority and no test files or project definition state; a second dev build with no additional projection drift; `.github/` status limited to the three intended generated files; and a clean whitespace check.

## Supporting Artifacts

Only `spec.md`, `plan.md`, and `tasks.md` apply. No data model, contract, schema, research, quickstart, checklist, or other supporting artifact is warranted for a bounded prompt-authority change.

## Objective Registry

This feature has no measurable task-keyed runtime objective. Zero active registry regions is the applicable case.

## Source Layout

Authoritative edits:

- `src/skills/dude-work-intake/SKILL.md`
- `src/agents/dude.agent.md`
- `src/instructions/dude.instructions.md`
- `scripts/current-format-contract.test.mjs`

Generated only through `node scripts/build-dev.mjs`:

- `.github/skills/dude-work-intake/SKILL.md`
- `.github/agents/dude.agent.md`
- `.github/instructions/dude.instructions.md`

Explicitly reused without change:

- `src/skills/dude-generic-routing/SKILL.md`
- `src/skills/dude-work/SKILL.md`
- existing brainstorm and feature-definition authority
- existing Lightweight and tracked execution behavior
- public documentation and GitHub issue intake

## Phases

- **Phase 1 - Authority, contracts, and projection (T001@696e746b)**: add the one-owner/two-thin-consumer prose, pin it in the existing static suite, regenerate the three dev projections, and run focused checks.
- **Phase 2 - Integrated acceptance and review (T002@67617465)**: run the full bundle gate, inspect the bounded diff and absence of new machinery, exercise the qualitative scenario matrix, and route the unchanged evidence to independent review.

## Requirements Traceability

| Specification coverage | Plan ownership | Phase |
|---|---|---|
| FR-001 through FR-005 / SC-001, SC-002 | Detailed intake owner; coordinator brainstorm checkpoint; qualifying/non-qualifying static and review matrices (Chosen Design 1, 2, 4) | Phase 1, Phase 2 |
| FR-006 through FR-010 / SC-003, SC-006 | Inferred-versus-explicit capture, split handling, and existing lifecycle delegation (Chosen Design 1, 2, 4) | Phase 1, Phase 2 |
| FR-011 through FR-016 / SC-004, SC-005, SC-007 | Direct-task boundary, universal pre-write stop, coordinator choices, preservation and qualitative controls (Chosen Design 1 through 4) | Phase 1, Phase 2 |
| FR-017 / SC-008 | Smallest-design exclusions, selected source layout, static inventory, generated projection, and full diff inspection (Guardrail check; Chosen Design 4, 5) | Phase 1, Phase 2 |
| All FR / all SC | Full bundle gate and independent scenario review over one unchanged revision | Phase 2 |
