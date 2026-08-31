<!-- audit log: .dude/ideas/040-recovery-continuation.md#coordinator-log -->

# Tasks: Recovery Continuation

Three all-open sequential canonical units implement
`.dude/specs/040-recovery-continuation/spec.md`, prospectively and exactly owned
by `.dude/ideas/recovery-continuation.md`.

The binding outcome is a narrow clarification of existing autonomous Work:
after same-invocation manual assistance, a freshly verified, independently
reviewed, exactly settled, and closed task is progress; the active coordinator
selects the next ready task in the already-detected lane under the original
target and normalized policy, using a fresh claim. Direct and Ship-originated
autonomous Work are covered. Guarded Work; every existing natural and hard stop;
continuity loss; cleanup, takeover, orphan, cross-invocation, and cross-session
paths; budgets; learning governance; and the closed stop-reason set remain
unchanged. No task may add a runtime loop, command, mode, stop reason, persistent
surface, public-doc change, or silent retry.

Authoritative core guidance lives under `src/`; generated `.github/**` core is
refreshed only through `node scripts/build-dev.mjs` and is never hand-edited.
Feature 039 remains the distinct pre-Work Ship boundary. A required change
outside these boundaries stops as `contract-mismatch: redefine-required`.

No generated board is needed.

## Phase 1: Focused Contract Coverage

**Goal**: Pin the missing continuation bridge and every retained exclusion before
changing authoritative guidance.

- [x] T001@74657374 [Shared] Dispatch Tester with `dude-verification-before-completion` and `project` to implement `plan.md` Chosen Design section 1 in `scripts/current-format-contract.test.mjs`. Add one focused, section-bounded recovery-continuation contract group with labeled deletion or weakening falsifiers for direct and Ship-originated autonomous Work; bounded manual assistance inside the same live supervisor, context, and retained invocation identity; fresh verification, independent review, exact settlement, and closure; clean per-task `ended`/`task-settled` as progress; automatic next-ready selection in the already-detected lane under the original target and normalized policy; a fresh next-task claim; guarded exclusion; unchanged verification or review failure, unresolved blocker, explicit pause or cancellation, no-ready result, budget exhaustion, tool error, every hard stop, and no-silent-retry behavior; continuity loss as a hard stop; no automatic fresh invocation, takeover, orphan resume, or cross-session continuation; cleanup permitting only a later user-authorized clean claim; no new stop reason or persistent surface; and Feature 039's distinct pre-Work boundary. Reuse existing current-format helpers and demonstrate the new checks and falsifiers without adding a parser, test module, runtime code, product guidance, docs, state, or definition changes. Report the expected missing source clauses separately from test-authoring defects. (US1, US2, US3 -> all FR; all SC)

## Phase 2: Authoritative Work Guidance

**Goal**: Make successful per-task settlement an explicit progress handoff in
the existing autonomous coordinator loop.

- [x] T002@736b696c [Shared] Dispatch Skill Smith with `dude-skill-authoring`, `dude-work`, `dude-work-intake`, `dude-pack-writing-style`, `dude-pack-writing-avoid-ai-tropes`, and `project` to implement `plan.md` Chosen Design section 2 only in `src/skills/dude-work/SKILL.md`, primarily `## Iterate` and `## Stops`. State self-containedly that direct and Ship-originated autonomous Work remain in the same coordinator-owned invocation after bounded manual assistance only while the original supervisor, context, and retained invocation identity survive; require fresh verification, independent review, exact settlement, and closure; treat clean per-task `task-settled` as progress rather than a whole-Work stop; select the next ready task in the already-detected lane under the original target and policy; and require a fresh task claim. Preserve guarded behavior; every natural and hard stop; pause and cancellation; no-ready, budget, tool-error, failure, review, ownership, cleanup, learning-governance, and stop-reason rules; no silent retry; no automatic fresh Work, takeover, orphan, or cross-session continuation; and Ship's distinct pre-Work boundary. Do not use feature-local identifiers in shipped guidance or edit tests, runtime JavaScript, public docs, agents, instructions, memory, generated `.github/`, state, or definition artifacts. (US1, US2, US3 -> all FR; all SC)
    deps: T001@74657374

