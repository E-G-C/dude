# Feature Specification: Ship Command

**Idea owner**: `.dude/ideas/ship-command.md`

## Purpose

Users commonly want one command to carry a feature through the existing lifecycle instead of separately invoking brainstorm, define, and Work or recalling Work's autonomous controls. The successful handoff after definition adds friction when the user already trusts the generated package, while the package itself remains valuable as the durable work ledger.

`@dude ship [<target>]` is the usual convenience verb for advancing one target until it is done or reaches an existing Work stop. It resolves only the lifecycle steps the target still needs, then delegates to the existing Work behavior with one fixed autonomous, numerically unlimited recovery policy. It removes no specification, checkpoint, authority, safety gate, verification, review, close rule, audit, or report.

Ship is additive. It creates no workflow, lane, state, configuration, or execution mechanism of its own, and it changes no existing command's behavior.

## User Stories & Testing

### User Story 1 - Advance through the existing lifecycle (Priority: P1)

As a user, I want one command to resolve whether my target needs brainstorm, definition, or only Work so that I can move from an idea to implementation without a routine handoff between those existing stages.

**Why this priority**: Lifecycle resolution is the command's primary value.

**Independent Test**: Exercise Ship with an unmatched raw idea, an existing draft ledger, an existing defined package, and a bare invocation with one live target. Confirm each case enters only the missing existing stages, preserves their behavior, and reaches Work when no existing checkpoint stops it.

**Acceptance Scenarios**:

1. **Given** a target that matches no existing ledger or package and expresses one bounded idea, **When** Ship resolves it, **Then** the existing brainstorm path creates exactly one ledger, the existing definition path defines it, and the target proceeds to Work unless either existing path stops.
2. **Given** an existing draft ledger, **When** Ship resolves it, **Then** the existing definition path runs and successful definition proceeds directly to Work.
3. **Given** an existing defined package, **When** Ship resolves it, **Then** the package proceeds to Work as-is without proactive redefinition, staleness detection, drift checking, or intent merging.
4. **Given** exactly one unambiguous live target, **When** the user invokes bare Ship, **Then** that target follows the same lifecycle resolution.

### User Story 2 - Fail closed on unsafe or ambiguous selection (Priority: P1)

As a user, I want Ship to reject unsupported controls and ambiguous or conflicting targets before mutation so that convenience never turns uncertain selection into an implicit decision.

**Why this priority**: A lifecycle shortcut must preserve canonical ownership and tracked-work authority.

**Independent Test**: Exercise unsupported flag forms, multiple otherwise-valid candidates, ownership and resolver diagnostics, and an explicit target that conflicts with active tracked work. Confirm rejection or one exact disambiguation question occurs before mutation and no default is inferred or saved.

**Acceptance Scenarios**:

1. **Given** a Ship invocation containing any flag, **When** it is validated, **Then** it fails before mutation, identifies the equivalent advanced Work usage, and performs no hidden normalization.
2. **Given** several otherwise-valid lifecycle candidates, **When** Ship resolves the target, **Then** it asks exactly one disambiguation question listing the exact candidates and performs no mutation.
3. **Given** an answer to the disambiguation question, **When** Ship continues, **Then** resolution restarts from that answer without ranking candidates or persisting a default.
4. **Given** a resolver or canonical-ownership diagnostic that target selection cannot repair, **When** Ship encounters it, **Then** it remains a hard refusal.
5. **Given** active imported tracked work and an explicit target that conflicts with it, **When** Ship validates the request, **Then** it stops before mutation and reports tracked precedence.

### User Story 3 - Reuse Work without weakening it (Priority: P1)

As a user, I want Ship to use the established autonomous Work behavior so that its shorter interface retains every existing stop, verification, review, ownership, and close guarantee.

**Why this priority**: Ship is safe only if it composes Work rather than creating a second execution policy.

**Independent Test**: Capture the normalized Work delegation after lifecycle resolution in Lightweight and Tracked conditions, then exercise clarification, guardrail, verification, review, no-ready-work, and tracked-definition-recovery stops. Confirm the fixed policy is exact and all existing outcomes remain unchanged.

**Acceptance Scenarios**:

1. **Given** successful lifecycle resolution, **When** Ship delegates the resolved target to Work, **Then** the normalized policy has an unlimited overall authorization budget, recovery enabled, an unlimited exact-target recovery-cycle budget, autonomous policy, and no until-blocked mode.
2. **Given** imported tracked work, **When** Ship reaches execution, **Then** Work's existing one-time lane detection selects Tracked Execution; otherwise a newly defined package uses Lightweight Execution.
3. **Given** an existing brainstorm or definition clarification or guardrail-ratification checkpoint, **When** Ship reaches it, **Then** the checkpoint stops for the user's answer exactly as it does without Ship.
4. **Given** any existing Work natural stop or hard stop, **When** it occurs during Ship, **Then** Ship returns that stop without bypass, minimization, reclassification, or a new retry path.
5. **Given** tracked definition recovery would be required, **When** autonomous Work evaluates it, **Then** the existing tracked refusal remains authoritative.

