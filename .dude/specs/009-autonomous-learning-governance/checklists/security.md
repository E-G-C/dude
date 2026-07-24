# Security Checklist: Autonomous Learning Governance

This checklist is advisory. It is not a live execution board and does not authorize a transition.

## Immutable Authority Boundary

- [ ] Treat the approved Feature 009 specification, plan, six support artifacts, and immutable task contract as read-only execution inputs.
- [ ] Prevent implementation tasks and specialists from writing any `.dude/specs/009-autonomous-learning-governance/**` path.
- [ ] Restrict Lightweight runtime changes to coordinator-owned glyph and blocker metadata.
- [ ] Prevent lane-state mutation from changing task identity, text, dependencies, phase, terminal identity, or source declaration.
- [ ] Stop with `contract-mismatch: redefine-required` when implementation discovers a normative mismatch.
- [ ] Recompute `definitionContractIdentity` from all eight exact artifact bodies and the immutable task contract.
- [ ] Bind accepted feature evidence to the immutable definition-contract identity.
- [ ] Confirm Feature 009 contains no active ObjectiveRegistry.
- [ ] Reject duplicate or competing staged `tasks.md` bodies before definition write.

## Authority Precedence

- [ ] Resolve exactly one defined owner by exact `spec_path` before governance or lane mutation.
- [ ] Resolve exact target, lane, and authoritative mapping before learning governance.
- [ ] Keep source authority, safety, hard stops, and budgets above semantic learning decisions.
- [ ] Keep `dude-work` as the sole detailed autonomous disposition authority.
- [ ] Keep independent review authoritative for findings and acceptance, not autonomous retry, block, close, no-progress, escalation, or invocation-end disposition.
- [ ] Keep Feature 005 as the sole scheduler.
- [ ] Preserve coordinator-only task glyph, metadata, tracked close, owner-log, and mirror authority.
- [ ] Prevent manual, guarded, non-Work, mirror, or maintenance paths from masquerading as autonomous Work evidence.
- [ ] Reject caller-authored scope, equivalence, phase, projection, pass/fail, permit, receipt, or audit claims.

## Input And Canonicalization

- [ ] Accept only strict UTF-8, duplicate-key-free canonical JSON at the CLI boundary.
- [ ] Reject unknown, accessor, symbol, sparse, cyclic, non-data, noncanonical, and conditionally forbidden fields.
- [ ] Recompute every hash from its complete closed record.
- [ ] Preserve existing no-follow, real-parent, containment, regular-file, complete-read, and post-read stability checks.
- [ ] Enforce source, aggregate, packet, event, event-line, batch, governance, collection, and request limits before expensive work.
- [ ] Keep raw filesystem, process, model, callback, and handle capabilities outside schema-visible records.
- [ ] Keep error envelopes bounded and free of unrestricted source content and secrets.

## Trusted Verification And Review Sources

- [ ] Acquire verification and independent-review bytes only through fresh Inspection sources.
- [ ] Require `TrustedSourceCaptureV2.state` to be `complete`.
- [ ] Validate target, authority kind, authority identity, invocation identity, outcome hash, exact bytes, byte length, and byte hash.
- [ ] Permit semantic commands to reference envelope and finding identities only.
- [ ] Reject direct caller submission of verification envelopes, review envelopes, findings, observations, check states, verdicts, or chronology.
- [ ] Normalize verification and independent review independently from their matching source kinds.
- [ ] Require target, attempt, source revision, Inspection evidence, and result identity agreement.
- [ ] Require the review envelope to bind the exact verification envelope.
- [ ] Require every check-result finding to identify a bound check and definition identity.
- [ ] Require caller finding identities to equal the complete normalized review set.
- [ ] Reject stale, partial, duplicate, wrong-target, wrong-authority, wrong-invocation, wrong-outcome, or conflicting captures.

## Occurrence Integrity And Retention-First Completion

- [ ] Retain one immutable approach event before counting completion.
- [ ] Retain every immutable finding event before counting a finding.
- [ ] Require both current-run and exact lane-history presence before occurrence admission.
- [ ] Prevent repeat classification before authoritative occurrence projection.
- [ ] Keep the pending attempt uncounted between `complete.capture` and `complete.finalize`.
- [ ] Store exact event bodies outside RunState and only commitments in RunState.
- [ ] Count a byte-identical replay once.
- [ ] Reject reused chronology with different bytes.
- [ ] Require every finding occurrence to bind the failed attempt's approach basis.
- [ ] Require strict target-bound attempt and review ordinals.
- [ ] Preserve exact retained evidence needed for deterministic re-derivation.
- [ ] Leave completion pending when an immediate halt prevents retention.
- [ ] Refuse overwrite of the one pending completion slot by another target.

