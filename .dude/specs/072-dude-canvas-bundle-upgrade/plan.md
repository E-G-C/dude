# Plan: Dude Canvas Bundle Upgrade

Spec: `.dude/specs/072-dude-canvas-bundle-upgrade/spec.md`
Owner: `.dude/ideas/072-dude-canvas-bundle-upgrade.md`

Use one staged, preview-bound upgrade engine for Canvas and chat. Fetch the selected release through Git, prepare the complete result with that release's engine, and apply its exact bytes in place. Leave changes uncommitted and require a new session. This follows the Architect's 2026-10-18 recommendation and the capability envelope carried into the spec.

The spec was checked for complete sections, independent scenarios, testable requirements, and resolved intent before this plan was staged. Design is `approved`: the user's explicit "approved" reply approves round 1, keeps OK, and includes the declared Appearance read-error change. The four serial units outlined in Phases And Handoff now live in `tasks.md`; the coordinator applies execution reconciliation and owns live task state. Zero-failure definition lint remains with the coordinator.

## Technical Context

| Field | Choice |
| --- | --- |
| Language/Version | Existing JavaScript ES modules on Node >=20, with JSX for Canvas. Keep Node 20/22 CI coverage; browser acceptance needs Node 22+. Plan targeted Windows process/replacement checks on Node 24, not a new cross-product matrix. |
| Primary Dependencies | Existing Git, Node built-ins, React 19.2.8, Fluent UI 9.74.7, and scoped esbuild 0.28.2 build. Reuse Compose, ownership/path helpers, release-tag selection, and the atomic file batch. No new package dependency. |
| Storage | Existing installation metadata and pack profile; one retained temporary release/staging result; the existing per-user `canvas-preferences.json` extended by one boolean. No persistent release cache, job store, or new repository state document. |
| Testing | Node test runner, ordinary tagged Git fixture upstreams, server/atomic-helper regressions, the existing Canvas build and two required-browser suites, and the installed-host runner. |
| Target Platform | Current Copilot Canvas extension and loopback server on Windows, macOS, and Linux. Actual running-extension replacement needs Windows evidence; cold acquisition is measured on Windows and Ubuntu. |
| Project Type | Core bundle maintenance CLI plus the existing local Canvas application. Authoritative implementation is in `src/`; `.github/` is its generated runtime projection. |
| Performance Goals | Session join never awaits the update check; tag lookup has a five-second deadline. Preparation is bounded and cancellable, with truthful activity labels. Measure cold acquisition and resource use rather than promise ZIP-like speed. |
| Constraints | One confirming Canvas click, no agent sends, exact staged application, unchanged HEAD/branch/index, no project writes during preparation, and caught-failure restoration. Upgrade batch ceiling: 8,192 changed files and 256 MiB of retained before/after bytes. Preserve definition-specific limits and existing pack-fetch bounds. |

## Chosen Structure

### 1. Topology and closed Canvas routes

Follow 083's direct pack-action convention, not the Needs you request/receipt protocol.

- `src/extensions/dude/extension.mjs` creates one extension-owned update controller after `joinSession`. It starts the eligible session check asynchronously and passes that controller to Canvas instances.
- `lib/bundle-upgrade.mjs` holds the session result, Later dismissal, current preparation, and outcome. One live preparation is enough; a replacement invalidates the prior one.
- `lib/upgrade-action.mjs` is the short-lived child entry for preparation and application. The installed code acquires a target release; the target's own retained engine stages and applies it outside the deployed tree being replaced.
- `lib/canvas-server.mjs` exposes `GET /api/updates` for current session state only and `POST /api/updates/action` for the closed operations `check`, `preview`, `apply`, `cancel`, and `later`. GET never acquires anything.

The server derives the workspace, source, ref, tool paths, and child entrypoints. Browser input can select the bounded operation, pack-group choice, and current opaque prepared ID; it cannot supply a repository, filesystem root, command, executable, or arbitrary plan. Apply accepts only the retained ID, not a browser-supplied file list or replacement bytes.

Reuse exact Host/Origin checks, the same-origin POST rule, JSON and body-size limits, safe error responses, workspace binding, and server lifetime guards. An `updates` server-sent-event invalidation makes the frontend reread state. No timer-driven browser polling, `session.send`, Needs you waiter, receipt, or new request class is needed.

The controller refuses duplicate apply and conflicting local update operations. This is an in-process admission rule, not a cross-process lock against chat or other external writers. Preparation is disposed on replacement, cancellation, or owning Canvas closure; browser disconnection after the write gate does not kill application.

Trace: FR-005 through FR-011, FR-023, FR-034, FR-035, FR-041, FR-047 through FR-051, FR-058, FR-059.

### 2. Git acquisition of the exact target

Add the purpose-specific `src/skills/dude-bundle-upgrade/lib/release-source.mjs` for the real check/preparation callers. Reuse `pickLatestReleaseTag` from `dude-engine/lib/release-channel.mjs`; do not use its synchronous lookup on the Canvas thread.

For a latest-release installation, list stable tags and select numerically, then resolve the selected tag to its exact commit, including annotated-tag peeling. Chat's explicit source/ref path resolves its requested ref freshly. Fetch that commit with depth one and blob filtering, enumerate its tree, and materialize only the committed deployment files and engine dependencies needed for this result. Read raw Git blobs so checkout conversion cannot change the reviewed bytes. Materialize blobs recorded as `100755` with their executable permission. A moved source/ref never replaces the retained result after preview.

Preserve `scanCoreInventoryPaths`, the shared ownership classifier, and workspace-path validation. The deployment boundary remains the existing four categories:

1. `.github/agents/dude.agent.md` and canonical `dude-<slug>.agent.md`, excluding `dude-local-*` and `dude-pack-*`.
2. Canonical core `.github/skills/dude-<slug>/**`, excluding `dude-local-*`, `dude-pack-*`, and `.github/skills/project/**`.
3. `.github/instructions/dude.instructions.md`.
4. The exact runtime tree `.github/extensions/dude/**`, not sibling extension trees or `src/extensions/dude/**`.

Acquire required canonical metadata and the target engine's co-versioned imports alongside those categories. Do not build `src/`, copy a consumer's local catalog, check out the whole repository, fetch full history, or introduce a second release-asset transport. A server that ignores blob filtering can transfer more data, but acquisition stays depth-one and bounded; there is no unbounded fallback.

Use a short `mkdtemp` root under `os.tmpdir()`, replacing `TMPDIR || '/tmp'` and the permanent per-ref clone cache. Reuse the pack adapter's launch/environment/stop mechanics where they fit. For core Git acquisition, use the existing 55-second outer window, leaving more than the two-second stop allowance before any inner 60-second synchronous Git deadline. An asynchronous child still needs an owned-tree stop and a bounded captured result. Retain the existing 1 GiB/65,536-entry temporary-root observation as a best-effort stop, not a hard disk quota; the smaller staged-byte ceiling applies before a preview can be ready.

Git is chosen over the earlier ZIP-plus-published-digest proposal because one path works with ordinary local Git fixtures, `file:` remotes, and non-GitHub sources without production test endpoints or injection flags. It avoids a second metadata/download/digest/extraction implementation. The cost is uncertain cold transfer performance; Git object identity is not release signing or verification of a GitHub asset's published digest.

Trace: FR-002 through FR-004, FR-024, FR-029, FR-040, FR-052, FR-057.

### 3. Staging, preview, and apply binding

Use the installer convention "prepare, review, then replace." Preparation snapshots relevant consumer deployment files and metadata into temporary storage. The acquired release exposes the staging function that overlays its core and runs its Compose against that snapshot. If the target lacks that contract, return an unsupported-target error with no project changes; never invoke the retired branch/commit workflow.

Prepare all intended bytes before confirmation:

- Core additions, replacements, and removals from the owned inventory.
- Selected pack projections and the corresponding consumer profile changes.
- `.dude/metadata/bundle-manifest.md` and `.dude/metadata/development-base-release.md` transitions using 075's existing provenance rules.
- One immutable `.dude/metadata/upgrade-log.md` entry when there is a real update.

Start from the consumer profile and preserve nonselected records; never overlay the release's empty/default profile onto an installed consumer. Core-only leaves pack files and profile bytes untouched. Preserve development-base removal when no usable base applies, rather than leaving stale provenance. Prepare any log time once and describe the prepared target without a fabricated lint result; do not change timestamps, append another log entry, or patch metadata after the confirming click. A no-op does not manufacture a log-only update.

Compute actual before/after byte differences, including individual files inside skill directories. Compose's existing "replaced" lists describe projection operations and cannot supply honest changed-file counts. Group the sorted preview into core, metadata, and affected packs, with added/replaced/removed relative paths; show no hashes in the UI.

Retain one prepared result with an opaque ID, workspace/branch binding, expected bytes or absence for each touched path, staged postimages or deletion, and internal integrity checks for retained material. Freeze the relevant profile preimage when pack selection depends on it. Changing the checkbox creates a replacement result and invalidates the old ID, even if the target release is unchanged.

At apply, recheck the binding, every touched preimage/absence, metadata/profile evidence, and staged content. A mismatch writes nothing and requires a fresh preview. No target discovery, pack resolution, or byte selection happens after OK. The only post-confirmation decisions are whether freshness/checks permit those bytes and whether failure requires restoration.

The retained result is necessary for the current preview/confirm callers. Do not turn it into a consent ledger, reusable authorization registry, revision database, expiry scheduler, or durable job service. Chat may retain its explicit plan across its separate preview/apply commands; apply, discard, replacement, and ordinary completed cleanup release it. Abrupt process loss can leave temporary material and is not a recovered job.

Trace: FR-024, FR-025, FR-029 through FR-042, FR-045, FR-046, FR-054.

### 4. Extend the existing atomic batch

`src/skills/dude-feature-definition/atomic-file-batch.mjs` already provides expected-byte checks, same-directory temporary writes, path validation, and rollback-bound validation. It currently accepts only Buffer postimages and limits arrays to 64 entries; a core upgrade already exceeds that file count.

Extend `applyAtomicFileBatch` additively for deletion and an upgrade-sized batch. Keep the existing default limit, definition recovery's exact four-path contract, definition artifact byte limits, validator-array bounds, and synchronous callback contract. Only the upgrade caller uses the fixed 8,192-change/256 MiB retained-before-and-after ceiling. Do not globally widen every definition array or accept a limit from browser input.

Validate the full change set before mutation. A deletion has an expected regular-file preimage and no postimage; a missing-to-missing operation is not a change. Preserve canonical relative paths, duplicate/ancestor rejection, confinement, expected-absence checks, and reverse-order restoration. Restore removed files, restore replaced bytes, remove newly added files and newly created empty paths, and surface any restoration failure with the affected paths.

For the upgrade caller, preparation records which written files the release marks executable as part of the retained, reviewed result. The batch writes added and replaced files with that recorded permission; when a caller supplies none, a replacement keeps the existing file's permission. Capture each replaced or deleted file's original permission and restore it with its bytes after a caught failure. Make no other permission changes, no mode-only updates for byte-identical files, and no Windows behavior change. This extends the existing batch for its real caller, not a general permission-management system.