### User Story 4 - Keep simple and advanced control distinct (Priority: P2)

As a user, I want Ship to be the obvious convenience verb while Work remains available for custom controls so that the normal path is memorable without reducing advanced control.

**Why this priority**: Clear positioning prevents a preset from expanding into a second configurable workflow.

**Independent Test**: Inspect current command guidance and exercise both verbs. Confirm Ship is presented with only an optional target, Work retains its advanced controls and defaults, `go` is not accepted, and Ship introduces no configuration, report, Git action, or release meaning.

**Acceptance Scenarios**:

1. **Given** primary command guidance, **When** a user looks for the usual implementation path, **Then** Ship is presented as the convenience verb and Work as the advanced form for custom controls.
2. **Given** an existing Work invocation, **When** Ship is available, **Then** the Work invocation retains its prior defaults and behavior.
3. **Given** the rejected verb `go` or another alias, **When** it is invoked as Ship, **Then** it receives no alias or compatibility treatment.
4. **Given** a Ship run, **When** lifecycle and execution proceed, **Then** no branch, worktree, commit, push, reset, release, new report, or task-count checkpoint is created automatically.

## Edge Cases

- A target-like token begins with `-`, a flag appears before or after a target, or a flag uses an equals-sign form.
- A user supplies more than one target or combines a target with otherwise valid Work controls.
- Bare Ship sees no live target, one live target, or several otherwise-valid live targets.
- A raw request contains several bounded outcomes and the existing brainstorm split question is required.
- A draft definition requires clarification or reaches the guardrail-ratification checkpoint.
- A defined package appears stale or differs from new text in the Ship invocation.
- Candidate labels look similar but their exact identities differ.
- A candidate answer remains ambiguous or exposes a canonical-ownership diagnostic.
- Imported tracked work exists but has no ready issue, or the explicit Ship target names a different local package.
- A defined package has no ready task because it is complete, blocked, or inconsistent.
- Autonomous Work reaches verification failure, reviewer rejection, no-progress governance, exhausted external authority, or tracked definition recovery.
- Git isolation would be useful under current recommendations but the user has not opted into it.
- A future release action needs a verb after Ship has claimed its lifecycle meaning.

## Functional Requirements

- **FR-001**: The product MUST provide `@dude ship [<target>]` with exactly one optional target and no supported flags.
- **FR-002**: Ship MUST mean advance the selected target until it is done or reaches an existing Work stop; it MUST NOT promise unconditional completion.
- **FR-003**: Any unsupported Ship flag or extra target MUST fail before mutation; a flag-bearing form MUST point to the equivalent Work usage for custom controls.
- **FR-004**: The public verb MUST be `ship`; `go` and every other alias, profile, hidden normalization, and compatibility spelling MUST remain unsupported.
- **FR-005**: An unmatched raw idea MUST use the existing brainstorm path to create exactly one ledger, then the existing definition path, then Work.
- **FR-006**: An existing draft ledger MUST use the existing definition path and, after successful definition, continue directly to Work.
- **FR-007**: An existing defined package MUST continue to Work as-is, without proactive redefinition, staleness detection, drift checking, or merging invocation text into intent.
- **FR-008**: Bare Ship MUST resume exactly one unambiguous live target.
- **FR-009**: Several otherwise-valid candidates MUST cause a pre-mutation refusal with exactly one disambiguation question listing their exact identities; resolution MUST restart from the answer without ranking, inference, or persisted default.
- **FR-010**: Resolver and canonical-ownership diagnostics that selection cannot repair MUST remain hard refusals.
- **FR-011**: New or changed intent for an existing ledger or package MUST require explicit brainstorm, and deliberate package refresh MUST require explicit define.
- **FR-012**: After lifecycle resolution, Ship MUST delegate the resolved target with the exact normalized Work policy: unlimited overall authorization budget, recovery enabled, unlimited exact-target recovery-cycle budget, autonomous policy, and until-blocked absent.
- **FR-013**: Ship MUST delegate to existing Work semantics and MUST NOT copy, replace, minimize, or reinterpret Work's implementation.
- **FR-014**: Work's existing one-time lane detection MUST remain authoritative; imported tracked work MUST take precedence, and otherwise a newly defined package MUST use Lightweight Execution.
- **FR-015**: Ship MUST NOT invoke track, import work into Beads, change tracked-definition recovery, or create another lane-selection rule.
- **FR-016**: An explicit target that conflicts with active imported tracked work MUST stop before mutation and report tracked precedence.
- **FR-017**: Existing brainstorm and definition clarification and guardrail-ratification checkpoints MUST remain user-controlled; Ship MUST NOT answer them, convert ambiguity into assumptions, or grant a one-round bypass. Existing focused questions MAY be batched only for presentation.
- **FR-018**: Existing lean-definition gates and review behavior MUST remain unchanged; Ship MUST add no depth dial, complexity score, or conditional review policy.
- **FR-019**: Every existing Work natural stop, hard stop, validation rule, verification rule, review rule, ownership gate, reconciliation rule, close protocol, audit, final report, and autonomous learning-governance rule MUST remain unchanged.
- **FR-020**: Git isolation MUST remain optional under current recommendations; Ship MUST NOT automatically branch, create a worktree, commit, push, reset, or release.
- **FR-021**: Ship MUST add no finite iteration ceiling, task-count checkpoint, new report, ledger, or dependency on a good-enough-delivery mechanism.
- **FR-022**: Current guidance MUST present Ship as the usual convenience verb and Work as the advanced form for custom limits, recovery, and policy.
- **FR-023**: Ship MUST introduce no new workflow, lane, board, state file, second ledger, concurrency mechanism, scheduler, configuration, profile, or persistent default.
- **FR-024**: No existing verb, invocation, default, authority boundary, or current workflow behavior MAY change merely because Ship exists.
- **FR-025**: Ship MUST carry lifecycle advancement rather than release publication semantics; a future release action remains free to use `release` or `publish`.

