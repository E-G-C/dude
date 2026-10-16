---
title: Dude Canvas App Theme
slug: dude-canvas-app-theme
work_type: design
design_status: approved
approved_direction: "Round 1: Fluent Canvas following the app theme"
preview_path: .dude/specs/085-dude-canvas-app-theme/design/app-theme.html
---

# Design Proposal: Dude Canvas App Theme

Let the user choose whether Dude Canvas follows the GitHub app's colors, fonts, and text sizes. One switch in Settings applies to that user's projects on this computer. It is off by default, preserving today's Fluent light/dark appearance. Following the app changes appearance without replacing Fluent controls, spacing, or layout.

Design is `approved`: the user's literal chat reply "approved" at 2026-10-15T12:38:17Z approves Option A's exact round-1 mock at `preview_path`, as bound in the Revision Log. It confirms the eight rendered choices and four reported Ship dispositions below. `tasks.md` derives two new serial implementation units with no inherited completion evidence. The settled answers in `.dude/ideas/085-dude-canvas-app-theme.md` remain unchanged; the Architect's handoff supplies the buildable boundary, not additional user answers. This approval does not cover a successor mock revision.

## User Scenarios

### US1 - Choose the app's appearance (P1)

The user wants Canvas to fit the main app without giving up Dude's usual appearance.

Independent test: open a fresh Canvas with no saved choice and a supplied app palette that visibly differs from Fluent.

1. Canvas starts in its current Fluent appearance, with the Appearance switch off.
2. In Settings > Appearance, operating the switch once saves the choice and changes the current Canvas after success, without a Save button or agent exchange.
3. Canvas follows the supplied colors, fonts, and text sizes with the approved page-title treatment, while retaining its controls and layout structure.
4. Switching off restores the current Fluent appearance for the device's light/dark preference. A successful save is announced without visible "Saved" text.

### US2 - Remember one choice across projects (P1)

The user wants the same preference when opening Canvas in another project on this computer.

Independent test: begin with a saved on choice and open Canvas in two distinct projects; no prior scenario is required.

1. Both projects open with the choice on, including after closing and restarting Canvas.
2. After one project saves off, the other adopts off when refocused or when Appearance is opened.
3. No repository setting is created or changed, and the choice does not sync to another computer.

### US3 - Follow changes without losing work (P2)

The user changes the app theme while Canvas contains an unsent answer or retained Review work.

Independent test: begin with following enabled, an unsent answer, and retained Review markup. Change the supplied palette and typography within one tone, then change the tone.

1. Canvas follows each change without reopening or losing the answer, work selection, or retained markup.
2. Review receives the current host light/dark tone independently of the switch. Its existing stale-evidence behavior still applies when the bound tone or annotation palette changes.
3. Repeated notifications with unchanged appearance values do not reset controls or save the preference again.

### US4 - Keep a usable, honest appearance when something is unavailable (P2)

The user needs readable controls and an accurate saved-choice state even when host values or preference access fail.

Independent test: separately supply no host appearance, an inaccessible preference, a failed save, and a palette with insufficient text and boundary contrast.

1. Missing host appearance leaves the saved choice intact and displays ordinary Fluent appearance.
2. A failed preference read shows a warning and uses the last confirmed choice, or off on first load. The button labeled "Retry" repeats only that read.
3. A failed save leaves the previous confirmed choice and appearance intact. An uncertain result is reread before Canvas claims it was saved.
4. Deficient colors receive accessible replacements rather than making text, essential control boundaries, or focus hard to see.

## Edge Cases

