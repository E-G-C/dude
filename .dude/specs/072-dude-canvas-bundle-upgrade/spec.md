---
title: Dude Canvas Bundle Upgrade
slug: dude-canvas-bundle-upgrade
work_type: design
design_status: approved
approved_direction: "Round 1: One-dialog update"
preview_path: .dude/specs/072-dude-canvas-bundle-upgrade/design/bundle-upgrade.html
---

# Design Proposal: Dude Canvas Bundle Upgrade

Tell the user when a newer Dude release is available, then let them review and apply it in one Canvas dialog. The same preview can include an optional refresh of installed out-of-the-box packs. One OK applies the reviewed result on the current branch, leaves it uncommitted, and asks the user to start a new session. Canvas does this without an agent turn.

Settings > About adds update status, a manual check, and a saved session-start check switch for privacy. Chat `@dude upgrade` uses the same preparation and application behavior, retaining its explicit chat confirmation.

Design is `approved`. The user's explicit chat reply "approved" at 2026-10-18T22:51:29Z approves round 1 at `preview_path`, keeps OK, and approves the declared Appearance read-error change. `tasks.md` now contains the four serial implementation units derived after approval. The owner is `.dude/ideas/072-dude-canvas-bundle-upgrade.md`. Its user-controlled answers remain unchanged.

## User Scenarios

### US1 - Notice an update at session start (P1)

The user wants to learn that an update exists without interrupting their work.

Independent test: start a session in a consumer fixture with session-start checks on, a valid latest-release installation, and a newer stable release at its recorded source.

1. Joining the session does not wait for the check, and the check changes no files or saved preferences.
2. Needs you shows an informational notice with the installed and available versions, Review update, Later, and What's new when a release-page link is available. It adds no request or request count.
3. Later hides the notice for this session. Starting another eligible session permits one new check and notice.
4. An unavailable source produces no notice or agent message. About can explain the failed check.

### US2 - Review and apply core and optional pack changes in one dialog (P1)

The user wants one decision about the actual files the update will change.

Independent test: use a consumer with an available supported release, an affected out-of-the-box pack, an unchanged out-of-the-box pack, a foreign-source pack, and an unrelated local edit.

1. Review update, or Update in About, opens one dialog immediately. Preparation shows its current activity and Cancel; the project stays unchanged.
2. The ready preview shows the installed and target versions, actual file counts grouped into core, metadata, and affected packs, and a collapsed Show files list. One checked checkbox offers the affected out-of-the-box pack group.
3. The preview warns that customizations may be overwritten, names known dirty touched paths and the current branch, and says that changes remain uncommitted and need a new session.
4. Unticking pack refresh prepares a new core-only preview before OK becomes available again. No unselected pack changes are carried into that result.
5. One OK applies exactly the ready preview. Applying, Checking, and the outcome stay in the dialog, with no agent exchange or second pack confirmation.
6. The unchanged and foreign-source packs, unrelated edit, current branch, and staging area retain their prior state.

### US3 - Check About and control session-start checks (P1)

The user wants a manual check and a durable way to prevent automatic contact.

Independent test: open About in a valid latest-release consumer with an existing appearance preference and no saved update-check choice; then exercise saved off, read failure, and save failure separately.

1. About preserves its identity and provenance rows and shows the channel, current check status, and this session's check completion time when known.
2. "Check for updates when a session starts" starts on. One switch action saves off for this user across projects on this computer without changing the appearance choice or contacting an update source.
3. A new session with off saved contacts no update source. Check for updates still performs one explicit check; Update is available if that check finds a newer eligible release.
4. Turning the switch on does not itself run a check. Pinned and development installs explain their channel instead of offering Check for updates or a release update.
5. A preference read error suppresses automatic checking and shows a warning; both the update-check and Appearance switches wait for a successful Retry before saving. A failed save retains the confirmed choice; an uncertain save is reread before any saved claim.

### US4 - Understand offline, stale, and failed updates (P1)

The user needs to know whether anything changed and what they can safely do next.

Independent test: begin each case with its own ready consumer or preview, then separately make the source unavailable, fail a selected pack, change a touched file, and introduce a new bundle-check failure during application.

