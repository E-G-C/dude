---
name: dude-pack-clearline-visual
description: "Apply the Clearline visual system to a selected surface. Use only when the user says apply Clearline, requests Clearline tokens or --cl-* values, or identifies an existing Clearline surface."
---

# Clearline visual system

Clearline provides calm neutral surfaces, four restrained decorative accents,
Inter typography, an 8-point grid with 4-point half steps, bounded long-form
measures, and an optional project-supplied mark slot. It is framework-agnostic
and ships no logo.

## When to use this skill

Use this skill only when the request explicitly includes one of these signals:

- "Apply Clearline" or "use Clearline."
- "Use Clearline tokens" or "use --cl-*."
- Work on an existing Clearline surface.
- Place a project-supplied mark on an explicitly Clearline surface.

Do not use it to define an identity, create a logo, reproduce another
organization's mark, or choose a trademarked typeface.

## Workflow

1. Read the reference that matches the work:
   - [Color roles](reference/colors.md)
   - [Typography](reference/typography.md)
   - [Layout and iconography](reference/layout-and-iconography.md)
   - [Project-supplied mark slot](reference/brand-mark.md), when a mark is in scope
2. Resolve `<clearline-root>` before importing tokens. In an installed Dude
   project it is normally `.github/skills/dude-pack-clearline-visual`. Make the
   path relative to the importing file, or copy a canonical token file into the
   project's asset tree and import that copy.
   - CSS: `<clearline-root>/tokens/clearline.css`
   - SCSS: `<clearline-root>/tokens/clearline.scss`
   - JSON: `<clearline-root>/tokens/clearline-tokens.json`
   - Tailwind: `<clearline-root>/tokens/tailwind.preset.cjs`
3. Apply neutral surfaces first. Use one decorative accent hue as the focal
   signal. For any background containing text, use a semantic
   `--cl-color-*-bg` and matching `--cl-color-*-fg` pair rather than an
   original accent token.
4. Use Inter or its fallback stack for interface and body text, JetBrains Mono
   for code, 400 for regular text, and 600 for headings and key labels.
5. Use the spacing, radius, control-size, and elevation tokens. On long-form
   pages, assign each element to a documented measure and keep every tier on
   the article column's left edge.
6. When a mark is required, wrap a supplied image, inline SVG, or monogram in
   `.cl-lockup`. Its paired size and clear-space variant applies to the combined
   lockup. Remove `.cl-mark-placeholder` before production.
7. Keep interaction accessible. Focusable controls need a visible 2 px ring
   with a 2 px offset and halo. Use the default pair on light surfaces;
   `.cl-theme-dark` or `[data-cl-theme="dark"]` selects the dark pair. Add a
   non-color state cue and honor reduced-motion preferences.
8. Run the folder-local checker when command access is available:

   ```bash
   bash <clearline-root>/scripts/style-check.sh
   # or
   pwsh <clearline-root>/scripts/style-check.ps1
   ```

   The checker validates its documented canonical token scope and the shipped
   examples. If commands cannot run in the current environment, report the
   exact command and the remaining verification gap.

## Audit checklist

| Check | Pass condition |
| --- | --- |
| Token source | The selected consumer loads one canonical token format from a resolved path. |
| Color | Text-bearing fills use matching semantic background and foreground roles. |
| Accent | One accent hue carries the focal signal on the surface. |
| Type | Only 400 and 600 are used. |
| Mark | A supplied mark is inside `.cl-lockup`; its size and outer clear-space variant match. |
| Measures | Long-form tiers share one left edge. |
| Contrast | Text pairs meet 4.5:1; focus and essential UI boundaries meet 3:1. |
| Focus | Focusable controls show the 2 px ring, 2 px offset, and context-appropriate halo. |
| Motion | Transitions use Clearline motion tokens and reduce under user preference. |
| State | Status has a label, icon, pattern, or another non-color cue. |

## Quick references

| Need | File |
| --- | --- |
| Token overview and import guidance | [README.md](README.md) |
| Semantic colors and focus | [reference/colors.md](reference/colors.md) |
| Type scale and weights | [reference/typography.md](reference/typography.md) |
| Measures, controls, motion | [reference/layout-and-iconography.md](reference/layout-and-iconography.md) |
| Mark slot and clear space | [reference/brand-mark.md](reference/brand-mark.md) |
| Working examples | [examples/](examples/) |

When reporting work, name the token format and resolved path, summarize the
semantic color and layout choices, and state the checker result or verification
gap.
