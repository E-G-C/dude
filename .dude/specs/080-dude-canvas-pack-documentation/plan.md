# Plan: Dude Canvas Pack Documentation

Spec: `.dude/specs/080-dude-canvas-pack-documentation/spec.md`
Owner: `.dude/ideas/080-dude-canvas-pack-documentation.md`

Add each document's text to the data the existing pack and project reads already return. At the Documentation position 073 reserves, list one button per document, and open each document in a reader window that renders its Markdown. This follows the Architect's round-2 recommendation of 2026-10-11, written after the user rejected round 1, which also declares the mock's round-2 capability envelope. The user approved the round-2 mock at `.dude/specs/080-dude-canvas-pack-documentation/design/pack-documentation.html` with the Details rename, and `tasks.md` holds the derived units.

## Technical Context

| Field | Value |
| --- | --- |
| Language/Version | JavaScript ES modules on Node >= 20; React 19 JSX. The browser runners need Node 22+ with global WebSocket. |
| Primary Dependencies | Existing React, Fluent UI, and esbuild from `scripts/dude-canvas-ui/package.json`, plus `marked`, pinned to one exact version: the current release when the engineer installs it. marked is one MIT package with no dependencies. `app.js.LEGAL.txt` changes: it gains marked's license section. |
| Storage | None. Documents travel in the existing `/api/packs` responses, with no cache, store, or new state. |
| Testing | Node's test runner with `src/extensions/dude/canvas-server.test.mjs` and `scripts/dude-canvas-ui/build.test.mjs`, both Canvas browser suites, and the installed-host driver. |
| Target Platform | The existing Copilot Canvas and its loopback server. |
| Constraints | Explicit mock approval first; 073's details order (its FR-075 and FR-077); read-only; 64 KiB per document; Markdown rendered only as React elements, never as HTML; the user's private uncommitted edits in this worktree. |

## Chosen Structure

Every document arrives with an existing listing: no new route, no new transport, and no read when a row is selected or the reader opens. Each document carries its label and either its text, with any leading frontmatter removed, or a too-large marker. Check the file size first and never read past 64 KiB. Resolve paths through the existing containment helpers so no file-system link is followed.

| Item | Documents and where they are read |
| --- | --- |
| Available pack | `listCatalog` in `catalog-reader.mjs` reads the `pack.md` body and each `skills/*/README.md`, resolving them as it already resolves `pack.md`, before `listAndRelease` disposes of an acquired catalog. They reach the UI through `/api/packs?discover=1`. GitHub discovery downloads only `pack.md` (`pack-acquisition.mjs`), so mark rows from a GitHub-discovered catalog for the note. |
| Installed pack | `pack.md` is never installed, so its body follows `description`: `joinItems` in `packs.mjs`, then `retainCatalog` in `use-canvas-data.js`. On every `/api/packs` read, add the root `README.md` of each recorded skill folder when the pack's recorded files include it. |
| Pack members | Agents are single files and have no documents. Member `SKILL.md` files are not shown. |
| Project agent or skill | `project-artifacts.mjs` adds the body of `SKILL.md` or `<name>.agent.md`, then the root `README.md` of the skill folder or the agent's `.support/` folder. Withheld files, an unreadable entrypoint, or an unclosed metadata header give the row's existing reason instead of documents (FR-013). |

In `settings.jsx`, one small component renders a "Details" heading and one button per document, labeled with its path, with `pack.md` or the project entrypoint first. Place it after the pack facts list (the one ending with Declared tools), before Recorded installed source or Projected files, and after the facts in `ProjectBody`, before Files. The component also shows "No details found.", a too-large document's path with "Not shown: larger than 64 KiB" and no button, the description's not-read or unavailable wording, the GitHub note, and the project row's reason. It has no loading state.

A button opens the reader: a second native `<dialog>`, opened with `showModal()`. At 1099 px and narrower the details pane is itself a native modal, and a Fluent `OverlayDrawer` would render behind it, while a second modal stacks on top, as the pack request dialog already does. The reader reuses the `packRequestDialog`, `packDetailHeader`, and `packDetailBody` styles, widened to `min(880px, calc(100vw - 16px))`. Its height fits the content up to the viewport height less 16 px, and only the body scrolls. The header holds the eyebrow `<item> details`, the document path as the title, and a Close button with the existing dismiss icon; there is no footer.

Opening the reader focuses its scrollable body. Escape or Close closes only the reader and returns focus to the button that opened it, or to the details pane's Close if that button is gone, following the request dialog's `requestTrigger` pattern. The reader also closes when its details pane closes or switches to another item. Add `a[href]` to the elements `trapTab` treats as focusable; otherwise Tab wraps back to the top and skips links after the last table.

