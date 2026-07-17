---
name: docsy
description: "Docsy Hugo theme specialist: install paths, content authoring, theme customization, shortcodes, search/i18n/versioning, deployment, and AI-agent support."
provides:
  agents:
    - dude-pack-docsy-expert
  skills:
    - dude-pack-docsy-theme
  instructions:
    - dude-pack-docsy-docsy-config.instructions.md
    - dude-pack-docsy-docsy-content.instructions.md
    - dude-pack-docsy-docsy-scss.instructions.md
  prompts:
    - dude-pack-docsy-install-site.prompt.md
    - dude-pack-docsy-customize-theme.prompt.md
    - dude-pack-docsy-update-docsy.prompt.md
    - dude-pack-docsy-add-shortcode.prompt.md
    - dude-pack-docsy-new-blog-post.prompt.md
    - dude-pack-docsy-new-docs-page.prompt.md
    - dude-pack-docsy-setup-i18n.prompt.md
    - dude-pack-docsy-setup-search.prompt.md
    - dude-pack-docsy-setup-versioning.prompt.md
    - dude-pack-docsy-setup-deployment.prompt.md
    - dude-pack-docsy-enable-agent-support.prompt.md
    - dude-pack-docsy-troubleshoot-build.prompt.md
requires:
  tools: [hugo]
---

# Docsy Pack

Specialist coverage for the [Docsy](https://www.docsy.dev/) Hugo theme.
Pairs well with the `hugo` pack — many prompts cross-reference Hugo skills
for the underlying engine behavior.

## Provides

### Agent

- `dude-pack-docsy-expert` — owns Docsy install, layout, navigation, search,
  i18n, versioning, deployment, theme customization, and the experimental
  AI-agent surface.

### Skill

- `dude-pack-docsy-theme` — the curated Docsy reference (install paths,
  configuration, shortcodes, SCSS customization, search engines, i18n,
  versioning, deployment, agent support, gotchas).

### Instructions

- `dude-pack-docsy-docsy-config.instructions.md` — Docsy `hugo.toml` patterns and ordering rules.
- `dude-pack-docsy-docsy-content.instructions.md` — Docsy content conventions (front matter,
  sections, blog/news, shortcodes).
- `dude-pack-docsy-docsy-scss.instructions.md` — the three customizable SCSS files and what's
  off-limits in `assets/scss/td/`.

### Prompts

- `dude-pack-docsy-install-site.prompt.md` — scaffold a new Docsy site with the right install
  method (Hugo module / submodule / npm).
- `dude-pack-docsy-customize-theme.prompt.md` — colors, fonts, logo, dark mode.
- `dude-pack-docsy-update-docsy.prompt.md` — upgrade/migrate across install methods.
- `dude-pack-docsy-add-shortcode.prompt.md` — pick and insert the right Docsy shortcode.
- `dude-pack-docsy-new-blog-post.prompt.md`, `dude-pack-docsy-new-docs-page.prompt.md` — scaffold content.
- `dude-pack-docsy-setup-i18n.prompt.md`, `dude-pack-docsy-setup-search.prompt.md`, `dude-pack-docsy-setup-versioning.prompt.md`
- `dude-pack-docsy-setup-deployment.prompt.md` — GitHub Pages / Netlify / S3+CloudFront.
- `dude-pack-docsy-enable-agent-support.prompt.md` — Markdown output + `llms.txt`.
- `dude-pack-docsy-troubleshoot-build.prompt.md` — Docsy-specific build/PostCSS/extended-Hugo
  diagnosis.

## Requires

- `hugo` (extended) on PATH.
- Recommended: also install the `hugo` pack for the underlying engine.

## Install / remove

```bash
@dude add pack docsy
@dude remove pack docsy
```

## Related packs

- `hugo` — Hugo engine specialists; Docsy prompts and skills cross-reference
  Hugo skills for non-Docsy behavior.
- `ms-brand` — Microsoft visual-brand layer; pair with Docsy for branded sites.
