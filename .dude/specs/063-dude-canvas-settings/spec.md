---
title: Dude Canvas Settings
slug: dude-canvas-settings
work_type: design
design_status: approved
approved_direction: "Original right-panel compact Installed/Available browser"
preview_path: .dude/specs/063-dude-canvas-settings/design/pack-management.html
---

# Design Proposal: Dude Canvas Settings

## Outcome

Manage Dude packs from the existing Canvas instead of reconstructing pack commands in chat. A user switches between Installed and Available, filters that complete context by use case, pages through a compact result table, and inspects one selected pack before requesting install, removal, or refresh through the existing confirmation flow.

The accepted scope is `pack-management-only`, including the user's discovery refinement. The user has explicitly approved the original right-panel mock. This definition records that approval and derives tasks for the same scope; implementation, Work, and pack operations remain unauthorized. Rendering and verification evidence remains revision-specific.

## Scope And Surfaces

In scope:

- A workspace-level Settings destination in the existing navigation, separate from selected-feature actions.
- Current installed/catalog pack information, including descriptions, use cases, installed membership, and recorded source/file details where available.
- Use-case filtering before pagination across the complete catalog, with local/configured-remote source, loading, and failure coverage.
- Single-pack install, remove, and refresh requests to the same active coordinator, using existing impact previews and explicit confirmations.
- Honest loading, empty, unavailable, permission, delivery, and result states.

Excluded are free-text pack search, other configuration, model mappings, host appearance controls, artifact import, bundle upgrades, pack authoring or direct artifact editing, custom source/ref controls, forced overwrites, bulk operations, arbitrary commands, and automatic prerequisite installation. The global work finder stays separate. Add no backend search service, catalog cache, persistent filter/page preferences, separate application, engine, tracker, durable request store, or compatibility migration.

The four separate Settings intentions remain capture-only drafts: `.dude/ideas/073-dude-canvas-artifact-import.md`, `.dude/ideas/070-dude-canvas-skill-customization.md`, `.dude/ideas/071-dude-canvas-pack-authoring.md`, and `.dude/ideas/072-dude-canvas-bundle-upgrade.md`. They establish product continuity, not requirements or execution dependencies for 063. Add no placeholder controls or packages for them. Preserve the broader 052 vision, the current approved 062 workspace adaptation, and the working 057 interactions without changing their scope or history.

## User Scenarios & Testing

### US1 - Inspect packs in the current workspace (P1)

As a Canvas user, I want to see which packs are installed and what other packs provide before deciding on a change.

**Independent test:** Use both real catalog source types, with more than five records in each pack context, an exact-tag match beyond page 1, an installed-only record, and retained work selection/input. Exercise normal, empty, and unavailable catalog coverage at wide and narrow widths.

1. Opening Settings defaults to Installed. Installed/Available tabs, the labeled Use case filter and Clear control, counts, and paging are visible without scrolling through packs. Exactly one context's results are presented.
2. Both contexts show at most five compact rows per page. Exact metadata matching runs against the complete context before pagination; a match on another page remains discoverable.
3. Clicking a row or pressing Enter opens one selected-pack detail beside the results when wide or in a deliberate overlay when narrow. Close/Escape returns focus to that row. Context changes clear selection; filters/pages that exclude it close its detail and actions.
4. Catalog failure keeps installed names, recorded files, and recorded source inspectable in Installed. Missing metadata remains unavailable, and Available is unknown/nonactionable rather than empty. Unknown-tag installed entries appear in All but are not asserted to match a specific tag.
5. Counts and reset behavior follow FR-029/030. Zero matches keeps the toolbar visible and Clear available; source/reload replacement clears selection without changing the active context.
6. Returning to work preserves the existing feature selection and unsent input. Selecting a pack neither selects a feature nor requests an operation.

### US2 - Request installation with informed consent (P1)

As a user, I want to request an available pack from Settings and understand its effects before it is installed.

**Independent test:** Start with one eligible uninstalled catalog pack and an idle joined coordinator; no other story needs to have run.

