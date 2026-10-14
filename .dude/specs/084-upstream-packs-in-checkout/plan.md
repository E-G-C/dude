# Plan: Upstream Packs In A Checkout

Spec: `.dude/specs/084-upstream-packs-in-checkout/spec.md`
Owner: `.dude/ideas/084-upstream-packs-in-checkout.md`

In a checkout, an explicit discovery runs one more closed catalog-reader request for Bundle upstream, and the server stops listing upstream packs whose names Local library listed. Install, Refresh, and Remove need no server change: 083's dialog sends no source for a built-in row, so Compose's default resolution fetches an upstream-only pack, and the apply is pinned to the previewed commit. The UI adds the notice, the Sources wording, and a dialog that names the source its preview read, and the not-read-by-design state is deleted. Compose does not change. This follows the Architect's recommendation of 2026-10-13, which also declares the mock's capability envelope. The Architect had no shell and ran nothing. The Spec Lead re-read the cited source, docs, and current `app.js` pin at HEAD 65eb0ba, and the coordinator ran the test-file greps there before task derivation.

## Technical Context

| Field | Value |
| --- | --- |
| Language/Version | JavaScript ES modules on Node >= 20; React 19 JSX. The browser runners need Node 22+ with global WebSocket. |
| Primary Dependencies | None new. The server reuses the catalog reader, Compose's GitHub catalog acquisition from 082, and 083's action route. The UI reuses Fluent UI components the bundle already includes, so `app.js.LEGAL.txt` stays byte-identical. |
| Storage | No new files, settings, schema, cache, or persisted state. The retained catalog snapshot stays in tab memory, as today. Compose alone writes pack files and `.dude/metadata/profile.md`. |
| Testing | Node's test runner with `canvas-server.test.mjs` and its loopback GitHub stand-in, `build.test.mjs`, both Canvas browser suites, and the installed-host driver; the Compose, upgrade, and Needs you suites as regressions. |
| Target Platform | The existing Copilot Canvas and its loopback server on Windows, macOS, and Linux. |
| Project Type | The Dude Canvas extension inside the Dude bundle. |
| Performance Goals | No new bound. A checkout Reload adds one GitHub catalog read inside the existing 30-second GitHub reader budget and the 60-second Reload window. With eight added sources it starts at most 10 readers, within the 4 active and 16 waiting slots. |
| Constraints | Explicit mock approval before UI source and task derivation; 083's approved layout; the pack catalog fetch policy in `.dude/memory/decisions.md` unchanged; GitHub's 60 anonymous REST requests an hour per address; no test reaches github.com; the user's private uncommitted edits in this worktree. |

## Chosen Structure

### Upstream read (T1)

`src/extensions/dude/lib/catalog-reader.mjs`:

- `parseRequest` accepts exactly `{"op":"upstream"}`, with no other key. A request that names a repository, ref, or path is still refused, so no request carries a command, path, repository, or ref.
- The list branch of `readSource` moves into `listSource(root, source)`: catalog resolution with the explicit source, the `kept`, `catalog_missing`, `catalog_unreachable`, and `catalog_metadata` mapping, and `listAndRelease` with the GitHub flag. `readSource` returns `listSource`'s answer with its `source` summary.
- `readUpstream(root)` takes the `bundle-upstream` entry of `builtinSources(root)` and lists it with `listSource`, or answers `catalog_unavailable` when the manifest names no upstream. `handle` routes the new operation there, and the header gains it.

`src/extensions/dude/lib/packs.mjs`, `readPacks`:

- A discovery whose built-ins include Local library and Bundle upstream also runs `acquireContained` with `{ op: 'upstream' }` and the upstream's `purposeOf`. It is requested after the default read and before the saved sources, inside the same `settleAll`, so the built-ins take reader slots first.
- Its read joins the reduction right after the default entry, so `discoveryCoverage` counts it and the source row takes its status.
- Automatic reads (`catalog: false`) and workspaces without Local library start no upstream read. Discarded and failed acquisitions behave as today. The bundle manifest is already a `catalogInputsRevision` input, so a manifest change during a Reload discards the read.

### Local wins and counts (T1)

