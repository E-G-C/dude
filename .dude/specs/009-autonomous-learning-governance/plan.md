# Implementation Plan: Autonomous Learning Governance

## Summary

Correct explicit autonomous Work so a deterministically repeated finding or failed approach creates one target-scoped unresolved learning-governance case before another affected-target attempt or ordinary disposition.

The implementation extends the existing `dude-work` runtime, public internal `runCommand` and CLI protocol, current-run evidence, Lightweight history, tracked issue history, and lane-owner mutation boundaries. It introduces no new user-facing command, execution lane, persistent store, scheduler, external service, concurrency behavior, objective system, or automatic delivery action.

The design uses:

1. immutable Feature 009 definition inputs throughout execution;
2. trusted verification and independent-review captures acquired through fresh Inspection;
3. immutable occurrence events retained on both authoritative surfaces before completion can count an occurrence or derive repetition;
4. exact response-carried event batches with hash-only RunState commitments;
5. a complete failed-approach set for material-difference and no-progress decisions;
6. an acyclic selected-alternative sequence of post-learning Inspection, attempt permit, `authorize`, optional lane claim, and completion;
7. a dedicated bounded `EventLineText` for canonical lane records;
8. closed lane-specific mutation schemas whose complete canonical bodies are permit-bound;
9. atomic Lightweight receipts and composite tracked lane-plus-owner receipts;
10. an acyclic Feature 007 incident intent, event, batch, preview, mutation, permit, and receipt derivation; and
11. a Feature 008-compliant terminal T009 that materializes generated core only after independent source acceptance.

The canonical feature identity is `.dude/specs/009-autonomous-learning-governance/spec.md`.

## Technical Context

**Language/Version**: Node.js >= 20, dependency-free ESM with `// @ts-check`

**Primary Dependencies**: Existing recovery, Inspection, evidence, projection, scheduler, Lightweight board, Beads normalization, owner-resolution, task, task-state, workspace-path, verification, and independent-review authorities

**Storage**: Existing invocation RunState, current-run captures, Lightweight task history, tracked issue history, and unique owner Coordinator Logs only

**Testing**: `node:test`, process-level CLI tests, production lane-wrapper tests, mutation tests, static contracts, generated projection tests, recursive repository suite, Dude lint, compose verification, pristine release build and lint, fresh Tester evidence, and independent Code Reviewer evidence

**Target Platform**: Supported macOS, Linux, and Windows local workspaces using Lightweight or optional tracked execution

**Project Type**: Reusable coordination workflow with deterministic local runtime and optional tracked execution

**Performance Goals**:

- At most one active learning-governance case and one pending completion-retention case
- At most 16 finding events and one approach event in a normal completion-retention batch
- Exactly two finding events in an incident-evidence batch
- At most 16 failed approach bases, 16 learning findings, 8 alternatives, and 16 evidence or assumption references per bounded collection
- Existing source, Inspection, packet, event, and CLI limits remain authoritative
- Every tracked pending response and recovery request, including exact original and fresh capture sets, MUST fit the existing aggregate and CLI byte limits; otherwise the wrapper refuses before dispatch
- `CJ(RunState.learningGovernance)` remains at most 32,768 UTF-8 bytes
- Each authoritative event remains at most 16,384 UTF-8 bytes as canonical JSON
- Exact event bodies remain outside RunState
- Classification remains linear in bounded authoritative occurrence history

**Constraints**:

- Explicit autonomous Work only
- Guarded and non-Work behavior remains compatible
- `policy.parallel === 1`
- No Feature 005, Feature 007, Feature 008, or Feature 009 definition mutation during implementation
- No technical-docs implementation
- No implementation task or specialist writes a `.dude/specs/009-autonomous-learning-governance/**` path
- No direct caller-authored finding, repeat, check result, projection, permit, receipt, or audit authority
- Any required change to the approved Feature 009 definition requires redefinition before implementation continues
- Feature 009 has no active ObjectiveRegistry

## Immutable Definition Contract

Before execution starts, the complete Feature 009 definition package is normative. It includes:

- `.dude/specs/009-autonomous-learning-governance/spec.md`
- `.dude/specs/009-autonomous-learning-governance/plan.md`
- `.dude/specs/009-autonomous-learning-governance/research.md`
- `.dude/specs/009-autonomous-learning-governance/data-model.md`
- `.dude/specs/009-autonomous-learning-governance/contracts/schemas.md`
- `.dude/specs/009-autonomous-learning-governance/quickstart.md`
- `.dude/specs/009-autonomous-learning-governance/checklists/test.md`
- `.dude/specs/009-autonomous-learning-governance/checklists/security.md`
- `.dude/specs/009-autonomous-learning-governance/tasks.md`

