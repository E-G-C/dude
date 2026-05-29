---
applyTo: "**/hugo.toml,**/hugo.yaml,**/hugo.json,**/config.toml,**/config.yaml"
description: Rules for editing Hugo site configuration in a Docsy project.
---

# Hugo + Docsy site config rules

## File & format
- Prefer `hugo.toml` (Hugo ≥ 0.110 default). Match the user's existing format if different.
- **Order matters in TOML**: `[languages]` MUST appear before `[module]`. Putting `[module]` first silently breaks multilingual sites.

## Hugo module setup (recommended install path)
```toml
[module]
  proxy = "direct"
  [module.hugoVersion]
    extended = true
    min = "0.146.0"
  [[module.imports]]
    path = "github.com/google/docsy"
```
- `extended = true` is required (SCSS).
- Pin Docsy version with `hugo mod get github.com/google/docsy@vX.Y.Z`, not by editing `go.mod` by hand.

## Search — pick exactly one
- `params.gcs_engine_id` (Google CSE) — default
- `params.search.algolia.{appId,apiKey,indexName}` — Algolia DocSearch v3
- `params.offlineSearch: true` — Lunr (also set `offlineSearchSummaryLength`, `offlineSearchMaxResults`)

Never enable two. If the user already has one, ask before swapping.

## Repository links
- Always set `params.github_repo` (required for edit links and issue links).
- Set `enableGitInfo: true` AND `params.github_repo` to get "Last modified" footers.
- Use `params.path_base_for_github_subdir` for content sourced from other repos (supports regex `{from, to}`).

## Common config defaults to recommend
- `enableRobotsTXT: true`
- `markup.goldmark.renderer.unsafe = true` (HTML inside Markdown)
- `markup.highlight.noClasses = false` (required for light/dark code highlighting)
- `markup.highlight.guessSyntax = true`

## Multilingual
- Each language gets its own `contentDir` and `params.{title,description,…}`.
- Set `defaultContentLanguageInSubdir` deliberately — it changes URLs site-wide.

## Outputs (print view)
```yaml
outputs:
  section: [HTML, RSS, print]
```
- `print` is required for `/_print/` pages.
- Don't drop `RSS` unless the user explicitly wants RSS disabled (`disableKinds: [RSS]`).

## Don't
- Don't invent `params.*` keys. Cross-check against the [skill reference](../skills/docsy/SKILL.md#4-site-config-hugotoml--hugoyaml--key-blocks).
- Don't set `theme: docsy` if the site uses Hugo modules — it's redundant and confusing.