- When Local library is the default and its read succeeded, Bundle upstream's catalog entry carries the set of names Local library listed. `joinItems` skips those names only in its Available loop. Installed rows still look up the full upstream catalog, so a pack installed from the upstream keeps its description after a pull adds the same name locally.
- The set comes only from Local library's read and applies only to Bundle upstream's catalog, so added sources keep 073's same-name rows.
- When Local library's read failed, there is no set and nothing is hidden (Ship disposition 1).
- `projectSources` keeps `count` as the full read. `uninstalled` becomes the number of Available rows from each source, counted from the joined items by `sourceKey`. `retainCatalog` in `use-canvas-data.js` already recomputes exactly that number, so a discovery and the automatic rereads after it agree, and `use-canvas-data.js` does not change. Every other source's number stays the same, because its rows are exactly its packs that are not installed.
- Convention: pacman's repository order and conda's strict channel priority. Not followed: apt's policy view, which lists every candidate.

### Install, Refresh, and Remove (no server change)

- 083's dialog sends no source for a built-in row, so `runPackAction` previews through Compose's default resolution (`resolvePackDir`): a pack missing from `library/packs` is fetched from the manifest's upstream at its ref.
- The binding pins the apply to the previewed commit through `pinnedTo`, and `thirdParty` stays false because no saved source was chosen.
- `chooseSource` keeps refusing built-in keys with `source_not_added`. That refusal keeps a forced upstream install impossible (FR-024).
- Refresh keeps Compose's default: Bundle upstream until the local library has the pack, then the local library. Remove reads no source.

### Notice and Sources wording (T2)

- `src/extensions/dude/frontend/settings.jsx`: the sentence in Available's `Catalog not read yet` state, shown only while Bundle upstream is listed and is not the default (FR-009, FR-010). The filtered empty state drops the by-design sentence and, for Bundle upstream beside a library after a read, puts the local-wins sentence before "Clear the filters to see all packs in this context." (FR-016).
- `src/extensions/dude/frontend/pack-sources.jsx`: one exported predicate, `besideLibrary(item)`, true for a Bundle upstream row that is not the default, drives the reworded description, Packs found as `N (M in Available)` with its note, and the new disabled reason (FR-012, FR-014, FR-015). Every other source keeps its 073 text.
- Show packs in Available keeps one reason order: `Not read yet - choose Reload packs.`, `Unavailable - its packs are not listed.`, `This source has no packs.`, then the new reason for Bundle upstream beside a library, then `Available is not current. Choose Reload packs.` Other sources keep `All packs from this source are installed.`

### Dialog (T2)

- `openAction`: Refresh's pre-preview source is the source the record matches, added or built-in, else the default (FR-025). This differs from 083 only for a pack recorded from Bundle upstream in a checkout.
- For an action without a saved source, `PreviewBody` names the row its preview resolved: a repository identity maps to the Bundle upstream row and a folder to the default row (FR-026). `Source changes` is computed after the preview, from the resolved row against the record's matched source (FR-027).
- A `Commit` fact under Source shows the full `resolved_commit` only when the preview resolved Bundle upstream while Local library is the default (FR-021, Ship disposition 2).
- 083's dialogs keep their text for local-library installs, release installs and refreshes, saved-source actions, and the Unlisted refresh (FR-028).

### Files

| File | Change | Unit |
| --- | --- | --- |
| `src/extensions/dude/lib/catalog-reader.mjs` | `{"op":"upstream"}`, `listSource`, `readUpstream`, and the header. | T1 |
| `src/extensions/dude/lib/packs.mjs` | The discovery's upstream read, local wins, `uninstalled` from Available rows, the `byDesign` deletion, and comments. | T1 |
| `src/extensions/dude/lib/canvas-server.mjs` | Comments only: `PACKS_ROUTE` and `readInstalledSurface`. | T1 |
| `src/extensions/dude/canvas-server.test.mjs` | `084 Upstream packs:` cases, and any by-design assertion or fixture the new read changes. | T1 |
| `src/extensions/dude/frontend/settings.jsx` | The notice, the filtered empty state, and the dialog's resolved source and Commit. | T2 |
| `src/extensions/dude/frontend/pack-sources.jsx` | `besideLibrary`, the Sources wording, and the `skipped` deletion. | T2 |
| `src/extensions/dude/frontend/styles.js` | Only if an existing class falls short; none is expected. | T2 |
| `src/extensions/dude/ui/assets/app.js` and `app.js.LEGAL.txt` | Rebuilt; `app.js.LEGAL.txt` is expected unchanged. | T2 |
| `docs/commands.md` | The Settings changes under Docs. | T2 |
| `scripts/dude-canvas-ui/browser.test.mjs` | `084 Upstream packs:` cases and the pin. | T2 |
| `scripts/dude-canvas-ui/t011-browser.test.mjs` and `scripts/dude-canvas-ui/t012-installed-host.mjs` | The pin, any by-design assertion, and any checkout fixture that would read a real upstream. | T2 |
| `scripts/dude-canvas-ui/build.test.mjs` and `scripts/build-dev.test.mjs` | The pin, plus the `app.js` byte size in `build.test.mjs`. | T2 |

