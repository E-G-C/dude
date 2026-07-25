# Research: Autonomous Learning Governance

## Research Boundary

This research supports the unchanged approved specification for Feature 009. It records implementation decisions without changing feature intent.

The canonical feature identity is `.dude/specs/009-autonomous-learning-governance/spec.md`.

The complete Feature 009 definition package is normative and immutable during execution. No implementation task or specialist writes any `.dude/specs/009-autonomous-learning-governance/**` path. Coordinator-owned Lightweight glyph and blocker metadata remain lane state and do not authorize changes to task identity, wording, dependencies, phases, source declaration, or supporting contracts. A discovered contract mismatch stops with `contract-mismatch: redefine-required`.

Feature 009 has no active ObjectiveRegistry. Existing objective machinery may contribute evidence only when an objective already maps uniquely to the target. Learning never creates, infers, or repairs an objective, sequence, registry, or identity.

## Local Findings

- `dude-work` already owns autonomous recovery and is the narrowest authority able to enforce learning before another attempt or ordinary affected-target disposition.
- Independent review must continue to own grounded findings and acceptance or rejection, but not autonomous retry, block, close, no-progress, escalation, or invocation-end disposition.
- Existing completion can observe review outcomes before immutable occurrence evidence is guaranteed on both authoritative history surfaces.
- A repeat cannot be safely counted until each qualifying occurrence is retained exactly once and byte-equivalently in current-run evidence and authoritative lane history.
- Hash-only RunState commitments cannot reconstruct event bytes. The command that derives an event must return the exact bounded event bodies in its response.
- Verification and independent-review bodies must come from trusted Inspection captures. Semantic callers can identify expected envelopes and findings but cannot author those bodies.
- A finding occurrence must retain its failed attempt's approach basis. Otherwise a finding-triggered learning review cannot compare an alternative against every failed approach implicated by the trigger.
- Attempt authorization and lane claim are different mutations. One permit cannot remain valid across the RunState mutation performed by `authorize`.
- A maximum canonical lane event line is larger than `ShortText`; using that generic type would reject a valid maximum event or silently invite inconsistent limits.
- Prose-only lane wrappers cannot bind exact expected bytes, blocker changes, event records, owner-log appends, or mutation receipts.
- A permit that hashes only mutation kind and reason does not prevent changes to decisive lane-specific bytes.
- Lightweight tasks, task-state, and owner-log files can be handled in one all-or-restored filesystem operation. A tracked issue mutation and filesystem owner-log append cannot share one physical transaction.
- A Feature 007 supersession event cannot reference a preview identity when the preview itself includes that event. A pre-event intent identity is required.
- The exact Feature 007 branch needs a dedicated historical finding-only batch; normal completion still requires an approach event first.
- Feature 007 correction requires an append-only supersession event independently of whether exact repeat evidence remains available.
- Feature 009 changes core source and therefore must use Feature 008's terminal declaration, clean baseline, independent source acceptance, terminal materialization, and accepted-evidence lifecycle.
- Tracked recovery cannot infer an authorized postimage from dispatch and prestate hashes. Exact original captures must remain in bounded response-carried recovery transport, and owner reconciliation must independently revalidate fresh lane state.

## Decision Summary

