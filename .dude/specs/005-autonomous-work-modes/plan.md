# Implementation Plan: Autonomous Work Modes

## Summary

Extend the existing `@dude work` runtime with an explicit `guarded` or `autonomous` policy and an optional, definition-compiled Progress Objective. Policy autonomy remains separate from numeric budgets. A Progress Objective is not inferred at runtime: explicit brainstorm plus define compiles a concrete task objective into one plan-owned `ObjectiveRegistry` keyed by durable task keys, and the runtime consumes it only through a new exact `definition-plan` member of feature 004's existing evidence channel.

The implementation stays in the existing recovery runtime and prompt owners. It adds no optimizer service, new lane, new board, new persistent ledger, generic transaction engine, automatic Git behavior, or new source module. Objective candidates use one invocation-local checkpoint context map supplied by the existing host dependency, exact deterministic comparators, exactly five authoritative retention gates, and projection into the existing current-run and lane-history surfaces before bounded state can be released.

Feature 005 has no concrete task-level Progress Objective. This plan therefore contains zero active ObjectiveRegistry regions.

## Technical Context

**Language/Version**: Node.js >= 20, dependency-free ESM with `// @ts-check`
**Primary Dependencies**: the existing feature 004 `Target`, `EvidenceItem`, `Inspection`, `Assessment`, `Blocker`, and `RunState` contracts; `src/skills/dude-work/recovery.mjs`; exact owner/task helpers; the active Lightweight or tracked lane owner; the existing host dependency that owns invocation-local execution context
**Storage**: no new durable store; bounded invocation-local sequence/reference state plus projections into existing current-run substantive evidence and exact active-lane history
**Testing**: `node:test` table fixtures in `src/skills/dude-work/recovery.test.mjs`; prompt and current-format contract fixtures; build projection tests; full discovered suite; independent Tester and Code Reviewer evidence
**Target Platform**: cross-platform local Dude workspaces using Lightweight or optional Beads-tracked execution
**Project Type**: reusable coordination workflow with a deterministic runtime and one detailed Work prompt owner
**Performance Goals**: fixed resource ceilings; at most 64 registry entries; at most 16 evaluation sequences, 8 retained comparison references per sequence, 64 total comparison references, and 16 learning-review references; at most 64 checkpoint paths; exact bounded event projections of at most 16,384 UTF-8 bytes each
**Constraints**: autonomy is explicit; guarded performs no plan evidence read; runtime never parses arbitrary prose for objectives; exactly five authoritative candidate-retention gates; one sequential candidate at a time; all non-keep mutations restore before continuation; no second ledger, new module, generic filesystem transaction, or automatic commit/reset

## Spec Quality Validation

- The specification remains technology-neutral and defines six independently testable stories.
- FR-001 through FR-010 preserve explicit policy, hard stops, learning, audit, sequential scheduling, mandatory verification/review, capability reuse, no second ledger, and the deterministic/model boundary.
- Contiguous FR-011 through FR-015 add structured grounding and no-objective behavior, frozen numeric/ordinal/subjective comparability, restoration and vetoes, drift/rebaseline, dual projection, and task-scoped termination.
- SC-001 through SC-006 retain the policy and audit outcomes; contiguous SC-007 through SC-012 measure objective selection, comparability, five-condition retention, drift, projection, and task termination.
- Edge cases cover missing or conflicting grounding, numeric uncertainty, ordinal/subjective disagreement, equivalent ties, unsupported effects, restoration failure, contract drift, bounded-reference pressure, and task transition while a sequence is open.
- The specification contains no implementation field names, storage formats, source paths, or `[NEEDS CLARIFICATION]` markers.

The specification passed its definition quality gate before this plan was written. This statement is not a lint or readiness claim; coordinator lint remains pending.

## Guardrail Check

- Reuse feature 004's exact evidence, recovery, authority, and history channels instead of adding a parallel packet or ledger.
- Keep parsing, identity derivation, resource accounting, gate normalization, exact arithmetic, verdicts, restoration checks, and projection verification deterministic.
- Limit model work to semantic diagnosis, alternative selection, and frozen-rubric judgments that remain non-authoritative evidence.
- Keep `src/` authoritative, `dude-work/SKILL.md` the detailed runtime prompt owner, and `dude-feature-definition/SKILL.md` the definition-compilation owner.
- Choose the smallest design with a concrete failure test: one optional registry region, one added evidence source, bounded RunState references, one host context map, and existing history surfaces.

No new durable guardrail is proposed. Existing determinism, smallest-design, authority, and no-second-ledger guardrails fully cover this correction.

## Architecture

### 1. Policy And Existing Runtime Flow

Extend `parseInvocation` with one explicit policy value, default `guarded` and opt-in `autonomous`, while preserving feature 004's invocation grammar, numeric budgets, effective `parallel: 1`, one-pending-attempt rule, target identity, exact owner gate, and completion ownership.

