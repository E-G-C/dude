# Feature Specification: Feature Focus Order

## Purpose

Ideas in flight before they become numbered specifications are identified only by name. When several are open at once and some depend on others, the next idea to develop is easy to lose, because ideas carry no ordering and alphabetical order is not the working order.

This feature makes the working order and status of in-flight ideas visible so the next idea to develop is unambiguous. It derives that view from feature-level dependencies declared on each idea together with lifecycle and execution state that already exists. It stores nothing new, adds no execution authority, and produces every surface only on request.

Two separate questions stay apart. Focus asks which item is active, next, later, blocked, or unordered. Logical order asks what must precede what for the goal to be reached. Declared dependencies answer the second and drive the first, and neither is guessed: when nothing distinguishes items, the view says so rather than inventing an order.

## User Stories & Testing

### User Story 1 - See focus buckets for in-flight ideas (Priority: P1)

As someone developing several ideas at once, I want each in-flight idea placed in a focus bucket so that I can see what is active, what is next, what is later, and what is blocked without rereading every idea.

**Why this priority**: With more than one idea open, the next idea to develop is guesswork until a derived focus view exists.

**Independent Test**: Provide a set of in-flight ideas with known lifecycle and execution state, request the focus view, and confirm every idea appears in exactly one of Active, Next, Later, Blocked, or Unordered while nothing is written.

**Acceptance Scenarios**:

1. **Given** several in-flight ideas, **When** the focus view is requested, **Then** each idea appears in exactly one focus bucket.
2. **Given** an in-flight idea with no ordering signal, **When** the focus view is requested, **Then** it appears as Unordered.
3. **Given** any request for the focus view, **When** it completes, **Then** no artifact is created or changed.

### User Story 2 - Derive hard order and Blocked from declared dependencies (Priority: P1)

As someone sequencing dependent ideas, I want the hard order and the Blocked bucket derived from dependencies I declare on each idea so that Blocked is never hand-set and the order reflects real prerequisites.

**Why this priority**: Dependencies between features recur in practice, and an order that ignores them points at the wrong next idea.

**Independent Test**: Declare a dependency from one idea to another, vary the target across not-defined, defined-but-incomplete, and fully complete, and confirm the dependent idea is Blocked exactly when the dependency is unmet and released when it is met, with Blocked derived rather than accepted as input.

**Acceptance Scenarios**:

1. **Given** idea A declares a dependency on idea B and B is incomplete, **When** the focus view is requested, **Then** A is Blocked.
2. **Given** B afterward has every task complete, **When** the focus view is requested, **Then** A is no longer Blocked on B.
3. **Given** a declared dependency that names no known idea, **When** the focus view is requested, **Then** the dependent idea is Blocked.
4. **Given** two ideas that each declare a dependency on the other, **When** the focus view is requested, **Then** both are Blocked and the view still completes.

### User Story 3 - Show a status board visual on demand (Priority: P2)

As someone orienting quickly, I want a status board visual of the same buckets on request so that I can read focus at a glance.

**Why this priority**: The board is a convenience view over the same derivation, and the text view already answers the core question.

**Independent Test**: Request the status board visual for a known set of ideas and confirm its lanes are exactly the five focus buckets, its per-idea membership matches the text view for the same input, and nothing is written.

**Acceptance Scenarios**:

1. **Given** a set of in-flight ideas, **When** the board visual is requested, **Then** its lanes are exactly the five focus buckets.
2. **Given** the same input, **When** both the text view and the board visual are requested, **Then** their bucket membership matches.
3. **Given** a defined idea shown on the board, **When** the board visual is requested, **Then** that idea is annotated with its specification number.

### User Story 4 - Show one feature's task order on demand (Priority: P3)

As someone checking a single feature's internal order, I want a per-feature view of its task order over the task dependencies that already exist so that I can see what must precede what inside that feature.

**Why this priority**: It renders data that already exists for one feature and is the most optional surface, so it can arrive last without blocking the rest.

**Independent Test**: Request the per-feature view for one feature and confirm it shows one node per task and one edge per existing task dependency, notes a dependency target that does not resolve rather than drawing it, and writes nothing.

**Acceptance Scenarios**:

1. **Given** one feature with task dependencies, **When** its per-feature view is requested, **Then** it shows one node per task and one edge per existing task dependency.
2. **Given** a task dependency whose target does not resolve, **When** the per-feature view is requested, **Then** the target is noted rather than drawn.
3. **Given** an idea with no defined package, **When** its per-feature view is requested, **Then** the view reports plainly and writes nothing.

## Edge Cases

- No ordering signal anywhere, so every in-flight idea is Unordered.
- A declared dependency that names no known idea.
- A dependency whose package is defined but incomplete.
- A dependency cycle between two or more ideas.
- Several ideas active at the same time.
- A per-feature task view whose data contains a dependency target that does not resolve.
- An idea that is defined but has no tasks.

