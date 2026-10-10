---
title: Targeted Pack Acquisition
slug: targeted-pack-acquisition
status: defined
spec_path: .dude/specs/082-targeted-pack-acquisition/spec.md
---

# Idea: Targeted Pack Acquisition

## Idea

> perfect, so let's do it , use this approach to fix this issue with sources on  Github , other sources will require full clone, and we can do an asyc process or something that wont casue Dude to crash

Origin: https://github.com/E-G-C/dude/issues/40

Make pack discovery, installation, and refresh usable for large source repositories. For GitHub sources, acquire only the content needed for the requested operation instead of cloning the whole repository just to browse available packs.

GitHub discovery should retrieve the `pack.md` metadata for the direct pack directories in the current `library/packs/<name>/pack.md` layout. Installation and refresh should retrieve only the selected pack's complete subtree, including nested skills, scripts, and assets, from one resolved commit. Multiple pack directories and nested contents remain supported.

Local sources should continue to be read in place. Non-GitHub remote sources may continue to require a full clone. Remote acquisition, including those full clones, should remain responsive, nonblocking, and cancellable so large sources do not freeze or crash Dude.

Preserve Compose's existing validation, rollback, consent, and source binding. Keep existing pack identities and catalog format; do not inherit the GitHub skill-directory importer's renaming, namespace rules, or tiny hard limits. This outcome does not call for a registry, a durable queue, or a new background service.

## Open Questions

No blocking user clarification identified for this capture. Technical acquisition and cancellation choices remain for planning.

## Assumptions

No additional user assumptions supplied.

<!-- dude:managed:start -->
## Capture Context

The coordinator reports that core-only upstream discovery still returns `catalog_timeout` at 5.2 seconds. One isolated shallow `v1.5.0` clone of `E-G-C/dude` under the same Git credential policy completed in 8.96 seconds, transferred 162.22 MiB, and found 19 packs. These are individual observations, not performance thresholds or evidence that targeted acquisition is fixed. No crash was reproduced; avoiding crashes and freezes is the requested outcome.

The original Windows bare-bootstrap repair is already uncommitted and independently approved. The coordinator reports that runtime `1.0.94-3` verified local bare/absolute discovery. Preserve that repair and prior history; this definition covers only the remaining acquisition outcome.

## Definition

Definition binding: `.dude/specs/082-targeted-pack-acquisition/spec.md`.

The core package defines manifest-only GitHub discovery, complete selected-pack acquisition at one commit, unchanged local/source/consent/transaction behavior, and responsive contained acquisition for other remote hosts. The plan records technical safety bounds and the anonymous GitHub HTTP compatibility limit; these are implementation choices, not new user answers.

Four proposed task units cover targeted transport, Compose integration, Canvas containment, and distribution/actual-host acceptance. The package adds no UI surface, persistent acquisition state, or separate supporting artifact. Publication, lint, and workflow state remain coordinator-owned; implementation, testing, and independent review remain with their existing owners.
<!-- dude:managed:end -->

## Coordinator Log