Execution reads these artifacts but does not revise them. Coordinator-owned Lightweight task glyph and blocker metadata remain lane state; they do not authorize changes to task identity, wording, dependencies, phases, source declarations, or supporting contracts. Any implementation discovery requiring a normative change stops with `contract-mismatch: redefine-required`.

The final package transaction must stage exactly one byte stream for each path. In particular, the canonical `tasks.md` body is singular; duplicated, concatenated, truncated, or competing task bodies are invalid.

## Root Cause

The incident and rejected definition exposed connected defects:

1. Generic reviewer escalation can own autonomous disposition before learning.
2. Current completion can derive no-progress from repeated hashes before immutable occurrences are retained.
3. Finding basis, finding occurrence, trusted review evidence, and approach basis are conflated.
4. Learning event bodies are unreachable when RunState retains hashes only.
5. A permit tied to a state that `authorize` mutates creates stale or cyclic authorization.
6. Material difference is not evaluated against every failed approach associated with the trigger.
7. Lane wrappers do not bind exact expected bytes, exact mutation bodies, event records, owner-log effects, and receipts.
8. Maximum canonical event lines exceed `ShortText` and need a dedicated bound and serialization rule.
9. The Feature 007 incident preview is cyclic if an event references the preview identity that depends on that event.
10. Tracked lane state and the filesystem owner log cannot share one physical transaction and need a composite receipt protocol.
11. Core source changes must follow Feature 008's baseline, source-acceptance, terminal materialization, and accepted-evidence lifecycle.

The falsifiable correction is: the second qualifying dual-retained occurrence causes public `complete.finalize` to return `learning-required`; no affected-target attempt or ordinary disposition succeeds until the exact governed branch completes; every Work lane mutation matches a fully bound permit and verified receipt; and source revision cannot be materialized or closed without terminal T009 evidence.

## Authority Precedence

1. Resolve exactly one defined owner by exact `spec_path`.
2. Resolve the exact affected target, active lane, and authoritative mapping.
3. Acquire fresh complete source captures and validate their authority.
4. Apply run-wide hard stops and overall-budget exhaustion.
5. Apply target-scoped hard stops and per-target recovery exhaustion.
6. Normalize already captured attempt, verification, and independent-review evidence.
7. Retain immutable occurrence events on both authoritative surfaces.
8. Count retained occurrences and derive the earliest valid Repeat Relationship.
9. Under explicit autonomous Work, let `dude-work` own repeated-behavior disposition.
10. Let independent review own grounded findings and acceptance or rejection, not autonomous disposition.
11. Let Feature 005 independently select at most one ready, dependency-independent, change-set-disjoint target.
12. Use generic repeated-finding escalation only for guarded or non-Work cycles.

No lower authority waives a higher one.

## Architecture

### 1. Bounded RunState

Add two optional hash-oriented records:

```text
pendingCompletion?: PendingCompletionRetentionV2
learningGovernance?: LearningGovernanceV1
```

`pendingCompletion` binds one completed attempt to trusted review and verification identities plus an occurrence-retention batch commitment. It contains no event body.

`learningGovernance` binds one target, Repeat Relationship, failed-approach set, phase, projection commitments, branch identities, permits, receipts, suspension, halt, and controlled-end evidence. It contains no event body.

A second target requiring either singleton slot causes a fail-closed capacity stop without overwriting evidence.

### 2. Trusted Verification And Review Captures

Autonomous completion does not accept caller-authored finding bodies or check states. Fresh Inspection acquires `TrustedSourceCaptureV2` rows from the actual verification and independent-review authorities. Runtime recomputes capture byte hashes, source identities, and normalized envelopes.

`VerificationEnvelopeV2` binds target, attempt, source revision, inspected evidence, result, and a closed sorted check set.

`IndependentReviewEnvelopeV2` binds the same target, attempt, source revision, inspected evidence, result, and verification envelope, plus reviewer authority, review invocation, verdict, chronology, and the complete normalized finding set.

The completion caller supplies identity references only:

- `verificationEnvelopeIdentity`;
- `reviewEnvelopeIdentity`; and
- the exact sorted `findingIdentities` expected from that review.

Runtime requires that list to equal the normalized envelope's complete finding set. Every check-result observation identifies a check in the bound verification envelope.

### 3. Retention-First Completion

Autonomous v2 completion has two stages.

#### `complete.capture`

1. Reacquire a fresh Inspection.
2. Resolve the caller's identity references to trusted verification and independent-review captures.
3. Normalize both envelopes and recompute every identity.
4. Validate target, attempt, result, source revision, check definition, verdict, and chronology bindings.
5. Derive one immutable `ApproachOccurrenceEventV1`.
6. Derive every immutable `FindingOccurrenceEventV1` from the complete independent-review envelope.
7. Return a bounded exact `ProjectionBatchV1` with purpose `occurrence-retention`.
8. Record only the batch commitment in `pendingCompletion`.
9. Do not clear the pending attempt, add a completed row, count an occurrence, or derive repetition.

