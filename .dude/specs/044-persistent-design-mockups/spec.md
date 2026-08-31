# Feature Specification: Persistent Design Mockups

## Purpose

Visual-design exploration needs a durable artifact set that survives an
ordinary process, session, or computer restart. The current workflow correctly
uses the canonical design package but assumes that every primary mock is
`preview.html`. That assumption excludes other suitable outputs and makes the
orientation contract narrower than the design work it governs.

This feature makes the primary mock format-neutral. Its actual
workspace-relative filename and extension live in the existing `preview_path`,
and any files required to use that primary artifact remain beside it under the
same `design/` directory. One primary path remains the orientation entrypoint
and sole live authority. Useful external references may provide context under
`design/references/`, but never become live authority.

The existing definition, approval, evidence, quality, ownership, and
execution-lane gates remain in force. Screenshot evidence remains required
where applicable. An inherently viewable artifact may be inspected directly
without requiring a separate image screenshot solely to duplicate the same
visible output; direct inspection does not waive otherwise applicable
screenshot evidence.

This is a workflow-prose feature rather than a rendered surface, so its own
implementation has no design approval gate.

## User Scenarios & Testing

### User Story 1 - Resume the actual primary artifact (Priority: P1)

As a person exploring a visual direction, I want the primary mock and its
required files kept in the canonical design package, so that I can resume the
same work regardless of the format chosen for the target.

**Independent Test**: Define an exploring package, create a primary mock in a
format suited to the target, revise it, and resume after a simulated restart.
Confirm that `preview_path` uses the artifact's actual filename and extension,
every response reports that exact path, and resume inspects the existing
artifact set rather than creating or selecting another authority.

**Acceptance Scenarios**:

1. **Given** a defined package whose intended output is not HTML, **when** mock
   creation begins, **then** the primary artifact uses the suitable format and
   `preview_path` records its exact workspace-relative filename and extension.
2. **Given** a mock that requires supporting assets, sources, exports, variants,
   or pages, **when** it is created or updated, **then** the required files stay
   with the primary artifact under the package's `design/` directory.
3. **Given** an existing mock in `exploring`, `proposed`, or `approved`,
   **when** work resumes, **then** the workflow reports the exact
   `preview_path`, inspects the primary artifact and required supporting files,
   and continues that artifact set.
4. **Given** the recorded primary artifact or a required supporting file is
   missing, **when** work resumes, **then** the workflow reports the missing
   exact path and stops instead of silently replacing or superseding it.

### User Story 2 - Preserve one authority across tools and formats (Priority: P1)

As a design-workflow user, I want outputs from local tools, external tools, and
Model Context Protocol integrations saved into the same package, so that a
tool session or reference cannot become a competing or ephemeral live mock.

**Independent Test**: Exercise a raw idea, an external current mock, a
tool-generated export, a useful external reference, a multi-file artifact, and
proposal approval. Confirm that definition precedes the first output, accepted
external work is handed into `design/`, useful references remain contextual
only, one `preview_path` remains authoritative, and product source stays
separate.

**Acceptance Scenarios**:

1. **Given** a raw or draft visual idea, **when** the first render, export, or
   capture is requested, **then** explicit definition first establishes a
   minimal `design_status: exploring` package.
2. **Given** output created through MCP or another tool, **when** it becomes
   the current mock, **then** its artifact set is exported or saved under
   `design/`; an external session reference alone is not accepted as durable.
3. **Given** a useful external source, session, or tool reference, **when** it
   is retained for context, **then** it may be recorded under
   `design/references/` but does not become `preview_path` or live authority.
4. **Given** accepted current content from an external or scratch location,
   **when** exploration continues, **then** its primary artifact and required
   supporting files are copied, moved, saved, or exported into `design/`
   before further live edits.
5. **Given** supporting source and an exported primary output, **when** the
   mock is oriented or resumed, **then** the one `preview_path` primary remains
   the entrypoint and neither supporting source nor an external copy becomes a
   second live authority.
6. **Given** an approved mock, **when** product implementation starts, **then**
   product source remains in its normal target location rather than becoming
   part of the proposal package.

### User Story 3 - Retain the binding evidence and design safeguards (Priority: P1)

As a design-workflow user, I want correction, evidence, approval, realism,
provenance, accessibility, and refinement checks to work with the artifact
chosen for the target, so that format neutrality does not weaken safeguards or
create redundant evidence requirements.

**Independent Test**: Exercise a directly viewable image or document and a
rendered interactive artifact. Confirm that each follows a suitable
compose/edit, render/export/capture, inspect, and correction loop; screenshot
evidence is retained wherever applicable; direct inspection does not waive
applicable screenshot evidence; and no separate image screenshot is demanded
solely to duplicate every inherently viewable artifact.

**Acceptance Scenarios**:

1. **Given** a mock format with directly inspectable visual output, **when** the
   user requests corrections, **then** the workflow edits or composes, renders
   or exports as needed, captures applicable evidence, inspects the result, and
   repeats from the user's correction.