## Phase 3: Projection And Relevant Verification

**Goal**: Project the sole authoritative change and produce fresh bounded
evidence for the integrated contract.

- [x] T003@76657269 [Shared] Dispatch Tester with `dude-verification-before-completion` and `project` to implement `plan.md` Chosen Design section 3 over the unchanged T002@736b696c source. Run `node scripts/build-dev.mjs` to regenerate the installed core, require `.github/skills/dude-work/SKILL.md` to be the sole generated semantic change, run the build again with no further change, and verify exact source/generated equality. Run the focused recovery-continuation contract, the complete `scripts/current-format-contract.test.mjs`, the named source/generated projection test in `scripts/build-dev.test.mjs`, workspace lint with zero failures, and `git diff --check`. Inspect changed paths to confirm that no runtime module, public doc, agent, instruction, memory file, state, metadata, Feature 039 artifact, or unrelated generated file changed. Report evidence and failures without weakening assertions, implementing product fixes, performing final broad verification, or mutating definition or task state. (US1, US2, US3 -> all FR; all SC)
    deps: T002@736b696c

## Requirements And Success Traceability

| Specification coverage | Plan ownership | Tasks |
|---|---|---|
| FR-001 through FR-009 / SC-001, SC-002 | Autonomous continuation after exact task completion, original target/policy, and fresh claim | T001@74657374, T002@736b696c, T003@76657269 |
| FR-010 through FR-013, FR-017 / SC-003 | Unchanged failures, stops, budgets, gates, and retry discipline | T001@74657374, T002@736b696c, T003@76657269 |
| FR-014 through FR-016 / SC-004 | Continuity loss, cleanup-only later claim, and excluded resume paths | T001@74657374, T002@736b696c, T003@76657269 |
| FR-003, FR-018, FR-019 / SC-005, SC-006 | Guarded exclusion, prohibited surfaces, and distinct Feature 039 boundary | T001@74657374, T002@736b696c, T003@76657269 |

## Lightweight Execution History

