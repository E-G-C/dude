---
name: design
description: "A visual design-proposal lane: mood, layout, look-and-feel, mockups, surface design, brand direction, preview approval, and applying an approved visual spec — overlaid on the task/verification lifecycle."
provides:
  agents: []
  skills:
    - dude-pack-design-workflow
---

# Design Pack

An opt-in **design-proposal lane**. Where the core lanes (Lightweight Execution
from `tasks.md`, or Tracked Execution from the `beads` pack) govern *building*,
this lane governs *deciding what a surface should look like*: propose → mockup →
preview → approve → apply. It overlays the task/verification lifecycle the same
way the `beads` pack overlays execution — it is a way of working, not a
technology domain.

## Provides

- `dude-pack-design-workflow` — the proposal workflow: mood/layout/look-and-feel
  exploration, mockups, preview approval, and applying an approved visual spec.
  Defines a `design-gap` as a design-specific subtype of `spec-gap`, uses
  visual-spec checks (`VSC-…`), and leaves a task open/blocked when visual
  evidence fails.

## Independence

This lane stands on its own. Its only required handoffs are to **core**
(`@dude-spec-lead` for the design-shaped spec package, `@dude-reviewer` for an
independent readiness call), so it works in any project — including a hand-
authored Hugo site with no other packs installed.

Its brand steps are **optional and conditional**:

- When the `ms-brand` pack is also installed, the workflow runs the visual-brand
  drift guard (`dude-pack-ms-brand-visual` scripts) and routes visual-quality
  judgment to `@dude-pack-ms-brand-stylist` *when brand or visual identity is
  material*.
- When `ms-brand` is absent, those references are inert (lint surfaces them as
  warnings, not failures) and the lane simply runs without the brand-specific
  step.

So: in a UI-only project you can install **`design` alone** and get the full
propose/approve/apply loop; add `ms-brand` (and/or `hugo` / `docsy`) only if you
want the brand guard and theme specialists wired in.

## Install / remove

```bash
@dude add pack design
@dude remove pack design
```

## Related packs

- `ms-brand` — adds the brand drift-guard and visual-quality authority this lane
  will use when present.
- `hugo` / `docsy` — the surfaces a design spec is typically applied to.
