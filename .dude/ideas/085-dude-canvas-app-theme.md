---
title: Dude Canvas App Theme
slug: dude-canvas-app-theme
status: defined
spec_path: .dude/specs/085-dude-canvas-app-theme/spec.md
---

# Idea: Dude Canvas App Theme

## Idea

> is it possible for dude canvas to optionally follow the github app theme besides its own default theme?

The user sent this message, addressed to @dude, at 2026-10-15T09:32:21Z; Dude corrected only "it's" to "its". After Dude asked whether to capture "follow the GitHub app theme" as a Dude idea for definition, the user chose "Capture it as a Dude idea (Recommended)". No timestamp is available for that choice.

In a user follow-up at 2026-10-15T10:03:35Z, item 3 added intent rather than answering an open question. Literal reply:

> 3. This goes under settings

## Open Questions

For later definition; no answer is needed to capture this intention.

1. Should the saved choice apply to you across all projects on this machine, or to this project through a repository setting shared by everyone using it?
   Answer: In chat at 2026-10-15T10:03:35Z, the user replied but said they might not have understood the question. Literal reply:

   > 1.  is a canvas general Dude canvas functionlity not a sigle project, that does not make sense,, maybe I didn't understand the questio, feeel free to ask more, 

   Dude reworded the question:

   > The toggle would appear in Dude Canvas Settings in every project. My question was only where Dude remembers your choice. VS Code works the same way: a color theme is normally a user setting that follows you into every project, not a per-project workspace setting. If you turn on "Follow GitHub app theme" in one project, should it also be on when you open Dude Canvas in your other projects on this computer?

   Choices offered: "Yes, one setting for all my projects on this computer (Recommended)" and "No, each project keeps its own setting". The user selected the first choice; the coordinator read the clock immediately after the reply at 2026-10-15T10:07:34Z. Literal selection:

   > Yes, one setting for all my projects on this computer (Recommended)

   Dude's interpretation of the settled answer: one setting for all of the user's projects on this computer.

2. Should following the app include colors only, or colors plus fonts and text sizes? Components, spacing, and layout remain Fluent either way.
   Answer: In chat at 2026-10-15T10:03:35Z, the user replied:

   > 2. same look and feel as the main app, however is optional, like a toggle folllow github app theme,/ fonts.. 

## Assumptions

No additional user assumptions supplied.

<!-- dude:managed:start -->
## Intent And Scope

Dude's interpretation: one optional toggle in Dude Canvas Settings, off by default. Dude's current Fluent light/dark look, selected through `prefers-color-scheme`, stays the default and is unchanged when the toggle is off. When on, Canvas takes the GitHub app's colors, fonts, and text sizes for the user's "same look and feel as the main app", with accessible replacements where needed.

Question 2 stated that components, spacing, and layout stay Fluent either way, and the answer did not change that. The app's documented canvas contract covers colors, fonts, and text sizes; Dude reads "same look and feel" as those values while preserving Fluent components, anatomy, spacing, and layout. The future mock must confirm this interpretation.

The clarified answer to question 1 means one setting for all of the user's projects on this computer, stored outside any repository. The mock will settle the exact toggle label and position within Settings, using the user's wording in answer 2 as the starting point.

Definition success tests:

- With the toggle on, Canvas uses the app's colors (background, text, decorative borders, and focus), fonts, and text sizes in both light and dark app themes, including a custom theme such as the observed `#2d2b55` dark and `#fbfaff` light backgrounds, subject to accessible contrast.
- When the app's theme changes while Canvas is open, Canvas follows without reopening.
- With the toggle off, the default, Canvas looks as it does today.
- Turning the toggle on in one project's Canvas means it is on when Canvas opens in another project on this computer, and the choice survives closing and reopening Canvas. Already-open projects adopt the saved choice on refocus or Appearance entry.
- The result meets WCAG 2.2 AA, including 3:1 contrast for interactive boundaries.

Out of scope: replacing Fluent components or layout with the app's component library, per-surface theme choices, creating or editing app themes, restyling reviewed pages beyond supplying a truthful light/dark tone, syncing the choice across computers, and any per-project or repository-stored setting.

The first definition is staged below. No mock, product implementation, or task units have been created. The mandatory mock-and-explicit-approval gate in `.dude/memory/guardrails.md` remains in force.

