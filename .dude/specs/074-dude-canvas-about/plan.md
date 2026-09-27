# Plan: Dude Canvas About

Spec: `.dude/specs/074-dude-canvas-about/spec.md`
Owner: `.dude/ideas/074-dude-canvas-about.md`

Keep the addition inside existing Settings. The implementation owner has confirmed a local section chooser, read-only installation metadata, and ordinary external anchors are feasible. The user approved Classic Settings About by direct chat on 2026-09-26T01:11:26Z. The spec Revision Log binds that approval to `.dude/specs/074-dude-canvas-about/design/about.html` at SHA256 `46c7e0d7c96885b19c4bd5453fe7cf8b81968d7f2ceb36ae262a6addbc91df9e`. Apply the existing design without changing the mock.

## Technical Context

- **Language/Version**: JavaScript ES modules on Node >=20; React 19.2.8 JSX. The existing direct-CDP acceptance runners require Node 22+ with global WebSocket available.
- **Primary Dependencies**: Existing React DOM and Fluent UI v9.74.7; existing esbuild pipeline. No new dependency or dependency installation.
- **Storage**: Read `.dude/metadata/bundle-manifest.md` in the Canvas instance's workspace. Presentation state stays in the current tab; no profile field, persistent cache, or metadata write.
- **Testing**: Node's test runner, existing Edge/CDP browser suites, and the installed-host acceptance driver.
- **Target Platform**: Existing Copilot Canvas and standalone Edge acceptance on Windows; verify the real installed `copilot.exe` receiver separately from browser rendering.
- **Performance Goals**: One small local metadata read per About entry, no polling or external acquisition. Keep the existing compressed UI budget checked by `build.test.mjs`; no optimization sequence.
- **Constraints**: Recorded user mock approval, Canvas continuity, read-only scope, truthful provenance, and no private installation details in the About response or UI.

## Chosen Structure

| Surface | Narrow change |
| --- | --- |
| `src/extensions/dude/lib/about.mjs` | A small read-only manifest adapter, isolated from Compose's catalog acquisition. |
| `src/extensions/dude/lib/canvas-server.mjs` | Add one exact `GET /api/about` behind the current trust checks and instance root binding. |
| `src/extensions/dude/frontend/use-canvas-data.js` | Expose abortable `readAbout` through the existing `json` helper, outside its workspace/pack refresh loop. |
| `src/extensions/dude/frontend/settings.jsx` | Add Packs/About section navigation; keep the existing Packs body and state mounted across local section switches. |
| `src/extensions/dude/frontend/about.jsx` | Isolate About's metadata loading and read-only rows from the pack dialogs and request lifecycle. |
| `src/extensions/dude/frontend/app.jsx` | Hold the tab-local Settings section choice for shell actions/footer; preserve existing workspace and pack-return state. |
| `src/extensions/dude/frontend/styles.js` | Add only section/list/reflow styles using current tokens. Reuse `theme.js` unchanged. |

The two small About modules separate independent data and rendering concerns without refactoring Packs. Do not add a component registry, service layer, protocol, command, profile schema, or alternate manifest reader endpoint. Keep the API contract below in this plan; no supporting contract/checklist files are needed.

## Installation Data And Display Contract

The canonical manifest currently records `installed_ref: main`, `source_ref: main`, and `source_repo: https://github.com/E-G-C/dude`. The release builder records a release tag in `installed_ref` and `latest` in `source_ref`; the source manifest deliberately remains `main`. Never change the manifest to manufacture a version.

Read only that fixed file using `WORKSPACE_PATHS.BUNDLE_MANIFEST`, `resolveMutationPath`, and a regular-file check. Reject linked roots/components and non-files using the existing path rules. Decode valid UTF-8 and reuse `parseProfilePayload` from the engine's `profile.mjs` for the single fenced JSON payload; do not apply the profile schema or expose its error text.

Accept a non-array object with only `source_repo`, `source_ref`, and `installed_ref`. Require a nonblank string `source_repo`; it establishes recorded provenance but is never returned, displayed, or opened. Validate the two refs independently without coercion or fallback: absent, empty, non-string, or unsafe values become `null`. A usable ref matches `^[A-Za-z0-9][A-Za-z0-9._/+-]*$`, contains no `..` or `//`, has no empty or dot-prefixed component, and has no component ending in `.` or `.lock`. Do not trim or abbreviate accepted values. This excludes URLs, absolute paths, whitespace, control characters, and credential-shaped URL syntax.

