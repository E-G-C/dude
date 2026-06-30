---
name: hugo
description: "Hugo site architecture, templates, asset pipeline, migration, and troubleshooting specialists for Hugo static sites."
provides:
  agents:
    - dude-pack-hugo-site-architect
    - dude-pack-hugo-template-specialist
    - dude-pack-hugo-docs-researcher
    - dude-pack-hugo-migration-specialist
    - dude-pack-hugo-troubleshooter
  skills:
    - dude-pack-hugo-site-builder
    - dude-pack-hugo-template-authoring
    - dude-pack-hugo-asset-pipeline
    - dude-pack-hugo-docs-reference
    - dude-pack-hugo-functions-and-methods
    - dude-pack-hugo-migration
    - dude-pack-hugo-troubleshooting
  instructions:
    - hugo-project.instructions.md
    - hugo-content.instructions.md
    - hugo-templates.instructions.md
    - hugo-assets-modules.instructions.md
    - hugo-dude-routing.instructions.md
  prompts:
    - answer-hugo-question.prompt.md
    - create-hugo-site.prompt.md
    - debug-hugo-site.prompt.md
    - design-hugo-content-model.prompt.md
    - lookup-hugo-function.prompt.md
    - migrate-to-hugo.prompt.md
    - optimize-hugo-performance.prompt.md
    - prepare-hugo-deployment.prompt.md
    - process-hugo-assets.prompt.md
    - upgrade-hugo-templates.prompt.md
    - write-hugo-template.prompt.md
requires:
  tools: [hugo]
---

# Hugo Pack

A complete specialist team for building, migrating, and maintaining Hugo static
sites. Covers site architecture, template authoring, asset pipeline (modules,
PostCSS, image processing), the Hugo functions/methods reference, and
deployment-ready troubleshooting.

## Provides

### Agents

- `dude-pack-hugo-site-architect` — plan and scaffold Hugo projects (config,
  content model, modules, taxonomies, menus, i18n).
- `dude-pack-hugo-template-specialist` — author and refactor Go templates,
  shortcodes, partials, and render-hook overrides.
- `dude-pack-hugo-docs-researcher` — answer Hugo questions from bundled docs
  references; cite chapter/anchor rather than guessing.
- `dude-pack-hugo-migration-specialist` — migrate from other static generators
  (Jekyll, Gatsby, Eleventy, Sphinx, MkDocs) or upgrade across Hugo majors.
- `dude-pack-hugo-troubleshooter` — diagnose build failures, render errors,
  asset pipeline issues, and module/version conflicts.

### Skills

- `dude-pack-hugo-site-builder` — site-creation recipe and content modeling.
- `dude-pack-hugo-template-authoring` — template idioms, scope, render hooks.
- `dude-pack-hugo-asset-pipeline` — Hugo Pipes, SCSS, JS bundling, image
  processing.
- `dude-pack-hugo-docs-reference` — curated Hugo docs reference (bundled).
- `dude-pack-hugo-functions-and-methods` — Hugo template function/method index.
- `dude-pack-hugo-migration` — migration playbooks per source generator.
- `dude-pack-hugo-troubleshooting` — symptom → diagnosis → fix table.

### Instructions

Five `.instructions.md` files for project structure, content authoring, template
discipline, asset/module conventions, and how Dude should route Hugo work.

### Prompts

Eleven Hugo-focused prompts covering site creation, debugging, content modeling,
function lookup, migration, performance optimization, deployment prep, asset
processing, template authoring, and Hugo version upgrades.

## Requires

- `hugo` (extended) on PATH. Many workflows assume `hugo extended`.

## Install / remove

```bash
@dude add pack hugo
@dude remove pack hugo
```

## Related packs

- `docsy` — adds the Docsy theme specialist and Docsy-specific prompts. Many
  Docsy workflows cross-reference Hugo skills, so installing both is common.
- `ms-brand` — Microsoft-specific brand styling layered on Hugo/Docsy sites.
