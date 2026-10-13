---
title: Dude Canvas One-Step Pack Actions
slug: one-step-pack-actions
work_type: design
design_status: approved
approved_direction: One-step pack action dialog, round 1
preview_path: .dude/specs/083-one-step-pack-actions/design/pack-actions.html
---

# Dude Canvas One-Step Pack Actions

Install, Remove, and Refresh in Settings > Packs each run in one dialog over the pack's details. Code builds a preview of what will change, the user confirms once, and Compose, Dude's pack installer, applies the change. No agent turn, Needs you request, or chat message is involved. Today one install takes four confirmations across two tabs and several minutes of agent work, while Compose's own write takes about 130 ms.

For these three actions, this replaces the choice the user accepted in 063, pack management through existing confirmation flows. Add/import keeps its Needs you path, and Compose installs exactly what it installs today.

The design is approved, and implementation runs from `tasks.md`.

The third-party warning follows the user's answer to question 1: no checkbox and no stored trust. FR-004, FR-008, FR-021, and the absence of a Canvas lint run follow four Ship-authorized definition-owner dispositions recorded in the idea's Definition Package. They are not user answers, and the user's approval of the mock confirms them.

## User Scenarios

### US1 - Install a pack from Available (P1)

A user browsing Available decides to install a pack and wants to finish where they started.

Independent test: after Reload packs reads a local-library fixture catalog, install one pack from its details, and count confirmation clicks, Needs you requests, and chat messages.

1. Given an Available pack's details, when the user clicks Install, then a dialog opens over the details at once, shows `Checking <source>...` with Cancel, and changes nothing.
2. Given the preview is ready, then the dialog lists each item the pack adds by name and kind, its required tools as found or missing, its source, and the new-session note, with file paths in a collapsed Show files list. Its only buttons are Install and Cancel.
3. Given a ready preview, when the user clicks Install once, then the dialog shows "Installing...", then a success view with Show in Installed and Done. The pack appears in Installed and leaves Available without Reload packs.
4. Throughout, nothing asks for a typed phrase, a checkbox, or a response in Needs you, and no message goes to the chat session.

### US2 - Remove or refresh an installed pack (P1)

A user removes a pack they no longer need, or refreshes one after its source changed.

Independent test: remove one installed fixture pack, and refresh another whose source files changed.

1. Given an installed pack's details, when the user clicks Remove, then the dialog lists every recorded file it will delete, with Remove and Cancel.
2. Given that preview, when the user clicks Remove once, then the dialog shows "Removing..." without Cancel, then success with "Returns to Available after Reload packs." The pack leaves Installed.
3. Given an installed pack, when the user clicks Refresh pack, then the dialog groups the files as Replaced, Added, and Removed and warns that local edits to them are overwritten. If the source it will use differs from the recorded one, it also shows `Source changes: A -> B`.
4. Given that preview, when the user clicks Refresh once, then the dialog shows "Refreshing...", then success, and Installed shows the refreshed pack.

### US3 - Install from a source the project added (P2)

A user installs a pack from a source the project added and needs to know that it is not part of the Dude bundle.

Independent test: save a local folder source and a GitHub stand-in source, each listing one pack, and install from each.

1. Given an Available pack from a source the project added, when its preview is ready, then a warning bar says the pack comes from a third-party source, not the Dude bundle, and can add agents and instructions. It names the repository and its full commit, or the folder with "no commit".
2. Given that warning, then the dialog shows no checkbox or typed phrase, and one Install click installs the pack.
3. Given a repository source whose branch moves after the preview, when the user confirms, then the installed pack records the commit the preview showed.
4. Given a completed install from that source, when the user previews another of its packs, then the warning appears again.

## Edge Cases

- Blocked previews (FR-008): a missing required tool, a conflicting destination file, an unreachable or timed-out source, or a pack no longer available for the action.
- The workspace changes between preview and confirmation (FR-014), for example through another install, an edited profile, or a removed source.
- Cancel at each stage (FR-016, FR-017): while the preview loads or waits, and while Install or Refresh applies, before or after writing starts.
- Failure kinds (FR-019): nothing changed, files restored, or restoration unconfirmed.
- A slow GitHub fetch keeps the loading or applying state, with Cancel, up to Compose's 120-second bound for one pack. Past that bound, the preview is blocked or the apply fails with nothing changed; a pack is never partly installed.

## Functional Requirements

