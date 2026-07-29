# Feature Specification: Historical Core Dogfood Fixture Repair

## Purpose

Restore the six Feature 008 T007 first-adopter tests as a reliable permanent contract. Those tests describe one accepted historical pre-materialization event, but their valid-event fixture currently inherits a later repository state in which generated parity is already green. The fixture must instead recreate the historical event it claims to test while every assertion, rejection gate, and future-feature boundary remains strict.

This is a test-contract repair only. It adds no user-facing behavior, changes no production policy, and grants no authority to repeat the one-time event.

## Protected Assertions

The following six named tests remain present, executable, and strict:

1. `T007 Core Dogfood valid live 20-path event passes every transient packet gate`
2. `T007 Core Dogfood requires exact main checkout baseline continuity and terminal readiness`
3. `T007 Core Dogfood derives current authority and rejects generic approval interruption and drift`
4. `T007 Core Dogfood compares the complete temp-materializer projection and cleanup inventory`
5. `T007 Core Dogfood pre-materialization verification isolates one exact parity delta`
6. `T007 Core Dogfood appends rechecks selects latest accepted evidence and blocks every close drift`

## User Stories & Testing

### User Story 1: Preserve The Historical First-Adopter Contract (Priority: P1)

As a maintainer, I can run the six permanent first-adopter tests from a later repository state and know they evaluate the accepted historical pre-materialization event rather than the ambient current state.

**Independent Test:** From a later current repository state with green generated parity, select exactly the six protected test names. All six pass when the historical event is explicitly reconstructed. In a disposable control that removes that reconstruction or substitutes the ambient current identity and parity, all six fail.

**Acceptance Scenarios:**

1. **Given** a later current repository state with green generated parity, **When** the six protected tests run, **Then** their valid-event fixture deterministically recreates the accepted one-time pre-materialization event and all six tests pass.
2. **Given** the same later repository state, **When** explicit historical reconstruction is removed or replaced by ambient current identity and parity in a disposable control, **Then** all six protected tests fail, proving the passing result is not vacuous.
3. **Given** any existing invalid-case mutation of continuity, head or chain identity, declaration, attribution partition, dirt or hidden-index state, generated prestate, rewrite or scope, parity delta, protected boundaries, approvals, interruption, or accepted evidence and close state, **When** the applicable protected test runs, **Then** the mutation is rejected.
4. **Given** an ordinary event or any later feature, **When** it attempts to use first-adopter authority, **Then** the unchanged ordinary and later-feature gates reject it.
5. **Given** the repaired contract, **When** the six protected assertions are inspected, **Then** none has been deleted, weakened, skipped, filtered out, or treated as an expected failure.

### User Story 2: Restore The Repository Verification Baseline (Priority: P1)

As a maintainer, I can run the complete discovered test suite successfully so the separately owned Feature 010 terminal may resume under its own authority.

**Independent Test:** Run the recursively discovered suite after the focused six-test verification, then inspect the complete feature diff and workflow state. The suite has no unexpected failure, the fixture leaves no persistent residue, and Feature 010 state is byte-identical.

**Acceptance Scenarios:**

1. **Given** the focused repair is passing, **When** the complete discovered suite runs, **Then** it returns green with no expected-failure waiver.
2. **Given** successful full-suite evidence, **When** this feature completes its own validation, **Then** it neither mutates nor closes Feature 010 and merely removes the independent test-suite blocker that prevented Feature 010 from resuming separately.
3. **Given** any protected production, workflow, historical, or generated boundary, **When** the repair diff is inspected, **Then** no change outside the transient test fixture implementation is attributed to this feature.

## Edge Cases

- The invoking repository has moved beyond the historical event and already has byte-identical source/generated parity.
- The historical source identity is selected but the generated projection still comes from current parity, or the generated prestate is historical while the source identity is current.
- Current policy, state, or test bytes are needed to execute the permanent assertions without redefining the event under test.
- The historical event is reconstructed correctly, but an ordinary or later feature attempts to reuse its one-time authority.
- A continuity commit is absent, reordered, duplicated, replaced, voided, or does not reach the exact reconstructed head.
- A declaration or the 10/9/1 attribution partition is incomplete, overlapping, duplicated, or substituted.
- Source or generated dirt is staged, unstaged, untracked, ignored, assume-unchanged, or skip-worktree.
- Generated prestate, projection inventory, rewrite set, cleanup set, no-output set, or parity delta differs by one path, type, mode, identity, or byte sequence.
- Protected state changes before approval, between approvals, after approval, after evidence append, or before close.
- Approval is generic, echoed across roles, stale, interrupted, or bound to different evidence.
- Accepted evidence is absent, malformed, stale, not the latest matching line, or followed by close drift.
- The focused selector discovers fewer or more than the six exact protected tests.
- Temporary fixture setup or cleanup is interrupted and must leave no persistent repository or workflow state.

