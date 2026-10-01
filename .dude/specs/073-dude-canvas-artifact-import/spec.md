---
title: Dude Canvas Artifact Import
slug: dude-canvas-artifact-import
work_type: design
design_status: approved
approved_direction: Classic Settings Packs Hub with project rows
preview_path: .dude/specs/073-dude-canvas-artifact-import/design/artifact-import.html
---

# Dude Canvas Artifact Import

Keep pack discovery, pack sources, and agent/skill import together under Packs. A user can import a project-local agent or skill through Dude's existing permission flow and find it in Installed without Reload, or add a pack source, find one of its packs, and request installation from that exact source.

This is one feature and one design in two delivery phases. Phase A adds Add/import beside Installed and Available, read-only project agent and skill rows in Installed, 25-row pages, and retained list context across refreshes. Phase B adds Sources, multi-source discovery, the Source column/filter, and source-bound pack requests. Phase A must work on its own, without an empty Sources tab.

The user explicitly approved the viewed Classic Settings Packs Hub with project rows mock by chat: `I approve the mockup`. The Revision Log binds that approval to the unchanged reviewed artifact, covering both phases and the intermediate Phase A state. Canonical implementation tasks are derived from the approved design and the plan; production implementation and acceptance remain unverified. Documentation display stays outside 073 per the user's Q6 answer, with visible mock-only placement annotations for 080.

## User Scenarios

### US1 - Import one agent or skill (P1)

A user supplies one local file or public GitHub file URL in Packs > Add/import.

Independent test: use an eligible single-file source and a fresh joined session; no added pack source or pre-existing project artifact is needed.

1. Given Settings, when the user selects Add/import under Packs, then the heading is "Import an agent or skill", with one Source field and Request import action.
2. Given an eligible source, when the user requests import, then Dude previews the focused import in Needs you before changing any destination.
3. Given the exact confirmation and checked consent, when Dude applies and verifies the import, then Add/import shows Applied, Dude's note, and every verified written local path.
4. Given a source needing nondefault adaptations, when Dude evaluates it, then Canvas explains the limitation without applying it; the user can decline and continue in chat.

### US2 - Import a bounded directory (P1)

A user supplies one local directory or public GitHub directory URL through the same Source field.

Independent test: seed clean, warned, and blocked directory fixtures independently of US1.

1. Given an eligible directory whose complete consent details fit, when the user requests import, then Dude shows one permission item per agent or skill with its destination, file counts, every replaced file, and the reviewed import revision.
2. Given a Clean preview, when the user confirms `IMPORT DIRECTORY <n> ARTIFACTS`, then only the reviewed set is applied and its written paths return to Add/import.
3. Given a Warned preview, when the user reviews all warnings and confirms `IMPORT WITH WARNINGS <n> ARTIFACTS`, then the same reviewed plan governs application.
4. Given a Blocked directory, more than 12 agents or skills, or details that cannot fit, when Dude evaluates it, then no permission is requested and no destination changes. A capacity refusal directs the user to chat without omitting details or splitting the import.

### US3 - Control permission and changed impact (P1)

A user reviews the consequences and grants or declines permission for that exact import.

Independent test: publish controlled current and stale permissions and inspect destination bytes; no prior successful import is needed.

1. Given a current permission, when the user reads Needs you, then its operation, complete targets, revisions, consequences, source eligibility, and exact confirmation are readable without truncation.
2. Given missing consent, a mistyped phrase, or Decline, when the user responds, then no import is applied.
3. Given changed source bytes, destinations, or reviewed impact, when Dude prepares to apply, then the earlier permission cannot authorize the change; a fresh preview and confirmation are required.
4. Given an acknowledged permission response, when the user selects Back to Add/import before the owner result arrives, then focus returns to the same request status, still Waiting for owner result.

### US4 - Understand an import result without repeating it (P1)

A user distinguishes successful application, refusal, partial change, restoration, and uncertainty.

Independent test: provide separately bound owner-result fixtures for every outcome and delivery failure.

1. Given Applied, when the result appears, then every reported written path was verified at acknowledgment time as a regular, non-link file inside a project-local artifact destination, including an imported agent's companion folder.
2. Given Declined, Failed, Unavailable, Stale, or Uncertain, when the result appears, then Dude's note explains whether files changed, were restored, or remain uncertain.
3. Given a focused import with partial writes or a directory failure with verified restoration, when Canvas reports it, then neither is described as success or guaranteed recovery from a process or machine failure.
4. Given double activation, possible delivery, reconnect, or reload, when Canvas resumes, then it never repeats the request automatically or treats permission as a result.

### US5 - Keep work and Settings context (P2)

A user moves among Packs sub-tabs, About, Needs you, and their current work.

Independent test: retain source text, a request status, nondefault pack filters/page/selection, selected work, unsent input, and Review work without completing an import.

1. Given typed import Source and request status, when the user switches Add/import -> Installed -> About -> Packs -> Add/import, then both survive and hidden controls neither cover the active panel nor take focus.
2. Given a waiting import permission, when the user follows Open Needs you and Back to Add/import, then the source and exact request survive, with focus on its visible status.
3. Given an unreconciled import, when the user visits New idea or a pack detail, then competing sends are unavailable with a reason, while drafts and browsing remain usable.
4. Given ordinary main-rail departure and re-entry, when Settings opens again, then Packs > Installed is selected, the typed import Source is cleared, and import request status remains.
5. Given Phase A alone, when the user opens Packs, then only Installed, Available, and Add/import appear; no Sources placeholder is shown.
6. Given a selected row and nondefault filters/page, when a refreshed list still contains that row, then the filters, page, and selection survive; if the row no longer exists, the existing reset applies.

### US6 - Add or remove a pack source (P1)

A user registers a public GitHub repository or local folder for discovery without installing anything.

Independent test: start with no added sources and controlled readable, invalid, and unavailable candidates; seed removal blockers separately.

1. Given Sources, when the user selects a built-in or added row, then its details open beside the table or in the narrow overlay. Local library appears when present; Bundle upstream is read-only, labeled "Managed by bundle upgrade", and a development bundle explains why it is not read.
2. Given Sources, when the user selects Add source at the top, then a dialog opens on Location with optional Ref and the existing form notes.
3. Given an eligible Location and optional Ref in the dialog, when the user selects Add source, then Canvas shows Reading inside it, validates the catalog, saves the source, and closes with an announced Added status and pack count. After the post-add read, the new row is selected and focus moves to details Close; no installation permission is requested.
4. Given bad input, credentials, a private or unreachable repository, missing catalog, bad metadata, duplicate identity, a ninth added source, timeout, or changed configuration, when Add source is attempted, then the saved configuration is unchanged and the refusal stays inside the dialog with the typed input.
5. Given a source used by an installed pack or in-flight pack request, when its details are inspected, then Remove is disabled with a named advisory reason. If a blocker appears after that check, the server refuses removal inside the confirmation dialog and names the blockers.
6. Given an unused added source, when the user confirms Remove and it succeeds, then only that entry disappears; no pack or artifact is removed.
7. Given a Read source with an uninstalled pack, when the user selects Show packs in Available, then Available uses that Source, resets Use case and page, and takes focus on its tab or the narrow View Dropdown without another catalog read.

### US7 - Find and install a pack from a chosen source (P1)

A user combines source and use-case filters, distinguishes same-name packs, and installs the intended one.

Independent test: use several catalogs, a same-name pair, a match beyond page 1, an unavailable source, and an independently seeded installed profile.

1. Given a Reload with one failed source, when results arrive, then readable sources remain visible with per-source status and counts; unavailable coverage is not a confirmed empty list.
2. Given two available packs with the same name from different sources, when the user inspects them, then separate rows and details identify their respective sources.
3. Given Source and Use case selections, when the user filters, then both conditions apply to the complete context before paging; Clear resets both.
4. Given one selected row, when the user requests Install, then the permission identifies that source and its resolved commit, labels a third-party source, and previews the existing installation impact.
5. Given a verified installation from that source, when membership is refreshed, then all available rows with the installed name disappear. Failure of the selected source never installs the same name from another source.

### US8 - Refresh with honest source provenance (P2)

A user can see where an installed pack came from and whether refresh would change that source.

Independent test: seed installed packs from a configured source, an unlisted local folder, and an unreadable source record; no source-add or import story must run first.

1. Given a recorded source matching an added source, when Refresh is requested, then it uses that source and its tracked ref.
2. Given no matching added source, when Refresh uses the default catalog and that differs from the recorded source, then the permission states `Source changes: A -> B` before consent.
3. Given readable but unmatched recorded provenance, when Installed is displayed, then it says Unlisted with the source type; unreadable provenance or source configuration says Unknown.
4. Given Applied for an install or refresh, when Canvas verifies the result, then the recorded source agrees with the source bound to that request.
5. Given unavailable catalog coverage, when the user inspects or removes an installed pack, then recorded membership and safe recorded files still govern that operation.

