# Feature Specification: Simplify Work Command

## Purpose

Users need one predictable model for continuous Work: it processes ready work sequentially, one task at a time. A concurrency option that is accepted but has no effect creates false expectations and unnecessary command complexity.

This feature removes `--parallel` from the supported `@dude work` interface and removes its no-op policy representation. The removed option receives no deprecation, warning, alias, migration, hidden acceptance, or compatibility treatment. Invocations that contain it are invalid before work begins.

Safe parallel dispatch remains an internal coordinator capability outside Work. The `[P]` task marker remains useful as a planning, import, and dependency candidate signal, but it is never proof of safety and never authorizes fan-out by itself.

## User Stories & Testing

### User Story 1 - Use one sequential Work model (Priority: P1)

As a user, I want `@dude work` to have one obvious sequential behavior so I do not have to reason about a concurrency control that does nothing.

**Why this priority**: The command's behavior and accepted interface define the user mental model.

**Independent Test**: Exercise the plain and feature-selecting Work forms against several ready tasks, then exercise former parallel-option forms. Confirm accepted Work processes one task at a time and every removed-option form is rejected before work starts.

**Acceptance Scenarios**:

1. **Given** an active execution lane with ready work, **When** the user invokes `@dude work`, **Then** Work processes ready tasks sequentially, one task at a time.
2. **Given** multiple eligible Lightweight features, **When** the user invokes `@dude work <feature>`, **Then** the selector disambiguates the feature without changing sequential execution.
3. **Given** an invocation containing `--parallel` in any position or value form, **When** the invocation is validated, **Then** it is rejected as unsupported before any claim, authorization, counter change, or workflow mutation.
4. **Given** the removed option, **When** rejection occurs, **Then** no compatibility warning, alias, normalization, migration, or fallback behavior is offered.

### User Story 2 - Preserve safe internal coordination (Priority: P1)

As a maintainer, I want safe parallel dispatch and `[P]` metadata to retain their valid internal roles without making Work concurrent or exposing concurrency configuration to users.

**Why this priority**: Simplifying Work must not remove valid planning, import, dependency, or coordinator behavior.

**Independent Test**: Compare Work scheduling, task import, and generic coordinator dispatch using candidate tasks with dependencies, blockers, overlapping or unknown change sets, and proven disjoint change sets. Confirm Work remains sequential, `[P]` remains only a candidate signal, and generic dispatch still applies its existing safety proof.

**Acceptance Scenarios**:

1. **Given** several Work tasks marked `[P]`, **When** Work selects ready work, **Then** it still processes only one task at a time.
2. **Given** a task marked `[P]` but carrying a dependency, blocker, overlapping change set, or unknown change set, **When** generic parallel dispatch is considered, **Then** the marker alone authorizes nothing.
3. **Given** candidate tasks outside Work that satisfy the existing dependency, blocker, and disjoint-write safeguards, **When** the coordinator evaluates them, **Then** existing safe parallel dispatch remains available without user concurrency configuration.
4. **Given** `[P]` task metadata during planning or import, **When** dependencies are derived, **Then** its candidate meaning is retained without describing it as inherently safe or treating it as dispatch authority.

### User Story 3 - Present the simple path clearly (Priority: P2)

As a user reading Dude guidance, I want the simple Work forms shown first and advanced controls confined to detailed reference material so the normal path is easy to discover.

**Why this priority**: Correct behavior remains confusing if primary guidance foregrounds advanced controls or inaccurate safety terminology.

**Independent Test**: Inspect primary guidance, detailed command reference, coordinator authority text, examples, and task-import guidance. Confirm primary material leads with `@dude work` and `@dude work <feature>`, useful advanced controls remain documented in detail, and current guidance contains neither the removed option nor claims that `[P]` proves parallel safety.

**Acceptance Scenarios**:

1. **Given** primary Work guidance, **When** a user encounters its first runnable examples, **Then** the examples are `@dude work` and `@dude work <feature>`.
2. **Given** the detailed command reference, **When** a user needs advanced controls, **Then** the remaining supported limits, recovery controls, and policy controls are still documented.
3. **Given** current command, authority, example, and reference material, **When** it is inspected, **Then** `--parallel` is absent.
4. **Given** current task and import guidance, **When** `[P]` is described, **Then** it is called a candidate or independence signal whose use still requires separate safety proof.

## Edge Cases

- `--parallel` appears alone, after a feature selector, between valid options, with a separate value, or in an equals-sign form.
- The removed option is combined with otherwise valid limits, recovery controls, or policy controls.
- A supplied Work policy contains an obsolete concurrency field even though the current policy contract does not.
- No task is ready, exactly one task is ready, or several tasks are ready.
- Every ready task is marked `[P]`.
- A `[P]` task has a direct or transitive dependency on another candidate.
- Candidate tasks share a target, have unknown write sets, or carry an unresolved blocker.
- `[P]` metadata suppresses an inferred sibling dependency during import but is later mistaken for dispatch authorization.
- Safe generic parallel dispatch is evaluated outside Work after the Work option has been removed.
- Primary documentation needs concise examples while detailed documentation still needs advanced supported controls.
- Historical definition records describe the former contract but do not define current behavior.