1. Offline checks stay silent at session start; manual checking and preparation show a plain failure with an explicit retry or close action.
2. A selected pack's preparation failure blocks the combined result. The user can untick pack refresh and prepare core-only.
3. A touched-file, metadata, branch, or retained-preview change makes confirmation write nothing and require a fresh preview.
4. An application failure reports Nothing changed, Files restored, or Restoration unconfirmed with paths to inspect, according to the observed outcome. It never automatically repeats an uncertain application.
5. Existing bundle-check failures are disclosed. They do not block an otherwise valid update unless the update introduces a new failure; an unreadable or failed check cannot be treated as success.

### US5 - Continue with the updated Dude in a new session (P1)

The user wants an honest handoff from the running old extension to the updated installation.

Independent test: run the actual installed Canvas extension in a disposable consumer and update its own deployed files to a supported target.

1. Before writing starts, Cancel leaves the project unchanged. After writing starts, closing the browser does not cancel the transaction; it finishes or restores.
2. From the write boundary, the old Canvas admits no further workspace-changing action and does not combine a replacement interface with its old behavior.
3. Success names the version installed on disk, the applied counts, the uncommitted current-branch result, and the need for a new session. Reloading the old Canvas shows an inert Start a new session page.
4. Dude does not restart or terminate the user's session. In a new session, About reports the installed target version and, after a successful eligible check, Up to date.

### US6 - Use the same upgrade behavior from chat (P2)

The user who starts in chat should receive the same reviewed file result and preservation guarantees.

Independent test: use separate ordinary consumer fixtures for plain `@dude upgrade`, `@dude upgrade --all --dry-run`, and a confirmed combined update.

1. Plain upgrade previews core only. `--all` includes the same eligible out-of-the-box pack group; its dry run shows the actual combined changes and writes nothing to the project.
2. The literal phrase `confirm upgrade` confirms one prepared result, including selected packs. No later `confirm packs` step is required.
3. Application leaves the current branch, HEAD, and staging area unchanged and the reviewed file changes uncommitted, using the same freshness, check, and failure rules as Canvas.
4. Retired rollback and separate pack-phase commands are unavailable. Guidance explains selective review/discard or reverting the user's later commit, without promising recovery of overwritten uncommitted customizations.

## Edge Cases

| Condition | Required behavior |
| --- | --- |
| Offline source, missing acquisition tool, or check deadline | No automatic notice or agent message; manual status explains that checking failed. No guessed latest version. |
| Missing or invalid installation metadata | Show unavailable information and refuse an update; do not infer an installed version or source. |
| No stable releases, only prereleases, or installed version newer than the source | Distinguish no stable releases from Up to date; never offer a downgrade from a release check. |
| Pinned or development installation | No automatic release lookup or notice. About names the recorded tag/ref and known development base; its status line explains why checks do not apply, with no Check for updates or release-update button. |
| Off, absent, older valid, or unreadable preference | Off makes no automatic contact; absence or a valid existing appearance-only choice defaults checks to on without writing; unreadability suppresses automatic contact, is reported, and prevents either switch from saving until Retry succeeds. |
| No affected eligible packs | Omit the pack checkbox. An unchanged pack keeps its existing files and record. |
| Pack from another repository or a local library | Leave it untouched, even if its name also exists in Dude's catalog. Its ordinary refresh remains in Settings > Packs. |
| Local edits to a touched core or pack file | Show the general overwrite warning and the dirty paths that can be identified; confirmation may replace them. The warning says ordinary version control cannot recover overwritten pre-existing uncommitted edits. |
| Committed customization in a recorded pack artifact | Do not claim it was detected. Keep the general warning because today's installation record cannot reliably distinguish it. |
| Unowned destination conflict or unsupported target release | Block preparation with a reason and no project changes; do not fall back to the old upgrade workflow. |
| Selected pack cannot be prepared | Block the combined result; permit deselection and a fresh core-only preview. |
| Executable files in the release, such as pack scripts | When an update writes these files, it keeps them executable as the release records; restoration puts back each file's original permissions. |
| Touched file, profile, branch, or retained result changes | Refuse application without writes and require a fresh preview. A release moving after preparation does not silently change the reviewed bytes. |
| Existing check failures or a replacement failure with the same total count | Disclose existing failures; compare failure identities, not just counts. A new failure blocks or restores the update. |
| Check crashes, times out, or produces unreadable results | Nothing changes if still before writing; otherwise restore the changed files and report the real outcome. |
| Cancel, duplicate OK, or closed browser | Cancel before writing discards preparation. A result applies at most once; after writing starts, browser closure does not interrupt finish-or-restore. |
| File lock, interrupted process, or uncertain restoration/cleanup | Show the uncertainty and affected paths for inspection; do not promise crash-proof restoration or replay automatically. |
| No actual file or installation-record change | Show a no-op result with no applying OK; do not create a change merely to record an attempted upgrade. |
| No safe release-page destination | Omit What's new rather than show a dead link or invented release notes. |

