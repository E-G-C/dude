---
title: Backlog Report Usability
slug: backlog-report-usability
work_type: design
design_status: approved
approved_direction: lifecycle-explorer
preview_path: .dude/specs/027-backlog-report-usability/design/preview.html
---

# Feature Specification: Backlog Report Usability

## Purpose

Feature 025 made the backlog openable as committed Markdown and self-contained HTML, but its six equal lanes mix current execution, ordering, unprioritized work, and completed history. The presentation obscures what is happening now, lets completed work dominate the page, and gives readers misleading trust signals: wall-clock generation time prevents byte determinism, checkout names make output location-dependent, pre-commit revision stamps become stale immediately, and freshness is requested procedurally rather than enforced mechanically.

This follow-up replaces those affected presentation and trust contracts with the approved Lifecycle Explorer. It organizes every direct idea under shared Current, Planned, or Completed semantics, gives readers a truthful delivery map, and supports progressive drill-down from portfolio orientation to the original idea, definition, tasks, status, dependencies, and recorded milestones.

The artifacts remain derived projections at the fixed paths `.dude/backlog.md` and `.dude/backlog.html`. Idea ledgers, defined packages, task records, declared dependencies, and optional explicit ordering remain authoritative. This feature adds no board, store, service, watcher, schema, or execution authority and leaves Feature 025 closed and unchanged as historical evidence.

## Visual Intent

### Should Feel

- Immediately orienting: a reader can see where work is now, what is ready, what is awaiting definition or execution, and what is complete.
- Lifecycle-first: the route from Idea to Defined to Tasks to Done is visible before detailed prose.
- Truthful about uncertainty: declared, provisional, and missing dependency or order evidence look different.
- Progressive: current work is prominent, planned work is compact, completed history is available without dominating.
- Calm and scannable: near-white planes, meaningful rules, compact metadata, restrained color, and normal page scrolling.
- Functional while static: native expansion and in-page navigation work without scripts, a server, or a network.

### Should Never Feel

- Like six unrelated peer lanes competing for attention.
- Like an execution board or roadmap that invents priority or order.
- Like a wall of repetitive completed cards, completion bars, or Done chips.
- Like an application mock containing fake tabs, filters, search, buttons, or other inert controls.
- Like a clipped dashboard with nested scrolling, mobile overflow, decorative boundaries, or unreadable print output.
- Like a freshness claim based on the current time, checkout location, or a revision captured before the artifact changes.

## Scope And Surfaces

In scope:

- The generated Markdown artifact at `.dude/backlog.md`.
- The generated self-contained report at `.dude/backlog.html`.
- The shared backlog presentation model and current read-only backlog presentation commands that expose the same inventory.
- The existing generation and validation contracts for those artifacts.
- The approved design evidence at `design/preview.html`, used only for implementation comparison.

Out of scope:

- A Copilot canvas extension.
- Any new ordering editor, dependency editor, board, database, API, service, watcher, daemon, or activity store.
- Git-history aggregation.
- Any edit, reopening, or state mutation of Feature 025.
- Any implementation-time visual direction checkpoint before applying the already approved Lifecycle Explorer.

## User Stories & Testing

### User Story 1 - Understand where work is now (Priority: P1)

As a reader, I want one where-are-we summary and clear Current, Planned, and Completed sections so that I can identify present work, likely next work, undefined ideas, defined-but-unstarted features, and completed history without interpreting six mixed lanes.

**Why this priority**: Orientation is the report's primary purpose, and every deeper view depends on a truthful top-level classification.

**Independent Test**: Present representative direct ideas in blocked, active, ready, draft, defined-awaiting-work, ordered-later, and completed states; confirm each appears exactly once under the correct lifecycle section, summary counts agree with the inventory, empty Current subsections are suppressed while their counts remain zero, and no all-history percentage appears.

**Acceptance Scenarios**:

1. **Given** the generated report, **When** its summary is read, **Then** it shows Current work, Ready/Next, Ideas awaiting definition, Defined awaiting work, and Completed counts.
2. **Given** blocked, active, and ready work, **When** Current work is rendered, **Then** its subsections appear in the order Blocked, Active, Next.
3. **Given** an empty Current subsection, **When** the report is rendered, **Then** the subsection body is omitted while its summary count remains zero.
4. **Given** draft or unprioritized ideas, **When** Planned work is rendered, **Then** they appear compactly without invented priority.
5. **Given** no authoritative later ordering, **When** Planned work is rendered, **Then** “Prioritized for later” is absent.
6. **Given** actual authoritative ordering that places work later, **When** Planned work is rendered, **Then** “Prioritized for later” appears with only the ordered members.
7. **Given** completed features, **When** the page first opens, **Then** they are represented by one collapsed compact library rather than a peer lane or repeated completion visualization.

### User Story 2 - See truthful dependencies and order (Priority: P1)

As a reader, I want a delivery map that distinguishes declared relationships, provisional statements, and missing signals so that I can understand known sequencing without mistaking prose or layout for an authoritative roadmap.

**Why this priority**: A visual map is useful only when its evidence and authority are explicit.

**Independent Test**: Render fixtures containing a declared dependency, explicit order, recognizable body-stated relationship, and no relationship; confirm the map uses distinct solid, dashed, and absent-line treatments, labels provisional evidence as non-authoritative, and never changes execution classification from provisional evidence.

**Acceptance Scenarios**:

1. **Given** a declared dependency or explicit ordering input, **When** it is shown in the delivery map, **Then** it is labeled authoritative and visually distinct from provisional evidence.
2. **Given** a recognizable relationship stated only in idea body text, **When** it is shown, **Then** it is dashed and labeled provisional or non-authoritative.
3. **Given** no dependency or order signal, **When** the map is shown, **Then** no relationship line is invented.
4. **Given** no explicit feature order, **When** the delivery map is rendered, **Then** it says “No explicit feature order declared.”
5. **Given** `backlog-canvas`, **When** the HTML report opens, **Then** its drill-down is open by default and its exact body-stated dependency on `backlog-report` is shown as provisional and non-authoritative.
6. **Given** only provisional evidence, **When** Current or Planned membership is derived, **Then** that evidence does not block, prioritize, or order the idea.

### User Story 3 - Trace any idea through its lifecycle (Priority: P1)

As a reader, I want every idea or feature to have a stable drill-down from original idea through definition and task state so that I can move from portfolio orientation to the underlying evidence without searching the repository manually.

**Why this priority**: The approved direction exists to expose the complete lifecycle, not merely rearrange summary cards.

**Independent Test**: Expand one draft, one active defined feature, and one completed feature; confirm each summary and body contains the applicable real source data, and confirm the draft explicitly has no tasks.

**Acceptance Scenarios**:

1. **Given** any direct idea, **When** its summary is read, **Then** it shows stable identity, title, the Idea → Defined → Tasks → Done ribbon, task-state counts or an explicit no-task state, and its dependency signal.
2. **Given** an expanded idea, **When** its detail is read, **Then** it shows a real excerpt from `## Idea`, the exact idea path, Coordinator Log milestones, dependency or order evidence, applicable specification user stories, and canonical phases and tasks with glyph status and `deps:`.
3. **Given** a draft idea, **When** it is expanded, **Then** it says “Awaiting definition - no tasks exist yet” and does not fabricate a specification or task package.
4. **Given** a defined feature with no tasks, **When** it is expanded, **Then** its lifecycle and source paths remain truthful and its task area explicitly reports the absence.
5. **Given** a completed feature, **When** it is selected from the compact completed library, **Then** the same drill-down remains available without repeated completion bars or Done chips.

### User Story 4 - Use the report in HTML, Markdown, mobile, and print contexts (Priority: P1)

As a reader, I want the HTML and Markdown artifacts to share lifecycle semantics while using layouts suited to their medium so that both remain useful without duplicating every detail.