1. Activating Install requests that exact pack once. The coordinator previews its source, prospective artifacts, and required tools through the existing permission flow.
2. Declining leaves the installed membership and artifacts unchanged.
3. After exact confirmation, a successful owner result plus a fresh authoritative read changes the display to installed. Delivery alone never does.

### US3 - Remove only the installed pack's recorded artifacts (P1)

As a user, I want to see what removal will delete and keep unrelated workspace content safe.

**Independent test:** Begin with a preinstalled pack, an unrelated file, and an unrecorded namespaced residue file; repeat without a readable catalog.

1. Remove previews only the pack's exact recorded safe files and requests explicit confirmation.
2. Confirmed removal makes the pack absent from installed membership while leaving unrelated and unrecorded files untouched.
3. Stale membership, unsafe recorded paths, or declined confirmation prevent application and explain the reason.

### US4 - Refresh an installed pack without hiding overwrite risk (P2)

As a user, I want to preview changes from the current pack source and deliberately refresh its generated output.

**Independent test:** Start with an installed pack whose source adds, replaces, and removes artifacts, including an edited generated destination.

1. Refresh shows the replacement, addition, and removal sets and warns that installed edits may be overwritten.
2. Previewing changes performs no pack write and supplies no consent. Detected drift in the reviewed source, expected state, or targets requires a new preview and confirmation.
3. A successful confirmed refresh displays the owner's result and reread state. A caught failure reports restoration or uncertainty as actually established, without claiming crash-proof recovery.

## Functional Requirements

### Navigation and information

- **FR-001:** Canvas must keep its navigation rail vertical on the left at every viewport and zoom, with Settings at the visible rail bottom while pack content scrolls. Expanded navigation shows the Settings label; compact navigation retains its accessible name. Narrowing may collapse labels or open a left-side expansion overlay, but must never turn the rail into a horizontal top bar. The top command bar remains separate.
- **FR-002:** Entering or leaving Settings must retain the current work selection, task inspection/filter, unsent answers and idea draft, and retained Review work.
- **FR-003:** Settings must identify its scope as the workspace regardless of the selected feature; opening it must not change Canvas's initial destination.
- **FR-004:** Settings must obtain installed and catalog membership from current pack authorities rather than a fixed or sample pack list.
- **FR-005:** Settings must make each readable catalog pack's name, full description, and declared use cases inspectable, labeling missing metadata without inventing values.
- **FR-006:** Settings must keep every authoritatively installed pack inspectable with its exact recorded file list and source identity, even when it is absent from the catalog.
- **FR-007:** Settings must distinguish loading, confirmed empty, current, stale, and unavailable coverage for installed and catalog reads independently.
- **FR-008:** Settings must withhold a change request when the authority needed to establish that operation's eligibility is unavailable or stale.

### Requests and permission

- **FR-009:** Settings must offer Install only for an eligible uninstalled catalog pack and Remove or Refresh only for an authoritatively installed pack.
- **FR-010:** Reading or reloading pack information must never submit a pack-change request.
- **FR-011:** Each explicit change action must request only the selected operation and exact pack in the current workspace's joined coordinator session.
- **FR-012:** Request admission must refuse a busy session, a live waiting request, queued user input, an unreconciled send receipt, or changed workspace/session identity before sending.
- **FR-013:** Canvas must never automatically enqueue, resend, retry, or replay a pack-change request, including after reconnect or restart.
- **FR-014:** Before seeking consent, the coordinator must show the operation's actual impact: install source/artifacts/required tools, removal's recorded safe files, or refresh source and replacement/addition/removal sets.
- **FR-015:** A refresh impact preview must warn that generated installed edits can be overwritten and identify project-local customization as the existing way to retain custom changes.
- **FR-016:** The coordinator must obtain the existing operation-specific literal confirmation before application; the initial Settings click, receipt, or preview is not consent.
- **FR-017:** If the reviewed source, expected installed state, or affected targets no longer match at confirmation or the owner's final checks, the coordinator must stop for a fresh preview and confirmation.
- **FR-018:** Pack writes must remain with the coordinator's existing pack engine and permission paths; Canvas must not edit membership or projected artifacts itself.
- **FR-019:** Removal must remain bounded to the installed authority's exact safe recorded files; namespaced residue cannot create deletion authority.

