---
applyTo: '**/*.{html,css,scss,jsx,tsx,vue,svelte,md,mdx,astro}'
description:
  Apply Microsoft visual brand (colors, Segoe UI, four-square logo, 8-pt
  spacing) to internal UI files.
---

# Microsoft Visual Brand — Default Rules

When working on any internal UI surface (HTML, CSS/SCSS, React/Vue/Svelte
components, Markdown/MDX, Astro), follow these visual rules.

## Tokens are the source of truth

- **Never hardcode** `#F25022`, `#7FBA00`, `#00A4EF`, `#FFB900`, or `#737373`.
  Reference the CSS custom property (`var(--ms-red)` …) or the Tailwind class
  (`text-ms-red` …).
- **Import the tokens** before adding branded styles:
  - CSS: `@import "../skills/dude-pack-ms-brand-visual/tokens/ms-brand.css";`
    from `.github/instructions/`, or use the correct relative path from the
    target file.
  - SCSS:
    `@use "../skills/dude-pack-ms-brand-visual/tokens/ms-brand.scss" as ms;`
    from `.github/instructions/`, or use the correct relative path from the
    target file.
  - Tailwind: extend the config with
    `.github/skills/dude-pack-ms-brand-visual/tokens/tailwind.preset.js`.
- If a token does not exist for a value you need, **add it to the token file**
  rather than inlining.

## Colors

- Default accent for primary actions: `--ms-blue`.
- Use a **single accent per surface**. Don't spray all four squares as section
  dividers, button rows, or rainbow gradients.
- Semantic mapping:
  - success → `--ms-green`
  - warning → `--ms-yellow`
  - danger → `--ms-red`
- Text contrast: WCAG AA minimum (4.5:1 body, 3:1 large).

## Typography

- Body / UI font: `var(--ms-font-body)` (Segoe UI Variable Text / Segoe UI
  Variable first, Segoe UI fallback).
- Code / terminal: `var(--ms-font-mono)` (Cascadia stack).
- Headings: Segoe UI Semibold (`600`), using the role-specific `--ms-lh-*`
  line-height tokens.
- Documentation pages: use `.ms-docs` and `.ms-docs-content` for Microsoft
  Learn-inspired article typography, tables, tabs, code blocks, and tip boxes.
- Don't substitute Roboto, Open Sans, Calibri, or Arial as a "Microsoft-style"
  font — use the documented fallback chain.

## Logo

- For internal work, `.ms-logo-mark` from
  `.github/skills/dude-pack-ms-brand-visual/tokens/ms-brand.css` is the
  standard logo mark implementation.
- Maintain clear space ≥ height of one square.
- Minimum height: 16 px (mark), 20 px (lockup).
- Wordmark color: `--ms-gray` on light, `#FFFFFF` on dark.

## Layout

- Spacing: use the `--ms-space-*` scale (4 / 8 / 12 / 16 / 24 / 32 / 48 / 64
  px).
- Radius: prefer `--ms-radius-md` (4 px) for buttons, `--ms-radius-lg` (8 px)
  for cards. Reserve `--ms-radius-pill` for chips and status pills.
- Elevation: prefer `--ms-elev-1` / `--ms-elev-2`. Avoid heavy drop shadows.

## Iconography

- Use **Fluent UI System Icons** when adding icons. Don't mix icon families on
  one surface.
- Color icons with `currentColor` so they inherit text color.

## Internal-only reminder

If a file or component is heading **outside Microsoft**, stop and warn the user
— they need the official Brand Central assets and review process, not this
bundle.

## See also

- [../skills/dude-pack-ms-brand-visual/reference/colors.md](../skills/dude-pack-ms-brand-visual/reference/colors.md)
- [../skills/dude-pack-ms-brand-visual/reference/typography.md](../skills/dude-pack-ms-brand-visual/reference/typography.md)
- [../skills/dude-pack-ms-brand-visual/reference/logo.md](../skills/dude-pack-ms-brand-visual/reference/logo.md)
- [../skills/dude-pack-ms-brand-visual/reference/layout-and-iconography.md](../skills/dude-pack-ms-brand-visual/reference/layout-and-iconography.md)
