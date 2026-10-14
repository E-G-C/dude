---
title: Upstream Packs In A Checkout
slug: upstream-packs-in-checkout
work_type: design
design_status: approved
approved_direction: Upstream packs in a checkout, round 1
preview_path: .dude/specs/084-upstream-packs-in-checkout/design/upstream-packs.html
---

# Upstream Packs In A Checkout

In a development checkout, a workspace that has a local library at `library/packs`, such as this repository, Reload packs in Settings > Packs also reads Bundle upstream. A pack that exists only upstream then appears in Available and installs through 083's one-step dialog, without pulling the checkout or asking in chat. A pack that exists in both places is listed once, from Local library, which stays the default catalog and the copy the developer edits. Before the first Reload, Canvas says that upstream packs appear after Reload packs.

Today a checkout lists Bundle upstream as "Not read while library/packs exists", and Add source refuses the upstream as already listed, so Canvas offers no path to a pack that exists only upstream. For a checkout, this feature replaces that part of 073's FR-033 and adds one exception to 073's FR-053, which otherwise lists same-name packs from different sources as separate rows. Released installs, which already read the upstream, keep their behavior, and so does Compose, Dude's pack installer.

Design is `approved`: the user approved round 1 in chat at 2026-10-14T01:35:11Z, the mock at `preview_path` is the approved direction, and `tasks.md` derives two implementation units.

Reading on every Reload, never on open, and the notice before the first Reload follow the user's answer to question 1. Local wins follows the answer to question 2. FR-008, FR-021, FR-025 through FR-027, and the accepted GitHub limit in Assumptions follow four Ship-authorized definition-owner dispositions recorded in the idea's Definition Package. They are not user answers, and the user confirms or changes them through the mock approval.

## User Scenarios

### US1 - Install a pack that exists only upstream (P1)

A developer in a checkout learns that a new pack landed upstream and wants to install it from Settings without pulling.

Independent test: in a checkout fixture whose local library lists `alpha` and `shared` and whose upstream lists `shared` and `fresh`, choose Reload packs, then install `fresh` from its details.

1. Given the checkout, when the user chooses Reload packs, then Available lists `fresh` with Source `Bundle upstream - GitHub <owner>/<repo>`, and `alpha` and `shared` from Local library.
2. Given those rows, then `shared` appears once, from Local library, and the Available total and the Source filter agree with the rows.
3. Given `fresh`'s details, when the user clicks Install, then 083's dialog shows `Checking Bundle upstream...`, and its ready view names Bundle upstream as the source, shows the commit it read, and shows no third-party warning.
4. Given that ready view, when the user clicks Install once, then the pack installs at the commit the preview read, even if the upstream branch moved since, appears in Installed with Source Bundle upstream, and leaves Available.

### US2 - Learn that upstream packs appear after a Reload (P1)

A developer opens Settings in a checkout and needs to know that upstream packs are not listed until Reload packs reads them.

Independent test: open Settings in the checkout fixture, browse every Packs view without choosing Reload packs, and count requests to the upstream.

1. Given a checkout whose catalog has not been read, when the user opens Available, then it says that Reload packs also reads Bundle upstream and adds the packs Local library does not have, beside the existing Reload packs button.
2. Given the same state, when the user opens Sources, then Bundle upstream reads `Not read`, and its details say that Reload packs reads it and that Available lists only its packs the local library lacks.
3. Given any browsing before a Reload, including changing views, filtering, paging, and returning to the window, then Canvas sends no request to the upstream.
4. Given a release workspace, or a checkout whose bundle manifest names no upstream, then Available shows its existing not-read state without that sentence.

### US3 - Keep working when the upstream cannot be read (P2)

A developer reloads while offline, or after GitHub refused or rate-limited the read, and still needs the local catalog.

Independent test: in the checkout fixture, make the upstream unreachable and choose Reload packs.

1. Given an unreachable upstream, when the user chooses Reload packs, then Available lists every local pack, and the coverage notice names Bundle upstream as `Unavailable` with its reason.
2. Given that Reload, then Sources shows Bundle upstream as `Unavailable` with its reason, the Source filter marks it `(unavailable)`, and counts say `known`.
3. Given the upstream is reachable again, when the user chooses Reload packs, then its upstream-only packs appear as in US1.