`guarded` does not acquire, read, count, normalize, describe, hash, or packetize `plan.md` evidence. Its source list and observable behavior remain the existing feature 004 behavior. `autonomous` enables the new `definition-plan` acquisition whether or not the selected task has an objective, because a valid present no-objective result is evidence that no objective applies.

Routine autonomous recovery still routes through existing owners and every settled hard stop. Objective evidence never grants execution authority, bypasses a lane transition, or closes a task.

### 2. Definition Compilation And ObjectiveRegistry

Explicit brainstorm plus define is the sole compiler from optional user intent into the technical registry. The compiler may use the user-controlled idea, resolved definition, and proposed canonical tasks during definition, but runtime code never reparses those prose surfaces for objectives. The output is one optional registry in the owning `plan.md`, keyed only by durable task keys.

The exact active start marker is the concatenation of `<`, `!-- dude:objective-registry:start --`, and `>`. The exact active end marker is the same construction with `end` replacing `start`. An active marker must occupy its complete logical line with no leading or trailing bytes and must be outside inline code spans and fenced code blocks. Documentation and tests display only escaped pieces or these placeholders:

```text
<OBJECTIVE_REGISTRY_START>
<CANONICAL_OBJECTIVE_REGISTRY_JSON>
<OBJECTIVE_REGISTRY_END>
```

The scanner counts active start and end markers independently. Zero of each means no registry and therefore no objective. Exactly one of each, start before end, with exactly one intervening nonempty logical line is the only registry form. A lone marker, reversed markers, multiple markers, additional body lines, a noncanonical body, or invalid closed data is `malformed`. A syntactically valid registry whose owner, plan, task identity, or tracked mapping contradicts freshly acquired authority is `conflict`.

The intervening line must be the exact UTF-8 bytes of canonical JSON for this closed root:

```text
{version:1,owner:{ideaPath,specPath},entries:[ObjectiveEntry...]}
```

`entries` contains 1 through 64 rows sorted uniquely by full durable `taskKey`. Each row is exactly `{taskKey,provenance,contract}`. Provenance binds bounded source references from the exact owner package. The frozen contract selects one numeric, ordinal-level, ordinal-pairwise, or subjective comparator; exact evaluator identities; bounded inputs, environment, and comparison conditions; a fixed budget; zero or more allowlisted lint/verification hard constraints; and a predeclared tie rule. Paths, identifiers, rubrics, arrays, integer budgets, and canonical decimals use the fixed bounds in `contracts/schemas.md`.

This plan intentionally has no active marker pair because none of T001 through T008 has a concrete user-approved Progress Objective. No registry is therefore compiled for feature 005 itself.

### 3. Exact Evidence-Channel Extension

Extend feature 004's `EvidenceItem.source` enum and canonical source order to exactly:

1. `owner-log`
2. `task-history`
3. `definition-plan`
4. `lane-history`
5. `current-run`
6. `review`
7. `verification`
8. `lint`
9. `session`

Under `guarded`, `definition-plan` is absent and no plan path is opened. Under `autonomous`, it is required and is acquired from the exact sibling path obtained by replacing the target's terminal `spec.md` with `plan.md`. The public workspace acquisition path reads it with feature 004's safe-file rules: one source-entry charge, at most 1,048,576 raw bytes, charge against the shared 4,194,304-byte inspection aggregate before parsing, strict UTF-8, regular file only, real no-symlink parents, no-follow open, `fstat`, complete bounded read, and path/identity/stability recheck.

For autonomous inspection, the exact source-entry formula becomes:

```text
directIdeas.length
+ 1 for tasks
+ 1 for definitionPlan
+ 1 for lane
+ lane.issues.length when lane.kind == "tracked"
+ currentRun.length
+ review.length
+ verification.length
+ lint.length
+ 1 when session is present
```

The normalized `definition-plan` body is exactly `{path,planDescriptor,ownerBindingHash,registryHash,selectedEntry?,contractHash?}`. `path` is the exact sibling plan. `planDescriptor` is `{sha256,byteLength}` over the complete plan bytes. `ownerBindingHash` binds exact `ideaPath`, `specPath`, and plan path. `registryHash` is `null` when both markers are absent or the hash of the canonical registry when present. `selectedEntry` and `contractHash` are both present only for one uniquely matched task entry. Full plan bytes never enter the model packet.

Lightweight selection uses the exact target task key. Tracked selection may occur only after feature 004's existing captured-Beads normalizer freshly proves one unique issue-to-task mapping for the exact `specPath`; the verified key is selection metadata and does not alter canonical tracked target identity. A tracked issue with no mapping, or any target with no matching registry row, produces a required `present` body with both optional fields absent. It is valid no-objective evidence, not missing evidence. Ambiguous or contradictory mapping remains a conflict and cannot select an objective. No Beads import, mirror, issue identity, or completion contract changes.

