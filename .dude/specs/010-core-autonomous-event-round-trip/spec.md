# Feature Specification: Core Autonomous Event Round Trip

## Purpose

Make the runtime's lane-history write/read round trip correct, so an audit record the runtime writes into a feature's append-only lane history can always be read back by that same runtime.

Today it cannot. The runtime emits an event type that its own reader does not recognize, the reader fails closed on the unknown record, and `--policy autonomous` is permanently disabled on every feature whose lane history holds one. Because lane history is append-only audit evidence, the only way to satisfy the reader today is to delete audit evidence.

The outcome wanted is behavioral: on a feature whose lane history contains a runtime-written audit record, an otherwise valid autonomous authorization returns authorized, no audit evidence is deleted or rewritten to achieve it, and records the reader does not recognize keep failing closed.

## User Stories & Testing

### User Story 1: Autonomous Policy Survives The Runtime's Own Audit Records (Priority: P1)

As a maintainer running autonomous Work, I can keep running autonomous policy on a feature after the runtime has written its own audit record into that feature's lane history.

**Independent Test:** Run an otherwise valid autonomous authorization against a feature whose lane history holds a runtime-written audit record, then against the same feature with that record absent. Both must return the same authorized outcome, and the lane history must be byte-identical before and after.

**Acceptance Scenarios:**

1. **Given** a feature whose lane history contains a runtime-written audit-only record, **When** an otherwise valid autonomous authorization runs, **Then** it returns authorized instead of stopping on incomplete retention evidence.
2. **Given** that same feature, **When** the authorization completes, **Then** no lane-history record was modified, migrated, or removed.
3. **Given** a recognized audit-only record, **When** the reader parses it, **Then** the record is validated with the same strictness as a retention-relevant record and is then excluded from retention decisions.
4. **Given** a recognized audit-only record whose contents are corrupt, **When** the reader parses it, **Then** the read fails closed rather than ignoring the record.
5. **Given** lane history containing both retention-relevant occurrence records and audit-only records, **When** retention and repeat detection run, **Then** their outcomes are identical to the outcomes produced from the retention-relevant records alone.

### User Story 2: Unrecognized Records Still Fail Closed (Priority: P1)

As a maintainer relying on the governance hard stop, I keep the guarantee that a record the reader does not recognize stops the run rather than being silently ignored.

**Independent Test:** Present lane history containing a record whose type is not declared, and confirm the reader refuses. Confirm the refusal reason and hard-stop classification are unchanged from current behavior.

**Acceptance Scenarios:**

1. **Given** a lane-history record whose type is not declared, **When** the reader parses it, **Then** it fails closed exactly as it does today.
2. **Given** a declared retention-relevant type, **When** the reader parses it, **Then** it is validated and used for retention decisions exactly as it is today.
3. **Given** guarded policy or non-Work execution, **When** any of the above lane histories is read, **Then** behavior is unchanged.

### User Story 3: A New Writer-Emittable Type Cannot Ship Unreadable (Priority: P2)

As a maintainer adding a new lane-history event type, I get a failing check rather than a silently reintroduced defect when the reader cannot read what the writer can emit.

**Independent Test:** Add a writer-emittable event type without giving the reader a way to accept it, run the enforcing check, and confirm it fails. Restore reader acceptance and confirm it passes.

**Acceptance Scenarios:**

1. **Given** the complete set of writer-emittable event types, **When** the enforcing check runs, **Then** it asserts that the reader accepts every one of them.
2. **Given** a writer-emittable type the reader does not accept, **When** the enforcing check runs, **Then** the check fails.
3. **Given** a type declared without its retention relevance, **When** the enforcing check runs, **Then** the check fails.

## Edge Cases

- A recognized audit-only record that fails its own validation must fail the read, not be skipped.
- Lane history containing only audit-only records must produce the same retention result as empty lane history, without failing.
- Repeated audit-only records for the same feature must not accumulate into a retention or repeat signal.
- Legacy wrapped audit lines that the reader already skips must keep being skipped, with no new failure.
- A declared type must carry exactly one retention relevance; an undeclared or ambiguously declared type is a failure, not a default.
- An authorization that is invalid for an unrelated reason must still fail for that reason; this feature removes only the round-trip cause.

## Requirements

- **FR-001**: Every event type the runtime's own writer can emit into lane history MUST be a type the runtime's lane-history reader accepts.
- **FR-002**: The system MUST hold exactly one shared declaration of lane-history event types, consumed by both the writer and reader paths, declaring for each type whether it is retention-relevant or audit-only.
- **FR-003**: When the reader encounters a declared audit-only record, it MUST validate that record as strictly as a retention-relevant record and then exclude it from retention decisions. A validation failure MUST fail closed.
- **FR-004**: The reader MUST continue to fail closed on any record whose type is not present in the shared declaration. Unrecognized records are never skipped.
- **FR-005**: An otherwise valid autonomous authorization on a feature whose lane history contains a runtime-written audit-only record MUST return authorized.
- **FR-006**: The system MUST carry an enforcing check that fails when any writer-emittable event type is not accepted by the reader, or is declared without its retention relevance.
- **FR-007**: No existing lane-history record may be modified, migrated, or deleted to satisfy any requirement in this feature.
- **FR-008**: Retention, repeat detection, and governance behavior for retention-relevant types MUST be unchanged, and guarded and non-Work behavior MUST be unchanged.

## Key Entities

- **Lane-history record**: one append-only audit entry written by the runtime into a feature's execution history. Never edited after it is written.
- **Event type declaration**: the single shared statement of which event types exist and, for each, whether it is retention-relevant or audit-only.
- **Writer path**: the runtime path that appends lane-history records.
- **Reader path**: the runtime path that parses lane history to derive retention and authorization evidence.

## Success Criteria

- **SC-001**: On a feature whose lane history contains a runtime-written audit-only record, autonomous authorization returns authorized, with zero lane-history bytes changed.
- **SC-002**: 100% of writer-emittable event types are accepted by the reader, proven by a check that fails if any one is not.
- **SC-003**: 0 unrecognized-type records are skipped; every one still fails closed with the current refusal behavior.
- **SC-004**: A corrupt declared audit-only record is rejected in 100% of cases rather than ignored.
- **SC-005**: Retention, repeat-detection, governance, guarded, and non-Work outcomes show no behavioral change across existing coverage.
- **SC-006**: Feature 007 becomes autonomous-capable again as an observed side effect, without any edit to its lane history.

## Assumptions

- Lane history is append-only and existing records stay exactly as written; recovery of existing history is achieved by correcting the reader, not the data.
- A per-type validator already exists for the observed audit-only type, so strict validation of that type costs nothing new.
- Repeat detection already ignores every type outside the two occurrence types, so excluding audit-only types from retention does not change repeat behavior.
- The fix stays inside the existing runtime; no new lane, command, ledger, store, or user-facing surface is needed.

## Out Of Scope

- Diagnosability (a named halt identifying what specifically stopped it) and continuity policy (an append-only record never permanently disabling the policy that wrote it). Both belong to `.dude/ideas/unattended-work-continuity.md` and are deliberately not restated here.
- Deleting, rewriting, or migrating existing lane-history audit evidence.
- Relaxing the reader for unrecognized types.
- A criticality marker on the event envelope, and splitting lane history into separate streams. Neither is required by the selected direction.