The new `src/extensions/dude/frontend/markdown.jsx` exports `Markdown({ text })`. It calls `marked.lexer(text)`, with GFM on by default, and maps each token to a React element; it never uses marked's HTML output or `dangerouslySetInnerHTML`. It supports heading (as `h3`-`h6` under the reader's `h2`), paragraph, list, blockquote, table, code, hr, text, strong, em, del, codespan, br, link, image, and escape. Raw HTML and unknown tokens render as their source text, with HTML blocks in a code box, so a `<script>` tag is visible text and never runs. An absolute http(s) link is a Fluent `Link` with `target="_blank" rel="noopener noreferrer"`, the mechanism About's repository link uses (`about.jsx`). Relative links, anchors, and other schemes render as plain text, because the server's closed `ASSET_ROUTES` list serves no document files. Images render as their alt text, never as `<img>`, because the page's Content-Security-Policy restricts only frames and an image would load from a third-party server. Code blocks wrap, and a too-wide table scrolls sideways inside its own box.

marked replaces a hand-written parser, which is the one justified complexity here. Real entrypoints nest code blocks and lists inside numbered steps (clearline `SKILL.md`, step 8), so a hand-written parser would keep growing and show raw syntax on every missed case, which is what the user rejected. markdown-it and react-markdown each pull in several packages; marked is one package with no dependencies.

`sourceExplanation` adds "details" to what the matched source, or the default catalog for an Unlisted pack, supplies. There is no separate catalog-versus-installed mechanism (YAGNI).

| File | Change |
| --- | --- |
| `src/extensions/dude/lib/catalog-reader.mjs` | Read Available pack documents in `listCatalog`; mark GitHub-discovered rows. |
| `src/extensions/dude/lib/packs.mjs` | Carry documents through `joinItems`; read installed member READMEs. |
| `src/extensions/dude/lib/project-artifacts.mjs` | Read each project row's entrypoint body and root README. |
| `src/extensions/dude/frontend/use-canvas-data.js` | Keep pack documentation in `retainCatalog` alongside `description`. |
| `src/extensions/dude/frontend/settings.jsx` | Documentation section at both positions; the reader dialog and its focus return; `a[href]` in `trapTab`; `sourceExplanation` wording. |
| `src/extensions/dude/frontend/markdown.jsx` | New: `Markdown({ text })`, mapping `marked` lexer tokens to React elements. |
| `src/extensions/dude/frontend/styles.js` | The reader's width and height on the reused dialog styles, and rendered-document styles using current tokens. |
| `scripts/dude-canvas-ui/package.json` | Add `marked` at one exact version. |
| `scripts/dude-canvas-ui/package-lock.json` | Add marked's one registry entry. |
| `docs/commands.md` | In `#### Settings: optional packs`, replace the two sentences saying Settings shows no documentation and that the display belongs to feature 080 with a short description of the Details section and its reader. |
| Existing tests | Extend `src/extensions/dude/canvas-server.test.mjs`, `scripts/dude-canvas-ui/build.test.mjs`, and `scripts/dude-canvas-ui/browser.test.mjs`; update the pins below. |

`compose.mjs`, `pack-acquisition.mjs`, `canvas-server.mjs`, `build.mjs`, and `index.html` stay unchanged. The design adds no route, transport, store, or abstraction beyond the one dependency justified above.

## Generated Outputs And Pins

`node scripts/dude-canvas-ui/build.mjs` rebuilds `src/extensions/dude/ui/assets/app.js` and `app.js.LEGAL.txt`. The LEGAL file gains one marked section, generated from the esbuild metafile; `build.mjs` needs no change, and the build fails if marked's license file is missing or incomplete. The bundle must stay within the 358,400-byte compressed budget that `build.test.mjs` checks.

Find each pin with `git grep <old value>` and update it to the rebuilt bytes:

- The `app.js` SHA-256 in all five scripts that pin it, as context.md's "Hidden test couplings" entry records, and its byte size in `build.test.mjs`. Today the five are `scripts/build-dev.test.mjs`, `scripts/dude-canvas-ui/build.test.mjs`, `scripts/dude-canvas-ui/browser.test.mjs`, `scripts/dude-canvas-ui/t011-browser.test.mjs`, and `scripts/dude-canvas-ui/t012-installed-host.mjs`.
- The LEGAL byte size and SHA-256 in `build.test.mjs`, and the LEGAL SHA-256 in `t012-installed-host.mjs`.
- In `build.test.mjs`, the exact dependency list in the manifest and lock checks, and the bundled package count, from 53 to 54.

Keep approved design and reference pins unchanged, and leave historical `.dude` evidence untouched.

The user has private uncommitted edits in this worktree, so never run `node scripts/build-dev.mjs` here. Project only these outputs, selected from `listCoreOutputs` and written with `writeCoreOutput` from `scripts/build-release.mjs`. Refuse a missing or duplicate match, and write no other output.