### US4 - Refresh or remove a pack installed from the upstream (P3)

A developer who installed an upstream-only pack later refreshes or removes it, possibly after a pull added the same pack to the local library.

Independent test: with `fresh` installed from the upstream, refresh it, then add `fresh` to the local library and refresh it again.

1. Given `fresh` installed from Bundle upstream and absent from the local library, when the user clicks Refresh pack, then the dialog shows `Checking Bundle upstream...`, its ready view names Bundle upstream with the commit it read, and it shows no `Source changes` line.
2. Given the local library now has `fresh`, when the user clicks Refresh pack, then the ready view names Local library and shows `Source changes: <repository> @ <commit> -> Local library (library/packs)` before the click.
3. Given that preview, when the user clicks Refresh once, then Installed shows Local library as `fresh`'s source, and later refreshes use the local copy.
4. Given `fresh` installed from Bundle upstream and absent from the local library, when the user removes it and chooses Reload packs, then `fresh` returns to Available from Bundle upstream.

## Edge Cases

- Offline, refused, or rate-limited upstream reads (FR-018, FR-019): Bundle upstream reads `Unavailable` with its reason, and every local and added-source row stays listed. GitHub's hourly allowance for anonymous reads can run out after a few Reloads within an hour, and Bundle upstream then reads `Unavailable` until it resets.
- A pack in both places (FR-005): Available lists the local copy only. Bundle upstream's `Read - N packs` still counts it, and its Packs found says how many of its packs Available lists (FR-013, FR-014).
- An installed pack: no source lists it in Available, as today, wherever it was installed from. Bundle upstream's count still includes it.
- A pack installed from the upstream that later appears in the local library (FR-026, FR-027): Installed keeps showing Bundle upstream until a Refresh, which reads the local copy and shows the `Source changes` line first.
- The local library cannot be read in a Reload, for example while an edited `pack.md` has invalid metadata (FR-008): nothing is hidden. Install of a pack the local library has still takes the local copy, and the ready view names Local library.
- A pull between a Reload and an Install adds the pack to the local library (FR-026): the row still says Bundle upstream, and the ready view names Local library before the click.
- A release workspace (FR-004, FR-028), or a checkout whose bundle manifest names no upstream (FR-010): nothing more is read, and no new sentence or fact appears.
- A slow upstream keeps the Reload pending within the existing bounds: 30 seconds for one GitHub source and 60 seconds for the whole Reload.

## Functional Requirements

### Reading Bundle upstream

- FR-001: In a development checkout whose bundle manifest names an upstream, each Reload packs reads Bundle upstream once, as its own source, beside Local library and each source the project added.
- FR-002: The one catalog read that follows adding or removing a source also reads Bundle upstream, as a Reload does.
- FR-003: Canvas does not read Bundle upstream when Settings opens, or when the user changes views, filters, pages, uses Show packs in Available, or returns to the window.
- FR-004: A workspace without a local library reads the same catalogs, at the same times, as before this feature.

### Local wins

- FR-005: After a Reload that read Local library, Available lists no Bundle upstream pack whose name Local library listed.
- FR-006: Available lists each Bundle upstream pack that Local library did not list and that is not installed, as its own row with Source `Bundle upstream - GitHub <owner>/<repo>`.
- FR-007: A same-name pack from a source the project added keeps its own Available row beside Local library's, as 073 defines.
- FR-008: When a Reload cannot read Local library, Available hides no Bundle upstream pack.

### Before the first Reload

- FR-009: While the catalog has not been read in a checkout that lists Bundle upstream, Available says that Reload packs also reads Bundle upstream and adds the packs Local library does not have.
- FR-010: A workspace without a local library, or a checkout whose bundle manifest names no upstream, does not show that sentence.
- FR-011: While Bundle upstream has not been read in a checkout, Sources shows it as `Not read`, like any source that has not been read.
- FR-012: In a checkout, Bundle upstream's details say that Local library stays the default catalog, that Reload packs also reads Bundle upstream, and that Available lists only its packs that Local library does not have.

