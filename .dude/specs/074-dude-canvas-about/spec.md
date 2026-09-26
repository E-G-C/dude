---
title: Dude Canvas About
slug: dude-canvas-about
work_type: design
design_status: approved
approved_direction: Classic Settings About
preview_path: .dude/specs/074-dude-canvas-about/design/about.html
---

# Dude Canvas About

Add a conventional, compact About section to existing Settings so a user can identify the recorded Dude installation, see its author, and find the project repository without leaving their work behind.

The user explicitly approved the viewed Classic Settings About mock by chat: `approve the About design`. The Revision Log binds that approval to the unchanged reviewed artifact. Canonical implementation tasks are derived from this approved design and the existing plan; production implementation and acceptance remain unverified.

## User Scenarios

### US1 - Identify the installation (P1)

A user opens Settings, then About, to read the Dude version, author, repository, and recorded installation channel/ref.

Independent test: use controlled installation records without exercising pack operations.

1. Given a recorded release version, opening About shows that version, Enrique Gonzalez, and `https://github.com/E-G-C/dude`.
2. Given the current development installation recorded as `main`, About identifies it as development and retains the recorded ref instead of presenting a numbered release.
3. Given another recorded ref, About labels it as a recorded ref rather than asserting a release or a verified build.
4. Given missing or unusable installation data, About explicitly reports version unavailability while retaining the author and project repository.

### US2 - Use About without disrupting Settings or work (P1)

A user moves between Packs and About, then returns to work.

Independent test: retain a selected work item, unsent input, and a Packs view while switching sections; no metadata lookup success is needed.

1. Given Settings, Packs and About are distinct local sections; Installed and Available remain contexts inside Packs.
2. Given unchanged pack data, switching to About and back preserves the Packs context, filter, page, and selection. Hidden pack detail or request dialogs neither cover About nor take its focus.
3. Given ordinary navigation away from Settings and back, Settings opens Packs with the existing initial view. The existing return from a pack permission request still reaches its own pack request.
4. Given selected work, task inspection, unsent answer or idea text, or retained Review markup, visiting About does not clear or retarget any of it.
5. Given About, no Reload packs action or pack-coverage footer is presented as an About capability.

### US3 - Find the project (P2)

A user follows the repository link to learn more about Dude.

Independent test: activate the visible repository URL with pointer and keyboard, then inspect the retained Canvas.

1. Given About, the link destination is the displayed official repository URL.
2. Activating the link opens a separate browsing context without replacing Canvas or losing its unsent work.
3. Merely displaying About does not contact the repository.

## Edge Cases

- A recorded release and its channel can differ: a stable-release channel does not establish which version is installed.
- An absent installed ref cannot inherit a version from the channel, the host application, or a remote release.
- Malformed data, failed reads, and unsafe metadata values result in explicit unavailable states, never guessed defaults or raw error details.
- A long recorded ref or URL wraps within the section; the full value remains readable.
- Leaving About during a read must not let its late result replace another section or a newer workspace's information.
- Loading or unavailable installation information must not block local navigation, credit, or the repository link.

## Functional Requirements

- FR-001: Settings provides local Packs and About sections without adding a main-rail destination.
- FR-002: Local section changes preserve the Packs view when its underlying data is unchanged; ordinary pack-data reconciliation retains its existing behavior.
- FR-003: Ordinary Settings entry starts in Packs, Installed, All use cases, page 1, with no pack selected.
- FR-004: About identifies the Dude installation using its recorded installed reference, not a host version, repository checkout state, or newest remote release.
- FR-005: About distinguishes a recorded release version, development installation, other recorded ref, and unavailable version without implying installed-byte verification.
- FR-006: About shows the recorded installation channel/ref when usable and explicitly marks that field unavailable otherwise.
- FR-007: About credits the author exactly as Enrique Gonzalez.
- FR-008: About displays `https://github.com/E-G-C/dude` as the project repository and its link destination.
- FR-009: Following the repository link leaves the current Canvas and its retained work intact.
- FR-010: Opening About presents loading, current recorded values, or unavailable information; each later entry reads the installation information again.
- FR-011: Author and repository remain visible when installation information cannot be read.
- FR-012: About changes no workspace files or workflow state and offers no operation other than local section navigation and the repository link.
- FR-013: While About is shown, Settings hides pack-only actions and replaces pack-specific footer content with an inert About status.
- FR-014: About exposes no host filesystem paths, credentials, session/provider identifiers, raw metadata document, or raw error details.
- FR-015: Visiting About preserves selected work, task inspection, unsent input, pack-request return behavior, and retained Review work under their existing authority rules.
- FR-016: All About navigation and links remain keyboard-accessible with visible focus and correctly identified selected sections.

