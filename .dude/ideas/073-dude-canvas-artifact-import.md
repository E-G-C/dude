---
title: Dude Canvas Artifact Import
slug: dude-canvas-artifact-import
status: draft
spec_path:
---

# Idea: Dude Canvas Artifact Import

## Idea

> A user can import skills and agents, either remotely from GitHub or locally. This functionality is missing.

The user confirmed capturing this as a separate Canvas/Settings idea for later definition.

## Open Questions

No additional scope question identified for this capture. Source-entry and preview presentation remain for later definition.

## Assumptions

No additional user assumptions supplied.

<!-- dude:managed:start -->
## Intent And Scope

Expose the existing skill and agent import workflow through the same Dude Canvas Settings surface. Support GitHub and local sources so users can bring an existing artifact into their project through the UI.

Reuse the current import workflow and its ownership, source validation, naming, conflict, preview, and confirmation rules. This intention covers skills and agents, not a replacement import engine or a general command runner. Pack management remains the separate Settings slice.

This is capture only. It authorizes no import and creates no definition package, tasks, or mock. Detailed interaction choices and visual approval belong to later definition.

## Related References

- Broader Canvas intent: `.dude/ideas/052-dude-canvas-ui.md`.
- Shared Settings surface: `.dude/ideas/063-dude-canvas-settings.md`.

These references establish product continuity, not execution dependencies or order.
<!-- dude:managed:end -->

## Coordinator Log

- 2026-09-21T23:27:09Z - brainstorm: Staged the user-confirmed Canvas skill/agent import intention as a separate draft for coordinator first-capture publication and later definition. No import was performed and no package, tasks, or mock were authored.