- FR-001: Clicking Install in an Available pack's details, or Remove or Refresh pack in an installed pack's details, opens one modal dialog over those details. The user stays in Settings > Packs throughout.
- FR-002: The dialog opens at once with a title naming the action and pack, such as "Install technical-docs", and shows `Checking <source>...` and Cancel until the preview is ready. Remove shows `Checking installed files...` instead, because it reads no source. Nothing changes while it checks.
- FR-003: Code builds each preview from the same source resolution, file list, and checks that the action itself uses. No agent writes or words a preview, and the same installed packs, sources, and pack files always give the same preview.
- FR-004: An Install preview lists each item the pack adds by name and kind (Agent, Skill, Prompt, or Instructions), each required tool as found or missing, the source, and the new-session note, "New agents or skills may not be available until you start a new session." File paths stay in a collapsed Show files list.
- FR-005: A Remove preview lists every recorded file it will delete.
- FR-006: A Refresh preview shows the source it will use, groups the changed files as Replaced, Added, and Removed, warns that local edits to those files are overwritten, and shows the new-session note. It adds `Source changes: A -> B` when that source differs from the recorded one.
- FR-007: No preview or later state shows file hashes, receipts, request phases, percentages, or "owner" or "reconciliation" wording.
- FR-008: The action button is disabled, with the reason beside it, when Install needs a tool that is missing, a destination file conflicts, the source is unreachable or timed out, or the pack is no longer available for that action. A blocked dialog offers only Close.
- FR-009: For Install or Refresh from a source the project added, the preview shows a warning bar that says the pack is not part of the Dude bundle and can add agents and instructions. The warning names the repository and its full commit, or the folder with "no commit".
- FR-010: The third-party warning has no checkbox or typed phrase, and Canvas stores no trust decision, so every preview from that source shows the warning.
- FR-011: One click on the action button (Install, Remove, or Refresh) is the only confirmation. The dialog never asks for a typed phrase, a checkbox, Defer, Save as idea, or a second confirmation.
- FR-012: Confirming applies the previewed action to the previewed pack and source, at the previewed commit for a repository source. Each preview allows one apply.
- FR-013: Code applies the action through Compose's existing install, remove, and refresh. No agent turn, Needs you request, or chat session message is involved.
- FR-014: If installed packs or saved sources changed after the preview, confirming writes nothing and shows "Installed packs or sources changed since this preview." with Preview again and Cancel.
- FR-015: While applying, the dialog shows "Installing...", "Removing...", or "Refreshing...". Install and Refresh offer Cancel until writing starts; Remove offers none.
- FR-016: Cancel or Close before an apply starts closes the dialog, and nothing changes.
- FR-017: Cancel while Install or Refresh applies shows "Cancelling..." until the action stops, then "Nothing changed." with Close. If writing has already started, the action finishes and the dialog shows its real result.
- FR-018: On success, the dialog says what was installed, removed, or refreshed, with Done. After Install it also offers Show in Installed, enabled once Installed lists the pack. After Remove it adds "Returns to Available after Reload packs."
- FR-019: On failure, the dialog shows exactly one of "Nothing changed", "Failed; your files were restored", or "Failed; restoration unconfirmed. Check Installed.", with Compose's message in a collapsed disclosure and Close. A heading above that sentence names the failed action: "Install failed", "Remove failed", or "Refresh failed".
- FR-020: When an apply ends, Canvas rereads installed packs without reading any catalog. An installed pack appears in Installed and leaves Available, and a removed pack leaves Installed.
- FR-021: Canvas no longer has the pack request flow. Its dialog and phases, its request notices, and the pack permission card in Needs you are gone, and a call to the old pack request address returns 404 (not found).
- FR-022: Add/import keeps its Needs you request, and every other Needs you request and idea capture works as before.
- FR-023: In chat, `@dude add pack` and `@dude remove pack` show the preview from Compose's add or remove dry run before asking for confirmation. The rest of each chat flow, including its lint, is unchanged.

## Key Entities

- Pack action: one Install, Remove, or Refresh of one named pack. An Install may name one saved source.
- Preview: what one pack action would change, built by code, with any reason it is blocked and whether its source is third-party.
- Confirmation: one click on a ready preview. It applies that preview once, and only while installed packs, saved sources, and the previewed source still match it.

## Visual Intent

Follow the install pattern people know from VS Code's Extensions view and from package managers such as apt and npm: the action starts from the item's details, a short summary says what will change, one button confirms, and progress and the result appear in place. Use the modal dialog Canvas already uses for the 080 reader, so the action stays over the pack the user chose.

Two familiar patterns are deliberately not followed. GitHub's typed-name confirmation suits irreversible deletions, and these actions are reversible: Remove undoes Install. VS Code's publisher trust prompt records trust once per publisher, and the user declined stored trust in question 1, so the third-party warning appears on every preview.

### Should Feel

- Quick and calm: one summary, one button, and the result in the same place.
- Honest: blocked, changed, and failed states say why and whether anything changed.
- Clear about provenance: a third-party source is named plainly, with its commit or "no commit".

### Should Never Feel