## Functional Requirements

### Session notice and About

- FR-001: For an eligible release installation with the preference on, Dude attempts one automatic check at session start without making session join wait for it.
- FR-002: A version check reads release information without creating files or changing project data or saved preferences.
- FR-003: A version lookup has a five-second deadline and reports an unavailable result when it cannot finish within that budget.
- FR-004: A release check offers only a stable version newer than the recorded installed version.
- FR-005: An available update appears in Needs you as a non-blocking informational notice above any waiting request, outside request cards and request counts.
- FR-006: The notice shows installed and available versions with Review update, Later, and What's new when FR-011 permits it.
- FR-007: The available notice stays until Later or the session ends, including after a Nothing to update preview.
- FR-008: Checks and Canvas upgrade actions require zero agent turns, Needs you requests, waiters, or chat session messages.
- FR-009: About preserves existing identity and provenance information while adding the channel, current check result, and completion time when this session has one.
- FR-010: About distinguishes Checking, Up to date, No stable releases found, Couldn't check, checks off, pinned, development, and unavailable installation information.
- FR-011: What's new links to the selected release's real page only when Dude can construct a safe destination from the recorded source and release.

### Privacy choice

- FR-012: About provides one switch labeled "Check for updates when a session starts".
- FR-013: Dude remembers the switch for this user across projects and sessions on this computer, outside every repository.
- FR-014: An absent update-check choice defaults to on without creating or backfilling saved data merely by reading it.
- FR-015: With the switch off, session-start checking makes no external contact.
- FR-016: Check for updates performs one explicit check for an eligible installation even when the switch is off.
- FR-017: Pinned and development installations make no automatic release lookup and show neither Check for updates nor a release-update button; About's status line explains why checks do not apply.
- FR-018: One switch action saves its new choice without a separate Save button, showing a pending state until the outcome is known.
- FR-019: Saving either switch value does not itself initiate an update check.
- FR-020: An unreadable or invalid preference produces a preference-specific warning, suppresses automatic checking, and keeps both the update-check and Appearance switches unavailable for saving until Retry reads successfully; stored data is not silently repaired.
- FR-021: A failed save retains the confirmed choice; an uncertain result is resolved by rereading rather than replaying the write or claiming success.
- FR-022: Saving the update-check choice preserves the appearance choice, and saving appearance preserves the update-check choice.

### One preview and one confirmation

- FR-023: Review update and About's Update action open the same dialog immediately, showing preparation and Cancel before any project change.
- FR-024: Dude prepares every intended core, selected-pack, and installation-record change for one exact target before enabling OK.
- FR-025: The preview shows from/to versions and actual added, replaced, and removed file counts grouped into core, metadata, and each affected pack, with relative paths and operations under Show files.
- FR-026: Preparation shows truthful activities and completed/total pack progress rather than invented percentages, speeds, or arrival times.
- FR-027: A ready preview offers one initially checked checkbox for all affected eligible packs, omitting it when no eligible pack is affected.
- FR-028: Out-of-the-box pack eligibility comes only from installed membership and recorded source matching Dude's recorded bundle upstream, not a matching pack name.
- FR-029: Selected packs are prepared from the same exact release as the core update.
- FR-030: Packs with no actual projected-file difference retain their existing files and installation records.
- FR-031: Changing the pack choice invalidates the prior result and keeps OK unavailable until a replacement preview is ready.
- FR-032: Before OK, the dialog warns that customizations may be overwritten, that pre-existing uncommitted edits may be unrecoverable, and that changes remain uncommitted on the named current branch and require a new session.
- FR-033: The preview identifies known uncommitted or staged edits to touched paths without claiming to detect all committed customizations.
- FR-034: One OK is Canvas's only confirmation and applies only that prepared result, with no typed phrase or second pack confirmation.
- FR-035: Cancel before writing discards the prepared result without changing the project.
- FR-036: A genuine no-op result has no enabled applying OK and creates no installation-record change solely for the attempt.
- FR-037: Failure to prepare a selected pack blocks the combined result and lets the user deselect packs to prepare core-only.

