# Implementation Plan: Animation and Short-Video Pack

**Spec:** `.dude/specs/081-animation-short-video-pack/spec.md`
**Exact idea:** `.dude/ideas/081-animation-short-video-pack.md`
**Accepted scope:** Option A, films and OBS overlays, including E1-E4.
**Strategy:** One optional `animation` pack, two focused skills, one local Canvas capture/encode/inspect toolchain. Canvas filmmaking includes optional synthesized sound; overlays retain their separate alpha and host contracts.

The revised specification was checked against the definition gate before this plan was drafted: bounded scope, independent scenarios, numbered obligations, measurable delivery criteria, entities, edge cases and assumptions are present; no clarification marker remains. This is an authoring check, not lint execution, independent approval or a media result.

## Technical Context

- **Language/Version:** JavaScript ESM `.mjs`, following the repository's Node/stdlib conventions. Use Node 22 LTS as the initial supported verification target; record the exact runtime used. The upstream Node 18+ statements are source history, not this pack's support certification.
- **Primary Dependencies:** `playwright-core`, separately provisioned Chrome or Chromium, FFmpeg and ffprobe. Films require `libx264` and AAC encoding; overlays require `libvpx-vp9` encoding and alpha-preserving decoding. No engine binaries or dependencies are vendored. Record the actual tested Playwright/browser/FFmpeg versions in the shipped verification reference and each media report.
- **Storage:** Editable local HTML, optional locally generated review images, encoded media and one inspection report per export. Temporary render files belong to that invocation. No database or workflow state.
- **Testing:** `node:test`/`node:assert/strict`; pure/child-process failure tests, source-contract tests, disposable Compose integration, mandatory real browser/encoder media tests, and actual OBS scene-switch evidence.
- **Target Platform:** Initial acceptance on Windows with Chrome/Chromium and the provisioned codec tools. Use platform-neutral Node paths/argument vectors; do not claim macOS/Linux or cross-browser pixel equivalence without separate observed runs.
- **Project Type:** Optional Dude catalog pack with skills, local CLI tools and authoring-only tests.
- **Performance Goals:** Frame-exact finite exports; no realtime render-speed claim. Capture/inspect incrementally instead of retaining a complete uncompressed film in memory. Report the requested workload; do not invent duration/resolution caps or silently truncate sheets.
- **Constraints:** Code-drawn shapes/text, installed system fonts, optional synthesized film audio, silent overlays, no network assets/services, no mandatory visual-system pack, existing Compose lifecycle only.

Provisioning requires its own authorization. Missing tools/codecs stop a real run; they do not trigger downloads, an `npx` install, a different renderer, or successful skips.

## Chosen Structure

```text
library/packs/animation/
  pack.md
  skills/
    dude-pack-animation-canvas/
      SKILL.md
      scripts/
        scaffold.mjs
        check.mjs
        render.mjs
        inspect.mjs
        lib/common.mjs
      templates/
        film.html
        score.js
      examples/{film,vertical-title}.html
      references/{sources,verification}.md
      references/licenses/iart-ai-MIT.txt
    dude-pack-animation-overlays/
      SKILL.md
      templates/{lower-third,stinger}.html
      examples/{lower-third,stinger}.html
      references/obs.md
  tests/
    pack-contract.test.mjs
    tools.test.mjs
    composition.test.mjs
    media.test.mjs
    helpers/bundle.mjs
library/packs/README.md                  # catalog entry only
```

`common.mjs` contains only code actually shared by these CLI callers: numeric/path handling, browser loading, source-frame capture and process/report helpers. `templates/score.js` keeps the used synthesis code modular under Canvas; it is not another skill or backend. `bundle.mjs` serves the two tests that need a disposable consumer. None is a plugin interface or general framework.

Use the existing namespaced-skill pattern, including colocated scripts/references, as in `library/packs/writing/`. Tests stay at the pack root, outside Compose's copied `skills/` tree. No agent, prompt, instruction glob, core hook, editor or new roster entry is needed.

The manifest declares:

```yaml
---
name: animation
description: "Create local code-drawn films, titles, lower thirds, and OBS stingers with checked media exports."
use-cases: [animation, video]
provides:
  agents: []
  skills:
    - dude-pack-animation-canvas
    - dude-pack-animation-overlays
requires:
  tools: [node, ffmpeg, ffprobe]
hooks: []
---
```

The body explicitly declares `playwright-core`, the separately available browser, codec requirements, setup limitations and tested versions. `animation` and `video` are real discovery use cases, not agent routing hints. No routing hints are needed without an agent.

The entire `library/packs/animation/` folder must remain a self-contained source artifact that can be copied into a compatible Dude catalog. Skills, scripts, templates, examples, notices and provenance travel together; only the catalog README entry sits outside it. Resolve shipped resources relative to their script/skill location, not this repository or session scratch paths. Runtime dependencies remain separately provisioned in the consuming project.

Only this pack and the catalog entry are implementation source targets, with one repository-only test-fixture exception in T001: add `['animation',['animation','video']]` to `EXPECTED_CATALOG_USE_CASES` in `src/skills/dude-engine/lib/pack-manifest.test.mjs`. Keep the exact-membership assertion and all other test-file content unchanged; this authorizes no core production behavior change. Require the focused catalog check in D4 after the row update. Do not edit any other core content, generated dogfood, the authoring-refresh changes, installed profiles, global dependencies or other packs. Tests may create disposable consumer installations and runtime scratch outputs. Installing into this working repository is a separate explicit Compose action; no build-dev projection is required for this pack-only change.

### Existing Partial Source And Re-definition Boundary

The interrupted attempt left `pack.md`, three `SKILL.md` skeletons, `references/sources.md` and the MIT notice. It left no renderer or test implementation. Their presence is not completion evidence. All remain unchanged during definition.

In a future authorized implementation, T001 must reconcile the manifest, skill scopes, provenance destinations and obsolete `skills/dude-pack-animation-soundtrack/SKILL.md` together. Carry any applicable sound guidance into Canvas and remove that unused standalone source artifact under the normal source-edit authority; do not leave an undeclared third skill, compatibility alias or dangling reference. T004 still implements the film/sound slice at `dude-pack-animation-canvas/templates/score.js`; no synthesis capability is dropped or split into a new task. Source/installed membership tests must expect exactly the two skills above.

No animation pack is recorded in the current installed profile. This plan grants no profile-removal or orphan-cleanup authority. Any later installed-state change must use existing Compose ownership and its exact file membership.

T001 remains the one-to-one pack-foundation/provenance task. Its existing claim and the interrupted Ship log remain evidence for the coordinator to preserve, not permission to resume or close that run. Re-definition is not Work recovery and creates no attempt, administrative acceptance, or new execution control.

## D1: Creation Guidance And Source Contract

**Covers:** FR-002-FR-008, FR-020, FR-026-FR-030.

The Canvas skill owns brief-to-storyboard-to-source guidance, opaque film/title delivery, optional synthesized sound, and common tool invocation. The overlays skill explains lower-third versus stinger behavior and invokes the same tools. Consolidation follows responsibility, not a 1:1 import of upstream skill folders.

Use the familiar brief/storyboard/shot workflow because the accepted output is a film, not a stack of animated slides. Start with the audience, purpose, desired viewing response, exact copy and sound choice already supplied. Translate them into concrete composition and recurring visual cues in ordinary prose. Ask only about missing outcome-changing intent. Keep these notes in the normal creative exchange or source comments; add no style schema, numeric taste controls, mandatory theme, director persona or approval stage.

For each narrative beat, describe what visibly happens, why the shot needs that action, the framing, the subject's continuity into the next shot, and where motion settles so the viewer can read or understand the change. In E1, depict the falling drop, flowing stream and collecting pond as actions of the water; captions cannot replace them. The same subject or visual motif may recur to establish continuity. Do not require novelty in every shot, uniform easing, or a prescribed palette.

