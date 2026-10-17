<!-- audit log: .dude/ideas/085-retire-backlog-report.md#coordinator-log -->
# Tasks: Retire Backlog Report

One new open unit retires the report while preserving its facts in the kept views. Code, prose, tests, and generated copies stay together because the current-format contract reads them together. There is no inherited completion evidence; live task state and closure remain with the coordinator through ordinary Work, with fresh Tester evidence and independent Reviewer acceptance.

## Phase 1: User Stories 1-3 - Retire the report and preserve its facts

- [x] T001@f6a0c58a [Shared] Retire the committed report in `src/skills/dude-lightweight-execution/backlog.mjs` and its `board.mjs` callers, retain dependency and order notes in the default printed view, and update tests, guidance, and generated outputs together.

    Traces US1 through US3, FR-001 through FR-019, and SC-001 through SC-008. Implements the plan's Chosen Structure sections 1 through 3, Files, Deletions, Generated Outputs And Pins, Verification, and Guardrails And Risks. The notes must be delivered and verified in this unit before retirement is accepted.

    Exact writer paths:
    - `src/skills/dude-lightweight-execution/backlog.mjs`
    - `src/skills/dude-lightweight-execution/board.mjs`
    - `src/skills/dude-lightweight-execution/SKILL.md`
    - `src/skills/dude-work/SKILL.md`
    - `src/skills/dude-lightweight-execution/backlog.test.mjs`
    - `src/skills/dude-lightweight-execution/board.test.mjs`
    - `src/skills/dude-work/host-adapter.test.mjs`
    - `src/skills/dude-work/recovery.test.mjs`
    - `scripts/current-format-contract.test.mjs`
    - `scripts/model-mapping-falsifier.test.mjs`
    - `docs/commands.md`
    - `docs/reference.md`
    - `docs/workflow.md`
    - `README.md`
    - `src/skills/dude-lightweight-execution/backlog-template.html` (delete)
    - `.dude/backlog.md` (delete)
    - `.dude/backlog.html` (delete)
    - `.github/skills/dude-lightweight-execution/backlog.mjs` (generated)
    - `.github/skills/dude-lightweight-execution/board.mjs` (generated)
    - `.github/skills/dude-lightweight-execution/SKILL.md` (generated)
    - `.github/skills/dude-work/SKILL.md` (generated)
    - `.github/skills/dude-lightweight-execution/backlog-template.html` (generated removal)

    Acceptance commands and checks, from the repository root in Windows PowerShell:
    1. `node --test src/skills/dude-lightweight-execution/backlog.test.mjs src/skills/dude-lightweight-execution/board.test.mjs`
    2. `node --test src/skills/dude-work/host-adapter.test.mjs src/skills/dude-work/recovery.test.mjs`
    3. `node --test scripts/current-format-contract.test.mjs scripts/model-mapping-falsifier.test.mjs`
    4. `node --test src/skills/dude-engine/lib/chronological-identity.test.mjs src/extensions/dude/work-index.test.mjs`
    5. `node scripts/build-dev.mjs`, then `node --test scripts/build-dev.test.mjs`
    6. `node .github/skills/dude-lint/lint.mjs .` with 0 failures.
    7. `node .github/skills/dude-compose/compose.mjs verify`
    8. `node scripts/build-release.mjs --out <temporary directory>`, then `node .github/skills/dude-lint/lint.mjs <that directory>` with 0 failures. Replace both placeholders with the same short, owned absolute temporary directory outside the repository.
    9. Run the full suite with CI-equivalent discovery, one process per file: for each path from `Get-ChildItem -Recurse -File -Filter *.test.mjs | Where-Object { $_.FullName -notmatch '\\(node_modules|dist|\.git)\\' }`, run `node --test <that path>` and record its exit code and test, pass, fail, and skipped counts. Compare each file's result with the coordinator's per-file pre-change baseline. A single `node --test` process over every file exhausted the runner's heap on this host before finishing, so it is not evidence here.
    10. `node .github/skills/dude-lightweight-execution/backlog.mjs --root .` prints the groups and dependency and order notes; `node .github/skills/dude-lightweight-execution/backlog.mjs kanban --root .` and `node .github/skills/dude-lightweight-execution/backlog.mjs flowchart retire-backlog-report --root .` still work. `node .github/skills/dude-lightweight-execution/backlog.mjs check --root .`, `node .github/skills/dude-lightweight-execution/backlog.mjs generate --root .`, and `node .github/skills/dude-lightweight-execution/backlog.mjs --write --root .` each exit 1 without writes; the former `generate --root . --write` invocation is likewise refused. HELP lists only the retained forms.
    11. `.dude/backlog.md` and `.dude/backlog.html` are absent, and the implementation changed-path set against the coordinator's task-start snapshot equals the 22 writer paths above. The release omits the template. Definition publication and coordinator-owned execution state are not implementation writes.

    Generate the dev copies before tests that read them, so item 5's build may run first. Only `node scripts/build-dev.mjs` writes the generated paths; do not hand-edit them or silently include unrelated build changes. Record executed, failed, and skipped counts and the full-suite baseline comparison. A skip is not coverage.

    Scope: remove the report renderer, template, generation/check commands, write option, refresh callers, and now-unused helpers, exports, and model fields. Confirm production readers before deleting fields; a test-only reader does not justify retaining a dead capability. Keep the collector, grouping, and printed commands, including all Canvas-consumed values and shared relationship node identities. In particular, preserve `ownBlocked` and `model.relationships.declared` for the unchanged Canvas prerequisite-freshness checks. Keep the old notes' factual conditions and labels, including unavailable data and the repository's provisional relationship; infer no new dependencies or order.

    Preserve canonical board results, snapshots, receipts, and Work authority, audit, recovery, and stop rules. Test absent report files and unchanged earlier-version copies. Replace the host-adapter refresh-failure case without losing its canonical commit, receipt, and audit assertions; remove only the retired pair from recovery's allowed moving surfaces. Keep the remaining manual-close and administrative-reconciliation prose assertions. Point the falsifier's HTML probe to `src/extensions/dude/ui/index.html` only in its disposable copy, retaining the same authority-scan assertions.

    Change no Canvas source, projection, or asset, and run no UI build. Keep `src/skills/dude-engine/lib/chronological-identity.test.mjs` and `src/extensions/dude/work-index.test.mjs` unchanged and passing. Preserve `.dude/metadata/continuation-2026-09-20/**` and the ledgers and packages of 025, 027, 030, 048, and 052. Put the sole earlier-version deletion notice in README. Add no compatibility path, replacement report, state, cross-project scan, or cleanup. The plan's in-memory Work-module risk grants no runtime workaround or extra writer path.

