# Typography

Clearline uses Inter for interface and body text and JetBrains Mono for code.
Both stacks include platform fallbacks, so a surface remains usable without a
font download.

## Font roles

| Role | Token |
| --- | --- |
| Body | `--cl-font-body` |
| Heading | `--cl-font-heading` |
| Application and documentation code | `--cl-font-mono` |

Load Inter only when the project wants the supplied face rather than the
fallback stack:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=JetBrains+Mono:wght@400&display=swap"
  rel="stylesheet"
/>
```

## Weight policy

Use two weights on a Clearline surface:

- Regular (400) for body copy, captions, table cells, and code.
- Semibold (600) for headings, table headers, and key interface labels.

Do not introduce a third weight. The JSON, CSS, SCSS, and Tailwind tokens expose
only these two weights.

## Type scale

| Role | Weight | Size | Line-height | Token |
| --- | --- | --- | --- | --- |
| Display | 600 | 48 px | 1.15 | `--cl-fs-display` |
| H1 | 600 | 36 px | 1.2 | `--cl-fs-h1` |
| H2 | 600 | 28 px | 1.25 | `--cl-fs-h2` |
| H3 | 600 | 22 px | 1.3 | `--cl-fs-h3` |
| H4 | 600 | 18 px | 1.35 | `--cl-fs-h4` |
| Body large | 400 | 18 px | 1.5 | `--cl-fs-body-lg` |
| Body | 400 | 16 px | 1.5 | `--cl-fs-body` |
| Caption | 400 | 13 px | 1.4 | `--cl-fs-caption` |
| Micro | 400 | 11 px | 1.3 | `--cl-fs-micro` |

## Documentation scale

`.cl-docs` uses a reading-oriented scale with the measures described in
[layout and iconography](layout-and-iconography.md#content-measures).

| Role | Weight | Size | Line-height | Token |
| --- | --- | --- | --- | --- |
| Page title | 600 | 40 px | 52 px | `--cl-docs-fs-title` |
| H2 | 600 | 32 px | 1.3 | `--cl-docs-fs-h2` |
| H3 | 600 | 28 px | 1.3 | `--cl-docs-fs-h3` |
| Body | 400 | 16 px | 28 px | `--cl-docs-fs-body` |
| Compact UI | 400 / 600 | 14 px | 1.5 | `--cl-docs-fs-compact` |
| Code block | 400 | 14 px | 19 px | `--cl-docs-fs-code` |

## Consumer examples

Resolve `<clearline-root>` to the installed skill directory or to a copy of the
token file in the project's own asset tree. The import must be relative to the
stylesheet that consumes it.

```css
@import url("<clearline-root>/tokens/clearline.css");

body {
  font-family: var(--cl-font-body);
  font-size: var(--cl-fs-body);
  line-height: var(--cl-lh-body);
}

h1 {
  font-family: var(--cl-font-heading);
  font-size: var(--cl-fs-h1);
  font-weight: var(--cl-fw-semibold);
}
```

Tailwind users can use `font-cl-body`, `font-cl-heading`, `font-cl-mono`,
`font-cl-regular`, and `font-cl-semibold` after loading the preset.
