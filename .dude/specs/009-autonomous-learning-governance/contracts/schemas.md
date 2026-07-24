# Autonomous Learning Governance Schemas

## Authority, Compatibility, And Immutability

This contract extends the existing Feature 004 recovery, Feature 005 autonomous Work, and Feature 008 core-close contracts. Existing `Inspection`, `TransportInput`, source acquisition, objective compatibility, checkpoint, canonical path, and bounded CLI rules remain authoritative unless this file narrows them.

All records introduced here are closed. Unknown, duplicate, sparse, accessor-backed, non-data, cyclic, noncanonical, conditionally forbidden, or missing fields reject before RunState or lane mutation. Validators recompute every derivable identity.

Guarded and non-Work v1 behavior remains valid under its existing rules. Autonomous v2 authority never derives from:

- legacy `Assessment.equivalence`;
- a v1 learning event;
- a caller-authored finding, check result, verdict, chronology, repeat, or equivalence claim;
- caller prose claiming projection, authorization, receipt, or audit outcome; or
- a direct lane mutation without the exact Work permit and receipt required here.

The Feature 009 definition is immutable during execution. The immutable inputs are `spec.md`, `plan.md`, the six support artifacts, and the immutable task contract in `tasks.md`. No implementation task or specialist writes `.dude/specs/009-autonomous-learning-governance/**`. Coordinator-owned Lightweight glyph and blocker-metadata changes are lane state only; they do not authorize changes to task identity, wording, dependencies, phases, or source declaration. A required normative change stops with `contract-mismatch: redefine-required`.

Feature 009 has no active ObjectiveRegistry.

## Common Scalars And Bounds

- `CJ(value)` is the existing duplicate-key-free canonical JSON serialization.
- `Hash` is lowercase SHA-256 matching `^[0-9a-f]{64}$`.
- `GitOid` is the repository's complete lowercase Git object identifier.
- `Identifier` is ASCII matching `^[a-z0-9][a-z0-9._:/@-]{0,127}$`.
- `TaskKey` matches `^T\d{3,}@[a-z0-9]{8}$`.
- `PositiveInteger` is a safe integer greater than zero.
- `NonnegativeSafeInteger` is a safe integer greater than or equal to zero.
- `ShortText` is a control-free Unicode scalar string of 1 through 1,024 UTF-8 bytes.
- `FindingText` is a control-free Unicode scalar string of 1 through 512 UTF-8 bytes.
- `SubjectIdentity` is a control-free Unicode scalar string of 1 through 512 UTF-8 bytes and uses `/`, never `\`, for path-like identities.
- `CanonicalUtcTimestamp` is the existing canonical UTC timestamp form.
- `NormalizedWorkspacePath`, `CanonicalSpecPath`, `DirectIdeaPath`, `CanonicalWorkspaceRoot`, and `CanonicalBase64` retain their existing no-follow and canonicalization rules.
- Set-like arrays are UTF-8 bytewise sorted and duplicate-free unless an explicit order is stated.
- Every `AuthoritativeEvent` is at most 16,384 UTF-8 bytes as `CJ(event)`.
- `CJ(RunState.learningGovernance)` is at most 32,768 UTF-8 bytes.
- One projection batch contains at most 17 events.
- A normal completion batch contains exactly one approach event and zero through sixteen finding events.
- Learning contains at most 16 findings, 8 alternatives, 16 failed approach bases, and 16 evidence or assumption identities per bounded collection.
- Existing source, Inspection, packet, aggregate-byte, and CLI request limits remain authoritative.
- `TrackedDispatchRecoveryPayloadV1` is transient response/request transport only. It is forbidden in RunState and persistent history. The payload, pending response, and each recovery request MUST remain within existing aggregate and CLI byte limits.

### Dedicated Event-Line Types

`ShortText` is never an autonomous v2 lane-event line.

```text
EventLineText =
  ASCII("- dude-run-event: ") || CJ(event)
```

Rules:

- the prefix is exactly 18 ASCII bytes;
- `event` is one valid `AuthoritativeEvent`;
- `byteLength(CJ(event)) <= 16,384`;
- `byteLength(EventLineText) <= 16,402`;
- `EventLineText` contains no CR or LF;
- there is no intervening or trailing whitespace;
- parsing the suffix and reserializing it with `CJ` produces identical bytes; and
- the suffix is `CJ(event)`, not `CJ({event})`.

```text
EventLineRecord = UTF8(EventLineText) || 0x0A
byteLength(EventLineRecord) <= 16,403

laneEventLineHash = SHA256(UTF8(EventLineText))
laneEventRecordHash = SHA256(EventLineRecord)
```

Projection plans and lane mutations carry exact `EventLineText` plus literal `terminator:"LF"`. The lane owner serializes the LF. CR, CRLF, embedded LF, omitted terminator, trailing bytes, wrapped `CJ({event})`, or a body/hash mismatch refuses autonomous v2 authority.

Existing v1 `CJ({event})` history remains readable only through its legacy audit path. It cannot satisfy an autonomous v2 projection, permit, receipt, transition, or resolved audit row.

```text
OwnerLogLineText =
  a Unicode scalar string of 1 through 1,024 UTF-8 bytes
  containing no CR, LF, or other control character
```

## Canonical Bytes And Targets

```text
CapturedBytesV1 = {
  base64: CanonicalBase64,
  sha256: Hash,
  byteLength: NonnegativeSafeInteger
}

CanonicalByteEnvelope = CapturedBytesV1
```

`base64` is the unique canonical encoding of the exact bytes. `byteLength` and `sha256` recompute from the decoded bytes. Supplying bytes does not establish source authority.

```text
LightweightTarget = {
  specPath: CanonicalSpecPath,
  lane: "lightweight",
  taskKey: TaskKey
}

TrackedTarget = {
  specPath: CanonicalSpecPath,
  lane: "tracked",
  issueId: ControlFreeUnicodeString1To256Bytes
}

AffectedTarget = LightweightTarget | TrackedTarget
```

Learning governance requires a task target. A tracked target's durable-key mapping is proven separately.

## Immutable Definition Contract

```text
DefinitionArtifactDescriptorV1 = {
  path:
    ".dude/specs/009-autonomous-learning-governance/spec.md" |
    ".dude/specs/009-autonomous-learning-governance/plan.md" |
    ".dude/specs/009-autonomous-learning-governance/research.md" |
    ".dude/specs/009-autonomous-learning-governance/data-model.md" |
    ".dude/specs/009-autonomous-learning-governance/contracts/schemas.md" |
    ".dude/specs/009-autonomous-learning-governance/quickstart.md" |
    ".dude/specs/009-autonomous-learning-governance/checklists/test.md" |
    ".dude/specs/009-autonomous-learning-governance/checklists/security.md",
  sha256: Hash,
  byteLength: NonnegativeSafeInteger
}
```

```text
ImmutableTaskContractV1 = {
  version: 1,
  specPath: ".dude/specs/009-autonomous-learning-governance/spec.md",
  taskContractIdentity: Hash,
  terminalTaskKey: "T009@696e6369",
  declaredSourcePaths: NormalizedWorkspacePath[10],
  directDependencyKeys: TaskKey[8]
}
```

`taskContractIdentity` hashes the canonical immutable task keys, markers, descriptions, phase ownership, dependencies, and terminal source declaration. Coordinator-owned runtime glyph and `blocked-by:` state are excluded; task meaning and dependencies are not.

```text
DefinitionContractCommitmentV1 = {
  version: 1,
  featureSpecPath: ".dude/specs/009-autonomous-learning-governance/spec.md",
  artifacts: DefinitionArtifactDescriptorV1[8],
  taskContract: ImmutableTaskContractV1,
  definitionContractIdentity: Hash
}

artifacts = sorted by path

definitionContractIdentity =
  SHA256(CJ(record without definitionContractIdentity))
```

Any immutable artifact or task-contract drift stops execution for redefinition.

## Trusted Verification And Review Captures

```text
TrustedSourceCaptureV2 = {
  target: AffectedTarget,
  state: "complete",
  outcomeHash: Hash,
  authority: {
    kind: "verification" | "independent-review",
    authorityIdentity: Hash,
    invocationIdentity: Hash
  },
  bytes: CanonicalByteEnvelope
}

sourceCaptureIdentity = SHA256(CJ(TrustedSourceCaptureV2))
```

The Work host acquires this row through the existing Inspection source mechanism. A semantic command caller cannot submit it as an envelope body. Runtime validates the complete state, byte envelope, target, authority kind and identity, invocation identity, and source outcome hash. Stale, partial, duplicate, conflicting, wrong-target, or wrong-authority captures reject.

```text
CheckEvidenceV2 = {
  checkIdentity: Hash,
  definitionIdentity: Hash,
  outcome: "passed" | "failed",
  evidenceIdentity: Hash
}

checkIdentity = SHA256(CJ({
  definitionIdentity,
  outcome,
  evidenceIdentity
}))
```

```text
VerificationEnvelopeV2 = {
  type: "verification-envelope",
  version: 2,
  envelopeIdentity: Hash,
  target: AffectedTarget,
  attemptIdentity: Hash,
  sourceRevisionIdentity: Hash,
  inspectedEvidenceHash: Hash,
  resultIdentity: Hash,
  checks: CheckEvidenceV2[1..16]
}

checks = sorted by checkIdentity

envelopeIdentity =
  SHA256(CJ(envelope without envelopeIdentity))
```

A verification envelope is authoritative only when normalized from one matching fresh trusted verification capture.

```text
FindingBasisV1 = {
  version: 1,
  target: AffectedTarget,
  expectation: {
    kind: "governing-rule" | "expected-condition",
    identity: Hash
  },
  subjects: SubjectIdentity[1..16],
  failureClass: Identifier,
  checkDefinitionIdentity: Hash
}

subjects = sorted and unique
basisIdentity = SHA256(CJ(FindingBasisV1))
```

The basis excludes attempt, reviewer, evidence occurrence, observation, result, chronology, timestamp, severity, rationale, summary, and wording.

```text
IndependentReviewFindingV2 = {
  version: 2,
  findingIdentity: Hash,
  basis: FindingBasisV1,
  basisIdentity: Hash,
  observation: {
    kind: "observed-evidence" | "check-result",
    identity: Hash
  }
}

findingIdentity = SHA256(CJ({
  version,
  basisIdentity,
  observation
}))
```

```text
IndependentReviewEnvelopeV2 = {
  type: "independent-review-envelope",
  version: 2,
  envelopeIdentity: Hash,
  target: AffectedTarget,
  attemptIdentity: Hash,
  attemptOrdinal: PositiveInteger,
  reviewOrdinal: PositiveInteger,
  reviewerAuthorityIdentity: Hash,
  reviewInvocationIdentity: Hash,
  sourceRevisionIdentity: Hash,
  inspectedEvidenceHash: Hash,
  resultIdentity: Hash,
  verificationEnvelopeIdentity: Hash,
  verdict: "accepted" | "rejected",
  findings: IndependentReviewFindingV2[0..16]
}

