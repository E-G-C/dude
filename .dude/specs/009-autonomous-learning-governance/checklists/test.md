# Test Checklist: Autonomous Learning Governance

This checklist is advisory. It is not a live execution board and does not authorize task state changes.

## Immutable Definition Boundary

- [ ] Assert all nine Feature 009 definition inputs are complete before execution: `spec.md`, `plan.md`, six support artifacts, and `tasks.md`.
- [ ] Assert the eight immutable artifact descriptors are sorted by path and bind exact bytes and byte lengths.
- [ ] Assert the immutable task contract binds task keys, markers, descriptions, phases, dependencies, terminal identity, and the exact T009 source declaration.
- [ ] Assert no implementation task or specialist writes `.dude/specs/009-autonomous-learning-governance/**`.
- [ ] Assert only coordinator-owned Lightweight glyph and blocker metadata are excluded from the immutable task identity.
- [ ] Reject continuation with `contract-mismatch: redefine-required` when a normative contract change is needed.
- [ ] Assert support artifacts are absent from every implementation write set.
- [ ] Assert Feature 009 has no active ObjectiveRegistry.

## Static Authority Contracts

- [ ] Assert `dude-work` is the sole detailed autonomous learning-governance owner.
- [ ] Assert independent review owns grounded findings and acceptance but not autonomous retry, block, close, no-progress, escalation, or invocation-end disposition.
- [ ] Assert guarded and non-Work generic escalation remains unchanged.
- [ ] Assert Feature 005 remains the sole sequential disjoint-target scheduler.
- [ ] Assert `policy.parallel` remains literal `1`.
- [ ] Assert no new top-level command, lane, store, ledger, service, scheduler, concurrency behavior, objective mechanism, or automatic delivery action exists.
- [ ] Assert no Feature 005 or Feature 008 definition artifact is modified.
- [ ] Assert Feature 007 remains unchanged until accepted T009 supersession.

## Closed Schemas And Bounds

- [ ] Reject unknown, duplicate, sparse, accessor-backed, cyclic, non-data, noncanonical, and conditionally forbidden fields.
- [ ] Recompute every capture, envelope, check, finding, basis, occurrence, event, batch, failed-set, review, governance, Inspection, permit, mutation, receipt, audit, definition, feature-evidence, intent, and preview identity.
- [ ] Exercise exact lower and upper bounds for findings, alternatives, failed approaches, evidence, assumptions, subjects, events, batches, governance bytes, source bytes, Inspection bytes, packet items, and CLI bytes.
- [ ] Reject a 16,385-byte canonical event and a 32,769-byte governance record without clearing state.
- [ ] Reject feature-only, malformed, or wrong-lane targets.
- [ ] Reject missing or ambiguous tracked mappings.
- [ ] Preserve existing UTF-8, canonical JSON, path safety, complete-read, no-follow, and bounded-error behavior.

## Trusted Source Normalization

- [ ] Normalize verification only from a fresh Inspection `TrustedSourceCaptureV2` with `authority.kind:"verification"`.
- [ ] Normalize independent review only from a fresh Inspection capture with `authority.kind:"independent-review"`.
- [ ] Reject direct semantic-command submission of either envelope body.
- [ ] Reject caller-supplied `GroundedFindingV1`, finding body, check state, verdict body, observation body, or chronology.
- [ ] Require callers to reference only verification envelope, review envelope, and complete sorted finding identities.
- [ ] Reject stale, partial, duplicate, conflicting, wrong-target, wrong-authority, wrong-invocation, and wrong-outcome captures.
- [ ] Reject verification target, attempt, result, source revision, or Inspection mismatch.
- [ ] Reject review target, attempt, result, source revision, Inspection, verification, verdict, or chronology mismatch.
- [ ] Reject a `check-result` finding that does not identify a bound verification check with the same definition identity.
- [ ] Require caller finding identities to equal the normalized complete review finding set.
- [ ] Require an accepted review to have zero unresolved findings and a rejected review to have at least one.

## Retention-First Completion

