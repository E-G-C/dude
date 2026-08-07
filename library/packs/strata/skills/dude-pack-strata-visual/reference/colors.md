# Colour

Strata ships **one structural system and two colour palettes**. Structure —
spacing, type, radius, motion, elevation, every component — is single-sourced and
identical between them. Only colour swaps.

```html
<html data-strata-palette="pigment"  data-strata-theme="light">  <!-- the default -->
<html data-strata-palette="spectrum" data-strata-theme="dark">
```

Omitting `data-strata-palette` gives you `pigment`.

## Token ids are role-based

This is the most important rule in the pack, so it comes first.

**Never reference a colour by name in component code.** There is no
`--strata-azurite` and no `--strata-blue`. There is `--strata-series-1`, and
azurite and blue are two *values* for it.

```css
/* correct — survives a palette switch */
.thing { background: var(--strata-primary); }
.chart-bar-1 { fill: var(--strata-series-1); }

/* wrong — no such token, and naming a colour defeats the whole architecture */
.thing { background: var(--strata-azurite); }
```

Both palettes expose an identical id set in both themes, which
`scripts/strata-check.sh` asserts in all six pairwise directions. An id present
in one branch and missing from another is a *silent* runtime failure: the custom
property simply stops resolving after a palette switch, with no error anywhere.

## The three-form model

Every categorical slot ships in three forms, because a colour that works as a
fill usually does not work as text.

| Form | Use it for | Never use it for |
|---|---|---|
| `--strata-series-N` (**vivid**) | fills, chart marks, badge accents | text on a light plane |
| `--strata-series-N-deep` | text on a light plane, **and** the fill under white text | — |
| `--strata-series-N-tint` + `-tint-ink` | badge field and its text/border pair | a fill with no border |

**Vivid fills, deep writes.** In the light themes most vivid slots fail badly as
text — the amber slots measure under 2:1 — so any text in a series colour uses
the `-deep` form, or the matching `--strata-<state>-text` role token.

Two slots per palette are text-safe in vivid form (`series-1` and `series-6`),
so *their* `-deep` is a hover/emphasis variant rather than a correction. The
distinction is documented per slot in `tokens/strata-tokens.json`.

**In both dark themes all seven slots are text-safe**, so `-deep` collapses to a
hover variant across the board. That asymmetry is a trap worth naming: **code
written and checked only in dark mode will have light-mode contrast bugs.**

## Semantic roles

Roles are palette-independent aliases onto slots. Components use these.

| Role | Slot | Notes |
|---|---|---|
| `--strata-primary` / `-deep`, `--strata-hover` | `series-1` | default accent |
| `--strata-info` / `--strata-info-text` | `series-2` | |
| `--strata-success` / `--strata-success-text` | `series-3` | |
| `--strata-warning` / `--strata-warning-text` | `series-4` | fill takes **dark** text via `--strata-on-warning` |
| `--strata-danger` / `--strata-danger-text` | `series-5` | see below |
| `--strata-focus` | `series-6` | no semantic state role, deliberately |

**Two role subtleties that are easy to get wrong.**

*Warning takes dark text.* Keeping the amber genuinely amber means white on it
is unreadable, so `--strata-on-warning` is the ink colour, not white.

*The destructive button fills with `--strata-danger-text`, not `--strata-danger`.*
White on the vivid danger slot measures only 4.21:1 in `pigment` and fails AA
normal. Using the deep form in both palettes keeps one component rule correct
after a palette switch. It means the "danger" token you reach for first is not
the one the destructive button uses — an ergonomic wart, accepted knowingly.

*Focus carries no state meaning.* That is what keeps a focused danger control
readable: the ring is never the same hue as the thing it is focusing.

## Fields need edges

Several vivid slots and **every** tint measure below the 3:1 non-text floor
against their own plane. A bare fill or a bare tint badge has no perceivable
boundary — the text inside it is readable, but the object is not there.

```css
/* a meaning-bearing fill */
.bar { fill: var(--strata-series-3); }
.bar { stroke: var(--strata-rule); stroke-width: 1; }   /* or .strata-mark */

/* a badge: the ink is both the text and the border */
.badge {
  background: var(--strata-series-3-tint);
  color: var(--strata-series-3-tint-ink);
  border: 1px solid currentColor;
}
```

This is the stratification model applied to data: a field is legible because of
its edge, exactly like a plane.

## Planes

| Token | Role |
|---|---|
| `--strata-canvas` | the page ground |
| `--strata-surface` | raised plane |
| `--strata-soft` | inset plane |
| `--strata-sunken` | the deepest plane |

**In the light themes the whole plane scale spans about 1.15:1, and in `pigment`
canvas and surface are the same value.** Tone does essentially no work on a
white ground, so *every plane change must be accompanied by a rule* or the
layering is not perceivable at all. Both tokens still exist because they diverge
in the dark themes.

## Rules and hairlines

| Token | Contrast | Use |
|---|---|---|
| `--strata-rule` | ≥ 3:1 on every plane, both themes | plane edges, field boundaries, control borders, table rules — anything a user must perceive |
| `--strata-hair` | ~1.25:1, deliberately below the floor | decorative only: chart gridlines, the border on an inline code span |

`--strata-rule` is shared across both themes in each palette — one value clears
the non-text floor everywhere, so there is no `rule-strong` split.

**`--strata-hair` is the one genuinely dangerous token in the pack.** It sits one
token away from `--strata-rule` in both name and appearance, and misusing it
produces a control boundary at around 1.25:1 that looks perfectly fine in code
review. If a divider separates anything a user must perceive, it is not hair.

## The categorical ramp

All seven slots form a data-visualization series, ordered to maximise the
luminance gap between neighbours.

The ramp is differentiated by **hue**, not by luminance. Even optimally ordered,
adjacent series reach only about 2:1 in light and less in dark. That is partly
correct for categorical data — iso-luminance avoids implying that one series
outranks another — but it has two hard consequences:

1. **Colour-vision deficiency.** Neighbouring hues at equal luminance have no
   fallback cue.
2. **Greyscale.** Printed or photocopied, several pairs are the same grey.

So the rule is mandatory, not advisory:

> A categorical series using more than **two** slots must carry a **non-colour
> encoding**: direct labelling, distinct markers or dash patterns, texture, or
> ordered position. Label with `--strata-ink` / `--strata-muted`, never the
> series colour. **Never** use this ramp for sequential or diverging data — that
> needs monotonic luminance, which these seven deliberately do not have.

Seven slots is also the ceiling. The hue space is full: the palettes were tuned
to keep every pair separable on at least one channel, and an eighth slot would
not fit without collapsing a neighbour pair.

## Code surface

`--strata-code-bg` / `-code-text` / `-code-muted` are **dark in both themes** and
shared by both palettes, so a snippet looks the same wherever it lands. Note
that `--strata-muted` is a *plane* token and fails on the code surface — use
`--strata-code-muted` there.

## Recolouring

Strata is a starting point, not a mark to protect. To recolour, replace the
values inside a palette block in `tokens/strata.css` and keep the id set
identical. Run `scripts/strata-check.sh` afterwards: it will tell you if you
dropped an id, if you put a structural token inside a palette block, or if a
component started naming a slot instead of a role.

Measured contrast for all four surfaces is recorded in
[provenance-and-licensing.md](provenance-and-licensing.md).