The Work host appends current-run records and the lane owner appends canonical lane records for every event.

#### `complete.finalize`

1. Reacquire both authoritative surfaces.
2. Require every committed occurrence event exactly once and byte-equivalent on both surfaces.
3. Revalidate the supplied exact batch against `pendingCompletion`.
4. Only then clear the pending attempt and add the completed attempt.
5. Count retained occurrence events and derive the earliest valid Repeat Relationship.
6. If no repeat exists, return the ordinary normalized completion result.
7. If a repeat exists, create `learningGovernance` in `required`, derive the complete failed-approach set, and return `learning-required` plus the exact governance-required projection batch.

If an immediate halt prevents occurrence retention, completion remains pending and no repeat is claimed. If it prevents required-governance projection after retention, the already dual-retained occurrence events are sufficient for deterministic re-derivation on resume.

### 4. Immutable Occurrence Evidence

`FindingOccurrenceEventV1` carries the complete stable finding basis, one occurrence record, the trusted review source identity, and the failed attempt's `attemptApproachBasisIdentity`.

`ApproachOccurrenceEventV1` carries the complete approach basis, authorization evidence, result identity, disposition, verification and review identities, and chronology.

Both event types are immutable, append-only, target-bound, and retained on:

- existing current-run evidence as `{substantive:{event}}`; and
- exact authoritative lane history as one canonical lane event record.

A byte-identical replay counts once. Reuse of one chronology position with different bytes is conflict. A finding or approach Repeat Relationship is derived only from distinct valid dual-retained occurrence events with equal basis identities and strict chronology.

### 5. Complete Failed-Approach Set

Every learning-governance case carries one bounded `FailedApproachSetV1`.

For a finding trigger, initial members are all unique approach basis identities bound by the qualifying finding occurrences through the triggering chronology cutoff.

For an approach trigger, initial members are all unique failed approach basis identities represented by the qualifying approach occurrences through the same cutoff.

Every later rejected selected-alternative attempt extends the set. No member is discarded. Exceeding the bound stops with `learning-governance-capacity`; it cannot authorize no-progress.

`AlternativeV2` is a closed credible-or-rejected union. Every credible-material alternative contains exactly one material-difference row for every current failed basis and differs from every member. Every rejected alternative contains exactly one evidence-backed `same` or `different` comparison for every current failed basis plus its rejection disposition and reason; a not-materially-different row has at least one `same` comparison. Finding hashes are never compared with approach hashes. No-progress hashes the complete considered alternative set, including rejected rows. An added failed approach or distinguishing evidence invalidates the alternatives and proof and returns governance to `required`.

### 6. Response-Carried Projection Batches

Commands that derive events return complete exact `ProjectionBatchV1` bodies. RunState stores only a `ProjectionCommitmentV1` containing purpose, batch identity, ordered event kinds, and event hashes.

Closed batch purposes are:

- `occurrence-retention`: exactly one approach event followed by zero through sixteen finding events sorted by occurrence identity;
- `incident-evidence`: exactly two Feature 007 finding events in strict chronology order and no approach event;
- `learning-result`: one learning-review event followed by one governance event;
- `governance-required`, `governance-snapshot`, and `incident-supersession`: exactly one event.

`transition.prepare-projection` requires the exact response-carried batch. It validates every event body and hash, recomputes the batch identity, matches the RunState commitment, freshly resolves owner, target mapping, and lane prestate, then returns exact current-run records, lane records, complete projection mutations, and projection permits.

`transition.verify-projection` receives the same exact batch plus fresh captures. It advances state only after byte-equivalent presence on both surfaces.

Loss of a transient event body never authorizes inference from a hash. The originating command may reproduce a batch only from unchanged fresh authoritative evidence and only when reproduction yields identical canonical bytes and identity.

### 7. Canonical Lane Event Records

Autonomous v2 lane projection uses a dedicated `EventLineText`, never `ShortText`.

```text
EventLineText = ASCII("- dude-run-event: ") || CJ(event)
EventLineRecord = UTF8(EventLineText) || 0x0A
```

The prefix is exactly 18 ASCII bytes. There is no intervening or trailing whitespace and no CR or LF inside `EventLineText`. The suffix is `CJ(event)`, not `CJ({event})`.

Bounds and hashes are exact:

- `CJ(event)` is at most 16,384 UTF-8 bytes;
- `EventLineText` is at most 16,402 UTF-8 bytes;
- the LF-terminated `EventLineRecord` is at most 16,403 bytes;
- `laneEventLineHash` hashes `UTF8(EventLineText)` without LF; and
- `laneEventRecordHash` hashes complete serialized bytes including LF.

