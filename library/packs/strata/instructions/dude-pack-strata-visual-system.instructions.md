---
applyTo: '**/*.{html,css,scss,jsx,tsx,vue,svelte,md,mdx,astro}'
description:
  Visual system rules — colors, typography, spacing, radius, elevation, motion,
  and accessibility for branded internal UI files.
---

# Microsoft Visual Brand — Default Rules

When working on any internal UI surface (HTML, CSS/SCSS, React/Vue/Svelte
components, Markdown/MDX, Astro), follow these visual rules.

## Tokens are the source of truth

- **Never hardcode** `#F25022`, `#7FBA00`, `#00A4EF`, `#FFB900`, or `#737373`.
  Reference the CSS custom property (`var(--strata-red)` …) or the Tailwind class
  (`text-strata-red` …).
- **Watch the notation.** `rgb(242, 80, 34)` is `#F25022`. A guard that matches
  only hex literals will miss it; you should not.
- **Import the tokens** before adding branded styles:
  - CSS: `@import "../skills/dude-pack-strata-visual/tokens/strata.css";`
    from `.github/instructions/`, or use the correct relative path from the
    target file.
  - SCSS:
    `@use "../skills/dude-pack-strata-visual/tokens/strata.scss" as strata;`
    from `.github/instructions/`, or use the correct relative path from the
    target file.
  - Tailwind: extend the config with
    `.github/skills/dude-pack-strata-visual/tokens/tailwind.preset.js`.
- If a token does not exist for a value you need, **add it to the token file**
  rather than inlining.

## Colors

- Default accent for primary actions: `--strata-blue`.
- Use a **single accent per surface**. Don't spray all four squares as section
  dividers, button rows, or rainbow gradients.
- Semantic mapping:
  - success → `--strata-green`
  - warning → `--strata-yellow`
  - danger → `--strata-red`
- Text contrast: WCAG AA minimum (4.5:1 body, 3:1 large).

## Typography

### Font stack

Always use the documented stack, exposed as `--strata-font-body` /
`--strata-font-heading` / `--strata-font-mono`:

```css
"Segoe UI Variable Text", "Segoe UI Variable", "Segoe UI", system-ui,
-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif
```

Put `"Segoe UI Variable Text"` / `"Segoe UI Variable"` before `"Segoe UI"`.
Microsoft Learn includes the `Segoe UI Variable Text` face in its docs stack,
and Windows 11 uses the variable family for weight and optical-size tuning;
`"Segoe UI"` remains the fallback for older Windows and Office environments.

Monospace:

```css
"Cascadia Code", "Cascadia Mono", Consolas, "Courier New", monospace
```

### Rules

- **Don't add Google Fonts** (Roboto, Open Sans, Inter, …) as a
  "Microsoft-style" substitute. Segoe UI ships with the OS; fall back to
  `system-ui`.
- **Don't load Segoe UI from a CDN** — it's licensed with Microsoft products.
- **Do allow optical sizing** for Segoe UI Variable
  (`font-optical-sizing: auto`). In HTML/CSS this is automatic, but the token
  CSS sets it explicitly on `.strata`.
- **Headings** are Semibold (600), using role-specific line heights from
  `--strata-lh-display` through `--strata-lh-h4`.
- **Body** is Regular (400), normal line-height (1.5), minimum 14 px (default 16
  px).
- **Code** is Cascadia (or the monospace fallback) at the same body size or one
  step smaller.
- **Documentation sites** should use `.strata-docs` plus `.strata-docs-content`, which
  follows Microsoft Learn's article rhythm: wide content wrappers, 688 px
  readable prose, 40/52 title, 32 px H2, 16/28 body, 14 px tables/tabs/code.
- **Cap weights per surface at 2** (e.g., 400 + 600). Avoid Light (300) for
  body.
- **No all-caps headings by default.** Uppercase is reserved for small eyebrow
  labels.
- Don't substitute Roboto, Open Sans, Calibri, or Arial as a "Microsoft-style"
  font — use the documented fallback chain.

### Pairings (defaults)

| Token             | Weight | Size  | Line-height              |
| ----------------- | ------ | ----- | ------------------------ |
| `--strata-fs-display` | 600    | 48 px | `--strata-lh-display` / 1.15 |
| `--strata-fs-h1`      | 600    | 36 px | `--strata-lh-h1` / 1.2       |
| `--strata-fs-h2`      | 600    | 28 px | `--strata-lh-h2` / 1.25      |
| `--strata-fs-h3`      | 600    | 22 px | `--strata-lh-h3` / 1.3       |
| `--strata-fs-body`    | 400    | 16 px | `--strata-lh-body` / 1.5     |
| `--strata-fs-caption` | 400    | 13 px | `--strata-lh-caption` / 1.4  |

### Documentation pairings

| Token                                       | Role                         | Value         |
| ------------------------------------------- | ---------------------------- | ------------- |
| `--strata-docs-content-width`                   | Content wrapper              | 100%          |
| `--strata-docs-readable-width`                  | Prose measure                | 688 px        |
| `--strata-docs-wide-width`                      | Tables/code/reference blocks | 100%          |
| `--strata-docs-fs-title` / `--strata-docs-lh-title` | Page title                   | 40 px / 52 px |
| `--strata-docs-fs-h2` / `--strata-docs-lh-h2`       | Section heading              | 32 px / 1.3   |
| `--strata-docs-fs-h3` / `--strata-docs-lh-h3`       | Subsection heading           | 28 px / 1.3   |
| `--strata-docs-fs-body` / `--strata-docs-lh-body`   | Article body                 | 16 px / 28 px |
| `--strata-docs-fs-compact`                      | Tables and tabs              | 14 px         |

## Layout

- Spacing: use the `--strata-space-*` scale (4 / 8 / 12 / 16 / 24 / 32 / 48 / 64
  px).
- Radius: prefer `--strata-radius-md` (4 px) for buttons, `--strata-radius-lg` (8 px)
  for cards. Reserve `--strata-radius-pill` for chips and status pills.
- Elevation: prefer `--strata-elev-1` / `--strata-elev-2`. Avoid heavy drop shadows.

## Motion

- Durations come from `--strata-dur-micro` / `--strata-dur-standard` /
  `--strata-dur-entrance`.
- Easings come from `--strata-ease-enter` / `--strata-ease-exit`, which are declared as
  explicit `cubic-bezier()` values. **Never define an easing token with a CSS
  keyword** — `ease-out` means exactly `cubic-bezier(0, 0, 0.58, 1)`, and the
  keyword hides that from review.
- Anything you animate must be covered by a
  `@media (prefers-reduced-motion: reduce)` block.

## Iconography

- Use **Fluent UI System Icons** when adding icons. Don't mix icon families on
  one surface.
- Color icons with `currentColor` so they inherit text color.

## Internal-only reminder

If a file or component is heading **outside Microsoft**, stop and warn the user
— they need the official Brand Central assets and review process, not this
bundle.

## See also

- [../skills/dude-pack-strata-visual/reference/colors.md](../skills/dude-pack-strata-visual/reference/colors.md)
- [../skills/dude-pack-strata-visual/reference/typography.md](../skills/dude-pack-strata-visual/reference/typography.md)
- [../skills/dude-pack-strata-visual/reference/layout-and-iconography.md](../skills/dude-pack-strata-visual/reference/layout-and-iconography.md)