### Application, preservation, and failure

- FR-038: Application changes only Dude-owned deployed core files, the reviewed installation records, and the selected eligible pack projections/records; it preserves all other project content and pack installations.
- FR-039: Application leaves HEAD, the current branch, and the staging area unchanged, without requiring a clean working tree or creating a tag, branch, commit, push, or merge.
- FR-040: Immediately before writing, Dude rechecks the workspace/branch binding, every touched file or expected absence, selected profile data, and retained result; any mismatch refuses all writes.
- FR-041: One prepared result permits at most one application; duplicate or superseded confirmations do not write.
- FR-042: A caught application failure restores every changed core, pack, and metadata file, including additions and removals, or explicitly reports that restoration could not be confirmed.
- FR-043: Only newly introduced bundle-check failures block or restore an update; pre-existing failures remain disclosed and are never described as a clean result.
- FR-044: A failed, timed-out, or unreadable bundle-check run prevents a success claim and uses the nothing-changed or restoration outcome appropriate to the write boundary.
- FR-045: Every failed application states Nothing changed, Files restored, or Restoration unconfirmed, with a safe reason and paths to inspect when uncertain.
- FR-046: Dude never automatically repeats an application whose write or restoration outcome is uncertain.
- FR-047: Once writing begins, closing the browser does not cancel the transaction; it finishes or restores.
- FR-048: For a Canvas-started update, the old Canvas stops workspace-changing actions at the write boundary and cannot serve a replacement interface against its old behavior. After success or a failure that wrote files, closing the result or reloading shows only an inert Start a new session page.
- FR-049: Success names the version installed on disk and applied counts, repeats the uncommitted/current-branch and new-session reminders, and offers Done.
- FR-050: A new session reads the updated installation version; Up to date is shown only after a successful eligible check.
- FR-051: The update neither restarts nor terminates the user's session and offers no automatic restart or hot-reload action.

### Chat behavior

- FR-052: Chat `@dude upgrade` uses the same prepared-result, freshness, preservation, and failure behavior as Canvas.
- FR-053: Plain chat upgrade selects core only; `--all` selects the same eligible out-of-the-box pack group.
- FR-054: Chat dry runs show the actual selected combined preview without project changes.
- FR-055: The literal chat phrase `confirm upgrade` authorizes one reviewed result, with no separate `confirm packs` phase.
- FR-056: Chat and its engine remove upgrade rollback, separate pack preview/apply commands, and skip-removals behavior rather than keep alternate application paths.
- FR-057: Chat retains explicit source/ref selection, status, preview, apply, discard, help, and text/structured reports; Canvas adds no source or ref editor.

### Design and continuity

- FR-058: All new controls and outcome states remain keyboard-operable, expose accessible names and state, and announce checking, saving, and application outcomes.
- FR-059: The update surfaces retain current Canvas navigation, Settings sections, Packs behavior, work selection, unsent input, and retained Review work outside the required post-write session handoff.
- FR-060: UI source changes and implementation-task derivation wait for explicit user approval of the exact canonical mock; Ship itself supplies no visual approval.

## Key Entities

