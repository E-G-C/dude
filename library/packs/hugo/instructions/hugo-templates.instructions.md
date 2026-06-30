---
description: "Use when authoring or debugging Hugo templates, layouts, base templates, partials, shortcodes, render hooks, lookup order, Go template context, and template performance."
name: "Hugo Templates"
applyTo:
  - "layouts/**/*"
  - "themes/**/layouts/**/*"
---
# Hugo Templates

- Prefer the Hugo v0.146+ layout structure. Use `layouts/_partials`, `layouts/_shortcodes`, and `layouts/_markup` instead of legacy `partials`, `shortcodes`, and broad `_default` guidance.
- Root template candidates include `home.html`, `page.html`, `section.html`, `taxonomy.html`, `term.html`, `list.html`, and `all.html`.
- A folder under `layouts/` that does not start with `_` represents a page path. `_markup` and `_shortcodes` can appear at levels where page-path-specific behavior is needed.
- `taxonomy.html` and `term.html` are distinct. Create both or use a broader layout such as `list.html` when appropriate.
- For base templates in the new naming model, use names such as `baseof.html`, `baseof.list.html`, and `baseof.term.html`.
- Template lookup is influenced by custom `layout`, page kind, standard layout, output format, `all`, language, media type, page path, and `type`.
- The dot (`.`) is current context and changes inside `range` and `with`. Use `$` for root context when needed.
- Pass context explicitly to partials: `{{ partial "pagination.html" . }}`.
- Use `:=` to initialize a variable and `=` to assign to an already-initialized variable.
- The piped value becomes the final argument to the function or method receiving it.
- `nil` may be used in comparisons, but not assigned to a variable or passed as a function argument.
- Use template comments `{{/* ... */}}`; HTML comments do not disable template execution.
- Hugo uses Go `html/template` for HTML output by default, so escaping and context matter.
- Use `with`, `try`, `errorf`, and `warnf` to make missing resources and invalid data explicit.
- Render hooks live in `_markup` and only affect Markdown conversion. Custom render hooks override embedded hooks unless configuration requests embedded fallback behavior.
- Use `partialCached` only with complete variant keys when output depends on page, language, params, output format, resource state, or other context.
- Use `hugo build --templateMetrics --templateMetricsHints` for performance analysis and `debug.Dump`, `printf`, `warnf`, or `templates.Current` for data inspection.
- For specific template functions and object methods (Page, Site, Pages, Resource, Menu, Taxonomy), use the `dude-pack-hugo-functions-and-methods` skill.