- [ ] Make `complete.capture` derive exactly one approach event.
- [ ] Derive zero through sixteen finding events from the trusted review envelope.
- [ ] Sort normal-completion finding events by occurrence identity.
- [ ] Require every finding event to bind `attemptApproachBasisIdentity`.
- [ ] Return exact event bodies in an `occurrence-retention` batch.
- [ ] Record only `PendingCompletionRetentionV2` and the batch commitment in RunState.
- [ ] Keep the pending attempt uncounted after capture.
- [ ] Prove repeat classification is impossible before retained occurrence events verify.
- [ ] Project every occurrence event to current-run and Lightweight history.
- [ ] Project every occurrence event to current-run and tracked history.
- [ ] Reject finalize when either occurrence surface is missing.
- [ ] Reject finalize for a missing event, extra event, changed order, body/hash mismatch, commitment mismatch, wrong target, stale source, duplicate, or conflict.
- [ ] Treat one byte-identical replayed occurrence event as one occurrence.
- [ ] Reject reused chronology with different bytes.
- [ ] Clear the pending attempt only after exact dual retention.
- [ ] Derive repetition only after completion admission.
- [ ] Leave completion pending when an immediate halt prevents retention.
- [ ] Re-derive governance from retained occurrences when a halt prevents later governance projection.
- [ ] Refuse a second pending-completion target rather than overwriting evidence.

## Finding Classification

- [ ] Classify one first valid occurrence as non-repeat.
- [ ] Classify a later distinct basis as non-repeat despite similar wording.
- [ ] Classify equal bases as repeat despite different wording.
- [ ] Exclude attempt, review, observation, result, chronology, severity, rationale, summary, and prose from basis equality.
- [ ] Require target, expectation or rule, subjects, failure class, and check definition in the basis.
- [ ] Require attempt, approach basis, review envelope, finding, observation, and chronology in every occurrence.
- [ ] Reject two reviews of one attempt as repetition.
- [ ] Select the earliest qualifying pair when more than two valid occurrences exist.
- [ ] Prove free-form equivalence cannot create a Repeat Relationship.

## Approach Classification

- [ ] Classify first and distinct approaches correctly.
- [ ] Establish an approach-only repeat without repeated reviewer findings.
- [ ] Reject labels, summaries, or wording as material identity.
- [ ] Require complete material inputs, mechanisms, assumptions, evidence acquisition, validation plan, authorization, result, disposition, and chronology.
- [ ] Treat replay as one occurrence.
- [ ] Select the earliest qualifying approach pair.
- [ ] Prove legacy `Assessment.equivalence` has no autonomous v2 authority.

## Projection Batches

- [ ] Require exact event bodies in originating command responses.
- [ ] Store only `ProjectionCommitmentV1` in RunState.
- [ ] Validate event count, event order, commitment order, event kind, event hash, and batch identity.
- [ ] Exercise `occurrence-retention`, `incident-evidence`, `governance-required`, `learning-result`, `governance-snapshot`, and `incident-supersession` batches.
- [ ] Require normal `occurrence-retention` to contain one approach event first, then zero through sixteen findings.
- [ ] Require `incident-evidence` to contain exactly two chronologically ordered Feature 007 finding events and no approach event.
- [ ] Require `learning-result` order to be learning review then governance.
- [ ] Require each other purpose to contain exactly one event.
- [ ] Reject an event batch body/hash mismatch.
- [ ] Reject a batch commitment without the exact body.
- [ ] Lose an event body and prove unchanged authoritative evidence can reproduce identical bytes and identity.
- [ ] Change authoritative evidence and prove reproduction refuses.
- [ ] Exercise current-run-only and lane-only partial projection.
- [ ] Retry by appending only the absent exact side.
- [ ] Treat one exact existing copy as idempotent success.
- [ ] Reject duplicate, same-hash different bytes, wrong-target, malformed, stale, and noncanonical event copies.
- [ ] Prove audit uses the verified intersection rather than union.

## Event-Line Grammar

