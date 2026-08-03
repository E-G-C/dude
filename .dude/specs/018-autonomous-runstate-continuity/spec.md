# Feature Specification: Autonomous RunState Continuity

## Purpose

Explicit autonomous Work can currently lose the exact authority state it needs to continue when the host chooses an incompatible runtime route, mishandles a closed refusal, receives malformed tool output, or terminates the process holding the only copy of accepted state. Stopping after that loss is safe, but allowing an ordinary orchestration defect to create the loss defeats the user's explicit recovery choice and can prevent valid review and learning governance from running.

This feature gives Work one deterministic high-level host boundary that preserves the last accepted RunState until a validated successor and its authoritative effects are established. The active coordinator turn survives as the invocation supervisor, retains an independently created invocation identity, and serializes replaceable adapter workers under one exclusive workspace-target ownership claim. V1 process recovery covers persistent-shell or replaceable adapter-worker death only while that active supervisor and its independently retained invocation identity survive. Loss of the coordinator supervisor, coordinator context, or independently retained invocation identity remains deferred and is a hard stop.

A qualifying unchanged-state refusal or proven no-effect host incident is explicitly nonterminal. It returns typed continuation data, preserves accepted authority, invokes no termination path, and proceeds to the one permitted correction or fresh Inspection unless a distinct existing hard stop applies. The feature prevents avoidable state destruction; it never reconstructs authority, silently retries a genuine task failure, weakens an existing stop, grants a task retry budget, or creates a durable resume product.

One named exception permits exactly one ordinary accepted autonomous Lightweight completion to cross the lane boundary. It applies only after finalized dual-retained trusted completion, exact fresh authority, no conflicting pending, governance, projection, or evaluation state, one final accepted occurrence matching one final completion tuple with no repeat, and a permit-bound lane-owner mutation whose receipt and final poststate are freshly verified before settlement. Any absent, stale, duplicated, repeated, replayed, drifted, or mismatched predicate, binding, receipt, or poststate refuses without mutation or settlement.

## User Stories & Testing

### User Story 1 - Preserve accepted state through closed host incidents (Priority: P1)

As a user of autonomous Work, I want a closed refusal or pre-acceptance host failure to leave the last accepted state intact so that an orchestration defect does not consume work authority or end the invocation unnecessarily.

**Independent Test**: Reproduce the exact `action-mismatch` refusal followed by the host attempting to exit, plus malformed requests rejected before mutation, stale evidence or permit, malformed or empty host output, and nonzero host results with proven no authoritative side effect. Confirm typed nonterminal continuation data is returned, accepted state remains byte-identical, accepted-state revision and attempt and recovery counters remain unchanged, termination is never invoked, and Work proceeds deterministically to the one permitted correction or fresh Inspection unless a separate hard stop applies.

**Acceptance Scenarios**:

1. **Given** the motivating wrong completion route, **When** the runtime returns `action-mismatch` with exact unchanged state and the host next attempts to exit, **Then** the adapter returns typed nonterminal continuation data, invokes no exit or termination operation, preserves Work and the shared shell and worker, and continues to deterministic correction or fresh Inspection.
2. **Given** one validated accepted state, **When** any qualifying closed refusal returns that exact state with no authoritative side effect, **Then** Work retains the state bytes and integrity identity, accepted-state revision, and attempt and recovery counters, while host metadata may advance without ending the invocation.
3. **Given** malformed, empty, or nonzero host output before any successor is accepted and fresh authority proves no side effect, **When** the host classifies the incident, **Then** it preserves accepted state, returns a nonterminal host-contract outcome, and proceeds to correction or fresh Inspection rather than treating the outcome as task evidence.
4. **Given** one qualifying incident identity, **When** continuation is selected, **Then** Work performs at most one immediate deterministic correction and otherwise performs fresh Inspection and reclassification; the unchanged-state refusal itself cannot end the invocation.
5. **Given** a genuine authorized implementation, test, or review failure, **When** it is admitted, **Then** Work applies the existing recovery and learning rules and never silently retries it through the host-incident path.
6. **Given** a malformed successor or a successor whose authoritative effects are not established, **When** state replacement is considered, **Then** the predecessor remains the accepted state.

### User Story 2 - Route trusted outcomes to their existing governance (Priority: P1)

