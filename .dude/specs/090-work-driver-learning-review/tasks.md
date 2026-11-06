<!-- audit log: .dude/ideas/090-work-driver-learning-review.md#coordinator-log -->
# Tasks: Work Driver Learning Review

One new open unit delivers the complete live-run capability. It has no dependencies, inherited task state, completion evidence, archive, or discovered work. Work remains sequential. The coordinator owns execution state and closure after fresh verification and independent review.

The exact package identity is `.dude/specs/090-work-driver-learning-review/spec.md`. No task or eligibility dependency on 089 is introduced. Keep that stopped task, its evidence, all other definitions, and memory unchanged.

## Phase 1: User Stories 1-3 - Submit learning through the live driver

- [x] T001@5b7c2d90 [Shared] Add the validated learning-review form to `src/skills/dude-work/driver.mjs`, share the existing contextual preparation in `recovery.mjs`, prove both branches through the released driver, update `COOKBOOK.md` and its contract, and generate the three matching installed copies.

    Traceability: US1-US3; FR-001 through FR-018; SC-001 through SC-007. Implements all five Chosen Structure sections, Verification, and the internal phases in `plan.md`. No predecessor is required; omit `deps:` rather than inventing a dependency on an earlier lifecycle number.

    Complete anticipated implementation writer set, including test authors and generated deliverables:
    - `.github/skills/dude-work/COOKBOOK.md` (generated)
    - `.github/skills/dude-work/driver.mjs` (generated)
    - `.github/skills/dude-work/recovery.mjs` (generated)
    - `scripts/current-format-contract.test.mjs`
    - `src/skills/dude-work/COOKBOOK.md`
    - `src/skills/dude-work/driver.mjs`
    - `src/skills/dude-work/driver.test.mjs`
    - `src/skills/dude-work/recovery.mjs`
    - `src/skills/dude-work/recovery.test.mjs`

    Before dispatch, put this complete canonical, sorted writer set into the attempt's `Assessment.materialInputs.targets`. Capture the normal attempt baseline and preserve unrelated dirty work. Definition publication and ordinary coordinator-owned lane effects are not implementation writes. An additional writer needs the existing scope/authorization owner before any write; do not widen the pending set or hide the changed path.

    Read-only consumers and regression surfaces include `src/skills/dude-work/host-adapter-runner.mjs`, `host-adapter.mjs`, `host-adapter.test.mjs`, and `SKILL.md`; `docs/commands.md`; and `scripts/build-release.mjs`, `build-release.test.mjs`, `build-dev.mjs`, and `build-dev.test.mjs`. Their current behavior or pointers remain sufficient. No edit to these files, build rules, dependencies, memory, or another feature is anticipated.

    Implement `respond --learning-review <file>` as mutually exclusive with the complete specialist trio and `--cancel`. Consume the actual complete existing raw v2 review; validate its exact challenge, accepted state, Inspection, required governance, target, complete failed-approach comparisons, and branch data. Copy the challenge identity from that challenge into the existing envelope. Check locally detectable staleness using the current exchange, enforce the exact encoded response ceiling, and publish once through the existing outside-workspace atomic writer. Do not repair input, invent identities, drop evidence, or report publication as receiver acceptance.

    Extract the pure `prepareLearningReviewV2(state, inspection, review)` calculation and reuse it from both this preflight and `learnGovernanceV2`. The receiver still acquires fresh evidence and owns state/projection construction. Preserve its refusal precedence and event identities. Keep all semantic learning judgment with the existing owner. Add no low-level runtime call from the responder, new semantic detector, action, projection authority, persistent schema, or budget change.

    Prove the production path in `driver.test.mjs`: build a real core-only release into a short disposable root, invoke real `claim`, attached `run`, and `assess`, submit specialist results twice to establish a proven repeat, then submit one learning result through the new public form to that still-live runner. Do not replace these steps with a seeded governance state, a fabricated challenge, or a helper-only test.

    Cover both outcomes in separate fixture runs. The selected-alternative case must show complete accepted learning, exact dual projection, fresh verification and reinspection, correctly bound alternative authorization, and a later independently verified/reviewed fixture attempt before settlement. The no-progress case must show complete projection and fresh verification before `controlled-unresolved-end`, with no task close, next-task claim, or reusable settled continuation state.

    Add the plan's driver refusal cases for mixed/partial forms, stale/foreign/replayed/wrong-kind input, wrong target or context, missing evidence, malformed branch data, exact comparison across all failed approaches, and existing capacity limits. Prove zero response publication on local preflight failure and unchanged prior response/history bytes. Preserve failed checks, rejected findings and alternatives, ordered occurrences, and metadata. Keep receiver-side drift, projection failure, cancellation, and supervisor-loss regressions; no saved file grants authority after loss.

    In `recovery.test.mjs`, verify pure preparation and fresh receiver parity for both branches and their refusals without mutating supplied state, Inspection, or review. Exercise each negative for its intended reason with other prerequisites valid. Do not weaken a dominating validator, shrink a budget, or duplicate the full existing adapter matrix.

    Update the cookbook's response-purpose table, learning instructions, old cancellation-only advice, and stop table. Document actual owner-produced input, branch requirements, preflight refusal, and the live-run boundary without a canned production review or a promise to recover 089. Replace only the obsolete learning-maker ban in `scripts/current-format-contract.test.mjs`; retain other guidance guards and add positive command/safety checks with deletion or contradiction falsifiers.

    Generate only the three declared `.github/skills/dude-work/` outputs through the existing filtered `listCoreOutputs`/`writeCoreOutput` generation path shared by the dev and release builders. Never hand-edit generated files. Do not run a broad workspace rebuild that rewrites unrelated core files or development metadata; a full-build comparison belongs in a disposable copy.

    Self-hosting check: before changing the installed modules used by this Work invocation, retain their complete pre-change module tree outside the workspace and keep the live invocation's response commands co-versioned until its normal end. If using the new responder with an old in-memory runner instead, first prove that exact pairing through the plan's real disposable exchange tests for both learning branches and ordinary specialist/cancel behavior. Record which precaution was used in the ordinary verification handoff. Never restart, reclaim, or revive a stopped supervisor to finish this task.

    Required fresh acceptance, run by the execution owner from the repository root in separate Node processes:
    1. `node --test src/skills/dude-work/driver.test.mjs` - require both real released-core learning branches, driver refusals, evidence preservation, and existing command regressions.
    2. `node --test src/skills/dude-work/recovery.test.mjs` - require contextual-preflight parity and unchanged learning, comparison, branch, capacity, and projection behavior.
    3. `node --test src/skills/dude-work/host-adapter.test.mjs` - retain existing live authority, receipt, cancellation, projection, and supervisor-loss coverage without editing this file.
    4. `node --test scripts/current-format-contract.test.mjs` - require the new documented form, preserved authority guidance, live falsifiers, and exact cookbook projection.
    5. `node --test scripts/build-dev.test.mjs` and, in a separate process, `node --test scripts/build-release.test.mjs` - require applicable core projection and release checks.
    6. `node .github/skills/dude-lint/lint.mjs .` - require zero failures after scoped generation.
    7. `node scripts/build-release.mjs --out <release-root>`, followed by `node .github/skills/dude-lint/lint.mjs <release-root>` - substitute the same fresh, short, owned outside-workspace directory. Inspect the released driver, recovery module, and cookbook; require no test-file or optional-pack dependency.
    8. Compare all nine writer paths with the task-start baseline and compare each generated file with its source. Confirm no changes to 089, historical definitions, memory, unrelated dirty work, or development metadata. Provide actual self-hosting or mixed-pair evidence before using a mixed pair in the real run.

    Compare suite results with per-file pre-change baselines under the same scheduling. Report executed, failed, skipped, and cancelled counts and explain any baseline failures; no new or unexplained affected failure or skipped required case completes this unit. Keep test-owned roots, evidence, and scratch outside the workspace, isolate the fixture's Beads and ownership store, and confirm child termination before cleanup. Controlled fixture records do not substitute for this task's actual Tester and independent Reviewer results.

    Exclusions: no 089 recovery implementation or eligibility claim; no runner/adapter rewrite, new lane, board, store, registry, daemon, unrelated command, automatic Git, automatic takeover, or changes to close authority. Publication and task closure stay with the coordinator; testing and independent review remain routed through their existing owners.