| Condition | Required behavior |
| --- | --- |
| No saved preference | Default to off without creating a preference merely by opening Canvas. |
| Preference is malformed or unreadable | Show a preference-specific warning with "Retry"; do not call it absent or silently repair it. Retain the last confirmed choice, otherwise use off. Retry repeats only the read. |
| Save fails or its response is lost | Preserve the confirmed state on failure; resolve uncertainty by rereading, never by automatically repeating the write. Announce a confirmed success without visible "Saved" text. |
| Some host values are absent or unusable | Use the corresponding Fluent values. No host values means ordinary Fluent appearance, even with the choice on. |
| Host tone differs from the device preference | Following uses the host tone; off keeps today's device-selected Fluent tone. Review still receives the truthful host tone. |
| A supplied font is unavailable or text is larger | Use the declared font fallback and permit wrapping/reflow; do not download an undisclosed font or shrink text to preserve a screenshot. Page titles keep Dude's existing size hierarchy rather than adopting the app's larger title size. |
| Settings content becomes narrow | At 479px or less, hide the section-tab icons. At 300px or less, let the full tab labels occupy the rows they need and place the switch label above its track. Preserve text and target sizes. |
| Another already-open project changes the choice | Adopt it on visible refocus or Appearance entry; another simultaneously visible project need not change immediately. |
| Custom colors fail contrast or forced colors is active | Accessibility wins over exact color copying, including muted-text control borders, accent labels, and exposed Fluent status text. Preserve native high-contrast behavior and meaningful control states. |

## Functional Requirements

### Choice and persistence

- FR-001: Settings provides exactly one appearance switch labeled "Follow GitHub app theme", in an Appearance section between Packs and About.
- FR-002: When the choice is off, Canvas retains its current Fluent light/dark appearance selected by the device preference, apart from the approved three-section Settings header in FR-010.
- FR-003: Canvas remembers one choice for the current user across projects and Canvas restarts on this computer, outside every repository.
- FR-004: One explicit switch action applies the new appearance after its save succeeds, without a separate Save/Apply action or an agent turn. The changed appearance and announcement provide success feedback without visible "Saved" text.
- FR-005: Newly opened Canvas instances use the saved choice; already-open instances reread it on visible refocus and Appearance entry.

### Following and accessibility

- FR-006: When on, Canvas uses the app's supplied background, text, decorative border, focus/accent, font, and text-size values, subject to FR-008, FR-011, and the approved round-1 treatment below. Page titles use the app's display font at Dude's existing size, 20px in the ordinary-size fixtures, rather than the app's 32px title size.
- FR-007: While on, Canvas follows live palette, typography, and light/dark changes without reopening.
- FR-008: Missing or unusable host values fall back to their corresponding Fluent values without changing the saved choice.
- FR-009: The initial visible Canvas and its page background use the saved choice together, using host appearance when it has been supplied rather than waiting for a later preference read.
- FR-010: Both modes retain Fluent components, anatomy, spacing, and interaction states; larger text may wrap and reflow within the existing layout structure. The approved Settings header hides tab icons at content widths of 479px or less; at 300px or less, tabs wrap with full labels and the switch label sits above its track.
- FR-011: Canvas replaces deficient incoming color pairings as needed to meet WCAG 2.2 AA, including 3:1 essential interactive boundaries and focus indicators. In on-mode, essential control borders use the app's muted text color when it passes, or a stronger contrast-safe replacement; faint decorative rules are not control boundaries.
- FR-012: Appearance navigation and controls remain keyboard-operable, expose accessible names and state, and announce save and read outcomes.

### Failures and continuity

- FR-013: Reading an absent preference returns the off default without creating stored data.
- FR-014: An unreadable or malformed preference produces a warning with a "Retry" action and the last confirmed choice, or off at first load, without claiming the fallback is a confirmed saved choice. Retry repeats only the preference read.
- FR-015: A pending save exposes a saving state and prevents duplicate switch submissions until its outcome is known, while retaining keyboard focus.
- FR-016: A failed save preserves the previous confirmed choice and appearance; an uncertain save is reread before any success claim and is never automatically replayed.
- FR-017: Preference changes and live host changes preserve work selection, unsent input, and retained Review work.
- FR-018: Review receives only a truthful light/dark host tone, falling back to the device preference when no valid host tone exists, independently of the follow-app choice.
- FR-019: Review annotations remain saveable, restorable, and capturable under both appearances, preserving existing palette/tone binding and stale-evidence rules without applying Canvas colors or typography to the reviewed document.
- FR-020: Entering Appearance or changing its switch performs no pack reload, pack operation, project write, or external-service request.
- FR-021: UI source changes and implementation-task derivation wait for explicit user approval of the exact canonical mock; Ship itself supplies no visual approval. The recorded round-1 approval does not approve any successor revision.

