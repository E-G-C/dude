# Feature Specification: Runner Reason-Code And Coverage Fix

## Purpose

The unattended runner establishes its own stop and its attribution: when a run cannot continue, the runner — not the model, and not the host it talks to — owns the terminal halt and the reason attached to it. Two narrow defects break that ownership at the host-exchange boundary.

First, when the host exchange dependency fails, the runner currently reuses whatever reason code the failure carried as its own halt reason. The host exchange is a caller-supplied, untrusted dependency, so an arbitrary foreign reason code can masquerade as the runner's attribution. The halt reason for an exchange failure must be a runner-owned reason code, never a caller-supplied arbitrary value, while the runner's own legitimate exchange-failure reason codes still pass through unchanged.

Second, the fallback terminal the runner emits when it cannot continue does not identify the target it orphaned. The target is always known at that point, and a coordinator reading a fallback terminal needs to know which unit of work was left unfinished. The target belongs on the fallback terminal — distinct from, and without disturbing, the evidence-derived halt report.

This is a small, bounded fix. It changes no recovery flow, adds no new subsystem or state, and preserves the existing evidence-derived halt-report contract exactly. It also closes the coverage gap the defects revealed: a regression check that an arbitrary error code cannot leak into the halt reason, and an integration check driven through the real terminal writer that proves both the runner-owned reason and the orphaned target on a genuine fallback.

## User Stories & Testing

### User Story 1 - Exchange failures are attributed only with runner-owned reason codes (Priority: P1)

As the runner that owns the stop and its attribution, when the host exchange dependency fails I want the terminal halt reason to be one of my own reason codes, never a caller-supplied arbitrary code, so that a foreign code cannot masquerade as the runner's attribution while my own legitimate exchange-failure reasons still surface truthfully.

**Why this priority**: The reason code is the runner's attribution of why it stopped. Letting an untrusted caller-supplied value become that attribution corrupts the one thing the runner is contracted to own, and it is the more consequential of the two defects.

**Independent Test**: Drive an exchange failure whose error carries a reason code that is not runner-owned and confirm the halt reason is a runner-owned exchange-failure code and never the foreign value. Drive an exchange failure whose error carries a legitimate runner-owned exchange-failure code and confirm it is carried through unchanged. Drive an exchange failure with no usable code and confirm the runner-owned default reason is used.

**Acceptance Scenarios**:

1. **Given** a host exchange that fails with an error carrying a reason code that is not runner-owned, **When** the runner emits its terminal halt, **Then** the halt reason is a runner-owned exchange-failure reason code and never the caller-supplied value.
2. **Given** a host exchange that fails with a legitimate runner-owned exchange-failure reason code, **When** the runner emits its terminal halt, **Then** that runner-owned code is carried through unchanged as the halt reason.
3. **Given** a host exchange that fails with no usable reason code, **When** the runner emits its terminal halt, **Then** the runner-owned default exchange-failure reason is used.

### User Story 2 - The fallback terminal identifies its target (Priority: P1)

As a coordinator reading a fallback terminal, I want the terminal to name which target the runner orphaned so that I can attribute an unfinished run to a specific unit of work without disturbing the evidence-derived halt report.

**Why this priority**: A fallback terminal that cannot say what it orphaned forces the coordinator to guess. The target is always available where the fallback is produced, so carrying it is both cheap and directly useful, and it must not change the separate halt-report contract.

**Independent Test**: Drive the runner to a fallback terminal and confirm it identifies the target it orphaned. Confirm the evidence-derived halt report is unchanged by the added target — an unresolvable target is still named unresolved and the report carries no top-level target field.

**Acceptance Scenarios**:

1. **Given** the runner emits a fallback terminal because it cannot continue, **When** the terminal is produced, **Then** it identifies the target it orphaned.
2. **Given** a fallback terminal that identifies its target, **When** the evidence-derived halt report is produced, **Then** that report is unchanged by the added target and continues to name an unresolvable target as unresolved with no top-level target field.

### User Story 3 - The attribution is protected by coverage from the real terminal writer (Priority: P2)

As a maintainer, I want a regression check that an arbitrary error code cannot become the halt reason and an integration check driven through the real terminal writer that proves both the runner-owned reason and the orphaned target, so that these two defects cannot silently return.

**Why this priority**: The fix is only durable if a test would catch its reversal. It builds on the two behavioral stories and turns them into standing evidence, exercised through the genuine production path rather than a fabricated fixture.

**Independent Test**: Confirm a regression check driven through the production entry point fails if a caller-supplied foreign code ever appears as the halt reason. Confirm an integration check driven through the real terminal writer asserts a runner-owned reason and the orphaned target on a genuine fallback terminal.