Run the retained target engine's apply from the temporary release tree, including its atomic helper and linter, so the child cannot reload code from the deployed files it is replacing. Do not touch Git's index or HEAD. A dirty tree is allowed; preimage checks guard touched paths and the warning covers their customizations.

The retained target engine's apply reports one boundary when its post-write bundle check starts, through an optional progress callback on `applyPreparedUpgrade` and `applyUpgrade`. The update child relays that boundary, and Canvas shows the approved Checking busy state from it; no timer or estimate chooses the boundary. Chat needs no progress output.

This is all-or-restored for caught failures, not a filesystem-wide atomic swap or a power-loss promise. Existing failure injection belongs in tests; add no production test switch or alternate apply implementation.

Trace: FR-038 through FR-048; SC-004, SC-007 through SC-010; Edge Cases: "Executable files in the release, such as pack scripts".

### 5. Lint: compare newly introduced failures

Use the same retained target-release `dude-lint/lint.mjs` against the actual consumer immediately before the batch and again in the batch's rollback-bound callback. Do not compare the old installed linter with the new one.

Parse both runs as multisets of normalized `[FAIL]` diagnostics. Normalize presentation differences such as line endings and known root prefixes, without erasing paths, failure identity, or duplicate occurrences. A normal lint failure report is a valid baseline, not a crashed check. If the after multiset contains any occurrence not accounted for by the before multiset, restore the batch. Equal total counts with different diagnostics must fail this test.

Disclose retained existing failures in the result; "no new failures" does not mean "clean." A missing linter, abnormal exit, timeout, truncated capture, or unreadable report before writing refuses the update; the same uncertainty after writing triggers restoration. Preserve caught restoration errors instead of replacing them with a generic lint message.

This policy applies only to the product's upgrade operation. It does not weaken the first-definition publisher's fixed zero-failure lint gate, normal Work verification, or independent review.

Trace: FR-042 through FR-046; SC-008.

### 6. Optional out-of-the-box pack refresh

Read installed membership from `cmdStatus().result.installed`, then use `matchesRecordedSource` against the manifest-derived bundle upstream. The helper's existing match ignores the recorded ref. A catalog name is not installation or source authority: foreign repositories, local-library records, and unmatched provenance remain untouched.

For eligible names, call the target release's Compose with an explicit upstream source and its resolved commit, preventing a consumer's local `library/` from taking precedence. Reuse 082's targeted selected-pack acquisition, not whole-catalog discovery. Keep the 120-second GitHub selected-pack deadline, its request/byte/concurrency limits, and anonymous GitHub reads. For other Git hosts, retain the shorter outer stop window before the synchronous Git deadline.

Reuse/export the existing launch, environment, and stop helpers in `lib/packs.mjs`, including Windows bootstrap handling. Do not replace HOME before the Copilot bootstrap has loaded; inside the helper, isolate Git's home and disable credential helpers as 082 does. Confirm the owned process tree stopped before deleting its temporary root. If that cannot be confirmed, retain the root and report cleanup uncertainty.

Prepare packs sequentially. Compute one finite overall preparation deadline from the core acquisition window plus one existing 130-second pack-action window per eligible pack; each fetch retains its smaller source-specific bound. Include local staging/comparison within that overall deadline and enforce the aggregate 256 MiB result ceiling. No pool or dependency framework is needed.

Only actual byte differences make a pack affected. Retain no-op pack records rather than updating their ref merely because the core changed. Default the one affected-group checkbox to checked; changing it reruns preparation and invalidates confirmation. A failed selected pack blocks the combined result but allows a new core-only preparation.

Locally edited recorded artifacts may be replaced after the warning, while foreign destination conflicts still fail. Use non-writing Git status with optional index-refresh locks disabled to identify known dirty touched paths, and always show the general overwrite warning. The hash-free pack profile cannot reliably identify committed customizations. Ordinary Git cannot recover overwritten pre-existing uncommitted bytes after a successful update.

Trace: FR-027 through FR-033, FR-037 through FR-040; SC-003, SC-004, SC-006, SC-007.

### 7. Running-extension rule

The child applies from retained temporary release files. Loaded modules normally remain resident, but that alone proves neither Windows replacement nor safe serving of new assets by old routes.

At the Canvas write gate, the shared controller stops further workspace-changing Canvas actions and prevents the old server from serving replacement UI assets. The already-open document may receive progress and the result. Success leaves restart-required state; a reload receives an inert "Start a new session" page without the replacement bundle. Keep that gate for this old server after any write attempt rather than trying to prove hot reload safe. A pre-write refusal can return to the ordinary fresh-preview flow.

Cancel works before writing. After that point, browser closure detaches observation but does not abort the child; it must finish or restore. A locked file or permission error follows the normal restoration path. The result distinguishes installed-on-disk version from the code still running in the current session.

No automatic session termination, hot module reload, "Restart now" button, or cross-process update service is introduced. The in-process gate covers Canvas-owned application; independently started chat or external writers are not serialized with it. They must observe the same new-session warning, and concurrent mutation remains a reported limit rather than a claimed lock.

Actual extension self-replacement, old-server asset separation, and new-session version reporting are required installed-host acceptance, not conclusions drawn from ESM behavior.

Trace: FR-047 through FR-051; SC-009, SC-010.

### 8. Session-start and manual checks

Read the preference and manifest before any automatic external contact. An absent preference defaults checks to true; unreadable data suppresses the automatic check. Only a valid `source_ref: latest` installation with a usable stable installed version is eligible. Pinned and development installs make no automatic lookup and expose neither Check for updates nor a release-update button; About explains why checks do not apply.

