# Feature Specification: Transactional Pack Refresh

## Purpose

A pack maintainer who edits an installed capability pack's authoritative source currently has no safe one-step way to update the installed representation. The uninstall path deliberately refuses to run once the recorded source has changed, and the install path treats an already-installed pack as a no-op, so the only working recipe is a fragile four-step dance: restore the old source bytes, uninstall, restore the edited source bytes, then install again. That recipe silently breaks whenever the edit added, renamed, or deleted a file, because restoring a directory does not remove files created since the recorded state.

This feature adds one dedicated refresh operation for an already-installed pack. In a single invocation it proves installed-side authority, treats the current authoritative source as the desired new state, computes the difference against what is installed, and applies every replacement, addition, and removal as one all-or-restored transaction that also updates the install record. It expects the source to have changed and therefore does not treat a changed source as a refusal, yet it never silently overwrites a hand-edited installed artifact or a drifted install record, and it never weakens the existing uninstall or install safety.

The outcome is bounded to the existing pack-composition capability. It adds no new workflow lane, persistent artifact, background process, store, scheduler, second renderer, inventory format, or broad build redesign, and it does not repurpose the existing overwrite flag.

## User Scenarios & Testing

### User Story 1 - Refresh an installed pack after its source changed (Priority: P1)

As a pack maintainer, I want one command that updates an installed pack's installed representation from its current authoritative source, so that I no longer perform the manual restore-uninstall-restore-install recipe to pick up a source edit.

**Why this priority**: This is the whole reason for the feature. Without the single transactional command, every source edit still requires the fragile manual recipe that breaks on added, renamed, or deleted files.

**Independent Test**: Install a pack whose source contains agents, skills, an instruction, and a prompt. Edit the source so one destination changes content in place, one destination is added, and one destination is removed (a rename appears as one addition plus one removal). Run the refresh operation once and confirm the installed representation and the install record now match the current source exactly, with no leftover artifacts and no manual steps.

**Acceptance Scenarios**:

1. **Given** an installed pack whose current source changed only the content of already-installed destinations, **When** the pack is refreshed, **Then** every same-path destination is replaced with the current source's projected bytes and the install record's file list is unchanged while its recorded hashes and inventory are updated.
2. **Given** an installed pack whose current source added a new destination, **When** the pack is refreshed, **Then** the new destination is created, recorded in the install record, and validated under the pack's namespace and ownership rules.
3. **Given** an installed pack whose current source removed or renamed a destination, **When** the pack is refreshed, **Then** the old-only destination is deleted with no untracked leftover and is removed from the install record.
4. **Given** a source change that touches agents, skills, instructions, and prompts together, **When** the pack is refreshed, **Then** all four artifact kinds are updated in the same operation.
5. **Given** a successful refresh, **When** the operation reports its result, **Then** it summarizes the replaced, added, and removed destinations for the pack.

### User Story 2 - Prove installed-side authority and refuse unsafe refresh before any change (Priority: P1)

As a pack maintainer, I want refresh to prove that the installed pack and its record are exactly what was recorded before it changes anything, so that a hand-edited installed artifact, a drifted record, or an unsafe target is never silently overwritten.

**Why this priority**: Refresh replaces and deletes installed files. If it proceeded without proving installed-side authority, it could destroy local hand edits or act on corrupted evidence. The safety gates are as important as the happy path.

**Independent Test**: For each unsafe precondition — pack not installed, install record incomplete or legacy, a hand-edited installed artifact, an unresolvable source, a target claimed by another pack or occupied by a non-pack artifact, and an unsafe ownership or path — request a refresh and confirm it is refused with a clear reason and that the installed artifacts and the install record are byte-for-byte unchanged.

**Acceptance Scenarios**:

1. **Given** a pack that is not currently installed, **When** a refresh is requested, **Then** it is refused before any change.
2. **Given** an install record that is not a complete current inventory for the pack, or a record that is not fully current across all installed packs, **When** a refresh is requested, **Then** it is refused before any change so unrelated evidence is never rewritten.
3. **Given** any currently installed target whose bytes no longer match the recorded installed hash, **When** a refresh is requested, **Then** it is refused, the drifted artifact is left untouched, and nothing else changes.
4. **Given** a pack whose current authoritative source cannot be resolved, **When** a refresh is requested, **Then** it is refused and reported rather than silently skipped.
5. **Given** a new destination that is already claimed by another installed pack or already occupied by a core, project, or foreign artifact, **When** a refresh is requested, **Then** it is refused before any change.
6. **Given** an installed target or a new destination that resolves through an unsafe ownership, traversal, or symbolic-link path, **When** a refresh is requested, **Then** it is refused before any change.
7. **Given** the current source differs from the recorded source, **When** a refresh is requested, **Then** the changed source is expected and is not itself a reason to refuse.

### User Story 3 - Apply as one all-or-restored transaction (Priority: P1)

