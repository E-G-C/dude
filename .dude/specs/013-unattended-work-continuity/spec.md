# Feature Specification: Unattended Work Continuity

## Purpose

During an explicitly unattended (autonomous) run, ending a turn to summarize progress was read as a stop, so work idled with no legitimate basis while ready work remained. In one observed run the coordinator halted three times but only one halt named a reason from the closed stop set; the other two named nothing, yet an unnameable halt looks exactly like a legitimate one after the fact. A separate observed run named a legitimate closed-set reason and was still undiagnosable without reading the runtime's internals.

This feature tightens the discipline and observability of `dude-work` so that, under an explicit unattended policy, the loop keeps working through ready work and ends only on a genuine stop; every halt carries a report that either resolves to exactly one reason from the closed stop set with actionable cause detail, or is explicitly unresolved — naming what could not be established and presenting no reason outside the closed set — so a halt can never masquerade as a legitimate named one; every resolved halt identifies what specifically caused it so the run's owner can act without reading the runtime's internals; and progress reporting is decoupled from stopping so surfacing a milestone never ends the loop. Definition-time verification further established that some genuine stops end the loop carrying a disposition the closed set does not name; rather than invent a new stop reason or force a false name onto such a stop, the discipline requires that halt to declare itself explicitly unresolved. It preserves every existing safety floor, hard stop, verification gate, and independent review exactly, and reclassifies no stop from absolute to continuable.

This is a new, small tightening of `dude-work` stop discipline and halt observability. It changes none of Feature 005's autonomous policy semantics and proposes no change to Feature 009's package. It does not own the lane-history write/read round-trip correctness fix or the audit-trail continuity outcome; that outcome is already owned by defined Feature 010 (`.dude/specs/010-core-autonomous-event-round-trip/spec.md`).

## User Stories & Testing

### User Story 1 - Keep working unless a genuine stop applies (Priority: P1)

As the owner of an explicitly unattended run, I want work to keep going through ready work rather than end merely to report, so I do not lose time to halts that have no legitimate basis.

**Independent Test**: Run unattended with ready work remaining and drive a point where the only event is a reportable progress milestone; confirm the loop continues and does not end. Then present a genuine stop condition and confirm the loop ends only then, carrying a halt report that either resolves to one named closed-set reason or is explicitly unresolved.

**Acceptance Scenarios**:

1. **Given** an explicitly unattended run with ready work remaining, **When** the runtime reaches a point worth reporting but no stop condition applies, **Then** the loop continues and does not end.
2. **Given** an explicitly unattended run, **When** a genuine stop condition applies, **Then** the loop ends and the halt carries a report that either resolves to exactly one reason from the closed stop set with its actionable detail, or is explicitly unresolved.
3. **Given** a default or explicit `guarded` run, **When** the same points are reached, **Then** behavior is unchanged from today.

### User Story 2 - Every halt is named-and-resolved or explicitly unresolved (Priority: P1)

As the owner of an unattended run, I want every halt to carry a report that either resolves to one named reason from the closed stop set or is explicitly unresolved, so a halt can never masquerade as a legitimate named halt when its reason cannot be established.

**Independent Test**: Exercise each closed-set stop under the unattended policy and confirm each halt resolves to exactly one named closed-set reason with its actionable detail. Then drive a genuine stop whose disposition is outside the closed set and confirm the halt is presented as explicitly unresolved — naming the missing fields and presenting no out-of-set reason — rather than as a named halt. Then drive a turn-end that carries no stop condition and confirm it is not treated as a halt.

**Acceptance Scenarios**:

1. **Given** an unattended halt whose reason is a member of the closed stop set, **When** it is produced, **Then** it resolves to exactly one named reason from that set together with its actionable detail.
2. **Given** an unattended halt whose disposition is not a member of the closed stop set, **When** it is produced, **Then** it is presented as explicitly unresolved, naming the fields that could not be established and presenting no reason outside the closed set.
3. **Given** a turn that ends without a stop condition, **When** the runtime evaluates it, **Then** it is not classified as a halt and the loop is not ended.

### User Story 3 - Every halt is actionable without reading runtime internals (Priority: P1)

As the owner of an unattended run, I want each resolved halt to identify what specifically made it stop, so I can act on it without reading the runtime's internals.

