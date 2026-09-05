<!-- audit log: .dude/ideas/055-canvas-acceptance-reliability.md#coordinator-log -->

# Tasks: Canvas Acceptance Reliability

Specification: `.dude/specs/055-canvas-acceptance-reliability/spec.md`
Plan: `.dude/specs/055-canvas-acceptance-reliability/plan.md`

These are initial task proposals. Only the coordinator publishes or changes live
task state. Tester can implement the test-infrastructure slices; Coder can take
scoped CI/test changes or diagnose a reproduced product defect. This names
existing roles, not a new authority or team.

## Phase 1: Required Browser Acceptance (P1)

- [x] T001@055ci001 [US1] Make browser acceptance required and portable in `scripts/dude-canvas-ui/browser.test.mjs`, `scripts/dude-canvas-ui/build.test.mjs`, `.github/workflows/ci.yml`, and `docs/commands.md`.
    - Implement required-mode prerequisite failures, supplied Chromium-family executable with the existing local default, and unique per-run evidence children under temporary storage or a caller output parent. Keep ordinary dependency-free skips and evidence-only screenshots.
    - Add the scoped Ubuntu/Node 22 Chrome job, use the existing lockfile install and explicit tests, and prune dependency/output directories from recursive discovery. Reuse two-build and committed/deployed asset parity; never regenerate the workspace before testing it.
    - Add focused prerequisite and run-isolation regressions. Prove successful required execution, missing-browser/dependency failure, changed-artifact rejection, and a nonzero failure from deliberately breaking the existing selected-row visibility assertion in a disposable copy. Restore/discard the probe and rerun the unchanged acceptance command; no mutation platform.
    - Document executable selection, Node version, required/optional commands, execution witness, output location/retention, and unchanged install-free consumers. Exercise two runs under one parent without overwrites and the default temp path.
    - Trace: plan slice 1; FR-001, FR-002, FR-003, FR-008, FR-011, FR-012; US1/US4; SC-001, SC-004, SC-005, SC-006.

## Phase 2: Rendered Production-Provider Flow (P1)

- [x] T002@055real2 [US2] Add one real-provider browser flow and remove impossible canonical fixtures in `scripts/dude-canvas-ui/browser.test.mjs` and `scripts/dude-canvas-ui/build.test.mjs`, documenting coverage in `docs/commands.md`.
    deps: T001@055ci001
    - Use real `openInstance`/`readNowProjection` and production routes over a disposable repository with at least 50 canonical ledgers, realistic 052 facts, and the existing real-process `bd` fixture technique from `src/extensions/dude/canvas-server.test.mjs`. Do not inject projection payloads or modify runtime contracts.
    - Assert one-click opening/activation, committed/query/pending separation during a held read, exact no-database exit-1 fallback, generic failure preserving truthful prior facts, successful replacement/focus, and changed-source freshness followed by explicit successful refresh.
    - Observe semantic request targets and actual command calls; restore PATH and clean up processes, instance, browser, and fixture input on failures. Delete two-digit canonical-choice fixtures and expectations that certify unreachable inventory. Preserve all reachable matrix behavior.
    - Run the required build/browser path plus `src/extensions/dude/canvas-server.test.mjs` and `src/extensions/dude/projection.test.mjs`; retain the existing exact no-database regression. Document the real-provider versus fixture boundary and complete the automatable flow before host smoke.
    - Trace: plan slice 2; FR-004, FR-005, FR-006, FR-007, FR-010, FR-011, FR-012; SC-002, SC-003, SC-006.

## Phase 3: Selected-Open Matrix (P2)

- [x] T003@055grid3 [US3] Extend selected-open coverage in `scripts/dude-canvas-ui/browser.test.mjs` to 360/760/1440 in both themes and document acceptance/host limits in `docs/commands.md`.
    deps: T001@055ci001
    - Parameterize the existing selected-open case and matching theme tokens. Assert full selected-row visibility in listbox and viewport, no unintended clipping/overflow, actual hit-testing at pointer coordinates, and WCAG 2.2 AA target dimensions or measured applicable criterion exceptions.
    - Preserve full-list/canonical-number assertions, query/Tab noncommit, long Next exact-source disclosure, keyboard/focus, accessibility-tree semantics, and computed contrast coverage. Keep each combination's screenshot in its run child as diagnostic evidence only.
    - Run all six combinations and the complete required browser/build path, including the real-provider flow. Add a focused regression for any newly reproduced defect; send product failures to bounded Coder diagnosis under the existing approved design rather than inventing UI scope or weakening an assertion.
    - Document the six-case matrix and permitted target-size exceptions. Request human smoke only after automatable checks pass, limited to actual host discovery, iframe sizing/theme/focus, and reload lifecycle; never report standalone evidence as host evidence.
    - Trace: plan slice 3; FR-009, FR-010, FR-011, FR-012; SC-003, SC-006.

## Ordering And Boundaries

Prefer both P1 slices before the P2 matrix. The dependencies reflect reuse of
T001's harness, not capture chronology or priority. These tasks share files, so
none is a parallel candidate. Feature 052 stays closed; captured 056 is not a
dependency. Do not change deferred UI surfaces, the user's model map, profiles,
private runtime contracts, or unrelated bundle output.

## Lightweight Execution History

