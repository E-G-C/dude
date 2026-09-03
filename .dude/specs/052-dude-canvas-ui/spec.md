---
title: Dude Canvas UI
slug: dude-canvas-ui
work_type: design
design_status: approved
approved_direction: Desktop application shell — persistent command bar, activity rail, docked properties column, and status bar, with Phases and Activity occupying the centre column
preview_path: .dude/specs/052-dude-canvas-ui/design/fluent-desktop-workspace.html
---

# Design Proposal: Dude Canvas UI

## Purpose

Dude currently requires a command or direct file reading to regain context. This
feature ships the first canvas cycle: a read-only Now cockpit for one selected
feature. It shows authoritative stage, next step, blockers, unanswered-question
count, and freshness.

The long-term product remains a task-specific graphical layer over the same
active agent session. This cycle establishes the approved Fluent 2 desktop
application shell and its coherent narrow collapse without adding actions or
later workflows.

## User Scenarios & Testing

### User Story 1 - Reorient to one feature (Priority: P1)

As a person returning to a repository, I want to select a feature and see its
current position and next step, so I can resume without running a command or
reading raw project files.

**Independent Test**: Exercise an exact target, one unambiguous active target,
and zero or several candidates. Confirm that the selected feature's stage, next
step, blockers, unanswered-question count, and freshness agree with the same
authority used by the status workflow.

**Acceptance Scenarios**:

1. **Given** an exact feature target, **When** the canvas opens, **Then** only
   that target is selected.
2. **Given** no target and exactly one unambiguous active feature, **When** the
   canvas opens, **Then** that feature is selected automatically.
3. **Given** zero or several candidates, **When** the canvas opens, **Then** a
   chooser appears with no recency-based default.
4. **Given** current authoritative state, **When** the cockpit renders, **Then**
   it shows stage, next step, blockers, unanswered-question count, and
   freshness in plain language.

### User Story 2 - Trust the projected state (Priority: P1)

As a person deciding what to do next, I want each fact tied to the correct
authority, so I do not act on a stale mirror, drift snapshot, or ambiguous
owner.

**Independent Test**: Exercise Definition Only, Lightweight Execution, and
Tracked Execution, including malformed ownership and a selected feature absent
from an otherwise populated tracked board. Confirm that unsupported conclusions
are withheld and no weaker authority is substituted.

**Acceptance Scenarios**:

1. **Given** imported tracked work, **When** a feature is projected, **Then**
   tracked work is globally authoritative and only exact specification identity
   binds tracked facts to that feature.
2. **Given** Lightweight Execution without tracked import, **When** a feature is
   projected, **Then** canonical task units determine work state.
3. **Given** Definition Only, **When** a feature is projected, **Then** the exact
   selected ledger or exactly owned package supplies lifecycle facts.
4. **Given** no exact owner, multiple exact owners, malformed state, or
   conflicting authority, **When** projection runs, **Then** the cockpit names
   the problem and withholds unsupported fields.
5. **Given** feature B is selected while tracked issues represent only feature
   A, **When** B is projected, **Then** B remains selected, safe B facts remain
   visible, execution facts are unavailable, and neither A's tracked facts nor
   B's markdown tasks are attributed as B's live work.

### User Story 3 - Understand freshness (Priority: P2)

As a person who may edit project files elsewhere, I want an honest freshness
state and manual refresh, so I know whether the cockpit still describes disk.

**Independent Test**: Change one authoritative input while the panel is open,
restore focus, and refresh. Confirm that changed, stale, unavailable, conflict,
and current states are distinct and that refresh swaps only a complete read.

**Acceptance Scenarios**:

1. **Given** a complete read, **When** the cockpit renders, **Then** it shows the
   read time and authority class.
2. **Given** an input changed after rendering, **When** freshness is checked,
   **Then** the existing view is marked changed without optimistic replacement.
3. **Given** a successful refresh, **When** the successor is complete, **Then**
   every displayed field changes as one projection.
4. **Given** a failed refresh, **When** a prior complete projection exists,
   **Then** it remains visible with a stale or unavailable label and a safe
   recovery action.

### User Story 4 - Use the available canvas space (Priority: P2)

As a person using the Copilot canvas at different host widths, I want the Now
cockpit to use the available workspace and recompose coherently, so narrow
compatibility does not limit ordinary or wide use.

**Independent Test**: In the real host, identify representative narrow, medium,
and wide widths. Verify single-column narrow behavior, progressively richer
composition at larger widths, bounded text measures, 360px minimum
compatibility, keyboard operation, 200% text zoom, and light/dark contrast.

**Acceptance Scenarios**:

1. **Given** a genuinely narrow host width, **When** the cockpit renders,
   **Then** it uses one column without horizontal scrolling or lost information.
