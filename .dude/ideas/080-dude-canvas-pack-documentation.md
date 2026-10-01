---
title: Dude Canvas Pack Documentation
slug: dude-canvas-pack-documentation
status: draft
spec_path:
---

# Idea: Dude Canvas Pack Documentation

## Idea

> Also, I was thinking that another artifact that might be a good candidate to include in the pack is documentation. And documentation could include how the skills or agent work, what they do, use cases. Basically what is now the README for the skill /agent can be part of the documentation of the pack itself. And I don't want to reinvent the wheel. I mean, if the skill of the pack or the agent, whatever we import contains the README, we can display that documentation when we select a pack in dude canvas
>
> . For example, if I go to the install pack on the right side right now, it shows what is meant that pack, how it helps, the files, all the stuff. So we could probably include also a link to its documentation. Basically it's a markdown file. We can show that Markdown or something along the lines. We need to shape that, but I think the documentation is also part of the pack. And right now I think it's being excluded and we are not including it when we import something or maybe when we even create. They're just sitting there and sometimes needed for the user. And Dude can help for the discovery on the functionality through the UI.

This text was split from `.dude/ideas/073-dude-canvas-artifact-import.md` at the user's direction: "go ahead split them in the most logical way, consult the architect if needed".

## Open Questions

For later definition; this unanswered choice does not block saving the split draft.

1. Within Canvas, should existing documentation appear inline in selected pack details, open through a link, or use a documentation view?
   Answer:
2. Should project agent and skill documentation (SKILL.md and README files listed in Installed) use the same presentation as pack documentation?
   Answer:

## Assumptions

No additional user assumptions supplied.

<!-- dude:managed:start -->
## Intent And Scope

Following the user's 2026-10-01 reply, the coordinator adopted the Architect's recommendation to cover documentation for packs, their member skills and agents, and project agents and skills listed in Installed. Project-artifact documentation moved here from the resolved `.dude/ideas/079-dude-canvas-local-artifacts.md`; use existing `pack.md` bodies, member READMEs, and project agent and skill documents, including `SKILL.md` and README files.

On 2026-10-01, the user confirmed in 073 Q6 that 080 owns documentation display for packs, their member skills and agents, and project agents and skills. Literal reply: "I accept the recomendation to delegate 080 for the documentation."

Success test: select a pack or project agent or skill and read its existing documentation in Canvas, including available pack-member READMEs, without installing anything.

Exclude new documentation formats, generated documentation, authoring, and changes to documentation installation or retention. Listing and inspection of project-artifact facts and multi-source configuration belong to `.dude/ideas/073-dude-canvas-artifact-import.md` (078 and 079 superseded).

Under the same adopted recommendation, 073 reserves one Documentation section directly after the facts in every pack and project-artifact details view, annotated visibly in its mock as "Planned (080)". The display follows that reserved and annotated position in 073's round-5 mock, which the user approved in chat on 2026-10-01 ("I approve the mockup"; SHA256 58cffc7a8be6699726c87508e8524a866e55435f53293a712b664ad49840c4f9). 080 keeps the content, display, rendering choice, and implementation; its own presentation and explicit visual approval remain open.

## Current Context And Investigation

Verified project facts, not user answers:

- `src/skills/dude-compose/compose.mjs` projects only `agents`, `skills`, `instructions`, and `prompts`. It copies skill folders recursively, so their READMEs survive projection; the pack-level `pack.md` body is not installed.
- Compose `cmdList` exposes only `name`, `installed`, `description`, and `use_cases` per pack. `src/extensions/dude/lib/catalog-reader.mjs` and `packs.mjs` pass this metadata into Canvas without documentation content.
- `src/extensions/dude/frontend/settings.jsx` shows pack descriptions, use cases, source, and file information in its detail pane, but no documentation. `scripts/dude-canvas-ui/package.json` supplies React and Fluent UI without a Markdown renderer.
- Project-artifact documentation is read from current workspace files. Focused import leaves README siblings unresolved; guarded directory import preserves eligible companions under `.github/skills/dude-local-<stem>/...` and `.github/agents/dude-local-<name>.support/...`.