Required `definition-plan` statuses map exactly as follows under autonomous policy:

| Status | Deterministic blocker |
|---|---|
| `missing`, `stale`, `nontext`, or `overflow` | `evidence-incomplete` |
| `malformed` or `conflict` | `objective-source-conflict` |

The item participates unchanged in `Inspection.items`, descriptor limits, packet source ordering, packet overflow, blockers, and `evidenceHash`. `authorizeAttempt` and every objective candidate authorization reacquire the exact owner, plan, registry, selected entry, and mapping from authoritative inputs; a descriptor, owner binding, registry, selection, or contract mismatch is evidence drift or objective-source conflict with state unchanged.

### 4. Evaluation Sequences And RunState

The inherited closed `RunState` adds `policy.mode` and two optional invocation-local fields:

- `evaluationSequences`: at most 16 canonically sorted sequence rows. Each row retains at most 8 recent projected comparison references; all rows together retain at most 64 comparison references.
- `learningReviewRefs`: at most 16 canonically sorted projected review references.

The exact row shapes are defined in `contracts/schemas.md`. They contain canonical targets, durable identities, hashes, enum values, and projection identities only. They contain no full event, plan bytes, file bytes, checkpoint snapshots, file descriptors, process handles, evaluator handles, or opaque tokens. Loss, malformed state, over-limit state, or a reference without freshly verified projections stops work instead of reconstructing authority from history.

One sequence binds exact owner, plan descriptor, registry, selected entry, contract, evaluator, input, environment, conditions, rubric, and budget identities. It keeps a fixed baseline identity and an advancing retained-incumbent identity and at most one active checkpoint/candidate identity. The baseline identity is a checkpoint-independent, sequence-independent bootstrap state identity computed with the same `stateIdentity` form used for prestate and poststate — `SHA256(CJ({writeSetIdentity,files}))` over the frozen evaluated write set and the initial captured file-state descriptors — so it references neither `sequenceIdentity` nor `checkpointIdentity`. Because the evaluated write set is fixed by the frozen contract and registry entry, `writeSetIdentity` and this bootstrap baseline are available before `sequenceIdentity` is computed, so the identity order stays acyclic. The retained incumbent identity starts equal to the bootstrap baseline for the first comparison and, after any keep, advances to the kept candidate identity, while a discard leaves it unchanged and an unsettled stop leaves it null. A rebaseline sequence after explicit re-definition recomputes its own bootstrap baseline over the freshly proven retained-incumbent state under the new contract, with no reference to the prior sequence. No objective or no matching row creates no sequence and preserves the ordinary autonomous path.

### 5. CandidateWriteSet And Checkpoint Owner

The existing host dependency owns exactly one invocation-local context map keyed by canonical `checkpointIdentity`. `RunState` stores only the corresponding identities. The map is not a model input, evidence source, persistent ledger, or exported transaction API.

`CandidateWriteSet` is exactly `{candidatePaths,protectedPaths}`. Both arrays are sorted and duplicate-free; their union contains 1 through 64 exact normalized workspace file paths and is disjoint. Candidate paths are the only files the candidate may change. Protected paths are inspected to prove they remain unchanged. Every path is a regular file or missing with an existing real directory parent; directories, symlinks, special files, unresolved parents, escapes, and unsupported owner/effect classes refuse before mutation.

Every existing file is at most 1,048,576 bytes and every complete prestate, poststate, or restoration capture is at most 4,194,304 aggregate bytes. Acquisition uses real-parent checks, no-follow open, `fstat`, complete bounded reads, and identity/stability rechecks before and after each capture. A missing path is represented by state, not invented bytes. Candidate and protected paths use the same checks after mutation.

Identity derivations are exact:

```text
writeSetIdentity = SHA256(CJ(CandidateWriteSet))
stateIdentity = SHA256(CJ({writeSetIdentity,files:orderedFileStateDescriptors}))
bootstrapStateIdentity = stateIdentity(initialEvaluatedState)
prestateIdentity = stateIdentity(prestate)
checkpointIdentity = SHA256(CJ({
  target:canonicalTarget(target),sequenceIdentity,contractHash,
  writeSetIdentity,prestateIdentity
}))
poststateIdentity = stateIdentity(poststate)
candidateIdentity = SHA256(CJ({checkpointIdentity,poststateIdentity}))
```

An ordered file state descriptor is exactly `{path,state:"missing"}` or `{path,state:"file",sha256,byteLength}`. Snapshot bytes needed for exact restoration remain private to the bounded host context and never enter `RunState`, an event, a gate record, or a model packet.

