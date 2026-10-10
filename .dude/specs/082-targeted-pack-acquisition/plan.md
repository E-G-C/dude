# Implementation Plan: Targeted Pack Acquisition

**Specification:** `.dude/specs/082-targeted-pack-acquisition/spec.md`

## Technical Context

**Language/Version:** Dependency-free JavaScript ESM, production Node.js 20+; existing browser runners require Node.js 22+  
**Primary Dependencies:** Node built-ins, native HTTP fetch, existing Compose, Git for non-GitHub remotes, and the existing Canvas helper-process boundary; no runtime dependency additions  
**Storage:** Existing source/profile documents and operation-owned temporary roots; no persistent acquisition cache or new project state  
**Testing:** `node:test`, request-recording HTTP fixtures, existing process/rollback fixtures, both Canvas browser suites, scoped distribution parity, and the installed-host driver  
**Target Platform:** Windows and supported POSIX workspaces; actual-host acceptance on Copilot CLI 1.0.94-3  
**Project Type:** Core bundle acquisition and its existing Canvas adapter  
**Performance Goals:** Manifest-only GitHub discovery, selected-subtree acquisition, responsive Canvas reads, and the fixed safety bounds below; no measured latency service-level objective  
**Constraints:** Current pack layout, identity, source binding, consent, transactions, local precedence, offline behavior, and Windows bootstrap/HOME/stop-marker behavior remain intact

## Chosen Structure

Use commit-pinned GitHub HTTP acquisition for packs, with full-repository Git acquisition retained for other hosts. The bounded Architect proposal supplies the HOW; it does not supply new user requirements or permission.

1. Add `src/skills/dude-engine/lib/github-content.mjs`. Extract only bounded HTTP reads, commit/tree validation, and Git-blob integrity primitives that the existing directory importer and Compose both need. Pass each consumer's fixed budgets into those primitives. Keep directory-import adaptation, manifests, public APIs, naming rules, and `DIRECTORY_SOURCE_LIMITS` unchanged.
2. Add `src/skills/dude-compose/lib/pack-acquisition.mjs`. This pack-specific module owns remote classification, revision selection, manifest-only discovery, selected-subtree materialization, unique temporary roots, and disposal. It does not inherit importer adaptation or add a provider abstraction.
3. Make Compose's internal source/catalog/pack resolvers, list, and source staging asynchronous. Update every actual caller together, including CLI `main`, the catalog helper, and test fixtures. Keep existing pack validation, artifact enumeration, projection, namespace rules, and application code authoritative.
4. Keep Canvas reads in its existing short-lived catalog helper processes. Change their acquisition budgets and resource accounting, not their request protocol or UI layout. Reuse the pending Reload request, coalescing, loading state, retained rows, and unavailable/partial notices.

The shared transport has exactly two current consumers: directory-source acquisition and pack acquisition. Add no synchronous compatibility wrapper, job service, public acquisition API, new source schema, or runtime optimization objective. The core trio contains all definition detail; no supporting artifact is needed.

## Selection And GitHub Trust Boundary

Preserve the current selection before acquisition (FR-010 through FR-014):

- With no explicit source, `list` selects the whole local catalog when present; add/refresh select the named local pack when present.
- An explicit source is exclusive. `--no-fetch` performs no remote lookup, tag enumeration, or Git invocation.
- Existing folders are read in place. Preserve relative paths, Windows drives, and UNC paths.
- Core-only installs fall back to the bundle manifest's `source_repo` and `source_ref`. A ref-only refresh remains local-first and pins a remote fallback to the reviewed core commit.

Keep saved-source parsing and identity owned by `dude-engine/lib/pack-sources.mjs`; its eight-source limit and public-GitHub-only Canvas Add source contract do not change. For direct Compose sources, classify valid repository spellings for the exact public GitHub host, including HTTPS and existing ordinary SSH/SCP repository forms, as GitHub. An SSH spelling is not permission to clone after an HTTP failure. GitHub Enterprise and other hosts remain Git sources.

Reject credential-bearing URLs and malformed GitHub-shaped addresses without repeating rejected input. Preserve T001's accepted refusals for any host: non-file URLs with empty or backslash-split authority, source-leading Git remote-helper `<transport>::` syntax, and bracketed hosts that are not IPv6 literals. Selected GitHub pack roots must pass the portable-name check. Do not treat a failed GitHub parse as generic-Git fallback. Construct API/raw URLs from validated repository parts and object IDs, ignore response-provided download URLs, and reject redirects and foreign pagination links.

