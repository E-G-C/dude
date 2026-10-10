# Feature Specification: Animation and Short-Video Pack

**Idea:** `.dude/ideas/081-animation-short-video-pack.md`
**Canonical specification:** `.dude/specs/081-animation-short-video-pack/spec.md`
**Scope basis:** The user's answered scope question, option A: films and OBS overlays. The later brainstorm permits consolidating source skills for the best result; it does not change that outcome.

## Problem And Outcome

A creator should be able to make an editable, code-drawn short film or broadcast overlay without assembling overlapping skill collections, repeating mechanical rendering instructions, or trusting an unchecked export. Ordinary video, a transparent name graphic, and a scene-changing stinger have different acceptance conditions.

Deliver one optional pack named `animation` that supports local short films, animated titles, silent lower thirds, and silent OBS stingers. Supply reusable creation guidance, deterministic tools, runnable examples, and honest media verification. Guide the creator from purpose and audience to concrete visual choices, visible narrative actions, and readable holds. Keep creative direction with the user or model and follow the project's chosen art direction.

## Scope And Accepted Constraints

The user selected both export families and all four examples in this specification.

| Accepted boundary | Required outcome |
|---|---|
| Code-only first version | Draw shapes and text and synthesize optional film sound locally; use installed system fonts. No external images, media, downloadable fonts, generation services, or asset import. |
| Films and titles | Editable source plus opaque MP4, encoded as H.264/yuv420p. Requested synthesized film audio uses AAC at 48 kHz; a declared silent film has no audio stream. |
| Lower thirds and OBS stingers | Editable source plus silent VP9 WebM carrying real decoded alpha. A stinger also supplies its measured full-cover interval and transition point in milliseconds. |
| Creative control | Purpose, audience, exact wording, art direction, and sound choice guide each piece. No mandatory theme, beat grid, or automatic creative-quality verdict. |
| Pack delivery | One self-contained optional pack source folder, compatible with the existing Dude pack lifecycle. No required dependency on another optional pack. Runtime prerequisites are provisioned separately. |

The media profiles are accepted delivery constraints, not a choice of implementation. The plan owns the rendering toolchain and interfaces.

This re-definition does not authorize implementation, rendering, prerequisite installation, pack installation/import, billing, Git actions, or recovery of interrupted Work. Choosing scope does not approve future artwork.

### Non-Goals

- An editor application, preview-control interface, interactive website animation, or OBS Browser Source integration.
- External assets, custom-font import, narration/transcription, hosted generation, supplied music, or sound in overlays.
- Additional rendering backends or native mathematical/3D animation workflows in this version. A suitable native renderer remains an option for a separately selected outcome, not something to rewrite for language uniformity.
- Data/chart/map/chat/product/advertising pipelines, roster or dataset batching, platform publishing, pricing, client contracts, or a brand-system workflow.
- ProRes, Safari HEVC, chroma key, track-matte stingers, or platform-wide compatibility/retention guarantees.
- A new upstream updater, renderer-plugin system, scene language, registry, queue, state store, director/agent hierarchy, orchestration layer, or workflow lane.

These deferrals preserve the broader raw idea. They do not silently become requirements for the first version.

## User Scenarios And Acceptance

Priorities describe delivery focus, not optionality: all four scenarios are required. Each can be verified independently using the shared tools and its own input.

### US1 — P1: Create A Short Film With Optional Sound

**Given** an approved brief, exact captions, output dimensions/rate/duration, a seed, and an explicit sound choice,
**when** the creator builds and exports the film,
**then** they receive editable source, the requested media, review images, and measured results without external assets or rendering-service credentials.

**Independent example E1:** Three shots show a drop falling, joining a flowing stream, then collecting into a pond. Caption: `One drop. One stream.` Seed: `123`. Duration: 12 seconds at 1920x1080 and 30 fps. Synthesized percussive cues occur at 4 and 8 seconds.