- Like a request queue or a protocol, with receipts, hashes, phases, percentages, or "owner" and "reconciliation" wording.
- Like ceremony for a routine action: no typed phrase, checkbox, Defer, Save as idea, or second confirmation.
- Like a trip to another tab, or like a warning about built-in packs, which show none.

## Proposed Direction

- Settled initial direction: Install, Remove, and Refresh pack each open one modal dialog over the pack's details, built from the 080 reader's dialog surface, header, and body. Its title names the action and pack, such as "Install technical-docs", and its buttons sit in a footer below the body.
- Install's ready view for technical-docs says "Adds 14 items" and lists each by name and kind, then Required tools, Source, the new-session note, and a collapsed Show files list. Its success view says "Installed technical-docs", lists the added items, and offers Show in Installed and Done.
- For clearline, Remove says "Deletes 3 recorded files" and lists them. Refresh shows Source, `Source changes: A -> B`, the overwrite warning, and the Replaced, Added, and Removed groups.
- A preview from a source the project added shows FR-009's third-party warning in words, with no checkbox. A blocked preview disables the action button, gives the reason beside it, and offers only Close.
- It fits because it is the flow the user described: click Install, read the information in a popup, and confirm there. It also follows the Extensions and package-manager pattern named in Visual Intent and reuses 080's approved dialog instead of adding a surface. The rest of Settings stays as 080 drew it, except that the pack request notices are gone.
- FluentUI's mock decisions: Install rust is drawn as a real blocked state because `cargo` is missing on this machine. The `bd` tool is present here, so Install beads shows it as found. This checkout already has technical-docs installed, so its Install states draw it as not installed with a visible Mock note. Each failure bar adds a heading, such as "Install failed", above its one sentence, because FR-019's "Nothing changed" alone does not say that the action failed. Remove's loading line says `Checking installed files...`.
- The user approved this round-1 direction as drawn, with no changes.

## Scope And Surfaces

In scope: the pack action dialog over Installed and Available pack details, in the wide pane and the narrow overlay, opened by the existing Install, Remove, and Refresh pack buttons; the Installed and Available lists after an action; and the removal of the pack request dialog, its request notices in Packs, Sources, Add/import, and New idea, and the pack permission card in Needs you.

The implementation owner declared the capability envelope in the Architect's recommendation of 2026-10-12. The mock may show only these states:

- Loading: the title, such as "Install technical-docs", a spinner with `Checking <source>...`, and Cancel.
- Ready: the Install, Remove, or Refresh preview from FR-004 through FR-006, the action button, and Cancel.
- Blocked: the disabled action button with its reason, and Close.
- Third-party warning: on Install or Refresh from a source the project added.
- Applying: "Installing...", "Removing...", or "Refreshing...", with Cancel for Install and Refresh until writing starts, and "Cancelling..." after Cancel.
- Success: what changed and Done, with Show in Installed after Install, and "Returns to Available after Reload packs." after Remove.
- Failure: one of the three failure sentences, Compose's message in a disclosure, and Close.
- Cancelled: "Nothing changed."
- Changed: "Installed packs or sources changed since this preview.", Preview again, and Cancel.

The mock must not show a typed phrase, checkbox, Defer, Save as idea, Open Needs you, or View pack request; receipts, hashes, percentages, or "owner" or "reconciliation" wording; or any departure from 080's approved layout.

Draw these states in both themes at the VSC sizes, from real packs where they exist: technical-docs for Install, shown as not installed with a visible Mock note; rust, blocked by its missing `cargo` tool; beads with its `bd` tool found; and an installed pack, such as clearline, for Remove and Refresh. Label constructed states, such as a conflict, a third-party source, or a failure, as samples.

Out of scope: Add/import and its Needs you path; what Compose installs; project agents and skills, which stay read only; item descriptions in the preview; installing missing tools; a lint run or other repository check in Canvas after applying; stored trust; bulk actions, update notices, and progress percentages.

Continuity references, not dependencies or execution order:

- Baseline: 080's approved mock, `.dude/specs/080-dude-canvas-pack-documentation/design/pack-documentation.html`, SHA256 `2b71061155b280e360b0b1335c257c4435da48e34a8ee868a771c41670127299`. The mock adds only the pack action dialog and removes the pack request dialog and its notices; every other state matches 080.
- Product vision and workspace baseline: `.dude/ideas/052-dude-canvas-ui.md` and `.dude/specs/052-dude-canvas-ui/design/fluent-desktop-workspace.html`.

## Brand Fit

- Reuse the 080 reader's dialog surface, header, and body, the details pane's typography and spacing, and the existing buttons, spinner, and warning message bar. Add no color, font, icon, or token.
- State the third-party warning, blocked reasons, and failures in words; color only reinforces them.
- Text, buttons, the warning bar, and focus indicators meet WCAG AA contrast in both themes.

## Visual Success Criteria