### US9 - Find an imported agent or skill in Installed (P1)

A user finds an import in Installed right away, without Reload, and can use Show in Installed to reach it.

Independent test: seed focused and directory import results, hand-made project artifacts, linked and unreadable entries, and exceeded read limits separately. No added pack source is needed.

1. Given Applied for an agent or skill, when the ensuing workspace read completes, then Installed lists it without Reload in either phase. Show in Installed is disabled with a reason while that read is pending or cannot establish the row.
2. Given Applied and the first imported artifact is present, when the user selects Show in Installed, then Installed opens with filters reset, its target page and row selected, and focus on details Close. This changes only the view and requests no operation.
3. Given a project agent or skill not imported through Canvas, when Installed is read, then it appears in the same order and with the same read-only details as an imported artifact; neither row claims import provenance.
4. Given a readable project row, when its details open, then the description, read-only note, complete facts, Files including agent companions, and new-session caveat are available as plain text. No Remove or Open file action appears.
5. Given a linked, unreadable, or over-limit fixture, when its list or details are read, then the relevant reason is visible; unavailable coverage is not an empty list, no partial artifact list masquerades as complete, and installed-pack behavior is unchanged.
6. Given any non-Applied import outcome, when its result is shown, then it offers no Show in Installed action, even if a matching project row already exists. A row's presence never proves import success.

## Edge Cases

- Import Source is empty, multiline, overlong, malformed, or an unsupported remote form. Refuse it without truncation, acquisition, or reinterpretation as a different source.
- An import needs authentication, an unsupported ref form, nondefault adaptation, or unresolved companions. Preserve the existing workflow's limits; do not silently import only part of the requested directory.
- An import has 13 artifact groups, a focused preview has more than 12 destination files, or complete warnings/replaced paths exceed the permission capacity. Refuse before permission, without splitting or hiding details.
- Existing import destinations appear, disappear, change, become linked, or collide after review. Earlier permission cannot authorize the changed state.
- An unsubmitted preparation expires, while a potentially delivered request remains unresolved. Only the former proves that nothing was sent.
- A source candidate is the workspace's own library, a bare packs folder, or another spelling of an existing source. Do not create duplicate built-ins or guess a different layout.
- Two tabs edit the shared source list, a local folder disappears, a branch moves, or a source changes during validation. Refuse a stale write or changed operation basis rather than replacing newer configuration or falling back.
- One source is unavailable or has invalid metadata while others work. Retain known results and explicit incomplete coverage, including when a filter has zero known matches.
- Same-name packs remain separate available choices, but installed membership is by name. A second source cannot create a second installation under the same name or evade existing namespace-collision checks.
- A configured source matches an installed pack but lacks its current metadata. Keep the metadata unavailable; do not substitute another source's description.
- The current Windows checkout's nine installed packs record a local folder from another machine. They are Unlisted until a confirmed refresh records a current source; do not relabel them merely because the names also exist locally.
- Long names, source labels, paths, revisions, and warnings wrap or remain inspectable in both themes. Markup-shaped metadata and result paths remain inert text.
- A workspace or provider replacement ends request authority. Retained text, configuration, and historical results restore neither consent nor host availability.
- A project read encounters 257 artifacts, 129 files in one artifact, or depth beyond 12. Report the exceeded limit: withhold the entire artifact list for the first case, and only the affected row's files for a per-artifact traversal limit.
- A linked artifact root stays visible as "Linked; not read". A failed entrypoint read, malformed description metadata, or incomplete frontmatter yields "Description unavailable" and its reason, never "No description".
- An import result arrives before the read that lists its files, or the artifact disappears afterward. Applied remains point-in-time result evidence; Show in Installed waits for a current row or explains why it is unavailable.
- A 26th row requires another page. A refreshed snapshot must not undo a surviving selection, and focus returned to a row must be visible even below the first screenful.

## Functional Requirements

### Placement, import, and continuity

- FR-001: Settings keeps Packs and About as its two sections, preserving the approved About baseline and the existing five main navigation destinations.
- FR-002: Phase A presents Installed, Available, and Add/import as Packs sub-tabs, with no empty Sources tab.
- FR-003: Phase B appends Sources to the same Packs sub-tab strip rather than creating another Settings section.
- FR-004: Add/import uses the heading "Import an agent or skill" and explains that imported `dude-local-*` agents and skills belong to this project, appear in Installed, are not packs, and that packs are added from Available.
- FR-005: Canvas accepts one trimmed, nonempty, single-line import Source of at most 2,048 UTF-8 bytes and identifies supported local file/directory, public GitHub file/directory, and raw GitHub file forms.
- FR-006: Canvas admits import only in the current joined workspace and idle session, with no waiting human request, queued input, or unreconciled capture, pack request, or import; competing capture and pack sends use the same exclusion.
- FR-007: Canvas displays invalid-source and disabled-action reasons without discarding the typed Source.
- FR-008: Preparing or submitting an import only requests Dude's existing workflow; it neither acquires source content, executes import, nor grants permission.
- FR-009: Canvas submits each admitted import at most once and never automatically queues, retries, or replays it after uncertainty, navigation, reconnect, or reload.
- FR-010: Canvas expires an unsubmitted preparation at the existing preparation limit so it cannot indefinitely exclude later explicit work.
- FR-011: Dude chooses focused file or guarded directory import from the source and previews the complete proposed import before application.
- FR-012: Focused Canvas imports offer only existing default adaptations; users wanting other category choices must decline and continue in chat.
- FR-013: Directory permission shows one item per agent or skill, with kind, final local name, destination, new/replaced file counts, every replaced file, and the exact reviewed revision; warned imports also show every flagged file, its reason categories, and the count of unreviewed or unbatched files.
- FR-014: Focused permission shows each destination file and any reviewed license or notice sibling with its analyzed state, plus unresolved sibling references; both import workflows show operation, consequences, and source eligibility without truncation.
- FR-015: Dude changes import destinations only after checked consent and the exact current confirmation: `IMPORT AGENT <dude-local-name>`, `IMPORT SKILL <dude-local-name>`, `IMPORT DIRECTORY <n> ARTIFACTS`, or `IMPORT WITH WARNINGS <n> ARTIFACTS`; a directory's count is its displayed agents and skills.
- FR-016: Changed source, destinations, or reviewed impact require a fresh import preview and literal confirmation before application.
- FR-017: Dude requests no permission and changes nothing for Blocked, unsupported, unsafe, or over-capacity imports; more than 12 directory artifacts, more than 12 focused destination files, or details that do not fit direct the user to chat without truncation, omission, or splitting.
- FR-018: Canvas-requested imports produce only project-local `dude-local-*` artifacts and preserve the existing prohibitions on executing imported content, installing runtimes, modifying remote state, or automatically importing dependencies.
- FR-019: Import permissions offer only Send permission and Decline; Defer and Save as idea are absent.
- FR-020: Canvas distinguishes permission acknowledgment from the independently acknowledged import result; a click, delivery, or consent response never displays Applied.
- FR-021: Add/import shows preparing, prepared, submitting, delivery-unconfirmed, delivered, permission-waiting, owner-waiting, and terminal states, with Open Needs you only for its current waiting permission.
- FR-022: Canvas shows Applied only for the matching Dude result after every written path is verified as an existing regular non-link file inside a contained local-artifact destination, including an imported agent's companion folder.
- FR-023: Each terminal import result shows Dude's note, complete written and uncertain paths as plain code text, and a clear distinction among no change, applied or partial change, verified restoration, and uncertainty.
- FR-024: Dude acknowledges a pre-permission refusal as a terminal import result so it releases the shared action exclusion; uncertain delivery never proves that nothing was sent.
- FR-025: Import results describe verification at that time and warn that a new session may be needed, without promising later file integrity or immediate host availability.
- FR-026: Local Settings section and Packs sub-tab changes retain typed import Source and request status while removing hidden panels and controls from focus and the accessibility tree.
- FR-027: Ordinary main-rail departure clears the typed import Source but retains its request status; Settings re-entry opens Packs > Installed with the existing initial browsing defaults.
- FR-028: Back to Add/import from an import permission restores the typed Source and exact request, with focus on its visible status.
- FR-029: Import and source navigation preserve selected work, task inspection, unsent answers and idea text, retained Review work, and existing pack-request return behavior.
- FR-030: Add/import hides pack filters, paging, Reload, and pack-coverage footer claims, without substituting an unrelated action.
- FR-031: Keyboard users can navigate sections and sub-tabs, use forms and filters, respond to permission, and read results with visible focus, announced outcomes, no hidden focus stops, and no focus trap.

### Pack sources and saved configuration

