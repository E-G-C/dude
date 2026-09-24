# Implementation Plan: Dude Canvas Settings

**Specification:** `.dude/specs/063-dude-canvas-settings/spec.md`
**Intent owner:** `.dude/ideas/063-dude-canvas-settings.md`

## Approach

Add one pack-only Settings surface to the current Canvas shell. Read through the existing Compose engine, send only an explicit install/remove/refresh request to the joined coordinator, and let that coordinator perform its normal preview, permission, application, and verification flow. Reuse Needs You for confirmation and return the pack result through a bounded provider acknowledgment plus authoritative profile reread.

Replace the rejected stacked page with one Overview-style browser: Installed/Available tabs, an obvious Use case/Clear toolbar, one five-row result table, a pinned pager, and one selected-pack detail. Filter the complete active context before paging, reusing Compose's exact `use_cases` membership and configured source resolution. These view actions introduce neither new fetches nor operation authority.

This wiring is planned feature work. The current frontend has no Settings destination or pack-request route. The original right-panel compact browser has explicit user approval, bound to the exact primary artifact and hash in the spec. The phases below now map to proposed canonical tasks; neither this definition nor the visual approval authorizes implementation or Work.

## Technical Context

| Field | Chosen basis |
| --- | --- |
| Language/Version | JavaScript ES modules and React JSX; the scoped maintainer package requires Node >=20. Use Node 22+ for the existing required-browser acceptance harness. |
| Primary Dependencies | Existing `scripts/dude-canvas-ui/package.json`: React/React DOM 19.2.8, Fluent UI React components 9.74.7, and esbuild 0.28.2. Reuse the existing Fluent icon import and lockfile; no new framework, theme, or dependency. |
| Storage | `.dude/metadata/profile.md` remains installed authority. Catalog source follows current Compose resolution. Context, tag, page, selected pack, and request receipts are transient; no new durable state, catalog cache, or profile fields. |
| Testing | Existing `node:test` suites, Canvas browser/provider fixtures, the installed-host driver, Compose tests, and build/static/legal checks. Installed-host acceptance uses the Windows app SDK, installed CLI 1.0.87-0, Node v24.21.0, and Edge; the POSIX-only browser case runs under user-installed WSL (or Docker) with Linux Chromium. All pack mutations used for validation belong in disposable bundles. |
| Target Platform | The existing single Dude Canvas joined to the foreground Copilot session, served by its loopback provider. Test 360/768/1440 CSS pixels and 200% reflow/zoom. The 719/720 transition changes label expansion only; navigation stays vertical on the left. |
| Project Type | Bundled extension with authored frontend, committed built UI, generated dogfood core, and core-only release projection. |
| Performance Goals | Preserve current acquisition/resource limits, coalesced reads, and enforced bundle-size ceiling. Read the complete catalog on demand; filter/page the admitted snapshot without per-click fetches, per-row reads, polling, backend search, or a new cache. Pagination limits visible rows, not source acquisition or correctness coverage. |
| Constraints | Existing ownership, exact consent, source freshness, safe-file, and caught-failure rollback rules remain in force. Core must not import optional installed pack code. Settings is pack management only. |

## Verified Reuse Map

