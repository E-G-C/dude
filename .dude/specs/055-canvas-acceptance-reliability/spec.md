# Feature Specification: Canvas Acceptance Reliability

**Source idea**: `.dude/ideas/055-canvas-acceptance-reliability.md`

Make acceptance of the shipped read-only Now cockpit reproducible before human
dogfood. Static review found four acceptance gaps, not a newly reproduced
product regression. Required browser execution and a real-provider interaction
flow are P1; isolated evidence output and selected-open responsive coverage are
P2. Browser-first expresses priority, not a lifecycle-number dependency.

## User Scenarios & Testing

### US1: Trust browser acceptance in continuous integration (P1)

As a maintainer, I need a passing required acceptance run to mean the browser
actually exercised the intended committed product revision.

**Why this priority**: The current optional path can skip the rendered checks
when prerequisites are absent, leaving human dogfood to discover mismatches.

**Independent test**: Run acceptance with available prerequisites, with each
required prerequisite missing, and with one existing rendered assertion
intentionally broken in a disposable copy.

**Acceptance scenarios**:

1. Given the intended committed revision and available prerequisites, when
   required acceptance runs, then it executes the rendered checks and reports
   positive execution evidence with no browser-coverage skips.
2. Given a missing required prerequisite or a failing rendered assertion, when
   required acceptance runs, then it fails rather than reporting skipped success.
3. Given an ordinary dependency-free repository test run, when optional browser
   prerequisites are absent, then its intentional skips remain explicit.
4. Given a consumer installation, when the cockpit opens, then no new install,
   build, or network prerequisite has been introduced.

### US2: Exercise real repository selection and refresh in the browser (P1)

As a cockpit user, I need the selected feature and its facts to stay truthful
while I browse, wait for a read, recover from a failure, and refresh changed data.

**Why this priority**: Invented projection responses alone cannot prove that the
rendered application works with the production provider and canonical inventory.

**Independent test**: Exercise one rendered flow through the production provider
against a disposable repository with at least 50 canonical feature ledgers,
including a realistic `052-dude-canvas-ui` feature.

**Acceptance scenarios**:

1. Given a complete committed selection, when the user opens its chooser with
   one click, then the full inventory is available and the selected row is
   visible; typing a query does not commit a different feature.
2. Given a different pending target and a deliberately delayed authoritative
   read, when the request is unresolved, then the committed heading and facts
   remain intact and the pending announcement identifies only the requested
   target.
3. Given the recognized no-database result from the work authority, when the
   provider reads the repository, then the existing local-task fallback supplies
   a complete projection. An unrelated failure must not masquerade as absence.
4. Given a generic failed read, when selection fails, then the prior committed
   view remains intact with truthful failure/freshness feedback and no false
   opened announcement. A later successful selection replaces it and focuses
   the new identity heading.
5. Given a changed selected source, when the existing focus-based freshness
   check runs, then it reports the change without replacing facts. Explicit
   refresh then presents the new complete facts as current.

### US3: Trust selected-open behavior across supported sizes (P2)

As a cockpit user, I need to browse the currently selected feature at narrow,
medium, and wide sizes in either appearance without clipped or unreachable
controls.

**Why this priority**: The existing selected-open case covers only one size and
appearance; broader general layout coverage does not prove this interaction.

**Independent test**: Repeat selected-open interactions at 360, 760, and 1440
CSS-pixel widths in light and dark appearance.

**Acceptance scenarios**:

1. Given each of the six combinations, when the chooser opens, then the entire
   committed row is visible within the list and viewport, required content is
   not clipped, and the page has no horizontal overflow.
2. Given visible interactive targets, when actual pointer input reaches them,
   then hit-testing identifies the intended target and it responds; each target
   meets WCAG 2.2 AA target-size requirements or an applicable criterion exception.
3. Given the existing keyboard and accessibility cases, when coverage expands,
   then full-list discovery, canonical-number display, query behavior, Tab
   noncommit, long Next source disclosure, focus, accessibility-tree semantics,
   and contrast assertions remain covered.

### US4: Retrieve evidence from only the current run (P2)

As a maintainer, I need screenshots and observations that cannot be confused
with files from an earlier session or another concurrent run.

**Why this priority**: A fixed personal-session destination is neither portable
nor run-bounded.

**Independent test**: Run acceptance twice using the same output parent and
also use its default output location.

**Acceptance scenarios**:

1. Given a default or caller-selected output parent, when a run writes evidence,
   then it uses a unique child destination and reports where that evidence lives.
2. Given existing evidence from another run, when a new run executes or fails,
   then it does not overwrite that evidence or depend on a developer's home path.
3. Given screenshots, when acceptance is assessed, then executable assertions
   establish correctness; screenshots remain supporting evidence only.

## Edge Cases

- A supplied browser path is invalid, dependencies are absent, or launch fails:
  required mode fails visibly instead of silently selecting a different mode.
