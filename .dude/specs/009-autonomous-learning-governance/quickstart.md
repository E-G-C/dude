# Verification Quickstart: Autonomous Learning Governance

## Purpose

These are required verification flows, not execution results.

Exercise the public `runCommand` and process paths plus the production Lightweight or tracked wrappers. Helper-level tests may supplement these flows but cannot replace them.

Use isolated temporary workspaces with:

- exactly one defined owner resolved by exact `spec_path`;
- one canonical target and lane mapping;
- complete current-run and lane-history captures;
- trusted verification and independent-review sources;
- immutable Feature 009 definition inputs;
- `policy.parallel === 1`; and
- no active ObjectiveRegistry for Feature 009.

No implementation flow writes a Feature 009 definition artifact. A normative mismatch stops with `contract-mismatch: redefine-required`.

## Public Process Shape

```bash
node src/skills/dude-work/recovery.mjs inspect < request.json
node src/skills/dude-work/recovery.mjs authorize < request.json
node src/skills/dude-work/recovery.mjs complete < request.json
node src/skills/dude-work/recovery.mjs learn < request.json
node src/skills/dude-work/recovery.mjs transition < request.json
node src/skills/dude-work/recovery.mjs audit < request.json
```

These command tokens are internal runtime operations, not new top-level Dude commands.

## Flow 1: Immutable Definition Contract

1. Capture the exact bytes of `spec.md`, `plan.md`, and all six support artifacts.
2. Derive the immutable task contract from task keys, markers, descriptions, phases, dependencies, T009 source declaration, and terminal identity.
3. Form `DefinitionContractCommitmentV1` and recompute `definitionContractIdentity`.
4. Begin execution with that commitment.
5. Change one immutable artifact byte or immutable task-contract field and inspect again.

Assert:

- exactly eight artifact descriptors and one task contract are bound;
- only coordinator-owned runtime glyph and blocker metadata are excluded;
- the changed input produces `definition-contract-mismatch` or `redefine-required`;
- no implementation path repairs or rewrites the definition; and
- Feature 009 has no active ObjectiveRegistry.

## Flow 2: Ordinary Attempt Authorization

1. Run `inspect` with complete target, owner, lane, source, and mapping evidence.
2. Run `transition.issue-attempt-permit`.
3. Confirm the returned RunState is byte-identical to the request state.
4. Run `authorize` with that exact permit.
5. If `claimRequired` is true, submit the returned post-authorization lane permit and complete mutation to the real lane wrapper.
6. Reacquire lane poststate and run `transition.commit-lane-receipt` with the matching atomic or composite receipt.
7. Begin the attempt only after the required receipt commits.

Assert:

- the attempt permit binds the unchanged inspected RunState;
- `authorize` consumes it before changing state;
- an old attempt permit cannot authorize a lane claim;
- a required lane permit binds the post-authorization RunState and complete lane-specific mutation;
- wrong target, mapping, prestate, action, mutation byte, or evidence refuses; and
- at most one attempt executes.

## Flow 3: Trusted Completion Capture

1. Establish one pending autonomous attempt.
2. Make verification and independent-review results available through actual Inspection sources.
3. Call `complete.capture` with only target, attempt identity, result fields, verification envelope identity, review envelope identity, and the complete sorted finding identity set.
4. Receive one exact `occurrence-retention` `ProjectionBatchV1`.

Assert:

- runtime normalizes both envelopes only from matching `TrustedSourceCaptureV2` rows;
- no caller finding body, check state, verdict, chronology, or envelope body is accepted;
- target, attempt, result, source revision, Inspection evidence, verification, verdict, finding, and chronology bindings recompute;
- the batch starts with exactly one approach event;
- finding events follow sorted by occurrence identity;
- every finding occurrence binds `attemptApproachBasisIdentity`;
- RunState stores only `PendingCompletionRetentionV2` and the projection commitment; and
- the attempt remains pending and no occurrence or repeat is counted.

## Flow 4: Canonical Event-Line Boundary

Generate one valid event whose `CJ(event)` is exactly 16,384 UTF-8 bytes, then prepare its projection.

Assert:

