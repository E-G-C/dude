# Hugo Template Checklist

## Current Layout Structure

Prefer Hugo v0.146+ paths:

```text
layouts/
├── baseof.html
├── home.html
├── page.html
├── section.html
├── taxonomy.html
├── term.html
├── list.html
├── all.html
├── _partials/
├── _shortcodes/
└── _markup/
```

Use page-path folders under `layouts/` for more specific behavior. A folder that does not begin with `_` represents a page path.

## Lookup Inputs

Consider:

- Custom `layout` front matter.
- Page kind: `home`, `section`, `taxonomy`, `term`, or `page`.
- Standard layout: `list`, `single`, or `all`.
- Output format and media suffix.
- Language.
- Page path.
- Content `type`.

## Context Rules

- `.` is current context.
- `range` and `with` rebind `.`.
- `$` holds root context after assignment.
- Pass context to partials: `{{ partial "name.html" . }}`.
- Use `:=` to initialize and `=` to reassign.
- The piped value becomes the final argument.
- `nil` can be compared but not assigned or passed to functions.

## Partials

- Use `_partials` for shared fragments.
- Use dictionaries when a partial needs multiple values: `{{ partial "card.html" (dict "page" . "variant" "compact") }}`.
- Use `partialCached` only with full variant keys.

## Shortcodes

- Use `_shortcodes` for reusable content-author calls.
- Do not mix named and positional arguments in one shortcode call.
- Use Markdown shortcode notation when inner content or output should be rendered as Markdown.
- Inline shortcodes are disabled by default.

## Render Hooks

- Use `_markup` for Markdown links, images, headings, code blocks, blockquotes, tables, and passthrough.
- Render hooks affect Markdown only.
- Custom hooks override embedded hooks unless config chooses embedded fallback or always behavior.

## Debugging

- Use `debug.Dump` for structures.
- Use `printf "%[1]v (%[1]T)" $value` for values and types.
- Use `warnf` for console diagnostics.
- Use `templates.Current` to show template execution boundaries or call stack.
- Use `hugo build --templateMetrics --templateMetricsHints` for performance and cache opportunities.
