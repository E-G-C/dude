---
title: Retire Backlog Report
slug: retire-backlog-report
---

# Retire Backlog Report

Dude stops generating and maintaining `.dude/backlog.md` and `.dude/backlog.html`. The Canvas remains the visual backlog, and the existing printed views remain available in sessions without it. Removing the regenerate-and-commit step carries out the retirement accepted in 052 and the user's request for a deterministic process.

The coordinator's comparison on 2026-10-17 found one information gap: the report's Dependency and order notes appear in neither the Canvas nor the default printed view. This feature puts those same facts in the default printed view before retirement passes acceptance. It does not treat the Canvas alone as a complete replacement or add Canvas content.

Retiring both files and preserving those notes are Ship-authorized definition-owner dispositions, with their basis and residual risks in the owner's Definition Package. They are not user answers.

## User Scenarios

### US1 - Finish workflow steps without maintaining a report (P1)

A user captures, defines, or completes work without generating another pair of files or repairing a stale report.

Independent test: use a workspace with no report files and another with earlier-version copies; exercise lifecycle changes and each supported task-state write.

1. Given either workspace, when Dude captures, defines, resolves, or reopens an idea, updates its Coordinator Log, or changes declared order, then no report file is created or updated.
2. Given a valid task-state change, when a guarded single change, guarded batch change, or autonomous task application commits, then it returns its normal success result without requiring either report file.
3. Given an invocation of the removed `check`, `generate`, or `--write` form of the backlog command, then it exits 1 and changes no file.

### US2 - Read the same work information on demand (P2)

A user reads the Canvas or asks for a printed backlog and still finds the information that the report supplied.

Independent test: compare the kept views against fixed canonical work records containing current, planned, and completed work, declared order and dependencies, unavailable dependency data, and provisional relationships.

1. Given unchanged canonical records, when the report files are removed, then the Canvas retains the same work entries, task details, readiness, activity, and availability conclusions.
2. Given those records, when the default backlog view is printed, then it retains its summary and lifecycle groups and adds the Dependency and order notes.
3. Given declared dependencies, unavailable dependency data, or recognized body-stated relationships, then the notes distinguish authoritative facts, unavailable evidence, and provisional evidence without changing their effect on grouping.
4. Given no valid explicit order, no declared dependencies with all dependency data available, and no recognized provisional evidence, then the notes state each absence.
5. Given current work or a defined task package, when `kanban` or `flowchart <slug>` is requested, then the existing diagram remains available without a file write.

### US3 - Follow instructions that match the shipped behavior (P3)

A user follows the current guides without being told to regenerate a retired report, and knows what to do with copies from an earlier version.

Independent test: inspect the current skills, command help, and user guides, then use the kept views in a project that still has old report files.

1. Given the current guidance, then it describes the Canvas and printed views without assigning report-generation or freshness duties.
2. Given earlier-version report files, then the README tells the user once that Dude no longer updates them and that the user can delete them.
3. Given those old files remain present, when Dude reads or changes canonical work, then it leaves the old copies untouched and uses canonical records for the current view.

## Edge Cases

- A project still has old report files: they remain stale copies until its user deletes them. Dude neither scans for them nor cleans them up.
- A caller invokes `check`, `generate`, or `--write`: the backlog command refuses the unsupported form with exit 1, without a compatibility alias or a write.
- A board write runs without either report file: the canonical change returns its ordinary success result.
- A Canvas session is already open: deleting report files does not remove its canonical work information. This feature adds no session-reload mechanism.
- Some dependency data is unavailable: name the affected features and do not turn missing evidence into a claim that no dependencies exist.
- Only provisional evidence exists: retain its non-authoritative label. It never blocks or orders work.
- No valid explicit order exists: say so. A lifecycle number records capture chronology, not priority, readiness, or execution order.

## Functional Requirements

### Retire report maintenance

- FR-001: Dude does not create or update either report file after brainstorm, definition, resolution, reopen, Coordinator Log updates, declared-order changes, or task-state changes.
- FR-002: A successful canonical task-state write returns its existing success result independently of either report file's presence.
- FR-003: The shipped bundle provides no committed-report generation, refresh, or freshness-check capability.
- FR-004: The backlog command refuses `check`, `generate`, and `--write` with exit code 1.
- FR-005: This repository removes both `.dude/backlog.md` and `.dude/backlog.html`.
- FR-006: Dude provides no automatic discovery or cleanup of earlier-version report files in other projects.

### Keep current information reachable