**Why this priority**: The two committed surfaces serve different reading contexts and must agree semantically without becoming identical.

**Independent Test**: Render both artifacts from one model; confirm matching inventory and lifecycle classification, concise Markdown with Mermaid limited to current work, and self-contained HTML that remains keyboard-usable, responsive, and print-safe.

**Acceptance Scenarios**:

1. **Given** the same authoritative inputs, **When** Markdown and HTML are rendered, **Then** they contain the same one-to-one idea inventory and Current, Planned, and Completed classification.
2. **Given** Markdown output, **When** it is read, **Then** it is a concise outline and any Mermaid diagram contains current work only.
3. **Given** HTML output, **When** drill-down is used, **Then** native details, summaries, and in-page anchors provide all interaction.
4. **Given** a narrow viewport, **When** the HTML is read, **Then** content stacks without horizontal page overflow or clipped controls.
5. **Given** printed output, **When** the report is printed or previewed, **Then** content is not hidden behind scroll containers and meaningful sections avoid destructive clipping.
6. **Given** keyboard navigation, **When** links and summaries receive focus, **Then** focus is visible and all interactive elements remain operable.
7. **Given** the generated HTML file opened offline, **When** it loads, **Then** it makes no network request and requires no server or script.

### User Story 5 - Trust deterministic freshness and honestly scoped activity (Priority: P1)

As a reader or maintainer, I want artifact bytes to depend only on authoritative inputs and a mechanical freshness check to fail on drift so that committed reports cannot silently become stale or vary by checkout.

**Why this priority**: Feature 025's timestamps and revision stamps contradicted determinism and did not establish freshness.

**Independent Test**: Generate from byte-identical authoritative inputs in two differently named roots and compare exact artifact bytes and SHA-256 values; then alter an authoritative input, confirm the read-only check fails without writing, regenerate through the existing two-file write path, and confirm the check passes.

**Acceptance Scenarios**:

1. **Given** byte-identical authoritative inputs in different checkout paths, **When** artifacts are generated, **Then** both Markdown files are byte-identical and both HTML files are byte-identical.
2. **Given** unchanged authoritative inputs, **When** generation is repeated, **Then** output bytes do not change.
3. **Given** a missing or stale committed artifact, **When** the freshness check runs, **Then** it exits unsuccessfully, names the stale or missing artifact, and writes nothing.
4. **Given** both committed artifacts equal deterministic generation, **When** the freshness check runs, **Then** it succeeds and writes nothing.
5. **Given** generation with writing enabled, **When** it completes, **Then** the only files it writes are `.dude/backlog.md` and `.dude/backlog.html`.
6. **Given** rendered activity, **When** it is read, **Then** it is labeled “Coordinator activity,” states that it comes only from idea Coordinator Logs, and excludes Git and ad-hoc work.
7. **Given** multiple log entries sharing a date, **When** activity is rendered, **Then** they are grouped under that date and ordered by a stable rule without implying intra-day chronology.

## Edge Cases

- There are no current Blocked, Active, or Next items. The summary retains three truthful zero counts while empty subsections remain suppressed.
- There are no completed features. The completed library reports zero without rendering an empty wall of controls.
- Every direct idea is completed. Current and Planned remain truthful and compact; no all-history percentage appears.
- A draft has body text that mentions another feature without an explicit recognizable dependency statement. No provisional edge is created.
- A provisional relationship names an unknown slug. It may be reported as unresolved provisional evidence but never becomes authoritative ordering.
- An authoritative dependency names an unknown or incomplete idea. Existing authoritative dependency semantics remain truthful.
- The optional order file is absent, empty, duplicated, or contains unknown slugs. No roadmap is inferred; only valid known ordering signals are presented.
- A defined owner or package cannot be resolved cleanly. The idea remains in the inventory with a visible unavailable-detail state rather than disappearing or acquiring fabricated facts.
- A specification has no user-story headings or a task file has no phase heading. Available facts render without placeholder stories or invented phases.
- A task has multiple `deps:` entries or a dangling dependency. Literal task metadata is shown without inventing a resolvable edge.
- Coordinator Log entries have the same date, include a time after the date, or lack a valid date prefix. Valid dates are grouped by calendar date; invalid entries are excluded from dated activity rather than assigned a fake date.
- Idea titles or excerpts contain HTML-sensitive characters. They render as text and cannot introduce markup or external references.
- The live direct-idea count differs from the approved preview's historical 30-idea evidence. Layout and inventory correctness use the live inventory and do not depend on a fixed count.
- The committed artifacts are absent. Freshness check fails without creating them.
- The repository is not a Git checkout. Generation is unaffected because Git metadata is not an input.
- The approved preview and runtime template differ. The preview remains design evidence; independent visual review determines whether implementation matches the approved direction.

