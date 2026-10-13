# Plan: Dude Canvas One-Step Pack Actions

Spec: `.dude/specs/083-one-step-pack-actions/spec.md`
Owner: `.dude/ideas/083-one-step-pack-actions.md`

Add one closed Canvas route that runs Compose in a child process. A dry-run preview issues a single-use token, and apply consumes that token and pins any remote source to the previewed commit. The pack half of Needs you, the old request route, and Compose `--envelope` are deleted in the same release; Add/import keeps its half. This follows the Architect's recommendation of 2026-10-12, which also declares the mock's capability envelope. The Architect had no shell and ran nothing; the coordinator has since confirmed the `--envelope` callers and the five `app.js` pins.

## Technical Context

| Field | Value |
| --- | --- |
| Language/Version | JavaScript ES modules on Node >= 20; React 19 JSX. The browser runners need Node 22+ with global WebSocket. |
| Primary Dependencies | None new. The dialog uses only React and Fluent UI components the bundle already includes (Button, Spinner, MessageBar, Text), so `app.js.LEGAL.txt` stays byte-identical. |
| Storage | No new files or persisted state. One in-memory token slot per Canvas instance. Compose alone writes pack files and `.dude/metadata/profile.md`. |
| Testing | Node's test runner with `compose.test.mjs`, `pack-manifest.test.mjs`, `canvas-server.test.mjs`, `needs-you.test.mjs`, and `build.test.mjs`, both Canvas browser suites, and the installed-host driver. |
| Target Platform | The existing Copilot Canvas and its loopback server on Windows, macOS, and Linux. |
| Performance Goals | SC-003: a local-library install reaches success within 10 seconds, not counting the user's wait. |
| Constraints | Explicit mock approval before UI source; 080's approved layout; Compose's existing fetch bounds (120 seconds for a selected GitHub pack, 60 seconds for another host's clone); the user's private uncommitted edits in this worktree. |

## Chosen Structure

### Compose previews and the write gate

- `add <name> --dry-run` (`cmdPreviewAdd`) shares `cmdAdd`'s resolve, stage, namespace, and conflict code, removes its staging, and writes nothing. It returns `items` (`[{ kind, name }]`), `files`, `source`, `conflicts`, and `tools` (`[{ name, found }]`).
- `remove <name> --dry-run` (`cmdPreviewRemove`) returns the recorded files after the same path checks `cmdRemove` makes. `refresh --dry-run` (`cmdPreviewRefresh`) already exists and is reused unchanged.
- `src/skills/dude-engine/lib/pack-manifest.mjs` parses `requires.tools`, and Compose looks each tool up on PATH, with PATHEXT on Windows. Only the add preview reports tools; `cmdAdd` does not check them, so `verify` and chat installs behave as before.
- `cmdAdd` and `cmdRefresh` accept an optional `beforeWrite` hook. They await it after staging and before the unchanged synchronous reauthorization; a "no" answer returns a refusal with `mutation: 'none'` and writes nothing.
- Add and remove failures gain refresh's `mutation` field. The dialog's failure sentence follows it: `none` is "Nothing changed", `restored` is "Failed; your files were restored", and `uncertain` is "Failed; restoration unconfirmed. Check Installed." Until T3 deletes it, the old `packResult` validator in `needs-you.mjs` also accepts `mutation` on install and remove failures.

### Source selection

Export `chooseSource` and `bindingFor` from `packs.mjs`. Install selects a saved source by its key, Refresh matches the installed record's source, and Remove takes no source. A selected saved source marks the preview third-party, which shows the warning (FR-009).

### Token

- `canvas-server.mjs` issues a token only for an unblocked preview: no missing tool, no conflict, and a readable source. It holds one token slot per Canvas instance.
- The token binds the operation, the pack name, the source key with its `sourcesRevision`, the resolved identity (repository plus commit, or the real folder), the profile revision, and the root identity.
- Apply consumes the token first. Any mismatch returns `changed`, and nothing is written. A new preview replaces the token, closing the Canvas discards it, and it has no expiry.

### Execution

- `packs.mjs` gains `runPackAction`. It reuses `readerLaunch`, generalized to take a script so the Windows bootstrap rule stays in one place, plus `stopTree` and the reader's Git environment. The new child entry, `src/extensions/dude/lib/pack-action.mjs`, runs previews and applies and takes no reader slot.
- Apply calls `cmdAdd`, `cmdRefresh`, or `cmdRemove` with an explicit `source`, and `ref` set to the previewed commit for any remote source.
- At `beforeWrite`, the child asks the parent over IPC. The parent rechecks the token's revisions and answers go or no; a disconnect counts as no.
- Remove has no gate and no Cancel. The token check at apply start and `cmdRemove`'s own profile recheck cover it.
- Cancel, or a closed request, before go: a GitHub or local child is stopped with `stopTree`, and a Git-host child finishes Git first and then gets no. A cancelled preview's result is discarded.
- Cancel after go returns `too_late`, and the real result still comes back.
- The deadline before the gate is 130 seconds, above Compose's 120-second bound for a selected GitHub pack. A crash after go reports `uncertain`.

### Route

`POST /api/packs/action` takes three closed bodies:

```json
{"op":"preview","operation":"install","name":"<pack name>","source":"<saved source key>"}
{"op":"apply","token":"<token>"}
{"op":"cancel","token":"<token>"}
```

`operation` is `install`, `remove`, or `refresh`, and only `install` accepts the optional `source`. The guards copy `SOURCES_ROUTE`: exact path, POST only, `isTrustedRequest`, same Origin, JSON, at most 4 KiB, closed keys and shapes, and `current()` before go. One apply runs per instance, and another gets 409 `busy`; `stopInstance` cancels. There is no idle or session gate, because no agent session is involved.

### Lists

When an apply response arrives, `use-canvas-data.js` bumps the epoch and runs the automatic pack read, which reads no catalog. `retainCatalog` drops installed rows from Available, so a removed pack returns to Available only after Reload packs, as the success view says.

### Dialog

In `settings.jsx`, one dialog component replaces the pack request dialog. It is a native `<dialog>` opened with `showModal()` that reuses the 080 reader's dialog, header, and body styles, so it stacks over the narrow details overlay as the reader does. The existing Install, Remove, and Refresh pack buttons open it. Escape acts as Cancel or Close where the state offers one, `trapTab` keeps focus inside, and closing returns focus to the trigger, else the view's heading. Show files reuses the details pane's `packFiles` disclosure, and the note reuses `NEW_SESSION` from `artifact-import.jsx`. The approved mock decides the rest of the layout.

### Chat flows

In `src/skills/dude-compose/SKILL.md`, step 2 of the Add and Remove flows shows the output of `add|remove <name> --dry-run --json` in place of a hand-built preview, and the Engine section documents both dry runs. Nothing else in the chat flows changes, and they keep their lint.

### Files

| File | Change | Unit |
| --- | --- | --- |
| `src/skills/dude-engine/lib/pack-manifest.mjs` and its test | Parse and cover `requires.tools`. | T1 |
| `src/skills/dude-compose/compose.mjs` | Add and remove dry runs, tool lookup, `beforeWrite`, and add and remove `mutation`; later, remove `--envelope`. | T1, T3 |
| `src/skills/dude-compose/compose.test.mjs` | The two dry runs, tool lookup, no write after "no", and `mutation`; later, drop the `--envelope` cases. | T1, T3 |
| `src/skills/dude-compose/SKILL.md` | Chat Add and Remove step 2 and the dry-run docs; later, the Canvas deletions. | T1, T3 |
| `src/extensions/dude/lib/needs-you.mjs` | Until T3 deletes it, the old `packResult` validator accepts `mutation` on install and remove failures. | T1 |
| `src/extensions/dude/lib/pack-action.mjs` | New child entry. | T2 |
| `src/extensions/dude/lib/packs.mjs` | `runPackAction`, the generalized `readerLaunch`, and exported `chooseSource` and `bindingFor`; later, the deletions. | T2, T3 |
| `src/extensions/dude/lib/canvas-server.mjs` | The new route and token slot; later, the old route and `sourceUses` wiring removed. | T2, T3 |
| `src/extensions/dude/canvas-server.test.mjs` | Route guards, the single-use token, `changed` after profile or sources edits, `busy`, Cancel per host type with the GitHub stand-in, `too_late`, the pinned commit, and the child's Windows launch; later, source removal without request blockers and the old route's 404. | T2, T3 |
| `src/extensions/dude/lib/needs-you.mjs` and `needs-you.test.mjs` | Delete the pack half and its cases; keep import and capture. | T3 |
| `src/extensions/dude/frontend/settings.jsx` | The dialog; delete the request dialog. | T3 |
| `src/extensions/dude/frontend/use-canvas-data.js` | The action calls, epoch bump, and `retainCatalog`; delete the request helpers. | T3 |
| `src/extensions/dude/frontend/needs-you.jsx`, `artifact-import.jsx`, and `pack-sources.jsx` | Delete the pack locks and request blockers. | T3 |
| `src/extensions/dude/frontend/app.jsx` | Delete its references to the pack request code, including the `packPermission` import. | T3 |
| `src/extensions/dude/frontend/styles.js` | Dialog styles, only where the reused ones fall short. | T3 |
| `src/extensions/dude/ui/assets/app.js` | Rebuilt. | T3 |
| `docs/commands.md` | Replace the pack-request paragraphs with the dialog and the direct `t012` flows. | T3 |
| Browser and pin scripts | `083 Pack actions:` cases in `browser.test.mjs` and `t011-browser.test.mjs`, the `t012` flows, and the pins below. | T3 |
| `scripts/dude-canvas-ui/t012-installed-host.mjs` | Add `lib/pack-action.mjs` to the `installedParity` runtime list, around line 6095. | T3 |

## Deletions

Once the dialog ships, none of these has a production caller (Ship disposition 4). T3 deletes them together:

- `needs-you.mjs`: `requestPack`, `packView`, `packBasis`, `packSelect`, `currentPackReadRevision`, `sourceUses`, `preparingSource`, `rereadPack`, `reviewedCommit`, `checkPackResult`, `acknowledgePack`, `parsePackAcknowledgment`, `packResult`, `parseCatalogSource`, `namesBoundSource`, `recordedFromBound`, the pack schemas, typedefs, and error codes, `packRequests`, and the pack branches in `refresh`, `requestHuman`, and the exclusions. The `permission` class, `respond`, and the send and idle exclusions stay, because Add/import (`import:<receipt>`) and capture use them.
- `packs.mjs`: `packReadRevision`, the `select` and `name` options of `readPacks`, and the `liveUses` request blockers in `removePackSource`.
- `canvas-server.mjs`: the `/api/packs/request` entry in `PROVIDER_REQUEST_ROUTES` and the `sourceUses` wiring.
- Frontend: `PHASES`, `MUTATIONS`, and the request dialog and summary in `settings.jsx`; `packRequestStatus`, `packPermission`, `packRequestPending`, `requestPack`, `packAttempt`, `IMPORT_REASONS.pack`, and the pack request messages in `use-canvas-data.js`; the pack locks in capture (`needs-you.jsx`) and import (`artifact-import.jsx`); and the request blockers in `pack-sources.jsx`.
- Compose: the `--envelope` flag, which only the Canvas pack-result path uses. In `SKILL.md`, the `## Canvas Pack Requests And Results` section, the "a Dude Canvas explicit pack request" description trigger, the `--envelope` flag text, and the `--envelope` clauses in the Add, Remove, and Refresh flows.
- Docs: the pack-request paragraphs in `docs/commands.md`, including the installed-host pack case that runs `add --envelope` (near line 2496).
- Tests: the `--envelope` cases in `compose.test.mjs`, the pack cases in `needs-you.test.mjs`, and the old route's cases in `canvas-server.test.mjs`. In `t012-installed-host.mjs`, the scripted-owner pack install and the Phase B source install become direct dialog flows.

## Generated Outputs And Pins

`node scripts/dude-canvas-ui/build.mjs` rebuilds `src/extensions/dude/ui/assets/app.js`. `app.js.LEGAL.txt` stays byte-identical because the UI adds no dependency; `build.test.mjs` confirms this, and the LEGAL pins stay as they are.

Find each `app.js` pin with `git grep 7223f8c918d2686e103e8dbef5a118c0be6e1c48a713552103676419a72af7a1` and update it to the rebuilt bytes in all five scripts: `scripts/build-dev.test.mjs`, `scripts/dude-canvas-ui/browser.test.mjs`, `scripts/dude-canvas-ui/build.test.mjs`, `scripts/dude-canvas-ui/t011-browser.test.mjs`, and `scripts/dude-canvas-ui/t012-installed-host.mjs`. Also update the `app.js` byte size in `build.test.mjs`. Keep approved design and reference pins, and historical `.dude` evidence, unchanged.

The user has private uncommitted edits in this worktree, so never run `node scripts/build-dev.mjs` here. Each unit projects only the outputs it changes, selected from `listCoreOutputs` and written with `writeCoreOutput` from `scripts/build-release.mjs`, and refuses a missing or duplicate match:

```text
T1  .github/skills/dude-engine/lib/pack-manifest.mjs
T1  .github/skills/dude-compose/compose.mjs
T1  .github/skills/dude-compose/SKILL.md
T1  .github/extensions/dude/lib/needs-you.mjs
T2  .github/extensions/dude/lib/pack-action.mjs (new)
T2  .github/extensions/dude/lib/packs.mjs
T2  .github/extensions/dude/lib/canvas-server.mjs
T3  .github/extensions/dude/lib/needs-you.mjs
T3  .github/extensions/dude/lib/packs.mjs
T3  .github/extensions/dude/lib/canvas-server.mjs
T3  .github/skills/dude-compose/compose.mjs
T3  .github/skills/dude-compose/SKILL.md
T3  .github/extensions/dude/ui/assets/app.js
```

Check live preimages before any write that overlaps a privately edited file, and change only this feature's lines there.

## Verification

These are planned checks for authorized implementation and testing owners; this definition runs none. Run acceptance in an owned copy where the user's private uncommitted files keep their HEAD bytes and unrelated untracked files are left out, then confirm separately that those workspace files are unchanged. Follow `docs/commands.md#canvas-maintainer-acceptance`.

```text
node --test src/skills/dude-compose/compose.test.mjs src/skills/dude-engine/lib/pack-manifest.test.mjs
node --test src/skills/dude-bundle-upgrade/upgrade.test.mjs
node .github/skills/dude-compose/compose.mjs verify
node --test src/extensions/dude/canvas-server.test.mjs src/extensions/dude/needs-you.test.mjs
node .github/skills/dude-lint/lint.mjs .
node scripts/dude-canvas-ui/build.mjs
```

With Node 22+, set `DUDE_CANVAS_BROWSER` to an installed browser, `DUDE_CANVAS_BROWSER_REQUIRED=1`, and `DUDE_CANVAS_ARTIFACTS_DIR` to a short owned temporary folder. Run these serially:

```text
node --test scripts/dude-canvas-ui/build.test.mjs
node --test --test-concurrency=1 scripts/dude-canvas-ui/browser.test.mjs
node --test --test-concurrency=1 scripts/dude-canvas-ui/t011-browser.test.mjs
node --test --test-name-pattern="checked-in dev core is a byte-identical non-mutating projection of authoritative source" scripts/build-dev.test.mjs
node scripts/dude-canvas-ui/t012-installed-host.mjs
```

Each unit runs the acceptance commands named in its `tasks.md` entry, and T003 runs every command above. `t012-installed-host.mjs` runs on the real installed host and keeps its existing environment settings and short owned temporary roots. Name new browser cases with the prefix `083 Pack actions:`. Record executed, failed, and skipped counts; a skip or zero selected tests is not coverage. The dialog uses no host-specific behavior, so no new human host observation is expected.

| Coverage | Cases |
| --- | --- |
| US1; FR-001-004, FR-011-013, FR-018, FR-020; SC-001-003 | Install from a local-library fixture: loading, ready with items by kind and tools, one click, success, and Show in Installed; zero Needs you requests and zero session messages; the timed run. |
| US2; FR-005-006, FR-015, FR-018 | Remove with its file list and no Cancel; Refresh with Replaced, Added, and Removed, the overwrite warning, and a `Source changes` line. |
| US3; FR-009-010, FR-012; SC-005-006 | A saved local folder and the GitHub stand-in: the warning text, no checkbox, the commit pinned after a branch move, and the warning again on the next preview. |
| FR-003, FR-008, FR-014, FR-016-017, FR-019; SC-004, SC-007 | `compose.test.mjs`: dry runs write nothing and repeat identically, tools found and missing, no write after "no", and `mutation`. `canvas-server.test.mjs`: route guards, the single-use token, `changed`, `busy`, Cancel per host type, `too_late`, and `uncertain`. Browser: blocked, changed, cancelled, and the three failure states. |
| FR-021-023; SC-008 | The old route's 404; the `needs-you.test.mjs` import and capture cases; source removal without request blockers; the Compose skill's chat flows name the dry runs. |
| FR-007; VSC-001-004; SC-009 | Both themes at the four sizes plus 200%, keyboard order and focus return, geometry, the accessibility tree, contrast, no hashes or protocol words, and screenshots compared with the approved mock and 080's states. |

## Design Gate And Delivery

The user approved the canonical mock at `preview_path`, and the spec's Revision Log binds that approval to the exact bytes. The mock starts from 080's approved file and stays inside the Architect's capability envelope, as listed in the spec's Scope And Surfaces.

`tasks.md` holds the three derived sequential units:

1. T1 (T001@4e7b0c92), Compose: the add and remove dry runs, tool lookup, the `beforeWrite` gate, `mutation` on add and remove failures, the chat flows in the Compose skill, their tests, and the T1 projection.
2. T2 (T002@9a1f6d35), server: `pack-action.mjs`, `runPackAction`, the token, and `POST /api/packs/action`, with `canvas-server.test.mjs` and the T2 projection. The old route stays, so every suite stays green.
3. T3 (T003@c38e5b17), UI: the dialog, the data hook, every deletion above, `docs/commands.md`, the rebuild and pins, the T3 projection, and the build, browser, `t011`, and `t012` acceptance.

Each executed unit gets one Tester and one independent Reviewer through ordinary Work.

## Guardrails And Risks

Existing project guardrails cover this feature: keep it simple, mandatory mock approval, Canvas continuity, no dead affordances, the pack lifecycle and refresh rules, harness-first UI verification, and established conventions. No new guardrail candidate arose, and no supporting artifact applies.

The child process, the token, and the write gate are the only new mechanisms. The child keeps a fetch of up to 120 seconds off the Canvas thread and makes Cancel possible. The token ties the one confirmation to what the user saw, and the gate lets the freshness check and Cancel happen after the slow fetch and before any write.

Accepted risks, left uncovered on purpose under the keep-it-simple guardrail:

- Cancelling a fetch from a non-GitHub Git host takes effect only when Git returns, up to 60 seconds. Saved repository sources are GitHub-only, so this affects only a non-GitHub bundle upstream.
- If a local source folder changes between preview and apply, the apply installs the folder's current files. The success view lists what was installed.
- A chat `compose` run that overlaps a Canvas apply within milliseconds is not covered. Compose's profile recheck narrows that window but cannot close it across two processes.
- Needs you no longer keeps a consent record for these three actions. The profile and Git history still show what was installed and from where.
- Canvas runs no lint after applying (Ship disposition 3). A pack that passes Compose's checks but fails lint shows up at the next lint run, and Remove undoes it.
- A GitHub install fetches the pack twice: once to preview and once to apply at the pinned commit.
- Tool lookup reads the PATH of the running Copilot CLI process, so a tool installed into a new PATH folder shows as missing until the CLI restarts.