- The decoded video contains exactly 360 frames, uses the accepted film profile, and has video duration within one frame of 12 seconds.
- Requested audio is present at 48 kHz. The two intended cue frames are 120 and 240; decoded onsets are within 100 ms of each, with no greater than a +6 dB jump under the plan's documented measurement.
- The three actions are visible changes in the depicted water, not animated caption cards standing in for the story. Framing and continuity let a viewer follow the subject from drop to stream to pond; the exact caption matches the brief.
- Review includes each shot's action and readable hold, first/last frames, cut boundaries, the full-duration contact sheet, and listening to the complete clip. Findings cite the affected frames or audio interval.
- A silent variant emits no audio stream. Requested sound that cannot be generated or verified is a failure, not a silent substitute.

The cue thresholds belong to this deliberately percussive example. They do not impose a beat grid on every creative film or prove musical quality or listening safety.

### US2 — P2: Create A Vertical Animated Title

**Given** exact text and reveal timings for a vertical title,
**when** the creator exports it,
**then** its wording and layout survive the export without adding a separate text-animation workflow.

**Independent example E2:** Text: `Read. Check. Export.` Word reveals begin at frames 0, 80, and 160. Duration: 8 seconds at 1080x1920 and 30 fps; silent.

- The decoded video contains exactly 240 frames and matches the accepted film profile, dimensions and rate; video duration is within one frame of 8 seconds.
- No audio stream is present.
- Every declared required text box stays inside `x=[90,990), y=[260,1660)` and the final state contains all intended text.
- Boundary stills and the full-duration sheet show correct glyphs, unclipped masks, and text that settles for reading at phone size. Review judges the holds separately from geometric bounds.

The example rectangle is an explicit fixture constraint, not a universal claim about social-platform overlays.

### US3 — P2: Deliver A Transparent Lower Third

**Given** a person's exact name and role, a hold interval, and a placement area,
**when** the creator exports the name graphic,
**then** the graphic remains readable over footage while everything outside it remains transparent.

**Independent example E3:** Name: `Alex Rivera`; role: `Host`. Duration: 6 seconds at 1920x1080 and 30 fps; silent. Hold: frames 30-149. Repeat with `Alexandra Rivera-Montgomery` to exercise text fitting.

- The decoded file contains exactly 180 frames and matches the accepted overlay profile, dimensions and rate; video duration is within one frame of 6 seconds.
- Frame 0 and frame 179 are fully transparent.
- The graphic is visible and stable during the hold. Every nonzero-alpha pixel stays inside `x=[96,1824), y=[720,1026)`, and the background outside the graphic stays transparent.
- The short and long names and role remain readable over light and dark backgrounds; neither text fitting nor a mask clips glyphs. Motion settles for the declared hold instead of competing with reading.
- The encoded file carries no audio. A file merely tagged as alpha-capable does not satisfy decoded transparency.

### US4 — P2: Hide An OBS Scene Change With A Stinger

**Given** a stinger brief and two scenes to switch between,
**when** the creator renders and installs the result as an OBS Stinger,
**then** its beginning/end reveal the underlying scenes and its measured fully covered interval hides the actual scene change.

**Independent example E4:** A shape-and-text wipe reading `Frame Studio`, 2 seconds at 1920x1080 and 30 fps; silent. Designed full-cover hold: frames 24-35.

- The decoded file contains exactly 60 frames and matches the accepted overlay profile, dimensions and rate; video duration is within one frame of 2 seconds.
- First/last frames have alpha 0 everywhere. Full-resolution decoded alpha is 255 at every pixel throughout frames 24-35.
- The reported cover interval is `[800,1200)` milliseconds, with transition point `1000` milliseconds inside it.
- All decoded alpha frames are inspected. Compositing contrasting old/new test scenes with a change at frame 30 hides that change.
- In the selected OBS build, the delivered file and **Time (milliseconds): 1000** setting show the old/new background at the ends and no exposed scene cut. Record the OBS version and decoder context; file inspection alone is not host-compatibility evidence.

Use available automation for the observable scene-switch sequence before requesting a narrowly scoped human observation for any unavailable host boundary.

## Functional Requirements

