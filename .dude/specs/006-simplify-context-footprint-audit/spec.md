# Feature Specification: Retire Context Footprint Audit

## Purpose

The active context-footprint system measures declared source size but has no named operational consumer, defined trigger or threshold, or prescribed corrective action. Maintaining it therefore adds cost without driving a decision.

This feature removes all six profiles and every active audit-specific surface, including the optional installed capability, tests, documentation, and snapshots. It adds no replacement metric, report, profile, cache, ledger, gate, history note, documentation, or state.

The removal preserves independent validation, unrelated work, recoverability, Git history, and append-only Dude history. Static source size is not evidence of runtime prompt membership, token use, latency, cost, or quality.

## User Stories & Testing

### User Story 1 - Remove the unconsumed audit (Priority: P1)

A maintainer can retire the complete active audit without leaving a partial capability or replacement mechanism.

**Independent Test**: Inventory active repository and installed surfaces and find no audit profile, runtime, wrapper, capability, test, contract, documentation, snapshot, or stale reference.

**Acceptance Scenarios**:

1. **Given** the audit lacks an operational consumer, threshold, and corrective action, **When** removal is complete, **Then** every active audit surface is gone.
2. **Given** some contracts exist only for the audit, **When** it is removed, **Then** those contracts disappear without an audit-absence replacement.
3. **Given** the audit duplicates independently owned validation, **When** it is removed, **Then** only the duplicate disappears.

### User Story 2 - Preserve validation and recoverability (Priority: P1)

A maintainer can perform the removal as one recoverable authoring lifecycle while preserving independent checks, unrelated work, and unaffected installed packs.

**Independent Test**: Verify the complete pre-mutation recovery snapshot, reduced authoring installation, unchanged coding and writing evidence, protected paths, independent checks, and either successful final acceptance or complete rollback.

**Acceptance Scenarios**:

1. **Given** the original authoring installation still matches its recorded inventory, **When** mutation starts, **Then** its source is fully recoverable and authoring is removed through its owning lifecycle before source changes.
2. **Given** reduced authoring is installed, **When** the transaction reaches its validation checkpoint, **Then** it contains the same five agents and three remaining skills while coding and writing remain byte-identical.
3. **Given** execution fails after original authoring removal, **When** rollback begins, **Then** recovery follows the observed absent-or-reduced installation state and restores the original source and nine-artifact authoring set.
4. **Given** independent validation and unrelated work predate this feature, **When** acceptance finishes, **Then** those checks and bytes remain intact.

### User Story 3 - Supply a bounded release handoff (Priority: P2)

A maintainer receives release-note-ready wording without implementation claiming control over later release work.

**Independent Test**: Confirm that the final implementation handoff consists solely of the required sentence and that no permanent release artifact was added.

**Acceptance Scenarios**:

1. **Given** the removed capability was user-invocable, **When** final acceptance succeeds, **Then** the handoff consists solely of `Removed the optional dude-pack-authoring-prompt-audit capability, including its six static-footprint profiles, reports, snapshots, and documentation. No replacement audit is provided.`
2. **Given** commits, pull requests, generated notes, tags, and publication occur later, **When** implementation is accepted, **Then** none is claimed as authored or verified.
3. **Given** no checked-in release artifact is required, **When** the diff is inspected, **Then** no changelog, release note, archaeology note, or replacement document was added.

## Edge Cases

- Historical Dude packages may legitimately retain retired terminology and remain outside active stale-reference scanning.
- The preservation baseline is captured only after this revised definition and its two log entries are finalized.
- Baseline Coordinator Log entries remain an unchanged ordered prefix.
- Only coordinator-appended log events and coordinator-owned task glyph, blocker, and derived-board changes are permitted after baseline.
- Installed authoring must be removed while its original source and inventory still match.
- Recovery differs when authoring is absent versus when reduced authoring is installed.
- Ambiguous source, profile, inventory, or rollback state requires a stop without direct installed-file or profile repair.
- Installed `.github` files and profile metadata are evidence, not source-rollback payloads.
- The external source snapshot remains until final acceptance or verified rollback.
- Filtered verification must enumerate and install from the same protected-path-free temporary bundle.
- `library/packs/README.md` and `library/packs/technical-docs/**` remain unrelated and protected.
- Normalizer behavior and independent current-format history checks remain even though audit-only wording and assertions disappear.
- Future generated release-note contents cannot be guaranteed by this implementation.

## Functional Requirements

