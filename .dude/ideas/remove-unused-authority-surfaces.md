---
title: Remove Unused Authority Surfaces
slug: remove-unused-authority-surfaces
status: defined
spec_path: .dude/specs/026-remove-unused-authority-surfaces/spec.md
---

# Idea: Remove Unused Authority Surfaces

## Idea

Ship a pragmatic, net-negative deletion feature. Do not over-engineer. Delete provably unused caller-authored authority machinery rather than hardening it, wiring it, or building a replacement framework. Preserve the live `runHostAdapter -> finish(row)` behavior exactly.

Two independent current-source audits, followed by coordinator conflict resolution, established the production topology:

- Ordinary `@dude work` follows `host-adapter-runner.mjs main() -> runHostAdapter() -> createHostAdapter() -> recovery.runCommand()`.
- The production runner constructs only `review-learning`, `bind-alternative`, `verify-no-progress`, and `controlled-end`.
- It never constructs `halt`, `suspend-target`, `resume-learning`, or incident-correction actions.
- Recovery direct exports, CLI access, and direct tests are internal compatibility surfaces rather than ordinary production routing.
- Completion reaches the single `finish(row)` chokepoint after audit and lane mutation.
- Live halt reporting runs through `describeUnattendedHalt` and must remain.

The two-pass topology audit is the scope gate. Its symbol-level KEEP carve-outs are non-negotiable.

Delete these four confirmed-dead top-level surfaces:

1. The objective execution, gates, comparison, and evaluation-sequence subsystem, including its constructors, checkpoint lifecycle, comparators, five gates, objective-event projection, reference eviction, sequence close, and task-boundary wrappers. Do not wire `createEvaluationSequence`, `settleTaskBoundary`, or `resolveComparison`; correct documentation that falsely presents this subsystem as active.
2. The halt-attribution transition: `haltGovernanceV2`, its `runCommand transition/halt` branch, governance and adapter mappings, and optional `audit.halt` transport and branch.
3. Suspension scheduling and the `suspend-target` transition: `suspendTargetV2`, `mayScheduleAfterStop`, and their command, action, and adapter wiring.
4. The legacy unversioned audit renderer: `renderAuditSummary`, its private helpers and constants, and direct tests.

Removing the unreachable optional `audit.halt` branch makes `classifyHaltScopeV2` and `deriveImmediateHaltEndV2` dead. Ordinary production audit still uses `immediateHaltProjectionEvidenceV2`, which must remain. The dead objective flow may take `deriveCheckpointIdentity`, `deriveCandidateIdentity`, `deriveRubricHash`, and `deriveBindingIdentity`; live `deriveSequenceIdentity`, `stateIdentity`, and `writeSetIdentity` must remain.

Remove direct dead-export coverage and replace it with proof that the production runner's action and mode set is closed, deleted routes are absent or unreachable, and focused live behavior remains unchanged. Preserve historical `.dude/ideas` and `.dude/specs` artifacts as provenance.

## Open Questions

No real open questions remain. The topology audits and coordinator conflict resolution settled the scope-changing questions:

1. **RESOLVED - Should the dead objective subsystem be wired instead of deleted?**
   No. It has no production caller and must be deleted under YAGNI.
2. **RESOLVED - Does removing halt attribution permit removing all immediate-halt evidence?**
   No. `classifyHaltScopeV2` and `deriveImmediateHaltEndV2` become dead, but live `immediateHaltProjectionEvidenceV2` remains.
3. **RESOLVED - Is a compatibility or migration path required?**
   No. Add no replacement framework, alias, state, authority abstraction, provenance subsystem, or migration path.
4. **RESOLVED - May symbol deletion use broad line ranges?**
   No. Deletion must be symbol-level and preserve every listed live/shared carve-out.

## Assumptions

### User decisions

- The two independent current-source audits and coordinator conflict resolution are accepted as the deletion scope gate.
- No capability is added and the dead objective subsystem is not wired.
- Historical idea and specification artifacts remain unchanged as provenance.
- Generated `.github/` projections are rebuilt from `src/` and never hand-edited.
- Full-suite verification, build-dev projection parity, lint, and independent review are required before eventual closure.

### Coordinator assumptions

- None. No speculative scope or future compatibility requirements were added.

<!-- dude:managed:start -->
## Normalized Intent

- Produce a net-negative cleanup by deleting the four confirmed-dead authority surfaces and their dead dispatch, mapping, tests, and false documentation.
- Preserve live `runHostAdapter -> finish(row)` outputs and behavior, inspect, ordinary authorize/complete/learn/audit/transition paths, named-halt reporting, and lane effects.
- Shift coverage from direct dead exports to the closed production runner action/mode set, absence or unreachability of deleted routes, and focused preservation of live behavior.
- Add no replacement mechanism or capability.

## Constraints

- **The two-pass topology audit is the scope gate, and all symbol-level KEEP carve-outs are non-negotiable.**
- Never delete by broad line range.
- Keep Objective Registry and evaluation-contract acquisition: `validateEvaluationContract`, `validateObjectiveRegistry`, `scanObjectiveRegistry`, and inspect-reached `normalizeDefinitionPlan`.
- Keep RunState validators and guards: `validateEvaluationSequences`, `validateLearningReviewRefs`, `deriveSequenceIdentity`, `validateProjectionReference`, `evaluationSequenceRows`, learning-review binding, active-sequence close and authorization guards, and optional RunState carry.
- Keep definition-recovery write-set and identity helpers: `validateCandidateWriteSet`, `writeSetUnion`, `writeSetIdentity`, `validateFileStateDescriptors`, `stateIdentity`, and related size constants.
- Keep shared event and projection helpers, including `buildProjectionRecord` and live acquisition helpers.
- Keep the live halt-reporting chain: outcome reason classes and classification, unattended-loop termination classification, halt next-actions, state conditions and subject, and `describeUnattendedHalt`.
- Keep live audit and validation: `validateSuspensionV1`, `validateAuditSummaryV2`, `retainedGovernanceProjectionV2`, `immediateHaltProjectionEvidenceV2`, `reboundBranchEvidenceV2`, `auditGovernanceV2`, and `auditRun`.
- Keep `deriveSequenceIdentity`, `stateIdentity`, and `writeSetIdentity`.
- Rebuild generated `.github/` projections from `src/`; never hand-edit them.
- Preserve historical `.dude/ideas` and `.dude/specs` artifacts without rewriting provenance.
- Add no framework, authority abstraction, provenance subsystem, compatibility alias, replacement state, migration path, or new capability.
- Do not change live outputs, behavior, inspect, ordinary transitions, named-halt reporting, or lane effects.
- This turn is brainstorm intake only: create no spec package and perform no implementation or test execution.

## Definition Checklist

- [x] Outcome is clear enough for brainstorm
- [x] Scope is coherent as one deletion feature
- [x] Two-pass topology evidence establishes the scope gate
- [x] Symbol-level KEEP carve-outs are explicit
- [x] No scope-changing open questions remain
- [x] Definition requires explicit `define remove-unused-authority-surfaces`

## Coordinator Log

- 2026-08-07 21:00 UTC - brainstorm captured from explicit ship brainstorm subaction; definition deferred
- 2026-08-07 21:05 UTC - first definition staged for .dude/specs/026-remove-unused-authority-surfaces/spec.md
<!-- dude:managed:end -->