### Results and safety

- **FR-020:** Canvas must distinguish request admission, delivery, waiting for consent, and waiting for an owner result from an applied operation.
- **FR-021:** Canvas may show Applied only when the exact request has an owner-confirmed successful result and a fresh authoritative installed-state read agrees with that result.
- **FR-022:** Canvas must display declined, failed, unavailable, stale, and uncertain outcomes without converting them to success or silently repeating the operation.
- **FR-023:** Failure reporting must preserve the engine's distinction between no change, confirmed restoration after a caught failure, and uncertain state; it must not promise recovery from process or machine failure.
- **FR-024:** Pack metadata and file/source descriptions must remain inert content, never executable instructions or authority for a different operation.
- **FR-025:** All Settings navigation, detail disclosure, request, and confirmation controls must be keyboard-operable with visible focus, accessible names, announced outcomes, and the workspace's existing accessibility standard.

### Catalog discovery

- **FR-026:** The active context must expose a labeled Use case selector and Clear control above its results. All use cases is the default; options are exact declared tags from the complete current catalog. Matching is case-sensitive membership, not substring matching. Known untagged records match All only. Installed records with unavailable tags appear in All; a specific-tag view excludes them with an explicit incomplete-tag-coverage notice.
- **FR-027:** Settings must present mutually exclusive Installed and Available contexts, with Installed the default and both tabs visible at entry. There is no combined All context or stacked pair of lists. Each context is built from its complete authoritative record set, filtered before paging; installed membership remains independent of catalog coverage.
- **FR-028:** Both contexts must show at most five compact rows per page in their recorded/source order, with a pinned pager, current range/page, and unavailable boundary actions. Only the results body scrolls within the browser area; paging changes no authority and keeps the selected tag.
- **FR-029:** Initial entry is Installed/All use cases/page 1 with no selection. Context changes reset All/page 1 and clear selection. Replacement reads and explicit reload retain the active context but reset All/page 1 and clear selection. Tag changes or Clear reset page 1; page changes retain the tag. A filter/page change retains selection only if that exact pack is still on the visible page. These view values are transient and never change work selection, pending requests, or installed data.
- **FR-030:** Tab counts must show the full Installed and eligible Available totals, independently of filtering; Available excludes installed membership and must never use the full catalog count. The active view must distinguish matching count, visible range, and page count. Unavailable counts are unknown, not zero. Empty results show no page 1 of 0; the visible Clear control resets a zero-match filter. A partial installed-tag match count must not imply complete tag coverage.
- **FR-031:** Settings must expose current catalog origin separately from a selected installed pack's recorded source, without source/ref configuration. When catalog coverage is loading, failed, or stale, tag filtering is unavailable, Available is unknown/nonactionable, and Installed remains inspectable from its readable authority. Missing descriptions, tags, tools, or impacts remain unavailable/unacquired rather than borrowed from another source.
- **FR-032:** Exactly one visible pack may own actionable details. Selection exposes full description, source/files/tools, and the appropriate actions: Refresh pack/Remove in Installed, Install in Available. A wide side pane or narrow overlay must keep detail out of the results flow. Closing it clears selection and returns focus to its row; invalidating its selection closes it without retargeting its actions.
- **FR-033:** The concise header, context tabs, Use case/Clear toolbar, counts, and pager must be discoverable at entry and remain outside the results scroller, including empty/error states. Full descriptions and provenance belong in selected detail or compact mock-only disclosures, not a permanent explanatory sidebar. Table fields must use actual pack data, with no invented progress, version, or update indicators.

## Edge Cases

