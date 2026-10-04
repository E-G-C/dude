---
title: Work Type Presentation
slug: work-type-presentation
status: draft
spec_path:
---

# Idea: Work Type Presentation

## Idea

Captured bugs should not be presented as ideas or features just because they share Dude's idea container. Capture the accepted recommendation for later: show work type separately from lifecycle stage across Canvas capture, lists, and details, following GitHub's familiar issue-type versus workflow-state distinction.

## Open Questions

For future definition; neither question blocks capture.

1. How should users select or correct type, and what authoritative source should supply it for new and existing records?
   Answer:
2. What final wording and mapping to existing records should present type and evidence-backed stage, including unknown or not-established information?
   Answer:

## Assumptions

No user-supplied assumptions recorded.

<!-- dude:managed:start -->
## Context And Proposed Presentation

While viewing 066 Canvas Without Beads, the user saw "Draft idea", "Idea", "This feature is still an idea", "This idea has no task definitions", and mockup/review guidance. The coordinator confirmed that saved backlog records use the idea container; the current captured model establishes no work-type metadata.

- Use "Work" or "Work item" as the neutral umbrella across capture entry/actions, work lists, and selected details. Generic idea/feature copy should not misdescribe a confirmed defect.
- Proposed Type labels: Bug, Feature, Maintenance, Exploration, and Unclassified for uncertainty. These are candidate terms, not a shipped enum or inferred metadata.
- Proposed Stage labels: Captured, Defined, In progress, Blocked, and Completed, only where existing authoritative lifecycle/execution evidence supports them. Show unknown/not-established information honestly; do not create states or equate idea lifecycle with task glyphs.
- Show mockup-specific guidance only when applicable, without bypassing actual design or definition requirements.

Illustrative desired presentation for the reproduction subject:

```text
066 Canvas Without Beads
Bug · Captured
Recorded for later. No implementation tasks defined yet.
```

This example neither mutates 066 nor constitutes an approved mockup.

## Scope And Boundaries

Keep one bounded presentation outcome. Preserve canonical `.dude/ideas/` and `.dude/specs/` identities, lifecycle numbers, history, and source-of-truth/permission rules. Numbers mean capture chronology only, never priority, dependency, readiness, or execution order. No new tracker, execution lane, workflow engine, or filesystem reorganization.

Small bounded bugs can still route directly; showing a type must not force a plan or definition or silently change intake/routing. Type selection/correction, its authoritative source, final wording, and existing-record mappings remain future definition questions; no schema or implementation is approved here.

066 remains the separate absent-Beads Canvas defect. The 062 Ship history-retention failure is unrelated; do not reopen or modify that feature or its tasks. 058 Outcome-Aligned Intake remains a neighboring, separate user-journey discussion. This capture neither absorbs nor alters those records and declares no priority, merger, or dependency.
<!-- dude:managed:end -->

## Coordinator Log

- 2026-09-19: Initial draft capture staged from the user's explicit acceptance of the recommendation for `work-type-presentation`. Publication and lifecycle allocation remain pending; definition and implementation remain deferred.
