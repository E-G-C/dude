---
description: "Migrate content into Hugo from Jekyll, WordPress, or other Markdown sources while preserving URLs through permalinks, slugs, and aliases."
name: "Migrate To Hugo"
argument-hint: "Source system, content sample, live URL structure, theme/module preference"
agent: "Hugo Migration Specialist"
---
Migrate this site into Hugo:

`$ARGUMENTS`

Use the bundled Hugo migration and reference material as the source of truth. Then:

1. Identify the source system: Jekyll, WordPress export, another SSG, or loose Markdown.
2. For Jekyll, start with `hugo import jekyll <source> <target>`, then reconcile front matter, sections, and permalinks. For other sources, export to Markdown and map it onto Hugo's content model.
3. Map content to sections, leaf vs branch bundles, taxonomies, and `params` front matter.
4. Preserve existing URLs with `permalinks`, `slug`, `url`, and `aliases`, then confirm with `hugo build --printPathWarnings`.
5. Rebuild layouts using the v0.146+ template system.
6. Verify with `hugo build` and `hugo list published`, and report which URLs are preserved and what remains manual.

Migrate incrementally and keep the site building between steps. Do not delete the source project until the result is verified.