### Docs

`docs/commands.md` (T2), worded from the approved mock:

- The Reload paragraph, "A Reload reads the default catalog and each added source once": add Bundle upstream when a local library is the default catalog. The bounds sentence stays.
- After "The default catalog is the local `library/packs/` when present": in a development checkout, a Reload also reads that upstream as its own source, Available adds only its packs the local library lacks, and the local copy of a same-name pack stays the one listed and installed.
- The `Catalog not read yet` paragraph: the checkout sentence.
- "The same pack name in two sources is two Available rows": the one exception, Bundle upstream beside a local library, and that nothing is hidden when the local library could not be read.
- The Install bullet: the commit for a pack read from Bundle upstream in a checkout.
- The Refresh bullet: in a checkout, the default takes the local copy when there is one, else Bundle upstream's, and the dialog names what its preview read. A pack installed from the upstream refreshes from it until the local library has the pack, then shows `Source changes: ... -> Local library (library/packs)`.
- Settings: pack sources: replace "A development checkout has a local library, so its Bundle upstream shows `Not read while library/packs exists` and Canvas does not read it." with the read-on-Reload and local-wins sentence, and delete "Apart from that development upstream,".
- Packs found: for Bundle upstream beside a local library, the parenthesis counts the packs Available lists, such as `21 (1 in Available)`.
- Show packs in Available: replace "is not read by design" with the new reason.
- The GitHub paragraph under Sources: one sentence that GitHub limits anonymous reads per hour, so frequent Reloads can leave Bundle upstream `Unavailable` for a while, and the local library is unaffected (Ship disposition 3).

Keep "The two built-in sources carry no warning." as it is.

## Deletions

Once a checkout reads Bundle upstream on Reload, nothing produces or reads the by-design state. Delete it in the unit that makes it dead:

- `packs.mjs` (T1): `outcome`'s `byDesign` parameter, its `not_read_by_design` reason and the message `Not read while library/packs exists.`, and the two arguments that pass it.
- `pack-sources.jsx` (T2): `NOT_READ_BY_DESIGN`, the `skipped` branches of `sourceStatus` and `showPacksState`, and the clause "so Bundle upstream is not read." The `skipped` kind has no other consumer.
- `settings.jsx` (T2): the filtered empty state's sentence "Bundle upstream is not read while library/packs exists."
- Comments that would become false (T1): the `packs.mjs` header's "three reads" and "the default plus each saved source" and the `readPacks` doc; the `catalog-reader.mjs` header; and the `PACKS_ROUTE` and `readInstalledSurface` comments in `canvas-server.mjs`.
- Docs (T2): the by-design sentences listed under Docs.

Keep `chooseSource`'s built-in refusal, the default reader operation, `defaultPurpose`, `validateNewSource`'s duplicate refusal, and `refusalOf`'s "Already listed" text. Each still has a caller and stays true.

## Generated Outputs And Pins

`node scripts/dude-canvas-ui/build.mjs` rebuilds `src/extensions/dude/ui/assets/app.js`. `app.js.LEGAL.txt` stays byte-identical because the UI adds no dependency; `build.test.mjs` confirms this, and the LEGAL pins stay as they are.