- Installed bundle: the project's recorded Dude version, source/channel, and optional development-base provenance, plus its deployed core. Provenance does not verify file integrity.
- Session check result: one attempt's outcome, available release when known, completion time, and session-only dismissal. It is not durable check history.
- Update-check choice: one on/off preference for this user and computer, independent of the existing appearance choice.
- Prepared update: one workspace-bound target and pack selection, with the exact reviewed file operations and installation-record changes. A changed selection needs a replacement preview.
- Eligible pack group: installed packs whose recorded source matches the bundle upstream; only members with changed projected files are affected.
- Update outcome: applied, unchanged, restored, or uncertain, with the version/counts or safe failure details supported by the result.

## Visual Intent

Follow the `gh` CLI's short update notice: make availability visible without turning it into work the user must answer. VS Code and GitHub Desktop likewise separate update information from blocking requests. Use the one-step Settings dialog established by 083 so review, confirmation, progress, and the result stay together.

Round 1 places version and update controls together in About, following the familiar placement in Firefox, Chrome, Windows Update, and Obsidian. It offers no automatic download or restart.

### Should Feel

- Like routine desktop maintenance: a quiet notice, one readable preview, and one explicit decision.
- Like the current Canvas Settings, with About as the familiar place for version and update controls.
- Clear about what changes now and what loads only in a new session.

### Should Never Feel

- Like an agent request, a permission protocol, or a sequence of ceremonial confirmations.
- Like an automatic install, a promise to undo every customization, or a claim that the running session has reloaded.
- Like a new settings application, source editor, or pack-version manager.

## Scope And Surfaces

In scope: the informational Needs you notice; About's update rows, manual action, and privacy switch; one upgrade dialog; and the old-session handoff after writing. Appearance also adopts the shared-preference read-error rule below. Chat's corresponding behavior is nonvisual scope. Keep `Packs | Appearance | About`, the vertical-left navigation, and all existing request and pack actions.

The Architect's 2026-10-18 capability envelope, section 9, bounds the first mock:

| Surface or state | Fields and controls the mock may show |
| --- | --- |
| Notice | Recorded installed version, available tag, Review update, Later, and a supported What's new link; outside request cards/counts. |
| About | Existing Dude name, author, official repository link, version, development base, and provenance disclaimer; Update channel, session check status/time, and eligible Check for updates and Update to the available tag. |
| Privacy | The labeled switch with saving, confirmed-save announcement, read-error, and save-error feedback. Both switches follow FR-020's Retry-before-saving rule. Saving does not run a check. |
| Off, pinned, development, unavailable | Plain explanations with recorded tag/ref/base when valid; off explains manual checking. No Check for updates or release-update button for pinned or development installs. |
| Preparing | From/to versions, Fetching release, Staging core, Preparing pack with completed/total packs, Comparing files, and Cancel. |
| Ready | Version change, supported What's new, core/metadata/pack file counts, Show files, the affected-pack checkbox, overwrite/current-branch/new-session warnings, OK, and Cancel. |
| Pack preparation failure | A reason that the combined result is unavailable and the choice to untick packs for a fresh core-only preview. |
| Applying | Applying and Checking with a busy state; no Cancel or second confirmation after writing starts. |
| Success | Installed-on-disk version, applied counts, uncommitted/current-branch reminder, new-session requirement, and Done. Reloading the old Canvas has only the inert handoff. |
| Failure or stale result | Safe reason and observed change/restoration outcome, affected paths when uncertain, a fresh-preview action before writing when safe, and Close. After a failure that wrote files, Close leads to the inert old-session handoff. No automatic replay. |

Round 1 includes two deliberate departures from earlier approvals:

- 085 Appearance: apply the retry-first treatment shown by the new update-check switch to "Follow GitHub app theme" too. The inherited Appearance states in this mock still permit saving after a read error. Implementation must instead keep both switches unavailable for saving until Retry succeeds, so neither overwrites an unreadable shared preference. Approval of round 1 covers this declared change; all other Appearance behavior stays as approved.
- 074 About: replace the footer's "About · Read only" with installed-version status ("About · Installed v1.12.0" in the fixture), because About now has actions. The value comes from recorded installation information, not a fixed sample version.

Out of scope: changing the release bundle's contents; arbitrary source/ref editing in Canvas; per-pack selection here; adding packs; per-pack version numbers; inline release notes; verified archive-digest badges; download-size/speed claims; branch or commit controls; persistent Skip this version; polling; agent approval; automatic restart; and guaranteed rollback after success. Per-pack refresh remains in Settings > Packs.

