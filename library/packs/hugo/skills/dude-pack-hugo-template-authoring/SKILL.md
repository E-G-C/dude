---
name: dude-pack-hugo-template-authoring
description: "Author or debug Hugo templates. Use for layouts, base templates, partials, shortcodes, Markdown render hooks, lookup order, Go template context, Hugo Pipes, page resources, and template performance."
argument-hint: "Template goal, target page kind/type/layout, content shape, output format"
---
# Hugo Template Authoring

Use this skill when creating or fixing templates in a Hugo site.

## Procedure

1. Identify the target page kind, content type, custom layout, language, output format, and page path.
2. Consult [template-checklist.md](./references/template-checklist.md) for the correct template location and common failures.
3. Implement the template with explicit context handling and resource checks.
4. Use render hooks for Markdown conversion, shortcodes for content-author components, and partials for reusable template fragments.
5. Verify with `hugo build`; add `--templateMetrics --templateMetricsHints` for performance work.

## Template Quality Rules

- Keep templates readable; use variables for intermediate values.
- Use `with` for optional values and `errorf` for required missing values.
- Pass context explicitly to partials.
- Use complete cache variant keys with `partialCached`.
- Avoid legacy internal template calls.