| Area | Chosen decision | Contract consequence |
|---|---|---|
| Definition boundary | Treat all Feature 009 definition artifacts as immutable execution inputs. | No task writes definition artifacts or changes normative task content; contract changes require redefinition. |
| Authority precedence | Resolve owner, target, lane, mapping, source authority, hard stops, and budgets before autonomous learning disposition. | Lower governance authority cannot waive a higher halt or ambiguity boundary. |
| Completion ordering | Split autonomous completion into `complete.capture` and `complete.finalize`. | Occurrence events are dual-retained and freshly verified before an attempt is counted or repetition is derived. |
| Trusted sources | Normalize verification and independent-review envelopes only from fresh trusted Inspection captures. | Completion callers provide envelope and finding identities only; caller-authored findings and check states have no authority. |
| Finding identity | Separate stable finding basis from immutable finding occurrence. | Equal bases across distinct retained occurrences establish finding repetition; full occurrence equality is replay. |
| Approach identity | Retain one immutable approach occurrence per captured completion. | Repeated approaches independently trigger learning without a reviewer finding. |
| Finding-to-approach binding | Every finding occurrence binds `attemptApproachBasisIdentity`. | Finding-triggered alternatives compare against complete failed approaches, never a finding hash. |
| Projection transport | Commands return exact response-carried `ProjectionBatchV1` bodies while RunState stores only commitments. | Projection can validate exact bytes without enlarging RunState. |
| Projection loss | Reproduce a lost batch only from unchanged fresh authoritative evidence. | Hashes or caller prose never recover event bytes. |
| Event line | Use dedicated `EventLineText` and exact LF record serialization. | A maximum event remains valid; line and record hashes have unambiguous byte domains. |
| Completion overflow and capacity | Gate every fresh Inspection required by `complete.capture` or `complete.finalize` before semantic completion work; preserve occupied singleton records instead of overwriting them. | Packet overflow keeps the existing descriptor-only `evidence-incomplete` / `model-packet` refusal and exact pre-call state and surfaces; only failed-set excess derivable from fully admitted evidence or already-authoritative bounded state returns `learning-governance-capacity`; no limit, paging, accumulator, API, or state is added, and capacity authorizes neither no-progress nor retry. |
| Failed approaches | Carry one complete bounded cumulative failed-approach set. | Every alternative compares against every failed basis; a new failure invalidates stale alternatives and no-progress proof. |
| Attempt permit | Make attempt-permit issuance pure against unchanged inspected RunState. | `authorize` consumes it before changing state. |
| Lane permit | Derive a separate permit from post-authorization state when claim is required. | The attempt permit is never reused against successor state. |
| Mutation binding | Hash the complete closed lane-specific mutation object. | Exact state, blocker, event, owner-log, incident, reason, and timestamp bytes are permit-bound. |
| Lightweight commit | Apply tasks, task-state, and owner effects all-or-restored. | No receipt exists until all postimages are reacquired and verified. |
| Tracked commit | Bind exact original captures and dispatch result in transient recovery transport; derive and freshly prove the full lane postimage at both recovery stages before owner handling and composite receipt. | A stale receipt or unrelated tracked drift cannot pass; no recovery operation redispatches. |
| No-progress | Require complete learning, current failed-set binding, verified projection, and fresh no-new-evidence proof. | Repeat detection alone cannot authorize no-progress. |
| Projection authority | Use existing current-run evidence and exact authoritative lane history only. | No new store, ledger, service, or parallel learning mechanism is introduced. |
| Audit authority | Derive audit from the byte-equivalent intersection of authoritative surfaces. | Caller prose and one-sided history cannot create a resolved row. |
| Scheduling | Preserve Feature 005 as the sole sequential scheduler. | Unresolved governance may leave its target unchanged while one proven disjoint target proceeds; no authority transfer or concurrency follows. |
| Halt scope | Preserve authoritative target versus run scope and per-target versus overall budgets. | Target restrictions preserve eligible scheduling; run-wide conditions stop the invocation; no halt resolves learning. |
| Invocation end | Permit Controlled Unresolved End from `alternative-inspected` before attempt permit or `no-progress-verified` before lane disposition; reject `projected`. | Governance branch is resolved, lane disposition remains pending, and Immediate Halt End stays separate. |
| Incident identity | Derive intent, events, batches, preview, final mutation, permit, then receipt. | No event or batch references `previewIdentity`; the identity graph is acyclic. |
| Incident evidence | Use a dedicated `incident-evidence` batch for exactly two historical finding events. | Exact correction needs no fabricated approach event; normal completion remains approach-first. |
| Incident correction | Use a separate supersession event in both evidence branches. | The incomplete branch needs no repeat or Governance Event and cannot resume Feature 007. |
| Acceptance identity | Use `acceptedFeatureEvidenceIdentity` derived from immutable definition and Feature 008 close evidence. | Incident correction cannot rely on an underspecified governance identity. |
| Core close | Use T009 as the sole Feature 008 terminal core-close task. | Baseline precedes source mutation; T008 accepts source without materialization; only T009 runs repository `build-dev`. |
| Compatibility | Keep guarded and non-Work v1 behavior unchanged; v1 event grammar remains audit-only. | Historical readability does not become v2 authorization authority. |

## Authority Order

