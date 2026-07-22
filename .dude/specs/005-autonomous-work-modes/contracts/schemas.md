# Autonomous Work Modes Schemas

## Authority And Integration

This file extends, rather than composes beside, the six closed recovery records in `.dude/specs/004-pre-work-log-learning/contracts/schemas.md`. The inherited `Target` and `Assessment` shapes remain unchanged. This contract explicitly replaces the inherited field definitions for `EvidenceItem.source`, `Inspection` source ordering, raw evidence input/accounting, `Blocker.code`, `RunState.policy`, and optional `RunState` objective fields. Every inherited rule not explicitly changed below remains authoritative.

Closed feature 005 records are `ObjectiveRegistry`, `CandidateWriteSet`, `CheckpointRecord`, `ObjectiveObservation`, `EvaluatorJudgment`, `ComparisonDecision`, `GateResult`, `GateSet`, `ObjectiveComparisonEvent`, `EvaluationSequenceClosedEvent`, `LearningReviewEvent`, `ProjectionReference`, and `AuditSummary`. Nested records named below are closed value shapes, not extensible maps. Unknown, duplicate, conditionally forbidden, sparse, non-data, or noncanonical fields reject.

All feature 004 canonical JSON (`CJ`), UTF-8, `Hash`, path, target, descriptor, packet, and evidence-hash rules apply. Every hash in this file is lowercase SHA-256. No record in this file permits raw file bytes, complete plan bytes, checkpoint snapshot bytes, file descriptors, process handles, evaluator handles, callbacks, capabilities, class instances, symbols, `undefined`, or another opaque value. Private bounded snapshot bytes remain only inside the existing host dependency's invocation-local context map and never cross a schema boundary.

## Fixed Scalar And Collection Bounds

- `Identifier` is ASCII matching `^[a-z0-9][a-z0-9._:/@-]{0,127}$`.
- `TaskKey` retains feature 004's `^T\d{3,}@[a-z0-9]{8}$` form.
- `ShortText` is a Unicode scalar string of 1 through 1,024 UTF-8 bytes.
- `FindingText` is a Unicode scalar string of 1 through 512 UTF-8 bytes.
- A normalized workspace path uses feature 004's path rules and is at most 512 UTF-8 bytes.
- `CanonicalDecimal` is at most 64 ASCII bytes, has at most 30 integer digits and 18 fractional digits, has no plus sign, exponent, leading integer zero, or trailing fractional zero, and matches `^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$`; exact `-0` is forbidden.
- A nonnegative decimal rejects a leading `-`. A positive decimal is greater than exact zero.
- Unless a smaller bound is stated, every set-like array is sorted by UTF-8 bytes, duplicate-free, and has at most 16 members.
- Every rubric has 1 through 16 criteria. Each criterion is exactly `{id,text}`; IDs are unique `Identifier` values; each text is `ShortText`; total criterion text is at most 8,192 UTF-8 bytes; and `CJ(rubric)` is at most 16,384 UTF-8 bytes.
- Every event including `eventHash` is at most 16,384 UTF-8 bytes as `CJ(event)`.

## Work Policy Extension

The inherited `RunState.policy` exact shape becomes `{overall,recovery,recover,untilBlocked,parallel,mode}`. All inherited budget and compatibility rules remain. `parallel` is literal safe integer `1`. `mode` is exactly `guarded` or `autonomous`; invocation omission resolves to `guarded` before RunState construction. `guarded` never acquires a `definition-plan` source. `autonomous` relaxes no hard stop, budget, verification, review, owner, evidence, lane, or close rule.

## ObjectiveRegistry

### Marker And Body Contract

The exact active start marker is assembled from `<`, `!-- dude:objective-registry:start --`, and `>`; the end marker substitutes `end`. A marker is active only when it occupies the complete logical line with no leading or trailing byte, outside Markdown inline code spans and fenced code blocks. Examples use placeholders only:

```text
<OBJECTIVE_REGISTRY_START>
<CANONICAL_OBJECTIVE_REGISTRY_JSON>
<OBJECTIVE_REGISTRY_END>
```

The scanner counts active starts and ends independently. Zero starts and zero ends is valid no-registry. Exactly one start and one later end with exactly one nonempty logical line between them is the only registry form. A lone, duplicate, reversed, nested, or misordered marker, an extra body line, or a body that is not strict UTF-8 duplicate-key-free `CJ(ObjectiveRegistry)` is `malformed`. A valid registry that disagrees with the exact owner, sibling plan path, selected task, or freshly verified tracked mapping is `conflict`.

### Root, Entry, And Provenance

`ObjectiveRegistry` is exactly:

| Field | Type | Rules |
|---|---|---|
| `version` | safe integer | Literal `1` |
| `owner` | object | Exact `{ideaPath,specPath}` |
| `entries` | `ObjectiveEntry[]` | 1 through 64 rows sorted uniquely by full `taskKey` |

