---
title: Dude Canvas Local Artifacts
slug: dude-canvas-local-artifacts
status: resolved
spec_path:
---

# Idea: Dude Canvas Local Artifacts

## Idea

> Next. Packs are just the daily prefered driver for the users in the sense of what the user needse. However, Dude can import skills agents from remote or local repos. There is a whole process in Dude dedicated to that function. Basically, the user can say dude go to this repo and import this skill. We need something under settings that will allow to import skills from remote repo. There is no UI for that. and it brings us to th point of how we handle the imported artifacts , these are what we called dude-local artifacts, which are not currently listed. We need UI for those, as well.
>
> I mean, if the skill of the pack or the agent, whatever we import contains the README, we can display that documentation when we select a pack in dude canvas

This text was split from `.dude/ideas/073-dude-canvas-artifact-import.md` at the user's direction: "go ahead split them in the most logical way, consult the architect if needed".

## Open Questions

For later definition; this unanswered choice does not block saving the split draft.

1. From selected local-artifact details, should existing documentation appear inline, open through a link, or use a documentation view?
   Answer: Not answered here. Moved with this ledger's documentation intent into .dude/ideas/080-dude-canvas-pack-documentation.md.

## Assumptions

No additional user assumptions supplied.

<!-- dude:managed:start -->
## Superseded

Resolved as superseded after the user's 2026-10-01 reply "import should  show up in Installed right away." Under that reply, the coordinator adopted the Architect's recommendation to move listing and inspection of project agents and skills to `.dude/ideas/073-dude-canvas-artifact-import.md` and documentation for project agents and skills to `.dude/ideas/080-dude-canvas-pack-documentation.md`.

The user's quoted intent already appears verbatim in 073's `## Idea`.

Reopening requires an explicit user `brainstorm dude-canvas-local-artifacts`.
<!-- dude:managed:end -->

## Coordinator Log

- 2026-09-29T01:59:22Z - brainstorm: Staged this derivative for first-capture publication from the user-delegated split of `.dude/ideas/073-dude-canvas-artifact-import.md` with Architect consultation; no package, tasks, mock, import, or pack operation was authorized.
- 2026-09-29T12:10:28Z - brainstorm: Replaced the stale shared Local artifacts section recommendation after the user's rejection of 073's round-1 mock; left this listing's placement open, with Packs and a local marker/filter as one option linked to 073 Q5. Repointed pack discovery to .dude/ideas/073-dude-canvas-artifact-import.md (078 superseded). Preserved draft status, user text, open questions, assumptions, and prior log; no package, tasks, mock, import, or pack operation was authorized.
- 2026-09-30T14:05:34Z - brainstorm: Aligned this draft with 073's placement foundations after the user's 2026-09-30 review; under the coordinator's reversible scope assumption, 073 proposes the imported-artifact list and documentation placement for approval, while 079 retains listing and inspection content, presentation details, and implementation. Preserved draft status, user text, open questions, assumptions, and prior log; no package, tasks, mock, import, or pack operation was authorized.
- 2026-10-01T01:31:17Z - brainstorm: Resolved this package-less ledger as superseded after the user's 2026-10-01 reply "import should  show up in Installed right away."; listing and inspection moved to .dude/ideas/073-dude-canvas-artifact-import.md and project agent and skill documentation moved to .dude/ideas/080-dude-canvas-pack-documentation.md. Reopening requires an explicit brainstorm.
