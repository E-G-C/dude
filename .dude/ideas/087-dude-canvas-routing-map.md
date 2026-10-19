---
title: Dude Canvas Routing Map
slug: dude-canvas-routing-map
status: draft
spec_path:
---

# Idea: Dude Canvas Routing Map

## Idea

At 2026-10-19T14:45:41Z, while brainstorming pack-owned workflows in `.dude/ideas/067-work-type-presentation.md`, the user asked for this diagram to be captured for a future brainstorm:

> i delly woulkd be nice if we coul dhave a diagram of the internal routing ( tiunk of Reack Flow or equivalent) representing dude's internal with options to packs creation on this ui ( you can capture this as an idea for future brainstom) 

React Flow, or an equivalent, is the user's example of the kind of diagram, not a selected dependency.

## Open Questions

For a future brainstorm or definition; no answer is needed to capture this idea.

1. Which view should the first slice show: the routes that installed packs declare, the proposed routing for one concrete request, or an observed run?
   Answer:
2. When the map gains pack creation, should it open the Canvas pack-authoring flow that 071 proposes, or should users author a pack's workflow by editing map nodes?
   Answer:

Question 3 moved here from 067, where it was question 8, on 2026-10-19.

3. Should the first map explain the roles and skill procedures that exist today, or should formal, machine-readable pack workflow declarations come first?
   Answer:

## Assumptions

No additional user assumptions supplied.

<!-- dude:managed:start -->
## Intent And Scope

Help a user inspect and understand how Dude's installed packs, agents, skills, workflow stages, review and approval gates, and handoffs relate to each other. The user also envisages creating packs from this UI, and that aspiration stays part of this idea. The authoring surface should coordinate with `.dude/ideas/071-dude-canvas-pack-authoring.md` rather than define a second pack engine.

One example success scenario, offered as a brainstorm candidate and not an implemented affordance: a user opens the map for a request, inspects its proposed routing, sees which pack supplies each stage and a high-level reason for the choice, and then, once pack authoring exists, follows an entry point into that flow.

This capture is for a future brainstorm. It creates no definition package, tasks, mock, or implementation, and it selects no UI framework, graph library, or workflow declaration format.

## Recommendations

These are Dude's proposals for later review, not accepted requirements or answers to the questions above.

- Start with a read-only map a user can inspect, showing installed capabilities and their constraints before attempting arbitrary executable workflows.
- Keep three views distinct: what installed packs declare as possible, a proposed route for one concrete request, and an observed run. Build each from actual sources or recorded evidence, and mark unknowns honestly instead of inventing edges or live progress.
- Treat the diagram renderer as a view, never an execution engine or a source of authority. If users later edit nodes, each change must validate against the authoritative pack sources and go through the existing authoring owners, with a preview and approval before it applies. No separate graph registry should compete with those sources.
- Show observable routing decisions, plus a high-level explanation only when evidence supports it. Do not display hidden model reasoning or chain of thought.
- Keep permission to author a pack separate from permission to execute, install, or publish it.
- Show which domains have an installed producer, so gaps are visible, such as video, for which the shipped catalog has no pack. This builds on Dude's intent-and-domain proposal in `.dude/ideas/067-work-type-presentation.md`, `## Intent And Domain`.

No graph editor implementation or schema is selected now. Today, generic routing reads the installed agents' descriptions and scopes and the installed skills' descriptions. Pack manifests (`pack.md`) list what each pack provides and declare `use-cases`, which Canvas Settings uses to filter its pack lists. Some manifests also declare `hooks` and `routing_hints`, whose values nothing reads: web, technical-docs, and release declare both, and practices and beads declare other hooks. `library/packs/README.md` documents the two keys (lines 92 and 94). Apart from tests that check the declarations themselves, the only code that mentions either key is `addProvide` in `src/skills/dude-engine/lib/pack-manifest.mjs` (about line 221), which uses them only to decide where to insert a `provides:` block. The map should show these declarations only as declared but unused, never as live routing. Whether to add formal workflow declarations before a first map is question 3 above.

Current records support the three views unevenly:

- Declared: files on disk back this view fully, through the installed agents and skills, the install profile (`.dude/metadata/profile.md`), and the pack manifests.
- Proposed: a proposed route is the model's plan for one request and must be labeled as a plan.
- Observed: only partly recoverable today. For 084, the Coordinator Log has 10 entries, one of them a `route:` event; Work's run history in its `tasks.md` records each task's Tester and Reviewer outcome; and the Architect consultation of 2026-10-13 left no record of its own, appearing only where 084's ledger, plan, spec, and mock cite it.

## Related References

- `.dude/ideas/067-work-type-presentation.md`, Further Exploration: Pack-Owned Workflows: the discussion where the user requested this capture, with Dude's assessment of pack-owned workflows and shared core handoffs.
- `.dude/ideas/071-dude-canvas-pack-authoring.md`: pack creation through Canvas, the future authoring entry point this idea links to instead of duplicating.
- `.dude/ideas/052-dude-canvas-ui.md`: the broader Canvas direction, whose original brief proposed a later Team & Packs surface for the roster and optional packs.
- `.github/skills/dude-generic-routing/SKILL.md`: the current routing rules over the installed agents and skills.

These references provide context only and declare no dependency, priority, or order.
<!-- dude:managed:end -->

## Coordinator Log

- 2026-10-19T14:59:35Z - brainstorm: Staged the routing-map UI that the user explicitly asked to capture during the 067 pack-owned workflow discussion, as a separate draft for coordinator first-capture publication and a future brainstorm. No definition package, tasks, mock, or implementation was created.
- 2026-10-19T18:24:51Z - brainstorm: Took over question 8 from 067 as question 3, corrected what pack manifests declare, and added which views current records can support and a domain-coverage proposal; still draft, with no definition.