## Projection Batch Integrity

- [ ] Return exact event bodies from originating commands.
- [ ] Store only batch and event commitments in RunState.
- [ ] Validate every body against its event hash.
- [ ] Validate every commitment against its exact body.
- [ ] Validate exact event order, cardinality, target, and batch purpose.
- [ ] Keep normal `occurrence-retention` approach-first.
- [ ] Restrict `incident-evidence` to exactly two valid Feature 007 finding events in strict chronology.
- [ ] Reject missing, extra, reordered, stale, wrong-target, malformed, or conflicting event bodies.
- [ ] Never infer event bytes from hashes, summaries, caller prose, or model recollection.
- [ ] Permit deterministic reproduction only from unchanged complete fresh evidence and identical canonical bytes.
- [ ] Make append behavior exact and idempotent.
- [ ] Retain unresolved state after one-sided append or write failure.
- [ ] Prevent protected transition or ordinary context release while required projection is unavailable.
- [ ] Keep immediate-halt re-derivation distinct from verified projection.

## Event-Line Trust Boundary

- [ ] Treat `EventLineText` as a dedicated bounded trust-boundary type, never `ShortText`.
- [ ] Require the exact 18-byte ASCII prefix `- dude-run-event: `.
- [ ] Limit `CJ(event)` to 16,384 bytes, `EventLineText` to 16,402 bytes, and the LF record to 16,403 bytes.
- [ ] Reject CR, CRLF, embedded LF, trailing whitespace, omitted terminator, and alternate newline encodings.
- [ ] Validate the event-line suffix by parse, canonical reserialization, event schema, target, and event-hash recomputation.
- [ ] Require the suffix to be `CJ(event)`, not `CJ({event})`.
- [ ] Bind exact LF serialization in the complete mutation.
- [ ] Hash line text without LF and complete record bytes with LF.
- [ ] Require projection plan and lane owner to agree on exact line, line hash, record hash, and literal `terminator:"LF"`.
- [ ] Keep wrapped v1 event history legacy-audit-only and non-authorizing for v2.

## Failed-Approach And Alternative Integrity

- [ ] Derive approach bases from complete authorized material inputs, mechanisms, assumptions, evidence acquisition, and validation plans.
- [ ] Prevent labels, summaries, and wording from changing approach identity.
- [ ] Include every failed approach implicated by a finding trigger through its chronology cutoff.
- [ ] Include every failed approach implicated by an approach trigger through its chronology cutoff.
- [ ] Require supporting retained event evidence for every failed basis.
- [ ] Extend the set after every rejected selected alternative.
- [ ] Prevent deletion, substitution, or silent truncation of a failed basis.
- [ ] Require one material-difference row per failed basis for every credible-material alternative.
- [ ] Require one evidence-backed `same` or `different` comparison per failed basis for every rejected alternative.
- [ ] Require at least one `same` comparison for a not-materially-different disposition.
- [ ] Bind no-progress to the complete considered union, including rejected rows.
- [ ] Reject missing, extra, duplicate, or wrong-basis comparison rows.
- [ ] Require evidence for every comparison and changed dimensions for every `different` row.
- [ ] Require a discriminating check bound to the candidate.
- [ ] Prevent finding hashes from being compared with approach hashes.
- [ ] Invalidate alternatives and no-progress proof when the failed set changes.
- [ ] Fail closed on capacity exhaustion without authorizing no-progress.

## Attempt And Lane Permit Separation

- [ ] Bind the attempt permit to the exact unchanged `alternative-inspected` RunState.
- [ ] Keep `transition.issue-attempt-permit` pure.
- [ ] Prevent persistence of a forged `alternative-permitted` state.
- [ ] Require `authorize` to consume the attempt permit before RunState mutation.
- [ ] Record issued and consumed permit hashes in successor governance.
- [ ] Derive any claim permit from the post-authorization RunState hash.
- [ ] Prevent the attempt permit from authorizing lane claim.
- [ ] Reject stale, replayed, wrong-target, wrong-state, wrong-mapping, wrong-prestate, wrong-alternative, or wrong-check permits.
- [ ] Require a committed atomic or composite claim receipt before execution when claim is required.
- [ ] Require separate terminal lane permits for completion, no-progress, controlled end, and incident supersession.
- [ ] Retain governance until the exact terminal receipt commits.

## Complete Mutation Binding