## Definition Package

Definition package: `.dude/specs/085-dude-canvas-app-theme/spec.md`, with a lean `plan.md` and a `tasks.md` of two derived units. Design is `approved`: the user's literal chat reply "approved" at 2026-10-15T12:38:17Z approves Option A, "Round 1: Fluent Canvas following the app theme", at `.dude/specs/085-dude-canvas-app-theme/design/app-theme.html`, SHA-256 `2a693bbd4130651381c9e37d0db0c5e6e386dddde2a2718ef68f5341bde70ad8`. The coordinator re-hashed it at 2026-10-15T12:38:34Z and found it unchanged since settle, with 45 screenshots; the spec's Revision Log binds this exact approval. No successor revision is approved.

The package follows the settled answers to questions 1 and 2, the user's Settings placement, and the Architect's technical structure and capability envelope. The approved mock confirms the label "Follow GitHub app theme" and the eight rendered choices recorded in the spec, including muted-text control borders with contrast enforcement, the narrow-header adaptation, and "Retry". The plan now follows those choices; the mock and its screenshots remain design evidence, not product source or implementation verification.

The derived units are new, serial, and open: T001@4c8f2a91 has no dependencies and establishes the shared preference store/routes with server tests and their projection; T002@7b3d90e6 depends on T001@4c8f2a91 and applies the approved Canvas appearance, bootstrap, Settings switch, live following, Review normalization, rebuilt mirrors, documentation, and acceptance. They inherit no state or completion evidence. Each executed unit gets one Tester and one independent Reviewer through ordinary Work; the coordinator owns task state and closure.

During this explicit Ship definition, the Spec Lead originally resolved four bounded choices as Ship-authorized definition-owner dispositions: adoption by already-open projects on refocus or Appearance entry, accessibility over deficient color copying, ordinary Fluent fallback without host appearance, and a provisional toggle label. The user approved the exact round-1 mock after all four were reported, confirming them and the rendered label. This attribution does not turn the original dispositions into user-supplied question answers.

The earlier Canvas Needs You request `085-design-approval-round-1` was cancelled after its 1,800-second limit without a response. The later direct chat reply supplies this approval; no Canvas response or receipt is claimed. No product execution or task completion is claimed.

Existing project and bundle guardrails cover this feature. No new guardrail candidates arose, and no adoption, narrowing, rejection, or skip of project rules is proposed.

## Dude's Analysis

These findings and early proposals are context, not user answers. The definition package records the planned approach.

The reported probe shows that the app supplies theme values which Dude's current appearance code does not consume. Mapping those values into a Fluent theme appears feasible without replacing components; this has not been implemented or visually verified.

Dude's early proposals:

- Start with the existing Fluent light/dark themes and override color and typography tokens using `var(<documented app variable>, <Fluent value>)`. FluentProvider exposes its theme through CSS variables, allowing browser resolution and Fluent fallbacks when app variables are missing. The page background needs corresponding treatment.
- Choose the light/dark base from `data-theme-tone`, then `data-color-mode`, then `prefers-color-scheme`. Keep the follow-app choice separate from the truthful light/dark tone passed to Review.
- Derive hover, pressed, selected, and accent colors from documented variables, potentially with CSS `color-mix()`. Exact mappings belong to definition. Retain Dude's accessible stroke or a verified stronger override; check it against the new background rather than assuming it remains accessible. The observed app border is a 40% transparent mix and is not proof of sufficient interactive contrast.
- Save the choice through Dude's server outside any repository; question 1 settles it as a per-user setting shared across projects on this computer. The coordinator-reported app canvas guide suggests `$COPILOT_HOME/extensions/<extension-name>/artifacts/` for per-user extension data, with `$COPILOT_HOME` defaulting to `~/.copilot`, and says to use it even for project-scope extensions such as Dude (`.github/extensions/dude/`). The exact file and format belong to the plan. Browser storage alone is unsuitable across changing Canvas origins.
- Put the toggle in an "Appearance" section alongside Packs and About. GitHub's own settings have an Appearance page, and VS Code groups themes under appearance settings; that familiar grouping fits a visual preference. The mock settles its presentation.