findings = sorted by findingIdentity

envelopeIdentity =
  SHA256(CJ(envelope without envelopeIdentity))
```

An accepted review has zero unresolved findings. A rejected review has at least one finding. Every `check-result` observation identifies a check in the bound verification envelope and uses the same definition identity as the finding basis. Target, attempt, result, source revision, Inspection evidence, and verification identity agree across both envelopes and the pending attempt. Runtime derives the complete finding set; the completion caller's sorted `findingIdentities` must equal it.

## Approach And Occurrence Identities

```text
MaterialInputsV1 = {
  targets: SubjectIdentity[1..16],
  operations: Identifier[1..16],
  checks: Identifier[1..16]
}
```

Each array is sorted and unique.

```text
ApproachBasisV1 = {
  version: 1,
  target: AffectedTarget,
  action: Identifier,
  materialInputs: MaterialInputsV1,
  mechanismIdentities: Hash[0..16],
  assumptionIdentities: Hash[0..16],
  evidenceAcquisitionIdentities: Hash[0..16],
  validationPlanIdentities: Hash[0..16]
}

approachBasisIdentity = SHA256(CJ(ApproachBasisV1))
```

All arrays are sorted and unique. Labels, summaries, wording, attempt identity, authorization evidence, result, and chronology are excluded.

### Finding Occurrence

```text
FindingOccurrenceV1 = {
  version: 1,
  basisIdentity: Hash,
  attemptIdentity: Hash,
  attemptApproachBasisIdentity: Hash,
  reviewEnvelopeIdentity: Hash,
  findingIdentity: Hash,
  observation: {
    kind: "observed-evidence" | "check-result",
    identity: Hash
  },
  chronology: {
    attemptOrdinal: PositiveInteger,
    reviewOrdinal: PositiveInteger
  }
}

occurrenceIdentity = SHA256(CJ(FindingOccurrenceV1))
```

```text
FindingOccurrenceEventV1 = {
  type: "finding-occurrence",
  version: 1,
  eventHash: Hash,
  occurrenceIdentity: Hash,
  target: AffectedTarget,
  basis: FindingBasisV1,
  occurrence: FindingOccurrenceV1,
  sourceCaptureIdentity: Hash
}

eventHash = SHA256(CJ(event without eventHash))
```

Validation requires basis identity recomputation, exact finding membership in the normalized review envelope, exact attempt and approach basis, matching observation and target, trusted review capture, strict authoritative chronology, and no chronology-position conflict.

### Approach Occurrence

```text
ApproachOccurrenceV1 = {
  version: 1,
  basisIdentity: Hash,
  attemptIdentity: Hash,
  authorizationEvidenceHash: Hash,
  resultIdentity: Hash,
  disposition:
    "accepted" |
    "verification-failed" |
    "review-rejected" |
    "no-change" |
    "interrupted",
  chronology: {
    attemptOrdinal: PositiveInteger
  }
}

occurrenceIdentity = SHA256(CJ(ApproachOccurrenceV1))
```

```text
ApproachOccurrenceEventV1 = {
  type: "approach-occurrence",
  version: 1,
  eventHash: Hash,
  occurrenceIdentity: Hash,
  target: AffectedTarget,
  basis: ApproachBasisV1,
  occurrence: ApproachOccurrenceV1,
  verificationEnvelopeIdentity: Hash,
  reviewEnvelopeIdentity: Hash
}

eventHash = SHA256(CJ(event without eventHash))
```

A completion counts an approach or finding occurrence only after the exact event freshly verifies on both authoritative surfaces.

## Repeat Relationship

```text
RepeatRelationshipV1 = {
  version: 1,
  channel: "finding" | "approach",
  basisIdentity: Hash,
  occurrenceIdentities: [Hash, Hash]
}

repeatIdentity = SHA256(CJ(RepeatRelationshipV1))
```

Runtime derives this record from two complete retained events of the named channel with equal basis identities, distinct occurrence and attempt identities, strict increasing chronology, one target, exact byte-equivalent presence on both surfaces, and the earliest qualifying pair. Replay, same-attempt review, missing evidence, or conflict produces no Repeat Relationship.

## Exact Projection Batches

```text
EventCommitmentV1 = {
  kind:
    "approach-occurrence" |
    "finding-occurrence" |
    "learning-review" |
    "learning-governance" |
    "incident-supersession",
  eventHash: Hash
}
```

```text
AuthoritativeEvent =
  ApproachOccurrenceEventV1 |
  FindingOccurrenceEventV1 |
  LearningReviewEventV2 |
  GovernanceEventV1 |
  IncidentSupersessionEventV1
```

```text
ProjectionBatchV1 = {
  version: 1,
  purpose:
    "occurrence-retention" |
    "incident-evidence" |
    "governance-required" |
    "learning-result" |
    "governance-snapshot" |
    "incident-supersession",
  target: AffectedTarget,
  events: AuthoritativeEvent[1..17],
  eventCommitments: EventCommitmentV1[1..17],
  batchIdentity: Hash
}
```

Exact event order and cardinality are closed:

- `occurrence-retention`: exactly one `ApproachOccurrenceEventV1`, then zero through sixteen `FindingOccurrenceEventV1` rows sorted by `occurrenceIdentity`;
- `incident-evidence`: exactly two `FindingOccurrenceEventV1` rows ordered by `(attemptOrdinal, reviewOrdinal, occurrenceIdentity)`, ascending; both use the Feature 007 target, equal basis identities, distinct attempts, distinct occurrence identities, and valid strict chronology;
- `learning-result`: one `LearningReviewEventV2`, then one `GovernanceEventV1`;
- `governance-required`, `governance-snapshot`, and `incident-supersession`: exactly one event.

`eventCommitments` has the same length and order as `events`. Every commitment kind and hash matches its exact event body.

```text
batchIdentity = SHA256(CJ({
  version,
  purpose,
  target,
  eventCommitments
}))
```

```text
ProjectionCommitmentV1 = {
  purpose: ProjectionBatchV1.purpose,
  batchIdentity: Hash,
  eventCommitments: EventCommitmentV1[1..17]
}
```

RunState stores only the commitment, never exact event bodies. An originating command may reproduce a lost batch only from unchanged complete authoritative evidence and only when the canonical bytes and batch identity are identical.

## Retention-First Completion

```text
PendingCompletionRetentionV2 = {
  version: 2,
  target: AffectedTarget,
  attemptIdentity: Hash,
  resultIdentity: Hash,
  verificationEnvelopeIdentity: Hash,
  reviewEnvelopeIdentity: Hash,
  findingIdentities: Hash[0..16],
  retention: ProjectionCommitmentV1,
  capturedInspectionIdentity: Hash
}
```

Rules:

- `retention.purpose` is `occurrence-retention`;
- this is the only additional state admitted between capture and finalize;
- a second attempt or target cannot overwrite it;
- idempotent recapture returns the same exact batch only from unchanged authoritative evidence; and
- finalize clears it only after exact dual retention.

`complete.capture` performs fresh Inspection, normalizes the trusted envelopes, validates all bindings, derives one approach event plus the complete finding-event set, returns the exact ordered batch, stores only its commitment, and leaves the attempt pending and uncounted.

`complete.finalize` reacquires both surfaces, validates the caller-supplied exact batch against `pendingCompletion`, requires each event exactly once and byte-equivalent on both surfaces, and only then admits the completion. It derives the earliest valid repeat after admission. An immediate halt before retention leaves completion pending and establishes no repeat. An immediate halt after retention but before governance projection leaves exact evidence for deterministic re-derivation.

## Complete Failed-Approach Set

```text
FailedApproachSetV1 = {
  version: 1,
  target: AffectedTarget,
  chronologyCutoff: PositiveInteger,
  approachBasisIdentities: Hash[1..16],
  evidenceEventHashes: Hash[1..16],
  setIdentity: Hash
}

setIdentity = SHA256(CJ(record without setIdentity))
```

Both arrays are sorted and unique. A finding-triggered set contains every unique `attemptApproachBasisIdentity` bound by qualifying finding occurrences through the trigger cutoff. An approach-triggered set contains every unique failed approach basis represented by qualifying approach occurrences through that cutoff. Each basis has supporting event evidence. A rejected selected-alternative attempt extends the set; no member is removed. Any overflow returns `learning-governance-capacity` and cannot authorize no-progress.

## Learning Findings, Alternatives, And No-Progress

```text
LearningFindingV1 = {
  version: 1,
  findingIdentity: Hash,
  statement: FindingText,
  evidenceIdentities: Hash[1..16],
  assumptionIdentities: Hash[0..16]
}

findingIdentity = SHA256(CJ({
  version,
  statement,
  evidenceIdentities,
  assumptionIdentities
}))
```

```text
MaterialDifferenceV1 = {
  failedApproachBasisIdentity: Hash,
  changedDimensions: (
    "material-input" |
    "mechanism" |
    "assumption" |
    "evidence-acquisition" |
    "validation-plan"
  )[1..5],
  evidenceIdentities: Hash[1..16]
}
```

```text
RejectedAlternativeComparisonV1 =
  {
    failedApproachBasisIdentity: Hash,
    outcome: "same",
    evidenceIdentities: Hash[1..16]
  }
  |
  {
    failedApproachBasisIdentity: Hash,
    outcome: "different",
    changedDimensions: (
      "material-input" |
      "mechanism" |
      "assumption" |
      "evidence-acquisition" |
      "validation-plan"
    )[1..5],
    evidenceIdentities: Hash[1..16]
  }

CredibleMaterialAlternativeV2 = {
  version: 2,
  alternativeIdentity: Hash,
  disposition: "credible-material",
  approachBasis: ApproachBasisV1,
  approachBasisIdentity: Hash,
  failedApproachSetIdentity: Hash,
  materialDifferences: MaterialDifferenceV1[1..16],
  discriminatingCheck: {
    identity: Hash,
    definitionIdentity: Hash,
    evidenceIdentities: Hash[1..16]
  },
  semanticAssessmentIdentity: Hash
}

RejectedAlternativeV2 = {
  version: 2,
  alternativeIdentity: Hash,
  disposition: "not-credible" | "not-materially-different",
  approachBasis: ApproachBasisV1,
  approachBasisIdentity: Hash,
  failedApproachSetIdentity: Hash,
  comparisons: RejectedAlternativeComparisonV1[1..16],
  semanticAssessmentIdentity: Hash,
  reason: Identifier
}

AlternativeV2 =
  CredibleMaterialAlternativeV2 |
  RejectedAlternativeV2
