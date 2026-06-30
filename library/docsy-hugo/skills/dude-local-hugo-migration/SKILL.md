---
name: dude-local-hugo-migration
description: "Migrate a site into Hugo or upgrade an existing Hugo site. Use for importing from Jekyll/WordPress/other Markdown sources, preserving URLs, and upgrading layouts to the Hugo v0.146+ template system or resolving deprecations."
argument-hint: "Source system or current Hugo version, content sample, URL requirements"
---
# Hugo Migration And Upgrade

Use this skill to bring content into Hugo or to move an existing Hugo site to current conventions without breaking links or builds.

## Procedure

1. Determine the mode: migrating *into* Hugo from another system, or upgrading an *existing* Hugo site forward.
2. Capture the baseline: source system or `hugo version`, a representative content sample, the live URL structure, and the theme/module strategy.
3. Read [upgrade-and-import.md](./references/upgrade-and-import.md) for the import workflow and the pre-v0.146 to v0.146+ template map.
4. Work incrementally. Keep the site building between steps and verify after each batch of changes.
5. Preserve URLs with `permalinks`, `slug`, `url`, and `aliases`. Confirm with `hugo build --printPathWarnings`.
6. Resolve deprecations using the bundled upgrade reference and the build log at `--logLevel debug`.
7. Report what changed, which URLs are preserved, and any remaining manual steps.

## Rules

- Do not delete source content or pin an old Hugo version to hide warnings when a documented path forward exists.
- Replace `_internal` template calls with partials of the same name.
- Build against a clean `public` so stale paths from the old structure do not linger.
- Custom front matter belongs under `params`; map source fields accordingly.