- FR-007: The default backlog view, `kanban`, and `flowchart <slug>` remain read-only.
- FR-008: Each retained printed form preserves its existing summary, grouping, chronological ordering, and graph behavior where applicable, apart from the notes added to the default view.
- FR-009: For the same canonical inputs, Canvas retains its existing work identities, lifecycle groups, task details and readiness, activity, and source-availability conclusions.
- FR-010: The default printed view states whether explicit feature order is declared, naming its source when it is.
- FR-011: The default printed view lists each declared feature dependency.
- FR-012: The default printed view names every feature whose dependency data is unavailable without inferring a negative dependency fact for it.
- FR-013: The default printed view says no declared feature dependencies are present exactly when there are no declared dependencies and no features with unavailable dependency data.
- FR-014: The default printed view labels each recognized body-stated relationship as provisional and non-authoritative.
- FR-015: The default printed view says when no provisional body-stated dependency evidence was recognized.
- FR-016: Each retained printed view returns identical text for identical canonical input bytes, regardless of wall-clock time, checkout name, or Git revision.

### Update guidance without rewriting history

- FR-017: Current skills, command help, and user guides describe the retained views without report-generation or report-freshness duties.
- FR-018: The README contains the sole user-facing notice that Dude no longer updates the two earlier-version files and that users can delete them.
- FR-019: Retirement leaves historical idea ledgers, definition packages, and frozen exports outside this feature unchanged.

## Key Entities

- Report pair: `.dude/backlog.md` and `.dude/backlog.html`, derived snapshots that are never canonical work state.
- Canonical work records: the existing idea, definition, task, and Coordinator Log sources used by the kept views.
- Explicit order: the declared feature order in `.dude/state/backlog-order.md`, independent of lifecycle capture numbers.
- Declared dependency: an authoritative feature relationship from `depends-on:` metadata.
- Provisional relationship: body-stated evidence recognized by the existing reader, displayed separately and never used to classify, prioritize, or order work.

## Scope And Surfaces

The comparison supports FR-008 through FR-015:

| Information in the report | Retained access |
| --- | --- |
| Summary counts and current, planned, and completed groups | Canvas and the default printed view |
| Current-work map and one package's task graph | The kept `kanban` and `flowchart` views |
| Feature and task details, definition artifacts, milestones, and activity | Existing Canvas feature views and Activity |
| Explicit order, declared dependencies, unavailable dependency data, and provisional relationships | Dependency and order notes added to the default printed view |

The comparison establishes information coverage, not visual equivalence. Relationship notes become text-only, and the committed Markdown view on GitHub disappears.

In scope: remove both report files in this repository, their production and maintenance capability, their freshness obligations, and the current guidance and tests that require them; preserve the retained views and add only the missing notes.

Out of scope: Canvas content or layout changes, a replacement report, new state or settings, compatibility commands, migration or cleanup in other projects, and new ordering or dependency semantics. The ledgers and packages of 025, 027, 030, 048, and 052, and the frozen continuation export, remain historical evidence. Their numbers imply no task order or dependency.

## Success Criteria

- SC-001: Every workflow in US1 creates or updates zero report files, and this repository contains neither retired file after delivery.
- SC-002: All three task-state write paths preserve their expected canonical result with report files absent and with earlier-version copies present; present copies remain byte-identical.
- SC-003: All three printed forms remain usable without the report files, make zero workspace writes, and return identical bytes on repeated reads of the same inputs in differently named roots.
- SC-004: The default printed notes retain every fact from the old notes section across declared-order, no-order, declared-dependency, unavailable-data, provisional-evidence, and no-evidence cases.
- SC-005: For unchanged canonical records, Canvas work identities, groups, task facts, readiness, activity, and source-availability outcomes match before and after retirement.
- SC-006: Each removed command or option exits 1 without changing workspace bytes.
- SC-007: Current guidance contains zero report-maintenance duties and exactly one earlier-version deletion notice, in the README.
- SC-008: Historical ledgers, packages, and frozen exports outside this feature are byte-identical after delivery.

## Assumptions

- The comparison uses the delivered Canvas and existing printed views, not a mock. The remaining notes must be implemented and verified in this delivery before retirement is accepted.
- The report files are derived and contain no unique canonical work data. Removing them needs no data migration.
- This repository currently declares no explicit order or feature dependencies; its existing provisional `backlog-canvas` relationship to `backlog-report` remains meaningful display evidence. Other projects can use the documented order and dependency inputs.
- Other projects keep their last committed report copies until their users remove them. No automatic cleanup is implied.
- The two definition-owner dispositions do not fill the ledger's user-controlled answer slots or add a user assumption.