- [ ] Hash the complete closed lane-specific mutation object for every projection and lane permit.
- [ ] Never derive `mutationIdentity` from only mutation kind, reason, target, event hash, or prestate summary.
- [ ] Bind exact lane, operation, target, from/to glyph or status, blocker bytes, event lines, owner-log effect, reason, and Lightweight timestamp.
- [ ] Bind exact incident intent and preview identities in the final incident mutation.
- [ ] Bind complete expected owner-file hash, not only the Coordinator Log tail.
- [ ] Recompute mutation identity inside the lane owner before mutation.
- [ ] Validate the closed transition matrix inside the lane owner.
- [ ] Reject every unlisted state transition.
- [ ] Require `unchanged` blocker values to be byte-identical and `replace` values to be byte-distinct.
- [ ] Treat Controlled Unresolved End as a target-state no-op with a real event, owner effect, mutation, and receipt.
- [ ] Reject each independently modified mutation byte before mutation.

## Lightweight Lane Boundary

- [ ] Require closed Lightweight `work-project` and `work-set` request unions.
- [ ] Reject every omitted required field and unexpected field.
- [ ] Bind root, owner and its exact capture, target, full RunState, permit, mapping, expected tasks/task-state bytes, and exact mutation.
- [ ] Reject standalone event fields and derive events only from exact mutation event lines.
- [ ] Reacquire every expected source immediately before mutation.
- [ ] Require supplied bytes to equal fresh source bytes exactly.
- [ ] Accept no caller-provided command line, executable, shell fragment, or arbitrary subprocess argument.
- [ ] Refuse before mutation on every mismatch.
- [ ] Apply `tasks.md`, task-state, and owner changes as one all-or-restored transaction.
- [ ] Protect owner bytes and verify them unchanged when no owner append is authorized.
- [ ] Return no `LightweightAtomicReceiptV1` until all three postimages are freshly reacquired and match.
- [ ] Bind the receipt to permit, whole mutation, mapping, lane prestate, every poststate, and target-state-change flag.
- [ ] Treat incomplete rollback as an indeterminate run-wide hard stop.
- [ ] Preserve manual, guarded, mirror, maintenance, and non-Work paths as separate authority.

## Tracked Lane Boundary

- [ ] Keep exact original tracked captures only in bounded response-carried recovery transport, never RunState or a new persistent store.
- [ ] Bind original capture descriptors, normalized prestate and mutation, and authoritative dispatch-result identity in operation evidence.
- [ ] Recompute the exact full postimage without redispatch and reject unrelated drift at both recovery stages.
- [ ] Prevent owner append or composite success when fresh lane state no longer equals the receipt-bound authorized postimage.
- [ ] Require closed tracked `work-project` and `work-transition` request unions.
- [ ] Reject every omitted required field and unexpected field.
- [ ] Bind root, owner and its exact capture, target, full RunState, permit, mapping, complete list/detail/history bytes, and exact mutation.
- [ ] Reject standalone event fields and duplicate owner captures.
- [ ] Require one unique issue-to-task mapping from complete fresh captures.
- [ ] Accept no caller-provided command line, executable, shell fragment, or arbitrary subprocess argument.
- [ ] Refuse before lane mutation on every mismatch.
- [ ] Treat tracked dispatch without poststate proof as pending without a lane receipt.
- [ ] Reacquire exact tracked poststate before `TrackedLaneCommitReceiptV1`.
- [ ] Treat a lane receipt as committed evidence, never success.
- [ ] Compare-and-append exact owner-log lines only against the complete expected owner hash.
- [ ] Require `OwnerLogCommitReceiptV1` for the exact append.
- [ ] Require an appended-or-unchanged owner receipt and `TrackedCompositeReceiptV1` for every tracked success.
- [ ] Treat a lane-committed owner-log failure as `owner-log-receipt-pending`, never refusal or success.
- [ ] Do not repeat or roll back an acknowledged tracked lane mutation.
- [ ] Permit only exact idempotent owner-log reconciliation while pending.
- [ ] Permit no governed Work transition or close reporting while a tracked receipt is pending.
- [ ] Treat unrecoverable pending or ambiguous lane/owner evidence as run-wide.

## Receipt And Replay Protection