Run one asynchronous, noninteractive tag listing with a five-second deadline and bounded captured output. Reuse stable-tag selection and compare installed/available versions numerically; never offer a downgrade. Disable credential helpers and point Git at an isolated HOME path that is not created. Unlike preparation, checking creates no temporary directory, cache, manifest download, preference write, or project file. Keep the existing user's credentials out of background Canvas checks.

Store the result and completion time in extension memory only. Failure emits no notice or agent message; About can show Couldn't check. No stable tags is its own result. Only build a What's new URL for a validated GitHub repository/tag combination; non-GitHub sources may have no such link. Do not fetch inline release notes.

Later hides the notice for this session without stored skip-version state. A Nothing to update preview does not clear it. Manual Check for updates performs one fresh eligible check even when the preference is off, but does not override pinning or turn a development checkout into a release installation. Saving either switch value initiates no check. Global `@dude status` remains the read-only workflow command and does not check updates.

Trace: FR-001 through FR-017, FR-019; SC-001, SC-002, SC-005, SC-006.

### 9. Extend the existing preference document

Keep `src/extensions/dude/lib/canvas-preferences.mjs` as the sole file owner and the existing server-resolved location:

`$COPILOT_HOME/extensions/dude/artifacts/canvas-preferences.json`

When `COPILOT_HOME` is unset, use the same path under `~/.copilot`. The complete document has only:

```json
{"followAppTheme":false,"checkForUpdatesOnSessionStart":true}
```

An absent file supplies false/true defaults without creating anything. Accept the existing valid one-key `{"followAppTheme":<boolean>}` document and default its missing update-check key to true, without backfill on read. Unknown keys, wrong types, malformed JSON, and unreadability remain errors.

Change the existing preference POST to a strict one-known-key boolean patch. Read the current document, preserve the other choice, and save the complete two-key document through the existing unique sibling staging file and atomic rename. Serialize read-modify-save operations within the process so an Appearance save cannot reset the privacy setting. Refuse either switch's writes over unreadable or invalid state rather than silently replacing it. Add no schema version, migration registry, browser-local authority, or cross-process lock.

Update the one-key response validator in `frontend/theme.js`; the theme-only HTML bootstrap does not need another field. About reads the update choice through the existing preference route. Keep existing visible-focus/refocus and Settings-entry rereads rather than adding polling or cross-project broadcast. New sessions always read the file before automatic contact.

Retain confirmed state while saving. A failed read has a preference-specific warning and read retry, with both About's update-check switch and Appearance's switch unavailable for saving until Retry succeeds; a failed save preserves the prior choice; an uncertain response causes a read before any saved claim, never automatic POST replay. Announce confirmed success, following 085's existing convention without adding a Save button.

Within one updated process, each key-preserving save is serialized. Simultaneous writes by separate extension processes remain last-successful-replacement-wins; no cross-process merge guarantee is added. Older Canvas processes with the one-key parser may report a preference error after a two-key write. This is a version-interoperation risk to disclose, not a reason to build a migration framework.

Trace: FR-012 through FR-022, FR-058, FR-059; SC-005, SC-006.

### 10. Chat command changes

Move `src/skills/dude-bundle-upgrade/upgrade.mjs` and its SKILL guidance to the same preparation/application engine:

- Keep `status`, `plan`, `apply`, `help`, source/ref selection, text/JSON reports, and preview-only behavior. Add only the small `discard` operation needed when a prepared chat update is declined.
- `plan` returns the prepared result's opaque ID and actual byte-diff report. A subsequent apply selects that retained result; it does not reconstruct bytes from a summary. The installed entry hands application to the retained target code before any deployed file is replaced.
- Plain upgrade is core-only. `--all` chooses the same eligible out-of-the-box group, including its real changes in `--all --dry-run`.
- Keep the user's literal `confirm upgrade` mapped to `--confirm confirm-upgrade`. Canvas's direct click supplies its own confirmation without manufacturing a chat phrase.
- Delete `rollback`, the separate `packs` phase and its `packs-preview`/`packs-apply` command forms, `confirm-packs`, `--skip-removals`, safety tags, branch switching, automatic staging/committing, and the clean-tree prerequisite.

Do not keep the old plan/cache/TTL machinery as a second authorization path or translate old plans into prepared results; an old or unsupported plan needs fresh preparation. `discard` releases the selected temporary result, not arbitrary caller paths.

Update the live skill, README, `docs/upgrading.md`, `docs/commands.md`, and their tests together. Document the current-branch, uncommitted result and selective Git review/discard or reverting the user's eventual commit. Say plainly that Git is not a backup for overwritten uncommitted customizations. Preserve historical idea logs and design records that describe the old commands.

Trace: FR-039, FR-052 through FR-057; SC-011.

## Guardrail Checks

| Guardrail | Application |
| --- | --- |
| Definition and design ownership | Use the exact defined owner and existing definition write path. Keep `design_status: approved` bound to the user's exact round-1 approval; canonical units now live in `tasks.md`. No live UI writes occur during definition. The coordinator rechecks identities and owns task/execution state. |
| Keep it simple | One acquisition path, one prepared result, the existing atomic helper, one extra preference key, and four serial units. Every retained mechanism has a current caller or a named failure case. |
| Canvas continuity and functional realism | Use 052's workspace, 085's approved Settings adaptation, and 083's dialog. The spec contains the Architect's capability envelope. Mock controls must work within it; preserve variants and do not put mock fixture controls in product source. |
| Privacy and preservation | No background credential prompts, no automatic contact when off/unreadable, no source/root/command input from the browser, and no project writes during preview. Preserve unowned files and all existing workflow state. |
| Source and optional-pack independence | Edit `src/`, rebuild/project runtime bytes, and leave pack source and installed authoring/design packs alone. Runtime depends on core helpers, not optional installed packs. |
| Evidence and lint authority | Complete real fixture and browser behavior before host-only observation. Upgrade's new-failures policy does not change definition's zero-failure lint requirement or normal Work verification/review. |