| Source | Bounded use or change |
| --- | --- |
| `src/extensions/dude/frontend/app.jsx` | Extend the current four destinations with a separate Settings footer entry. Preserve `navigate`, selected work, task inspection, drafts, and retained Review lifetimes. |
| `src/extensions/dude/frontend/settings.jsx` (new) | Compose two mutually exclusive contexts, a visible metadata filter, five-row paging in both, and one selected-pack side pane/overlay with the existing three request actions. Keep operation authority out of the component. |
| `src/extensions/dude/frontend/use-canvas-data.js` | Extend the closed API owner with on-demand pack reads and request submission; reuse authority keys, epochs, send locks, and provider-event refresh. |
| `src/extensions/dude/frontend/styles.js` | Apply the approved pack page and user-directed vertical-left rail geometry. Retain 48px compact/208px inline expansion and a 260px left overlay bounded by available width; remove the inherited narrow horizontal orientation. `theme.js` remains the appearance owner, without a new preference. |
| `src/extensions/dude/frontend/needs-you.jsx`, `frontend/review.jsx` | Reuse existing permission forms, response status, preview eligibility, and Review. No second consent form, simulated acknowledgment, or annotation engine. |
| `src/extensions/dude/lib/canvas-server.mjs` | Add pack-only read access and one closed pack-request route under the existing loopback trust, body, root, and lifetime gates. |
| `src/extensions/dude/lib/needs-you.mjs` | Reuse idle admission and transient single-use receipt mechanics, adding only the pack request/result cases described below. Preserve existing capture and response contracts. |
| `src/extensions/dude/extension.mjs` | Keep the joined foreground session and existing provider tool registration; no second session or background agent. |
| `src/skills/dude-compose/compose.mjs` | Use `cmdList` and `cmdStatus` for reads. The coordinator retains `cmdAdd`, `cmdRemove`, `cmdPreviewRefresh`, and `cmdRefresh`; HTTP never applies them. |
| `src/skills/dude-engine/lib/profile.mjs` | Reuse installed-map parsing and safe recorded-file validation; do not add another profile parser or infer membership from disk residue. |
| `src/skills/dude-compose/SKILL.md`, `docs/commands.md` | Document the bounded Canvas request/result handoff and Settings journey during implementation; retain normal Compose permission and lint requirements. |

The supplied implementation-owner capability declaration is supported by `extension.mjs` joining the session and `needs-you.mjs` using explicit idle `session.send({prompt, mode:'immediate'})` with message-ID/idle-delivery reconciliation. This establishes a source-level path for the feature, not a tested pack round trip. Current idea-capture acknowledgment requires a canonical idea file and cannot acknowledge a pack change unchanged.

## Chosen UI Composition

The user rejected the combined long page. Use `.dude/specs/063-dude-canvas-settings/design/references/dude-overview-user-reference.png` as context and the actual `Overview`, `WorkResults`, and `WorkFinder` in `src/extensions/dude/frontend/app.jsx` as prior art. The relevant styles are `overview`, `overviewHeader`, `workSummary`, `workScroll`, `workHeader`, `workRow`, and `workSelected` in `frontend/styles.js`. Reuse their compact browser rhythm and token treatment, not the work-specific Status/Progress columns or a new pack-search input.

Use Fluent v9 TabList/Tab semantics for Installed and Available, Field/Dropdown for Use case, Button for Clear/reload/paging, and single-selection DataGrid/List presentation with a selected-details pane or OverlayDrawer in eventual product implementation. The self-contained proposal uses native semantic controls and local JavaScript; it adds no React runtime, dependency, or build. The bounded Fluent UI consultation is design input, not ownership or approval.

Within Settings, default to Installed/All use cases/page 1 with no selection. Both context tabs stay visible; there is no combined All context. Put the labeled filter and Clear directly underneath, followed by one compact table/list with Pack and Use cases only. Keep counts and a pager outside its scrolling result body. Descriptions, files, tools, source provenance, and actions belong to one selected detail, not every row. Remove the permanent explanatory dock and stacked section navigation.

At wide widths, selected detail occupies a 320px right pane. Below the existing 1100px detail breakpoint it becomes a right-side overlay with a close/back action, independent body scrolling, native modal inertness, and focus return. No selection means no empty permanent detail column. Pointer or Enter opens a row's detail; Escape/Close returns to that row. Installed detail retains Refresh pack and Remove; Available detail retains Install. The mock opens unsent owner-flow layouts; production connects those actions to the existing coordinator confirmation flow below, not a new consent surface.