## Functional Requirements

- **FR-001:** All backlog presentation surfaces MUST organize direct ideas using shared Current, Planned, and Completed semantics rather than presenting Active, Next, Blocked, Later, Backlog, and Shipped as six peer lanes.
- **FR-002:** The where-are-we summary MUST show Current work, Ready/Next, Ideas awaiting definition, Defined awaiting work, and Completed counts and MUST NOT show an all-history completion percentage.
- **FR-003:** Current work MUST present Blocked, Active, and Next in that order, suppress empty subsection bodies, and retain truthful zero counts.
- **FR-004:** Planned work MUST present drafts and unprioritized work compactly and MUST show “Prioritized for later” only when actual authoritative ordering places work later.
- **FR-005:** Completed work MUST appear as one initially collapsed compact library using normal page scrolling, with one-line entries and drill-down but without repeated completion bars, Done chips, or nested scrolling.
- **FR-006:** The delivery map MUST distinguish authoritative declared dependencies or explicit order, provisional recognizable body-stated relationships, and missing signals using visually and textually distinct treatments.
- **FR-007:** The system MUST NOT infer a roadmap, dependency, priority, or order from titles, numbering, directory names, incidental mentions, layout position, or provisional evidence.
- **FR-008:** When explicit feature order is absent, the report MUST say “No explicit feature order declared.”
- **FR-009:** `backlog-canvas` MUST be open by default in HTML and MUST show its exact body-stated relationship to `backlog-report` as provisional and non-authoritative.
- **FR-010:** Every direct idea MUST appear exactly once in Current, Planned, or Completed and MUST be reachable through a stable drill-down or anchor; no idea may be duplicated or omitted.
- **FR-011:** Every idea summary MUST include stable identity and title, an Idea → Defined → Tasks → Done lifecycle ribbon, task-state counts or explicit no-task status, and a dependency signal.
- **FR-012:** Every expanded idea MUST include a real `## Idea` excerpt and exact source path, Coordinator Log milestones, dependency and order evidence, applicable specification user stories, and applicable phase and canonical task details including glyph state and literal `deps:`.
- **FR-013:** A draft MUST explicitly say “Awaiting definition - no tasks exist yet” and MUST NOT fabricate a specification, phase, task, dependency, order, or lifecycle milestone.
- **FR-014:** Markdown MUST use the same Current, Planned, and Completed inventory semantics as HTML while remaining a concise outline; Mermaid MUST be limited to current work and Markdown MUST NOT mirror all HTML drill-down detail.
- **FR-015:** HTML interaction MUST use only native details, summaries, and in-page anchors, with no browser JavaScript, fake control, filter, search, network, server, external reference, remote font, or nested scrolling.
- **FR-016:** HTML MUST use normal document scrolling, responsive stacking, print-safe presentation, semantic headings and landmarks, visible keyboard focus, meaningful accessible labels and boundaries, and the approved Strata spectrum.
- **FR-017:** Strata presentation MUST use white or near-white planes, meaningful rules, 4px default radii, no shadows, monospace only for metadata, deep variants for colored text, and at least 3:1 contrast for meaning-bearing boundaries.
- **FR-018:** Generation MUST omit wall-clock timestamps, checkout basenames, pre-commit Git revisions, and every other location- or time-dependent value; unchanged authoritative input bytes MUST produce byte-identical output across runs and checkout roots.
- **FR-019:** A deterministic source-input fingerprint MAY appear only if it adds concrete provenance value and is derived exclusively from authoritative input bytes; its absence is acceptable.
- **FR-020:** A read-only `check` behavior MUST render both artifacts in memory, compare them byte-for-byte with committed `.dude/backlog.md` and `.dude/backlog.html`, fail for either missing or stale artifact, succeed only when both match, and perform no write.
- **FR-021:** Mechanical freshness MUST be exercised through the existing test and CI path; no new workflow, watcher, service, daemon, store, or background process may be added.
- **FR-022:** Generation with writing enabled MUST remain the only write path and MUST write exactly `.dude/backlog.md` and `.dude/backlog.html`.
- **FR-023:** Activity MUST be labeled “Coordinator activity,” sourced only from idea Coordinator Logs, parsed by calendar date, grouped by date, and ordered deterministically without inventing chronology among entries sharing a date.
- **FR-024:** The activity view MUST state that Git history, ad-hoc work outside Coordinator Logs, and other execution history sources are excluded.
- **FR-025:** Both artifacts MUST remain derived projections at their fixed committed paths and MUST add no second board, store, schema, service, API, or execution authority.
- **FR-026:** The approved preview MUST remain design evidence only and MUST NOT be read as a runtime generation input.
- **FR-027:** This feature MUST supersede only Feature 025's affected presentation, provenance, activity-labeling, and freshness contracts while leaving Feature 025's package, idea ledger, task history, and closed state unchanged.

