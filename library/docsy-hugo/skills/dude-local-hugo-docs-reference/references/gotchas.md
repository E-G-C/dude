# Hugo Gotchas

## Builds And Commands

- Hugo does not clear `public` before building. Existing files can remain when pages become drafts, expire, move, or change output paths.
- Draft, future, and expired content is excluded by default. Use `-D`, `-F`, and `-E` intentionally.
- `baseURL` should include protocol and trailing slash.
- Watch failures on WSL, removable drives, or network filesystems often need `hugo server --poll 700ms`.

## Content And URLs

- `_index.md` is for home, section, taxonomy, and term list pages. `index.md` is for leaf bundle regular pages.
- Leaf bundles cannot have descendants. If descendants disappear, check for `index.md` where `_index.md` was intended.
- `section` comes from the content path and cannot be overridden in front matter.
- Custom front matter belongs under `params` to avoid reserved fields.
- If `url` and `slug` are both set, `url` wins. Hugo does not sanitize `url`.
- Avoid `canonifyURLs` and `relativeURLs` unless the documented special case applies.

## Templates

- In Hugo v0.146+, prefer `layouts/_partials`, `layouts/_shortcodes`, `_markup`, and root templates such as `home.html`, `page.html`, `section.html`, `taxonomy.html`, `term.html`, `list.html`, and `all.html`.
- `taxonomy.html` and `term.html` are no longer interchangeable.
- Partial calls usually need explicit context: `{{ partial "x.html" . }}`.
- The dot changes inside `range` and `with`; keep `$` for root context.
- HTML comments do not disable Hugo template execution. Use `{{/* ... */}}`.
- `nil` can be compared but not assigned or passed to functions.
- `partialCached` needs variant keys for any output-dependent context.

## Security And Markup

- Goldmark raw HTML rendering is disabled by default with `renderer.unsafe = false`.
- Inline shortcodes are disabled by default for security.
- Render hooks affect Markdown only.

## Assets, Data, And Modules

- CSV files should not go in `data/`; use page/global/remote resources plus `transform.Unmarshal`.
- Image metadata is not preserved after transformations.
- Use `hugo build --gc` to clean unused generated resources.
- Custom module mounts replace default mounts unless the defaults are explicitly re-added.
- Do not edit `_vendor`; override with matching project paths.
- Multilingual file-name language codes must be lowercase, and `contentDir` values cannot overlap.