Keep the WinUI-style Settings footer and the user-directed vertical-left rail at every width. Retain 48px compact/208px inline expansion and the left navigation overlay below 720px. The top command bar and global work finder remain separate; Canvas's overall initial destination remains Overview. At extreme narrow widths the mock may present the existing work-finder link and pager buttons as named icons to preserve control space, without adding search functionality or dropping a control.

Use a viewport-bound flex/grid composition: compact heading/tabs/toolbar, a flexible result scroller, and a pinned pager. Selected detail has its own bounded scroller. Collapsible mock-only explanation/scenarios stay outside product chrome with the existing 20dvh cap and accessible scrolling. A concise status announcement replaces repeated footer prose. Small-screen rows may use Overview's compact-list treatment; preserve at least a 24px visible hit area and room for a complete row trigger at 180x450 rather than shrinking type or targets.

Preserve the existing navigation and operation dialog Tab-edge loops. Apply the same first/last-control loop to a modal detail drawer, never to the wide nonmodal pane. A request modal opened from the drawer is the top layer: Escape closes it and returns to its detail action before the drawer itself closes. Defer any underlying native detail-mode transition while that operation modal is open, then reconcile against the current width on return; narrow CSS must still take the detail out of grid flow immediately so a retained wide pane cannot cause background overflow. Do not add global focus redirection or timing workarounds.

Keep one data-read action, labeled Reload snapshot in the mock and unambiguously distinguished from Refresh pack. It retains the active context, resets All/page 1, and clears selection. There are no duplicated reload controls, future-feature placeholders, or production source-picker controls.

## Pack Reads

Add `GET /api/packs` as a read-only, root-bound endpoint. Use the server's existing workspace root and the normal Compose library/source resolution, never browser-provided root, paths, source, ref, or command flags.

- `cmdList` supplies `packs` with `name`, `description`, `use_cases`, and `installed`, plus catalog `origin`. `cmdStatus` supplies `enabled_packs` and the authoritative `installed` map with `files` and `source`.
- Combine by exact pack name. Keep installed-only entries visible; mark missing catalog metadata rather than manufacturing descriptions or dropping them.
- Preserve independent installed/catalog errors. A catalog error must not discard a successful installed read. Invalid installed authority prevents membership-dependent requests rather than becoming an empty map.
- Bind the response to the current workspace and profile revision, checking that the profile did not change across the two reads. Do not mix one read's membership with another read's file list. Use the shared profile/path validation.
- A source identity identifies origin, not integrity of installed bytes. Show only recorded local/remote source fields; do not invent versions, update availability, commit IDs for local sources, or modification times.

The existing catalog fallback can fetch the configured upstream when no local catalog exists; report that source and any failure. Do not add a mirror/cache or expose source overrides. Perform reads only while needed by Settings, on an explicit reload, or for an admitted request/result recheck. Integrate their adoption with the existing hook epochs and provider events; discard late responses after workspace/lifetime changes. Read refresh is safe to repeat; pack requests are not.

Keep the full `cmdList` result in the existing current-read state. The existing `list --use-case <id>` is prior art for exact membership, not a reason to fetch a new remote catalog every time the user changes the UI facet. No additional endpoint, query service, or persistent preference is needed.

## Catalog View Rules

