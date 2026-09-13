---
mode: agent
description: "Apply the Clearline visual system to the selected file or surface and report an accessibility-focused audit."
---

# Apply the Clearline visual system

Apply Clearline to the user-selected file or surface. Preserve the existing
content and behavior unless the request changes them.

## Inputs

Collect only what the selected work needs:

- The files or component in scope.
- The consumer format: CSS, SCSS, Tailwind, or JSON-driven tokens.
- The resolved `<clearline-root>` path or the project-owned copy of a token file.
- The light or dark surface context.
- Any project-supplied mark asset and whether the surface needs it.

## Steps

1. Read [color roles](../skills/dude-pack-clearline-visual/reference/colors.md),
   [typography](../skills/dude-pack-clearline-visual/reference/typography.md),
   and [layout and iconography](../skills/dude-pack-clearline-visual/reference/layout-and-iconography.md).
   Read [mark guidance](../skills/dude-pack-clearline-visual/reference/brand-mark.md)
   when a mark is in scope.
2. Load the token format through the resolved root:
   - CSS: `<clearline-root>/tokens/clearline.css`
   - SCSS: `<clearline-root>/tokens/clearline.scss`
   - Tailwind: `<clearline-root>/tokens/tailwind.preset.cjs`
   - JSON: `<clearline-root>/tokens/clearline-tokens.json`
3. Apply Inter or its fallback stack to interface and body text, JetBrains Mono
   to code, 400 to regular copy, and 600 to headings and key labels.
4. Use neutral surfaces for most of the layout. Choose one decorative accent
   hue as the focal signal. Replace text-bearing accent fills with matching
   `--cl-color-*-bg` and `--cl-color-*-fg` roles.
5. Use the spacing, radius, control-size, and elevation tokens. On long-form
   pages, keep readable, wide, and figure tiers on the same left edge.
6. If a supplied mark is needed, wrap it and any wordmark in `.cl-lockup`.
   Its paired size and clear-space variant supplies the outer padding. Remove
   any `.cl-mark-placeholder` before production.
7. Give focusable controls the 2 px Clearline ring, 2 px offset, and halo.
   `.cl-theme-dark` or `[data-cl-theme="dark"]` selects the dark pair. Add a
   non-color state cue. Use Clearline motion tokens and reduced-motion behavior
   for new transitions or animations.
8. Run the local checker when command access is available:

   ```bash
   bash <clearline-root>/scripts/style-check.sh
   # or
   pwsh <clearline-root>/scripts/style-check.ps1
   ```

   It validates the canonical token scope and shipped examples. If execution is
   unavailable, report the command as a verification gap.

## Final audit

Return a Pass, Warn, or Fail for each applicable item with file and line
references.

| Area | Pass condition |
| --- | --- |
| Token source | A canonical format is loaded through a resolved path. |
| Color | Text-bearing fills use matching semantic foreground/background roles. |
| Accent | One accent hue is the focal signal. |
| Type | Only the documented stacks, 400, and 600 are used. |
| Mark | The supplied mark is inside `.cl-lockup` with a paired size and clear-space variant. |
| Measures | Long-form tiers share one left edge. |
| Contrast | Text is at least 4.5:1; essential UI and focus boundaries are at least 3:1. |
| Focus | Focusable controls show the 2 px ring, 2 px offset, and halo for their context. |
| Motion | Added motion honors reduced-motion preference. |
| State | Status has a non-color cue. |

Use this table format:

```text
| Area | Item | Status | Location | Notes |
| --- | --- | --- | --- | --- |
| Token source | CSS token file | Pass | styles/page.css:1 | Resolved project path |
| Color | Primary action | Pass | styles/page.css:42 | Semantic pair |
| Mark | Placeholder remains | Warn | index.html:14 | Replace before production |
```

## Output

Return the edited files, a short list of token and layout choices, the audit
table, and the checker result or verification gap.
