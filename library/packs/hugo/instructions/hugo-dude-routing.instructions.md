---
description: "Route every change to this Hugo-powered static website through the Dude coordinator. Auto-applies on any Hugo site surface (config, content, layouts, archetypes, assets, static, data, i18n, themes, modules) so Dude triggers even when the user never types @dude or says 'Hugo'."
name: "Hugo Site Changes Route Through Dude"
applyTo:
  - "hugo.yaml"
  - "hugo.toml"
  - "hugo.json"
  - "config.yaml"
  - "config.toml"
  - "config.json"
  - "config/**/*"
  - "content/**/*"
  - "layouts/**/*"
  - "archetypes/**/*"
  - "assets/**/*"
  - "static/**/*"
  - "data/**/*"
  - "i18n/**/*"
  - "themes/**/*"
  - "go.mod"
  - "go.sum"
  - "package.json"
---
# Hugo Site Changes Route Through Dude

This repository is a Hugo-powered static website (Docsy theme). Any work that
touches a file matching this instruction's `applyTo` globs is a **Hugo site
change** and must be coordinated through the **Dude** coordinator
(`.github/agents/dude.agent.md`) — even when the user never types `@dude` and
never says the word "Hugo".

## Trigger

- Treat any **create, edit, or delete** on a Hugo site surface as a Hugo site
  change: root `hugo.yaml`/`hugo.toml`/`hugo.json` and `config.*`, `config/`,
  `content/`, `layouts/`, `archetypes/`, `assets/`, `static/`, `data/`,
  `i18n/`, `themes/`, `go.mod`/`go.sum`, and `package.json`.
- This trigger is **file/change-based**, not keyword-based. The keyword Fast
  Path in `dude.agent.md` (`## Dispatch Rules` → "Hugo And Docsy Fast Path")
  still applies; this file adds the path-based guarantee so Dude engages even
  for casual or implicit requests.

## What to do

1. **Triage first, act second.** Assess the request the way Dude would before
   doing any domain work (see `## Dispatch Rules` in `dude.agent.md`).
2. **Route to the narrowest specialist** using
   `.github/skills/dude-generic-routing/SKILL.md` and the Hugo And Docsy Fast
   Path roster:
   - Docsy theme/content/shortcodes/search/i18n/versioning/deployment/
     troubleshooting → `@dude-pack-docsy-expert`
   - Hugo reference lookups and version-sensitive behavior →
     `@dude-pack-hugo-docs-researcher`
   - Site structure, config, content model, theme/module strategy, broad
     creation/refactor → `@dude-pack-hugo-site-architect`
   - Layouts, base templates, partials, shortcodes, render hooks, page
     resources, Hugo Pipes, template performance →
     `@dude-pack-hugo-template-specialist`
   - Build/server errors, missing pages, stale output, module/resource
     failures, multilingual bugs, deploy mismatches →
     `@dude-pack-hugo-troubleshooter`
   - Migrations, generator imports, Docsy/Hugo upgrades, v0.146+ work →
     `@dude-pack-hugo-migration-specialist`
3. **Pair the brand check** when the change edits or produces a rendered
   Hugo/Docsy surface: include `@dude-pack-ms-brand-stylist` before close.
4. **Synthesize and report** the specialist's result back through Dude. Do not
   perform specialist domain work inline when a specialist can credibly own it.

## Escape hatches

- **Direct Mode** is still allowed for trivial, read-only questions
  (orientation, a quick factual lookup) where no specialist output is needed.
- **Explicit overrides** are honored: `@dude` forces coordination, and
  `@<specialist>` (for example `@dude-pack-docsy-expert`) targets one
  specialist directly.
- Domain rules in the sibling `hugo-*` and `docsy-*` instruction files still
  apply; this file governs **who coordinates the change**, not the Hugo/Docsy
  details themselves.