| Concern | Implementation |
| --- | --- |
| Matching and order | Join the complete installed map to catalog metadata by exact name for Installed; derive Available from all catalog entries absent from installed membership. Build tag options from the full readable catalog. Filter the complete active set with exact `use_cases.includes(tag)` before five-row slicing. Preserve profile order for Installed and catalog order for Available. All includes installed-only records; specific tags include known matches and disclose unknown-tag exclusions. |
| View and selection | Keep only context, tag, page, and one selected pack name in tab-local view state. Initial context is Installed. Context changes reset All/page 1 and clear detail. Source/reload replacement retains context but resets All/page 1 and clears detail. Tag/Clear changes reset page 1; pages retain the tag. Resolve selection from the new visible page before exposing any detail/action; close it if excluded. |
| Focus | Use native tab semantics with Left/Right/Home/End for context selection. Rows are keyboard reachable and Enter opens detail. Paging focuses the result heading; filter changes retain its focus and Clear returns focus to Use case. Detail Close/Escape clears selection and restores its row; view-driven invalidation leaves focus with the initiating control, not a removed row. Wide detail is nonmodal; narrow detail and nested operation dialogs keep focus within the top layer. |
| Counts and emptiness | Tab totals are unfiltered Installed and eligible Available counts, never catalog-total aliases. Report the active matching range/page, with explicit incomplete-tag coverage where needed. Keep the pager in place with disabled boundaries; use No pages or Unavailable instead of page 1 of 0. Empty/error copy occupies the result body while tabs/filter/Clear remain visible. Full catalog totals and source origin live in provenance/detail. |
| Coverage | Catalog loading/failure disables the tag facet, makes Available unknown/nonactionable, and leaves readable Installed names/files/source accessible through its tab. Missing descriptions/tags/tools remain unavailable. Unknown tags are not asserted to be absent or to match a selected tag. Operation admission remains FR-008 through FR-023. |
| Provenance | Detail distinguishes current catalog `origin` from the installed entry's recorded source. Keep values inert and full paths readable. Tools, destinations, and refresh impacts need their own evidence. No progress/version/update columns or borrowed remote metadata. |

## Discovery Preview Evidence

The coordinator supplied complete existing-composer outputs in session evidence files `063-discovery-local-catalog.json` and `063-discovery-remote-catalog.json`. Both contain 18 catalog records and nine installed names; the preview must derive its counts from those records. The local origin is `local`. The fetched remote origin is `https://github.com/E-G-C/dude @ 80f468f281398f39b9c547f279c9ebc17bfa1308`. The remote read used the existing source/ref arguments and an owned absent library path; this proves that read, not new runtime Settings wiring.

Embed both complete outputs inline in the self-contained mock alongside its unchanged profile snapshot. Do not load external JSON assets or libraries. Preserve source differences, including the remote writing-pack description; do not alias the remote capture to local metadata. Retain existing locally captured `requires.tools` separately with local-manifest provenance. Those values are not remote evidence: remote tools and all operation impact sets remain explicitly unacquired.

Keep the scenario selector and mock-wide provenance in a compact, initially collapsed explanation outside the product. It offers captured local/remote and illustrated remote loading/failure; production has no corresponding source picker. Loading/failure does not invent Available rows or counts, while Installed remains inspectable. Reload snapshot restores embedded data (remote after loading/failure), retains context, resets All/page 1, clears detail, and announces that no live read occurred. Keep the 20dvh cap, accessible explanation scrolling, visible-bottom Settings, and modal focus boundaries. The user's screenshot is a reference link only, not an image-backed UI or required render asset.

## Bounded Request And Result Contract

Add one `POST /api/packs/request` route with closed prepare/submit variants for `install`, `remove`, or `refresh` and an exact pack name. Both variants exist only to serve one explicit UI action: prepare obtains a target-bound transient receipt; submit consumes it. Reject unknown fields and arbitrary prompts, shell text, root/path/source overrides, force flags, and other operations.

