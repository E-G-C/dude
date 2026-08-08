---
name: strata
description: "Layered visual system for interfaces, graphics, data visualization, and documents: one structural language with two colour palettes, plane-and-rule elevation with no drop shadows, working UI type scale, 4/8 spacing, motion, and measured accessibility — in CSS, SCSS, JSON, and Tailwind, with a folder-local token validator."
provides:
  agents:
    - dude-pack-strata-stylist
  skills:
    - dude-pack-strata-visual
  instructions:
    - dude-pack-strata-visual-system.instructions.md
  prompts:
    - dude-pack-strata-apply-visual-system.prompt.md
---

# Strata

A layered visual system for anything with a visual design — web pages,
applications, graphics, data visualization, and long-form documents.

The name is literal. Structurally the system is layers: `canvas`, `surface`,
`soft`, `sunken`, and a boundary is read by seeing its **edge**. Strata is
unaffiliated with any company, product, or design system, and claims no
identity. It is a set of neutral, accessible, deliberately un-generic defaults
you are expected to recolour.

## The four commitments

**1. Stratification, not shadow.** No `box-shadow` anywhere. Depth is a flat
tonal change plus a 1px hairline rule. On a white or near-white ground the tonal
change is almost nothing, so **the rule is doing the work** — a plane without a
rule is not a plane.

**2. Square-ish.** 4px radius on interactive elements, 8px maximum on large
containers. Far from the rounded default, but a working product radius rather
than a statement.

**3. Type-led, at working scale.** Hierarchy comes from size, weight, and rules.
No editorial hero. Monospace marks metadata — labels, column heads, identifiers,
axis ticks — and nothing else.

**4. Fields have edges.** Any filled element that carries meaning — a chart bar,
a status badge, a swatch — gets a 1px border. Several palette slots measure below
the non-text contrast floor against a light page, so without a border the object
has no perceivable boundary.

## Two palettes

Strata ships **one structural language and two colour palettes**. Structure —
spacing, type, radius, motion, elevation, every component — is single-sourced and
identical. Only colour swaps.

```html
<html data-strata-palette="pigment"  data-strata-theme="light">  <!-- the default -->
<html data-strata-palette="spectrum" data-strata-theme="dark">
```

- **`pigment`** (default) — mineral pigments: azurite, verdigris, malachite,
  orpiment, cinnabar, amethyst, rhodochrosite. Ground is pure white.
- **`spectrum`** — a cooler near-white ground and a broader spectral spread:
  blue, teal, green, amber, red, violet, magenta.

Omitting `data-strata-palette` yields `pigment`. All four palette/theme
combinations are contrast-validated; see
`skills/dude-pack-strata-visual/reference/colors.md`.

**Token ids are role-based.** `--strata-primary`, `--strata-series-3`,
`--strata-danger-text`. The mineral and spectral names are documentation, not
token names — which is what lets a component work unchanged under either
palette. Never reference a colour by name in component code.

## Provides

### Agent

- `dude-pack-strata-stylist` — applies and self-checks the system on any visual
  surface.

### Skill

- `dude-pack-strata-visual`:
  - `reference/` — colour (both palettes, the three-form model, the categorical
    ramp), typography, layout and iconography, provenance and licensing.
  - `examples/` — `controls.html` (application chrome), `data-surface.html`
    (data visualization), `reading-surface.html` (long-form document).
  - `tokens/` — CSS, SCSS, JSON, and a Tailwind preset.
  - `scripts/` — `strata-check.sh` / `strata-check.ps1`, folder-local
    validators.

### Instructions

- `dude-pack-strata-visual-system.instructions.md` — colour, typography,
  spacing, radius, elevation, motion, data visualization, and accessibility
  rules for matching source files.

### Prompts

- `dude-pack-strata-apply-visual-system.prompt.md` — apply the system to a
  surface, then run the built-in self-check.

## Install / remove

```bash
@dude add pack strata
@dude remove pack strata
```

## Fonts

Strata names Atkinson Hyperlegible and Noto Sans and falls back to the platform
UI font. **It ships no font files, declares no `@font-face`, and loads nothing
remotely.** On a machine without those families the realistic rendering is the
platform default — a supported outcome, not a degraded one. See
`skills/dude-pack-strata-visual/reference/provenance-and-licensing.md`.

## Optional integrations

Strata is framework-agnostic and assumes no build tool, template language, or
site generator. It applies equally to a React app, an SVG chart, a static page,
or a printed report.

If you happen to be using a static-site generator, the tokens drop in like any
other stylesheet — import `tokens/strata.css`, or `tokens/strata.scss` from your
theme's own variables file. That is an integration detail, not a dependency, and
nothing here requires it.