1. Resolve exactly one defined owner by exact `spec_path`.
2. Resolve the exact affected target, active lane, and authoritative mapping.
3. Acquire complete fresh Inspection captures and validate source authority.
4. Apply run-wide hard stops and overall-budget exhaustion.
5. Apply target-scoped hard stops and per-target recovery exhaustion.
6. Normalize already captured attempt, verification, and independent-review evidence.
7. Retain immutable approach and finding occurrence events on both authoritative surfaces.
8. Count retained occurrences and derive the earliest valid Repeat Relationship.
9. Under explicit autonomous Work, let `dude-work` govern the affected target.
10. Let independent review supply grounded findings and acceptance evidence without autonomous disposition authority.
11. Let Feature 005 independently select at most one ready, dependency-independent, change-set-disjoint target.
12. Apply generic repeated-finding escalation only in guarded or non-Work cycles.

No lower authority waives a higher one. Capturing or normalizing evidence already available does not authorize further activity across an immediate halt.

## Retention-First Completion Decision

### Capture

`complete.capture`:

1. performs a fresh Inspection;
2. selects trusted verification and independent-review captures by caller-supplied identity;
3. normalizes both envelopes and recomputes every identity;
4. validates target, attempt, result, source revision, Inspection evidence, verdict, check, finding, and chronology bindings;
5. derives one immutable approach occurrence event;
6. derives the complete immutable finding-event set from the normalized review envelope;
7. returns the exact ordered occurrence-retention batch;
8. records only the batch commitment in `pendingCompletion`; and
9. leaves the pending attempt uncounted.

The caller cannot submit a trusted capture or envelope body through the semantic completion contract. It can only identify the expected captures and complete finding set.

### Retention

The host appends each current-run record. The lane owner validates and appends each exact `EventLineRecord`. `complete.finalize` does not trust append acknowledgements; it reacquires both sources.

A byte-identical replay counts once. A missing side, extra occurrence, same chronology with different bytes, wrong target, stale source, or event conflict leaves completion pending and derives no repeat.

### Finalize

`complete.finalize`:

1. reacquires both authoritative surfaces;
2. validates the supplied exact batch against `pendingCompletion`;
3. requires every committed event exactly once and byte-equivalent on both surfaces;
4. only then clears the pending attempt and admits the completed attempt;
5. derives the earliest valid finding or approach Repeat Relationship; and
6. returns either the ordinary result or `learning-required` plus an exact governance-required batch.

An immediate halt before occurrence retention leaves completion pending and establishes no repeat. An immediate halt after retention but before required-governance projection leaves exact evidence sufficient for deterministic re-derivation.

## Trusted Capture Decision

`TrustedSourceCaptureV2` carries exact bytes plus source authority kind, authority identity, invocation identity, target, completion state, and source outcome identity. Supplying bytes does not establish authority; only fresh Inspection source acquisition does.

Runtime normalizes:

- one `VerificationEnvelopeV2` with complete sorted checks; and
- one `IndependentReviewEnvelopeV2` with target, attempt, source revision, Inspection evidence, result, verification binding, reviewer identity, verdict, chronology, and complete sorted findings.

Every check-result finding identifies a check in the bound verification envelope and uses the same check-definition identity as the finding basis. An accepted review has no unresolved findings; a rejected review has at least one.

## Occurrence And Repeat Decision

### Finding Channel

The stable finding basis contains target, expected condition or governing rule, affected subjects, failure class, and check definition. It excludes attempt, occurrence, review invocation, evidence occurrence, observed result, chronology, severity, rationale, and wording.

A finding occurrence binds that basis to one attempt, the attempt's approach basis, trusted review envelope, normalized finding, observation, and strict chronology.

Two finding events establish repetition only when they are distinct, bind distinct attempts, have equal basis identities, use strict chronology, and verify byte-equivalently on both surfaces.

### Approach Channel

The stable approach basis contains action, material inputs, mechanisms, assumptions, evidence acquisition, and validation plan. It excludes labels, summaries, wording, attempt identity, result, and chronology.

An approach occurrence binds that basis to one authorized attempt, result, disposition, verification and review identities, and chronology.

Approach repetition uses the same retained-distinct-occurrence rule and does not require a reviewer finding.

### Stable Trigger

When more than one pair qualifies, runtime selects the earliest pair in strict chronology order. Later matching events remain audit evidence but do not rewrite governance identity.

## Projection Batch Decision

`ProjectionBatchV1` carries exact ordered events and matching commitments. Its identity hashes the purpose, target, and ordered commitments. Each commitment hashes one exact event.

