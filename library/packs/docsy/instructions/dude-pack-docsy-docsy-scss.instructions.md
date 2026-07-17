---
applyTo: "**/assets/scss/**/*.scss"
description: Rules for customizing Docsy SCSS.
---

# Docsy SCSS customization rules

## Only edit these three project files
Everything else in `assets/scss/` (especially `assets/scss/td/`) is internal — shadowing those files works but is **not covered by SemVer** and may break on Docsy upgrades.

| File | Purpose | Order |
|---|---|---|
| `assets/scss/_variables_project.scss` | Override Bootstrap & Docsy variables | BEFORE Bootstrap import |
| `assets/scss/_variables_project_after_bs.scss` | Override color maps, theme colors | AFTER Bootstrap import |
| `assets/scss/_styles_project.scss` | Custom rules + opt-in imports (`td/code-dark`, `td/extra`, `td/color-adjustments-dark`) | After all imports |

## Variable placement matters
- Bootstrap variables (`$primary`, `$enable-gradients`, …) → `_variables_project.scss`.
- Color maps that depend on Bootstrap defaults (`$theme-colors` map-merge, `$custom-colors`) → `_variables_project_after_bs.scss`.
- Doing it backwards either silently no-ops or overwrites Bootstrap's later additions.

## Dark mode
- Disable globally: `$enable-dark-mode: false;` in `_variables_project.scss`.
- For code blocks to follow dark mode, add to `_styles_project.scss`:
  ```scss
  @import "td/code-dark";
  ```
- Chroma config must have `noClasses = false` (in `hugo.toml`) for this to work.

## Adding a theme color (correct pattern)
In `_variables_project_after_bs.scss`:
```scss
$custom-colors: ("brand-purple": #6f42c1);
$theme-colors: map-merge($theme-colors, $custom-colors);
```
Yields utility classes `.-bg-brand-purple`, `.-text-brand-purple` and alert color `brand-purple`.

## Google Fonts
```scss
$td-enable-google-fonts: true;
$td-google-font-name: "Roboto";
$td-google-font-family: "Roboto:300,400,700";
```
Set in `_variables_project.scss`.

## Don't
- Don't `@import "bootstrap"` yourself — Docsy already does.
- Don't redefine `$primary` in `_styles_project.scss` (too late — Bootstrap has already compiled).
- Don't use `!default` on overrides — that defeats the override.