**Independent Test**: Reproduce a legitimately named halt whose cause was previously opaque (for example, a named stop whose subject required source-level investigation) and confirm the resolved report identifies the affected target, the specific subject or condition that caused it, and the next action the owner can take, sufficient to act without inspecting runtime source; and confirm that when that detail cannot be established, the halt is presented as explicitly unresolved instead.

**Acceptance Scenarios**:

1. **Given** a resolved unattended halt, **When** it is produced, **Then** it identifies the affected target, the specific subject or condition that caused the stop, and the next action available to the owner.
2. **Given** a halt whose named reason alone does not localize the cause, **When** the report is produced, **Then** it still supplies enough specific cause detail to act without reading the runtime's internals.
3. **Given** an unattended halt, **When** the named reason or the actionable cause detail cannot be established, **Then** the runtime presents the halt as explicitly unresolved rather than naming a reason or cause it cannot substantiate.

### User Story 4 - Progress reporting never stops the loop (Priority: P1)

As the owner of an unattended run, I want progress surfaced inline while the loop keeps running, so reporting is never conflated with stopping.

**Independent Test**: Drive several iterations that each surface a progress milestone under the unattended policy; confirm the milestones are visible, the loop continues after each, and no progress report is ever classified as a stop.

**Acceptance Scenarios**:

1. **Given** an unattended run, **When** progress is surfaced, **Then** the progress is visible and the loop continues.
2. **Given** an unattended run, **When** a progress report is produced, **Then** it is never counted as a halt or a stop reason.
3. **Given** ready work remains after a progress report, **When** the runtime continues, **Then** it proceeds to that ready work without requiring user input.

### User Story 5 - Safety floor and hard stops remain unchanged (Priority: P1)

As the owner of an unattended run, I want every irreducible human checkpoint, verification gate, and independent review to remain mandatory, so continuity never crosses a safety floor.

**Independent Test**: Under the unattended policy, exercise each safety-floor category — destructive operations, spending, credentials, external authorization, and ownership ambiguity — plus failed verification and reviewer rejection; confirm each still halts and requests human input, carrying a halt report with its existing named reason where attribution is established (otherwise explicitly unresolved), and that no previously absolute stop became continuable.

**Acceptance Scenarios**:

1. **Given** the unattended policy, **When** work encounters any safety-floor category, **Then** it halts and requests human input exactly as today, carrying its existing named reason where attribution is established.
2. **Given** the unattended policy, **When** verification fails or independent review rejects, **Then** the halt stands and is never treated as approval.
3. **Given** the unattended policy, **When** any stop is evaluated, **Then** no stop that was absolute under Feature 005 or Feature 009 has become continuable through this feature.

## Edge Cases

- A turn ends to summarize progress while ready work remains and no stop condition applies.
- A halt arises whose named reason is legitimate but whose specific cause is not localizable from the name alone.
- A genuine stop ends the loop carrying a disposition that is not a member of the closed stop set.
- A halt's named reason or actionable cause detail cannot be established.
- A safety-floor category and a reportable progress milestone coincide in the same iteration.
- A progress report and a genuine stop condition arise in the same iteration.
- A governance-controlled end (a no-progress settlement) ends the loop cleanly and is not a named halt.
- A single-correction incident corrects one recoverable mismatch and re-inspects without ending the loop.
- The closed stop set is extended by Feature 009 additions; a resolved halt must still name one existing reason and introduce none.
- Default or explicit `guarded`, or any non-unattended run, must be byte-for-byte unchanged.
- Verification failure or reviewer rejection coincides with continuable ready work.

## Functional Requirements

