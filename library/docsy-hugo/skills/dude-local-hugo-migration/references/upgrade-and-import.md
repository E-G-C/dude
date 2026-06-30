# Hugo Migration And Upgrade Reference

## Import Into Hugo

### Jekyll
- `hugo import jekyll <jekyll_root_path> <target_path>` creates a starting Hugo skeleton.
- Add `--force` only to import into a non-empty target directory.
- After import, reconcile:
  - Front matter: move custom fields under `params`; keep reserved keys (`date`, `draft`, `slug`, `url`, `type`, `weight`, `aliases`, `menus`, `outputs`).
  - Sections: top-level `content/` folders define sections and default type.
  - Permalinks: recreate Jekyll's URL scheme with `[permalinks]` plus `slug`/`url` per page.
  - Layouts: rebuild Liquid templates as Go templates in the v0.146+ structure.

### WordPress and other systems
- There is no built-in WordPress importer. Export to Markdown with an external tool, then treat it as a loose-Markdown migration.
- Map the export to Hugo's content model: leaf bundles (`index.md`) for pages that own resources, branch bundles (`_index.md`) for sections/lists, taxonomies for categories/tags.
- Preserve old permalinks with `aliases` (generated redirect files) or host-level redirects.

### URL continuity (any source)
- `permalinks` configuration controls section URL patterns.
- `slug` changes the final segment; `url` overrides the whole path and wins over `slug`.
- `aliases` generates client-side redirect files from old paths.
- Verify nothing collides: `hugo build --printPathWarnings`.

## Upgrade Existing Hugo Site To v0.146+

Source of truth for this portable bundle: the upgrade map below.

### Layout folder changes
| Old | New |
|-----|-----|
| `layouts/_default/*` | move up to `layouts/` root |
| `layouts/partials/` | `layouts/_partials/` |
| `layouts/shortcodes/` | `layouts/_shortcodes/` |
| render hooks anywhere | `_markup/` (at any page-path level) |
| `layouts/section/<name>.html` | `layouts/section.html` or a page-path folder |
| `layouts/taxonomy/<name>.html` | `layouts/taxonomy.html` / `layouts/term.html` |
| home `index.html` | `home.html` |
| `list-baseof.html` | `baseof.list.html` |
| `{{ template "_internal/opengraph.html" . }}` | `{{ partial "opengraph.html" . }}` |

### Behavior changes to watch
- `taxonomy.html` is now only a candidate for the `taxonomy` kind, not `term`. Create `term.html` or fall back to `list.html`.
- A folder under `layouts/` not starting with `_` is a page-path root and can nest arbitrarily deep; `_shortcodes` and `_markup` can sit at any level.
- `all.html` is a new catch-all used for all HTML rendering when no more specific template matches.
- The `_internal` template concept is removed; same-named partials now override theme partials cleanly.

### Lookup identifiers (most to least important)
custom `layout` → page kind (`home`/`section`/`taxonomy`/`term`/`page`) → standard layout (`list`/`single`) → output format → `all` → language → media type → page path → `type`.

### Upgrade workflow
1. `hugo version` to record the starting point.
2. `hugo build --logLevel debug` to capture deprecation and path warnings before changes.
3. Apply the folder/file renames above in small batches; build after each batch.
4. Resolve deprecations from the build log and the deprecation guidance below.
5. Build against a clean `public`, then `hugo build --printPathWarnings` and spot-check key URLs.

## Deprecations

- Hugo deprecations normally progress from warning, to error, to removal. Treat warnings as actionable upgrade work.
- Treat deprecation warnings as upgrade work items, not noise. Do not pin an old version to hide them when a forward path exists.
