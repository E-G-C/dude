---
title: Animation and Short-Video Pack
slug: animation-short-video-pack
status: defined
spec_path: ".dude/specs/081-animation-short-video-pack/spec.md"
---

# Animation and Short-Video Pack

## Idea

```markdown
I will provide the raw prompt I was working on , once we define these can be broken down in multipole features,
IΓÇÖd frame this as **one coherent animation and short-video pack**, with an initial source review to decide what belongs together. I removed the duplicate TikTok entry and made the deterministic tooling and provenance requirements explicit.

## Suggested prompt

Define and build a **Dude pack for creating programmatic animations and short movies**, primarily using JavaScript.

Use the articles and repositories below as source material. Combine their useful capabilities into a maintainable pack with focused skills, shared tooling, clear documentation, and working examples. Avoid simply copying every repository into the pack.

### Design requirements

1. **Prioritize deterministic implementation.** Identify work that code can perform reliably instead of asking the model to repeat procedural reasoning. Examples include input validation, asset inspection, timeline calculations, project scaffolding, renderer invocation, export settings, and output verification. Prefer Node.js, following this repositoryΓÇÖs conventions. Rewrite skill procedures to invoke these tools where appropriate, with explicit inputs, outputs, and failure behavior. Keep creative decisions with the model or user.

2. **Consolidate overlapping capabilities.** Inspect each repositoryΓÇÖs README, skills, scripts, dependencies, and supporting documentation. Identify shared procedures and conflicting assumptions. Merge duplication while preserving useful distinctions between animation techniques and video formats. Explain which capabilities should be imported, adapted, combined, retained as references, or excluded.

3. **Use the appropriate rendering technology.** Prefer JavaScript and Node.js where they fit, but do not rewrite a suitable existing renderer merely to eliminate another language. For example, evaluate ManimΓÇÖs native workflow before proposing a JavaScript replacement. Clearly distinguish required dependencies from optional rendering backends.

4. **Preserve provenance and licensing.** Retain the original article, repository, and relevant file URLs. For incorporated material, record the reviewed upstream revision, license, required attribution, and significant local adaptations. Verify that reuse and redistribution are permitted before copying material. Preserve enough source-to-pack mapping to support future comparisons and refresh work.

5. **Keep future update work bounded.** Use DudeΓÇÖs existing Compose mechanisms for pack installation and refresh. Preserve links and revision information now, but do not build a new upstream synchronization or update system unless a concrete requirement justifies it.

### Pack integration

Follow the current Dude pack conventions:

- Author the pack under `library/packs/<name>/`, with an accurate `pack.md`, declared dependencies, and `dude-pack-<name>-*` namespacing.
- Reuse existing Dude skills, helpers, and authoring workflows where applicable.
- Keep rendering and animation mechanics independent of any mandatory theme or visual-system pack. Follow the projectΓÇÖs chosen art direction.
- Document supported workflows, limitations, prerequisites, and runnable examples.
- Verify actual generated media, including relevant duration, dimensions, frame rate, format, and transparency requirements. Distinguish automated checks from visual judgments.

Include **stinger transitions for OBS** in the source review, alongside animations and short movies. Establish their rendering and export requirements from the referenced documentation rather than assuming they are interchangeable with ordinary video exports.

### First deliverable

Before importing material or implementing the pack, return:

1. A source inventory covering capabilities, overlap, dependencies, licenses, and reuse constraints.
2. A proposed name, bounded first-version scope, and pack structure. Account for every listed repository, including any recommended exclusions or deferrals.
3. A deterministic-tooling plan explaining which procedures should become Node.js code, which existing tools should be reused, and which tasks still require model or human judgment.
4. Representative end-to-end examples and acceptance criteria that will demonstrate the pack works.

Flag any decision that changes the intended outcome, introduces a substantial dependency, or requires user approval. Proceed through DudeΓÇÖs existing definition and implementation workflow once the scope is accepted.

### Background articles

Read these to understand the intended workflows:

- JavaScript animation: https://www.iart.ai/blog/ai-javascript-animation
- JavaScript animation skill directory: https://github.com/iart-ai/javascript-animation-skills/tree/main/skills
- OBS stinger transitions: https://www.iart.ai/blog/how-to-add-a-stinger-transition-in-obs

### Source repositories

Review these repositories and their documentation:

- https://github.com/iart-ai/javascript-animation-skills
- https://github.com/iart-ai/webgl-animation-skills
- https://github.com/iart-ai/web-animation-skills
- https://github.com/iart-ai/manim-skills
- https://github.com/iart-ai/generative-illustration-skills
- https://github.com/iart-ai/motion-design-skills
- https://github.com/iart-ai/kinetic-typography-skills
- https://github.com/iart-ai/lower-thirds-skills
- https://github.com/iart-ai/map-animation-skills
- https://github.com/iart-ai/data-animation-skills
- https://github.com/iart-ai/explainer-video-skills
- https://github.com/iart-ai/tiktok-video-skills
- https://github.com/iart-ai/youtube-video-skills
- https://github.com/iart-ai/text-message-video-skills
- https://github.com/iart-ai/ad-video-skills
- https://github.com/iart-ai/ecommerce-video-skills
- https://github.com/iart-ai/freelance-motion-skills
```

