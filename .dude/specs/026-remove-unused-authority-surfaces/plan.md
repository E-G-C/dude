# Implementation Plan: Remove Unused Authority Surfaces

## Summary

Delete four proven-unreachable authority surfaces from the Work runtime: the objective execution subsystem, halt-attribution transition, suspension scheduling transition, and legacy unversioned audit renderer. Work only from authoritative `src/`, remove coordinated dispatch, schema, mapping, tests, and false current documentation, then regenerate `.github/` with `node scripts/build-dev.mjs`.

Deletion is symbol-level. The fixed delete manifest below is checked against current references before edits, and the mandatory KEEP manifest is checked after every batch. An unexpected live caller stops the work as a contract mismatch. Nothing is wired, replaced, aliased, migrated, or generalized.

## Technical Context

- **Production entry**: `src/skills/dude-work/host-adapter-runner.mjs` exports `runHostAdapter`; its CLI `main()` calls that route.
- **Adapter boundary**: `src/skills/dude-work/host-adapter.mjs` owns the ten closed semantic operations and maps them to recovery commands.
- **Runtime implementation**: `src/skills/dude-work/recovery.mjs` contains the live runtime interleaved with the dead compatibility and objective clusters.
- **Primary tests**: `src/skills/dude-work/recovery.test.mjs` and `src/skills/dude-work/host-adapter.test.mjs`.
- **Current protocol documentation**: `src/skills/dude-work/SKILL.md`.
- **Public documentation**: primarily `docs/reference.md` and `docs/workflow.md`; inspect `docs/commands.md` and other current docs and change them only where they falsely advertise deleted execution.
- **Current-format assertions**: `scripts/current-format-contract.test.mjs`.
- **Generated core**: `.github/skills/dude-work/` is rebuilt from `src/` by `node scripts/build-dev.mjs`; it is never hand-edited.
- **Historical provenance**: existing `.dude/ideas/**` and `.dude/specs/**` are read-only during implementation, including this package.

## Spec Quality Validation

The specification contains prioritized independently testable scenarios, edge cases, 21 numbered requirements, applicable entities, measurable deletion-oriented success criteria, assumptions, and explicit out-of-scope boundaries. It has no unresolved clarification markers. The named symbols define WHAT is removed or retained; deletion order, source layout, searches, regeneration, and verification remain in this plan. Gate: PASS.

## Proven Production Topology

The accepted two-pass audit establishes:

1. Ordinary Work follows `host-adapter-runner.mjs main() -> runHostAdapter() -> createHostAdapter() -> recovery.runCommand()`.
2. `host-adapter-runner.mjs` constructs only `review-learning`, `bind-alternative`, `verify-no-progress`, and `controlled-end`.
3. It never constructs `halt`, `suspend-target`, resume-governance actions, or incident-correction.
4. The ten live adapter operations are `fresh-inspection`, `authorize-attempt`, `record-attempt-result`, `settle-effect`, `advance-governance`, `prepare-authoritative-projection`, `authorize-lane-effect`, `apply-lane-effect`, `commit-lane-receipt`, and `audit-run`.
5. Completion proceeds through settlement, audit, lane mutation, receipt commitment, final audit, adapter end, and `finish(row)`.
6. Live halt reporting is attached only at `finish(row)` through `describeUnattendedHalt`.

This topology is the scope gate, not a hypothesis to revisit during implementation. A newly discovered live caller stops the task rather than causing scope expansion.

## Mandatory Delete Manifest

The following 40 named symbols and route tokens are mandatory deletion targets. Private constants and helpers may also be deleted only when reference inspection proves they are exclusive to these targets.

### Objective execution subsystem: 31 symbols

1. `acquireCheckpoint`
2. `buildGateSet`
3. `captureCandidate`
4. `createEvaluationSequence`
5. `deriveBindingIdentity`
6. `deriveCandidateIdentity`
7. `deriveCheckpointIdentity`
8. `deriveComparisonDecision`
9. `deriveRubricHash`
10. `keepCheckpoint`
11. `normalizeAuthorizationGate`
12. `normalizeCheckpointGate`
13. `normalizeComparisonGate`
14. `normalizeHardConstraintsGate`
15. `normalizeIndependentReviewGate`
16. `qualifiesForKeep`
17. `releaseCheckpoint`
18. `restoreCheckpoint`
19. `settleCandidate`
20. `validateCheckpointHost`
21. `validateCheckpointRecord`
22. `validateEvaluatorJudgment`
23. `validateObjectiveObservation`
24. `buildObjectiveComparisonEvent`
25. `validateObjectiveComparisonEvent`
26. `buildEvaluationSequenceClosedEvent`
27. `validateEvaluationSequenceClosedEvent`
28. `admitComparisonReference`
29. `resolveComparison`
30. `closeEvaluationSequence`
31. `settleTaskBoundary`

