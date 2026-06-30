---
description: "Create or fix Hugo layouts, base templates, partials, shortcodes, render hooks, resource pipelines, or template lookup behavior."
name: "Write Hugo Template"
argument-hint: "Template goal, target page kind/type/layout, content shape, output format"
agent: "Hugo Template Specialist"
---
Create or fix Hugo template behavior for this request:

`$ARGUMENTS`

Use the bundled Hugo template reference. Identify the target page kind, type, layout, output format, language, and page path. Then choose the correct template location and implementation.

Pay particular attention to:

- `.` versus `$` template context.
- Explicit context passed to partials.
- v0.146+ layout paths and filenames.
- Shortcode notation and argument rules.
- Markdown-only render hooks under `_markup`.
- Resource lookup, image processing, and error handling.
- Template metrics if performance is involved.

Apply the change when possible and verify with a Hugo build.
