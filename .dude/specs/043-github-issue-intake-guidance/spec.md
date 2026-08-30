# Feature Specification: GitHub Issue Intake Guidance

## Purpose

Users who know Dude's feature-first lifecycle can reasonably assume that every
GitHub issue must become an idea and specification package. Existing issue
intake already takes a shorter route for bounded bugs and chores, but that
decision is spread across several documentation sections.

This feature makes the existing decision model easy to discover without
creating new behavior. It explains when an issue is only inspected, when Ship
admits and executes it, when feature definition is required, when bounded work
stays direct, when flag applies, and when ambiguity admits nothing.

## User Scenarios & Testing

### User Story 1 - Find the correct issue route quickly (Priority: P1)

As a user familiar with `brainstorm -> define -> Work`, I want a concise issue
decision model near the existing onboarding and command guidance, so that I can
tell whether my request needs a feature package.

**Why this priority**: The usability gap is incorrect workflow expectation. If
the distinction is not discoverable, users may create unnecessary packages or
mistake inspection for permission to execute.

**Independent Test**: Start from each existing onboarding, command, workflow,
and reference surface and confirm that a reader can reach the same concise
decision model and distinguish all six outcomes without learning a new command.

**Acceptance Scenarios**:

1. **Given** a request equivalent to `look at issue 21`, **when** the guidance is
   read, **then** it explains that Dude inspects and answers directly without
   admitting work.
2. **Given** `@dude ship issue 21`, **when** the guidance is read, **then** it
   explains that Dude fetches, classifies, and executes through the existing
   route appropriate to the issue's substance.
3. **Given** a feature request, **when** its route is identified, **then** the
   guidance points to brainstorm, definition, and Work and preserves
   `Origin: <canonical issue URL>`.
4. **Given** a bounded bug or chore with sufficient intent, **when** its route
   is identified, **then** the guidance points directly to debugging,
   implementation, testing, and independent review without an idea or package.
5. **Given** investigation that crosses the direct-task boundary, **when**
   unresolved product intent, architecture, or multi-stage planning appears,
   **then** the guidance returns the work to brainstorm and explicit definition.
6. **Given** ambiguous intake, **when** no classification answer is supplied,
   **then** the guidance promises exactly one classification question and no
   admission.

### User Story 2 - Preserve existing authority and boundaries (Priority: P1)

As a user acting on an issue, I want the guidance to distinguish standalone
bounded work from a blocker against active work and to preserve existing
admission and delivery boundaries, so that documentation does not invent a
second workflow.

**Why this priority**: Misstating flag, admission, or pull-request behavior
could send work to the wrong authority or imply persistent processing that does
not exist.

**Independent Test**: Compare the updated guidance with the completed Feature
034 contract and verify that it preserves the existing routes, conditional
pull-request linkage, and prohibited-capability boundary while adding no
command or runtime behavior.

**Acceptance Scenarios**:

1. **Given** a standalone bounded bug or chore, **when** the decision model is
   applied, **then** it uses direct routed work and is not presented as a flag.
2. **Given** an issue that blocks real active work, **when** that relationship
   is clear, **then** the guidance uses existing flag behavior and current
   execution authority.
3. **Given** an issue reference without a capture or execution request, **when**
   admission is considered, **then** the guidance states that no work is
   admitted.
4. **Given** contextual admission, **when** the current request ends, **then**
   the guidance implies no persistent authority, lane, tracker, cache, registry,
   daemon, or automatic processing.
5. **Given** existing delivery behavior that creates a same-repository pull
   request, **when** linkage guidance applies, **then** it retains
   `gh pr create --base main`, `Fixes #<number>`, and base verification while
   making clear that issue intake and Ship create no pull request automatically.

## Edge Cases

- An issue describes a feature but uses bug terminology. The route follows its
  substance; if still unclear, one classification question is asked and no work
  is admitted without an answer.
- A bounded bug reveals an unresolved product decision or architecture change.
  Direct work stops at the existing boundary and returns to brainstorm and
  definition.
- An issue calls itself a blocker but has no clear relationship to active work.
  It is not attached to arbitrary work and is not presented as a valid flag.
- A user asks only for an issue summary and later separately asks for execution.
  The first request admits nothing; the later request is classified in its own
  context.
- Several documentation surfaces discuss issue intake. One owns the compact
  decision model; the others provide short orientation and links rather than
  duplicating large prose.
- A documentation contract detects a completed Feature 034 behavior failure.
  Source or runtime correction does not begin under this documentation-only
  definition without a deliberate definition refresh.