### Halt, suspension, and legacy audit: 9 symbols/routes

32. `haltGovernanceV2`
33. `classifyHaltScopeV2`
34. `deriveImmediateHaltEndV2`
35. `transition/halt`
36. `audit.halt`
37. `suspendTargetV2`
38. `mayScheduleAfterStop`
39. `suspend-target`
40. `renderAuditSummary`

The manifest does not authorize broad deletion around these symbols. Each batch removes only the named symbol, its proven-exclusive helpers/constants, its command or mapping entry, and tests or documentation that exist solely for it.

## Mandatory KEEP Manifest

### Named KEEP symbols: 26

- Objective Registry acquisition:
  - `validateEvaluationContract`
  - `validateObjectiveRegistry`
  - `scanObjectiveRegistry`
  - `normalizeDefinitionPlan`
- RunState validation and sequence identity:
  - `validateEvaluationSequences`
  - `validateLearningReviewRefs`
  - `deriveSequenceIdentity`
  - `validateProjectionReference`
  - `evaluationSequenceRows`
- Definition-recovery identities and write sets:
  - `validateCandidateWriteSet`
  - `writeSetUnion`
  - `writeSetIdentity`
  - `validateFileStateDescriptors`
  - `stateIdentity`
- Shared projection:
  - `buildProjectionRecord`
- Live halt reporting:
  - `OUTCOME_REASON_CLASSES`
  - `classifyOutcomeReason`
  - `endsUnattendedLoop`
  - `describeUnattendedHalt`
- Live audit and validation:
  - `validateSuspensionV1`
  - `validateAuditSummaryV2`
  - `retainedGovernanceProjectionV2`
  - `immediateHaltProjectionEvidenceV2`
  - `reboundBranchEvidenceV2`
  - `auditGovernanceV2`
  - `auditRun`

### Grouped KEEP carve-outs

- Learning-review binding and references.
- Active-sequence authorization and close guards.
- Optional evaluation-sequence and learning-review RunState carry.
- Definition-recovery file-state, write-set, and size limits.
- Shared event validation, projection, and live acquisition helpers.
- Halt next-action, state-condition, subject, and unresolved-report helpers.
- All ten adapter operations and all four production governance actions.

A helper in one of these families remains unless its own current references prove it is outside the carve-out and exclusive to a mandatory-delete symbol.

## Chosen Design

### 1. Freeze topology and behavior before deletion

Use the manifests in this plan as the fixed scope. Before editing, resolve every named delete symbol in current `src/`, record its definitions and references in task evidence, and confirm none is called by `host-adapter-runner.mjs` or another ordinary production entry. Resolve every named KEEP symbol and each grouped carve-out to current definitions and callers.

Add only focused regression coverage that is missing for:

- the runner's exact ten semantic operations;
- the exact four governance actions it constructs;
- `runHostAdapter` terminal flow through `finish(row)`;
- hard-stop reporting through `describeUnattendedHalt`;
- ordinary inspect, audit, lane mutation, and emitted bytes;
- Objective Registry inspection and retained RunState validation.

Do not add a topology framework, persisted manifest, new schema, or generalized source scanner. The plan and task evidence are sufficient.

### 2. Remove isolated compatibility routes first

In `recovery.mjs`, remove the legacy unversioned audit renderer, halt-attribution transition, suspension scheduling transition, and helpers made dead by those removals. Remove the corresponding `runCommand` dispatch branches and schemas.

In `host-adapter.mjs`, remove optional `audit.halt` request transport and handling, halt/suspend action mappings, and any adapter code exclusive to those routes. Preserve ordinary `audit-run`, versioned audit validation, immediate-halt projection evidence, and the ten-operation request set.

In `recovery.test.mjs` and `host-adapter.test.mjs`, delete direct tests and imports for dead exports. Do not retain aliases or test-only exports. Keep or tighten live tests only where they prove the closed production topology or preserved behavior.

Run symbol/reference checks immediately after this batch. Any remaining reference outside a direct dead-export test or false current documentation stops the task for classification.

### 3. Remove the objective cluster surgically

Delete the 31 named objective-execution symbols from `recovery.mjs`, together with only their exclusive constants and private helpers. Work by symbol and reference set, not by contiguous line range.

Removal order:

1. Candidate checkpoint host and identity lifecycle.
2. Comparator and judgment normalization.
3. Five gate constructors and retention decision.
4. Objective comparison and sequence-close event builders/validators.
5. Projection-reference admission and eviction used only by objective execution.
6. Comparison resolution, sequence close, and task-boundary settlement wrappers.
7. Dead exports and direct-export tests.

After each group, positively verify the KEEP manifest. Objective Registry parsing, RunState validation, learning-review binding, definition-recovery identities/write sets, shared event projection, live halt reporting, and versioned audits remain even when adjacent code is deleted.

