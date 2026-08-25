---
name: clearline
description: "Framework-agnostic visual system for interfaces, graphics, documents, and slides: calm neutrals, four accents, Inter typography, an 8-point grid with 4-point half steps, a shared left edge, and an optional project-supplied mark."
use-cases: [ui, visual-design]
provides:
  agents:
    - dude-pack-clearline-stylist
  skills:
    - dude-pack-clearline-visual
  prompts:
    - dude-pack-clearline-apply-visual-system.prompt.md
---

# Clearline

Clearline is a framework-agnostic visual system for pages, applications,
graphics, slides, and long-form documents. It uses calm neutrals, four
restrained decorative accents, Inter, an 8-point grid with 4-point half steps,
and bounded measures with a shared left edge.

It ships no logo. A project can supply a mark when a surface needs one.

## Provides

### Agent

- `dude-pack-clearline-stylist` applies Clearline after the user explicitly
  selects it.

### Skill

- `dude-pack-clearline-visual` contains tokens, references, examples, and
  folder-local checks.

### Prompt

- `dude-pack-clearline-apply-visual-system.prompt.md` applies Clearline to a
  selected surface and audits the result.

## Install / remove

```bash
@dude add pack clearline
@dude remove pack clearline
```
