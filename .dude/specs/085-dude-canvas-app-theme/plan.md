# Plan: Dude Canvas App Theme

Spec: `.dude/specs/085-dude-canvas-app-theme/spec.md`
Owner: `.dude/ideas/085-dude-canvas-app-theme.md`

Keep the existing React application, single FluentProvider, and loopback server. Add one saved boolean, a documented-host-token adapter in the existing appearance owner, and an Appearance section in Settings. Preserve the default themes and normalize the values that cross Fluent layout and Review's saved-palette contracts.

This retains the Architect's technical structure and capability envelope, aligned with the round-1 mock approved by the user's literal chat reply "approved" at 2026-10-15T12:38:17Z. The spec's Revision Log binds the exact artifact and SHA-256. The approved changes to the earlier handoff are muted-text control borders with contrast enforcement, the narrow Settings header, display-font page titles at Dude's existing size, and the other rendered choices in the spec. Host observations and mock-author checks remain planning evidence, not implementation verification. The spec has no unresolved intent or round-1 visual clarification. Two new serial units are derived in `tasks.md`; the mock remains evidence, never product source.

## Technical Context

| Field | Choice |
| --- | --- |
| Runtime and UI | Existing JavaScript ES modules, React, Fluent UI v9, and scoped Canvas build. Use Node 22+ for browser acceptance. |
| Dependencies | None new. Use the existing Fluent Switch and browser APIs; its first bundled use may change the legal inventory. |
| Storage | One per-user boolean under the documented Copilot extension artifacts location, independent of repository and changing loopback origin. |
| Platform | The current Canvas extension and loopback server on Windows, macOS, and Linux; ordinary Fluent fallback outside the app. |
| Tests | Existing server, Review, browser, build/projection, and installed-host runners. All affected fixture servers use an isolated `COPILOT_HOME`. |
| Bounds | No polling, cross-project broadcast service, theme catalog, general settings framework, copied theme, or new extension action. Preserve current resource limits and UI lifetimes. |

## Chosen Structure

### 1. Preference store and routes

Add `src\extensions\dude\lib\canvas-preferences.mjs`. Resolve the file server-side:

`$COPILOT_HOME\extensions\dude\artifacts\canvas-preferences.json`

When `COPILOT_HOME` is unset, use `path.join(os.homedir(), '.copilot', 'extensions', 'dude', 'artifacts', 'canvas-preferences.json')`. Store only `{"followAppTheme":true}` or its false counterpart. There is no workspace, session, panel, origin, schema-version, or theme key.

An absent file reads as false without creating directories or data. Malformed or unreadable storage is a read failure, not absence; never repair it during a read. A write creates only the needed artifacts directory and a complete small JSON document through a unique sibling staging file and rename. Acknowledge success after replacement. Ordinary simultaneous setters are last-successful-replacement-wins; add no lock database or revision protocol, and promise no power-loss guarantee.

In `lib\canvas-server.mjs`, add exact `GET /api/canvas-preferences` and `POST /api/canvas-preferences`. GET reads the current boolean. POST accepts exactly `{"followAppTheme":<boolean>}`. Reject unknown fields, caller paths/roots/operations, non-JSON bodies, and oversized input. Reuse existing exact Host/Origin checks, an explicit same-origin POST requirement, body limits, and no-store responses. Add no CORS exception, shell, Needs You exchange, idle gate, or project authority.

Use preference-specific errors. Failed writes retain the confirmed choice and look. If the write response is lost, reread before claiming success; never replay automatically. First-load read failure uses off with a warning; later read failure preserves the last confirmed choice with a warning.

The documented extension discovery rule requires an immediate child's `extension.mjs`. Creating only `extensions\dude\artifacts` and data does not create another extension. Do not create an entrypoint or replace/delete an existing user extension. The shared artifacts file remains the data location when a project-scope Dude shadows a user extension.

This implements FR-003 through FR-005 and FR-013 through FR-016. localStorage is deliberately not the authority because Canvas's loopback port, and therefore its origin, changes.

### 2. Bootstrap and first paint

