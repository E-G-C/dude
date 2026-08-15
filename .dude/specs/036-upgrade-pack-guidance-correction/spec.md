# Feature Specification: Upgrade Pack Guidance Correction

## Purpose

The shipped guidance users encounter after a bundle upgrade still directs them
to remove and re-add an installed pack when its source or projected content
changes. The current engine already provides one dedicated installed-pack
refresh operation, so that recipe is obsolete and sends users away from the
safe, direct path.

This feature corrects the affected upgrade guidance to lead with
`compose refresh <pack>`. It removes remove-then-add as an installed-pack update
path, including as a legacy fallback, while preserving remove and add for
ordinary uninstall and installation. It changes guidance only and adds no engine
behavior.

## User Scenarios & Testing

### User Story 1 - Follow the current installed-pack refresh path (Priority: P1)

As a user reading upgrade guidance after a bundle or pack-source change, I want
the instructions to lead with `compose refresh <pack>`, so that I update an
installed pack through the current dedicated operation rather than an obsolete
remove-then-add recipe.

**Why this priority**: Correcting the misleading update instruction is the
complete user-facing defect.

**Independent Test**: Inspect the shipped upgrade workflow guidance and the
public installed-pack refresh section. Confirm both lead installed-pack updates
with `compose refresh <pack>` and neither presents remove-then-add as an update
path or fallback.

**Acceptance Scenarios**:

1. **Given** an installed pack whose source or projected content changed,
   **When** a user reads either affected upgrade-guidance surface, **Then** the
   stated update operation is `compose refresh <pack>`.
2. **Given** a user has just upgraded the core bundle, **When** the guidance
   explains that installed packs are preserved rather than refreshed
   automatically, **Then** it directs the user to refresh an affected pack
   explicitly.
3. **Given** current-engine guidance for updating an installed pack, **When** all
   affected instructions are inspected, **Then** none requires remove followed
   by add and none describes that sequence as a legacy fallback.

### User Story 2 - Preserve ordinary install and uninstall meaning (Priority: P2)

As a user managing pack lifecycle, I want remove and add to remain ordinary
uninstall and installation operations, so that correcting update guidance does
not erase or redefine their real purposes.

**Why this priority**: The correction must remove only the false update recipe,
not valid pack lifecycle operations.

**Independent Test**: Inspect the resulting guidance and confirm refresh is the
installed-pack update operation, remove remains an uninstall operation, add
remains an installation operation, and no runtime behavior is claimed to have
changed.

**Acceptance Scenarios**:

1. **Given** a user wants to uninstall a pack, **When** lifecycle guidance
   discusses remove, **Then** remove retains its ordinary uninstall meaning.
2. **Given** a user wants to install a pack, **When** lifecycle guidance
   discusses add, **Then** add retains its ordinary installation meaning.
3. **Given** the corrected documentation, **When** the implementation is
   inspected, **Then** no engine behavior, command semantics, or pack state
   format has changed.

## Edge Cases

- A core bundle upgrade preserves installed packs but does not refresh them
  automatically. The guidance must keep that distinction while naming the
  explicit refresh operation.
- A reader may be using an older released engine without refresh. Current
  documentation still describes the current engine and does not add a
  remove-then-add fallback.
- A sentence can avoid a command block yet still claim that installed-pack
  updates occur only through remove and add. Such prose is stale and must be
  corrected too.
- Remove and add may appear for genuine uninstall and installation. Their valid
  lifecycle uses must not be rejected merely because the obsolete update recipe
  is removed.
- Every shipped presentation of the affected guidance must agree; one stale copy
  is enough to preserve the defect.

## Requirements

### Functional Requirements

- **FR-001**: The affected shipped upgrade guidance MUST identify
  `compose refresh <pack>` as the operation for updating an installed pack after
  its authoritative source or projected content changes.
- **FR-002**: The public installed-pack refresh guidance MUST lead with
  `compose refresh <pack>` rather than remove followed by add.
- **FR-003**: The affected guidance MUST NOT present remove-then-add as an
  installed-pack update requirement, recommendation, alternate path, or legacy
  fallback.
- **FR-004**: The guidance MUST preserve the distinction that a core bundle
  upgrade refreshes core content and preserves installed packs, while an
  affected installed pack is refreshed explicitly.
- **FR-005**: Remove MUST remain an ordinary uninstall operation and add MUST
  remain an ordinary installation operation; the correction MUST NOT redefine
  either operation.
- **FR-006**: Every shipped copy of the affected upgrade guidance MUST agree on
  the current refresh path.
- **FR-007**: The feature MUST change documentation and guidance only and MUST
  NOT add or alter engine behavior, command semantics, persistent state, pack
  ownership, or transaction behavior.

### Key Entities

- **Affected upgrade guidance**: The shipped upgrade workflow instructions and
  public upgrading section that currently describe how installed packs are
  updated after relevant changes.
- **Installed-pack refresh**: The current explicit operation that re-projects an
  already-installed pack from its current authoritative source.
- **Ordinary uninstall and installation**: The distinct lifecycle purposes for
  remove and add, respectively.
- **Current-engine guidance**: Documentation for the engine shipped now, without
  a legacy remove-then-add update fallback.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Both requested shipped upgrade-guidance surfaces lead every
  installed-pack update instruction with `compose refresh <pack>`.
- **SC-002**: Zero statements in either affected surface require, recommend, or
  offer remove followed by add for updating an installed pack.
- **SC-003**: Remove and add retain their ordinary uninstall and installation
  meanings wherever those lifecycle operations remain documented.
- **SC-004**: Every shipped presentation of the affected upgrade guidance names
  the same current installed-pack refresh path.
- **SC-005**: The correction causes zero observable changes to command behavior,
  persistent state, ownership, or refresh transaction semantics.
- **SC-006**: In mutation checks, deleting the required refresh instruction or
  reinstating the remove-then-add update recipe causes acceptance to fail for
  the affected surface.

## Assumptions

- The accepted answer to Q1 is authoritative: current documentation describes
  the current engine and carries no legacy remove-then-add update fallback.
- The dedicated refresh operation already exists and is not changed by this
  feature.
- Core upgrades continue to preserve installed packs rather than refreshing
  their projections automatically.
- Existing documentation outside the two affected shipped upgrade surfaces
  already covers ordinary pack installation and uninstallation.

## Out of Scope

- Any implementation change to upgrade, refresh, add, or remove.
- A compatibility workflow for engines that predate installed-pack refresh.
- Changes to pack inventories, profiles, ownership, projection, or transaction
  behavior.
- Reopening or redefining the feature that introduced transactional pack
  refresh.
- Editing project memory or broadening the correction to unrelated guidance.