Projection plans and lane mutation payloads carry exact line text plus literal `terminator:"LF"`. The wrapper serializes LF. CR, CRLF, missing terminator, wrapped canonical JSON, noncanonical suffix, wrong target, or mismatched event hash refuses autonomous v2 authority.

Existing v1 `CJ({event})` history remains readable only by its legacy audit path and cannot satisfy a v2 permit, projection, transition, receipt, or resolved audit row.

### 8. Learning Phases And Acyclic Attempt Authorization

The governance phases are:

```text
required
reviewed
projected
alternative-inspected
alternative-permitted
alternative-authorized-pending-lane
alternative-authorized
alternative-verified
no-progress-verified
```

`alternative-permitted` is a logical protocol stage represented by the unchanged `alternative-inspected` RunState plus an exact issued permit. Permit issuance does not persist a new state hash.

`transition.controlled-end` is unavailable from `projected`. It is available from `alternative-inspected` after fresh post-learning Inspection and before attempt-permit issuance, or from `no-progress-verified` after fresh no-new-evidence verification and before lane no-progress disposition. Its audit reports the governance branch resolved and the lane disposition pending.

The selected-alternative order is:

1. `transition.bind-post-learning-inspection`;
2. `transition.issue-attempt-permit`, which is pure and leaves RunState byte-identical;
3. `authorize`, which validates and consumes the permit before changing RunState;
4. optional Lightweight or tracked lane claim using a separate lane permit derived from the post-authorization RunState;
5. `transition.commit-lane-receipt` when a claim was required;
6. execute the exact bound attempt;
7. `complete.capture`;
8. dual-project the occurrence batch;
9. `complete.finalize`;
10. issue and apply the final task-completed or no-progress lane permit; and
11. commit the final lane receipt.

If the lane is already authoritatively claimed by the same target and owner, `claimRequired:false` advances directly to `alternative-authorized`. Otherwise execution refuses until the exact lane-claim receipt commits.

No permit is expected to survive the state mutation it authorizes.

### 9. Exact Lane Mutation Binding

Every autonomous Work projection or transition carries one complete, closed, lane-specific mutation object.

```text
mutationIdentity = SHA256(CJ(exactMutationObject))
```

The identity is never derived from only a mutation kind, reason, target, event hash, or prestate summary. `ProjectionPermitV1` and `LaneMutationPermitV1` bind the complete identity. The lane owner validates the exact schema, recomputes the identity, validates the closed transition matrix, and rejects every mismatch before mutation.

Every complete mutation binds:

- exact lane and target;
- exact from and to glyph or status;
- exact blocker effect and complete before and after text;
- every exact event line and LF serialization rule, or explicit `eventLines.kind:"none"`;
- exact owner-log lines and complete expected owner-file hash, or explicit `ownerLog.kind:"none"`;
- exact Lightweight snapshot timestamp when applicable;
- exact reason;
- exact incident intent and preview identities for incident correction; and
- byte-identical target state for Controlled Unresolved End.

The blocker effect is a closed union of `unchanged`, `add`, `remove`, and `replace`. The event-line effect is either `none` or `append-exact`. The owner-log effect is either `none` or a compare-and-append contract carrying owner path, expected complete owner hash, exact lines, LF terminator, and idempotency.

The allowed transition matrix is closed:

| Lane | Kind | Allowed state change | Blocker effect |
|---|---|---|---|
| Lightweight | projection | any glyph to itself | unchanged |
| Lightweight | claim | open `[ ]` to in-progress `[~]` | unchanged null |
| Lightweight | claim | blocked `[!]` to in-progress `[~]` | remove |
| Lightweight | task-blocked | open or in-progress to blocked | add |
| Lightweight | task-blocked | blocked to blocked | replace |
| Lightweight | task-completed | in-progress to done `[x]` | unchanged null |
| Lightweight | controlled-end | open, in-progress, or blocked to itself | unchanged |
| Lightweight | exact incident | blocked to in-progress | remove |
| Lightweight | incomplete incident | blocked to blocked | replace |
| Tracked | projection | any status to itself | unchanged |
| Tracked | claim | open to in_progress | unchanged null |
| Tracked | claim | blocked to in_progress | remove |
| Tracked | task-blocked | open or in_progress to blocked | add |
| Tracked | task-blocked | blocked to blocked | replace |
| Tracked | task-completed | in_progress to closed | unchanged null |
| Tracked | controlled-end | open, in_progress, or blocked to itself | unchanged |

No unlisted transition is valid. Reason must match mutation kind.