2. **Given** a mock where a screenshot materially demonstrates a rendered
   state, **when** evidence is gathered, **then** that screenshot evidence is
   captured and retained.
3. **Given** an artifact that is already inherently viewable, **when** its
   visible output is inspected, **then** direct inspection may establish that
   output without requiring a separate image screenshot solely to duplicate
   it, provided no otherwise applicable screenshot evidence is omitted.
4. **Given** an actionable element in a mock, **when** realism is evaluated,
   **then** the element is checked against the capability envelope declared by
   the actual target's implementation owner rather than a fixed static or
   dynamic assumption.
5. **Given** a direction that settles and is later approved, **when** execution
   proceeds, **then** settle-before-approval, explicit approval, provenance,
   accessibility, post-implementation refinement, exact ownership, and
   active-lane authority remain unchanged.

### User Story 4 - Keep persistence deliberately small (Priority: P2)

As a maintainer, I want format-neutral persistence to reuse ordinary package
files and the existing orientation field, so that the workflow gains no
registry, service, command, or speculative core behavior.

**Independent Test**: Inspect the complete observable workflow contract.
Confirm that it reuses `design/` and `preview_path`, treats format examples as
illustrative, permits only contextual external references, and adds no new
state carrier, background behavior, Git action, command, or core behavior
without concrete current proof.

**Acceptance Scenarios**:

1. **Given** several format examples, **when** a different suitable artifact
   type is selected, **then** the workflow permits it because the examples are
   illustrative rather than an allowlist.
2. **Given** an uncommitted canonical artifact, **when** it is deleted or its
   disk is lost, **then** the workflow makes no recovery guarantee beyond the
   ordinary repository or worktree filesystem.
3. **Given** design resume or orientation, **when** current work is reported,
   **then** the existing `preview_path` supplies the exact path without a new
   registry or core status field.
4. **Given** no concrete current caller or failing contract requiring a core
   change, **when** the feature is delivered, **then** core remains unchanged.

## Requirements

### Functional Requirements

- **FR-001**: Once actual mock creation begins, the workflow MUST keep the
  durable live primary artifact and every required supporting file under
  `.dude/specs/<feature>/design/`.
- **FR-002**: The primary artifact format MUST be selected for the target and
  intended output. Named formats such as HTML, PDF, PNG, JPEG, SVG, documents,
  slides, decks, canvas exports, and tool-generated files MUST be treated as
  examples rather than an allowlist.
- **FR-003**: The existing `preview_path` MUST identify the one primary current
  mock using its exact workspace-relative filename and actual extension through
  `design_status: exploring`, `proposed`, and `approved`.
- **FR-004**: The primary `preview_path` MUST remain the single orientation
  entrypoint. Required assets, sources, exports, variants, or pages MUST NOT
  become a second live authority.
- **FR-005**: Output created through MCP or another tool MUST be exported or
  saved into the package's `design/` directory before it is treated as the
  durable current mock. An external session or tool reference alone MUST NOT
  serve as the live artifact.
- **FR-006**: Useful external references MAY be recorded under
  `design/references/` for context, but MUST NOT become `preview_path`, a
  substitute for the durable artifact set, or another live authority.
- **FR-007**: Every workflow response that creates, updates, or resumes a mock
  MUST report the exact current `preview_path`, without substituting a
  hard-coded filename or extension.
- **FR-008**: Resume and restart behavior MUST inspect and continue the existing
  primary artifact and its required supporting files. It MUST NOT silently
  recreate, abandon, supersede, or select another primary artifact.
- **FR-009**: If the primary artifact or a required supporting file is missing,
  resume MUST report its exact missing path and stop instead of manufacturing
  a replacement.
- **FR-010**: Accepted current content from an external or scratch location
  MUST be copied, moved, saved, or exported into the canonical package before
  work continues. After handoff, the canonical `preview_path` artifact MUST be
  the sole primary live authority.
- **FR-011**: A raw or draft idea MUST have a flat brainstorm ledger and an
  explicit definition establishing a minimal `design_status: exploring`
  package before the first render, export, or capture.
- **FR-012**: An exploring design specification MAY remain lean while direction
  develops and MUST be backfilled with the settled direction when
  `design_status` becomes `proposed`.
- **FR-013**: The workflow MUST preserve a format-appropriate correction loop:
  edit or compose, render or export or capture as needed, inspect, accept user
  correction, and repeat.
- **FR-014**: Screenshot evidence MUST be captured and retained wherever it
  applies. An inherently viewable artifact MAY be inspected directly without a
  separate image screenshot solely to duplicate the same visible output, but
  direct inspection MUST NOT waive otherwise applicable screenshot evidence.
- **FR-015**: Ungated refinement, settle-before-approval, and explicit approval
  before product implementation MUST remain in effect.
- **FR-016**: Functional realism MUST remain relative to the capability envelope
  declared by the actual target's implementation owner. Provenance,
  accessibility, contrast, and post-implementation refinement gates MUST remain
  in effect.
- **FR-017**: Exact package ownership and active execution-lane authority MUST
  remain unchanged.