Plan requested sound with those picture beats. A cue may emphasize a change, leave room for exact copy, or give way to intentional silence. The E1 cues are a fixture-specific percussive choice; other films need no universal beat grid. For E2 and E3, let text settle and hold instead of adding movement that competes with reading. Bounds can support review, but cannot prove these creative judgments.

Keep user words literal; use safe string serialization when placing text in HTML/script. A template is a starting drawing and numeric timing scaffold, not a scene language. The model edits ordinary drawing code for the approved brief. Tools perform input validation, frame/time calculations, capture, encoding and measured checks.

Retain the upstream page contract:

- `window.draw(frame)`: an integer-indexed, order-independent complete draw into one Canvas.
- `window.FRAMES`: positive integer; `window.FPS`: positive finite rate; Canvas width/height: positive integers.
- Optional `window.ready`: an awaited readiness promise; absent means no asynchronous resources are declared, not permission to ignore a rejected promise.
- `window.LAYOUT`: declared text/key-object boxes for the current frame, using the upstream `claim` convention. Required example text must be registered.
- Optional `window.CUES`: declared event times in seconds; optional `window.SCORE`: offline Web Audio builder, used only for explicitly requested film sound.

Keep safe rectangles and hold intervals as direct check inputs, not a new persisted scene model. Derive seconds from frames/rate and reject contradictory supplied duration/frame count. Use seeded randomness; rendering ignores live playback clocks. Bare source HTML may display the drawing, but this feature adds no custom preview UI or playback-control application.

The film scaffold embeds the used code from `templates/score.js` into its editable HTML when the sound slice is implemented. It must not depend on an external script request at render time. The shared source can define `SCORE` without emitting audio: only the explicit render choice enables synthesis. Do not duplicate the score implementation in an overlays skill or add an unused instrument catalog.

For each applicable visual example, obtain the normal visual approval for that actual revision before treating its appearance as accepted. Option A approves scope, not palettes or pixels. No UI mockup is required merely to define this non-UI pack.

## D2: Shared Node Tools

**Covers:** FR-003-FR-019, FR-026, FR-030.

The four CLI entry points expose small literal argument contracts, with `--help` available without loading the browser. Share the implementation through ordinary ESM functions so `render` can use the same checks/inspector without shelling out to duplicate wrappers.

| Tool | Inputs | Outputs | Required behavior and failures |
|---|---|---|---|
| `scaffold.mjs` | `--kind <kind>`, `--out <html>`, literal `--text` and optional `--role`, `--width`, `--height`, `--fps`, `--duration` or `--frames`, `--seed` | One editable self-contained HTML file, with frame/timing values derived by code | Reject missing/invalid/inconsistent numbers, unsupported kind, or existing destination. If both duration and frame count are supplied, require agreement. Do not silently truncate text or round a fractional requested frame count into a different duration. Use exclusive file creation. A title uses kind `film`. |
| `check.mjs` | `--source <html>`, `--kind`, `--browser <absolute-executable>`, selected repeat-order `--samples`; applicable `--safe-rect`, `--hold` | Human-readable findings; `--json` emits the same check results and actual coverage as JSON | Await readiness; check the source contract, asset policy, page errors, declared layout and kind-specific source alpha. Required ranges are not replaced by a few repeat-order samples. Missing checks/prerequisites are non-passing. Describe geometry limits. |
| `render.mjs` | `--source`, `--out <media>`, `--kind`, `--browser`; explicit `--audio <choice>`; `--review-frames`, `--sheet-step`, and applicable check expectations | Encoded MP4 or WebM, `<out>.review/` images and `<out>.report.json` | Re-read/check the actual source for this run. Use the selected film/overlay profile. Invalid requests, source/encoder/audio failure or failed required inspection stop success reporting. Existing final/report/review destinations fail rather than overwrite. |
| `inspect.mjs` | `--file <encoded-media>`, expected `--kind`, `--width`, `--height`, `--fps`, `--frames`, `--audio`; applicable `--cues`, `--safe-rect`, `--hold`, `--transition-ms` | Actual media properties, measured results/coverage, stinger timing if applicable, and remaining judgment limits; `--json` exposes the same findings | Probe and decode the file. Wrong properties, failed decode, absent required sound/alpha, missing stinger coverage or an out-of-range transition point fail. Tags, extensions and declarations alone cannot pass. |

Kinds are `film`, `lower-third` and `stinger`; audio choices are `none` and `synth`. Frame samples/review frames are comma-separated zero-based integer indexes. `--sheet-step` is a positive integer frame interval; always include the last frame. `--safe-rect x0,y0,x1,y1` uses half-open pixel bounds; `--hold first,last` uses inclusive integer frame indexes. `--cues` is a comma-separated list of seconds for explicitly requested cue checks, not a new cue-file schema. Render takes declared cues from `CUES` and passes them to the shared inspector. Transition time is in milliseconds. Validate every requested index/interval against the actual source or expected encoded frame count.

For E2 and E3, required registered-box checks cover every source frame where the text is declared. Hold checks cover the full declared hold. Repeat-order samples establish repeatability only for the sampled frames. Return exactly which frames and boxes were checked; do not infer unregistered text or universal visual correctness. Standalone file inspection cannot claim source-layout or source-revision verification that it did not perform.

Use `pathToFileURL` for local pages and `spawn`/`execFile` with argument arrays and `shell: false` for media tools, including paths with spaces/non-ASCII characters on Windows. Require an explicit browser executable argument for reproducible runs. Resolve `playwright-core` from the consuming project's dependency context (the working project), as the upstream scripts do; do not install it inside the generated skill projection or import the Dude Canvas review runtime.

The repository's `src/extensions/dude/lib/review/browser.mjs` was considered: it is a CDP/annotation-host component with review-specific lifecycle and evidence semantics, not this Playwright media renderer. Reuse Node/Compose/test conventions, not that unrelated runtime.

### Input, Asset And Failure Checks

- Validate the kind and all numeric arguments before launching helpers or creating final outputs. Check source-derived values before the frame loop. Reject nonfinite values, invalid intervals/indexes and duration/frame disagreements.
- Adapt the static zero-asset scan and browser request observation. Reject external scripts, external or embedded media/fonts, and non-self resource requests before fetching. Inline authored drawing/synthesis code and installed system-font use belong to the code-only profile. This check is not a sandbox for arbitrary hostile JavaScript.
- Await declared readiness and make page errors fatal to required checks. Register and report browser/tool failures directly; do not reproduce the upstream asset audit's "live check skipped" followed by `CLEAN`.
- Sample source frames by index, not elapsed capture time. Check selected indexes in forward, reverse and repeated order; compare raw pixels in the same environment. Record source digest, seed, platform, system-font choice and actual browser/tool versions.
- Capture, pipe and decode incrementally; honor process failure and pipe closure. Do not accumulate full-resolution frames for the whole film or swallow an encoder failure.
- Encode into invocation-owned temporary output, inspect it, then create the requested final path without overwriting an existing file. Temporary/final-report conflicts fail visibly. Clean only invocation-owned temporary paths and report cleanup limits. This is not a crash-proof transaction or recovery subsystem.
- Preserve source/final preimages on conflict and failure. A missing report, failed extraction or failed required check prevents a verified-delivery claim even if some output bytes exist.

### Film And Sound

Adapt the JS renderer's seek capture and offline audio path, not a replacement renderer. Capture opaque frames for H.264; ensure even dimensions. A supplied `SCORE` alone is not permission to add sound. Silent films omit the stream; overlays reject synthesized-audio requests.

Canvas's `templates/score.js` contains only seeded synthesis used by E1. Render it in `OfflineAudioContext` at 48 kHz for the requested duration, mux AAC, and verify the encoded result. No generated music service, supplied track, realistic voice or hosted service is included.