GitHub HTTP is anonymous: use explicit header allowlists and omitted credentials. Do not read tokens, invoke credential helpers, or translate Git configuration into HTTP authorization. This does not carry implicit Git-only private-GitHub credentials or Git proxy configuration. Such sources fail explicitly rather than cloning. The existing Canvas public-source boundary makes an authentication framework unnecessary for this outcome; this compatibility limit must be disclosed in current guidance.

## Revision And Content Acquisition

### Resolve one revision

Resolve a branch, tag, or full GitHub commit selector to a full commit and root-tree ID before reading content. Validate exact commit requests against the returned commit and resolve annotated tags to their commit.

For `latest`, enumerate tag pages to a proven end within the fixed budget and reuse `pickLatestReleaseTag` for highest stable `vX.Y.Z` selection. Never assume the first page contains the highest stable release. Address subsequent trees by tree ID and raw files by the pinned commit.

Before returning acquisition material, recheck mutable selectors. For `latest`, repeat complete stable-tag selection and verify the selected tag's commit. A changed branch, tag, release selection, or commit is ref drift: fail without following it or retrying automatically. Both resolution passes consume the same operation budget (FR-006).

### Discovery

Walk the nonrecursive root, `library`, and `packs` trees, then each direct pack directory's nonrecursive tree to find its direct regular `pack.md`. Fetch and verify only those manifests. Materialize a disposable `library/packs/<name>/pack.md` tree for the existing `availablePacks` and `parsePackManifestMetadata` behavior.

Validate the complete manifests before applying the existing exact use-case filter. Preserve names, sorting, descriptions, use cases, installed flags, and origin. Direct directories without manifests contribute no pack. Do not fetch companions, agents, assets, archives, unrelated blobs, or Git objects to browse.

Git tree responses are not paginated: require the expected tree identity and `truncated: false`. Tag enumeration is paginated; a full last permitted page without a proven end is a limit failure. Do not use the Contents endpoint's directory-entry ceiling. Missing ancestors, invalid metadata, incomplete enumeration, and failed reads are errors, not empty success (FR-001 through FR-004).

### Installation and refresh

Walk the nonrecursive ancestors, then request a recursive tree only for `library/packs/<name>`. Validate the complete inventory before downloading every supported regular file in that subtree. No other pack's file content is needed.

Preserve paths and exact source bytes, including nested skill companions, scripts, binary assets, `LICENSE`, `NOTICE`, and `.LEGAL.txt` files shipped inside the selected subtree. Preserve executable mode where supported. Apply the existing Compose projection rules; do not add an ancestor-license crawler or a new legal-file projection policy.

Reuse the narrow transport protections: validate object IDs, modes, sizes, paths, duplicates, case collisions, and tree completeness. Reject symlinks, Gitlinks, and Windows-unrepresentable paths before downloading; do not rename or follow them. Do not resolve LFS pointers or submodules through additional providers.

Bound streamed bodies even with absent or false `Content-Length`. Verify bytes against declared size and Git blob SHA-1, including its blob header. Cancel response bodies and sibling requests on failure. Write verified files into temporary storage and release buffers rather than retaining the whole pack in a `fileBytes` map (FR-005 through FR-007).

## Temporary Ownership And Compose Consistency

Private resolver results retain their directory/origin fields and add remote source identity plus optional disposal ownership. Local results need no disposal. Every remote invocation uses a unique temporary root, replacing the deterministic source/ref checkout location.

`cmdList` and the catalog helper dispose acquisition material in `finally` after parsing. `stagePackFromSource` disposes acquired source material after producing its ordinary projection stage, including failures. Its existing callers still own `stageRoot`. Missing manifests and validation failures must also dispose the acquisition.

Keep remote profile identity exactly in its current shape: `{type:"remote",repository,requested_ref,resolved_commit}`. Retain the configured repository and requested selector, including `latest`; the transport's normalized HTTP address or temporary path must not replace them. Local provenance stays local.

For `cmdAdd`, capture and parse exact profile bytes, including absence, before asynchronous preparation. Immediately before application, revalidate profile/path authority, compare the current profile with that preimage, and recheck destination ownership/conflicts. Refuse drift instead of merging. Perform backups, artifact application, and profile replacement without another `await`.

Keep refresh's existing final reauthorization and caught-failure transaction. Beside its profile-preimage check, revalidate path authority for every affected destination (replacements, additions, and removals) and its parents after the final `await` and before backups or mutation. Perform application without another `await`. For listing, recheck the installed-profile preimage before returning installed flags; refuse an inconsistent read. Do not add a cross-process lock or promise crash recovery. Acquisition errors, ref drift, limits, and cancellation occur before workspace mutation (FR-008, FR-009, FR-017, FR-018).