## Key Entities

- **Ship Invocation**: One optional target with no flags, validated before any lifecycle mutation.
- **Lifecycle Candidate**: An otherwise-valid raw idea, draft ledger, defined package, or authoritative tracked target that Ship may select using current identity rules.
- **Canonical Defined Target**: A package with exactly one owner whose exact recorded specification path matches that package.
- **Active Tracked Work**: Imported tracked work that remains authoritative over local Lightweight candidates, including when no tracked task is ready.
- **Normalized Work Policy**: The fixed Ship delegation of unlimited overall authorization, recovery enabled, unlimited exact-target recovery cycles, autonomous policy, and no until-blocked mode.

These entities describe existing inputs and authority. Ship persists no new entity.

## Success Criteria

- **SC-001**: In 100% of lifecycle-matrix fixtures for unmatched raw idea, draft ledger, defined package, and one unambiguous bare target, Ship enters exactly the required existing stages in the required order and no others.
- **SC-002**: In 100% of unsupported flag, equals-sign, extra-target, and reordered-input fixtures, Ship rejects before mutation with zero alias or normalization outcomes; every flag-bearing fixture identifies equivalent advanced Work usage.
- **SC-003**: In every multiple-candidate fixture, Ship performs zero mutation, asks one question containing every exact candidate identity, and stores no default; the answer triggers a fresh resolution pass.
- **SC-004**: In every tracked-precedence fixture, active imported tracked work wins; a conflicting explicit target produces zero lifecycle mutation, and a no-ready tracked state never falls through to Lightweight.
- **SC-005**: Every successful Ship handoff passes the resolved target and exactly the fixed normalized Work policy in FR-012 and never enables until-blocked mode.
- **SC-006**: Regression scenarios for clarification, guardrail ratification, lean definition, verification, review, ownership, reconciliation, close, audit, reporting, learning governance, and tracked definition recovery produce the same stops and authorities with and without Ship.
- **SC-007**: Acceptance adds zero workflows, lanes, boards, persistent state surfaces, configuration fields, profiles, aliases, schedulers, concurrency mechanisms, automatic Git actions, reports, or task-count checkpoints.
- **SC-008**: Every primary command guide presents Ship as the usual convenience path, retains explicit brainstorm and define for intent control, retains Work as the advanced escape hatch, and contains zero claims that Ship publishes a release or guarantees completion.

## Assumptions

- The current brainstorm, definition, Work, Lightweight, and Tracked contracts are available and remain authoritative.
- Existing target and canonical-ownership resolution can distinguish raw input, draft ledgers, defined packages, and active tracked work without a new identity system.
- Existing Work behavior already supports the complete normalized policy required by Ship.
- Existing Work lane detection treats any imported tracked issue inventory as authoritative, including when nothing is ready.
- "Done" continues to mean completion under the active lane's existing verification, review, and close protocol.
- Existing autonomous final audit and reporting are sufficient for decisions made during Ship.

## Out of Scope

- Removing, weakening, or bypassing specification, planning, task derivation, clarification, guardrail ratification, verification, review, ownership, reconciliation, close, audit, reporting, or learning governance.
- Changing Work defaults or adding a second Work implementation.
- Proactive redefinition, staleness detection, drift detection, or heuristic intent merging.
- Tracking or importing work, changing Beads authority, or enabling tracked definition recovery.
- A depth dial, complexity score, conditional review policy, or single-round clarification bypass.
- Automatic branches, worktrees, commits, pushes, resets, releases, or publication.
- A finite Ship iteration ceiling, task-count checkpoint, new report, or good-enough-delivery dependency.
- A new lane, board, state file, ledger, command alias, configuration, profile, scheduler, concurrency mechanism, or persistent default.
- A release or publish workflow, or a `go` alias.