Every displayed field must trace to recorded installation data, a real check result, the actual prepared difference, current branch/dirty-path information, or the preference. Label constructed error and version examples as mock fixtures outside product chrome. Mock-only scenario controls may work locally for inspection; they must not become product controls or production test hooks. Preserve explored variants and their evidence under the canonical design package.

## Brand Fit

- Extend `.dude/specs/052-dude-canvas-ui/design/fluent-desktop-workspace.html` and the broader `.dude/ideas/052-dude-canvas-ui.md` vision; retain the working later Canvas capabilities instead of restarting from a read-only shell.
- Use the latest approved Settings adaptation, `.dude/specs/085-dude-canvas-app-theme/design/app-theme.html`, including its `Packs | Appearance | About` order, full-label narrow reflow, appearance choices, and accessible contrast replacements.
- Reuse 083's one-step dialog pattern at `.dude/specs/083-one-step-pack-actions/design/pack-actions.html`: genuine Fluent controls, body disclosure, stable title/footer, in-place progress, and plain failure wording.
- Keep existing semantic tokens, type hierarchy, spacing, focus, disabled, and busy states. Do not invent branding, colors, icons, or a second theme system. Verify WCAG 2.2 AA on actual rendered pairings in ordinary and app-following appearance.
- The familiar automatic Restart now button is deliberately absent: Dude cannot replace the user's session safely through this surface. The direct Canvas click replaces chat's typed confirmation, not the overwrite warning.

These references establish design continuity, not task dependencies or execution order.

## Direction Options

### Option A - Round 1: One-dialog update

- Mood: routine desktop maintenance, with a quiet availability notice and one clear confirmation.
- Layout: retain 085's cumulative Canvas and `Packs | Appearance | About` order. Put the notice above waiting requests and the Updates section below About's provenance note. Keep the dialog title and actions visible while its body scrolls; place the pack checkbox above grouped counts and the collapsed Show files disclosure.
- Components: reuse Fluent v9 Dialog, MessageBar, Switch, Checkbox, and Spinner. Use truthful activity labels rather than a ProgressBar because there is no measurable proportion; retain 083's plain Show files disclosure rather than an Accordion.
- Color, type, and spacing: retain the approved semantic tokens, hierarchy, focus treatment, and narrow reflow in ordinary light/dark and app-following appearances.
- Primary mock: [bundle-upgrade.html](design/bundle-upgrade.html), at `.dude/specs/072-dude-canvas-bundle-upgrade/design/bundle-upgrade.html`.
- Open the top mock-only strip and use the "Bundle upgrade (072)" group to choose among 41 states. Direct links append `?upgrade=<state>`, for example `?upgrade=notice`, `?upgrade=about-available`, or `?upgrade=dialog-ready`; add `&drawer=open` to show the strip. These controls are for mock inspection only.

## Proposed Direction

Approved Option A - Round 1: One-dialog update. It extends the approved 085 cumulative mock with the notice, About controls, one-dialog update, and old-session handoff rather than changing Canvas navigation. The canonical mock is 795,764 bytes, SHA-256 `8bdf56f3c64c157df402ae7cc04f24901aeb203613a4872913d817306a555a70`. The user's explicit "approved" reply approves this exact revision, with OK kept and the declared Appearance read-error change included.

### Round-1 Evidence

FluentUI supplied the following mock evidence, verified by the coordinator:

- All 41 states load without script errors or network requests. The 82 screenshots are retained in `design/screenshots/`.
- Reflow at 180x450, 360x900, 768x900, 1440x900, and 200% has no clipping. All 46 keyboard and focus checks passed.
- All 3,680 contrast measurements met their applicable minimum; the lowest text contrast was 5.12:1.
- Of 306 continuity renders compared with 085, 303 were pixel-identical. The three differences were the intended About change.

This is mock evidence, not implementation acceptance. A real screen reader, the real GitHub app host, real network or timing, and Windows file replacement remain unverified.

### Ship-Authorized Design-Owner Dispositions