Update CLI `main` to await list; await both catalog resolution and listing in `catalog-reader.mjs`; await pack resolution/staging in add and refresh preparation. Await the helper's completed result and disposal before IPC send/exit. `cmdVerify` stays local-only. Upgrade's existing awaited `cmdPreviewRefresh`/`cmdRefresh` calls and ref-only behavior stay intact. Fixtures that copied only `compose.mjs` must copy its new runtime dependencies too.

## Fixed Safety Bounds

These are chosen technical safety bounds, not user-supplied numbers, measured service levels, or promises that arbitrary repositories fit. They provide headroom above the observed catalog and the single-artifact importer's limits. Exceeding one fails explicitly without truncation, fallback, or workspace mutation.

| Scope | Chosen bound |
| --- | --- |
| GitHub catalog | 128 direct catalog directories; 64 KiB per manifest and 1 MiB aggregate manifest bytes; 176 metadata requests and 128 raw requests |
| Selected GitHub pack | 1,024 entries, 512 regular files, depth 16; 8 MiB per file and 64 MiB aggregate file bytes; 64 metadata requests and 512 raw requests |
| Pack metadata transport | 2 MiB per response and 8 MiB aggregate metadata bytes; at most four in-flight HTTP requests per acquisition |
| Stable-tag enumeration | 100 tags per page; at most 20 tag-list requests per resolution pass; require a proven end on both passes |
| GitHub network time | Catalog: 15 seconds per request, 30 seconds total. Selected pack: 30 seconds per request, 120 seconds total. No automatic retries or deadline resets |
| Other-host clone | One 60-second total acquisition deadline across tag lookup, shallow attempt, full-clone fallback, and checkout; at most 1 MiB of captured Git output |
| Canvas helper | Five seconds for local description/validation/read and 30 seconds for GitHub catalog acquisition, with the existing two-second stop-confirmation allowance. Other-host Canvas helper: 55 seconds from slot admission, capped by the remaining absolute 60-second acquisition window; plus two seconds for stop confirmation. |
| Canvas discovery | One absolute 60-second acquisition window, including waiting for capacity; four active readers and at most 16 waiting readers |
| Whole-clone resource observation | Stop at an observed 1 GiB or 65,536 entries in the owned acquisition root; asynchronous best-effort checks at 250 ms intervals, with at most one check in flight, that skip links they see |
| Pack request | Install/refresh catalog phases use the acquisition window; 90-second outer preparation/submission ceiling. Existing five-second short checks and receipt expiry remain |

Reserve request counts and declared file totals before scheduling. Share actual-byte accounting across concurrent streams. Do not launch unbounded `Promise.all` over a catalog or pack. The clone resource observation is not a filesystem quota: writes can overshoot between checks, and that limit must be described honestly. It is also not a race-proof boundary, so add no guard for a folder swapped during a check.

## Contained Canvas And Foreground Acquisition

Retain non-GitHub Git's shallow branch attempt and full-clone/checkout fallback where needed for refs. Its source bytes remain repository-sized. Git must run only in the existing catalog helper or an owned foreground Compose/upgrade process, never on Canvas's event loop. A Promise around synchronous Git is not proof of nonblocking execution.

The process owner applies the total clone deadline, cancellation, output/resource bounds, whole-tree stop, and honest cleanup disposition. For foreground CLI/upgrade pack invocations, use that same whole-process execution boundary; do not introduce an embedded-UI clone call or a background service. Confirm tree termination before deleting its root. Retain the synchronous stop-marker gate so a stopped shallow attempt cannot start the fallback clone.

In `packs.mjs`, use operation-purpose budgets derived from the validated source/operation, not caller-supplied deadlines. The purpose comes only from the source's description and address syntax, with no filesystem probe on Canvas's thread: a public GitHub address uses the GitHub budget, another URL or SSH-style address uses the other-host budget, and anything else uses the local-folder budget. Rare spellings, such as `git@github.com:o/r` or a relative folder named `team:catalog`, may receive the longer other-host ceiling, and that is accepted. Bound the existing reader waiting list rather than adding another queue. A wait that exhausts the absolute window returns unavailable without launching. Complete successful sources remain complete, and failed sources use existing `discoveryCoverage`.