The familiar convention is host-supplied theming: VS Code webviews use `--vscode-*` variables and light/dark/high-contrast body classes to match the editor. Fluent's Teams themes likewise show host-matched palettes within Fluent components. These precedents support adapting tokens rather than replacing the component system.

## Current Context And Investigation

Dude's repository findings (items 1-3 retained from the first capture; item 4 checked for the brainstorm refresh):

1. `src/extensions/dude/frontend/theme.js` builds on `webLightTheme` and `webDarkTheme`, replacing `colorNeutralStroke1*` with accessible-stroke variants. `useHostAppearance()` reads `(prefers-color-scheme: dark)`, and `frontend/app.jsx` selects the corresponding FluentProvider theme. `frontend/styles.js` uses Fluent tokens; a search of frontend JavaScript, JSX, and CSS found no literal hex, RGB, or HSL colors. The separate `src/extensions/dude/ui/index.html` hardcodes page backgrounds `#f5f5f5` and `#141414`.
2. `src/extensions/dude/lib/canvas-server.mjs` calls `listen(0, '127.0.0.1')`. Each new server receives an ephemeral port, so its browser origin can change; localStorage is origin-specific, not necessarily deleted. No saved appearance choice was found in the inspected frontend. Added pack sources provide a separate project-local persistence precedent in `.dude/metadata/pack-sources.md`, documented by `src/skills/dude-engine/lib/pack-sources.mjs`; this does not propose storing appearance there.
3. `src/extensions/dude/frontend/review.jsx` passes the tone to `src/extensions/dude/ui/review/engine.mjs`, which accepts only `light` or `dark` and sets the reviewed iframe's `colorScheme`. `src/extensions/dude/lib/review/data.mjs` validates and records that tone in review evidence.
4. `SECTIONS` in `src/extensions/dude/frontend/settings.jsx` (about line 20) defines the current Settings sections, Packs and About.

Coordinator-reported host evidence, not independently reproduced for this definition:

- At 2026-10-15T09:34:44Z, a session-only probe inside the app's canvas iframe observed `data-theme-source="external"` and `data-theme-tone="dark"` on `<html>`, no body attributes, and no `data-color-mode`. The dark media query matched, and the app injected theme-default and Rampa stylesheets.
- Resolved values included `--background-color-default: #2d2b55`, `--text-color-default: #ffffff`, `--text-color-muted: #bdb8d2`, `--border-color-default: color-mix(in srgb, #807b98 40%, transparent)`, and `--color-focus-outline: #a397e6`. Font and text-ramp variables were also present.
- The bundled canvas-authoring guide documents theme attributes, semantic color variables, true-color entries, and typography variables. It recommends semantic tokens and warns against depending on undocumented app internals. Injected defaults can be overridden by Canvas CSS.
- At 2026-10-15T10:01:36Z, without reloading the open probe canvas, `<html data-theme-tone>` changed from `dark` to `light` while `data-theme-source="external"` stayed. The `(prefers-color-scheme: dark)` query stopped matching and fired a change event at the same moment. `--background-color-default` changed from `#2d2b55` to `#fbfaff`, and `--text-color-default` from `#ffffff` to `#37306b`.
- The probe also logged repeated `<html>`-attribute and `<head>` mutations every few minutes with unchanged values.

Whether the switch came from the app's theme setting or the operating system's remains undetermined, as does whether the app's tone can ever differ from `prefers-color-scheme` inside the canvas. They matched in both observations.

Dude's interpretation: today's default Canvas would also have switched between its own light and dark looks through `prefers-color-scheme`; it does not adopt the app's colors or typography. The probe was outside the repository. Custom-theme contrast and the proposed Fluent mapping remain for mock approval and verification.

## Related References

- `.dude/ideas/052-dude-canvas-ui.md`: broader Canvas vision and Fluent direction.
- `.dude/specs/052-dude-canvas-ui/spec.md`, Brand Fit: genuine Fluent UI v9 components, mapping to host variables, and verified accessible interactive strokes.
- `.dude/ideas/063-dude-canvas-settings.md`: the existing Settings surface; its original pack-management slice excluded host appearance.

These references establish continuity, not execution order. Lifecycle numbers record capture chronology only.
<!-- dude:managed:end -->

## Coordinator Log