2. **Given** medium or wide available width, **When** the cockpit renders,
   **Then** it uses that width for useful composition rather than centering a
   permanent narrow shell.
3. **Given** any supported width, **When** prose renders, **Then** readable text
   measures remain bounded within the fluid workspace.
4. **Given** keyboard-only use or 200% text zoom, **When** the user selects,
   discloses, or refreshes, **Then** controls remain reachable, ordered, named,
   focused, and trap-free.
5. **Given** light or dark host appearance, **When** interactive boundaries and
   states render, **Then** they meet WCAG 2.2 AA, including 3:1 non-text
   contrast, and do not rely on color alone.

## Edge Cases

- The repository has no `.dude/` directory or has empty, partial, unreadable,
  malformed, or conflicting lifecycle state.
- An exact target is absent, malformed, resolved, or lacks exactly one owner.
- A defined package has all-open tasks and no execution evidence.
- Tracked authority exists but is unavailable or has no issue for the selected
  feature.
- Lightweight tasks are malformed, blocked, dependency-incomplete, or complete.
- The drift snapshot is absent, malformed, stale, or divergent.
- More than 40 packages and long feature names are present.
- An input changes during a read or a refresh succeeds only in part.
- Unanswered-question structure cannot be counted safely.
- The host is 360px wide, text is zoomed to 200%, or theme changes while open.

## Functional Requirements

- **FR-001:** The product MUST register one discoverable canvas named `Dude`
  with canvas identifier `dude`.
- **FR-002:** The canvas MUST present a read-only Now cockpit for one selected
  feature and MUST perform no Dude mutation, message, command, answer, approval,
  task execution, stop, or review action in this cycle.
- **FR-003:** An exact supplied feature target MUST take precedence. Without
  one, the canvas MUST auto-select only one unambiguous active feature;
  otherwise it MUST show a chooser.
- **FR-004:** Selection MUST NOT use modification time, chronology, lifecycle
  number, filename order, or task order.
- **FR-005:** A package MUST be treated as owned only when exactly one defined
  direct idea has exact `spec_path` equality with that package's specification.
- **FR-006:** Projection MUST use current status authority and lane precedence.
  A populated tracked board is globally authoritative, canonical tasks are
  authoritative only for genuine Lightweight Execution without tracked import,
  and otherwise the exact ledger or owner supplies Definition Only facts.
- **FR-007:** Tracked facts MUST bind to a selected feature only by exact
  specification identity. A selected feature absent from a populated tracked
  board MUST retain only safe feature-local facts and MUST NOT fall back to
  markdown task state.
- **FR-008:** The task-state drift snapshot MUST NOT supply live task facts.
- **FR-009:** The cockpit MUST show a supported stage, one next step or a reason
  none is available, authoritative blockers, and a safely derived unanswered-
  question count. Unsupported values MUST be withheld.
- **FR-010:** Stage, next-step, blocker, readiness, and dependency derivation
  MUST reuse current workflow semantics rather than create another state model.
- **FR-011:** Blockers MUST retain source, classification when available, and a
  plain-language reason. An unanswered-question count or cross-feature tracking
  mismatch MUST NOT become a blocker without authoritative evidence.
- **FR-012:** Internal lane names, glyphs, hashes, and task keys MUST remain
  outside primary orientation; exact source details MAY appear in disclosure.
- **FR-013:** The cockpit MUST show the last complete read and explicit current,
  changed, stale, unavailable, and conflict states.
- **FR-014:** Refresh MUST replace the view only after a complete successful
  read. Failed or partial reads MUST NOT mix fields from different projections.
- **FR-015:** External edits MUST be detected on focus or freshness check,
  incorporated only after successful refresh, and never overwritten.
- **FR-016:** Empty and error states MUST name the observed condition and offer
  one safe read-only next action.
- **FR-017:** The chooser and projection MUST remain usable with at least 40
  packages without loading every full package before the first useful view.
- **FR-018:** Optional orientation details MAY appear only when source-backed,
  read-only, useful to I1, covered by the same evidence, and not a separate
  workflow.
- **FR-019:** The canvas MUST use all available host width with a coherent
  single-column layout only when genuinely narrow, progressively richer
  composition as width grows, and bounded measures for prose. It MUST NOT impose
  a permanent 380px or 480px maximum shell.
- **FR-020:** Representative narrow, medium, and wide test widths MUST be
  derived from actual host behavior. The surface MUST remain usable at 360px as
  a minimum compatibility test, at 200% text zoom, and without horizontal
  scrolling of essential content.
- **FR-021:** The canvas MUST be keyboard operable, semantically named,
  logically ordered, visibly focused, trap-free, reduced-motion compatible, and
  understandable without color.
