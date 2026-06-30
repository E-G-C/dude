# Workspace Agent Guidance

This workspace contains the **Microsoft Visual Brand Bundle** for internal
artifacts.

## Custom Agent

Use
[agents/dude-local-ms-brand-stylist.agent.md](agents/dude-local-ms-brand-stylist.agent.md)
when the user asks to:

- apply MS brand
- use Microsoft colors
- add the Microsoft logo
- use Segoe UI typography
- style an internal artifact like Microsoft
- audit an internal file against Microsoft visual branding

## Scope Guard

The bundle is for **internal demos, dashboards, docs, and slides only**.

If the artifact is or could become external — customer-facing site, partner
co-marketing, ad, packaging, app icon, social handle — stop and direct the user
to Microsoft Brand Central using
[skills/dude-local-ms-visual-brand/reference/sources.md](skills/dude-local-ms-visual-brand/reference/sources.md).

## Source Of Truth

- Skill entry:
  [skills/dude-local-ms-visual-brand/SKILL.md](skills/dude-local-ms-visual-brand/SKILL.md)
- Design tokens:
  [skills/dude-local-ms-visual-brand/tokens/](skills/dude-local-ms-visual-brand/tokens/)
- Visual references:
  [skills/dude-local-ms-visual-brand/reference/](skills/dude-local-ms-visual-brand/reference/)
- Workflow prompts: [prompts/](prompts/)
- File instructions: [instructions/](instructions/)

## Operating Rules

- Pull colors, typography, spacing, radius, and elevation from the token files.
- Do not hardcode the Microsoft brand hex values in generated code unless
  documenting the tokens themselves.
- For internal artifacts, `.ms-logo-mark` is the standard logo mark
  implementation.
- Keep the visual treatment restrained: one accent color per surface, Segoe UI
  typography, 8-pt spacing, and Fluent UI System Icons.
