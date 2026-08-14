# Feature Specification: Continuous Work-Intake Reassessment

## Purpose

Work intake is currently easiest to classify at the beginning of a request, but conversations and tasks do not always keep their original character. Advice can accumulate into an accepted, nameable project outcome, and a bounded direct fix can uncover behavior, architecture, contracts, state, or additional outcomes that require durable feature definition. If the original classification is allowed to persist unchanged, Dude can silently continue past the point where the existing feature lifecycle should become visible.

This feature makes intake classification continuous. Dude reassesses when a conversation or task changes character and raises the appropriate checkpoint at the boundary, while keeping ordinary advice, exploration, and genuinely bounded direct work lightweight.

There are two transition cases of this one behavior. Advice or exploration can become a feature brainstorm. Bounded direct work can become durable feature work. Both transitions reuse the existing brainstorm, idea, definition, routing, and Work lifecycle; neither creates a new workflow or silently writes state.

## User Scenarios & Testing

### User Story 1 - Recognize when advice has become a feature brainstorm (Priority: P1)

As a user exploring a problem conversationally, I want Dude to notice when I have accepted a direction and the discussion now describes a nameable project outcome with meaningful scope, constraints, or tradeoffs, so that the resulting feature intent is not lost inside ongoing advice.

**Why this priority**: This is the motivating failure. Without a visible transition, a substantive feature can remain hidden in an advice exchange and never reach the established lifecycle.

**Independent Test**: Present qualifying and non-qualifying conversations. Confirm that every qualifying conversation produces the exact announcement `This has become a feature brainstorm.`, a proposed slug, and a one-versus-several-outcome assessment, while direct questions, unaccepted possibilities, and discussions without a nameable outcome remain ordinary advice or exploration.

**Acceptance Scenarios**:

1. **Given** the user has accepted a direction and the discussion describes a nameable project outcome with meaningful scope, constraints, or tradeoffs, **When** the conversation changes from exploration to feature shaping, **Then** Dude states exactly `This has become a feature brainstorm.`, proposes a concise slug, and says whether the outcomes should split.
2. **Given** the same transition was inferred rather than explicitly requested, **When** Dude raises the checkpoint, **Then** it asks for capture confirmation before writing anything.
3. **Given** advice, a casual thought, an unaccepted possibility, or a discussion with no nameable project outcome, **When** intake is reassessed, **Then** Dude continues the direct conversation without labeling it a feature brainstorm.

### User Story 2 - Reclassify direct work before it becomes ungoverned feature work (Priority: P1)

As a user who asked for a bounded direct change, I want Dude to stop before further repository writes when the task grows into durable feature work, so that unresolved behavior or structural decisions are captured deliberately instead of being implemented accidentally.

**Why this priority**: Once a direct task gains a new durable boundary, another write can harden unagreed intent or architecture. The checkpoint must occur before that write, not after the expanded implementation.

**Independent Test**: Start with a bounded direct task, then independently introduce unresolved behavior, new architecture, a public contract, persistent state, an additional independent outcome, or a change that invalidates the original focused verification. In every case, confirm Dude reclassifies before the next repository write, explains the crossed boundary, and offers the three accepted paths.

**Acceptance Scenarios**:

1. **Given** direct work still has one clear outcome, no unresolved behavior, new architecture, public contract, persistent state, or additional independent outcome, and its original focused verification still proves completion, **When** work continues, **Then** it remains direct.
2. **Given** any one of those conditions stops holding, **When** another repository write would otherwise occur, **Then** Dude pauses first and explains why the task has crossed into durable feature work.
3. **Given** the boundary has been crossed, **When** Dude presents the checkpoint, **Then** it offers exactly these paths in user-facing language: constrain the work back to the original fix, capture the evolving intent as a brainstorm, or capture settled intent and proceed through explicit definition.
4. **Given** the user chooses direct continuation, **When** work resumes, **Then** the expanded scope has been dropped and the task is constrained to the original bounded outcome.

### User Story 3 - Use natural language and the existing feature lifecycle (Priority: P1)

As a user who clearly says that a discussion should become an idea or brainstorm, I want that natural language to enter the existing capture flow without command syntax, duplicate confirmation, or automatic definition.

**Why this priority**: Recognition is useful only if it reaches the established lifecycle without adding friction or creating a competing intake path.

**Independent Test**: Exercise inferred capture, explicit natural-language capture, one bounded outcome, and several bounded outcomes. Confirm inferred capture waits for approval, explicit capture does not demand command syntax, split handling occurs before writing, and successful capture creates only the existing idea ledger while definition remains explicit.

**Acceptance Scenarios**:

1. **Given** the user explicitly says in natural language that the discussion is a brainstorm or should become an idea, **When** Dude interprets the request, **Then** it routes through the existing brainstorm flow without requiring a literal command or asking a redundant capture-confirmation question.
2. **Given** one bounded outcome and confirmed or explicit capture intent, **When** capture occurs, **Then** the accepted intent, open questions, assumptions, uncertainty, and incomplete thoughts are preserved in the existing idea ledger.
3. **Given** several bounded outcomes, **When** capture is requested, **Then** Dude asks one split question or proposes separate ledgers before any capture write.
4. **Given** a successful brainstorm capture, **When** the action completes, **Then** no definition package, tasks, or implementation is created; definition still requires an explicit later step.

### User Story 4 - Keep proportional work lightweight and preserve valid progress (Priority: P2)

As a user who values low-friction help, I want reassessment to be qualitative and non-retroactive, so that size alone does not create bureaucracy and valid completed work is not discarded when a later boundary appears.

**Why this priority**: An over-eager checkpoint would make ordinary help worse. The feature succeeds only if it catches changes of character without equating volume with feature scope.

**Independent Test**: Exercise direct advice, a large mechanical change whose outcome and verification remain bounded, an expanded scope that is later dropped, and a boundary discovered after valid work was completed. Confirm no numeric size rule is used, the mechanical change remains direct, the narrowed task can continue, and valid prior work is retained.

**Acceptance Scenarios**:

1. **Given** a large but mechanical change with one clear outcome and adequate focused verification, **When** intake is reassessed, **Then** size alone does not make it feature work.
2. **Given** expanded scope was considered but then dropped, **When** the original bounded task remains, **Then** direct work may continue against the original verification.
3. **Given** valid work was completed before a later boundary became visible, **When** reclassification occurs, **Then** that work is preserved without retroactive rollback or added ceremony.
4. **Given** any conversation or task, **When** Dude decides whether to raise a checkpoint, **Then** it uses the accepted qualitative conditions and no turn, file, token, diff-size, or other numeric threshold.

## Edge Cases

- The user accepts useful advice, but the discussion still has no nameable project outcome; the conversation remains advice.
- A nameable possible outcome exists, but the user has not accepted a direction; exploration continues without an inferred capture request.
- The user explicitly says “this should be an idea” before Dude would otherwise infer the transition; the existing brainstorm route begins without command syntax or redundant confirmation.
- The inferred brainstorm checkpoint is declined; no idea is captured and no definition or implementation begins.
- One discussion contains several outcomes with separate success tests; split handling occurs before any write.
- A direct task uncovers exactly one unresolved behavior question; that single new boundary is sufficient to require reclassification.
- The requested implementation remains conceptually simple but introduces a public contract or persistent state; it is durable feature work despite its apparent size.
- A change touches many files mechanically while the original outcome and focused verification remain sufficient; it stays direct.
- The original focused verification ceases to prove completion even though no new file or architecture is involved; the task is reclassified before another write.
- Expanded scope is dropped after the checkpoint; only the original bounded task may continue directly.
- Valid work predates the boundary discovery; it remains in place while the newly expanded intent is routed.
- A request concerns GitHub issue intake; that separate intake path is not changed by this feature.

## Requirements

### Functional Requirements

- **FR-001**: Dude MUST reassess work-intake classification whenever a conversation or task materially changes character; the initial classification MUST NOT be treated as permanent.
- **FR-002**: Direct facts, casual thoughts, questions, recommendations, exploration, and bounded direct tasks MUST remain direct while their accepted classification conditions continue to hold.
- **FR-003**: Advice or exploration MUST become a feature-brainstorm checkpoint when the user has accepted a direction and the discussion describes a nameable project outcome with meaningful scope, constraints, or tradeoffs.
- **FR-004**: At an advice-to-brainstorm transition, Dude MUST state exactly `This has become a feature brainstorm.`
- **FR-005**: The feature-brainstorm checkpoint MUST propose a concise slug and state whether the discussion contains one bounded outcome or several outcomes that should split.
- **FR-006**: When an advice-to-brainstorm transition is inferred, Dude MUST ask for confirmation before capture and MUST NOT write capture or definition state before confirmation.
- **FR-007**: An explicit, unambiguous natural-language request to brainstorm or capture an idea MUST route through the existing brainstorm flow without requiring command syntax or redundant capture confirmation.
- **FR-008**: Confirmed or explicit capture MUST preserve the accepted intent, open questions, assumptions, uncertainty, and incomplete thought through the existing idea-ledger authority.
- **FR-009**: Brainstorm capture MUST create or refresh only the existing idea ledger; definition, tasks, and implementation MUST remain separate and require their existing explicit routes.
- **FR-010**: When several bounded outcomes have separate success tests, Dude MUST ask one split question or propose separate idea ledgers before any capture write.
- **FR-011**: A direct task MUST remain eligible for direct work only while it has one clear outcome; has no unresolved behavior, new architecture, public contract, persistent state, or additional independent outcome; and its original focused verification still proves completion.
- **FR-012**: If any direct-task condition in FR-011 stops holding, Dude MUST reclassify the work before the next repository write.
- **FR-013**: At the direct-task boundary, Dude MUST explain why the boundary was crossed and offer the user three choices: constrain back to the original fix, capture evolving intent as a brainstorm, or capture settled intent and proceed through explicit definition.
- **FR-014**: Once direct work crosses the boundary, the checkpoint MUST be mandatory; direct continuation MUST be permitted only when the expanded scope is dropped.
- **FR-015**: Reclassification MUST preserve valid work already completed and MUST NOT require retroactive rollback or added bureaucracy solely because the boundary was discovered later.
- **FR-016**: Reclassification MUST use qualitative scope and verification conditions, MUST NOT use turn, file, token, diff-size, or other numeric thresholds, and MUST NOT classify a large mechanical change as feature work solely because of its size.
- **FR-017**: The behavior MUST reuse the existing brainstorm, idea, definition, routing, and Work lifecycle, MUST keep GitHub issue intake separate, and MUST add no new command, parser, counter, workflow engine, state store, registry, daemon, alternate workflow, or automatic background capture.