## Key Entities

- Appearance choice: one saved on/off preference for this user and computer; it stores no copy of the app's theme.
- Host appearance: the colors, typography, and light/dark tone that the app currently supplies. Unavailable values carry no inferred theme name.
- Canvas appearance: the current Fluent appearance or its host-adapted counterpart. Review's truthful host tone is independent of this selection.

## Visual Intent

Follow VS Code webview theming: an embedded surface consumes the host's documented appearance while retaining its own component system and fallbacks. Follow VS Code user settings for one local choice across workspaces. Fluent's host-themed Teams variants demonstrate the same adaptation principle; this feature does not import a Teams palette.

### Should Feel

- Like the existing Canvas, visually at home beside the main app when following is on.
- Like an ordinary desktop Appearance preference: one clearly labeled switch, its scope, and concise feedback.

### Should Never Feel

- Like a theme editor, another application, or an app-component imitation.
- Like a project operation or an unexplained change to unsaved work.

## Scope And Surfaces

In scope: the existing Canvas shell and shared appearance across Overview, work views, Needs you, New idea, Settings, dialogs, and Review chrome; one Appearance section; saved-choice feedback; and truthful Review tone. Keep the current vertical-left navigation, Settings destination, Packs/About behavior, and working interactions from later Canvas features. This extends Settings beyond 063's pack-only increment without rewriting that approval.

The Architect's declared capability envelope bounds every actionable element in the mock:

- The existing Settings cog and real destinations, with an added Appearance section and exactly one Fluent switch.
- A saving/disabled state and announced success or failure. Checked state represents the confirmed choice, not an unconfirmed write; success has no visible "Saved" text.
- A button labeled "Retry" for a failed preference read, repeating only that fixed read. A failed save can be retried by explicitly operating the switch again.
- A read-only scope or missing-host note. Mock-only palette and error scenario controls work locally outside product chrome and are labeled mock-only.

The product must not acquire the mock's scenario controls or show an app-theme name, theme list/picker, "Open app theme settings", theme editing, font or size sliders, a light/dark/system chooser, per-project or per-surface overrides, cloud sync, or a Save/Apply workflow. It must not promise pixel-identical app controls, undisclosed button/status palettes, or downloading app fonts. Existing navigation must work; decorative controls that lead nowhere are excluded.

Outside scope: changing the GitHub app or other extensions, replacing Fluent components or layout, restyling reviewed pages beyond their existing light/dark tone input, and changing pack or workflow authority. All displayed project fields need real source provenance; palette and failure demonstrations are labeled fixtures, not claims of live reads or successful saves. `design/` remains proposal evidence, not product source.

Continuity references are `.dude/ideas/052-dude-canvas-ui.md`, `.dude/specs/052-dude-canvas-ui/design/fluent-desktop-workspace.html`, and `.dude/specs/063-dude-canvas-settings/design/pack-management.html`, extended by the current working Canvas. Lifecycle numbers do not imply execution order.

## Brand Fit

- Keep genuine Fluent controls and their anatomy, spacing, focus, disabled, and interaction states, as 052 requires. FR-010 records the approved narrow-header adaptation.
- Adapt the existing appearance roles to documented host values; do not invent app branding or assume a translucent decorative border is an accessible control boundary. Essential borders follow the approved muted-text treatment.
- Verify interactive strokes against their actual adjacent surfaces. Text and essential controls must remain readable in both tones and in every exposed interaction state. Warning and error bars retain Fluent's semantic hues, with contrast replacements where needed.