## Key Entities

- Installation record: the recorded installed ref and source channel/ref; provenance rather than proof of installed bytes.
- Product identity: Dude, author Enrique Gonzalez, and the official project repository, independent of installation-record availability.
- Settings section: the local Packs or About choice, separate from both workspace navigation and Pack context.

## Visual Intent

Follow the familiar desktop Settings/About convention: restrained product identification and readable label/value facts. It should feel like part of the existing workspace, not a dashboard, landing page, or upgrade advertisement.

## Scope And Surfaces

In scope: the Settings section chooser, a read-only About surface, truthful loading/unavailable copy, and the small command-bar/status-bar adaptations needed when About is active. Include recorded installation channel/ref as the only optional metadata addition.

Out of scope: build revision/date, product license/copyright claims, a new third-party-notices link, separate documentation/support destinations, diagnostics, telemetry, copy controls, update checks/upgrades, pack behavior changes, and workspace redesign. Existing legal notices remain untouched. No placeholder extras or invented destinations.

Continuity references:

- Broader product intent: `.dude/ideas/052-dude-canvas-ui.md`.
- Approved workspace baseline: `.dude/specs/052-dude-canvas-ui/design/fluent-desktop-workspace.html`.
- Existing Settings baseline: `.dude/specs/063-dude-canvas-settings/design/pack-management.html`.

Preserve both baselines and feature 063's artifacts. Keep the five current rail destinations, Settings at the visible bottom of the vertical left rail, the work selector, and the working response, capture, and Review surfaces. The references establish continuity, not dependencies or execution order.

## Brand Fit

Use the existing workspace's typography, spacing, colors, borders, and focus treatment in light and dark appearances. Add no logo, token system, decorative hero, or large promotional card. Text and meaningful controls must meet WCAG AA contrast.

## Proposed Direction

Approved direction: **Classic Settings About**. The mock uses a shared Settings page heading with compact inline Packs/About tabs that wrap at narrow widths. About has a plain Dude heading and a short, ruled label/value list: Dude version `Development (main)`, author Enrique Gonzalez, repository `https://github.com/E-G-C/dude`, and recorded channel/ref `Development (main)`. A concise note distinguishes recorded metadata from installed-file verification. Long values wrap, and the body scrolls vertically when needed.

Packs retains its existing body, including the Installed/Available tabs beneath the shared Settings header, and the five-destination main rail stays intact. Reload packs is hidden on About, with no replacement action. The footer reads `About · Read only`, not pack coverage. Ordinary Settings re-entry still starts in Packs.

The primary mock is `.dude/specs/074-dude-canvas-about/design/about.html`, a self-contained artifact with no external asset dependencies. Its 22 canonical PNG captures in `design/screenshots/` remain proposal evidence, not production acceptance. Approval comes from the explicit chat reply recorded below, not from those captures. This is the only direction explored so far; preserve any variants actually explored later.

## Visual Success Criteria

