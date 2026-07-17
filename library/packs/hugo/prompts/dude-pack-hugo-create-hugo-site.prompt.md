---
description: "Plan and create a Hugo site structure from a brief, including config, content model, layouts, assets, theme or module strategy, and validation commands."
name: "Create Hugo Site"
argument-hint: "Site goal, audience, content types, theme/module preference, languages, deploy target"
agent: "Hugo Site Architect"
---
Create or extend a Hugo site from this brief:

`$ARGUMENTS`

Use the bundled Hugo reference material as the source of truth. Determine whether the current workspace is empty or an existing Hugo site. Then:

1. Identify the site goal, audience, content types, URL model, languages, theme/module approach, and deployment target.
2. Propose the smallest durable structure: config, sections, bundles, archetypes, taxonomies, menus, layouts, assets, data, and static files.
3. Implement the agreed or obvious parts directly when enough information is available.
4. Keep configuration concise and avoid settings that duplicate defaults.
5. Verify with the appropriate Hugo commands and report the local URL or build result.

Prefer current Hugo conventions, including the v0.146+ template layout model.