- **FR-022:** The selected visual direction MUST use Microsoft Fluent 2 and real
  Microsoft Fluent components with preserved component anatomy. Host theme
  variables MAY map into the theme where appropriate. Interactive boundaries
  MUST use an accessible stroke token or verified theme override that reaches
  3:1 non-text contrast; decorative rules MAY use lower-contrast neutral rules.
- **FR-023:** D1-D3 MUST retain their completed independent review and user
  acceptance evidence. Product UI implementation MUST follow the approved
  canonical Fluent 2 desktop application shell at
  `.dude/specs/052-dude-canvas-ui/design/fluent-desktop-workspace.html`, including
  its command bar, 48px activity rail, breadcrumb and identity strip, focal Next
  region, lifecycle and progress, central Phases and Activity, right
  properties/evidence dock, persistent status bar, fluid full-width behavior,
  coherent narrow collapse, and 360px compatibility.
- **FR-024:** With visual approval complete, internal I0 evidence MUST prove
  canvas open/close, authoritative reading, one same-session request and
  completed response, duplicate-free refresh, abort, and post-abort
  reconciliation before the live Now UI.
- **FR-025:** I0 message, response, deduplication, and abort proof capability
  MUST NOT remain reachable in the shipped I1 UI.
- **FR-026:** The feature MUST be dogfooded against this repository at
  host-derived narrow, medium, and wide widths and included as committed static
  assets in the standard release without consumer installation, network, or
  runtime build.
- **FR-027:** The single-canvas architecture and approved desktop application
  shell MUST remain compatible with later full-panel Needs You and Review
  workflows while implementing none of them in this cycle.

## Key Entities

- **Feature target**: The exact selected idea or exactly owned package.
- **Ownership binding**: One defined direct idea whose exact `spec_path` equals
  the package specification.
- **Authority source**: The tracked board, canonical Lightweight tasks, or exact
  Definition Only artifact that supplies a fact.
- **Cross-feature authority attention**: A selected feature is absent from a
  globally authoritative tracked board; it is not itself a blocker.
- **Now projection**: One complete read-only snapshot of orientation facts and
  their source details.
- **Freshness state**: The last complete read time and whether its authoritative
  input identities remain current.

## Scope And Surfaces

### In scope

- One project-scope Dude canvas and read-only Now cockpit.
- Exact selection, ownership, authority projection, freshness, and chooser.
- Empty, partial, malformed, conflicting, large-repository, and external-change
  states.
- Fluid full-width responsive composition, narrow compatibility, accessibility,
  light/dark appearance, and Fluent 2 visual treatment.
- The internal I0 proof, standard release projection, and real-host dogfood.

### Out of scope

- Needs You, question answering, Sharpie/Review, annotation, PDF support,
  commands, task execution, mutation, approval, cancellation, and stop controls.
- Artifact editing, backlog management, Team and Packs, and a command palette.
- Modification or retirement of package 025, or dependency on idea 053.
- A consumer package install, runtime compilation, network dependency, service,
  daemon, watcher, or persistent canvas store.

## Visual Intent

### Should Feel

- Like a focused workspace whose stage, next step, and attention state are easy
  to scan.
- Native to the host through Fluent 2 components and theme integration.
- Compact when space is scarce and more informative when space is available.
- Trustworthy about source, freshness, ambiguity, and unavailable state.

### Should Never Feel

- Like a permanent narrow phone mock centered in a wide canvas.
- Like a dashboard, chat transcript, command list, or dead navigation shell.
- Like generic cards stretched across the screen with unreadably long prose.
- Like Fluent colors applied to custom controls that discard Fluent anatomy.

## Brand Fit

- Use Microsoft Fluent 2 and genuine Fluent UI v9 components.
- Preserve Fluent anatomy, spacing, focus, disabled, and interaction states.
- Map a Fluent theme to host canvas variables where that preserves host fit.
- Use `colorNeutralStrokeAccessible` or an equivalent verified override for
  interactive boundaries. `colorNeutralStroke1` is decorative-only unless a
  specific pairing is independently verified at 3:1.

## Direction Options

### Approved direction - Fluent 2 desktop application shell

- The approved canonical preview is
  [`fluent-desktop-workspace.html`](design/fluent-desktop-workspace.html).
- Persistent desktop chrome comprises the command bar, 48px activity rail,
  breadcrumb and identity strip, right properties/evidence dock, and status bar.
- The Next region remains focal. Lifecycle and progress follow it, with
  source-backed Phases and Activity filling the central work column.
- The shell is fluid and full-width, docks regions when room permits, collapses
  coherently when narrow, and treats 360px as compatibility only.