- FR-032: Sources derives Local library when present and Bundle upstream from the current installation on each read; built-ins are never saved as user-added sources.
- FR-033: The default catalog remains the local library when present, otherwise the bundle upstream; a development bundle explicitly says the upstream is not read while its local library exists.
- FR-034: Bundle upstream is read-only and labeled "Managed by bundle upgrade"; Sources cannot edit the upgrade channel.
- FR-035: An added source is either one public HTTPS GitHub repository at a ref, defaulting to `main`, or one existing local folder in the supported pack-library layout.
- FR-036: A primary Add source action at the top of Sources opens an Add source dialog containing Location and optional Ref, accepted forms, the public-only limit, the note "Installed packs can add agents and instructions", and an explanation that added sources are saved with the project.
- FR-037: Canvas refuses remote source addresses containing credentials, explicit ports, queries, fragments, backslashes, encoded separators, unsupported hosts, or non-HTTPS transports.
- FR-038: A supplied remote ref contains 1-128 ASCII letters, digits, periods, underscores, slashes, or hyphens, begins with an ASCII letter or digit, and contains no `..` sequence.
- FR-039: Canvas refuses a local source that is missing, lacks the supported catalog layout, or is the workspace's own library; a bare packs folder receives the Accepted layout guidance to choose its containing source folder.
- FR-040: Canvas derives source identity from the normalized repository address or real local folder location and derives display names from that identity; duplicate identities are refused rather than added under aliases or another ref.
- FR-041: Canvas permits at most eight user-added sources and displays that limit beside the add form.
- FR-042: Added sources are project configuration intended to be committed and shared; no saved configuration means no added sources, fresh releases do not seed it, and bundle upgrades leave it alone.
- FR-043: Canvas saves validated source additions and removals directly from Settings without Needs you permission; adding a source installs and runs nothing.
- FR-044: Before saving an addition, Canvas performs one catalog read with a 5,000 ms acquisition deadline, requires parseable pack metadata, and reports the number of packs found.
- FR-045: A refused addition leaves saved configuration unchanged and identifies bad input, credentials, unreachable/private access, missing catalog, bad metadata, duplicate identity, the source limit, timeout, or changed configuration as applicable.
- FR-046: Canvas refuses source removal while an installed pack or in-flight pack request uses that source and names each blocker.
- FR-047: Successful source removal deletes only the selected added-source entry, never installed packs, artifacts, or another source.
- FR-048: Canvas refuses source writes against changed configuration and saves each accepted update as a complete change, without replacing concurrent edits or leaving partial configuration.
- FR-049: Unreadable source configuration is reported as unavailable, never treated as an empty list or silently reset.

### Discovery, source-bound requests, and provenance

- FR-050: In Phase B, catalog discovery for default and added sources occurs only on explicit Reload and one read after successful source add/remove; navigation and filtering cause no polling, background synchronization, or saved catalog cache. Explicit operation freshness checks remain required. Local project-artifact reads do not acquire catalogs.
- FR-051: Each discovery read acquires each added source once, with at most four readers at a time and a 5,000 ms acquisition deadline per source; timed-out or cancelled acquisition must stop rather than continue in the background.
- FR-052: Sources and Available show independent source status and pack counts; a failed source cannot hide readable results, and incomplete totals use "known" wording rather than claim complete coverage. Before the first Reload, source rows come from configuration with Status "Not read" and no counts; Add and Remove remain available subject to their normal validation and use blockers.
- FR-053: Each Available row represents one pack from one source; same-name packs remain separate rows and their details name both pack and source.
- FR-054: Installed membership remains keyed by pack name, so every Available row with an installed name is excluded, while existing pack namespace and file-ownership limits remain binding.
- FR-055: An explicitly selected pack source is the sole source for that request; no priority ordering or fallback can substitute another source for a missing or unavailable selection.
- FR-056: Install binds the source of the chosen row, and a user-added choice must match a current configured entry.
- FR-057: Refresh selects the added source matching the recorded installation source, otherwise the default catalog; if the resulting source differs from the recorded source, permission states `Source changes: A -> B`.
- FR-058: Install and refresh permission show the source as the first target, its resolved commit when applicable, and a third-party label for an added third-party source before requesting the existing operation-specific literal confirmation.
- FR-059: Pack request admission and application check the chosen source and source configuration for freshness along with the existing installed-state and target checks; changed impact requires a fresh preview and confirmation.
- FR-060: Applied install or refresh requires the exact owner result and a fresh installed-state read that records the pack from the source bound to that request.
- FR-061: Remove takes no source choice and remains bounded to the installed authority's exact safe recorded files, independent of catalog availability.
- FR-062: Installed pack descriptions and use cases come from the matching current source; unmatched installed entries retain the existing by-name default-catalog lookup, with unavailable metadata labeled rather than invented.
- FR-063: In Phase B, Installed and Available provide a Source column using the labels below, including "This project" for project agents and skills; source type is written out, never conveyed by an icon or color alone.
- FR-064: Source and Use case filters combine with AND across the complete active list before paging; Clear resets both.
- FR-065: The Source filter retains failed sources marked "(unavailable)" and uses the existing "not a confirmed empty list" message when their coverage is incomplete.
- FR-066: Canvas treats pack descriptions and source content as data, not instructions or permission to perform another operation; a repository owner is not automatically presented as the pack author.
- FR-067: Pack requests using only the default catalog preserve the existing request, handoff, acknowledgment, consent, and result semantics; added-source binding does not change those contracts when absent.

| Source label | Meaning |
| --- | --- |
| `Local library - Local folder` | Recorded or catalog source matches the workspace library. |
| `Bundle upstream - GitHub E-G-C/dude` | Repository matches the bundle upstream; use its actual repository name. |
| `owner/repo - GitHub` or `folder - Local folder` | A user-added source; substitute its derived name. |
| `Unlisted - (type)` | Readable recorded source matches no current source; write out its actual type. |
| `Unknown` | Recorded source or source configuration is unreadable. |
| `This project` | A project agent or skill present in the workspace, with no claim about its origin. |

### Design and scope boundary

- FR-068: Product implementation and canonical implementation-task derivation wait for explicit user approval of one canonical mock covering both phases, their complete required states, and all approval-visible decisions.
- FR-069: The mock identifies every material departure from the approved Canvas workspace, Packs, and About designs, including the newly real source picker and narrow Packs sub-tab layout, for explicit approval.
- FR-070: This feature adds only the import entry/result, read-only project rows, pack-source management/discovery, list behavior, and placement foundations in FR-077; it adds no general configuration writer, new import engine, provenance record, documentation viewer, marketplace, or pack-version/update capability.
- FR-071: Canvas presents Packs sub-tabs in one row at Packs column widths from 480 px and two columns at 301-479 px; at 300 px or less, a labeled "View" Dropdown replaces the strip and selects the same views, with the list panel in one scrolling column.
- FR-072: While an import is unreconciled, New idea keeps the draft editable but disables Submit and Save with "An artifact import is in progress or needs owner reconciliation. Your idea draft stays here."
- FR-073: A prepared or sent unreconciled idea capture disables Request import and pack sends with "An idea capture needs owner reconciliation before an import can be requested." An unsent typed draft alone never blocks them.
- FR-074: At Packs column widths of 479 px or less and viewport heights below 560 px, the whole Packs panel scrolls as one column rather than leaving only the rows to scroll; from 560 px up, the rows alone scroll.
- FR-075: Pack, project-artifact, and source details keep one section order at every width: heading and scope, a coverage notice when present, description, actions and their reason or a read-only note, then facts. Pack details continue with installed provenance or the projected-files note, then recorded files; project details continue as in FR-086; source details end at facts. The details scroll as one region while the heading, close control, and Back to results stay visible. This feature shows no documentation section, control, or placeholder.
- FR-076: Installed, Available, and Sources select and return focus by opaque row identities unique within each list, never names alone; Installed and Available also page by those identities. Source row identity includes built-ins and is independent of ref. A Source option for Unlisted, Unknown, or another non-source group appears only when a row in that pack list carries it.
- FR-077: Later features add to, but never remove or reorder, this feature's sections, sub-tabs, columns, filters, or actions. Documentation for a pack, its members, or a project agent or skill goes in one Documentation section directly after the facts; this feature reserves that position and renders nothing there.
- FR-078: The mock shows documentation placement only through non-interactive annotations labeled 'Planned (080)': an outline at the reserved position in every pack and project-artifact details view, shown by default and hidden by a mock-only switch, plus full frames from the scenario controls. With the switch off, product states render as specified. Annotations are placement-approval evidence, outside product states, implementation, and acceptance.
- FR-079: Sources lists built-ins first, then added sources, in the Installed/Available master-detail pattern, with at most 10 rows and no filters or pager. Columns are Source with written-out type, Location and ref, Status, and Scope ("Built in" or "This project"). A selected row opens the shared 320 px details pane from 1100 px viewport width, or the modal overlay below it; at Packs widths of 479 px or less, the table header hides and rows stack their complete values.
- FR-080: Source details show facts in this order: Status, Packs found including how many are not installed, Installed from this source, and Saved in. Installed counts use recorded source matches, not matching pack names; unreadable facts are unavailable rather than zero, and unmatched installed records are disclosed without inventing a source row.
- FR-081: Show packs in Available is enabled only for a Read source with at least one uninstalled pack; otherwise its reason is visible. It changes only the local view: select that Source, reset Use case to All and page to 1, and focus the Available tab or, at Packs widths of 300 px or less, the View Dropdown.
- FR-082: Source details offer Remove only for added sources, with confirmation and a named disabled reason for known installed-pack or pack-request blockers. The reason is advisory; the final removal check remains authoritative and any refusal stays inside the confirmation dialog with all blockers named. Built-ins show a read-only note instead of Remove.
- FR-083: The Add source dialog opens with focus on Location and returns focus to its trigger on cancellation. While Reading, it blocks Cancel, Close, Esc, and backdrop dismissal; otherwise backdrop dismissal requires a full press and release on the backdrop, never a press starting inside the dialog. Refusals retain input inside the dialog, including the applicable Reload packs or Read again recovery action for changed configuration or a lost response. Success closes it and announces Added outside; only after the post-add read does the new row open in details with focus on Close.