- `EventLineText` is exactly 16,402 bytes;
- it begins with the exact 18-byte ASCII prefix `- dude-run-event: `;
- it contains no CR or LF;
- its serialized LF record is exactly 16,403 bytes;
- `laneEventLineHash` excludes LF and `laneEventRecordHash` includes LF;
- `ProjectionPlanV1` and both lane wrapper families carry the same exact line plus `terminator:"LF"`;
- `ShortText`, CR, CRLF, trailing whitespace, `CJ({event})`, missing LF contract, and a 16,385-byte event are rejected for autonomous v2 authority; and
- existing wrapped v1 history remains legacy-audit-only.

## Flow 5: Occurrence Projection And Finalize

1. Pass the exact occurrence batch to `transition.prepare-projection`.
2. For each plan item, append its exact current-run record.
3. Apply its complete `LightweightProjectionMutationV1` or `TrackedProjectionMutationV1` through the real `work-project` wrapper.
4. Reacquire both surfaces.
5. Call `transition.verify-projection` with the same exact batch.
6. Call `complete.finalize` with that exact batch.

Assert:

- event bodies, hashes, order, commitments, batch identity, line bytes, mutation identity, and permits match;
- every event exists exactly once and byte-equivalently on both surfaces;
- one-sided, stale, duplicate, malformed, noncanonical, wrong-target, or conflicting retention leaves completion pending;
- only successful finalize clears the pending attempt and counts occurrences;
- losing event bodies never permits reconstruction from hashes alone; and
- deterministic reproduction succeeds only from unchanged complete authoritative evidence and yields identical bytes and identity.

## Flow 6: First, Distinct, And Replayed Findings

1. Finalize one rejected attempt with one valid finding occurrence.
2. Finalize a later attempt whose wording resembles the first but whose stable basis differs.
3. Finalize a pair with different wording but equal stable bases.
4. Replay one exact event and separately inject different bytes at an occupied chronology position.

Assert:

- the first occurrence creates no repeat;
- the distinct basis creates no repeat;
- equal bases across distinct retained attempts establish repetition despite wording differences;
- a byte-identical replay counts once;
- a chronology conflict stops classification; and
- two reviews of one attempt never establish repetition.

## Flow 7: Repeated Finding And Repeated Approach

### Finding Channel

1. Dual-retain two independently reviewed finding occurrences with equal bases, distinct attempts and occurrence identities, and strict chronology.
2. Finalize the second completion batch.

Assert that runtime selects the earliest qualifying pair, returns `learning-required`, creates one target-bound `required` governance case, and returns one exact `governance-required` batch.

### Approach Channel

1. Dual-retain two completed attempts with equal normalized Approach Bases and distinct attempts, results, and chronology.
2. Provide no repeated reviewer finding.
3. Finalize the second completion batch.

Assert that an approach-channel Repeat Relationship creates the same `required` governance without inventing a finding, and audit reports channel `approach`.

For both channels, ordinary affected-target retry, generic escalation, direct no-progress, block, close, or resolving status transition remains refused.

## Flow 8: Required Governance Projection

1. Take the exact governance-required batch returned by `complete.finalize`.
2. Run `transition.prepare-projection`.
3. Append its current-run record and apply its exact lane projection mutation.
4. Run `transition.verify-projection` after fresh acquisition.

Assert:

- state commitment and exact body agree;
- both surfaces contain the same event and canonical event line;
- projection failure does not clear or resolve governance; and
- an immediate halt after dual-retained occurrences but before governance projection remains deterministically re-derivable.

## Flow 9: Learning Review And Exact Projection Batch

1. Start from valid `required` governance.
2. Run `learn` with complete fresh evidence, bounded learning findings, and `AlternativeV2` rows.
3. Receive one `LearningReviewEventV2`, one `GovernanceEventV1`, one exact `learning-result` batch, and successor state carrying only the batch commitment.
4. Pass that same batch through projection preparation and verification.

Assert:

- event order is learning review then governance;
- exact bodies remain reachable outside RunState;
- every alternative binds the current failed-set identity;
- body/hash mismatch, missing body, order change, or changed source evidence refuses; and
- verified projection advances governance to `projected`.

## Flow 10: Complete Failed-Approach Set

1. Establish a finding-triggered repeat whose qualifying findings came from different failed approach bases.
2. Inspect the derived `FailedApproachSetV1`.
3. Submit alternatives through `learn`.
4. Reject one selected alternative and retain its completion evidence.