Existing project and bundle guardrails cover this work. No new guardrail candidates, durable guardrail writes, or ratification pause are needed. The four Ship-authorized definition-owner dispositions are recorded in the spec's Assumptions and the owner's Definition Package; they are not user-supplied answers or an approval of the proposed mock.

## YAGNI Cuts

| Cut | Why it is unnecessary here |
| --- | --- |
| ZIP download/digest/extraction alongside Git | Two production transports would serve the same target; one Git path supports real local fixtures and non-GitHub sources. |
| Full-repository checkout, source build, permanent ref cache | The caller needs committed deployment bytes and selected packs, not repository history or `src/`. |
| Old rollback, safety branches/tags, commits, separate packs commands, skip-removals | They conflict with one exact preview and the accepted current-branch warn-and-proceed result. Update current callers and delete them. |
| Agent request protocol, typed Canvas confirmation, stored trust/consent | A direct user click already confirms this fixed prepared result. |
| Polling, persistent skip-version/history, background service, expiry scheduler | One session check, one session-only dismissal, and a bounded live preparation satisfy the request. |
| Cross-process lock, reusable authorization registry, generic settings/migration framework | The current callers need in-process admission and a two-key document, not another workflow or state service. Residual interprocess races are disclosed. |
| Source editor, per-pack versions/selection, automatic restart/recovery, extra preview artifacts | These are outside accepted intent or the declared capability envelope. Settings > Packs remains the per-pack path. |

Retain expected-byte checks because a file can change during preview, deletion support because real core files can be removed, key-preserving saves because Appearance otherwise resets privacy, and the old-server write gate because new assets can mismatch loaded routes. These are concrete requirements, not speculative hardening.

## Change Surface

Only definition files are staged now. Implementation edits authoritative source and named tests/docs; generated runtime files below are produced by the existing build, never hand-edited.

| Authoritative runtime source | Exact generated destination |
| --- | --- |
| `src/skills/dude-bundle-upgrade/upgrade.mjs` | `.github/skills/dude-bundle-upgrade/upgrade.mjs` |
| `src/skills/dude-bundle-upgrade/SKILL.md` | `.github/skills/dude-bundle-upgrade/SKILL.md` |
| `src/skills/dude-bundle-upgrade/lib/release-source.mjs` | `.github/skills/dude-bundle-upgrade/lib/release-source.mjs` |
| `src/skills/dude-feature-definition/atomic-file-batch.mjs` | `.github/skills/dude-feature-definition/atomic-file-batch.mjs` |
| `src/extensions/dude/extension.mjs` | `.github/extensions/dude/extension.mjs` |
| `src/extensions/dude/lib/bundle-upgrade.mjs` | `.github/extensions/dude/lib/bundle-upgrade.mjs` |
| `src/extensions/dude/lib/upgrade-action.mjs` | `.github/extensions/dude/lib/upgrade-action.mjs` |
| `src/extensions/dude/lib/canvas-server.mjs` | `.github/extensions/dude/lib/canvas-server.mjs` |
| `src/extensions/dude/lib/canvas-preferences.mjs` | `.github/extensions/dude/lib/canvas-preferences.mjs` |
| `src/extensions/dude/lib/packs.mjs` | `.github/extensions/dude/lib/packs.mjs` |
| `src/extensions/dude/ui/assets/app.js` | `.github/extensions/dude/ui/assets/app.js` |
| `src/extensions/dude/ui/assets/app.js.LEGAL.txt` | `.github/extensions/dude/ui/assets/app.js.LEGAL.txt` |

Frontend sources `src/extensions/dude/frontend/app.jsx`, `about.jsx`, `settings.jsx`, `bundle-upgrade.jsx`, `use-canvas-data.js`, `theme.js`, and `styles.js` feed the existing UI build; they are not projected directly. Tests also have no deployed counterpart. Phases And Handoff lists each unit's exact writer paths, including docs and the five runtime hash consumers.

Engine/chat also updates `src/skills/dude-compose/compose.test.mjs`, `scripts/build-release.test.mjs`, and `docs/setup.md`; these have no generated counterparts.

After UI source changes, build with `node scripts/dude-canvas-ui/build.mjs`, then project with `node scripts/build-dev.mjs`. Engine-only work needs projection but no UI build. Keep legal text aligned with generated assets. Do not include unrelated manifest/profile changes, machine-specific pack locations/model overrides, historical design pins, or optional-pack projections.

## Verification

Use ordinary tagged upstream repositories recorded in disposable consumers' manifests, including `file:` remotes for latest-channel cases. A local-path fixture uses an explicit ref where the existing channel contract requires it. No production test server, custom endpoint, injection flag, or alternate acquisition path is added.

Fixtures must carry the implemented update capability and a supported target staging contract. An older installed-version record alone is not evidence that an old released extension already has this UI. Seed unsupported targets separately to prove a clear refusal.