1. **FR-001:** The pack must be discoverable and installable through the existing optional-pack lifecycle, without changing core behavior or requiring another optional pack.
2. **FR-002:** The creation workflow must keep the brief's message, audience, intended response, exact text, art direction, and sound choice under user/model control.
3. **FR-003:** The tools must validate positive dimensions, frame rate, integer frame count, consistent duration/timings, supported output kind and valid frame indexes before reporting an export as successful.
4. **FR-004:** Scaffolding must preserve supplied text literally and refuse to replace an existing destination.
5. **FR-005:** The local rendering workflow must not fetch or embed external assets or contact a rendering/generation service.
6. **FR-006:** Each successful export must include editable, rerenderable source and meet its selected film or overlay output profile.
7. **FR-007:** A film requesting sound must receive locally synthesized sound; a declared silent film and every overlay must have no audio stream.
8. **FR-008:** Repeated and out-of-order requests for the same source frame must produce the same raw pixels when source, seed and rendering environment are unchanged.
9. **FR-009:** Every export inspection must measure dimensions, rate, decoded frame count, duration, container/codec and required audio properties from the actual encoded file.
10. **FR-010:** Required overlay transparency checks must inspect decoded full-resolution alpha rather than rely only on a format name, metadata tag or downscaled image.
11. **FR-011:** Lower-third checks must require empty ends, visible stable hold content and the declared safe placement, without painting a full-screen background.
12. **FR-012:** Stinger checks must require transparent ends and a fully opaque covered interval; painting to every edge during that interval must not be rejected as a lower-third violation.
13. **FR-013:** Stinger delivery must report the measured cover interval and a transition point inside it; a supplied point outside it must fail validation.
14. **FR-014:** Review images must span the full duration and include first/last frames, declared action or transition boundaries, and reading holds, rather than hide difficult frames.
15. **FR-015:** Required text/layout checks must identify their declared geometry and checked frames; they must not claim to detect all unregistered text, clipping or legibility failures.
16. **FR-016:** Sound inspection must report which declared cues were checked and its onset/loudness method; absent or unchecked cues must not be reported as proven synchronized.
17. **FR-017:** Reports must distinguish measured checks, visual/listening judgments and outstanding host observations, identifying the actual source and rendering environment.
18. **FR-018:** Missing prerequisites, failed readiness, source errors, failed encoding/decoding, invalid input or a failed required check must return a specific non-passing result, never a successful fallback or skipped-check success.
19. **FR-019:** An unsuccessful export must not overwrite existing source/final files or present partial output as a verified deliverable.
20. **FR-020:** Documentation must explain prerequisites, supported workflows, limitations, commands, output meanings, and all four runnable examples using installed pack paths.
21. **FR-021:** OBS instructions must distinguish a lower-third overlay from a scene-transition stinger and bind any compatibility claim to actual host evidence.
22. **FR-022:** Provenance documentation must account for all 17 original repositories, both articles, and the added OpenMontage reference, with original URLs, reviewed revisions, dispositions and relevant pinned file URLs.
23. **FR-023:** Every incorporated upstream file or substantial excerpt must map to its local destination with its license, required attribution and significant adaptations.
24. **FR-024:** Incorporated MIT material must retain its full applicable notice; repository licensing must not be represented as licensing unrelated assets, fonts, engines, codecs or hosted services.
25. **FR-025:** The pack must not copy or derivatively port material from OpenMontage or the generative-illustration source lacking a reuse grant; both reference-only dispositions must remain visible.
26. **FR-026:** Shared mechanical procedures must have one maintained implementation used by the relevant skills, without duplicating the common helpers or adding unused backend interfaces.
27. **FR-027:** Creation guidance must relate composition to the brief's purpose and audience without prescribing a mandatory visual system.
28. **FR-028:** Narrative-film guidance must describe each beat's visible action, framing, and connection to adjacent shots, rather than substitute captions for the depicted action.
29. **FR-029:** Requested film sound must be planned with visual beats and readable holds, allowing intentional silence without requiring a cue for every beat or a rhythmic grid.
30. **FR-030:** Each visual or listening review finding must identify the source/export revision and the affected frames or time interval.

