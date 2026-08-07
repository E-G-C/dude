---
applyTo: '**/*.{html,css,scss,jsx,tsx,vue,svelte,md,mdx,astro}'
description:
  Strata visual system — role-based colour with two palettes, planes and 1px
  rules instead of shadows, 4px square shape language, type-led hierarchy with
  monospace metadata, 4/8 spacing, motion and reduced motion, categorical chart
  ramp, measured accessibility floors.
---

# Strata Visual System — Default Rules

When working on any visual surface — HTML, CSS/SCSS, React/Vue/Svelte
components, Markdown/MDX, Astro — follow these rules. No framework, build tool,
template language, or site generator is assumed.

## Tokens are the source of truth

- **Import the tokens** before adding styles:
  - CSS: `@import "<path>/tokens/strata.css";` and put `class="strata"` on a root
    element.
  - SCSS: `@use "<path>/tokens/strata.scss" as strata;`
  - Tailwind: add `tokens/tailwind.preset.js` to `presets` **and** import
    `tokens/strata.css` — the preset holds `var()` references, and the
    stylesheet does the palette switching.
  - Design tokens: consume `tokens/strata-tokens.json`.
- **Never inline** a hex, spacing value, radius, or bezier that a token already
  expresses. If the value is genuinely new, add it to `tokens/strata.css` — the
  canonical source — and let the other formats follow.
- **Watch the notation.** `rgb(19, 72, 232)` is `#1348E8`. A guard that matches
  only hex literals will miss it; you should not.

## Never name a palette colour

This is the contract that makes two palettes possible.

```css
/* correct */
.thing  { background: var(--strata-primary); }
.bar-1  { fill: var(--strata-series-1); }

/* wrong — no such token, and it breaks on palette switch */
.thing  { background: var(--strata-azurite); }
.thing  { background: #1348E8; }
```

Both palettes expose an identical id set in both themes. A component that names
a colour has silently bound itself to one palette. Prefer a **role** token
(`--strata-primary`, `--strata-danger-text`) over a **slot**
(`--strata-series-1`) wherever a role exists.

Switch surfaces with attributes, not with different components:

```html
<html data-strata-palette="pigment|spectrum" data-strata-theme="light|dark">
```

## Planes and rules

- Planes are `--strata-canvas` → `--strata-surface` → `--strata-soft` →
  `--strata-sunken`.
- **No `box-shadow`, `backdrop-filter`, or `filter: blur()`.** Ever. Depth is a
  flat tonal change plus `border: var(--strata-rule-hairline)`.
- **Every plane change needs a rule.** In the light themes the plane scale spans
  about 1.15:1 and canvas/surface can be identical, so without an edge a raised
  panel is invisible.
- `--strata-rule` is for anything a user must perceive. `--strata-hair` is
  decorative only at around 1.25:1 — never a control boundary, plane edge, or
  field border.

## Shape

- `--strata-radius-md` (4px) is the default for buttons, inputs, chips, panels,
  and cards.
- `--strata-radius-lg` (8px) is the ceiling for large containers.
- `--strata-radius-sm` (2px) for inline code and small inline marks.
- `--strata-radius-pill` is retained and **discouraged**.

## Colour: the three-form model

| Form | Use for | Never for |
|---|---|---|
| `--strata-series-N` (vivid) | fills, chart marks, badge accents | text on a light plane |
| `--strata-series-N-deep` | text on a light plane, and the fill under white text | — |
| `--strata-series-N-tint` + `-tint-ink` | badge field and its text/border | a fill with no border |

- **Vivid fills, deep writes.** Most vivid slots fail badly as text on a light
  plane — the amber slots measure under 2:1.
- **White text only on a `-deep` form**, or on a vivid slot measured ≥ 4.5:1.
  Amber fills take dark text via `--strata-on-warning`.
- **Destructive fills with `--strata-danger-text`**, not the vivid danger slot.
- **In dark theme every slot is text-safe**, so `-deep` becomes a hover variant.
  Code written and checked only in dark mode will have light-mode contrast bugs.

## Fields have edges

Several vivid slots and every tint measure below the 3:1 non-text floor against
their own plane. A bare fill or bare tint badge has no perceivable boundary.