- **FR-001** (Q3, Q6): Under an explicit unattended policy, the runtime MUST keep working through ready work and MUST NOT end the loop merely to report progress. The loop MUST end only when a genuine stop applies, and every such loop-ending halt MUST carry the resolved-or-explicitly-unresolved report defined in FR-003. Default and explicit `guarded` behavior MUST remain byte-for-byte unchanged.
- **FR-002** (Q3): Progress reporting MUST be decoupled from stopping. Surfacing a progress milestone MUST NOT be classified as a halt, MUST NOT consume a stop reason, and MUST leave the loop free to continue.
- **FR-003** (Q5): Every unattended halt MUST carry a report that either (a) resolves to exactly one reason drawn from the existing closed stop set together with its actionable detail, or (b) is explicitly unresolved — naming the fields that could not be established and presenting no reason outside the closed set. A halt that cannot be attributed to a closed-set reason MUST take form (b) rather than masquerade as a named halt, so a halt can never look like a legitimate named halt after the fact. A turn that carries no stop condition MUST NOT be treated as a halt.
- **FR-004** (Q6): This feature MUST introduce no new stop reason. The closed stop set is exactly the set Feature 005 and Feature 009 settled; a resolved halt MUST name one member of that existing set. A genuine stop whose disposition is not a member of that set MUST be presented as explicitly unresolved, and an out-of-set disposition or diagnostic MUST NEVER be presented as a closed-set reason.
- **FR-005** (Q7): Every resolved unattended halt MUST identify, beyond its named reason, the affected target, the specific subject or condition that caused the stop, and the next action available to the owner, sufficient to act without reading the runtime's internals.
- **FR-006** (Q7): When a halt's closed-set reason cannot be established, or its actionable cause detail cannot be established, the runtime MUST fail closed — presenting the halt as explicitly unresolved with the missing fields named — rather than emit a halt that names a reason or cause it cannot substantiate.
- **FR-007** (Q1, Q4): This feature MUST reclassify no stop. Every safety-floor category — destructive operations, spending, credentials, external authorization, and ownership ambiguity — and every hard stop, verification gate, and independent review MUST remain exactly as settled; each MUST still halt and request human input, carrying its existing named reason where attribution is established (otherwise explicitly unresolved); none MAY become continuable.
- **FR-008** (Q4): A failed verification or a reviewer rejection MUST remain a halt and MUST NEVER be treated as approval; a continued loop is not an approved loop.
- **FR-009**: This feature MUST reuse the existing `dude-work` stop, report, and evidence surfaces and MUST NOT create a new lane, board, command, or persistent store.
- **FR-010**: The deterministic runtime MUST own stop detection, named-reason attribution, and the resolved-versus-unresolved decision; model reasoning MAY compose the actionable cause narrative from existing evidence but MUST NOT establish a stop, a named reason, an unresolved determination, or an approval.
- **FR-011** (Q4, Q5): Every unattended work-loop halt MUST carry the resolved-or-explicitly-unresolved report defined in FR-003. A single-correction incident — one recoverable correction followed by a fresh inspection — keeps its existing route and MUST NOT be counted as a halt. A learning-governance settlement keeps its established procedure and MUST NOT be reclassified. The safety floor MUST remain unchanged.

## Key Entities

- **Closed stop set**: the existing set of named stop reasons settled by Feature 005 and Feature 009 that `dude-work` may end a loop on; this feature names against it and adds no member.
- **Resolved halt report**: a loop-ending report that names exactly one reason from the closed stop set together with its actionable detail.
- **Unresolved halt report**: the explicit fail-closed report a halt carries when no closed-set reason or no actionable cause detail can be established; it names the missing fields and presents no reason outside the closed set.
- **Actionable halt detail**: the affected target, the specific subject or condition that caused the stop, and the next owner action carried by a resolved halt.
- **Progress report**: an inline account of run progress that is surfaced without ending the loop and is never a stop reason.
- **Clean settlement**: a loop ending that is not a halt — a task settled, a governance-controlled end, or a cancelled run; it carries no halt report.
- **Single-correction incident**: one recoverable correction followed by a fresh inspection; it keeps its existing route and is not a halt.
- **Safety floor**: the irreducible invocation-wide categories — destructive operations, spending, credentials, external authorization, and ownership ambiguity — plus mandatory verification and independent review, unchanged by this feature.

## Success Criteria

- **SC-001**: In 100% of unattended fixtures where a reportable milestone occurs with ready work remaining and no stop applies, the loop continues and does not end.
- **SC-002**: In 100% of unattended halts, the halt carries a report that is either resolved to exactly one reason from the existing closed stop set with its actionable detail, or explicitly unresolved with the missing fields named and no reason outside the closed set; no turn without a stop condition is counted as a halt.
- **SC-003**: In 100% of unattended halts, a resolved report identifies the affected target, the specific causing subject or condition, and the next owner action, and a halt whose reason or actionable cause cannot be established is presented as explicitly unresolved instead.
- **SC-004**: In 100% of unattended progress-report fixtures, the report is visible, is never counted as a stop, and the loop continues.
- **SC-005**: In 100% of safety-floor, verification-failure, and reviewer-rejection fixtures under the unattended policy, work halts and requests human input, carrying its existing named reason where attribution is established (otherwise explicitly unresolved), and no previously absolute stop is continuable.
- **SC-006**: In 100% of default and explicit `guarded` fixtures, observable behavior is identical to current work.
- **SC-007**: No fixture introduces a new stop reason, a new lane, board, command, or persistent store.
- **SC-008**: In 100% of unattended work-loop halts, the halt carries the resolved-or-explicitly-unresolved report; no clean settlement and no single-correction incident is counted as a halt; and no safety-floor category, verification, or independent review is reclassified.