## Key Entities

- **Direct idea inventory**: Every regular direct `.dude/ideas/*.md` ledger admitted by existing workspace safety rules.
- **Lifecycle item**: One direct idea joined, when available, to its exact owner-resolved specification, plan, and task package.
- **Current work**: Blocked, Active, or Next work derived from authoritative lifecycle, task, dependency, and ordering evidence.
- **Planned work**: Ideas awaiting definition, defined features awaiting work, and conditionally work prioritized for later by authoritative ordering.
- **Completed library**: The collapsed compact index of features whose canonical task package is complete.
- **Declared relationship**: A dependency or order signal from an authoritative supported input.
- **Provisional relationship**: A recognizable dependency statement in user-controlled idea body text, displayed separately and never used as authority.
- **Coordinator activity**: Date-grouped events sourced only from idea Coordinator Logs.
- **Deterministic generation**: Rendering whose bytes are a function only of authoritative input bytes and the committed template.
- **Freshness check**: A read-only exact-byte comparison between in-memory generation and the two committed artifacts.
- **Approved preview**: The user-approved Lifecycle Explorer evidence at `design/preview.html`, not a runtime input.

## Success Criteria

- **SC-001:** Every current direct idea has exactly one drillable inventory entry appearing once in Current, Planned, or Completed; synthetic fixtures with zero, one, and arbitrary larger counts also have no duplicate or missing entry.
- **SC-002:** For representative mixed-state fixtures, all five where-are-we counts equal independently computed expected counts, empty Current subsection bodies are absent while zero counts remain visible, and no all-history percentage is present.
- **SC-003:** Delivery-map fixtures prove declared relationships use the authoritative treatment, recognizable body statements use the provisional treatment, missing signals draw no edge, provisional evidence changes no lifecycle classification, and absence of order emits the required message.
- **SC-004:** Draft, active, blocked, ordered, and completed drill-down fixtures expose every applicable real field from FR-011 through FR-013, while drafts contain the exact no-tasks message and no fabricated package detail.
- **SC-005:** The completed library is initially collapsed, contains one compact row per completed feature, has no repeated completion bar or Done chip, and retains drill-down for every completed feature.
- **SC-006:** HTML contains no script, event handler, external URL or asset reference, remote font, fake control, shadow, or nested scroll container; keyboard inspection confirms visible focus and native summary operation.
- **SC-007:** At 1180px, 800px, and 320px viewport widths the page has no horizontal page overflow or clipped summary content; print inspection shows no content hidden by overflow or fixed-height containers.
- **SC-008:** Given two differently named temporary roots with byte-identical authoritative inputs, generated Markdown SHA-256 values are equal, generated HTML SHA-256 values are equal, and direct byte comparison succeeds for both files.
- **SC-009:** After an authoritative input byte changes, `check --root .` fails and writes nothing; after `generate --root . --write`, the check passes; missing either artifact also fails and generation writes no path beyond the two fixed artifacts.
- **SC-010:** Coordinator activity groups valid entries by date descending, orders same-date entries stably by source identity and original ledger order, states its source and exclusions, and contains no Git-derived event.
- **SC-011:** Markdown and HTML contain the same one-to-one lifecycle inventory; Markdown is a concise Current, Planned, and Completed outline and any Mermaid nodes belong only to current work.
- **SC-012:** Independent visual comparison confirms the implemented HTML follows the approved Lifecycle Explorer direction and its responsive and print behavior without requiring another direction approval.
- **SC-013:** Feature 025's idea, specification, plan, tasks, and closed execution history remain byte-unchanged by implementation of this feature.