Read the preference while serving `/`, before returning HTML. Insert only the validated boolean and a closed read-error code into a fixed bootstrap slot, plus an owned `data-dude-follow-app-theme` attribute. Never embed arbitrary file content or a local path.

Initialize React synchronously from that bootstrap. Do not fetch the initial preference in an effect after the first render. Keep preference state outside the workspace-keyed Settings lifetime.

In `ui\index.html`, retain the exact current off-mode `#f5f5f5` and `#141414` page-background rules. On-mode uses `var(--background-color-default, <matching Fluent page fallback>)`, with corresponding text/type defaults. The page and initial FluentProvider render must use the same saved choice and effective tone.

This avoids a preference-loading flash under FR-009. It cannot guarantee that the app injects host styles or provides a font before Canvas paints; absent values use Fluent until supplied. Test that distinction rather than claiming control over host delivery timing.

### 3. Tone resolution

Resolve host tone in this order:

1. A valid `light` or `dark` `data-theme-tone` on html, then body.
2. A valid `light` or `dark` `data-color-mode` on html, then body.
3. `(prefers-color-scheme: dark)`.

Ignore other values and do not infer tone from theme identifiers.

Off uses today's media-query-selected `lightTheme` or `darkTheme`, including the current accessible-stroke overrides. On uses the resolved host tone's accessible Fluent base before adaptation. With no host values, the adapter retains ordinary Fluent values.

Set the document's local `color-scheme` to the effective Canvas tone for native controls and scrollbars; do not rewrite host attributes. Keep resolved host tone separate from effective Canvas tone so Review receives the former even when following is off. This implements FR-002, FR-008, and FR-018.

### 4. Token adapter and contrast policy

Extend `frontend\theme.js`, not the component system. Use only documented host variables and `var(<host variable>, <that token's Fluent value>)`. Own intermediate variables under `--dude-*`; never overwrite host variables.

Let B mean `--background-color-default`, F mean `--text-color-default`, M mean `--text-color-muted`, and A mean `--color-focus-outline`.

| Fluent role | On-mode mapping |
| --- | --- |
| Main neutral backgrounds and card background | B, including the shared side rail, table header, and pager. Other neutral levels use small B/F mixes; preserve transparent surfaces. |
| Default foreground and its interaction variants | F. Secondary/muted foregrounds use M, promoted toward a stronger foreground when required for contrast. |
| Decorative strokes | `--border-color-default`, including faint surface separators, never assumed suitable for essential control boundaries. |
| Interactive and accessible strokes | M as the approved control-border seed, strengthened toward F or a contrasting neutral only when required. Check actual adjacent surfaces. Cover the used `colorNeutralStroke1/4` variants and `colorNeutralStrokeAccessible*`, including the unchecked switch. |
| Focus and brand/link foreground/stroke roles | A as a documented accent seed, adjusted for the role's contrast. Preserve Fluent focus-ring anatomy and appropriate inner/outer band colors. |
| Brand and compound-brand fills with their paired foreground | A-based fills and modest interaction mixes. Choose a foreground that passes across all used states, including the checked Switch thumb's inverted foreground. Use `--color-white` only when it passes; B or another contrasting neutral can supply the dark label shown in the approved dark fixture. Map paired roles explicitly rather than replacing every token with a matching prefix. |
| Status and annotation families | Keep tone-matched Fluent semantic hues and paired roles. Strengthen exposed warning/error foregrounds and icons against adapted surfaces when needed; do not invent host status variables or change annotation meanings. |

Use the approved mock's starting mixes: neutral hover/pressed/selected backgrounds mix B toward F by 6%, 10%, and 12%; the other used neutral levels start at 4% and 6%. Interactive-stroke hover and pressed states mix the M-based stroke toward F by 15% and 30%. Brand fills start at A, with 10% and 20% A/F hover/pressed mixes and an A/B tint for secondary brand backgrounds. These are seeds, not proof of contrast. If a required seed is absent or `color-mix()` is unsupported, retain that state's base Fluent token. Leave unused static/inverted pairs at their base. Do not add a palette generator.