`bootstrapStateIdentity` applies the `stateIdentity` form to the sequence's initial captured evaluated-state descriptors and references neither `sequenceIdentity` nor `checkpointIdentity`. Because the evaluated write set is frozen by the contract and registry entry, `writeSetIdentity` and `bootstrapStateIdentity` are available before the sequence exists. A sequence's baseline identity is this fixed bootstrap value for its whole life; its retained incumbent identity starts equal to it and advances to the kept `candidateIdentity` after each keep, stays unchanged on discard, and is null when unsettled. A rebaseline sequence recomputes its own bootstrap baseline over the freshly proven retained-incumbent state under the new contract. The resulting order `writeSetIdentity → bootstrapStateIdentity → baselineCandidateIdentity → sequenceIdentity → checkpointIdentity → candidateIdentity` is acyclic, so no consumed identity lacks a derivation.

The lifecycle is complete and fail-closed:

| Transition | Required owner action | Release rule / outcome |
|---|---|---|
| Preflight refusal | Reject unsupported owner, effect, path, resource, or write set before capture or mutation | No context exists |
| Capture failure | Abandon partial private capture and perform no mutation | No complete context is inserted |
| Authorization refusal after capture | Re-capture and prove prestate unchanged | Release only after exact unchanged proof; otherwise unsettled hard stop |
| Candidate success | Capture exact poststate and verify candidate/protected scope | Keep context pending through comparison and all five gates |
| Exception or timeout | Restore complete prestate through the owning execution path and re-capture | Release only after exact restoration; otherwise unsettled hard stop |
| Poststate capture failure | Restore complete prestate and re-capture | Release only after exact restoration; otherwise unsettled hard stop |
| Keep | Require qualifying comparator relation and all five gates pass, then re-capture the evaluated poststate | Release only when it still equals the kept candidate state |
| Discard, worse, incomparable, or evaluator crash | Restore complete prestate first and re-capture | Release only after exact restoration |
| Verification or review hard stop after mutation | Treat as non-keep, restore first, project the comparison, then stop | Release only after exact restoration and projection proof |
| Restore failure | Retain context and identities as unsettled | Hard stop; never release or clear |
| Release failure | Retain context and identities as unsettled | Hard stop; never report release |
| Controlled invocation end | Project/close every sequence, then settle each context as unchanged prestate, kept evaluated poststate, or exact restoration | Any missing proof blocks controlled end and retains state |
| Process loss | No recovery claim | Explicitly out of scope; no persisted journal is introduced |

Release is legal only after proof of unchanged prestate, a kept evaluated poststate, or exact restoration. Pending or unsettled contexts are never silently released, overwritten, or cleared. This owner is not Git, feature-definition atomic batching, or a general transaction engine.

### 6. Exactly Five Authoritative Gates

Candidate retention has exactly five authoritative gates in this fixed order:

1. `authorization`
2. `checkpoint`
3. `hard-constraints`
4. `comparison`
5. `independent-review`

Callers and model output may provide only source records accepted by an existing authority-specific normalizer. They cannot submit a gate name, status, pass, fail, blocker, identity, or verdict as authority. Each normalizer reconstructs closed records from authoritative captures, computes every record identity, sorts the identities, derives `evidenceIdentity = SHA256(CJ({gate,recordIdentities}))`, and returns `pass`, `fail`, or `incomplete`. The runtime constructs one `GateSet` containing all five results in fixed order and derives `gateSetIdentity`; no sixth gate, alias, optional gate, or caller-selected subset exists.

| Gate | Required authoritative normalized evidence | Pass rule |
|---|---|---|
| `authorization` | Exact owner, autonomous policy, fresh Inspection including `definition-plan`, active-lane authority, pending/counter state, and no hard blocker | Every binding is fresh and exact and the existing owner authorizes the bounded candidate |
| `checkpoint` | CandidateWriteSet, prestate/checkpoint identities, present host context, and candidate poststate identity | Context is present and settled for evaluation; paths and protected state match |
| `hard-constraints` | One fixed mandatory candidate-bound completion verification plus every registry-declared lint/verification constraint | Every expected record is fresh, uniquely bound, and passed |
| `comparison` | Baseline, incumbent, and candidate observations plus any required pairwise/subjective judgments | All observations are `ok`, same kind and contract, no drift exists, and the deterministic comparator derives one relation |
| `independent-review` | One ordinary candidate-bound readiness review and, only for an equivalent tie that predeclared it, one distinct simplicity/risk tie review | Readiness accepts; required tie review independently prefers the candidate |

The mandatory hard-constraint record is always required even when the registry declares no checks. It is tied to exact target, checkpoint, candidate, and contract and uses reserved check ID `candidate-bound-completion`. Registry checks cannot use that ID. Missing, stale, malformed, conflicting, failed, timed-out, or crashed mandatory or declared records never pass. A registry cannot suppress the fixed verification by omitting verification constraints.