Unreadable/unsafe files, invalid encoding, malformed JSON, multiple JSON fences, unsupported fields, or invalid provenance yield both refs as `null`. Do not read arbitrary paths, other metadata, environment values, repository HEAD, or remote releases. `readManifestSource` in Compose is unsuitable because it omits `installed_ref` and defaults the channel; change neither Compose nor upgrade's public API.

The UI displays these classifications. Stable release tags use the project's existing `^v\d+\.\d+\.\d+$` convention. Classify only the recorded value; perform no tag lookup and make no installed-byte or current remote-release claim.

| Source value | Dude version row | Recorded channel/ref row |
| --- | --- | --- |
| Stable `vX.Y.Z` tag | Exact version, such as `v1.2.3` | `Pinned release (v1.2.3)` |
| `main` | `Development (main)` | `Development (main)` |
| `latest` | `Recorded ref (latest)`; never a resolved version | `Stable releases (latest)` |
| Other usable ref | `Recorded ref (<exact ref>)` | `Recorded ref (<exact ref>)` |
| `null` | `Unavailable` | `Unavailable` |

Read each column from its own field: version from `installed_ref`, channel/ref from `source_ref`. Prerelease-shaped or hash-shaped values remain recorded refs, not claims of a stable release or verified build revision. Include the concise note `Recorded installation metadata; installed files are not verified.`

Render the product credit and the literal official repository URL from the accepted idea, independent of the manifest response. Never turn `source_repo` or a ref into a link. The canonical mock uses the observed `main` values, not the table's illustrative release fixture.

### Private Read API

Only exact `GET /api/about` is admitted: no query, path suffix, request body, root override, or alternate method. Reuse the server's current Host/Origin/fetch-metadata guard; do not extend its opaque Review-origin exception to this route.

- With a bound workspace, return `200` and exactly `{ "installedRef": "main", "sourceRef": "main" }` for the current record. Each value is a validated string or `null`; unavailable metadata is a readable `200` result with both values `null`.
- A GET body returns `400`; nonexact URLs and other methods remain unallowlisted (`404`). An unbound/ended Canvas returns a fixed `503` unavailability error. A root/lifetime change before delivery discards the old read; a still-live changed-root request returns `409`.
- Responses use the existing `sendJson` no-store behavior. Return no raw document, filesystem path, source repository, credentials, provider/session identifiers, stack, or raw parsing error.

The frontend validates the two-field response before display, renders refs as inert text, and maps transport/shape failure to fixed unavailable copy. `readAbout({ signal })` uses the current hook lifetime plus the caller's abort signal. On section exit, root change, or unmount, abort the read and ignore its late completion. A new About entry starts a fresh read and clears old displayed installation values while loading. Do not add polling, background retries, or a Reload About button.

## Settings, Focus, And Continuity

Use a Fluent `TabList` labeled `Settings sections`, with Packs and About tabs and associated panels. Keep the existing `Pack context` TabList inside Packs. Use the current compact heading rhythm rather than stacking a second large heading. Selection uses the standard tab keyboard pattern; focus remains on the activated section tab, then Tab reaches that panel's controls. Hidden content must be absent from focus and the accessibility tree.

Keep Packs mounted while changing only the local section. Pass inactive status to its existing dialog lifecycle when About is selected so neither native detail nor request dialogs remain on top. Preserve context/filter/page/selection and results scroll unless normal pack-source reconciliation changes them. On returning to Packs, restore its valid detail/request presentation using existing modal focus/return rules. Do not change the Settings-level pack-read lifetime just for a local tab switch: About neither calls `reloadPacks` nor adds catalog acquisition. Existing workspace-triggered pack reads retain their current authority and behavior.

Ordinary entry/re-entry resets the section to Packs and retains the existing Installed/All/page-1/no-selection defaults. The existing permission-return path explicitly selects Packs without discarding its retained request. Root replacement retains the existing full workspace reset. Canvas still initially opens Overview.

Hide the command-bar Reload packs control entirely on About; do not fall through to a workspace Refresh action. Keep the shell and status bar, but show only `About · Read only` in the Settings footer. Packs restores its existing action and coverage footer. Make the About body the vertical scroll area; allow the full URL and long refs to wrap, keep section navigation reachable, and scroll focused links into view.