- [ ] Select a stable earliest qualifying pair so later history cannot change trigger identity.
- [ ] Require monotonic governance revisions.
- [ ] Reject same-revision different Governance Events.
- [ ] Reject duplicate projection copies and same-hash different bytes.
- [ ] Bind every permit to one lane, operation, target, mapping, prestate, state, and complete mutation.
- [ ] Refuse permit replay after any state, mapping, prestate, or mutation change.
- [ ] Prevent controlled-end replay even when target lane state is unchanged.
- [ ] Bind Lightweight receipt to all atomic postimages.
- [ ] Bind tracked composite receipt to both lane and owner receipts.
- [ ] Retain unresolved governance after poststate-capture, owner-append, or receipt failure.
- [ ] Distinguish refusal, tracked-operation-dispatched, tracked-lane-committed, and indeterminate outcomes without collapsing partial commits into failure or success.

## Post-Learning Freshness

- [ ] Acquire a new complete Inspection after learning and governance projection.
- [ ] Bind target, owner, mapping, trigger, review, failed set, assumptions, and branch.
- [ ] Exclude only expected projection additions from drift analysis.
- [ ] Invalidate stale Inspection before permit issuance.
- [ ] Return substantive trigger, failed-set, assumption, approach-history, or distinguishing-evidence drift to learning.
- [ ] Treat owner, lane, or mapping ambiguity as run-wide.
- [ ] Require fresh verification and independent review after a selected-alternative attempt.
- [ ] Require fresh no-new-distinguishing-evidence proof for no-progress.

## Halt Scope And Scheduling

- [ ] Derive halt scope only from authoritative normalized blockers or budget ownership.
- [ ] Treat missing or conflicting scope as run-wide ambiguity.
- [ ] Keep security, safety, authority, credential, destructive-confirmation, spending, external authorization, owner/lane ambiguity, overall budget, and unrecoverable governance evidence run-wide.
- [ ] Keep proven local dependency/input, target hard stop, target-bound learning-evidence incompleteness, and per-target budget target-scoped.
- [ ] Prevent any halt from clearing learning or authorizing block, close, no-progress, or resolving status.
- [ ] Require safe retention before unchanged suspension unless an immediate-halt exception applies.
- [ ] Require Feature 005's exact readiness, dependency, and change-set-disjointness proof for another target.
- [ ] Prevent governance or permits for one target from transferring authority to another.
- [ ] Preserve sequential execution and reject concurrent starts.
- [ ] Stop the invocation when governance or mutation evidence is unrecoverable.

## Evidence Retention And Audit

- [ ] Keep runtime governance evidence on current-run and authoritative lane history only.
- [ ] Introduce no second ledger, persistent recovery store, hidden database, or external service.
- [ ] Derive audit from the byte-equivalent intersection, never union.
- [ ] Retain exact basis, occurrence, approach, evidence, and chronology for re-derivation.
- [ ] Require selected-alternative fresh Inspection at `alternative-inspected` or fresh no-progress verification at `no-progress-verified`; reject `projected`, and keep Immediate Halt End separate.
- [ ] Audit Controlled Unresolved End as governance-branch resolved with lane disposition pending, never as target completion or applied no-progress.
- [ ] Require equal Immediate Halt End outcome, halt, and evidence dispositions across exactly `verified`, `rederive-required`, and `unavailable`.
- [ ] Bind those branches respectively to projection reference/revision, proof/exact occurrences, or matching unrecoverable identity/run-wide scope.
- [ ] Keep every branch without controlled-end authority and keep unavailable evidence a run-wide hard stop.
- [ ] Bind each recovery identity to stage, prior evidence or receipt, mutation, target, and expected next operation.
- [ ] Reject recovery-stage, target, mutation, evidence, receipt, or next-operation substitution.
- [ ] Keep recovery operations outside all Beads dispatch construction and execution paths.
- [ ] Permit owner reconciliation only from the exact original preimage or deterministic single-append postimage.
- [ ] Never report success from operation evidence, lane receipt, or owner receipt alone.
- [ ] Reconstruct only the highest consistent governance revision.
- [ ] Stop on missing, conflicting, nonmonotonic, wrong-target, or unrecoverable history.
- [ ] Derive resolved rows only with matching branch evidence and atomic or composite receipts.
- [ ] Report pending receipt, unresolved projection, or halt without false resolution.
- [ ] Keep v1 records historical and non-authorizing.
- [ ] Exclude secrets and unrestricted source bodies from events, permits, receipts, owner-log lines, and audit summaries.

## Objective Boundary

- [ ] Do not create an objective, sequence, registry, or identity for learning.
- [ ] Admit `sequenceIdentity` only from one already valid unique mapping.
- [ ] Omit it for no match or ambiguity.
- [ ] Prevent objective evidence from overriding halt, repeat, failed set, projection, Inspection, permit, verification, review, receipt, or scheduling authority.
- [ ] Confirm Feature 009 itself has no active ObjectiveRegistry.