### Sources after a Reload

- FR-013: After a Reload reads Bundle upstream, its status counts every pack it lists, including packs that are installed or also in Local library.
- FR-014: In a checkout, Bundle upstream's Packs found also states how many of its packs Available lists, with a note that the total includes packs already installed or also in Local library.
- FR-015: In a checkout, Show packs in Available for a read Bundle upstream is enabled only when Available lists at least one of its packs; when it is disabled for that reason, the reason says that every pack is installed or also in Local library.
- FR-016: After a Reload reads Bundle upstream in a checkout, when Available is filtered to Bundle upstream and lists none of its packs, the empty state says that packs Local library also has are listed from Local library.
- FR-017: No Settings text says "Not read while library/packs exists" or describes Bundle upstream as not read by design.

### Unavailable upstream

- FR-018: When a Reload cannot read Bundle upstream, whether offline, refused, or over GitHub's hourly allowance, Sources and the coverage notice show it as `Unavailable` with the reason.
- FR-019: A failed Bundle upstream read removes no Local library or added-source row from Available.

### Install, Refresh, and Remove

- FR-020: Install on a Bundle upstream row opens 083's pack action dialog, which shows `Checking Bundle upstream...` while it checks.
- FR-021: In a checkout, an Install or Refresh preview that read Bundle upstream shows a `Commit` fact directly under Source, with the full commit it read.
- FR-022: A preview that read Bundle upstream shows no third-party warning.
- FR-023: Confirming an Install or Refresh whose preview read Bundle upstream applies the commit the preview read, even if the upstream branch moved after the preview.
- FR-024: No Settings action installs or refreshes the upstream copy of a pack that Local library has.
- FR-025: A Refresh of a pack installed from Bundle upstream shows `Checking Bundle upstream...` while it checks.
- FR-026: When an Install or Refresh uses no source the project added, its ready view names the source the preview read: Bundle upstream or Local library.
- FR-027: When the source the preview read differs from the pack's recorded source, the ready view shows `Source changes: A -> B` before the click, such as `https://github.com/E-G-C/dude @ <commit> -> Local library (library/packs)`.
- FR-028: In a workspace without a local library, the Install and Refresh dialogs show the same facts and text as before this feature.

## Key Entities

- Development checkout: a workspace that has a local library at `library/packs`, such as this repository. Local library is its default catalog.
- Bundle upstream: the built-in source that the bundle manifest names by repository and ref. In a checkout, Reload reads it as one more source; elsewhere it is the default catalog.
- Upstream-only pack: a pack that Bundle upstream lists and Local library does not.
- Hidden upstream copy: a Bundle upstream pack whose name Local library listed in the same Reload. Bundle upstream's count includes it, and Available does not list it.

## Visual Intent

Follow the explicit refresh people know from `apt update`: new packages appear only after a refresh, and the tool says so before it runs. For a pack in both places, follow repository priority, as pacman's repository order and conda's strict channel priority do: the first source that has a name supplies it, and later same-name copies are not offered. For the notice, follow Fluent 2's empty-state guidance: say why the list is empty and offer the one action that fills it. For the commit, follow 083's third-party bar, which shows a full commit in monospace after "Commit:"; the new Commit fact under Source uses the same treatment.

Three familiar patterns are deliberately not followed. apt's policy view and package managers with several feeds list every candidate side by side, and the user declined listing both copies in question 2. Refreshing on open or polling in the background suits tools that sync continuously, and the user chose a read only on Reload packs in question 1. GitHub Desktop's "last fetched" time and the badge beside Fetch origin track staleness, which this feature does not.

### Should Feel

- Predictable: upstream packs appear when the user chooses Reload packs, and Canvas says so before the first Reload.
- Quiet: one sentence before the first Reload, and an upstream-only pack listed like any other row.
- Honest about provenance: an upstream row names Bundle upstream, and the dialog names the source and commit its preview read.

### Should Never Feel

- Like two catalogs to reconcile: no duplicate rows, version badges, "newer" or "differs" labels, or copy pickers.
- Like a background sync: no reads on open, polling, timestamps, or staleness badges.
- Like a warning about the Dude bundle itself: Bundle upstream has no third-party warning or trust prompt.