| Condition | Required behavior |
| --- | --- |
| No installed packs or no available catalog entries | Show the active context's confirmed empty state; retain both context tabs and the toolbar. |
| A tag has no matches in the active context | Show zero matches and keep Clear visible; do not infer that the other context or the catalog is empty. |
| Some installed records have unknown catalog tags | All includes those records. A tag-specific result names the coverage gap instead of treating unknown tags as confirmed nonmatches. |
| Context, filter, page, or source changes while detail is selected | Apply FR-029 before rendering; clear any excluded selection and its actions rather than showing detail for a hidden or unrelated row. |
| Catalog fetch fails or a pack is missing from it | Explain catalog coverage; do not erase known installed membership. Removal still uses the installed authority. |
| Profile is invalid, a recorded path is unsafe, or destinations conflict | Refuse affected changes; do not repair records, force writes, or clean residue from Settings. |
| Pack source is unreachable or required tools are unavailable | Show the coordinator's actionable reason; do not install tools or substitute another source automatically. |
| Double activation, another tab, a new waiter, or queued chat input races a request | Admit at most one request under the current session gates; refuse the rest without replay. |
| Preview, installed state, source, or target changes | Invalidate the affected action or consent; retain useful read-only context and request fresh confirmation. |
| Send fails after possible delivery, the provider ends, or the tab reloads | Keep the result explicitly uncertain/unavailable; authoritative rereading may show current membership but cannot prove that request succeeded. |
| Refresh leaves the same membership or projected bytes | Membership alone does not prove refresh; require the actual owner result. Use the existing refresh behavior rather than substituting remove/install. |
| Navigation during a pending permission or Review | Keep the existing request and Review bindings; pack selection never becomes feature selection or consent. |

## Key Entities

| Entity | Meaning and authority |
| --- | --- |
| Catalog pack | Exact pack name and available descriptive metadata from the existing catalog. |
| Installed pack | Opted-in membership with its recorded safe artifacts and source; catalog presence and leftover files do not supply membership. |
| Pack-change request | One explicit workspace/session-bound operation for one pack; transient delivery is separate from permission and completion. |
| Permission and result | The existing owner's current impact/confirmation exchange, followed by its operation result and authoritative state reread. |

## Success Criteria

- **SC-001:** In each US1 fixture, every returned installed/catalog entry is reachable with correct membership and metadata coverage; no fixture produces a fabricated pack, count, source, or empty state.
- **SC-002:** Install, Remove, and Refresh each complete their own confirmed happy path from a prebuilt fixture, with exactly one request and no Applied claim before both owner success and state reread.
- **SC-003:** Declined or invalid confirmation produces zero pack/profile changes. Each pre-send refusal in FR-012 produces zero session sends; duplicate and uncertain requests produce zero automatic replays.
- **SC-004:** Drift cases require new confirmation, and caught-failure cases report the observed unchanged/restored/uncertain result. Removal preserves every unrecorded fixture file.
- **SC-005:** The existing discovery, Now/Tasks, Needs You, New idea, and Review journeys retain selection, drafts, request identity, and saved/working review behavior across Settings entry and return.
- **SC-006:** For both readable source types and each context, page traversal reaches every member exactly once in recorded/source order, with no page above five rows. Every selected tag yields the same known matching set regardless of the previously viewed page, with exact totals/ranges, explicit unknown-tag coverage, and the required resets.
- **SC-007:** Loading/failure cases expose no fabricated empty count or remote metadata, preserve independently readable installed records, and recover through a fresh authoritative read. The frozen proposal demonstrates these states and recovery locally without claiming a live read, send, or applied operation.
- **SC-008:** On entry and after each context/filter/page transition, exactly one result set and at most one correctly bound detail are visible. Context changes and excluded selections leave no old pack actions. Pointer/Enter opening and Escape/Close return work at wide and narrow layouts without hiding the filter or converting the page into stacked detail content.

## Visual Intent

### Should Feel

- Like the workspace's own settings page, with pack identity and consequences easy to scan.
- Like Dude Overview's compact browser: context and obvious controls above one bounded result table, with focused detail when selected.

### Should Never Feel

- Like another app, an arbitrary command console, or a mock that pretends a pack operation succeeded.
- Like a selected-feature action or a promise of unimplemented future settings.
- Like a long prose/card page with the filter buried after another list.

