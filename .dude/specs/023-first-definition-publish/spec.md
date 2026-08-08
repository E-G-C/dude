# Feature Specification: First-Definition Publish

## Purpose

The coordinator can prepare a complete first definition, but the current procedure has no supported executable operation that publishes the prospective owner and package together. This leaves first definition dependent on unsupported manual transport.

This feature provides one coordinator-invokable operation for one selected direct draft and one new lean package. It publishes the owner transition plus the package specification, implementation plan, and canonical task list as one all-or-restored change.

The operation accepts only a valid first-definition transition. It preserves user-controlled intent exactly, refuses stale or conflicting state before mutation, runs established workspace definition validation before acceptance, and reports the canonical specification identity only after validation succeeds.

## User Stories & Testing

### User Story 1 - Publish one complete first definition (Priority: P1)

As the coordinator performing first definition, I want the selected draft owner and lean package core published together so that neither can survive without the other.

**Why this priority**: The missing executable edge blocks the supported first-definition lifecycle.

**Independent Test**: Begin with a valid direct draft and an absent target package, invoke the supported operation with exact staged content, and verify that the owner plus all three package-core artifacts match that content byte-for-byte while unrelated workspace content remains unchanged.

**Acceptance Scenarios**:

1. **Given** a valid selected direct draft and an absent target package, **When** publication succeeds, **Then** exactly four destination artifacts contain the staged bytes.
2. **Given** a missing package parent, **When** publication succeeds, **Then** the parent is created safely and contains only the three package-core artifacts.
3. **Given** a valid staged owner transition, **When** publication succeeds, **Then** the owner is defined at the exact canonical specification identity while its title, slug, and complete user-controlled sections remain unchanged.
4. **Given** successful workspace definition validation, **When** the transaction is accepted, **Then** the operation reports only the exact canonical specification identity.

### User Story 2 - Refuse stale or malformed transitions before mutation (Priority: P1)

As the coordinator, I want stale, conflicting, or malformed first-definition input rejected before any destination changes so that an incorrect owner cannot be established.

**Why this priority**: First definition establishes canonical ownership, and an incorrect transition would make later resolution unsafe.

**Independent Test**: Present stale preimage content, an existing package target, invalid lifecycle metadata, changed protected sections, and invalid definition-log appends. Confirm every case leaves the workspace byte-for-byte unchanged.

**Acceptance Scenarios**:

1. **Given** a current draft that no longer matches the staged preimage, **When** publication is requested, **Then** it is refused with no destination change.
2. **Given** any package-core target already exists, **When** publication is requested, **Then** it is refused without changing the owner or existing target.
3. **Given** a current owner that is not a draft with an empty package identity, or a staged owner that is not defined at the requested identity, **When** publication is requested, **Then** it is refused before mutation.
4. **Given** a changed title, slug, protected user-controlled section, or prior definition-log content, **When** publication is requested, **Then** it is refused before mutation.
5. **Given** a missing, rewritten, incomplete, or additional definition-log append, **When** publication is requested, **Then** it is refused before mutation.

### User Story 3 - Restore the exact prestate when final validation fails (Priority: P1)

As the coordinator, I want final definition validation inside the restoration boundary so that a globally invalid package cannot survive publication.

**Why this priority**: Some ownership and package defects are meaningful only after the prospective owner and package exist together.

**Independent Test**: Publish an otherwise valid stage whose canonical task ownership reference is malformed. Confirm final definition validation rejects it, the original draft is restored exactly, the new package and its newly created parent are absent, and an unrelated sentinel remains unchanged.

**Acceptance Scenarios**:

1. **Given** all four staged artifacts have been applied, **When** established workspace definition validation rejects the result, **Then** the original owner bytes are restored and every new package artifact is removed.
2. **Given** publication created the package parent, **When** final validation fails, **Then** that parent is removed if it is empty.
3. **Given** final validation cannot be invoked or complete successfully, **When** publication is attempted, **Then** the same exact restoration occurs and no success identity is reported.

