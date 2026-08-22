# Feature Specification: Recovery Continuation

## Purpose

Autonomous Work is expected to keep processing ready work until an existing
natural or hard stop applies. When bounded manual assistance resolves a blocker
and the affected task subsequently passes every completion gate, that successful
task closure is progress within the active Work request. It must not end the
request merely because one task settled.

This feature makes that existing discipline explicit for autonomous Work invoked
directly or through Ship. Continuation is legal only while the original
coordinator supervisor, its context, and the independently retained invocation
identity survive. It does not revive an ended invocation, cross a hard stop, or
authorize cleanup, takeover, or a silent retry.

## Relationship To Feature 039

Feature 039 governs answerable decisions during explicit Ship before Work
begins. Its authority ends at the Work boundary, and Ship returns Work outcomes
unchanged.

Recovery continuation begins only after Work has started. It changes no
pre-Work answerability, eligibility, prerequisite, authority, safety, or
reporting behavior from Feature 039.

## User Scenarios & Testing

### User Story 1 - Continue after successful same-invocation recovery (Priority: P1)

As an autonomous Work user, I want a recovered task's successful closure to
count as progress, so that the active request selects the next ready task
without requiring me to invoke Work or Ship again.

**Why this priority**: The requested outcome is uninterrupted autonomous
progress after a recovered task is fully complete.

**Independent Test**: Exercise direct and Ship-originated autonomous Work in
which bounded manual assistance resolves the current task's blocker while the
same supervisor, context, and invocation identity remain active. Complete fresh
verification, independent review, exact settlement, and closure, then confirm
that the next ready task is selected under the original target and policy with a
fresh claim.

**Acceptance Scenarios**:

1. **Given** directly invoked autonomous Work and a blocker resolved by bounded
   manual assistance within the same active invocation, **When** the affected
   task passes fresh verification and independent review and is exactly settled
   and closed, **Then** its closure is recorded as progress rather than a stop.
2. **Given** Ship-originated autonomous Work in the same conditions, **When**
   the affected task is successfully closed, **Then** Work continues under the
   original Ship-normalized target and policy without another Ship request.
3. **Given** a recovered task has closed successfully and another task is ready
   in the lane detected for the invocation, **When** iteration resumes, **Then**
   the next ready task is selected automatically and receives a fresh claim.
4. **Given** bounded assistance occurred, **When** any verification, review,
   settlement, or closure prerequisite is incomplete, **Then** the system does
   not treat the task as successful progress and does not advance because of
   that assistance.

### User Story 2 - Preserve every existing stop and completion gate (Priority: P1)

As an autonomous Work user, I want recovery continuation to honor the current
stops and quality gates, so that convenience cannot turn a failed or incomplete
task into success.

**Why this priority**: Continuation is safe only when it follows the same
verification, review, ownership, settlement, closure, budget, and stop
discipline as any other autonomous iteration.

**Independent Test**: Hold the continuation setup constant while independently
introducing verification failure, review rejection, an unresolved blocker,
explicit pause or cancellation, no ready work, budget exhaustion, a tool error,
and each existing hard stop. Confirm each case retains its established outcome
and that no failed task is silently retried.

**Acceptance Scenarios**:

1. **Given** fresh verification fails or independent review rejects the recovered
   task, **When** Work evaluates the result, **Then** the existing failure or
   recovery behavior applies and successful continuation does not occur.
2. **Given** the blocker remains unresolved or exact settlement and closure
   cannot complete, **When** the iteration reaches that condition, **Then** the
   existing blocker or hard-stop result remains authoritative.
3. **Given** the user explicitly pauses or cancels, **When** Work handles that
   request, **Then** the current invocation does not select another task.
4. **Given** no task is ready after successful closure, **When** Work looks for
   the next task, **Then** the existing no-ready natural stop applies.
5. **Given** an overall or recovery budget is exhausted, a tool error occurs, or
   any other existing hard stop applies, **When** Work reaches that boundary,
   **Then** it returns the existing result without continuation or a new reason.
6. **Given** a task attempt fails, **When** recovery policy does not authorize
   another attempt, **Then** the task is not silently retried.

### User Story 3 - Keep continuation inside the surviving authority boundary (Priority: P1)