The lane-state rows for `controlled-end` are necessary but not sufficient authorization. The permit-bound RunState must contain the same target at `alternative-inspected` with matching selected alternative, check, projection, and Inspection, or at `no-progress-verified` with matching proof, projection, and fresh no-new-evidence verification. Phase `projected` is invalid.

### 10. Closed Lane Wrapper Schemas

Lightweight exposes internal `work-project` and `work-set`. Tracked execution exposes internal `work-project` and `work-transition`.

Every request is closed and binds:

```text
{
  version,
  operation,
  root,
  owner,
  target,
  state,
  permit,
  mapping,
  expected,
  mutation
}
```

`OwnerBindingV1.ownerCapture` is the sole exact expected owner preimage. `expected` contains only lane-specific captures. Events have no duplicate top-level field: wrappers parse and validate them from the exact canonical bodies in `mutation.eventLines`.

- Lightweight `work-project` uses `ProjectionPermitV1`, complete tasks and task-state captures, and `LightweightProjectionMutationV1`.
- Lightweight `work-set` uses `LaneMutationPermitV1`, complete tasks and task-state captures, and either `LightweightStateMutationV1` or `LightweightIncidentSupersessionMutationV1`.
- Tracked `work-project` uses `ProjectionPermitV1`, complete list, detail, and history captures, and `TrackedProjectionMutationV1`.
- Tracked `work-transition` uses `LaneMutationPermitV1`, complete list, detail, and history captures, and `TrackedStateMutationV1`.

`OwnerBindingV1` carries the exact owner capture in every operation. Wrappers freshly reacquire all expected sources, compare supplied and fresh bytes, apply existing no-follow containment rules, recompute owner and mapping identities, recompute RunState and permit hashes, validate event and mutation bindings, and refuse before mutation on mismatch. No request carries a caller-selected executable, command line, shell fragment, or arbitrary subprocess argument.

Tracked execution additionally exposes proof-only `work-prove-poststate` and owner-only `work-reconcile-owner`. Both consume the same bounded response-carried recovery payload containing exact original list/detail/history captures, the normalized authoritative dispatch result, and the exact mutation. Neither payload nor exact capture bytes enter RunState or a persistent store.

### 11. Lightweight Atomic And Tracked Composite Receipts

For Lightweight Work, `tasks.md`, `.dude/state/task-state.json`, and the unique owner idea are one all-or-restored operation whenever an owner-log effect is present. When the owner-log effect is `none`, owner bytes are still protected and verified unchanged. No receipt exists until every changed postimage is reacquired and matches.

`LightweightAtomicReceiptV1` binds permit, mutation, target, mapping, lane prestate, tasks poststate, task-state poststate, owner poststate, and whether target state changed. Projection and Controlled Unresolved End may have `targetStateChanged:false` while history, snapshot, or owner bytes change.

Tracked lane state and filesystem owner logs use this closed recovery chain:

1. Dispatch creates `TrackedOperationEvidenceV1`, binding exact original capture descriptors, normalized prestate and mutation identity, and authoritative dispatch-result identity. The pending response also returns `TrackedDispatchRecoveryPayloadV1`, carrying the exact original captures, normalized dispatch result, and exact mutation.
2. `work-prove-poststate` resubmits that evidence and payload plus fresh observed list/detail/history captures. Without redispatch, it validates every binding, deterministically derives the only authorized postimage from original captures, prestate, mutation, and dispatch result, and requires all fresh captures to equal it exactly. Any unrelated drift is indeterminate.
3. `work-reconcile-owner` resubmits the same evidence and payload, lane receipt, and fresh list/detail/history and owner captures. It independently rederives and reacquires the lane postimage before owner handling and again before composite receipt creation; a stale lane receipt or intervening lane drift cannot pass.
4. Only the resulting `OwnerLogCommitReceiptV1` plus `TrackedCompositeReceiptV1` reports success.

A replay against the same exact authoritative poststate returns byte-identical receipts. A changed target, mutation, stage, evidence, receipt, or expected next operation invalidates recovery. Neither recovery operation redispatches or rolls back the lane mutation.

Operation results distinguish:

- `ok:true, phase:"committed"` with an atomic or composite receipt;
- `phase:"refused"` with no authoritative mutation;
- `phase:"tracked-operation-dispatched"` before tracked poststate proof;
- `phase:"tracked-lane-committed"` after lane proof but before owner proof; and
- `phase:"indeterminate"` for ambiguous outcome or incomplete Lightweight rollback.

### 12. Projection, Immediate Halts, And Resume

Projection uses only current-run records and exact authoritative lane-history event lines. No new store is introduced.

A required governance event may remain unprojected only when an immediate halt prohibits activity. By then, the exact finding and approach occurrence events establishing the repeat are already dual-retained. Resume:

1. resolves exact owner, target, and lane;
2. reacquires occurrence events from both surfaces;
3. derives the same qualifying pair and failed-approach set;
4. reconstructs `required`; and
5. projects it before any normal affected-target transition.