**Acceptance Scenarios**:

1. **Given** the attribution fix is in place, **When** an arbitrary caller-supplied error code is exercised through the production entry point, **Then** a regression check confirms the code does not appear as the halt reason and the runner-owned default is used.
2. **Given** the target fix is in place, **When** the real terminal writer is exercised through the production entry point, **Then** an integration check confirms the fallback terminal carries a runner-owned reason and the orphaned target, and the evidence-derived halt report is unchanged.

## Edge Cases

- A host exchange fails with an arbitrary or foreign reason code: the halt reason is the runner-owned default exchange-failure reason, not the foreign code.
- A host exchange fails with a legitimate runner-owned exchange-failure reason code: it still passes through unchanged as the halt reason.
- The runner produces a fallback terminal: it carries the target it orphaned, while the evidence-derived halt report is unchanged and adds no top-level target field to that report.

## Functional Requirements

- **FR-001:** When the host exchange dependency fails, the runner MUST attribute the resulting terminal halt using only a runner-owned exchange-failure reason code; a caller-supplied reason code that is not runner-owned MUST NOT appear as the halt reason, and the runner-owned default exchange-failure reason MUST be used in its place.
- **FR-002:** A legitimate runner-owned exchange-failure reason code carried by the failure MUST still be carried through unchanged as the halt reason.
- **FR-003:** The fallback terminal the runner emits when it cannot continue MUST identify the target it orphaned; this target is distinct from the evidence-derived halt report and MUST NOT alter that report.
- **FR-004:** A regression check MUST demonstrate, through the production entry point, that an arbitrary caller-supplied error code does not become the halt reason and is replaced by the runner-owned default.
- **FR-005:** An integration check MUST exercise the real terminal writer through the production entry point and assert both the runner-owned reason and the orphaned target on the fallback terminal.
- **FR-006:** The fix MUST preserve the runner's contract that it owns the stop and its attribution and MUST NOT change the evidence-derived halt-report contract or reopen the prior feature that established it.

## Key Entities

- **Runner-Owned Exchange-Failure Reason Code**: a member of the closed set of reason codes the runner itself may attribute to a failed host exchange. Only such a code may appear as the halt reason for an exchange failure; any other value falls back to the runner-owned default.
- **Fallback Terminal**: the terminal result the runner emits when it cannot continue. It carries the halt reason, the target it orphaned, and the evidence-derived halt report.
- **Evidence-Derived Halt Report**: the resolved-or-unresolved report the runner derives from run state and inspection evidence. It is distinct from the fallback terminal's target field and is unchanged by this fix.

## Success Criteria

- **SC-001:** For 100% of exchange failures whose caller-supplied reason code is not runner-owned, the terminal halt reason is a runner-owned code and never the caller-supplied value.
- **SC-002:** For 100% of the runner's own legitimate exchange-failure reason codes, the halt reason is carried through unchanged.
- **SC-003:** 100% of fallback terminals name the target they orphaned.
- **SC-004:** A regression check driven through the production entry point fails if an arbitrary caller-supplied error code ever appears as the halt reason, and an integration check driven through the real terminal writer fails if the fallback terminal lacks a runner-owned reason or the orphaned target.
- **SC-005:** The evidence-derived halt report is unchanged: every existing halt-report assertion still passes, no top-level target field is added to that report, and the prior feature that established it is not reopened.
- **SC-006:** Repository validation passes, the change introduces no new persistent workflow artifact, and it touches no other feature's package or execution state.

## Assumptions

- The integration test is reachable: the production entry point drives the real exchange, fallback, and terminal-writer path, so a genuine integration test is used and no documented-boundary fallback is needed. The idea's documented-boundary fallback was conditional on unreachability, which does not apply.
- No rollback is needed.
- Feature 013 is not reopened; its evidence-derived halt-report contract is preserved exactly.
- The runner "owns the stop and its attribution" contract is preserved.
- The target is always available where the fallback terminal is produced.
- The host exchange dependency is caller-supplied and therefore untrusted for attribution purposes.
- The existing guidance against holding run state in a shell environment already exists and is not duplicated here.

## Out of Scope

- Any broader runner recovery, continuity, or attribution refactor beyond the two named defects.
- The topology-first reset guidance itself, which is owned by Feature 021 and not this feature.
- Reopening, rolling back, or reworking Feature 013.
- Changing the evidence-derived halt-report shape or its resolved/unresolved semantics.
- Any new skill, agent, state file, board, command, execution lane, or registry.
- Adding another guidance entry against holding run state in a shell environment, which already exists.
- Rollback machinery.