## Accepted Feature Evidence

- [ ] Derive `acceptedFeatureEvidenceIdentity` from the complete accepted record excluding only that identity field.
- [ ] Require Feature 009 incident correction to use `AcceptedFeatureEvidenceV1` with `mode:"core-close"`.
- [ ] Bind immutable definition contract, terminal task, baseline line, accepted line, `HEAD`, declaration, source, changed set, verification set, final review envelope, and review digest.
- [ ] Require the accepted line to be the latest line matching all bound identities.
- [ ] Require the transient final review to remain available or be freshly reacquired.
- [ ] Reject standard-mode, stale, incomplete, superseded, or drifted accepted evidence.

## Feature 008 Core-Close Security

- [ ] Require exactly one open non-`[P]` `[Shared]` terminal T009.
- [ ] Require the exact sorted ten-path declaration.
- [ ] Require direct dependencies on T001 through T008.
- [ ] Bind immutable definition identity before source execution.
- [ ] Require immutable `HEAD`, clean source, clean generated core, no ignored entries, and clean parity before baseline.
- [ ] Append the baseline line only after clean preflight.
- [ ] Immediately repeat preflight before first source mutation.
- [ ] Serialize all source work through T009.
- [ ] Block on observed or suspected concurrent core mutation.
- [ ] Require every changed source path to be declared.
- [ ] Prevent T008 from making a product write.
- [ ] Forbid repository `build-dev` before T008 independent source acceptance.
- [ ] Require unchanged T008 acceptance and source identities at T009 entry.
- [ ] Snapshot protected paths before T009 materialization.
- [ ] Prove exact generated projection and protected preservation.
- [ ] Require complete verification and fresh final independent review.
- [ ] Append accepted evidence only after approval.
- [ ] Immediately recompute baseline, head, declaration, source, changed, review, parity, and verification identities.
- [ ] Use only the latest matching accepted line.
- [ ] Derive `acceptedFeatureEvidenceIdentity` only after this terminal lifecycle.
- [ ] Reject drifted, stale, incomplete, or standard-mode evidence for Feature 009 correction.

## Acyclic Feature 007 Correction

- [ ] Require current accepted Feature 009 core-close evidence before intent derivation.
- [ ] Resolve exactly one Feature 007 owner by exact `spec_path`.
- [ ] Capture exact owner, tasks, task-state, task unit, blocker text, review, verification, Inspection, lane history, and rollback bytes.
- [ ] Confirm no later event already supersedes the incident.
- [ ] Form and hash one closed `IncidentCorrectionIntentV1` before any incident event or batch.
- [ ] Ensure no incident event, event hash, or batch identity depends on `previewIdentity`.
- [ ] Require Incident Supersession Event to reference `intentIdentity`.
- [ ] Bind exact incident intent and preview identities in the final complete lane mutation.
- [ ] Require exact branch to prove two distinct trusted finding occurrences with equal bases and strict chronology.
- [ ] Require exact branch to use the dedicated finding-only `incident-evidence` batch.
- [ ] Keep normal completion `occurrence-retention` approach-first.
- [ ] Require exact branch event order: two finding lines, required Governance Event line, Incident Supersession Event line.
- [ ] Prevent exact branch from dispatching another Feature 007 attempt.
- [ ] Require incomplete branch whenever any exact field is missing, partial, stale, duplicated, same-attempt, replay-conflicting, or ambiguous.
- [ ] Prohibit occurrence identity, `incident-evidence`, Repeat Relationship, and Governance Event in the incomplete branch.
- [ ] Keep T001 blocked in the incomplete branch.
- [ ] Use the exact evidence-incomplete blocker text.
- [ ] Preserve every prior owner-log and task-history line.
- [ ] Do not validate or rewrite the original unauthorized block.
- [ ] Limit lane writes to the Feature 007 owner ledger, tasks file, and task-state snapshot.
- [ ] Apply those three paths as one all-or-restored Lightweight transaction.
- [ ] Treat incomplete rollback as a run-wide hard stop.
- [ ] Perform no technical-docs implementation.
- [ ] Require fresh post-correction lint, audit, and independent review.

## Definition Stage Singularity

- [ ] Stage exactly one Feature 009 `tasks.md` path and one complete byte stream.
- [ ] Use the second complete corrected task block with only the authorized T005, T006, and T009 wording deltas.
- [ ] Reject concatenated candidates, duplicate task titles, truncated precursor text, or trailing candidate text.
- [ ] Reject any unapproved task-key, dependency, phase, terminal identity, or source-declaration change.