1. **Admit.** The joined provider checks current root/session/generation, exact pack eligibility, observed idle state, absence of waiting requests and queued input, and absence of unreconciled idle sends. Reuse the current provider lifecycle and queue checks before receipt allocation and immediately before send. Cross-tab and capture/pack races share this exclusion; do not introduce a scheduler or persistent lock.
2. **Send once.** Burn the receipt before the asynchronous boundary. Build a fixed coordinator request containing only the validated operation, pack identity, and provider-issued correlation data. Use explicit immediate delivery and the existing message-ID/idle-event reconciliation pattern. A timeout or mismatched delivery is uncertain and cannot be replayed. Do not route pack requests through `captureIdea` or fabricate an idea.
3. **Continue with the owner.** The coordinator recognizes the pack request and follows `dude-compose`. It may publish the existing session-scoped Needs You permission with exact operation, target revisions, consequences, eligibility, and literal confirmation. An outstanding pack receipt prevents a new idle action, not the permission reply or acknowledgment needed to finish that same request.
4. **Acknowledge the pack result.** Extend the existing provider tool with a pack-only result case, bound to the original receipt, coordinator identity, operation, pack, workspace, session, and generation. This case accepts the owner's operation outcome and current profile source, not arbitrary file evidence or free-form chat as a verdict. Validate tool invocation and single consumption as for existing acknowledgment. Do not weaken the idea-specific capture branch.
5. **Reread before display.** The provider rereads the validated installed profile and returns its fresh revision/state with the correlated result. Install requires the expected entry/files/source; remove requires absence of that membership; refresh requires the owner's actual refresh result and agreement with the recorded resulting files/source. A refresh can legitimately leave membership and bytes unchanged, so a membership comparison alone proves nothing.

Expose the receipt's current phase through the existing provider feed, without a new durable log or restore mechanism. Admission/delivery and owner acceptance remain distinct from Applied. Failed, declined, unavailable, stale, and uncertain results keep those meanings even if the latest profile independently shows an installed pack. If the provider generation ends, reread state for orientation without reconstructing request authority or resending.

## Confirmation And Application

The coordinator, never the HTTP handler, executes the normal Compose path:

| Operation | Existing basis and required check |
| --- | --- |
| Install | Confirm uninstalled membership, source, prospective namespaced artifacts, required tools, and destination safety before `cmdAdd`; no implicit `--force`. |
| Remove | Preview `installed.<name>.files` and confirm that exact safe set before `cmdRemove`. Catalog absence does not block this authority, and unrecorded residue never expands it. |
| Refresh | Obtain `cmdPreviewRefresh`'s `replaced`, `added`, `removed`, `files`, and `source`; warn about overwriting generated edits and retain the `dude-local-*` customization guidance. After consent, use ordinary `cmdRefresh`, including its normal reprojection when bytes appear unchanged. |

Refresh dry-run is an impact report, not authorization or an apply token: it discards its staging, and later refresh prepares again. Before application, re-establish the reviewed profile, source, target revisions, and change set through the existing owner freshness checks. For remote sources, retain the reviewed resolved commit through the already supported source/ref arguments rather than silently following a moving ref. Detected drift requires a fresh preview and literal confirmation; inability to establish the required basis refuses application.

Keep the engine's final profile reauthorization, ownership/containment checks, and caught-failure rollback. These checks do not claim an inherently preview-bound or crash-proof transaction. Add/remove failure text and refresh's mutation result must not be inflated into stronger recovery guarantees: if restoration cannot be established, report uncertainty. The owner runs the normal post-operation lint/verification and reports that result; a successful send or a changed profile is not a substitute.

## Guardrail Check

| Existing rule | Plan treatment |
| --- | --- |
| Canvas continuity and mock approval | The original right-panel primary has exact-preview approval recorded in the spec. Preserve it and the unselected variants, compare future implementation with 052/062 and the approved 063 direction, and retain 057 interactions. Work remains separately authorized. |
| Smallest proven capability; core independent of optional packs | One destination, two bounded HTTP surfaces, and pack-only provider cases over the existing core composer. No generic runner, extension framework, second tracker, or persistent store. |
| Installed map and exact safe files are authority | Shared parser and composer own membership, removals, refresh, and refusal; no raw directory scan or profile editing. |
| No dead affordances or invented state | Source-backed rows, real local disclosure, explicit availability, and separate request/consent/result meanings. Copy-to-chat alone is not the accepted primary action. |
| Source and validation discipline | Author in `src/`; build Canvas before projecting generated `.github/` core. Validate pack operations in disposable bundles, not this dogfood workspace. |

Existing project/bundle guardrails are sufficient; no candidate ratification or memory change is proposed.

## Phases And Acceptance Coverage

