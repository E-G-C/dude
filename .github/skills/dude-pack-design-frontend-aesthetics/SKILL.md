---
name: "dude-pack-design-frontend-aesthetics"
description: "Use when setting or reviewing a new or revised UI's visual direction, layout concept, hero, motion, or signature element so it fits a brief rather than a generic generated default. Do NOT use to select or enforce palette, typography, spacing, tokens, branding, theme, or visual-system details; an installed visual-system, theme, or branding skill owns them; if none exists, use dude-pack-design-workflow for proposal, approval, and verification."
license: Apache-2.0 complete terms in LICENSE
---

# Frontend Design

## Purpose

Keep direction specific to the brief, not a generated default. This skill defines no
palette, type scale, spacing scale, token set, brand, theme, or visual system. An
installed visual-system, theme, or branding skill owns those details; defer
entirely. Without one, propose the direction for approval through
`dude-pack-design-workflow`; never silently invent or enforce it. That workflow
alone owns approval and visual-quality/accessibility verification.

## Procedure

1. **Ground it.** When the brief omits them, identify the subject, audience, and
   page's single job. Use real content, project context, known user preferences,
   and the subject's own materials and vernacular.
2. **Plan before code.** Create a brief-led layout concept and one intentional
   focal/signature idea. Draw concrete visual choices from the installed owner or
   workflow-approved direction. Let the opening express the subject's central
   idea; let structure communicate real content. Use sequence markers only for
   genuine sequence.
3. **Critique against the brief.** Generative work converges on reusable looks. The brief
   wins when it explicitly names a direction. Compare the plan with what a
   comparable prompt would produce; if both land in the same place, it is a
   default, so revise. Test whether motion has a purpose, complexity suits the
   direction, and typography supports it; defer every concrete type choice to its
   owner. State what changed and why.
4. **Build the approved result.** Implement only the approved, revised direction.
   Check CSS selector specificity: `.section` versus `.cta` can conflict, especially
   around section padding and margins. Where visual inspection is available,
   render or screenshot, then self-critique before presenting.
5. **Keep copy usable.** Keep action names consistent (`Publish` -> `Published`);
   explain an error's cause and remedy; make empty states invite action. Defer
   prose tone/style to `dude-pack-writing-style` and AI-writing tells to
   `dude-pack-writing-avoid-ai-tropes`.

## Fidelity

Treat the approved direction as the implementation contract. Do not redesign
while building. Any material adaptation must cite user input, accessibility, or
product truth.

Preserve composition, hierarchy, and material without copying pixels at the
expense of semantics or responsive reflow. Keep text, controls, layout, and
presentation chrome in code; rasterize only intrinsic image material.

Review rendered evidence. Classify salient elements as match, justified
adaptation, missing, contradicted, or unapproved addition.

## Review

- The hero/opening communicates the subject's central idea.
- Structure reveals content, not decoration; motion serves a purpose; complexity
  matches the direction.
- Use restraint: one intentional focal idea and no decoration unsupported by the
  brief.