These settle the proposal from accepted intent, the plan, and FluentUI's evidence. They are Ship-authorized design-owner actions, not user answers, user-ratified guardrails, or visual approval.

1. Adopt the inert Start a new session page after success or a failure that wrote files. Done or Close, and a reload, lead there. This follows the plan's old-server write gate without adding a browsable, partly disabled Canvas.
2. Apply the shared-preference Retry-before-saving rule to both switches. Preserving the other choice requires a readable document; the declared departure from 085 Appearance in Scope And Surfaces is part of the approval request.
3. Keep "OK" in round 1, following the user's wording. Fluent and 083 favor a verb such as "Update"; the user's plain "approved" reply keeps "OK".
4. Adopt "Update channel" in place of "Recorded channel/ref", as the idea proposed.
5. Omit Check for updates on pinned and development installs. About's status line explains why checks do not apply, avoiding an action that could only repeat that explanation. FR-017 now reflects this.
6. Adopt the installed-version About footer described in Scope And Surfaces. This minor departure from 074 removes a false Read only claim now that About has actions.
7. Keep the notice above any waiting request, as the idea placed it, while keeping it outside request cards and counts.
8. Leave an available notice in place after a Nothing to update preview, until Later or the session ends. This needs no extra dismissal logic or stored state.
9. Disclose earlier bundle-check failures in the success info bar shown by `dialog-success-existing`, as FR-043 requires. A successful update must not imply a clean workspace.

## Visual Success Criteria

- VSC-001: At 180x450, 360x900, 768x900, and 1440x900, and at 200% zoom, all update states retain complete labels and reachable controls without page-wide or dialog-wide horizontal scrolling. Long paths and names wrap; only the dialog body scrolls while its title and available actions remain visible.
- VSC-002: Keyboard opening moves focus into the dialog; Tab and Shift+Tab stay within it; closing returns focus to the opener or a surviving heading. Escape follows the offered Cancel/Close behavior and never interrupts a write.
- VSC-003: Applicable text meets 4.5:1 contrast, or 3:1 for large text; essential boundaries and focus indicators meet 3:1 against actual adjacent surfaces. Targets retain at least 24px hit areas. Warnings and outcomes use words, not color alone, and forced-colors behavior remains usable.
- VSC-004: Before OK, the version change, affected-pack selection, grouped counts, current branch, overwrite warning, and new-session requirement are readable without expanding Show files. Busy and blocked states never resemble a ready confirmation.
- VSC-005: Both ordinary light/dark and app-following appearances preserve the approved Settings/workspace structure outside the new surfaces. The informational notice is visibly distinct from actionable Needs you requests.
- VSC-006: Rendered implementation matches the exact approved canonical mock, with the declared Appearance read-error departure in Scope And Surfaces included in that approval. Screenshots, geometry, accessibility-tree inspection, complete keyboard/error interactions, and field/action provenance establish this result; mock fixtures do not count as live update evidence.

## Success Criteria