```

Every branch has exactly one row per current failed basis, sorted by `failedApproachBasisIdentity`. Credible rows all differ. `not-materially-different` requires at least one `same`; `not-credible` may contain either outcome. Rejected variants forbid `materialDifferences` and `discriminatingCheck`; credible variants forbid `comparisons` and `reason`. `changedDimensions` uses the enum order above without duplicates.

```text
discriminatingCheck.identity = SHA256(CJ({
  definitionIdentity,
  evidenceIdentities
}))

credible alternativeIdentity = SHA256(CJ({
  version,
  disposition,
  approachBasisIdentity,
  failedApproachSetIdentity,
  materialDifferences,
  discriminatingCheck,
  semanticAssessmentIdentity
}))

rejected alternativeIdentity = SHA256(CJ({
  version,
  disposition,
  approachBasisIdentity,
  failedApproachSetIdentity,
  comparisons,
  semanticAssessmentIdentity,
  reason
}))

alternativeSetHash = SHA256(CJ({
  failedApproachSetIdentity,
  alternatives
}))
```

For no-progress, `alternatives` is the complete sorted considered set, every row is `RejectedAlternativeV2`, and `credibleMaterialAlternativeIdentities` is exactly `[]`. Selection still requires exactly one `CredibleMaterialAlternativeV2`. Finding hashes are never compared with approach hashes.

```text
NoProgressProofV2 = {
  version: 2,
  failedApproachSetIdentity: Hash,
  completeEvidenceHash: Hash,
  alternativeSetHash: Hash,
  credibleMaterialAlternativeIdentities: [],
  noNewDistinguishingEvidenceHash: Hash,
  assumptionSetHash: Hash,
  proofIdentity: Hash
}

noNewDistinguishingEvidenceHash = SHA256(CJ({
  failedApproachSetIdentity,
  completeEvidenceHash,
  distinguishingEvidenceIdentities: []
}))

proofIdentity = SHA256(CJ(record without proofIdentity))
```

```text
NoProgressVerificationV2 = {
  version: 2,
  noProgressProofIdentity: Hash,
  failedApproachSetIdentity: Hash,
  preLearningEvidenceHash: Hash,
  postLearningEvidenceHash: Hash,
  expectedProjectionEventHashes: Hash[1..17],
  distinguishingEvidenceIdentities: [],
  noNewDistinguishingEvidenceHash: Hash,
  verificationIdentity: Hash
}

noNewDistinguishingEvidenceHash = SHA256(CJ({
  noProgressProofIdentity,
  failedApproachSetIdentity,
  preLearningEvidenceHash,
  postLearningEvidenceHash,
  expectedProjectionEventHashes,
  distinguishingEvidenceIdentities: []
}))

verificationIdentity = SHA256(CJ(record without verificationIdentity))
```

Any failed-set change invalidates alternatives, proof, and verification.

## Learning Review And Governance

```text
LearningReviewEventV2 = {
  type: "learning-review",
  version: 2,
  eventHash: Hash,
  reviewIdentity: Hash,
  governanceIdentity: Hash,
  target: AffectedTarget,
  sequenceIdentity?: Hash,
  trigger: RepeatRelationshipV1,
  failedApproachSetIdentity: Hash,
  preLearningEvidenceHash: Hash,
  assumptionSetHash: Hash,
  findings: LearningFindingV1[1..16],
  alternatives: AlternativeV2[0..8],
  outcome: "selected-alternative" | "no-progress",
  selectedAlternativeIdentity?: Hash,
  noProgressProof?: NoProgressProofV2
}
```

`alternatives` is sorted by `alternativeIdentity`.

```text
reviewIdentity = SHA256(CJ({
  governanceIdentity,
  target,
  sequenceIdentity?,
  trigger,
  failedApproachSetIdentity,
  preLearningEvidenceHash,
  assumptionSetHash,
  findings,
  alternatives,
  outcome,
  selectedAlternativeIdentity?,
  noProgressProof?
}))

eventHash = SHA256(CJ(event without eventHash))
```

`selected-alternative` requires exactly one selected credible-material row and forbids `noProgressProof`. `no-progress` requires a complete proof, forbids `selectedAlternativeIdentity`, and requires zero credible-material rows. `sequenceIdentity` is present only for one already valid objective uniquely mapped to the target; runtime never creates or repairs an objective.

```text
LearningGovernancePhase =
  "required" |
  "reviewed" |
  "projected" |
  "alternative-inspected" |
  "alternative-permitted" |
  "alternative-authorized-pending-lane" |
  "alternative-authorized" |
  "alternative-verified" |
  "no-progress-verified"
```

`alternative-permitted` is a logical protocol stage only. Permit issuance leaves RunState byte-identical; no caller may persist or forge that phase. The next persisted phase is an authorized phase.

```text
LearningGovernanceV1 = {
  version: 1,
  governanceIdentity: Hash,
  target: AffectedTarget,
  trigger: RepeatRelationshipV1,
  failedApproachSet: FailedApproachSetV1,
  phase: LearningGovernancePhase,
  revision: PositiveInteger,
  triggerEvidenceHash: Hash,
  projectionCommitment?: ProjectionCommitmentV1,
  reviewIdentity?: Hash,
  selectedAlternativeIdentity?: Hash,
  discriminatingCheckIdentity?: Hash,
  postLearningInspectionIdentity?: Hash,
  issuedAttemptPermitHash?: Hash,
  consumedAttemptPermitHash?: Hash,
  authorizedAttemptIdentity?: Hash,
  laneClaimReceiptIdentity?: Hash,
  terminalEvidenceIdentity?: Hash,
  suspension?: SuspensionV1,
  halt?: HaltV1,
  controlledEnd?: ControlledUnresolvedEndV1
}

governanceIdentity = SHA256(CJ({
  version: 1,
  target,
  repeatIdentity: SHA256(CJ(trigger))
}))
```

Phase constraints:

| Phase | Required conditions |
|---|---|
| `required` | Valid trigger and complete failed set; no selected branch, Inspection, consumed permit, attempt, lane receipt, or terminal evidence. A governance-required commitment may be pending. |
| `reviewed` | `reviewIdentity` and a `learning-result` projection commitment. |
| `projected` | Matching learning result freshly dual-verified; pending commitment cleared. |
| `alternative-inspected` | Selected alternative, discriminating check, and post-learning Inspection identities. |
| `alternative-permitted` | Logical only: unchanged inspected state plus exact transient permit. |
| `alternative-authorized-pending-lane` | `authorize` records issued and consumed permit hashes plus the exact attempt; claim is required and no composite or atomic claim receipt exists. |
| `alternative-authorized` | Exact attempt plus no required claim or matching committed claim receipt. |
| `alternative-verified` | Accepted retained completion plus terminal evidence. |
| `no-progress-verified` | Complete proof and fresh no-progress verification; selected-alternative and attempt fields are forbidden. |

A substantive trigger, failed-set, assumption, approach-history, or distinguishing-evidence change returns governance to `required` with `revision + 1`. Nonsemantic Inspection staleness returns the branch to `projected`.

```text
GovernanceEventV1 = {
  type: "learning-governance",
  version: 1,
  eventHash: Hash,
  governanceIdentity: Hash,
  revision: PositiveInteger,
  target: AffectedTarget,
  trigger: RepeatRelationshipV1,
  failedApproachSetIdentity: Hash,
  phase: LearningGovernancePhase,
  reviewIdentity?: Hash,
  selectedAlternativeIdentity?: Hash,
  discriminatingCheckIdentity?: Hash,
  postLearningInspectionIdentity?: Hash,
  consumedAttemptPermitHash?: Hash,
  authorizedAttemptIdentity?: Hash,
  laneClaimReceiptIdentity?: Hash,
  terminalEvidenceIdentity?: Hash,
  suspension?: SuspensionV1,
  halt?: HaltV1,
  controlledEnd?: ControlledUnresolvedEndV1
}

eventHash = SHA256(CJ(event without eventHash))
```

Events sharing a governance identity have strictly increasing revisions. Same-revision different bytes are conflict.

## RunState Extension

Existing fields remain authoritative. Add exactly:

```text
pendingCompletion?: PendingCompletionRetentionV2
learningGovernance?: LearningGovernanceV1
```

Exact event bodies are forbidden in RunState. At most one pending completion and one governance case exist, and neither may be overwritten by another target. A governed target has a pending attempt only in an authorized phase and it matches `authorizedAttemptIdentity`. A pending attempt for another target requires valid unchanged suspension and Feature 005 scheduling evidence. `policy.parallel` remains literal `1`. No runtime command writes an ObjectiveRegistry.

## Owner, Mapping, And Lane Prestate

```text
OwnerBindingV1 = {
  ideaPath: DirectIdeaPath,
  specPath: CanonicalSpecPath,
  ownerCapture: CapturedBytesV1,
  ownerBindingHash: Hash
}

ownerBindingHash = SHA256(CJ({
  ideaPath,
  specPath,
  ownerCapture: {
    sha256,
    byteLength
  }
}))
```

```text
LightweightMappingV1 = {
  version: 1,
  lane: "lightweight",
  target: LightweightTarget,
  ownerBindingHash: Hash,
  tasksPath: NormalizedWorkspacePath,
  tasksDescriptor: { sha256: Hash, byteLength: NonnegativeSafeInteger },
  taskStatePath: ".dude/state/task-state.json",
  taskStateDescriptor: { sha256: Hash, byteLength: NonnegativeSafeInteger },
  taskKey: TaskKey
}

TrackedMappingV1 = {
  version: 1,
  lane: "tracked",
  target: TrackedTarget,
  ownerBindingHash: Hash,
  taskKey: TaskKey,
  listDescriptor: { sha256: Hash, byteLength: NonnegativeSafeInteger },
  detailDescriptor: { sha256: Hash, byteLength: NonnegativeSafeInteger },
  historyDescriptor: { sha256: Hash, byteLength: NonnegativeSafeInteger }
}

targetMappingHash = SHA256(CJ(mapping))
```

```text
LightweightPrestateV1 = {
  version: 1,
  lane: "lightweight",
  target: LightweightTarget,
  glyph: " " | "~" | "!" | "x",
  blockedBy: ShortText | null,
  tasksDescriptor: { sha256: Hash, byteLength: NonnegativeSafeInteger },
  taskStateDescriptor: { sha256: Hash, byteLength: NonnegativeSafeInteger },
  ownerDescriptor: { sha256: Hash, byteLength: NonnegativeSafeInteger }
}

TrackedPrestateV1 = {
  version: 1,
  lane: "tracked",
  target: TrackedTarget,
  taskKey: TaskKey,
  status: "open" | "in_progress" | "blocked" | "closed",
  blocker: ShortText | null,
  listDescriptor: { sha256: Hash, byteLength: NonnegativeSafeInteger },
  detailDescriptor: { sha256: Hash, byteLength: NonnegativeSafeInteger },
  historyDescriptor: { sha256: Hash, byteLength: NonnegativeSafeInteger },
  ownerDescriptor: { sha256: Hash, byteLength: NonnegativeSafeInteger }
}

