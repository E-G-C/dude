---
title: Dude Development Base Release
slug: dude-development-base-release
work_type: design
design_status: approved
approved_direction: Development Base Release About
preview_path: .dude/specs/075-dude-development-base-release/design/about.html
---

# Dude Development Base Release

Help users identify the official release underlying a development installation without mistaking it for a release install. Add known base-release information to the existing Dude version value in Settings > About. Record that information during development maintenance, never by checking for releases while About is open.

The user approved Development Base Release About through the exact direct-chat reply `approve the 075 design`. The Revision Log binds that approval to the unchanged viewed mock and reviewed specification. The derived implementation units have no production acceptance or inherited completion evidence. Preserve feature 074's approved artifacts and approval.

## Scope

Cover the two existing development paths: this source repository's development build and a confirmed `main` core refresh through `@dude upgrade`. About consumes their recorded provenance. A base release is the highest stable official version evidenced as included in the development source when its provenance was recorded; it is not the latest release currently available elsewhere or proof of installed-file integrity.

Keep release installs, other recorded refs, the recorded channel/ref row, Settings navigation, and the rest of Canvas unchanged. Exclude update checks, upgrade UI, automatic refreshes, build dates or revision displays, new About rows or controls, consumer-project history inspection, and edits to 074's definition or mock.

## Definition Decisions

These are definition-owner decisions under explicit Ship, based on accepted intent and existing behavior. They are not new user answers or user-supplied assumptions; the ledger's answer slots remain empty.

- **Q1: cover both paths.** The reported symptom occurs in this source repository, and the user explicitly asks about users' installations and the version Dude refreshed from. The existing development build and `main` upgrade are the two current producers of that installation. Covering only one would leave the other reported case unexplained. Release installs already record their tag and need no new display behavior.
- **Q2: retain `Development (main)` alone when the base is unknown.** The request is to add reliable release information. The current development label remains true without it, and the existing About behavior already distinguishes an unavailable installation from a known development ref. An additional unknown-base warning would add a new state without improving that distinction. The known-base suffix follows the approved direction below.

## User Scenarios

### US1 - Identify a development installation's known base (P1)

Independent test: open About with controlled installation records; no build or upgrade is needed.

1. Given a development installation with recorded base `v1.3.0`, when About opens, the Dude version value is `Development (main), based on v1.3.0`.
2. Given that same installation, the recorded channel/ref remains its independently recorded value, rather than becoming the base release.
3. Given a newer official release published after the installation was recorded, opening About still shows the recorded base and performs no update check.

### US2 - Carry provenance through development maintenance (P1)

Independent test: exercise each existing maintenance path against prepared bundle sources, without opening Canvas.

1. Given a source development build with evidence of included stable releases, completing the build records the highest evidenced stable version as its base.
2. Given a selected `main` bundle with usable base-release provenance, previewing its core refresh shows the provenance change without changing the installation. Confirming and applying that refresh records the selected bundle's base.
3. Given a consumer project with unrelated versions of its own, refreshing Dude uses only the selected Dude bundle's provenance.
4. Given a previously known base and a later applied development update without usable provenance, the previous base is no longer presented as belonging to the new installation.
5. Given a completed core refresh, the existing rollback operation restores its prior provenance together with its prior installation, including a previously absent base record.

### US3 - Keep existing About behavior when no supplement applies (P2)

Independent test: supply missing, unusable, release, and other-ref records to About.

1. Given a usable `main` installation but no usable base, About shows exactly `Development (main)`, with no unknown-base warning.
2. Given a release installation recorded as `v1.3.0` on the stable channel, About still shows `v1.3.0` and `Stable releases (latest)`, without a base suffix.
3. Given another recorded ref or an unavailable installation, About retains 074's respective recorded-ref or unavailable behavior.
4. Given an unusable optional base record, usable installation refs, author credit, and the repository link remain available.

## Edge Cases

- Missing release evidence, incomplete source history, or a bundle predating base recording leaves the base unknown; it never selects a convenient remote release or a consumer-project version.
- Prereleases and higher versions not evidenced as included in the source are not base releases.
- An invalid, unreadable, or differently sourced base record cannot supply the suffix. It must not turn otherwise usable installation refs into unavailable values.
- Changing from development to a release or another ref removes the development supplement. Returning to development cannot reuse an unrelated earlier base.
- A metadata-only refresh still needs the existing preview and confirmation. A true no-op adds no write or history entry.
- An older installed engine may acquire the new capability without producing its new provenance record. About remains usable with the existing fallback until a later explicit refresh through the updated engine records it; there is no automatic second upgrade.
- Leaving About or changing the bound workspace during a read must not display a late result from the old entry or workspace.
- The longer version value must wrap without obscuring labels, navigation, or the repository link.

## Functional Requirements