- VSC-001: From an ordinary workspace view, About is reachable in two navigation activations: Settings, then About, with no new rail item.
- VSC-002: The section chooser is visibly and accessibly distinct from Installed/Available, and no hidden Packs control is focusable on About.
- VSC-003: At 180x450 and at 360, 768, and 1440-pixel-wide viewports, content remains readable with no horizontal page scrolling or clipped controls in both appearances. Verify 200% reflow down to an effective 180x450 viewport.
- VSC-004: Keyboard users can select either section, scroll its content, follow the repository link, and leave Settings without a focus trap; focused controls remain visible.
- VSC-005: The final rendered surface follows the explicitly approved current mock, preserves the cited Canvas composition, and meets WCAG AA contrast.

## Success Criteria

- SC-001: Every release, development, other-ref, absent, malformed, and read-failure acceptance case shows the correct version classification without a fabricated value.
- SC-002: The repository link always displays and targets the official URL; activating it never replaces the current Canvas.
- SC-003: The US2 round trip leaves selected work, unsent input, retained Review work, and pack membership unchanged, and preserves the Packs view when its data is unchanged.
- SC-004: Reading About information makes no external contact, runs no command, and writes no workspace state; unrelated existing Canvas refresh behavior is unchanged.
- SC-005: All VSC checks pass on the rendered implementation, with explicit user approval of the canonical mock recorded before implementation begins.

## Assumptions

- The current installation records `main` as both its installed ref and source channel/ref. This is development provenance, not a release number.
- Credit and the official repository are supplied by the accepted idea; unavailable installation metadata does not invalidate them.
- The implementation owner supports local Settings navigation, read-only facts, and ordinary external links. Actual embedded-host link opening remains to be verified.

## Revision Log

- 2026-09-25T22:23:51Z - Initial exploring proposal; canonical mock creation and explicit user visual approval remain pending.
- 2026-09-25T23:54:05Z - Settled the first Classic Settings About mock to `proposed`; explicit user visual approval remains pending. Reviewed artifact: `.dude/specs/074-dude-canvas-about/design/about.html`, SHA256 `46c7e0d7c96885b19c4bd5453fe7cf8b81968d7f2ceb36ae262a6addbc91df9e`, self-contained with no external asset dependencies. Canonical evidence: 22 PNGs in `design/screenshots/`.

  Independent Tester evidence: session `files/074-about-verify/mock-captures/report.json` (39 PNGs) and `files/074-about-verify/keyboard-completion/keyboard-observations.json`. Tester reported light and dark observations at 1440-, 768-, and 360-pixel widths and 180x450, plus effective-viewport reflow at 200%, with no horizontal overflow or console errors. Measured contrast minima were 4.72:1 in light and 5.18:1 in dark.

  Keyboard observations covered Tab, arrow keys, Home, End, Shift+Tab, actual Space scrolling (0 -> 128), repository-link focus, and restoration of Packs `Available`, the `ui` filter, and `web` detail state. The final focused runner exited 0 with 2 behavior checks and 22 assertions passing. An initial oracle incorrectly expected an extra Provenance label; only the session driver was corrected, leaving the mock unchanged.

  The proposal inspection found no current visual or content blocker. Native 200% browser zoom, embedded-host external opening, screen readers, and forced colors remain unverified. This evidence supports the proposal only; it establishes neither production acceptance nor user approval and grants no product implementation or implementation-task derivation permission.

- 2026-09-26T01:11:26Z - Approved Classic Settings About through the user's exact direct chat reply `approve the About design`, with the canonical HTML open. Approved artifact: `.dude/specs/074-dude-canvas-about/design/about.html`, SHA256 `46c7e0d7c96885b19c4bd5453fe7cf8b81968d7f2ceb36ae262a6addbc91df9e`; the coordinator's fresh SHA256 equals the reviewed artifact. The earlier Canvas preview waiter timed out/cancelled without a receipt. This approval is not a Canvas response or acknowledgment, and no consent token is recorded. The primary mock and its captures remain unchanged. Three new sequential implementation units are derived from the approved spec and existing plan; no Work execution or production acceptance is claimed.