Assert:

- all unique failed approach bases through the trigger cutoff are present;
- every basis has supporting occurrence event evidence;
- each credible-material alternative has exactly one evidence-backed material-difference row for every failed basis;
- each rejected alternative has exactly one evidence-backed `same` or `different` comparison for every failed basis and carries its disposition and reason;
- every not-materially-different alternative has at least one `same` comparison;
- no finding hash is compared with an approach hash;
- a candidate differing from only one failed basis is rejected;
- the rejected selected alternative extends, never shrinks, the failed set;
- stale alternatives and no-progress proof fail after set expansion; and
- the seventeenth basis fails closed without authorizing no-progress.

## Flow 11: Selected Alternative, No Lane Claim

1. Select exactly one credible material `AlternativeV2`.
2. Project and verify the learning-result batch.
3. Run `transition.bind-post-learning-inspection`.
4. Run pure `transition.issue-attempt-permit` and confirm unchanged state.
5. Run `authorize` with the exact permit and arrange an authoritative same-owner claim so `claimRequired:false`.
6. Execute only the bound attempt.
7. Run `complete.capture`, project the exact occurrence batch, and run `complete.finalize`.
8. Require fresh verification and independent acceptance.
9. Issue the complete `task-completed` lane mutation and permit.
10. Apply it and commit the final receipt.

Assert the order:

```text
projected
post-learning Inspection
attempt permit
authorize
attempt
complete.capture
occurrence retention
complete.finalize
alternative-verified
task-completed mutation and permit
terminal receipt
```

Governance remains active until the terminal receipt commits.

## Flow 12: Selected Alternative, Required Lane Claim

Repeat Flow 11 with `claimRequired:true`.

Assert the order:

```text
projected
post-learning Inspection
attempt permit
authorize
post-authorization lane mutation and permit
atomic or composite claim receipt
attempt
complete.capture
occurrence retention
complete.finalize
alternative-verified
task-completed mutation and permit
terminal receipt
```

Also assert:

- the attempt permit cannot authorize the claim;
- the claim mutation hashes its complete lane-specific object;
- execution cannot begin in `alternative-authorized-pending-lane`;
- a pending tracked owner-log receipt cannot advance governance; and
- stale Inspection, permit, mutation, or receipt refuses.

## Flow 13: Rejected Selected Alternative

1. Execute an authorized selected alternative.
2. Retain its approach event and rejected review findings.
3. Finalize the completion.

Assert:

- its approach basis is added to the complete failed set;
- governance revision increases and returns to `required`;
- prior alternative and no-progress identities become stale;
- no failed basis is removed; and
- capacity exhaustion remains unresolved rather than becoming no-progress.

## Flow 14: No-Progress

1. Start from `required` with the complete current failed set.
2. Represent the complete bounded considered set as rejected alternatives with complete comparison rows, dispositions, and reasons.
3. Hash the exact complete sorted union, including every rejected row, as `alternativeSetHash`.
4. Require the credible-material identity array to be exactly empty.
5. Project and verify the learning-result batch.
6. Acquire a fresh post-projection Inspection.
7. Run `transition.verify-no-progress`.
8. Form the complete lane-specific `task-blocked` mutation with reason `no-progress`.
9. Issue its permit, apply it through the real wrapper, and commit its atomic or composite receipt.

Assert:

- repeat detection alone cannot enter this branch;
- caller prose cannot prove no alternatives;
- failed-set, alternative-set, assumptions, expected projection additions, and no-new-evidence identities recompute;
- new distinguishing evidence or a changed failed set returns governance to `required`;
- no-progress occurs only after `no-progress-verified`; and
- governance remains active after mutation, pending-receipt, or receipt-verification failure.

## Flow 15: Projection Faults And Reproduction

For `occurrence-retention`, `incident-evidence`, `governance-required`, `learning-result`, `governance-snapshot`, and `incident-supersession`, inject:

- current-run append failure;
- lane append failure;
- current-run-only presence;
- lane-only presence;
- exact existing copy;
- duplicate copy;
- same event hash with different bytes;
- wrong target;
- malformed event or line;
- changed batch order;
- event body/hash mismatch; and
- changed authoritative evidence after batch loss.

