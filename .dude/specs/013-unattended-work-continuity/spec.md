# Feature Specification: Unattended Work Continuity

## Purpose

During an explicitly unattended (autonomous) run, ending a turn to summarize progress was read as a stop, so work idled with no legitimate basis while ready work remained. In one observed run the coordinator halted three times but only one halt named a reason from the closed stop set; the other two named nothing, yet an unnameable halt looks exactly like a legitimate one after the fact. A separate observed run named a legitimate closed-set reason and was still undiagnosable without reading the runtime's internals.

This feature tightens the discipline and observability of `dude-work` so that, under an explicit unattended policy, a halt happens only for a reason from the closed stop set, every halt echoes that named reason so an unnameable halt is structurally impossible, every halt also identifies what specifically caused it so the run's owner can act without reading the runtime's internals, and progress reporting is decoupled from stopping so surfacing a milestone never ends the loop. It preserves every existing safety floor, hard stop, verification gate, and independent review exactly, and reclassifies no stop from absolute to continuable.

This is a new, small tightening of `dude-work` stop discipline and halt observability. It changes none of Feature 005's autonomous policy semantics and proposes no change to Feature 009's package. It does not own the lane-history write/read round-trip correctness fix or the audit-trail continuity outcome; that outcome is already owned by defined Feature 010 (`.dude/specs/010-core-autonomous-event-round-trip/spec.md`).

## User Stories & Testing

### User Story 1 - Keep working unless a named stop applies (Priority: P1)

As the owner of an explicitly unattended run, I want work to keep going through ready work rather than end merely to report, so I do not lose time to halts that have no legitimate basis.

**Independent Test**: Run unattended with ready work remaining and drive a point where the only event is a reportable progress milestone; confirm the loop continues and does not end. Then present a genuine condition from the closed stop set and confirm the loop ends only then, attributed to that named reason.

**Acceptance Scenarios**:

1. **Given** an explicitly unattended run with ready work remaining, **When** the runtime reaches a point worth reporting but no closed-set stop condition applies, **Then** the loop continues and does not end.
2. **Given** an explicitly unattended run, **When** a condition from the closed stop set applies, **Then** the loop ends and attributes the end to that condition.
3. **Given** a default or explicit `guarded` run, **When** the same points are reached, **Then** behavior is unchanged from today.

### User Story 2 - Every halt echoes a named closed-set reason (Priority: P1)

As the owner of an unattended run, I want every halt to name a reason from the closed stop set, so an unnameable halt becomes structurally impossible rather than merely discouraged.

**Independent Test**: Exercise each closed-set stop under the unattended policy and confirm each halt echoes exactly one reason from that closed set. Then drive a turn-end that carries no closed-set reason and confirm it is not treated as a halt.

**Acceptance Scenarios**:

1. **Given** an unattended halt, **When** it is produced, **Then** it echoes exactly one reason drawn from the closed stop set.
2. **Given** a turn that ends without a closed-set reason, **When** the runtime evaluates it, **Then** it is not classified as a halt and the loop is not ended.
3. **Given** the closed stop set that Feature 005 and Feature 009 settled, **When** a halt names its reason, **Then** the reason is one of that existing set and no new stop reason is introduced.

### User Story 3 - Every halt is actionable without reading runtime internals (Priority: P1)

As the owner of an unattended run, I want each halt to identify what specifically made it stop, so I can act on it without reading the runtime's internals.

**Independent Test**: Reproduce a legitimately named halt whose cause was previously opaque (for example, a named stop whose subject required source-level investigation) and confirm the halt report identifies the affected target, the specific subject or condition that caused it, and the next action the owner can take, sufficient to act without inspecting runtime source.

**Acceptance Scenarios**:

1. **Given** an unattended halt, **When** it is produced, **Then** it identifies the affected target, the specific subject or condition that caused the stop, and the next action available to the owner.
2. **Given** a halt whose named reason alone does not localize the cause, **When** the report is produced, **Then** it still supplies enough specific cause detail to act without reading the runtime's internals.
3. **Given** an unattended halt, **When** the actionable detail cannot be established, **Then** the runtime fails closed rather than emitting a halt that names a reason but no actionable cause.

### User Story 4 - Progress reporting never stops the loop (Priority: P1)

As the owner of an unattended run, I want progress surfaced inline while the loop keeps running, so reporting is never conflated with stopping.