- [ ] Accept a 16,384-byte canonical event in a 16,402-byte `EventLineText`.
- [ ] Accept its exact 16,403-byte LF-terminated `EventLineRecord`.
- [ ] Require the exact 18-byte ASCII prefix `- dude-run-event: `.
- [ ] Hash line text without LF and record bytes with LF.
- [ ] Reject use of `ShortText` for an autonomous v2 event line.
- [ ] Reject a 16,385-byte event, CR, CRLF, embedded LF, trailing whitespace, noncanonical suffix, and missing LF serialization contract.
- [ ] Reject `CJ({event})` as autonomous v2 authority while preserving legacy audit-only readability.
- [ ] Require parse plus canonical reserialization of the suffix to reproduce identical bytes.
- [ ] Require `ProjectionPlanV1`, Lightweight mutations, and tracked mutations to carry identical exact line bytes and literal `terminator:"LF"`.
- [ ] Require every `EventLineAppendV1.eventHash` to match the event parsed from its line.

## Failed-Approach Sets

- [ ] Derive finding-triggered members from every qualifying finding event's attempt approach basis through the chronology cutoff.
- [ ] Derive approach-triggered members from all qualifying approach events through the cutoff.
- [ ] Require sorted unique basis identities and supporting event hashes.
- [ ] Require every basis to have at least one supporting event hash.
- [ ] Require every credible-material alternative to contain exactly one material-difference row per current failed basis.
- [ ] Require every rejected alternative to contain exactly one `same` or `different` comparison per current failed basis.
- [ ] Require every not-materially-different alternative to contain at least one `same` comparison.
- [ ] Hash the complete considered alternative union, including rejected rows, for no-progress.
- [ ] Reject missing, extra, duplicate, or wrong-basis comparisons.
- [ ] Reject finding-hash to approach-hash comparison.
- [ ] Require evidence for every comparison and changed dimensions for every `different` row.
- [ ] Extend the set after a rejected selected alternative.
- [ ] Prove failed-set mutation invalidates prior alternatives and no-progress proof.
- [ ] Reject removal or substitution of a failed basis.
- [ ] Fail closed on the seventeenth basis without authorizing no-progress.

## Learning Review

- [ ] Exercise one and sixteen bounded learning findings; reject zero and seventeen.
- [ ] Exercise zero, one, and eight alternatives; reject nine.
- [ ] Validate complete evidence and assumption binding.
- [ ] Require one selected credible material alternative for the selected branch.
- [ ] Reject selected noncredible, nonmaterial, missing, duplicate, or wrong-target alternatives.
- [ ] Require one discriminating check bound to the candidate basis.
- [ ] Require no-progress proof to bind the current failed-set identity.
- [ ] Require an exactly empty credible-material identity array for no-progress.
- [ ] Prove caller prose cannot create no-progress.
- [ ] Keep v1 learning events readable only as historical audit evidence.
- [ ] Reject v1 as governance, permit, transition, no-progress, or resolved-audit authority.

## Governance Phases

- [ ] Make a retained repeat create exactly one target-bound case in `required`.
- [ ] Refuse overwrite by another target and return capacity failure.
- [ ] Exercise `required`, `reviewed`, `projected`, `alternative-inspected`, logical `alternative-permitted`, `alternative-authorized-pending-lane`, `alternative-authorized`, `alternative-verified`, and `no-progress-verified`.
- [ ] Prove permit issuance leaves RunState byte-identical.
- [ ] Reject a caller-persisted or forged `alternative-permitted` state.
- [ ] Reject skipped, reversed, duplicated, or target-mismatched transitions.
- [ ] Return substantive trigger, failed-set, assumption, approach-history, or distinguishing-evidence drift to `required`.
- [ ] Return nonsemantic Inspection staleness to `projected`.
- [ ] Retain terminal governance until the matching final lane receipt commits.
- [ ] Reject ordinary affected-target attempt, block, close, no-progress, resolving status, and revisit while unresolved.

## Attempt And Lane Permit Ordering

