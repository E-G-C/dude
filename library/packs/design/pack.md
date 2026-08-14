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
independent readiness call), so it works in any project with no other packs
installed. The full propose/approve/apply loop and its generic design-quality
gates — accessibility, contrast, provenance, and functional realism — run
entirely inside this lane.

This pack provides no implementation specialist and no visual system.
Implementation of an approved design routes to whichever installed specialist
owns the actual target surface; the lane names none as a default, and when no
owner is installed it asks which specialist owns the target rather than
assuming one.

A chosen visual system is optional and independent of this lane. When a design
selects one, that system is applied by its own pack and recorded only in the
ordinary approved-direction and task wording — no registry, adapter, or schema.
The lane references, requires, and activates no visual system of its own.

## Install / remove

```bash
@dude add pack design
@dude remove pack design
```
