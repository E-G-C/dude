---
title: Dude Canvas Skill Customization
slug: dude-canvas-skill-customization
status: draft
spec_path:
---

# Idea: Dude Canvas Skill Customization

## Idea

> The user could edit a local skill from a pack.

The user confirmed capturing skill customization as a separate Canvas/Settings idea for later definition.

## Open Questions

For later definition; no answer is needed to capture this intention.

1. Should the first slice support editing an owned authoritative local skill source, creating a durable project-local copy of a pack skill, or both? The user has not selected the source-versus-copy behavior.
   Answer:

## Assumptions

No additional user assumptions supplied.

<!-- dude:managed:start -->
## Intent And Scope

Let users customize skills through the same Dude Canvas Settings surface by editing owned local sources or creating durable project-local copies of pack skills. Which route the first slice offers, and how the user chooses when both are valid, remain for definition.

Follow existing ownership rules. Installed/generated `dude-pack-*` files are replaceable projections, not persistent customization targets; pack refresh can overwrite edits there. Durable project-local copies use `dude-local-*`. Editing an authoritative local source requires ownership of that source.

The confirmation accepts this separate feature intention, not every source/copy detail or permission to edit, copy, refresh, or publish an artifact. This capture creates no package, tasks, or mock and does not add a general artifact editor to the pack-management slice.

## Related References

- Broader Canvas intent: `.dude/ideas/052-dude-canvas-ui.md`.
- Shared Settings surface: `.dude/ideas/063-dude-canvas-settings.md`.

These references establish product continuity, not execution dependencies or order.
<!-- dude:managed:end -->

## Coordinator Log

- 2026-09-21T23:27:09Z - brainstorm: Staged the user-confirmed Canvas skill-customization intention as a separate draft for coordinator first-capture publication. Retained the source-versus-copy question for later definition and the existing generated-file ownership boundary. No skill was changed and no package, tasks, or mock were authored.