For E1, retain the already-selected cue measurement from the MIT [sync checker][sync-check]. Its existing onset/reference-window details are made explicit here so tests can prove the intended check:

1. Decode the actual encoded audio to mono signed 16-bit samples at 12 kHz. Normalize by 32768 and compute RMS in complete 120-sample (10 ms) hops. Positive onset strength is the increase over the previous hop's RMS.
2. Candidate peaks exceed three times the mean strength in the clipped `[i-50,i+50)` hop neighborhood and `0.002`, and are not below either adjacent hop. Group peaks within 120 ms of a cluster's first peak; keep its strongest peak, keeping the earlier peak on equal strength. Retain peaks at or above the 30th-percentile indexed strength (`floor(0.3*n)`) among peaks within one second.
3. For each declared E1 cue at 4 and 8 seconds, find the nearest retained onset, breaking equal-distance ties toward the earlier onset. Require absolute offset at most 100 ms. Missing onsets or unevaluated declared cues cannot pass.
4. Compute window RMS from the hop energies, using rounded 10 ms endpoints and an added `1e-6` floor. The normal preceding reference starts with the last second. Also compute the four preceding one-second windows; let `loud` be their maximum and `middle` the average of the two middle sorted values. If the last second is more than 10 dB below `loud`, use `loud`; otherwise use the greater of the last second and `middle`. Compare the 300 ms post-cue RMS to this reference using `20*log10(post/reference)` and require a jump no greater than +6 dB.

Record the cue time/source frame, nearest onset, signed offset, reference and post-cue windows/levels, jump, method and evaluated coverage. Clip windows only to available decoded audio and report their actual extent; an empty required window is non-passing. E1's 4 s/8 s cues have the full reference windows. Do not silently filter edge cues or replace a missing onset with the source checker's silence-drop shortcut: E1 explicitly requires percussive onsets.

Pure tests exercise peak grouping without a drifting cluster anchor, nearest-onset selection, inclusive 100 ms/+6 dB boundaries, the deliberate-break reference rule, missing onsets, empty windows and unevaluated cues. Encoded E1 tests exercise both actual cues plus the requested-sound and silent variants. Unit-generated analysis samples prove the calculation, not successful AAC generation or musical quality.

Other creative pieces may choose different timing or no cue checks. An empty cue set reports no synchronization evidence; missing requested sound still fails. No automatic visual-cut detection is used as proof of declared event timing. The E1 heuristic is neither a mandatory musical style nor a hearing-safety certification.

### Alpha And Stinger Checks

The alpha path uses PNG/RGBA capture rather than the film renderer's JPEG path. Encode `libvpx-vp9` with alpha support; when inspecting VP9 alpha, use the explicit libvpx decoding path supported by the tested FFmpeg build. Check actual decoded RGBA, not only `alpha_mode`.

- **Lower third:** First/last alpha planes are all zero. Check raw source hold stability against the first hold frame. Throughout the decoded hold, require nonempty graphic content; across the decoded clip, nonzero-alpha pixels stay in the declared safe rectangle. Empty-all-the-way, an opaque background and out-of-bounds pixels fail. Review decoded stability and text over both light and dark backgrounds; geometric checks cannot prove legibility.
- **Stinger:** First/last alpha planes are all zero. Stream every decoded full-resolution alpha frame and find contiguous fully opaque intervals where every pixel is 255. For an interval with inclusive first frame `a` and exclusive end frame `b`, report `[1000*a/fps, 1000*b/fps)` milliseconds. Validate an explicit transition point inside it; otherwise select an integer-millisecond midpoint inside the first qualifying interval, failing if no representable point exists. E4 must report `[800,1200)` and `1000`.
- A stinger's full cover and edge painting are intentional. Do not apply lower-third "mostly transparent middle," small-area or title-safe rules to it. Conversely, do not relax lower-third rules to accept a stinger.
- Keep any codec-loss artifacts visible in the measurements; do not lower alpha thresholds or crop/downscale the check to make a failing export pass.

### Review Outputs And Advisory Measurements

Produce frame-indexed, timestamped stills/contact sheets covering the full clip, first/last frames, cue/reveal boundaries, entry/exit boundaries and chosen reading holds. For a declared boundary, retain the boundary itself and the valid adjacent frames; never move every sample away from cuts. Combine these with the full-duration sheet interval and all explicitly requested frames. Use decoded output frames for delivery review; label source-capture images as source evidence rather than presenting them as encoded-file inspection. An output limit or extraction failure cannot silently drop later samples.

One export report identifies the source/output revision, environment, expected and actual media properties, measured check coverage, review-image frame/time mapping, and remaining visual/listening/OBS judgment. Use actual source/output digests for revision identity; render binds the source to the combined report. It is an output artifact, not coordinator state. Automation reports `pass`/`fail`/`not evaluated` per applicable check; a required `not evaluated` does not pass the export.

Reviewers cite exact frames or time intervals for actions, framing, continuity, unreadable holds, masking defects, and audible competition or abrupt changes. Listen to the complete E1, not only two cue windows. Preserve these observations through existing review/execution evidence rather than adding a report registry, new reviewer role or revision-round state machine. No two-round auto-pass applies.

Do not add occupancy ratios, overlap scores, whole-track peak/level windows, near-silence thresholds or similarity verdicts in this version. The accepted callers are the existing bounds/hold, cue and alpha checks; the brainstorm's extra measurements have no required acceptance caller. Crowding, pacing, intentional silence and musical effect remain frame/time-specific review advice. They are not additional required checks labeled as skipped, and metadata counts cannot establish creative quality.

## D3: Independent Example Verification

**Covers:** US1-US4; FR-027-FR-030; SC-001-SC-003, SC-006.

The spec owns the acceptance values. The shipped examples and tests use these exact fixtures:

| Example | Source and verification slice |
|---|---|
| E1 film | `canvas/examples/film.html`: visible drop -> stream -> pond, `One drop. One stream.`, seed 123, 360 frames at 1920x1080/30 fps, 4 s and 8 s synthesized cues. Use shot spans 0-119, 120-239 and 240-359. Verify H.264/yuv420p, AAC/48 kHz, video duration within one frame, both onset/jump checks, visible actions and exact caption. Also render the declared silent variant. |
| E2 title | `canvas/examples/vertical-title.html`: `Read. Check. Export.`, reveals 0/80/160, 240 frames at 1080x1920/30 fps, no audio, required boxes inside `[90,990) x [260,1660)`. Check registered boxes across all source frames, raw-frame determinism, wording, boundary stills, held text and phone-size readability. |
| E3 lower third | `overlays/examples/lower-third.html`: `Alex Rivera` / `Host`, repeat with `Alexandra Rivera-Montgomery`, 180 frames at 1920x1080/30 fps, hold 30-149, no audio, empty ends, visible stable hold and nonzero alpha inside `[96,1824) x [720,1026)`. Inspect the decoded file and both background composites, including long-name reading during the hold. |
| E4 stinger | `overlays/examples/stinger.html`: `Frame Studio`, 60 frames at 1920x1080/30 fps, no audio, empty ends and fully covered frames 24-35. Decode every alpha frame and report `[800,1200)` ms / `1000` ms. Composite an old/new scene cut at frame 30, then verify the actual OBS use. |

The shortened `canvas/` and `overlays/` names in this table mean the exact namespaced skill directories in Chosen Structure, not additional directories.

Boundary evidence must include E1 frames 119/120/121 and 239/240/241; E2 frames 0/1, 79/80/81 and 159/160/161; E3 frames 29/30 and 149/150; E4 frames 23/24, 30 and 35/36. Include each example's endpoints, full-duration sheet and authored hold samples as well. Tests assert that the expected samples exist and are correctly labeled; they do not score the story from labels.

