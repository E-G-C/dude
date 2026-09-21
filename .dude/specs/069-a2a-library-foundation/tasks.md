<!-- audit log: .dude/ideas/069-a2a-library-foundation.md#coordinator-log -->

# Tasks: A2A Library Foundation

**Spec:** `.dude/specs/069-a2a-library-foundation/spec.md`
**Plan:** `.dude/specs/069-a2a-library-foundation/plan.md`

Six proposed tasks, all open. This first-definition stage has no prior task
state, archive, discovered work, or execution history to reconcile. Canonical
units are below; no generated board or ObjectiveRegistry is needed.

The listed owners are current discovered roles. The coordinator must rediscover
them and applicable skills at dispatch, retain execution/permission/state
authority, and obtain independent acceptance. Authoring roles return their
required commands to the coordinator rather than claiming to run them.
Descriptions are routing guidance, not a new task-metadata schema.

## Phase 1: Setup

- [x] T001@8b1c2a60 [Shared] Establish the optional A2A catalog pack and its installation boundaries in `library/packs/a2a/pack.md`, `library/packs/README.md`, and the relevant catalog summary/count in `README.md`.
    Owner: `dude-pack-authoring-pack-smith` (Pack Smith).
    Scope: Define the pack description, `software-development` use case, no runtime tools/hooks, and source versus installed availability. Seed the `provides` lists for the existing scaffolders to fill in T002 and T003; document the intended one-agent/two-skill result without claiming installation.
    Verify: Check exact catalog discovery with the plan's existing `list --use-case software-development --no-fetch --json` command; inspect the manifest and catalog wording for optionality, unchanged core behavior, and the disposable-only dogfood restriction. Full-pack installation waits for its artifacts.
    Trace: Plan Chosen Pack Structure and Composition And Dogfood Boundary; US1, US2; FR-001, FR-007, FR-008; SC-002.

## Phase 2: Foundational Knowledge

- [x] T002@63d7e4b1 [Shared] Author the two reusable knowledge skills and complete refresh/onboarding procedures in `library/packs/a2a/skills/dude-pack-a2a-protocol/SKILL.md`, `library/packs/a2a/skills/dude-pack-a2a-protocol/references/maintenance.md`, and `library/packs/a2a/skills/dude-pack-a2a-javascript/SKILL.md`.
    deps: T001@8b1c2a60
    Owner: `dude-pack-authoring-skill-smith` (Skill Smith).
    Scope: Use the current skill scaffolder through the coordinator, including its `pack.md` provides updates. Deliver concise original guidance, all four source URLs, topic provenance, separate wire/SDK/repository-release meanings, source-backed JavaScript entry points, and concrete procedure inputs/outputs and authority stops. Keep cadence unselected and other-language assets absent.
    Verify: Recheck official sources for the delivered baseline; walk through US1 questions, all five US3 cases, and US4 reuse/create/limited branches against the written procedures. Inspect links, trigger descriptions, dates, and exclusions. Return sources checked and any gaps without claiming SDK execution; T004 supplies automated and disposable end-to-end evidence.
    Trace: Plan Research Basis, Knowledge Content, Explicit Refresh Procedure, and On-Demand Language Procedure; US1, US3, US4; FR-002 through FR-006, FR-009 through FR-015; SC-001, SC-003 through SC-005.

## Phase 3: Specialist

- [x] T003@c9a5402e [US1] Author `library/packs/a2a/agents/dude-pack-a2a-javascript-specialist.agent.md` as the single A2A JavaScript advice role and complete its scaffold-managed provider entry in `library/packs/a2a/pack.md`.
    deps: T002@63d7e4b1
    Owner: `dude-pack-authoring-agent-smith` (Agent Smith).
    Scope: Use the existing agent scaffolder through the coordinator. Deliver a read/search-only leaf, `model-class: reasoning`, non-user-invocable visibility, canonical coordinator-only boundary, task-matching skill loads, and an answer/source/recommendation/limits return. Keep authorship, implementation, live A2A, workflow state, and review outside this role.
    Verify: Inspect the current roster for role overlap; check source parsing and model projection with existing tooling in a disposable root. Confirm the complete manifest lists exactly one agent and two skills and that no core routing or model mapping change is needed. Actual advice-use evidence belongs to T005.
    Trace: Plan Chosen Pack Structure and Knowledge Content; US1; FR-001, FR-005, FR-006, FR-016; SC-001, SC-006.

