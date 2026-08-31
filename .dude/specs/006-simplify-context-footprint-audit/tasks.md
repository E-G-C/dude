<!-- audit log: .dude/ideas/006-simplify-context-footprint-audit.md#coordinator-log -->

# Tasks: Retire Context Footprint Audit

Two all-open units replace the four unexecuted rows. The first owns the complete recoverable mutation lifecycle; the second owns dependent final acceptance and handoff. No generated board or archive is included.

## Phase 1: Atomic Lifecycle Transaction

**Goal**: Reach a verified reduced-authoring checkpoint without leaving source or installation recovery ambiguous.

**Execution Details**:

- Baseline history and protected work only after the revised definition is finalized.
- Snapshot all thirteen source write paths externally with exact bytes and a verified SHA-256 manifest.
- Remove original nine-artifact authoring through compose before source mutation.
- Perform exactly nine deletions and four updates, then compose-add five-agent, three-skill reduced authoring.
- Preserve coding, writing, independent checks, and protected paths.
- On failure, follow the plan's authoring-absent or reduced-authoring rollback and retain the snapshot until acceptance or verified recovery.

**Independent Test**: The snapshot is complete, reduced authoring is valid, coding and writing match baseline, protected evidence is unchanged, focused checks pass, and rollback remains available.

- [x] T005@4f8a2c71 [Shared] Execute the complete snapshot, compose removal, thirteen-path source mutation, reduced-authoring reinstall, focused validation, and state-specific recovery transaction defined in `plan.md`; leave the verified snapshot available for T006 unless rollback succeeds.

## Phase 2: Final Acceptance And Handoff

**Goal**: Prove complete retirement and preservation, provide the exact bounded handoff, and release the retained recovery snapshot.

**Execution Details**:

- Run complete intended-tree tests, build, lint, active-reference, pristine-release, history, preservation, and exact-diff checks.
- Build one external filtered bundle from current `.github`, `.dude/metadata`, and protected-path-free `library`.
- Remove every copied enabled pack through compose, then verify the same root and its own library against the exact fifteen-pack set with zero failures and leftovers.
- Require no replacement or permanent release artifact and no claim about future commit, pull request, generated note, tag, or publication.
- Make the final implementation handoff consist solely of the exact FR-010 sentence, then delete and verify removal of the retained snapshot.

**Independent Test**: Every plan acceptance check passes, the exact handoff boundary is satisfied, and the external source snapshot is removed only after success.

- [x] T006@b3d9e560 [Shared] Complete the full validation, self-consistent filtered compose verification, preservation comparison, exact release handoff, and successful-acceptance snapshot cleanup defined in `plan.md`.
    deps: T005@4f8a2c71

## Traceability

| Requirement and success meanings | Tasks |
|---|---|
| FR-001, FR-005, FR-011 / SC-001: complete audit deletion | T005@4f8a2c71 |
| FR-002 / SC-005: no replacement mechanism or artifact | T005@4f8a2c71, T006@b3d9e560 |
| FR-003 / SC-006: history preservation with permitted coordinator state | T005@4f8a2c71, T006@b3d9e560 |
| FR-004 / SC-004: independent and complete validation | T005@4f8a2c71, T006@b3d9e560 |
| FR-006, FR-007 / SC-003: lifecycle-owned authoring change and unchanged coding/writing | T005@4f8a2c71 |
| FR-008 / SC-006: protected unrelated work | T005@4f8a2c71, T006@b3d9e560 |
| FR-009: static-footprint claim boundary | T005@4f8a2c71 |
| FR-010 / SC-007: exact bounded release handoff | T006@b3d9e560 |
| FR-012 / SC-002: no active stale references | T006@b3d9e560 |
| FR-013, FR-014 / SC-008: snapshot and state-specific rollback | T005@4f8a2c71 |
| FR-015 / SC-004, SC-005: self-consistent filtered verification | T006@b3d9e560 |