Subjective or ordinal-pairwise evaluator judgment is comparison evidence with evaluator and observation identities. Ordinary readiness review is a separate independent-review record with a different record kind and identity. A tie review, when predeclared, is also distinct from both. None can substitute for another.

### 7. Comparators, Retention, And Drift

All observations bind target, candidate, contract, evaluator, inputs, environment, conditions, rubric, and budget. Baseline, incumbent, and candidate observations must have `status: ok`, the same objective kind, the same contract hash, and the active binding identities. Failure, timeout, crash, malformed output, missing observation, or disagreement is incomparable.

- **Numeric**: canonical decimals use exact scaled-integer arithmetic. Each role has the contract's fixed odd sample count and median aggregation. For direction-normalized delta `candidateMedian - incumbentMedian`, absolute delta at or below tolerance is `equivalent`; delta at or above the strictly larger meaningful threshold is `better`; delta at or below the negative threshold is `worse`; an in-between delta is `incomparable`.
- **Ordinal levels**: the contract freezes 2 through 32 unique levels from worst to best and one positive meaningful step count. Equal levels are `equivalent`; a candidate at least the required steps higher is `better`; at least the required steps lower is `worse`; a smaller nonzero move is `incomparable`.
- **Ordinal pairwise**: exactly two frozen independent evaluators apply the frozen pairwise rubric. Identical `better`, `equivalent`, or `worse` judgments produce that relation; any disagreement or `incomparable` judgment is `incomparable`.
- **Subjective**: exactly two frozen independent evaluators apply the frozen comparative rubric and return `better`, `equivalent`, `worse`, or `incomparable`. Only unanimous non-incomparable agreement produces that relation; disagreement is `incomparable`.

An equivalent candidate defaults to discard. It may qualify only when the contract predeclares an independent `simplicity` or `risk` tie review with its own frozen rubric and that distinct review prefers the candidate. Anti-gaming, correctness, compatibility, resource regressions, and system regressions are enforced by hard constraints and independent review, not hidden inside an objective score.

Keep is derived only for `better`, or a qualifying `equivalent` tie, when all five gates pass. Every other relation or gate result is non-keep and restores first. A better score never grants authority, bypasses restoration, or completes a task.

The active evaluation binding is the canonical identity of owner binding, plan descriptor, registry, selected entry/contract, evaluator, input, environment, condition, rubric, and budget. Any change before or during a candidate yields `incomparable`, restores the incumbent, projects and closes the old sequence, and stops. Intentional change is allowed only by explicit brainstorm plus define between candidates. After re-definition, the old sequence is projected closed, the incumbent state is proven under the checkpoint owner, and a fresh observation establishes a new baseline. No result, threshold, judgment, or candidate crosses the contract boundary.

No registry or no selected entry preserves no-objective behavior. Task completion or block closes and projects the sequence before the lane transition. Objective-directed optimization never continues after that task transition unless another scoped task independently selects its own contract.

### 8. Events, Projection, Learning, And Audit

`ObjectiveComparisonEvent`, `EvaluationSequenceClosedEvent`, and `LearningReviewEvent` are closed canonical records from `contracts/schemas.md`. Each includes its own recomputed `eventHash` and must serialize to at most 16,384 UTF-8 bytes. Events contain identities and bounded semantic findings only, never file bytes, plan bytes, checkpoint snapshots, handles, or model packets.

Both projections carry the exact same event object:

- Existing current-run evidence appends one canonical record envelope whose substantive value is exactly `{event}`; optional presentation remains feature 004's shallow non-authoritative envelope.
- Lightweight lane history appends one exact line under the existing terminal `## Lightweight Execution History`: ASCII prefix `- dude-run-event: ` followed by `CJ({event})`.
- Tracked lane history appends that same exact line to the exact issue's existing authoritative notes/history through the tracked lane owner; the subsequent captured issue history must expose it for normalization. This changes no import, mirror, issue identity, or task mapping rule.

Fresh projection verification reacquires current-run evidence and exact lane history, requires exactly one byte-equivalent event with the recomputed `eventHash` on each surface, and derives separate current-run and lane projection identities. Missing, duplicate with conflicting bytes, wrong-target, stale, malformed, or hash-mismatched projection blocks release, eviction, task transition, sequence closure, or controlled end.

A complete comparison is projected as an `ObjectiveComparisonEvent` before its full comparison data is reduced to or evicted from a RunState reference. Closing or rebaselining a sequence, task completion or block, and controlled invocation end project an `EvaluationSequenceClosedEvent` before state or context release. The runtime retains at most eight recent projected comparison references per sequence and 64 total; pressure never evicts an unprojected comparison.