Assert that partial projection never advances state, exact copies are idempotent, retry appends only an absent exact side, conflicts fail closed, unchanged-evidence reproduction is byte-identical, and changed-evidence reproduction is forbidden.

## Flow 16: Fresh And Stale Post-Learning Inspection

Exercise an Inspection that predates learning, predates verified projection, follows verified projection, names another alternative or check, binds another failed set, includes only expected projection additions, contains substantive evidence drift, or becomes stale before permit issuance.

Assert:

- only the fresh matching Inspection binds;
- expected projection additions are nonsemantic;
- nonsemantic staleness returns to `projected`;
- trigger, failed-set, assumption, approach-history, or distinguishing-evidence drift returns to `required`; and
- owner, lane, or mapping ambiguity stops the invocation.

## Flow 17: Exact Lightweight Mutations

For every `LightweightProjectionMutationV1`, `LightweightStateMutationV1`, and `LightweightIncidentSupersessionMutationV1` variant:

1. supply the closed `work-project` or `work-set` envelope;
2. independently alter each from/to glyph, blocker byte, event-line byte, LF declaration, owner-log line, expected complete owner hash, incident identity, reason, and snapshot timestamp;
3. exercise every allowed Lightweight transition-matrix row and at least one adjacent unlisted transition; and
4. inject failure before and after each staged path application and postimage acquisition.

Assert:

- `mutationIdentity = SHA256(CJ(the complete exact mutation))`;
- reject any standalone request `event` field as unknown and derive events only from `mutation.eventLines`;
- require `owner.ownerCapture` to be the sole owner preimage and reject duplicate owner fields in `expected`;
- every altered field fails permit validation before mutation;
- exact event and owner lines parse and bind their events and complete owner prestate;
- `tasks.md`, task-state, and owner bytes apply all-or-restored;
- owner bytes are protected unchanged when `ownerLog.kind:"none"`;
- no receipt exists before all three postimages are freshly reacquired; and
- incomplete rollback returns an indeterminate run-wide hard stop.

## Flow 18: Exact Tracked Mutations And Composite Receipts

For tracked `work-project` and `work-transition`:

1. use complete fresh list, detail, history, and owner captures;
2. require one unique issue-to-task mapping;
3. bind the exact complete tracked mutation;
4. inject failure before lane commit, after lane commit but before owner append, and after owner append but before composite receipt; and
5. retry only the authorized reconciliation step.
6. Require the dispatch-pending response to contain operation evidence plus the bounded recovery payload with exact original captures, normalized dispatch result, and exact mutation.
7. Call `work-prove-poststate` with that exact evidence and payload plus fresh list/detail/history captures. Assert deterministic full-postimage derivation, no redispatch, and rejection of any unrelated drift.
7. Assert it performs no Beads dispatch and returns either the exact lane receipt plus owner-stage recovery identity or `indeterminate`.
9. Call `work-reconcile-owner` with the same evidence and payload, lane receipt, and fresh list/detail/history and owner captures. Assert independent lane revalidation before owner append and before composite receipt.
9. Assert it performs no Beads dispatch, compare-and-appends once or recognizes the exact postimage, and returns the owner receipt plus composite receipt.
10. Replay both recovery requests and require byte-identical receipts with no repeated lane or owner mutation.

Assert:

- no subprocess command or arguments come from the request;
- every altered mutation field fails before lane mutation;
- refusal leaves tracked state and owner bytes unchanged;
- only `TrackedCompositeReceiptV1` is tracked success;
- ambiguous lane or owner outcome is an indeterminate run-wide halt.

## Flow 19: Controlled Unresolved End And Resume

### Dual-Projected Controlled End

1. For a selected alternative, dual-project learning, bind fresh post-learning Inspection, reach `alternative-inspected`, and run `transition.controlled-end` before attempt-permit issuance.
2. For no-progress, dual-project learning, acquire fresh post-projection Inspection, prove no new distinguishing evidence, reach `no-progress-verified`, and run controlled end before lane no-progress disposition.
3. Project the governance snapshot and commit the exact no-op lane mutation in each branch.
4. Assert the governance branch is audited resolved, the lane disposition remains pending, and target state and blocker bytes remain unchanged.
5. Reject controlled end from `projected` and every noneligible phase.