## Lightweight Execution History

- dude-run-event: {"basis":{"action":"execute-task","assumptionIdentities":[],"evidenceAcquisitionIdentities":[],"materialInputs":{"checks":["verification"],"operations":["execute-task"],"targets":[".github/skills/dude-work/COOKBOOK.md",".github/skills/dude-work/driver.mjs",".github/skills/dude-work/recovery.mjs","scripts/current-format-contract.test.mjs","src/skills/dude-work/COOKBOOK.md","src/skills/dude-work/driver.mjs","src/skills/dude-work/driver.test.mjs","src/skills/dude-work/recovery.mjs","src/skills/dude-work/recovery.test.mjs"]},"mechanismIdentities":[],"target":{"lane":"lightweight","specPath":".dude/specs/090-work-driver-learning-review/spec.md","taskKey":"T001@5b7c2d90"},"validationPlanIdentities":[],"version":1},"eventHash":"d06b9867eb7a69d30cb508e563ca9a4d80e7a1167928bf00cdd1ea62e027c035","occurrence":{"attemptIdentity":"4b9803aafcd3f334749a333cd9819f5a6b1787eab8f030eeb718c4a688a92360","authorizationEvidenceHash":"c977c2632d600698cb3c753c1bed0a2863a36d8c2ead1ce9bcedadc0c7b1f29f","basisIdentity":"354330698aa23020f95cc7aa2e2cfcf9c6768e84670fd746b8dfe37cf021fec9","chronology":{"attemptOrdinal":1},"disposition":"accepted","resultIdentity":"1ea62b0223b627ce5ccdb229e5669a0c08972426a8458481128080d620e4b530","version":1},"occurrenceIdentity":"5ef6372bb04198813831673e4a57a799dfddb1a935ece659b4f94b48275a1436","reviewEnvelopeIdentity":"ab55224e637c01f09564fa7045ddc6df901c4d1d69dfaed1afaf9985be528d27","target":{"lane":"lightweight","specPath":".dude/specs/090-work-driver-learning-review/spec.md","taskKey":"T001@5b7c2d90"},"type":"approach-occurrence","verificationEnvelopeIdentity":"8ad5501137271875a64c6ee46f03722137c68c58dc6e54fe057836e5ebe06535","version":1}