As a user, I want genuine review rejection and task failure to reach the established recovery and learning rules rather than an incompatible completion route, so that real evidence and budgets retain their intended meaning.

**Independent Test**: Submit a trusted independent-review rejection and an ordinary accepted autonomous Lightweight completion for authorized attempts. Confirm the high-level boundary composes trusted completion, governance, authoritative projection preparation, lane-effect authorization, lane-owner application, lane-receipt settlement, and read-only audit from semantic evidence, retains the real evidence and chronology, and never asks ordinary orchestration to select a low-level route.

**Acceptance Scenarios**:

1. **Given** a trusted review rejection for an authorized autonomous attempt, **When** completion is recorded, **Then** the rejection reaches the existing trusted completion, recovery, and learning-governance flow.
2. **Given** a genuine authorized implementation, test, or review failure, **When** it is admitted, **Then** current attempt and recovery budgets apply exactly as before.
3. **Given** an adapter or tool-contract failure, **When** evidence is retained, **Then** it is not recorded as an implementation approach, verification result, or reviewer finding.
4. **Given** every predicate of the one ordinary accepted autonomous Lightweight completion exception, **When** completion is settled, **Then** the adapter obtains one bound permit, the lane owner applies one exact mutation, the matching receipt and final poststate are freshly verified, and settlement occurs once.
5. **Given** any bridge predicate, permit binding, lane prestate, mutation, receipt, or final poststate is absent, stale, duplicated, repeated, replayed, drifted, or mismatched, **When** completion is evaluated, **Then** the bridge refuses without lane mutation, settlement, replay, or fallback authority.

### User Story 3 - Resume after same-invocation host process death (Priority: P1)

As a user of autonomous Work, I want the same invocation to resume after its persistent shell or replaceable adapter worker dies while the coordinator supervisor survives, provided exact authority can still be proven, so that child-process loss does not destroy recoverable progress.

**Independent Test**: Have the active coordinator turn create and retain a random invocation identity before launching a worker, terminate the persistent shell or replaceable adapter worker after a valid checkpoint, observe the exact worker exit, and hand off to one replacement with the independently retained identity, prior worker token and generation, and a fresh worker token and generation. Confirm recovery occurs only after fresh Inspection and exact authority comparison, while concurrent, stale, self-identified, supervisorless, contextless, or identityless recovery refuses.

**Acceptance Scenarios**:

1. **Given** an active coordinator supervisor, **When** it begins a Work invocation, **Then** it creates and retains a random invocation identity before launching any adapter worker and supplies that identity explicitly to the worker.
2. **Given** a checkpoint containing an invocation identity, **When** a caller presents only those checkpoint bytes as its identity, **Then** recovery refuses because the checkpoint cannot establish caller identity.
3. **Given** a valid checkpoint, a surviving supervisor, and the exact observed exit of the active worker, **When** the supervisor supplies the same invocation identity, the prior worker token and generation, and a fresh replacement token and generation, **Then** one replacement may recover the exact accepted state after fresh Inspection.
4. **Given** recovery succeeds, **When** Work continues, **Then** it resumes the deterministically selected route or action without inventing counters, permits, findings, or lane state.
5. **Given** the supervisor or its independently retained invocation identity is lost, **When** recovery is requested, **Then** Work hard-stops even if checkpoint bytes remain.
6. **Given** only a shell environment copy remains and no valid checkpoint exists, **When** resume is requested, **Then** Work stops rather than treating the environment as authority.

### User Story 4 - Refuse stale, corrupt, or conflicting recovery (Priority: P1)

As a user, I want recovery to fail closed when its checkpoint or authoritative context no longer matches so that continuity never becomes state reconstruction.

**Independent Test**: Exercise stale orphan, partial cleanup, reappearance, failed post-clean absence validation, corrupt, wrong-invocation, wrong-target, owner-drifted, lane-drifted, task-prestate-drifted, stale-worker, conflicting-revision, concurrent-worker, and unverifiable-side-effect checkpoints. Confirm every case refuses without reconstructing or replacing accepted state; stale-orphan refusal identifies the bounded ownership-claim/checkpoint pair or a safe canonical identifier and names manual cleanup as the next action; cleanup requires independent confirmation that no invocation remains; and a fresh claim requires proof that both artifacts are absent.

