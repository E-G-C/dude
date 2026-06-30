---
name: docsy
description: "Docsy Hugo theme specialist: install paths, content authoring, theme customization, shortcodes, search/i18n/versioning, deployment, and AI-agent support."
provides:
  agents:
    - dude-pack-docsy-expert
  skills:
    - dude-pack-docsy-theme
  instructions:
    - docsy-config.instructions.md
    - docsy-content.instructions.md
    - docsy-scss.instructions.md
  prompts:
    - install-site.prompt.md
    - customize-theme.prompt.md
    - update-docsy.prompt.md
    - add-shortcode.prompt.md
    - new-blog-post.prompt.md
    - new-docs-page.prompt.md
    - setup-i18n.prompt.md
    - setup-search.prompt.md
    - setup-versioning.prompt.md
    - setup-deployment.prompt.md
    - enable-agent-support.prompt.md
    - troubleshoot-build.prompt.md
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

- `docsy-config.instructions.md` — Docsy `hugo.toml` patterns and ordering rules.
- `docsy-content.instructions.md` — Docsy content conventions (front matter,
  sections, blog/news, shortcodes).
- `docsy-scss.instructions.md` — the three customizable SCSS files and what's
  off-limits in `assets/scss/td/`.

### Prompts

- `install-site.prompt.md` — scaffold a new Docsy site with the right install
  method (Hugo module / submodule / npm).
- `customize-theme.prompt.md` — colors, fonts, logo, dark mode.
- `update-docsy.prompt.md` — upgrade/migrate across install methods.
- `add-shortcode.prompt.md` — pick and insert the right Docsy shortcode.
- `new-blog-post.prompt.md`, `new-docs-page.prompt.md` — scaffold content.
- `setup-i18n.prompt.md`, `setup-search.prompt.md`, `setup-versioning.prompt.md`
- `setup-deployment.prompt.md` — GitHub Pages / Netlify / S3+CloudFront.
- `enable-agent-support.prompt.md` — Markdown output + `llms.txt`.
- `troubleshoot-build.prompt.md` — Docsy-specific build/PostCSS/extended-Hugo
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