- Repeated runs share an output parent; neither run reuses the other's files.
- The selected feature is far down a list of at least 50 canonical entries.
- A query matches nothing, includes punctuation, or exactly matches a canonical
  number; query text remains separate from committed selection.
- A pending selection fails or returns the recognized absence result; only a
  complete successful replacement may change the committed feature.
- Source changes detected by freshness checks do not silently update the view.
- A fixture path that canonical inventory cannot produce is removed rather than
  used to justify new production behavior.
- A measured control uses a permitted target-size exception; acceptance verifies
  that exception rather than requiring an unrelated design change.

## Functional Requirements

- **FR-001**: Provide an explicit required browser acceptance path in continuous
  integration. Missing prerequisites, skipped browser coverage, and failed
  rendered assertions must prevent success, with positive execution evidence
  for a successful run.
- **FR-002**: Allow a maintainer-supplied supported browser executable and a
  reasonable existing local default. Preserve explicit intentional skips in the
  ordinary dependency-free test path when optional prerequisites are absent.
- **FR-003**: Required acceptance must exercise the intended committed product
  revision and detect built-artifact drift. Preserve consumers' install-, build-,
  and network-free runtime behavior.
- **FR-004**: Cover one rendered production-provider flow with real canonical
  repository reads and at least 50 feature ledgers, including realistic 052
  data. Substitute only the external work-command boundary, not projection
  responses or provider routes.
- **FR-005**: Assert one-click chooser opening and one-click option activation,
  committed/query/pending separation, delayed-read preservation, truthful
  failed-selection recovery, and successful replacement with identity focus.
- **FR-006**: Assert the existing recognized no-database fallback through this
  rendered flow, distinguish generic failures, and retain its lower-level
  regression coverage without claiming a new product fix.
- **FR-007**: Exercise changed-source detection through the existing freshness
  interaction and explicit refresh to a new complete current view.
- **FR-008**: Isolate evidence in a unique per-run child of temporary storage or
  a caller-selected parent. Report its location, prevent cross-run overwrites,
  and use screenshots only as evidence.
- **FR-009**: Expand selected-open coverage to all six specified width/appearance
  combinations, asserting full committed-row visibility, no unintended clipping
  or horizontal overflow, actual pointer hitability, and WCAG 2.2 AA target-size
  conformance, including permitted exceptions.
- **FR-010**: Preserve existing full-list, canonical-number, query, Tab-noncommit,
  long Next source disclosure, keyboard, focus, accessibility-tree, and contrast
  checks. Remove impossible canonical-path fixtures rather than adding
  hypothetical production hardening.
- **FR-011**: Document reproducible maintainer acceptance and its evidence
  boundary. Complete automatable interaction checks before requesting human
  smoke limited to actual host provider discovery, iframe sizing/theme/focus,
  and reload lifecycle. Standalone browser evidence is not host evidence.
- **FR-012**: Keep the existing read-only cockpit and runtime contracts unchanged.
  Plan no new UI, persistent product state, or general reliability platform.
  A newly reproduced rendered defect requires bounded owner diagnosis and a
  focused correction under the approved design, not speculative scope expansion.

## Key Entities

- **Canonical feature**: A numbered idea ledger and, when defined, its exact
  owned specification and local task facts; test repositories use this same
  identity relationship.
- **Selection state**: The committed feature, editable query, and pending target
  have different meanings. Only an accepted complete read replaces commitment.
- **Projection and freshness**: Facts from one complete provider read and the
  separate indication of whether its sources are current, changed, or unreadable.
- **Acceptance run evidence**: Current-run assertions, execution identification,
  observations, and optional screenshots; it owns no product or workflow state.

## Success Criteria

- **SC-001**: Required continuous-integration acceptance reports executed browser
  checks with zero browser skips; absent prerequisites and one deliberately
  broken existing assertion each produce a failing process result.
- **SC-002**: One real-provider browser flow passes every US2 transition with at
  least 50 canonical ledgers and no replacement projection payloads.
- **SC-003**: All six selected-open width/appearance combinations pass geometry,
  pointer, and applicable target-size checks; existing interaction and
  accessibility assertions remain passing.
- **SC-004**: Two runs under one caller-selected parent produce different
  evidence children without overwrites; default output also works without any
  fixed personal-session path.
- **SC-005**: Required acceptance rejects artifact drift and verifies the
  committed revision without changing consumer runtime prerequisites.
- **SC-006**: Maintainer instructions distinguish executed browser evidence from
  the narrow human-only host smoke, with no new product surfaces or contracts.

## Assumptions

- Existing project guardrails suffice; no new guardrail or user answer is needed.
- Review findings are static acceptance gaps, not evidence of a new regression.
- Existing approved cockpit design remains the baseline; this is test
  infrastructure work, not a new UI design stage.
- Feature 052 stays closed. Needs You, answers, commands, Sharpie/Review,
  backlog, memory, team, and packs remain deferred.
- Ship orphan cleanup belongs to captured 056 and is not a dependency.
- The unrelated user model-map edit and profile generation are outside scope.