**Acceptance Scenarios**:

1. **Given** a stale orphan ownership claim or checkpoint, **When** claim or load is attempted, **Then** Work refuses lazily, identifies the bounded ownership-claim/checkpoint pair or a safe canonical identifier, states that manual cleanup is the next action, and permits cleanup only after the user or operator confirms no invocation remains.
2. **Given** an old orphan record, **When** its age is observed, **Then** age is diagnostic only and never authorizes cleanup, ownership takeover, or resume.
3. **Given** the user or operator has confirmed no invocation remains and manually removed the bounded pair, **When** a fresh exclusive claim is requested, **Then** post-clean validation proves both the ownership claim and checkpoint absent before the claim proceeds; partial removal, reappearance, or failed validation hard-stops.
4. **Given** a corrupt, conflicting, stale-worker, concurrent-worker, or incorrectly revised checkpoint operation, **When** recovery or update is requested, **Then** Work refuses and reconstructs no RunState.
5. **Given** fresh Inspection disagrees with any bound target, owner, lane, accepted state, authoritative prestate, invocation identity, worker generation, or revision fact, **When** recovery is evaluated, **Then** the mismatch is a hard refusal.
6. **Given** a host may have produced an authoritative side effect but no exact effect or receipt can be verified, **When** recovery is evaluated, **Then** Work stops as an irreducible hard stop.

### User Story 5 - Preserve every authority boundary outside the named exception (Priority: P1)

As a user, I want continuity to leave all current safety, ownership, budget, verification, review, and governance boundaries unchanged except for the one replay-sealed ordinary accepted autonomous Lightweight completion bridge, so that state survival never becomes broader autonomy.

**Independent Test**: Re-run the established hard-stop, budget, verification, review, owner, lane, permit, and governance suites through the high-level boundary and confirm their outcomes and authority are unchanged outside the exact bridge predicates and bindings defined by FR-028 through FR-030.

**Acceptance Scenarios**:

1. **Given** any current safety, security, destructive-action, credential, spending, external-authorization, owner, lane, intent, budget, verification, review, or governance stop, **When** the adapter evaluates it, **Then** the same stop remains authoritative.
2. **Given** no exact accepted state or valid checkpoint, **When** continuation is requested, **Then** Work stops.
3. **Given** a generic Work target, **When** continuity applies, **Then** behavior is independent of which feature exposed the incident.
4. **Given** an ordinary lane mutation outside the one named accepted-completion bridge, **When** authority is requested, **Then** every existing permit, close, lane-owner, and governance boundary remains unchanged and the request refuses.

### User Story 6 - Bound lifecycle, collisions, and recovery reporting (Priority: P2)

As a user, I want checkpoint ownership and cleanup to be predictable and automatic recovery to be visible without becoming another stop or audit surface.

**Independent Test**: Exercise successful task settlement, natural and controlled invocation ends, cancellation, safely recorded hard stop, cleanup failure, stale orphan state, same-target collision, exact worker handoff, supported-platform checkpoint differences, and successful automatic recovery. Confirm cleanup occurs only at an allowed lifecycle boundary, stale state never enables automatic takeover, collisions and observed storage failures refuse visibly, and one concise inline recovery notice appears while the existing final audit remains authoritative.

**Acceptance Scenarios**:

1. **Given** one active exclusive ownership claim for an exact workspace and canonical target, **When** another invocation or worker claims the same pair, **Then** the collision fails closed without merging state or creating a concurrent writer.
2. **Given** a closed refusal, eligible host incident, review rejection, or host crash, **When** cleanup is considered, **Then** the checkpoint remains available.
3. **Given** successful task settlement with its receipt, an ordinary natural or controlled end, explicit cancellation, or a safely recorded irreducible hard stop, **When** cleanup runs, **Then** the checkpoint and ownership claim are cleared and no earlier event clears them.
4. **Given** cleanup fails, **When** replacement work is requested, **Then** the failure remains visible and blocks replacement until explicitly resolved without automatic takeover.
5. **Given** automatic correction or host recovery is pending, **When** intermediate effects occur, **Then** its typed notice remains pending; only the first successful corrected or resumed outcome carries and atomically consumes it, the prompt renders it once, and every later outcome omits it.