### Key Entities

- **Work-intake classification**: The current route for a conversation or task, reassessed when its character changes.
- **Feature-brainstorm checkpoint**: The visible pause that announces the transition, proposes identity and split guidance, and obtains confirmation when the transition was inferred.
- **Bounded direct task**: One clear outcome with no new durable boundary and with focused verification that still proves completion.
- **Durable feature work**: Work that has gained unresolved behavior, architecture, a public contract, persistent state, an independent outcome, or a verification obligation beyond the original direct task.
- **Original focused verification**: The completion proof selected for the bounded direct task before its scope changed.
- **Existing feature lifecycle**: The established brainstorm, idea, explicit definition, routing, and Work behavior reused by both transitions.

## Success Criteria

### Measurable Outcomes

- **SC-001**: In an acceptance matrix of qualifying advice-to-brainstorm conversations, 100% produce the exact required announcement, a slug proposal, and a one-versus-several-outcome assessment before capture.
- **SC-002**: In the paired non-qualifying matrix—direct facts, casual thoughts, unaccepted directions, and discussions without a nameable outcome—0% are labeled as feature brainstorms.
- **SC-003**: Across inferred and explicit capture cases, 100% of inferred transitions wait for confirmation, 100% of explicit natural-language requests proceed without command syntax or redundant confirmation, and no unconfirmed inferred case writes state.
- **SC-004**: For each of the six direct-task boundary triggers—unresolved behavior, new architecture, public contract, persistent state, an additional independent outcome, and insufficient original verification—the checkpoint occurs before the next repository write and includes both a concrete reason and all three choices.
- **SC-005**: All bounded controls, including at least one large mechanical change, continue directly when FR-011 remains true; no acceptance decision depends on a numeric size threshold.
- **SC-006**: Each checkpoint choice preserves the established lifecycle: constrained work resumes only at original scope, evolving intent stops at brainstorm capture, and settled intent proceeds only through explicit definition before expanded implementation.
- **SC-007**: In every acceptance case where valid work predates reclassification, that work remains preserved and no retroactive rollback is required.
- **SC-008**: Acceptance inspection finds zero new intake commands, parsers, counters, state stores, registries, daemons, workflow lanes, or alternate capture paths, while the existing brainstorm/definition separation and GitHub issue intake remain unchanged.

## Assumptions

- User acceptance of a direction can be determined from the conversation without a score or numeric confidence threshold.
- The original focused verification for direct work is known from the bounded task and can be reassessed when scope changes.
- Existing brainstorm capture already preserves user-controlled intent, questions, assumptions, uncertainty, and incomplete thought.
- Existing split handling can separate outcomes with independent success tests without a new mechanism.
- Existing definition, routing, and Work behavior remain authoritative after either checkpoint.
- Reclassification changes the route for future work; it does not invalidate otherwise correct work already completed.
- GitHub issue intake remains a separate concern and has no required integration with conversational reassessment.

## Out of Scope

- A new command or command alias for reassessment.
- Automatic capture, automatic definition, or automatic implementation after a checkpoint.
- A parser, classifier service, score, counter, state store, registry, daemon, or background monitor.
- Numeric turn, file, token, diff-size, or effort thresholds.
- Redesign of the existing brainstorm, definition, routing, Work, or GitHub issue-intake workflows.