- FR-001: The source repository's development build records its known base release as installation provenance.
- FR-002: An applied `main` core refresh records the usable base provenance carried by the selected Dude bundle.
- FR-003: Base-release recording uses only stable official versions evidenced as included in the relevant Dude source.
- FR-004: A completed development build or applied development refresh with no usable base removes any previous base claim for the resulting installation.
- FR-005: About uses base provenance only when it belongs to the recorded development installation's source.
- FR-006: For a development installation with a usable base, About adds `, based on <release>` to its existing `Development (main)` version value.
- FR-007: For a usable development installation without a usable base, About shows exactly `Development (main)`.
- FR-008: About preserves the existing release, other-ref, unavailable, and independent channel/ref classifications.
- FR-009: Missing or unusable optional base data affects only the development supplement, not usable installation refs.
- FR-010: Reading About information makes no external contact, runs no command, and writes no workspace or workflow state.
- FR-011: Base-provenance changes in a core refresh follow the existing reviewed plan, confirmation, applied-installation, and rollback boundaries.
- FR-012: Existing installs without base metadata remain readable and upgradeable without a manifest hand-edit or mandatory reinstall.
- FR-013: About retains 074's author, official repository link, provenance notes, local navigation, read cancellation, and preserved work behavior.
- FR-014: About exposes no raw provenance document, source location, host path, credential, or parsing error.
- FR-015: The added value remains readable and keyboard-accessible within the existing About layout.
- FR-016: Product UI source and implementation-task derivation wait for explicit approval of the current canonical 075 mock.

## Key Entities

- Development installation: the recorded Dude installation identified as `main`, regardless of versions in the consumer project.
- Base-release provenance: an optional stable release associated with the Dude source used for a development bundle; it does not attest to locally installed bytes.
- Recorded channel/ref: the existing installation channel, independent of the base-release supplement.
- Approved design: the exact current 075 mock and its required assets, with its own approval rather than inherited approval from 074.

## Visual Intent

Follow the conventional desktop About pattern of identifying the installed build in a plain value row. Extend 074's Classic Settings About presentation rather than introducing a release badge, warning panel, or update advertisement.

## Scope And Surfaces

The only product presentation change is the known-base suffix inside the existing Dude version row. Preserve 074's ruled facts, shared Settings heading, Packs/About tabs, credit, repository, notes, footer, and both appearances. Keep the existing vertical scrolling and long-value wrapping behavior.

Continuity references, not dependencies or execution order:

- `.dude/specs/074-dude-canvas-about/design/about.html`
- `.dude/specs/052-dude-canvas-ui/design/fluent-desktop-workspace.html`
- `.dude/specs/063-dude-canvas-settings/design/pack-management.html`

Keep those artifacts, their captures, and their approvals unchanged. This feature's approved canonical mock is `.dude/specs/075-dude-development-base-release/design/about.html`; its exact revision is bound below.

## Brand Fit

Reuse the existing typography, tokens, spacing, borders, colors, and visible focus treatment. Maintain WCAG AA contrast. Add no icon, logo, typography system, or new control.

## Proposed Direction

Approved direction: **Development Base Release About**. Keep 074's presentation and show `Development (main), based on v1.3.0` in the version row when that base is recorded. With no usable base, keep the exact existing development value and ordinary provenance note. A missing installation still uses the existing unavailable state; it is not the same as a missing base.

The approved mock includes known-base, no-base, release, loading, missing-record, and read-failure states. Its example base comes from the source evidence recorded in the accepted ledger and remains labeled proposal data, not a claim that the new runtime metadata already exists. The self-contained mock and its 23 captures remain unchanged; their inspection does not replace production verification.

## Visual Success Criteria

- VSC-001: The known-base value fits the existing row in light and dark appearances at 180x450, 360x900, 768x900, and 1440x900 without horizontal page overflow or clipped controls.
- VSC-002: Reflow at 200% from the latter three sizes remains readable down to an effective 180x450 viewport; report the actual reflow method.
- VSC-003: The changed value does not alter section navigation, visible focus, keyboard scrolling, or repository-link access.
- VSC-004: The rendered result matches the explicitly approved 075 mock, preserves the cited About composition, and meets WCAG AA contrast.

## Success Criteria

- SC-001: Every US1 and US3 record case displays the required value and channel classification, with no fabricated release or false installation-unavailable state.
- SC-002: Both development maintenance paths pass the known-base, changed-base, and unknown-base cases without consulting consumer-project version history.
- SC-003: Preview, refused confirmation, and changed-source refusal make zero installation-provenance writes; metadata-only apply, true no-op, and rollback follow US2 and the existing upgrade contract.
- SC-004: About reads produce zero external contacts, commands, or state writes, preserving 074 SC-004.
- SC-005: Older installs remain readable and can use the normal explicit upgrade path; release artifacts retain their recorded release version and channel.
- SC-006: All VSC checks pass against the rendered implementation after explicit approval of the canonical mock; proposal inspection alone is not production acceptance.

## Assumptions