## Functional Requirements

- **FR-001:** The six protected tests MUST remain present, independently discoverable by their exact names, executable, and strict.
- **FR-002:** The valid-event fixture MUST deterministically reconstruct the accepted historical one-time pre-materialization T009 repository identity and projection, independent of the invoking repository's current head and generated parity.
- **FR-003:** All six protected tests MUST pass when invoked from a later current repository state whose generated projection is already in parity.
- **FR-004:** Existing invalid-case mutations MUST continue to reject continuity, head and chain identity, declaration, attribution partition, every source and generated dirt or hidden-index layer, generated prestate, rewrite and scope, parity delta, protected boundaries, approval binding, interruption, accepted evidence, and close drift.
- **FR-005:** Strict ordinary-event and later-feature gates MUST remain unchanged, and historical reconstruction MUST grant no first-adopter authority to another event or feature.
- **FR-006:** No protected assertion MAY be deleted, weakened, skipped, filtered out, converted to an expected failure, or satisfied by a generic waiver.
- **FR-007:** The fixture and every reconstruction artifact MUST remain transient and test-local and MUST leave no persistent packet, repository state, workflow state, generated output, or audit mutation.
- **FR-008:** The repair MUST introduce no production behavior, policy change, command, schema, runtime, state store, materializer behavior, or user-facing surface.
- **FR-009:** A controlled disposable variant without historical reconstruction, or with ambient current identity and parity substituted, MUST make all six protected tests fail.
- **FR-010:** The recursively discovered full suite MUST return green without an expected-failure waiver.
- **FR-011:** This feature MUST NOT mutate, close, or claim authority over Feature 010; Feature 010 resumes separately only after this feature removes the independent suite failure.
- **FR-012:** Completed Feature 008 and Feature 009 definition, history, acceptance, ownership, tasks, state, and audit evidence MUST remain unchanged.

## Key Entities

- **Historical first-adopter event**: The accepted one-time T009 state immediately before generated materialization, including its exact continuity, declaration, attribution, generated prestate, verification, approval, and close contracts.
- **Transient valid-event fixture**: A disposable repository representation used only while the protected tests execute. It recreates the historical event but persists no authority or evidence.
- **Protected assertion set**: The six exact Feature 008 T007 test names and all positive and negative assertions they currently carry.
- **Ordinary and later-feature gates**: The permanent rules that deny the one-time first-adopter exception to every other event.

## Success Criteria

- **SC-001:** Exactly 6 of the 6 protected tests are discovered and pass from a later current head with green generated parity.
- **SC-002:** In the disposable non-vacuity control, 0 of the 6 protected tests pass when historical reconstruction is removed or ambient current head/parity is substituted.
- **SC-003:** 100% of the existing invalid-case mutation checks continue to reject their mutation, with no deleted or weakened assertion.
- **SC-004:** The recursively discovered full suite completes with zero unexpected failures and zero expected-failure waivers attributable to these tests.
- **SC-005:** The repair leaves zero persistent fixture artifacts and zero changes to production, generated output, workflow state, Feature 008, Feature 009, or Feature 010 state.
- **SC-006:** Independent review finds all six names, their strict ordinary and later-feature gates, and their invalid mutation matrix intact.

## Assumptions And Evidence Context

- The six failures share one phase-stale fixture cause rather than six independent policy defects.
- The current fixture starts from current repository head, overlays live policy, state, and test bytes, and then assumes it still represents the historical pre-materialization `21f9dc5` event with parity red. Once current head has green generated parity, that assumption is false.
- A clean `c7e36d7` checkout fails all six protected tests, 0/6, so the failure predates Feature 010.
- A controlled reconstruction using the `21f9dc5` pre-materialization identity and projection with the current protected assertions passes all six tests, 6/6.
- Overlaying Feature 010 onto the clean failing checkout does not change the six-test failure signature, so Feature 010 is not the cause.
- The repository history and existing test-local capabilities are sufficient to recreate the accepted event inside a disposable fixture without rewriting historical evidence.
- Existing rejection coverage expresses the intended permanent contract and remains authoritative; only valid-event fixture phase selection is defective.

## Out Of Scope

- Reopening, redefining, or mutating Feature 008 or Feature 009.
- Mutating or closing Feature 010, or changing its promoted source or generated bytes.
- Changing production policy, runtime, commands, schemas, materializer behavior, generated output, or user-facing behavior.
- Rewriting historical audit evidence or manufacturing a new accepted event.
- Persisting a fixture, packet, snapshot, repository, state record, approval body, or report.
- Generalizing historical repository reconstruction into a framework, module, command, or migration facility.
- Adding an expected-failure mechanism, waiver, skip, filter, retry, or relaxed assertion.