**Independent Test**: Drive several iterations that each surface a progress milestone under the unattended policy; confirm the milestones are visible, the loop continues after each, and no progress report is ever classified as a stop.

**Acceptance Scenarios**:

1. **Given** an unattended run, **When** progress is surfaced, **Then** the progress is visible and the loop continues.
2. **Given** an unattended run, **When** a progress report is produced, **Then** it is never counted as a halt or a stop reason.
3. **Given** ready work remains after a progress report, **When** the runtime continues, **Then** it proceeds to that ready work without requiring user input.

### User Story 5 - Safety floor and hard stops remain unchanged (Priority: P1)

As the owner of an unattended run, I want every irreducible human checkpoint, verification gate, and independent review to remain mandatory, so continuity never crosses a safety floor.

**Independent Test**: Under the unattended policy, exercise each safety-floor category — destructive operations, spending, credentials, external authorization, and ownership ambiguity — plus failed verification and reviewer rejection; confirm each still halts, echoes its named reason, and requests human input, and that no previously absolute stop became continuable.

**Acceptance Scenarios**:

1. **Given** the unattended policy, **When** work encounters any safety-floor category, **Then** it halts and requests human input exactly as today, echoing its named reason.
2. **Given** the unattended policy, **When** verification fails or independent review rejects, **Then** the halt stands and is never treated as approval.
3. **Given** the unattended policy, **When** any stop is evaluated, **Then** no stop that was absolute under Feature 005 or Feature 009 has become continuable through this feature.

## Edge Cases

- A turn ends to summarize progress while ready work remains and no closed-set stop condition applies.
- A halt arises whose named reason is legitimate but whose cause is not localizable from the name alone.
- A halt would be produced but no reason from the closed stop set applies.
- A halt would be produced but its actionable cause detail cannot be established.
- A safety-floor category and a reportable progress milestone coincide in the same iteration.
- A progress report and a genuine closed-set stop condition arise in the same iteration.
- The closed stop set is extended by Feature 009 additions; a halt must still name one existing reason and introduce none.
- Default or explicit `guarded`, or any non-unattended run, must be byte-for-byte unchanged.
- Verification failure or reviewer rejection coincides with continuable ready work.

## Functional Requirements

- **FR-001** (Q3, Q6): Under an explicit unattended policy, the runtime MUST keep working through ready work and MUST NOT end the loop merely to report progress. The loop MUST end only when a condition from the existing closed stop set applies. Default and explicit `guarded` behavior MUST remain byte-for-byte unchanged.
- **FR-002** (Q3): Progress reporting MUST be decoupled from stopping. Surfacing a progress milestone MUST NOT be classified as a halt, MUST NOT consume a stop reason, and MUST leave the loop free to continue.
- **FR-003** (Q5): Every unattended halt MUST echo exactly one reason drawn from the existing closed stop set, so an unnameable halt is structurally impossible. A turn that carries no closed-set reason MUST NOT be treated as a halt.
- **FR-004** (Q6): This feature MUST introduce no new stop reason. The closed stop set is exactly the set Feature 005 and Feature 009 settled; every named halt MUST resolve to one member of that existing set.
- **FR-005** (Q7): Every unattended halt MUST identify, beyond its named reason, the affected target, the specific subject or condition that caused the stop, and the next action available to the owner, sufficient to act without reading the runtime's internals.
- **FR-006** (Q7): When a halt's actionable cause detail cannot be established, the runtime MUST fail closed rather than emit a named halt without actionable cause.
- **FR-007** (Q1, Q4): This feature MUST reclassify no stop. Every safety-floor category — destructive operations, spending, credentials, external authorization, and ownership ambiguity — and every hard stop, verification gate, and independent review MUST remain exactly as settled; none MAY become continuable.
- **FR-008** (Q4): A failed verification or a reviewer rejection MUST remain a halt and MUST NEVER be treated as approval; a continued loop is not an approved loop.
- **FR-009**: This feature MUST reuse the existing `dude-work` stop, report, and evidence surfaces and MUST NOT create a new lane, board, command, or persistent store.
- **FR-010**: The deterministic runtime MUST own stop detection, named-reason attribution, and the fail-closed decision; model reasoning MAY compose the actionable cause narrative from existing evidence but MUST NOT establish a stop, a named reason, or an approval.

## Key Entities