Use a small sRGB/WCAG contrast helper with browser color resolution to evaluate resolved/composited colors. Check actual rest, hover, pressed, and selected pairings: applicable text at 4.5:1 or 3:1 for large text, essential boundaries and focus at 3:1. The reported 40%-transparent decorative border is not proof of interactive contrast.

When a seed misses its role's threshold, take the smallest sufficient mix toward F or a contrasting black/white neutral, checking every adjacent surface that uses that role. For warning/error text and accent foregrounds, preserve the semantic hue while strengthening contrast. For a foreground on brand fill, test the supplied white across the used fills, then B, F, and contrasting neutrals; select a passing paired result rather than forcing white. Check the accent fill's own essential boundary contrast as well. Missing or unusable host inputs keep their Fluent fallbacks; replacements are recomputed from the actual supplied inputs, not a named theme or a captured palette.

This rule must produce results like the approved dark fixture's lighter selected-row accent, dark on-brand labels/thumbs, and strengthened error text. The mock's `#b8afec`, `#2d2b55`, and `#eba3a5` are fixture evidence, not hardcoded product replacements. Test the observed light/dark fixtures and the constructed deficient fixture against the rendered result. Preserve native forced-colors behavior rather than forcing brand colors over it.

Accessibility takes priority over exact copying under FR-011. The approved mock demonstrates this policy, including a deficient text/background pair. No whole-DOM runtime audit or new dependency is needed.

Do not consume raw Rampa entries, private stylesheet identifiers, or undocumented observations such as `--background-color-button-primary-rest`, `--text-color-link`, and `--radius-large`. A is an available Canvas accent seed, not a claim about the app's undisclosed primary-button palette.

### 5. Typography normalization

Map the existing Fluent typography roles without changing spacing, radii, stroke widths, motion, or component anatomy:

- `fontFamilyBase` and `fontFamilyNumeric` use `--font-sans`; `fontFamilyMonospace` uses `--font-mono`; `fontWeightSemibold` uses `--font-weight-semibold`, each with its current fallback.
- `fontSizeBase300` uses `--text-body-medium`. Scale other existing Base/Hero sizes by their current Fluent ratio to Base300 rather than inventing host ramp names.
- Normalize `--leading-body-medium` through a browser measurement element at the corresponding body size. Emit a length for `lineHeightBase300`, then scale other line-height lengths by their Fluent ratios. The observed unitless `1.4285` must not enter tokens used in height calculations.
- Existing page-title roles use `--font-sans-display` with their current sans fallback and retain Dude's existing size and line-height roles: 20px in the ordinary-size fixtures, with the existing hierarchy/reflow for larger body text. Do not consume `--text-title-large` or `--leading-title-large`, introduce a Fluent `fontFamilyDisplay` token, or apply display type to every toolbar heading.
- Apply `--text-code-inline` only to actual inline-code styles, preserving its relative `em` meaning. Do not put that relative size into the shared body token. Keep other code hierarchy scaled from the body size.

Missing or unusable values retain the corresponding Fluent value. Permit wrapping and reflow instead of shrinking host text to fit. Font stacks are not a font-download API; verify actual rendered glyphs in the host.

### 6. Live observation and preference rereads

Extend the existing `useSyncExternalStore` appearance subscription. Observe relevant documented html/body tone attributes, stylesheet changes in head, and the media-query change event. Do not depend on observed private `data-copilot-canvas-theme-*` stylesheet attributes.

Coalesce callbacks, compare only consumed values and tone, and notify only when they change. CSS references follow same-tone colors/fonts; recompute normalized lengths and contrast overrides only when their inputs change. Disconnect observers/listeners on cleanup. Repeated unchanged mutations must cause no reset, preference write, network request, or render loop.

Do not remount App or Review for appearance changes. Retain selection, drafts, and the existing Review lifetime.