Missing, one-sided, conflicting, nonmonotonic, or unrecoverable occurrence history stops the invocation.

When an immediate hard stop or overall-budget exhaustion ends the invocation, the response is an `immediate-halt-end` derived from `HaltV1`. It invokes no `transition.controlled-end`, issues no controlled-end permit, performs no controlled-end lane mutation, and creates no `ControlledUnresolvedEndV1`. The target remains unchanged. Outcome, nested halt, and evidence dispositions are equal and exactly `verified`, `rederive-required`, or `unavailable`; they respectively bind a `ProjectionRefV1` plus governance revision, a rederivation proof plus exact dual-retained occurrence pair, or the halt's unrecoverable evidence identity and run-wide stop.

### 13. Scoped Halts, Scheduling, And Controlled End

Target-scoped hard stops and per-target recovery exhaustion leave governance unresolved and may permit unchanged suspension.

Run-wide security, safety, authority, credential, destructive-confirmation, spending, external-authorization, owner or lane ambiguity, unrecoverable evidence, and overall-budget exhaustion stop the invocation.

Feature 005 alone decides whether another target is ready, dependency-independent, and change-set-disjoint. Governance cannot select or authorize that target. Execution remains sequential.

Controlled Unresolved End is available only from `alternative-inspected` before attempt-permit issuance or `no-progress-verified` before lane no-progress disposition. It is invalid from `projected`. It preserves a resolved governance branch while leaving the target lane disposition pending and unchanged. It is an exact target-state no-op: from and to glyph or status are equal and blocker text is byte-identical. Its governance event, owner-log line, lane history, snapshot when applicable, and receipt are real mutations and must verify normally. Immediate Halt End is a higher-precedence halt outcome, not this transition.

### 14. Conditional Governance Audit

`AuditSummaryV2` uses the byte-equivalent intersection of current-run and lane events, never their union. It recognizes:

- finding and approach occurrence events;
- learning-review events;
- governance events;
- incident-supersession events; and
- lane receipts.

Resolved-alternative rows require selected alternative, discriminating check, post-learning Inspection, retained completion occurrences, verification, independent acceptance, and completion receipt.

Resolved-no-progress rows require the complete current failed-approach set, complete considered-alternative set, no-new-distinguishing-evidence proof, and no-progress receipt.

Controlled-end rows separately report `governance branch resolved` and `lane disposition pending`; other unresolved rows report exact projection or re-derivation state without claiming block, close, no-progress, or success.

Immediate Halt End rows carry only the evidence required by their matching verified, rederive-required, or unavailable branch.

### 15. Objective Independence

Feature 009 has no active ObjectiveRegistry and does not create, repair, or infer one. If an existing objective elsewhere maps uniquely to the target, its evidence may be referenced by an optional sequence identity. No match or ambiguous match omits that identity. Objective evidence never changes repeat, learning, projection, Inspection, permit, halt, verification, review, lane, or scheduling authority.

### 16. Acyclic Feature 007 Incident Supersession

Incident correction occurs only after Feature 009 core governance has accepted evidence. It uses `acceptedFeatureEvidenceIdentity`, derived from current Feature 008 core-close evidence, immutable definition-contract identity, fresh verification set, and final independent-review identity.

The derivation is acyclic:

1. acquire fresh accepted-feature evidence, exact Feature 007 prestate, rollback bytes, and branch evidence;
2. form one closed `IncidentCorrectionIntentV1` and compute `intentIdentity`;
3. derive branch-authorized events that reference `intentIdentity`, never `previewIdentity`;
4. compute event hashes and projection batches;
5. form a branch-specific preview containing intent, events, batches, mutation core, and rollback bytes;
6. compute `previewIdentity`;
7. derive the final Lightweight mutation by adding `previewIdentity` to the previewed mutation core;
8. compute `mutationIdentity`, lane permit, atomic receipt, and final projection verification.

Both branches append one `IncidentSupersessionEventV1`. It requires no Repeat Relationship and identifies the original unauthorized disposition, accepted Feature 009 evidence, incident intent, branch, exact resulting target state, and evidence inventory.

The exact-evidence branch additionally:

- carries an `incident-evidence` batch with exactly two chronologically ordered finding occurrence events and no approach event;
- derives the supported Repeat Relationship;
- carries one required Governance Event;
- changes Feature 007 T001 from blocked to in-progress learning-required; and
- dispatches no attempt.

The evidence-incomplete branch:

- carries no occurrence event, Repeat Relationship, or Governance Event;
- appends only the supersession event;
- leaves T001 blocked; and
- replaces the blocker with exactly `contract-mismatch: evidence-incomplete autonomous review occurrence evidence unavailable`.