A repeated equivalent approach or rejection produces one full bounded `LearningReviewEvent` containing the exact repeat identities, evidence identity, bounded findings, considered alternative identities, selected materially different approach and discriminating check when one exists, or `no-progress`. It is projected and freshly verified on both surfaces before its reference can be evicted or a controlled invocation can end. After every learning review, authorization rebuilds the complete fresh Inspection, including `definition-plan`; review evidence never authorizes against its earlier evidence snapshot.

The deterministic audit renderer reads bounded RunState references plus freshly acquired existing history. It emits task outcomes, recovery/objective/learning cycles and reasons, changed files, verification and review outcomes, autonomous decisions, projection state, remaining risks, and hard stops. It creates no artifact and no second ledger.

## Phases

**Phase 1 - Grammar And Policy Plumbing**: add explicit `guarded`/`autonomous` parsing and `policy.mode`; preserve feature 004 validation, numeric budget behavior, and no-selection guarded behavior. Focused grammar and RunState tests.

**Phase 2 - Autonomous Authorization And Sequential Continuation**: cross only the settled routine recoverable checkpoints under autonomous policy through existing authorization; preserve all hard stops, verification, independent review, budgets, one pending attempt, and sequential continuation to disjoint ready work.

**Phase 3 - Definition Evidence, Evaluation, Checkpoint, And Learning Flow**: add explicit definition compilation and marker extraction, autonomous-only `definition-plan` acquisition, exact tracked mapping selection, integrated Inspection identity, bounded evaluation sequences and learning references, CandidateWriteSet/checkpoint lifecycle, five gate normalizers, numeric/ordinal/subjective comparators, drift handling, retain-or-restore flow, and post-review fresh authorization.

**Phase 4 - Learning Projection And Audit**: add all three bounded events, current-run and exact Lightweight/tracked lane projections, fresh dual-surface verification before eviction/closure/end, task completion/block closure, reference-pressure behavior, and the concise audit renderer.

**Phase 5 - Contracts, Docs, And Projection Parity**: update the two owning skills, schema contract, command/workflow/reference documentation, current-format fixtures, build tests, and generated `.github` projection. Keep examples escaped or placeholder-only and prove feature 005's plan has zero active registry regions.

**Phase 6 - Full Proof And Independent Review**: run focused runtime and contract tests, the complete discovered suite, Dude lint, compose verification, pristine release build and lint, generated projection checks, and independent Tester and Code Reviewer review over the same fresh evidence.

## Complexity Justification

- One optional plan-owned registry is the smallest technical carrier that honors explicit definition intent without runtime prose parsing.
- One `definition-plan` EvidenceItem integrates owner/path/hash freshness into the existing packet instead of creating a parallel objective packet.
- One host context map supplies exact restoration without Git, durable snapshots, or a generic transaction API.
- Exactly five deterministic gates separate authority, checkpoint integrity, hard correctness, comparison, and independent review without allowing objective evidence to substitute for another concern.
- Existing current-run and lane history retain full bounded events, so RunState needs only bounded references and no second ledger.

## Rejected Complexity

- No generic metrics DSL, optimizer framework, champion manager, experiment database, second evidence packet, or durable objective ledger.
- No runtime parsing of idea, spec, task, issue, or history prose for objectives.
- No new module, lane, board, scheduler, concurrency, automatic commit/reset, or cross-task optimization.
- No Git checkpoint, definition atomic batch reuse, directory snapshot, process-loss journal, or general transaction engine.
- No caller-supplied gate status, evaluator authority, objective-based task completion, or cross-contract comparison.

## Source Layout

No new source module is added. Existing surfaces may change as follows:

    src/skills/dude-work/recovery.mjs
    src/skills/dude-work/recovery.test.mjs
    src/skills/dude-work/SKILL.md
    src/skills/dude-feature-definition/SKILL.md
    scripts/current-format-contract.test.mjs
    scripts/build-dev.test.mjs
    scripts/build-release.test.mjs
    docs/commands.md
    docs/workflow.md
    docs/reference.md
    .github/  # generated projection; never hand-edited

Definition artifacts are limited to this feature's `spec.md`, `plan.md`, and `contracts/schemas.md`, plus the exact owner log event. `tasks.md` remains coordinator-owned and is not part of this delegated correction.

## Proposed Task Reconciliation

T001 through T003 are kept byte-for-byte in meaning and text. T004 through T008 retain their durable keys, open states, and exact dependency metadata but change one-to-one to cover the approved objective contract. There are no dropped or new task keys and no archive, discovered-work, or execution-history change.

### Proposed Canonical Task Units

## Phase 1: Grammar And Policy Plumbing