## Phase 4: Procedure And Pack Verification

- [x] T004@7f06b3d8 [Shared] Add authoring-only `library/packs/a2a/a2a.test.mjs`, update catalog expectations in `src/skills/dude-engine/lib/pack-manifest.test.mjs` and `src/skills/dude-engine/lib/agent-projection.test.mjs`, and execute plan V1/V2 against the completed `library/packs/a2a/` sources and disposable bundle fixtures.
    deps: T003@c9a5402e
    Owner: `dude-pack-coding-tester` (Tester); the coordinator routes any real disposable agent/skill authoring steps to their installed owners.
    Scope: Add the `a2a` expectations to `EXPECTED_CATALOG_USE_CASES` and `PACK_CATALOG`, and adjust the exact source-count expectation/message for the one new agent as specified in V1. Obtain explicit expected inventories and the exact count from the then-current authoritative catalog at implementation time, independently of the scan under test. Cover discovery, model projection, provenance and procedure contracts, meaningful deletion falsifiers, add/refresh/remove behavior, preserved unrelated profile entries, no projected tests, and absent-pack core usability. Exercise all five refresh cases and the language reuse/create/missing-evidence/absent-authority/ambiguous-owner cases. Complete one test-only official-language onboarding through review, projection, discovery, and advice use, then discard it.
    Verify: Run the unchanged V1 commands without weakening or skipping the exact catalog inventory, use-case, manifest/source-roster, per-agent metadata, or total-count checks; report observed exit status and pass/fail/skip counts. Supply V2 inputs, cited SDK evidence, owner handoffs, and observed outcomes. Distinguish static contract checks from behavioral evidence; retain failing findings without repairing production sources or inventing a runner.
    Trace: Plan V1 and V2; US1 through US4; FR-001 through FR-016; SC-001, SC-003 through SC-006.

## Phase 5: Rebuilt Dogfood Availability

- [~] T005@e4129c65 [US2] Prove use of the completed A2A pack in a disposable rebuilt dogfood bundle using `scripts/build-dev.mjs`, the existing Compose CLI, and its generated `.github/agents/dude-pack-a2a-javascript-specialist.agent.md` and two skill directories.
    deps: T004@7f06b3d8
    Owner: `dude` for Compose, confirmations, and dispatch; `dude-pack-coding-tester` (Tester) for observed verification in a separate verification context.
    Scope: Follow V3's source-to-Compose-to-rebuild sequence. Inspect the disposable profile, reopen/discover that root in the supported host, select the installed skills, and dispatch the protocol, JavaScript, and excluded-action probes. Do not edit generated files, install the pack in this live worktree, change the Compose restriction, or access the main checkout.
    Verify: Report exact command/root/revision evidence, post-rebuild lint, preserved pack output, unchanged live profile bytes, actual discovered/loaded identities, and the three probe results. If host invocation is unavailable, keep SC-002 unmet rather than substituting source presence or this session's own answer.
    Trace: Plan Composition And Dogfood Boundary and V3; US1, US2; FR-001, FR-005 through FR-008, FR-015, FR-016; SC-001, SC-002, SC-006.

## Phase 6: Independent Acceptance

- [ ] T006@2a8d70f3 [Shared] Independently assess `library/packs/a2a/`, its catalog documentation, and the V1-V3 evidence against this feature's spec and plan.
    deps: T005@e4129c65
    Owner: `dude-reviewer` (Reviewer), read-only and independent of authoring and test execution.
    Scope: Judge source grounding, useful protocol/JavaScript advice, complete maintenance/onboarding procedures, observed rebuilt-dogfood use, core independence, and the exclusions. Check that only JavaScript support is delivered, no cadence or new runtime state was invented, and live-profile activation or A2A integration is not claimed.
    Verify: Return the existing review verdict with requirement-linked findings and evidence limits. Missing checks go back to the coordinator for the appropriate owner; this task does not authorize Reviewer testing, fixes, publication, or closure.
    Trace: Plan V4; all US, FR, and SC.

## Execution Notes

The scaffolders share `pack.md`, so no parallel-candidate markers are proposed.
Dependencies follow artifact needs, not lifecycle number 069. The original
communication idea 068 supplies motivation, not an execution dependency.