As a Work user, I want continuation to require the original live authority, so
that manual cleanup or a later session cannot impersonate the request that
stopped.

**Why this priority**: A convenient continuation rule must not create takeover,
cross-session resume, or fresh-invocation authority.

**Independent Test**: Compare a same-invocation recovery with cases that lose the
supervisor, coordinator context, or retained invocation identity; start after a
hard stop; encounter an orphan; move to another session; or use guarded Work.
Confirm only the surviving autonomous invocation can continue.

**Acceptance Scenarios**:

1. **Given** the original autonomous supervisor, coordinator context, and
   independently retained invocation identity all survive, **When** bounded
   assistance resolves the blocker, **Then** the current task may proceed through
   its normal completion gates.
2. **Given** the supervisor, context, or invocation identity is lost, **When**
   continuation is considered, **Then** the existing continuity hard stop
   remains and no fresh Work invocation starts automatically.
3. **Given** stale ownership is independently confirmed and manually cleaned,
   **When** a later user authorizes work, **Then** the later clean claim is a new
   invocation and never a continuation, takeover, or revival of the prior one.
4. **Given** recovery is attempted after a hard stop, from another invocation or
   session, or against an orphaned claim, **When** Work evaluates authority,
   **Then** recovery continuation is unavailable.
5. **Given** guarded or other non-autonomous Work, **When** a task settles,
   **Then** this feature changes none of its current behavior.

## Edge Cases

- Manual assistance removes the apparent blocker, but the task has not received
  fresh verification. The task remains incomplete.
- Verification passes but independent review rejects, or review passes against
  stale evidence. Existing failure and evidence rules apply.
- The task is verified and reviewed but its exact settlement or closure fails.
  The invocation does not select another task.
- Successful closure leaves no ready task in the already-detected lane. The
  existing no-ready stop applies.
- A recovered task closes at the same moment an explicit pause or cancellation
  is received. The explicit control outcome prevents another task selection.
- The overall or recovery budget is exhausted after closure but before another
  claim. Existing budget behavior takes precedence.
- A tool error or any hard stop occurs during assistance, verification, review,
  settlement, closure, or next-task selection. The existing outcome is returned.
- The original supervisor survives but its context or retained invocation
  identity does not. This is continuity loss and remains a hard stop.
- An orphan is removed after independent confirmation. Cleanup permits only a
  later user-authorized clean claim and carries no prior invocation authority.
- A task settles under guarded Work. The guarded interaction model is unchanged.
- Ship supplied the autonomous policy, but Work has already begun. Feature 039's
  pre-Work answerability policy no longer applies.

## Requirements

### Functional Requirements

- **FR-001**: Recovery continuation MUST enforce and clarify the existing
  autonomous Work iteration discipline and MUST NOT create a new mode, policy,
  or stop contract.
- **FR-002**: The behavior MUST apply to autonomous Work invoked directly and to
  autonomous Work entered through Ship.
- **FR-003**: The behavior MUST NOT apply to guarded or other non-autonomous
  Work.
- **FR-004**: Manual recovery MUST mean bounded assistance that resolves a
  blocker while the same autonomous Work invocation remains active.
- **FR-005**: Continuation of the recovered task MUST require the original
  coordinator supervisor, its context, and the independently retained invocation
  identity to survive.
- **FR-006**: A recovered task MUST pass fresh verification, independent review,
  exact settlement, and closure before its result can count as successful
  progress.
- **FR-007**: Successful closure of the recovered task MUST be treated as
  progress within the still-active autonomous Work invocation and MUST NOT by
  itself end that invocation.
- **FR-008**: After successful closure, when no existing control, natural-stop,
  or hard-stop boundary applies, Work MUST select the next ready task in the
  already-detected lane under the original target and normalized policy without
  requiring another user invocation.
- **FR-009**: Each next task selected after settlement MUST receive a fresh task
  claim; authority from the settled task MUST NOT carry forward.
- **FR-010**: Verification failure, review rejection, unresolved blockage, or
  failed settlement or closure MUST retain its existing outcome and MUST NOT be
  reclassified as successful continuation.
- **FR-011**: Explicit pause and cancellation MUST retain their existing
  behavior and MUST prevent automatic selection of another task for that
  invocation.