As a pack maintainer, I want refresh to complete fully or leave everything exactly as it was, so that an interrupted or failed refresh never leaves a half-updated pack or a mismatched install record.

**Why this priority**: A partial mutation across several artifact kinds plus the install record would leave the pack in an unrecoverable, undocumented state. Atomicity is the core safety property.

**Independent Test**: Force a failure during application (an artifact write or the record write) after some destinations have already changed, and confirm every installed artifact and the install record are restored to their exact pre-refresh bytes, no new destination remains, no old destination is missing, and no temporary working directory or record-transaction sibling survives.

**Acceptance Scenarios**:

1. **Given** a refresh that fails while applying artifact changes, **When** the failure occurs, **Then** every replaced, added, and removed destination is restored to its exact pre-refresh state.
2. **Given** a refresh that fails while writing the install record, **When** the failure occurs, **Then** the record is restored to its exact authorized bytes and every artifact change is reverted.
3. **Given** authorization succeeded but the install record changed on disk before application, **When** application is attempted, **Then** the refresh is refused and nothing is changed.
4. **Given** any refresh outcome, success or failure, **When** the operation returns, **Then** no temporary staging or transaction working directory and no record-transaction sibling remains.

### User Story 4 - Lead the documented refresh path with the new command (Priority: P2)

As a maintainer following the documentation, I want the guidance, help text, and pack-lifecycle rule to lead with the refresh command, so that the smooth path is discoverable and the old manual recipe is no longer the recommended route.

**Why this priority**: The command is only useful if maintainers find it instead of repeating the fragile manual recipe. This depends on the command existing, so it follows the core behavior.

**Independent Test**: Inspect the command help, the machine-readable result shape, the composition guidance, and the project pack-lifecycle rule, and confirm each presents refresh as the standard way to update an installed pack while still documenting uninstall and install for their own purposes.

**Acceptance Scenarios**:

1. **Given** the command help and machine-readable output, **When** they are inspected, **Then** refresh is listed as a peer operation with a stable result shape.
2. **Given** the composition guidance and the project pack-lifecycle rule, **When** they are read, **Then** the smooth refresh path leads with the refresh command and uninstall and install remain documented for ordinary removal and installation.

## Edge Cases

- **Same destination set, changed content**: every destination is replaced in place; the recorded file list is unchanged while recorded hashes and inventory update.
- **Rename**: the old name is an old-only removal and the new name is a new addition within the same transaction, leaving no leftover at the old name.
- **Instruction and prompt destinations**: same-pack-owned instruction and prompt destinations are refreshable on their own namespace authority; the first-install overwrite exception is not the authority that permits replacing them.
- **Hand-edited installed artifact**: any drift from the recorded installed hash on any currently installed target refuses the whole refresh; the drift is never overwritten.
- **Record drift between authorization and application**: a record that changes after authorization but before application refuses application.
- **Incomplete, legacy, or non-current record**: a record that is not a complete current inventory, or a whole record carrying legacy or partial evidence for any pack, cannot authorize a refresh.
- **Unresolvable source**: a pack whose authoritative source cannot be resolved is reported and refused, not silently skipped.
- **Occupied or foreign new destination**: a new destination already owned by another pack or occupied by a core, project, or foreign artifact refuses the refresh.
- **No effective change**: a source that projects to a byte-identical installed representation is a valid refresh that changes nothing observable beyond a refreshed record and reports zero net additions and removals.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST provide a dedicated refresh operation for an already-installed pack, offered as a peer of the existing list, status, install, uninstall, and verify operations and reusing the existing invocation and exit conventions.
- **FR-002**: Refresh MUST require the target pack to be currently installed with a complete current inventory, and MUST refuse a pack that is not installed or whose record is incomplete, legacy, or otherwise not fully current across all installed packs, before any change.
- **FR-003**: Before any change, refresh MUST verify that every currently installed target matches its recorded installed hash and MUST refuse, leaving the drifted artifact untouched, if any target has drifted.
- **FR-004**: Refresh MUST resolve the pack's current authoritative source through the same resolution the install path already uses, and MUST refuse and report a pack whose source cannot be resolved rather than silently skipping it.
- **FR-005**: Refresh MUST stage and validate the complete current source through the same canonical staging, projection, namespace, ownership, and inventory-building machinery used by install, and MUST NOT introduce a second renderer, projection, namespace check, or inventory format or version.
- **FR-006**: Refresh MUST compute the destination-set difference between the current installed inventory and the newly staged inventory and classify each destination as a same-path replacement, a new-only addition, or an old-only removal.
- **FR-007**: Refresh MUST support every current pack artifact kind — agents, skills, instructions, and prompts — including replacing same-pack-owned instruction and prompt destinations on their namespace authority rather than through the first-install overwrite exception.
- **FR-008**: For a new-only addition, refresh MUST authorize creation only through canonical namespace, path, and source validation plus absence and ownership checks, and MUST refuse any new destination already claimed by another installed pack or occupied by a core, project, or foreign artifact.
- **FR-009**: For an old-only removal or a same-path replacement, refresh MUST derive deletion or overwrite authority only from the exact recorded inventory and installed hash, and MUST leave no untracked leftover when a source artifact is renamed or deleted.
- **FR-010**: Refresh MUST update the install record to the pack's exact new file list and inventory only as part of the same transaction that changes the artifacts.
- **FR-011**: Refresh MUST preserve, and MUST NOT weaken or repurpose, the uninstall operation's recorded-source digest guard and the install operation's existing overwrite-flag semantics. Because refresh expects the source to have changed, it MUST NOT compare the current source bytes against the recorded source digest as a refusal condition.
- **FR-012**: Refresh MUST re-establish authorization by re-reading the install record immediately before application and MUST refuse if the record no longer matches the exact bytes authorized at the start of the operation.
- **FR-013**: Refresh MUST apply all changes as one all-or-restored transaction: on any staging, application, or record-write failure it MUST restore every installed artifact and the record to their exact pre-refresh bytes, leave no partial mutation, and leave no leftover staging or transaction residue.
- **FR-014**: Refresh MUST refuse, before any change, any installed target or new destination that resolves through an unsafe ownership, traversal, or symbolic-link path.
- **FR-015**: On success, refresh MUST report the pack's replaced, added, and removed destinations in both human-readable and machine-readable form.
- **FR-016**: The documented smooth path for updating an installed pack MUST lead with the refresh command across command help, machine-readable output, the composition guidance, and the project pack-lifecycle rule, while uninstall and install remain documented for ordinary removal and installation.
- **FR-017**: Refresh MUST remain one capability of the existing pack-composition tool and MUST NOT add a new workflow lane, persistent artifact, background process, store, scheduler, second board, inventory version, or broad build redesign, and MUST NOT repurpose the existing overwrite flag.

