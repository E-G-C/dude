# Typography

Two families, a working UI scale, and a separate measure for long-form reading.

## The two families

```css
--strata-font-sans: "Atkinson Hyperlegible", "Noto Sans", system-ui, -apple-system,
                    BlinkMacSystemFont, sans-serif;
--strata-font-mono: "Noto Sans Mono", "Liberation Mono", ui-monospace, SFMono-Regular,
                    Menlo, Consolas, monospace;
```

That is the whole font system. Two families, no display face, no variable-font
axes to configure.

**Atkinson Hyperlegible** is designed for low-vision readability — its letterforms
are deliberately hard to confuse with one another. **Noto Sans** is the broad
second choice. Both fall through to the platform UI font.

## What will actually render

Atkinson Hyperlegible and Noto Sans are named first, but **neither ships with any
mainstream operating system**. Strata bundles no font files, declares no
`@font-face`, and loads nothing from a CDN — so on a machine where the user has
not installed them, the browser falls through to `system-ui` and the page renders
in the platform's default UI font.

**That is the realistic default rendering, and it is a supported outcome, not a
fallback failure.** The type scale, the weight discipline, the line-height
pairings, the plane-and-rule elevation, and every measured contrast ratio are
font-independent, so the system behaves correctly either way. If you want the
named faces to appear, install them or self-host them in your own project —
Strata will not do it for you and does not claim to.

The validator enforces this: it fails on any `@font-face` rule or remote font
import inside the pack.

## Type scale

Working UI scale. There is no editorial hero: the largest routine heading is
`--strata-fs-h1` at 36px. `--strata-fs-display` exists for a rare genuine title
and is not the default page opener.

| Role | Weight | Size | Line-height | Token |
|---|---|---|---|---|
| Display | 600 | 48px | 1.15 | `--strata-fs-display` |
| H1 | 600 | 36px | 1.2 | `--strata-fs-h1` |
| H2 | 600 | 28px | 1.25 | `--strata-fs-h2` |
| H3 | 600 | 22px | 1.3 | `--strata-fs-h3` |
| H4 | 600 | 18px | 1.35 | `--strata-fs-h4` |
| Body large | 400 | 18px | 1.5 | `--strata-fs-body-lg` |
| Body | 400 | 16px | 1.5 | `--strata-fs-body` |
| Caption | 400 | 13px | 1.4 | `--strata-fs-caption` |
| Micro | 400 | 11px | 1.3 | `--strata-fs-micro` |

## Reading scale

For long-form reading surfaces — an article view, a changelog, a release note, an
in-app help panel, a generated report, an onboarding walkthrough. Apply
`.strata-reading` to the surface and `.strata-reading-content` to the column.

| Role | Weight | Size | Line-height | Token |
|---|---|---|---|---|
| Page title | 600 | 40px | 52px | `--strata-reading-fs-title` |
| H2 | 600 | 32px | 1.3 | `--strata-reading-fs-h2` |
| H3 | 600 | 28px | 1.3 | `--strata-reading-fs-h3` |
| Body | 400 | 16px | 28px | `--strata-reading-fs-body` |
| Table / tab / compact | 400 / 700 | 14px | 1.5 | `--strata-reading-fs-compact` |
| Code block | 400 | 14px | 19px | `--strata-reading-fs-code` |

Body sits at **16/28** rather than the 16/1.5 used for application chrome. That
is deliberate: sustained reading wants a looser rhythm than dense UI. Prose is
constrained to `--strata-reading-measure` (688px) while tables, figures, and code
blocks use the full width.

This is a *reading* surface, not a documentation-site theme. It ships no
theme-specific selectors and assumes no site generator, template language, or
build tool.

## Metadata

Monospace has exactly one job here: **marking data**.

```css
.strata-meta {
  font-family: var(--strata-font-mono);
  font-size: var(--strata-fs-micro);
  letter-spacing: var(--strata-meta-tracking);   /* 0.06em */
  text-transform: var(--strata-meta-transform);  /* uppercase */
  color: var(--strata-muted);
}
```

Use it for small labels, table column heads, field labels, identifiers, axis
ticks, timestamps, and status chips. It gives chrome a technical, plotted
register that separates it from content without adding colour or boxes.

**It is not a voice.** Letterspaced uppercase monospace as a hero statement, a
section manifesto, or decorative label-as-art is its own recognisable trend and
is on the avoid list. If it is not marking data, it is not monospace.

This is also the only place uppercase is correct.

## Rules

- **Headings** are Semibold (600) with tight line-height (≤ 1.3).
- **Body** is Regular (400) at 16px, minimum 14px.
- **Cap weights per surface at 2** (400 + 600). Avoid Light for body text.
- **No all-caps headings**, ever — uppercase is reserved for `.strata-meta`.
- **No remote font loading.** No Google Fonts, no CDN, no `@font-face`.
- **No display hero.** Working scale only.
- Code is `--strata-font-mono` at the same body size or one step smaller.

## Colour and text

The pigment slots have a text-safety split that matters here:

- A **vivid** slot (`--strata-series-N`) is a fill. In the light themes most of
  them fail as text — the amber slots measure under 2:1.
- Use the **`-deep`** form, or the matching `--strata-<state>-text` role token,
  for any text in a series colour on a light plane.
- In the dark themes every slot is text-safe, so this distinction disappears —
  which means **text colour written and checked only in dark mode will have
  light-mode bugs.**

Body text uses `--strata-ink`; secondary text uses `--strata-muted`. Neither is
low-contrast grey: both clear AA normal comfortably on every plane. On the code
surface use `--strata-code-muted`, because `--strata-muted` is a plane token and
fails there.

## Code

```css
@import url("../tokens/strata.css");

body { font-family: var(--strata-font-sans);
       font-size: var(--strata-fs-body); line-height: var(--strata-lh-body); }
h1   { font-size: var(--strata-fs-h1);
       font-weight: var(--strata-fw-semibold); line-height: var(--strata-lh-h1); }
code { font-family: var(--strata-font-mono); }

.strata-reading-content > :where(h1, h2, h3, p, ul, ol) {
  max-width: var(--strata-reading-measure);
}
.strata-reading-content > :where(table, pre, figure) {
  width: 100%; max-width: var(--strata-reading-wide);
}
```

```html
<h1 class="font-strata-sans text-strata-h1">Heading</h1>
<p  class="font-strata-sans text-strata-body">Body text…</p>
<span class="font-strata-mono text-strata-micro tracking-strata-meta uppercase">Label</span>
```

Font licensing is recorded in
[provenance-and-licensing.md](provenance-and-licensing.md).