## Relationship to Feature 025

Feature 025 remains closed historical evidence and is not edited or reopened. This feature preserves its fixed artifact paths, single derivation principle, self-contained offline artifact, derived-only authority, and write confinement to `.dude/backlog.md` and `.dude/backlog.html`.

For the current backlog surfaces, this feature supersedes only these affected contracts:

- Feature 025 FR-003 through FR-009 and FR-011 through FR-013, and corresponding SC-001 through SC-005 and SC-008, where they require or validate six-peer-bucket presentation, all-history progress, four fixed report views, traffic-light lanes, or internally scrollable lanes.
- Feature 025 FR-014 and FR-015 and SC-006, where procedural regeneration, generation time, and source revision are treated as freshness evidence.
- Feature 025 FR-017 and the deterministic portion of SC-001 to the extent the wall-clock and checkout-dependent provenance contradicted byte determinism.
- The “recent activity” portion of Feature 025 FR-011, replacing its generic label and lexical ordering with honestly scoped, date-grouped Coordinator activity.

No Feature 025 artifact is rewritten. Historical requirements remain an accurate record of what Feature 025 delivered at closure.

## Assumptions

- Coordinator-only activity is sufficient for this version; Git-history aggregation remains deferred.
- Existing idea, owner, task, and workspace parsers remain the authoritative basis for lifecycle and execution facts.
- Recognizable body-stated relationships can be extracted conservatively without model reasoning; ambiguous prose produces no provisional edge.
- No authoritative feature order currently exists, so the initial report will say so and omit Prioritized for later.
- A deterministic source-input fingerprint is unnecessary unless implementation identifies a concrete reader need.
- The approved preview will be copied after the core first-definition transaction and verified against SHA-256 `fdfa1b3f517bc721898d3bfd16d75075c75181f84b88d914f89765861bc40573`.
- No separate data-model, API, schema, security, or migration artifact applies.

## Out of Scope

- Git commit or filesystem activity aggregation.
- Editing dependencies, order, lifecycle state, or task state from the report.
- Search, filtering, tabs, sorting controls, user preferences, themes, or client-side state.
- Canvas integration or any server-backed surface.
- A source-input provenance fingerprint without a demonstrated reader need.
- New parsers, schemas, stores, services, watchers, workflows, or background freshness processes.
- Any edit to Feature 025 or reinterpretation of its closed history.

## Revision Log

- 2026-08-08 UTC - First definition recorded the previously user-approved Lifecycle Explorer direction as `design_status: approved`; approved scratch HTML SHA-256 `fdfa1b3f517bc721898d3bfd16d75075c75181f84b88d914f89765861bc40573`; no new visual-direction approval checkpoint required.