## Brand Fit

Retain the approved workspace's visual language, host light/dark appearance, typography, spacing, and interaction states. Introduce no theme or framework switch. Keep WCAG 2.2 AA contrast, focus, reflow, and target sizing; compact navigation must not hide control names from assistive technology.

## Proposed Direction

Approved primary mock: `.dude/specs/063-dude-canvas-settings/design/pack-management.html`, SHA-256 `54d4fb8eff0fe9a85a2291b12f5dfa83651418b161f6cb0b76bf280db0b7c6a0`. Direct chat approval: "I approve the original right-panel mock design". The selected direction is the original right-panel compact Installed/Available browser.

The user rejected the preceding combined-page mock, preserved as `design/pack-management-v4.html`; all earlier variants and evidence remain unchanged. Checks on that rejected revision do not transfer to the approved primary.

Retained, unselected [LEFT-PANEL COMPARISON](design/pack-management-left-panel.html): full-height details sit between the rail and results beneath the shared command bar on desktop, with a left-anchored overlay when narrow. Available opens with `docsy` selected to match the user's rough example, for preview only; FR-029 is unchanged. It remains a supporting comparison, not the approved direction.

The outside chat answer was: "I in any case reject the mockup, is a single page with the installed and avaiable in same context, you can do better. take inspiraiton for example Dude's main page. the". Follow-ups require obvious filtering and reject a long single page. The final "the" is unfinished; no continuation is inferred. Acceptance of this redesign feedback was not acceptance of the mock or application of a revision.

Use the real Overview's compact header/controls/table rhythm, with prominent Installed/Available tabs and one active result set. Installed is the default; no combined All context exists. Directly below the tabs, a labeled Use case selector and Clear control filter the full active context before five-row paging. Counts and the pinned pager are visible without traversing pack rows. This intentionally replaces the earlier derived design that kept Installed always visible, unfiltered, and unpaged.

Selecting one row opens its complete details and actions in a right side pane on wide layouts or a right-side overlay when narrow. Close/Escape returns to its row. Context changes clear selection; filter/page changes cannot leave actions for an excluded row. Show Refresh pack/Remove for an installed selection and Install for an eligible available selection. Full descriptions, paths, tools, and source provenance leave the results flow. Remove the permanent explanatory sidebar rather than adding another control to the rejected long page.

Keep the vertical-left rail at every width and zoom, with Settings at the visible shell bottom and the command bar separate. The global work finder remains a separate existing destination; add no free-text pack search. Preserve the existing data-reload affordance, clearly distinguished from Refresh pack.

The user's correction was: "the bar itelf, why is it horizontally when it'supposed to be vertically on the left?" Their actual Canvas reference marked Correct establishes the vertical-left direction. This explicitly replaces 063's inherited 062 narrow horizontal arrangement; it does not revise the 052/062 artifacts, approvals, or history. That earlier rail correction was feedback, separate from the direct approval recorded above.

Compare with the user's actual Overview reference at `design/references/dude-overview-user-reference.png`, the broader `.dude/specs/052-dude-canvas-ui/design/fluent-desktop-workspace.html` baseline, and the approved `.dude/specs/062-dude-canvas-workspace-integration/design/workspace-integration.html` adaptation. The screenshot is context only, not a live mock or rasterized UI. The bounded Fluent UI consultation informs this composition; definition ownership and approval gates are unchanged.

Unchanged Overview, Now/Tasks, Needs You/Review entry, and New idea remain real reference destinations in the prototype rather than simulated replacements. Mock-only explanation and scenario controls stay compact and collapsible outside product chrome. They must not consume the space needed by the table, toolbar, or rail.

The real local and pinned-remote catalog captures and installed-profile snapshot remain unchanged. Production shows its configured resolved source; only the mock has a scenario selector. Reload snapshot retains the active context, restores captured data (remote after a loading/failure illustration), resets All/page 1, clears selection, and labels recovery as local. Remote fields absent from its capture stay unacquired. Installed authority and unknown Available coverage remain separate even though only one context is visible.