### Added user direction (literal, 2026-10-05)

```text
explore the repo and skills under https://github.com/calesthio/OpenMontage/tree/main/skills

for useful ideas, concepts or anything that can be reused

also, for the best outcome feel free to alter the previous provided skills , do not limit  to 1:1 importif you think you can merge some do so, you are ther expert and we hope the best outcome.
```

## Open Questions

### First-version scope (answered)

Question: Which first definition should `.dude/ideas/073-animation-short-video-pack.md` produce?

Selected option ID: `A`

Selected label: `Films and OBS overlays — recommended`

Consequence presented: Define code-only MP4 films/titles with optional synthesized film audio plus silent WebM lower thirds/stingers. Share Node, Playwright, Chrome/Chromium, FFmpeg and ffprobe; require H.264/AAC and VP9-alpha support. Include all four proposed acceptance examples.

### Catalog test write boundary (answered)

Request: `animation-catalog-test-scope-correction`

Question: May `define animation-short-video-pack` correct only the plan/tasks write boundary so T001 can add `['animation',['animation','video']]` to `EXPECTED_CATALOG_USE_CASES` in `src/skills/dude-engine/lib/pack-manifest.test.mjs`, keep its exact-membership assertion unchanged, and then continue Ship?

Selected option ID: `A`

Selected label: `Allow the narrow definition correction and continue Ship`

Authorized scope: The current pack/catalog-only boundary conflicts with the mandatory catalog test, whose expected membership omits `animation`. Permission covers only this repository test-fixture row and its required focused verification. The original film/overlay answer A, two-skill structure, E1-E4, core production behavior, dependencies, renderer, licenses and all nine task purposes remain unchanged. This definition step stages the correction only; Ship continuation remains with the coordinator under the existing Work gates.

## Assumptions

## Model-authored research and proposals (OpenMontage brainstorm refresh)

Proposal only. Answer A remains the accepted scope; all 17 earlier source boundaries may be reconsidered without implying 1:1 import or a new definition.