## Edge Cases

- The runtime returns exact unchanged state for `action-mismatch`, and a wrapper attempts to exit immediately afterward.
- A closed refusal returns an equal-looking but byte-different state.
- A refusal is closed but an authoritative side effect occurred before it returned.
- Malformed or empty output follows a command whose side effects cannot be disproven.
- A nonzero tool result is known to have made no authoritative change, versus one with an indeterminate outcome.
- The first same-class correction fails or returns another qualifying refusal.
- A different incident class arises after the one allowed correction but before fresh Inspection.
- Host metadata changes after a refusal and attempts to reset the correction cap without a new fresh Inspection identity.
- Trusted verification passes while independent review rejects, and the rejection must enter learning governance.
- A persistent shell or adapter worker dies before an external call, during it, after a provisional successor, or after an authoritative receipt but before local acceptance while the supervisor survives.
- A worker disappears without an exact observed exit, or a replacement presents an incorrect prior token or generation.
- An old worker returns after handoff and attempts to write with its stale token or generation.
- The supervisor, coordinator context, or independently retained invocation identity is lost while checkpoint bytes remain.
- A caller copies invocation identity from the checkpoint instead of receiving it from the surviving supervisor.
- Fresh Inspection matches the RunState but disagrees with owner, lane, task prestate, worker generation, accepted-state revision, or host revision.
- A checkpoint is truncated, permission-inaccessible, or carries an invalid integrity value.
- A stale checkpoint exists after an otherwise successful cleanup boundary.
- Two invocations claim the same workspace and target, including two processes presenting the same invocation identity.
- Cleanup fails after task settlement and must not be falsely reported as complete.
- A stale orphan grows old but no user or operator has confirmed that all invocations ended.
- Manual cleanup removes only the ownership claim or only the checkpoint, leaving a partial bounded pair.
- A removed stale-orphan artifact changes or reappears before post-clean validation and a fresh exclusive claim.
- A supported host cannot establish a required checkpoint property or reports a checkpoint operation failure.
- A shell environment mirror is newer than, older than, or inconsistent with the checkpoint.
- An irreducible hard stop and a recoverable host incident arise together; the hard stop wins.
- Final trusted completion retention is missing, duplicated, stale, or not dual-retained.
- The claimed final accepted occurrence is not the single final occurrence, does not match the single final completion tuple, or carries repeat evidence.
- A lane permit is missing, stale, replayed, or bound to the wrong owner, target, accepted state, occurrence, completion tuple, lane prestate, or mutation.
- The lane owner observes prestate drift, applies a different or duplicate mutation, or returns a receipt that is missing, duplicated, stale, replayed, or mismatched.
- Fresh receipt validation or the final lane poststate disagrees before settlement.
- A recovery notice remains pending through projection, permit, mutation, or receipt work and is exposed only by the first successful corrected or resumed outcome.

## Functional Requirements