These phases map to the proposed canonical units in `tasks.md`. They describe future implementation and acceptance, not execution state or permission to begin Work.

### Approved visual baseline

The user's new direct chat choice settles and approves the original right-panel compact browser at `.dude/specs/063-dude-canvas-settings/design/pack-management.html`; the spec records the literal approval and exact SHA-256 binding. Preserve that HTML unchanged, the unselected `design/pack-management-left-panel.html`, rejected v4, v1/v2/v3, and all earlier evidence. Earlier outside-answer and comparison feedback remains historical feedback, not retroactive approval.

The coordinator-reported 157 passing static checks and independent review apply only to the unchanged approved mock revision. Task derivation requires no new mock rendering and establishes no product verification. The frozen captures, mock-only scenario controls, and unsent layouts are reference material; implementation must use the live read/request/result boundaries below.

This package declares functional and visual acceptance checks, not an `EvaluationContract` objective. No objective registry is added.

### Phase 1 - Settings and authoritative reads

Proposed units: `T001@c7f3a1d9` for the read boundary and `T002@e4b8d2a6` for the approved browser/detail surface.

Implement the approved browser/detail composition, `GET /api/packs`, and hook integration. Cover US1, FR-001 through FR-010, FR-024 through FR-033, and SC-001/005/006/007/008. Verify both complete-context filters/pagers, reset and selection invalidation, unknown-tag coverage, independent sources, and compactness/focus through the existing disposable fixtures.

### Phase 2 - Pack requests, permission, and results

Proposed units: `T003@a9d1f6c3` for the provider/owner contract and `T004@b2e7c4f8` for the three user action journeys.

Implement the single pack-request route and provider acknowledgment case, connect all three actions to the existing coordinator flow, and document the owner handoff. Cover US2 through US4 and FR-011 through FR-023. Verify success, literal decline, invalid confirmation, stale targets, queued input, waiter/busy races, cross-tab duplicates, uncertain send, mismatched acknowledgment, provider replacement, and caught application failures. No pack engine rewrite or general command endpoint is planned.

### Phase 3 - Integrated acceptance and projection parity

Proposed units: `T005@d6a3b9e1` for documentation/projection parity and `T006@f8c2e5a7` for independent integrated acceptance of the final product bytes.

The user said, "The mac machine is not available," and selected `windows-host-plus-wsl` ("Port to Windows, and I'll install WSL for the POSIX case") through owner-qualified Needs You receipt `56ecad2f-ea6f-4b3a-8b5f-5991436e2646`. This changes the verification method only. T006 retains its integrated-acceptance meaning and durable key; no product requirement, approved design, completed task, or user-controlled idea text changes.

Extend `src/extensions/dude/{canvas-server,needs-you}.test.mjs`, `src/skills/dude-compose/compose.test.mjs` where the integration exercises existing semantics, and `scripts/dude-canvas-ui/{browser,t011-browser}.test.mjs`. Retain the in-progress `createPackModel` and `driveInstalledPackRoundTrip` work in `scripts/dude-canvas-ui/t012-installed-host.mjs`, together with the current uncommitted browser-test and documentation edits, as the starting point. Run that pack round trip through the Windows installed app SDK and CLI 1.0.87-0. Verify trusted-origin/body validation, safe pack-name handling, source/profile freshness, exact response correlation, and authoritative rereads rather than mocked success labels.

Keep the port inside the existing acceptance driver and its fixtures. Add a `DUDE_COPILOT_SDK` override for the directory containing `index.js`; retain `DUDE_COPILOT_CLI`, `DUDE_COPILOT_RUNTIME`, `COPILOT_CLI_RESOLVED_DIST_DIR`, and browser/evidence overrides. Use configured or platform-resolved paths, Windows-safe file URLs, process arguments, and isolated home/temp handling where the run requires them. Keep `/usr/bin/sdef` and app-bundle probing Darwin-only, with an explicit not-applicable diagnostic on Windows rather than fabricated evidence. Preserve the macOS defaults and code path without regression; check affected branches and fixtures without claiming a macOS run. Adjust existing scripted owner-tool calls only as needed for the installed Windows CLI. Add no new harness, product architecture, dependency, general platform layer, or automatic prerequisite installation. Update `docs/commands.md#canvas-maintainer-acceptance` within T006 to describe the Windows invocation, split browser coverage, and remaining gaps.

