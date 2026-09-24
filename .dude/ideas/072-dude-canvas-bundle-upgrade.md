---
title: Dude Canvas Bundle Upgrade
slug: dude-canvas-bundle-upgrade
status: draft
spec_path:
---

# Idea: Dude Canvas Bundle Upgrade

## Idea

> The user should be able to trigger a Dude harness update/upgrade. This functionality is missing.

The user confirmed capturing the Canvas/Settings upgrade surface as a separate idea for later definition.

## Open Questions

No additional scope question identified for this capture. The upgrade-preview and confirmation presentation remain for later definition.

## Assumptions

No additional user assumptions supplied.

<!-- dude:managed:start -->
## Intent And Scope

Expose the existing Dude harness/bundle update and upgrade workflow through the same Canvas Settings surface. Let the user request the existing preview, inspect its effects, and proceed only through that workflow's current-state, freshness, and explicit confirmation gates.

The coordinator and existing upgrade workflow retain application authority. This feature intention supplies a UI for that workflow, not a second upgrader, automatic update service, or permission to run an upgrade now. Optional pack install/remove/refresh remain the separate pack-management slice.

Capture only: no upgrade is performed and no definition package, tasks, or mock are created. Detailed interaction design and visual approval belong to later definition.

## Related References

- Broader Canvas intent: `.dude/ideas/052-dude-canvas-ui.md`.
- Shared Settings surface: `.dude/ideas/063-dude-canvas-settings.md`.

These references establish product continuity, not execution dependencies or order.
<!-- dude:managed:end -->

## Coordinator Log

- 2026-09-21T23:27:09Z - brainstorm: Staged the user-confirmed Canvas harness/bundle upgrade intention as a separate draft for coordinator first-capture publication and later definition. Preserved the existing preview, freshness, and explicit confirmation boundary; no upgrade was performed and no package, tasks, or mock were authored.