`media.test.mjs` must run actual installed-path scripts from a disposable core-plus-animation consumer and evaluate the actual encoded files. It covers E1-E4, repeated/out-of-order raw frame equality, and relevant negative fixtures. Use no image-equality comparison across hosts or encoded-file hash equivalence. Exact source/seed/environment is the determinism boundary.

Required negative cases:

- Invalid timing, noninteger/out-of-range frames, inconsistent duration and odd codec dimensions.
- Missing `playwright-core`, browser, FFmpeg/ffprobe or required codec; rejected readiness; page exception.
- External font/media/script request and embedded media/font asset.
- Missing requested audio, unequal declared/encoded media properties, and an empty cue set incorrectly reported as synchronized.
- Non-alpha output renamed as WebM, empty or unstable lower-third hold, visible/out-of-bounds endpoint pixels.
- Stinger with a hole during full cover, no full cover, or a transition point outside its covered interval, including its exclusive end.
- Existing output/source and mid-render/encode/decode or review-frame extraction failure; pre-existing bytes remain unchanged and no final-success result is returned.
- Missing/mislabeled boundary or late contact-sheet samples; no report may hide those gaps behind a successful wrapper.

Pure unit/process-stub tests prove argument/error handling; real browser/codec fixtures prove media behavior. A test must fail for its intended condition, not merely because every tool is absent. Document tests check the required skill/path/license boundaries; independent review judges the actual guidance and media, not keyword counts or metadata-based creative scores.

### Actual OBS And Visual Acceptance

After automated E4 decoding/compositing succeeds, use the selected OBS build with two contrasting, clearly labeled local test scenes. Add the delivered file as a **Stinger** in Scene Transitions, select **Time (milliseconds)** and enter `1000`. Switch A -> B and B -> A and inspect/record the transition: old scene at the transparent beginning, hidden change at full cover, new scene at the transparent end, no solid background/alpha flicker and no sound. Record OBS version, platform and relevant decoder setting.

Use available host automation for that sequence first. If the environment cannot automate a host-specific observation, return the exact remaining steps/evidence through the existing owner handoff; do not build an OBS automation product or install a plugin just for this pack. No OBS evidence means no OBS-compatibility acceptance.

Have the appropriate visual/audio reviewer inspect each complete example and its sheets/stills for the spec's judgments. E1 must show the three actions and continuity; E2/E3 must allow reading after movement settles. Each finding cites the source/export revision and frames or audio interval. Preserve normal visual approval for each actual example revision. Record observations through existing execution evidence; do not invent a new definition/audit state file or accept unresolved issues after a fixed number of rounds.

## D4: Packaging, Documentation And Verification Commands

**Covers:** FR-001, FR-017-FR-030; SC-004-SC-006.

Author concise skills that call the shared tools; discard upstream agent-install commands, promotional instructions, model mandates and "run through without asking" policies. They are not Dude authority. Use the project's selected art direction without naming/activating a mandatory theme provider.

`references/verification.md` owns setup, tested runtime versions, exact installed-path CLI examples, output/report meanings, numeric input rules, test limits and frame/time-specific visual/audio review instructions. `references/obs.md` distinguishes lower thirds as media overlays from stingers as Scene Transitions. `references/sources.md` carries Appendix A, including the reference-only OpenMontage addition, and the final incorporated-file mapping. Each distributed MIT adaptation retains a reference to the full applicable notice. Do not label reference-only concepts as MIT adaptations.

No fresh research artifact is required in the definition package: this plan carries the material source evidence. No schema/API/checklist suite or ObjectiveRegistry applies; there is no objective-runtime caller.

Follow `library/packs/technical-docs/tests/pack-composition.test.mjs` for disposable consumer construction and source-vs-installed checks, without copying its unrelated ledger/business logic. Use the existing release builder and Compose CLI through argument arrays:

1. Build a pristine core into an OS-temp directory with `scripts/build-release.mjs --out <absolute-temp-root>`; the test verifies pristine lint before adding a pack.
2. Add only `animation` using `src/skills/dude-compose/compose.mjs add animation --root <temp-root> --library <absolute-repo-library/packs> --no-fetch --json`.
3. Verify exact installed membership for Canvas and overlays, including Canvas's score template and all shared scripts/examples/references/notices. Assert no standalone soundtrack skill or dangling reference and no shipped `tests/`. Validate discovery metadata with the existing pack-manifest parser and `compose list --use-case animation --json`; `compose verify` alone does not validate that metadata.
4. Refresh through `compose refresh animation` with the same explicit root/library and no-fetch. Check the expected two-skill projection, helper references and preserved unrelated fixture content.
5. Run installed tools from a working directory containing spaces. Real media runs use separately provisioned dependencies, not a dependency copied into the pack. Assert runtime references stay within the installed pack apart from those declared dependencies.
6. Remove through `compose remove animation --root <temp-root> --json`; check profile removal, unchanged non-pack bytes and zero namespaced leftovers. These disposable lifecycle tests grant no removal authority over this workspace.

During authorized implementation, T001 must pass the existing catalog exact-membership test with this focused run; the assertion remains unchanged:

```text
node --test --test-name-pattern="maintained catalog manifests declare the required discovery use-cases" src/skills/dude-engine/lib/pack-manifest.test.mjs
```

The new commands below name **planned test files**. All are future execution by the authorized owner, not commands executed during definition:

```text
node --test library/packs/animation/tests/pack-contract.test.mjs library/packs/animation/tests/tools.test.mjs library/packs/animation/tests/composition.test.mjs
node --test --test-concurrency=1 library/packs/animation/tests/media.test.mjs
node --test src/skills/dude-compose/compose.test.mjs src/skills/dude-engine/lib/pack-manifest.test.mjs
node .github/skills/dude-compose/compose.mjs verify --no-fetch --json
node .github/skills/dude-lint/lint.mjs .
```

The media test accepts `DUDE_ANIMATION_BROWSER` as a test-only absolute executable path and passes it to the CLI. Its prerequisite check fails, rather than skips, when browser/library/codec dependencies are absent. Record exact versions before acceptance. Run it separately and serially so normal lightweight tests cannot hide skipped media coverage; zero tests or any required skip is insufficient evidence. A focused name-filter run proves only that named slice; final acceptance requires the complete suite above plus visual/listening and OBS evidence.

No bare `node --test` discovery claim, generated-core rebuild, pack install into this working repository, Git command or new global test runner is needed for this change.

## Guardrail Check And Complexity

- Existing deterministic-tool, source-ownership and minimal-design guardrails cover this work; no new memory rules are proposed.
- Keep pack source in `library/packs/animation/`, authoring tests outside shipped skills, and installed projections under Compose ownership.
- Two skills divide filmmaking (including requested sound) from overlays. One shared implementation removes repeated capture/check procedures while keeping the two export families' acceptance conditions distinct.
- Keep Manim, WebGL/Three.js, Remotion, After Effects, GSAP and alternate runtimes deferred. Use a native renderer for any later selected math feature; add no unused adapter.
- OpenMontage informs independently authored craft and review guidance only. Do not copy/derivatively port its AGPL material or introduce its directors, orchestration, registry, checkpoints, Backlot UI, reference-video analysis or runtime selector.
- Same-environment repeatability, file inspection and real OBS acceptance are distinct claims. No independent review, runtime enforcement, visual approval or successful execution is inferred from source reading.
- The accepted code-only boundary avoids new credential/billing and imported-asset workflows. Tool/font/codec licenses still need accurate setup documentation; no repository MIT grant covers unrelated binaries.

## Phases And Traceability