- [ ] Issue an attempt permit against the exact unchanged inspected state.
- [ ] Reject a stale attempt permit after evidence, mapping, prestate, or RunState changes.
- [ ] Require `authorize` to consume the exact permit before changing RunState.
- [ ] Reject replayed permit.
- [ ] Reject an old attempt permit against post-authorization state.
- [ ] Reject use of an attempt permit as a lane permit.
- [ ] Exercise `claimRequired:false` direct transition to `alternative-authorized`.
- [ ] Exercise `claimRequired:true` transition to `alternative-authorized-pending-lane`.
- [ ] Require a distinct post-authorization lane permit for the claim-required path.
- [ ] Require the lane permit to bind the complete closed lane-specific mutation.
- [ ] Refuse attempt execution until the required atomic or composite claim receipt commits.
- [ ] Reject invalid, stale, mismatched, or replayed receipts.
- [ ] Keep governance active after mutation, pending-receipt, or receipt failure.
- [ ] Require separate final task-completed or no-progress mutation, permit, and receipt.

## Public Command Matrix

- [ ] Exercise `inspect` through the process CLI.
- [ ] Exercise guarded and autonomous `authorize`.
- [ ] Exercise `complete.capture` and `complete.finalize`.
- [ ] Reject legacy one-stage autonomous completion as v2 authority.
- [ ] Exercise selected-alternative and no-progress `learn`.
- [ ] Exercise every closed transition mode.
- [ ] Require `transition.prepare-projection` and `transition.verify-projection` to receive the exact batch.
- [ ] Require `transition.issue-lane-permit` to receive the complete lane-specific mutation, not an abstract kind/reason/event tuple.
- [ ] Exercise `audit` from fresh authoritative captures.
- [ ] Reject unknown command, mode, top-level field, and conditionally forbidden field.
- [ ] Prove helper-only success cannot satisfy acceptance.
- [ ] Run complete finding-repeat and approach-only flows through serialized process calls.

## Post-Learning Inspection

- [ ] Reject an Inspection predating learning.
- [ ] Reject an Inspection predating verified projection.
- [ ] Accept only expected projection additions as nonsemantic delta.
- [ ] Reject wrong alternative, check, failed set, target, owner, or mapping.
- [ ] Reacquire after staleness.
- [ ] Return substantive evidence drift to learning.
- [ ] Require fresh post-projection Inspection for no-progress.
- [ ] Require fresh verification and independent review after the selected attempt.

## Halts, Budgets, And Scheduling

- [ ] Exercise target-local unavailable dependency and input.
- [ ] Exercise target hard stop and target-bound learning-evidence incompleteness.
- [ ] Exercise per-target budget exhaustion before learning, during learning, and after selection.
- [ ] Exercise run-wide security, safety, authority, credential, destructive-confirmation, spending, and external-authorization stops.
- [ ] Exercise owner and lane ambiguity as run-wide.
- [ ] Exercise unrecoverable governance evidence as run-wide.
- [ ] Exercise overall-budget exhaustion at every governance phase.
- [ ] Treat missing or conflicting scope as run-wide ambiguity.
- [ ] Prove no halt clears, resolves, blocks, closes, or grants no-progress.
- [ ] Permit unchanged suspension only after retention/projection or a valid immediate-halt re-derivation basis.
- [ ] Exercise an eligible distinct target with fresh readiness, no dependency, and disjoint change set.
- [ ] Reject same target, dependency, overlap, stale readiness, ambiguous change set, and authority transfer.
- [ ] Exercise several eligible candidates while starting only one.
- [ ] Reject every concurrent start.

## Controlled End And Resume