- dude-run-event: {"basis":{"action":"execute-task","assumptionIdentities":[],"evidenceAcquisitionIdentities":[],"materialInputs":{"checks":["verification"],"operations":["execute-task"],"targets":["scripts/current-format-contract.test.mjs"]},"mechanismIdentities":[],"target":{"lane":"lightweight","specPath":".dude/specs/040-recovery-continuation/spec.md","taskKey":"T001@74657374"},"validationPlanIdentities":[],"version":1},"eventHash":"4aa7ec886802e9e42af849fd9c9b61e30494a295e3d5d02a9fb5c84979770e15","occurrence":{"attemptIdentity":"fa6155936afd55a089b3156e336afd01c06065d7173dfdc8997f931d224d7880","authorizationEvidenceHash":"8ae37774e742a13b95e2b4eb1e21a9297f76a7acc3ccf12cdde0350bae2fe160","basisIdentity":"f86b905b676ea5cb214ad2276a25f77ca82f1a471530f65ade68abcd30db2166","chronology":{"attemptOrdinal":1},"disposition":"accepted","resultIdentity":"da199b2229ca0375c913a750f9c184c256cc95af60de2e64ec6451b731400c6c","version":1},"occurrenceIdentity":"2f6b96fc377fa5301894c901fbf72f0d85d5b4323c74ef73fe61a683c90871f0","reviewEnvelopeIdentity":"36f70935f10da465c80fa2dde4873107bbd1ed6de47186c07f0918ecfe45153f","target":{"lane":"lightweight","specPath":".dude/specs/040-recovery-continuation/spec.md","taskKey":"T001@74657374"},"type":"approach-occurrence","verificationEnvelopeIdentity":"5cf3194f724e4d7b3ec96ada5fd6ba2226ed3c69d20d64cd0ea27ef3f579ec79","version":1}
- dude-run-event: {"basis":{"action":"execute-task","assumptionIdentities":[],"evidenceAcquisitionIdentities":[],"materialInputs":{"checks":["verification"],"operations":["execute-task"],"targets":["src/skills/dude-work/SKILL.md"]},"mechanismIdentities":[],"target":{"lane":"lightweight","specPath":".dude/specs/040-recovery-continuation/spec.md","taskKey":"T002@736b696c"},"validationPlanIdentities":[],"version":1},"eventHash":"01fd31378c382725155096797e83799ee20fefc279c93a5cf69a511cee6935d2","occurrence":{"attemptIdentity":"5f9e32dba4bcfebadb13ae8d596bea322eb3be0e53463546508cbf934e7f308f","authorizationEvidenceHash":"b4644b47a944511aa71281faaeb17ce33c2ca1129e5acdd17492a5d5d2907f2a","basisIdentity":"083e6fd4818db31be40731faa068937a59514a0736946156b2366158d6bea1ba","chronology":{"attemptOrdinal":1},"disposition":"accepted","resultIdentity":"097bfbf1d4d3d44023325d27892f926361dd54e7d0478c32ba30a58332dd95f3","version":1},"occurrenceIdentity":"1cf1ee616c58805ff86bb4d82384b1448120de5d84a13a92ac27f8e81d2a4c6d","reviewEnvelopeIdentity":"9a4edf8a38bffc4177ccc564d54884281ea9800de8359c435bf29e7a3bf9babb","target":{"lane":"lightweight","specPath":".dude/specs/040-recovery-continuation/spec.md","taskKey":"T002@736b696c"},"type":"approach-occurrence","verificationEnvelopeIdentity":"058fe03d97bfe40ce724313d7d506033dd064f5e8ee1cc2fb3d8690dd794f6f5","version":1}
- dude-run-event: {"basis":{"action":"execute-task","assumptionIdentities":[],"evidenceAcquisitionIdentities":[],"materialInputs":{"checks":["verification"],"operations":["execute-task"],"targets":[".github/skills/dude-work/SKILL.md"]},"mechanismIdentities":[],"target":{"lane":"lightweight","specPath":".dude/specs/040-recovery-continuation/spec.md","taskKey":"T003@76657269"},"validationPlanIdentities":[],"version":1},"eventHash":"508bcf809f950aa98eea9f9ab0b3a7f54d94c8474b9c4cf8d505c7cae0d59632","occurrence":{"attemptIdentity":"923fbf61097f445721b6033206a8650cd84e1611e5d44c798e7a228f8254de21","authorizationEvidenceHash":"237f8d91359f4c5c84efa2044ddf195f7051e85a79df6e06304b3e1c204ad54e","basisIdentity":"49e791d482a38b71a6fab25da8c85781344061d8218d89d01e5278f05ec942f9","chronology":{"attemptOrdinal":1},"disposition":"accepted","resultIdentity":"2cec3992b11423cbabfcc09a07d0bc8fc980aa6f84d67082b0ae44fd17ee74ed","version":1},"occurrenceIdentity":"38d52adb923a8ab3816c304d8c272b36dfcbd64beca44c52786c4e5f45b04fd8","reviewEnvelopeIdentity":"f5493da4e4d0e5a1a2ad6607f85ec864e919538410f8cb15006f5803ec606527","target":{"lane":"lightweight","specPath":".dude/specs/040-recovery-continuation/spec.md","taskKey":"T003@76657269"},"type":"approach-occurrence","verificationEnvelopeIdentity":"4952aba76984b78cf9a6ad479552f03fc81d61384425531f98ba3b845b286b11","version":1}
