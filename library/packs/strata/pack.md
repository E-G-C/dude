---
name: strata
description: "Microsoft visual brand stylist: logo, typography, color tokens, motion, and brand-audit scripts for branded Hugo/Docsy sites."
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

# Microsoft Brand Pack

Applies the Microsoft visual-brand surface (logo usage, typography stack,
color tokens, motion, accessibility) to a site. Built on top of Hugo / Docsy
but can layer on any HTML/CSS surface.

## Provides

### Agent

- `dude-pack-strata-stylist` — owns brand application and self-check work
  on rendered HTML/CSS surfaces.

### Skill

- `dude-pack-strata-visual` — the brand reference and asset bundle. Includes:
  - `reference/` — the canonical brand rules.
  - `examples/` — worked examples of branded surfaces.
  - `tokens/` — color tokens, including a Tailwind preset (`tailwind.preset.js`).
  - `scripts/` — `strata-check.sh` / `strata-check.ps1` audit scripts.

### Instructions

- `dude-pack-strata-visual-system.instructions.md` — colors, typography,
  spacing, radius, elevation, motion, and accessibility rules for matching
  source files.

### Prompts

- `dude-pack-strata-apply-visual-system.prompt.md` — apply the brand to a rendered
  surface, then run the built-in self-check.

## Install / remove

```bash
@dude add pack strata
@dude remove pack strata
```

## Related packs

- `hugo` / `docsy` — the typical engine and theme this brand layer sits on top of.