Start the other-host helper clock at slot admission and cap it by the remaining absolute acquisition window. The five-second headroom exceeds the two-second stop allowance, so Canvas stops the whole helper tree before Compose's unchanged 60-second Git deadline can stop only Git's launcher on Windows.

Cancellation aborts the whole read and waits for all started helpers to settle. Preserve last-subscriber disconnect, Canvas close, workspace/source changes, and explicit Reload supersession. Write the stop marker before tree termination. Preserve the Windows bare/absolute bootstrap launch repair and move Git HOME only after the bootstrap has loaded.

If tree termination cannot be confirmed or Compose reports a kept outcome (Git not confirmed stopped), report `catalog_cleanup_failed`, retain the root, and keep its reader slot unavailable for the lifetime of the current extension process. Do not silently release capacity and accumulate potentially live descendants. Add no automatic cleanup/reclaim loop, orphan registry, or durable quarantine state. Restart does not prove or authorize cleanup of retained material.

In `needs-you.mjs`, remove the hidden five-second catalog bottleneck only for install/refresh preparation and submission. Keep pending-input queries, send confirmation, unsubmitted receipt expiry from allocation, literal permission, result acknowledgment, and installed-only removal on their existing short bounds. Burn submitted receipts before asynchronous rechecks as today; never replay an uncertain send.

Reuse `useCanvasData.discover`, coalesced reads, `packsLoading`, stale rows, and existing error surfaces. Change only the hardcoded five-second Add-source timeout wording in `frontend/pack-sources.jsx` to truthful server wording. This is an existing loading/error convention, not a new interaction. Keep the approved 052 workspace layout and its later approved functional adaptations (FR-015, FR-016, FR-019).

## Verification And Acceptance

All commands below belong to authorized implementation/testing owners; none is executed by this definition stage. Record actual executed/passed/failed/skipped counts. A missing file or zero matched tests is a failure; skips and wrapper success are not acceptance. Cover realistic use and the spec's criteria, and add no tests or guards for extreme cases such as a folder swapped for a link during a check or an unusual address spelling.

| Platform | Verification basis |
| --- | --- |
| POSIX | Authoritative full runs of each Node command: Node 20 for production suites; Node 22+ for the already-required browser suites. Run non-root from an owned native copy without the Windows worktree `.git` file. |
| Windows | Run targeted selectors for changed behavior. Record baseline-identical failures for importer fixtures Windows cannot create (`https:` folders or `mkfifo` FIFOs) and the 11 pre-existing `upgrade.test.mjs` Windows failures, without weakening tests. |

T001 was accepted on exactly this basis. Baseline comparisons do not excuse new failures.

### Targeted transport

```sh
node --test --test-reporter=tap src/skills/dude-engine/lib/github-content.test.mjs src/skills/dude-compose/lib/pack-acquisition.test.mjs src/skills/dude-bundle-import/lib/directory-source.test.mjs src/skills/dude-bundle-import/lib/directory-import.test.mjs src/skills/dude-bundle-import/import.test.mjs
```

Use existing `withMockFetch`, `withFetchScript`, and `githubProtocolFixture` patterns. Record every request and assert zero Git invocation for GitHub acquisition. Cover multiple pack directories, missing manifests, unrelated large blobs, multi-page stable tags, branches, annotated tags, exact commits, and both selector rechecks. Selected-pack tests include nested text/binary companions, notices, and modes.

Negative controls must fail for the intended reason: credentials/malformed sources, unauthorized or missing sources, rate limits, redirects, foreign URLs, truncated/mismatched trees, incomplete tag enumeration, unsafe entries, false sizes, bad hashes, streamed excess, and ref drift. Assert disposal and no fallback or empty substitution. Boundary tests cover each chosen limit without inheriting importer limits.

### Compose and actual callers

```sh
node --test --test-reporter=tap src/skills/dude-compose/compose.test.mjs src/skills/dude-engine/lib/release-channel.test.mjs src/skills/dude-engine/lib/profile.test.mjs src/skills/dude-bundle-upgrade/upgrade.test.mjs library/packs/a2a/a2a.test.mjs
```

Exercise real list, install, preview, and refresh, not acquisition alone. Compare local and targeted-remote projection, retained remote identity, nested contents, removed refresh files, mutation snapshots, and fault restoration. Deterministically interleave two adds and prove the stale one cannot erase the first membership. Cover absent-profile drift and inconsistent installed flags. Hold refresh acquisition pending, replace an affected destination's parent with an external link, and assert refusal, unchanged external bytes, and acquisition disposal. Preserve local/no-fetch/exclusive/default/ref-only behavior and local-only verification. Run production suites on Node 20+ with Windows and POSIX coverage; state any uncovered platform rather than inferring it.