- [ ] End unresolved after fresh projection without changing target state.
- [ ] Require from/to glyph or status and blocker text to be byte-identical for Controlled Unresolved End.
- [ ] Require a real governance event, owner-log effect, mutation identity, and receipt despite the target-state no-op.
- [ ] Require `alternative-inspected` with fresh selected-alternative Inspection before attempt permit, or `no-progress-verified` with fresh no-new-evidence verification before lane disposition.
- [ ] Report the governance branch resolved and lane disposition pending in both controlled-end outcomes.
- [ ] Reject Controlled Unresolved End from `required`, `reviewed`, `projected`, and every authorized, attempted, or terminal phase.
- [ ] Through public `runCommand` and process paths, exercise Immediate Halt End after verified projection and before projection with exact retained occurrences.
- [ ] Require equal outcome, halt, and evidence dispositions across exactly `verified`, `rederive-required`, and `unavailable`.
- [ ] Require respectively the exact projection reference/bound revision, rederivation proof/exact occurrence pair, or matching unrecoverable evidence identity/run-wide stop.
- [ ] Reject missing, extra, stale, one-sided, mismatched, or cross-branch evidence.
- [ ] Give no branch a controlled-end transition, permit, mutation, record, or receipt.
- [ ] Exercise `work-prove-poststate` and `work-reconcile-owner` recovery from both pending tracked phases.
- [ ] Prove neither recovery operation dispatches Beads.
- [ ] Prove exact replay returns identical receipts without repeated lane or owner mutation.
- [ ] Reject end when evidence is neither retained nor re-derivable.
- [ ] Resume the highest consistent revision.
- [ ] Re-derive the exact repeat and failed set from retained occurrences.
- [ ] Project reconstructed `required` governance before normal transition.
- [ ] Reject missing, one-sided, wrong-target, conflicting, nonmonotonic, or unrecoverable history.
- [ ] Audit controlled end as invocation outcome, never target block, close, or no-progress.

## Exact Lane Mutations

- [ ] Hash the complete closed mutation object for every projection and lane permit.
- [ ] Reject derivation from only kind, reason, target, event hash, or prestate summary.
- [ ] Reject each independently modified mutation field before mutation.
- [ ] Reject unknown and conditionally forbidden mutation fields.
- [ ] Bind exact lane, target, from/to state, blocker effect, event lines, owner-log effect, reason, and Lightweight timestamp.
- [ ] Bind exact incident intent and preview identities for incident mutation.
- [ ] Validate the reason against mutation kind.
- [ ] Exercise every allowed Lightweight and tracked transition-matrix row.
- [ ] Reject every unlisted from/to transition.
- [ ] Bind exact blocker add, remove, replace, and unchanged text.
- [ ] Require `unchanged` blocker before/after values to be byte-identical.
- [ ] Require `replace` blocker before/after values to be byte-distinct.
- [ ] Bind exact owner-log lines and complete expected owner-file hash.
- [ ] Bind exact event lines and LF serialization.
- [ ] Exercise every closed `LaneRefusalReason`.

## Lightweight Wrapper And Commit Matrix

- [ ] Exercise exact `work-project` and `work-set` request unions.
- [ ] Reject each omitted required field and each unexpected field.
- [ ] Reject wrong root, owner, target, state, permit, mapping, expected bytes, mutation event line, or mutation.
- [ ] Reject a standalone `event` field and duplicate owner fields in `expected`.
- [ ] Reject arbitrary caller command strings, executables, shell fragments, and arguments.
- [ ] Freshly reacquire owner, tasks, and task-state bytes immediately before mutation.
- [ ] Leave owner, tasks, and task-state bytes unchanged on every refusal.
- [ ] Exercise exact no-op projection.
- [ ] Exercise valid claim, block, completion, controlled-end, and both incident mutations.
- [ ] Apply tasks, task-state snapshot, and owner changes all-or-restored.
- [ ] Protect and verify owner bytes unchanged when `ownerLog.kind:"none"`.
- [ ] Inject failure at every stage, rename, validation, postimage, and rollback boundary.
- [ ] Return no receipt until every Lightweight postimage is freshly reacquired.
- [ ] Require `LightweightAtomicReceiptV1` to bind permit, whole mutation, mapping, prestate, all three poststates, and target-state-change flag.
- [ ] Hard stop on incomplete rollback.
- [ ] Preserve manual, guarded, mirror, and maintenance operations outside Work authority.

## Tracked Wrapper And Commit Matrix