- **FR-001:** One deterministic high-level Work host adapter MUST be the sole ordinary coordinator integration point for completion, governance, authoritative projection preparation, lane-permit issuance, lane-owner application, lane-receipt commitment, and read-only run audit.
- **FR-002:** The adapter MUST select and compose the applicable completion, governance, projection, lane-effect, settlement, and audit flow from validated accepted state and typed authoritative inputs. Ordinary orchestration MUST NOT submit or select low-level route names, transition modes, legacy completion routes, trusted completion routes, learning routes, lane routes, or incident-correction routes.
- **FR-003:** The active coordinator turn MUST be the invocation supervisor. It MUST create and retain a random invocation identity before launching any adapter worker and MUST explicitly supply that identity to every initial or replacement worker.
- **FR-004:** A checkpoint MAY bind a supplied invocation identity but MUST NOT establish caller identity from its own bytes. Loss of the supervisor, coordinator context, or independently retained invocation identity MUST remain a hard stop outside v1.
- **FR-005:** The supervisor MUST serialize adapter workers so exactly one worker token and generation is active at a time. It MAY hand authority to one replacement only after observing the exact prior worker exit and supplying the same invocation identity, prior token and generation, and a fresh token and generation.
- **FR-006:** No timeout, process-identity guess, automatic ownership takeover, or concurrent worker MUST authorize handoff or checkpoint writes.
- **FR-007:** Every adapter operation MUST begin from one exact validated accepted state. That state MUST be replaced only after a different successor validates and every required authoritative effect or receipt is established.
- **FR-008:** A qualifying closed refusal or proven no-effect pre-acceptance host incident MUST return typed nonterminal continuation or correction data, preserve accepted authority, invoke no Work, shared-shell, or worker termination, and proceed to the one permitted correction or fresh Inspection unless a distinct existing hard stop applies.
- **FR-009:** A qualifying unchanged-state incident MUST preserve accepted RunState bytes and integrity identity, accepted-state revision, and attempt and recovery counters. Host metadata and host revision MAY advance without making the incident terminal.
- **FR-010:** Zero attempt and recovery charge MUST apply only when accepted state is byte-identical and no authoritative side effect occurred: an action or route mismatch, a malformed request rejected before mutation, evidence drift or stale permit requiring reacquisition, or malformed, empty, or nonzero host output before successor acceptance.
- **FR-011:** A qualifying incident MUST receive at most one immediate deterministic correction for the same accepted state and revision, semantic operation, incident class, fresh Inspection identity, host revision, and worker generation. If correction is not selected or has been consumed, continuation MUST perform fresh Inspection and reclassification. Metadata-only changes MUST NOT reset the cap.
- **FR-012:** Genuine authorized implementation, test, and review failures MUST continue to use current recovery and learning budgets and trusted evidence and MUST never be silently retried through the host-incident path. Adapter and tool-contract failures MUST NOT become implementation approaches, verification results, or reviewer findings.
- **FR-013:** A trusted review rejection MUST reach the established trusted completion and recovery or learning flow rather than an incompatible legacy action envelope.
- **FR-014:** The last accepted state MUST be retained in one bounded invocation-scoped session-local checkpoint outside project workflow state before any external or tool call that could otherwise strand it. A shell environment MAY mirror the state but MUST NOT be its sole authority.
- **FR-015:** A checkpoint MUST bind the independently supplied invocation identity, exact workspace and canonical target, exact owner and specification identity, lane, validated RunState bytes and integrity identity, authoritative task or lane prestate, active worker token and generation, accepted-state revision, and host revision.
- **FR-016:** Accepted-state revision MUST advance only when different validated RunState bytes become accepted. Host revision MUST advance for serialized host metadata changes, including in-flight operation, incident classification, correction consumption, worker handoff, and cleanup metadata. Revision checks MUST detect stale or incorrect writes but MUST NOT serve as writer synchronization.
- **FR-017:** V1 process recovery after persistent-shell or replaceable adapter-worker death MUST require a surviving active coordinator supervisor, its independently retained invocation identity, a valid exclusive ownership claim and checkpoint, exact prior-worker exit for handoff, fresh Inspection, and exact comparison of every bound authority fact. Supervisor, coordinator-context, or invocation-identity loss MUST remain a deferred hard stop.
- **FR-018:** Any stale orphan, corrupt, wrong-invocation, stale-worker, conflicting, concurrently written, or drifted checkpoint MUST refuse without reconstructing state from task glyphs, logs, history, counters, permits, or other partial evidence.
- **FR-019:** Missing accepted state or checkpoint, supervisor identity loss, owner or lane ambiguity, safety or security boundaries, destructive action, credentials, spending, external authorization, checkpoint corruption or conflict, unverifiable side effects, exhausted budgets, changed or ambiguous intent, and every current irreducible hard stop MUST remain hard stops.
- **FR-020:** V1 MUST use one exclusive ownership claim per exact workspace and canonical target. A collision MUST fail closed without state merge, cross-target scheduling, automatic takeover, or concurrency authority.
- **FR-021:** The checkpoint and ownership claim MUST survive a closed refusal, eligible host or tool incident, review rejection, and replaceable-worker crash. They MUST clear only after a successful task-settlement receipt, ordinary natural or controlled end, explicit cancellation, or an irreducible hard stop whose result or audit is safely recorded.
- **FR-022:** A stale orphan checkpoint or ownership claim MUST refuse lazily at claim or load. The refusal MUST identify the bounded ownership-claim/checkpoint pair or a safe canonical identifier, state that manual cleanup is the next action, and permit cleanup only after the user or operator confirms no invocation remains. Record age MAY be diagnostic but MUST NOT authorize takeover, cleanup, or resume.
- **FR-023:** Before a fresh exclusive claim after confirmed manual cleanup, post-clean validation MUST prove both the bounded ownership claim and checkpoint absent. Partial removal, a changed or reappeared artifact, cleanup failure, or failed absence validation MUST remain a visible hard stop that blocks replacement work. This feature MUST NOT invent an automatic cleanup process or user command.
- **FR-024:** On every supported platform, checkpoint operations MUST either establish the required bounded-record, containment, exclusive-ownership, and serialized-update properties or fail closed visibly. The feature MUST NOT promise identical platform-specific protection or synchronization guarantees.
- **FR-025:** A typed one-shot recovery notice MUST semantically contain `{ incidentClassification, statePreserved: true, resumedAction }` only on the first successful corrected or resumed outcome after an eligible incident. The notice MUST remain pending through intermediate effects, be atomically consumed with that outcome, be omitted from every later outcome, and be rendered exactly once by the prompt without creating a ledger entry, event, report, or second audit surface.
- **FR-026:** All current safety, budget, verification, independent-review, owner, lane, permit, close, and learning-governance boundaries MUST remain unchanged except for the single ordinary accepted autonomous Lightweight completion bridge defined by FR-028 through FR-030, and the behavior MUST apply to generic Work without feature-specific recovery logic.
- **FR-027:** The feature MUST NOT create project-local durable RunState, a second audit ledger, a workflow engine, a generic transaction system, an identity service, a process monitor, a daemon, an editor service, a scheduler, a distributed lock, a database, a migration, a multi-session merge mechanism, a cleanup command, or an automated cleanup workflow.
- **FR-028:** The ordinary accepted-completion bridge MUST be available only for autonomous Lightweight Work after finalized dual-retained trusted completion, exact fresh authority, no conflicting pending completion, governance, projection, evaluation, or lane-effect state, exactly one final accepted occurrence matching exactly one final completion tuple, and no repeat evidence. Every predicate MUST be revalidated together immediately before permit issuance.
- **FR-029:** The bridge permit MUST bind the exact accepted state, owner and specification identity, target task, lane, final accepted occurrence, final completion tuple, retained trusted completion, expected lane prestate, and one allowed lane mutation. The exact lane owner MUST apply that mutation once, and settlement MUST require fresh revalidation plus one committed receipt binding the permit, prestate, mutation, and final poststate. Any absent, stale, duplicated, replayed, drifted, or mismatched binding, mutation, receipt, or poststate MUST refuse without settlement.
- **FR-030:** The bridge MUST NOT create a generic ungoverned permit, expand into tracked execution, grant caller close or mutation authority, fabricate pending or completed governance, use an ordinary lane command-line mutation or direct file edit, or permit replay of a permit, mutation, receipt, occurrence, or completion tuple.

