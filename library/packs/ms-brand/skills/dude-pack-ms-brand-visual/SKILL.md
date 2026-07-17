---
name: dude-pack-ms-brand-visual
description:
  Apply Microsoft visual brand (colors, Segoe UI typography, four-square logo
  placement, layout patterns) to internal HTML/CSS/React/Markdown/slides. USE
  WHEN the user says "make this Microsoft-branded", "apply MS brand", "use
  Microsoft colors", "add the Microsoft logo", "Segoe UI", "style this like
  Microsoft", or wants an internal page/deck/component to follow Microsoft's
  visual identity. DO NOT USE FOR external/customer-facing material — point the
  user to the official Microsoft Brand Central instead.
---

# Microsoft Visual Brand Skill (Internal)

This skill applies Microsoft's **visual identity** to internal code and content.
It covers colors, typography, the four-square logo, and basic layout. It does
**not** cover legal/trademark policy — for anything external, defer to official
Microsoft Brand Central.

## When to use this skill

Use it when the user asks to:

- "Make this look like Microsoft" / "apply MS brand" / "use Microsoft colors"
- Theme a React/HTML/Markdown/slide artifact for an internal demo, dashboard, or
  doc
- Add the four-square Microsoft logo or wordmark to an internal page
- Pick a Microsoft brand color for a chart, button, badge, or accent
- Audit an existing page against the Microsoft visual identity

Do **not** use it for:

- Customer-facing marketing, partner co-branding, packaging, swag, app icons, or
  anything published outside Microsoft → redirect to
  [reference/sources.md](reference/sources.md).
- Renaming a product, writing a tagline, or anything involving the Microsoft
  trademark in product naming.

## Workflow

1. **Confirm scope is internal.** If the artifact will leave Microsoft, stop and
   tell the user to use Brand Central guidance and approvals.
2. **Read the reference you need:**
   - Colors → [reference/colors.md](reference/colors.md)
   - Typography → [reference/typography.md](reference/typography.md)
   - Logo (visual rules) → [reference/logo.md](reference/logo.md)
   - Layout / iconography →
     [reference/layout-and-iconography.md](reference/layout-and-iconography.md)
3. **Pull tokens, don't hardcode hex.** Import
   [tokens/ms-brand.css](tokens/ms-brand.css),
   [tokens/ms-brand.scss](tokens/ms-brand.scss),
   [tokens/ms-brand-tokens.json](tokens/ms-brand-tokens.json), or
   [tokens/tailwind.preset.js](tokens/tailwind.preset.js).
4. **Apply the visual rules:**
   - Headings + UI in Segoe UI (with the documented fallback stack)
   - Use one accent color per surface; never recolor the four-square mark
   - Maintain clear space around the logo equal to the height of one square
   - Wordmark uses `--ms-gray` (#737373) on light backgrounds, white on dark
5. **Run the smoke check** from this skill when the artifact touches Hugo
   content, templates, or SCSS:
   `pwsh .github/skills/dude-pack-ms-brand-visual/scripts/brand-check.ps1` or
   `bash .github/skills/dude-pack-ms-brand-visual/scripts/brand-check.sh`.
6. **Run the audit** in
   [../../prompts/dude-pack-ms-brand-audit-ms-brand.prompt.md](../../prompts/dude-pack-ms-brand-audit-ms-brand.prompt.md)
   before declaring done.

## Quick decision table

| User intent                     | Go to                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------- |
| Theme a new page/component      | [../../prompts/dude-pack-ms-brand-apply-ms-brand.prompt.md](../../prompts/dude-pack-ms-brand-apply-ms-brand.prompt.md) |
| Check an existing page          | [../../prompts/dude-pack-ms-brand-audit-ms-brand.prompt.md](../../prompts/dude-pack-ms-brand-audit-ms-brand.prompt.md) |
| Pick the right color            | [reference/colors.md](reference/colors.md)                                       |
| Pick the right font weight/size | [reference/typography.md](reference/typography.md)                               |
| Place the logo                  | [reference/logo.md](reference/logo.md)                                           |
| See it working                  | [examples/themed-page.html](examples/themed-page.html)                           |

## Visual cheat sheet

```text
Colors (the four squares + wordmark)
  Red    #F25022   --ms-red
  Green  #7FBA00   --ms-green
  Blue   #00A4EF   --ms-blue
  Yellow #FFB900   --ms-yellow
  Gray   #737373   --ms-gray   ← wordmark on light bg

Typography
  Family: Segoe UI Variable Text, Segoe UI Variable, Segoe UI, with system fallback
  Body:    400 / 16px / 1.5
  Heading: 600 / 24-48px / 1.2
  Caption: 400 / 12-14px / 1.4
  Docs:    .ms-docs, wide content wrapper, 688px prose, 40/52 title, 16/28 body

Logo
  Use .ms-logo-mark from the token CSS for internal surfaces
  Clear space = height of one square on all sides
  Min size = 16 px tall on screen
  Never recolor, rotate, distort, animate
```

## Hand-off

When you finish applying the brand:

- State which tokens file you imported
- List the elements you changed (font, primary color, logo placement)
- Point the user to [examples/themed-page.html](examples/themed-page.html) as
  the reference look
- Remind: **internal use only** — external use requires Brand Central review