The sole About link is an ordinary anchor to `https://github.com/E-G-C/dude`, with that visible URL, `target="_blank"`, and `rel="noopener noreferrer"`. No clipboard, host command bridge, update call, or arbitrary URL opener is needed. Link activation must not navigate the Canvas frame.

Do not alter selected work, finder query, task inspection, answer/idea drafts, current handoff authority, pack receipts, or retained Review markup. Existing notices and both design baselines stay unchanged. Update only the Settings/About usage text in `docs/commands.md` after implementation so its current Packs-only description no longer contradicts the UI.

## Delivery Sequence

The approved definition derives three sequential units. `tasks.md` lists every intended source, test, documentation, and generated writer for each unit; those lists bound the Work handoffs.

1. `T001@c47e1b20`: implement and test the fixed local manifest adapter and root-bound server route; project the changed backend into `.github/`. Acceptance is the read boundary, not a frontend or installed-host journey that does not exist yet.
2. `T002@a932d6f4`, after T001: apply the approved Settings/About surface and hook lifetime behavior, add focused rendered coverage, update the Settings/About usage text, then rebuild source UI and project the runtime. Refresh only affected runtime hash pins in the existing build/browser/T011/T012 checks.
3. `T003@e8b71c05`, after T002: extend the existing T011 production-provider and T012 installed-host drivers with About round trips, then verify the combined Canvas and installed receiver. These test-driver changes and actual-host evidence are the independent outcome of this final unit.

Use one Tester and one independent Reviewer per executed unit through ordinary Work. The first two units require their own bounded acceptance, not the final unit's production-host acceptance. No task inherits the mock's inspection results as production evidence.

Before Work, the coordinator checks the complete staged re-definition, applies its reconciliation/task-state half through the existing split-authority path, and obtains zero failures from definition lint. Approval alone is not a task claim or completion. Preserve the approved primary, captures, all reference assets, and prior feature 063 byte-for-byte; build product source, never the mock.

## Acceptance Coverage

| Coverage | Cases and evidence |
| --- | --- |
| US1; FR-004–011, FR-014; SC-001 | Release `v1.2.3` with channel `latest`; current `main/main`; another branch and prerelease-shaped ref; absent/empty/wrong-type refs; missing/malformed/multiple-fence/unsupported-key manifest; bad encoding; linked/non-file/unreadable source; unsafe and long refs. Assert no version fallback, correct labels, and surviving credit/repository. |
| Read boundary; FR-010, FR-012, FR-014; SC-004 | Exact route, method/body/query rejection, hostile Origin/Host, no bound root, abort, and root replacement. About alone starts no process, Git command, remote request, or file write, and returns no sensitive/raw fields. Keep unrelated existing Canvas refresh outside this assertion. |
| US2; FR-001–003, FR-013, FR-015–016; SC-003 | Settings -> About -> Packs with a nondefault filter/page/selection and scrolled results; ordinary leave/re-entry; hidden dialog focus; existing Pack Installed/Available, filter/paging/detail, Reload packs, request/permission/return/result journey; workspace selection, task inspection, New idea/answer drafts, and Review resume unchanged. |
| US3; FR-008–009; SC-002 | Visible URL and exact anchor attributes; pointer and keyboard activation; original Canvas URL/state retained; no prefetch. Standalone evidence does not prove embedded-host opening. |
| VSC-001–005; SC-005 | Screenshots, geometry/overflow, accessibility tree, tab/arrow/Enter/Shift+Tab focus and scroll, contrast, and loading/error transitions against realistic records and the approved mock. |

Render both light and dark at 180x450, 360x900, 768x900, and 1440x900 at 100%. Also verify 200% zoom/reflow from the latter three sizes, reaching an effective 180x450 at the smallest. Do not require a further 200% reduction of the already-minimum 180x450 case. Check the left rail/footer, nested tab distinction, wrapped URL/ref, visible focus, and keyboard scrolling without horizontal page overflow. Record the zoom/reflow method; effective-viewport evidence must not be described as native browser zoom.

### Exact Verification Commands

Run from the repository root during authorized implementation, using the existing installed build dependencies. These are planned checks, not execution evidence. Extend the existing server/browser fixtures with About cases; do not create another harness. Prefix the new focused browser cases `074 About:` so the scoped selector below cannot silently select unrelated Review cases.