Do not make the runner consume `createEvaluationSequence`, add an alternative objective implementation, or weaken retained validators merely to reduce their apparent isolation.

### 4. Correct current documentation and contracts

Update `src/skills/dude-work/SKILL.md` so:

- Objective Registry and evaluation-contract acquisition remain documented as inspect-reached definition evidence.
- The section that presents autonomous objective candidate execution, five gates, comparison events, and sequence settlement as active is removed or corrected.
- Halt, suspension, ordinary audit, and runner descriptions match the closed production action set.
- Existing live halt reporting, learning governance, adapter operations, inspection, audit, and lane behavior remain documented.

Update `docs/reference.md` and `docs/workflow.md` where they currently describe autonomous objective execution as active. Inspect `docs/commands.md` and other current public docs and change only demonstrably false statements. Do not rewrite historical `.dude` artifacts.

Update `scripts/current-format-contract.test.mjs` to pin the corrected current contract without retaining dead symbol names in authoritative source. Assert the positive closed runner sets and current documentation boundaries rather than encoding a replacement compatibility layer.

### 5. Regenerate and accept the net deletion

Run `node scripts/build-dev.mjs` after authoritative source and documentation changes. Confirm generated `.github/` copies are byte-consistent with `src/` and a second build produces no additional change.

Perform negative scans for every delete-manifest entry over `src/` and generated `.github/`, and positive scans for all named KEEP entries plus the ten operations and four actions. Use the manifest from this plan as transient acceptance input; do not add a persistent scanning framework.

Measure authoritative source-and-test line counts before and after, excluding generated duplicate projections. The result must be net-negative. Any replacement framework, migration, alias, state, schema, or line-neutral recreation fails acceptance.

## Objective Registry

None. This feature adds no objective or evaluation contract. Its purpose is to delete an unused objective execution subsystem while retaining registry acquisition needed by inspect.

## Supporting Artifacts

None. Specification, plan, and tasks are sufficient for this internal deletion. The symbol manifests are contained in this plan.

## Source Layout

Expected authoritative edit surfaces:

- `src/skills/dude-work/recovery.mjs`
- `src/skills/dude-work/recovery.test.mjs`
- `src/skills/dude-work/host-adapter.mjs`
- `src/skills/dude-work/host-adapter.test.mjs`
- `src/skills/dude-work/host-adapter-runner.mjs` only if a focused live regression assertion requires a local clarification; its production behavior must not change
- `src/skills/dude-work/SKILL.md`
- `scripts/current-format-contract.test.mjs`
- `docs/reference.md`
- `docs/workflow.md`
- other current public docs only when inspection finds a false description

Generated edit surfaces are produced only by `node scripts/build-dev.mjs` under `.github/`.

## Complexity Check

No new abstraction is justified. The implementation removes code and direct tests, keeps existing live boundaries, and adds only narrowly necessary regression assertions. There is no migration, compatibility alias, replacement state, new event, new schema, new command, new operation, or supporting definition artifact.

## Phases

1. **Freeze manifest and live proof**: verify current references and add only missing focused topology/behavior coverage.
2. **Delete isolated dead routes**: legacy audit renderer, halt attribution, suspension scheduling, optional `audit.halt`, and direct tests.
3. **Delete objective execution**: remove the 31-symbol cluster and exclusive support while positively checking KEEP carve-outs.
4. **Correct contracts and regenerate**: update current docs/assertions, rebuild `.github/`, and run negative/positive scans.
5. **Acceptance and review**: full suite, byte parity, net deletion, lint, historical-artifact check, and independent review.

## Requirements And Success Traceability

| Specification coverage | Plan ownership | Tasks |
|---|---|---|
| FR-001, FR-002, FR-003, FR-014 / SC-003 | Freeze production topology, finish behavior, closed operations/actions, and halt reporting | T001@6d616e69, T005@61637074 |
| FR-004, FR-005, FR-006, FR-008, FR-015 / SC-001, SC-002, SC-003 | Remove halt, suspension, optional audit transport, legacy renderer, and exclusive helpers | T002@726f7574, T005@61637074 |
| FR-007, FR-009, FR-010, FR-011, FR-012, FR-013, FR-021 / SC-001, SC-002, SC-004 | Symbol-level objective deletion with mandatory KEEP checks and fail-closed unexpected-caller handling | T001@6d616e69, T003@6f626a65, T005@61637074 |
| FR-016, FR-017, FR-018 / SC-005, SC-006 | Correct current docs/contracts, remove direct dead-export tests, regenerate and scan | T004@646f6373, T005@61637074 |
| FR-019, FR-020 / SC-007, SC-008 | Net-negative acceptance, no replacement machinery, historical non-mutation, independent review | T005@61637074 |