- The source installation currently records `main`; numbered release installs already record their release tag.
- Stable release names follow the project's existing `vX.Y.Z` convention. Source evidence may be incomplete, so the absence of a known base is supported.
- A recorded base describes the bundle when recorded. Neither that record nor the About display verifies installed files or asserts which release is currently newest upstream.
- This definition preserves all user-controlled ledger sections. The scope and fallback decisions above are owner decisions, not completed answer slots.

## Revision Log

- 2026-09-26T18:25:49Z - Initial exploring definition. Canonical mock creation, reviewed revision binding, explicit user visual approval, and implementation-task derivation remain pending. Feature 074's artifacts and approval are unchanged.
- 2026-09-26T19:16:14Z - Settled the first Development Base Release About mock to `proposed`; explicit user visual approval remains pending. Reviewed artifact: `.dude/specs/075-dude-development-base-release/design/about.html`, 103,125 bytes, self-contained with no external assets. Bound SHA256: `61a1f0dcf31195ef3094cb3c08181125a8c1466cb6efb91370bc402fdcda284d`, using the repository's `approvedDesignSha256` CRLF-normalization convention, as used for 074. The coordinator reports that this also equals the current on-disk hash; the Git LF-normalized bytes hash to `e71a38bc754bfb1005a559576694f64b1acae53e2d5ca25c0c0b1f4aea1ab22c`. Canonical proposal evidence: 23 PNGs in `design/screenshots/`.

  The settled direction retains Classic Settings About and changes only the known-base version value to `Development (main), based on v1.3.0`; its channel remains `Development (main)`. The six preview states cover known base, no usable base, release, loading, missing record, and read failure. Author and repository remain available throughout, with the existing distinction between a missing-record note and a read-failure note. These are labeled proposal values, not claims about a newly written installation record.

  Spec Lead inspection covered the artifact's provenance, layout rules, and value/state handlers, plus 11 canonical captures: desktop and narrow known-base views, simulated reflow, the default-scrollbar view, the scrolled end, no-base, release, missing-record, read-failure, and link-focus views. The inspected 360-pixel and desktop views keep the new value on one line; the 180x450 views wrap between words. The scrolled capture exposes the channel row and provenance note, and the focus capture visibly identifies the repository link.

  FluentUI's coordinator handoff reports 168 renders across light and dark appearances at 180x450 and 360-, 768-, and 1440-pixel widths, with no horizontal overflow, clipping, console errors, or network requests. Its 200% reflow used a halved viewport at 2x device scale, not native browser zoom. Reported contrast is 15.52:1 for the new value in light and 14.55:1 in dark; the lowest ratio is the preview heading at 4.72:1, unchanged from 074. FluentUI also reports working link focus, keyboard scrolling, and the Packs round trip. These are reported render/interaction results, not new executions by the Spec Lead.

  The 23rd capture, `design/screenshots/about-scrollbar-180x450-light.png`, includes the default Edge scrollbar's 15-pixel gutter, unlike 074's scrollbar-free captures; its different word wrapping is expected. At 180x450 the preview heading wraps to two lines outside the product surface, and the channel row starts below the fold but remains reachable by scrolling. The reported single-font-family design-hook warning is intentional Fluent Segoe usage, consistent with the existing direction.

  This entry records the current proposed stage and supersedes the initial exploring/pending-mock descriptions above without changing the scope or requirements. The proposal inspection found no current visual or content blocker. Native browser zoom and production or embedded-host behavior are not established by this evidence. It establishes neither user approval nor production acceptance and grants no product implementation or implementation-task derivation permission. The canonical mock, plan, header-only tasks, and all 074 artifacts remain unchanged.

- 2026-09-26T20:12:50Z - Approved Development Base Release About through the user's exact direct-chat reply `approve the 075 design`, received between 2026-09-26T20:12:01Z and 2026-09-26T20:12:50Z. The canonical mock was open in the user's editor; the reply followed their question about the regular-user release display. Approved artifact: `.dude/specs/075-dude-development-base-release/design/about.html`, SHA256 `61a1f0dcf31195ef3094cb3c08181125a8c1466cb6efb91370bc402fdcda284d` under the repository's `approvedDesignSha256` CRLF-normalization convention. Reviewed specification before this approval update: `.dude/specs/075-dude-development-base-release/spec.md`, SHA256 `fb4c1c5732541806ee1559905299229b702f8f458f8d295bc8e9b9f05a17230a`. The coordinator freshly verified both revisions unchanged.

  Canvas preview request `075-about-design-approval` timed out after 1,800 seconds without a receipt. This is direct chat approval, not a Canvas response or acknowledgment. The approved primary and captures remain unchanged, and the approval does not alter the scope or the definition-owner Q1/Q2 decisions. Derived two new sequential open implementation units, T001@d8c3a59e and T002@72f6b104, from the existing plan, with no inherited completion evidence. No product execution or production acceptance is claimed.
