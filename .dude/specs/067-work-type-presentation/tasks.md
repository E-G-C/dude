<!-- audit log: .dude/ideas/067-work-type-presentation.md#coordinator-log -->
# Tasks: Work Type Presentation

Two new serial open units deliver the classification foundation and then the status-backed progress report. They inherit no state or completion evidence. The coordinator owns task state and closure, and ordinary Work gives each unit one Tester and one independent Reviewer. No tracked import is introduced, so this file is the Lightweight live board.

## Phase 1: Foundational - Classification foundation

- [x] T001@5e2b9c71 [Shared] Admit the optional internal `work_intent` and `work_domain` ledger keys in every strict idea parser, warn on empty or unrecognized values, add the brainstorm and intake guidance and the key documentation, and deliver the generated mirrors, with Canvas output unchanged.

    Traces US3 and the admission that US1, US2, and US4 rely on: FR-004 to FR-011, the retained part of FR-015, FR-017, FR-018, FR-032, and FR-042; SC-004, SC-010, SC-012, and the maintainer warning in SC-007. Implements the plan's Chosen Structure 1 to 3 and 5, the ledger frontmatter contract, the unit 1 rows of Verification, and the private-bytes steps under Build, generated mirror, and private local bytes.

    Exact writer paths:
    - `src\skills\dude-engine\lib\feature.mjs`
    - `src\skills\dude-lightweight-execution\backlog.mjs` (key admission only)
    - `src\skills\dude-feature-definition\publish-first-definition.mjs`
    - `src\skills\dude-feature-definition\atomic-file-batch.mjs`
    - `src\skills\dude-lint\lint.mjs`
    - `src\skills\dude-feature-definition\SKILL.md`
    - `src\skills\dude-work-intake\SKILL.md`
    - `docs\reference.md`
    - `docs\commands.md` (`@dude brainstorm` only)
    - `src\skills\dude-engine\lib\feature.test.mjs`
    - `src\skills\dude-engine\lib\chronological-identity.test.mjs`
    - `src\skills\dude-feature-definition\publish-first-definition.test.mjs`
    - `src\skills\dude-feature-definition\atomic-file-batch.test.mjs`
    - `src\skills\dude-lightweight-execution\backlog.test.mjs`
    - `src\skills\dude-lint\lint.test.mjs`
    - `src\skills\dude-work\recovery.test.mjs`
    - `src\extensions\dude\projection.test.mjs` (classified-ledger regression cases only)
    - `src\extensions\dude\work-index.test.mjs` (classified-ledger regression cases only)
    - `.github\skills\dude-engine\lib\feature.mjs` (generated)
    - `.github\skills\dude-lightweight-execution\backlog.mjs` (generated)
    - `.github\skills\dude-feature-definition\publish-first-definition.mjs` (generated)
    - `.github\skills\dude-feature-definition\atomic-file-batch.mjs` (generated)
    - `.github\skills\dude-lint\lint.mjs` (generated)
    - `.github\skills\dude-feature-definition\SKILL.md` (generated)
    - `.github\skills\dude-work-intake\SKILL.md` (generated)

    Acceptance commands, from the repository root in Windows PowerShell. Run steps 1 to 5 in the clean export that the plan describes, then steps 6 and 7:
    1. `node scripts\build-dev.mjs`, then `node --test --test-name-pattern="checked-in dev core is a byte-identical non-mutating projection of authoritative source" scripts\build-dev.test.mjs`.
    2. `node --test --test-name-pattern="067 Work type" <file>` for each changed test file above, one process per file.
    3. `node --test <file>` for each changed test file in full, one process per file, and `node --test scripts\current-format-contract.test.mjs` with that file unchanged.
    4. `node .github\skills\dude-lint\lint.mjs .` with 0 failures.
    5. The full suite: one `node --test <path>` process per `*.test.mjs` file found outside `node_modules`, `dist`, and `.git`, at most six in parallel, with `src\extensions\dude\canvas-server.test.mjs` run alone. Compare each file with the per-file baseline taken the same way before implementation.
    6. In a disposable installed project, never this repository, brainstorm one clearly described defect and one vague description through chat, and record the keys each ledger holds and any question Dude asked (SC-010).
    7. In this working tree after integration, run step 4 again, re-hash the private paths, and confirm that the delta against the task-start baseline contains only the writer paths above.

    Record executed, failed, and skipped counts for every command; a skip or zero selected tests is not coverage.

    Scope: change no Canvas source under `src\extensions\dude\lib\`, `src\extensions\dude\frontend\`, or `src\extensions\dude\ui\`, and no UI asset, mock, hash pin, browser runner, or agent file. In the two Canvas test files, add only cases proving that a ledger with classification lines yields the same output as the same ledger without them, apart from read times and content identities computed from file bytes; every existing case must pass unchanged. Export only the names the plan lists, each with its caller. Write no classification line into any real ledger in this repository. Leave `publish-first-capture.mjs`, `recovery.mjs`, `needs-you.mjs`, and the `depends-on` handling in `atomic-file-batch.mjs` unchanged. Add guidance sentences without editing any line that the format contract asserts. Generate only the listed mirror outputs with `listCoreOutputs` and `writeCoreOutput` from `scripts\build-release.mjs`, refusing missing or duplicate matches; never regenerate core in bulk in this working tree, and never hand-edit a mirror. The coordinator retains lint and task-state authority.

## Phase 2: User Stories 1, 2, and 4 - Status-backed progress

- [x] T002@a83f0d46 [Shared] Add the pure work-progress engine module with the shared stage rule, the read-only progress report, and the classification words; show each record's stage in the `@dude status` overview and one item's report through the read-only `backlog.mjs progress <slug>` form; and update the status guidance, docs, and format contract, with Canvas output unchanged.
    deps: T001@5e2b9c71

    Traces US1, US2, and the report half of US4: FR-019 to FR-031, with FR-019, FR-023 to FR-025, FR-029, and FR-030 in their retained parts, plus FR-032 and FR-038 to FR-042; SC-002, SC-005, SC-006, SC-011 to SC-013, and the report half of SC-007. Implements the plan's Chosen Structure 4, the stage rule, report, word table, and backlog form contracts, the unit 2 rows of Verification, and the private-bytes steps.

    Exact writer paths:
    - `src\skills\dude-engine\lib\work-progress.mjs` (new)
    - `src\skills\dude-engine\lib\work-progress.test.mjs` (new)
    - `src\skills\dude-lightweight-execution\backlog.mjs`
    - `src\skills\dude-lightweight-execution\backlog.test.mjs`
    - `src\skills\dude-lightweight-execution\SKILL.md`
    - `src\agents\dude.agent.md` (`## Status` only)
    - `docs\commands.md` (`@dude status`, the `backlog.mjs` engine-script row, and the `backlog.mjs` paragraph only)
    - `scripts\current-format-contract.test.mjs` (the feature's lines only)
    - `.github\skills\dude-engine\lib\work-progress.mjs` (generated, new)
    - `.github\skills\dude-lightweight-execution\backlog.mjs` (generated)
    - `.github\skills\dude-lightweight-execution\SKILL.md` (generated)
    - `.github\agents\dude.agent.md` (generated)

    Acceptance commands, from the repository root in Windows PowerShell. Run steps 1 to 6 in the clean export that the plan describes, then steps 7 to 9:
    1. `node scripts\build-dev.mjs`, then `node --test --test-name-pattern="checked-in dev core is a byte-identical non-mutating projection of authoritative source" scripts\build-dev.test.mjs`.
    2. `node --test --test-name-pattern="067 Work type" src\skills\dude-engine\lib\work-progress.test.mjs`, then the same pattern for `src\skills\dude-lightweight-execution\backlog.test.mjs`, one process per file. The selected cases must include an item whose specification records design status proposed and whose task file cannot be read: its report keeps that status, the `design-proposed` checkpoint, and the `design-approval` gate, with stage and phases unavailable. They must also include an item whose specification cannot be read, with its design part `unavailable` with the reason, not `null`.
    3. `node --test` in full, one process per file, for `work-progress.test.mjs`, `backlog.test.mjs`, `src\skills\dude-lightweight-execution\board.test.mjs`, `src\skills\dude-engine\lib\chronological-identity.test.mjs`, and `scripts\current-format-contract.test.mjs`.
    4. Canvas unchanged: `node --test src\extensions\dude\projection.test.mjs` and `node --test src\extensions\dude\work-index.test.mjs`, with both files byte-identical to their state after T001, then `node --test src\extensions\dude\canvas-server.test.mjs` alone.
    5. `node scripts\build-release.mjs --out <short temporary directory>`, then `node .github\skills\dude-lint\lint.mjs <that directory>` with 0 failures. Use the same fresh, short, owned absolute directory outside the repository for both placeholders. Confirm that `.github\skills\dude-engine\lib\work-progress.mjs` is present there and `work-progress.test.mjs` is absent.
    6. `node .github\skills\dude-lint\lint.mjs .` with 0 failures, then the full per-file suite exactly as in T001 step 5, compared with the per-file baseline.
    7. In this working tree after integration, record a snapshot, run `node .github\skills\dude-lightweight-execution\backlog.mjs --root .`, `node .github\skills\dude-lightweight-execution\backlog.mjs progress work-type-presentation --root .`, and `node .github\skills\dude-lightweight-execution\backlog.mjs --help`, and confirm that zero files changed (SC-013).
    8. In a disposable installed project, change one recorded classification by telling Dude in chat, then ask for that item's report; record the bytes the change touched and the words the report shows (SC-005).
    9. Re-hash the private paths, confirm that `scripts\current-format-contract.test.mjs` differs from its pre-write bytes only by the feature's lines, and confirm that the delta against the task-start baseline contains only the writer paths above.

    Record executed, failed, and skipped counts for every command; a skip or zero selected tests is not coverage.

    Scope: keep `collectLifecycleItems` and `deriveLifecycleModel` exactly as T001 leaves them, so the Canvas work index cannot change. Change no Canvas source or Canvas test, and no UI asset, mock, hash pin, or browser runner. The module reads no file, tracker, or pack, takes no request feed, and exports only `workStage` and `workProgress`; requests are always unavailable with a fixed reason and a `null` source. `kanban` and `flowchart` output stays the same, and `--tracked` is valid only with the default and `progress` forms. Keep the `## Status` rule line in `src\agents\dude.agent.md` byte-identical, and use none of the retired backlog phrases that the format contract rejects. In `scripts\current-format-contract.test.mjs`, add only the feature's lines and keep its two private hunks; splice the generated agent file the same way if it holds a private model override. Generate only the listed mirror outputs with `listCoreOutputs` and `writeCoreOutput`, refusing missing or duplicate matches. The coordinator retains lint and task-state authority.

## Lightweight Execution History

- dude-run-event: {"basis":{"action":"execute-task","assumptionIdentities":[],"evidenceAcquisitionIdentities":[],"materialInputs":{"checks":["verification"],"operations":["execute-task"],"targets":[".github/skills/dude-engine/lib/feature.mjs",".github/skills/dude-feature-definition/SKILL.md",".github/skills/dude-feature-definition/atomic-file-batch.mjs",".github/skills/dude-feature-definition/publish-first-definition.mjs",".github/skills/dude-lightweight-execution/backlog.mjs",".github/skills/dude-lint/lint.mjs",".github/skills/dude-work-intake/SKILL.md","docs/commands.md","docs/reference.md","src/extensions/dude/projection.test.mjs","src/extensions/dude/work-index.test.mjs","src/skills/dude-engine/lib/chronological-identity.test.mjs","src/skills/dude-engine/lib/feature.mjs","src/skills/dude-engine/lib/feature.test.mjs","src/skills/dude-feature-definition/SKILL.md","src/skills/dude-feature-definition/atomic-file-batch.mjs","src/skills/dude-feature-definition/atomic-file-batch.test.mjs","src/skills/dude-feature-definition/publish-first-definition.mjs","src/skills/dude-feature-definition/publish-first-definition.test.mjs","src/skills/dude-lightweight-execution/backlog.mjs","src/skills/dude-lightweight-execution/backlog.test.mjs","src/skills/dude-lint/lint.mjs","src/skills/dude-lint/lint.test.mjs","src/skills/dude-work-intake/SKILL.md","src/skills/dude-work/recovery.test.mjs"]},"mechanismIdentities":[],"target":{"lane":"lightweight","specPath":".dude/specs/067-work-type-presentation/spec.md","taskKey":"T001@5e2b9c71"},"validationPlanIdentities":[],"version":1},"eventHash":"3605b523e9ea63d3ab9fa0ca05d1c4e5b7094039a3bbe349e008f39eeee46991","occurrence":{"attemptIdentity":"97640c41d9b163a57e323a54131d9ba8a289775f80df5bbd9b16cb7a70f59493","authorizationEvidenceHash":"10cae8ea1ee4f17db69350d539838207bf39b0c83667f0c091caf9a28db23427","basisIdentity":"1aef7b829fbbf323eecfa12224bbe10ea936891aab323f0624f525bd8872ce70","chronology":{"attemptOrdinal":1},"disposition":"verification-failed","resultIdentity":"876858aee1924eaeeedf0ead208fbb8e796d6d81cd1aa9078085164f9d270439","version":1},"occurrenceIdentity":"e979fd3df0f63f60c14ab65b6f2842c093223121c6188e6c41d498bc97e9bdee","reviewEnvelopeIdentity":"8720f6135c61c506f3e790ff100d4292f8a350452a656deb4f2295cf9ea3a099","target":{"lane":"lightweight","specPath":".dude/specs/067-work-type-presentation/spec.md","taskKey":"T001@5e2b9c71"},"type":"approach-occurrence","verificationEnvelopeIdentity":"c3df3230ae621d5e64abe6f2f22b119e95e530af7963a2f9d744365286877b37","version":1}
- dude-run-event: {"basis":{"action":"retry-task","assumptionIdentities":[],"evidenceAcquisitionIdentities":[],"materialInputs":{"checks":["verification"],"operations":["retry-task"],"targets":[".github/skills/dude-feature-definition/SKILL.md","src/skills/dude-feature-definition/SKILL.md"]},"mechanismIdentities":[],"target":{"lane":"lightweight","specPath":".dude/specs/067-work-type-presentation/spec.md","taskKey":"T001@5e2b9c71"},"validationPlanIdentities":[],"version":1},"eventHash":"da2508efb9cd7b1d6ff7469d9cb80118acb23533885f67b12d17cec53013db48","occurrence":{"attemptIdentity":"97eeecd3a9b3e0efc8c42b6bb97657cf2af518add888979aea5c4451c657ca08","authorizationEvidenceHash":"b93a9473faf56f04138265bd4940756faaf8f36706e8fec95ae3de0d3cf4da24","basisIdentity":"791aa7429a13d8476c201a5e9fb6adee785ecbad106dc40139b47c49a4d82a21","chronology":{"attemptOrdinal":2},"disposition":"accepted","resultIdentity":"d336dea78c5b31e9cb03d0fea17ad67d0eac55ce0fd0751d3d0c53f8f1dfe004","version":1},"occurrenceIdentity":"c04efe400bb99cdd0ebb282dff5bf1fc87a5f6f0fe64f0caaaf6ac4fb4d52481","reviewEnvelopeIdentity":"d8509563dd41ef5af1a4d2dbd32153bb683c94e021d873e035c50b94c2ba4c26","target":{"lane":"lightweight","specPath":".dude/specs/067-work-type-presentation/spec.md","taskKey":"T001@5e2b9c71"},"type":"approach-occurrence","verificationEnvelopeIdentity":"87be41c67eb8191d9ff0459d1ad650367bff82ebdeed89db33ec45486fe6d0f5","version":1}
- dude-run-event: {"basis":{"action":"execute-task","assumptionIdentities":[],"evidenceAcquisitionIdentities":[],"materialInputs":{"checks":["verification"],"operations":["execute-task"],"targets":[".github/agents/dude.agent.md",".github/skills/dude-engine/lib/work-progress.mjs",".github/skills/dude-lightweight-execution/SKILL.md",".github/skills/dude-lightweight-execution/backlog.mjs","docs/commands.md","scripts/current-format-contract.test.mjs","src/agents/dude.agent.md","src/skills/dude-engine/lib/work-progress.mjs","src/skills/dude-engine/lib/work-progress.test.mjs","src/skills/dude-lightweight-execution/SKILL.md","src/skills/dude-lightweight-execution/backlog.mjs","src/skills/dude-lightweight-execution/backlog.test.mjs"]},"mechanismIdentities":[],"target":{"lane":"lightweight","specPath":".dude/specs/067-work-type-presentation/spec.md","taskKey":"T002@a83f0d46"},"validationPlanIdentities":[],"version":1},"eventHash":"8deb0199ac72af80bd1060a1667329dcb33015a88751258f83fc4611b416f4a3","occurrence":{"attemptIdentity":"5e6bf7d451abf775781d289de5cc5bb063688d4bc5506baecb4d2182b9cc4a92","authorizationEvidenceHash":"b35a23a2ae03b588c28d702359c64809d96fe14c1881cae6e6726bc781376596","basisIdentity":"13640549c23075eed981008f9cbd007b1df17f218b5835f7c6c35e8622c7f2a6","chronology":{"attemptOrdinal":3},"disposition":"verification-failed","resultIdentity":"e5bd419d0e058553104373c8a72f3ea635ba38ac125a5b5632a5eb8d59ee1f3f","version":1},"occurrenceIdentity":"82fedc18de38bc3e4f6e8cbbc94aa9edabdb082e54b7fee220ee4126967988fb","reviewEnvelopeIdentity":"e36cf8e35884ba55e151db418e85feaeee13db5aa83023dd9b13fcbf2a3508a5","target":{"lane":"lightweight","specPath":".dude/specs/067-work-type-presentation/spec.md","taskKey":"T002@a83f0d46"},"type":"approach-occurrence","verificationEnvelopeIdentity":"275f384606da55a7f3e45520c02f32dd1dc95f781a3715818e48fcfdcc402986","version":1}
- dude-run-event: {"basis":{"action":"retry-task","assumptionIdentities":[],"evidenceAcquisitionIdentities":[],"materialInputs":{"checks":["verification"],"operations":["retry-task"],"targets":[".github/agents/dude.agent.md","src/agents/dude.agent.md"]},"mechanismIdentities":[],"target":{"lane":"lightweight","specPath":".dude/specs/067-work-type-presentation/spec.md","taskKey":"T002@a83f0d46"},"validationPlanIdentities":[],"version":1},"eventHash":"f46cfc38ed44a258352d226a4b28c0990f75d48027b61596986e0701f5bdd204","occurrence":{"attemptIdentity":"d08f9616250bf8dd3be44cc7d2f706ff52963e751c118175515311c5e85cc025","authorizationEvidenceHash":"455b1c736af2df56e8333fcfee092914e0b7d4eb3388bfcdaf36659c8755139d","basisIdentity":"76e5c47ed8c20f62dddc95a302234e7de8191615d53872592f1a9f984aed8ef5","chronology":{"attemptOrdinal":4},"disposition":"accepted","resultIdentity":"42a5b2651b8612210dcba83c4f2e5a1d90d38885f5f93e7d2ad0c7f7f3002545","version":1},"occurrenceIdentity":"b52767df091805451322181e07ea9856e7de3dee8fdb353c5f5f5d5c7d5f987b","reviewEnvelopeIdentity":"95c567cafd535356c4d776cf0dbe4e1d12315c1e80cc1edc4a4ade2df3a98a60","target":{"lane":"lightweight","specPath":".dude/specs/067-work-type-presentation/spec.md","taskKey":"T002@a83f0d46"},"type":"approach-occurrence","verificationEnvelopeIdentity":"69008700a09def9dc1273a6e4b316e8c6eec30dc28a8cf68df4c89a0baacab5f","version":1}
