---
title: Dude Canvas Pack Documentation
slug: dude-canvas-pack-documentation
work_type: design
design_status: approved
approved_direction: Round 2 Markdown reader with the Details rename
preview_path: .dude/specs/080-dude-canvas-pack-documentation/design/pack-documentation.html
---

# Dude Canvas Pack Documentation

Show the documentation that packs and project agents and skills already carry inside their Settings details. A user can learn what a pack does before installing it, and how an installed pack or a project agent or skill works, without leaving Canvas. Each pack and project details view gains one read-only Documentation section directly after its facts, at the position the user approved in 073's mock.

Round 2 of the design, revised after the user rejected the round-1 mock, is approved. Implementation runs from `tasks.md`.

Two choices now follow the user's direction in that rejection: documents show as rendered Markdown, not raw text, and open in a reader window instead of the narrow details pane. The other two remain Ship-authorized definition-owner dispositions, not user answers: project agents and skills reuse the section, and an Available pack from a GitHub source shows only its `pack.md`, with the note. The user's approval of the round-2 mock confirms those two.

## User Scenarios

### US1 - Read an Available pack's documentation before installing (P1)

A user browsing Available opens a pack's details to learn what it does before requesting it.

Independent test: after Reload packs reads a local catalog, open Available packs with and without a member README. Nothing is installed.

1. Given a read catalog, when the user opens an Available pack's details, then a Documentation section directly after the facts lists one button per document: the pack's own documentation first, then each member skill README.
2. Given that section, when the user activates a document's button, then a reader window opens over the details and shows the whole document as formatted text, not Markdown source.
3. Given an Available pack read from a GitHub source, when its details open, then the section lists the pack's own documentation and the note "Member READMEs are not read from GitHub before installation."
4. Given any of these, when the user reads documentation, then no pack is requested, installed, or changed.

### US2 - Read an installed pack's documentation, including member READMEs (P1)

A user checks how an installed pack's skills work.

Independent test: use an installed pack with a member README, such as clearline, before and after Reload packs.

1. Given an installed pack whose skill folder holds a README, when the user opens its details, then that README is listed and opens in the reader, even before Reload packs.
2. Given no catalog read yet, when the details open, then in place of the pack's own documentation the section says it was not read and points to Reload packs, as the description does.
3. Given a catalog read, when the details open, then the pack's own documentation comes from the same source as its description, and the source explanation says that source supplies documentation too.

### US3 - Read a project agent's or skill's documentation (P2)

A user inspects a project agent or skill listed in Installed.

Independent test: use project skill and agent fixtures with and without a README, plus one with withheld files. No pack or catalog read is needed.

1. Given a project skill, when the user opens its details, then the Documentation section sits after the facts and before Files, with a button for its `SKILL.md`, then one for the README at the root of its folder when one exists.
2. Given a project agent, when its details open, then the section has a button for the agent file, then one for the README at the root of its companion folder when one exists.
3. Given an artifact whose files are withheld, when its details open, then the section shows that reason instead of any document.

## Edge Cases

- An item with no documents shows "No details found." A document with no text after its metadata header is not listed.
- A document whose file is larger than 64 KiB is listed by its path with "Not shown: larger than 64 KiB" and no button, and is never shown in part. The item's other documents still open.
- Unavailable documentation says why. An installed pack's own documentation uses the description's existing wording before a catalog read or when no readable catalog record exists. A project artifact shows its row's existing reason when its files are withheld, or when its `SKILL.md` or agent file is unreadable or has an unclosed metadata header.
- An Available pack from a GitHub source lists only its own documentation, with the note from US1. Its member READMEs appear after installation.
- In the reader, an http or https link opens in a new tab only when the user follows it. A relative link or anchor shows as plain text, an image shows its alt text, and raw HTML shows as literal text. Nothing in a document is fetched or run.
- Long lines and code blocks wrap at every width, and a table too wide for the reader scrolls sideways inside its own box. A long document scrolls in the reader's body while the reader's header stays visible.