| Contract | Required evidence | Existing owner paths |
| --- | --- | --- |
| US1; FR-001 through FR-011, FR-015 through FR-017; SC-001, SC-002, SC-006 | Stable/prerelease ordering, numeric comparison, annotated tags, no stable releases, invalid metadata, unavailable source, timeout, no files created, no automatic contact when off/pinned/development/unreadable, no join wait or agent send. | `upgrade.test.mjs`, `canvas-server.test.mjs`, installed-host runner |
| US2/US4; FR-024 through FR-042; SC-003, SC-004, SC-007 | Real local-upstream core/combined staging and apply, raw-byte counts including nested skill files, additions/replacements/deletions, no-op records, core-only preservation, foreign/local-source exclusion, overwrite warnings, foreign conflict, selected-pack failure, unsupported target. Drift each touched-path kind, profile, branch, and retained staged bytes; prove no writes and no second application. | `upgrade.test.mjs`, `atomic-file-batch.test.mjs`, server tests |
| FR-042 through FR-046; SC-008 | Same retained target linter before/after; existing failures accepted and disclosed; new identities and increased duplicate occurrences restore; same-count replacement still fails; abnormal/truncated/unreadable checks do not pass. Test full core/pack/metadata restoration and failed restoration reporting. | `upgrade.test.mjs`, `atomic-file-batch.test.mjs` |
| Executable-file Edge Case; FR-024, FR-029, FR-030, FR-038 through FR-046, FR-052; SC-003, SC-004, SC-007 through SC-009, SC-011 | POSIX acquisition retains `100755`; the reviewed result binds executable permissions for added/replaced files; apply uses them; a replacement without a supplied permission keeps its existing permission; caught failure restores original permissions for replacements and deletions. Prove no mode-only update for byte-identical files and no Windows behavior change. The permission tests must execute in the whole upgrade and atomic-helper suites on Ubuntu with Node 20 and 22; Windows may skip only those POSIX cases with a stated reason. | `upgrade.test.mjs`, `atomic-file-batch.test.mjs` |
| US3; FR-012 through FR-022; SC-005, SC-006 | Absent/one-key/two-key reads, no read-time write, malformed/unreadable data, one-key patch validation, opposite-key preservation, serialized saves, failed/lost response, restart/two-project reads, and no source contact from saving. After a read error, both switches wait for a successful Retry before saving; other Appearance behavior stays intact. | `canvas-server.test.mjs`, `browser.test.mjs` |
| Routes and lifetime; FR-008, FR-023, FR-034, FR-035, FR-041, FR-045 through FR-048 | Host/Origin, JSON/body limits, forged roots/commands/IDs, duplicate apply, replacement, Cancel, disconnect before/after writing, and unconfirmed process cleanup. Complete the actual fixture UI flow with zero session sends or Needs you requests. | `canvas-server.test.mjs`, both browser suites |
| US5; FR-047 through FR-051; SC-009, SC-010 | Real loaded extension replaces its own deployed files, blocks old-server mutations/assets at its write gate, handles a Windows permission failure, and reports the target version in the next session. Record unchanged HEAD/index/branch and unrelated bytes. | `scripts/dude-canvas-ui/t012-installed-host.mjs` |
| US6; FR-052 through FR-057; SC-011 | Plain/combined/dry-run reports, literal chat confirmation, same prepared bytes, declined-plan discard, deleted commands/flags refused before writes, and no automatic Git action. Preserve historical text while updating live guidance assertions. | `upgrade.test.mjs`, `scripts/current-format-contract.test.mjs` |
| FR-058 through FR-060; SC-012; all VSCs | Exact canonical mock approval before tasks/UI, then full keyboard/focus, click count, state/error transitions, complete discovery, retained selection versus query/input, screenshots, geometry, accessibility tree, reflow, contrast, and field/action provenance. Compare 052/085 continuity and the approved 072 mock. | Design owner, `browser.test.mjs`, `t011-browser.test.mjs`, installed-host follow-up |
| Atomic/helper and generated parity | Existing first-capture/first-definition/recovery regressions preserve their limits and behavior. Generated runtime/static/legal bytes agree; update the five runtime pins only. | Atomic tests, publisher regressions, `scripts/build-dev.test.mjs`, `scripts/dude-canvas-ui/build.test.mjs` |

Keep affected fixture homes isolated through `COPILOT_HOME`; no test may consume the maintainer's real privacy/appearance settings. Keep temporary and installed-host roots short on Windows and separate from long evidence paths. Record the selected Node/Git/browser versions, executed/failed/skipped counts, and cold acquisition duration/retained bytes. A wrapper pass, skip, or zero selected tests is not coverage.

For the engine-and-chat unit, run the upgrade and atomic-helper tests, the existing publisher callers affected by the additive helper change, current-format guidance contracts, and non-mutating development projection parity. The additive helper must retain first-definition rollback behavior and tracked-recovery refusal. No browser or UI-build suite is part of that unit.

For Canvas work, follow `docs/commands.md#canvas-maintainer-acceptance`. Set the configured browser and `DUDE_CANVAS_BROWSER_REQUIRED=1`; run the UI build check and both browser suites explicitly and serially:

```text
node --test scripts/dude-canvas-ui/build.test.mjs
node --test --test-concurrency=1 scripts/dude-canvas-ui/browser.test.mjs
node --test --test-concurrency=1 scripts/dude-canvas-ui/t011-browser.test.mjs
```

Run the affected real-provider, server, preference, Review, and process regressions as well. On Windows, use one Node test process per file for the wider baseline and final pass, keep `canvas-server.test.mjs` alone, and compare with a baseline scheduled the same way. Preserve existing Node 20/22 CI coverage; do not duplicate the whole browser matrix under Node 24.

Finish the automated interaction script before requesting human host smoke. Any human-only follow-up must name the remaining embedded-host behavior that the harness cannot observe, not repeat the entire acceptance script.

## Phases And Handoff

Round 1 at `.dude/specs/072-dude-canvas-bundle-upgrade/design/bundle-upgrade.html` is approved as "Round 1: One-dialog update" by the user's explicit "approved" reply at 2026-10-18T22:51:29Z. OK stays, and the declared Appearance Retry-before-saving rule is approved. The exact mock revision and approval are recorded in the spec; Ship itself supplies no visual approval.

