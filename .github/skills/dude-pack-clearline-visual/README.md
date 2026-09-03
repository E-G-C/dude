# Clearline visual system

Clearline is a framework-agnostic visual system for pages, applications,
graphics, slides, and long-form documents. It uses calm neutrals, four
restrained accents, Inter, an 8-point grid with 4-point half steps, a shared
left edge for long-form content, and an optional project-supplied mark.

## Token location

`<clearline-root>` means the installed skill directory. In a Dude project it is
normally `.github/skills/dude-pack-clearline-visual`. Resolve that path relative
to the file that imports it, or copy the canonical token file into the
project's asset tree and use that consumer-owned path.

```html
<link rel="stylesheet" href="<clearline-root>/tokens/clearline.css" />
<button class="cl-btn cl-btn-primary">Get started</button>
```

```js
// tailwind.config.cjs
const clearline = require("<clearline-root>/tokens/tailwind.preset.cjs");

module.exports = {
  presets: [clearline],
  content: ["./**/*.{html,jsx,tsx}"],
};
```

Use a `.cjs` Tailwind config for this CommonJS `require()` form, including when
the consuming repository has `"type": "module"`.

Use the JSON file at `<clearline-root>/tokens/clearline-tokens.json` when a
consumer reads design tokens directly. Use the SCSS file at
`<clearline-root>/tokens/clearline.scss` for SCSS variables and mixins.

## Core roles

| Role | Token |
| --- | --- |
| Decorative primary signal | `--cl-blue` |
| Primary text-bearing fill | `--cl-color-primary-bg` and `--cl-color-primary-fg` |
| Success text-bearing fill | `--cl-color-success-bg` and `--cl-color-success-fg` |
| Warning text-bearing fill | `--cl-color-warning-bg` and `--cl-color-warning-fg` |
| Danger text-bearing fill | `--cl-color-danger-bg` and `--cl-color-danger-fg` |
| Light essential control border | `--cl-color-control-border` |
| Dark essential control border | `--cl-color-control-border-on-dark` |
| Light focus ring and halo | `--cl-color-focus-ring` and `--cl-color-focus-halo` |
| Dark focus ring and halo | `--cl-color-focus-ring-on-dark` and `--cl-color-focus-halo-on-dark` |
| Long-form article wrapper | `.cl-docs-content` |
| Mark lockup | `.cl-lockup` |

The four base accents are decorative. Use their contrast-safe semantic pairs
for text-bearing fills. Read [color roles](reference/colors.md) before changing
or extending color use.

## Mark slot

Clearline ships no logo. Wrap a supplied mark and optional wordmark in
`.cl-lockup`; its paired size and clear-space variant supplies outer padding.
The default 24 px pair therefore provides 24 px of clear space.

```html
<div class="cl-lockup">
  <span class="cl-mark"
        style="--cl-mark-bg: var(--cl-color-primary-bg);
               --cl-mark-fg: var(--cl-color-primary-fg);"
        aria-hidden="true">P</span>
  <span class="cl-wordmark">Project name</span>
</div>
```

See [project-supplied mark slot](reference/brand-mark.md) for asset,
accessibility, and compact-size guidance.

## Validate

The checker validates the documented shared scope: semantic fills and links,
light and dark Clearline surfaces, control and focus roles, motion, mark pairs,
type families and weights, spacing, radii, control and card sizes, and
shipped-example color values. It does not claim parity for format-specific
tokens.

```bash
bash <clearline-root>/scripts/style-check.sh
pwsh <clearline-root>/scripts/style-check.ps1
```

Use [SKILL.md](SKILL.md) for the workflow, audit checklist, and examples.