After the bounded port, invoke the existing driver from the repository root in PowerShell using the observed installed paths:

```powershell
$env:DUDE_COPILOT_SDK = 'C:\Users\EG\AppData\Local\Programs\GitHub Copilot\copilot-sdk'
$env:DUDE_COPILOT_CLI = 'C:\Users\EG\AppData\Local\github-copilot-sdk\cli\1.0.87-0\copilot.exe'
$env:COPILOT_CLI_RESOLVED_DIST_DIR = 'C:\Users\EG\AppData\Local\copilot\pkg\win32-x64\1.0.87-0'
$env:DUDE_COPILOT_RUNTIME = Join-Path $env:COPILOT_CLI_RESOLVED_DIST_DIR 'index.js'
$env:DUDE_CANVAS_BROWSER = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$env:DUDE_CANVAS_BROWSER_REQUIRED = '1'
node scripts/dude-canvas-ui/t012-installed-host.mjs
```

The SDK override is planned driver work, not an already working command. `copilot` is not on PATH. The coordinator observed Node v24.21.0 and Edge 154.0.4258.24; record the actual SDK, launcher, resolved runtime, Node, and browser identities from the acceptance run.

Run the applicable maintainer sequence in `docs/commands.md#canvas-maintainer-acceptance`: required-browser suites explicitly and serially on Windows, plus build/static/legal and source/generated/release parity. Rebuild `src/extensions/dude/ui/` with `scripts/dude-canvas-ui/build.mjs` before `scripts/build-dev.mjs`; never hand-edit generated core.

Once the user installs WSL (or Docker) and Linux Chromium, run the POSIX-only case from a disposable copy or clone inside the Linux filesystem, containing the same final source, tests, and product bytes, including the uncommitted T006 work. Install Linux-scoped dependencies there with `npm ci --prefix scripts/dude-canvas-ui`; do not share Windows `node_modules`. With Node 22+ and `DUDE_CANVAS_BROWSER` set to the observed Linux Chromium executable, run:

```bash
DUDE_CANVAS_BROWSER_REQUIRED=1 node --test --test-concurrency=1 --test-reporter=tap \
  --test-name-pattern='^T012 browser: published capture warnings are closed, accessible, and retain save-only markup$' \
  scripts/dude-canvas-ui/t011-browser.test.mjs
```

Keep the Windows skip visible and link it to a real executed, passing POSIX case with zero skips for that selected case. This split covers the required regression; the Windows skip alone never satisfies it. Report pattern-excluded cases separately, without claiming their execution. No required browser case may remain covered only by a skip. Retain the baseline-relative rule and prerequisite limits below.

Before requesting human host smoke, the harness must cover the complete user-visible script with realistic data: cog click count, rail expansion/narrow dismissal, pack discovery/detail, all three request/confirmation/result journeys, keyboard/focus, screenshots, geometry, accessibility tree, contrast, and error transitions. Include the existing finder/Clear, Now/Tasks, response/capture, and pinned Review regression journeys. Record actual host/SDK identities and pass/fail/skip counts; ask humans only for embedded-host behavior the harness cannot automate.

The supplied v3 and v4 checks remain historical baselines for metadata, safety, navigation, and focus mechanisms. V4's reported 392 passing checks did not make its UX acceptable: the user explicitly rejected it. Do not carry forward assertions that require stacked lists, always-visible Installed rows, or operations on every row.