- Meaning-bearing fills and chart marks: `border`/`stroke` with `--strata-rule`
  (or the `.strata-fill` / `.strata-mark` classes).
- Badges: background is the tint, colour is the `-tint-ink`, border is
  `currentColor`.

## Typography

- Two families only: `--strata-font-sans` and `--strata-font-mono`.
- **No `@font-face`, no remote font import, no font files.** Local-only.
- Headings 600 with line-height ≤ 1.3. Body ≥ 14px, default 16px. Maximum two
  weights per surface.
- **No editorial hero.** Working scale; `--strata-fs-display` is for a rare
  genuine title, not the default page opener.
- **No all-caps headings.**

## Metadata

Monospace has one job: marking data. Use `.strata-meta` for small labels, table
column heads, field labels, identifiers, axis ticks, timestamps, and status
chips. It is the only place uppercase is correct.

It is **not** a voice — letterspaced uppercase mono as a hero statement or
section manifesto is a trend marker and is out.

## Long-form reading surfaces

Use `.strata-reading` on the surface and `.strata-reading-content` on the
column. Prose is constrained to `--strata-reading-measure` (688px); tables,
figures, and code use the full width. Body sits at 16/28, deliberately looser
than application chrome.

This is a reading surface for any product — an article view, a changelog, a
report, a help panel, onboarding. It is not a documentation-site theme and
carries no theme-specific selectors.

## Spacing

Everything comes from `--strata-space-*` (0/4/8/12/16/24/32/48/64). No off-scale
padding, margin, or gap.

## Motion and reduced motion

- Durations from `--strata-dur-*`; easings from `--strata-ease-*`.
- **Never define an easing token with a CSS keyword.** `ease-out` means exactly
  `cubic-bezier(0, 0, 0.58, 1)`, and the keyword hides that from review.
- Everything you animate must be covered by
  `@media (prefers-reduced-motion: reduce)`.

## Focus

```css
outline: 2px solid var(--strata-focus);
outline-offset: 2px;
```

The offset is **load-bearing**: it keeps the ring off the fill so its contrast
never depends on what it lands on. At offset 0 the ring drops below 3:1 against
nearly every fill. Never reduce it, and never paint a focus ring with
`box-shadow`.

## Data visualization

- Use `--strata-series-1` … `-7` in order; they are sequenced to maximise the
  luminance gap between neighbours.
- **Any series beyond two requires a non-colour encoding** — direct labels,
  distinct markers, dash patterns, or ordered position. The ramp is
  hue-differentiated, not luminance-differentiated, so colour alone fails for
  colour-vision deficiency and in greyscale.
- Label with `--strata-ink` / `--strata-muted`, never the series colour.
- Stroke every mark with `--strata-rule`.
- **Categorical only.** Never use the ramp for sequential or diverging data.

## Iconography

- One family per surface. Strata ships none and mandates none.
- Colour icons with `currentColor`.
- Sizes 16/20/24/32/48; ~1.5px stroke at 24px.
- **No emoji as functional UI iconography.**

## Accessibility

- Body text ≥ 4.5:1; large text and non-text UI ≥ 3:1.
- Focus always visible, offset ≥ 2px.
- **Never communicate state with colour alone** — in UI or in charts.
- `--strata-muted` is a plane token; on the code surface use
  `--strata-code-muted`.

## Patterns to avoid

pill buttons · `rounded-xl` and above · coloured glow shadows · gradient meshes ·
glassmorphism and backdrop blur · floating cards · low-contrast grey body text ·
centred-hero-plus-three-cards layouts · emoji as icons · warm cream grounds ·
oversized editorial headlines · monospace as a manifesto voice.

## See also

- [../skills/dude-pack-strata-visual/reference/colors.md](../skills/dude-pack-strata-visual/reference/colors.md)
- [../skills/dude-pack-strata-visual/reference/typography.md](../skills/dude-pack-strata-visual/reference/typography.md)
- [../skills/dude-pack-strata-visual/reference/layout-and-iconography.md](../skills/dude-pack-strata-visual/reference/layout-and-iconography.md)
- [../skills/dude-pack-strata-visual/reference/provenance-and-licensing.md](../skills/dude-pack-strata-visual/reference/provenance-and-licensing.md)