Added source: [OpenMontage](https://github.com/calesthio/OpenMontage) and its requested [skills/ subtree](https://github.com/calesthio/OpenMontage/tree/9327439db69021ab4b0e2776729bf3b58fdb5a87/skills), pinned to `9327439db69021ab4b0e2776729bf3b58fdb5a87` (2026-10-03T16:28:55Z). Acquisition inventory reports 2,143 files, 157 under `skills/`. Coverage: selected creative/meta/animation guidance (including bounded excerpts), seven Python helpers, render-report schema, README/index/license/dependencies, and reference-analysis excerpts. No exhaustive skill review or runtime evaluation.

Root [LICENSE][om-license] is AGPL v3 (GitHub: AGPL-3.0); the supplied complete inventory reports no nested `skills/` license. Vendored licenses elsewhere do not cover this subtree. Keep OpenMontage reference-only: copying or derivative adaptations need license compatibility/obligation review or separate permission. Rewriting in Node does not make source-derived work MIT. Concepts can inform independently authored work; no license migration is proposed.

Compared with plan D1-D4/Appendix A, shared scaffold/check/render/inspect, seeded `draw(frame)`, independent review, provenance, and media/alpha verification are already planned.

### Ranked useful ideas

1. Adapt purpose-led art direction into D1's brief guidance. [Intake][om-intake] and [taste direction][om-taste] connect audience and intended response to concrete visual choices. State the desired viewing experience and recurring cues in ordinary prose; ask only about missing intent. Do not add numeric taste dials, style schemas, mandatory themes, or approval stages.
2. Merge story, shot, and motion craft. [Storytelling][om-story], [scene direction][om-scene], and [bespoke composition][om-bespoke] favor observable actions over decorative movement. Develop D1's storyboard around each beat's purpose, framing, change, and readable hold. E1's drop should become a stream and collect into a pond, not alternate caption cards. Repeated subjects can create continuity; reject compulsory novelty and [blanket easing/palette prescriptions][om-motion].
3. Integrate requested sound with film beats. [Script direction][om-script], [typography][om-type], and [sound design][om-sound] expose competition between reading, movement, and sound. Give E2's words and E3's long name time to settle; keep intentional silence. Reading speed, motion density, and loudness tables are review context, not universal pass/fail thresholds. Overlays remain silent; narration stays excluded.
4. Refine evidence for the existing reviewer. Candidates for the planned Node tools: sampled declared-box occupancy in `check.mjs` for E2/E3, and whole-track level/peak windows in `inspect.mjs` for E1's synthesized score ([visual QA][om-qa]). Use existing layout/hold inputs and decoded audio, not another schema or CLI. Creative legibility, pacing, similarity, and musical effect still need judgment. [Reviewer][om-reviewer]-style frame-specific corrections help; its two-round auto-pass rule does not.

### What the implementations actually establish

[Composition validator][om-validator] checks positive cut spans, selected asset paths, and audio duration, but does not check inter-cut gaps/overlaps or `images[]`. [Audio probe][om-probe] genuinely wraps ffprobe; [media profiles][om-profiles] are static presets, not current platform certification. [Pacing][om-pacing] models TerminalScene steps and nearest cue times, not arbitrary animation. [Slideshow risk][om-risk] scores metadata presence/type ratios, not rendered motion; do not port its creative verdicts.

[Frame sampler][om-frames] offsets scene starts by 0.1s and caps coverage. [Visual QA][om-qa]'s advertised occlusion/transition-similarity checks are absent; wrapper success can coexist with failed extraction or validation issues. [Render schema][om-report] proves report shape, not inspection. Retain D2-D3's stronger failure behavior and exact boundary/full-alpha coverage. Density, near-silence, or similarity observations are review hints, never proof of quality.

### Consolidation and limits

Recommend two responsibility-based skills sharing the already-planned toolchain: Canvas filmmaking owns brief/story/shot/type guidance plus optional synthesized sound; OBS overlays stays separate because transparent holds and full-cover scene switches have different success conditions. Merge `soundtrack` guidance into Canvas as a focused section/reference, keeping synthesis code modular. Merge overlapping craft from the earlier motion-design, kinetic-type, explainer, and short-form sources on the same basis; preserve their provenance and distinct reuse restrictions.

Defer [reference-video analysis][om-reference], downloaded media, hosted generation/narration, data inputs, alternate [runtimes][om-runtime], and UI beyond A. Reject importing director personas, orchestration, checkpoints, registry, Backlot, or an updater. Existing Dude owners and Compose are sufficient.

Changing skill boundaries or check contracts requires explicit `define animation-short-video-pack` before implementation, with exact-owner reconciliation of the existing package and interrupted T001. This refresh leaves T001/history and partial pack files alone; missing terminal/host results prove neither success nor cleanup authority. It neither resumes nor closes Work. No import, dependency adoption, execution, or benchmark occurred; no new guardrails are proposed.

### Definition disposition

The explicit `define animation-short-video-pack` adopts the two-skill structure: `dude-pack-animation-canvas` owns filmmaking and optional sound, with modular synthesis in its `templates/score.js`; `dude-pack-animation-overlays` retains silent lower-thirds/stinger delivery. Both use the existing planned scaffold/check/render/inspect tools. This is a definition-owner structure decision under the user's recorded permission to merge skills, not a new user answer or a change to A. The preceding proposal-only and pending-definition wording remains brainstorm history.

The revised core trio incorporates purpose/audience-led art direction, visible narrative actions, framing/continuity, readable holds and frame/time-specific visual/audio evidence. Additional occupancy and whole-track audio-window measurements remain advisory because they have no required acceptance caller; existing bounds, cue, decoded-alpha and OBS checks remain mandatory. OpenMontage stays AGPL-3.0 reference-only, with no copying or derivative porting. All 17 earlier source dispositions and both articles remain documented. Future authorized implementation must reconcile the obsolete standalone soundtrack artifact with the manifest and source mapping; this definition performs no source migration, installed-profile change, execution, recovery or acceptance of partial work.

[om-license]: https://github.com/calesthio/OpenMontage/blob/9327439db69021ab4b0e2776729bf3b58fdb5a87/LICENSE
[om-intake]: https://github.com/calesthio/OpenMontage/blob/9327439db69021ab4b0e2776729bf3b58fdb5a87/skills/meta/creative-intake.md
[om-taste]: https://github.com/calesthio/OpenMontage/blob/9327439db69021ab4b0e2776729bf3b58fdb5a87/skills/meta/taste-direction.md
[om-story]: https://github.com/calesthio/OpenMontage/blob/9327439db69021ab4b0e2776729bf3b58fdb5a87/skills/creative/storytelling.md
[om-scene]: https://github.com/calesthio/OpenMontage/blob/9327439db69021ab4b0e2776729bf3b58fdb5a87/skills/pipelines/animation/scene-director.md
[om-bespoke]: https://github.com/calesthio/OpenMontage/blob/9327439db69021ab4b0e2776729bf3b58fdb5a87/skills/meta/bespoke-composition.md
[om-motion]: https://github.com/calesthio/OpenMontage/blob/9327439db69021ab4b0e2776729bf3b58fdb5a87/skills/creative/animation-pipeline.md
[om-script]: https://github.com/calesthio/OpenMontage/blob/9327439db69021ab4b0e2776729bf3b58fdb5a87/skills/pipelines/animation/script-director.md
[om-type]: https://github.com/calesthio/OpenMontage/blob/9327439db69021ab4b0e2776729bf3b58fdb5a87/skills/creative/typography.md
[om-sound]: https://github.com/calesthio/OpenMontage/blob/9327439db69021ab4b0e2776729bf3b58fdb5a87/skills/creative/sound-design.md
[om-qa]: https://github.com/calesthio/OpenMontage/blob/9327439db69021ab4b0e2776729bf3b58fdb5a87/tools/analysis/visual_qa.py
[om-reviewer]: https://github.com/calesthio/OpenMontage/blob/9327439db69021ab4b0e2776729bf3b58fdb5a87/skills/meta/reviewer.md
[om-validator]: https://github.com/calesthio/OpenMontage/blob/9327439db69021ab4b0e2776729bf3b58fdb5a87/tools/analysis/composition_validator.py
[om-probe]: https://github.com/calesthio/OpenMontage/blob/9327439db69021ab4b0e2776729bf3b58fdb5a87/tools/analysis/audio_probe.py
[om-profiles]: https://github.com/calesthio/OpenMontage/blob/9327439db69021ab4b0e2776729bf3b58fdb5a87/lib/media_profiles.py
[om-pacing]: https://github.com/calesthio/OpenMontage/blob/9327439db69021ab4b0e2776729bf3b58fdb5a87/lib/verify_scene_pacing.py
[om-risk]: https://github.com/calesthio/OpenMontage/blob/9327439db69021ab4b0e2776729bf3b58fdb5a87/lib/slideshow_risk.py
[om-frames]: https://github.com/calesthio/OpenMontage/blob/9327439db69021ab4b0e2776729bf3b58fdb5a87/tools/analysis/frame_sampler.py
[om-report]: https://github.com/calesthio/OpenMontage/blob/9327439db69021ab4b0e2776729bf3b58fdb5a87/schemas/artifacts/render_report.schema.json
[om-reference]: https://github.com/calesthio/OpenMontage/blob/9327439db69021ab4b0e2776729bf3b58fdb5a87/skills/meta/video-reference-analyst.md
[om-runtime]: https://github.com/calesthio/OpenMontage/blob/9327439db69021ab4b0e2776729bf3b58fdb5a87/skills/meta/animation-runtime-selector.md

## Coordinator Log

- 2026-10-05T20:37:29Z - Captured literal Canvas intent for later (`capture_only`); no further discussion, definition, or execution.
- 2026-10-05T21:39:59Z - Recorded user scope choice A for first definition: films and OBS overlays with all four acceptance examples; retained draft status and empty spec_path.
- 2026-10-05T21:40:22Z - Defined Animation and Short-Video Pack at .dude/specs/073-animation-short-video-pack/spec.md for user-selected scope A, with spec, plan, and nine open task units.
- 2026-10-05T22:30:07Z - Claimed T001@c7a10f21 through autonomous Ship; task state, board and snapshot updated through the Work adapter.
- 2026-10-05T23:23:32Z - Brainstorm refresh: appended literal OpenMontage exploration/redesign direction and model-authored reference-only proposals; retained accepted scope A, status defined, and exact spec_path .dude/specs/073-animation-short-video-pack/spec.md; no re-definition or Work-state mutation.
- 2026-10-05T23:36:34Z - Re-defined .dude/specs/073-animation-short-video-pack/spec.md from accepted scope A and the completed OpenMontage brainstorm: consolidated optional soundtrack guidance/synthesis into Canvas filmmaking alongside the separate overlays skill; retained E1-E4, reference-only source boundaries and nine one-to-one task purposes. This definition event does not resume or close the interrupted Work run.
- 2026-10-05T23:55:06Z - Execution reconciliation after explicit re-definition: retained all nine one-to-one task keys and dependencies (3 kept, 6 changed, 0 dropped, 0 new); preserved T001@c7a10f21 as [~] and eight unstarted tasks as [ ], with no completion or resumed Work authority. Existing snapshot, absent board/history, partial pack files and interrupted-run controls remain unchanged.
- 2026-10-06T01:17:08Z - Staged narrow re-definition of .dude/specs/073-animation-short-video-pack/spec.md following the user's current option A reply to animation-catalog-test-scope-correction (Allow the narrow definition correction and continue Ship): permit only the ['animation',['animation','video']] expected-data row in src/skills/dude-engine/lib/pack-manifest.test.mjs and require its focused catalog test in T001, keeping the assertion unchanged. The specification, original films/overlays scope A, two-skill structure, E1-E4 and all nine task purposes remain unchanged. This definition staging performs no source edit, task-state/history change, Work resumption or closure.
- 2026-10-06T01:22:34Z - Applied narrow execution reconciliation for the user-approved catalog fixture exception: T001@c7a10f21 retains its one-to-one foundation purpose, [~] state and added exact-row verification; eight other task units and all existing run-history bytes remain unchanged. No task is closed and no old Work authority is resumed.
- 2026-10-06T01:37:33Z - Claimed T002@d2b40e62 through autonomous Ship; task state, board and snapshot updated through the Work adapter.
- 2026-10-06T03:17:20Z - Claimed T003@e9c33a17 through autonomous Ship; task state, board and snapshot updated through the Work adapter.
- 2026-10-06T07:03:00Z - Claimed T004@a4f865b0 through autonomous Ship; task state, board and snapshot updated through the Work adapter.
- 2026-10-06T11:30:01Z - Claimed T005@b19d0ce3 through autonomous Ship; task state, board and snapshot updated through the Work adapter.
- 2026-10-06T12:47:54Z - Claimed T006@f62591a8 through autonomous Ship; task state, board and snapshot updated through the Work adapter.
- 2026-10-06T15:14:25Z - Claimed T007@6d17ab42 through autonomous Ship; task state, board and snapshot updated through the Work adapter.
- 2026-10-06T17:03:35Z - Claimed T008@8c350fe9 through autonomous Ship; task state, board and snapshot updated through the Work adapter.
- 2026-10-06T19:28:16Z - Claimed T009@41ae7d06 through autonomous Ship; task state, board and snapshot updated through the Work adapter.
- 2026-10-07T00:04:47Z - Completed autonomous Ship for .dude/specs/073-animation-short-video-pack/spec.md after T009@41ae7d06 returned ended/task-settled through the live Work adapter; all nine canonical tasks are done. Retained the user's 2026-10-06T23:21:51Z acceptance of the six reviewed exports with the basic-style qualification, fresh Tester evidence, and final independent Reviewer approval. One advisory Rubber Duck retrospective completed before close. Historical failures, the configuration-scoped OBS evidence, and disclosed untouched host side effects remain recorded. No commit, push, installation into this workspace, or optional host cleanup was performed.
- 2026-10-09T02:35:32Z - import: Copied the supplied current-format offline idea and four-file package from C:\Work\AI\to add\073-animation-short-video-pack.md and C:\Work\AI\to add\073-animation-short-video-pack as .dude/ideas/081-animation-short-video-pack.md and .dude/specs/081-animation-short-video-pack. Reassigned 073 to 081 at the user's request. Updated active ownership links and the task audit breadcrumb; preserved all nine recorded completed task states and durable keys. Original user text, Coordinator Log entries, retrospective, and hash-bound execution history retain their original 073 references and bytes. This records imported completion history, not new verification, execution, or Work continuation. The external originals and library/packs/animation are unchanged.