The gap is reading and presenting existing pack, member, and project-artifact documentation. Skill-folder READMEs are not generally lost during Compose projection.

## Definition Limits

The Architect recommends an inline, read-only, collapsible "Documentation" section in the selected pack or project-artifact detail pane, following the VS Code extension/npm README pattern. The presentation questions remain unanswered, and no 080 design is approved.

Choose plain text or one sanitized-renderer dependency during definition. Settle read-only Markdown/link/asset safety and bounded, contained reads from the selected pack source or project artifact. Limit each document read to 64 KiB. Distinguish current catalog documentation from installed bytes when their source or ref differs; matching pack names do not prove matching documentation.

Keep documentation access read-only, with honest missing/unavailable states. Add no documentation store, registry, marketplace, or arbitrary file browser. Reading implies no automatic installation, activation, or execution. For project artifacts, do not fetch missing companions; document content remains inert rather than executing instructions or code.

Coordinate changes to `src/extensions/dude/lib/packs.mjs`, `src/extensions/dude/lib/catalog-reader.mjs`, and Compose `cmdList` with `.dude/ideas/073-dude-canvas-artifact-import.md` (078 superseded). Its Phase B adds per-source catalog reads; 080 must stay compatible with them. Shared code needs coordination, not a required implementation order.

Pack metadata changes and agent/routing relationships remain exploratory with the separate pack-authoring draft. Detailed interactions and explicit visual approval remain for definition and design.

## Related References

- Split source: `.dude/ideas/073-dude-canvas-artifact-import.md`.
- Broader Canvas: `.dude/ideas/052-dude-canvas-ui.md`.
- Existing Settings pack details: `.dude/ideas/063-dude-canvas-settings.md`.
- Existing discovery metadata: `.dude/ideas/041-pack-discovery-metadata.md`.
- Separate pack-authoring draft: `.dude/ideas/071-dude-canvas-pack-authoring.md`.
- Source-selection sibling (078 superseded): `.dude/ideas/073-dude-canvas-artifact-import.md`.
- Project-artifact listing and inspection (079 superseded): `.dude/ideas/073-dude-canvas-artifact-import.md`.

These references establish continuity, not execution order. Lifecycle numbers record capture chronology only.
<!-- dude:managed:end -->

## Coordinator Log

- 2026-09-29T01:59:22Z - brainstorm: Staged this derivative for first-capture publication from the user-delegated split of `.dude/ideas/073-dude-canvas-artifact-import.md` with Architect consultation; no package, tasks, mock, import, or pack operation was authorized.
- 2026-09-29T12:10:28Z - brainstorm: Repointed pack-sources references and coordination of packs.mjs, catalog-reader.mjs, and Compose cmdList to .dude/ideas/073-dude-canvas-artifact-import.md (078 superseded); recorded compatibility with 073 Phase B's per-source catalog reads. Preserved draft status, user text, open questions, assumptions, and prior log; no package, tasks, mock, import, or pack operation was authorized.
- 2026-09-30T14:05:34Z - brainstorm: Recorded 073's proposed documentation placement in pack details, pending user approval, as the coordinator's reversible scope assumption following the user's 2026-09-30 review; 080 retains content, rendering choice, and implementation and must follow the approved placement. Preserved draft status, user text, open questions, assumptions, and prior log; no package, tasks, mock, import, or pack operation was authorized.
- 2026-10-01T01:31:17Z - brainstorm: Extended this draft to project agent and skill documentation moved from the resolved .dude/ideas/079-dude-canvas-local-artifacts.md, following 073's reserved Documentation section; added one focused presentation question. No package, tasks, or mock were authorized.
- 2026-10-01T10:07:19Z - brainstorm: Recorded the user's 2026-10-01 confirmation that documentation display for packs, members, and project agents and skills belongs to this draft, following 073's approved Documentation placement. No package, tasks, or mock were authorized.
