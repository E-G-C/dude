---
name: dude-pack-strata-visual
description:
  Apply the Strata layered visual system to any visual surface — applications,
  web pages, components, SVG and graphics, data visualization, and long-form
  documents. One structural language with two interchangeable colour palettes
  (pigment, spectrum) across light and dark, plane-and-rule elevation with no
  drop shadows, a square 4px shape language, a working UI type scale, 4/8
  spacing, motion tokens, a seven-slot categorical chart ramp, and measured WCAG
  contrast across all four surfaces, in CSS, SCSS, JSON, and Tailwind. USE WHEN
  the user says "apply Strata", "use the Strata tokens", "wire up --strata-*",
  "switch to the spectrum palette", or "use the pigment palette", or is working
  on an existing Strata surface. Includes folder-local validators (strata-check.sh /
  strata-check.ps1) that check cross-format and cross-palette token parity, the
  no-shadow rule, and the radius ceiling. DO NOT USE FOR applying a real
  company's brand identity, logos, wordmarks, product marks, or trademark
  guidance — Strata is unaffiliated and ships no logo.
---

# Strata Visual System

Strata applies a layered visual system to code and content: planes read by their
edges, a role-based colour model with two interchangeable palettes, a type-led
hierarchy, and measured accessibility.

It is unaffiliated with any company, product, or design system, and ships no
logo, wordmark, or icon. It does not cover trademark or brand policy.

## When to use this skill

Use it only when the user explicitly reaches for Strata — by name, by its
tokens, or by its named palettes — or is working on a surface already built
with Strata:

- Apply Strata, or use the Strata tokens, in any build system
- Wire up the `--strata-*` custom properties
- Switch to the spectrum palette, or use the pigment palette
- Continue work on an existing Strata surface

Do **not** use it for applying a real company's brand identity, generating a
logo or product mark, or trademark guidance. Point the user at that company's
own current guidelines and review process instead.

## Workflow

1. **Identify the surface kind** — application chrome, page, graphic, data
   surface, or reading surface — and the build system.
2. **Read the reference you need:**
   - Colour, palettes, the three-form model → [reference/colors.md](reference/colors.md)
   - Typography → [reference/typography.md](reference/typography.md)
   - Layout, elevation, icons, accessibility →
     [reference/layout-and-iconography.md](reference/layout-and-iconography.md)
   - Provenance, licensing, measured contrast →
     [reference/provenance-and-licensing.md](reference/provenance-and-licensing.md)
3. **Pull tokens, don't hardcode.** Import
   [tokens/strata.css](tokens/strata.css),
   [tokens/strata.scss](tokens/strata.scss),
   [tokens/strata-tokens.json](tokens/strata-tokens.json), or
   [tokens/tailwind.preset.js](tokens/tailwind.preset.js).
4. **Apply the system:**
   - Reference role tokens, never a colour name — that is what makes a component
     survive a palette switch
   - Replace every `box-shadow` with a plane change plus a 1px rule
   - 4px radius on anything interactive, 8px ceiling
   - Give every meaning-bearing fill and every badge an edge
   - Monospace for metadata only
5. **Run the validator** from this skill:
   `bash skills/dude-pack-strata-visual/scripts/strata-check.sh`
   (or `pwsh …/scripts/strata-check.ps1`). It checks cross-format and
   cross-palette token parity, the no-shadow rule, the radius ceiling, keyword
   easings, reduced motion, and local-only fonts.
6. **Run the self-check** in
   [../../prompts/dude-pack-strata-apply-visual-system.prompt.md](../../prompts/dude-pack-strata-apply-visual-system.prompt.md)
   before declaring done, including a check that the surface renders correctly
   under all four palette/theme combinations.

## Quick decision table

| User intent | Go to |
| --- | --- |
| Apply the system to a surface | [../../prompts/dude-pack-strata-apply-visual-system.prompt.md](../../prompts/dude-pack-strata-apply-visual-system.prompt.md) |
| Pick the right colour or palette | [reference/colors.md](reference/colors.md) |
| Pick the right size or weight | [reference/typography.md](reference/typography.md) |
| Spacing, elevation, focus, icons | [reference/layout-and-iconography.md](reference/layout-and-iconography.md) |
| See application chrome working | [examples/controls.html](examples/controls.html) |
| See a data surface working | [examples/data-surface.html](examples/data-surface.html) |
| See a reading surface working | [examples/reading-surface.html](examples/reading-surface.html) |

## Cheat sheet

```text
Palette and theme
  <html data-strata-palette="pigment|spectrum" data-strata-theme="light|dark">
  pigment + light is the default; omit the attributes to get it

Colour — role-based ids, never a colour name
  --strata-primary / -deep / --strata-hover
  --strata-info / -text     --strata-success / -text
  --strata-warning / -text  --strata-danger / -text
  --strata-focus
  --strata-series-1..7      vivid: fills and chart marks
  --strata-series-N-deep    text on a light plane, and the fill under white text
  --strata-series-N-tint / -tint-ink   badge field + its text and border

Planes            canvas -> surface -> soft -> sunken
Rules             --strata-rule (perceivable)  --strata-hair (decorative only)
Elevation         a plane change plus a 1px rule. No box-shadow, ever.
Shape             4px default, 8px ceiling, pills discouraged
Type              --strata-font-sans / -mono; working scale, no display hero
Metadata          .strata-meta — mono, letterspaced, uppercase, small only
Spacing           --strata-space-0..8  (0/4/8/12/16/24/32/48/64)
Motion            --strata-dur-* / --strata-ease-*, plus prefers-reduced-motion
Focus             outline 2px + outline-offset 2px — the offset is load-bearing
```

## Hand-off

When you finish:

- State which tokens file you imported and which palette the surface uses
- List what changed (planes, shape, colour roles, spacing, motion)
- Confirm the validator passed and the self-check table has no Fail or Warn
- Point the user at the example closest to their surface kind
