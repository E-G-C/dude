# Layout, spacing, and iconography

Clearline uses an 8-point grid with 4-point half steps, restrained radii, soft
elevation, and bounded long-form measures.

## Spacing and shape

| Token | Value | Typical use |
| --- | --- | --- |
| `--cl-space-1` | 4 px | Dense icon and label gap |
| `--cl-space-2` | 8 px | Control padding |
| `--cl-space-3` | 12 px | Related items |
| `--cl-space-4` | 16 px | Default gap |
| `--cl-space-5` | 24 px | Card sections |
| `--cl-space-6` | 32 px | Card separation |
| `--cl-space-7` | 48 px | Page sections |
| `--cl-space-8` | 64 px | Hero padding |

Use `--cl-radius-sm` for compact controls, `--cl-radius-md` for buttons and
inputs, and `--cl-radius-lg` for `.cl-card` and larger containers. Reserve
`--cl-radius-pill` for chips and tags.

`--cl-elev-1` through `--cl-elev-3` are short, soft shadows. Pair a raised
surface with a border so the edge remains legible.

## Content measures

Wrap a long-form page in `.cl-docs` and its article in `.cl-docs-content`.
The article wrapper can sit within a page shell; its child tiers must all begin
at the same left edge. Wider content extends to the right rather than centering
inside the article.

| Tier | Token | Content |
| --- | --- | --- |
| Page shell | `--cl-docs-page-width` | Masthead, footer, full-width bands |
| Article and figure | `--cl-docs-content-width`, `--cl-docs-figure-width` | Article wrapper, figures, diagrams |
| Wide | `--cl-docs-wide-width` | Tables, code, callouts, card rows |
| Readable | `--cl-docs-readable-width` | Headings, prose, lists, quotes |

Use `.cl-docs-readable`, `.cl-docs-wide`, and `.cl-docs-figure` when a child
needs an explicit tier. Do not invent an intermediate width for one element.

## Buttons and controls

| Variant | Background | Foreground | Border |
| --- | --- | --- | --- |
| Primary | `--cl-color-primary-bg` | `--cl-color-primary-fg` | None |
| Secondary | Transparent | `--cl-text` | `--cl-color-control-border` |
| Subtle | `--cl-bg-subtle` | `--cl-text` | None |
| Destructive | `--cl-color-danger-bg` | `--cl-color-danger-fg` | None |
| `.cl-input` | `--cl-bg` | `--cl-text` | `--cl-color-control-border` |

Use `--cl-control-height-compact`, `--cl-control-height-default`, or
`--cl-control-height-touch`. The default is a 40 px outer height for
`.cl-btn` and `.cl-input`; shared border-box sizing keeps padding and borders
inside it. Buttons use `--cl-space-4` horizontal padding; inputs use
`--cl-space-2`. Controls use semibold text and `--cl-radius-md`. The dark
theme activates `--cl-color-control-border-on-dark`; use this semantic role,
not `--cl-border`, for an essential boundary.

Focusable controls need the focus ring and halo, a 2 px outline, and a 2 px
offset. `.cl-theme-dark` or `[data-cl-theme="dark"]` selects the dark pair;
the default pair is for light Clearline surfaces.

## Motion

Use `--cl-dur-micro`, `--cl-dur-standard`, and `--cl-dur-entrance` for short
state changes. Use `--cl-ease-enter` for entrances and
`--cl-ease-exit` (`cubic-bezier(0, 0, 0.2, 1)`) for exits.

The CSS classes reduce transition and animation duration to
`--cl-dur-reduced` when `prefers-reduced-motion: reduce` is active. SCSS
consumers can apply `@include cl-reduced-motion` to their surface root.
Tailwind consumers can pair the preset values with Tailwind's `motion-reduce`
variant.

## Icons and imagery

Choose one open-source icon family for a surface. Use one stroke weight and
color icons with `currentColor`. Common icon sizes are 16, 20, 24, 32, and 48.

Use calm-background illustration or product photography. Use assets the project
has rights to use, and do not use a project mark as a functional interface icon.