| Phase / task | Defined obligation | Independent check |
|---|---|---|
| Setup — T001 | FR-001, FR-020, FR-022-FR-028; licensed two-skill foundation and provenance; add only the approved catalog-fixture row | Manifest/source/notice contract tests, exact two-skill membership, focused catalog exact-membership check with its assertion unchanged, retained 17-source/article history and OpenMontage boundary |
| Foundational — T002 | FR-002-FR-005, FR-018-FR-019, FR-026; D1/D2 scaffold and input rules | Literal text, numeric/timing, output-conflict and unsupported-kind tests |
| Foundational — T003 | FR-003, FR-005, FR-008, FR-014-FR-015, FR-017-FR-019, FR-026, FR-030; D2 browser/capture checks | Required capture, ordered/repeated frames, asset/readiness/error, full-sheet and frame-label coverage tests |
| US1 — T004 | FR-002, FR-006-FR-009, FR-016-FR-020, FR-027-FR-030; D1/D2 film/sound; E1 | Actual MP4/audio plus silent variant, exact cue method/failures, visible water actions and revision-specific listening/visual review |
| US2 — T005 | FR-002, FR-004, FR-008-FR-009, FR-014-FR-015, FR-020, FR-027, FR-030; E2 | Exact vertical text, all-frame declared bounds, repeatability, reveal/hold evidence and phone-size review |
| US3 — T006 | FR-006-FR-012, FR-014-FR-015, FR-018-FR-021; D2 alpha; E3 | Actual silent alpha WebM, safe/visible stable hold, long text and light/dark composites |
| US4 — T007 | FR-010, FR-012-FR-014, FR-017-FR-021; D2 alpha; E4 | All decoded alpha frames, interval/point validation, composite scene switch |
| Polish — T008 | FR-001, FR-020-FR-030; D4 installation/docs | Core-only add/refresh/remove, installed-path coverage, portable two-skill membership and catalog/notice checks |
| Acceptance — T009 | SC-001-SC-006, FR-030; D3/D4 | Complete mandatory tests, frame/time-specific visual/listening/OBS evidence and coordinator lint |

The dependency graph is unchanged. The coordinator preserves T001's existing in-progress state and the other eight open states only after verifying the one-to-one durable-key mappings. No task has completed acceptance. Known remaining risks are observed runtime/codec behavior, platform-font rendering, actual creative results and OBS alpha playback; these are future acceptance work, not unresolved product choices.

## Appendix A: Reviewed Sources And Dispositions

This inventory is enduring research evidence, not an instruction to fetch, install or execute source. The original review read all 17 READMEs, the full skill indexes and all 16 available root licenses; selected relevant skills/scripts/templates/references were inspected. No runtime fitness is inferred. Repository links are the original URLs; linked README/license files are pinned to the exact reviewed commit in their row.