`owner.ideaPath` is one exact direct `.dude/ideas/<name>.md` path. `owner.specPath` is one exact canonical spec path and must equal the uniquely resolved defined owner. The containing plan is derived only as the exact sibling `plan.md`; it is not a registry field.

Each entry is exactly `{taskKey,provenance,contract}`. `provenance` is exactly `{kind,refs}`. `kind` is `idea`, `spec`, or `task`. `refs` has 1 through 8 rows sorted by `path`, then `section`; each row is exactly `{path,section}`. A path must be the exact owner idea, exact spec, or sibling `tasks.md`; `section` is an `Identifier`. Provenance is definition-compiled and hash-significant. Runtime never opens a provenance path or parses its prose to recover an objective.

### EvaluationContract

`contract` is exactly `{id,subject,kind,evaluators,inputs,environment,conditions,budget,hardConstraints,tieRule,comparator}`.

| Field | Type | Rules |
|---|---|---|
| `id` | `Identifier` | Unique within the registry |
| `subject` | `ShortText` | Frozen objective subject |
| `kind` | enum | `numeric`, `ordinal`, or `subjective` |
| `evaluators` | object[] | Exact evaluator identities below |
| `inputs` | object[] | 1 through 16 rows sorted by `id` |
| `environment` | object[] | 1 through 16 rows sorted by `id` |
| `conditions` | `Identifier[]` | 1 through 16 sorted unique IDs |
| `budget` | object | Exact fixed comparison budget |
| `hardConstraints` | object[] | 0 through 16 sorted unique declarations |
| `tieRule` | object | Exact closed tie rule |
| `comparator` | object | Exact kind-compatible comparator variant |

An evaluator is exactly `{id,version}`, both `Identifier`. Numeric and ordinal-level contracts require one evaluator. Ordinal-pairwise and subjective contracts require exactly two distinct evaluators sorted by `id`, then `version`.

Each input is exactly `{id,kind:"file",path,sha256}` or `{id,kind:"value",valueHash}`. Each environment row is exactly `{id,valueHash}`. IDs are `Identifier`; paths are normalized workspace paths; hashes are `Hash`.

Budget is exactly `{comparisons,durationMs,tokens,costMicrounits}`. `comparisons` is 1 through 64; other fields are nonnegative safe integers. Zero is a frozen zero allowance, not unlimited.

Each hard constraint is exactly `{kind,id,target}`. `kind` is `lint` or `verification`; `id` is an `Identifier`; `target` is a normalized path or canonical target identifier at most 512 UTF-8 bytes. Rows sort by `kind`, `id`, then `target`. Reserved ID `candidate-bound-completion` is forbidden because runtime always adds it independently.

`tieRule` is exactly `{mode:"discard"}` or `{mode:"independent-review",purpose,rubric}`. `purpose` is `simplicity` or `risk`. `rubric` is exactly `{id,criteria}` with bounded criteria. A tie rule never waives ordinary readiness review.

Comparator variants are exactly:

```text
{mode:"numeric",unit,direction,sampleCount,aggregation,tolerance,meaningfulThreshold}
{mode:"ordinal-levels",levels,meaningfulSteps}
{mode:"ordinal-pairwise",rubric}
{mode:"subjective",rubric}
```

- Numeric requires `kind: numeric`; `unit` is `Identifier`; `direction` is `maximize` or `minimize`; `sampleCount` is fixed odd 1 through 15; `aggregation` is literal `median`; `tolerance` is nonnegative `CanonicalDecimal`; `meaningfulThreshold` is positive and exactly greater than tolerance.
- Ordinal levels requires `kind: ordinal`; `levels` has 2 through 32 unique `Identifier` values in semantic order from worst to best; `meaningfulSteps` is positive and less than `levels.length`.
- Ordinal pairwise requires `kind: ordinal`, exactly two evaluators, and a bounded frozen rubric.
- Subjective requires `kind: subjective`, exactly two evaluators, and a bounded frozen rubric.

`registryHash = SHA256(UTF8(CJ(ObjectiveRegistry)))`. `contractHash = SHA256(UTF8(CJ(contract)))`. Registry omission yields no contract and no objective.

## Integrated EvidenceItem And Inspection

### Exact Source Order

The inherited `EvidenceItem.source` enum becomes exactly:

```text
owner-log
task-history
definition-plan
lane-history
current-run
review
verification
lint
session
```

All other EvidenceItem fields and descriptor/text/status rules remain. Under `guarded`, no `definition-plan` descriptor exists and no plan read occurs. Under `autonomous`, exactly one required descriptor exists in this position, including no-registry and no-match cases.

### Acquisition And Accounting

The internal raw input shape is exactly:

```text
{
	directIdeas:[{path,bytes}],
	tasks:{path,bytes},
	definitionPlan?:{path,bytes},
	lane:{kind:"lightweight"}|{kind:"tracked",listBytes,issues:[{detailBytes,historyBytes}]},
	currentRun:[{target,state,outcomeHash,bytes}],
	review:[{target,state,outcomeHash,bytes}],
	verification:[{target,state,outcomeHash,bytes}],
	lint:[{target,state,outcomeHash,bytes}],
	session?:{target,availability,bytes?}
}
```

`definitionPlan` is forbidden under guarded and required under autonomous. Public inspection derives its path from `target.specPath` and acquires it directly. Callers cannot supply a normalized plan item, status, requirement bit, registry, contract, owner binding, descriptor, or blocker.

Autonomous source-entry count is exactly:

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

Guarded retains feature 004's formula without `definitionPlan`. The plan body counts once, is at most 1,048,576 raw bytes, and is charged before parsing against the shared 4,194,304-byte aggregate after tasks and before lane captures. It must be strict UTF-8 from a regular file with real parents, no symlink/escape, no-follow open, `fstat`, complete bounded read, and post-read path/identity/stability recheck. Inherited 64-source, 64-descriptor, 16-packet-item, and 65,536-packet-byte rules remain.

### Normalized Definition-Plan Body

The normalized body is exactly `{path,planDescriptor,ownerBindingHash,registryHash,selectedEntry?,contractHash?}`. `planDescriptor` is `{sha256,byteLength}` over complete raw plan bytes. `ownerBindingHash = SHA256(CJ({ideaPath,specPath,planPath}))` using fresh exact owner and `planPath === path`. `registryHash` is `null` for no registry or the hash above. `selectedEntry` and `contractHash` are both absent or both present; when present the complete selected entry recomputes the hash. Full plan bytes are omitted.

Lightweight selection uses exact `Target.taskKey`. Tracked selection requires the existing captured-Beads normalizer to freshly verify one unique issue-to-task mapping under exact `specPath`; the key selects a row but remains outside canonical tracked identity. A tracked issue with no mapping, any target with no matching row, and feature-only inspection all produce required `present` evidence with optional fields absent. No match or unmapped tracked issue is never `missing`. No import, mirror, issue identity, or completion contract changes.

Marker/body invalidity is `malformed`. Exact owner, path, registry owner, selected key, or mapping contradiction is `conflict`. A complete plan identity change relative to assessed evidence is `stale` or inherited evidence drift according to acquisition stage.

### Inspection And Blockers

`Inspection.items`, descriptor ordering, packet projection, blockers, and `evidenceHash` include `definition-plan` exactly like every required item. No parallel packet or evidence hash exists.

Add `objective-source-conflict` to `Blocker.code`. Required autonomous plan status maps exactly:

| Status | Blocker code |
|---|---|
| `missing`, `stale`, `nontext`, `overflow` | `evidence-incomplete` |
| `malformed`, `conflict` | `objective-source-conflict` |

No-registry, no-match, and unmapped tracked issue are `present` and produce no objective blocker. Authorization freshly reacquires owner, plan, lane mapping, registry, selection, and contract. Any assessed-versus-fresh Inspection mismatch remains `evidence-drift` with RunState byte-equivalent.

## RunState Extension

The inherited required fields remain `policy`, `overallUsed`, `recoveryUsed`, `pending`, and `completed`. Exactly two optional fields are added: `evaluationSequences` and `learningReviewRefs`. Absence means an empty array. No other objective state field is allowed.

### EvaluationSequence

`evaluationSequences` has at most 16 rows sorted uniquely by `sequenceIdentity`. Each row is exactly:

```text
{
	sequenceIdentity,target,taskKey,ownerBindingHash,planDescriptor,registryHash,
	contractHash,bindingIdentity,baselineCandidateIdentity,incumbentCandidateIdentity,
	state,recentComparisons,activeCheckpointIdentity?,activeCandidateIdentity?
}
```