## Key Entities

- **Accepted RunState**: The single exact validated authority state from which the next host operation begins. It remains immutable until a validated successor and all required authoritative effects are established.
- **Work Host Adapter**: The sole high-level boundary that selects low-level runtime flows, preserves accepted state, validates successors, governs correction limits, updates checkpoints, and returns typed outcomes.
- **Invocation Supervisor**: The active coordinator turn that creates and independently retains invocation identity, launches and serializes adapter workers, observes exact worker exit, and authorizes explicit handoff while it survives.
- **Invocation Identity**: A random identity created and retained by the supervisor before worker launch. It correlates and binds same-invocation authority but cannot be established by checkpoint contents alone.
- **Adapter Worker**: A replaceable child of the invocation supervisor that performs adapter operations under one active token and generation.
- **Worker Generation**: The supervisor-issued token and monotonic generation that identify the sole currently authorized worker and make stale or concurrent worker writes rejectable.
- **Exclusive Ownership Claim**: The single workspace-target claim that serializes one invocation and its active worker; it is not an age-based lease or authority against a hostile same-user process.
- **Session Checkpoint**: A bounded invocation-local copy of accepted authority plus exact supervisor-supplied identity, worker, prestate, and revision bindings, used only for same-invocation continuity and never as project workflow history.
- **Stale Orphan Pair**: The bounded ownership claim and checkpoint identified by their safe canonical workspace-target identity after no surviving invocation can prove authority. Age is diagnostic only; confirmed manual removal must target only this pair, and both artifacts must be proven absent before a fresh exclusive claim.
- **Accepted-State Revision**: The revision that advances only when different validated RunState bytes become accepted.
- **Host Revision**: The revision that advances for serialized host metadata changes, including in-flight operations, incident handling, correction consumption, handoff, and cleanup metadata.
- **Authoritative Prestate**: The freshly provable task and lane facts that must still match before a checkpoint can resume or an effect can be accepted.
- **Inspection Identity**: The identity of one fresh Inspection result used to classify continuation and prevent metadata churn from renewing correction authority.
- **Host Incident**: A closed refusal or pre-acceptance adapter, tool, or process failure that is distinct from a genuine task attempt result.
- **Correction Identity**: The bounded identity of one qualifying host incident, accepted state and revision, semantic operation, incident class, fresh Inspection identity, host revision, and worker generation; it permits at most one immediate correction across later metadata updates.
- **Ordinary Accepted-Completion Bridge**: The single replay-sealed autonomous Lightweight exception that turns one finalized dual-retained trusted completion and exact fresh authority into one permit-bound lane-owner mutation, matching receipt, verified final poststate, and settlement.
- **Settlement Receipt**: Existing authoritative proof that the applicable lane effect or task settlement succeeded and that state replacement or cleanup may proceed.
- **Recovery Notice**: Typed one-shot semantic data containing `incidentClassification`, `statePreserved: true`, and `resumedAction`. It remains pending through intermediate effects, appears only on the first successful corrected or resumed outcome, is atomically consumed and rendered once, and is not a ledger entry, event, report, audit, or user checkpoint.