Before the incident lane mutation, every branch event is appended to current-run evidence in batch order. One Lightweight atomic operation appends all exact lane records, applies the task and blocker effect, updates the task-state snapshot, and appends the exact owner-log line. A failed lane transaction leaves one-sided current-run evidence unresolved and non-authorizing until exact retry succeeds.

No Feature 007 history is rewritten or validated, and no technical-docs implementation occurs.

### 17. Feature 008 Core Dogfood Close

Feature 009 plans exact writes to ten `src/**` paths, so its execution package has exactly one open, non-`[P]`, `[Shared]` terminal task: `T009@696e6369`.

Its exact sorted `declared-src:` set is:

```text
src/agents/dude.agent.md
src/instructions/dude.instructions.md
src/skills/dude-lightweight-execution/SKILL.md
src/skills/dude-lightweight-execution/board.mjs
src/skills/dude-lightweight-execution/board.test.mjs
src/skills/dude-receiving-code-review/SKILL.md
src/skills/dude-reviewer-protocol/SKILL.md
src/skills/dude-work/SKILL.md
src/skills/dude-work/recovery.mjs
src/skills/dude-work/recovery.test.mjs
```

T009 directly depends on T001 through T008.

Before the first source mutation in T001, the coordinator:

1. resolves the live T009 declaration;
2. requires immutable `HEAD`, clean `src/**`, clean base-owned generated core, no ignored entries in either boundary, and clean parity;
3. appends the required baseline line to the unique Feature 009 owner log;
4. immediately repeats the same preflight; and
5. serializes source work through T009.

T001 through T007 may change source. T008 freezes and independently accepts the exact source revision without product writes and without running repository `build-dev`.

Only T009 may run repository `node scripts/build-dev.mjs`, and only after unchanged T008 acceptance plus an immediate identity recheck. T009 snapshots protected paths, materializes generated core, proves exact projection and protected preservation, runs full validation, obtains fresh final independent review, appends Feature 008 accepted evidence, immediately recomputes every bound identity, derives `acceptedFeatureEvidenceIdentity`, performs the supported Feature 007 supersession, reruns lint and independent correction review, and rechecks the latest core accepted evidence before close.

No generated `.github` core file is hand-edited.

## Public Runtime Commands

Internal command tokens remain:

```text
inspect
authorize
complete
learn
transition
audit
```

They are not top-level user-facing Dude commands.

| Command | Responsibility |
|---|---|
| `inspect` | Reacquire complete bounded evidence and normalize trusted source envelopes. |
| `authorize` | Consume one exact attempt permit, derive one attempt, and return any required post-authorization lane permit. |
| `complete.capture` | Normalize result, verification, and review identities and return immutable occurrence events without counting them. |
| `complete.finalize` | Freshly verify dual occurrence retention, then count completion and derive repetition. |
| `learn` | Validate bounded semantic learning and return the exact learning-result batch. |
| `transition` | Prepare and verify projection, bind Inspection, issue permits, commit receipts, suspend, end, and resume. |
| `audit` | Derive conditional governance and incident evidence from fresh authoritative intersection. |

## Rollout

### Phase 1: Fail-Closed Seal

- Correct autonomous authority precedence.
- Replace repeat-to-no-progress with retention-first `learning-required`.
- Keep guarded and non-Work behavior unchanged.
- Refuse affected-target attempts and ordinary dispositions while unresolved.

### Phase 2: Trusted Occurrences And Learning

- Add trusted verification and independent-review normalization.
- Add immutable finding and approach occurrence events.
- Add response-carried projection batches and dual-retention finalization.
- Add complete failed-approach sets and v2 governance events.

### Phase 3: Acyclic Permits And Exact Lane Boundaries

- Add pure attempt-permit issuance and permit consumption by `authorize`.
- Add post-authorization lane permits.
- Add dedicated `EventLineText` and LF record contracts.
- Add complete lane-specific mutation hashing.
- Add atomic Lightweight and composite tracked receipts.
- Add no-redispatch tracked poststate proof and idempotent owner reconciliation.

### Phase 4: Halts, Resume, Audit, And Incident Contracts

- Add scoped suspension and resume from retained occurrences.
- Add intersection-based AuditSummary v2.
- Add acyclic incident intent, event, batch, preview, mutation, and receipt contracts.
- Align source instructions and docs without materializing generated core.

### Phase 5: Source Acceptance, Materialization, And Supersession

- Independently accept the exact source revision in T008.
- Materialize through terminal T009.
- Obtain final independent core acceptance and append accepted evidence.
- Apply only the supported Feature 007 supersession branch.
- Close only while every bound identity remains current.

## Implementation Source Write Inventory

### Core Runtime And Tests