- [ ] Require dispatch-pending responses to return operation evidence and a bounded transient recovery payload containing exact original captures, normalized dispatch result, and exact mutation.
- [ ] Derive the complete expected tracked postimage from exact originals plus authorized mutation and dispatch result; reject every unrelated list, detail, or history delta.
- [ ] Require `work-reconcile-owner` to freshly revalidate list, detail, history, operation evidence, recovery payload, and lane receipt before owner mutation and composite receipt.
- [ ] Exercise exact tracked `work-project` and `work-transition` request unions.
- [ ] Require complete fresh list, detail, history, and owner bytes.
- [ ] Require one unique issue-to-task mapping.
- [ ] Reject omitted and unexpected fields.
- [ ] Reject missing, duplicate, stale, conflicting, or changed mapping before mutation.
- [ ] Reject unsupported issue status and wrong spec identity.
- [ ] Reject caller command strings or arbitrary arguments.
- [ ] Return `tracked-operation-dispatched` with operation evidence and no lane receipt when poststate proof is pending.
- [ ] Freshly reacquire tracked poststate before `TrackedLaneCommitReceiptV1`.
- [ ] Never report `TrackedLaneCommitReceiptV1` as success.
- [ ] Require lane receipt before owner-log receipt.
- [ ] Produce an unchanged-owner receipt when `ownerLog.kind:"none"`.
- [ ] Compare the complete owner prestate hash before exact append.
- [ ] Require `OwnerLogCommitReceiptV1` for the exact owner append.
- [ ] Require both receipts before `TrackedCompositeReceiptV1`.
- [ ] Treat lane-committed owner-log failure as `phase:"tracked-lane-committed"` with `owner-log-receipt-pending`, never refusal or success.
- [ ] Do not repeat or roll back an acknowledged tracked lane commit.
- [ ] Allow only exact idempotent owner reconciliation while pending.
- [ ] Block governance advancement, close reporting, and another governed transition until the composite receipt exists.
- [ ] Hard stop on ambiguous tracked or owner-log outcome.
- [ ] Preserve manual and non-Work tracked behavior.

## Objective Compatibility

- [ ] Exercise no registry, no match, ambiguous match, and one valid unique match.
- [ ] Omit `sequenceIdentity` without one valid unique match.
- [ ] Never create or repair an objective or registry.
- [ ] Preserve identical governance ordering in every objective case.
- [ ] Prove objective evidence cannot waive halt, failed set, projection, Inspection, permit, verification, review, receipt, or scheduling authority.
- [ ] Assert Feature 009's plan has no active ObjectiveRegistry.

## Audit Matrix

- [ ] Derive resolved-alternative evidence from the authoritative intersection.
- [ ] Derive resolved-no-progress evidence from the authoritative intersection.
- [ ] Derive unresolved suspension and later sequential scheduling.
- [ ] Derive target halt and per-target budget.
- [ ] Derive run halt and overall budget.
- [ ] Derive controlled unresolved end and resume.
- [ ] Derive projection-failure and re-derivation status.
- [ ] Derive all three conditional Immediate Halt End audit rows and reject disposition/evidence mismatch.
- [ ] Report pending tracked owner receipt without resolved authority.
- [ ] Classify v1 learning events as legacy audit-only.
- [ ] Include complete failed-set identity.
- [ ] Require atomic or composite lane receipts for resolved dispositions.
- [ ] Reject caller-authored governance or incident rows.
- [ ] Reject false resolved rows lacking projection, trusted envelopes, Inspection, proof, or receipt.

## Incident Identity Derivation

- [ ] Compute `intentIdentity` before any incident event or batch.
- [ ] Require Incident Supersession Event to reference `intentIdentity` and forbid `previewIdentity`.
- [ ] Require no incident event, event hash, or batch identity to depend on `previewIdentity`.
- [ ] Require exact intent occurrence identities and Repeat Relationship to use strict chronology.
- [ ] Require incomplete intent to contain no occurrence identity or Repeat Relationship.
- [ ] Require preview identity to bind intent, exact event bodies and commitments, batches, mutation core, prestate, accepted evidence, and rollback.
- [ ] Require final incident mutation to bind both intent and preview identities.
- [ ] Change any earlier DAG node and require every dependent identity to change.
- [ ] Reject a preview value that references its own `previewIdentity`.

## Incident Supersession Branches