## Success Criteria

- **SC-001:** In 100% of qualifying closed-refusal and proven no-effect pre-acceptance host-result fixtures, typed nonterminal continuation data is returned, accepted state remains byte-identical, accepted-state revision and attempt and recovery counters remain unchanged, and continuation reaches the permitted correction or fresh Inspection unless a distinct hard stop applies.
- **SC-002:** In 100% of trusted review-rejection fixtures, the rejection reaches the established trusted completion and recovery or learning flow; zero fixtures select an incompatible legacy route.
- **SC-003:** The exact `action-mismatch` followed by attempted host exit fixture invokes zero exit or termination operations, preserves Work and the shared shell and worker, and continues nonterminally.
- **SC-004:** In 100% of persistent-shell and adapter-worker death fixtures with a surviving supervisor, independently retained invocation identity, valid checkpoint, exact prior-worker exit, and unchanged authority, one replacement resumes from the exact accepted state after fresh Inspection.
- **SC-005:** In 100% of supervisor-loss, identity-loss, self-identified-from-checkpoint, missing, stale-orphan, corrupt, conflicting, wrong-invocation, stale-worker, owner-drifted, lane-drifted, prestate-drifted, and unverifiable-side-effect fixtures, recovery refuses and reconstructs no state.
- **SC-006:** In 100% of worker-serialization fixtures, exactly one token and generation can update the checkpoint; stale and concurrent workers fail, and handoff succeeds only after exact prior-worker exit with matching prior and fresh replacement identities.
- **SC-007:** No incident identity receives more than one immediate correction; accepted-state revision changes only for different accepted RunState bytes, and host revision or metadata changes never reset the correction cap.
- **SC-008:** In 100% of genuine authorized implementation, test, and review failure fixtures, existing budget, verification, review, and learning semantics are unchanged, no failure is silently retried, and host incidents add no task or review evidence.
- **SC-009:** In 100% of lifecycle fixtures, checkpoints remain through recoverable incidents and clear only at an allowed settlement, end, cancellation, or safely recorded hard stop; every stale-orphan refusal identifies the bounded pair or safe canonical identifier and manual cleanup as the next action; age authorizes no cleanup or takeover; and a fresh exclusive claim proceeds only after confirmed manual cleanup and post-clean proof that both artifacts are absent. Partial removal, changed or reappeared artifacts, and failed validation block replacement visibly.
- **SC-010:** In 100% of same-workspace and same-target collision fixtures, exactly one exclusive invocation claim retains authority and every competing claim fails closed without merge or concurrent writer.
- **SC-011:** In 100% of eligible incident fixtures, the typed notice remains pending through intermediate effects, appears only on the first successful corrected or resumed outcome with the exact incident classification, `statePreserved: true`, and resumed action, is atomically consumed and rendered once, and is absent from every later outcome and every ledger, event, report, and audit record.
- **SC-012:** Across supported-platform fixtures, checkpoint operations either establish all required observable properties or fail closed visibly; acceptance makes no uniform claim about platform-specific protection or synchronization behavior.
- **SC-013:** Acceptance adds zero project-local RunState paths, identity services, process monitors, workflow engines, generic transaction systems, cleanup commands, TTLs, timers, background sweeps, daemons, editor services, schedulers, distributed locks, databases, migrations, automatic takeover paths, cross-session resume paths, or feature-specific incident branches.
- **SC-014:** All established safety, budget, verification, review, owner, lane, permit, close, and governance regression suites pass without weakened outcomes except for the exact ordinary accepted autonomous Lightweight completion bridge authorized by FR-028 through FR-030.
- **SC-015:** In 100% of positive bridge fixtures, finalized dual-retained trusted completion, exact fresh authority, conflict-free state, one matching final occurrence and completion tuple, and no repeat produce exactly one bound permit, one lane-owner mutation, one committed matching receipt, one freshly verified final poststate, and one settlement.
- **SC-016:** In 100% of fixtures with any missing, stale, duplicated, repeated, replayed, drifted, or mismatched bridge predicate, authority fact, permit binding, prestate, lane mutation, receipt, or poststate, the bridge refuses with zero fallback permit, lane mutation, settlement, fabricated governance, command-line mutation, direct edit, or caller close authority.