## Proposed Direction

Round 1 is FluentUI's mock at `preview_path`, settled for the user's explicit approval. It copies 083's approved mock byte for byte, then adds only the states in Scope And Surfaces, so layout, navigation, sizes, the dialog surface, its footer, and focus behavior stay as 083 drew them. Mock-only controls, including the `?upstream=` chooser, select its 28 states. It fits Visual Intent: one sentence before the first Reload, ordinary rows after it, and 083's dialog naming the source and commit its preview read.

- Before the first Reload in a checkout that lists Bundle upstream, Available's `Catalog not read yet` state adds one sentence after its existing sentence and before Reload packs: "Reload packs also reads Bundle upstream (GitHub E-G-C/dude) and adds the packs that Local library does not have." A release workspace and a checkout whose bundle manifest names no upstream show that state without it.
- After a Reload, an upstream-only pack is an ordinary Available row with Source `Bundle upstream - GitHub E-G-C/dude`, sorted by name and counted in the tab total. Its details are the existing ones, titled `<pack> - Bundle upstream`, with Location `https://github.com/E-G-C/dude` and Tracked ref `main`.
- In Sources, Bundle upstream reads `Not read`, with 073's notice and reason, then `Read - N packs` or `Unavailable - <reason>`. Its description now ends: "This development bundle has a local library, which stays the default catalog. Reload packs also reads Bundle upstream, and Available lists only its packs that Local library does not have." Packs found reads like "19 (1 in Available)", or "18 (none in Available)" when Available lists none of its packs, with the note "Counts include names you already have installed or that Local library also has. Available lists only the others." Show packs in Available is enabled while Available lists one of its packs; otherwise its reason is "Every pack here is installed or also in Local library." 073's other reasons, and every other source, keep their text.
- Available filtered to Bundle upstream with nothing listed shows "No matching packs" and "Packs that Local library also has are listed from Local library. Clear the filters to see all packs in this context."
- When Bundle upstream cannot be read, the partial notice on Available and Installed adds the line "Bundle upstream - GitHub E-G-C/dude: Unavailable - <reason>", counts say `known`, and the Source filter option ends with `(unavailable)`. The reason is Compose's own message, such as "failed to fetch source https://github.com/E-G-C/dude @ main: GitHub metadata fetch failed: fetch failed" offline, or "failed to fetch source https://github.com/E-G-C/dude @ main: GitHub metadata request failed with HTTP 403 (rate limit)" over GitHub's hourly limit.
- Install for an upstream-only pack shows "Checking Bundle upstream...". Its ready view lists the items it adds, Required tools, Source "Bundle upstream - GitHub E-G-C/dude", a new "Commit" fact directly below Source with the full commit in 083's monospace, the new-session note, and a collapsed Show files list, with Cancel and Install and no third-party bar. Blocked shows Compose's message beside the disabled Install, with only Close. Applying, Cancelling, Cancelled, Changed, Failure, and Success stay as 083 drew them.
- Installed lists a pack installed from Bundle upstream with Source "Bundle upstream - GitHub E-G-C/dude" and its existing recorded source facts, including the commit. Its Refresh also shows "Checking Bundle upstream...". While Local library lacks the pack, the ready view names Bundle upstream with the Commit, the overwrite warning, and the file groups. After a pull adds the pack, the ready view names "Local library - Local folder" and shows Source changes "https://github.com/E-G-C/dude @ <commit> -> Local library (library/packs)", without a Commit, and after that Refresh, Installed names Local library. Neither ready view shows a third-party bar.
- Two details follow the shipped product where 083's mock differed: the Use case filter is disabled before the first Reload, and the partial notice opens with "Some sources could not be read. Packs from them are not listed."
- Real data: this checkout's library and the real Bundle upstream, `https://github.com/E-G-C/dude` at `main`. Today they list the same packs, so without samples Bundle upstream reads "Read - 18 packs" and "18 (none in Available)". Labeled samples: the upstream-only pack `devops` with its items and commit, a pull that adds it to Local library, and both reasons. FluentUI named it `devops` rather than `fresh`, the acceptance fixture's name, so that no drawn title reads like a staleness word, as "Refresh fresh" would. The fixture keeps `fresh`, which is test data, not product text.
- Not drawn, because the envelope has no state for them: a Reload that cannot read Local library (FR-008) and a pull between a Reload and an Install (FR-026). The edge cases describe both.
- Open points for the approval: approving the mock also confirms the four Ship dispositions, FR-008's without a drawn state. The reasons and `Source changes` keep Compose's words, the repository URL, "HTTP 403", and the commit after "@", as 083's product already shows them; plainer words would need a product change outside the plan. Sources' unavailable notice runs a reason that lacks a final period into "Its packs are not listed under Available.", as the product already does. Show packs in Available keeps 073's note, "Show packs in Available lists this source's packs that are not installed.", for Bundle upstream too.