### Immediate Halt End

1. Through public `runCommand` and process paths, halt after fresh dual verification of a Governance Event and require three equal `verified` dispositions plus its `ProjectionRefV1` and bound revision.
2. Through the same paths, halt before projection with the exact occurrence pair dual-retained and require three equal `rederive-required` dispositions plus its proof identity and retained event hashes.
3. Make governance evidence unrecoverable and require three equal `unavailable` dispositions, the matching unrecoverable evidence identity, and a run-wide hard stop.
4. Reject mismatched dispositions and missing, extra, stale, one-sided, wrong-revision, wrong-occurrence, or wrong-branch evidence.
5. In every branch, create no controlled-end transition, permit, mutation, record, or receipt.
6. Audit the matching conditional row; resume only from verified or re-derivable authoritative history before any normal target transition.

## Flow 20: Halt Scope And Sequential Scheduling

1. Establish unresolved governance on target A.
2. Exercise target-scoped dependency, input, hard-stop, learning-evidence, and per-target-budget cases.
3. Present target B with fresh readiness, no prohibited dependency, and a disjoint assessed change set.
4. Invoke Feature 005 scheduling and authorize B separately.
5. Repeat with security, safety, authority, credential, destructive confirmation, spending, external authorization, owner or lane ambiguity, unrecoverable governance evidence, and overall-budget exhaustion.

Assert:

- target-scoped cases leave A unchanged and may permit only independently proven sequential B;
- A's governance never selects or authorizes B;
- overlap, dependency, stale evidence, same target, or concurrent start refuses;
- run-wide cases start no other target;
- no halt clears learning or authorizes no-progress; and
- missing or conflicting scope is run-wide ambiguity.

## Flow 21: Objective Independence And Conditional Audit

Exercise no registry, a registry with no target match, an ambiguous match, and one valid unique match. Then run `audit` for resolved alternative, resolved no-progress, unresolved suspension, target halt, per-target budget, run halt, overall budget, controlled unresolved end, projection failure, Immediate Halt End after verified projection, before projection with re-derivation, and with unavailable evidence, pending tracked receipt, and historical v1 learning.

Assert:

- governance ordering is identical in every objective case;
- no objective or sequence is created;
- `sequenceIdentity` is omitted without one valid unique match;
- objective evidence overrides no governance authority;
- audit uses the byte-equivalent intersection, never union;
- resolved rows require complete trusted branch evidence and receipts; and
- unresolved rows make no false block, close, no-progress, success, or completed claim.

## Flow 22: Feature 008 Baseline And T008 Source Acceptance

### Baseline Before T001

1. Resolve live terminal T009 and its exact declaration.
2. Require immutable `HEAD`, clean `src/**`, clean base-owned generated core, no ignored entries in either boundary, and clean parity.
3. Bind the immutable Feature 009 definition contract.
4. Append the exact baseline line to the unique owner log.
5. Immediately repeat the same preflight.
6. Begin source mutation only after the recheck succeeds.

Assert T009 is the sole open non-`[P]` `[Shared]` terminal, declares the complete sorted ten-path source set, and directly depends on T001 through T008.

### T008 Source Acceptance

1. Freeze the complete declared source revision.
2. Require every changed `src/**` path to be declared.
3. Run focused and mutation suites over that revision.
4. Obtain fresh Tester evidence and independent source acceptance.
5. Make no product write and do not run repository `build-dev`.

Any correction returns to T001-T007 and requires a fresh T008 acceptance.

## Flow 23: T009 Terminal Materialization And Accepted Evidence

1. Require unchanged T008 source acceptance and identities.
2. Recheck baseline, `HEAD`, declaration, source, changed rows, generated prestate, and protected boundaries.
3. Snapshot installed packs, project skill, workflows, and `.dude/**`.
4. Run repository `node scripts/build-dev.mjs` only now.
5. Prove exact source/generated parity and protected preservation.
6. Run complete repository, lint, compose, release, parity, and diff gates.
7. Obtain fresh final independent review over the exact materialized revision.
8. Append the accepted evidence line.
9. Immediately recompute every bound identity.
10. Derive `acceptedFeatureEvidenceIdentity` using `mode:"core-close"`.
11. Continue only while the latest matching evidence remains current.

