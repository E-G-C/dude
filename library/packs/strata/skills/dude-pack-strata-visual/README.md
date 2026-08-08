# Strata — Visual System Bundle

A drop-in bundle of **skills, instructions, prompts, design tokens, and reference
docs** for applying the Strata layered visual system to any visual surface — web
pages, applications, graphics, data visualization, and long-form documents.

> **Scope:** a neutral, accessible token system. Strata is unaffiliated with any
> company, product, or design system, and ships no logo, wordmark, or icon. It is
> not brand or trademark guidance.

## What this is

You drop this folder into a workspace. Copilot then knows:

- Two interchangeable colour palettes over one role-based token id space
- A plane-and-rule elevation model with **no drop shadows anywhere**
- A 4px square shape language, a working UI type scale, and a 4/8 spacing scale
- A seven-slot categorical ramp for charts, with the rules that make it readable
- Measured WCAG contrast across all four palette/theme surfaces

You can:

1. **Apply the system to a surface** → run
   [../../prompts/dude-pack-strata-apply-visual-system.prompt.md](../../prompts/dude-pack-strata-apply-visual-system.prompt.md)
2. **Import the design tokens** → drop in [tokens/strata.css](tokens/strata.css)
   or [tokens/tailwind.preset.js](tokens/tailwind.preset.js)
3. **Validate a change** → run [scripts/strata-check.sh](scripts/strata-check.sh)

## Bundle map

Paths are relative to this folder. In an installed workspace this folder sits at
`.github/skills/dude-pack-strata-visual/`, and `../../` is the `.github/` root
that VS Code auto-loads customizations from.

| Path | What's in it |
| --- | --- |
| [`../../instructions/`](../../instructions/) | `.instructions.md` rules auto-applied by file type |
| [`../../prompts/`](../../prompts/) | `.prompt.md` workflow — apply the system and self-check |
| [`../../agents/dude-pack-strata-stylist.agent.md`](../../agents/dude-pack-strata-stylist.agent.md) | The `Strata Stylist` custom agent |
| [`reference/`](reference/) | Colour, typography, layout and iconography, provenance and licensing |
| [`tokens/`](tokens/) | Design tokens (CSS, SCSS, JSON, Tailwind preset) |
| [`scripts/`](scripts/) | Folder-local validators for token and palette integrity |
| [`examples/`](examples/) | Worked surfaces (controls, data, reading) |
| [`SKILL.md`](SKILL.md) | The main skill entry — start here |

## Quick start

### Plain CSS

```html
<link rel="stylesheet" href="tokens/strata.css" />

<html data-strata-palette="pigment" data-strata-theme="light">
  <body class="strata">
    <button class="strata-btn strata-btn-primary">Get started</button>
  </body>
</html>
```

`pigment` and `light` are the defaults — omit the attributes to get them.

### Tailwind

```js
// tailwind.config.js
const strata = require('./tokens/tailwind.preset.js');
module.exports = { presets: [strata], content: ['./**/*.{html,jsx,tsx}'] };
```

Import `tokens/strata.css` alongside the preset. The preset exposes token names
as `var()` references; the stylesheet carries the four palette/theme blocks and
does the switching. A compiled preset cannot switch palettes at runtime on its
own.

### Ask Copilot

> Apply Strata to `index.html` using the spectrum palette.

Copilot follows
[../../instructions/dude-pack-strata-visual-system.instructions.md](../../instructions/dude-pack-strata-visual-system.instructions.md)
and the prompt in
[../../prompts/dude-pack-strata-apply-visual-system.prompt.md](../../prompts/dude-pack-strata-apply-visual-system.prompt.md).

## Core vocabulary at a glance

| Element | Token | Notes |
| --- | --- | --- |
| Planes | `--strata-canvas` / `-surface` / `-soft` / `-sunken` | every plane change needs a rule |
| Rule | `--strata-rule` | perceivable — plane edges, field boundaries, control borders |
| Hairline | `--strata-hair` | **decorative only**, below the contrast floor |
| Accent | `--strata-primary`, `--strata-hover` | role tokens, never a colour name |
| State | `--strata-success` / `-warning` / `-danger` / `-info` (+ `-text`) | fills vs text differ |
| Focus | `--strata-focus` | `outline` + `outline-offset: 2px` |
| Series | `--strata-series-1` … `-7` (+ `-deep`, `-tint`, `-tint-ink`) | categorical charts |
| Type | `--strata-font-sans` / `--strata-font-mono` | local-only, no font files ship |
| Metadata | `.strata-meta` | mono, letterspaced, uppercase, small only |

Full detail in [reference/colors.md](reference/colors.md) and
[reference/typography.md](reference/typography.md).

## Heads-up (the short version)

- **Never name a palette colour in component code.** Use `--strata-primary` or
  `--strata-series-3`, never `azurite` or `blue`. The two palettes share one id
  space, and naming a colour breaks the switch.
- **No `box-shadow`.** Depth is a plane change plus a 1px rule. The validator
  fails on one.
- **Vivid fills, deep writes.** Most vivid slots fail as text on a light plane.
- **Fields need edges.** A bare fill or bare tint badge has no perceivable
  boundary, even when its text is readable.
- **`--strata-hair` is decorative.** It is one token away from `--strata-rule`
  and misusing it produces an invisible control boundary that looks fine in
  review.
- **Charts need more than colour.** Any series beyond two needs labels, markers,
  or patterns.

See [reference/layout-and-iconography.md](reference/layout-and-iconography.md)
for the full rules and
[reference/provenance-and-licensing.md](reference/provenance-and-licensing.md)
for licensing and the measured contrast results.