## Direction Options

### Option A - Round 1: Fluent Canvas following the app theme

- Mood: the familiar Canvas, at home beside the main app when following is on, with ordinary Fluent appearance when off.
- Layout: retain the vertical-left navigation and existing work surfaces. Settings tabs run `Packs | Appearance | About`: Appearance follows GitHub's and macOS settings terminology, and About stays last as in Windows and browser settings. The approved narrow-header rules retain full labels and reachable targets.
- Components: one Fluent switch labeled "Follow GitHub app theme", with confirmed checked state, saving feedback, failure warnings, and Retry. There is no Save button or visible "Saved" text.
- Color / type / spacing: on-mode uses the observed dark `#2d2b55` and light `#fbfaff` app fixtures, accessible color replacements, and documented font fallbacks. Fluent anatomy and spacing remain; larger text wraps and reflows. Page titles use the app's display font at Dude's existing size. Warning and error bars retain Fluent hues.
- Primary mock: [app-theme.html](design/app-theme.html).

## Proposed Direction

Option A is the approved round-1 direction. FluentUI copied 084's approved Settings mock byte for byte, then extended it with Appearance and labeled mock-only scenario controls. The direction fits Visual Intent by offering one local preference across projects while retaining the existing Fluent work surfaces.

The switch hint reads: "Uses the GitHub app's colors, fonts, and text sizes. Controls and layout stay the same. Applies to all your projects on this computer. Turn off to use Dude's own look."

Outside product chrome, the mock-only controls show off in light/dark; on with the observed app dark/light fixtures; saving, failed save, and an uncertain save resolved by reread; failed read with Retry; no host values with ordinary Fluent appearance; a constructed deficient-contrast fixture; and larger text. These are demonstrations, not live preference or host-read evidence.

### Round-1 evidence

The coordinator verified the canonical artifact's size and SHA-256 recorded in the Revision Log, with 45 PNGs in `design/screenshots/`. The following checks are FluentUI's report as the mock author, not independent verification. The later user approval accepts the rendered direction; it does not turn mock-author evidence into implementation verification.

- All 39 off-mode pixel comparisons with 084 were identical outside the preview strip and Settings header row.
- Rendered text and essential controls passed the reported WCAG 2.2 AA contrast checks. Across 30 runs, 1,994 text measurements had a minimum of 4.51:1. The observed dark palette needs lighter selected-row accent text, `#b8afec` instead of `#a397e6` (4.53:1 instead of 3.55:1), dark `#2d2b55` thumbs and labels on accent fill instead of white (5.12:1 instead of 2.58:1), and error text `#eba3a5` (4.50:1 instead of 3.28:1). The observed light palette passes as supplied. The constructed deficient fixture demonstrates replacements for text, control borders, focus, and accent fill; faint decorative borders never supply a control edge.
- Thirty size runs covered widths of 180, 360, 768, and 1440px and 200% zoom, with no sideways scrolling, clipped tabs, or shrinking text, and all targets at least 24px. Keyboard, focus, and announcement checks passed 21/21. The switch exposes its role, name, description, and checked state, and stays focusable while saving through `aria-disabled`.
- Segoe UI and Consolas rendered because Mona Sans and Monaspace Neon were not installed; nothing was downloaded. FluentUI reported no script errors or network requests. Its evidence harness stayed outside the repository in session files.

### Approved round-1 choices

The user's literal "approved" confirms all eight choices as rendered, including the two disclosed departures from the earlier plan:

1. Control borders use the app's muted text color with contrast enforcement, rather than its default text color. This follows Fluent's control-border/muted-text pairing and avoids white dark-mode borders at the reported 13.22:1. The mock's default-text comparison stays evidence only (FR-011).
2. At Settings content widths of 479px or less, tab icons are hidden. At 300px or less, the tabs take the rows needed for complete labels instead of a fixed two-column arrangement, and the switch label moves above its track, following Fluent's "label above" pattern (FR-010; VSC-001).
3. In the observed dark app appearance, primary buttons have the rendered light-lavender fill and dark label. White labels fail contrast; other palettes remain subject to the same accessibility policy (FR-006, FR-011).
4. Warning and error bars retain Fluent's tone-matched semantic hues, with stronger exposed text or icons where adapted surfaces require them. No app status palette is inferred (FR-006, FR-011).
5. Page titles use the app's display font at Dude's existing 20px size in the ordinary-size fixtures rather than the app's 32px title size. Larger body text retains the existing hierarchy and reflow (FR-006, FR-010).
6. The side rail, table header, and pager share the app's background, separated by faint decorative lines. Those lines do not replace essential control borders (FR-006, FR-011).
7. The failed-read button says "Retry", not the existing product's "Read again", and repeats only the preference read (FR-014).
8. A successful save shows the changed appearance and a screen-reader announcement, with no visible "Saved" text (FR-004, FR-012).

There are no unresolved round-1 visual choices. A later design refinement requires the normal proposal and explicit re-approval gate.

## Visual Success Criteria

- VSC-001: At 180x450, 360x900, 768x900, and 1440x900, and at 200% zoom, all three Settings sections and the switch remain reachable without page-wide horizontal scrolling, clipped labels, or shrinking type/targets. Essential targets retain at least a 24px visible hit area. The approved icon-hiding, full-label wrapping, and above-switch label rules apply at the stated content widths.
- VSC-002: Off-mode retains the existing Fluent look except for the approved Settings header. On-mode matches the approved dark and light fixtures, including their `#2d2b55` and `#fbfaff` backgrounds, shared rail/table-header/pager surface, faint separators, and display-font page titles at Dude's existing size. The dark fixture uses light-lavender primary buttons with dark labels; warning and error bars retain Fluent hues with accessible replacements.
- VSC-003: Applicable text meets 4.5:1 contrast, or 3:1 for large text; essential boundaries and focus indicators meet 3:1 against actual adjacent surfaces in rest, hover, pressed, and selected states. Muted-text control borders and status/accent replacements must pass on the rendered surface. Keyboard focus, state announcements, and native forced-colors behavior remain usable.
- VSC-004: The rendered implementation matches the exact approved canonical mock and retained workspace structure, including "Retry" and the absence of visible "Saved" text. Real font rendering, screenshots, geometry, and the accessibility tree establish the result; a font-family label alone is insufficient.

## Success Criteria

- SC-001: With no saved choice or with off saved, both light/dark comparisons retain today's Fluent appearance except for the approved Settings header. With on saved and host values supplied, the first visible Canvas and page background agree.
- SC-002: One switch activation persists and applies a choice; two different project instances and a restarted Canvas read that same choice without any repository changes. An already-open instance adopts a later choice on refocus or Appearance entry.
- SC-003: Each tone, same-tone palette, and typography fixture change appears without reopening, losing unsent content, or writing the preference; repeated unchanged notifications cause no reset or repeated save.
- SC-004: The absent, unreadable, malformed, unwritable, and lost-response cases each produce the specified default or failure outcome, with no false saved claim or automatic write retry. Retry performs only a read, and a confirmed save is announced without visible "Saved" text.
- SC-005: Missing-host and deficient-palette cases satisfy FR-008 and FR-011; every applicable visual criterion passes in both tones and at the listed sizes.
- SC-006: Review saves, restores, and captures annotations in both modes and tones, retains work across appearance changes, and marks bound evidence stale when required without retargeting it.
- SC-007: Explicit approval of the exact canonical mock precedes UI source changes and task derivation; subsequent rendered evidence is compared against that approved revision, not a successor.

## Assumptions

The following bounded choices originated as Ship-authorized definition-owner dispositions from settled intent and material evidence, not as user answers. The user confirmed all four after they were reported, through approval of the exact round-1 mock; the ledger's user-controlled answers remain unchanged.