```text
src/skills/dude-work/recovery.mjs
src/skills/dude-work/recovery.test.mjs
src/skills/dude-work/SKILL.md
src/skills/dude-lightweight-execution/board.mjs
src/skills/dude-lightweight-execution/board.test.mjs
src/skills/dude-lightweight-execution/SKILL.md
```

### Core Authority Pointers

```text
src/agents/dude.agent.md
src/instructions/dude.instructions.md
src/skills/dude-receiving-code-review/SKILL.md
src/skills/dude-reviewer-protocol/SKILL.md
```

### Optional Beads Pack

```text
library/packs/beads/skills/dude-pack-beads-workflow/beads.mjs
library/packs/beads/skills/dude-pack-beads-workflow/beads.test.mjs
library/packs/beads/skills/dude-pack-beads-workflow/SKILL.md
```

### Static Contracts And Documentation

```text
scripts/current-format-contract.test.mjs
docs/commands.md
docs/reference.md
docs/workflow.md
```

### Generated Core, T009 Only

```text
.github/agents/dude.agent.md
.github/instructions/dude.instructions.md
.github/skills/dude-lightweight-execution/SKILL.md
.github/skills/dude-lightweight-execution/board.mjs
.github/skills/dude-receiving-code-review/SKILL.md
.github/skills/dude-reviewer-protocol/SKILL.md
.github/skills/dude-work/SKILL.md
.github/skills/dude-work/recovery.mjs
```

### Feature 007 Correction, T009 Only

```text
.dude/ideas/technical-docs-pack-remediation.md
.dude/specs/007-technical-docs-pack-remediation/tasks.md
.dude/state/task-state.json
```

Feature 009 definition artifacts are not execution write targets. Coordinator-owned Feature 009 baseline and accepted evidence lines are lifecycle evidence, not implementation writes.

## Validation Gates

Before materialization:

```bash
node --test src/skills/dude-work/recovery.test.mjs
node --test src/skills/dude-lightweight-execution/board.test.mjs
node --test library/packs/beads/skills/dude-pack-beads-workflow/beads.test.mjs
node --test scripts/current-format-contract.test.mjs
```

T008 independently reviews the exact source revision and evidence without product writes and without repository `build-dev`.

T009 then runs:

```bash
node scripts/build-dev.mjs
node --test scripts/build-dev.test.mjs scripts/build-release.test.mjs
find . -path ./dist -prune -o -name '*.test.mjs' -print0 | xargs -0 node --test
node .github/skills/dude-lint/lint.mjs .
node .github/skills/dude-compose/compose.mjs verify
RELEASE_ROOT="$(mktemp -d)"
node scripts/build-release.mjs --out "$RELEASE_ROOT/bundle" --tag v0.0.0
node "$RELEASE_ROOT/bundle/.github/skills/dude-lint/lint.mjs" "$RELEASE_ROOT/bundle"
git status --porcelain -- .github
git diff --check
```

Acceptance requires fresh Tester evidence and fresh independent Code Reviewer approval over the same unmodified identities. Feature 007 correction then requires fresh lint, audit, and independent correction review.

## Risks

| Risk | Mitigation |
|---|---|
| Event body is lost between derivation and projection | Exact response batch plus state commitment; reproduce only from unchanged fresh evidence. |
| Repeat is claimed before recoverable evidence exists | Completion cannot count until exact occurrence events verify on both surfaces. |
| Caller fabricates a finding or check | Caller references identities only; runtime normalizes trusted source captures. |
| Permit becomes stale after authorization | Attempt permit is consumed by `authorize`; a new lane permit binds successor state. |
| Alternative avoids one failed approach but repeats another | Compare against every member of the complete failed-approach set. |
| Maximum event line is truncated by a generic text bound | Use dedicated `EventLineText` with exact logical and serialized byte limits. |
| Incident preview identity is cyclic | Derive intent first, events second, preview third, and final mutation fourth. |
| A mutation permit omits decisive bytes | Hash the complete closed lane-specific mutation object. |
| Lightweight partial write leaves inconsistent files | Apply tasks, snapshot, and owner effects all-or-restored and reacquire every postimage. |
| Tracked lane commits before owner log | Return `phase:"tracked-lane-committed"` with `owner-log-receipt-pending` and require exact owner reconciliation plus composite receipt. |
| Recovery accepts a stale lane receipt or unrelated tracked drift | Carry exact original captures transiently, derive the authorized postimage twice, and require fresh complete list/detail/history equality at both recovery stages. |
| Incomplete incident evidence fabricates governance | Incomplete branch forbids occurrence, repeat, and Governance Event. |
| Generated core precedes accepted source review | T008 accepts source first; only terminal T009 runs repository `build-dev`. |
| Execution revises its own contracts | Feature 009 definition is immutable; contract changes require redefinition. |