### Project rows, paging, and refresh continuity

- FR-084: Installed lists every project agent and skill present in the workspace as a read-only row, imported or not, with Name, Type, Use cases "Not applicable", and in Phase B Source "This project"; no origin is claimed. Project rows are not installed packs. They never affect membership, Available, pack requests, namespace checks, or source removal, offer no operations, and have distinct identities. "Not applicable" never matches a use-case filter or counts as incomplete tag coverage.
- FR-085: The project read is local, follows no links, stays within the project agent and skill folders, and lists at most 256 artifacts, reading at most 8 KiB per entrypoint and 128 files per artifact, to a depth of 12. Exceeded limits are reported, never silently truncated. Its coverage is separate: if it is unavailable, installed packs remain, counts say "known", and the reason appears. An unreadable row shows its reason instead of a description.
- FR-086: Project details show the heading with "This project" scope, any coverage notice, the description, a read-only note instead of actions, facts (Type, Location, declared name, file count), then Files, including an agent's companion folder, and the new-session caveat, all as plain text.
- FR-087: Installed reflects an import result's files without Reload. Only Applied offers Show in Installed: a local view change that selects the first imported artifact and focuses its details, disabled with a reason until it is present.
- FR-088: The first list column is Name. Installed adds Type, is named "Installed", and counts packs plus project rows when both are known. Phase B's Source filter offers "This project" only when such a row exists. No Type filter.
- FR-089: Installed and Available show at most 25 rows per page in their defined order. A pager pinned below the results states the current range and page and disables unavailable Previous and Next actions; where FR-071 or FR-074 scrolls the whole panel, the pager follows the rows. Filtering precedes paging, paging changes no authority, and focus returned to a row brings that row into view. This replaces the approved 063 five-row page for these lists and is a departure requiring explicit approval. Sources remains unpaged.
- FR-090: A refreshed list keeps the current filters, page, and selection while the selected row still exists; otherwise the existing reset applies. This is a departure from the approved 063 refresh behavior requiring explicit approval.

## Key Entities

- Import source: one literal file or directory location, evaluated through Dude's existing import workflow.
- Import request: one session-bound, single-use request with separate delivery, permission, and result states.
- Reviewed impact: the complete destinations, source basis, adaptations or warnings, and consequences presented for consent.
- Permission: the user's exact confirmation and checked consent for that reviewed impact, separate from evidence of application.
- Import result: Dude's bound outcome, change classification, complete path sets, and note, verified at acknowledgment time.
- Built-in source: current installation-derived Local library or Bundle upstream, read-only and not an added-source entry.
- Added source: one project-shared GitHub repository/ref or local folder identity, with a derived name and current catalog coverage.
- Catalog row: one pack/source pair, distinct from installed membership by pack name.
- Recorded pack source: installation provenance used for display, matching, and refresh selection; it is not proof of current artifact contents or authorship.
- Project artifact row: one present project agent or skill, identified by its path-based name and type, with read-only facts and no import provenance or pack authority.
- Project coverage: the independent completeness and availability of the current local-artifact read, distinct from installed-pack and catalog coverage.
- List context: current filters, page, and opaque selected row identity; refreshed data preserves it only while that selected row survives.

## Visual Intent

Use Visual Studio NuGet Package Sources' "+" toolbar, JetBrains Manage Plugin Repositories' +/- toolbar, and Windows Settings' Add buttons above lists to keep source setup visible at the top. Sources follows the existing 063/073 Installed/Available master-detail pattern, with Fluent Dialog conventions for the Add form. Homebrew's tap/untap distinction fits adding a source without installing its packages. Source-bound installs follow cargo registries, uv per-package indexes, and winget's explicit source selection; pip/choco-style priority ordering is deliberately not copied.

For imports, retain the entry-to-review pattern of VS Code Install from VSIX and JetBrains Install Plugin from Disk. Use a typed Source rather than imply a browser can supply the needed local path through Browse. The user's Add/import label stays, with copy making clear that this tab adds no packs and imports appear in Installed.

For later documentation, follow VS Code Extensions and JetBrains Plugins by keeping the README/description in details, with npm/NuGet README sections and GitHub folder READMEs as content conventions. Do not copy VS Code's details tabs: they fit a full editor, not this 164-320 px pane, and a lone tab would be a dead affordance. One Documentation section holds collapsed disclosures using the existing Recorded files pattern at the same position in the wide pane and narrow overlay. A reader view is not the default recommendation; a documentation view opened from that position remains Q3's alternative.

Project agents and skills follow the Installed placement of VSIX and Install Plugin from Disk in Phase A. A list under Add/import would turn an action view into an inventory and imply import provenance; a fifth sub-tab would reopen the narrow navigation design. Written-out types distinguish the rows from packs, with Source "This project" added in Phase B and no Type filter. The Name column uses each artifact's path identity, not its declared display name. Pack rows keep their order, followed by project rows ordered by name, then type.

Use the familiar paged-data-table convention with a 25-row default, as in GitHub issue and PR lists. This fills more of a tall results area without replacing the approved pager. Retained context prevents an ordinary refresh from undoing Show in Installed. The new page size and refresh behavior are explicit departures from 063, not presumed approvals.

For documentation placement review, follow Figma Dev Mode annotations and Storybook's Outline toggle: visibly mark the reserved position without presenting a product control. The preview strip defaults to "Planned placement: Shown", offers Hidden, and links to "Open frames P1, P2, P4". The outline reads "Planned (080): Documentation appears here. Not in 073." Product captures and identity checks use Hidden.

### Should Feel

- Like the existing compact desktop Settings, with pack actions, project artifacts, and their sources in one place.
- Deliberate about trust: source discovery, a change request, permission, and a verified result have distinct meanings.
- Readable at narrow widths, with complete details and useful failure messages in either theme.

### Should Never Feel

- Like a marketplace, setup wizard, inventory placeholder, or automatic updater.
- Like adding a repository grants permission to install its agents or instructions.
- Successful before verification, or dependent on icons and color to explain locality, trust, or coverage.

## Scope And Surfaces

In scope: Packs sub-tabs, the unchanged focused/directory import contract in Add/import, read-only project agent and skill rows in Installed with Show in Installed, 25-row Installed/Available pages and retained context, Sources configuration, source-aware Installed/Available lists, and source-bound install/refresh permission and results. Phase B extends Phase A's working lists and navigation with sources; it is not a prerequisite for importing or finding project artifacts.

073 establishes the pack/project/source details order and single scrolling body, opaque row identity, and row-backed non-source filter options in FR-075-076. Source details end at facts. Pack and project details reserve one Documentation position directly after facts and render nothing there in product states. FR-077-078 cover that reservation and the mock-only annotations; they add no empty Documentation heading, extra sub-tab, or documentation control to the product. FR-079-083 cover the Sources table, details facts and actions, and Add source dialog. FR-084-090 bring project inspection and the revised list behavior into 073.

The former pack-sources derivative is merged here. 079 is resolved and superseded: its listing and inspection move here, while documentation for packs, members, and project artifacts remains in 080 per the user's Q6 answer. Upgrade-channel editing stays in 072. Preserve the working discovery, response, capture, task inspection, and Review capabilities, the five main navigation destinations, and the approved Packs/About section chooser. These are continuity references, not execution-order claims.

The round-5 mock must show these changes in both themes and phases. The frozen checkout stays at nine installed packs and no project rows; clearly labeled sample artifacts arrive through Applied, followed by Show in Installed, rather than being presented as observed workspace data.