- SC-001: In each eligible session fixture, at most one automatic lookup starts, has a five-second deadline, creates no files, sends no agent message, and does not hold session join. Off, pinned, development, and unreadable-preference fixtures make zero automatic source contacts.
- SC-002: A newer stable release produces one non-blocking notice with correct versions and actions; Later hides it only for that session, and request counts remain unchanged. A Nothing to update preview leaves an existing notice in place. Equal/newer installed versions and prerelease-only sources never produce an update offer.
- SC-003: Core-only and combined fixture updates each require exactly one OK after the ready preview and apply exactly its byte changes and counts. Unselected, foreign-source, local-library, and no-op packs retain the required files and records.
- SC-004: Successful and refused updates preserve HEAD, branch, staging area, unrelated edits, project ideas/specs/memory/work state, local customizations outside owned paths, and other extension trees.
- SC-005: One switch action persists across two project instances and a new session while preserving appearance. Reads do not create preferences, saves make zero update contacts, an off session makes zero automatic contacts, and one explicit manual check still works for an eligible installation. A read-error fixture makes zero preference writes from either switch until Retry succeeds; afterward, saving either retains the other choice.
- SC-006: Offline, timeout, no stable release, invalid metadata, pinned/development, unsupported target, preference read/save failure, and selected-pack failure fixtures each display the specified explanation without a false Up to date, Saved, or installed claim.
- SC-007: Drift in an added/replaced/removed path, installation metadata, selected profile, branch, or retained result yields zero writes and a fresh-preview requirement. A duplicate confirmation writes nothing, and a source change after preparation never substitutes unreviewed bytes.
- SC-008: An unchanged existing check failure permits an otherwise valid update and remains disclosed. A new failure, including one replacing an old failure at the same total count, restores all affected preimages; failed or unreadable checking never passes.
- SC-009: Cancel before writing leaves all project bytes unchanged. Browser closure after writing starts permits finish-or-restore; uncertain restoration or process cleanup is disclosed and never triggers automatic replay.
- SC-010: Installed-host acceptance demonstrates an extension replacing its own deployed files without mixing new assets and old behavior, followed by a new session reporting the target version and a truthful check result. Windows replacement and permission-failure behavior receive actual evidence.
- SC-011: Chat plain, combined, and dry-run cases use the same selected changes and refusal rules as Canvas, with one `confirm upgrade` and no separate pack phase. Removed command/flag forms refuse before writes, and no update creates a tag, branch, or commit.
- SC-012: All visual criteria pass on the rendered implementation, with explicit user approval of the exact canonical mock recorded before task derivation or UI source changes.

## Assumptions

Four bounded choices are Ship-authorized definition-owner dispositions from accepted intent and the Architect's evidence, not new user answers or user-ratified guardrails:

- Session-start checks default to on. The 2026-10-15 intent requests this check and notice; the accepted switch lets privacy-minded users turn it off.
- The affected-pack checkbox starts checked. The existing recommendation and one-dialog intent favor reviewing the coordinated release result; the user can untick it before any application.
- Off prevents automatic source contact while manual Check for updates remains available. This gives the privacy switch its stated purpose without removing an explicit user action; unreadable preference data fails closed.
- Only newly introduced bundle-check failures block or restore. This preserves unrelated work in progress while preventing the update from adding failures; existing failures remain visible.

The current-branch, uncommitted result follows the accepted simplest warn-and-proceed answer. Confirmation can overwrite pre-existing uncommitted edits in owned files; ordinary version control cannot guarantee their recovery. Caught failures have an all-or-restored boundary, but process termination, failed restoration, and simultaneous external writers remain risks.

Acceptance needs a consumer installation with this update capability and a supported target release. Older targets without the preparation capability fail explicitly; this proposal does not backport Canvas to earlier releases. The upstream development checkout is not evidence of a latest-channel notice. Existing project and bundle guardrails remain unchanged, with no new candidate set.

## Revision Log

- 2026-10-18T18:50:03Z - define: Staged the first exploring proposal and exact canonical preview path, with the four Ship-authorized definition-owner dispositions in Assumptions. Canonical mock creation and explicit user visual approval remain pending; no implementation or task derivation.
- 2026-10-18 20:35 UTC - settled round 1 to proposed at .dude/specs/072-dude-canvas-bundle-upgrade/design/bundle-upgrade.html, SHA-256 8bdf56f3c64c157df402ae7cc04f24901aeb203613a4872913d817306a555a70
  Evidence: 41 states and 82 screenshots, 46/46 keyboard and focus checks, no failing contrast measurements, and only three intended About continuity differences. Ship-authorized design-owner dispositions are recorded above; OK versus Update remains open at approval.
- 2026-10-18 22:51 UTC - approved round 1 from the user's explicit chat reply "approved" at 2026-10-18T22:51:29Z, bound to .dude/specs/072-dude-canvas-bundle-upgrade/design/bundle-upgrade.html at SHA-256 8bdf56f3c64c157df402ae7cc04f24901aeb203613a4872913d817306a555a70, re-hashed by the coordinator. OK is kept, and the declared Appearance read-error change is approved: both switches wait for a successful Retry before saving. The mock and its 82 screenshots are unchanged.
- 2026-10-21T02:06:01Z - define: Added the executable-file Edge Cases row for application and restoration, and updated the task count to four for T006@5f8b2c94. User intent, numbered requirements, success criteria, and approved design are unchanged.
