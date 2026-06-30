---
applyTo: '**/*.{css,scss,html,jsx,tsx,vue,svelte,md,mdx,astro}'
description:
  Typography rules — use Segoe UI with the documented fallback stack for branded
  internal UI.
---

# Microsoft Typography Rules

## Font stack

Always use the documented stack, exposed as `--ms-font-body` /
`--ms-font-heading` / `--ms-font-mono`:

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

## Rules

- **Don't add Google Fonts** (Roboto, Open Sans, Inter, …) as a
  "Microsoft-style" substitute. Segoe UI ships with the OS; fall back to
  `system-ui`.
- **Don't load Segoe UI from a CDN** — it's licensed with Microsoft products.
- **Do allow optical sizing** for Segoe UI Variable
  (`font-optical-sizing: auto`). In HTML/CSS this is automatic, but the token
  CSS sets it explicitly on `.ms-brand`.
- **Headings** are Semibold (600), using role-specific line heights from
  `--ms-lh-display` through `--ms-lh-h4`.
- **Body** is Regular (400), normal line-height (1.5), minimum 14 px (default 16
  px).
- **Code** is Cascadia (or the monospace fallback) at the same body size or one
  step smaller.
- **Documentation sites** should use `.ms-docs` plus `.ms-docs-content`, which
  follows Microsoft Learn's article rhythm: wide content wrappers, 688 px
  readable prose, 40/52 title, 32 px H2, 16/28 body, 14 px tables/tabs/code.
- **Cap weights per surface at 2** (e.g., 400 + 600). Avoid Light (300) for
  body.
- **No all-caps headings by default.** Uppercase is reserved for small eyebrow
  labels.

## Pairings (defaults)

| Token             | Weight | Size  | Line-height              |
| ----------------- | ------ | ----- | ------------------------ |
| `--ms-fs-display` | 600    | 48 px | `--ms-lh-display` / 1.15 |
| `--ms-fs-h1`      | 600    | 36 px | `--ms-lh-h1` / 1.2       |
| `--ms-fs-h2`      | 600    | 28 px | `--ms-lh-h2` / 1.25      |
| `--ms-fs-h3`      | 600    | 22 px | `--ms-lh-h3` / 1.3       |
| `--ms-fs-body`    | 400    | 16 px | `--ms-lh-body` / 1.5     |
| `--ms-fs-caption` | 400    | 13 px | `--ms-lh-caption` / 1.4  |

## Documentation Pairings

| Token                                       | Role                         | Value         |
| ------------------------------------------- | ---------------------------- | ------------- |
| `--ms-docs-content-width`                   | Content wrapper              | 100%          |
| `--ms-docs-readable-width`                  | Prose measure                | 688 px        |
| `--ms-docs-wide-width`                      | Tables/code/reference blocks | 100%          |
| `--ms-docs-fs-title` / `--ms-docs-lh-title` | Page title                   | 40 px / 52 px |
| `--ms-docs-fs-h2` / `--ms-docs-lh-h2`       | Section heading              | 32 px / 1.3   |
| `--ms-docs-fs-h3` / `--ms-docs-lh-h3`       | Subsection heading           | 28 px / 1.3   |
| `--ms-docs-fs-body` / `--ms-docs-lh-body`   | Article body                 | 16 px / 28 px |
| `--ms-docs-fs-compact`                      | Tables and tabs              | 14 px         |

## See also

- [../skills/dude-pack-ms-brand-visual/reference/typography.md](../skills/dude-pack-ms-brand-visual/reference/typography.md)