Closed purposes are:

- `occurrence-retention`: one approach event followed by zero through sixteen findings sorted by occurrence identity;
- `incident-evidence`: exactly two Feature 007 finding events in strict chronology order;
- `learning-result`: one learning-review event followed by one governance event;
- `governance-required`, `governance-snapshot`, and `incident-supersession`: one event.

The originating command can reproduce a lost batch only when all normalized inputs remain unchanged and reproduction yields the same canonical events and batch identity. Otherwise projection stops. A commitment is never treated as a body-recovery mechanism.

## Canonical Event-Line Decision

Autonomous v2 uses:

```text
EventLineText = ASCII("- dude-run-event: ") || CJ(event)
EventLineRecord = UTF8(EventLineText) || LF
```

The 18-byte prefix and 16,384-byte event bound produce:

- a 16,402-byte maximum logical line; and
- a 16,403-byte maximum serialized record.

`laneEventLineHash` excludes LF. `laneEventRecordHash` includes LF. The mutation carries exact line text and literal `terminator:"LF"`; the lane owner serializes the terminator.

This dedicated type avoids forcing valid event records through the 1,024-byte `ShortText` bound. It also prevents line-hash ambiguity across LF, CRLF, wrapped `{event}` JSON, trailing space, and noncanonical suffixes.

Legacy v1 `CJ({event})` lines remain readable by the legacy audit path only. They cannot satisfy a v2 projection, permit, receipt, transition, or resolved audit row.

## Failed-Approach Decision

For a finding-triggered repeat, the initial failed set contains every unique `attemptApproachBasisIdentity` bound by qualifying finding occurrences through the trigger chronology cutoff.

For an approach-triggered repeat, it contains every unique failed approach basis represented by qualifying approach occurrences through that cutoff.

A rejected selected-alternative attempt adds its approach basis and evidence event hash. No member is removed. A credible-material alternative has one material-difference row per failed basis. A rejected alternative has one evidence-backed `same` or `different` comparison per failed basis plus its disposition and reason. No-progress hashes the complete considered union, including rejected rows.

## Permit Decision

The acyclic selected-alternative order is:

1. verified learning and governance projection;
2. fresh post-learning Inspection;
3. pure attempt-permit issuance against unchanged inspected RunState;
4. `authorize` consumption of that permit;
5. optional lane claim under a new post-authorization lane permit;
6. fresh lane receipt commit;
7. attempt execution;
8. retention-first completion;
9. final completion or no-progress lane permit; and
10. final lane receipt commit.

The logical `alternative-permitted` stage is the unchanged `alternative-inspected` state plus an exact permit. It is not a separately persisted RunState mutation.

This removes the cycle in which a permit would need to authorize a state change while still matching the post-change state.

## Exact Mutation Decision

Every projection and lane transition uses one complete lane-specific mutation object. Its identity is:

```text
SHA256(CJ(exactMutationObject))
```

The object binds exact lane, target, from and to state, blocker effect and bytes, event lines and LF contract, owner-log effect and expected complete owner bytes, reason, mapping, prestate, incident identities when applicable, and Lightweight snapshot timestamp.

The lane owner validates a closed mutation variant and a closed transition matrix before mutation. Unknown or conditionally forbidden fields reject. A change to any blocker byte, event byte, terminator, owner-log line, expected owner hash, incident identity, reason, state, or timestamp changes the mutation identity and invalidates the permit.

Controlled Unresolved End uses equal from and to state plus byte-identical blocker text. It remains a real history, snapshot, owner-log, and receipt operation even though target state is unchanged.

## Lane Schema Decision

All four autonomous wrapper operations share a closed envelope:

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

`OwnerBindingV1.ownerCapture` is the sole owner preimage. Lane `expected` objects contain no duplicate owner capture, and events are parsed only from `mutation.eventLines`.

The variants are exact:

| Lane operation | Permit | Expected captures | Mutation |
|---|---|---|---|
| Lightweight `work-project` | Projection permit | tasks, task-state | Lightweight projection mutation |
| Lightweight `work-set` | Lane mutation permit | tasks, task-state | Lightweight state or incident mutation |
| Tracked `work-project` | Projection permit | list, detail, history | Tracked projection mutation |
| Tracked `work-transition` | Lane mutation permit | list, detail, history | Tracked state mutation |

