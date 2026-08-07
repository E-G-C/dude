# Feature Specification: Remove Unused Authority Surfaces

## Purpose

The Work runtime contains several internal authority and compatibility surfaces that current production routing does not call. Keeping them implies capabilities that do not exist, increases the area that must be understood and maintained, and leaves documentation describing an objective-execution system that was never wired into the production runner.

This feature removes those confirmed-dead surfaces rather than hardening, wiring, replacing, or migrating them. The accepted two-pass topology audit is the scope gate. The live production route, its ten adapter operations, its four governance actions, ordinary audit and inspection behavior, lane effects, the terminal `finish(row)` chokepoint, and the bytes emitted by that route remain unchanged.

## User Stories & Testing

### User Story 1 - Remove dead halt, suspension, and legacy-audit routes (Priority: P1)

As a maintainer, I want unreachable halt attribution, suspension scheduling, and legacy audit-rendering compatibility routes removed so that the runtime exposes only capabilities used by the production runner.

**Why this priority**: These are isolated dead authority surfaces whose removal reduces misleading dispatch and transport contracts without changing ordinary Work.

**Independent Test**: Inspect the production runner and exercise its ordinary audit, settlement, and terminal behavior; confirm it constructs none of the removed actions, accepts no removed transport branch, and emits the same live result bytes.

**Acceptance Scenarios**:

1. **Given** the production Work runner, **When** its constructed governance actions are enumerated, **Then** the set is exactly `review-learning`, `bind-alternative`, `verify-no-progress`, and `controlled-end`.
2. **Given** the adapter audit operation, **When** an ordinary audit is performed, **Then** it uses the live versioned audit path without an optional halt-attribution payload.
3. **Given** a live hard stop, **When** the runner reaches its terminal chokepoint, **Then** `describeUnattendedHalt` still supplies the halt report and the emitted result bytes are unchanged.
4. **Given** the removed legacy renderer and transition routes, **When** authoritative source and generated projections are inspected, **Then** those symbols and routes are absent.

### User Story 2 - Remove the unwired objective execution subsystem safely (Priority: P1)

As a maintainer, I want the documented-but-unwired objective execution, checkpoint, gate, comparison, event, reference, and sequence machinery deleted while live registry acquisition, RunState validation, recovery identities, shared projections, and audits remain intact.

**Why this priority**: This is the largest source of dead complexity, but its code is interleaved with live shared helpers and therefore must be removed at symbol granularity.

**Independent Test**: Compare the deletion manifest and KEEP manifest against authoritative source after each deletion batch; confirm every dead symbol is absent, every mandatory KEEP symbol remains, and inspect, validation, audit, and ordinary Work tests continue to pass.

**Acceptance Scenarios**:

1. **Given** the dead objective execution manifest, **When** deletion completes, **Then** its constructors, candidate checkpoint lifecycle, comparators, five gates, objective events, reference eviction, sequence close, and task-boundary wrappers are absent.
2. **Given** Objective Registry inspection, **When** a definition plan is acquired, **Then** evaluation-contract and registry validation still work without starting an evaluation sequence.
3. **Given** existing RunState containing optional evaluation-sequence or learning-review references, **When** it is validated, authorized, or closed through a live guard, **Then** the retained validators and guards still enforce their existing contract.
4. **Given** definition recovery, shared event projection, or live audit, **When** it uses shared identities, write sets, acquisition helpers, or projection evidence, **Then** those helpers remain available and unchanged.
5. **Given** an unexpected current caller of a symbol classified for deletion, **When** it is discovered, **Then** implementation stops for a contract mismatch rather than deleting the caller or expanding the feature.

### User Story 3 - Leave current contracts truthful and focused (Priority: P1)

As a maintainer, I want current documentation and tests to describe only reachable production behavior so that dead direct exports do not masquerade as supported capabilities.

**Why this priority**: Deleting code while retaining false documentation or direct-export tests would preserve the same misleading authority surface in another form.

**Independent Test**: Review current Work documentation and contract assertions, confirm they no longer describe objective execution or removed transitions as active, and verify focused checks cover the closed runner operations/actions plus live finish, audit, inspect, and validation behavior.

**Acceptance Scenarios**:

1. **Given** current Work documentation, **When** it is read after the change, **Then** it describes Objective Registry acquisition as inspection evidence only and does not claim that production Work executes the removed objective subsystem.
2. **Given** direct tests of deleted exports, **When** tests are updated, **Then** those tests are deleted rather than recreated one-for-one.
3. **Given** focused production-topology tests, **When** they run, **Then** they prove the runner operation and governance-action sets remain closed and live finish, inspect, audit, and lane behavior remain unchanged.
4. **Given** historical `.dude/ideas` and `.dude/specs` artifacts, **When** current documentation is corrected, **Then** historical artifacts remain untouched as provenance.

## Edge Cases

- A symbol marked dead has an unexpected current production caller. Stop before deleting it; do not widen scope or silently remove the caller.
- A dead function shares constants or helpers with live registry acquisition, RunState validation, definition recovery, projection, halt reporting, or audit. Delete only the exclusive symbol and retain the shared dependency.
- Removing optional `audit.halt` leaves ordinary immediate-halt projection evidence in use. Keep `immediateHaltProjectionEvidenceV2`.
- Removing objective execution leaves evaluation-sequence validation and optional RunState carry in use. Keep those validators and guards even if no production caller creates a new sequence.
- A direct test exists solely to call a dead export. Delete the test instead of preserving an alias or test-only export.
- Current documentation and historical definition artifacts disagree. Correct only current product documentation; preserve historical artifacts.
- Generated `.github/` output still contains a removed symbol after source deletion. Treat that as projection drift and rebuild from `src/`; never patch the generated copy.
- A proposed cleanup produces no net source-and-test line reduction. Reject the replacement machinery and simplify further.

## Functional Requirements

- **FR-001:** The production Work topology MUST remain `main() -> runHostAdapter() -> createHostAdapter() -> recovery.runCommand()`, ending through the existing `finish(row)` chokepoint.
- **FR-002:** The production runner MUST continue to construct exactly four governance actions: `review-learning`, `bind-alternative`, `verify-no-progress`, and `controlled-end`.
- **FR-003:** The runner's ten semantic adapter operations MUST remain unchanged: `fresh-inspection`, `authorize-attempt`, `record-attempt-result`, `settle-effect`, `advance-governance`, `prepare-authoritative-projection`, `authorize-lane-effect`, `apply-lane-effect`, `commit-lane-receipt`, and `audit-run`.
- **FR-004:** The system MUST remove the dead halt-attribution surface, including `haltGovernanceV2`, the `transition/halt` route, its action and adapter mappings, and the optional `audit.halt` transport and branch.
- **FR-005:** The system MUST remove suspension scheduling and the `suspend-target` transition, including `suspendTargetV2`, `mayScheduleAfterStop`, and their command, action, and adapter wiring.
- **FR-006:** The system MUST remove the unversioned legacy audit renderer `renderAuditSummary`, its exclusive private helpers and constants, and tests that directly exercise that renderer.
- **FR-007:** The system MUST remove the unwired objective execution subsystem at symbol granularity, including candidate checkpoints, comparators, all five retention gates, objective comparison and sequence-close events, reference eviction, sequence close, and task-boundary wrappers.
- **FR-008:** The system MUST remove `classifyHaltScopeV2` and `deriveImmediateHaltEndV2` after the optional `audit.halt` branch is removed, while retaining `immediateHaltProjectionEvidenceV2`.
- **FR-009:** The objective deletion MAY remove `deriveCheckpointIdentity`, `deriveCandidateIdentity`, `deriveRubricHash`, and `deriveBindingIdentity`, but MUST retain `deriveSequenceIdentity`, `stateIdentity`, and `writeSetIdentity`.
- **FR-010:** Objective Registry and evaluation-contract acquisition MUST remain available through `validateEvaluationContract`, `validateObjectiveRegistry`, `scanObjectiveRegistry`, and inspect-reached `normalizeDefinitionPlan`.
- **FR-011:** Existing RunState validators and guards MUST remain, including evaluation-sequence and learning-review reference validation, projection-reference validation, evaluation-sequence row handling, learning-review binding, active-sequence authorization and close guards, and optional RunState carry.
- **FR-012:** Definition-recovery identities, write sets, file-state descriptors, and their applicable limits MUST remain available.
- **FR-013:** Shared event, acquisition, and projection helpers used by live flows, including `buildProjectionRecord`, MUST remain available.
- **FR-014:** Live halt reporting MUST retain outcome-reason classification, unattended-loop termination, halt next actions, halt state conditions and subject derivation, and `describeUnattendedHalt`.
- **FR-015:** Live audit and validation MUST retain `validateSuspensionV1`, `validateAuditSummaryV2`, `retainedGovernanceProjectionV2`, `immediateHaltProjectionEvidenceV2`, `reboundBranchEvidenceV2`, `auditGovernanceV2`, and `auditRun`.
- **FR-016:** Current documentation and current-format contract assertions MUST stop describing the deleted objective execution and transition surfaces as active production capabilities.
- **FR-017:** Direct dead-export tests MUST be removed rather than replaced one-for-one; replacement coverage MUST be limited to focused proof of the closed runner topology and preserved live behavior.
- **FR-018:** Authoritative source and generated `.github/` projections MUST contain none of the mandatory delete symbols or route tokens after regeneration.
- **FR-019:** The change MUST be net-negative in authoritative source-and-test lines and MUST add no replacement framework, state, schema, alias, migration, authority abstraction, or new capability.
- **FR-020:** Historical `.dude/ideas` and `.dude/specs` artifacts MUST remain unchanged during implementation.
- **FR-021:** Discovery of any unexpected live caller for a mandatory-delete symbol MUST stop implementation as a contract mismatch rather than expanding scope.