### Canvas lifetime and existing UI

```sh
node --test --test-reporter=tap src/extensions/dude/canvas-server.test.mjs src/extensions/dude/needs-you.test.mjs
node scripts/dude-canvas-ui/build.mjs
```

Migrate the existing T008 GitHub-source fixtures in `src/extensions/dude/canvas-server.test.mjs` and `scripts/dude-canvas-ui/browser.test.mjs` (`offlineGitHub` around line 486) from Git URL rewriting to a GitHub HTTP stand-in reachable from the catalog-reader child. Implement the stand-in inside those existing test files and generate any child fixture code into owned temporary roots at runtime; add no production test seam or new repository file. Preserve assertions and offline isolation. Trusted current evidence records 24 failing T008 tests and a suite that does not exit until these fixtures are migrated.

Reuse `silentGitListener`, `spawnSpy`, `taskkillSpy`, `partialCloneKill`, and `simulatedCliHost` fixtures. Hold a non-GitHub clone while an unrelated installed-only `/api/packs` response completes. Assert one real, uncontended other-host production-deadline timeout settles in 55-57.5 seconds from slot admission. Cover cancellation, fallback-kill race, queue expiry/overflow, resource observation, coalescing, supersession, independent source failures, and retained-root capacity. Add a Compose kept-outcome regression that asserts `catalog_cleanup_failed`, retention of the root and reader slot, and no successful-cleanup claim. Use isolated processes for unconfirmed cleanup controls. Do not weaken short consent/receipt/send/removal assertions when updating catalog deadlines.

With Node 22+, set `DUDE_CANVAS_BROWSER` to the installed browser, `DUDE_CANVAS_BROWSER_REQUIRED=1`, and `DUDE_CANVAS_ARTIFACTS_DIR` to an owned OS-temporary evidence folder. Run these separate commands serially:

```sh
node --test --test-reporter=tap scripts/dude-canvas-ui/browser.test.mjs
node --test --test-reporter=tap scripts/dude-canvas-ui/t011-browser.test.mjs
```

Drive realistic pack Reload, pending loading, unavailable/partial sources, corrected timeout wording, and a source-bound consent/result journey. Preserve selection, focus, keyboard behavior, screenshots, geometry, accessibility, and error-transition checks from the existing harness. Any human host observation comes only after this complete automated interaction and is limited to host-only behavior.

### Distribution and actual host

```sh
node --test --test-reporter=tap scripts/build-release.test.mjs scripts/dude-canvas-ui/build.test.mjs
node scripts/dude-canvas-ui/t012-installed-host.mjs
```

`scripts/build-release.test.mjs` proves that core-only release output ships Compose's `lib/pack-acquisition.mjs`, and the scoped projection under Guardrails, Delivery, And Risks proves source and generated parity. Rerun another suite only if T004 changes a file it covers. Update the committed `app.js` byte-size and SHA-256 pin in `scripts/dude-canvas-ui/build.test.mjs` to the bytes the UI builder now produces. Update the published `app.js` SHA-256 pin in `scripts/build-dev.test.mjs` to the same bytes. The GitHub-issue artifact inventory in `scripts/current-format-contract.test.mjs` rejects any `github`-named file under `skills/`, and the shared GitHub content transport is not issue tooling, so exempt exactly its three paths there, as the Beads issue module is exempted. Run the acceptance commands in an owned copy where the user's unrelated private files keep their HEAD bytes and unrelated untracked files are left out, and confirm separately that those workspace files are unchanged. In that copy, `scripts/current-format-contract.test.mjs` is its HEAD bytes plus only T004's exemption, and the separate workspace check also confirms that the user's two edits in that file are unchanged.

Extend the existing installed-host driver's bootstrap/receiver pattern, and run it with its existing environment settings and short, owned temporary roots outside evidence folders. In an owned core-only Copilot 1.0.94-3 fixture built from authoritative source, prove that ordinary `/api/packs` reads trigger no acquisition. Then an explicit default-source Reload must return the complete catalog at the current stable release within the acquisition window, with no clone. Compare the returned pack names with `library/packs` at the resolved commit, and record the tag, commit, pack set, elapsed time, and cleanup. Do not hardcode a pack count or release tag.

Restart the extension after backend replacement so the new modules load. Report an unavailable host, network, or rate allowance as an external blocker, not a passing skip.