- `target` is canonical target identity. `taskKey` is the selected durable registry key; for tracked work it remains verified mapping metadata outside canonical target identity.
- `registryHash`, `contractHash`, `bindingIdentity`, baseline identity, and incumbent identity are `Hash`.
- `baselineCandidateIdentity` and `incumbentCandidateIdentity` are evaluated-state identities, not opaque tokens: each equals a bootstrap `stateIdentity` (`bootstrapStateIdentity` in `CandidateWriteSet` below) at origin and a kept `candidateIdentity` after a keep. `baselineCandidateIdentity` is the fixed `bootstrapStateIdentity` of the sequence's initial evaluated state and stays constant for the life of the sequence. `incumbentCandidateIdentity` equals that same `bootstrapStateIdentity` for the first comparison and, after any keep, becomes the kept `candidateIdentity` (so the comparison event's `incumbentAfterIdentity === candidateIdentity`); a `discard` leaves it unchanged and a `stop-unsettled` advances nothing and leaves the sequence unsettled.
- A rebaseline sequence created after explicit re-definition derives its own `baselineCandidateIdentity` as a fresh `bootstrapStateIdentity` over the freshly proven retained-incumbent state under the new frozen contract, with no reference to the prior sequence or its identities.
- `planDescriptor` is the exact plan descriptor above.
- `state` is `open`, `closing`, or `unsettled`.
- `recentComparisons` contains at most 8 `ProjectionReference` rows in increasing ordinal order. All sequences together contain at most 64 comparison refs.
- The active checkpoint and candidate fields are both absent or both present. They are forbidden for `closing`; `unsettled` requires both. They are identities only.

`sequenceIdentity = SHA256(CJ({target,taskKey,ownerBindingHash,planDescriptor,registryHash,contractHash,bindingIdentity,baselineCandidateIdentity}))` using canonical target. The evaluated write set is fixed by the frozen contract and registry entry, so its `writeSetIdentity` and the resulting `baselineCandidateIdentity` — a `bootstrapStateIdentity` that references neither `sequenceIdentity` nor `checkpointIdentity` — are available before `sequenceIdentity` is computed, keeping the identity order acyclic. No-registry or no-selection creates no sequence.

### ProjectionReference And LearningReviewRef

A comparison `ProjectionReference` is exactly `{ordinal,comparisonIdentity,eventHash,currentRunProjectionIdentity,laneProjectionIdentity}`. `ordinal` is a positive safe integer unique and increasing within its sequence; all other fields are `Hash`.

`learningReviewRefs` has at most 16 rows sorted by `reviewIdentity`. Each row is exactly `{reviewIdentity,target,eventHash,currentRunProjectionIdentity,laneProjectionIdentity}`.

Refs are admitted only after both projections are freshly verified. They contain no event body. Reaching any bound requires verified projection before oldest-ref eviction; an unprojected, missing, or conflicting event blocks eviction and controlled end.

## CandidateWriteSet And CheckpointRecord

### CandidateWriteSet

`CandidateWriteSet` is exactly `{candidatePaths,protectedPaths}`. Both fields are sorted unique normalized path arrays. `candidatePaths` contains at least one path; `protectedPaths` may be empty; their disjoint union contains at most 64 paths. Candidate paths are the only mutation targets. Protected paths must remain byte-identical.

Each path resolves before mutation to a regular file or missing leaf with a real existing directory parent. Directories, symlinks, special files, missing parents, workspace escape, unsupported owners, and unsupported external effects refuse in preflight. Existing files are at most 1,048,576 bytes. Each complete prestate, poststate, and restoration capture is at most 4,194,304 aggregate bytes and uses real-parent/no-follow/open/`fstat`/complete-read/recheck rules.

An ordered file state descriptor is exactly `{path,state:"missing"}` or `{path,state:"file",sha256,byteLength}`. Descriptors sort by path and cover the complete write-set union exactly.

```text
writeSetIdentity = SHA256(CJ(CandidateWriteSet))
stateIdentity = SHA256(CJ({writeSetIdentity,files}))
prestateIdentity = stateIdentity(prestate descriptors)
poststateIdentity = stateIdentity(poststate descriptors)
bootstrapStateIdentity = stateIdentity(initial evaluated-state descriptors)
checkpointIdentity = SHA256(CJ({
	target:canonicalTarget(target),sequenceIdentity,contractHash,
	writeSetIdentity,prestateIdentity
}))
candidateIdentity = SHA256(CJ({checkpointIdentity,poststateIdentity}))
```

`bootstrapStateIdentity` reuses the `stateIdentity` form over the sequence's initial captured evaluated-state descriptors — the same write-set union in ordered file-state descriptor form — and references neither `sequenceIdentity` nor `checkpointIdentity`. Because the evaluated write set is fixed by the frozen contract and registry entry, `writeSetIdentity` and thus `bootstrapStateIdentity` are available before the sequence exists. A sequence's `baselineCandidateIdentity` is this fixed `bootstrapStateIdentity` for the life of the sequence, and its `incumbentCandidateIdentity` starts equal to it and advances to the kept `candidateIdentity` after each keep. A rebaseline sequence recomputes its own `bootstrapStateIdentity` over the freshly proven retained-incumbent state under the new contract. The identity order `writeSetIdentity → bootstrapStateIdentity → baselineCandidateIdentity → sequenceIdentity → checkpointIdentity → candidateIdentity` is therefore acyclic, and every consumed identity has a derivation.

### CheckpointRecord

The schema-visible `CheckpointRecord` is exactly:

```text
{
	checkpointIdentity,target,sequenceIdentity,contractHash,writeSetIdentity,
	prestateIdentity,phase,poststateIdentity?,candidateIdentity?
}
```

`phase` is `captured`, `candidate`, `restoring`, `kept`, `restored`, or `unsettled`. `poststateIdentity` and `candidateIdentity` are both required only for `candidate`, `kept`, and `unsettled`; both are otherwise forbidden.

The existing host dependency owns exactly one invocation-local context map keyed by exact `checkpointIdentity`; RunState stores only active identities on its sequence row. The map may privately retain bounded prestate bytes needed for restoration, but no bytes or handles appear in CheckpointRecord or another exported value.

Lifecycle outcomes are exact:

| Case | Required result |
|---|---|
| Preflight refusal | No capture, context, or mutation |
| Capture failure | No complete map entry and no mutation |
| Authorization refusal after capture | Fresh unchanged-prestate proof before release |
| Candidate success | Candidate poststate captured; context remains pending |
| Exception, timeout, or poststate capture failure | Restore, re-capture, and prove exact prestate before release |
| Keep | All five gates pass and poststate still equals evaluated candidate before release |
| Discard, incomparable, evaluator crash, or hard verification/review stop | Restore exact prestate before projection, release, continuation, or stop |
| Restore failure | `unsettled`; retain map entry and RunState identities; hard stop |
| Release failure | Retain entry and identities; hard stop |
| Controlled end | Project/close sequences and prove unchanged prestate, kept poststate, or restoration before each release |
| Process loss | Out of scope; no persisted journal or recovery claim |

Release is forbidden for pending or unsettled context. This is not Git, feature-definition atomic batching, directory rollback, or a general transaction engine.

## ObjectiveObservation And Comparison

### Binding Identity

The active comparison binding is exactly:

```text
bindingIdentity = SHA256(CJ({
	ownerBindingHash,planDescriptor,registryHash,contractHash,evaluatorIdentity,
	inputIdentity,environmentIdentity,conditionIdentity,rubricHash,budgetIdentity
}))
```

Each component identity hashes its complete contract-declared array/object. `rubricHash` hashes the comparator rubric and tie rubric when present, or canonical null when neither exists. Any component change makes the active comparison incomparable.

### ObjectiveObservation

`ObjectiveObservation` is exactly:

```text
{
	role,target,candidateIdentity,contractHash,kind,status,evaluatorIdentity,
	inputIdentity,environmentIdentity,conditionIdentity,rubricHash,budgetIdentity,
	value?
}
```

`role` is `baseline`, `incumbent`, or `candidate`. `kind` is `numeric`, `ordinal`, or `subjective`. `status` is `ok`, `failed`, `timeout`, `crash`, or `malformed`. `value` is required iff status is `ok` and forbidden otherwise.

Value variants are exactly:

```text
{mode:"numeric",samples:[CanonicalDecimal...]}
{mode:"ordinal-level",level:Identifier}
{mode:"artifact",artifactHash:Hash}
```

Numeric sample length equals frozen `sampleCount`. Ordinal-level values name a frozen level. `artifact` is required for ordinal-pairwise and subjective input and binds evaluated content without carrying bytes. Observation identity is `SHA256(CJ(ObjectiveObservation))`.

Each comparison has exactly three observations in role order: baseline, incumbent, candidate. All must be `ok`, share exact target, kind, contract, evaluator, input, environment, condition, rubric, and budget identities, and use expected candidate identities. Otherwise the relation is incomparable.

### EvaluatorJudgment

`EvaluatorJudgment` is exactly `{evaluator,target,contractHash,baselineObservationIdentity,incumbentObservationIdentity,candidateObservationIdentity,relation}`. `relation` is `better`, `equivalent`, `worse`, or `incomparable`.

Numeric and ordinal-level comparators permit zero judgments. Ordinal-pairwise and subjective comparators require exactly two judgments, one per frozen evaluator, sorted by evaluator identity. Any disagreement or any incomparable judgment yields incomparable. Judgment identity is `SHA256(CJ(EvaluatorJudgment))`.

### Comparator Rules

- Numeric medians are selected from sorted fixed odd samples. Decimal strings convert to exact signed scaled integers at maximum observed scale; no floating point or rounding is used. Direction-normalized delta is candidate median minus incumbent median for maximize and the reverse for minimize. `abs(delta) <= tolerance` is equivalent; `delta >= meaningfulThreshold` is better; `delta <= -meaningfulThreshold` is worse; otherwise incomparable.
- Ordinal levels compare frozen indices. Equal is equivalent; a positive move of at least `meaningfulSteps` is better; a negative move of at least that magnitude is worse; every smaller nonzero move is incomparable.
- Ordinal-pairwise and subjective use unanimous judgment as above.
- Equivalent defaults to non-keep. It qualifies only under a predeclared independent-review tie rule and a distinct tie-review record preferring the candidate.