- 2026-10-09T11:23:44Z - brainstorm: Staged the user's settled intent for first-capture publication as targeted-pack-acquisition; draft only, with no package or execution-state changes.
- 2026-10-09T11:49:26Z - define: Staged first definition at .dude/specs/082-targeted-pack-acquisition/spec.md for manifest-only GitHub discovery, selected-pack acquisition, and contained remote reads; publication and lint remain coordinator-owned.
- 2026-10-09T12:06:12Z - work: Claimed T001@c4b08a21 for the user-authorized autonomous Ship invocation; implementation has not started.
- 2026-10-09T15:27:23Z - work: Claimed T002@a92e7c10 for the user-authorized autonomous Ship invocation; implementation has not started.
- 2026-10-09T18:13:56Z - define: Staged unchanged-intent corrections to caller/verification scope, post-await destination authority, remote preview/cleanup guidance, platform verification, accepted trust boundaries, and Canvas HTTP fixtures; publication, reconciliation, and lint remain coordinator-owned.
- 2026-10-09T18:24:59Z - reconcile: Re-definition kept T001@c4b08a21 [x] and T004@d3087fa2 [ ]; changed T002@a92e7c10 one-to-one with [~] preserved and T003@e62c4b09 as open text; no drops, archives, or new tasks; execution history preserved byte-for-byte.
- 2026-10-09T19:19:40Z - work: Claimed T003@e62c4b09 for the user-authorized autonomous Ship invocation; implementation has not started.
- 2026-10-09T23:11:06Z - define: Staged unchanged-intent 55-second Canvas helper timing, kept-outcome cleanup handling, and T003 verification guidance.
- 2026-10-09T23:17:29Z - reconcile: Re-definition kept T001@c4b08a21 [x], T002@a92e7c10 [x], and T004@d3087fa2 [ ]; changed T003@e62c4b09 one-to-one with its key, dependency, writer paths, acceptance commands, and [~] preserved under the corrected 55-second other-host Canvas budget; dropped 0, new 0, archived 0. Lightweight Execution History is byte-preserved.
- 2026-10-10T13:31:47Z - define: Staged unchanged-intent keep-it-simple corrections: best-effort link-skipping clone checks, syntax-only Canvas budget purposes, no extreme-case tests or guards, and T004 narrowed to SC-006/SC-007 distribution and host checks.
- 2026-10-10T13:43:45Z - reconcile: Re-definition kept T001@c4b08a21 [x] and T002@a92e7c10 [x]; changed T003@e62c4b09 one-to-one with [~] preserved under best-effort link-skipping observation and syntax-only budget purposes, and T004@d3087fa2 one-to-one with [ ] preserved, narrowed to SC-006/SC-007; dropped 0, new 0, archived 0. Lightweight Execution History is byte-preserved.
- 2026-10-10T14:21:53Z - define: Staged the user-confirmed replacement of in-progress T003@e62c4b09 with open T005@7d44d411, the same Canvas slice without the folder-swap recheck or its tests; T004 now depends on T005.
- 2026-10-10T14:33:14Z - reconcile: Re-definition kept T001@c4b08a21 [x] and T002@a92e7c10 [x]; changed T004@d3087fa2 one-to-one with [ ] preserved and its dependency now T005@7d44d411; dropped and archived T003@e62c4b09 [~] after the user's option 1 at 2026-10-10T14:20:01Z, with no completion and its Work history unchanged; new open T005@7d44d411 for the same Canvas slice with simpler code. Lightweight Execution History is byte-preserved with the T003 archive appended, and the task snapshot now lists T001, T002, T005, and T004.
- 2026-10-10T14:33:35Z - work: Claimed T005@7d44d411 for the user-authorized autonomous Ship invocation; implementation has not started.
- 2026-10-10T16:09:52Z - work: Claimed T004@d3087fa2 for the user-authorized autonomous Ship invocation; implementation has not started.
- 2026-10-10T17:22:40Z - define: Staged unchanged-intent T004 fixes: the build.test.mjs app.js pin as a writer path, owned-copy acceptance excluding unrelated private work, and agent profiles replacing reviewer profiles.
- 2026-10-10T17:30:22Z - reconcile: Re-definition kept T001@c4b08a21 [x], T002@a92e7c10 [x], and T005@7d44d411 [x]; changed T004@d3087fa2 one-to-one with [~] preserved, adding the scripts/dude-canvas-ui/build.test.mjs app.js pin as a writer path and an owned acceptance copy that leaves out the user's unrelated private edits; dropped 0, new 0, archived 0. Lightweight Execution History, including the T003 archive, is byte-preserved.
- 2026-10-10T19:44:10Z - define: Staged unchanged-intent T004 writer paths after the user's define choice at 2026-10-10T19:41:15Z: the build-dev.test.mjs app.js SHA-256 pin and a current-format-contract.test.mjs exemption for the three github-content transport paths, keeping the user's edits there byte-for-byte.
- 2026-10-10T19:52:36Z - reconcile: Re-definition kept T001@c4b08a21 [x], T002@a92e7c10 [x], and T005@7d44d411 [x]; changed T004@d3087fa2 one-to-one with [~] preserved, adding scripts/build-dev.test.mjs (published app.js pin) and scripts/current-format-contract.test.mjs (exemption for the three github-content transport paths, keeping the user's edits there) as writer paths after the user's define at 2026-10-10T19:41:15Z; dropped 0, new 0, archived 0. Lightweight Execution History, including the T003 archive and T004's Work events, is byte-preserved.
- 2026-10-10T20:35:54Z - work: Closed Targeted Pack Acquisition: all four live canonical tasks (T001@c4b08a21, T002@a92e7c10, T005@7d44d411, T004@d3087fa2) are done through autonomous Work in the Ship invocation for GitHub issue #40; archived T003@e62c4b09 remains without completion. The one Rubber Duck retrospective dispatch completed and is recorded in retrospective.md. Nothing is committed; Git delivery awaits the user's decision.