lanePrestateHash = SHA256(CJ(prestate))
```

A tracked mapping requires one unique issue-to-task mapping from complete fresh list, detail, and history captures.

## Projection Plans

```text
ProjectionPlanItemV1 = {
  eventHash: Hash,
  currentRunRecord: {
    substantive: {
      event: AuthoritativeEvent
    }
  },
  currentRunRecordHash: Hash,
  laneEventLine: EventLineText,
  laneEventLineTerminator: "LF",
  laneEventLineHash: Hash,
  laneEventRecordHash: Hash,
  mutation: LightweightProjectionMutationV1 | TrackedProjectionMutationV1,
  mutationIdentity: Hash,
  projectionPermit: ProjectionPermitV1
}
```

`currentRunRecordHash = SHA256(CJ({event}))`. The current-run record remains `{substantive:{event}}`; this hash binds its exact substantive event body. The line and record hashes follow the dedicated event-line formulas above.

```text
ProjectionPlanV1 = {
  version: 1,
  target: AffectedTarget,
  batchIdentity: Hash,
  items: ProjectionPlanItemV1[1..17],
  planIdentity: Hash
}

planIdentity = SHA256(CJ({
  version,
  target,
  batchIdentity,
  items
}))
```

```text
ProjectionRefV1 = {
  version: 1,
  target: AffectedTarget,
  batchIdentity: Hash,
  eventHashes: Hash[1..17],
  currentRunProjectionIdentity: Hash,
  laneProjectionIdentity: Hash
}
```

Projection validation requires one byte-equivalent event on each authoritative surface. Exact existing copies are idempotent. One-sided, duplicate, stale, malformed, wrong-target, or conflicting copies remain unresolved.

## Post-Learning Inspection And Acyclic Permits

```text
PostLearningInspectionBindingV1 = {
  version: 1,
  target: AffectedTarget,
  governanceIdentity: Hash,
  repeatIdentity: Hash,
  reviewIdentity: Hash,
  failedApproachSetIdentity: Hash,
  projectionRef: ProjectionRefV1,
  evidenceHash: Hash,
  branchIdentity: Hash,
  expectedProjectionEventHashes: Hash[1..17],
  postLearningInspectionIdentity: Hash
}
```

For a selected alternative:

```text
branchIdentity = SHA256(CJ({
  selectedAlternativeIdentity,
  discriminatingCheckIdentity,
  failedApproachSetIdentity
}))
```

For no-progress, `branchIdentity = noProgressProof.proofIdentity`.

```text
postLearningInspectionIdentity =
  SHA256(CJ(record without postLearningInspectionIdentity))
```

Expected projection additions are excluded from evidence-drift classification.

```text
AttemptAuthorizationPermitV1 = {
  version: 1,
  kind: "attempt-authorization",
  origin: "dude-work",
  target: AffectedTarget,
  subjectRunStateHash: Hash,
  governanceIdentity: Hash | null,
  governancePhase: "alternative-inspected" | null,
  postLearningInspectionIdentity: Hash | null,
  selectedAlternativeIdentity: Hash | null,
  discriminatingCheckIdentity: Hash | null,
  inspectionEvidenceHash: Hash,
  targetMappingHash: Hash,
  lanePrestateHash: Hash,
  permitHash: Hash
}

permitHash = SHA256(CJ(permit without permitHash))
```

Permit issuance is pure and leaves the exact state unchanged. Governance fields are all null for an ordinary autonomous attempt with no active case and all matching non-null values for a selected alternative. `authorize` validates and consumes the permit before mutating RunState. A stale, replayed, wrong-state, wrong-target, wrong-mapping, wrong-prestate, wrong-branch, or wrong-check permit rejects.

The selected-alternative authority order is strictly acyclic:

1. dual-verify learning and governance projection;
2. bind a fresh post-learning Inspection;
3. issue an attempt permit against the unchanged inspected RunState;
4. let `authorize` consume that permit and produce successor RunState;
5. if required, derive a new lane permit against that post-authorization state;
6. apply the exact lane claim and commit its fresh atomic or composite receipt;
7. execute the bound attempt;
8. run retention-first `complete.capture`, exact projection, and `complete.finalize`;
9. verify accepted completion or no-progress;
10. issue the terminal lane permit; and
11. commit the terminal receipt.

No permit is reused across the state mutation it authorizes.

## Complete Lane Mutation Types

```text
BlockerEffectV1 =
  {
    kind: "unchanged",
    before: ShortText | null,
    after: ShortText | null
  }
  |
  {
    kind: "add",
    before: null,
    after: ShortText
  }
  |
  {
    kind: "remove",
    before: ShortText,
    after: null
  }
  |
  {
    kind: "replace",
    before: ShortText,
    after: ShortText
  }
```

For `unchanged`, `before` and `after` are byte-identical. For `replace`, they are byte-distinct.

```text
EventLineAppendV1 = {
  eventHash: Hash,
  exactLine: EventLineText,
  terminator: "LF"
}

EventLineEffectV1 =
  { kind: "none" }
  |
  {
    kind: "append-exact",
    lines: EventLineAppendV1[1..4],
    appendIfAbsent: true
  }
```

Each line parses to the event carrying its matching `eventHash`.

```text
OwnerLogEffectV1 =
  { kind: "none" }
  |
  {
    kind: "append-exact",
    ownerPath: DirectIdeaPath,
    expectedOwnerHash: Hash,
    exactLines: OwnerLogLineText[1..4],
    terminator: "LF",
    appendIfAbsent: true
  }
```

`expectedOwnerHash` hashes the complete exact owner-file bytes before append, not only its Coordinator Log section.

```text
LightweightProjectionMutationV1 = {
  version: 1,
  lane: "lightweight",
  kind: "append-event",
  reason: "event-projection",
  target: LightweightTarget,
  fromGlyph: " " | "~" | "!" | "x",
  toGlyph: " " | "~" | "!" | "x",
  blocker: BlockerEffectV1,
  eventLines: EventLineEffectV1,
  ownerLog: OwnerLogEffectV1,
  snapshotUpdatedAt: CanonicalUtcTimestamp
}
```

A projection-plan item requires exactly one append line matching its item event.

```text
LightweightStateMutationV1 = {
  version: 1,
  lane: "lightweight",
  kind:
    "claim" |
    "task-blocked" |
    "task-completed" |
    "controlled-end",
  reason:
    "initial-claim" |
    "resume-claim" |
    "post-learning-claim" |
    "task-blocked" |
    "no-progress" |
    "task-completed" |
    "controlled-unresolved-end",
  target: LightweightTarget,
  fromGlyph: " " | "~" | "!" | "x",
  toGlyph: " " | "~" | "!" | "x",
  blocker: BlockerEffectV1,
  eventLines: EventLineEffectV1,
  ownerLog: OwnerLogEffectV1,
  snapshotUpdatedAt: CanonicalUtcTimestamp
}
```

```text
TrackedProjectionMutationV1 = {
  version: 1,
  lane: "tracked",
  kind: "append-event",
  reason: "event-projection",
  target: TrackedTarget,
  fromStatus: "open" | "in_progress" | "blocked" | "closed",
  toStatus: "open" | "in_progress" | "blocked" | "closed",
  blocker: BlockerEffectV1,
  eventLines: EventLineEffectV1,
  ownerLog: OwnerLogEffectV1
}
```

A projection-plan item requires exactly one append line matching its item event.

```text
TrackedStateMutationV1 = {
  version: 1,
  lane: "tracked",
  kind:
    "claim" |
    "task-blocked" |
    "task-completed" |
    "controlled-end",
  reason:
    "initial-claim" |
    "resume-claim" |
    "post-learning-claim" |
    "task-blocked" |
    "no-progress" |
    "task-completed" |
    "controlled-unresolved-end",
  target: TrackedTarget,
  fromStatus: "open" | "in_progress" | "blocked" | "closed",
  toStatus: "open" | "in_progress" | "blocked" | "closed",
  blocker: BlockerEffectV1,
  eventLines: EventLineEffectV1,
  ownerLog: OwnerLogEffectV1
}
```

Closed unions:

```text
LightweightWorkProjectMutationV1 = LightweightProjectionMutationV1

LightweightWorkSetMutationV1 =
  LightweightStateMutationV1 |
  LightweightIncidentSupersessionMutationV1

TrackedWorkProjectMutationV1 = TrackedProjectionMutationV1
TrackedWorkTransitionMutationV1 = TrackedStateMutationV1
```

For every projection or lane transition:

```text
mutationIdentity =
  SHA256(CJ(exact closed lane-specific mutation object))
```

It is never derived from an abstract kind, reason, target, event hash, or prestate summary.

### Closed Transition Matrix

| Lane | Kind | Allowed transition | Required blocker effect |
|---|---|---|---|
| Lightweight | `append-event` | any glyph to the same glyph | `unchanged` |
| Lightweight | `claim` | ` ` -> `~` | `unchanged` with null before/after |
| Lightweight | `claim` | `!` -> `~` | `remove` |
| Lightweight | `task-blocked` | ` ` or `~` -> `!` | `add` |
| Lightweight | `task-blocked` | `!` -> `!` | `replace` |
| Lightweight | `task-completed` | `~` -> `x` | `unchanged` with null before/after |
| Lightweight | `controlled-end` | ` `, `~`, or `!` to itself | `unchanged` |
| Lightweight | exact incident | `!` -> `~` | `remove` |
| Lightweight | incomplete incident | `!` -> `!` | `replace` |
| Tracked | `append-event` | any status to the same status | `unchanged` |
| Tracked | `claim` | `open` -> `in_progress` | `unchanged` with null before/after |
| Tracked | `claim` | `blocked` -> `in_progress` | `remove` |
| Tracked | `task-blocked` | `open` or `in_progress` -> `blocked` | `add` |
| Tracked | `task-blocked` | `blocked` -> `blocked` | `replace` |
| Tracked | `task-completed` | `in_progress` -> `closed` | `unchanged` with null before/after |
| Tracked | `controlled-end` | `open`, `in_progress`, or `blocked` to itself | `unchanged` |

No other transition is valid. The reason must match the mutation kind. Controlled Unresolved End is an exact target-state no-op with byte-identical blocker text; its event, owner-log line, and receipt remain real mutations.

A `controlled-end` lane row requires permit-bound phase `alternative-inspected` with exact selected-alternative, check, fresh Inspection, and projection evidence, or `no-progress-verified` with exact proof, fresh no-new-evidence verification, and projection evidence. Phase `projected` is explicitly rejected.

## Projection And Lane Permits

```text
ProjectionPermitV1 = {
  version: 1,
  kind: "lane-projection",
  origin: "dude-work",
  lane: "lightweight" | "tracked",
  target: AffectedTarget,
  subjectRunStateHash: Hash,
  batchIdentity: Hash,
  eventHash: Hash,
  targetMappingHash: Hash,
  lanePrestateHash: Hash,
  mutationIdentity: Hash,
  permitHash: Hash
}
```

```text
LaneMutationPermitV1 = {
  version: 1,
  kind: "lane-mutation",
  origin: "dude-work",
  lane: "lightweight" | "tracked",
  operation: "work-set" | "work-transition",
  target: AffectedTarget,
  subjectRunStateHash: Hash,
  governanceIdentity: Hash | null,
  governancePhase: LearningGovernancePhase | null,
  attemptIdentity: Hash | null,
  targetMappingHash: Hash,
  lanePrestateHash: Hash,
  mutationIdentity: Hash,
  permitHash: Hash
}