## Key Entities

- **Production route**: The ordinary Work path from the host-adapter runner through the adapter to recovery and finally `finish(row)`.
- **Dead surface**: A constructor, transition, transport field, renderer, helper, event, or wrapper with no current production caller.
- **Deletion manifest**: The fixed symbol-and-route set authorized for removal by the two-pass topology audit.
- **KEEP carve-out**: A live or shared symbol, guard, helper family, operation, or action that must survive nearby deletion.
- **Generated projection**: The committed `.github/` copy rebuilt from authoritative `src/`, never edited directly.
- **Historical artifact**: Existing `.dude/ideas` and `.dude/specs` content retained as provenance rather than rewritten to match current documentation.

## Success Criteria

- **SC-001:** All 40 named mandatory-delete symbols and route tokens are absent from authoritative `src/` and generated `.github/` projections.
- **SC-002:** All 26 named mandatory KEEP symbols, the grouped live helper families, the ten adapter operations, and the four production governance actions remain present.
- **SC-003:** Focused regression evidence shows no change to the production runner's action or operation sets, ordinary inspect/audit/lane behavior, `finish(row)` terminal routing, or emitted result bytes.
- **SC-004:** Objective Registry acquisition and retained RunState, definition-recovery, projection, halt-reporting, and audit tests pass without recreating objective execution.
- **SC-005:** Current Work documentation and current-format assertions no longer present the deleted objective execution, halt attribution, suspension scheduling, or legacy renderer as live capabilities.
- **SC-006:** The complete discovered test suite passes, generated `.github/` files are byte-consistent with `src/`, and Dude lint reports zero failures.
- **SC-007:** Authoritative source-and-test line counts decrease overall, with no replacement framework, alias, migration, state, schema, or new capability added.
- **SC-008:** Independent review confirms the deletion manifest, KEEP carve-outs, live-byte preservation, generated projection, and historical-artifact non-mutation.

## Assumptions

- The two independent current-source audits and coordinator conflict resolution are accepted as sufficient topology evidence for first definition.
- Recovery CLI access, direct exports, and direct tests are internal compatibility surfaces and do not establish a production caller.
- Objective Registry parsing and RunState validation remain useful independently of objective execution and therefore are not evidence that the execution subsystem is live.
- Existing focused tests can preserve live behavior without building a new topology framework or retaining dead exports for test access.
- Generated `.github/` core files are rebuilt only from `src/`.
- No supporting data-model, API, UX, security, migration, or compatibility artifact applies to this deletion feature.

## Out of Scope

- Wiring or completing the objective execution subsystem.
- Adding a replacement objective engine, checkpoint framework, authority layer, migration, alias, or compatibility route.
- Changing the ten adapter operations or four production governance actions.
- Changing ordinary Work behavior, output bytes, lane effects, audit semantics, halt reporting, or `finish(row)`.
- Broad line-range deletion without symbol and reference verification.
- Rewriting historical `.dude/ideas` or `.dude/specs` artifacts.