## Guardrails, Delivery, And Risks

Existing project and bundle guardrails apply, including the keep-it-simple rule in `.dude/memory/guardrails.md`. The spec gate was assessed before this plan: required sections, independently testable stories, measurable outcomes, edge cases, and numbered requirements are present, with no unresolved clarification or API/budget design in the spec.

Edit authoritative `src/`, tests, and the exact current guidance only. Preserve the already approved, uncommitted issue-40 bootstrap repair while changing overlapping acquisition files. Preserve unrelated private configuration, model maps, instructions, agent profiles, the user's existing edits in `scripts/current-format-contract.test.mjs`, and untracked `library/packs/animation/`. Do not reopen resolved 073/078 ledgers, mutate workflow state, or perform Git actions.

For generated dogfood, use `listCoreOutputs` and `writeCoreOutput` from `scripts/build-release.mjs`, selecting exactly the outputs below and refusing a missing/duplicate match. Write no other planned output. UI building owns only `src/extensions/dude/ui/assets/app.js` and its legal companion; preserve complete notices.

```text
.github/skills/dude-engine/lib/github-content.mjs
.github/skills/dude-compose/lib/pack-acquisition.mjs
.github/skills/dude-compose/compose.mjs
.github/skills/dude-compose/SKILL.md
.github/skills/dude-bundle-import/lib/directory-source.mjs
.github/extensions/dude/lib/catalog-reader.mjs
.github/extensions/dude/lib/packs.mjs
.github/extensions/dude/lib/needs-you.mjs
.github/extensions/dude/ui/assets/app.js
.github/extensions/dude/ui/assets/app.js.LEGAL.txt
```

Check live preimages before overlapping writes and establish parity for this allowlist only. Do not run broad `build-dev` in this mixed worktree or project model configuration, agents, instructions, manifests, profiles, or development-base metadata. Full release assembly is allowed only in an owned disposable fixture for distribution acceptance.

Update Compose's Catalog Resolution and source-first preview guidance, plus `docs/commands.md` pack/source timing and credential descriptions. For every remote source-first preview, await the actual Compose resolution, use its `sourceIdentity.resolved_commit` as the commit basis, then dispose the resolution; do not introduce a separate `git ls-remote` path. Only public GitHub uses anonymous HTTP; GitHub Enterprise and other hosts retain Git. Explain the Git-only credential/proxy compatibility limit for public GitHub, fixed bounds, and cancellation. Describe disposal's removal of owned temporary material together with its exception: if process-tree termination cannot be confirmed, retain the affected material and report unconfirmed cleanup. Importer guidance needs no behavioral rewrite because its contracts remain unchanged.

Independent Tester evidence and independent quality review remain required by execution. Review the final delta and fresh evidence for acquisition boundaries, source identity, consent, transactions, bootstrap preservation, cleanup, and scoped distribution parity; create no reviewer-only task.

Residual risks are anonymous GitHub rate limits, loss of implicit Git-only credentials/proxy behavior, bounded rejection of unusually large catalogs/packs, clone-size overshoot between observations, and unavailable reader capacity after unconfirmed cleanup. None justifies an authentication framework, cache, quota service, cleanup daemon, or weaker consent. A code rollback must preserve the original bootstrap repair; it does not undo any separately consented installed-pack change.

## Delivery Phases And Traceability

| Phase / durable task | Complete slice | Specification coverage |
| --- | --- | --- |
| Foundational / `T001@c4b08a21` | Minimal shared transport extraction and bounded pack acquisition, with request/integrity/disposal tests | US1/US2; FR-001, FR-002, FR-003, FR-005, FR-006, FR-009, FR-014, FR-016, FR-019; SC-001/002/003 |
| User Stories 1 and 2 / `T002@a92e7c10` | Compose integration, all actual caller updates, final preimage checks, and current Compose guidance | US1/US2; FR-001 through FR-014, FR-017, FR-018; SC-001/002/003/005 |
| User Story 3 / `T005@7d44d411` (replaces archived `T003@e62c4b09`) | Contained responsive Canvas reads, purpose-specific request budgets, and existing loading/error regression | US3; FR-008, FR-015, FR-016, FR-019; SC-004/005 |
| Polish / `T004@d3087fa2` | Exact generated distribution, current docs, and actual-host default-source discovery | FR-020; SC-006/007 |

Each task depends on the preceding slice because the real caller, fixture, and generated write sets overlap. Initial task units are proposed open definitions only. Publication, lint, execution state, independent review, and closure remain with their normal owners.
