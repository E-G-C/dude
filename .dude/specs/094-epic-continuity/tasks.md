<!-- audit log: .dude/ideas/094-epic-continuity.md#coordinator-log -->

# Tasks: Epic continuity

Spec: `.dude/specs/094-epic-continuity/spec.md`
Plan: `.dude/specs/094-epic-continuity/plan.md`

Two new canonical units for Lightweight execution. There is no prior task state,
archive, or execution history to reconcile. The coordinator owns later glyphs,
metadata, logs, and closure. Each task receives an independent Tester and Code
Reviewer under normal Work.

All commands below are planned verification, not executed results. Run each
test file in a separate Node process. Use short disposable fixture/build roots
outside the checkout. Record executed, failed, and skipped counts; a skip or
zero selected tests does not prove a required case.

Write only each unit's named paths. Keep `src/` authoritative and regenerate
the named `.github/` files with `node scripts/build-dev.mjs` as described in the
plan's Source and generated delivery section. Preserve unrelated edits and
return only the named generated outputs from the disposable build copy.
No production JavaScript, Work behavior, UI, optional pack, other package,
project memory, or live execution record is an implementer writer path.
No Git operation or release action is included.

## Phase 1: Definition and pattern proof

- [x] T001@e4c7n2p9 [Shared] Define ordinary-feature continuity in `src/skills/dude-feature-definition/SKILL.md` and prove the existing pattern in `src/skills/dude-lightweight-execution/backlog.test.mjs`.

    Trace: plan "Existing path and fit", Chosen structure 1, and the definition/lifecycle rows of Verification design; US1/US2; FR-001 through FR-010; SC-001, SC-002, SC-004, SC-005.
    May write:
    - `src/skills/dude-feature-definition/SKILL.md` (new Cross-Feature Continuity section only)
    - `src/skills/dude-lightweight-execution/backlog.test.mjs` (focused new cases using existing helpers)
    - `scripts/current-format-contract.test.mjs` (new definition-rule cases only)
    - `.github/skills/dude-feature-definition/SKILL.md` (generated)

    Add the scoped rules for a shared-outcome target: its goal, combined acceptance scenario, and bounded verification; exact read-only completed prerequisite context; relevant source references; no inherited approval, verification, or authority; and existing handling of unresolved facts or conflicts. Do not impose another stage on every feature with dependencies.

    Add `094 Epic continuity:` cases using the actual planner, CLI, and lifecycle model, without editing their runtime. Use ordinary invoice-export, invoice-import, and invoice-roundtrip fixtures. Verify prerequisite order and exact skipped paths, exclusion of a similarly named unrelated feature, and the target's independent open, blocked, and completed stages after prerequisites complete. Snapshot each read to prove no mutation. The target fixture must express a goal, combined scenario, and canonical verification task; fixture task transitions simulate state and do not claim Work executed.

    Bind the new definition rules with existing section/paragraph helpers and isolated deletion falsifiers. Retain the existing as-is handoff assertions for FR-010. The Tester and Reviewer must also compare the US1/US2 examples with the prose, including accepted-versus-proposed upstream material and an unresolved contract conflict; pattern matching alone is not semantic verification.

    Fresh verification pass:
    1. Record the pre-edit per-file baseline, then run `node --test --test-name-pattern="094 Epic continuity" src/skills/dude-lightweight-execution/backlog.test.mjs` and `node --test --test-name-pattern="094 Epic continuity" scripts/current-format-contract.test.mjs` separately. All required new cases must execute and pass.
    2. Run `node --test src/skills/dude-lightweight-execution/backlog.test.mjs` and `node --test scripts/current-format-contract.test.mjs` separately. Keep every existing assertion unchanged and investigate any regression from the baseline.
    3. In the disposable build copy, run `node scripts/build-dev.mjs`, then `node --test --test-name-pattern="checked-in dev core is a byte-identical non-mutating projection of authoritative source" scripts/build-dev.test.mjs`. Return only the named generated skill and verify its bytes equal that output.
    4. Check the attempt's diff against the named writer paths. Return test counts, the semantic findings, and any pre-existing failure separately to the coordinator. Coordinator validation after projection: `node .github/skills/dude-lint/lint.mjs .`.

    If the existing planner cannot express the accepted pattern, report the concrete gap through the current Work owner. Do not create an Epic schema, new planner field, or alternate runtime to make the fixture pass.