- [ ] T001@a3f1c9d2 [US1] Extend the `@dude work` invocation grammar and transient `RunState` in `src/skills/dude-work/recovery.mjs` and `src/skills/dude-work/recovery.test.mjs` with an explicit opt-in policy selector defaulting to `guarded`, plumbed as `policy.mode` alongside the compatibility `policy.parallel: 1`, per `contracts/schemas.md`. Preserve every existing invocation rejection and byte-for-byte guarded (and no-selection) behavior; reject unknown, duplicate, or invalid policy values before mutation; and keep `autonomous` consistent with the existing recovery opt-in. Verify with `node --test src/skills/dude-work/recovery.test.mjs`.

## Phase 2: Autonomous Authorization And Sequential Continuation

- [ ] T002@b7e4082a [US1] Under `policy.mode: autonomous`, auto-authorize the next guarded attempt at recoverable post-block, post-failure, and post-review checkpoints through the existing `authorizeAttempt` path in `src/skills/dude-work/recovery.mjs` and its test, while preserving every hard stop in the settled taxonomy, verification, independent review, both budgets, the one-pending-authorization rule, and evidence-drift. Prove default and explicit `guarded` behavior is unchanged and every hard-stop category still stops. Verify with `node --test src/skills/dude-work/recovery.test.mjs`.
    deps: T001@a3f1c9d2
- [ ] T003@c1d5e6f3 [US5] Extend `src/skills/dude-work/recovery.mjs` and its test so autonomous scheduling stays sequential: finish the current authorized bounded recovery attempt, then continue with independent ready work only when its dependencies and change sets are disjoint after a hard stop, and revisit a blocked task only with new evidence or a materially different approach. Add no concurrency or fan-out. Verify with `node --test src/skills/dude-work/recovery.test.mjs`.
    deps: T002@b7e4082a

## Phase 3: Definition Evidence, Evaluation, Checkpoint, And Learning Flow

- [ ] T004@d9a20b74 [US6] Add explicit-definition ObjectiveRegistry compilation rules to `src/skills/dude-feature-definition/SKILL.md` and extend `src/skills/dude-work/recovery.mjs` plus its test with exact marker extraction and the autonomous-only `definition-plan` EvidenceItem between `task-history` and `lane-history`. Enforce the closed bounded registry, exact owner/plan/registry/contract hashes, zero-region no-objective behavior, fresh unique tracked issue-to-task mapping without import or mirror changes, shared source/body/packet accounting, exact blocker mapping, and fresh authorization-time reacquisition. Prove guarded never reads plan evidence and this feature's plan has zero active registry regions. Verify with `node --test src/skills/dude-work/recovery.test.mjs scripts/current-format-contract.test.mjs`.
    deps: T002@b7e4082a
- [ ] T005@e4c8f1a6 [US6] Extend `src/skills/dude-work/recovery.mjs` and its test with bounded evaluation sequences and learning-review references, the host-owned checkpoint context map and complete CandidateWriteSet acquire/capture/restore/release lifecycle, exact checkpoint/candidate identities, exactly five derived authoritative gates, candidate-bound mandatory verification plus declared hard constraints, numeric/ordinal/subjective comparators, drift/rebaseline handling, and keep-or-restore flow. Prove callers cannot submit gate status, unsupported effects refuse before mutation, every non-keep restores first, and pending or unsettled contexts are never released. Verify with `node --test src/skills/dude-work/recovery.test.mjs`.
    deps: T003@c1d5e6f3, T004@d9a20b74

## Phase 4: Learning Projection And Audit

- [ ] T006@f2b3d7e1 [Shared] Add bounded LearningReview, ObjectiveComparison, and EvaluationSequenceClosed events, dual current-run and exact lane-history projection with fresh verification before eviction/close/block/end, post-review evidence rebuild, reference-pressure handling, task-scoped sequence closure, and the concise audit renderer to `src/skills/dude-work/recovery.mjs` and its test. Update `src/skills/dude-work/SKILL.md` as the single detailed runtime prompt owner while keeping other prompt surfaces terse. Create no second ledger and permit no post-task optimization. Verify with `node --test src/skills/dude-work/recovery.test.mjs scripts/current-format-contract.test.mjs`.
    deps: T002@b7e4082a, T003@c1d5e6f3, T004@d9a20b74, T005@e4c8f1a6

## Phase 5: Contracts, Docs, And Projection Parity

- [ ] T007@0a9c4b58 [Shared] Update `docs/commands.md`, `docs/workflow.md`, and `docs/reference.md` plus `scripts/current-format-contract.test.mjs`, `scripts/build-dev.test.mjs`, and `scripts/build-release.test.mjs` for policy selection, autonomous-only definition-plan evidence, registry placeholders, objective comparison/restoration, five gates, learning and sequence projections, audit, and no-objective behavior. Keep `contracts/schemas.md`, runtime validators, owning prompts, generated core, and release projection in exact parity; rebuild generated core without hand-editing `.github`. Verify with `node scripts/build-dev.mjs` then `node --test scripts/current-format-contract.test.mjs scripts/build-dev.test.mjs scripts/build-release.test.mjs`.
    deps: T006@f2b3d7e1

