# Color roles

Clearline uses calm neutrals for surfaces and four restrained accents: blue,
green, orange, and red. The accents are decorative roles, not
text-bearing backgrounds. Gray is a neutral support color, not a fifth accent.

## Accent palette

| Accent | Token | Value | Use |
| --- | --- | --- | --- |
| Blue | `--cl-blue` | `#00A4EF` | Primary signal, chart mark, or icon |
| Green | `--cl-green` | `#7FBA00` | Success signal, chart mark, or icon |
| Orange | `--cl-orange` | `#FFB900` | Warning signal, chart mark, or icon |
| Red | `--cl-red` | `#F25022` | Danger signal, chart mark, or icon |

Use one accent hue as the focal signal on a surface. Status indicators may use
their assigned role when the status is meaningful, and they still need a label,
icon, or other non-color cue.

## Contrast-safe semantic pairs

Use these pairs for buttons, badges, alerts, and any other fill that contains
text. Each background and foreground pair passes the 4.5:1 text requirement.

| Intent | Background | Foreground |
| --- | --- | --- |
| Primary | `--cl-color-primary-bg` | `--cl-color-primary-fg` |
| Success | `--cl-color-success-bg` | `--cl-color-success-fg` |
| Warning | `--cl-color-warning-bg` | `--cl-color-warning-fg` |
| Danger | `--cl-color-danger-bg` | `--cl-color-danger-fg` |

```css
.save {
  background: var(--cl-color-primary-bg);
  color: var(--cl-color-primary-fg);
}
```

Do not substitute `--cl-blue`, `--cl-green`, `--cl-orange`, or `--cl-red` for
one of these text-bearing backgrounds. Keep the base accents for decorative
marks, borders, and non-text graphics.

## Neutrals, boundaries, and links

| Role | Token |
| --- | --- |
| Page surface | `--cl-bg` |
| Subtle surface | `--cl-bg-subtle` |
| Subtle separator | `--cl-border` |
| Dark subtle separator | `--cl-border-dark` |
| Neutral support ink | `--cl-gray` |
| Essential control border on light | `--cl-color-control-border` |
| Essential control border on dark | `--cl-color-control-border-on-dark` |
| Body text | `--cl-text` |
| Secondary text | `--cl-text-muted` |
| Dark surface | `--cl-bg-dark` |
| Text on dark | `--cl-text-on-dark` |
| Link on light | `--cl-color-link` |
| Link on dark | `--cl-color-link-on-dark` |

Use `--cl-border` for subtle separation only. Secondary controls and
`.cl-input` use the semantic control-border role; it meets 3:1 against the
documented adjacent Clearline surfaces. Code uses `--cl-docs-code-bg`,
`--cl-text`, and `--cl-border`. It remains a light, bordered surface unless
terminal output needs a dark context.

## Focus

On light Clearline surfaces, use `--cl-color-focus-ring` with
`--cl-color-focus-halo`. The ring passes 3:1 against the light surfaces; the
white halo is the two-tone fallback beside a dark control. `.cl-theme-dark` or
`[data-cl-theme="dark"]` switches both active roles to
`--cl-color-focus-ring-on-dark` and `--cl-color-focus-halo-on-dark`. The dark
ring passes 3:1 against dark surfaces, while its dark halo is the fallback
beside a light control.

The CSS token file applies the two layers as a 2 px outline with a 2 px offset
and halo to focusable controls inside `.cl-brand` and `.cl-docs`. These claims
cover the documented Clearline light and dark surfaces, not arbitrary
background seams. Keep a non-color state cue for selection, validation,
loading, and status.

## Palette changes

If a project changes an accent, it must also provide a contrast-tested semantic
background and foreground pair for the affected intent. Run the folder-local
checker after changing any canonical token file; it reports the checked shared
roles and contrast thresholds.