The current `app.js` SHA-256 is `be30db45dd5e002bc643de4e01b99f599f0006c9242f164e83ba41a16fbe17ba`. It is `PUBLISHED_APP_SHA256` in `t011-browser.test.mjs` and the committed hash in 083's release record, and HEAD 65eb0ba changed only `.dude/metadata/development-base-release.md` after that merge. Find each pin with `git grep be30db45dd5e002bc643de4e01b99f599f0006c9242f164e83ba41a16fbe17ba` and update it to the rebuilt bytes in all five scripts: `scripts/build-dev.test.mjs`, `scripts/dude-canvas-ui/browser.test.mjs`, `scripts/dude-canvas-ui/build.test.mjs`, `scripts/dude-canvas-ui/t011-browser.test.mjs`, and `scripts/dude-canvas-ui/t012-installed-host.mjs`. Also update the `app.js` byte size in `build.test.mjs`, and the Fluent menu and tooltip minified sizes if the rebuild moves them. Keep approved design and reference pins, and historical `.dude` evidence, unchanged. 084 adds no runtime file, so the installed-host parity lists do not change.

The user has private uncommitted edits in this worktree, so never run `node scripts/build-dev.mjs` here. Each unit projects only the outputs it changes, selected from `listCoreOutputs` and written with `writeCoreOutput` from `scripts/build-release.mjs`, and refuses a missing or duplicate match:

```text
T1  .github/extensions/dude/lib/catalog-reader.mjs
T1  .github/extensions/dude/lib/packs.mjs
T1  .github/extensions/dude/lib/canvas-server.mjs
T2  .github/extensions/dude/ui/assets/app.js
T2  .github/extensions/dude/ui/assets/app.js.LEGAL.txt (expected unchanged)
```

Check live preimages before any write that overlaps a privately edited file, and change only this feature's lines there. Neither unit edits `scripts/current-format-contract.test.mjs`, which holds the user's private edits.

Before task derivation, the coordinator ran the Architect's three read-only greps at HEAD 65eb0ba:

```text
git grep -n -e "not_read_by_design" -e "NOT_READ_BY_DESIGN" -e "Not read while library/packs exists" -e "not read by design" -e "Bundle upstream is not read" -- . ':!.dude'
git grep -n -e "bundle-manifest" -e "source_repo" -- src/extensions/dude/canvas-server.test.mjs scripts/dude-canvas-ui
git grep -n be30db45dd5e002bc643de4e01b99f599f0006c9242f164e83ba41a16fbe17ba
```

Every hit is in a file listed above, so neither unit gains a writer path. The by-design state appears only in `packs.mjs`, `pack-sources.jsx`, `settings.jsx`, `app.js`, `docs/commands.md`, `browser.test.mjs`, `t012-installed-host.mjs`, and `canvas-server.test.mjs`, plus the `packs.mjs` and `app.js` projections, and in no README or skill. Bundle manifest fixtures appear in `canvas-server.test.mjs`, `browser.test.mjs`, `t011-browser.test.mjs`, and `t012-installed-host.mjs`, and the `app.js` pin appears in exactly the five scripts above. Nobody has read the four test scripts, the other docs, or the skills in full.

## Verification

These are planned checks for authorized implementation and testing owners; this definition runs none. Run acceptance in an owned copy where the user's private uncommitted files keep their HEAD bytes and unrelated untracked files are left out, then confirm separately that those workspace files are unchanged. Follow `docs/commands.md#canvas-maintainer-acceptance`.

T1 runs:

```text
node --test --test-name-pattern="084 Upstream packs" src/extensions/dude/canvas-server.test.mjs
node --test src/extensions/dude/canvas-server.test.mjs
node --test --test-name-pattern="checked-in dev core is a byte-identical non-mutating projection of authoritative source" scripts/build-dev.test.mjs
node .github/skills/dude-lint/lint.mjs .
```

T2 runs every command in 083's Verification:

```text
node --test src/skills/dude-compose/compose.test.mjs src/skills/dude-engine/lib/pack-manifest.test.mjs
node --test src/skills/dude-bundle-upgrade/upgrade.test.mjs
node .github/skills/dude-compose/compose.mjs verify
node --test src/extensions/dude/canvas-server.test.mjs src/extensions/dude/needs-you.test.mjs
node .github/skills/dude-lint/lint.mjs .
node scripts/dude-canvas-ui/build.mjs
```

Then, with Node 22+, `DUDE_CANVAS_BROWSER` set to an installed browser, `DUDE_CANVAS_BROWSER_REQUIRED=1`, and `DUDE_CANVAS_ARTIFACTS_DIR` set to a short owned temporary folder, T2 runs these serially:

```text
node --test scripts/dude-canvas-ui/build.test.mjs
node --test --test-concurrency=1 scripts/dude-canvas-ui/browser.test.mjs
node --test --test-concurrency=1 scripts/dude-canvas-ui/t011-browser.test.mjs
node --test --test-name-pattern="checked-in dev core is a byte-identical non-mutating projection of authoritative source" scripts/build-dev.test.mjs
node scripts/dude-canvas-ui/t012-installed-host.mjs
```

`t012-installed-host.mjs` runs on the real installed host and keeps its existing environment settings and short owned temporary roots. Name new cases with the prefix `084 Upstream packs:` in both `canvas-server.test.mjs` and `browser.test.mjs`, so one pattern selects the feature. Record executed, failed, and skipped counts; a skip or zero selected tests is not coverage. 084 has no host-specific behavior, so no human host observation is expected.

No test reaches real GitHub. Every 084 case serves Bundle upstream from a loopback GitHub stand-in: `offlineGitHub` in `canvas-server.test.mjs`, and the stand-in that 083's US3 browser case uses. Each case names a repository that does not exist, such as `acme/bundle`, so no case reads a real repository's packs. In `t011-browser.test.mjs` and `t012-installed-host.mjs`, a workspace that has `library/packs` and a GitHub `source_repo` and runs a Reload either drops `source_repo` from its seeded manifest or, when an assertion needs the Bundle upstream row, points it at an owned stand-in. 082 T004 stays the only network case in `t012`, and `t012` gains no case.

| Coverage | Cases |
| --- | --- |
| US1; FR-001, FR-005, FR-006, FR-013, FR-020-023; SC-001-002 | Server: with Local library `alpha` and `shared` and the stand-in's `shared` and `fresh`, a Reload starts exactly one `{"op":"upstream"}` reader with the reader Git environment; `fresh` is listed from Bundle upstream and `shared` only from Local library; the upstream row is `Read` with `count` 2 and `uninstalled` 1, and coverage is `current`. Installing `fresh`: the preview has `thirdParty: false` and a remote source at commit C1, the stand-in's `main` moves to C2, and the apply records C1; the next discovery lists no `fresh` in Available and matches the installed row to Bundle upstream. Browser: rows, tab totals, the Source filter, details, Packs found with its note, and Show packs; the dialog's loading line, a ready view with Source, a 40-hex Commit, and no third-party bar, one click, success, Show in Installed, and focus return. |
| US2; FR-003, FR-009-012, FR-017; SC-003-004, SC-008 | Server: a plain read in a checkout starts no catalog reader and lists Bundle upstream as `not_read` with no reason or message, and the stand-in sees zero requests. Browser: the sentence beside Reload packs; Sources `Not read` with its notice, description, and reason; zero stand-in requests after opening Settings, a focus change, and an automatic reread; no sentence in a release-shaped workspace or a checkout without `source_repo`. The first grep finds no by-design text outside `.dude`. |
| US3; FR-018-019; SC-005 | Server: an unpublished upstream reads `unavailable` with `catalog_unreachable`, coverage is `partial`, and the local rows are listed. Browser: the partial notice names Bundle upstream `Unavailable`, local rows are listed, counts say `known`, and the Source filter option says `(unavailable)`. |
| US4; FR-024-027; SC-007 | Server: a Refresh preview of `fresh` resolves the repository, and after `library/packs/fresh` is added it resolves the local library; the route still refuses a built-in source key with `source_not_added`. Browser: Refresh before and after the local copy exists, with the Commit, the `Source changes` line, and Installed showing Local library afterward; Remove, then a Reload, lists `fresh` from Bundle upstream again. |
| FR-002, FR-004, FR-007-008, FR-014-016, FR-028; SC-006 | Server: a saved `acme/extra` that lists `shared` keeps its row beside Local library's; the read after Add source includes the upstream; a release-shaped workspace starts no `{"op":"upstream"}` reader; the reader refuses `{"op":"upstream"}` with an added `ref` or `repository` as `catalog_unavailable` and connects nowhere; a local library with an invalid `pack.md` hides nothing. Browser: the none-listed reason after installing `fresh`, the filtered empty state, and a release Install dialog unchanged from 083. |
| VSC-001-004; SC-009 | Both themes at 180x450, 360x900, 768x900, and 1440x900, plus 200%; keyboard order and focus return; geometry; the accessibility tree; contrast; and screenshots compared with the approved mock and 083's states. |

