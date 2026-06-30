# Microsoft Typography (Visual Reference)

Microsoft's branding typeface is **Segoe**, with **Segoe UI** as the on-screen variant. Use Segoe UI for all internal branded UI and documents where it's available, with a safe fallback stack otherwise.

## The font stack

```css
--ms-font-body:    "Segoe UI Variable Text", "Segoe UI Variable", "Segoe UI",
                   system-ui, -apple-system, BlinkMacSystemFont,
                   "Helvetica Neue", Helvetica, Arial, sans-serif;
--ms-font-heading: "Segoe UI Variable Text", "Segoe UI Variable", "Segoe UI",
                   system-ui, -apple-system, BlinkMacSystemFont,
                   "Helvetica Neue", Helvetica, Arial, sans-serif;
--ms-font-mono:    "Cascadia Code", "Cascadia Mono", Consolas, "Courier New", monospace;
--ms-font-docs-mono: SFMono-Regular, Consolas, "Liberation Mono", Menlo, Courier, monospace;
```

- **Segoe UI Variable Text** appears in the Microsoft Learn docs stack and gives documentation pages the closest match to Learn's article typography.
- **Segoe UI Variable** is the modern Windows 11 system font. Put it before Segoe UI so HTML/CSS can use its weight and optical-size axes.
- **Segoe UI** ships with Windows and modern Office, and remains the fallback for older environments.
- **Cascadia Code / Cascadia Mono** are Microsoft's open-source monospace families — preferred for code blocks.

The Windows typography reference notes that optical scaling is automatic in HTML when Segoe UI Variable is selected. The token CSS sets `font-optical-sizing: auto` on `.ms-brand` so small UI text and larger headings get the intended outlines when the variable font is available.

If Segoe is not licensed for your context (e.g. a public site), the fallback `system-ui` chain renders a near-equivalent on each OS.

## Weights and styles available

Segoe UI ships in:

- Light (300) / Light Italic
- Semilight (350) / Semilight Italic
- Regular (400) / Italic
- Semibold (600) / Semibold Italic
- Bold (700) / Bold Italic
- Black (900) / Black Italic

## Type scale (internal default)

A clean, screen-first scale. Adjust line-height proportionally if you change sizes.

| Role | Weight | Size | Line-height | CSS token |
|---|---|---|---|---|
| Display | 600 | 48 px | 1.15 | `--ms-fs-display` |
| H1 | 600 | 36 px | 1.2 | `--ms-fs-h1` |
| H2 | 600 | 28 px | 1.25 | `--ms-fs-h2` |
| H3 | 600 | 22 px | 1.3 | `--ms-fs-h3` |
| H4 | 600 | 18 px | 1.35 | `--ms-fs-h4` |
| Body large | 400 | 18 px | 1.5 | `--ms-fs-body-lg` |
| Body | 400 | 16 px | 1.5 | `--ms-fs-body` |
| Caption | 400 | 13 px | 1.4 | `--ms-fs-caption` |
| Micro | 400 | 11 px | 1.3 | `--ms-fs-micro` |

## Documentation scale (Microsoft Learn-inspired)

Use `.ms-docs` on documentation pages and `.ms-docs-content` on the article column. These values are inferred from a live Microsoft Learn article page and are meant for internal documentation sites, not dense dashboards. The wrapper stays wide so tables and code can breathe; prose children use the readable measure.

| Role | Weight | Size | Line-height | Token |
|---|---|---|---|---|
| Page title | 600 | 40 px | 52 px | `--ms-docs-fs-title` |
| H2 | 600 | 32 px | 1.3 | `--ms-docs-fs-h2` |
| H3 | 600 | 28 px | 1.3 | `--ms-docs-fs-h3` |
| Body | 400 | 16 px | 28 px | `--ms-docs-fs-body` |
| Table / tab / compact UI | 400 / 700 | 14 px | 1.5 | `--ms-docs-fs-compact` |
| Code block | 400 | 14 px | 19 px | `--ms-docs-fs-code` |

Learn-like readable prose measure: `--ms-docs-readable-width` = 688 px. The content wrapper token `--ms-docs-content-width` stays at 100% so tables, code blocks, and reference content can use the available page width.

## How to use it

### Do

- Use **Segoe UI Semibold (600)** for headings and key UI labels.
- Use **Segoe UI Regular (400)** for body text.
- Keep body text **≥ 14 px** for readability; default to **16 px**.
- Pair role-specific heading line heights (`--ms-lh-display` through `--ms-lh-h4`) with comfortable body (`--ms-lh-body`).
- Use **Cascadia Code** (or `monospace`) for app code, log output, and terminal UI; use `--ms-font-docs-mono` inside `.ms-docs` for Learn-like documentation code samples.

### Don't

- Don't substitute Calibri, Arial, or Roboto when Segoe UI is available — use the fallback stack instead.
- Don't use more than 2 weights per surface (e.g. 400 + 600). Avoid Light for body text.
- Don't stretch, condense, outline, or apply heavy letter-spacing to Segoe UI.
- Don't use all-caps headings as a default. Reserve uppercase for small eyebrow labels.

## Code

### CSS

```css
@import url("../tokens/ms-brand.css");

body  { font-family: var(--ms-font-body); font-optical-sizing: auto;
        font-size: var(--ms-fs-body); line-height: var(--ms-lh-body); }
h1    { font-family: var(--ms-font-heading); font-size: var(--ms-fs-h1);
        font-weight: var(--ms-fw-semibold); line-height: var(--ms-lh-h1); }
code  { font-family: var(--ms-font-mono); }

.ms-docs-content { width: 100%; max-width: var(--ms-docs-content-width); }
.ms-docs-content > :where(h1, h2, h3, p, ul, ol) { max-width: var(--ms-docs-readable-width); }
.ms-docs-content > :where(table, pre) { width: 100%; max-width: var(--ms-docs-wide-width); }
.ms-docs h1 { font-size: var(--ms-docs-fs-title); line-height: var(--ms-docs-lh-title); }
.ms-docs p  { font-size: var(--ms-docs-fs-body); line-height: var(--ms-docs-lh-body); }
```

### Tailwind

```html
<h1 class="font-ms-heading text-4xl font-semibold leading-tight">Heading</h1>
<p  class="font-ms-body text-base leading-normal">Body text…</p>
<code class="font-ms-mono">npm install</code>
```

## Sources

See [sources.md](sources.md) — Microsoft Typography documents Segoe UI publicly.