## Functional Requirements

- FR-001: Pack details in Installed and Available, and project agent and skill details, show one Documentation section, with the visible heading "Details", directly after the facts, in both the wide pane and the narrow overlay. This is the position 073 reserves in its FR-077.
- FR-002: The section lists one button per document that can be shown, labeled with the document's path. Activating a button opens that document in a reader window over the details.
- FR-003: A pack's documents are its own documentation (the `pack.md` text after its metadata header), then the README at the root of each member skill folder. Member agents and member `SKILL.md` files are not listed.
- FR-004: A project skill's documents are its `SKILL.md` text after the metadata header, then the README at the root of its folder. A project agent's documents are its agent file's text after the metadata header, then the README at the root of its companion folder.
- FR-005: The reader shows the document's full text rendered as Markdown: headings, paragraphs, bold, italic, strikethrough, inline code, wrapped code blocks, nested lists, blockquotes, horizontal rules, and tables.
- FR-006: An http or https link in a document opens in a new tab only when the user follows it, as About's repository link does. Relative links and anchors show as plain text, images show only their alt text, raw HTML shows as literal text, and nothing in a document is fetched or run.
- FR-007: A document whose file is larger than 64 KiB is listed by its path with "Not shown: larger than 64 KiB" and no button, and no part of it is shown.
- FR-008: An item with no documents and no unavailable reason shows "No details found." A document with no text is not listed.
- FR-009: An installed pack's member READMEs come from its installed files and appear without a catalog read.
- FR-010: An installed pack's own documentation comes from the same catalog record as its description. Until a catalog read supplies it, the section gives the description's existing not-read or unavailable reason in its place.
- FR-011: An installed pack's source explanation names details along with the description and use cases that its matched source, or for an Unlisted pack the default catalog, supplies, as in "...description, use cases, and details." and "Description, use cases, and details come from...".
- FR-012: An Available pack read from a GitHub source lists its own documentation and shows the note "Member READMEs are not read from GitHub before installation."
- FR-013: When a project artifact's files are withheld, or when its `SKILL.md` or agent file is unreadable or has an unclosed metadata header, the section shows its row's existing reason instead of documents.
- FR-014: Documentation is read only from the pack's catalog folder or its installed member skill folders, or from the project artifact's own file and folder, and no file-system link is followed.
- FR-015: Documentation arrives with the rest of the details. Selecting a row or opening the reader starts no separate read and shows no loading state.
- FR-016: Reading documentation requests, installs, activates, and changes nothing, and contacts no source beyond the existing pack, catalog, and project reads.
- FR-017: The reader is a modal window centered over the details, with the page dimmed behind it, and shows one document at a time. Its header shows the eyebrow `<item> details`, the document's path as its title, and Close. Its height fits the document up to the viewport height less 16 px, and only its body scrolls.
- FR-018: Each document button, and the reader's Close and links, are reachable and operable by keyboard with visible focus, and document text can be selected in the usual way. Escape or Close closes only the reader and returns focus to the button that opened it, or to the details' Close if that button is gone. The reader also closes when its details close or show another item.

## Key Entities

- Document: one existing file shown for a pack or project artifact, with its name and either its text or the reason it is not shown.
- Documentation section: the ordered documents of the selected pack or project artifact, or the one reason none are shown. Its visible heading is "Details".

## Visual Intent

Show each document the way GitHub and npm render a package's README: formatted headings, lists, tables, and code, never Markdown source. Open it in a centered reader window, the modal-dialog pattern Canvas already uses for pack requests, because the 164-320 px details pane is too narrow to read in. The Documentation section stays a short list of document buttons at 073's position, so the details still read as facts.

VS Code's tabbed details, side drawers, and readers with previous, next, or a table of contents are deliberately not followed. A lone tab would lead nowhere, and one centered window showing one document is the smallest reader that solves the width problem. Canvas cannot follow a document's relative links or load its images, so those show as text.