Reread the saved boolean on visible focus and Appearance entry, following the existing focus-refresh convention in `frontend\use-canvas-data.js`. Keep those reads separate from host-style observation. No polling, cross-process daemon, broadcast protocol, or persistent browser cache is required. Another simultaneously visible project can retain its old choice until refocused; the user confirmed this bounded Ship disposition through round-1 approval.

### 7. Review tone and palette normalization

Pass only resolved host `light` or `dark` into Review, never the saved preference or a theme name. Reuse its current engine update path without replacing the engine lifetime. Do not inject Canvas colors or typography into the reviewed iframe.

`ui\review\engine.mjs` currently reads custom-property strings into its saved annotation palette, while `lib\review\data.mjs` accepts only hex/rgb(a) colors. Host variables and derived states can resolve to `color-mix()` or `color(srgb ...)`.

Resolve palette colors in the browser and serialize explicit sRGB rgb(a) values before save or capture. Preserve alpha and normalize font-family values as well. Keep the server's closed palette and light/dark schema; do not widen it to arbitrary CSS to avoid this conversion.

Test saved markup, sealing, restoration, and live-palette invalidation through this boundary. Existing stale-markup behavior remains when a pinned view's tone or palette changes; retain the markup rather than silently rebinding it. This is coupled to FR-017 through FR-019, not a new Review feature.

### 8. Settings Appearance

Extend `frontend\settings.jsx` with the approved `Packs | Appearance | About` order. Reuse the existing Settings destination and genuine Fluent Switch labeled "Follow GitHub app theme". Use the approved scope hint from the spec; checked state represents the confirmed choice.

During a save, show "Saving..." with the pending indicator, prevent duplicate submissions, and keep focus through Fluent's disabled-focusable behavior. A lost reply shows the checking/reread state and never automatically repeats the POST. Announce a confirmed success without visible "Saved" text or a toast. Show preference-specific failure feedback. The failed-read action is labeled "Retry", not "Read again", and performs only the fixed preference GET; retrying a failed save requires a new explicit switch action. Retain focus while Retry is reading and move it to the switch after a successful read, as the mock shows. Do not reuse agent-delivery uncertainty wording or add Save/Apply controls.

Hide Reload packs and pack-only footer content on Appearance. Use the approved Appearance scope status in their place; opening Appearance must not acquire a pack catalog.

Apply the approved narrow rules to the existing Settings content container, in both modes:

- At 479px or less, hide section-tab icons and use Fluent's small-tab 6px inline padding, preserving the compact single header row where it fits.
- At 300px or less, put the title on its own row and replace the fixed two-column tabs with `repeat(auto-fill, minmax(min(100%, 6.5em), 1fr))`. Keep labels whole, allow the rows they need, and retain at least the mock's 32px tab height.
- At 300px or less, place the Switch label above the track using Fluent's label-above anatomy. Do not shrink labels, text, or targets to force a fit.

Keep Packs/About behavior, vertical-left navigation, work selection, drafts, and Review continuity unchanged. Scope text must say the choice applies to this user across projects on this computer, not imply a repository setting or instant broadcast. Implement in the normal source paths; do not copy mock-only controls, fixture values, or the mock document into the product.

## Guardrail Checks

| Guardrail | Application |
| --- | --- |
| Definition authority and design gate | The unique defined owner names the exact spec path. The user's direct chat approval binds only round 1 in the spec Revision Log. Stage new open units without inherited evidence; task state and closure remain coordinator-owned. |
| Keep it simple | One boolean, a small file helper, two fixed routes, and an adapter in the existing appearance owner. No database, theme catalog, generic settings service, polling, speculative concurrency protocol, or copied theme. |
| Canvas continuity and functional realism | Preserve the 052 workspace and current Settings/Review behavior, with the approved narrow-header adaptation. Keep variants and the approved mock unchanged; every product affordance stays inside the declared capability envelope. |
| Accessibility and harness-first verification | Verify actual color pairings, geometry, keyboard/focus, announcements, and rendered fonts. Complete the automated user journey before requesting any host-only observation. |
| Authoritative source and runtime independence | Edit `src` and rebuild/project runtime outputs. Do not hand-edit generated mirrors or read optional installed packs at runtime. |