## Assumptions

These resolve the idea's open questions as conscious definition-time assumptions; no assumption invents scope beyond the idea's normalized intent, constraints, and relationship notes.

- (Q1, Q6) This feature reclassifies no stop and changes none of Feature 005's autonomous policy semantics. It is a discipline and observability tightening of `dude-work`, not a change to which checkpoints an autonomous policy may pass. Every stop that was absolute stays absolute; every checkpoint that was continuable stays continuable.
- (Q2) Auto-authorizing a bounded number of revisions past the `two failed attempts` hard stop is out of scope for this feature. It would relax an existing Feature 005 / Feature 009 hard stop and lands directly on the runtime Feature 009 changed; the idea raised it as an open design question, not a settled requirement. It is deferred, not decided here.
- (Q3) Reporting is decoupled from stopping: progress is surfaced inline while the loop keeps running, and a progress report is never a stop.
- (Q4) The safety floor is exactly the existing invocation-wide categories — destructive operations, spending, credentials, external authorization, and ownership ambiguity — plus mandatory verification and independent review; none is weakened. A safety halt whose attribution cannot be established still halts and requests human input, reporting explicitly unresolved rather than naming a reason it cannot substantiate.
- (Q5) Every halt carries a report that is either resolved to one named closed-set reason with actionable detail, or explicitly unresolved — making a halt that masquerades as a legitimate named halt structurally impossible. This amends the earlier "every halt echoes a named reason": definition-time verification established that some genuine stops end the loop carrying a disposition outside the closed set, so the discipline is resolved-or-explicitly-unresolved and extends the fail-closed license to a missing reason as well as missing cause detail, introducing no new stop reason.
- (Q6) This is a new, small feature that tightens `dude-work` stop discipline and halt observability, sequenced after Feature 009 (observed 2026-07-28 with all nine canonical tasks closed; point-in-time, package closure not independently verified).
- (Q7) Beyond naming a reason, a resolved halt must identify the affected target, the specific subject or condition that caused it, and the next owner action, sufficient to act without reading the runtime's internals.
- (Clean settlements) A clean loop ending — a task settled, a governance-controlled end, or a cancelled run — is not an unattended halt and carries no halt report. Forcing a governance-controlled end to emit a named halt was consciously rejected because it would reclassify a clean governance settlement as a stop.
- (Continuity / round-trip invariant) The idea's audit-trail continuity outcome — a record the system writes must never permanently disable the policy that wrote it — and the round-trip invariant that every writer-emittable event type is reader-acceptable are already owned by defined Feature 010 (`.dude/specs/010-core-autonomous-event-round-trip/spec.md`, User Stories 1 and 3). This feature does not re-own them and adds no overlapping guard.
- The resolved halt report follows the existing `flag` / `Classified as: <type>` precedent as a structural echo requirement, not a new vocabulary; the unresolved report is its fail-closed complement when no closed-set reason can be established.

## Out of Scope

- Any change to Feature 005's autonomous policy semantics or to Feature 009's package, task state, board, or log.
- Reclassifying any stop from absolute to continuable, or weakening any safety-floor category, verification gate, or independent review.
- Auto-authorizing bounded revisions past the `two failed attempts` hard stop (Q2), which lands on the runtime Feature 009 changed and remains an open design question.
- The lane-history write/read round-trip correctness fix and the audit-trail continuity outcome, which are owned by defined Feature 010.
- The no-progress governance settlement, which remains a clean controlled end and is not turned into a named halt; no new disposition path is added for it.
- The pre-existing durability gap between recording and committing an audit-trail receipt, which is not owned by this feature.
- Any new lane, board, command, persistent store, or stop reason.
- Selecting flag spellings, policy names, state shapes, or enforcement mechanics that belong to the plan rather than the spec.