- VSC-001: At 180x450, 360x900, 768x900, and 1440x900 in both themes, and at 200% zoom, every dialog state fits the viewport with no sideways scrolling of the page or the dialog. Long pack names, paths, and commits wrap, and only the dialog body scrolls while its title and buttons stay visible.
- VSC-002: Opening the dialog moves focus into it. Tab and Shift+Tab reach every control in order with visible focus and stay inside the dialog, Enter or Space activates the focused button, and Escape acts as Cancel or Close where the state offers one. Closing returns focus to the button that opened the dialog, or to the view's heading if that button is gone.
- VSC-003: Text, buttons, the warning bar, and status lines meet 4.5:1 contrast, and focus indicators meet 3:1, in both themes. The warning, blocked reasons, and failures are stated in words, not by color alone.
- VSC-004: Apart from the pack action dialog and the removed request dialog and notices, Settings matches 080's approved mock, and the rendered result matches the approved mock at `preview_path`.

## Success Criteria

- SC-001: In the acceptance fixture, Install, Remove, and Refresh each finish with exactly one confirmation click inside the dialog, and Installed shows the result without Reload packs.
- SC-002: Across those runs, Canvas publishes zero Needs you requests and sends zero chat session messages.
- SC-003: For a local-library pack in the acceptance fixture, Install reaches its success view within 10 seconds of the click, not counting the time the ready preview waits for confirmation.
- SC-004: When installed packs or saved sources change between preview and confirmation, confirming leaves the profile and every pack file byte-identical and shows the changed state. A second apply of one preview writes nothing.
- SC-005: An Install from a repository source records the commit its preview showed, even when the branch moved between preview and confirmation.
- SC-006: Every preview from a source the project added shows the third-party warning with that source and its commit or "no commit", including the next preview after a completed install from it. No preview contains a checkbox or text field.
- SC-007: Cancel before writing leaves the profile and every pack file byte-identical and ends in "Nothing changed." Each blocked case in the fixture disables the action with its reason, and each failure kind shows its own sentence.
- SC-008: A call to the old pack request address returns 404, the existing Add/import request tests still pass, and Compose's add and remove dry runs leave the profile and every pack file byte-identical.
- SC-009: All visual criteria pass on the rendered implementation, and the user's explicit approval of the canonical mock is recorded before implementation begins.

## Assumptions

- Install, Remove, and Refresh change only the pack's own namespaced files and its profile record. Nothing is committed, and Remove undoes an Install.
- Compose's existing checks are the safety gate: source resolution, the pack naming rules, conflict checks, a profile recheck before writing, and restoration after a caught failure.
- The profile and Git history show what was installed and from where. Needs you no longer keeps a consent record for these actions.
- Under the keep-it-simple guardrail, three limits are accepted. Cancel during a fetch from a non-GitHub Git host waits for Git, up to 60 seconds. A local folder that changes between preview and confirmation installs its current files, and the success view lists them. A chat install that overlaps a Canvas apply within milliseconds is not covered.
- The four Ship dispositions stay proposals until the user approves the mock.

## Revision Log

- 2026-10-12T17:24:15Z - Initial exploring proposal, staged during the user's explicit ship; canonical mock creation and explicit user visual approval remain pending.
- 2026-10-12T18:35:12Z - Settled the initial design to `proposed`, gave FR-019 a failure heading, named Remove's loading line in FR-002, and corrected Scope's example packs. Bound `.dude/specs/083-one-step-pack-actions/design/pack-actions.html`, SHA256 `74eb80edf17166d13700f09bf02fef781b1434db9d493d5ea44e58e4037a6f2e`, 590,409 bytes, self-contained and offline. Its 31 PNGs in `design/screenshots/` show 19 states at 1440x900, eight in both themes, plus 360x900, 180x450, and 200%-zoom captures. FluentUI, the mock author, reports 53 of 53 keyboard checks, 330 layout runs, at least 5.18:1 text and 3.9:1 focus contrast, no envelope conflicts, and 27 of 35 other states matching 080 in pixels and DOM, the other 8 differing only where request notes were removed; this is not independent. Six coordinator-inspected screenshots confirmed the drawn states and nothing outside the envelope. This evidence supports the proposal only and is not user approval.
- 2026-10-12T19:05:34Z - Approved round 1 through the user's explicit chat reply at 2026-10-12T18:48:22Z: "approved". Approved artifact: `.dude/specs/083-one-step-pack-actions/design/pack-actions.html`, SHA256 `74eb80edf17166d13700f09bf02fef781b1434db9d493d5ea44e58e4037a6f2e`; the coordinator re-hashed the live mock after the reply and found it unchanged since the proposal. The approval confirms the four Ship dispositions and allows implementation through Lightweight Execution from the three units derived in `tasks.md`.