### Key Entities

- **Installed pack record**: The recorded authority for an installed pack — its exact file list and per-artifact inventory of source and installed hashes — that authorizes what refresh may replace or delete.
- **Authoritative pack source**: The pack's current source of truth, treated by refresh as the desired new state to be staged, validated, and projected.
- **Staged inventory**: The newly built one-source-to-one-destination inventory and hashes produced from the current source through the canonical install machinery.
- **Destination-set difference**: The classification of every destination into same-path replacement, new-only addition, or old-only removal, derived from the recorded and staged inventories.
- **Refresh transaction**: The single all-or-restored unit that backs up, applies, and on failure restores every affected artifact and the install record.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A single refresh invocation on an installed pack whose source changed applies every same-path replacement, new-only addition, and old-only removal and updates the install record, replacing the previous multi-step manual recipe with zero manual restore, uninstall, or install steps.
- **SC-002**: After a refresh that renamed or deleted a source artifact, zero old-only pack destinations remain on disk; absence is confirmed on disk, not merely by the destination being missing from the updated record.
- **SC-003**: One mixed pack covering agents, skills, instructions, and prompts, with an addition, a replacement, and a removal, refreshes correctly in one transaction.
- **SC-004**: Every refusal condition — not installed, incomplete or legacy or non-current record, installed drift, unresolvable source, foreign or occupied new destination, and unsafe ownership or path — leaves the installed artifacts and the install record byte-for-byte unchanged.
- **SC-005**: For an injected application or record-write failure, every installed artifact and the install record are byte-for-byte identical to the pre-refresh state, no new destination remains, no old destination is missing, and no staging or transaction working directory or record-transaction sibling survives.
- **SC-006**: The uninstall recorded-source digest guard and the install overwrite-flag semantics remain unchanged and their existing regressions still pass, while a refresh whose source has changed succeeds without treating the changed source as a refusal.
- **SC-007**: A hand-edited installed target is preserved and the refresh is refused rather than overwriting it.
- **SC-008**: Command help, machine-readable output, the composition guidance, and the project pack-lifecycle rule lead the smooth path with the refresh command, and uninstall and install remain documented for their own purposes.
- **SC-009**: The change introduces no new workflow lane, persistent artifact, background process, store, scheduler, second renderer, inventory version, or broad build redesign, and leaves the existing overwrite-flag behavior unchanged.

## Assumptions

- Refresh applies only to a pack already installed with a complete current inventory; establishing or repairing a legacy or partial record is out of scope and remains a refusal.
- The pack's authoritative source is available at refresh time through the same resolution the install path already uses; an unresolvable source is refused, not queued or partially applied.
- Renames are expressed as one addition plus one removal within the same transaction; no separate rename detection is required.
- Updating the composition guidance and the project pack-lifecycle rule to lead with the refresh command is part of this feature's own documentation scope and is not a separate guardrail ratification.
- Authoritative pack and core source remain under their existing source trees, and any generated core output is rebuilt only through the sanctioned build; refresh does not hand-edit generated core.
- This is a new bounded outcome that neither reopens nor redefines the agent-orchestration-metadata feature and is not part of the backlog-lifecycle-sync feature.