## Edge Cases

- The selected draft changes after staging.
- A package-core target appears before the expected-missing check completes.
- The current owner is already defined or has a non-empty package identity.
- The staged owner uses the wrong lifecycle status or canonical identity.
- The title or slug changes while the protected sections remain otherwise identical.
- Any complete `## Idea`, `## Open Questions`, or `## Assumptions` section changes by one byte.
- Prior definition-log bytes are rewritten, the append is missing, or more than one event is appended.
- Final validation finds duplicate ownership, an incorrect owner reference, malformed canonical tasks, or invalid managed regions.
- Final validation cannot be invoked.
- An unrelated workspace artifact is present before publication.

## Functional Requirements

- **FR-001:** The supported operation MUST be invokable only for the coordinator's first-definition transaction over one explicitly selected direct draft and one new package.
- **FR-002:** The transaction MUST contain exactly four destinations: the selected owner plus the package specification, implementation plan, and canonical task list.
- **FR-003:** Publication MUST require the selected owner's exact staged preimage, a draft lifecycle status, and an empty current package identity.
- **FR-004:** The staged owner MUST change to the defined lifecycle status at the exact requested canonical identity while preserving its title, slug, and complete `## Idea`, `## Open Questions`, and `## Assumptions` bytes.
- **FR-005:** The staged owner MUST preserve the exact prior Coordinator Log prefix and append exactly one complete definition event.
- **FR-006:** All three package-core destinations MUST be expected missing through application, and missing parents MUST be created safely.
- **FR-007:** Publication MUST apply the four staged byte sequences exactly and MUST NOT mutate an unrelated workspace artifact.
- **FR-008:** The resulting workspace MUST pass the established definition validation before publication is accepted.
- **FR-009:** Any application or final-validation failure MUST restore every pre-write byte, remove every new artifact, and remove newly created empty parents.
- **FR-010:** Success MUST report only the exact canonical specification identity after validation and MUST create no persistent publication receipt, stage, registry, or workflow state.

## Key Entities

- **Prospective Owner**: The selected direct draft that becomes the defined owner of the new canonical specification identity.
- **Lean Package Core**: The package specification, implementation plan, and canonical task list.
- **Protected Intent Sections**: The complete `## Idea`, `## Open Questions`, and `## Assumptions` byte ranges.
- **Definition Event**: The one complete event appended after the exact prior Coordinator Log.
- **Final Definition Validation**: The established workspace-wide check that confirms ownership and package consistency before acceptance.

## Success Criteria

- **SC-001:** A valid request writes 100% of the four staged byte sequences exactly and changes zero unrelated artifacts.
- **SC-002:** Every listed stale, existing-target, lifecycle, identity, protected-section, and log-append violation is rejected with zero destination writes.
- **SC-003:** A final-validation failure restores the draft byte-for-byte, leaves all three package-core destinations absent, removes the newly created empty package parent, and preserves an unrelated sentinel byte-for-byte.
- **SC-004:** The supported operation cannot express a fifth destination, an additional supporting artifact, or an arbitrary destination collection.
- **SC-005:** The canonical specification identity is reported only after successful final validation, with no persistent publication state left behind.
- **SC-006:** Focused acceptance coverage detects removal of every transition condition and detects final validation moved outside the restoration boundary.

## Assumptions

- The coordinator selects the direct draft, derives the next monotonic package identity, and prepares the complete stage before invocation.
- Established definition validation remains the authority for global owner uniqueness, canonical owner references, task grammar, and managed-region validity.
- The all-or-restored guarantee covers failures caught by the active process; no process-loss or power-loss guarantee is added.
- No tracked execution state participates in first definition.

## Out of Scope

- Any generalized or arbitrary publishing surface, including caller-selected destination collections, additional supporting artifacts, redefinition or package repair, and tracked-execution publishing.