### Should Feel

- In the details, like one more group of facts; in the reader, like a formatted README with room to read.
- Honest: the reader shows the file's own content, and anything missing says why.

### Should Never Feel

- Like Markdown source, a cramped pane, or a separate app.
- Like a web page or a marketplace listing, or like it offers images, working relative links, downloads, or a prompt to install.

## Proposed Direction

- Settled round 2: the Documentation section stays directly after the facts and lists one button per document, labeled with its path, with `pack.md` or the project entrypoint first and READMEs after it. It keeps the not-read wording, "No details found.", a too-large document's path with its notice and no button, the GitHub note, and the withheld reason. An unreadable or unclosed-header entrypoint still shows its row's existing reason (FR-013).
- Each button opens a reader window centered over the details, with a dimmed backdrop. It is 880 px wide at 1440x900, 344 px at 360x900, and 164 px at 180x450, and as tall as its document up to the viewport height less 16 px. Its header shows `<item> details`, the document's path as the title, and Close; there is no footer, and only the body scrolls.
- The reader renders the Markdown. Links to http and https addresses open in a new tab, as About's repository link does; relative links and anchors stay plain text, images show their alt text, and raw HTML shows as literal text.
- It fits because it answers the user's round-1 rejection: formatted text replaces raw Markdown, and a window up to 880 px wide replaces reading in the 164-320 px pane. The section keeps 073's approved position, and the details keep their order.
- Changed from round 1: document buttons and the reader replace the inline disclosures and wrapped monospace text. The source explanation wording (FR-011) and the reason rule (FR-013) carry over.
- FluentUI's mock decisions: no real table is too wide for the 880 px reader, so the wide-table state shows the real clearline README table at 360x900. One Sample `SKILL.md` shows the link, image, and raw-HTML handling and is also the state with a project entrypoint open in the reader. The reader closes on Escape or Close, like the pack request dialog.
- The user approved round 2 with one rename: "Documentation" becomes "Details" in the section heading, the empty state, the reader eyebrow, and the source explanation.

## Scope And Surfaces

In scope: the Documentation section in Installed and Available pack details and in project agent and skill details, in the wide pane and the narrow overlay, and the reader window its buttons open. That covers the document buttons; the no-documentation, too-large, not-read, unavailable, withheld, entrypoint-reason, and GitHub-note states; the reader's rendered Markdown and its handling of links, images, and raw HTML; and "details" added to the installed-pack source explanation.

Out of scope: raw Markdown as the reading view, document text inline in the details, syntax colors, Copy, Open, or Download buttons, tabs, previous and next, a table of contents, search, resizing, maximizing, a side drawer, images, clickable relative links, member selectors, spinners, retry, install prompts, and any other change to 073. Source details, member agents, and member `SKILL.md` files get no documentation. Reading member READMEs from GitHub before installation is excluded; it would need a separate on-demand acquisition slice. Documentation authoring, generation, new formats, changes to how documentation is installed or kept, and any documentation store, registry, or file browser are also excluded.

The implementation owner declared the round-2 capability envelope in the Architect's round-2 recommendation of 2026-10-11: the section's heading and one button per document; a centered modal reader with a dimmed backdrop, a header with the eyebrow, the document's path, and Close, and no footer; rendered Markdown; and http and https links as inline links. The mock shows nothing outside that envelope.

The mock adds only this section, its reader, and the source explanation wording to 073's approved product states. It changes no layout, navigation, rail destination, or other details section. In both themes at the VSC sizes, it shows:

- Available clearline from the local library, with its `pack.md` and member README each open in the reader, and an Available pack from a GitHub source with its note.
- Installed clearline before and after Reload packs.
- A project skill and a project agent with documentation, one artifact with none, one with withheld files, and one with an unreadable or unclosed-header entrypoint.
- A document larger than 64 KiB, listed without a button.
- The reader over the narrow details overlay, with a long document scrolling in its body and a wide table scrolling inside its box.
- Link, image, and raw-HTML handling, in a labeled sample where the real documents have none.