## Functional Requirements

- **FR-001**: `@dude work` MUST remain a sequential accelerator that processes one ready task at a time.
- **FR-002**: `@dude work <feature>` MUST retain feature-selection behavior without changing sequential execution.
- **FR-003**: `--parallel` MUST be absent from the supported Work command syntax and accepted option set.
- **FR-004**: Every invocation containing `--parallel` MUST be rejected as unsupported before any claim, authorization, counter change, or workflow mutation.
- **FR-005**: The removed option MUST have no deprecation, warning, alias, hidden acceptance, normalization, migration, compatibility state, or fallback path.
- **FR-006**: The current Work policy and state contract MUST contain no parallel-capacity or removed-option compatibility field.
- **FR-007**: Directly related dead validation and derived evidence for the removed field MUST be removed without broadly refactoring Work.
- **FR-008**: Existing safe generic parallel dispatch outside Work MUST remain an internal coordinator capability and MUST expose no user concurrency setting.
- **FR-009**: `[P]` MUST remain only a candidate or independence signal for planning, import, dependency handling, and internal dispatch consideration.
- **FR-010**: `[P]` alone MUST NOT prove safety or authorize fan-out; actual parallel dispatch MUST still require the existing dependency, blocker, and known-disjoint-write safeguards.
- **FR-011**: Task import MUST preserve the existing dependency meaning of `[P]` without calling the task inherently parallel-safe or parallel-eligible.
- **FR-012**: Primary guidance MUST lead with `@dude work` and `@dude work <feature>`; genuinely useful advanced controls MAY remain in detailed reference material.
- **FR-013**: Current command descriptions, authority guidance, examples, and user reference material MUST contain no obsolete Work option or inaccurate `[P]` safety claim.
- **FR-014**: The feature MUST add no parallel Work execution, concurrent recovery, queue, lock, scheduler, lane, state surface, command, alias, or concurrency setting.

## Key Entities

- **Work Invocation**: A user request to continue ready work in the already active execution lane, optionally selecting one Lightweight feature and using supported advanced controls.
- **Work Policy**: The current limits, recovery choice, stop behavior, and execution policy for one Work invocation. It contains no concurrency capacity.
- **Parallel Candidate Signal**: The `[P]` task marker, which contributes planning and dependency information but provides no independent dispatch authority.
- **Safe Parallel Dispatch Decision**: An internal coordinator decision outside Work that requires the existing dependency, blocker, readiness, and known-disjoint-write proof.

## Success Criteria

- **SC-001**: Across all accepted Work scheduling fixtures with zero, one, or several ready tasks, the number of tasks processed concurrently never exceeds one; whenever work is processed, exactly one task is processed at a time.
- **SC-002**: Across 100% of former parallel-option placement and value forms, validation rejects the invocation before mutation and emits zero compatibility, warning, alias, normalization, migration, or fallback outcomes.
- **SC-003**: Across 100% of current Work policy and state outputs, zero fields represent parallel capacity or removed-option compatibility.
- **SC-004**: In dependency, blocker, overlap, and unknown-write-set fixtures, `[P]` alone authorizes zero fan-out decisions; existing qualifying generic-dispatch fixtures retain their prior behavior outside Work.
- **SC-005**: The first runnable Work examples in every primary guide use `@dude work` or `@dude work <feature>`, while detailed guidance retains all other supported advanced controls.
- **SC-006**: Current command, authority, example, documentation, and pack-guidance surfaces contain zero references to `--parallel`, `policy.parallel`, or descriptions of `[P]` as inherently parallel-safe or parallel-eligible.
- **SC-007**: Existing accepted behavior for Work limits, recovery, execution policy, lane selection, verification, review, ownership, and stop conditions remains unchanged.
- **SC-008**: Acceptance introduces zero concurrency settings, commands, aliases, lanes, queues, locks, schedulers, or persistent state surfaces.

## Assumptions

- Existing sequential Work behavior is correct and remains the implementation base.
- Existing generic parallel-dispatch safeguards already own actual fan-out decisions outside Work.
- Existing `[P]` parsing and import behavior remains useful and does not need redesign.
- Work run state is current-format transient state; obsolete shapes receive no migration or compatibility treatment.
- Historical idea and definition artifacts remain audit evidence and do not define the current command contract.
- This feature has no progress objective and compiles no objective registry.

## Out of Scope

- Parallel or concurrent Work execution.
- Concurrent recovery or more than one pending Work authorization.
- Queues, locks, schedulers, worker pools, or concurrency limits.
- A replacement command, alias, warning, deprecation period, migration, or compatibility layer.
- A user-facing concurrency preference or setting.
- Redesigning generic safe parallel dispatch.
- Removing `[P]` from planning, task import, or dependency representation.
- Broad refactoring of Work runtime, task parsing, recovery, or scheduling.
- Rewriting historical idea, specification, plan, task, checklist, or execution-history records that document earlier accepted behavior.