## Functional Requirements

- **FR-001:** The system MUST derive a read-only focus view that assigns every in-flight idea to a focus bucket from declared dependencies plus lifecycle and execution state that already exists, without persisting any derived result.
- **FR-002:** An idea MUST be able to declare zero or more feature-level dependencies, each naming another idea by its stable idea identity.
- **FR-003:** The focus view MUST place each in-flight idea in exactly one of Active, Next, Later, Blocked, or Unordered.
- **FR-004:** The system MUST decide whether a declared dependency is met by one concrete, testable rule: a dependency is met only when the idea it names is defined, its package exists and reads cleanly, has at least one task, and has every task complete; a dependency that names no known idea is unmet.
- **FR-005:** The system MUST derive the Blocked bucket rather than accept it as hand-set, from unmet declared dependencies together with existing in-package blocking evidence.
- **FR-006:** The focus view MUST allow more than one idea to be Active at once and MUST NOT enforce a cap on the number of Active items.
- **FR-007:** When no signal distinguishes in-flight ideas, the system MUST report them as Unordered rather than inventing an order.
- **FR-008:** The system MUST render, only on request, a status board visual whose lanes correspond exactly to the focus buckets.
- **FR-009:** The system MUST render, only on request, a per-feature dependency visual over one feature's existing task order.
- **FR-010:** Every focus and visual surface MUST be read-only and non-persistent, writing no new artifact and leaving the workspace byte-for-byte unchanged.
- **FR-011:** Every focus and visual surface MUST identify an item by its stable idea identity and never by a package number.
- **FR-012:** The system MUST support an optional, hand-maintained tie-break ordering that orders only unblocked items, and whose absence changes nothing else.
- **FR-013:** A declared dependency field MUST validate cleanly under existing workspace validation, and a structured-collection form of that field MUST be rejected.

## Key Entities

- **Idea**: A unit of work identified by a stable idea identity that persists across its whole life. It carries a lifecycle state and zero or more declared dependencies.
- **Focus Bucket**: One of Active, Next, Later, Blocked, or Unordered. Each in-flight idea belongs to exactly one.
- **Declared Dependency**: A feature-level prerequisite recorded on an idea that names another idea by identity. It is met or unmet by the concrete rule in FR-004.
- **Optional Tie-break Order**: A hand-maintained ordering of idea identities used only to break ties among unblocked items. It is optional, and its absence changes nothing else.

## Success Criteria

- **SC-001:** For any input set of in-flight ideas, 100% appear in exactly one focus bucket, and repeating the request on the same inputs yields the same buckets, because the assignment is a deterministic function of declared dependencies and pre-existing state.
- **SC-002:** The met-versus-unmet determination is correct for all four dependency conditions (target not defined, target defined but incomplete, target fully complete, target naming no known idea) and for existing in-package blocking evidence, with Blocked never accepted as input.
- **SC-003:** A dependency cycle is reported with both endpoints Blocked and the evaluation terminates; two or more ideas can be Active at the same time; and an input with no ordering signal yields every in-flight idea Unordered.
- **SC-004:** The status board visual presents exactly the five focus buckets as lanes, and its per-idea membership equals the text view for the same input.
- **SC-005:** The per-feature visual presents one node per task and one edge per existing task dependency for the named feature, and an unresolved dependency target is noted rather than drawn.
- **SC-006:** Every focus and visual surface performs zero writes, adds no persistent artifact, and leaves the workspace byte-for-byte unchanged.
- **SC-007:** An idea that declares dependencies passes existing workspace validation with zero new findings, while a structured-collection form of the dependency field is rejected.

## Assumptions

- The idea is the stable identity for a feature across its whole life, so the focus view references idea identities and never needs rewriting when a numbered specification package is created.
- Order is user intent and cannot be inferred. Timestamps, alphabetical order, and specification numbering do not express which idea to develop next.
- This adds no second board and no execution authority. Idea lifecycle stays authoritative for state, and existing task records stay authoritative for execution.
- The optional tie-break ordering is optional. When it is absent, unblocked items simply carry no tie-break and nothing else breaks.
- Hard dependencies between ideas are declared explicitly on the idea. Finer-grained cross-feature task-level dependencies stay out of scope for this version.
- Task dependencies already recorded for a feature stay the single source of truth for that feature's task order, and this feature adds no second dependency store.
- Every view is derived and regenerable, so deleting a rendered view loses nothing that cannot be recomputed.

## Out of Scope

- The static HTML page and the decision of which bundle or pack ships its template.
- Cross-feature task-level dependencies.
- Any change that implements more than one feature in a single shipping action.
- A guard or validation rule against a foreign task-dependency reference. Placing another feature's task identity into a task-dependency field silently and permanently blocks that task, because task-dependency resolution is confined to one feature's own tasks and reports nothing for a target it cannot find. This footgun is recorded here as a documented non-goal, not a capability to build in this version.
