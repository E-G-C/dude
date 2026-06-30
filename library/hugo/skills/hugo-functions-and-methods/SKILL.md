---
name: hugo-functions-and-methods
description: "Portable cheat sheet for Hugo template functions and object methods. Use when looking up a function namespace, a Page/Site/Resource/Pages method, formatting dates, collections, strings, math, URLs, images, or transforms without external docs."
argument-hint: "Function namespace, method, or 'how do I ...' template task"
---
# Hugo Functions And Methods

Use this skill to answer "which function/method does X" and "how do I call it" questions from bundled material only.

## Procedure

1. Decide whether the user needs a **function** (a namespaced helper such as `strings.Title`, `collections.Where`, `resources.Get`) or a **method** (a property/call on an object such as `.Title`, `.Resources`, `.Pages.ByDate`).
2. For functions, open [template-functions.md](./references/template-functions.md) and find the namespace.
3. For methods, open [methods.md](./references/methods.md) and find the object (Page, Site, Pages, Resource, Menu, Taxonomy, Shortcode, Time, Duration, Pager, Output Format).
4. Give the smallest correct call, note the receiver/context (`.` vs `$`), and mention version-sensitive or security-sensitive behavior.
5. When the answer changes a template, verify with `hugo build` or an inline `{{ debug.Dump $value }}`.

## Calling Rules

- Functions use namespace form in modern Hugo: `strings.ToUpper`, not the bare alias, though many aliases still work (`upper`, `where`, `index`, `len`, `print`).
- The piped value becomes the **last** argument: `{{ "a,b" | strings.Split "," }}` equals `{{ strings.Split "a,b" "," }}` only when arity matches; check argument order.
- Methods are called on the current context: `{{ .Title }}`, `{{ .Site.Params.author }}`, `{{ range .Pages.ByDate }}`.
- `.` rebinds inside `range`/`with`; keep `$` for the page/root context.
- Prefer `collections` and `pages` ordering methods over manual loops for sorting, grouping, and filtering.
- For optional values use `with`; for required values use `errorf`/`warnf` so failures are explicit.

## Common Task Map

- Format a date: `{{ .Date | time.Format "Jan 2, 2006" }}` or `{{ .Date.Format "2006-01-02" }}`.
- First N pages: `{{ range first 5 .Pages }}` or `{{ .Pages | first 5 }}`.
- Sort/group: `.Pages.ByDate`, `.Pages.ByTitle`, `.Pages.GroupByDate "2006"`, `collections.Sort`.
- Filter a collection: `where .Site.RegularPages "Type" "post"`.
- Get a resource: `resources.Get "css/main.css"` (global) or `.Resources.Get "cover.jpg"` (page).
- Remote data/asset: `resources.GetRemote "https://..."`.
- Unmarshal data: `transform.Unmarshal` (also reads CSV from a resource).
- Build a URL: `absURL`, `relURL`, `urls.JoinPath`, `.RelPermalink`.
- Image work: `.Resize`, `.Fill`, `.Crop`, `images.Process`, plus the `images.*` filters.