| Surface | Required mock coverage |
| --- | --- |
| Both delivery phases | Phase A's three Packs views without Sources; Phase B's Installed, Available, Add/import, Sources; unchanged Packs/About sections. Show the View Dropdown at 180x450, two-column sub-tabs at 301-479 px Packs width, and one row from 480 px; retain the earlier one-tab-per-row rule only as a mock comparison. |
| Add/import entry | Heading and project-local explanation including appearance in Installed, accepted Source forms, validation, disabled reasons, queued-input post-click "not sent" refusal, and hidden filters/pager/Reload. |
| Import status | Every nonterminal phase, exact Open Needs you entry, retained Source/status, and mutual send exclusion with an unsent New idea draft retained. |
| Import permission | Focused destination and reviewed license/notice sibling with analyzed revisions and unresolved references; directory items with kind/name/destination/counts/every replacement; Clean and Warned confirmations; all warning categories and unreviewed/unbatched counts; complete operation/consequences/eligibility; consent and the two response choices; over-capacity refusal without permission. |
| Import results and return | Applied with complete paths, new-session caveat, and Show in Installed selecting the first imported artifact and focusing details Close in both phases at all four sizes. Include "Reading Installed...", "Project agents and skills could not be read", and "Not in Installed now" disabled reasons. Declined, Failed with partial change or restoration, Unavailable, Stale, and Uncertain offer no Show action. Retain Back to Add/import focus and main-rail clearing versus local retention. |
| Project rows and details | P3's listing and P4's non-documentation content are product states. After labeled Applied samples, Installed adds agent and skill rows with path-identity Name, written-out Type, Use cases "Not applicable", and Phase B Source "This project". Include hand-made, unavailable, over-limit, unreadable, and linked fixtures; complete facts, Files with agent companions, read-only note, and new-session caveat; no operations, origin claim, Remove, or Open file. |
| Sources table and built-ins | One table with built-ins first, at most 10 rows, Source/type, Location and ref, Status, and Scope; no filters or pager. Show stacked rows with hidden headers at Packs widths <=479 px and View at <=300 px. Development bundle: Local library active, upstream not read by design; released install: no Local library, upstream supplies the default catalog. Before Reload, configuration rows say Not read without counts; Add/Remove retain their normal availability. |
| Added sources and details | GitHub/local rows with Scope This project; built-ins use Built in. Empty added list and unreadable configuration remain distinct. Row selection opens the shared 320 px pane or overlay below 1100 px, in FR-075 order, ending with Status, Packs found, Installed from this source, Saved in. Both built-ins show 0 installed in the frozen checkout and "9 installed packs record an unlisted source"; no Unlisted source row is invented. |
| Add source dialog | Primary Add source above the table opens on Location, with optional Ref, accepted forms/layout, public-only and trust notes, project-save location, and eight-source limit. Reading stays inside and blocks dismissal; success closes and announces Added/count outside, then selects the new row and focuses details Close after the post-add read. |
| Source-add refusals | Every refusal stays inside the dialog with input retained: bad input, credentials, unreachable/private repository, no catalog including the bare-folder diagnostic, bad metadata, duplicate, limit reached, timeout, changed-since-read configuration, and lost response. Include the in-dialog Reload packs and Read again actions. The accepted drag-to-backdrop mock defect is a product constraint, not desired dismissal behavior. |
| Source detail actions | Show packs in Available changes only the local Source filter/view, resetting Use case/page; show enabled Read/uninstalled and all disabled reasons. Added-source Remove is disabled with named advisory blockers and keeps confirmation; a server refusal stays inside that dialog and names blockers. Built-ins have no Remove and show a read-only note. No repository link, copy, edit, rename, enable, reorder, or per-source re-read. |
| Lists and filters | Name first; Installed includes Type and combined counts only when installed and project coverage are current, otherwise "?"; failed project coverage uses "known" counts. At <=479 px label stacked Type and Use cases in Phase A and add Source in Phase B. Phase B Source/Use case AND filtering precedes paging; "This project" appears only with project rows. Keep same-name pack pairs, Unlisted, Unknown, unavailable coverage, and the frozen nine Unlisted records honest. |
| Paging and continuity | 25-row single-page and 26-or-more-row multi-page samples for each list, including Phase B Available; pinned pager and whole-panel-scroll exception, complete traversal, filter-before-page, visible restored focus, and retained filters/page/selection across refresh while the selected opaque row survives. The full page at 1440x900 leaves no empty results area above the pager. |
| Pack permission and results | Install with first source target, commit and third-party label; refresh with `Source changes: A -> B`; exact source-bound result; unchanged removal and default-catalog contract. |
| Baseline comparison | Every departure from 063's approved design, which excluded a real source picker, and 074's Settings baseline, including Type in Phase A, labeled stacked rows in both phases, 25-row pages, retained refresh context, narrow navigation, filter insets/wrapping, and short-height scrolling. Keep About/workspace surfaces unchanged and flag each departure for explicit approval. |
| Planned documentation placement only | Default-Shown, dashed, non-interactive "Planned (080)" outline directly after facts in every pack and project details pane and overlay. A preview-strip Shown/Hidden switch and "Open frames P1, P2, P4" link stay outside product controls. Documentation in P1, P2, and P4 remains planned; captures and product-state identity checks run with placement Hidden. FR-078 excludes annotations and documentation frames from product implementation and acceptance. |

### Planned placement evidence

These static, non-interactive frames show where documentation fits, not working documentation. P3's list and P4's ordinary project details now belong to product coverage above.

| Frame | Placement to show |
| --- | --- |
| P1 (080) | Available `rust - Local library`: Documentation collapsed, then a separate frame with the frozen pack documentation body expanded as plain text (the unrendered Markdown source, wrapped). The rendering choice belongs to 080; formatting is illustrative. |
| P2 (080) | Installed `clearline`: its frozen skill README expanded as plain text (the unrendered Markdown source, wrapped), including code-block and table source; show the long scroll at 180x450 and "From Local library by pack name; installed record Unlisted." The rendering choice belongs to 080; formatting is illustrative. |
| P4 (080) | A labeled sample project skill's product details with planned Documentation directly after facts and before Files. Its read-only note replaces actions; only the documentation content is planned. |

Pack documentation precedes one disclosure per member README in declared member order, for example "Skill dude-pack-clearline-visual - README". A project artifact's own documents use that same Documentation section. Placement does not choose plain text versus sanitized Markdown; formatting in these frames is illustrative. Long content stays in the details body's single vertical scroll, with heading, close, and return controls visible.

Must not show in 073 product states (the labeled annotations and documentation frames above are the FR-078 exception):

- Tokens, SSH, private repositories, non-GitHub remotes, authentication controls, or an editable bundle upstream/upgrade channel.
- Version/update badges, polling, auto-sync, source enable switches, priority controls, aliases, bulk install, marketplace ratings, pack search, or author profiles.
- Per-source re-read, edit, rename, reorder, copy, external repository links, commits in source rows/details, or per-source timestamps.
- A Local artifacts Settings section, documentation placeholders, README previews, documentation controls, or Browse buttons.
- File-versus-directory toggles, adaptation/license options, retry/undo, progress percentages, or import source history.
- Project-artifact operations, Remove, Open file, a Type filter, or an assertion that a listed artifact was imported through Canvas.

Every active control must map to a declared, buildable behavior. Mock scenario controls must be clearly separated from product controls; illustrative sources, counts, and results cannot masquerade as observed installations or become hardcoded product data. Preserve prior-round artifacts and review evidence for comparison.

## Brand Fit

Reuse the workspace's typography, spacing, borders, focus treatment, and light/dark colors. Keep Settings section tabs distinct from Packs sub-tabs. Add no logo, visual system, hero, promotional card, or third-party branding treatment. Meet WCAG AA contrast and retain a readable text explanation for every state.

## Proposed Direction

Approved direction: **Classic Settings Packs Hub with project rows**. It keeps round 3's placement foundations and round 4's Sources table, details, and top Add source dialog. Four changes answer the user's round-4 review:

1. Installed lists every project agent and skill present in the workspace, imported or not, as a read-only row with Name, Type, Use cases "Not applicable", and in Phase B Source "This project". Rows claim no origin. Their details end with Files, including an agent's `.support/` companions, and the new-session caveat.
2. After an Applied import, Add/import offers Show in Installed. It opens the target page with the first imported artifact selected and focus on details Close, without requesting another operation.
3. Installed and Available show 25 rows per page and retain their filters, page, and selection across a refresh while the selected row still exists, subject to the settled FR-090 assumptions below.
4. Every pack and project details view marks the reserved Documentation position with a default-on, dashed "Planned (080)" note. The note is non-interactive, mock-only, and hideable; the preview strip links to the full planned frames.