## Scope And Surfaces

In scope: Available's not-read state in a checkout; Available rows, the Source filter, and details for upstream-only packs after a Reload; the coverage notice when Bundle upstream cannot be read; Bundle upstream's row and details in Sources; 083's Install and Refresh dialogs for packs read from or recorded from Bundle upstream; the Installed row of a pack installed from Bundle upstream; and the Settings docs for these.

The implementation owner declared the capability envelope in the Architect's recommendation of 2026-10-13. The mock may show only these states:

- Available before the first Reload in a checkout: the existing `?` counts, `Catalog not read yet` with its sentence, the Reload packs button, the coverage notice, and the disabled Use case filter, plus the one new sentence. As contrast, a release workspace and a checkout without an upstream, both without the sentence.
- Available after a Reload: the local rows plus an upstream-only row with Source `Bundle upstream - GitHub E-G-C/dude`, sorted by name and counted in the tab total; Bundle upstream in the Source filter; that row's existing details, from the title `<pack> - Bundle upstream` through Install, Use cases, Source, Location, Tracked ref `main`, Declared tools, Details with `pack.md` and the GitHub README note, and Projected files; and, filtered to Bundle upstream with nothing listed, `No matching packs` with the local-wins sentence and the existing Clear sentence.
- Available after a Reload with Bundle upstream unreadable: the existing `partial` notice with the line `Bundle upstream - GitHub E-G-C/dude: Unavailable - <reason>`, known counts, and the `(unavailable)` filter option; the same notice on Installed.
- Sources: the Bundle upstream row as `Not read`, `Read - N packs`, or `Unavailable - <reason>`, with the existing glyphs, location, ref, and `Built in` scope; and its details with the existing notices, the reworded description, Show packs in Available enabled or disabled with its reason, the read-only note, and the facts Status, Packs found with its note, Installed from this source, and Saved in.
- The Install dialog for an upstream-only pack: Loading, with `Checking Bundle upstream...` and Cancel; Ready, with the items it adds, Required tools, Source `Bundle upstream - GitHub E-G-C/dude`, the full commit under Source, the new-session note, a collapsed Show files list, Cancel, and Install, and no warning bar; Blocked, when the upstream cannot be read during the preview, with the reason beside the disabled Install and only Close; and Applying, Cancelling, Cancelled, Changed, Failure, and Success exactly as 083 drew them.
- Optionally, the Refresh dialog for a pack installed from Bundle upstream: while the local library lacks it, with Source Bundle upstream, the commit, the overwrite warning, and the file groups; after a pull, with Source `Local library - Local folder` and the `Source changes` line, without a commit. Neither shows a third-party bar.
- Optionally, Installed with that pack's Source `Bundle upstream - GitHub E-G-C/dude` and its existing recorded source facts.

The mock must not show:

- Version badges, numbers, or tags, or words such as "update available", "newer", "differs", "modified", or "out of date".
- Both copies of a same-name pack, as a second row, an "also in Bundle upstream" chip, a copy picker, or a source switch on a row.
- A forced upstream install or refresh, such as "Install from upstream", "Use upstream copy", or "Refresh from upstream".
- New settings, toggles, checkboxes, or a per-source read switch.
- Reads on open, polling, read times, ages, stale markers, or badges on Reload packs.
- A third-party warning, trust prompt, or credential prompt for Bundle upstream, a private-repository affordance, or any change to Add source.
- Changes to release-workspace dialogs or to the upgrade channel.
- Anything 083 excluded: typed phrases, checkboxes, Defer, Save as idea, Open Needs you, receipts, file hashes, percentages, and "owner" or "reconciliation" wording. Two exceptions, as in 083's shipped product: a full commit, under Source, in `Source changes`, or in Installed's recorded source facts; and Compose's own reasons, which name the repository URL and ref and can include an HTTP status such as `HTTP 403 (rate limit)`.
- Any departure from 083's layout and navigation.

Draw from real data where it exists: this checkout's local library packs and the real Bundle upstream, `https://github.com/E-G-C/dude` at `main`. No real pack is known to exist only upstream, so label the upstream-only pack, its items, its commit, and the unavailable reason as samples, with the reason in the real message format.

Out of scope, from the user's capture:

- Listing both copies of a same-name pack.
- Detecting newer copies or adding pack versions.
- Marking a local pack whose upstream copy differs.
- A forced upstream install or refresh for a pack that also exists in the local library.
- Released installs, which already read the upstream.
- Editing the upgrade channel, which bundle upgrade owns.
- Compose's chat default, since chat already has `--source`.
- Private repositories or credentials.

Also out of scope: Add source, which still refuses the upstream as already listed; any cache, schedule, or throttle for upstream reads; and the number of requests one GitHub catalog read makes.

Continuity references, not dependencies or execution order:

- Baseline: 083's approved mock, `.dude/specs/083-one-step-pack-actions/design/pack-actions.html`, SHA256 `74eb80edf17166d13700f09bf02fef781b1434db9d493d5ea44e58e4037a6f2e`. The mock adds only the states above; every other state matches 083, apart from the two shipped details in VSC-004.
- Sources and the Available list: 073's approved mock, `.dude/specs/073-dude-canvas-artifact-import/design/artifact-import.html`.
- Product vision and workspace baseline: `.dude/ideas/052-dude-canvas-ui.md` and `.dude/specs/052-dude-canvas-ui/design/fluent-desktop-workspace.html`.

## Brand Fit

- Reuse 083's dialog and its monospace commit treatment, 073's Sources rows and details, Available's existing empty state and notices, and the Fluent tokens Canvas already uses. Add no color, font, icon, token, or component.
- State the notice, `Unavailable`, and disabled reasons in words; color only reinforces them.
- Text, notices, status lines, and focus indicators meet WCAG AA contrast in both themes.

## Visual Success Criteria

- VSC-001: At 180x450, 360x900, 768x900, and 1440x900 in both themes, and at 200% zoom, every new or changed state fits with no sideways scrolling of the page or the dialog. Long source labels and the full commit wrap at 180 px.
- VSC-002: Keyboard order, visible focus, and focus return stay as 073 and 083 define them, and the new sentence and facts add no focus stop.
- VSC-003: Text, the new sentence, status lines, and reasons meet 4.5:1 contrast, and focus indicators meet 3:1, in both themes.
- VSC-004: Apart from the states in Scope And Surfaces, Settings matches 083's approved mock, except two details that follow the shipped product where 083's mock differed: the Use case filter is disabled before the first Reload, and the partial notice opens with "Some sources could not be read. Packs from them are not listed." The rendered result matches the approved mock at `preview_path`.

## Success Criteria

- SC-001: In the acceptance fixture, one Reload lists the upstream-only pack from Bundle upstream, one Install click installs it, and the profile records the commit its preview read, even after the upstream branch moved.
- SC-002: A pack that exists in both places is listed exactly once in Available, from Local library.
- SC-003: Opening Settings, changing views, filtering, paging, focus changes, and automatic rereads send zero requests to the upstream.
- SC-004: Before the first Reload in a checkout, Available states that Reload packs also reads Bundle upstream, and a release workspace and a checkout without an upstream show no such sentence.
- SC-005: With the upstream unreachable, a Reload lists every local pack, Bundle upstream reads `Unavailable`, and the catalog reads `partial`.
- SC-006: A release-shaped workspace starts no additional read, and its Install dialog shows what 083's showed.
- SC-007: A Refresh of a pack installed from the upstream names Bundle upstream while the local library lacks the pack. Once the local library has it, the ready view shows the `Source changes` line, and the refreshed record names Local library.
- SC-008: No Settings view or doc says "Not read while library/packs exists" or "not read by design".
- SC-009: All visual criteria pass on the rendered implementation, and the user's explicit approval of the canonical mock is recorded before implementation begins.

