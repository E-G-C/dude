# Feature Specification: Backlog Report

## Purpose

The cross-idea orientation view shipped by Feature 024 answers "what is in flight and what is next," but the only way to reach it is to run a command in a terminal and read its output. A non-technical reader cannot do that. They need the same orientation as a file they can open and read, on the repository host and offline.

This feature makes that orientation openable. It renames the surface from "focus" to "backlog", a word the intended reader already understands, and it produces two committed, openable artifacts from one derivation: a Markdown file for the repository host and a self-contained offline report. It adds one bucket, "Shipped", so completed work stops crowding the unprioritized pool, and it renames the former "Unordered" bucket to "Backlog". Because it now writes files, it deliberately supersedes two guarantees Feature 024 pinned — a fixed five-bucket set and a read-only surface — for this surface only, while leaving Feature 024's closed package untouched.

Nothing here becomes a new authority. Idea lifecycle stays authoritative for state, per-feature task records for execution, and declared dependencies plus the optional tie-break ordering for order. Both artifacts are derived projections that can be deleted and regenerated at any time.

## User Stories & Testing

### User Story 1 - Reach the surface by the word "backlog" (Priority: P1)

As a reader who was told to "go check the backlog", I want the cross-idea surface, its diagram views, and its tie-break ordering input all named "backlog" so that I can find it without learning the old word "focus".

**Why this priority**: The rename is the smallest change that removes the vocabulary barrier and is the base every other change builds on.

**Independent Test**: Invoke the renamed surface and its views, confirm they answer under the "backlog" name, confirm the tie-break ordering input is named for "backlog", and confirm the closed Feature 024 package and its idea ledger keep their original names.

**Acceptance Scenarios**:

1. **Given** the renamed surface, **When** it is invoked by its "backlog" name, **Then** it returns the same orientation the old "focus" name did.
2. **Given** the tie-break ordering input, **When** it is consulted, **Then** it is the "backlog" ordering input and the old "focus" ordering name is gone.
3. **Given** the closed Feature 024 package and its idea ledger, **When** the rename is complete, **Then** their directory and file identities are unchanged.

### User Story 2 - See six buckets with completed work separated (Priority: P1)

As someone scanning what is in flight, I want each in-flight idea placed in exactly one of six buckets — Active, Next, Blocked, Later, Backlog, Shipped — with completed work in Shipped so that finished items stop crowding the unprioritized pool and I can see the few real drafts at once.

**Why this priority**: Separating Shipped is what turns a noisy pool into a readable one and resolves the known case where a completed idea named as a dependency lands in an ordering bucket.

**Independent Test**: Over a set of ideas with known state, generate the buckets and confirm Shipped is evaluated first, every idea lands in exactly one bucket, the former "Unordered" pool is now "Backlog", and setting Shipped aside reproduces the prior five-bucket membership.

**Acceptance Scenarios**:

1. **Given** an idea whose every task is complete, **When** the buckets are derived, **Then** it appears in Shipped and in no ordering bucket.
2. **Given** a completed idea named as another idea's dependency, **When** the buckets are derived, **Then** the completed idea is Shipped rather than an ordering bucket.
3. **Given** an idea with no ordering signal, **When** the buckets are derived, **Then** it appears under "Backlog".
4. **Given** the same inputs with Shipped set aside, **When** the buckets are derived, **Then** the remaining five buckets match the previously shipped membership exactly.

### User Story 3 - Open the backlog as a Markdown file (Priority: P1)

As a reader on the repository host, I want a committed Markdown file that shows the six buckets and a board diagram the host renders inline so that I can read the backlog without running anything.

**Why this priority**: The Markdown file is the lowest-effort openable surface and reuses the host's own rendering.

**Independent Test**: Generate the Markdown artifact at its fixed committed location and confirm it shows the six buckets and a board diagram the host renders inline, with per-idea membership identical to the derivation.

**Acceptance Scenarios**:

1. **Given** the generated Markdown artifact, **When** it is opened on the repository host, **Then** it shows the six buckets and an inline board diagram.
2. **Given** the same inputs, **When** both the derivation and the Markdown artifact are produced, **Then** their per-idea bucket membership matches.

### User Story 4 - Open a self-contained offline report (Priority: P2)

As a non-technical reader, I want a single self-contained report file that opens offline and shows richer detail — summary counts, the lane board with per-feature progress, task-order chains, and recent activity — so that I can understand status without any tool, service, or network.

**Why this priority**: The richer report is the payoff for the reader, but it depends on the derivation and the shared rendering being in place first.