## Phase 2: Handoff, reporting, and usage

- [x] T002@r8m3v6k1 [US3] Connect the definition guidance to Ship and document evidence-qualified combined results in `src/skills/dude-work-intake/SKILL.md`, `src/agents/dude.agent.md`, and `docs/commands.md`.
    deps: T001@e4c7n2p9

    Trace: plan Chosen structure 2 and 3, reporting/regression rows of Verification design, and Source and generated delivery; US3 and the US2 handoff; FR-006, FR-010 through FR-014; SC-002 through SC-005.
    May write:
    - `src/skills/dude-work-intake/SKILL.md` (Declared Prerequisites steps 5 and 7 only)
    - `src/agents/dude.agent.md` (reporting sentence in the declared-prerequisite paragraph of Ship only)
    - `docs/commands.md` (Ship reporting sentence and ordinary-feature example only)
    - `scripts/current-format-contract.test.mjs` (new continuity/reporting checks and the three affected 088 reporting expectations only)
    - `.github/skills/dude-work-intake/SKILL.md` (generated)
    - `.github/agents/dude.agent.md` (generated)

    Keep the existing exact read-only context handoff and point it to the new definition section. Qualify 088's blanket combined-outcome prohibition consistently: completed prerequisites do not prove the combined result; only normal target completion with its specified combined check accepted through Work verification and independent review supports that claim, with the condition and evidence named. Absent, not-run, failed, blocked, and unfinished cases claim no combined success. Preserve actual intermediate check evidence without claiming the whole target complete.

    Use the ordinary invoice-roundtrip documentation example from the plan. Explain existing brainstorm declaration, exact-plan approval for unnamed unfinished prerequisites, the target's own combined check, and per-feature status. Add no command syntax, metadata, extra stage, UI, report store, or post-Work check.

    Extend section-bound tests using existing helpers. Require isolated deletion failures for normal target completion, accepted specified check, evidence, and no inferred combined success. Keep the 088 first-stop, per-feature-result, and no-Git checks; update only the three reporting expectations that this spec explicitly qualifies. Preserve the rest of the Ship grammar, approval, authority, ownership, and Work-delegation checks.

    Fresh verification pass:
    1. Run `node --test --test-name-pattern="094 Epic continuity|088 Ship" scripts/current-format-contract.test.mjs`. Required cases must execute and pass, including the six US3 reporting conditions and their deletion falsifiers.
    2. Run `node --test scripts/current-format-contract.test.mjs` and `node --test src/skills/dude-lightweight-execution/backlog.test.mjs` separately. Confirm all new requirements and preserved contracts, comparing any unrelated failures with the pre-edit baseline.
    3. In the disposable build copy, run `node scripts/build-dev.mjs`, then `node --test --test-name-pattern="checked-in dev core is a byte-identical non-mutating projection of authoritative source" scripts/build-dev.test.mjs`. Return only the two named generated outputs and verify their exact bytes.
    4. Independently compare intake, coordinator guidance, and the command example for the same evidence-qualified result and unchanged stop rules. Confirm that no unqualified blanket prohibition remains on these active surfaces, no approval or execution state was introduced, and the attempt's diff stays within the writer paths. Return counts and evidence limits; coordinator validation after projection is `node .github/skills/dude-lint/lint.mjs .`.

    Do not edit 088's historical package or any other feature's intent, tasks, log, or evidence. Written-contract and lifecycle tests do not establish live coordinator compliance or a completed multi-feature Ship; report that limit without adding an unplanned native-host gate.

## Execution notes

No task is marked parallel: both touch the format-contract suite, and T002 uses
T001's definition section. There are no supporting checklist boards or separate
acceptance tasks. Normal Work owns execution, independent verification/review,
reconciliation if later needed, and closure; this definition records none of
those results.