- **Closed stop set**: the existing set of named stop reasons settled by Feature 005 and Feature 009 that `dude-work` may end a loop on; this feature names against it and adds no member.
- **Named halt**: a loop-ending event that echoes exactly one reason from the closed stop set.
- **Actionable halt detail**: the affected target, the specific subject or condition that caused the stop, and the next owner action carried alongside a named halt.
- **Progress report**: an inline account of run progress that is surfaced without ending the loop and is never a stop reason.
- **Safety floor**: the irreducible invocation-wide categories — destructive operations, spending, credentials, external authorization, and ownership ambiguity — plus mandatory verification and independent review, unchanged by this feature.

## Success Criteria

- **SC-001**: In 100% of unattended fixtures where a reportable milestone occurs with ready work remaining and no closed-set stop applies, the loop continues and does not end.
- **SC-002**: In 100% of unattended halts, exactly one reason from the existing closed stop set is echoed; no halt is produced without a closed-set reason.
- **SC-003**: In 100% of unattended halts, the report identifies the affected target, the specific causing subject or condition, and the next owner action, and a halt whose actionable cause cannot be established fails closed instead.
- **SC-004**: In 100% of unattended progress-report fixtures, the report is visible, is never counted as a stop, and the loop continues.
- **SC-005**: In 100% of safety-floor, verification-failure, and reviewer-rejection fixtures under the unattended policy, work halts with its named reason and requests human input, and no previously absolute stop is continuable.
- **SC-006**: In 100% of default and explicit `guarded` fixtures, observable behavior is identical to current work.
- **SC-007**: No fixture introduces a new stop reason, a new lane, board, command, or persistent store.

## Assumptions

These resolve the idea's open questions as conscious definition-time assumptions; no assumption invents scope beyond the idea's normalized intent, constraints, and relationship notes.

- (Q1, Q6) This feature reclassifies no stop and changes none of Feature 005's autonomous policy semantics. It is a discipline and observability tightening of `dude-work`, not a change to which checkpoints an autonomous policy may pass. Every stop that was absolute stays absolute; every checkpoint that was continuable stays continuable.
- (Q2) Auto-authorizing a bounded number of revisions past the `two failed attempts` hard stop is out of scope for this feature. It would relax an existing Feature 005 / Feature 009 hard stop and lands directly on the runtime Feature 009 changed; the idea raised it as an open design question, not a settled requirement. It is deferred, not decided here.
- (Q3) Reporting is decoupled from stopping: progress is surfaced inline while the loop keeps running, and a progress report is never a stop.
- (Q4) The safety floor is exactly the existing invocation-wide categories — destructive operations, spending, credentials, external authorization, and ownership ambiguity — plus mandatory verification and independent review; none is weakened.
- (Q5) Every halt must echo a named reason from the existing closed stop set, making an unnameable halt structurally impossible.
- (Q6) This is a new, small feature that tightens `dude-work` stop discipline and halt observability, sequenced after Feature 009 (observed 2026-07-28 with all nine canonical tasks closed; point-in-time, package closure not independently verified).
- (Q7) Beyond naming a reason, a halt must identify the affected target, the specific subject or condition that caused it, and the next owner action, sufficient to act without reading the runtime's internals.
- (Continuity / round-trip invariant) The idea's audit-trail continuity outcome — a record the system writes must never permanently disable the policy that wrote it — and the round-trip invariant that every writer-emittable event type is reader-acceptable are already owned by defined Feature 010 (`.dude/specs/010-core-autonomous-event-round-trip/spec.md`, User Stories 1 and 3). This feature does not re-own them and adds no overlapping guard.
- The named-reason echo follows the existing `flag` / `Classified as: <type>` precedent as a structural echo requirement, not a new vocabulary.

## Out of Scope

- Any change to Feature 005's autonomous policy semantics or to Feature 009's package, task state, board, or log.
- Reclassifying any stop from absolute to continuable, or weakening any safety-floor category, verification gate, or independent review.
- Auto-authorizing bounded revisions past the `two failed attempts` hard stop (Q2), which lands on the runtime Feature 009 changed and remains an open design question.
- The lane-history write/read round-trip correctness fix and the audit-trail continuity outcome, which are owned by defined Feature 010.
- Any new lane, board, command, persistent store, or stop reason.
- Selecting flag spellings, policy names, state shapes, or enforcement mechanics that belong to the plan rather than the spec.
