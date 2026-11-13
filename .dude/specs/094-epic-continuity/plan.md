# Implementation plan: Epic continuity

Owner: `.dude/ideas/094-epic-continuity.md`
Exact identity: `.dude/specs/094-epic-continuity/spec.md`

Use the existing target/prerequisite pattern. Add concise definition rules for
consuming upstream context and specifying a combined check, then qualify Ship's
reporting restriction to recognize the target's verified result. Prove the
pattern with existing lifecycle fixtures and section-bound guidance checks.
Do not add production JavaScript or another storage surface.

## Technical Context

**Language/Version**: Markdown guidance; JavaScript ES modules for existing tests on Node.js >= 20.
**Primary Dependencies**: Existing Node built-ins, lifecycle planner, and format-contract test helpers. No new dependency or optional pack requirement.
**Storage**: Existing idea ledgers, spec/plan/task packages, and their existing evidence references. No new file format, frontmatter field, Epic record, or saved plan.
**Testing**: `node:test` in the existing backlog and current-format suites, plus the existing non-mutating build-projection check. Independent Tester and Code Reviewer per task.
**Target Platform**: Existing Dude core on Windows, macOS, and Linux. Tests use short disposable roots and platform-neutral paths.
**Project Type**: Bundle guidance and documentation over existing software behavior; `src/` is authoritative and `.github/` is generated.
**Performance Goals**: No additional lifecycle scan, background process, or runtime traversal. Definition reads only upstream material needed for the current accepted outcome.
**Constraints**: Preserve Ship's grammar, plan shape, approvals, ownership gates, and Work delegation. No Canvas, UI source, live host qualification, Git operation, or release action.

## Guardrail checks

- The coordinator reports clean direct inventories, the exact selected draft,
  an absent prospective package, no tracked work, and a prerequisite plan holding
  only this target. Publication must still recheck the preimage and identities
  through the first-definition transaction. Do not add a dependency on 088 merely
  because this plan uses its implementation as evidence.
- Existing project and bundle guardrails cover the work; no new candidate or
  guardrail write is needed. The question dispositions are in the specification's
  assumptions and the owner's managed region, not its answer slots.
- The familiar pattern is an aggregate build target with integration tests:
  prerequisites run first, and the target verifies the combined behavior.
  Keep Dude's sequential execution and explicit scope approval rather than
  adopting parallel build behavior.
- There is no UI scope or aggregate progress display. The mandatory mockup
  approval rule remains applicable to any later UI feature; no approval is
  inferred here.
- Keep instructions short and reuse existing contracts. Tests reuse deterministic
  helpers. Each task receives visible, independent verification and review under
  ordinary Work; no task can approve or close itself.

## Existing path and fit

The production caller already exists: `src/skills/dude-work-intake/SKILL.md`,
`### Declared Prerequisites`, step 5 supplies the definition owner with the exact
`specPath` from `skipped` for each complete entry in that feature's
`prerequisites`. The missing instruction is how to use that context for an
accepted shared outcome.

`planShipRun` in `src/skills/dude-lightweight-execution/backlog.mjs` already reads
ordinary `depends-on:` declarations, skips completed prerequisites, and retains
the target as its own entry. `collectLifecycleItems` and `deriveLifecycleModel`
derive each feature's stage from its own tasks. Keep all of this code and its
output contracts unchanged.

| Needed capability | Existing home |
| --- | --- |
| Name and shared goal | The target's ordinary idea and specification. |
| Features needed first and their order | Existing `depends-on:` declarations and `ship-plan`. |
| Accepted upstream contracts and outputs | Exact prerequisite packages and relevant references already in their artifacts. |
| Decisions the target relies on | Source references and necessary explanation in its ordinary spec or plan. |
| Combined acceptance | The target's acceptance scenario and bounded task verification. |
| Progress and completion | Existing per-feature tasks and status; no aggregate percentage. |

This fit requires no separate Epic identity or schema. The added fixtures test
that premise against the actual planner and lifecycle model. If they expose a
contract gap, report it through the current owner rather than expand the task
into a new runtime or record.

## Chosen structure

### 1. Definition consumes the existing context

Add one short `## Cross-Feature Continuity` section after `## Writing Definitions`
in `src/skills/dude-feature-definition/SKILL.md`.

For accepted intent that needs a shared outcome over declared prerequisites:

1. Use an ordinary target. State its shared goal and an acceptance scenario that
   exercises the needed outputs together. Derive a bounded verification task,
   or include the check in an existing bounded task when the same verification
   proves it. Do not add a mandatory extra phase to every dependent feature.
2. Read the exact completed prerequisite packages supplied by the existing
   handoff. Preserve exact ownership; do not reconstruct paths from numbers,
   names, or package directories. Use only declared prerequisites, with 088's
   existing boundary around completed features.
3. Keep only the relevant accepted contracts, decisions, outputs, and evidence.
   Put technology-agnostic obligations in the spec and technical application and
   source references in the plan or task detail. An exact spec path plus the
   relevant section or artifact path is enough; require no new table, manifest,
   snapshot, or handoff file. Read referenced material before relying on it.
4. Preserve distinctions between proposals and accepted decisions, and between
   historical evidence and fresh target verification. Context transfers no
   approval, task completion, Work claim, or definition-write authority.
5. If required material is missing or an outcome-changing conflict is unresolved,
   use existing definition clarification or contract-mismatch handling. Do not
   alter the upstream package, invent a user answer, or silently relax the
   target's condition. Already-defined features retain their existing route.

A reference need not copy an entire upstream artifact or log. Do not discover
extra members, sweep unrelated packages, or follow the dependency closure of an
already-completed prerequisite to manufacture a larger context.

### 2. Ship reports the target's evidenced result

In `src/skills/dude-work-intake/SKILL.md`, change only
`### Declared Prerequisites`:

- Keep step 5's exact read-only package handoff and add a short reference to
  `dude-feature-definition` `## Cross-Feature Continuity`.
- Qualify step 7's blanket "Claim no combined outcome" restriction. Prerequisite
  completion alone remains insufficient. Claim the shared outcome only after
  normal target completion with its specified combined check accepted through
  existing Work verification and independent review, naming the condition and
  evidence. Otherwise report the actual absent, not-run, failed, blocked, or
  unfinished result without combined success.

This reports existing Work evidence; it does not run an additional check after
Work, create an acceptance event, or override a stop. A passed individual check
may be reported as such while the target is unfinished, but it does not establish
the whole shared outcome. A defined package without such a check goes to Work
as-is and gains no combined-success claim from its task count.

In `src/agents/dude.agent.md`, change only the reporting sentence in the
declared-prerequisite paragraph of `## Ship` to follow this qualified rule.
Leave the rest of that paragraph and all other authority and Work rules intact.
No change to the Spec Lead agent is needed: it already loads the owning skill.

The allowance implements this spec's explicit amendment to 088 FR-031. Do not
edit 088's package, completed tasks, log, or historical evidence.

### 3. Explain the ordinary-feature pattern

In `docs/commands.md`, qualify the affected reporting sentence in
`### @dude ship` and add a short example in that command's section. Use ordinary
`invoice-roundtrip`, `invoice-export`, and `invoice-import` features. Show
`depends-on: invoice-export invoice-import` as an illustrative existing
declaration recorded through brainstorm, not a new edit command or metadata key.

Explain the target's goal: exporting and then importing an invoice preserves its
number, currency, and total. Its spec owns that condition; its tasks verify it.
Use the existing `@dude ship invoice-roundtrip` invocation. Explain that unnamed
unfinished prerequisites still need the existing exact-plan approval, and
complete prerequisites do not prove the round trip. Point to existing
per-feature status for progress. Do not add another how-to document or duplicate
the full lifecycle contract.

## Verification design

Use the existing suites; add no harness, reporter, or production helper.