Documentation display stays outside 073 per the user's Q6 answer. The 25-row page and retained refresh context depart from 063; the Type column and labeled stacked rows in Phase A depart from 074. The user approved these departures, the "Installed" naming, and the default-on mock annotations as drawn. Every sample row, count, and result remains illustrative. Approval is bound to the exact reviewed artifact in the Revision Log.

The round-2 layout keeps Settings at the approved 074 Packs | About baseline. All pack operations and settings live under Packs: Installed | Available | Add/import | Sources, with Sources absent in the independently useful Phase A. In Phase B, Installed and Available gain a Source column and a Source filter, ANDed with Use case; source type is always written out.

A primary Add source button occupies the toolbar slot above the table. It opens a modal containing the existing Location/Ref form and notes, following Fluent Dialog and the top-action conventions of Visual Studio NuGet Package Sources ("+"), JetBrains Manage Plugin Repositories (+/-), and Windows Settings Add buttons. Reading blocks Cancel, Close, Esc, and outside click; all refusals and their recovery actions stay inside with input retained. Success closes the dialog and announces Added outside, then opens the new row's details after the post-add read. The accepted drag-to-backdrop dismissal defect is carried into the plan as a product constraint.

Built-in and added sources share one table with Source and written-out type, Location and ref, Status, and Scope (Built in or This project). It has at most 10 rows, no filters, and no pager. Each row opens the existing 063/073 320 px right details pane or the modal overlay below 1100 px. FR-075 fixes the order: heading and scope, coverage notice when present, description, actions and their reason, then facts: Status, Packs found, Installed from this source, and Saved in. The development upstream is not read by design; its description explains why instead of drawing a coverage notice.

Show packs in Available is a local filter jump, enabled only when the source is Read and has an uninstalled pack. Remove appears only for added sources, keeps confirmation, and is disabled with a named advisory reason when installed packs or pack requests use the source. The server's refusal remains authoritative and names blockers inside the confirmation. Built-ins show no Remove and a read-only note. The nine frozen Unlisted installation records remain honest: 0 installed per built-in, with "9 installed packs record an unlisted source", not an invented source row or a name-based match.

Homebrew tap/untap supplies the trust distinction: adding a source installs nothing, and removing one uninstalls nothing. Install and refresh still use Needs you, with the source first, its commit when applicable, and a third-party label for an added third-party source, or `Source changes: A -> B`. Source-bound installs retain the cargo, uv, and winget convention without priority fallback. No external repository link, per-source re-read, edit, rename, enable, reorder, copy, source commit, or timestamp is proposed.

Round 2's import contract remains unchanged in Add/import, including Back to Add/import, the narrow View Dropdown, whole-panel scrolling rules, and visible New idea exclusion.

Round 3's placement foundation remains one "Documentation" section directly after facts, before pack provenance (or the projected-files note) or project Files, at the same position in the 320 px pane and narrow overlay. The heading, close control, and Back to results stay visible around one scrolling details region. The proposed 080 presentation uses initially collapsed disclosures: the pack documentation first, then member READMEs in declared order; a project artifact's own documents use the same position. 073 renders nothing there in product states.

Project listing and non-documentation inspection now belong to 073, replacing the former 079 boundary. The round-3 placement frames remain useful for documentation review, while P3's listing and P4's ordinary facts and Files are covered by the round-5 product-state mock.

Follow VS Code Extensions and JetBrains Plugins for README content in details and for VSIX and Install Plugin from Disk installs appearing in Installed. Reuse npm and NuGet README sections and GitHub folder READMEs as content conventions. Deliberately omit VS Code-style details tabs in this compact pane. Frame formatting is illustrative; rendering belongs to 080.

The canonical round-5 preview is `.dude/specs/073-dude-canvas-artifact-import/design/artifact-import.html`, SHA256 `58cffc7a8be6699726c87508e8524a866e55435f53293a712b664ad49840c4f9` (457,106 B). `design/screenshots/` holds 725 top-level PNGs after 492 new captures and the move of 221 superseded round-4 PNGs to `design/screenshots/round-4-superseded/`.

FluentUI authored round 5 within the Coder's declared round-5 envelope. The coordinator-observed independent Tester passed all nine checks, including 992 comparisons against round 4 (`1feedf06710014fa92d4ce7e65d8fb3b56046757d2116160dbeeec057fcd838d`) with only the expected differences. `plan.md` records the check counts, capture mode, and three accepted header advisories. This is mock evidence, not product acceptance or visual approval.

Round-1 comparison evidence remains unchanged in `design/screenshots/round-1-rejected/` (97 PNGs), `design/artifact-import-round-1-rejected.html` (LF-normalized rejected bytes, SHA256 prefix `9f148329...`), and the user's annotated `design/references/2026-09-29-user-review-round-1.png`. The canonical preview above is round 5, not the rejected layout. Round-3 annotations remain at `design/references/2026-09-30-user-review-round-3-add-on-top.png` and `design/references/2026-09-30-user-review-round-3-sources-table.png`.

Round 3's accepted framing advisory remains historical evidence: at 180x450, P3a anchors on the Sample pill, showing the first project card without its name and the second card only partly. Its accepted nits were P4's banner omitting the order sentence supplied by the header, and `p4-end` equaling `p4` at 1440x900. These do not relax round-5 project-row inspection.

The `.proto` scenario-drawer overlap was declined as mock-only: its 45dvh drawer covers list rows when open at widths >= 528 px and heights <= 500 px. Closing it restores all rows; the drawer is not a product control.

## Visual Success Criteria

- VSC-001: From an ordinary workspace view at Packs column widths above 300 px, Add/import and, in Phase B, Sources are each reachable in two navigation activations: Settings, then the relevant Packs sub-tab. At 300 px or less, Settings followed by opening View and choosing the destination reaches the same panel.
- VSC-002: At 180x450, 360x900, 768x900, and 1440x900, both phase layouts have readable navigation labels and controls without horizontal page or Needs you panel scrolling in either theme.
- VSC-003: Layouts reflow at 200% zoom down to an effective 180x450; full source values, names, paths, revisions, and permission details remain inspectable.
- VSC-004: Tab, Shift+Tab, tab-arrow or Dropdown navigation, and ordinary activation complete source management, filtering, import, permission, and return flows with visible focus, no hidden focus stops, and no trap.
- VSC-005: Normal text meets 4.5:1 contrast, large text and meaningful non-text controls meet 3:1, and actionable targets meet 24-by-24 pixels or provide a demonstrated equivalent control path.
- VSC-006: Every required request phase, refusal, coverage state, and result is distinguishable by text in the mock and eventual product; consent never looks like application.
- VSC-007: The mock makes built-in versus added sources, the third-party trust boundary, and every departure from the approved baselines visible for explicit approval.
- VSC-008: Source labels and counts remain readable in both themes at the minimum width, including a same-name pair, Unlisted, Unknown, and unavailable-source coverage, without relying on icons or color.

## Success Criteria

- SC-001: Eligible focused agent and skill fixtures from local and public GitHub file sources complete Add/import -> Needs you -> Add/import with their exact verified written paths.
- SC-002: Eligible local and public GitHub directory fixtures complete Clean and Warned imports with complete reviewed outputs, including agent companions and shared notices; every Blocked fixture changes zero destinations.
- SC-003: Missing/mistyped confirmation, unchecked consent, decline, unsafe destinations, and changed impact produce zero unauthorized import writes; every over-capacity case publishes no permission and directs the user to chat without omissions or splitting.
- SC-004: All six terminal import outcomes and no-change, partial-change, restored, and uncertain cases show the correct explanation and complete reported paths; none falsely displays Applied.
- SC-005: Every duplicate, race, timeout, reconnect, and reload case produces at most one foreground send per import request and zero automatic replays; expired unsubmitted preparations release their exclusion when checked.
- SC-006: All US5 navigation cases preserve the specified source, request, work, draft, and Review state; ordinary departure clears only the typed import Source and resets Settings browsing as specified.
- SC-007: All eight visual criteria pass in both themes, with explicit approval of the canonical mock covering both phases recorded before implementation or canonical task derivation.
- SC-008: Instrumented import request entry performs zero source acquisitions or imports; completed imports execute no imported content, install no runtime, and automatically import no dependency.
- SC-009: Valid GitHub and local candidates save with accurate pack counts; eight added sources are accepted, a ninth is refused, and every confirmed refusal leaves saved configuration byte-unchanged. A lost response remains unconfirmed until a fresh read, never proof that nothing was saved or permission to replay the write.
- SC-010: Every blocked source removal identifies all installed/in-flight blockers and changes nothing; each permitted removal changes only the selected entry.
- SC-011: In Phase B, a Reload with eight added sources starts at most four readers concurrently, reads each source once, ends acquisition at its 5,000 ms deadline, and exposes each failure without hiding successful sources; navigation alone starts zero catalog discovery reads.
- SC-012: In a multi-page, multi-source fixture, both filters find matches beyond page 1, Clear resets both, same-name rows retain their origins, and installing one removes every Available row of that name.
- SC-013: Every added-source install and refresh is verified against that selected source; source drift or substitution never produces Applied, and a default-source change is disclosed before consent. Default-only and removal cases retain their existing contracts.
- SC-014: Missing source configuration means zero added entries, unreadable configuration is not empty, built-ins are never persisted, and release/upgrade checks preserve the intended project ownership of the saved list.
- SC-015: Focused, directory-with-agent-companions, hand-made, linked, unreadable, and over-limit project-artifact fixtures produce exactly the expected rows, files, coverage, and reasons; pack membership, requests, namespace checks, Available, and source removal are unchanged.
- SC-016: Each Applied fixture appears in Installed without Reload. Show in Installed selects the first imported artifact and focuses its details in both phases at all four specified sizes. The project read starts no network request or process.
- SC-017: In fixtures of 25 and of 26 or more rows per list, page traversal reaches every row exactly once with no page above 25 rows; at 1440x900 a full page leaves no empty results area above the pager; every restored focus is visible.