Existing project and bundle rules cover the feature. No new guardrail candidate requires adoption, narrowing, rejection, or a user checkpoint. The four bounded Ship dispositions originated with the definition owner and are now confirmed by approval of the reported round-1 design; they do not rewrite user-controlled answers or add project-wide rules.

## Change Surface

Paths below are planned implementation surfaces, not changes made during definition.

| Surface | Change |
| --- | --- |
| `src\extensions\dude\lib\canvas-preferences.mjs` | New fixed local-user preference reader/writer. |
| `src\extensions\dude\lib\canvas-server.mjs` | Closed GET/POST routes and HTML bootstrap. |
| `src\extensions\dude\frontend\theme.js` | Host tone, token/type adaptation, contrast normalization, live observation, and bounded preference client state. |
| `src\extensions\dude\frontend\app.jsx` | Initialize from bootstrap, select the provider theme, keep preference lifetime stable, and pass truthful Review tone. |
| `src\extensions\dude\frontend\settings.jsx` and `styles.js` | Appearance section, feedback, approved responsive navigation, conditional pack chrome, and display-font page titles at Dude's existing size. |
| `src\extensions\dude\frontend\review.jsx` | Only if needed to carry the separate truthful-tone update through its existing lifetime. |
| `src\extensions\dude\ui\index.html` | Bootstrap slot and choice-aware first-paint page styling. |
| `src\extensions\dude\ui\review\engine.mjs` | Saved/captured palette and font normalization. Keep `lib\review\data.mjs`'s closed schema. |
| `src\extensions\dude\ui\assets\app.js` and `app.js.LEGAL.txt` | Rebuilt UI and resulting legal inventory. |
| `src\extensions\dude\canvas-server.test.mjs` and `review.test.mjs` | Preference, bootstrap, route, tone, and palette regressions. |
| `src\extensions\dude\needs-you.test.mjs` | Only if shared server integration requires an affected provider fixture or assertion to change. |
| `scripts\dude-canvas-ui\browser.test.mjs`, `t011-browser.test.mjs`, and `t012-installed-host.mjs` | Complete interaction and Review journeys, host-contract fixtures, isolated preference homes, runtime list, and asset pins. |
| `scripts\dude-canvas-ui\build.test.mjs` and `scripts\build-dev.test.mjs` | Build/legal/static parity and current asset pins. |
| `docs\commands.md` | Appearance behavior and maintainer acceptance. |

No new extension tool/action, manifest change, or dependency-manifest change is expected. Switch is already in the lockfile; its first frontend use can still add bundled license entries.

### Build and generated mirror

For an authorized execution owner, `node scripts\dude-canvas-ui\build.mjs` rebuilds committed source assets. `node scripts\build-dev.mjs` projects those already-built runtime bytes and reconciles development metadata; it does not rebundle.

Inspect current preimages before projection. Use the normal development projection only when it preserves unrelated work and stays within the selected task's exact writer paths. Otherwise select the changed outputs through `listCoreOutputs` and `writeCoreOutput` from `scripts\build-release.mjs`, refusing missing or duplicate matches.

The affected generated runtime mirror is:

- `.github\extensions\dude\lib\canvas-preferences.mjs`
- `.github\extensions\dude\lib\canvas-server.mjs`
- `.github\extensions\dude\ui\index.html`
- `.github\extensions\dude\ui\review\engine.mjs`
- `.github\extensions\dude\ui\assets\app.js`
- `.github\extensions\dude\ui\assets\app.js.LEGAL.txt`

There is no frontend source mirror to edit. Do not repeat 084's historical dirty-worktree restriction as a claim about current state.

Update actual rebuilt asset hashes/sizes in all five pinning scripts: `build-dev.test.mjs`, `build.test.mjs`, `browser.test.mjs`, `t011-browser.test.mjs`, and `t012-installed-host.mjs`. Update the installed-host Review-engine pin and add the preference helper to its explicit runtime inventory. Preserve historical design/reference hashes and earlier approvals.

### Documentation