| Check | Coverage and evidence limit |
| --- | --- |
| `094 Epic continuity:` cases in `src/skills/dude-lightweight-execution/backlog.test.mjs` | Use existing fixture helpers, the real `planShipRun` export and CLI, and lifecycle model. An ordinary target declares two prerequisites; unfinished ones precede it, complete ones supply their exact paths, and an unrelated similarly named feature stays out. With prerequisites complete, target tasks separately produce open, blocked, and completed stages. Snapshot around each read proves no mutation. Fixture state transitions simulate completion; they do not execute Work or verify invoices. |
| Definition cases in `scripts/current-format-contract.test.mjs` | Bind FR-001 through FR-009 to their owning rules using the existing section/paragraph helpers and isolated deletion falsifiers. Retain the existing as-is handoff assertions for FR-010. Check the accepted-shared-outcome condition, exact read-only context, useful source references, no inherited permission or completion, and unresolved-context handling. Independent review applies the US1/US2 examples to the prose; a regex alone does not establish semantic correctness. |
| Reporting cases in `scripts/current-format-contract.test.mjs` | Bind the qualified rule in intake, its coordinator reference, and the command documentation. Cover target completion plus accepted specified check, required condition/evidence, and all five non-success cases from US3. Removal of the completion qualifier, evidence condition, or no-inference rule must fail. Preserve first-stop and individual-result requirements. These are written-contract tests, not a simulated runtime report. |
| Existing regressions and projection | Run the backlog and current-format suites separately, plus the existing checked-in projection check. Keep all Ship authority, approval, identity, plan, and Work delegation assertions. Modify only the three 088 reporting expectations affected by this explicit amendment; retain their deletion falsifiers and no-Git protection. |

Use an ordinary illustrative target package in the fixtures, with a goal,
combined scenario, and canonical verification task; do not claim that a
hand-authored fixture proves model-generated definitions. No native-host run,
real specialist loop, UI test, or user approval is an acceptance prerequisite
for this guidance increment. Report that coverage limit explicitly.

Before implementation, record a per-file baseline for the same selected suites.
Run each file in its own Node process on Windows. New selected tests must execute
and pass; skips or zero selected cases are not coverage. Report unrelated
pre-existing failures separately and do not repair them under this feature.

## Source and generated delivery

Only the following implementation paths may change:

| Task | Authoritative paths | Generated paths |
| --- | --- | --- |
| T001 | `src/skills/dude-feature-definition/SKILL.md`; `src/skills/dude-lightweight-execution/backlog.test.mjs`; `scripts/current-format-contract.test.mjs` | `.github/skills/dude-feature-definition/SKILL.md` |
| T002 | `src/skills/dude-work-intake/SKILL.md`; `src/agents/dude.agent.md`; `docs/commands.md`; `scripts/current-format-contract.test.mjs` | `.github/skills/dude-work-intake/SKILL.md`; `.github/agents/dude.agent.md` |

For each task, run `node scripts/build-dev.mjs` in a short disposable copy
containing the current source, documentation, scripts, metadata, and test inputs.
Use the current files, not a Git export that loses uncommitted work. Copy back
only that task's named generated outputs, and verify exact equality with the
builder's output. Never hand-edit `.github/` or run the broad builder over
unrelated local changes. If an affected output conflicts with unrelated edits,
report the conflict through Work rather than overwrite them.

Run the existing non-mutating projection test in the build copy:

```text
node --test --test-name-pattern="checked-in dev core is a byte-identical non-mutating projection of authoritative source" scripts/build-dev.test.mjs
```

No source or generated JavaScript runtime, Work file, Canvas asset, optional pack,
project memory, other definition package, or live execution record is an
implementation writer path. Coordinator-owned state and logs remain outside
the implementer's write set.

## Phases and task derivation

1. **Definition and pattern proof:** Add the scoped definition rules, fixture
   proof, and rule checks; regenerate that skill. Covers US1/US2, FR-001 through
   FR-010, and SC-001/SC-002/SC-004/SC-005.
2. **Handoff, reporting, and usage:** Wire the cross-reference, qualify reporting
   in the intake and coordinator, document the example, and check the full
   guidance path; regenerate those two outputs. Covers US3, FR-006 and FR-010
   through FR-014, and SC-002 through SC-005. Depends on phase 1.

The shared format-contract file makes these serial slices. There is no setup
task, separate final acceptance stage, supporting artifact, or optimization
objective requiring an ObjectiveRegistry.

## Complexity and risks

The only new production material is guidance in existing owners and command
documentation. The planner and lifecycle model already support the pattern.
Separate Epic storage, copied decision bundles, context builders, aggregate
status, and a new reporting engine have no demonstrated caller and are excluded.

The change cannot synchronize already-defined packages or prove a model will
follow the instructions in a long live run. Conflicting upstream evidence still
uses the existing owner and stop rules. The reporting qualification must appear
consistently in intake, coordinator guidance, documentation, and their assertions;
leaving one blanket prohibition behind would make the contract contradictory.