| Source / reviewed commit | Capability and overlap | License / dependencies | First-version disposition |
|---|---|---|---|
| [javascript-animation-skills](https://github.com/iart-ai/javascript-animation-skills) · `f7d0882a313249cbd43f0e4e9e209b1622870253` · [README][js-r] | Canvas films, shot/event timing, offline audio, render/audit/layout/sync helpers; shares frame contract with lower-thirds | [MIT][js-l]; Node/Playwright/browser/FFmpeg; no API key for synthesized sound | Adapt the used renderer/check/template pieces and small seeded score within Canvas; not the entire drawing/instrument catalog |
| [webgl-animation-skills](https://github.com/iart-ai/webgl-animation-skills) · `50697d659fbf70152f48f9f8aadf1efe78bbdde1` · [README][gl-r] | Three.js, shaders, particles and real-time GPU scenes; repeats the three shell helpers | [MIT][gl-l]; GPU/browser/Three.js, some React Three Fiber and separately licensed models/textures | Defer backend/skills; consolidate common helper behavior once; do not claim stateful loops are deterministic captures |
| [web-animation-skills](https://github.com/iart-ai/web-animation-skills) · `b6dba3eb759726845a44163ff0bad70dd9e7fbb6` · [README][web-r] | GSAP, performance/accessibility, page transitions, micro-interactions, glass effects, SVG/Lottie/ASCII; overlaps reveals, not export behavior | [MIT][web-l]; recipe-specific GSAP/Lenis/React/Next.js/Motion/Lottie terms remain separate | Reference/defer interactive web and these engines; consolidate helper copies only |
| [manim-skills](https://github.com/iart-ai/manim-skills) · `a15833c44de5108a3ee68f178a1fca126aa7c6d8` · [README][manim-r] | Native Scenes/Mobjects, equations/graphs, updaters and cameras; math typesetting is distinct | [MIT][manim-l]; source says Python 3.9+, Manim CE/FFmpeg, LaTeX for Tex/MathTex and Pango-backed Text; verify engine versions/terms if selected later | Defer but preserve native CLI approach; no JavaScript replacement or unused adapter |
| [generative-illustration-skills](https://github.com/iart-ai/generative-illustration-skills) · `e7d62437c875fc8ad5eff6e90fe0e25b30e43933` · [README][gen-r] | Generated vectors/textures/sprites, background stripping and music; capture concept overlaps, generation inputs differ | No root LICENSE or reuse grant found in README/skill/three references; OpenRouter credentials for Recraft/Gemini/Lyria, optional Replicate/Google credentials, charges and separate output terms | Reference only; no copied code/prose/assets without a reuse grant. Do not adopt the source's "AI-generated means royalty-free" claim |
| [motion-design-skills](https://github.com/iart-ai/motion-design-skills) · `3c129f769d90a1328c209c386492333c9ac62312` · [README][motion-r] | Timing/easing, color/composition/art direction, beats, logos/backgrounds, AE/Remotion; repeated craft | [MIT][motion-l]; fundamentals need no engine; AE/Remotion and assets have their own terms | Combine selected concise craft guidance in Canvas/overlays; defer engine integrations/background libraries. A logo sting does not establish OBS coverage |
| [kinetic-typography-skills](https://github.com/iart-ai/kinetic-typography-skills) · `fccc94bd325d824235ee9e715e65abde57b6513a` · [README][type-r] | Text reveals/masks/staggers/variable type; overlaps titles/captions/wordmarks | [MIT][type-l]; CSS/GSAP/Motion/Remotion/AE recipes and separately licensed fonts | Adapt reveal/legibility guidance to Canvas and overlay holds; defer extra engines/variable fonts |
| [lower-thirds-skills](https://github.com/iart-ai/lower-thirds-skills) · `aa8ef7ed9fa59d0a79fc57701e493cfd8197b5d8` · [README][lt-r] | Concrete Canvas alpha renderer and in/hold/out checks; overlaps TikTok lower thirds | [MIT][lt-l]; Node/Playwright/browser/FFmpeg; starter requests Google Fonts, optional ProRes and macOS HEVC | Adapt PNG/VP9 capture and scoped checks, remove network fonts and Browser Source controls. Defer ProRes/HEVC/chroma key/batching; create local stinger adaptation |
| [map-animation-skills](https://github.com/iart-ai/map-animation-skills) · `390ca98bbcf2ea88a430a69c0dcbf423e43d075d` · [README][map-r] | Routes/pins/projections/cameras; overlaps diagram timing but requires geographic correctness | [MIT][map-l]; Earth Studio/AE or GeoJSON/D3/Remotion; map data/imagery attribution and service terms separate | Reference/defer map import, services and projection engine |
| [data-animation-skills](https://github.com/iart-ai/data-animation-skills) · `8ce2709c3992490251e8a991535b1945f01c6865` · [README][data-r] | Charts, infographics and presentations; shared counters but independent data/batch semantics | [MIT][data-l]; Remotion/React, optional D3, CSV/JSON and narration inputs | Reference/defer data ingestion/chart products/batching; simple film numbers do not imply general chart support |
| [explainer-video-skills](https://github.com/iart-ai/explainer-video-skills) · `3e2d411b725d9a72939cf8e5eb81579e751373e7` · [README][explain-r] | Scripts/storyboards, narration/captions, diagrams/whiteboard/isometric/recaps | [MIT][explain-l]; Remotion/AE, some GSAP recipes and supplied/generated narration | Adapt concise story planning within Canvas; defer voice/caption alignment, specialized renderers and recap batching |
| [tiktok-video-skills](https://github.com/iart-ai/tiktok-video-skills) · `2a775336b5a638cbf8a61dbd785f9a1b649be016` · [README][short-r] | Vertical pacing/captions/countdowns/lower thirds; repeated overlay/helper purpose | [MIT][short-l]; Remotion/React and timed transcript/audio; changing platform constraints | Combine limited vertical-composition guidance in Canvas; use dedicated lower-thirds implementation. Defer transcript/countdown/platform workflows; no retention promises |
| [youtube-video-skills](https://github.com/iart-ai/youtube-video-skills) · `f3df381d65abe5078f5ed410bbc3ed72e7cb92bd` · [README][yt-r] | Intro/outro and audiograms; intro craft overlaps, waveform/caption analysis is separate | [MIT][yt-l]; Remotion/media utilities, audio/cover art, transcripts or Whisper; independent rights | Reference/defer audiograms, transcription, platform end-screen guarantees and publishing |
| [text-message-video-skills](https://github.com/iart-ai/text-message-video-skills) · `3a800e1e9b9635fa196a07b0143c80f7e9648558` · [README][chat-r] | Scripted bubbles, typing, receipts/scrolling and timed pops; separate conversation input | [MIT][chat-l]; React/Remotion, data/audio, app marks and conversation rights | Defer chat schema, app replica and CSV batching |
| [ad-video-skills](https://github.com/iart-ai/ad-video-skills) · `0de0f2a1c1f42a98103fc0ec436509276428372c` · [README][ad-r] | Ad variants, launches/testimonials; repeated scene/export mechanics with new campaign semantics | [MIT][ad-l]; Remotion/React, CSV/props, brand/review assets and claim/usage rights | Reference/defer A/B matrices, campaign/testimonial products and performance claims |
| [ecommerce-video-skills](https://github.com/iart-ai/ecommerce-video-skills) · `2bd0dd19c9b2df5230f5d8f7453861b9681e49b4` · [README][shop-r] | Screenshot demos, promos/slideshows; shared timing but new image/price inputs | [MIT][shop-l]; Remotion, capture/encoding tools, screenshots/photos/prices/music with separate rights | Reference/defer asset capture/import, pricing feeds, slideshows and batching |
| [freelance-motion-skills](https://github.com/iart-ai/freelance-motion-skills) · `d85c2b484693d0387333c778d9c95230fa1856ce` · [README][freelance-r] | Briefs, pricing, revisions, delivery specs and brand-motion guidance; QC overlaps all exports | [MIT][freelance-l]; client/budget/rights facts, chosen encoder; static platform tables are not current certification | Adapt applicable delivery/QC guidance only; exclude business/contracts/pricing and new brand-system workflow |

### Articles

- [JavaScript animation](https://www.iart.ai/blog/ai-javascript-animation), Zhangcan Ding, Growth Marketing at iArt.ai. Preserve its source date: **Updated October 3, 2026**. Relevant facts: time-driven Canvas frames, seeded drawing, shared shot/event timeline, offline Web Audio and contact-sheet review. Original linked [skill directory](https://github.com/iart-ai/javascript-animation-skills/tree/main/skills). Raw HTML SHA-256: `c5c91438b01a922535005e6529b3cea19d8fc1f160ab98277bc47b17773fefaa`.
- [OBS stinger transitions](https://www.iart.ai/blog/how-to-add-a-stinger-transition-in-obs), same author/attribution; **Updated October 3, 2026**. Relevant facts: transparent beginning/end, a fully covered interval and a Time-in-milliseconds transition point inside it; VP8/VP9 alpha WebM is its usual format. The reviewed concrete alpha renderer supplies the VP9 choice. Raw HTML SHA-256: `61c8eb503a40555973ed1c1c09d7df867ab2d5e5f6ae2dd6a183e892dedf853f`.

Articles are attributed factual references, not reuse grants or proof of local compatibility. Hosted iArt export requires a paid plan; it is not part of this local implementation. The selected H.264 profile is opaque; do not generalize that constraint into a claim about every possible MP4 encoding. Track-matte transitions remain deferred.

### Reuse Map And Concrete Findings

The relative destinations below are under `library/packs/animation/skills/`.

| Pinned upstream material | Proposed destination / adaptation |
|---|---|
| [JS animation skill][js-skill] and [starter][js-starter] | `dude-pack-animation-canvas/SKILL.md` and `dude-pack-animation-canvas/templates/film.html`; retain used drawing/seed/frame/claim mechanics, remove promotional/autonomous routing instructions and unused style primitives |
| [JS renderer][js-render] | Shared `canvas/scripts/render.mjs` and used `lib/common.mjs` functions; Windows-safe URLs, exact failure reporting, checked final output; no JPEG alpha path |
| [Asset audit][asset-audit] and [layout check][layout-check] | Shared `canvas/scripts/check.mjs`; required live check cannot be skipped as clean; report declared/checked geometry limits |
| [Soundtrack skill][score-skill], [score.js][score-template], [groove.js][groove-template], [sync check][sync-check] | Canvas's `SKILL.md` sound section, `dude-pack-animation-canvas/templates/score.js`, and shared `canvas/scripts/{render,inspect}.mjs`; only used seeded synthesis, explicit requested audio, declared cue coverage and honest heuristic limits; no standalone soundtrack skill |
| [Lower-thirds skill][lt-skill], [template][lt-template], [renderer][lt-render], [delivery][lt-delivery] | `dude-pack-animation-overlays/` plus shared render/check/inspect; PNG alpha capture, no network font, silent WebM only, separate lower-third/stinger checks |
| [Motion principles][principles], [logo guidance][logo], [kinetic type][type-skill], [explainer planning][explain-skill], [short form][short-skill], [delivery/QC][delivery-skill] | Short relevant guidance in Canvas/overlays and verification/OBS references; no extra engines, speculative skills, platform/retention guarantees or mandatory visual style |
| [contact-sheet.sh][shared-sheet], [probe-mp4.sh][shared-probe], [seek-shot.sh][shared-seek] | One shared Node capture/sheet/probe behavior, not shell-script copies; no fixed screenshot wait or implicit Playwright download |

Here `canvas/scripts/` abbreviates `dude-pack-animation-canvas/scripts/`; it is not another destination. Final provenance must list the actual incorporated files/portions and changes, not claim wholesale import of a source merely because it was considered.

Deterministic acquisition found identical helper blobs in 14 sources, all except JS animation, lower-thirds and generative illustration:

- `contact-sheet.sh`: `d0032c4d920b8e3369898bb754f96c8ed8afe0d9`.
- `probe-mp4.sh`: `5e9d0b3ea4ed5cf8d3471ea2f9c6159276a09273`.
- `seek-shot.sh`: `2020ad13d269aa5b41708ee02d7eabc40b9c3a2d`.

The probe currently asserts dimensions/rate, warns about codec, and does not enforce all declared duration/frame/audio properties. The JS renderer's JPEG capture discards alpha. The lower-third renderer preserves PNG alpha but its check rejects near-full coverage, and its decoded middle-frame check expects at least half transparent pixels: that is unsuitable for stinger full cover. The source asset audit catches browser failure then can still print `CLEAN`; renderer page errors can be warnings. Source layout checks depend on declared boxes and samples. The sync checker can evaluate no cues and excludes some edge events. D2 preserves the relevant onset/reference calculations but rejects skipped-cue success and the silence-drop substitute for E1's required percussive onsets.

The native [Manim skill][manim-skill] uses Python Scene subclasses and its own CLI, including frame-first verification and LaTeX equation handling. Preserve that approach if a later math feature is selected. The [Remotion skill][remotion] describes a distinct React composition backend; it is not needed for this accepted Canvas scope.

The unlicensed generative source's [skill][gen-skill], [asset pipeline][gen-assets], [render harness][gen-render] and [craft][gen-craft] contain no additional reuse grant. Their generated-music rights assertions and contradictory background-removal recipes are not adopted.

### OpenMontage: Reference-Only Addition

Original repository: [OpenMontage](https://github.com/calesthio/OpenMontage); requested [skills subtree](https://github.com/calesthio/OpenMontage/tree/main/skills). Reviewed commit: `9327439db69021ab4b0e2776729bf3b58fdb5a87` (`2026-10-03T16:28:55Z`), with the [pinned subtree](https://github.com/calesthio/OpenMontage/tree/9327439db69021ab4b0e2776729bf3b58fdb5a87/skills).

The completed brainstorm's acquisition inventory reports 2,143 files, 157 under `skills/`. Coverage was selected creative/meta/animation guidance (including bounded excerpts), seven Python helpers, the render-report schema, README/index/license/dependencies, and reference-analysis excerpts. This was neither exhaustive skill review nor runtime evaluation; this re-definition reuses that evidence.

The root [LICENSE][om-license] is AGPL v3 (GitHub: AGPL-3.0); the complete supplied inventory reported no nested `skills/` license. Vendored licenses elsewhere do not license this subtree. OpenMontage stays reference-only: no copied code/prose/assets, derivative Node ports, runtime dependency or implied MIT relicensing. Any later proposal to incorporate it requires a separate license/permission decision outside this definition.

| Reviewed concepts | Definition disposition |
|---|---|
| [Creative intake][om-intake], [taste direction][om-taste] | Independently author D1 purpose/audience-led guidance. No taste dials, mandatory look, style schema or new approval stage. |
| [Storytelling][om-story], [scene direction][om-scene], [bespoke composition][om-bespoke], [animation guidance][om-motion] | Use observable action, framing, continuity and readable holds as review questions. Reject compulsory novelty and blanket palette/easing prescriptions. E1 must depict water actions, not alternate caption cards. |
| [Script direction][om-script], [typography][om-type], [sound design][om-sound] | Consolidate optional sound with Canvas filmmaking and coordinate it with visual beats and reading. Tables of pace, density or loudness are context, not universal thresholds. Overlays stay silent. |
| [Visual QA][om-qa] and [reviewer][om-reviewer] | Use frame/time-specific findings in the existing review path. Keep additional occupancy/audio-window measurements advisory; reject creative auto-verdicts and the two-round auto-pass. |
| [Reference-video analysis][om-reference] and [runtime selector][om-runtime] | Defer downloaded media, external analysis workflows and alternate runtimes. Do not import directors, orchestration, checkpoints, registry, Backlot, hosted generation/narration or an updater. |

The inspected implementations establish narrower facts than their descriptions sometimes imply. The [composition validator][om-validator] checks positive cut spans, selected asset paths and audio duration, but not inter-cut gaps/overlaps or `images[]`. The [audio probe][om-probe] genuinely wraps ffprobe; [media profiles][om-profiles] are static presets, not platform certification. [Pacing][om-pacing] models TerminalScene steps and nearest cue times, not arbitrary animation. [Slideshow risk][om-risk] scores metadata presence/type ratios, not rendered motion.

The [frame sampler][om-frames] offsets scene starts by 0.1 seconds and caps coverage. [Visual QA][om-qa]'s advertised occlusion/transition-similarity checks are absent; wrapper success can coexist with extraction failures or validation issues. The [render schema][om-report] proves report shape, not inspection. Preserve D2-D3's exact boundary frames, complete sample coverage, full-resolution alpha and honest failure behavior instead of copying those gaps. Density, near-silence or similarity observations do not prove quality.

### Notices And Refresh

All 16 available iArt root licenses are MIT, copyright `2026 iart.ai`. Preserve the complete copyright/permission/warranty notice with every distributed substantial MIT adaptation, using the shared shipped notice and attribution links. Check for any file-specific or third-party notices before incorporation; if inconsistent with reuse, stop that incorporation rather than silently substitute unlicensed material. This notice does not cover OpenMontage or the unlicensed generative source.

The sources ledger maps repository/revision/file to local file, applicable license and significant adaptation. Preserve its distinction between planned and incorporated material. The existing ledger records the MIT notice from [the JS root license][js-l] (Git blob `a61b911146037f2ef312f67e9b45de6c99b7f870`, 1064 bytes); do not turn that recorded notice copy or skeleton files into an implemented-media claim.

Do not copy source showcases, third-party fonts, brand assets or stock/media. Repository MIT is not a license for Playwright, the browser, FFmpeg build/codecs, Manim, Remotion, AE, data, fonts or hosted service outputs. Record their actual separately provisioned terms where relevant; do not promise redistribution rights for binaries the pack does not ship.

Future comparison uses these pinned links. Installation and refresh use existing Compose; no synchronization service, background fetch, upstream change registry or automatic merge is added.

## Pinned References

[js-r]: https://github.com/iart-ai/javascript-animation-skills/blob/f7d0882a313249cbd43f0e4e9e209b1622870253/README.md
[js-l]: https://github.com/iart-ai/javascript-animation-skills/blob/f7d0882a313249cbd43f0e4e9e209b1622870253/LICENSE
[js-skill]: https://github.com/iart-ai/javascript-animation-skills/blob/f7d0882a313249cbd43f0e4e9e209b1622870253/skills/javascript-animation/SKILL.md
[js-starter]: https://github.com/iart-ai/javascript-animation-skills/blob/f7d0882a313249cbd43f0e4e9e209b1622870253/skills/javascript-animation/templates/starter.html
[js-render]: https://github.com/iart-ai/javascript-animation-skills/blob/f7d0882a313249cbd43f0e4e9e209b1622870253/skills/javascript-animation/scripts/render.mjs
[asset-audit]: https://github.com/iart-ai/javascript-animation-skills/blob/f7d0882a313249cbd43f0e4e9e209b1622870253/skills/javascript-animation/scripts/asset-audit.mjs
[layout-check]: https://github.com/iart-ai/javascript-animation-skills/blob/f7d0882a313249cbd43f0e4e9e209b1622870253/skills/javascript-animation/scripts/layout-check.mjs
[score-skill]: https://github.com/iart-ai/javascript-animation-skills/blob/f7d0882a313249cbd43f0e4e9e209b1622870253/skills/soundtrack/SKILL.md
[score-template]: https://github.com/iart-ai/javascript-animation-skills/blob/f7d0882a313249cbd43f0e4e9e209b1622870253/skills/soundtrack/templates/score.js
[groove-template]: https://github.com/iart-ai/javascript-animation-skills/blob/f7d0882a313249cbd43f0e4e9e209b1622870253/skills/soundtrack/templates/groove.js
[sync-check]: https://github.com/iart-ai/javascript-animation-skills/blob/f7d0882a313249cbd43f0e4e9e209b1622870253/skills/soundtrack/scripts/sync-check.mjs
[gl-r]: https://github.com/iart-ai/webgl-animation-skills/blob/50697d659fbf70152f48f9f8aadf1efe78bbdde1/README.md
[gl-l]: https://github.com/iart-ai/webgl-animation-skills/blob/50697d659fbf70152f48f9f8aadf1efe78bbdde1/LICENSE
[shared-sheet]: https://github.com/iart-ai/webgl-animation-skills/blob/50697d659fbf70152f48f9f8aadf1efe78bbdde1/scripts/contact-sheet.sh
[shared-probe]: https://github.com/iart-ai/webgl-animation-skills/blob/50697d659fbf70152f48f9f8aadf1efe78bbdde1/scripts/probe-mp4.sh
[shared-seek]: https://github.com/iart-ai/webgl-animation-skills/blob/50697d659fbf70152f48f9f8aadf1efe78bbdde1/scripts/seek-shot.sh
[web-r]: https://github.com/iart-ai/web-animation-skills/blob/b6dba3eb759726845a44163ff0bad70dd9e7fbb6/README.md
[web-l]: https://github.com/iart-ai/web-animation-skills/blob/b6dba3eb759726845a44163ff0bad70dd9e7fbb6/LICENSE
[manim-r]: https://github.com/iart-ai/manim-skills/blob/a15833c44de5108a3ee68f178a1fca126aa7c6d8/README.md
[manim-l]: https://github.com/iart-ai/manim-skills/blob/a15833c44de5108a3ee68f178a1fca126aa7c6d8/LICENSE
[manim-skill]: https://github.com/iart-ai/manim-skills/blob/a15833c44de5108a3ee68f178a1fca126aa7c6d8/skills/manim/SKILL.md
[gen-r]: https://github.com/iart-ai/generative-illustration-skills/blob/e7d62437c875fc8ad5eff6e90fe0e25b30e43933/README.md
[gen-skill]: https://github.com/iart-ai/generative-illustration-skills/blob/e7d62437c875fc8ad5eff6e90fe0e25b30e43933/skills/generative-illustration/SKILL.md
[gen-assets]: https://github.com/iart-ai/generative-illustration-skills/blob/e7d62437c875fc8ad5eff6e90fe0e25b30e43933/skills/generative-illustration/references/asset-pipeline.md
[gen-render]: https://github.com/iart-ai/generative-illustration-skills/blob/e7d62437c875fc8ad5eff6e90fe0e25b30e43933/skills/generative-illustration/references/render-harness.md
[gen-craft]: https://github.com/iart-ai/generative-illustration-skills/blob/e7d62437c875fc8ad5eff6e90fe0e25b30e43933/skills/generative-illustration/references/craft.md
[motion-r]: https://github.com/iart-ai/motion-design-skills/blob/3c129f769d90a1328c209c386492333c9ac62312/README.md
[motion-l]: https://github.com/iart-ai/motion-design-skills/blob/3c129f769d90a1328c209c386492333c9ac62312/LICENSE
[principles]: https://github.com/iart-ai/motion-design-skills/blob/3c129f769d90a1328c209c386492333c9ac62312/skills/animation-principles/SKILL.md
[logo]: https://github.com/iart-ai/motion-design-skills/blob/3c129f769d90a1328c209c386492333c9ac62312/skills/logo-animation/SKILL.md
[remotion]: https://github.com/iart-ai/motion-design-skills/blob/3c129f769d90a1328c209c386492333c9ac62312/skills/remotion-video/SKILL.md
[type-r]: https://github.com/iart-ai/kinetic-typography-skills/blob/fccc94bd325d824235ee9e715e65abde57b6513a/README.md
[type-l]: https://github.com/iart-ai/kinetic-typography-skills/blob/fccc94bd325d824235ee9e715e65abde57b6513a/LICENSE
[type-skill]: https://github.com/iart-ai/kinetic-typography-skills/blob/fccc94bd325d824235ee9e715e65abde57b6513a/skills/kinetic-typography/SKILL.md
[lt-r]: https://github.com/iart-ai/lower-thirds-skills/blob/aa8ef7ed9fa59d0a79fc57701e493cfd8197b5d8/README.md
[lt-l]: https://github.com/iart-ai/lower-thirds-skills/blob/aa8ef7ed9fa59d0a79fc57701e493cfd8197b5d8/LICENSE
[lt-skill]: https://github.com/iart-ai/lower-thirds-skills/blob/aa8ef7ed9fa59d0a79fc57701e493cfd8197b5d8/skills/lower-thirds/SKILL.md
[lt-template]: https://github.com/iart-ai/lower-thirds-skills/blob/aa8ef7ed9fa59d0a79fc57701e493cfd8197b5d8/skills/lower-thirds/templates/lower-third.html
[lt-render]: https://github.com/iart-ai/lower-thirds-skills/blob/aa8ef7ed9fa59d0a79fc57701e493cfd8197b5d8/skills/lower-thirds/scripts/render.mjs
[lt-delivery]: https://github.com/iart-ai/lower-thirds-skills/blob/aa8ef7ed9fa59d0a79fc57701e493cfd8197b5d8/skills/lower-thirds/references/delivery.md
[map-r]: https://github.com/iart-ai/map-animation-skills/blob/390ca98bbcf2ea88a430a69c0dcbf423e43d075d/README.md
[map-l]: https://github.com/iart-ai/map-animation-skills/blob/390ca98bbcf2ea88a430a69c0dcbf423e43d075d/LICENSE
[data-r]: https://github.com/iart-ai/data-animation-skills/blob/8ce2709c3992490251e8a991535b1945f01c6865/README.md
[data-l]: https://github.com/iart-ai/data-animation-skills/blob/8ce2709c3992490251e8a991535b1945f01c6865/LICENSE
[explain-r]: https://github.com/iart-ai/explainer-video-skills/blob/3e2d411b725d9a72939cf8e5eb81579e751373e7/README.md
[explain-l]: https://github.com/iart-ai/explainer-video-skills/blob/3e2d411b725d9a72939cf8e5eb81579e751373e7/LICENSE
[explain-skill]: https://github.com/iart-ai/explainer-video-skills/blob/3e2d411b725d9a72939cf8e5eb81579e751373e7/skills/explainer-video/SKILL.md
[short-r]: https://github.com/iart-ai/tiktok-video-skills/blob/2a775336b5a638cbf8a61dbd785f9a1b649be016/README.md
[short-l]: https://github.com/iart-ai/tiktok-video-skills/blob/2a775336b5a638cbf8a61dbd785f9a1b649be016/LICENSE
[short-skill]: https://github.com/iart-ai/tiktok-video-skills/blob/2a775336b5a638cbf8a61dbd785f9a1b649be016/skills/short-form-video/SKILL.md
[yt-r]: https://github.com/iart-ai/youtube-video-skills/blob/f3df381d65abe5078f5ed410bbc3ed72e7cb92bd/README.md
[yt-l]: https://github.com/iart-ai/youtube-video-skills/blob/f3df381d65abe5078f5ed410bbc3ed72e7cb92bd/LICENSE
[chat-r]: https://github.com/iart-ai/text-message-video-skills/blob/3a800e1e9b9635fa196a07b0143c80f7e9648558/README.md
[chat-l]: https://github.com/iart-ai/text-message-video-skills/blob/3a800e1e9b9635fa196a07b0143c80f7e9648558/LICENSE
[ad-r]: https://github.com/iart-ai/ad-video-skills/blob/0de0f2a1c1f42a98103fc0ec436509276428372c/README.md
[ad-l]: https://github.com/iart-ai/ad-video-skills/blob/0de0f2a1c1f42a98103fc0ec436509276428372c/LICENSE
[shop-r]: https://github.com/iart-ai/ecommerce-video-skills/blob/2bd0dd19c9b2df5230f5d8f7453861b9681e49b4/README.md
[shop-l]: https://github.com/iart-ai/ecommerce-video-skills/blob/2bd0dd19c9b2df5230f5d8f7453861b9681e49b4/LICENSE
[freelance-r]: https://github.com/iart-ai/freelance-motion-skills/blob/d85c2b484693d0387333c778d9c95230fa1856ce/README.md
[freelance-l]: https://github.com/iart-ai/freelance-motion-skills/blob/d85c2b484693d0387333c778d9c95230fa1856ce/LICENSE
[delivery-skill]: https://github.com/iart-ai/freelance-motion-skills/blob/d85c2b484693d0387333c778d9c95230fa1856ce/skills/video-delivery-specs/SKILL.md
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
