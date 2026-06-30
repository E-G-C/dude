---
name: hugo-site-builder
description: "Build or scaffold Hugo sites. Use for new site creation, content modeling, config setup, themes, modules, archetypes, menus, taxonomies, assets, multilingual structure, and deployment-ready validation."
argument-hint: "Site brief, content types, theme/module choice, languages, deployment target"
---
# Hugo Site Builder

Use this skill to create or reshape a Hugo site from a developer brief.

## Procedure

1. Inspect the workspace to determine whether it is empty, an existing Hugo site, or a documentation/source repository.
2. Capture the site goal, audience, content types, URL requirements, language requirements, theme/module strategy, asset/data needs, and deployment target.
3. Use [site-blueprint.md](./references/site-blueprint.md) to design the project structure.
4. Create or update configuration, content, archetypes, layouts, assets, data, i18n files, and static files in small steps.
5. Keep config minimal and place custom content metadata under `params`.
6. Validate with `hugo version`, `hugo server -D`, `hugo build`, and targeted diagnostics as needed.
7. Report what was created, how to run it locally, and what remains host-specific.

## Defaults

- Prefer `hugo.toml` for new projects unless the user requests YAML or JSON.
- Prefer page bundles when content owns images or data.
- Prefer render hooks for Markdown-wide link/image/heading behavior.
- Prefer partials for reusable template fragments and shortcodes for reusable content-author calls.
- Avoid editing generated output, vendored modules, or theme source when project overrides are appropriate.