## Assumptions

- The current low-level runtime can validate RunState and expose its established completion, learning, and transition behavior to one composing host boundary.
- The active coordinator turn can act as a surviving supervisor, create and retain a random invocation identity before worker launch, explicitly pass it to replacements, and observe the exact exit of an active adapter worker.
- Same-invocation recovery covers persistent-shell and replaceable adapter-worker death only while that supervisor and its independently retained invocation identity survive.
- Loss of the supervisor, coordinator context, or invocation identity remains outside v1 and is a hard stop, consistent with deferring context compaction without preserved identity and conversation or session restart.
- Fresh Inspection can prove the exact owner, lane, task or issue prestate, and evidence needed to compare a checkpoint without reconstructing authority.
- Runtime commands and lane owners provide either a closed no-effect refusal or authoritative effects and receipts sufficient to distinguish an accepted successor from an indeterminate outcome.
- Closed-refusal correction is not a task retry because accepted state and authoritative task artifacts remain unchanged.
- The session checkpoint is transient invocation authority, not portable workflow state, project history, or an audit source.
- Supported hosts can report checkpoint-operation failures, and observed failures can produce visible safe refusal.
- Invocation identity supplies correlation and authority binding for cooperative components; it is not protection against a hostile process running as the same user.
- Platform-specific protection and synchronization differences remain implementation risk and safe-refusal cases rather than identical cross-platform guarantees.

## Out of Scope

- Resume after context compaction when invocation identity is not preserved.
- Resume after conversation or session restart, editor restart, machine restart, or cross-machine transfer.
- Project-local durable RunState or portable recovery.
- State reconstruction from task state, logs, history, counters, permits, or partial evidence.
- Recovery after loss of the coordinator supervisor or its independently retained invocation identity.
- Cross-target concurrency, multi-session merge, scheduling, automatic ownership takeover, timeout-based handoff, process-identity guessing, or lock stealing.
- An identity service, process monitor, cleanup command or automated cleanup workflow, editor service, workflow engine, generic transaction framework, daemon, database, migration, schema artifact, or second audit ledger.
- Protection against a hostile same-user process.
- Uniform platform-specific ownership, permission-mode, or directory-synchronization guarantees.
- New attempt budgets, blanket retries, hidden retries, or relaxed hard stops.
- Feature-specific behavior for Ship or any other command that delegates to Work.
- Any ordinary lane completion or mutation authority beyond the single replay-sealed autonomous Lightweight accepted-completion bridge, including generic permits, tracked-execution expansion, caller close authority, fabricated governance, command-line lane mutation, direct edit, or replay.