- Already-open projects adopt a changed choice on refocus or Appearance entry, not by instant cross-project broadcast. Basis: the selected answer says the setting should also be on "when you open Dude Canvas in your other projects on this computer"; immediate broadcast is not required, and the existing focus-refresh convention meets that intent without a service.
- Accessibility overrides exact color copying when a pairing fails WCAG 2.2 AA. Basis: the project's accessibility bar and 052's Brand Fit require verified interactive contrast; the reported translucent app border cannot establish it.
- Outside the GitHub app, absent host appearance produces ordinary Fluent appearance even when the choice is on. Basis: the optional feature follows values the host supplies, and the declared capability envelope provides Fluent fallbacks rather than inventing another theme.
- "Follow GitHub app theme" was provisional until mock approval. Basis: the user's answer suggested that wording and asked for colors, fonts, and text sizes. The round-1 approval now confirms that exact label.

Host observations in the ledger are coordinator-reported evidence, not measurements made during this definition. Documented font stacks do not guarantee that every font face is available; actual host delivery and rendered glyphs need verification. Existing project and bundle guardrails cover this feature; no new guardrail candidates or durable rules are introduced.

## Revision Log

- 2026-10-15T10:40:01Z - define: Staged the first exploring proposal and selected the canonical preview path. Canonical mock creation and explicit user visual approval remain pending; no product implementation or task derivation.
- 2026-10-15T11:41:06Z - define: Settled round 1 to proposed. Bound `.dude/specs/085-dude-canvas-app-theme/design/app-theme.html`, SHA-256 `2a693bbd4130651381c9e37d0db0c5e6e386dddde2a2718ef68f5341bde70ad8`, 704,651 bytes, with 45 PNGs in `design/screenshots/` (coordinator-verified). FluentUI reports 39 bounded off-mode comparisons, 1,994 text measurements (minimum 4.51:1), 30 size runs, and 21/21 keyboard/focus/announcement checks. Two deviations and six visual questions await judgment. Specialist evidence is not user approval; tasks remain header-only.
- 2026-10-15T12:39:24Z - define: Approved Option A, "Round 1: Fluent Canvas following the app theme", through the user's literal chat reply "approved" at 2026-10-15T12:38:17Z, with no other text. Before the reply, Dude reported the eight rendered choices and four Ship dispositions. The earlier Canvas request `085-design-approval-round-1` was cancelled after its 1,800-second limit without a response; this approval is the later direct chat reply, not a Canvas receipt. Approved artifact: `.dude/specs/085-dude-canvas-app-theme/design/app-theme.html`, SHA-256 `2a693bbd4130651381c9e37d0db0c5e6e386dddde2a2718ef68f5341bde70ad8`, 704,651 bytes. The coordinator re-hashed it at 2026-10-15T12:38:34Z and found it unchanged since settle, with 45 screenshots; the pre-approval spec was also unchanged at SHA-256 `d740777afc6ebca19a4d2b8c4d06336b9570bb79afd1f6e144691eb39c807d04`. Approval confirms all eight choices as rendered: muted-text control borders; narrow tabs and the above-switch label; light-lavender primary buttons with dark labels in the dark app look; Fluent warning/error hues with contrast replacements; display-font page titles at Dude's 20px ordinary size; the shared rail/table-header/pager background with faint lines; "Retry"; and no visible "Saved" text. It also confirms the four reported dispositions: adoption by other open projects on refocus/Appearance entry, accessibility over exact copying, ordinary Fluent outside the app, and the formerly provisional label now confirmed as "Follow GitHub app theme". The plan now follows those choices and tasks derive as two new serial open units, T001@4c8f2a91 and T002@7b3d90e6 (deps: T001@4c8f2a91), with no inherited completion evidence. This approval binds only the exact round-1 revision, not any successor. No execution or task completion is claimed.
