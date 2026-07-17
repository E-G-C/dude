---
name: ms-brand
description: "Microsoft visual brand stylist: logo, typography, color tokens, motion, and brand-audit scripts for branded Hugo/Docsy sites."
provides:
  agents:
    - dude-pack-ms-brand-stylist
  skills:
    - dude-pack-ms-brand-visual
  instructions:
    - dude-pack-ms-brand-ms-logo-usage.instructions.md
    - dude-pack-ms-brand-ms-typography.instructions.md
    - dude-pack-ms-brand-ms-visual-brand.instructions.md
  prompts:
    - dude-pack-ms-brand-apply-ms-brand.prompt.md
    - dude-pack-ms-brand-audit-ms-brand.prompt.md
---

# Microsoft Brand Pack

Applies the Microsoft visual-brand surface (logo usage, typography stack,
color tokens, motion, accessibility) to a site. Built on top of Hugo / Docsy
but can layer on any HTML/CSS surface.

## Provides

### Agent

- `dude-pack-ms-brand-stylist` — owns brand application and brand-audit work
  on rendered HTML/CSS surfaces.

### Skill

- `dude-pack-ms-brand-visual` — the brand reference and asset bundle. Includes:
  - `reference/` — the canonical brand rules.
  - `examples/` — worked examples of branded surfaces.
  - `tokens/` — color tokens, including a Tailwind preset (`tailwind.preset.js`).
  - `scripts/` — `brand-check.sh` / `brand-check.ps1` audit scripts.

### Instructions

- `dude-pack-ms-brand-ms-logo-usage.instructions.md`
- `dude-pack-ms-brand-ms-typography.instructions.md`
- `dude-pack-ms-brand-ms-visual-brand.instructions.md`

### Prompts

- `dude-pack-ms-brand-apply-ms-brand.prompt.md` — apply the Microsoft brand to a rendered surface.
- `dude-pack-ms-brand-audit-ms-brand.prompt.md` — audit a surface against the brand rules.

## Install / remove

```bash
@dude add pack ms-brand
@dude remove pack ms-brand
```

## Related packs

- `hugo` / `docsy` — the typical engine and theme this brand layer sits on top of.