- 2026-10-15T09:42:38Z - brainstorm: Captured the user's request for an optional GitHub app theme alongside Dude's default appearance, with Dude's investigation recorded; capture only, with no definition, mock, or implementation.
- 2026-10-15T10:08:25Z - brainstorm: Recorded the user's answers to questions 1 and 2 and the Settings placement, reflected them in Intent And Scope, and added the live-update evidence; still draft, with no definition.
- 2026-10-15T10:40:01Z - define: Staged first definition at .dude/specs/085-dude-canvas-app-theme/spec.md with spec, plan, and header-only tasks; design is exploring, canonical mock creation and explicit user visual approval remain pending. No product implementation or task-state change.
- 2026-10-15T10:54:19Z - route: Assigned the canonical mock at .dude/specs/085-dude-canvas-app-theme/design/app-theme.html to FluentUI, starting from 084's approved Settings mock (.dude/specs/084-upstream-packs-in-checkout/design/upstream-packs.html) and staying inside the Architect's declared capability envelope; design remains exploring and needs the user's explicit approval before implementation.
- 2026-10-15T11:44:28Z - define: Settled the round-1 app theme design to proposed at .dude/specs/085-dude-canvas-app-theme/design/app-theme.html; the artifact hash and proposal evidence are bound in the spec Revision Log. The user's explicit visual approval remains pending. No product implementation, plan or task changes, or task derivation.
- 2026-10-15T12:39:24Z - define: Staged approval of the round-1 app theme design from the user's explicit chat reply "approved" at 2026-10-15T12:38:17Z, bound to .dude/specs/085-dude-canvas-app-theme/design/app-theme.html at SHA256 `2a693bbd4130651381c9e37d0db0c5e6e386dddde2a2718ef68f5341bde70ad8`, which the coordinator re-hashed after the reply and found unchanged. The approval confirms all eight choices as rendered: muted-text control borders; narrow tabs and the above-switch label; light-lavender primary buttons with dark labels in the dark app look; Fluent warning/error hues with contrast replacements; display-font page titles at Dude's 20px ordinary size; the shared rail/table-header/pager background with faint lines; "Retry"; and no visible "Saved" text. It also confirms the four reported Ship dispositions: other open projects adopt on refocus/Appearance entry, accessibility overrides exact copying, Canvas keeps ordinary Fluent outside the app, and the provisional label is now confirmed as "Follow GitHub app theme". Derived two new serial open units, T001@4c8f2a91 (no deps) and T002@7b3d90e6 (deps: T001@4c8f2a91), with no inherited completion evidence. Approval is limited to this exact round-1 revision. No execution or task completion is claimed.
- 2026-10-15T12:56:42Z - execution-reconciliation: Applied the checked approval stage and two new serial open task units, T001@4c8f2a91 and T002@7b3d90e6 (deps: T001@4c8f2a91), with no inherited state; kept 0, changed 0, dropped 0, new 2. Preserved user sections and append-only history, retained the approved mock bytes at SHA256 2a693bbd4130651381c9e37d0db0c5e6e386dddde2a2718ef68f5341bde70ad8, and observed zero lint failures inside the rollback boundary. Definition is ready for the existing Ship execution path; no implementation has started.
- 2026-10-15T13:24:59Z - work: Claimed T001@4c8f2a91 for the user-authorized autonomous Ship invocation; implementation has not started.
- 2026-10-15T15:48:38Z - work: Claimed T002@7b3d90e6 for the user-authorized autonomous Ship invocation; implementation has not started.
- 2026-10-16T04:59:43Z - work: Closed Dude Canvas App Theme: both live canonical tasks (T001@4c8f2a91, T002@7b3d90e6) are done through autonomous Work in the Ship invocation, each settled with fresh independent Tester verification and independent Code Reviewer acceptance. T001 settled on its second attempt after one review rejection (owned project-relative test fixture homes). T002 settled on its third attempt after a failed verification with four review findings and one further review finding (per-token fallbacks, host-tone first paint, approved following-mode separators, a full-suite browser race, and unusable-background first paint); design close: Matches approved spec. The one Rubber Duck retrospective dispatch completed and is recorded in retrospective.md. The coordinator verified the real loaded extension's preference routes and bootstrap but could not observe real-host pixels because computer use is blocked for the app window; that host-only observation and a live app-theme switch remain for the user. Nothing is committed; Git delivery awaits the user's decision.