### ComparisonDecision

`ComparisonDecision` is exactly:

```text
{
	comparisonIdentity,target,sequenceIdentity,checkpointIdentity,contractHash,
	baselineObservationIdentity,incumbentObservationIdentity,candidateObservationIdentity,
	judgmentIdentities,relation,reason
}
```

`judgmentIdentities` is empty or contains exactly two hashes. `reason` is `numeric-threshold`, `ordinal-levels`, `unanimous-rubric`, `evaluator-disagreement`, `observation-not-ok`, or `binding-drift`. `comparisonIdentity` is SHA-256 of `CJ` over all other fields. Callers/evaluators cannot submit this decision or relation as authority; deterministic code derives it from validated records.

## Exactly Five Gate Results

The only authoritative candidate-retention gates, in fixed order, are `authorization`, `checkpoint`, `hard-constraints`, `comparison`, and `independent-review`. There is no sixth gate, optional gate, alias, caller-selected subset, or objective override.

Authority-specific normalizers create closed records from fresh owner, runtime, checkpoint-owner, verification/lint-owner, evaluator, and reviewer evidence. Callers and model output cannot submit gate status, result, pass, fail, expected set, blocker, evidence identity, or verdict. For each normalized record, `recordIdentity = SHA256(CJ(record))`. Gate record identities are sorted and duplicate-free; `evidenceIdentity = SHA256(CJ({gate,recordIdentities}))`.

### Closed Normalized Records

Authorization record is exactly `{kind:"authorization",target,policyMode,evidenceHash,ownerBindingHash,planDescriptor,registryHash,contractHash,authorityIdentity,outcome}`. `policyMode` must be autonomous. `outcome` is `authorized` or `refused` and comes only from the execution owner after fresh Inspection and budget/pending checks.

Checkpoint gate record is exactly `{kind:"checkpoint",target,checkpointIdentity,candidateIdentity,writeSetIdentity,prestateIdentity,poststateIdentity,outcome}`. `outcome` is `ready`, `invalid`, or `unsettled` and comes only from checkpoint ownership.

Hard-constraint record is exactly `{kind:"hard-constraint",constraintKind,checkId,target,checkpointIdentity,candidateIdentity,contractHash,evidenceHash,outcome}`. `constraintKind` is `verification` or `lint`; `outcome` is `passed`, `failed`, `timeout`, or `crash`.

The expected hard-constraint set is exactly one mandatory verification record with `checkId: candidate-bound-completion`, plus one record per registry declaration. The mandatory record is always fresh and tied to exact target, checkpoint, candidate, and contract even when registry verification is omitted. Missing, duplicate, stale, malformed, conflicting, failed, timed-out, or crashed expected records never pass.

Readiness review record is exactly `{kind:"readiness-review",reviewIdentity,target,checkpointIdentity,candidateIdentity,contractHash,evidenceHash,outcome}`. Outcome is `accepted`, `rejected`, `timeout`, or `crash`.

Tie review record is exactly `{kind:"tie-review",reviewIdentity,purpose,rubricHash,target,checkpointIdentity,incumbentCandidateIdentity,candidateIdentity,contractHash,evidenceHash,outcome}`. `purpose` is `simplicity` or `risk`; outcome is `candidate`, `incumbent`, `equivalent`, `incomparable`, `timeout`, or `crash`. It is required only for a predeclared equivalent tie and has an identity distinct from readiness review and every evaluator judgment.

Comparison evidence is the validated ComparisonDecision plus its three observation identities and required judgment identities. Subjective evaluator judgment, ordinary readiness review, and tie review are distinct kinds/identities and cannot substitute for one another.

### GateResult And GateSet

`GateResult` is exactly `{name,evidenceIdentity,result}`. `name` is one fixed gate; `result` is `pass`, `fail`, or `incomplete`, derived only by its normalizer:

- `authorization` passes only with one fresh authorized record matching active owner, policy, Inspection, registry, contract, and execution authority.
- `checkpoint` passes only with one ready record matching live context and exact candidate/poststate.
- `hard-constraints` passes only when the complete expected set exists uniquely and every outcome is passed.
- `comparison` passes only when all three observations are `ok`, bindings match, no drift exists, and one valid ComparisonDecision was derived. Pass does not imply a qualifying relation.
- `independent-review` passes only when readiness is accepted and, for a predeclared equivalent tie, the distinct tie review selects candidate.

Missing/malformed records produce incomplete; authoritative negative, timeout, crash, disagreement, stale, or conflict results produce fail or incomplete and never pass.

`GateSet` is exactly `{target,checkpointIdentity,candidateIdentity,contractHash,gates,gateSetIdentity}`. `gates` has exactly five GateResult rows in fixed order. `gateSetIdentity = SHA256(CJ({target,checkpointIdentity,candidateIdentity,contractHash,gates}))`.

