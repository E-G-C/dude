---
mode: agent
description:
  Apply the Microsoft visual brand bundle to the current file/selection
  (internal use).
---

# Apply Microsoft Visual Brand

Apply the Microsoft visual brand to the file or selection the user provides.
**Internal use only.**

## Inputs to gather (if not obvious)

- Which file(s) / component(s) to brand.
- Surface mode: **light** (default) or **dark**.
- Whether to include the Microsoft logo (and if so, header / footer / hero).
- Build system: plain CSS, SCSS, Tailwind, or design-tokens-as-JSON.

If anything is **customer-facing or external**, stop and tell the user to use
Microsoft Brand Central instead. This prompt is for internal artifacts.

## Steps

1. **Read the references** you'll need:
   - [../skills/dude-local-ms-visual-brand/reference/colors.md](../skills/dude-local-ms-visual-brand/reference/colors.md)
   - [../skills/dude-local-ms-visual-brand/reference/typography.md](../skills/dude-local-ms-visual-brand/reference/typography.md)
   - [../skills/dude-local-ms-visual-brand/reference/logo.md](../skills/dude-local-ms-visual-brand/reference/logo.md)
   - [../skills/dude-local-ms-visual-brand/reference/layout-and-iconography.md](../skills/dude-local-ms-visual-brand/reference/layout-and-iconography.md)

2. **Wire up tokens** matching the build system:
   - Plain CSS / HTML → add
     `<link rel="stylesheet" href=".github/skills/dude-local-ms-visual-brand/tokens/ms-brand.css">`
     (adjust path as needed from the target file) and a `class="ms-brand"` root.
     For documentation pages, add `ms-docs` to the article surface and wrap the
     main article in `.ms-docs-content`.
   - SCSS →
     `@use ".github/skills/dude-local-ms-visual-brand/tokens/ms-brand.scss" as ms;`
     (adjust path as needed from the target file) and reference `ms.$ms-blue`,
     etc.
   - Tailwind → import the preset in `tailwind.config.js`.
   - Other / design tokens → consume
     [../skills/dude-local-ms-visual-brand/tokens/ms-brand-tokens.json](../skills/dude-local-ms-visual-brand/tokens/ms-brand-tokens.json).

3. **Apply typography**:
   - Set `font-family: var(--ms-font-body)` on body / root.
   - Headings: Segoe UI Semibold with the role-specific `--ms-lh-*` line-height
     tokens.
   - Documentation pages: prefer `.ms-docs` so titles, body, tables, tabs,
     alerts, and code blocks follow the Microsoft Learn-inspired rhythm.
   - Code blocks: `var(--ms-font-mono)` for app surfaces; `.ms-docs` uses
     `var(--ms-font-docs-mono)`.

4. **Apply color**:
   - One accent per surface. Default to `--ms-blue` unless the user specifies a
     state-driven palette (success/warning/danger).
   - Neutrals do the heavy lifting (`--ms-bg`, `--ms-bg-subtle`, `--ms-text`,
     `--ms-text-muted`, `--ms-border`).
   - On a dark surface, add `data-ms-theme="dark"` to the container.

5. **Apply layout**:
   - Switch arbitrary paddings/margins to the 8-pt scale (`--ms-space-*`).
   - Buttons: `class="ms-btn ms-btn-primary"` / `ms-btn-secondary` /
     `ms-btn-subtle` / `ms-btn-destructive`.
   - Cards: `.ms-card` (or equivalent).

6. **Logo (only if requested)**:
   - Use `.ms-logo-mark` from the token CSS for internal surfaces.
   - Respect clear space and minimum sizes from
     [../skills/dude-local-ms-visual-brand/reference/logo.md](../skills/dude-local-ms-visual-brand/reference/logo.md).

7. **Audit** — run the checks from
   [audit-ms-brand.prompt.md](audit-ms-brand.prompt.md) before declaring done.

## Output

Return:

- The edited file(s).
- A short bulleted list of what changed (tokens imported, font set, accent
  color, logo added/positioned).
- The exact reminder line: **"Internal use only — for any external release, use
  Microsoft Brand Central."**
