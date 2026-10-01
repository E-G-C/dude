---
title: Dude Canvas Pack Sources
slug: dude-canvas-pack-sources
status: resolved
spec_path:
---

# Idea: Dude Canvas Pack Sources

## Idea

> Under settings we need a section to add the sources( where  to find the packs)  for the packs. We can have local or remote sources. The remote sources are located in GitHub and that's the case for the original GitHub repo that the current dude is using. However, another user might want to add its own repo. Therefore, Dude can needs to support more than one source of packs. Same thing for a local directory where the user might have packs located. In fact the current dev bundle has only hte local library as source.
>
> Dude should be able or capable of inspect the remote source and list the packs. If we need to change the metadata for the packs, that might be also a possibility.
>
> Now I wonder if when we list the packs available and the  installed ones  we might need a filter by source for example if I am the user  and I would like to import someone else pack I can add maybe its source (url) and If I look under my available packs, I'm looking for some specific topic and I don't see one i need , I might filter by maybe the other user so I can pull the other user packs.

This text was split from `.dude/ideas/073-dude-canvas-artifact-import.md` at the user's direction: "go ahead split them in the most logical way, consult the architect if needed".

## Open Questions

For later definition; these unanswered choices do not block saving the split draft.

1. Beyond source and the existing use-case filter, is finding packs by a particular author/person needed for the first discovery outcome?
   Answer: Not answered here. Moved with this ledger's intent into `.dude/ideas/073-dude-canvas-artifact-import.md` (Q2).
2. Should the first slice limit remote pack sources to public GitHub repositories?
   Answer: Not answered here. Moved with this ledger's intent into `.dude/ideas/073-dude-canvas-artifact-import.md` (Q4).

## Assumptions

No additional user assumptions supplied.

<!-- dude:managed:start -->
## Superseded

Resolved as superseded by `.dude/ideas/073-dude-canvas-artifact-import.md` after the user's 2026-09-29 design review placed pack sources with import under Packs.

The user's quoted intent already appears verbatim in 073's `## Idea`. Its unanswered questions and still-load-bearing verified findings were carried there: Compose source facts, `PackBinding` has no source field, and `prepareRefresh` overwrites the recorded source.

Reopening requires an explicit user `brainstorm dude-canvas-pack-sources`.
<!-- dude:managed:end -->

## Coordinator Log

- 2026-09-29T01:59:22Z - brainstorm: Staged this derivative for first-capture publication from the user-delegated split of `.dude/ideas/073-dude-canvas-artifact-import.md` with Architect consultation; no package, tasks, mock, import, or pack operation was authorized.
- 2026-09-29T12:10:28Z - brainstorm: Resolved this package-less ledger as superseded by .dude/ideas/073-dude-canvas-artifact-import.md after the user's 2026-09-29 design review placed pack sources with import under Packs; its intent, open questions, and still-load-bearing verified findings were carried there. Reopening requires an explicit brainstorm.