Keep is derivable only when all five results pass and relation is better, or relation is equivalent with the passing predeclared tie review. All other outcomes restore first. Objective evidence grants no authority or task completion.

## Drift, Rebaseline, And Authority

Before authorization, after candidate capture, before comparison, before keep, and before release, recompute owner binding, plan descriptor, registry, contract, evaluator, inputs, environment, conditions, rubric, and budget. Any mismatch against `bindingIdentity` produces reason `binding-drift`, relation incomparable, exact restoration, event projection, sequence closure, and stop.

Intentional change is legal only through explicit brainstorm plus define between candidates. The old sequence must have no active mutation, project every complete comparison and learning review, project one close event, and prove the retained incumbent before release. A new sequence evaluates that incumbent under the new contract to establish a new baseline. No observation, relation, tie, or gate result crosses a contract hash.

Objective records are evidence only. They never establish owner/lane authority, authorize unsupported effects, mutate task state, satisfy lane close, or permit post-task optimization. No registry or no selected entry follows ordinary no-objective autonomous behavior.

## Events And Projection

### Event Hashing

Every event includes `version: 1`, one literal `type`, and `eventHash`. `eventHash = SHA256(CJ(event without eventHash))`; validation removes only top-level `eventHash` for recomputation and performs no recursive omission. `CJ(event)` is at most 16,384 UTF-8 bytes.

### ObjectiveComparisonEvent

Exact shape:

```text
{
	type:"objective-comparison",version,eventHash,target,taskKey,sequenceIdentity,
	comparisonIdentity,checkpointIdentity,contractHash,baselineCandidateIdentity,
	incumbentBeforeIdentity,candidateIdentity,observationIdentities,relation,
	gateSetIdentity,gateResults,decision,incumbentAfterIdentity,restorationIdentity?
}
```

`observationIdentities` is exactly `{baseline,incumbent,candidate}`. `gateResults` is the exact five-row GateResult array. `decision` is `keep`, `discard`, or `stop-unsettled`.

- `keep` requires all gates pass and a qualifying relation; `incumbentAfterIdentity === candidateIdentity`; `restorationIdentity` is forbidden.
- `discard` requires proven exact restoration; `incumbentAfterIdentity === incumbentBeforeIdentity`; `restorationIdentity` is required and hashes the restoration proof record.
- `stop-unsettled` records failed restoration/release; `incumbentAfterIdentity` is `null`; `restorationIdentity` is forbidden; sequence/context remain unsettled.

### EvaluationSequenceClosedEvent

Exact shape:

```text
{
	type:"evaluation-sequence-closed",version,eventHash,target,taskKey,
	sequenceIdentity,contractHash,baselineCandidateIdentity,finalIncumbentIdentity,
	reason,comparisonEventHashes,learningReviewEventHashes
}
```

`reason` is `rebaseline`, `drift`, `task-completed`, `task-blocked`, `no-progress`, `hard-stop`, or `controlled-end`. Comparison hashes contain 0 through 64 hashes in sequence order; review hashes contain 0 through 16 hashes in occurrence order. This event requires a settled, proven final incumbent. Unsettled restoration blocks close-event creation and keeps the sequence open/unsettled.

### LearningReviewEvent

Exact shape:

```text
{
	type:"learning-review",version,eventHash,reviewIdentity,target,sequenceIdentity?,
	evidenceHash,repeatedEvidenceHash,repeatedApproachHash,findings,alternatives,
	outcome,selectedApproachHash?,discriminatingCheckId?
}
```

`findings` has 1 through 16 `FindingText` values. `alternatives` has 0 through 8 exact rows `{approachHash,discriminatingCheckId}`, sorted by `approachHash`; check IDs are `Identifier`. `outcome` is `authorized-alternative` or `no-progress`.

`reviewIdentity = SHA256(CJ({target,sequenceIdentity?,evidenceHash,repeatedEvidenceHash,repeatedApproachHash}))`. `authorized-alternative` requires both optional fields, a selected hash different from the repeated hash, and an exact matching alternatives row. `no-progress` forbids both. After either outcome is projected, further authorization rebuilds a fresh complete Inspection and cannot reuse the review's earlier evidence identity.

### Exact Dual Projection

Projection payload is exactly `{event}` and contains one complete event above.

- Current-run projection is one existing feature 004 capture record exactly `{substantive:{event},presentation?}`. Presentation retains feature 004's shallow allowlist and is excluded; `{event}` is fully hash-significant.
- Lightweight lane projection is one exact logical line in existing terminal `## Lightweight Execution History`: ASCII prefix `- dude-run-event: ` immediately followed by `CJ({event})`.
- Tracked lane projection is the same exact line appended through the tracked owner to the exact issue's existing authoritative notes/history, then visible in a fresh exact issue history capture. It changes no import, mirror, issue, or mapping contract.