```text
.github/extensions/dude/lib/catalog-reader.mjs
.github/extensions/dude/lib/packs.mjs
.github/extensions/dude/lib/project-artifacts.mjs
.github/extensions/dude/ui/assets/app.js
.github/extensions/dude/ui/assets/app.js.LEGAL.txt
```

Check live preimages before any write that overlaps a privately edited file, and change only this feature's lines there.

## Verification

These are planned checks for authorized implementation and testing owners; this definition runs none. Run acceptance in an owned copy where the user's private uncommitted files keep their HEAD bytes and unrelated untracked files are left out. Then confirm separately that those workspace files are unchanged. Follow `docs/commands.md#canvas-maintainer-acceptance`.

```text
node --test src/extensions/dude/canvas-server.test.mjs
node scripts/dude-canvas-ui/build.mjs
```

With Node 22+, set `DUDE_CANVAS_BROWSER` to an installed browser, `DUDE_CANVAS_BROWSER_REQUIRED=1`, and `DUDE_CANVAS_ARTIFACTS_DIR` to a short owned temporary folder. Run the following serially; the installed-host driver keeps its existing environment settings and short owned temporary roots.

```text
node --test scripts/dude-canvas-ui/build.test.mjs
node --test --test-concurrency=1 scripts/dude-canvas-ui/browser.test.mjs
node --test --test-concurrency=1 scripts/dude-canvas-ui/t011-browser.test.mjs
node --test --test-name-pattern="checked-in dev core is a byte-identical non-mutating projection of authoritative source" scripts/build-dev.test.mjs
node scripts/dude-canvas-ui/t012-installed-host.mjs
```

Name new browser cases with the prefix `080 Documentation:`. Record executed, failed, and skipped counts; a skip or zero selected tests is not coverage. The reader's web links use About's link mechanism, which the user already confirmed in the embedded host for 074, so no new human host observation is expected.

| Coverage | Cases |
| --- | --- |
| US1; FR-001-003, FR-007-008, FR-012, FR-015-016; SC-003-005 | Local-library Available packs, including clearline and strata; a GitHub-discovered fixture with the note and no member README request; 64 KiB and 64 KiB + 1 documents, the larger listed without a button; no request on selection or when the reader opens. |
| FR-005-006; SC-001-002, SC-005 | `build.test.mjs` renders all 20 `pack.md` bodies and both READMEs to static HTML with the file's existing helpers. It checks that `<clearline-root>` inside inline code is not escaped twice, no heading, table, or code-fence syntax appears outside code, the only links are http(s) and open in a new tab, there are zero `<img>` elements, and hostile HTML appears as text. |
| US2; FR-009-011; SC-002 | Installed clearline before and after Reload packs; matched and Unlisted source explanation wording. |
| US3; FR-004, FR-013-014; SC-006 | Project skill and agent with and without a README; an empty-body fixture; a linked or over-limit fixture with its withheld reason; an unreadable-entrypoint fixture and an unclosed-header fixture, each with its reason and no button; a linked README that is not read. |
| FR-002, FR-017-018; VSC-001-005; SC-007 | `080 Documentation:` browser cases: the reader's size at 1440x900, 360x900, and 180x450; no sideways scroll of the page or the reader; focus return after Escape and after Close; no button for a document over 64 KiB; no request when the reader opens. Also both themes at the four VSC sizes plus 200% reflow, keyboard order, contrast, and screenshots compared with the approved mock and 073's product states. |

## Design Gate And Delivery

The user approved the round-2 mock at `preview_path` with the Details rename, and the spec's Revision Log binds that approval to the exact bytes. The mock adds only the Documentation section, its reader, and the source explanation wording to 073's approved product states.

`tasks.md` holds the two derived sequential units, T001@6b3e91d4 and T002@f20a7c58. The first adds the three backend reads with server tests and their scoped projection. The second adds the marked dependency, `markdown.jsx`, the section and reader UI, the `docs/commands.md` update, the rebuild, every pin above, and the build, browser, and installed-host acceptance. Each executed unit gets one Tester and one independent Reviewer through ordinary Work.

## Guardrails And Risks

Existing project guardrails cover this feature: keep it simple, mandatory mock approval, Canvas continuity, no dead affordances, the pack lifecycle rule, harness-first UI verification, and established conventions. No supporting artifact applies.

- An installed pack's own documentation appears only after Reload packs, as its description does today.
- A GitHub-sourced Available pack shows no member READMEs before installation. A released install reads its default catalog from GitHub, so clearline and strata READMEs appear there only after installation.
- The bundle grows by about 15 KB gzipped, about 12-13 KB of it marked. This is an estimate; nothing was built or measured. It would leave roughly 54 KB of today's 68,781-byte headroom under the unchanged 358,400-byte budget.
- Installing marked contacts the npm registry once; the tests stay offline.
- Each `/api/packs` read now carries document text. Today's documents are small, and 64 KiB bounds each one.