- Earlier responsive-panel and visual-system variants remain retained evidence,
  not active direction choices or live authority.
- Clearline and Strata remain installed by user choice but are not active
  directions for this feature.

## Proposed Direction

The approved Fluent 2 desktop application shell is the implementation
authority. It combines lifecycle-tool conventions with Fluent anatomy: compact
persistent chrome, docked work and evidence regions, a focal Next surface, and
source-backed Phases and Activity. It uses the available width without imposing
a permanent narrow shell and preserves a coherent one-column collapse.

## Visual Success Criteria

- **VSC-001:** The approved canonical preview at
  `.dude/specs/052-dude-canvas-ui/design/fluent-desktop-workspace.html` uses the
  full available width and demonstrates coherent narrow, medium, and wide
  compositions.
- **VSC-002:** Stage, next step, blockers or attention, and freshness scan before
  secondary source detail at every representative width.
- **VSC-003:** Text measures remain readable inside the fluid workspace, and the
  360px compatibility view loses no essential information.
- **VSC-004:** The preview uses real Fluent 2 anatomy and source-backed content,
  including the command bar, 48px activity rail, breadcrumb and identity,
  lifecycle/progress, central Phases and Activity, right properties/evidence
  dock, and persistent status bar, with no dead product affordance.
- **VSC-005:** Light/dark, keyboard, focus, zoom, and state treatment meet WCAG
  2.2 AA, including 3:1 non-text contrast for interactive boundaries.
- **VSC-006:** The implemented surface matches the approved canonical preview
  across host-derived narrow, medium, and wide conditions.

## Success Criteria

- **SC-001:** Exact, single-unambiguous, and chooser selection cases make zero
  recency or chronology inferences.
- **SC-002:** Every projected fact traces to the authority required by FR-005
  through FR-011; unsupported facts are absent.
- **SC-003:** In the selected-B/tracked-only-A case, B remains visible, no A
  execution fact or B markdown task fact appears, and the mismatch is attention.
- **SC-004:** Every malformed, partial, conflicting, tracker-unavailable, and
  external-change case names the condition and one safe next action.
- **SC-005:** A successful refresh swaps one complete projection; a failed
  refresh swaps none.
- **SC-006:** With at least 40 packages, selection and primary orientation remain
  usable without rendering every package document.
- **SC-007:** At host-derived narrow, medium, and wide widths, plus the 360px
  minimum, essential content remains available with bounded prose and no
  horizontal scroll.
- **SC-008:** Accessibility evidence finds no missing accessible name, invisible
  focus, keyboard trap, color-only state, text contrast failure, or interactive
  boundary below 3:1 in light or dark mode.
- **SC-009:** I0 evidence covers host discovery, authoritative reading,
  same-session response, deduplication, abort, and reconciliation while the I1
  product exposes none of those controls.
- **SC-010:** The real host dogfood and standard release contain the committed
  static Dude canvas assets and require no consumer build or install.

## Assumptions

- Current status semantics remain the correctness baseline.
- Focus-time freshness checking plus manual refresh is sufficient for I1.
- Existing design artifacts remain preserved as exploration evidence; only
  `.dude/specs/052-dude-canvas-ui/design/fluent-desktop-workspace.html` is the
  approved canonical authority.
- Design approval is complete. Implementation follows the approved Fluent 2
  desktop application shell while retaining 360px as compatibility only.
- Current project and bundle guardrails are sufficient.

## Revision Log

- 2026-09-01 UTC - first definition established the read-only I1 Now boundary
  with visual direction still exploring.
- 2026-09-01 UTC - re-definition selected Fluent 2 with Fluent UI React and
  replaced narrow-first assumptions with a fluid full-width responsive
  composition while design exploration continued.
- 2026-09-01 UTC - explored a desktop application shell direction at
  `design/fluent-desktop-workspace.html`, drawing structure from
  established lifecycle tools: an activity rail, breadcrumb, and persistent
  status bar; an identity strip with a properties column; and dense, quiet
  chrome. The earlier responsive panel was retained unchanged for comparison.
- 2026-09-01 UTC - user requested that the centre column carry real content
  instead of empty space; added source-backed Phases and Activity regions
  below the lifecycle, and composed the not-read and unavailable cases so no
  fixture leaves a void.
- 2026-09-01 UTC - approved the desktop application shell. `preview_path` moved
  from `design/fluent-responsive-workspace.html` to
  `design/fluent-desktop-workspace.html`; the responsive panel and every other
  exploration artifact remain preserved as evidence.
- 2026-09-02 UTC - reconciled package-wide design authority to the approved
  Fluent 2 desktop application shell and its source-backed Phases and Activity;
  retained earlier responsive variants as evidence only.
