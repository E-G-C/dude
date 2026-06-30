# Workspace Copilot Instructions

This workspace ships the **Microsoft Visual Brand Bundle** (internal use only).

Copilot, when working in this workspace:

- **Treat the bundle in
  [`.github/skills/dude-local-ms-visual-brand/`](skills/dude-local-ms-visual-brand/)
  as the source of truth** for Microsoft visual identity — colors, Segoe UI
  typography, four-square logo placement, 8-pt spacing, Fluent iconography.
- **Pull design tokens** from
  [`.github/skills/dude-local-ms-visual-brand/tokens/`](skills/dude-local-ms-visual-brand/tokens/)
  (`ms-brand.css`, `ms-brand.scss`, `ms-brand-tokens.json`,
  `tailwind.preset.js`). Never hardcode brand hex values.
- **Auto-applied rules** live in [`.github/instructions/`](instructions/) and
  trigger by file type (HTML/CSS/SCSS/JSX/TSX/Vue/Svelte/MD/MDX/Astro).
- **Workflow prompts** live in [`.github/prompts/`](prompts/) — `apply-ms-brand`
  to brand a file, `audit-ms-brand` to check one.
- **Custom agent** definition lives in
  [`.github/agents/dude-local-ms-brand-stylist.agent.md`](agents/dude-local-ms-brand-stylist.agent.md).
- **Skill entry** is
  [`.github/skills/dude-local-ms-visual-brand/SKILL.md`](skills/dude-local-ms-visual-brand/SKILL.md);
  user-facing overview is
  [`.github/skills/dude-local-ms-visual-brand/README.md`](skills/dude-local-ms-visual-brand/README.md).

## Scope guard (read this first)

This bundle is **for internal artifacts only** — internal demos, dashboards,
docs, slides.

If the artifact is or could become **external** (customer-facing site, partner
co-marketing, ad, packaging, app icon, social handle), **stop** and direct the
user to Microsoft Brand Central (see
[`.github/skills/dude-local-ms-visual-brand/reference/sources.md`](skills/dude-local-ms-visual-brand/reference/sources.md)).

## Quick map

| Need                   | Go to                                                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Brand a new file       | [prompts/apply-ms-brand.prompt.md](prompts/apply-ms-brand.prompt.md)                                                                           |
| Check an existing file | [prompts/audit-ms-brand.prompt.md](prompts/audit-ms-brand.prompt.md)                                                                           |
| Pick a color           | [skills/dude-local-ms-visual-brand/reference/colors.md](skills/dude-local-ms-visual-brand/reference/colors.md)                                 |
| Pick a font size       | [skills/dude-local-ms-visual-brand/reference/typography.md](skills/dude-local-ms-visual-brand/reference/typography.md)                         |
| Place the logo         | [skills/dude-local-ms-visual-brand/reference/logo.md](skills/dude-local-ms-visual-brand/reference/logo.md)                                     |
| Layout & icons         | [skills/dude-local-ms-visual-brand/reference/layout-and-iconography.md](skills/dude-local-ms-visual-brand/reference/layout-and-iconography.md) |
| See it working         | open `demo.html` at the workspace root                                                                                                         |