- [ ] Require current `acceptedFeatureEvidenceIdentity` in `mode:"core-close"`.
- [ ] Generate a fresh exact branch intent and preview from exact prestates.
- [ ] Generate a fresh evidence-incomplete intent and preview.
- [ ] Recompute prestate, rollback, intent, event, batch, preview, and mutation identities.
- [ ] Exercise exact basis plus two distinct valid finding occurrence events.
- [ ] Exercise missing, partial, duplicated, same-attempt, replayed, stale, and conflicting evidence.
- [ ] Require `IncidentSupersessionEventV1` in both branches.
- [ ] Assert the event contains neither Repeat Relationship nor `previewIdentity`.
- [ ] Require exact branch `incident-evidence`, governance-required, and supersession batches.
- [ ] Require exact branch mutation-line order: two finding lines, governance line, supersession line.
- [ ] Require incomplete branch to contain only the supersession batch and supersession event line.
- [ ] Prove incomplete branch has no occurrence identity, occurrence batch, Repeat Relationship, or Governance Event.
- [ ] Reject exact branch missing either finding occurrence or the required Governance Event.
- [ ] Prove exact branch changes only T001 from `[!]` to `[~]`, removes the exact obsolete blocker, and preserves unresolved learning.
- [ ] Prove incomplete branch preserves `[!]` and uses the exact replacement blocker text.
- [ ] Prove neither branch validates or rewrites the original unauthorized block.
- [ ] Prove neither branch performs technical-docs implementation or dispatches an attempt.
- [ ] Require the exact owner-log line derived from operation time, intent, branch, and target.
- [ ] Change each prestate after preview and require refusal.
- [ ] Inject failure at every current-run and atomic lane boundary; require unresolved one-sided evidence or complete rollback, never false success.

## Accepted Feature Evidence

- [ ] Recompute `acceptedFeatureEvidenceIdentity` over the complete record excluding only that identity field.
- [ ] Require Feature 009 incident correction to use `mode:"core-close"`.
- [ ] Bind immutable definition contract, terminal task, baseline line, accepted line, `HEAD`, declared, source, changed, verification set, final review envelope, and review digest.
- [ ] Require the accepted line to be the latest line matching all bound identities.
- [ ] Require final review evidence to remain available or be freshly reacquired.
- [ ] Reject standard-mode, stale, incomplete, superseded, or drifted evidence.

## Feature 008 Core Close

- [ ] Assert T009 is the sole open non-`[P]` `[Shared]` terminal task.
- [ ] Assert T009's `declared-src:` clause contains the complete sorted ten-path declaration.
- [ ] Assert no directory, glob, duplicate, omitted, or extra source entry.
- [ ] Assert T009 directly depends on T001 through T008.
- [ ] Assert every source-contributing task is a direct dependency.
- [ ] Derive and freeze the immutable definition-contract identity.
- [ ] Require clean `src/**`, clean generated core, no ignored entries, immutable `HEAD`, and clean parity before baseline.
- [ ] Append the exact baseline line and immediately recheck.
- [ ] Serialize source work through T009.
- [ ] Require every changed source path to be declared.
- [ ] Make T008 perform no product write.
- [ ] Forbid repository `build-dev` before T008 source acceptance.
- [ ] Require fresh Tester evidence and independent T008 source acceptance.
- [ ] Require unchanged T008 identities at T009 start.
- [ ] Snapshot protected boundaries before materialization.
- [ ] Run repository `build-dev` only in T009.
- [ ] Prove exact generated parity and protected preservation.
- [ ] Require full validation and final independent review.
- [ ] Append the exact accepted line only after approval.
- [ ] Immediately recompute every bound identity.
- [ ] Derive `acceptedFeatureEvidenceIdentity`.
- [ ] Reject stale, mismatched, or non-latest accepted evidence.
- [ ] Perform only the supported Feature 007 supersession after current accepted evidence exists.

## Definition Stage Singularity

- [ ] Stage exactly one Feature 009 `tasks.md` path and byte stream.
- [ ] Use the second complete corrected task block plus only the authorized T005, T006, and T009 wording deltas.
- [ ] Reject a duplicate `# Tasks: Autonomous Learning Governance` heading.
- [ ] Reject a concatenated body, truncated precursor, or text outside the selected complete body.
- [ ] Reject task-key, dependency, phase, terminal identity, and source-declaration drift.