- **FR-012**: No-ready conditions, overall and recovery budget exhaustion, tool
  errors, and every existing natural or hard stop MUST retain their current
  precedence and behavior.
- **FR-013**: Recovery continuation MUST NOT silently retry a failed task.
- **FR-014**: Loss of the supervisor, coordinator context, or retained invocation
  identity MUST remain a hard stop and MUST NOT start fresh Work automatically.
- **FR-015**: Stale-orphan cleanup MUST NOT resume, revive, or transfer the prior
  invocation. It MAY only permit a later user-authorized clean claim after the
  existing cleanup and preflight requirements pass.
- **FR-016**: Post-hard-stop, cross-invocation, cross-session, takeover, and
  orphan continuation MUST remain prohibited.
- **FR-017**: Existing ownership, lane, verification, independent-review,
  settlement, closure, recovery-budget, learning-governance, reporting, and
  stop-reason rules MUST remain authoritative.
- **FR-018**: The feature MUST add no command, mode, lane, scheduler, daemon,
  registry, state store, takeover path, persistent continuation surface, or new
  stop reason.
- **FR-019**: Feature 039's pre-Work answerability boundary and behavior MUST
  remain distinct and unchanged; after Work begins, Work alone owns this
  continuation result.

### Key Entities

- **Autonomous Work invocation**: The active coordinator-owned request operating
  under one normalized target and policy.
- **Manual recovery assistance**: Bounded help that resolves a blocker without
  ending or replacing the active autonomous Work invocation.
- **Continuity basis**: The surviving original supervisor, coordinator context,
  and independently retained invocation identity required while recovering the
  current task.
- **Recovered task**: The task whose blocker received manual assistance and
  which still must satisfy every normal completion gate.
- **Successful task settlement**: Freshly verified, independently reviewed,
  exactly settled, and closed completion that counts as progress.
- **Fresh task claim**: New task-scoped authority acquired for the next ready
  task after the prior task's settlement.

## Success Criteria

### Measurable Outcomes

- **SC-001**: In every direct and Ship-originated autonomous success fixture,
  same-invocation manual assistance followed by fresh verification, independent
  review, exact settlement, and closure produces progress and next-ready
  selection under the unchanged target and policy.
- **SC-002**: In every successful continuation fixture with another ready task,
  the settled task's authority is cleared and the next task receives a fresh
  claim without another user Work or Ship request.
- **SC-003**: Fixtures for verification failure, review rejection, unresolved
  blocker, failed settlement or closure, explicit pause, cancellation, no ready
  work, overall or recovery budget exhaustion, tool error, and every hard stop
  retain their established outcome with zero continuation-only override.
- **SC-004**: Fixtures for supervisor, context, or invocation-identity loss;
  post-hard-stop recovery; stale or orphaned ownership; takeover; and
  cross-invocation or cross-session resume all refuse continuation and start
  zero automatic fresh Work invocations.
- **SC-005**: Guarded Work fixtures are unchanged, failed tasks receive zero
  silent retries, and inspection finds zero new stop reasons, commands, modes,
  lanes, schedulers, registries, state stores, or persistent continuation
  surfaces.
- **SC-006**: Feature 039 pre-Work scenarios produce the same answerability and
  handoff outcomes, and recovery continuation begins only after Work starts.

## Assumptions

- The autonomous coordinator loop, rather than a per-task worker result, owns
  selection of successive ready tasks.
- Existing verification, review, settlement, closure, continuity, cleanup,
  budget, learning-governance, and stop contracts are authoritative.
- A successful task can release its task-scoped claim while the enclosing Work
  request remains active.
- A later user-authorized claim after cleanup is a new invocation, even when it
  names the same feature or target.
- Feature 039 is complete and remains the authoritative pre-Work Ship boundary.

## Out of Scope

- Adding a separate whole-Work execution mechanism when existing coordinator
  iteration satisfies the outcome.
- Changing existing per-task completion outcomes or recovery-policy semantics.
- Starting fresh Work automatically after continuity loss or a hard stop.
- Cross-session resume, takeover, lock stealing, or stale-orphan continuation.
- Changing guarded Work.
- Changing any existing stop, budget, verification, review, settlement, close,
  learning-governance, ownership, or reporting rule.
- Adding public commands, documentation promises, persistent state, or
  supporting definition artifacts.