## Key Entities

- **Brief:** Subject, audience, intended response, exact copy, art direction, dimensions, rate, timing and sound choice for one piece.
- **Editable piece:** Locally authored drawing and optional sound source, its seed and declared timeline/layout expectations.
- **Export:** One encoded film, lower third or stinger, with its declared output properties.
- **Inspection result:** Measurements and check coverage for that source/export, plus separate human-judgment or host-verification limits.
- **Source mapping:** Original and pinned upstream references, license/attribution, incorporated local paths and adaptation notes.

These describe inputs and outputs, not a new persisted workflow database.

## Edge Cases

- Invalid or contradictory timing, non-integer or out-of-range frame indexes, and dimensions unsupported by the selected output profile fail without silently rounding away the discrepancy.
- A browser, encoder, codec, font or readiness failure cannot become a passing asset audit. Existing system-font substitution is visible in the recorded environment; missing required glyphs remain a visual failure.
- External font/image/media requests or embedded assets violate the code-only profile. Source inspection does not claim to sandbox arbitrary hostile code.
- A silent export is valid only when silence was declared. A music check with no evaluated cues proves no synchronization.
- Empty lower thirds cannot pass merely because they are transparent. A full-screen opaque film cannot pass as a stinger merely because its format supports alpha.
- A stinger with no fully covered frame, holes at full cover or a transition point outside coverage fails. A valid stinger is not subject to lower-third safe-area restrictions.
- Long text must fit without silent truncation, changed wording, missing glyphs or unreadable shrinking.
- Correct bounds or measured sound levels do not prove a readable hold, narrative continuity, or musical effect. Review must evaluate the actual pictures and sound; a fixed number of revision rounds cannot turn an unresolved defect into a pass.
- System fonts and rendering implementations can differ across machines. Repeatability is scoped to one unchanged environment, not cross-platform pixel equality, identical encoded bytes or identical source from the same natural-language prompt.
- An existing destination is preserved on conflict. Failed work must identify any incomplete temporary output rather than claim final delivery.
- Deferred sources and their links do not activate unsupported engines or grant source-reuse permission.

## Success Criteria

- **SC-001:** E1-E4 independently meet every measured criterion and their applicable visual/listening/OBS acceptance. Approval of one example does not approve the others.
- **SC-002:** Selected frames from every example reproduce identical raw pixels in forward, reverse and repeated order in the same recorded environment.
- **SC-003:** Invalid timing, odd encoder dimensions, missing tools, source exceptions, external asset requests, missing requested audio, false alpha and missing/out-of-range stinger coverage each produce a specific non-passing result.
- **SC-004:** A fresh core-only installation can add, deliberately refresh and remove the pack through the existing lifecycle; its tools run from installed paths, authoring tests do not ship, and removal leaves no pack residue.
- **SC-005:** All 17 original source dispositions, both articles, and OpenMontage remain discoverable with revision/file attribution, and every incorporated portion has the required notice and local mapping.
- **SC-006:** A missing or skipped real browser/encoder/OBS check remains an explicit gap. Passing static or mocked tests alone never establishes media capability.

## Assumptions And Dependencies

- The user's actual option A reply settles the outcome. The recorded permission to alter or merge skills lets the definition owner choose their structure without inventing a new scope answer.
- Creators supply or approve content and art direction. Future examples retain the project's normal visual-approval rules; this definition has no editor/UI source or mockup gate.
- Required local runtimes/codecs and an OBS host for host acceptance must be available through separately authorized setup. No automatic downloads or installation are implied.
- The reviewed root licenses support the selected MIT adaptations, not unrelated third-party material. OpenMontage is reference-only under its AGPL-3.0 boundary; a different implementation language does not relicense source-derived work.
- The plan preserves the material research evidence without depending on session scratch files. Research was selective, not a runtime evaluation or exhaustive source review.
- This specification asserts required behavior and acceptance targets, not executed tests, finished media, an independent review verdict, Work recovery, or definition readiness.
