---
title: Dude Development Base Release
slug: dude-development-base-release
status: defined
spec_path: .dude/specs/075-dude-development-base-release/spec.md
---

# Idea: Dude Development Base Release

## Idea

> The Dude version shown as `Development (main)` doesn't say anything like `v1.1.2`. Will this apply to users' installed versions, or is it because this is the development branch?
>
> It should probably say the latest official version that Dude refreshed from, or something like that, wouldn't you agree? Fold it into a new idea describing the problem and pointing out that Dude already stores metadata under the `.dude/metadata` directory.

## Open Questions

1. Should base-release recording cover `main` refreshes through `@dude upgrade`, this source repository's own development build, or both?
   Answer:
2. When the base release cannot be determined, such as when no release tag is reachable, should About keep `Development (main)` alone or also say that the base release is unknown?
   Answer:

## Assumptions

No additional user assumptions supplied.

<!-- dude:managed:start -->
## Scope And Proposals

The definition covers the source repository's development build and confirmed `main` core refreshes through `@dude upgrade`. About will supplement its existing Dude version value with a recorded stable base release when one is known. Release installs already identify their tag and keep their current display.

The definition owner resolved the two questions under explicit Ship: cover both existing development paths, and retain `Development (main)` alone when no usable base is known. The spec records the evidence and rationale. These remain owner decisions, not new user answers; the answer slots above remain unchanged.

The plan uses one optional `.dude/metadata/development-base-release.md` record. The source build produces it from the source repository's own release evidence, and the updated upgrade engine carries it from the selected bundle through its existing reviewed plan and apply. Keep the bundle manifest's closed shape unchanged so an older upgrade engine can still read upstream metadata. Missing optional provenance leaves the current About behavior usable.

Approved direction: Development Base Release About. The known-base value is `Development (main), based on v1.3.0`, using the source evidence already captured in this ledger. It is recorded provenance, not installed-file verification or the newest currently available release. About still makes no external contact, runs no command, and writes nothing. Do not inspect consumer-project tags, add update checks or upgrade controls, or repurpose the Compose profile or upgrade history.

Definition package: `.dude/specs/075-dude-development-base-release/spec.md`, with the existing technical design and two new sequential implementation units in `tasks.md`: T001@d8c3a59e records provenance through build and upgrade; T002@72f6b104 consumes it in About and verifies the installed read path. Both are proposed open units with no inherited completion evidence.

Design is `approved` through the user's exact direct-chat reply `approve the 075 design`. The spec Revision Log binds it to the unchanged viewed mock at `.dude/specs/075-dude-development-base-release/design/about.html` and the reviewed specification. The timed-out Canvas preview request produced no receipt, response, or acknowledgment; approval is direct chat. Preserve the mock, its 23 captures, and all feature 074 artifacts and approval. Production implementation and acceptance still follow the existing execution lane; no additional supporting artifacts are needed.

## Related References

Continuity references, not dependencies or priority:

- `.dude/ideas/074-dude-canvas-about.md`
- `.dude/specs/074-dude-canvas-about/design/about.html`
- `.dude/ideas/072-dude-canvas-bundle-upgrade.md`
- `.dude/metadata/bundle-manifest.md`
- `.dude/metadata/upgrade-log.md`
- `.dude/metadata/profile.md`
- `scripts/build-dev.mjs`
- `scripts/build-release.mjs`
- `src/skills/dude-bundle-upgrade/upgrade.mjs`
- `src/extensions/dude/lib/about.mjs`
<!-- dude:managed:end -->

## Coordinator Log

- 2026-09-26T13:37:19Z - brainstorm: Staged the development base-release idea for first-capture publication; recording and display remain proposals, and the scope and fallback questions are non-blocking for capture. No package, tasks, implementation, or feature 074 changes.
- 2026-09-26T18:25:49Z - define: Staged first definition at .dude/specs/075-dude-development-base-release/spec.md with spec, plan, and header-only tasks; design is exploring and the canonical 075 About mock is pending. Ship definition-owner decisions cover both main refreshes and source development builds, with the existing Development (main) fallback when no base is known; user answer slots remain unchanged. Explicit user visual approval and implementation-task derivation remain pending. No product implementation or feature 074 change.
- 2026-09-26T18:47:26Z - route: Assigned the canonical 075 About mock at .dude/specs/075-dude-development-base-release/design/about.html to FluentUI, using the published exploring specification and the plan's Canonical Mock Brief, with 074's approved mock as the unchanged reference. Product implementation remains gated on explicit user visual approval.
- 2026-09-26T19:16:14Z - define: Settled the initial Development Base Release About design to proposed at .dude/specs/075-dude-development-base-release/design/about.html; the reviewed CRLF-normalized artifact hash, proposal evidence, and remaining limits are bound in the spec Revision Log. Explicit user visual approval remains pending. No product implementation, plan/task changes, implementation-task derivation, or feature 074 changes.
- 2026-09-26T20:12:50Z - define: Staged approval of Development Base Release About from the user's exact direct-chat reply `approve the 075 design`, bound to .dude/specs/075-dude-development-base-release/design/about.html at SHA256 `61a1f0dcf31195ef3094cb3c08181125a8c1466cb6efb91370bc402fdcda284d` under the approvedDesignSha256 CRLF-normalization convention; the reviewed specification and direct-chat provenance are bound in the spec Revision Log. Derived two new sequential open units, T001@d8c3a59e and T002@72f6b104, with no inherited completion evidence. Canvas preview request `075-about-design-approval` timed out after 1,800 seconds without a receipt; this is not a Canvas response or acknowledgment. The approved mock, captures, and feature 074 remain unchanged. No product execution or task completion is claimed.
- 2026-09-26T20:32:48Z - execution-reconciliation: Applied the checked approval and task-derivation stage for .dude/specs/075-dude-development-base-release/spec.md as one atomic batch with zero lint failures inside its rollback boundary; kept 0, changed 0, dropped 0, new 2 (T001@d8c3a59e, T002@72f6b104 after T001) with no inherited state. Preserved user sections and append-only history, retained the approved mock bytes, and rendered the derived task view. No implementation or completion is claimed.
- 2026-09-26T20:33:22Z - work: Claimed T001@d8c3a59e for the user-authorized autonomous Ship invocation; implementation has not started.
- 2026-09-26T23:08:04Z - work: Claimed T002@72f6b104 for the user-authorized autonomous Ship invocation; implementation has not started.
- 2026-09-27T02:54:21Z - work: Closed T002@72f6b104 in the autonomous Ship invocation; attempt 2's fresh verification (full Edge suites with only the allowed Windows-only POSIX results, fresh Linux complement, retained byte-identical build, server, and installed-host evidence, and lint) received independent review approval. Attempt 1 failed on a pre-existing Review autosave race, fixed in scripts/dude-canvas-ui/t011-browser.test.mjs. T001@d8c3a59e closed earlier in this invocation after independent review; T001-T002 are done.
- 2026-09-27T02:54:37Z - render: Rendered the derived task board; T001-T002 are Done and no task is ready, in progress, or blocked.