permitHash = SHA256(CJ(permit without permitHash))
```

A claim permit returned by `authorize` binds the post-authorization RunState. `transition.prepare-projection` returns the complete exact projection mutation. `transition.issue-lane-permit` accepts the complete lane-specific mutation object, not abstract mutation, reason, or event fields.

## Atomic And Composite Receipts

Lightweight `tasks.md`, `.dude/state/task-state.json`, and the unique owner idea are one all-or-restored transaction whenever the owner log changes. When `ownerLog.kind` is `none`, owner bytes are still protected and verified unchanged. No receipt exists until every changed postimage is freshly reacquired and matches.

```text
LightweightAtomicReceiptV1 = {
  version: 1,
  lane: "lightweight",
  permitHash: Hash,
  mutationIdentity: Hash,
  target: LightweightTarget,
  targetMappingHash: Hash,
  lanePrestateHash: Hash,
  tasksPoststateHash: Hash,
  taskStatePoststateHash: Hash,
  ownerPoststateHash: Hash,
  targetStateChanged: boolean,
  receiptHash: Hash
}
```

`targetStateChanged` is false for projection and Controlled Unresolved End even though history, snapshot, or owner bytes may change.

Tracked lane state and the filesystem owner log cannot share one physical transaction. Dispatch first creates operation evidence. Exact tracked poststate reacquisition then creates the lane receipt. Owner handling either compare-and-appends exact lines against the expected complete owner hash or proves owner bytes unchanged, then creates the owner receipt. Only the composite receipt is success. Dispatch without poststate proof and lane commit without owner proof are distinct pending phases; the lane mutation is neither repeated nor rolled back. Only exact idempotent owner-log reconciliation is allowed.

```text
TrackedCaptureSetV1 = {
  list: CapturedBytesV1,
  detail: CapturedBytesV1,
  history: CapturedBytesV1
}

TrackedCaptureDescriptorSetV1 = {
  list: {sha256: Hash, byteLength: NonnegativeSafeInteger},
  detail: {sha256: Hash, byteLength: NonnegativeSafeInteger},
  history: {sha256: Hash, byteLength: NonnegativeSafeInteger}
}

TrackedDispatchResultV1 = {
  version: 1,
  authority: "beads",
  operation: "work-project" | "work-transition",
  target: TrackedTarget,
  invocationIdentity: Hash,
  result: CapturedBytesV1,
  dispatchResultIdentity: Hash
}

TrackedDispatchRecoveryPayloadV1 = {
  version: 1,
  operationEvidenceIdentity: Hash,
  original: TrackedCaptureSetV1,
  dispatchResult: TrackedDispatchResultV1,
  mutation: TrackedProjectionMutationV1 | TrackedStateMutationV1,
  payloadIdentity: Hash
}

TrackedOperationEvidenceV1 = {
  version: 1,
  lane: "tracked",
  operation: "work-project" | "work-transition",
  permitHash: Hash,
  mutationIdentity: Hash,
  target: TrackedTarget,
  targetMappingHash: Hash,
  lanePrestateHash: Hash,
  originalCaptures: TrackedCaptureDescriptorSetV1,
  normalizedPrestate: TrackedPrestateV1,
  dispatchResultIdentity: Hash,
  operationEvidenceIdentity: Hash
}

operationEvidenceIdentity =
  SHA256(CJ(record without operationEvidenceIdentity))

TrackedLaneCommitReceiptV1 = {
  version: 1,
  lane: "tracked",
  operationEvidenceIdentity: Hash,
  permitHash: Hash,
  mutationIdentity: Hash,
  target: TrackedTarget,
  targetMappingHash: Hash,
  lanePrestateHash: Hash,
  poststateCaptures: TrackedCaptureDescriptorSetV1,
  lanePoststateHash: Hash,
  eventLineRecordHashes: Hash[0..4],
  receiptHash: Hash
}

dispatchResultIdentity = SHA256(CJ(dispatch result without dispatchResultIdentity))
payloadIdentity = SHA256(CJ(recovery payload without payloadIdentity))
lanePoststateHash = SHA256(CJ(poststateCaptures))

OwnerLogCommitReceiptV1 =
  {
    version: 1,
    effect: "unchanged",
    mutationIdentity: Hash,
    ownerPath: DirectIdeaPath,
    ownerPrestateHash: Hash,
    ownerPoststateHash: Hash,
    receiptHash: Hash
  }
  |
  {
    version: 1,
    effect: "append-exact",
    mutationIdentity: Hash,
    ownerPath: DirectIdeaPath,
    ownerPrestateHash: Hash,
    exactLineHashes: Hash[1..4],
    ownerPoststateHash: Hash,
    receiptHash: Hash
  }

TrackedCompositeReceiptV1 = {
  version: 1,
  lane: "tracked",
  mutationIdentity: Hash,
  laneReceiptHash: Hash,
  ownerLogReceiptHash: Hash,
  receiptHash: Hash
}
```

For `effect:"unchanged"`, owner prestate and poststate hashes are equal. All receipt hashes exclude only their own `receiptHash`. A bare tracked lane receipt is never successful. Only a matching composite receipt may advance governance or authorize another governed Work transition. Pending or ambiguous evidence blocks Work and close reporting; unrecoverable ambiguity is a run-wide halt.

```text
LaneRefusalReason =
  "invalid-request-shape" |
  "unknown-field" |
  "invalid-canonical-value" |
  "unsafe-root-or-path" |
  "expected-capture-mismatch" |
  "owner-resolution-failed" |
  "owner-prestate-mismatch" |
  "target-mismatch" |
  "mapping-missing" |
  "mapping-ambiguous" |
  "mapping-mismatch" |
  "run-state-mismatch" |
  "permit-hash-mismatch" |
  "permit-stale" |
  "permit-replayed" |
  "permit-operation-mismatch" |
  "mutation-schema-mismatch" |
  "mutation-identity-mismatch" |
  "transition-not-allowed" |
  "event-line-mismatch" |
  "event-conflict" |
  "lane-prestate-mismatch" |
  "snapshot-corrupt" |
  "owner-log-conflict" |
  "atomic-apply-failed" |
  "tracked-operation-failed"

LaneIndeterminateReason =
  "lightweight-rollback-incomplete" |
  "tracked-lane-outcome-ambiguous" |
  "owner-log-outcome-ambiguous"
```

```text
LaneOperationResultV1 =
  {
    ok: true,
    phase: "committed",
    receipt:
      LightweightAtomicReceiptV1 |
      TrackedCompositeReceiptV1
  }
  |
  {
    ok: false,
    phase: "refused",
    reason: LaneRefusalReason,
    unchangedPrestateHash: Hash
  }
  |
  {
    ok: false,
    phase: "tracked-operation-dispatched",
    reason: "tracked-poststate-proof-pending",
    operationEvidence: TrackedOperationEvidenceV1,
    recoveryPayload: TrackedDispatchRecoveryPayloadV1,
    recoveryIdentity: Hash
  }
  |
  {
    ok: false,
    phase: "tracked-lane-committed",
    reason: "owner-log-receipt-pending",
    laneReceipt: TrackedLaneCommitReceiptV1,
    operationEvidence: TrackedOperationEvidenceV1,
    recoveryPayload: TrackedDispatchRecoveryPayloadV1,
    recoveryIdentity: Hash
  }
  |
  {
    ok: false,
    phase: "indeterminate",
    reason: LaneIndeterminateReason,
    observedEvidenceHash: Hash
  }
```

A refusal asserts no authoritative mutation. A dispatched result carries operation evidence and no lane receipt. A lane-committed result acknowledges exact tracked poststate but grants no further governance authority. An indeterminate result is a run-wide hard stop.

## Suspension, Halt, And Controlled End

```text
SuspensionV1 = {
  version: 1,
  reason:
    "unresolved-learning" |
    "target-hard-stop" |
    "per-target-budget",
  affectedTarget: AffectedTarget,
  affectedChangeSetHash: Hash,
  selectedTarget: AffectedTarget,
  selectedChangeSetHash: Hash,
  readinessEvidenceHash: Hash,
  dependencyProofHash: Hash,
  disjointnessProofHash: Hash,
  schedulingEvidenceIdentity: Hash
}
```

The targets differ. Feature 005 derives readiness, dependency, and disjointness evidence. Suspension changes no affected-target lane state.

```text
HaltV1 = {
  version: 1,
  scope: "target" | "run",
  kind:
    "security" |
    "safety" |
    "authority" |
    "credential" |
    "destructive-confirmation" |
    "spending" |
    "external-authorization" |
    "lane-ambiguity" |
    "ownership-ambiguity" |
    "overall-budget" |
    "unavailable-dependency" |
    "unavailable-input" |
    "per-target-budget" |
    "target-hard-stop" |
    "learning-evidence-incomplete" |
    "unrecoverable-governance-evidence",
  reason: Identifier,
  evidenceIdentity: Hash,
  target?: AffectedTarget,
  projectionDisposition:
    "verified" |
    "rederive-required" |
    "unavailable"
}
```

Run-only kinds are security, safety, authority, credential, destructive confirmation, spending, external authorization, lane ambiguity, ownership ambiguity, overall budget, and unrecoverable governance evidence. Target-only kinds are unavailable dependency, unavailable input, per-target budget, target hard stop, and target-bound learning-evidence incompleteness. Missing or conflicting scope is run-wide ambiguity.

```text
ControlledEndBranchEvidenceV1 =
  {
    kind: "selected-alternative",
    sourcePhase: "alternative-inspected",
    selectedAlternativeIdentity: Hash,
    discriminatingCheckIdentity: Hash,
    postLearningInspectionIdentity: Hash
  }
  |
  {
    kind: "no-progress",
    sourcePhase: "no-progress-verified",
    noProgressProofIdentity: Hash,
    noProgressVerificationIdentity: Hash
  }

