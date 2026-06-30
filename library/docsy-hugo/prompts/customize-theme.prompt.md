---
agent: agent
description: Customize Docsy colors, fonts, logo, and dark mode the supported way.
---

Help the user restyle a Docsy site. Reference [skill §9](../skills/dude-local-docsy/SKILL.md#9-look--feel--scss) and the [SCSS rules](../instructions/docsy-scss.instructions.md).

## Golden rule
Edit **only** these three files — everything else in `assets/scss/` (especially `assets/scss/td/`) is internal and not covered by SemVer:

| File | For | Loaded |
|---|---|---|
| `assets/scss/_variables_project.scss` | Bootstrap/Docsy variable overrides (`$primary`, fonts, `$enable-*`) | BEFORE Bootstrap |
| `assets/scss/_variables_project_after_bs.scss` | Color maps, `$theme-colors` merges | AFTER Bootstrap |
| `assets/scss/_styles_project.scss` | Custom CSS rules + opt-in imports | After all imports |

## Common tasks
- **Brand color:** set `$primary` (and `$secondary`) in `_variables_project.scss`.
- **Add a theme color** (yields `.-bg-*`/`.-text-*` + alert color): in `_variables_project_after_bs.scss`:
  ```scss
  $custom-colors: ("brand-purple": #6f42c1);
  $theme-colors: map-merge($theme-colors, $custom-colors);
  ```
- **Google font:** `$td-enable-google-fonts: true; $td-google-font-name: "Roboto"; $td-google-font-family: "Roboto:300,400,700";` in `_variables_project.scss`.
- **Navbar:** `$td-navbar-bg-color`, `$td-navbar-min-height`. Per-page dark navbar via front matter `params.ui.navbar_theme: dark`.
- **Dark mode:** disable globally with `$enable-dark-mode: false;`. For dark code blocks, add `@import "td/code-dark";` to `_styles_project.scss` AND set `markup.highlight.noClasses = false` in `hugo.toml`.
- **Logo:** replace `assets/icons/logo.svg`; hide with `params.ui.navbar_logo: false`.
- **Favicons:** drop a set in `static/favicons/`.

## Don't
- Don't `@import "bootstrap"` yourself — Docsy already does.
- Don't redefine `$primary` in `_styles_project.scss` (too late) or use `!default` on overrides.

Always test with `hugo server`, and remind the user that GA/GCS/Lunr only build in production (`hugo -e production`).