Counts and metadata derive from the active context and its real sources. The prototype switches contexts, filters/pages both, selects detail, restores snapshots, and opens the existing unsent operation layouts locally. It never contacts an agent, accepts consent, changes membership, or claims an owner result. Refresh impacts remain unacquired; Review uses the existing native Canvas surface.

## Visual Success Criteria

- **VSC-001:** At every viewport, one activation of the visible left-rail footer cog opens Settings; expanded and narrow navigation expose the same destination without retargeting work.
- **VSC-002:** At 360, 768, and 1440 CSS-pixel widths, in both host appearances and at 200% zoom, pack identities, full disclosed paths, consequences, and controls remain readable without page-wide horizontal scrolling.
- **VSC-003:** Keyboard/focus, accessible names, outcome announcements, and measured contrast meet FR-025 and Brand Fit on the rendered proposal and implementation.
- **VSC-004:** Every displayed field has real source provenance. Frozen preview data is labeled; preview behavior never fabricates submission, consent, mutation, or acknowledgment.
- **VSC-005:** Rendered comparisons show the retained 052/062 regions and the Settings addition. Preserve explored variants and obtain explicit approval of the exact current preview before UI source changes or implementation-task derivation.
- **VSC-006:** Geometry must show a left-edge rail beside the content, with destinations arranged vertically and a separate command bar above. Settings must stay inside the visible shell at the rail bottom, with its position unchanged when the long pack list or disclosed paths scroll. Check compact, expanded, and narrow-overlay states at all tested widths and zooms, including the 180/384/720 CSS-pixel reflow proxies. A horizontal navigation row fails even if it produces no overflow.
- **VSC-007:** Every Tab and Shift+Tab transition in an open navigation, detail, or operation modal stays in the topmost modal without a body interlude. Escape closes that layer and restores the appropriate trigger/row; wide nonmodal detail does not trap Tab.
- **VSC-008:** At 360/768/1440 and the 180x450 reflow proxy in both themes, the context tabs, Use case/Clear controls, active counts, and pager remain visible at entry and while results scroll. Essential targets have at least a 24px visible hit area, and a populated result body can expose a complete row trigger. Compact toolbars may wrap or use named icon buttons, but cannot starve results or navigation.
- **VSC-009:** At most one compact result table/list is visible. Full detail uses the side pane/overlay and scrolls independently without pushing filters or paging out of view. Empty/warning states retain the same visible toolbar. Mock explanation is outside product chrome and collapsible; there is no permanent instructional essay/sidebar or stacked Installed/Available page.

## Assumptions And Guardrails

The current pack authorities and the existing joined Canvas session remain the delivery basis. Settings adds no persistent preference or separate workflow authority. Catalog availability may depend on access to the already configured pack source; unavailable access is a supported state, not permission to invent data.

Apply `.dude/memory/guardrails.md`, particularly Canvas continuity and mandatory mock approval, no dead affordances, installed-map/file ownership, generated-pack overwrite warnings, and the caught-failure recovery boundary. Keep optional packs out of core runtime dependencies. No new guardrail candidates or durable rules are introduced by this definition.

## Revision Log