## Design Gate And Delivery

The user approved the canonical mock at `preview_path` by an explicit chat reply at 2026-10-14T01:35:11Z, and the spec's Revision Log binds that approval to the exact bytes. The mock starts as a byte-for-byte copy of 083's approved mock, SHA256 `74eb80edf17166d13700f09bf02fef781b1434db9d493d5ea44e58e4037a6f2e`, then adds a mock-only state chooser for the 084 states. It stays inside the Architect's capability envelope, as listed in the spec's Scope And Surfaces. The approval also confirms the four Ship dispositions, including the accepted GitHub rate limit, and settles the wording the spec leaves to the mock.

`tasks.md` holds the two derived sequential units:

1. T1 (T001@d92bcd4b), server read and merge: `{"op":"upstream"}` and `listSource`, the discovery read, local wins, `uninstalled` from Available rows, the `byDesign` deletion, the comment updates, the `084 Upstream packs:` server cases, and the T1 projection. It runs no browser, `t011`, or `t012` suite, and its handoff lists every grep hit T2 must update.
2. T2 (T002@4290a774), UI, docs, rebuild, pins, and full acceptance: the notice and the filtered empty state, `besideLibrary` and the Sources wording, the `skipped` and `NOT_READ_BY_DESIGN` deletion, the dialog's resolved source and Commit, `docs/commands.md`, the rebuild and five pins, the `t011` and `t012` pin and fixture updates, the browser cases, the T2 projection, and the full acceptance. It depends on T1.

Compose needs no unit, because 084 changes no Compose code. Each executed unit gets one Tester and one independent Reviewer through ordinary Work.

## Guardrails And Risks

Existing project guardrails cover this feature: keep it simple (`.dude/memory/guardrails.md` line 15), mandatory mock approval, Canvas continuity, no dead affordances, the pack lifecycle and refresh rules, harness-first UI verification, and established conventions. No new guardrail candidate arose, and no supporting artifact applies.

Keep it simple shapes the design: one closed reader request, one set of names applied to one source, and a dialog label computed from what the preview already returns. There is no new state, setting, schema, cache, throttle, version field, or Compose change, and no case beyond the spec's edge cases is covered.

Accepted risks follow. The request counts and timings are the Architect's estimates, not measurements.

- R1, GitHub's anonymous allowance: a checkout Reload spends about 6 + N REST requests for N pack folders, about 27 today, plus raw `pack.md` downloads, against 60 an hour per address. An install spends about 13 more for its preview and pinned apply. After about two Reloads in an hour, Bundle upstream reads `Unavailable` until the hour resets, and the local library is unaffected. A release Reload already pays this cost, and the docs say so (Ship disposition 3). If it bites, shrinking 082's catalog walk is a separate idea.
- R2, Reload latency: a checkout Reload waits for the upstream read, a few seconds and at most 30, and an offline machine usually fails fast. The existing pending state shows meanwhile.
- R3, test fixtures reaching the network: the main delivery risk. The greps above and the network rule in Verification bound it.
- R4, an unreadable local library hides nothing (Ship disposition 1). Install still takes a local copy first, and the ready view names it.
- R5, a non-GitHub upstream in a checkout: the preview and apply run with the default's `local` purpose, so Cancel stops its Git at once, and an upstream spelled as a path would be labeled Local library by the resolved-source rule. Both cases are extreme and accepted.
- R6, a pull between a Reload and an action: the row says Bundle upstream, but the ready view names Local library before the click.
- R7, between T1 and T2: the live Canvas in this checkout lists upstream rows while the Sources wording and Refresh labels stay as 083 left them, and the browser suites may still expect the old text. T2 follows T1 directly, and only T2's acceptance runs those suites.

Recovery needs no data step, because 084 adds no persistent state, schema, or migration. Reverting T1 and T2 restores 083, and an upstream install record is an ordinary remote record that Remove deletes. After T2 lands, the user can watch the first Reloads in this checkout and revert if Available lists an upstream copy of a local pack, Canvas reads GitHub without a Reload, an install records a commit other than the previewed one, or a Bundle upstream install shows a third-party warning.