Every wrapper freshly reacquires all expected sources, recomputes owner and target mapping, verifies RunState, permit, mutation, event, and prestate identities, applies no caller-selected command, refuses before mutation on mismatch, performs only the permitted operation, and reacquires poststate before receipt creation.

## Receipt Decision

### Lightweight

When an owner-log effect is present, tasks, task-state, and owner bytes are one all-or-restored operation. When owner-log effect is absent, owner bytes are still protected and verified unchanged. `LightweightAtomicReceiptV1` is emitted only after every postimage is reacquired and matches.

Incomplete rollback is not a normal refusal. It is an indeterminate run-wide hard stop because authoritative state may have changed without a complete receipt.

### Tracked

Tracked issue state and filesystem owner log require a staged composite commit:

1. record evidence binding exact original descriptors, normalized prestate and mutation, and authoritative dispatch-result identity, and return the bounded exact recovery payload;
2. resubmit exact originals plus fresh captures, derive the authorized complete postimage without redispatch, and emit a lane receipt only on exact equality;
3. independently repeat the fresh lane proof before owner handling and composite receipt, then append exact owner lines or prove owner bytes unchanged;
4. bind both receipts in `TrackedCompositeReceiptV1`.

Only the composite receipt is success or advances governance. Dispatch without poststate proof and lane commit without owner proof are distinct pending phases. Do not repeat or roll back the lane mutation. Permit only exact idempotent owner reconciliation. Ambiguous tracked outcome or owner outcome is an indeterminate run-wide hard stop.

## Scheduling And Halt Decision

Learning governance seals only its affected target.

An unchanged suspension:

- changes no target glyph, status, blocker, mapping, or governance phase;
- cannot select another target;
- requires existing Feature 005 readiness, dependency, ownership, lane, and change-set-disjointness proof;
- permits sequential execution only; and
- cannot authorize revisit of the governed target.

Target-scoped hard stops and per-target budget exhaustion preserve otherwise valid scheduling authority. Run-wide security, safety, authority, credential, destructive-confirmation, spending, external-authorization, owner or lane ambiguity, unrecoverable evidence, and overall-budget exhaustion stop the invocation.

No halt clears governance or converts it to no-progress, ordinary block, close, or success.

## Audit Decision

Audit indexes only byte-equivalent valid v2 events present on both authoritative surfaces. It recognizes occurrence, learning-review, governance, incident-supersession, and receipt evidence.

Resolved alternative requires selected alternative, check, post-learning Inspection, accepted retained completion occurrence, verification, independent review, and completion receipt.

Resolved no-progress requires current failed set, complete considered alternatives, no-new-evidence proof, and no-progress receipt.

Unresolved rows report suspension, halt, budget, projection, controlled end, and re-derivation status without claiming block, close, no-progress, or success.

## Acyclic Feature 007 Decision

The incident identity graph is:

```text
fresh accepted evidence + exact prestate + branch evidence
  -> IncidentCorrectionIntentV1
  -> intentIdentity
  -> branch events
  -> event hashes and batches
  -> branch preview
  -> previewIdentity
  -> complete Lightweight mutation
  -> mutationIdentity
  -> permit
  -> atomic receipt
```

There is no edge from `previewIdentity` to an event or batch.

Both branches append an intent-bound `IncidentSupersessionEventV1` that proves the unauthorized prior disposition is superseded without rewriting it.

The exact branch also retains exactly two historical finding occurrence events in a dedicated `incident-evidence` batch, derives one supported Repeat Relationship, projects one required Governance Event, removes the obsolete blocker, and moves Feature 007 T001 only to in-progress learning-required. It dispatches no attempt.

The evidence-incomplete branch contains no finding occurrence, repeat, or Governance Event. It leaves T001 blocked and replaces only the blocker with the exact evidence-incomplete contract mismatch.

The final incident mutation binds both `intentIdentity` and `previewIdentity`, exact event-line order, exact blocker effect, exact owner-log line, expected complete owner bytes, snapshot time, and rollback-protected prestate.

## Feature 008 Core-Close Decision

Feature 009 uses exactly one open, non-`[P]`, `[Shared]` terminal task, `T009@696e6369`. Its sorted declaration is:

- `src/agents/dude.agent.md`
- `src/instructions/dude.instructions.md`
- `src/skills/dude-lightweight-execution/SKILL.md`
- `src/skills/dude-lightweight-execution/board.mjs`
- `src/skills/dude-lightweight-execution/board.test.mjs`
- `src/skills/dude-receiving-code-review/SKILL.md`
- `src/skills/dude-reviewer-protocol/SKILL.md`
- `src/skills/dude-work/SKILL.md`
- `src/skills/dude-work/recovery.mjs`
- `src/skills/dude-work/recovery.test.mjs`

T009 directly depends on T001 through T008.

Before T001 changes source, the coordinator establishes Feature 008's clean baseline and immediately rechecks it. T008 freezes and independently accepts the complete source revision without product writes and without repository `build-dev`. Only T009 may materialize generated core, obtain final acceptance, append accepted evidence, derive `acceptedFeatureEvidenceIdentity`, and perform the supported Feature 007 supersession.

## Rejected Alternatives

| Rejected alternative | Reason |
|---|---|
| Let implementation revise Feature 009 support artifacts | Execution would redefine its own authority and invalidate review. |
| Count findings before occurrence projection | Immediate-halt recovery could not deterministically reconstruct the claimed repeat. |
| Accept finding or check bodies from completion callers | Callers could fabricate evidence, chronology, or equivalence. |
| Store event bodies in RunState | It duplicates existing history and enlarges bounded state unnecessarily. |
| Store only hashes without returning event bodies | Projection cannot reconstruct exact bytes from a hash. |
| Use `ShortText` for lane event lines | A valid maximum event line exceeds the generic bound. |
| Hash `CJ({event})` for v2 lane lines | It conflicts with the corrected exact event suffix and preserves the rejected legacy shape. |
| Compare a finding hash to an approach hash | They are different identity domains and do not prove material difference. |
| Compare an alternative with only one failed approach | It can disguise repetition of another failed approach in the same case. |
| Reuse one permit for authorization and lane claim | `authorize` changes RunState and makes the original permit stale or cyclic. |
| Persist a new state during attempt-permit issuance | It changes the hash the permit must authorize. |
| Hash only mutation kind and reason | Decisive blocker, event, owner, state, incident, and timestamp bytes remain unbound. |
| Use prose-only lane wrappers | Root, owner, mapping, prestate, event, mutation, and receipt mismatches remain bypassable. |
| Treat tracked lane and owner append as one physical transaction | They live under different authorities and cannot commit atomically. |
| Report tracked lane-only success as complete | Governance could advance before required owner evidence exists. |
| Let an incident event reference preview identity | Event, batch, and preview identities become cyclic. |
| Force an approach event into historical incident evidence | Exact historical correction may have only two trusted finding occurrences; fabrication is forbidden. |
| Treat every target repeat as run-wide | It would freeze Feature 005's eligible sequential disjoint scheduling. |
| Treat target suspension as task block | It would falsely resolve or reclassify governance. |
| Use one-sided projection or surface union | Missing or conflicting history could appear resolved. |
| Require a repeated reviewer finding for all learning | It would remove the independent repeated-approach trigger. |
| Create an objective for learning | Learning must operate without an objective and cannot author definition state. |
| Require a repeat in both incident branches | Exact incident evidence may be unavailable; fabrication is forbidden. |
| Use `acceptedGovernanceIdentity` for incident correction | It does not bind immutable definition, source, verification, and final review evidence. |
| Materialize generated core before T008 acceptance | Generated output could precede independent acceptance of source. |
| Rewrite Feature 007 history | It would erase the incident rather than supersede it append-only. |

## Compatibility Boundary

- Guarded and non-Work public behavior remains byte-compatible where new optional fields do not apply.
- Existing v1 attempt, equivalence, learning, event-line, and audit records remain readable under their existing rules.
- Autonomous v2 derives no repeat, permit, no-progress, projection, transition, receipt, or resolved audit authority from v1 records.
- Manual, mirror, guarded, non-Work, and coordinator-maintenance lane operations retain their existing authority and cannot be cited as autonomous Work proof.
- Feature 005 remains the sole scheduler.
- Feature 008 remains the core-close authority.
- Feature 007 remains unchanged until terminal T009 applies one accepted supersession branch.
- No technical-docs implementation is part of Feature 009.
- No active ObjectiveRegistry is introduced.
- No command, lane, store, ledger, service, scheduler, concurrency behavior, or automatic repository-delivery action is added.