- 2026-09-21T16:36:28Z - exploring: Recorded the user's pack-management-only scope and selected the canonical primary preview path. No preview has been created, rendered, or approved; implementation-task derivation waits for visual approval.
- 2026-09-21T17:01:17Z - exploring: Authored the first canonical mock at `.dude/specs/063-dude-canvas-settings/design/pack-management.html`, using frozen profile/catalog records and the 052/062 composition and tokens. Local request/state layouts send nothing and confer no consent. Rendering and screenshot inspection are pending; design remains exploring with no approved direction or implementation tasks.
- 2026-09-21T17:33:33Z - exploring: Applied the user's vertical-left rail correction to the current proposal and aligned FR-001 and geometry acceptance without changing 052/062 history. The coordinator-preserved `design/pack-management-v1.html` has reported SHA-256 `B8CA6EC6E8110F22C81FEA779E0B4651AA9EBD0CD0028816761BDF38A7B064B4`, 57314 bytes; Tester reported 179 passed, 4 failed, 0 skipped on that revision. The scoped correction addresses the narrow horizontal layout and the recorded modal Tab boundary gaps. Fresh independent rendering remains pending; design stays exploring with no approval or implementation-task derivation.
- 2026-09-21T18:02:02Z - exploring: Recorded coordinator-reported rendering in Edge 154.0.4258.24 of the unchanged primary, SHA-256 `2F90712B6D57567F37C8F657D1A0D719104CDD4E2BCE84AA1205A0466C02672D`, 59050 bytes. The coordinator directly inspected source-aligned 360px light and 1440px expanded-rail PNGs under `design/screenshots/revision-2`, observing vertical-left navigation with bottom Settings. V1 remains preserved. This records visual evidence, not user approval, a full-verification verdict, or implementation acceptance.
- 2026-09-21T18:06:32Z - exploring: Addressed the remaining short-viewport allocation defect reported on preserved v2: 317 checks, 315 passed, 2 failed, 0 skipped. At the 180x450 reflow proxy, working scroll navigation exposed only 12.5px of each 32px target. Reduced only the supplementary preview-explanation height cap from 25dvh to 20dvh, retaining its existing scroll access to all safety/provenance text. This releases 22.5px at that viewport without reducing targets or changing rail orientation, Settings anchoring, typography, modal behavior, or criteria. Fresh independent rendering must establish the resulting visible hit areas; no passing or approval claim is made.
- 2026-09-21T23:40:16Z - exploring: Staged the accepted discovery refinement with exact use-case filtering across the complete catalog before five-row available pagination, defined reset/count/empty behavior, and independent local/configured-remote coverage. The proposal uses real coordinator-captured catalogs and clearly labeled local loading/failure illustrations. Preserved v3 and earlier evidence, retained operation/consent rules, and kept task derivation deferred. This stage supplies no new rendering, visual approval, or implementation acceptance.
- 2026-09-22T01:54:24Z - exploring: Recorded the user's outside-chat rejection of the combined long Installed/Available mock, preserved as `design/pack-management-v4.html` at SHA-256 `76cd1d783bc07a4cfc65394834877b3f58ec8994a172bb3707131a87fdf81975`. The unfinished trailing "the" remains uninterpreted. Staged an Overview-inspired single-context table with visible Installed/Available tabs, obvious Use case/Clear filtering, five-row paging in both contexts, and one side-pane/overlay detail. This revises derived presentation, preserves scope and operation safety, and records neither user approval nor verification of the successor.
- 2026-09-22T10:38:15Z - exploring: Authored the user-requested supporting left-panel comparison at `design/pack-management-left-panel.html`. Its initially open pack is preview-only. The right-panel primary bytes/path and design state remain unchanged; tentative praise is not approval. Fresh rendering and interaction verification of this variant remain pending.
- 2026-09-22T10:42:57Z - exploring: Applied the user's rough-image clarification to the same comparison: Available now opens with the real `docsy` record selected instead of `authoring`. The full-height rail/detail/browser desktop order below the shared command bar is retained; rough cutout gaps are not requirements. This changes preview initialization, not FR-029, the primary, approval, or tasks. Verification remains pending.
- 2026-09-22T11:00:00Z - proposed: The user's current explicit choice settles the original right-panel compact Installed/Available browser at `.dude/specs/063-dude-canvas-settings/design/pack-management.html`. The left comparison and earlier variants remain preserved and unselected. This settle event does not backdate approval to earlier tentative praise or comparison feedback.
- 2026-09-22T11:00:00Z - approved: Recorded the new direct chat statement, "I approve the original right-panel mock design", for `.dude/specs/063-dude-canvas-settings/design/pack-management.html` at SHA-256 `54d4fb8eff0fe9a85a2291b12f5dfa83651418b161f6cb0b76bf280db0b7c6a0`. Approval permits post-approval task derivation only; no implementation, Work, or pack changes are authorized. The consumed comparison-feedback receipt is not reused, and no approval receipt is created.