**Independent Test**: Generate the report artifact and confirm it opens with no network, no service, no in-file scripting, and no external reference, shows the four views, presents each lane with its fixed status colour, and keeps each lane height-bounded and independently scrollable.

**Acceptance Scenarios**:

1. **Given** the report artifact, **When** it is opened with no network and no service, **Then** it renders completely from its own contents with no external reference.
2. **Given** the report artifact, **When** it is read, **Then** it shows summary counts, the lane board with per-feature progress, task-order chains, and recent activity.
3. **Given** any lane, **When** the report is read, **Then** the lane carries its fixed status colour, done and next are visually distinct, and the lane is height-bounded with its own scroll while an empty lane stays compact.
4. **Given** the same inputs, **When** both artifacts are generated, **Then** their per-idea bucket membership matches.

### User Story 5 - Trust that the report is current (Priority: P2)

As a reader, I want both artifacts regenerated whenever state changes and stamped with a generation time and source revision so that I can tell at a glance whether what I am reading is current.

**Why this priority**: A committed projection that can silently rot is worse than none; the staleness stamp and the regeneration hook are what make it trustworthy.

**Independent Test**: Trigger a coordinator state change, confirm both artifacts are rewritten at the same moment the task board is re-rendered, confirm each carries a generation time and a source revision, and confirm generation performs no other write.

**Acceptance Scenarios**:

1. **Given** a coordinator state change, **When** it completes, **Then** both artifacts are regenerated at the same moment the task board is re-rendered.
2. **Given** either regenerated artifact, **When** it is read, **Then** it shows the generation time and the source revision.
3. **Given** a generation run, **When** it completes, **Then** the only files written are the two artifacts and the workspace gains no second board, store, or execution authority.

## Edge Cases

- No ordering signal anywhere, so every unshipped in-flight idea is Backlog.
- Every task of an idea complete, so the idea is Shipped rather than any ordering bucket.
- A completed idea named as another idea's dependency, which must read as Shipped, not Next.
- An ordered set with no tie-break ordering present, so Later stays empty until an unfinished ordered idea sits ahead of another.
- An empty lane, which must stay compact rather than collapse or stretch.
- A source revision that cannot be determined, so the stamp records that plainly rather than failing.
- Reading the report on a machine with no network, no service, and no scripting available.

## Functional Requirements

- **FR-001:** The system MUST name the cross-idea orientation surface, its on-demand diagram views, and its optional tie-break ordering input "backlog" so a reader reaches them by that word.
- **FR-002:** The rename MUST NOT alter the identity of the closed Feature 024 specification package or its idea ledger; shipped history keeps its names.
- **FR-003:** The system MUST place every in-flight idea into exactly one of six buckets: Active, Next, Blocked, Later, Backlog, and Shipped.
- **FR-004:** The system MUST evaluate Shipped first: an idea whose package is defined, reads cleanly, has at least one task, and has every task complete is Shipped and appears in no ordering bucket.
- **FR-005:** The system MUST report an in-flight idea that carries no ordering signal as Backlog, preserving the membership formerly reported as "Unordered" under the new name.
- **FR-006:** The remaining five buckets MUST stay faithful to the shipped derivation — Active from in-progress evidence, Blocked from an unmet declared dependency or in-package blocking evidence, Backlog when no ordering signal exists, and otherwise an ordered split into Next and Later where Later appears only when an unfinished ordered idea sits ahead — so that setting Shipped aside reproduces the prior five-bucket result.
- **FR-007:** The system MUST generate a Markdown artifact that presents the six buckets and a board diagram the repository host renders inline, readable with no local tool.
- **FR-008:** The system MUST generate a self-contained offline report artifact that presents richer detail than the Markdown artifact and renders completely from its own contents, with no network, no service, no in-file scripting, and no external reference.
- **FR-009:** The system MUST derive both artifacts from one bucket computation so their per-idea bucket membership is identical for the same inputs.
- **FR-010:** The system MUST write the two artifacts to fixed committed locations a reader can open directly, `.dude/backlog.md` and `.dude/backlog.html`, and commit them with the repository.
- **FR-011:** The report artifact MUST present four views over the same derivation: summary counts, the lane board with per-feature task progress, per-feature task-order chains, and recent activity drawn from idea coordinator logs.
- **FR-012:** The report MUST give each lane a consistent status colour with a fixed meaning — Shipped reads as done, Blocked as blocked, Later as deferred, Active as in progress, Next as upcoming, and Backlog as unprioritized — and done and next MUST NOT share a colour.
- **FR-013:** The report MUST bound each lane's height with an internal scroll area so no lane grows without limit, and MUST keep an empty lane compact.
- **FR-014:** The system MUST regenerate both artifacts at every coordinator state change, at the same moment the existing task board is re-rendered, so a committed artifact cannot silently fall out of date.
- **FR-015:** The system MUST stamp the generation time and the source revision into both artifacts, and MUST record plainly when the source revision cannot be determined.
- **FR-016:** Both artifacts MUST remain derived projections and never an authority: idea lifecycle stays authoritative for state, per-feature task records for execution, and declared dependencies plus the tie-break ordering for order; the system MUST add no second board, no second store, and no execution authority.
- **FR-017:** Generation MUST be deterministic, with no model reasoning, no network request, and no service, so repeated generation over unchanged inputs yields identical artifacts.
- **FR-018:** This feature MUST supersede, for this surface only, Feature 024's fixed five-bucket contract and its read-only guarantee: the sixth bucket and the write path that produces exactly the two committed artifacts are the deliberate, tested change, and no other surface gains a write path.