For T001's data boundary:

```text
node --test src/extensions/dude/canvas-server.test.mjs
node scripts/build-dev.mjs
node --test --test-name-pattern="checked-in dev core is a byte-identical non-mutating projection of authoritative source" scripts/build-dev.test.mjs
```

For T002, rebuild in this order:

```text
node scripts/dude-canvas-ui/build.mjs
node scripts/build-dev.mjs
```

Set `DUDE_CANVAS_BROWSER` to a verified installed Windows Microsoft Edge executable and use Node 22+ with global WebSocket. In PowerShell, require browser coverage:

```powershell
$env:DUDE_CANVAS_BROWSER_REQUIRED = '1'
node --test scripts/dude-canvas-ui/build.test.mjs
node --test --test-concurrency=1 --test-name-pattern="^074 About:" scripts/dude-canvas-ui/browser.test.mjs
node --test --test-name-pattern="checked-in dev core is a byte-identical non-mutating projection of authoritative source" scripts/build-dev.test.mjs
```

The `074 About:` selector names tests to be added in T002, not existing evidence. Its selected cases must actually execute. The existing build suite owns source/generated app and legal parity, static Review parity, and the compressed-size contract. Preserve its assertions; update only runtime pins justified by the rebuilt bytes. Keep approved-design/reference pins unchanged.

For T003's final affected integration, run the existing build and both browser suites explicitly and serially in the same required-browser environment:

```text
node --test --test-concurrency=1 scripts/dude-canvas-ui/build.test.mjs scripts/dude-canvas-ui/browser.test.mjs scripts/dude-canvas-ui/t011-browser.test.mjs
```

Extend and reuse the installed-host driver for the real About visit, metadata response, and return checks. Provide verified `DUDE_COPILOT_SDK`, `DUDE_COPILOT_CLI` (the actual `copilot.exe`, not a shell shim), `DUDE_COPILOT_RUNTIME`, and `DUDE_CANVAS_BROWSER` paths, then run:

```text
node scripts/dude-canvas-ui/t012-installed-host.mjs
```

The installed driver must read About through the extension launched by `copilot.exe`; a Node-hosted surrogate or standalone browser endpoint is insufficient. Its release fixture must show the recorded release tag and channel, not the CLI version. Controlled development and unavailable cases remain covered by the boundary/browser fixtures.

Record executed, failed, and skipped counts and evidence paths; a skip, zero selected tests, or wrapper pass does not satisfy coverage. Keep fixtures, screenshots, and reports in the existing harness-owned OS temporary paths, not in the approved design directory. Reserve the combined browser, Pack/Review continuity, and installed-host regression for T003 rather than rerunning unrelated Work suites in each unit. Keep result checks tied to these bounded runners and retain every failure within the existing 16-check attestation limit; do not truncate results or widen Work's file/check contract.

Preflight all intended writer paths, including Tester edits and generated files, against each task's exact scope before dispatch. If projection would change another path, return to the existing scope/authorization owner before writing; a build command is not blanket permission for unrelated generated changes. Preserve unrelated dirty work. Windows baseline failures may be compared with current HEAD in an isolated fixture and reported separately, but remain failures; do not weaken tests, silently skip coverage, or claim an unverified obligation passed. Missing installed prerequisites are evidence gaps, not permission to install dependencies or replace the required host.

After the automated interaction script succeeds, if embedded external opening cannot be automated, request one targeted human observation: in the actual host open Settings -> About, activate the repository URL, confirm a separate repository view opens, and return to confirm Canvas and unsent text remain. Do not ask the human to repeat the harness's layout, keyboard, or metadata checks. Until that observation or equivalent actual embedded-host automation establishes the behavior, report FR-009/SC-002's embedded-host portion as unverified.

## Guardrails And Remaining Risks

Existing project rules cover mock approval, Canvas continuity, source/generated ownership, no dead affordances, and narrow verification; no new project guardrail is needed. Keep the existing core trio and design assets. No additional supporting artifact or objective registry applies.

The manifest records installation provenance, not byte integrity. The two levels of Settings/Pack tabs can become confusing at compact sizes and need rendered review. Changes to shell focus/footer behavior can disturb pack permission returns or retained Review, so the round trips above are required. Embedded-host external link opening is unverified; browser anchor checks and the installed CLI receiver alone cannot establish it.