- dude-run-event: {"basis":{"action":"execute-task","assumptionIdentities":[],"evidenceAcquisitionIdentities":[],"materialInputs":{"checks":["verification"],"operations":["execute-task"],"targets":[".github/workflows/ci.yml","docs/commands.md","scripts/dude-canvas-ui/browser.test.mjs","scripts/dude-canvas-ui/build.test.mjs"]},"mechanismIdentities":[],"target":{"lane":"lightweight","specPath":".dude/specs/055-canvas-acceptance-reliability/spec.md","taskKey":"T001@055ci001"},"validationPlanIdentities":[],"version":1},"eventHash":"59799fffb5fd102f842fe7781a80145cec6d6e1e8281966bedf285b94cc3d4a6","occurrence":{"attemptIdentity":"12736275612a9b1be36de92e0698555fd9a6dc2ca95ea6ec9ebb909752a430b8","authorizationEvidenceHash":"f10c8b1ef8b1be40e8814af886ca9e924521f1e0afe7792e566a0954baae7975","basisIdentity":"d4efb9137639b0434f7c29ff6dac535905966c925ade42318015672108dc33ab","chronology":{"attemptOrdinal":1},"disposition":"accepted","resultIdentity":"75de2e522cf5ca9056f03933771a847baf3f17205e47a8c2de53950d500356c0","version":1},"occurrenceIdentity":"89886f4795ea9848ef464135eb73a0e07e5804b5709bf8daae09419401855753","reviewEnvelopeIdentity":"b0cd7ac460c393881b6c6f3a81862dfa2f2dc1677b66c4a55186697f0ce7ff02","target":{"lane":"lightweight","specPath":".dude/specs/055-canvas-acceptance-reliability/spec.md","taskKey":"T001@055ci001"},"type":"approach-occurrence","verificationEnvelopeIdentity":"7ed24def8a9dbc78ce671015b15e3a88162edad1e271da5a3df64a5b6e27858b","version":1}
- dude-run-event: {"basis":{"action":"execute-task","assumptionIdentities":[],"evidenceAcquisitionIdentities":[],"materialInputs":{"checks":["verification"],"operations":["execute-task"],"targets":["docs/commands.md","scripts/dude-canvas-ui/browser.test.mjs","scripts/dude-canvas-ui/build.test.mjs"]},"mechanismIdentities":[],"target":{"lane":"lightweight","specPath":".dude/specs/055-canvas-acceptance-reliability/spec.md","taskKey":"T002@055real2"},"validationPlanIdentities":[],"version":1},"eventHash":"ffe9087db1cb7b84bd1e85fc51e4447ae46370d601631e4d670dc7799d77a42c","occurrence":{"attemptIdentity":"6062b3e240bbe733a1f42544bbc828bcc3bd878b97582f929d1c0823585b513f","authorizationEvidenceHash":"7c3914114f3eab8a2396e6707c5dc3ac8350fc4af163f0e6f61a95f7e8519183","basisIdentity":"2ce607f379fe5c0d1573569a973cff2c838ee430db466cc33464539c15d91be3","chronology":{"attemptOrdinal":2},"disposition":"accepted","resultIdentity":"9a9f338d02bb9561b6f47d87d37daa8554569cbada25bd5091fe737ff957ea9f","version":1},"occurrenceIdentity":"059c4f5b5858e826835bb668754424d87ae1333711700b96570bd729a8a0f9f8","reviewEnvelopeIdentity":"3b43a8ce1137e0b71b24de1d5f344e89e9f5500ace934121d928f10db03db86b","target":{"lane":"lightweight","specPath":".dude/specs/055-canvas-acceptance-reliability/spec.md","taskKey":"T002@055real2"},"type":"approach-occurrence","verificationEnvelopeIdentity":"4aa7ada6d8fc94384b20feb25173eb61f305429a34218acfa5202e35df7c4bc9","version":1}
- dude-run-event: {"basis":{"action":"execute-task","assumptionIdentities":[],"evidenceAcquisitionIdentities":[],"materialInputs":{"checks":["verification"],"operations":["execute-task"],"targets":["docs/commands.md","scripts/dude-canvas-ui/browser.test.mjs"]},"mechanismIdentities":[],"target":{"lane":"lightweight","specPath":".dude/specs/055-canvas-acceptance-reliability/spec.md","taskKey":"T003@055grid3"},"validationPlanIdentities":[],"version":1},"eventHash":"2fce77e4f166fbb34aada3ea4025f936475e826e942c2bc8f67b81da22d2fb78","occurrence":{"attemptIdentity":"598eff4219f4e5b5fc7ab34daa2d95e9f5259956eca912b1528784cf562b31de","authorizationEvidenceHash":"43e766e2ba58629e02367b711177d9ee44e082725bfc99f9b1c3ce4f9a711492","basisIdentity":"4c8dbcebde9db6dcb1afcdd42e084b181e324c316167a2f7327cd4e2c2ebdefd","chronology":{"attemptOrdinal":3},"disposition":"accepted","resultIdentity":"b2dd0bccab46a577c282cfbfd590282c0efbe718dace430e8031e06fdb9cc45f","version":1},"occurrenceIdentity":"92ab3db6c0dc76c79a642612de0a15a5a600ac064fbde086be5181307c6ab0f2","reviewEnvelopeIdentity":"e87fd8c7c7d8c27286d0de890f86104b4ffe984eb78249d8da4aa70d4294ce79","target":{"lane":"lightweight","specPath":".dude/specs/055-canvas-acceptance-reliability/spec.md","taskKey":"T003@055grid3"},"type":"approach-occurrence","verificationEnvelopeIdentity":"8756cd5a44b0f5192d5f1b9d44358948a81c901c3ba71d98a12b79ca035af4c9","version":1}