Use the real `rust` and `clearline` documents, and label constructed states as samples, so the user can judge the rendering, the reader, and the GitHub limit at approval.

Continuity references, not dependencies or execution order:

- Product vision: `.dude/ideas/052-dude-canvas-ui.md`.
- Workspace baseline: `.dude/specs/052-dude-canvas-ui/design/fluent-desktop-workspace.html`.
- Approved Settings adaptations: `.dude/specs/063-dude-canvas-settings/design/pack-management.html`, `.dude/specs/074-dude-canvas-about/design/about.html`, and `.dude/specs/073-dude-canvas-artifact-import/design/artifact-import.html` (SHA256 `58cffc7a8be6699726c87508e8524a866e55435f53293a712b664ad49840c4f9`), whose "Planned (080)" annotations reserve this position.

## Brand Fit

- Reuse the details pane's typography, spacing, borders, focus treatment, and code text, and the pack request dialog's surface, in light and dark appearances. Add no color, font, icon, or token.
- Rendered document text, links, button labels, and focus indicators meet WCAG AA contrast.

## Visual Success Criteria

- VSC-001: From open pack or project details, a document is readable in the reader after one activation of its button.
- VSC-002: At 180x450, 360x900, 768x900, and 1440x900 in both themes, and at 200% zoom down to an effective 180x450, neither the page, the details, nor the reader scrolls sideways; only a too-wide table scrolls inside its own box. The reader is 880 px wide at 1440x900, 344 px at 360x900, and 164 px at 180x450, is at most the viewport height less 16 px tall, and keeps its header and Close visible while its body scrolls.
- VSC-003: Tab and Shift+Tab reach each document button in order with visible focus, and Enter or Space opens the reader with focus on its body. Inside the reader, Tab and Shift+Tab move through Close and every link without leaving it, and Escape or Close returns focus to the button that opened it, or to the details' Close if that button is gone.
- VSC-004: Rendered document text, links, and button labels meet 4.5:1 contrast, and focus indicators meet 3:1, in both themes.
- VSC-005: Apart from the Documentation section, its reader, and the source explanation wording, the rendered details match 073's approved product states, and the result matches the approved mock at `preview_path`.

## Success Criteria

- SC-001: For every pack in the local library, Available details list its own documentation, and the reader shows its whole `pack.md` text after the metadata header, rendered, with no heading, table, or code-fence syntax outside code.
- SC-002: Each existing member README (clearline and strata today) opens complete and rendered, with no heading, table, or code-fence syntax outside code, in Available details after Reload packs and in Installed details before and after it.
- SC-003: A 64 KiB document shows in full, and a document one byte larger shows only "Not shown: larger than 64 KiB".
- SC-004: A GitHub-sourced Available pack shows its own documentation and the note, with zero member README requests to GitHub.
- SC-005: Across the acceptance fixtures, opening details and opening or closing the reader cause zero additional reads, writes, installs, or network requests. Rendered documents contain zero images, every link is http or https and opens in a new tab, and hostile HTML shows as text and never runs.
- SC-006: Project skill and agent fixtures list their instruction file and then their root README, and each opens rendered in the reader. A fixture without documents shows "No details found.", and each fixture with withheld files, an unreadable `SKILL.md` or agent file, or an unclosed metadata header shows its reason and no document button.
- SC-007: All visual criteria pass on the rendered implementation, and the user's explicit approval of the canonical mock is recorded before implementation begins.

## Assumptions

- 073's approved round-5 mock fixes the position directly after the facts in every pack and project details view; 080 owns what appears there.
- The two Ship dispositions named at the top remain proposals until the user approves the mock.
- Today all 20 library packs have non-empty `pack.md` documentation, and only clearline and strata have member READMEs, 8,902 bytes together. No document exceeds 64 KiB.
- Documentation files are text.