## Lightweight Execution History

- dude-run-event: {"basis":{"action":"execute-task","assumptionIdentities":[],"evidenceAcquisitionIdentities":[],"materialInputs":{"checks":["verification"],"operations":["execute-task"],"targets":[".github/skills/dude-feature-definition/SKILL.md","scripts/current-format-contract.test.mjs","src/skills/dude-feature-definition/SKILL.md","src/skills/dude-lightweight-execution/backlog.test.mjs"]},"mechanismIdentities":[],"target":{"lane":"lightweight","specPath":".dude/specs/094-epic-continuity/spec.md","taskKey":"T001@e4c7n2p9"},"validationPlanIdentities":[],"version":1},"eventHash":"3152ffcc153f8ea27db48d92b1af93d910ebc6aa43e0481905e3a62ceff34819","occurrence":{"attemptIdentity":"d89770a9558cfd58798be07866278ca1651c70db2061e6e7976fd4f6d4dd6aea","authorizationEvidenceHash":"05f6784019cd0486c60f427f2591d6a0beeec8dc8ecf0d012a397da7618dc845","basisIdentity":"f01c2a1650b0337acafb5408ed31f2127e40e28817776865bf8794697dfba918","chronology":{"attemptOrdinal":1},"disposition":"accepted","resultIdentity":"ae500ce126536b88524680b997fc0b6b4e87a9776f269d87944ce0648b908627","version":1},"occurrenceIdentity":"3eb675dc2fb643534e4659d620b2d303c825ee4f208b468f350814028b6f7091","reviewEnvelopeIdentity":"112489fef5b4874bc1a37bd3738a9083d7195970a05f894b019ad9f758accea7","target":{"lane":"lightweight","specPath":".dude/specs/094-epic-continuity/spec.md","taskKey":"T001@e4c7n2p9"},"type":"approach-occurrence","verificationEnvelopeIdentity":"598eb147c3ef33a9e8196170fd3a30a62d2b0f7b08d6904a97dfed7486e9fa9f","version":1}
- dude-run-event: {"basis":{"action":"execute-task","assumptionIdentities":[],"evidenceAcquisitionIdentities":[],"materialInputs":{"checks":["verification"],"operations":["execute-task"],"targets":[".github/agents/dude.agent.md",".github/skills/dude-work-intake/SKILL.md","docs/commands.md","scripts/current-format-contract.test.mjs","src/agents/dude.agent.md","src/skills/dude-work-intake/SKILL.md"]},"mechanismIdentities":[],"target":{"lane":"lightweight","specPath":".dude/specs/094-epic-continuity/spec.md","taskKey":"T002@r8m3v6k1"},"validationPlanIdentities":[],"version":1},"eventHash":"bfe79325b51affee02fa5385d0e939a88a5dd64e3acf2256cd1dafb78a20a6f0","occurrence":{"attemptIdentity":"2722e50a429da4407ff4e3ac868920321910cf6d25c8346777e14764d605ff67","authorizationEvidenceHash":"08f6a493fb60c1b9373ba430e4740a3c224b034acb7cbb075fbad62f4b036fc1","basisIdentity":"b25d40f96586f808372ef8507b32d5089dc1a56e3cc4dd3d0fbbfdd79aebbc4c","chronology":{"attemptOrdinal":2},"disposition":"accepted","resultIdentity":"1c15be32f2fe1ba9e29fb13500d15a7283edb2a7f128512d10d5ed13a1e20efa","version":1},"occurrenceIdentity":"5dd37cb22e79dbd998832e77ad0b5b0ff94dfed58036e671bb5e294cd7ea9146","reviewEnvelopeIdentity":"8ea74e80a2c83f2dbbc8f5670cdd7c529c4fc5d446786d91b3e0e36ff919968e","target":{"lane":"lightweight","specPath":".dude/specs/094-epic-continuity/spec.md","taskKey":"T002@r8m3v6k1"},"type":"approach-occurrence","verificationEnvelopeIdentity":"6f23756f960934bdd338939996b420d88970836bb28bf36c1ecb015d1cc2abf8","version":1}
