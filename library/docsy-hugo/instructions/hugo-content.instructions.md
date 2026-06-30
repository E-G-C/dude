---
description: "Use when creating or editing Hugo content, archetypes, front matter, sections, taxonomies, menus, page bundles, page resources, shortcodes, URLs, aliases, drafts, or multilingual content."
name: "Hugo Content Model"
applyTo:
  - "content/**/*"
  - "archetypes/**/*"
---
# Hugo Content Model

- Organize `content/` to mirror the rendered site. Top-level content directories define sections and default content type.
- `section` is derived from the content path and cannot be set in front matter. Use `type` when a page must target a different template family.
- Use `_index.md` for home, section, taxonomy, and term list pages. Use `index.md` for leaf bundle regular pages.
- A leaf bundle contains `index.md`, resources, and no descendants. A branch bundle contains `_index.md`, resources, and may have descendants.
- Draft, future, and expired content is excluded by default. Diagnose missing pages with `draft`, `date`, `publishDate`, `expiryDate`, and `hugo list drafts/future/expired/published`.
- Front matter may be TOML, YAML, or JSON. Put custom values under `params`; avoid inventing top-level keys that collide with reserved Hugo fields.
- Common reserved fields include `date`, `draft`, `layout`, `menus`, `outputs`, `params`, `slug`, `translationKey`, `type`, `url`, `weight`, `build`, and `cascade`.
- Use `slug` to change the last URL segment. Use `url` only when overriding the entire path is intentional; `url` wins over `slug` and Hugo does not sanitize it.
- Use `aliases` for old URLs. Prefer server-side redirects only when the host supports them and disable generated alias files intentionally.
- Use one menu definition style consistently: `sectionPagesMenu`, front matter, or configuration.
- Taxonomy front matter uses the configured plural names, for example `tags = [...]` when `[taxonomies] tag = 'tags'`.
- Page resources must live in a page bundle and are accessed through `.Resources`. Resource metadata belongs in the page front matter `resources` array.
- For multilingual content, file-name language codes must be lowercase. `contentDir` values cannot overlap. Use `translationKey` when translated pages do not share paths.
- Use `{{% shortcode %}}` notation when shortcode output or inner content contains Markdown. Use `{{< shortcode >}}` notation when it should be processed after Markdown rendering.
- Shortcode calls can use named or positional arguments, but a single call cannot mix both.
- Raw HTML in Markdown is disabled by default by Goldmark. Do not enable unsafe rendering unless the content source is trusted.