- References to `E-G-C/dude#21` remain examples or exclusions only; repairing
  that issue is not completion work for this feature.

## Requirements

### Functional Requirements

- **FR-001**: Public guidance MUST present `@dude ship issue <number>` as the
  existing one-verb issue execution path and MUST NOT introduce `admit` or
  another issue-admission command.
- **FR-002**: The decision model MUST state that inspection or a direct question
  about an issue admits no work.
- **FR-003**: The decision model MUST state that Ship fetches, classifies, and
  executes the route appropriate to the issue's substance.
- **FR-004**: Feature-request guidance MUST preserve the existing brainstorm,
  definition, and Work lifecycle and the visible
  `Origin: <canonical issue URL>` line.
- **FR-005**: Bounded bug and chore guidance MUST preserve direct debugging,
  implementation, testing, and independent review without requiring an idea or
  specification package.
- **FR-006**: Direct-work guidance MUST state that unresolved product intent,
  architecture, or multi-stage planning crosses the direct-task boundary and
  returns the work to brainstorm and explicit definition.
- **FR-007**: Flag guidance MUST apply only to a blocker with a clear
  relationship to active work and MUST distinguish that case from standalone
  bounded bug or chore execution.
- **FR-008**: Ambiguous intake MUST produce exactly one classification question
  and MUST grant no admission or execution authority without an answer.
- **FR-009**: Guidance MUST describe admission as contextual authority for the
  current request and MUST NOT imply persistent authority, a GitHub lane,
  duplicate tracker, cache, registry, admission record, daemon, poller, or
  automatic issue processing.
- **FR-010**: The decision model MUST be discoverable from the existing
  onboarding, command, workflow, and reference surfaces without duplicating
  large policy prose across them.
- **FR-011**: Conditional same-repository pull-request guidance MUST retain
  `gh pr create --base main`, `Fixes #<number>`, and base verification and MUST
  state that issue intake and Ship do not create the pull request automatically.
- **FR-012**: Runtime or source behavior MUST remain unchanged unless current
  evidence demonstrably violates the completed Feature 034 contract.
- **FR-013**: Repairing `E-G-C/dude#21` and implementing the separate
  specialist-scope prevention idea MUST remain outside this feature.

### Key Entities

- **Issue inspection**: Reading and classifying an issue to answer the current
  request without admitting work.
- **Contextual admission**: Permission supplied by the surrounding capture or
  execution request to use one existing route for that request only.
- **Feature route**: Brainstorm, accepted idea with visible origin, definition,
  and Work.
- **Bounded direct route**: Debugging, implementation, testing, and independent
  review without an idea or package while the direct-task boundary holds.
- **Active-work blocker**: An issue with a clear relationship to work already
  under execution and therefore eligible for flag behavior.
- **Unadmitted issue**: An inspected, displayed, failed, or unresolved issue
  that grants no execution authority.

## Success Criteria

### Measurable Outcomes

- **SC-001**: The existing onboarding, command, workflow, and reference surfaces
  each expose or directly link to the issue decision model.
- **SC-002**: Documentation checks identify all six outcomes: inspect only, Ship
  execution, feature lifecycle, bounded direct work, active-work flagging, and
  one-question ambiguity without admission.
- **SC-003**: Public guidance contains the exact execution form
  `@dude ship issue <number>` and contains zero issue-admission commands named
  `admit`.
- **SC-004**: At least one section-bound contract independently fails if the
  standalone bounded-work distinction, active-work flag restriction, or
  direct-task boundary is removed.
- **SC-005**: Changed guidance adds zero persistent authority, lane, tracker,
  cache, registry, admission record, daemon, poller, or automatic issue
  processing capability.
- **SC-006**: Conditional same-repository pull-request guidance retains all
  three checks: `gh pr create --base main`, `Fixes #<number>`, and base
  verification.
- **SC-007**: Changed-path inspection finds only the four existing documentation
  surfaces and their existing documentation contract test; it finds no runtime,
  source-owner, issue-21 repair, specialist-scope prevention, or supporting
  artifact change.

## Assumptions

- Completed Feature 034 behavior and its current source guidance remain
  authoritative.
- The usability problem is discoverability, not missing issue intake behavior.
- `README.md` is the concise onboarding surface for this repository.
- One compact workflow decision model plus short contextual links is clearer
  than repeating the complete policy on every surface.
- Existing section-aware documentation contract helpers are sufficient to pin
  the guidance without a new test module.
