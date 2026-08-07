---
mode: agent
description:
  Apply the Microsoft visual brand bundle to the current file/selection, then
  self-check (internal use).
---

# Apply Microsoft Visual Brand

Apply the Microsoft visual brand to the file or selection the user provides.
**Internal use only.**

## Inputs to gather (if not obvious)

- Which file(s) / component(s) to brand.
- Surface mode: **light** (default) or **dark**.
- Build system: plain CSS, SCSS, Tailwind, or design-tokens-as-JSON.

If anything is **customer-facing or external**, stop and tell the user to use
Microsoft Brand Central instead. This prompt is for internal artifacts.

## Steps

1. **Read the references** you'll need:
   - [../skills/dude-pack-strata-visual/reference/colors.md](../skills/dude-pack-strata-visual/reference/colors.md)
   - [../skills/dude-pack-strata-visual/reference/typography.md](../skills/dude-pack-strata-visual/reference/typography.md)
   - [../skills/dude-pack-strata-visual/reference/layout-and-iconography.md](../skills/dude-pack-strata-visual/reference/layout-and-iconography.md)

2. **Wire up tokens** matching the build system:
   - Plain CSS / HTML → add
     `<link rel="stylesheet" href=".github/skills/dude-pack-strata-visual/tokens/strata.css">`
     (adjust path as needed from the target file) and a `class="strata"` root.
     For documentation pages, add `strata-docs` to the article surface and wrap the
     main article in `.strata-docs-content`.
   - SCSS →
     `@use ".github/skills/dude-pack-strata-visual/tokens/strata.scss" as strata;`
     (adjust path as needed from the target file) and reference `strata.$strata-blue`,
     etc.
   - Tailwind → import the preset in `tailwind.config.js`.
   - Other / design tokens → consume
     [../skills/dude-pack-strata-visual/tokens/strata-tokens.json](../skills/dude-pack-strata-visual/tokens/strata-tokens.json).

3. **Apply typography**:
   - Set `font-family: var(--strata-font-body)` on body / root.
   - Headings: Segoe UI Semibold with the role-specific `--strata-lh-*` line-height
     tokens.
   - Documentation pages: prefer `.strata-docs` so titles, body, tables, tabs,
     alerts, and code blocks follow the Microsoft Learn-inspired rhythm.
   - Code blocks: `var(--strata-font-mono)` for app surfaces; `.strata-docs` uses
     `var(--strata-font-docs-mono)`.

4. **Apply color**:
   - One accent per surface. Default to `--strata-blue` unless the user specifies a
     state-driven palette (success/warning/danger).
   - Neutrals do the heavy lifting (`--strata-bg`, `--strata-bg-subtle`, `--strata-text`,
     `--strata-text-muted`, `--strata-border`).
   - On a dark surface, add `data-strata-theme="dark"` to the container.

5. **Apply layout**:
   - Switch arbitrary paddings/margins to the 8-pt scale (`--strata-space-*`).
   - Buttons: `class="strata-btn strata-btn-primary"` / `strata-btn-secondary` /
     `strata-btn-subtle` / `strata-btn-destructive`.
   - Cards: `.strata-panel` (or equivalent).

6. **Apply motion**:
   - Durations and easings come from `--strata-dur-*` and `--strata-ease-*`.
   - Anything you animate must be covered by
     `@media (prefers-reduced-motion: reduce)`.

7. **Run the self-check below** and fix everything in **Fail** or **Warn**
   before declaring done.

## Final self-check

Run the checklist below and produce a markdown table of **Pass / Warn / Fail**
per item, with file:line references.

### Colors

- [ ] No hardcoded brand hex values (`#F25022`, `#7FBA00`, `#00A4EF`, `#FFB900`,
      `#737373`) — must use tokens, except in token/reference files or visible
      swatch labels that document the token values.
- [ ] No brand colour written in `rgb()` / `rgba()` form to evade a hex check.
- [ ] No "almost" brand colors (`#F35022`, `#0099E5`, `#00A1EE`, …) — flag any
      close-but-wrong shade.
- [ ] Only one accent color per surface (count unique brand accents per visible
      section).
- [ ] WCAG AA contrast satisfied on text and interactive elements.
- [ ] Four-square palette is **not** used as a gradient or background wash.

### Typography

- [ ] Body / heading font stack references `--strata-font-body` /
      `--strata-font-heading`, or lists `"Segoe UI Variable Text"` /
      `"Segoe UI Variable"` before `"Segoe UI"`.
- [ ] `font-optical-sizing: auto` is present when custom typography CSS bypasses
      `.strata`.
- [ ] Documentation pages use `.strata-docs`; prose is constrained to
      `--strata-docs-readable-width`, while tables/code/reference blocks can use
      `--strata-docs-wide-width`.
- [ ] No Google-Font / CDN imports of Roboto, Open Sans, Inter, Calibri, etc. as
      a Microsoft substitute.
- [ ] Headings use Semibold (600) with tight line-height (≤ 1.3).
- [ ] Body size ≥ 14 px (default 16 px).
- [ ] No more than 2 weights per surface; no all-caps headings as a default.

### Layout

- [ ] Paddings / margins map to the `--strata-space-*` 8-pt scale (no random 7px,
      13px, 19px).
- [ ] Radius values come from the radius scale (no `border-radius: 6px` etc.).
- [ ] Shadows use `--strata-elev-*` (no `0 10px 40px rgba(…)`-style dramatic
      shadows).
- [ ] Buttons use `.strata-btn*` (or the equivalent token-driven styles).

### Motion

- [ ] Durations and easings come from tokens.
- [ ] No easing token is defined with a CSS keyword — use explicit
      `cubic-bezier()`, because `ease-out` silently means
      `cubic-bezier(0, 0, 0.58, 1)`.
- [ ] Every animated property is covered by `prefers-reduced-motion: reduce`.

### Iconography

- [ ] Icons come from a single family (Fluent UI System Icons recommended).
- [ ] Icons inherit color via `currentColor` rather than hardcoded fills.

### Misc

- [ ] No emoji used as functional UI iconography.
- [ ] File is not flagged as customer-facing (`README`, manifest, deployment
      config) without an external-use warning.

### Output format

```
| Area | Item | Status | Location | Notes |
|---|---|---|---|---|
| Colors | Hardcoded #00A4EF in primary button | Fail | src/Header.tsx:42 | Replace with var(--strata-blue) |
| Typography | Roboto loaded from Google Fonts | Fail | index.html:8 | Remove; use Segoe UI stack |
| Layout | border-radius: 6px on card | Warn | styles.css:120 | Use --strata-radius-lg (8px) or --strata-radius-md (4px) |
```

After the table, offer the user **"Want me to fix the Fail and Warn items?"**
and proceed if confirmed.

## Output

Return:

- The edited file(s).
- A short bulleted list of what changed (tokens imported, font set, accent
  color).
- The self-check table.
- The exact reminder line: **"Internal use only — for any external release, use
  Microsoft Brand Central."**