ControlledUnresolvedEndV1 = {
  version: 1,
  kind: "controlled-unresolved-end",
  branchEvidence: ControlledEndBranchEvidenceV1,
  governanceBranchStatus: "resolved",
  laneDisposition: "pending",
  targetDisposition: "unchanged",
  invocationOutcome: "controlled-unresolved-end",
  reviewIdentity: Hash,
  learningReviewEventHash: Hash,
  projectionRef: ProjectionRefV1,
  endIdentity: Hash
}

endIdentity = SHA256(CJ(record without endIdentity))
```

`projectionRef` identifies the matching `learning-result` batch containing `learningReviewEventHash`.

```text
RetainedOccurrenceRefV1 = {
  occurrenceIdentity: Hash,
  eventHash: Hash
}

GovernanceRederivationProofV1 = {
  version: 1,
  target: AffectedTarget,
  governanceIdentity: Hash,
  repeat: RepeatRelationshipV1,
  failedApproachSetIdentity: Hash,
  retainedOccurrences: [
    RetainedOccurrenceRefV1,
    RetainedOccurrenceRefV1
  ],
  proofIdentity: Hash
}

proofIdentity =
  SHA256(CJ(record without proofIdentity))

ImmediateHaltProjectionEvidenceV1 =
  {
    disposition: "verified",
    projectionRef: ProjectionRefV1,
    governanceIdentity: Hash,
    governanceRevision: PositiveInteger,
    governanceEventHash: Hash
  }
  |
  {
    disposition: "rederive-required",
    rederivationProof: GovernanceRederivationProofV1
  }
  |
  {
    disposition: "unavailable",
    unrecoverableEvidenceIdentity: Hash
  }

ImmediateHaltOutcomeV1 = {
  ok: false,
  invocationOutcome: "immediate-halt-end",
  targetDisposition: "unchanged",
  halt: HaltV1,
  projectionDisposition:
    "verified" |
    "rederive-required" |
    "unavailable",
  projectionEvidence: ImmediateHaltProjectionEvidenceV1
}
```

`projectionDisposition`, `halt.projectionDisposition`, and `projectionEvidence.disposition` are equal. `verified` requires a fresh dual-verifying `projectionRef` for the named Governance Event at the same target, governance identity, and bound highest consistent revision. `rederive-required` requires the exact complete dual-retained occurrence event pair named by `repeat`, in chronology order, and a recomputed proof over that pair, target, Repeat Relationship, complete failed set, and governance identity. `unavailable` requires `halt.scope === "run"`, `halt.kind === "unrecoverable-governance-evidence"`, and `unrecoverableEvidenceIdentity === halt.evidenceIdentity`; it remains a run-wide hard stop. Other-branch fields are forbidden.

This ephemeral halt/audit outcome is not produced by `transition.controlled-end` and creates no `ControlledUnresolvedEndV1`, controlled-end permit, mutation, or receipt.

## Public Runtime Commands

The internal command tokens remain exactly `inspect`, `authorize`, `complete`, `learn`, `transition`, and `audit`. They are not top-level user-facing Dude commands.

### `complete.capture`

```text
{
  mode: "capture",
  state: RunState,
  input: TransportInput,
  completion: {
    version: 2,
    target: AffectedTarget,
    attemptIdentity: Hash,
    route: ExistingRoute,
    outcome: ExistingOutcome,
    operations: Identifier[],
    changedTargets: SubjectIdentity[],
    resultIdentity: Hash,
    verificationEnvelopeIdentity: Hash,
    reviewEnvelopeIdentity: Hash,
    findingIdentities: Hash[0..16]
  }
}
```

Success:

```text
{
  inspection: Inspection,
  completion: {
    captured: true,
    finalized: false,
    reason: "occurrence-retention-required",
    state: RunState,
    projectionBatch: ProjectionBatchV1
  }
}
```

The response batch has purpose `occurrence-retention`. Caller-authored envelope bodies, findings, checks, verdicts, chronology, and replacement event bodies are forbidden.

### `complete.finalize`

```text
{
  mode: "finalize",
  state: RunState,
  input: TransportInput,
  projectionBatch: ProjectionBatchV1
}
```

Success:

```text
{
  inspection: Inspection,
  completion: {
    captured: true,
    finalized: true,
    completed: boolean,
    reason: OutcomeReason,
    state: RunState,
    result: ExistingNormalizedResult,
    repeat?: RepeatRelationshipV1,
    projectionBatch?: ProjectionBatchV1
  }
}
```

The optional batch is required exactly when a retained repeat creates `required` governance and has purpose `governance-required`.

Failure leaves `captured:true`, `finalized:false`, the attempt pending, and state unresolved.

### `learn`

The request carries semantic findings and `AlternativeV2` rows but cannot supply review identity, event hash, governance phase, projection status, no-progress authorization, or permit.

Success returns one `LearningReviewEventV2`, one `GovernanceEventV1`, and one exact `learning-result` batch in that order, while successor RunState stores only the commitment.

### Projection Transitions

```text
transition.prepare-projection request = {
  mode: "prepare-projection",
  state: RunState,
  input: TransportInput,
  projectionBatch: ProjectionBatchV1
}
```

It validates every exact body and hash, batch identity, state commitment, owner, target, mapping, and prestate, then returns `ProjectionPlanV1` without advancing state.

```text
transition.verify-projection request = {
  mode: "verify-projection",
  state: RunState,
  input: TransportInput,
  projectionBatch: ProjectionBatchV1
}
```

It reacquires both surfaces and advances only after exact dual verification. Occurrence admission remains owned by `complete.finalize`.

### Selected-Alternative Transitions

- `transition.bind-post-learning-inspection` accepts `{mode,state,input}` and returns `PostLearningInspectionBindingV1`.
- `transition.issue-attempt-permit` accepts `{mode,state,input,lanePrestate,targetMapping}` and returns the unchanged state plus `AttemptAuthorizationPermitV1`.
- autonomous `authorize` requires `attemptPermit`; it consumes that permit, returns the successor state and attempt identity, and returns a post-authorization lane permit exactly when `claimRequired:true`.
- `transition.issue-lane-permit` accepts `{mode,state,input,mutation,lanePrestate,targetMapping}`, where `mutation` is the complete closed lane-specific mutation object.
- `transition.commit-lane-receipt` accepts the exact permit and matching atomic or composite receipt.
- `transition.verify-no-progress` performs fresh no-new-distinguishing-evidence verification before a no-progress lane permit may issue.

No caller-supplied `authorizedEvidenceIdentity` is accepted.

### Other Transitions

`transition.suspend-target`, `transition.controlled-end`, and `transition.resume-governance` preserve the corrected target/run halt scope. Resume uses the highest consistent projected revision or deterministically derives `required` from exact dual-retained occurrence events. Every transition mode uses a closed fail-response and rejects unknown or conditionally inapplicable fields.

## Closed Lane Wrapper Requests

Before any mutation, every wrapper validates its closed request, freshly reacquires expected sources, compares exact bytes, recomputes owner, mapping, RunState, prestate, permit, every event parsed from `mutation.eventLines`, mutation and `mutationIdentity`, validates the transition matrix, and refuses before mutation on mismatch. No wrapper accepts a command line, executable, shell fragment, or arbitrary subprocess argument.

### Lightweight `work-project`

`LightweightWorkProjectRequestV1` is exactly:

```text
LightweightWorkProjectRequestV1 = {
  version: 1,
  operation: "work-project",
  root: CanonicalWorkspaceRoot,
  owner: OwnerBindingV1,
  target: LightweightTarget,
  state: RunState,
  permit: ProjectionPermitV1,
  mapping: LightweightMappingV1,
  expected: {
    tasksPath: NormalizedWorkspacePath,
    tasks: CapturedBytesV1,
    taskStatePath: ".dude/state/task-state.json",
    taskState: CapturedBytesV1
  },
  mutation: LightweightProjectionMutationV1
}
```

### Lightweight `work-set`

`LightweightWorkSetRequestV1` is exactly:

```text
LightweightWorkSetRequestV1 = {
  version: 1,
  operation: "work-set",
  root: CanonicalWorkspaceRoot,
  owner: OwnerBindingV1,
  target: LightweightTarget,
  state: RunState,
  permit: LaneMutationPermitV1,
  mapping: LightweightMappingV1,
  expected: {
    tasksPath: NormalizedWorkspacePath,
    tasks: CapturedBytesV1,
    taskStatePath: ".dude/state/task-state.json",
    taskState: CapturedBytesV1
  },
  mutation:
    LightweightStateMutationV1 |
    LightweightIncidentSupersessionMutationV1
}
```

The wrapper applies tasks, snapshot, and owner postimages all-or-restored and returns only `LightweightAtomicReceiptV1`, a refusal, or an indeterminate rollback result.

### Tracked `work-project`

`TrackedWorkProjectRequestV1` is exactly:

```text
TrackedWorkProjectRequestV1 = {
  version: 1,
  operation: "work-project",
  root: CanonicalWorkspaceRoot,
  owner: OwnerBindingV1,
  target: TrackedTarget,
  state: RunState,
  permit: ProjectionPermitV1,
  mapping: TrackedMappingV1,
  expected: {
    list: CapturedBytesV1,
    detail: CapturedBytesV1,
    history: CapturedBytesV1
  },
  mutation: TrackedProjectionMutationV1
}
```

### Tracked `work-transition`

`TrackedWorkTransitionRequestV1` is exactly:

```text
TrackedWorkTransitionRequestV1 = {
  version: 1,
  operation: "work-transition",
  root: CanonicalWorkspaceRoot,
  owner: OwnerBindingV1,
  target: TrackedTarget,
  state: RunState,
  permit: LaneMutationPermitV1,
  mapping: TrackedMappingV1,
  expected: {
    list: CapturedBytesV1,
    detail: CapturedBytesV1,
    history: CapturedBytesV1
  },
  mutation: TrackedStateMutationV1
}
```

### Tracked `work-prove-poststate`

```text
TrackedWorkProvePoststateRequestV1 = {
  version: 1,
  operation: "work-prove-poststate",
  root: CanonicalWorkspaceRoot,
  owner: OwnerBindingV1,
  target: TrackedTarget,
  state: RunState,
  permit: ProjectionPermitV1 | LaneMutationPermitV1,
  mapping: TrackedMappingV1,
  operationEvidence: TrackedOperationEvidenceV1,
  recoveryPayload: TrackedDispatchRecoveryPayloadV1,
  recoveryIdentity: Hash,
  observed: TrackedCaptureSetV1
}
```

### Tracked `work-reconcile-owner`

```text
TrackedWorkReconcileOwnerRequestV1 = {
  version: 1,
  operation: "work-reconcile-owner",
  root: CanonicalWorkspaceRoot,
  owner: OwnerBindingV1,
  target: TrackedTarget,
  state: RunState,
  permit: ProjectionPermitV1 | LaneMutationPermitV1,
  mapping: TrackedMappingV1,
  operationEvidence: TrackedOperationEvidenceV1,
  recoveryPayload: TrackedDispatchRecoveryPayloadV1,
  laneReceipt: TrackedLaneCommitReceiptV1,
  recoveryIdentity: Hash,
  observed: {
    list: CapturedBytesV1,
    detail: CapturedBytesV1,
    history: CapturedBytesV1,
    owner: CapturedBytesV1
  }
}
```

`owner.ownerCapture` is the original dispatch preimage. `observed` is caller-supplied fresh evidence that the wrapper immediately reacquires and compares exactly. The exact owner effect is `mutation.ownerLog`; no duplicate owner-effect field is accepted.

```text
dispatchRecoveryIdentity = SHA256(CJ({
  version: 1,
  stage: "tracked-operation-dispatched",
  operationEvidenceIdentity,
  payloadIdentity,
  mutationIdentity,
  target,
  expectedNextOperation: "work-prove-poststate"
}))