`tasks.md` now holds four canonical units derived after that approval: completed `T004@d27e6a90` (Engine and chat), `T005@e8c42b71` (Canvas integration with the engine's apply-phase signal, replacing archived `T002@4e6c0d93`), open `T006@5f8b2c94` (Engine file permissions), and open `T003@a87d52c6` (Installed-host acceptance). The outlines below retain their implementation scope. The units are serial because Canvas consumes the engine contract, T006 follows T005's engine changes, installed-host acceptance needs that finished result, and writer sets overlap; lifecycle number 072 supplies no execution order.

### Unit 1 - Engine and chat

Outcome: one working acquisition/staging/apply path, coupled atomic deletion support, and the updated public chat contract.

Exact authoritative writers:

- `src/skills/dude-bundle-upgrade/upgrade.mjs`
- `src/skills/dude-bundle-upgrade/upgrade.test.mjs`
- `src/skills/dude-bundle-upgrade/SKILL.md`
- `src/skills/dude-bundle-upgrade/lib/release-source.mjs`
- `src/skills/dude-feature-definition/atomic-file-batch.mjs`
- `src/skills/dude-feature-definition/atomic-file-batch.test.mjs`
- `README.md`
- `docs/upgrading.md`
- `docs/commands.md`
- `scripts/current-format-contract.test.mjs`
- `src/skills/dude-compose/compose.test.mjs`
- `scripts/build-release.test.mjs`
- `docs/setup.md`

Generated writers: the exact four skill-source destinations in Change Surface, through `build-dev` only.

Acceptance: real tagged local-upstream preparation/application; exact core and combined bytes/counts; preservation, stale/no-op/unsupported-target cases; new-failure-only lint and complete caught restoration; unchanged HEAD/branch/index; atomic-helper and publisher regressions; and documented/tested command deletion. Run `node --test src/skills/dude-compose/compose.test.mjs` and, with Git for Windows first on PATH, `node --test scripts/build-release.test.mjs`. No UI build or browser suites. Covers engine parts of US1, US2, US4, and US6.

### Unit 2 - Canvas integration after mock approval

Depends on unit 1 and the exact approved mock. Outcome: the complete notice, About/privacy, one-dialog update, and old-session handoff applied to current Canvas.

Exact authoritative writers:

- `src/extensions/dude/extension.mjs`
- `src/extensions/dude/lib/bundle-upgrade.mjs`
- `src/extensions/dude/lib/upgrade-action.mjs`
- `src/extensions/dude/lib/canvas-server.mjs`
- `src/extensions/dude/lib/canvas-preferences.mjs`
- `src/extensions/dude/lib/packs.mjs`
- `src/extensions/dude/canvas-server.test.mjs`
- `src/extensions/dude/frontend/app.jsx`
- `src/extensions/dude/frontend/about.jsx`
- `src/extensions/dude/frontend/settings.jsx`
- `src/extensions/dude/frontend/bundle-upgrade.jsx`
- `src/extensions/dude/frontend/use-canvas-data.js`
- `src/extensions/dude/frontend/theme.js`
- `src/extensions/dude/frontend/styles.js`
- `src/extensions/dude/ui/assets/app.js`
- `src/extensions/dude/ui/assets/app.js.LEGAL.txt`
- `docs/commands.md`
- `scripts/build-dev.test.mjs`
- `scripts/dude-canvas-ui/build.test.mjs`
- `scripts/dude-canvas-ui/browser.test.mjs`
- `scripts/dude-canvas-ui/t011-browser.test.mjs`
- `scripts/dude-canvas-ui/t012-installed-host.mjs`
- `src/skills/dude-bundle-upgrade/upgrade.mjs`
- `src/skills/dude-bundle-upgrade/upgrade.test.mjs`

The two `ui/assets` writers are build outputs, not hand-edited source. Generated writers: the exact six extension/runtime modules, two asset destinations, and `.github/skills/dude-bundle-upgrade/upgrade.mjs` in Change Surface, through the scoped UI build and development projection. Frontend sources and tests are never projected directly.

Acceptance: closed-route negatives, real fixture notice-to-new-session flow, one OK, zero agent sends/requests, preference/opposite-key preservation, no background contact when off, cancellation/freshness/restoration honesty, and the old-server asset gate. Complete keyboard/focus/error/reflow/contrast and provenance evidence against the approved mock. Run the UI build check and both required-browser suites explicitly and serially. Update the five runtime pins in `scripts/build-dev.test.mjs` and the four named Canvas runners, not historical mock pins. With Git for Windows first on PATH, run `node --test src/skills/dude-bundle-upgrade/upgrade.test.mjs` on Windows and `node --test scripts/build-release.test.mjs`. Run the same whole `upgrade.test.mjs` file on Ubuntu with Node 20 and Node 22 (for example under WSL or a container, from a copy on the Linux filesystem). All these engine checks must pass, compared with T004@d27e6a90's final accepted results. Covers Canvas parts of US1 through US5 and every visual criterion.

### Unit 3 - Engine file permissions

Depends on `T005@e8c42b71` (unit 2). `T006@5f8b2c94` keeps executable release files executable through acquisition and reviewed application, preserves an existing replacement's permission when the caller supplies none, and restores original file permissions after a caught failure. It implements sections 2 and 4 and the executable-file Edge Case without changing the engine's other design.

Exact authoritative writers:

- `src/skills/dude-bundle-upgrade/lib/release-source.mjs`
- `src/skills/dude-bundle-upgrade/upgrade.mjs`
- `src/skills/dude-bundle-upgrade/upgrade.test.mjs`
- `src/skills/dude-feature-definition/atomic-file-batch.mjs`
- `src/skills/dude-feature-definition/atomic-file-batch.test.mjs`

Exact generated writers, through `node scripts/build-dev.mjs` only:

- `.github/skills/dude-bundle-upgrade/lib/release-source.mjs`
- `.github/skills/dude-bundle-upgrade/upgrade.mjs`
- `.github/skills/dude-feature-definition/atomic-file-batch.mjs`

Acceptance: from the repository root in Windows PowerShell, run `node scripts/build-dev.mjs`, then `node --test scripts/build-dev.test.mjs` for parity. Set Git for Windows first on PATH with `$env:PATH = 'C:\Program Files\Git\cmd;C:\Program Files\Git\usr\bin;' + $env:PATH`, then run the whole `node --test src/skills/dude-bundle-upgrade/upgrade.test.mjs` and `node --test scripts/build-release.test.mjs`, each in its own process. Run `node --test src/skills/dude-feature-definition/atomic-file-batch.test.mjs`. Run each unchanged caller regression in its own process: `node --test src/skills/dude-feature-definition/publish-first-definition.test.mjs`, `node --test src/skills/dude-engine/lib/chronological-identity.test.mjs`, `node --test src/skills/dude-work/recovery.test.mjs`, and `node --test src/skills/dude-work/host-adapter.test.mjs`. Also run `node --test scripts/current-format-contract.test.mjs`, `node --test src/skills/dude-compose/compose.test.mjs`, zero-failure `node .github/skills/dude-lint/lint.mjs .`, and `node .github/skills/dude-compose/compose.mjs verify`.

On Ubuntu with Node 20 and Node 22, run the whole `upgrade.test.mjs` and `atomic-file-batch.test.mjs` files separately from a Linux-filesystem copy under a container or WSL. The new permission tests must actually execute there; Windows may skip them with a stated POSIX-only reason. Prove executable acquisition, reviewed permission binding, executable additions/replacements, the no-permission replacement default, and original-permission restoration for replacements and deletions. Byte-identical files get no mode-only update; other permission behavior and Windows behavior stay unchanged. Limit the task-start implementation delta to the eight writers above. Record executed/failed/skipped/cancelled counts and test names, and compare with T004's and T005's final accepted engine results. No UI build, browser-test rewrite, pack-source edit, or caller-regression edit belongs to this unit.

### Unit 4 - Installed-host acceptance

Depends on unit 3. Exact writers: `scripts/dude-canvas-ui/t012-installed-host.mjs` and `src/extensions/dude/a2a.test.mjs`; the latter may only add a copy of `src/skills/dude-bundle-upgrade/`, excluding its tests, to `copiedExtensionHarness()`'s disposable tree, with existing assertions unchanged.

Outcome and acceptance: exercise the real loaded extension updating its own deployed files in a disposable consumer, including Windows replacement/permission behavior and a new session reporting the target version. Observe the asset/action handoff, file restoration when required, unchanged HEAD/index/branch, preserved unrelated files, and zero agent turns. The harness change and its actual run form this unit; an emulator-only result is insufficient. No UI rebuild or development projection write belongs to this unit. After unit 3 completes, run the exact serial required-browser list in T005 acceptance check 3 once on the final runtime, UI, and browser-test bytes, as verification rather than a writer action; T003 checks 1 and 4 govern its environment, Windows animation record, retained evidence, and baseline comparison.

For release observation, propose the authorized maintainer as observer of the first disposable-consumer update through its next session. Baseline/signals are the unchanged HEAD/index/branch, preserved unrelated bytes, zero agent turns, truthful disk/running versions, and confirmed child cleanup. Stop on unexpected writes, uncertain restoration/cleanup, or runtime/UI mismatch; do not replay automatically. This proposes an observation window, not deployment or Git permission.

Definition publication, authoritative ownership recheck, execution/reconciliation state, independent verification/review, and design close remain with their existing owners. The coordinator applies the execution half after verifying the stage.

## Risks And Reversibility

- Cold Git acquisition may be slower or larger than the earlier ZIP proposal, especially without filtering support. Enforce the chosen bounds and measure Windows/Ubuntu behavior; do not advertise archive speed or digest verification.
- Canvas credential isolation may make private or enterprise sources unavailable. Foreground chat can use the user's ordinary Git environment; no background credential prompting, credential editor, or second download path is added.
- Only targets with the staging contract support this workflow. Older target engines and old prepared-plan formats require a fresh supported target/preview, not a compatibility fallback.
- The running extension may encounter Windows locks, permission failures, or mixed-runtime hazards. Temporary execution and the in-process asset gate need installed-host proof. Independently launched writers are not covered by a cross-process lock.
- Expected-content checks do not eliminate writes racing after the final check, hard-kill interruption, failed restoration, or unconfirmed process cleanup. Report uncertain paths and retain material when cleanup cannot be confirmed.
- Successful confirmation can destroy pre-existing uncommitted edits in owned files. The warning is mandatory; selective Git discard/revert is not recovery of bytes Git never held.
- The expanded preference document is readable by the updated runtime and accepts the older valid one-key form, but an older runtime may reject the new two-key form. Separate-process saves can still race. Do not describe in-process serialization as cross-version or cross-process synchronization.

Before confirmation, Cancel/discard is reversible and leaves project files alone. Caught application failures restore the declared preimages; after success, the user reviews and commits or selectively discards the update. Reverting a later user commit is ordinary Git work, not an upgrade rollback command. Removing/reverting this feature does not automatically remove the per-user preference file, undo its saved choice, migrate old readers, or recover overwritten uncommitted customizations.