Update `docs\commands.md` where Settings currently says it has exactly two sections. Describe Appearance's off default, one-user/one-computer scope, storage location, immediate current-view application after save, adoption by other projects on focus/entry, live host changes, missing-host fallback, accessibility overrides, and honest read/write failures. Use "Retry" for the preference read and describe announced success without visible "Saved" text.

Keep pack operations and their authorities unchanged. Extend Canvas maintainer acceptance with the host-contract fixtures, isolated preference home, and the remaining embedded-host checks.

## Verification

These are planned checks for implementation and testing owners. No terminal command, build, test, or lint was run during this definition.

Name new server, Review, and browser cases `085 App theme:`. Start with the corresponding `--test-name-pattern="085 App theme"` selections. Then run the affected server and Review suites, both browser suites explicitly and serially in required-browser mode, and build/projection/installed-host acceptance under `docs\commands.md#canvas-maintainer-acceptance`.

| Trace | Required evidence | Existing runner |
| --- | --- | --- |
| US1; FR-001, FR-002, FR-004, FR-006, FR-009, FR-010, FR-012, FR-015; SC-001 | Absent/off defaults; choice-aware HTML bootstrap; first visible provider/page agreement; one switch action; pending focus/state; success announcement without visible "Saved" text; unchanged off screenshots outside the approved header; no agent or pack action. Replace exact static HTML-byte assertions with explicit expected-bootstrap assertions, retaining static asset byte checks. | `canvas-server.test.mjs`, `browser.test.mjs` |
| US2; FR-003, FR-005, FR-013; SC-002 | Distinct project servers and fresh ports share one isolated preference file; restart persistence; focus/Appearance reread; absent read creates nothing; no repository writes; ordinary simultaneous setters leave a complete valid document. | `canvas-server.test.mjs`, `browser.test.mjs`, `t012-installed-host.mjs` |
| US4; FR-008, FR-014 through FR-016; SC-004, SC-005 | Missing/malformed/unreadable storage, unwritable save, and lost response remain honest; the action named "Retry" is a read; no automatic POST replay. Host/Origin, JSON type, extra-field, caller-path/root, and body-limit refusals preserve existing boundaries. | `canvas-server.test.mjs`, `browser.test.mjs` |
| US3; FR-007, FR-017, FR-018; SC-003 | Host tone precedence, invalid attributes, attribute/media disagreement, same-tone palette/type changes, unchanged mutation bursts, cleanup, and retained selection/input. Host mutations cause no preference network work. | `browser.test.mjs`, `t011-browser.test.mjs` |
| FR-006, FR-008, FR-010 through FR-012; SC-005; VSC-001 through VSC-004 | Ordinary and reported purple light/dark fixtures; M-derived control edges; dark accent fills with dark labels/thumbs; Fluent status hues with stronger text; shared rail/table-header/pager background and faint rules; display-font page titles at Dude's existing size. Also deficient border/text pairs, unavailable values/fonts, larger type, unitless line heights, relative inline code, forced colors, and actual contrast. Exercise the 479px/300px content rules, every specified viewport, and 200% zoom. Capture screenshots, geometry, accessibility tree, and complete keyboard/focus/error journeys. | `browser.test.mjs`, embedded-host follow-up |
| FR-017 through FR-019; SC-006 | On/off and truthful host tones; modern CSS/alpha colors normalize to accepted rgb(a); save, seal, restore, and capture succeed; existing pinned markup survives and becomes stale when required. No style injection into the reviewed page. | `review.test.mjs`, `t011-browser.test.mjs`, installed-host acceptance |
| FR-020; SC-002, SC-003 | Appearance entry/switch sends no pack reload, operation, agent turn, or external-service request. Existing Packs/About and Needs you flows retain their behavior. | `browser.test.mjs`, affected provider regressions |
| FR-021; SC-007 and delivery parity | Exact mock approval precedes task derivation/UI source. Rebuilt source/runtime/generated bytes, legal inventory, five pins, Review-engine pin, and the new helper agree. | Design owner; `build.test.mjs`, projection check, `t012-installed-host.mjs` |