## Lightweight Execution History

- dude-run-event: {"basis":{"action":"execute-task","assumptionIdentities":[],"evidenceAcquisitionIdentities":[],"materialInputs":{"checks":["verification"],"operations":["execute-task"],"targets":[".dude/backlog.html",".dude/backlog.md",".github/skills/dude-lightweight-execution/SKILL.md",".github/skills/dude-lightweight-execution/backlog-template.html",".github/skills/dude-lightweight-execution/backlog.mjs",".github/skills/dude-lightweight-execution/board.mjs",".github/skills/dude-work/SKILL.md","README.md","docs/commands.md","docs/reference.md","docs/workflow.md","scripts/current-format-contract.test.mjs","scripts/model-mapping-falsifier.test.mjs","src/skills/dude-lightweight-execution/SKILL.md","src/skills/dude-lightweight-execution/backlog-template.html","src/skills/dude-lightweight-execution/backlog.mjs","src/skills/dude-lightweight-execution/backlog.test.mjs","src/skills/dude-lightweight-execution/board.mjs","src/skills/dude-lightweight-execution/board.test.mjs","src/skills/dude-work/SKILL.md","src/skills/dude-work/host-adapter.test.mjs","src/skills/dude-work/recovery.test.mjs"]},"mechanismIdentities":[],"target":{"lane":"lightweight","specPath":".dude/specs/085-retire-backlog-report/spec.md","taskKey":"T001@f6a0c58a"},"validationPlanIdentities":[],"version":1},"eventHash":"20ef5e5bd975fa0548cd6da107cbd43fdf09c4a79a8038ad27e2e4aa92ae542a","occurrence":{"attemptIdentity":"4dfb86e3d08f836bbd7e8b0ee8b80658eababe213f88a1007c07ef76cb4040dc","authorizationEvidenceHash":"2e3f1992a637a82c6906e58035cf1557a7db84ff75f8ebee2fba89a77c02db6a","basisIdentity":"b2867eaf1c329564c7ac2421b7d4ef90213b01cfc57927a55ce2ab8ab421ded9","chronology":{"attemptOrdinal":1},"disposition":"accepted","resultIdentity":"139ffebb3ffba35a9dbffc37f41b51665f9e24714c023181f2c7b979156cb2d2","version":1},"occurrenceIdentity":"1ced1cc4c2be36d488d6d6e5500d17b63ee213a63a40f27e1f1d99eebdfe2e6a","reviewEnvelopeIdentity":"1951c4bf25e4ed0b4020f1920d84cb0f508f4d2f03c4d033872bc6c66b129693","target":{"lane":"lightweight","specPath":".dude/specs/085-retire-backlog-report/spec.md","taskKey":"T001@f6a0c58a"},"type":"approach-occurrence","verificationEnvelopeIdentity":"9587765486ce193290f33c4a4a6dc055c4aff3761139143da201a3b9b02fdbea","version":1}