- **FR-018**: Proposal and mock artifacts under `design/` MUST remain separate
  from product source. Approved implementation MUST use the target's normal
  source location.
- **FR-019**: Persistence MUST mean ordinary repository or worktree survival
  across process, session, or computer restart and MUST NOT promise recovery
  from deletion, uncommitted-work loss, or disk loss.
- **FR-020**: The feature MUST add no mock registry, revision database, cache,
  state store, daemon, autosave service, background process, duplicate
  workflow, new command, or automatic Git action. It MUST NOT change core
  behavior without concrete proof from a current caller or failing contract.
- **FR-021**: Implementing this workflow-prose feature MUST NOT require a
  design mock, `design_status`, or design approval gate.

### Key Entities

- **Primary mock artifact**: The single orientation entrypoint identified by
  the exact current `preview_path`.
- **Required supporting files**: Assets, sources, exports, variants, pages, or
  other files without which the primary artifact cannot be used or continued.
- **Artifact set**: The primary mock and its required supporting files under
  the canonical package's `design/` directory.
- **Preview path**: The existing exact workspace-relative identity of the
  primary artifact, including its actual filename and extension.
- **External reference**: Context retained under `design/references/` that may
  identify a tool, source, MCP resource, scratch location, or session but
  cannot replace the artifact set or hold live authority.
- **Ordinary persistence**: Filesystem survival supplied by the repository or
  worktree without an added persistence subsystem.

## Edge Cases

- A raw idea requests immediate output. Definition happens first; no temporary
  render or export is used as a shortcut.
- The target calls for an artifact type not named in the examples. The target
  and intended output determine the format because the examples are not an
  allowlist.
- A primary artifact uses several supporting files. They remain under
  `design/`, while only the primary artifact occupies `preview_path`.
- A document source produces an exported PDF. The selected primary artifact is
  recorded explicitly; source and export do not become competing authorities.
- An external tool cannot save directly into the package. Its accepted output
  is exported, saved, copied, or moved into `design/` before continuation.
- A useful external session link is retained under `design/references/`. It
  remains contextual and cannot substitute for the durable mock.
- The primary artifact exists but a required support file is missing. Resume
  reports the missing file and stops.
- The user asks for several genuine direction options. Existing option rules
  remain in force, but each option's artifact handling must avoid competing
  live authorities for one direction.
- A raster image, PDF, or slide is directly inspectable. Direct inspection may
  establish its visible output without a duplicative screenshot, while any
  independently applicable screenshot evidence remains required.
- An interactive surface exposes controls. Functional realism is evaluated
  against the declared capability envelope for that actual target.
- A core enhancement appears convenient. Without concrete current proof, it is
  excluded.
- This feature enters implementation through Ship. It proceeds as workflow
  prose without waiting for design approval.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Across acceptance cases using at least two suitable primary
  formats, 100% of create, update, and resume responses report the exact
  workspace-relative primary path and actual extension, with no substituted
  fixed-format filename.
- **SC-002**: In every evaluated single-file, multi-file, local-tool, and
  external-tool case, all live files required to use the mock reside under the
  canonical `design/` directory, exactly one primary path is authoritative,
  and zero external references become live authority.
- **SC-003**: Resume in each of `exploring`, `proposed`, and `approved`
  continues the same recorded artifact set; every evaluated missing-file case
  identifies the exact missing path and stops without silent replacement.
- **SC-004**: Zero evaluated raw or draft ideas produce a first render, export,
  or capture before explicit definition, and 100% of accepted external or
  scratch mocks are handed into the canonical package before further live
  editing.
- **SC-005**: Every evaluated correction cycle retains screenshot evidence
  wherever applicable. Directly viewable cases require no separate image
  screenshot solely to duplicate the same visible output, and no applicable
  screenshot evidence is omitted.
- **SC-006**: Across all evaluated lifecycle cases, zero format-neutral or
  direct-inspection paths bypass settlement, approval, capability-relative
  realism, provenance, accessibility, refinement, exact ownership, or
  active-lane authority.
- **SC-007**: Every supported presentation of the design workflow exposes the
  same format-neutral artifact, reference, evidence, and lifecycle contract,
  with no stale fixed-format instruction.
- **SC-008**: Delivery introduces zero product-source relocations, unsupported
  core changes, second live authorities, registries, revision databases,
  caches, state stores, daemons, autosave services, background processes,
  duplicate workflows, new commands, or automatic Git actions.
- **SC-009**: Implementation and verification introduce zero design mocks,
  `design_status` requirements, or design approval checkpoints for Feature 044
  itself.

## Assumptions

- The target and intended output determine the primary mock format and
  filename.
- The existing `design/` package directory, `design/references/` location, and
  `preview_path` field remain the correct storage, contextual-reference, and
  orientation contracts.
- Existing definition, approval, realism, provenance, accessibility,
  ownership, lane, close, and refinement gates remain valid and require
  preservation rather than redesign.
- Existing project and bundle guardrails are sufficient.