Use Node 22+, configured browser and installed-host paths, and `DUDE_CANVAS_BROWSER_REQUIRED=1`. Record executed, failed, and skipped counts; skips or zero selected tests do not prove coverage.

Isolate `COPILOT_HOME` for every affected fixture server, not just new tests: serving `/` now reads preferences, so an unrelated test must not read or write the maintainer's real choice or depend on it. Pass the isolated environment to spawned servers and installed-host acceptance too. Test the unset-variable fallback with a controlled home location. Keep fixture and evidence directories in owned project-relative locations.

Focused commands:

```powershell
node --test --test-name-pattern="085 App theme" src\extensions\dude\canvas-server.test.mjs
node --test --test-name-pattern="085 App theme" src\extensions\dude\review.test.mjs
node --test --test-concurrency=1 --test-name-pattern="085 App theme" scripts\dude-canvas-ui\browser.test.mjs scripts\dude-canvas-ui\t011-browser.test.mjs
```

After focused cases, the relevant existing commands include:

```powershell
node --test src\extensions\dude\canvas-server.test.mjs src\extensions\dude\review.test.mjs
node --test scripts\dude-canvas-ui\build.test.mjs
node --test --test-concurrency=1 scripts\dude-canvas-ui\browser.test.mjs
node --test --test-concurrency=1 scripts\dude-canvas-ui\t011-browser.test.mjs
node --test --test-name-pattern="checked-in dev core is a byte-identical non-mutating projection of authoritative source" scripts\build-dev.test.mjs
node scripts\dude-canvas-ui\t012-installed-host.mjs
```

Run `node --test src\extensions\dude\needs-you.test.mjs` and any affected provider regressions when server integration changes touch their shared boundary. The coordinator retains normal lint and execution-state authority.

Complete the automated interaction script before human host smoke, including click count, retained selected-versus-query state, complete list discovery, keyboard/focus, screenshots, geometry, accessibility tree, contrast, and failure transitions. Limit the remaining host observation to actual injection timing, real same-tone palette/type delivery, and actual font-face rendering that the harness cannot establish. The coordinator should observe the first dogfood open and live theme switch; request human observation only for any remaining host-only gap.

## Phases And Handoff

1. Round 1 is approved as bound in the spec Revision Log. Preserve `.dude/specs/085-dude-canvas-app-theme/design/app-theme.html` and its screenshots as evidence of that exact revision. No successor is approved by this record.
2. Execute the two new serial units through ordinary Work: T001@4c8f2a91 establishes the fixed preference store/routes with server tests and their projection; T002@7b3d90e6 depends on it and applies the complete approved Canvas slice, including bootstrap, switch, theme/type adaptation, live observation, and coupled Review normalization. Each unit includes its tests and gets one Tester and one independent Reviewer. Neither inherits completion evidence.
3. T002 also rebuilds, projects, documents, and verifies final bytes. Complete the required browser suites and affected regressions, compare rendered output with the approved mock, then complete only the host-specific observation that remains. Use the Design Close Protocol in `tasks.md`; task state, close classification, and closure stay with the coordinator.

## Risks And Reversibility

- Host injection and font availability remain unverified. Use documented values and fallbacks; do not claim the server can supply missing app fonts or eliminate delays before host injection.
- A deficient custom palette requires visible departures from exact copying. The approved mock shows the accessibility policy, but product measurements must cover actual paired states rather than assuming the app's palette is safe.
- Modern CSS colors can otherwise break Review's closed saved-palette contract. Browser normalization and save/seal/restore tests are required parts of this slice.
- Another simultaneously visible project may retain its old choice until refocus or Appearance entry. This is the approved bounded behavior, not an instant-sync promise.
- Bootstrap makes all page-serving fixtures sensitive to the user's preference location. Isolated homes and updated parity assertions prevent tests from consuming or changing real user data.

Successfully saving off restores the existing visual mode. Reverting the implementation leaves an inert user preference file and needs no repository-data migration or deletion. No new reset command or cleanup service is proposed.