Implementation writes in this worktree are limited to authoritative
`library/packs/a2a/` sources, the named catalog prose, and T004's minimal
catalog expectations in `src/skills/dude-engine/lib/pack-manifest.test.mjs` and
`src/skills/dude-engine/lib/agent-projection.test.mjs`. The test-source updates
cover only the added pack/agent expectations and exact total-count
expectation/message; they authorize no production core changes. Generated
pack/profile changes and the test-only additional language stay inside
disposable roots. Preserve unrelated Feature 062, idea 067, profile, state,
docs, and browser-test changes.

All commands and checks above are future work. This definition records no
implementation, verification result, installed capability, or completion.

## Lightweight Execution History

- dude-run-event: {"basis":{"action":"execute-task","assumptionIdentities":[],"evidenceAcquisitionIdentities":[],"materialInputs":{"checks":["verification"],"operations":["execute-task"],"targets":["README.md","library/packs/README.md","library/packs/a2a/pack.md"]},"mechanismIdentities":[],"target":{"lane":"lightweight","specPath":".dude/specs/069-a2a-library-foundation/spec.md","taskKey":"T001@8b1c2a60"},"validationPlanIdentities":[],"version":1},"eventHash":"c498f3296397eb560e7ddb96dca06917b940d189c3b2d204afd1cdcd62b34584","occurrence":{"attemptIdentity":"292f0fda58a93cae4ee1ae1ab9d066036492fbb74ef62580cbdb6b2feaebdc01","authorizationEvidenceHash":"0b13df7080104ab6f7481cbb510065a5e5fc84a2235135b4603ed1fe426ec65b","basisIdentity":"a7359c2febe5acc325912dfdd2a63fce82773a2b59621cb3e3ef66b578ba2a64","chronology":{"attemptOrdinal":1},"disposition":"accepted","resultIdentity":"567537863b3ad15fc1dc7e0d1ae77173d3a84342d6421a34ae87f8de1a43b93d","version":1},"occurrenceIdentity":"017c1bce09102a5bc0850f5f060ff913bce60cd890d4cf0a6844c6f02fe75c8b","reviewEnvelopeIdentity":"e48612636d198dfd13d82774f955ef9d8b9d1f72d3dfdeaacce043dfdb886a55","target":{"lane":"lightweight","specPath":".dude/specs/069-a2a-library-foundation/spec.md","taskKey":"T001@8b1c2a60"},"type":"approach-occurrence","verificationEnvelopeIdentity":"c1b1e8bf9563d6a9b9502966790e803d24a212a95b4eb288ee3d26abba376ee6","version":1}
- dude-run-event: {"basis":{"action":"execute-task","assumptionIdentities":[],"evidenceAcquisitionIdentities":[],"materialInputs":{"checks":["verification"],"operations":["execute-task"],"targets":["library/packs/a2a/pack.md","library/packs/a2a/skills/dude-pack-a2a-javascript/SKILL.md","library/packs/a2a/skills/dude-pack-a2a-protocol/SKILL.md","library/packs/a2a/skills/dude-pack-a2a-protocol/references/maintenance.md"]},"mechanismIdentities":[],"target":{"lane":"lightweight","specPath":".dude/specs/069-a2a-library-foundation/spec.md","taskKey":"T002@63d7e4b1"},"validationPlanIdentities":[],"version":1},"eventHash":"bcffa13a425fe7a179a332bd8c3bb4e69cbddcbbdc9cbbdf9cb7822d0d221714","occurrence":{"attemptIdentity":"d04d58d2d629b835d2b36ffb0497e21f0f1a201213d9023588615c698a8be515","authorizationEvidenceHash":"4a446f5e6443d300d4e847a62c140306bba06d03f42925bc61d77dcbaea0f9ed","basisIdentity":"e8a4c91240dbeef82cfa2226ead5e6becb674f718f991a35102622cc0aa589e3","chronology":{"attemptOrdinal":2},"disposition":"accepted","resultIdentity":"387bce903e8c9f8eb9234bd41f087a31d81b5473a64a8f14dcb4274bb5e9af84","version":1},"occurrenceIdentity":"859c1c7ad13828969e204014471138917422c5bc7dc243df4799151fd26d02d4","reviewEnvelopeIdentity":"729a773584a4cab8cfcbaea8362ed3293047c5dd1eb542aa6b75c58ded1ee0be","target":{"lane":"lightweight","specPath":".dude/specs/069-a2a-library-foundation/spec.md","taskKey":"T002@63d7e4b1"},"type":"approach-occurrence","verificationEnvelopeIdentity":"241638d8324d0d9e198677b852ab49754b442da1fd91e85faa1a4379dff7e2a0","version":1}
- dude-run-event: {"basis":{"action":"execute-task","assumptionIdentities":[],"evidenceAcquisitionIdentities":[],"materialInputs":{"checks":["verification"],"operations":["execute-task"],"targets":["README.md","library/packs/README.md","library/packs/a2a/agents/dude-pack-a2a-javascript-specialist.agent.md","library/packs/a2a/pack.md"]},"mechanismIdentities":[],"target":{"lane":"lightweight","specPath":".dude/specs/069-a2a-library-foundation/spec.md","taskKey":"T003@c9a5402e"},"validationPlanIdentities":[],"version":1},"eventHash":"f6d972932efceb1b0358a7f26822629c6f5ae0cabc9e2c347563ab80b91a3a61","occurrence":{"attemptIdentity":"913579d7b904d0660907ed4c8f36293693207ad9ed12b3de3a21871e9eda152d","authorizationEvidenceHash":"7f9c467afe797b1a7fcb163640d2e296a95f59a7eb71d3df7f695755a3d98a4f","basisIdentity":"89dfc392cffa9db185a795e65d66864e41a425af9ebc203dbacfbca8b74f5ac0","chronology":{"attemptOrdinal":3},"disposition":"accepted","resultIdentity":"4e28b4301141d8eb4c8ac79f9b59a8e6ec26e45c7c4877210d569b42ccc0567a","version":1},"occurrenceIdentity":"ce62074c345fc3482f417278618ddfd342cd607d367ba1305ae9b9c893edbc9e","reviewEnvelopeIdentity":"81adfcc7b864a17fc46e5222c7132eab39f8d6032bcec066c5cc5ce69d19463f","target":{"lane":"lightweight","specPath":".dude/specs/069-a2a-library-foundation/spec.md","taskKey":"T003@c9a5402e"},"type":"approach-occurrence","verificationEnvelopeIdentity":"36a3c0f71a9eda64f7a0693e7250cce2f25fb8d895e01087868b1b431240801b","version":1}
- dude-run-event: {"basis":{"action":"execute-task","assumptionIdentities":[],"evidenceAcquisitionIdentities":[],"materialInputs":{"checks":["verification"],"operations":["execute-task"],"targets":["library/packs/a2a/a2a.test.mjs","src/skills/dude-engine/lib/agent-projection.test.mjs","src/skills/dude-engine/lib/pack-manifest.test.mjs"]},"mechanismIdentities":[],"target":{"lane":"lightweight","specPath":".dude/specs/069-a2a-library-foundation/spec.md","taskKey":"T004@7f06b3d8"},"validationPlanIdentities":[],"version":1},"eventHash":"1ad6bb4a2c4470da4f995ecba4b0eee547c7e84d7a2210f488e603f629132768","occurrence":{"attemptIdentity":"29eb2efbe38afee5573c54488093d9838585e193de84a781256fab709a1566e3","authorizationEvidenceHash":"020d7b544845086d228bef12251d78ccb880e27c86dcf23ad6f8063740ab44ee","basisIdentity":"70790c72be5bddaa99948db8941767c3303f557657296bfec9810382a7a5e34e","chronology":{"attemptOrdinal":4},"disposition":"accepted","resultIdentity":"f28456e250a78b3ec2bac677c28d3836c75c5e7d411f951203c9b0c1da48e857","version":1},"occurrenceIdentity":"b990d054c96751bf38f31f72a56909168727ca8f79de8b3cde881aec76bdff94","reviewEnvelopeIdentity":"8afdf606549684839528dcc0aa15c73becc38971ce5a7525545b517cae4666c7","target":{"lane":"lightweight","specPath":".dude/specs/069-a2a-library-foundation/spec.md","taskKey":"T004@7f06b3d8"},"type":"approach-occurrence","verificationEnvelopeIdentity":"e68d77e6f2129c86c16dcb3e42500ac42df728b501265963ca7ea4ac7fba0617","version":1}