- **FR-001**: The feature MUST remove all six profiles and every active audit runtime, wrapper, capability, test, contract, documentation page, snapshot, and installed artifact.
- **FR-002**: The feature MUST add no replacement metric, budget, report, profile, cache, ledger, gate, history note, documentation page, or state artifact.
- **FR-003**: After the revised-definition baseline, unrelated idea and specification packages and prior historical entries MUST remain unchanged. Current task identities, descriptions, dependencies, ordering, and historical sections MUST remain unchanged except for coordinator-owned task state, blocker, board, and appended-log updates.
- **FR-004**: Independent source/generated parity, installed-pack verification, lint, behavior tests, and release validation MUST remain available.
- **FR-005**: Audit-owned duplicate validation MUST be removed without weakening independently owned validation.
- **FR-006**: Authoring installation changes MUST use its owning lifecycle; installed files and profile metadata MUST NOT be edited or restored directly.
- **FR-007**: Reduced authoring MUST contain the same five agents and three remaining skills. Authoring metadata MAY change through its lifecycle; coding and writing profile subtrees and installed artifacts MUST remain byte-identical.
- **FR-008**: Protected unrelated paths MUST remain outside implementation, catalog verification, test discovery, ownership classification, and active stale-reference scanning while preservation evidence confirms unchanged bytes.
- **FR-009**: The removal MUST NOT imply that static footprint measured runtime membership, token use, latency, cost, or quality.
- **FR-010**: The final implementation handoff MUST consist solely of the exact sentence in User Story 3. No future commit, pull request, generated note, tag, or publication MAY be claimed, and no permanent release artifact MAY be added.
- **FR-011**: Audit-specific current-format assertions and historical exclusions MUST be removed without adding an audit-absence contract.
- **FR-012**: Active surfaces outside historical Dude roots, generated output, and protected unrelated paths MUST contain zero stale audit references; the current feature package MUST be checked against its preservation baseline instead.
- **FR-013**: Before source mutation, a verified external exact-byte snapshot MUST cover all thirteen source write paths and remain available through final acceptance or verified rollback. Installed and profile surfaces remain evidence only.
- **FR-014**: Rollback MUST restore original source and the nine-artifact authoring installation according to whether authoring is absent or reduced authoring is installed, and MUST stop on ambiguity or failure.
- **FR-015**: Catalog acceptance MUST use one self-contained filtered temporary bundle, remove copied enabled packs through their lifecycle, verify exactly the fifteen established non-technical-docs packs, and report zero failures and leftovers.

## Key Entities

- **Active audit surface**: Every profile, runtime, wrapper, capability, test, contract, document, snapshot, and installed artifact owned by the audit.
- **Source recovery snapshot**: External exact-byte recovery material for all thirteen source write paths, paired with a verified manifest.
- **Installed capability inventory**: Lifecycle-owned evidence connecting pack source, profile metadata, installed artifacts, and hashes.
- **Post-definition baseline**: Evidence separating immutable packages and history from permitted coordinator-owned execution changes.
- **Filtered verification bundle**: One disposable bundle whose root and catalog both exclude protected unrelated paths.
- **Release handoff**: The exact acceptance sentence, without a permanent artifact or claim about later release work.

## Success Criteria

- **SC-001**: Active inventory finds zero audit profiles, runtimes, wrappers, capabilities, tests, contracts, documents, or snapshots.
- **SC-002**: Active-reference scanning reports zero audit matches outside the defined historical, generated, and protected exclusions.
- **SC-003**: Authoring contains exactly five existing agents and three remaining skills; coding and writing evidence is byte-identical to baseline.
- **SC-004**: Focused tests, complete intended-tree tests, build parity, lint, filtered compose verification, and pristine release validation pass.
- **SC-005**: Exactly fifteen expected packs are reported by filtered verification, with zero failures, zero leftovers, and no extra result.
- **SC-006**: Unrelated packages, prior history, immutable current-task structure, Git history, and protected unrelated paths satisfy their baseline comparisons.
- **SC-007**: The final handoff consists solely of the FR-010 sentence and the diff adds no permanent release or replacement artifact.
- **SC-008**: Verified rollback restores all thirteen source paths to their original hashes, restores nine-artifact authoring, and leaves coding and writing unchanged.

## Assumptions

- Current inventory confirms that the audit has no operational consumer, threshold, or prescribed corrective action.
- The six declared profiles are the complete active profile set.
- The optional audit skill is user-invocable when authoring is installed.
- Authoring, coding, and writing are installed before execution.
- Original authoring inventory and hashes are complete enough to authorize lifecycle removal.
- The thirteen plan-listed source paths are the complete source write set.
- Historical Dude roots remain outside active stale-reference scanning.
- No checked-in changelog or release-note artifact is required.

## Out of Scope

- Designing another context, token, latency, cost, or quality measurement system.
- Adding an audit-absence test, report, profile, cache, ledger, gate, or state.
- Rewriting Git or Dude history.
- Changing independently justified validation or normalizer behavior.
- Incorporating protected unrelated technical-docs work.
- Authoring a commit or pull request, controlling generated notes, creating a tag, or publishing a release.
- Creating a permanent changelog, release note, archaeology note, or replacement document.