For each surface:

```text
projectionIdentity = SHA256(CJ({surface,target,eventHash,recordHash}))
```

`surface` is `current-run` or `lane-history`; `recordHash` hashes complete normalized `{event}` for current-run or complete lane line bytes. Fresh verification reacquires both sources, requires exactly one byte-equivalent event with valid eventHash on each, and computes both identities. Missing, duplicate-conflicting, stale, malformed, wrong-target, or hash-mismatched projection blocks reference retention, eviction, sequence close/rebaseline, task close/block, context release, and controlled end.

A complete comparison projects before its full data is reduced to ProjectionReference or evicted. Every sequence close/rebaseline, task close/block, and controlled end projects EvaluationSequenceClosedEvent before clearing sequence state. Every full LearningReviewEvent projects before ref eviction or controlled end. No second ledger is created.

## Retention Decision And Task Boundary

Keep requires a qualifying relation and all five gates pass. Non-keep restores first. Verification or readiness rejection after mutation is a veto, not objective improvement; restoration precedes stop. Evaluator crash/disagreement is incomparable. Failed restoration/release is `stop-unsettled` and retains context.

Task completion or block first settles the active candidate, projects every unprojected comparison/review, projects the sequence close event with matching reason, freshly verifies both surfaces, and only then invokes the existing lane transition. Objective evidence does not satisfy completion. No sequence continues after that task transition unless another task independently selects its own registry entry.

## AuditSummary

`AuditSummary` is exactly:

```text
{
	tasksAttempted,tasksCompleted,tasksSkipped,tasksBlocked,cycles,
	objectiveSequences,filesChanged,verificationOutcomes,
	autonomousDecisions,remainingRisks
}
```

Task/path arrays are sorted unique strings. Each `cycles` row is exactly `{target,kind,reason,eventHash?}`, where `kind` is `recovery`, `learning`, or `objective`; eventHash is required for learning/objective and forbidden for recovery. Each `objectiveSequences` row is exactly `{target,taskKey,sequenceIdentity,contractHash,outcome,closeEventHash?}`; outcome is `kept`, `discarded`, `blocked`, or `unsettled`; closeEventHash is required only for a closed sequence. Verification/review outcomes, decisions, and risks are bounded `ShortText` arrays.

The renderer uses bounded invocation state plus freshly acquired existing current-run and lane history. It writes no file and creates no ledger.

## Invalid And Boundary Cases

| Case | Result |
|---|---|
| Guarded invocation | No plan path open, source entry, descriptor, packet item, or plan hash |
| Autonomous with zero active markers | Required present `definition-plan`, `registryHash:null`, no selection/objective |
| No matching task row or unmapped tracked issue | Required present no-objective body; no blocker |
| Marker cardinality/order/body error | `malformed`; `objective-source-conflict` |
| Owner/path/registry/task/mapping contradiction | `conflict`; `objective-source-conflict` |
| Plan missing/stale/nontext/overflow | Matching EvidenceItem status; `evidence-incomplete` |
| Tracked mapping not freshly unique | No selection when unmapped; conflict when contradictory/ambiguous; never import/infer |
| Registry entry 65, duplicate/unsorted key, invalid bound/decimal/rubric | Malformed objective source |
| Baseline/incumbent/candidate not `ok` or bindings differ | Incomparable; restore |
| Numeric value between tolerance and meaningful threshold | Incomparable; restore |
| Pairwise/subjective evaluator disagreement | Incomparable; restore |
| Equivalent without predeclared passing tie review | Discard; restore |
| Missing fixed candidate completion verification | Hard-constraints incomplete; never keep |
| Caller-supplied gate status or verdict | Reject unknown/untrusted input |
| Any gate not pass or relation not qualifying | Non-keep; restore first |
| Owner/plan/registry/contract/evaluator/input/environment/condition/rubric/budget drift | Incomparable; restore, project, close, stop |
| Candidate/protected overlap, path 65, body 1,048,577, aggregate 4,194,305, unsafe type/parent | Refuse before mutation |
| Exception, timeout, evaluator crash, poststate failure, review/verification veto | Restore exact prestate before continuation/stop |
| Restoration or release cannot be proven | Retain unsettled context and identities; hard stop |
| Comparison/review ref bound reached without dual projection | Block eviction and controlled end |
| Event byte 16,385 | Reject event; retain state/context; stop |
| Missing/conflicting current-run or lane projection | Block eviction, close/rebaseline, task transition, release, controlled end |
| Task completes or blocks with open sequence | Project/verify close before lane transition; no post-task optimization |
| Process loss | Out of scope; no journal, Git fallback, or restoration claim |