## Assumptions

Q5 is answered by the user's instruction that imports appear in Installed right away. The user's explicit mock approval covers the decisions below as drawn. Q4 records the approved public-GitHub-only disposition rather than a separate direct answer; Q6 is answered by the user's delegation of documentation display to 080. Q3's placement is approved; documentation presentation details remain with 080. Mock-verification evidence is not a user answer.

| Approval-visible decision | Approved disposition |
| --- | --- |
| Documentation placement | One Documentation section directly after facts, before installed provenance (or the projected-files note) and files, in both the 320 px pane and narrow overlay. Pack documentation comes first, followed by member READMEs in declared order; project details reserve the same position before Files. 073 renders nothing there. |
| Q5: "local or not" | Answered: "import should  show up in Installed right away." Installed includes project agents and skills, while Phase B's Source column/filter also identifies pack locality. |
| Project rows in Installed | Phase A lists every present project agent and skill, imported or not, as a read-only row with no origin claim or pack operations. Use cases is "Not applicable"; Phase B adds Source "This project". Details include complete facts, Files with agent companions, and the new-session caveat. |
| Type and labeled stacked rows in Phase A | Approved departure from 074. Installed shows Type values Pack, Agent, and Skill after Name, with no Type filter. At Packs widths <=479 px, stacked rows label Type and Use cases in Phase A; Phase B adds Source. |
| "Installed" naming | Use "Installed" rather than "Installed packs", Name rather than Pack, and combined pack/project counts when both coverages are known. This departure is approved; the name grants project rows no pack membership or origin claim. |
| Q3: documentation placement | Recommended: inline, initially collapsed disclosures in the Documentation section. Alternative: a documentation view opened from the same position. Measured long-text evidence favors considering the alternative; see the 080 risk in `plan.md`. Q3 is not directly answered. |
| Q6: documentation display | Answered: the user delegated documentation display for packs, members, and project agents and skills to 080. Literal reply: "I accept the recomendation to delegate 080 for the documentation." 073 reserves and annotates the position and renders nothing there in the product. Project listing/inspection is no longer deferred to 079. |
| Default-on mock annotations | P1, P2, and P4's documentation remain inert Planned (080) placement evidence. P3's listing and P4's non-documentation details are product states. A default-Shown mock-only switch adds a dashed Planned (080) note at the reserved position in every pack/project pane and overlay; the preview strip also links to the full frames. This mock-only departure is approved. Product captures and identity checks use Hidden. Neither annotations nor frames add product scope or approve a renderer or documentation behavior. |
| Project-read bounds | Local only, no links followed; 256 artifacts, 8 KiB per entrypoint, 128 files and depth 12 per artifact. More than 256 makes project coverage unavailable with no partial list; a per-artifact traversal limit withholds only that row's files and states why. Pack coverage is independent. |
| Project descriptions | Use only readable, single-line frontmatter scalars. A BOM, missing or late closing delimiter, block or multiline value, duplicate key, bad UTF-8, or read failure gives "Description unavailable" plus a reason, never "No description". Name remains path identity; declared name is a separate fact. |
| Immediate appearance | "Right away" means no manual Reload, not an instantaneous result or loaded host capability. In Phase A the row waits for the existing default-catalog read, whose acquisition can take 5 seconds plus up to 2 seconds of cleanup. Show in Installed waits with a reason, then selects the first artifact named by the result, including an agent reached through its companion file. |
| Show in Installed | Only Applied offers it, in both phases. Reset filters, select the first imported artifact's page and row, and focus details Close without requesting a read or operation. Disabled reasons are "Reading Installed...", "Project agents and skills could not be read", and "Not in Installed now". Presence never establishes Applied. |
| 25-row pages | Approved departure from 063. Keep the pager and range text, filter before paging, and use opaque identities. Reject unpaged scrolling because it removes the approved pager/page resets without virtualization; reject height-fitted pages because resize/zoom changes them; reject 50 rows because it offers no benefit for this need. Sources stays unpaged. |
| Retained refresh context | Approved departure from 063: keep filters, page, and opaque selection while the selected row survives a refreshed snapshot; otherwise apply the existing reset. This prevents import acknowledgment, idle, and window-focus refreshes from undoing Show in Installed. |
| Q4: remote scope and sharing | Approved public-GitHub-only decision via the user's mock approval: the added-source file is committed and shared with the project. No credentials or private-source support. |
| Direct configuration write | Add/remove saves only pack-source configuration directly, without Needs you permission. Trust consent remains at install/refresh. |
| Sources table and Add source | Use the pack master-detail pattern with Source/type, Location and ref, Status, and Scope; no filters or pager. Add source sits above the table and opens the modal form. Details use the 320 px pane or overlay below 1100 px, ending at facts. |
| Show packs in Available | Local filter jump only, enabled for a Read source with an uninstalled pack; reset Use case/page and focus Available or the View Dropdown at <=300 px. No acquisition or install. |
| Remove reasons | Added sources only, with confirmation. Installed-pack and pack-request reasons are advisory; the server still checks at the write and names blockers inside the confirmation. Built-ins show a read-only note and no Remove. |
| External repository link | None is drawn or delivered; locations remain text. This is not an implied future control. |
| "This project" | In Sources, this is the Scope of an added source saved with the project. In Phase B Installed, it is the Source of a project agent or skill; the same words do not assert import provenance or make those artifacts pack sources. Project details use this scope in both phases. |
| Installed-from-source honesty | The nine frozen installed records are Unlisted, so each built-in shows 0 installed and "9 installed packs record an unlisted source". Real counts come from recorded source matches, never same-name catalog packs; no Unlisted row is added to Sources. |
| Source limit | At most eight added sources, visibly stated in the form. |
| Built-in upstream | Read-only, "Managed by bundle upgrade"; editing the upgrade channel stays with 072. |
| Accepted layout | One layout: a folder containing `library/packs`; a bare packs folder is refused with "Choose the folder that contains library/packs." |
| Add/import wording | Keep the user's drawn label even though this tab adds no packs; the heading and explanation distinguish import from Available and point to Installed. |
| One design, two phases | Phase A can ship before Sources with three sub-tabs, read-only project rows, the revised list behavior, and no placeholder. One approval covers that state and the complete four-sub-tab Phase B. |
| Narrow Packs navigation | One row from 480 px; two columns at 301-479 px. At a Packs column <= 300 px (viewport <= 348 px), a labeled "View" Dropdown replaces the strip and the list panel scrolls as one column. The earlier "one tab per row" rule remains a comparison switch in the mock; it leaves no room for the list at 180x450. Settings section tabs stay at the 074 baseline. |
| Departures from 063/074 | Name and Installed wording, Type in Phase A Installed, project rows and combined counts, 25-row pages, retained refresh context, Source column/filter in Phase B; four Packs sub-tabs and Sources table/details with top Add source dialog; source lines in pack permissions and source-qualified rows; scripted pack requests in the mock; Reload on Sources; the rail's Needs you and New idea as working destinations; "Joined workspace"; narrow Dropdown text inset 12->4 px, right padding 34->26 px, chevron inset 10->4 px, and long values wrapping where 074 truncates; short-height whole-panel scrolling. Stacked Installed rows label "Type" and "Use cases" in Phase A and add "Source" in Phase B; Phase A no longer matches 074's unlabeled rows. |
| Round-4 departures from round 3 (history) | Sources only: grouped cards become one table with Scope; the bottom form becomes the top-triggered Add dialog; Remove moves into details with advisory reasons and in-dialog refusal; source facts and Show packs are added. Reading/refusals/recovery stay in Add; success is announced outside before post-read details open. Other product states and planned frames were unchanged in round 4. |
| Warned import | Keep `IMPORT WITH WARNINGS <n> ARTIFACTS`, bound to the exact reviewed import revision. |
| Focused adaptations | Default adaptations only; custom categories remain chat-only. |
| Host availability | Listed does not mean loaded. Retain the possible-new-session caveat; immediate host availability is unverified. |
| Permission response choices | Import permissions offer only Send permission and Decline. Pack permissions keep today's Defer and Save as idea; Save as idea is refused after the click while a pack request is unreconciled. |
| Queued input | A provider refusal after Request import appears as "not sent", not a guessed queue-based disabled reason. |
| Needs you and status reflow | Keep the narrow Needs you fix; at the narrowest width the import status icon may sit above its title. |
| Source retention | Keep typed import Source across local navigation and its permission round trip; clear it on ordinary main-rail departure while retaining request status. Settings re-entry opens Packs > Installed. |
| Explicit-Reload discovery | In Phase B, default and added catalogs are read on Reload and once after source add/remove. Before the first Reload, Available shows "?" and source rows from configuration say "Not read" without counts; Show packs is disabled, Add/Remove retain their normal availability, and Installed still lists the profile and readable project rows. This departs from 063's automatic default-catalog read, which Phase A retains. Local project reads and installed-state refreshes in either phase need no Reload and do not themselves acquire a catalog. Operation-specific safety checks still run. |
| New idea exclusion | While an import is unreconciled, the draft stays editable and Submit/Save are disabled with "An artifact import is in progress or needs owner reconciliation. Your idea draft stays here." A prepared or sent unreconciled capture disables Request import and pack sends with "An idea capture needs owner reconciliation before an import can be requested." An unsent typed draft never blocks. |
| Deferred capabilities | No versions/update checks, source priority, author identity, import provenance record, or documentation display in this feature. Sources adds no per-source re-read, edit, rename, enable, reorder, copy, commit display, timestamp, or external repository link. FR-077 reserves documentation placement; FR-078 permits only labeled mock annotations and documentation frames. |