Fresh evidence must show exactly one active result table, Installed by default, both context tabs and Use case/Clear visible before scrolling, five-row paging in both contexts, and correct totals/ranges. Traverse both contexts in each source, filter `ui`, and distinguish `bundle-authoring` in Installed from its zero Available matches. Prove that context changes and excluded selections remove old actions, while valid surviving selections remain exact. Open detail by pointer/Enter, exercise all three actions from detail, and test Escape/Close/backdrop focus return, nested request-modal return, and wide/narrow detail transitions.

Inspect implementation geometry at 360/768/1440 and 180x450 in both themes: toolbar/pager and visible-bottom Settings must remain usable, results must have a real visible/hit-testable row area, and full paths/descriptions must be reachable in the separate right detail scroller. Verify metadata/source separation, loading/failure/recovery, contrast, and accessibility-tree behavior against actual runtime reads. The mock's explanation-open/closed, remote writing-description, and no-network/storage/mutation checks remain revision-specific preview evidence, not production controls or a required rerender for task derivation. Keep CDP scaling/halved-layout proxies distinct from browser-chrome/OS zoom and live product evidence. Fresh rendering and independent review of the product implementation remain required.

## Risks And Evidence Limits

- Use the Windows installed app SDK and CLI 1.0.87-0 to establish the installed-host pack round-trip evidence. The run must execute the real request, owner permission, engine, acknowledgment, and authoritative reread in a disposable bundle; session-send success, SDK import, or host startup alone is insufficient. The existing unexecuted pack fixture and the older Darwin run establish no new pack result. This remains deterministic installed-owner execution through a separately driven browser, not unscripted model reasoning or desktop-panel rendering.
- WSL and Docker are not installed; the user owns installation, including any admin approval or reboot. The named POSIX browser regression remains an evidence gap until it executes with Linux Chromium. Use a disposable copy or clone inside the Linux filesystem with the exact candidate bytes, not `npm ci` in the shared `/mnt/c/...` checkout: that would replace Windows `node_modules` and its platform-specific esbuild/native binaries. WSL/Docker cannot substitute for the macOS installed-host run; no Linux app SDK is available.
- The macOS machine is unavailable. Preserve its working code path, defaults, and assertions without regression, but report macOS behavior as unverified. Windows and Linux evidence cannot close that gap. Embedded-host behavior beyond the existing driver's reach remains subject to the existing human-smoke boundary after automatable coverage.
- The Windows port is limited to making the existing driver and fixtures execute on this observed host. It may expose further Windows-specific path, process, or owner-tool issues; address only those needed for the same acceptance path. New product behavior, architecture, broader platform support, or weakened assertions requires a separate scope decision. An actually unavailable SDK, CLI/runtime, browser, WSL/Docker environment, or other required prerequisite is still an evidence gap, never a passing skip.
- Keep the baseline-relative rule: failures are exempt only when they reproduce at HEAD with the identical cause and are not introduced or altered by any 063 change; exempt failures remain recorded but unfixed and do not count against 063. The user accepted the Windows `build.test.mjs` "browser launch failures retain isolated evidence..." shebang/ENOENT failure, 33 `projection.test.mjs` failures caused by installed `bd.exe` shadowing fixture `bd.cmd`, and three `current-format-contract` failures on that basis. Retain the baseline evidence, actual counts, and causes; do not suppress these failures or exempt new/different failures. Missing required acceptance evidence is not a baseline-failure exemption.
- Catalog resolution can fail or fetch current upstream content. Keep installed coverage independent, distinguish unavailable metadata from a confirmed empty read, and never reuse stale preview consent for changed source/targets. Inline local/remote snapshots are preview evidence only, not a runtime cache or a live-read guarantee.
- Refresh can replace generated edits and remove recorded artifacts. Existing caught-failure restoration is not recovery from process termination, disk loss, or an unconfirmed rollback.
- Shared navigation and provider changes can regress 057/062 behavior. Keep the listed return-state, input, receipt, and Review checks; do not rebuild those interactions.
