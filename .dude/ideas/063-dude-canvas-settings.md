---
title: Dude Canvas Settings
slug: dude-canvas-settings
status: draft
spec_path:
---

# Idea: Dude Canvas Settings

## Idea

> Good, the search and filter look good. Now the left rail, usually in Fluent UI it expands and shows the labels. Also, usually on the bottom left it shows the settings as a cog wheel. I guess in our case it should be Dude settings, as packages and all that.

The user answered "yes" to capturing `dude-canvas-settings` as a separate follow-up for packs/configuration, then clarified:

> But this is part of the overall effort to provide Dude functionality via a UI.

## Open Questions

For later definition; no answers are needed for this capture.

1. Which pack information and controls belong in the first slice: read-only details, or also pack changes such as installing, removing, or refreshing where Dude already supports them?
   Answer:

2. Which Dude configuration settings beyond packs belong in the first Settings slice?
   Answer:

## Assumptions

No additional user assumptions supplied.

<!-- dude:managed:start -->
## Intent And Scope

Settings is a linked delivery slice within the same Dude Canvas/product effort to expose existing Dude functionality visually. 052 holds the broader graphical-workspace vision; 062 is integrating that workspace and retains 057's working capabilities. This slice extends that product without a separate app or extension, or cancellation or deferral of the overall UI mission.

A real Settings destination would cover packs and Dude configuration. A bottom-left cog in the shared rail, with a label when expanded, is tentative. Any cog must open a functioning, explicitly defined destination, not a dummy control. First controls and operations remain undecided; the question examples are not accepted requirements.

Reuse current Dude capabilities and their ownership and permission paths. Settings is a front end to those functions, with no second engine, tracker, or independent authority. Current pack/configuration mechanisms can be researched at later definition.

This capture leaves 062's scope boundaries, history, and artifacts unchanged. Its navigation mock remains exploring and has no Settings cog; search/filter acceptance is not full-mock approval. Capturing Settings neither expands that package nor resumes Work. Settings still needs its own explicit definition, visual approval, and implementation cycle. This slice does not absorb all deferred 052 scope.

## Related References

- Broader Dude Canvas vision: `.dude/ideas/052-dude-canvas-ui.md`.
- Current workspace integration: `.dude/ideas/062-dude-canvas-workspace-integration.md`.
- Integration scope and current design state: `.dude/specs/062-dude-canvas-workspace-integration/spec.md`.

These references establish product continuity, not dependencies or execution order. Lifecycle numbers record capture chronology only.
<!-- dude:managed:end -->

## Coordinator Log

- 2026-09-14T21:07:16Z - brainstorm: Staged the user-confirmed Settings slice as part of the same Dude UI effort for coordinator publication; capture only, with no definition, mock, approval, or implementation.