ownerRecoveryIdentity = SHA256(CJ({
  version: 1,
  stage: "tracked-lane-committed",
  laneReceiptHash,
  operationEvidenceIdentity,
  payloadIdentity,
  mutationIdentity,
  target,
  expectedNextOperation: "work-reconcile-owner"
}))
```

```text
TrackedPoststateRecoveryResultV1 =
  {
    ok: false,
    phase: "tracked-lane-committed",
    reason: "owner-log-receipt-pending",
    laneReceipt: TrackedLaneCommitReceiptV1,
    operationEvidence: TrackedOperationEvidenceV1,
    recoveryPayload: TrackedDispatchRecoveryPayloadV1,
    recoveryIdentity: Hash
  }
  |
  {
    ok: false,
    phase: "indeterminate",
    reason: "tracked-lane-outcome-ambiguous",
    observedEvidenceHash: Hash
  }

TrackedOwnerRecoveryResultV1 =
  {
    ok: true,
    phase: "committed",
    ownerReceipt: OwnerLogCommitReceiptV1,
    receipt: TrackedCompositeReceiptV1
  }
  |
  {
    ok: false,
    phase: "tracked-lane-committed",
    reason: "owner-log-receipt-pending",
    laneReceipt: TrackedLaneCommitReceiptV1,
    operationEvidence: TrackedOperationEvidenceV1,
    recoveryPayload: TrackedDispatchRecoveryPayloadV1,
    recoveryIdentity: Hash
  }
  |
  {
    ok: false,
    phase: "indeterminate",
    reason: "owner-log-outcome-ambiguous",
    observedEvidenceHash: Hash
  }