## Assumptions

- Pack names identify a pack across sources. No version field exists, and none is added.
- Compose keeps its default order: the local library's copy first, else the bundle upstream. Canvas installs and refreshes through that order, so a pack the local library has always comes from the local library.
- Bundle upstream stays a public GitHub repository that Canvas reads anonymously, as it reads any GitHub source.
- GitHub limits anonymous reads per hour. Each checkout Reload, and each install from Bundle upstream, uses part of that allowance, so a few Reloads within an hour can leave Bundle upstream `Unavailable` until it resets, while the local library is unaffected. A release Reload already pays this cost. This is accepted and documented.
- A checkout Reload can take longer, up to the existing 30-second bound for one GitHub source inside the Reload's 60-second window.
- Under the keep-it-simple guardrail, two cases stay as the edge cases describe: a pull between a Reload and an Install shows Local library in the ready view, and an unreadable local library hides nothing.
- The four Ship dispositions stay proposals until the user approves the mock.

## Revision Log

- 2026-10-13T20:08:59Z - Initial exploring proposal, staged during the user's explicit ship; canonical mock creation and explicit user visual approval remain pending.
- 2026-10-13T22:07:40Z - Settled round 1 to proposed. Backfilled Visual Intent and Proposed Direction from the mock. FR-016 now applies only after a Reload reads Bundle upstream, as the mock's unavailable filtered state requires; FR-021 names the `Commit` fact; Scope lists the commit and Compose's own reasons as exceptions to 083's exclusions; and VSC-004 and Scope's baseline allow the two details drawn as the shipped product draws them. Bound `.dude/specs/084-upstream-packs-in-checkout/design/upstream-packs.html`, SHA256 `3ff5bf87f8b719c42d7e696fc10941504ce20a23f182b953dee5fdd51eda395b`, 625,491 bytes, LF, self-contained and offline. It draws 28 states, chosen with `?upstream=`, and its 71 PNGs in `design/screenshots/` show every state at 1440x900 in both themes, plus five states at 360x900 and 180x450 in light and at 200% zoom in dark. FluentUI, the mock author, reports no sideways scrolling in 280 layout runs, at least 4.84:1 text and 5.18:1 focus contrast, 16 of 16 keyboard checks, no network requests, and 597 comparisons with 083's approved mock: 387 identical, and the other 210 differing only on surfaces 084 changes and in the two shipped details. This is not independent. The coordinator inspected four screenshots, `unread`, `available-details`, `sources-read`, and `install-ready` at 1440x900 light, which showed the drawn states and nothing outside the envelope. This evidence supports the proposal only and is not user approval.
- 2026-10-14T01:54:13Z - Approved round 1 through the user's explicit chat reply "approved" at 2026-10-14T01:35:11Z. Before the reply, Dude presented round 1, the four Ship dispositions, and the GitHub rate-limit tradeoff, and recommended accepting the limit. Approved artifact: `.dude/specs/084-upstream-packs-in-checkout/design/upstream-packs.html`, SHA256 `3ff5bf87f8b719c42d7e696fc10941504ce20a23f182b953dee5fdd51eda395b`, 625,491 bytes; the coordinator re-hashed it after the reply and found it unchanged since the settle, with its 71 screenshots also unchanged. The approval confirms the four Ship dispositions: an unreadable Local library hides nothing (FR-008), the commit appears only in previews that read Bundle upstream (FR-021), the dialog names the source its preview read (FR-025 through FR-027), and GitHub's anonymous rate limit is accepted and documented (FR-018, Assumptions). It allows implementation from the two units derived in `tasks.md`.
