# Layout, spacing, elevation, and iconography

Visual rules of thumb that make a surface feel calm, grid-driven, and
confidently typographic — without reaching for depth effects.

## Spacing scale

A 4/8 base scale. Tokens are `--strata-space-*`.

| Token | Px | Use |
|---|---|---|
| `--strata-space-0` | 0 | reset |
| `--strata-space-1` | 4 | icon ↔ label, dense controls |
| `--strata-space-2` | 8 | inside a control |
| `--strata-space-3` | 12 | between related items |
| `--strata-space-4` | 16 | default gap |
| `--strata-space-5` | 24 | between sections in a panel |
| `--strata-space-6` | 32 | between panels |
| `--strata-space-7` | 48 | between page sections |
| `--strata-space-8` | 64 | hero padding |

Every padding, margin, and gap comes from this scale. The validator fails the
build on an off-scale literal.

## Radius scale

**4px is the interactive default. 8px is the maximum.**

| Token | Px | Use |
|---|---|---|
| `--strata-radius-sm` | 2 | inline code, small inline marks |
| `--strata-radius-md` | 4 | **default** — buttons, inputs, chips, panels, cards, bars |
| `--strata-radius-lg` | 8 | ceiling — large containers |
| `--strata-radius-pill` | 9999 | retained, **discouraged** |

Square-ish is a deliberate position. Pill buttons and `rounded-xl`-and-above are
on the avoid list; 4px reads as a working product radius rather than a
statement.

## Elevation — stratification, not shadow

**There is no `box-shadow` in this system.** Not on panels, not on menus, not on
the focus ring, not in the token set. The validator fails on one.

Depth is expressed the way rock layers express it: a **flat tonal change** plus a
**1px edge**.

| Plane | Token | With |
|---|---|---|
| ground | `--strata-plane-base` | — |
| raised | `--strata-plane-raised` | `border: var(--strata-rule-hairline)` |
| inset | `--strata-plane-inset` | `border: var(--strata-rule-hairline)` |
| sunken | `--strata-plane-sunken` | `border: var(--strata-rule-hairline)` |

```css
.panel {
  background: var(--strata-plane-raised);
  border: var(--strata-rule-hairline);
  border-radius: var(--strata-radius-md);
  padding: var(--strata-space-5);
}
```

**The rule is not optional.** In the light themes the plane scale spans only
about 1.15:1 in luminance, and in `pigment` the canvas and surface planes are
literally the same value. Without its edge a raised panel is invisible. This is
the trade the system makes: no depth effects, and an edge that always has to be
there.

Sibling planes in a list or stack share a single edge:

```css
.strata-stack > * + * { border-top: var(--strata-rule-hairline); }
```

## Grid

- **Page max width:** 1280px content; let gutters breathe.
- **Columns:** 12-col is standard; 4-col on mobile.
- **Gutter:** 24px desktop, 16px mobile.
- **Reading measure:** constrain prose to `--strata-reading-measure` (688px)
  while letting tables, figures, and code use the full width.

## Buttons

| Variant | Background | Text | Border |
|---|---|---|---|
| Primary | `--strata-primary` | `--strata-on-accent` | none |
| Secondary | transparent | `--strata-ink` | 1px `--strata-rule` |
| Subtle | `--strata-soft` | `--strata-ink` | 1px `--strata-rule` |
| Destructive | `--strata-danger-text` | `--strata-on-accent` | none |

- Height: 32px (compact), 40px (default), 48px (touch).
- Padding: `--strata-space-4` horizontal at default height.
- Radius: `--strata-radius-md`.
- Weight: 600.

Destructive deliberately fills with `--strata-danger-text` rather than the vivid
danger slot — white on the vivid slot fails AA normal in one of the palettes.

## Focus

```css
outline: 2px solid var(--strata-focus);
outline-offset: 2px;
```

`outline` is painted outside the border box, so the offset leaves a gap showing
the parent plane. The ring is therefore flanked by plane colour on both sides
and its contrast never depends on the fill underneath it.

**The offset is load-bearing, not cosmetic.** At `outline-offset: 0` the ring
sits directly on the fill and drops below the 3:1 floor against almost every
fill in the system. Never reduce it below 2px. The SCSS mixin raises an `@error`
if you try.

Never paint a focus ring with `box-shadow` — it is banned, and the outline
approach is better anyway because it is fill-independent by construction.

## Motion

- Durations: `--strata-dur-micro` (150ms), `--strata-dur-standard` (250ms),
  `--strata-dur-entrance` (400ms).
- Easings: `--strata-ease-enter` / `--strata-ease-exit`, both
  `cubic-bezier(0.2, 0, 0, 1)`.
- Avoid bouncy or playful overshoot.

**Never define an easing token with a CSS keyword.** `ease-out` means exactly
`cubic-bezier(0, 0, 0.58, 1)`, and the keyword hides that number from review —
which is how a cross-format disagreement once survived in this pack unnoticed.
The validator fails on a keyword easing token.

Anything you animate must be covered by a reduced-motion block:

```css
@media (prefers-reduced-motion: reduce) {
  /* durations collapse to 1ms, not 0s, so transitionend still fires */
}
```

## Iconography

Strata ships no icons and mandates no icon family. Generic guidance:

- Use **one family per surface**. Don't mix sets.
- Colour icons with `currentColor` so they inherit text colour.
- Default sizes: **16, 20, 24, 32, 48**.
- Stroke icons are ~1.5px nominal at 24px.
- Pair icon and label with `--strata-space-2`.
- Where a family offers outline and filled variants, pair them — outline for
  inactive, filled for active or selected.
- **Don't use emoji as functional UI iconography.**

If you want an off-the-shelf open-source set, Fluent System Icons is MIT
licensed and works well at these sizes. It is an **optional, unaffiliated**
dependency — Strata has no relationship with it, and its trademarks belong to
their owner. Any other MIT or SIL-licensed family is equally fine.

## Imagery

- Prefer **flat illustration** or clean photography with calm backgrounds.
- Avoid stock photos containing third-party logos.
- Keep imagery on its own plane with a rule, like any other field.

## Accessibility

Non-negotiable, and measured rather than assumed:

- **Contrast:** 4.5:1 for body text, 3:1 for large text and non-text UI.
- **Focus must be visible** — two-toned by construction and offset ≥ 2px.
- **Never communicate state with colour alone.** Pair with an icon, a label, or
  a shape. This applies to charts as much as to UI state.
- **Fills and fields need edges.** A field that carries meaning and has no
  perceivable boundary fails SC 1.4.11 even when its text is readable.

Measured ratios for all four palette/theme surfaces are recorded in
[provenance-and-licensing.md](provenance-and-licensing.md).

## Patterns to avoid

These are pattern-matched to a period rather than to a principle, but they date
a surface fast:

pill buttons · `rounded-xl` and above · coloured glow shadows · gradient meshes ·
glassmorphism and backdrop blur · floating cards · low-contrast grey body text ·
centred-hero-plus-three-cards layouts · emoji as icons · warm cream grounds ·
oversized editorial headlines · monospace used as a manifesto voice rather than
to mark data.