## Revision Log

- 2026-10-11T18:09:39Z - Initial exploring proposal; canonical mock creation and explicit user visual approval remain pending.
- 2026-10-11T19:17:53Z - Settled the design to `proposed` and widened FR-013 and SC-006 to 073's unreadable and unclosed-header fixtures. Bound artifact: `.dude/specs/080-dude-canvas-pack-documentation/design/pack-documentation.html`, SHA256 `a41dd9a075e0e2cb78a279a1441c65670e7d430a5ef554ac1e76dd96014adaef`, 489,105 bytes, self-contained and offline. Its 46 PNGs in `design/screenshots/` cover 11 states at 1440x900 and 360x900 in both themes, plus 180x450 and 200%-zoom captures. FluentUI, the mock author, reports that outside the documentation changes, the mock matches 073 in 348 DOM and 204 pixel comparisons, with no horizontal scroll at any VSC size, passing keyboard checks, and at least 5.18:1 contrast for text, labels, markers, and focus; this is not independent. Coordinator inspection of five screenshots confirmed the drawn states and no affordance outside the envelope. This evidence supports the proposal only and is not user approval.
- 2026-10-11T21:13:12Z - Reopened the design to `exploring` for round 2 after the user rejected the round-1 mock bound in the previous entry, at 2026-10-11T20:37:54Z: "the documentation is shown as raw markdown , that's a big no , also I would prefer probably a popup /overlay windows as the area to display the docs is to narrow , the mockup is therefore rejected". Round 2 follows the Architect's round-2 recommendation: the section at 073's position lists one button per document, and each button opens a modal reader, stacked over the details, that renders one document's Markdown, opens http and https links in a new tab, and shows relative links, anchors, images, and raw HTML as text. Rendered display and the reader window now follow the user's direction; project reuse and the GitHub `pack.md`-only limit remain Ship dispositions. The spec and plan are revised to match; the round-2 mock and the user's explicit approval of it are pending.
- 2026-10-11T21:37:18Z - Settled round 2 to `proposed`. Bound `.dude/specs/080-dude-canvas-pack-documentation/design/pack-documentation.html`, SHA256 `507d47ebfe69494d3b8c57603099965506ce4ae7dedadaf969a4d3abfa1e4db4`, 555,572 bytes, self-contained, offline; it inlines `marked` 18.1.0 with its MIT notice for mock rendering only. Its 27 PNGs in `design/screenshots/` replace round 1's 46, now archived outside the repo: twelve 1440x900 states in both themes, plus 360x900 wide-table, 180x450, and 200%-zoom captures. FluentUI, the mock author, reports no horizontal page scroll, Tab order and focus return, AA contrast for text, links, and inline code, and an otherwise unchanged 073; this is not independent. Five coordinator-inspected screenshots confirmed the buttons, the rendered real README, the sample link, image, and HTML handling, the narrow readers, and nothing outside the envelope. This evidence supports the proposal only and is not user approval.
- 2026-10-11T22:21:56Z - Approved round 2 with the Details rename through the user's explicit chat reply at 2026-10-11T22:12:34Z: "I think that we shouls rename Documentation to Details or something alike. Doumentations sonds like deep detailed description while the pack.md hold a general desciptikon, other than that I approve it". The coordinator chose the user's own suggestion, "Details", for the section heading, the empty state, the reader eyebrow, and the source explanation wording. Approved artifact: `.dude/specs/080-dude-canvas-pack-documentation/design/pack-documentation.html`, SHA256 `2b71061155b280e360b0b1335c257c4435da48e34a8ee868a771c41670127299`. The user viewed `507d47ebfe69494d3b8c57603099965506ce4ae7dedadaf969a4d3abfa1e4db4`; the coordinator verified that the approved bytes differ from it only by this user-directed rename and mock-only chrome. The approval allows implementation through Lightweight Execution from the two units derived in `tasks.md`.
