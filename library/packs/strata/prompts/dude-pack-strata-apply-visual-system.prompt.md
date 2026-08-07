---
mode: agent
description:
  Apply the Strata visual system to the current file/selection, then run the
  built-in self-check.
---

# Apply the Strata Visual System

Apply Strata to the file or selection the user provides, then self-check the
result before handing back.

## Inputs to gather (if not obvious)

- Which file(s) / component(s), and what kind of surface: application chrome,
  web page, graphic/SVG, data visualization, or long-form document.
- Palette: `pigment` (default) or `spectrum`. Theme: light (default) or dark.
- How tokens are consumed: plain CSS, SCSS, Tailwind, or design-tokens-as-JSON.

There is no logo question — Strata ships no logo. There is no site-generator
question — none is assumed.

## Steps

1. **Read the references** you need:
   - [../skills/dude-pack-strata-visual/reference/colors.md](../skills/dude-pack-strata-visual/reference/colors.md)
   - [../skills/dude-pack-strata-visual/reference/typography.md](../skills/dude-pack-strata-visual/reference/typography.md)
   - [../skills/dude-pack-strata-visual/reference/layout-and-iconography.md](../skills/dude-pack-strata-visual/reference/layout-and-iconography.md)

2. **Wire up tokens** for the build system:
   - Plain CSS / HTML → `<link rel="stylesheet" href="<path>/tokens/strata.css">`
     and `class="strata"` on a root element. Set
     `data-strata-palette` / `data-strata-theme` on `<html>` if not using the
     defaults.
   - SCSS → `@use "<path>/tokens/strata.scss" as strata;` then
     `strata.strata-role("primary")`.
   - Tailwind → add `tokens/tailwind.preset.js` to `presets` **and** import
     `tokens/strata.css`; the preset holds `var()` references and the stylesheet
     does the switching.
   - Other → consume
     [../skills/dude-pack-strata-visual/tokens/strata-tokens.json](../skills/dude-pack-strata-visual/tokens/strata-tokens.json).

3. **Typography** — `--strata-font-sans` on the root, `--strata-font-mono` for
   code and metadata, the `--strata-fs-*` / `--strata-lh-*` pairings, body
   ≥ 14px, at most two weights per surface.

4. **Planes** — replace every `box-shadow` with a plane change plus
   `var(--strata-rule-hairline)`. Nothing floats, blurs, or glows.

5. **Shape** — every interactive element and panel to `--strata-radius-md` (4px);
   nothing above 8px.

6. **Colour** — role tokens only, never a palette colour name. One accent per
   surface. Text on a light plane uses a `-deep` or `-text` form, never a vivid
   slot.

7. **Fields** — every meaning-bearing fill and every tint badge gets a 1px
   border.

8. **Layout** — `--strata-space-*` everywhere.

9. **Motion** — `--strata-dur-*` and `--strata-ease-*`, plus a
   `prefers-reduced-motion` block for anything animated.

10. **Charts (if any)** — `--strata-series-1..7` in order, a non-colour encoding
    for any series beyond two, and `--strata-rule` on every mark.

11. **Run the self-check below** and fix every Fail and Warn before handing back.

## Final self-check

Produce a markdown table of **Pass / Warn / Fail** per item, with file:line
references.

### Colour and palette portability

- [ ] No component references a palette-specific colour name, or a raw hex,
      `rgb()`, `rgba()`, or `hsl()` literal that a `--strata-*` token expresses.
- [ ] Role tokens are used in preference to `series-N` slots wherever a role
      exists.
- [ ] The surface renders correctly under **all four** palette/theme
      combinations.
- [ ] Vivid slots are never used as text on a light plane — use `-deep` or the
      `-text` role token.
- [ ] White text sits only on a `-deep` form, or on a vivid slot measured
      ≥ 4.5:1. Amber fills use `--strata-on-warning`.
- [ ] Destructive fill is `--strata-danger-text`, not the vivid danger slot.
- [ ] Every meaning-bearing fill has a 1px border; every tint badge is bordered
      with its `-tint-ink`.
- [ ] `--strata-hair` is not used as a control boundary, plane edge, or field
      border.
- [ ] `--strata-muted` is not used on `--strata-code-bg`; use
      `--strata-code-muted`.
- [ ] Body text ≥ 4.5:1; large text and non-text UI ≥ 3:1.
- [ ] State is never communicated by colour alone.

### Planes and shape

- [ ] **Zero** `box-shadow` declarations. Depth is plane + 1px rule.
- [ ] Every plane change is accompanied by a rule — the light plane scale spans
      about 1.15:1, so tone alone is not perceivable.
- [ ] No `backdrop-filter`, blur, glow, or gradient mesh.
- [ ] Interactive elements at 4px; nothing above 8px. No pills.
- [ ] No warm-cream ground, no oversized editorial headline, no monospace
      manifesto banner.

### Typography

- [ ] Font stacks reference `--strata-font-sans` / `--strata-font-mono`.
- [ ] No `@font-face`, no remote font import, no font files added.
- [ ] Long-form prose constrained to `--strata-reading-measure`; tables, code,
      and figures may use `--strata-reading-wide`.
- [ ] Headings 600 with line-height ≤ 1.3. Body ≥ 14px. At most two weights per
      surface.
- [ ] Uppercase appears **only** on `.strata-meta` metadata, never on headings.

### Motion and focus

- [ ] Durations and easings come from tokens; no CSS easing keyword is used as a
      token value.
- [ ] Every animated property is covered by `prefers-reduced-motion: reduce`.
- [ ] Focus is `outline` + `outline-offset` ≥ 2px on every interactive element,
      never painted with `box-shadow`.

### Data visualization

- [ ] Series use `--strata-series-1..7` in the documented order.
- [ ] Any series beyond two carries a non-colour encoding (labels, markers,
      patterns).
- [ ] The categorical ramp is not used for sequential or diverging data.
- [ ] Every mark is stroked with `--strata-rule`.
- [ ] Axis and legend labels use `.strata-meta`, not the series colour.

### Iconography and misc

- [ ] One icon family per surface; icons inherit `currentColor`.
- [ ] No emoji as functional UI iconography.
- [ ] No logo, wordmark, or product mark introduced.

### Output format

```
| Area | Item | Status | Location | Notes |
|---|---|---|---|---|
| Colour | Hardcoded #1348E8 in primary button | Fail | src/Header.tsx:42 | Use var(--strata-primary) |
| Colour | Vivid series-4 used as text | Fail | src/Chart.tsx:88 | Use --strata-series-4-deep (vivid is under 2:1) |
| Planes | box-shadow on card | Fail | styles.css:120 | Plane change + var(--strata-rule-hairline) |
| Shape | border-radius: 16px on card | Warn | styles.css:124 | Ceiling is 8px; default is 4px |
```

Then offer the user **"Want me to fix the Fail and Warn items?"** and proceed if
confirmed.

## Also run the validator

The self-check covers the surface you edited. The pack's own validator covers the
token files:

```bash
bash <path>/skills/dude-pack-strata-visual/scripts/strata-check.sh
# or
pwsh <path>/skills/dude-pack-strata-visual/scripts/strata-check.ps1
```

It asserts cross-palette id parity, that palette blocks carry colour only, the
no-shadow rule, the radius ceiling, keyword easings, reduced motion, and
local-only fonts.

## Output

Return:

- The edited file(s).
- A short bulleted list of what changed (tokens wired, planes, shape, colour
  roles, spacing, motion).
- The self-check table.