```

| Input evidence phase | Permitted operation | Permitted result |
|---|---|---|
| `tracked-operation-dispatched` | `work-prove-poststate` | `tracked-lane-committed` or `indeterminate` |
| `tracked-lane-committed` | `work-reconcile-owner` | `committed`, same pending phase, or `indeterminate` |

No other recovery transition is valid. Neither recovery operation may return `refused`, because prior authoritative mutation is possible. Both operations validate the exact originals against `operationEvidence.originalCaptures`, recompute the normalized original mapping and prestate, validate the exact mutation and dispatch result, and derive the complete expected list/detail/history postimage with the canonical tracked projector. The projector permits only mutation-authorized changes plus operation-generated values bound by `dispatchResult`; every other byte is unrelated drift. `work-prove-poststate` compares fresh reacquired captures to that postimage without dispatch. `work-reconcile-owner` independently repeats that proof before owner mutation and again before composite receipt creation, then accepts only the exact original owner preimage or deterministic single-append postimage.

Cross-bindings are mandatory:

- `owner.ownerCapture` is the sole owner preimage.
- `mapping.ownerBindingHash === owner.ownerBindingHash`.
- Lane prestate owner descriptor matches `owner.ownerCapture`.
- `ownerLog.kind:"append-exact"` requires matching owner path and expected owner hash.
- `ownerLog.kind:"none"` requires unchanged owner bytes.
- A top-level `event` or duplicate owner field is unknown.
- Work-project requires one exact mutation event line matching `permit.eventHash`; all other events are likewise parsed from `mutation.eventLines`.

A tracked operation first returns operation evidence after dispatch. Fresh exact poststate inline or through `work-prove-poststate` creates the lane receipt without another dispatch; owner append or unchanged-owner proof inline or through `work-reconcile-owner` creates the owner receipt; only their composite is success. Manual, guarded, mirror, non-Work, and coordinator-maintenance operations remain separate and cannot be cited as autonomous Work evidence.

Tracked `work-project` and `work-transition` return exactly `LaneOperationResultV1`; the recovery wrappers return only their exact closed recovery result unions. No wrapper-specific open response shape is permitted.

## Feature 008 Core-Close Contracts

Feature 009's sole terminal task is `T009@696e6369`. It is open, non-`[P]`, `[Shared]`, directly depends on T001 through T008, and declares exactly this sorted source set:

```text
[
  "src/agents/dude.agent.md",
  "src/instructions/dude.instructions.md",
  "src/skills/dude-lightweight-execution/SKILL.md",
  "src/skills/dude-lightweight-execution/board.mjs",
  "src/skills/dude-lightweight-execution/board.test.mjs",
  "src/skills/dude-receiving-code-review/SKILL.md",
  "src/skills/dude-reviewer-protocol/SKILL.md",
  "src/skills/dude-work/SKILL.md",
  "src/skills/dude-work/recovery.mjs",
  "src/skills/dude-work/recovery.test.mjs"
]
```

```text
declared = SHA256(CJ(sorted exact declared source paths))
```

`source` hashes the complete current sorted `src/**` inventory with rows `{path,type,content}` where type is `100644`, `100755`, or `120000`. `changed` hashes complete sorted baseline-diff rows; deletions use `{path,type:"absent"}`.

Baseline evidence line:

```text
- <UTC> - core-dogfood-baseline v1 terminal=<taskKey> head=<gitOid> src_tree=<gitTreeOid>
```

Accepted evidence line:

```text
- <UTC> - core-dogfood-accepted v1 terminal=<taskKey> head=<gitOid> declared=<sha256> source=<sha256> changed=<sha256> review=<sha256>
```

Each is append-only, coordinator-owned, less than 512 UTF-8 bytes, and stored only in the unique Feature 009 owner log.

```text
AcceptedFeatureEvidenceV1 =
  {
    version: 1,
    mode: "standard",
    featureSpecPath: CanonicalSpecPath,
    definitionContractIdentity: Hash,
    sourceRevisionIdentity: Hash,
    verificationSetIdentity: Hash,
    independentReviewEnvelopeIdentity: Hash,
    acceptedFeatureEvidenceIdentity: Hash
  }
  |
  {
    version: 1,
    mode: "core-close",
    featureSpecPath: CanonicalSpecPath,
    definitionContractIdentity: Hash,
    terminalTaskKey: TaskKey,
    baselineEvidenceLineHash: Hash,
    acceptedEvidenceLineHash: Hash,
    head: GitOid,
    declared: Hash,
    source: Hash,
    changed: Hash,
    verificationSetIdentity: Hash,
    finalReviewEnvelopeIdentity: Hash,
    review: Hash,
    acceptedFeatureEvidenceIdentity: Hash
  }

acceptedFeatureEvidenceIdentity =
  SHA256(CJ(record without acceptedFeatureEvidenceIdentity))
```

Feature 009 requires `mode:"core-close"`. The accepted line must be the latest line matching terminal, baseline, `HEAD`, declaration, source, changed set, and review. The final review remains available or is freshly reacquired. Any drift requires new verification, review, and a later accepted line.

The lifecycle is singular: establish and immediately recheck the clean Feature 008 baseline before T001 source mutation; T008 freezes and independently accepts the complete source revision without product writes or repository `build-dev`; only T009 materializes generated core, verifies parity and protected preservation, obtains final independent approval, appends and revalidates accepted evidence, and derives `acceptedFeatureEvidenceIdentity`.

## Acyclic Feature 007 Incident Correction

```text
Feature007Target = {
  specPath:
    ".dude/specs/007-technical-docs-pack-remediation/spec.md",
  lane: "lightweight",
  taskKey: "T001@00709e37"
}
```

```text
Feature007PrestateV1 = {
  version: 1,
  target: Feature007Target,
  ownerBindingHash: Hash,
  ideaPath: ".dude/ideas/technical-docs-pack-remediation.md",
  ideaHash: Hash,
  tasksPath:
    ".dude/specs/007-technical-docs-pack-remediation/tasks.md",
  tasksHash: Hash,
  taskStatePath: ".dude/state/task-state.json",
  taskStateHash: Hash,
  ownerLogTailHash: Hash,
  taskUnitHash: Hash,
  glyph: "!",
  blockedBy: ShortText,
  blockedByHash: Hash
}

blockedByHash = SHA256(UTF8(blockedBy))
prestateIdentity = SHA256(CJ(Feature007PrestateV1))
```

```text
Feature007RollbackV1 = {
  version: 1,
  captures: [
    {
      path: ".dude/ideas/technical-docs-pack-remediation.md",
      bytes: CapturedBytesV1
    },
    {
      path: ".dude/specs/007-technical-docs-pack-remediation/tasks.md",
      bytes: CapturedBytesV1
    },
    {
      path: ".dude/state/task-state.json",
      bytes: CapturedBytesV1
    }
  ],
  rollbackIdentity: Hash
}

rollbackIdentity = SHA256(CJ(record without rollbackIdentity))
```

### Intent Before Events

```text
ExactIncidentCorrectionIntentV1 = {
  version: 1,
  intentIdentity: Hash,
  branch: "exact-evidence",
  operationTime: CanonicalUtcTimestamp,
  incidentIdentity: Hash,
  target: Feature007Target,
  priorDispositionIdentity: Hash,
  acceptedFeatureEvidenceIdentity: Hash,
  prestateIdentity: Hash,
  evidenceInventoryHash: Hash,
  reviewEnvelopeIdentities: [Hash, Hash],
  findingOccurrenceIdentities: [Hash, Hash],
  repeat: RepeatRelationshipV1,
  resultingTargetState: "in-progress-learning-required",
  taskEffect: {
    fromGlyph: "!",
    toGlyph: "~",
    blocker: {
      kind: "remove",
      before: ShortText,
      after: null
    }
  }
}
```

```text
IncompleteIncidentCorrectionIntentV1 = {
  version: 1,
  intentIdentity: Hash,
  branch: "evidence-incomplete",
  operationTime: CanonicalUtcTimestamp,
  incidentIdentity: Hash,
  target: Feature007Target,
  priorDispositionIdentity: Hash,
  acceptedFeatureEvidenceIdentity: Hash,
  prestateIdentity: Hash,
  evidenceInventoryHash: Hash,
  incompleteReason: Identifier,
  resultingTargetState: "blocked-evidence-incomplete",
  taskEffect: {
    fromGlyph: "!",
    toGlyph: "!",
    blocker: {
      kind: "replace",
      before: ShortText,
      after:
        "contract-mismatch: evidence-incomplete autonomous review occurrence evidence unavailable"
    }
  }
}
```

```text
IncidentCorrectionIntentV1 =
  ExactIncidentCorrectionIntentV1 |
  IncompleteIncidentCorrectionIntentV1

intentIdentity = SHA256(CJ(intent without intentIdentity))
```

The exact intent's occurrence identities and repeat are in strict chronology order. The incomplete intent contains no occurrence identity or repeat.

```text
IncidentSupersessionEventV1 = {
  type: "incident-supersession",
  version: 1,
  eventHash: Hash,
  incidentIdentity: Hash,
  intentIdentity: Hash,
  target: Feature007Target,
  priorDispositionIdentity: Hash,
  acceptedFeatureEvidenceIdentity: Hash,
  branch: "exact-evidence" | "evidence-incomplete",
  conclusion: "unauthorized-block-superseded",
  resultingTargetState:
    "in-progress-learning-required" |
    "blocked-evidence-incomplete",
  evidenceInventoryHash: Hash
}

eventHash = SHA256(CJ(event without eventHash))
```

The event has no `previewIdentity` and no mandatory Repeat Relationship.

### Preview And Final Mutation

```text
IncidentLaneMutationCoreV1 = {
  intentIdentity: Hash,
  target: Feature007Target,
  fromGlyph: "!",
  toGlyph: "~" | "!",
  blocker: BlockerEffectV1,
  eventLines: EventLineEffectV1,
  ownerLog: {
    kind: "append-exact",
    ownerPath: ".dude/ideas/technical-docs-pack-remediation.md",
    expectedOwnerHash: Hash,
    exactLines: [OwnerLogLineText],
    terminator: "LF",
    appendIfAbsent: true
  },
  snapshotUpdatedAt: CanonicalUtcTimestamp
}
```

Owner-log line grammar:

```text
- <operationTime> - incident-supersession v1 intent=<intentIdentity> branch=<branch> target=T001@00709e37
```

Exact branch lane-line order is:

1. the two `incident-evidence` finding lines in batch order;
2. the required Governance Event line; and
3. the Incident Supersession Event line.

The incomplete branch contains only the Incident Supersession Event line.

```text
ExactIncidentCorrectionPreviewV1 = {
  version: 1,
  branch: "exact-evidence",
  intent: ExactIncidentCorrectionIntentV1,
  acceptedFeatureEvidence: AcceptedFeatureEvidenceV1,
  prestate: Feature007PrestateV1,
  evidence: {
    inventoryHash: Hash,
    reviewEnvelopeIdentities: [Hash, Hash],
    findingOccurrenceEvents:
      [FindingOccurrenceEventV1, FindingOccurrenceEventV1],
    repeat: RepeatRelationshipV1
  },
  incidentEvidenceBatch: ProjectionBatchV1,
  governanceBatch: ProjectionBatchV1,
  supersessionBatch: ProjectionBatchV1,
  mutationCore: IncidentLaneMutationCoreV1,
  rollback: Feature007RollbackV1,
  previewIdentity: Hash
}
```

```text
IncompleteIncidentCorrectionPreviewV1 = {
  version: 1,
  branch: "evidence-incomplete",
  intent: IncompleteIncidentCorrectionIntentV1,
  acceptedFeatureEvidence: AcceptedFeatureEvidenceV1,
  prestate: Feature007PrestateV1,
  evidence: {
    inventoryHash: Hash,
    incompleteReason: Identifier
  },
  supersessionBatch: ProjectionBatchV1,
  mutationCore: IncidentLaneMutationCoreV1,
  rollback: Feature007RollbackV1,
  previewIdentity: Hash
}

IncidentCorrectionPreviewV1 =
  ExactIncidentCorrectionPreviewV1 |
  IncompleteIncidentCorrectionPreviewV1

previewIdentity = SHA256(CJ(preview without previewIdentity))
```

No value inside the preview references `previewIdentity`. The preview validates all bodies, commitments, batches, prestate, task effect, owner line, and rollback bytes.

```text
LightweightIncidentSupersessionMutationV1 = {
  version: 1,
  lane: "lightweight",
  kind: "incident-supersession",
  reason: "incident-supersession",
  intentIdentity: Hash,
  previewIdentity: Hash,
  target: Feature007Target,
  fromGlyph: "!",
  toGlyph: "~" | "!",
  blocker: BlockerEffectV1,
  eventLines: EventLineEffectV1,
  ownerLog: OwnerLogEffectV1,
  snapshotUpdatedAt: CanonicalUtcTimestamp
}
```

Every field shared with `preview.mutationCore` is byte-identical; the final mutation adds only its closed constant fields and `previewIdentity`. Its `mutationIdentity` therefore binds both intent and preview identities without introducing a cycle.

The derivation order is mandatory and acyclic:

1. acquire fresh accepted-feature evidence, Feature 007 prestate, branch evidence, and rollback bytes;
2. form and hash `IncidentCorrectionIntentV1`;
3. derive only branch-authorized events referencing `intentIdentity`;
4. hash events and form exact batches;
5. form and hash the branch preview, which no event references;
6. form the final mutation by adding `previewIdentity`;
7. hash the complete mutation;
8. issue the lane permit; and
9. atomically apply and freshly receipt the Lightweight transaction.

For the exact branch, all events are appended to current-run evidence in batch order before one Lightweight atomic operation appends all four lane records, changes the exact task/blocker state, refreshes task-state, and appends the owner line. A failed lane transaction leaves one-sided current-run evidence unresolved and non-authorizing until exact retry.

The incomplete branch has no occurrence identity in its intent, no `incident-evidence` batch, no Repeat Relationship, and no Governance Event. It leaves T001 blocked and replaces only the invalid blocker with the exact evidence-incomplete text. Neither branch dispatches a Feature 007 attempt or performs technical-docs implementation.

## Conditional Audit

`AuditSummaryV2` derives governance and incident rows only from the byte-equivalent intersection of current-run and lane events, never their union. Resolved alternatives require verified projections, selected alternative and check, post-learning Inspection, accepted retained completion, trusted envelopes, and terminal receipt. Resolved no-progress requires the complete current failed set, complete considered alternative set, no-new-evidence proof and verification, and no-progress receipt. Unresolved rows cannot claim block, close, no-progress, success, or completed post-learning evidence. v1 learning records remain `legacy-audit-only`.

For an Immediate Halt End audit row, require the matching verified projection reference/revision, rederivation proof/exact occurrence pair, or unavailable evidence identity/run-wide scope. A disposition mismatch or invalid branch evidence rejects the row.

## Autonomous v2 Outcome Reasons

Success reasons include:

```text
occurrence-retention-required
learning-required
learning-reviewed
projection-prepared
projection-verified
post-learning-inspection-bound
attempt-permit-issued
authorized
lane-permit-issued
lane-receipt-committed
no-progress-verified
target-suspended
controlled-unresolved-end
governance-resumed
audit-derived
completed
```

Refusal reasons include:

```text
definition-contract-mismatch
redefine-required
trusted-source-missing
trusted-source-conflict
verification-envelope-mismatch
review-envelope-mismatch
finding-set-mismatch
occurrence-retention-incomplete
occurrence-retention-conflict
event-body-missing
event-body-hash-mismatch
projection-batch-mismatch
learning-evidence-incomplete
learning-governance-capacity
learning-governance-conflict
learning-phase-mismatch
repeat-not-established
review-incomplete
alternative-invalid
alternative-not-material
alternative-selection-mismatch
failed-approach-set-mismatch
governance-unresolved
projection-missing-current-run
projection-missing-lane-history
projection-missing-both
projection-conflict
projection-stale
inspection-stale
inspection-branch-mismatch
new-distinguishing-evidence
target-mapping-missing
target-mapping-ambiguous
target-mismatch
halt-scope-ambiguous
target-halted
run-halted
unrecoverable-governance-evidence
scheduling-ineligible
concurrency-forbidden
controlled-end-unavailable
permit-hash-mismatch
permit-stale
permit-replayed
permit-transition-mismatch
permit-target-mismatch
permit-reason-mismatch
lane-prestate-mismatch
lane-receipt-invalid
lane-receipt-mismatch
legacy-learning-event-audit-only
incident-correction-not-authorized
incident-evidence-incomplete
core-close-evidence-stale
```

Existing bounded CLI errors and guarded reasons remain authoritative.

## Invalid Cases

| Case | Required result |
|---|---|
| Caller submits an envelope, finding body, check state, verdict, or chronology | Reject; only trusted Inspection normalization has authority. |
| Trusted target, attempt, result, source revision, Inspection, authority, or invocation differs | Reject before occurrence construction. |
| Occurrence event is absent from either surface | Keep completion pending; derive no repeat. |
| Same occurrence replays byte-identically | Count once. |
| Same chronology has different bytes | Conflict and stop classification. |
| Batch body, event hash, order, or commitment differs | Reject with event or batch mismatch. |
| Event body is lost and authoritative evidence changed | Stop; never infer bytes from RunState hashes. |
| Alternative omits one failed basis | Reject with `failed-approach-set-mismatch`. |
| Failed set changes after learning | Return governance to `required`. |
| Old attempt permit is used after authorization or for lane claim | Reject as replayed, stale, or transition-mismatched. |
| Claim-required authorization lacks a committed receipt | Refuse attempt execution. |
| Event line uses `ShortText`, CRLF, `CJ({event})`, or exceeds 16,402 bytes | Refuse autonomous v2 projection. |
| Exact mutation field differs from the permit-bound object | Refuse before mutation. |
| Lightweight rollback is incomplete | Return indeterminate and hard stop run-wide. |
| Tracked dispatch lacks fresh poststate proof | Return `tracked-operation-dispatched` with operation evidence and no lane receipt. |
| Tracked lane commits without owner receipt | Return `tracked-lane-committed`; allow only exact owner reconciliation. |
| Incomplete incident branch contains occurrence identity, repeat, incident-evidence, or Governance Event | Reject preview. |
| Incident event references `previewIdentity` | Reject the cyclic contract. |
| Feature 009 accepted evidence predates source or review drift | Reject with `core-close-evidence-stale`. |
| Repository `build-dev` is requested before T008 source acceptance | Reject under Feature 008 lifecycle. |
| Execution changes a Feature 009 definition artifact | Stop for redefinition. |