Settled mock behaviors within FR-090:

- Without a selection, a refresh resets filters and page, as in 063.
- If a refresh moves the selected row to another page, the page follows the row.

Round-1 validation/phase wording remains in force where still applicable under the approved direction. Its "Local artifacts" footer and separate section are superseded. Decorative status borders cannot be the only status signal; inherited small-target exceptions require the same demonstrated equivalent paths rather than a new blanket waiver.

Known residual: under forced colors, the mock's native select truncates long Dropdown values at 180 px (most of the 37 values), matching 074's native-select behavior. This was disclosed with the approved mock; the mock does not verify the real Dropdown's wrapping.

## Revision Log

- 2026-09-29 02:14 UTC - defined; design exploring; canonical mock and explicit user visual approval pending
- 2026-09-29 02:40 UTC - staged revision before publication: permission items per agent or skill bound to the reviewed plan; agent companion folders accepted as local results (Architect decision)
- 2026-09-29T05:51:28Z - canonical mock authored by FluentUI within the Coder's declared capability envelope (SHA256 711e8879d9c8c0ee197dbed5a6c9c7e4dd62573dac2b0dfee51f67a7dd5ec57e); coordinator-observed independent Tester verification failed only VSC-002/VSC-003 (17 px Needs-you overflow at effective 180x450 in both themes). A different reviser, Coder, fixed narrow reflow and regenerated three screenshots; independent re-verification passed A-E (700 cells, 0 px overflow, 0 network requests, 0 console errors, and 11 sampled screenshots byte-identical to live renders after 18 earlier samples matched at SSIM >= 0.992). Settled to proposed: Classic Settings Local Artifacts at SHA256 256baf7d4d229bc71a5601ac4423d33e88b17560602694c427b747792c175be6; explicit user visual approval pending.
- 2026-09-29T11:53:48Z - user rejected the proposed Classic Settings Local Artifacts design (SHA256 256baf7d4d229bc71a5601ac4423d33e88b17560602694c427b747792c175be6): pack sources/upstream channels missing; Local artifacts section misleading; import and sources belong under Packs; add a local/source column or filter
- 2026-09-29T12:19:09Z - re-defined for the merged Packs design (Installed, Available, Add/import, Sources) in two phases; design exploring; round-2 mock and explicit user visual approval pending
- 2026-09-29T23:51:22Z - round-2 canonical mock authored by FluentUI within the Coder's declared envelope (SHA256 2fad527a90e7d4a9fa8d621466bbcd2f283aa8038118802968f9949dc2839027) and revised through independent verification: Coder fixed New idea exclusion and View truncation (838ca9e470f08743d335b0ca614e92a3914a6d8debccbff828fcbf8b41845945); FluentUI fixed Phase A stacked rows, stale Warned screenshots, header accuracy, drawer code wrap, and short-height scrolling (d9ecf3f30ccfe13e3b54194b0b654e0dadadc2a3e3dceeea362a5d727ab9b21c), then header-only notes; final independent check passed. Settled to proposed: Classic Settings Packs Hub at SHA256 e5e41c823d904fa210c241fccc66875f27ac248cd17b2c13450e5a0879fd9903; explicit user visual approval pending.
- 2026-09-30T14:05:06Z - user review of proposed round-2 Classic Settings Packs Hub (SHA256 e5e41c823d904fa210c241fccc66875f27ac248cd17b2c13450e5a0879fd9903): documentation for packs and skills not shown; asked 073 to set placement foundations; returned to exploring
- 2026-09-30T14:27:37Z - re-defined with placement foundations for documentation and project-artifact rows (FR-075-078); design exploring; round-3 mock and explicit user visual approval pending
- 2026-09-30T19:19:54Z - round-3 planned-placement frames authored by FluentUI (SHA256 e16f3242bb107ef03fd01f027bda6b0d2c4bc2ade48f40ce6f72267dac5a9024); independent verification failed the header provenance note; Coder revised the header, breakpoint and scenario traps, P3a order, and measurements (95eace569e129af7ae1178079a9f16b9160747ff9d36102c057863f40ded8bdf, then ecdf0d78d1462c64534c0327af41515b3eb1f40e6169679019fdb613487e8a94); independent re-check passed with one accepted 180x450 P3a framing advisory. Settled to proposed: Classic Settings Packs Hub with placement foundations at SHA256 ecdf0d78d1462c64534c0327af41515b3eb1f40e6169679019fdb613487e8a94; explicit user visual approval pending.
- 2026-10-01T00:28:02Z - user requested on the round-3 proposal (ecdf0d78d1462c64534c0327af41515b3eb1f40e6169679019fdb613487e8a94): "under the tab sources, I don't think that's very convernient . Usually we have thethe action on top." and "existing the sources we can follow equivalent apprach as the packages, creating a table wiht the different sources and seeing the details on the right , like how many packages, remove and other actions."; round-4 Sources table with details and Add source on top authored by FluentUI within the Coder's declared Sources envelope; independent verification passed all checks with four accepted advisories (Add dialog drag-to-backdrop dismissal carried to plan, hidden-scrollbar PNG captures, older strip labels on kept PNGs, one header wording nit). Settled to proposed: Classic Settings Packs Hub with Sources table at SHA256 1feedf06710014fa92d4ce7e65d8fb3b56046757d2116160dbeeec057fcd838d; explicit user visual approval pending.
- 2026-10-01T01:01:17Z - user review of proposed round 4 (SHA256 1feedf06710014fa92d4ce7e65d8fb3b56046757d2116160dbeeec057fcd838d): imports must show up in Installed right away; documentation placement not findable; pack page size too small; returned to exploring
- 2026-10-01T01:46:25Z - re-defined for read-only project rows in Installed with Show in Installed, 25-row pages, retained list context, and visible Planned (080) annotations (FR-084-090, US9, SC-015-017); design exploring; round-5 mock and explicit user visual approval pending
- 2026-10-01T05:13:43Z - round-5 mock authored by FluentUI within the Coder's declared envelope: project agent and skill rows in Installed, Show in Installed, 25-row pages, retained list context, and default-on Planned (080) documentation annotations; independent verification passed all 9 checks against round 4 (1feedf06710014fa92d4ce7e65d8fb3b56046757d2116160dbeeec057fcd838d) with three accepted header advisories; 221 superseded round-4 captures kept under design/screenshots/round-4-superseded/. Settled to proposed: Classic Settings Packs Hub with project rows at SHA256 58cffc7a8be6699726c87508e8524a866e55435f53293a712b664ad49840c4f9; explicit user visual approval pending.
- 2026-10-01T10:05:42Z - approved Classic Settings Packs Hub with project rows by the user's explicit chat reply "I approve the mockup", bound to SHA256 58cffc7a8be6699726c87508e8524a866e55435f53293a712b664ad49840c4f9; the user also accepted delegating documentation display to 080 ("I accept the recomendation to delegate 080 for the documentation.")