Assert that no other task materializes generated core and `build-dev` is rejected before T008 acceptance.

## Flow 24: Acyclic Feature 007 Exact-Evidence Correction

Do not perform technical-docs implementation.

1. Require current accepted Feature 009 core-close evidence.
2. Capture exact Feature 007 owner, tasks, task-state, blocker text, review, verification, Inspection, lane history, and rollback bytes.
3. Form `ExactIncidentCorrectionIntentV1` and compute `intentIdentity`.
4. Derive exactly two historical Finding Occurrence Events referencing the intent's evidence, one required Governance Event, and one Incident Supersession Event referencing `intentIdentity`.
5. Form the dedicated two-finding `incident-evidence` batch in strict chronology, the one-event governance batch, and the one-event supersession batch.
6. Form `ExactIncidentCorrectionPreviewV1` with its mutation core and compute `previewIdentity`.
7. Form the final Lightweight incident mutation by adding `previewIdentity` and compute its whole-object identity.
8. Append all branch events to current-run evidence in batch order.
9. Reacquire all prestates.
10. Issue the exact permit and atomically apply lane event records, `[!]` to `[~]`, blocker removal, snapshot update, and owner-log append through `work-set`.
11. Freshly verify the atomic receipt and projections.

Assert:

- the identity graph is intent -> events -> batches -> preview -> mutation -> permit -> receipt;
- no event, event hash, or batch references `previewIdentity`;
- `incident-evidence` accepts exactly two chronologically ordered finding events without an approach event;
- normal completion `occurrence-retention` still requires an approach event first;
- the supersession event contains no Repeat Relationship;
- only the obsolete blocker is removed;
- unresolved learning remains and no attempt is dispatched; and
- any failure leaves one-sided current-run evidence unresolved until exact retry and leaves the lane transaction all-or-restored.

## Flow 25: Acyclic Feature 007 Evidence-Incomplete Correction

1. Require current accepted Feature 009 core-close evidence.
2. Remove, conflict, or make stale one field required for exact occurrence evidence.
3. Form `IncompleteIncidentCorrectionIntentV1` with no occurrence identity or repeat.
4. Derive only its intent-bound Incident Supersession Event and one `incident-supersession` batch.
5. Form the incomplete preview and then the final whole-object mutation.
6. Append only the supersession event to current-run evidence.
7. Reacquire every prestate, issue the permit, and atomically apply only the supersession lane line, `[!]` to `[!]` blocker replacement, snapshot update, and owner-log line.

Assert:

- there is no `incident-evidence` batch, occurrence identity, Repeat Relationship, or Governance Event;
- the supersession event contains no `previewIdentity`;
- T001 remains `[!]`;
- the blocker becomes exactly `contract-mismatch: evidence-incomplete autonomous review occurrence evidence unavailable`;
- the original unauthorized block is superseded but not validated or rewritten;
- no Feature 007 attempt or technical-docs implementation starts; and
- prestate drift or partial atomic application refuses or hard-stops without a false success receipt.

## Flow 26: Definition Stage Singularity

Stage the complete corrected Feature 009 package and inspect the staged paths and bodies.

Assert:

- exactly one `tasks.md` path and one complete body exist;
- the body is the second complete corrected task block with only the authorized T005, T006, and T009 wording deltas;
- there is exactly one `# Tasks: Autonomous Learning Governance` heading;
- no truncated precursor or concatenated candidate exists; and
- task keys, dependencies, phases, T009 identity, and its exact ten-path declaration have not drifted.

## Validation Sequence

### T001 Through T007 Focused Gates

```bash
node --test src/skills/dude-work/recovery.test.mjs
node --test src/skills/dude-lightweight-execution/board.test.mjs
node --test library/packs/beads/skills/dude-pack-beads-workflow/beads.test.mjs
node --test scripts/current-format-contract.test.mjs
```

Do not use repository `build-dev` as source materialization here.

### T008 Source Acceptance

Repeat focused and mutation suites over the frozen source revision. Obtain fresh Tester evidence and independent source acceptance. Make no product write and do not run repository `build-dev`.

### T009 Materialization And Acceptance

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

Acceptance additionally requires fresh final independent review over the same unmodified identities. Feature 007 correction then requires fresh lint, audit, and independent correction review.