## Phase 6: Full Proof And Independent Review

- [ ] T008@1d6e2f93 [Shared] Run the full verification and independent review over the complete autonomous objective contract: focused recovery and prompt-contract tests, full discovered suite, `dude-lint`, compose verify, pristine release build and lint, and `.github` diff gates, then route the same fresh evidence independently to the Tester and Code Reviewer. Prove guarded performs no plan read; no objective is inferred; all registry/evidence bounds and tracked mappings fail closed; all five gates and candidate-bound verification are mandatory; comparators, drift, restoration, dual projections, bounded eviction, task closure, and audit satisfy the schema; and no new persistent ledger, module, Git behavior, or opaque RunState data exists.
    deps: T007@0a9c4b58

### Traceability

| Requirement and success meaning | Plan phase | Proposed tasks |
|---|---|---|
| FR-001 / SC-001: explicit policy and unchanged guarded default | Phase 1 | T001@a3f1c9d2, T002@b7e4082a, T008@1d6e2f93 |
| FR-002, FR-007 / SC-002: routine autonomy preserves all hard stops, verification, and review | Phase 2 | T002@b7e4082a, T008@1d6e2f93 |
| FR-006 / SC-002: sequential continuation and no concurrency | Phase 2 | T003@c1d5e6f3, T008@1d6e2f93 |
| FR-003, FR-004, FR-008, FR-010 / SC-003, SC-004: revision authorization, learning, materially different alternatives, capability reuse, and deterministic authority | Phase 3 | T004@d9a20b74, T005@e4c8f1a6, T006@f2b3d7e1, T008@1d6e2f93 |
| FR-011 / SC-007: explicit compilation, exact evidence selection, and no-objective behavior | Phase 3 | T004@d9a20b74, T007@0a9c4b58, T008@1d6e2f93 |
| FR-012, FR-013, FR-014 / SC-008, SC-009, SC-010: comparable kinds, checkpoints, five gates, restoration, drift, and rebaseline | Phase 3 | T005@e4c8f1a6, T007@0a9c4b58, T008@1d6e2f93 |
| FR-005, FR-009, FR-015 / SC-005, SC-006, SC-011, SC-012: audit, dual projection, bounded retention, no second ledger, and task-scoped closure | Phase 4 | T006@f2b3d7e1, T007@0a9c4b58, T008@1d6e2f93 |
| Contract, prompt, docs, generated-core, and release parity | Phase 5 | T007@0a9c4b58, T008@1d6e2f93 |
| Full behavioral proof and independent verdict | Phase 6 | T008@1d6e2f93 |

## Validation Strategy

Focused implementation checks planned for execution:

    node --test src/skills/dude-work/recovery.test.mjs
    node --test scripts/current-format-contract.test.mjs scripts/build-dev.test.mjs scripts/build-release.test.mjs

Full repository checks planned for execution:

    node scripts/build-dev.mjs
    find . -path ./dist -prune -o -name '*.test.mjs' -print0 | xargs -0 node --test
    node .github/skills/dude-lint/lint.mjs .
    node .github/skills/dude-compose/compose.mjs verify
    RELEASE_ROOT="$(mktemp -d)"
    node scripts/build-release.mjs --out "$RELEASE_ROOT/bundle" --tag v0.0.0
    node "$RELEASE_ROOT/bundle/.github/skills/dude-lint/lint.mjs" "$RELEASE_ROOT/bundle"
    git status --porcelain -- .github
    git diff --check

Bare `node --test` under-discovers nested tests. The coordinator, not this definition correction, runs these commands and supplies the same fresh evidence to independent Tester and Code Reviewer routes.

## Risks

- A marker parser could self-match its own documentation; all examples must remain split, escaped, or placeholder-only, and zero active regions in this plan is a contract fixture.
- Adding a required autonomous source changes source-entry and packet pressure; boundary tests must cover source 64/65, body and aggregate limits, descriptor 64/65, item 16/17, and packet byte 65,536/65,537 with `definition-plan` in exact order.
- Tracked task mapping can accidentally become new identity or import authority; selection must use only the existing fresh unique mapping and preserve issue-only canonical tracked identity.
- Checkpoint release bugs can lose the incumbent; every lifecycle row needs fault injection and release must remain impossible while pending or unsettled.
- Semantic evaluators may disagree or game a rubric; disagreement is incomparable, deterministic code derives the relation and five gate results, and hard constraints plus independent review retain veto authority.
- Projection failure can silently lose bounded history; eviction, rebaseline, task transition, and controlled end must all block until both exact projections are freshly verified.
- Intentional objective change can produce invalid cross-contract claims; explicit brainstorm plus define must close the old sequence and prove a new baseline before another candidate.