## Guarded And Non-Work Regression

- [ ] Compare accepted guarded public outputs byte-for-byte.
- [ ] Preserve existing v1 RunState shape when optional fields are absent.
- [ ] Preserve generic reviewer escalation outside autonomous Work.
- [ ] Preserve manual Lightweight and tracked mutation behavior.
- [ ] Preserve v1 learning and audit readability.
- [ ] Prove guarded flow never acquires autonomous governance or requires a Work permit.

## Mutation Tests

- [ ] Restore direct repeat-to-no-progress and require public-path failure.
- [ ] Restore autonomous generic second-finding escalation and require failure.
- [ ] Count repetition before occurrence retention and require failure.
- [ ] Accept one-sided occurrence retention and require failure.
- [ ] Accept caller finding bodies or check states and require failure.
- [ ] Conflate basis and occurrence identity and require failure.
- [ ] Remove `attemptApproachBasisIdentity` and require failed-set failure.
- [ ] Disable approach-only trigger and require failure.
- [ ] Accept free-form equivalence and require failure.
- [ ] Drop exact projection batch bodies and require reachability failure.
- [ ] Accept body/hash mismatch and require failure.
- [ ] Type a projection line as `ShortText` and require boundary failure.
- [ ] Accept CRLF or `CJ({event})` and require failure.
- [ ] Compare an alternative against only one failed basis and require failure.
- [ ] Reuse one permit across `authorize` and lane claim and require failure.
- [ ] Mutate RunState during attempt-permit issuance and require stale-permit failure.
- [ ] Hash only an abstract mutation classification and require failure.
- [ ] Skip required atomic or composite lane receipt and require failure.
- [ ] Drop wrapper expected-byte validation and require failure.
- [ ] Clear governance before final receipt and require failure.
- [ ] Treat tracked lane-only receipt as composite success and require failure.
- [ ] Index projection union instead of intersection and require failure.
- [ ] Freeze the whole run for target-scoped governance and require scheduling failure.
- [ ] Downgrade a run-wide halt and require failure.
- [ ] Permit concurrent work and require failure.
- [ ] Infer v2 authority from v1 or prose and require failure.
- [ ] Make an incident event reference `previewIdentity` and require cycle rejection.
- [ ] Force an approach event into `incident-evidence` and require failure.
- [ ] Add repeat or governance to the incomplete incident branch and require failure.
- [ ] Use `acceptedGovernanceIdentity` instead of accepted feature evidence and require failure.
- [ ] Run `build-dev` before T008 acceptance and require failure.
- [ ] Let an execution task revise a Feature 009 definition artifact and require failure.

## Validation Gates

### Before Materialization

- [ ] Run `node --test src/skills/dude-work/recovery.test.mjs`.
- [ ] Run `node --test src/skills/dude-lightweight-execution/board.test.mjs`.
- [ ] Run `node --test library/packs/beads/skills/dude-pack-beads-workflow/beads.test.mjs`.
- [ ] Run `node --test scripts/current-format-contract.test.mjs`.
- [ ] Obtain fresh T008 Tester evidence.
- [ ] Obtain independent T008 source acceptance.
- [ ] Confirm repository `build-dev` has not run as materialization.

### T009 Terminal Materialization

- [ ] Run `node scripts/build-dev.mjs`.
- [ ] Run build-dev and build-release tests.
- [ ] Run the complete recursively discovered test suite.
- [ ] Run Dude lint with zero failures.
- [ ] Run compose verification.
- [ ] Build and lint a pristine external release.
- [ ] Confirm generated `.github` changes are exactly intended.
- [ ] Run `git diff --check`.
- [ ] Obtain fresh final independent review over unchanged identities.
- [ ] Append and immediately verify the accepted evidence line.
- [ ] Derive accepted Feature 009 evidence.
- [ ] Run fresh lint, audit, and independent review after Feature 007 supersession.