## Key Entities

- **In-flight idea**: A unit of work identified by its stable idea identity, carrying a lifecycle state, declared dependencies, and per-feature task records when defined.
- **Bucket**: One of Active, Next, Blocked, Later, Backlog, or Shipped. Every in-flight idea belongs to exactly one, with Shipped evaluated first.
- **Markdown artifact**: The committed, host-rendered file at `.dude/backlog.md` showing the buckets and an inline board diagram.
- **Report artifact**: The committed, self-contained offline file at `.dude/backlog.html` showing the four richer views.
- **Staleness stamp**: The generation time and source revision carried on both artifacts.

## Success Criteria

- **SC-001:** For any input set of in-flight ideas, 100% appear in exactly one of the six buckets, and repeated generation over unchanged inputs yields identical artifacts.
- **SC-002:** With Shipped evaluated first, every idea whose tasks are all complete appears in Shipped and no ordering bucket — including a completed idea named as another idea's dependency — and setting Shipped aside reproduces the prior five-bucket membership exactly.
- **SC-003:** The membership formerly reported as "Unordered" now appears as "Backlog" unchanged, and Later stays present and empty until an unfinished ordered idea sits ahead of another.
- **SC-004:** Both artifacts exist at their fixed committed locations and are openable directly, the report rendering with no network, service, in-file scripting, or external reference, and both present their required views.
- **SC-005:** For the same inputs, the two artifacts show identical per-idea bucket membership.
- **SC-006:** Regenerating at a coordinator state change refreshes both artifacts together with the task board re-render, and each artifact shows a generation time and a source revision.
- **SC-007:** Generating the two artifacts is the only write a generation run performs, and the workspace gains no second board, store, or execution authority.
- **SC-008:** Each lane presents its fixed status colour with done and next distinct, each lane is height-bounded with its own scroll, and an empty lane stays compact.

## Assumptions

- The idea is the stable identity for a feature across its life, so both artifacts reference idea identities and never need rewriting when a numbered package is created.
- Both artifacts are generated and never authoritative, so either can be deleted and regenerated without losing anything.
- No server, daemon, service, network request, or model call is involved in generating either artifact or in reading the report.
- The optional tie-break ordering is optional; when it is absent, ordered items simply carry no tie-break and Later stays empty.
- A source revision is normally available from the repository, and its absence is a readable stamp value rather than an error.

## Relationship to Feature 024

Feature 024 shipped a read-only cross-idea view with exactly five buckets, fixed by FR-003 and SC-004, and a read-only, non-persistent guarantee, fixed by FR-010 and SC-006, each pinned by a section-bound contract test. This feature supersedes both, for the cross-idea surface only:

- The five-bucket contract becomes six with the addition of Shipped, evaluated first.
- The read-only guarantee is replaced by a write path that produces exactly the two committed artifacts and nothing else.

Feature 024 stays closed and is not reopened. Its specification package and idea ledger are not edited and keep their names. The change is confined to this feature's scope, and the acceptance criteria treat the write path as a deliberate, tested change to the former read-only guarantee.

## Out of Scope

- Any surface in a Copilot application canvas, which is the separate `backlog-canvas` idea and depends on this feature's report renderer.
- Any second board, second store, or execution authority; the artifacts are projections only.
- Any network access, service, in-file scripting, external reference, or bundled diagram runtime in the offline report.
- Any model reasoning spent on producing markup.
- Any change to Feature 024's closed package or idea ledger.
