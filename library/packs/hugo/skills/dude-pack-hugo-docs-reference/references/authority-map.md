# Portable Hugo Reference Map

This file is the portable replacement for repository-local Hugo documentation paths. Use it with `gotchas.md`, the site blueprint, the template checklist, the migration reference, and the diagnostic matrix.

## Mental Model

- Hugo is a static site generator written in Go. A site is source content, data, resources, configuration, modules/themes, and templates rendered into a publish directory, normally `public`.
- Development usually uses `hugo server`; publishing uses `hugo` or `hugo build`.
- Hugo Modules and themes can contribute content, layouts, data, assets, i18n resources, archetypes, static files, and configuration through a unified file system.
- Project files generally override theme and module files with the same virtual path.

## Project Structure

- `archetypes/`: templates used when creating new content.
- `assets/`: global resources processed by Hugo Pipes, such as images, Sass, JavaScript, and TypeScript.
- `content/`: Markdown and other content files, plus page resources in bundles.
- `data/`: JSON, TOML, YAML, and XML loaded into `site.Data`.
- `i18n/`: translation tables.
- `layouts/`: templates, partials, shortcodes, render hooks, and overrides.
- `static/`: files copied directly to the published site.
- `themes/`: local theme directories.
- `hugo.toml`, `hugo.yaml`, or `hugo.json`: root configuration. Prefer `hugo.toml` for new sites unless another format is requested.
- `public/`: generated site output. Hugo does not clear this directory before builds.
- `resources/`: generated cache for assets and image processing.

## Essential Commands

- `hugo version` or `hugo env`: capture version and environment for bug reports and version-sensitive behavior.
- `hugo new project <path>`: create a project skeleton.
- `hugo new content <path>`: create content from archetypes. Use `--kind <kind>` to force an archetype.
- `hugo server`: run the development server with file watching and LiveReload.
- `hugo server -D`: include draft content while developing.
- `hugo server --navigateToChanged`: redirect the browser to the edited content page.
- `hugo server --poll 700ms`: use polling when file watching fails on WSL, removable drives, or network filesystems.
- `hugo` or `hugo build`: build the site to `public` unless configured otherwise.
- `hugo build --gc`: remove unused generated resources from caches.
- `hugo build --minify`: minify supported output formats for production builds.
- `hugo build --logLevel debug`: collect detailed build diagnostics.
- `hugo build --printPathWarnings`: find duplicate target paths and URL collisions.
- `hugo build --printI18nWarnings`: find missing translations.
- `hugo build --templateMetrics --templateMetricsHints`: measure template performance and cache opportunities.
- `hugo config`: inspect merged configuration.
- `hugo config mounts`: inspect unified file-system mounts.
- `hugo list drafts`, `hugo list future`, `hugo list expired`, `hugo list published`: diagnose content visibility.
- `hugo mod init/get/tidy/vendor/graph/clean`: manage Hugo Modules.
- `hugo import jekyll <source> <target>`: create a starting Hugo site from a Jekyll project.

## Configuration

- Keep configuration short. Define only settings that differ from Hugo defaults.
- Root configuration names are `hugo.toml`, `hugo.yaml`, and `hugo.json`, with that precedence.
- Use `config/_default/` plus environment directories such as `config/production/` and `config/staging/` for larger sites.
- In split configuration files such as `params.toml` or `menus.en.toml`, omit the root key.
- `baseURL` should include protocol and trailing slash, such as `https://example.org/`.
- `hugo server` defaults to the `development` environment; `hugo build` defaults to `production`.
- Environment variables override file configuration. Use `HUGO_` for standard settings and `HUGO_PARAMS_` for custom parameters.
- Hugo can merge maps from themes/modules into project config, but slice values are not merged. Be careful with `menus`, `outputs`, and output-format lists.
- Custom module mounts replace default mounts for that component unless defaults are explicitly re-added.

## Content Model

- Organize `content/` to mirror the rendered site.
- Top-level directories under `content/` define sections and default content type.
- `section` is derived from the path and cannot be overridden in front matter. Use `type` to influence template lookup.
- `_index.md` gives content and front matter to home, section, taxonomy, and term list pages.
- `index.md` creates a leaf bundle regular page.
- Leaf bundles have resources and no descendants. Branch bundles may have descendants.
- Draft, future, and expired content is excluded by default. Use `-D`, `-F`, and `-E` intentionally.
- Front matter may be TOML, YAML, or JSON. Put custom fields under `params`.
- Common reserved fields include `date`, `draft`, `layout`, `menus`, `outputs`, `params`, `slug`, `translationKey`, `type`, `url`, `weight`, `build`, and `cascade`.
- `slug` changes the final URL segment. `url` overrides the entire path and wins over `slug`; Hugo does not sanitize `url`.
- Use `aliases` to generate redirects from old URLs.
- Use one menu strategy consistently: automatic section menu, front matter, or configuration.
- Taxonomies classify content using configured plural names such as `tags` or `categories`.
- Page resource metadata belongs in front matter under the `resources` array.

## Templates

- Hugo templates use Go `text/template` and `html/template`; HTML templates are escaped by default.
- Dot (`.`) is the current context. It changes inside `range` and `with`. Use `$` to retain root context.
- Use `:=` to initialize variables and `=` to reassign existing variables.
- The piped value becomes the final argument to the function or method.
- `nil` can be used in comparisons, but not assigned or passed to functions.
- Pass context explicitly to partials, for example `{{ partial "pagination.html" . }}`.
- Use template comments `{{/* ... */}}`; HTML comments do not disable template execution.
- For v0.146+ templates, use `layouts/_partials`, `layouts/_shortcodes`, `layouts/_markup`, and root templates such as `home.html`, `page.html`, `section.html`, `taxonomy.html`, `term.html`, `list.html`, and `all.html`.
- `taxonomy.html` and `term.html` are distinct. Create both or use a broader `list.html` or `all.html`.
- Replace legacy `_internal` template calls with same-named partials such as `{{ partial "opengraph.html" . }}`.
- Base template variants use names such as `baseof.html`, `baseof.list.html`, and `baseof.term.html`.
- Use `partialCached` only when output is stable for the chosen variant keys. Include page, language, params, output format, or other changing context when those affect output.

## Shortcodes And Render Hooks

- Custom shortcodes live under `layouts/_shortcodes`.
- A shortcode call can use named or positional arguments, but not both in the same call.
- Use `{{% shortcode %}}` notation when the shortcode output or inner content should be processed as Markdown.
- Use `{{< shortcode >}}` notation when shortcode output should be merged after Markdown rendering.
- Inline shortcodes are disabled by default for security.
- Render hooks live under `layouts/_markup` and affect Markdown conversion only.
- Render hooks can customize links, images, headings, code blocks, blockquotes, tables, and passthrough elements.
- Custom link and image hooks can override embedded multilingual behavior.

## Assets, Data, And Images

- Use `assets/` for global resources processed by Hugo Pipes.
- Use `static/` for direct-copy files such as `favicon.ico`, `robots.txt`, verification files, or already-built assets.
- Capture resources before processing: `.Resources.Get` for page resources, `resources.Get` for global resources, and `resources.GetRemote` for remote resources.
- Assets are published when `.Permalink`, `.RelPermalink`, or `.Publish` is invoked. Use `.Content` to inline.
- Hugo Pipes caches complete pipe chains.
- Image processing requires a page, global, or remote resource. Transformed images do not preserve metadata; read metadata from the original resource.
- Use `reflect.IsImageResourceProcessable` when image format support is uncertain.
- Use `hugo build --gc` after image pipeline changes, renames, or removals.
- `data/` is loaded into memory as `site.Data`; use it for broadly used JSON, TOML, YAML, and XML.
- Do not put CSV files in `data/`; use page, global, or remote resources with `transform.Unmarshal`.
- For infrequently accessed data, prefer resources over always-loaded `site.Data`.

## Modules, Themes, And Multilingual

- Hugo Modules require Git and Go for module operations.
- Module imports are recursive and top-down; earlier imports take precedence on path collisions.
- Do not edit `_vendor`; override vendored files with matching paths in the project.
- Use `hugo mod graph` and `hugo config mounts` to diagnose module and mount precedence.
- Run `hugo mod tidy` after dependency changes.
- Use `hugo mod npm pack` after module Node dependency changes when using Hugo's module npm workflow.
- Multilingual file-name language codes must be lowercase, such as `about.en-us.md`.
- Multilingual `contentDir` values cannot overlap.
- Use `translationKey` when translated pages do not share path and basename.
- Localize menu entries through language-specific menu config, front matter, or translation tables depending on how the menu is defined.

## Deployment And Troubleshooting

- Hugo publishes generated files to `public` by default. Deployment should publish the contents of that directory or the configured destination.
- Because Hugo does not clear `public`, clean generated output when removed, draft, future, expired, alias, permalink, or output-format changes leave stale files.
- `hugo deploy` is for configured cloud-storage targets such as S3-compatible storage, Azure Blob Storage, and Google Cloud Storage.
- Missing pages: check `draft`, future `date`, future `publishDate`, past `expiryDate`, language content directory, and whether the file is a page resource inside a leaf bundle.
- Missing descendants: check for `index.md` where `_index.md` was intended.
- Inconsistent output or duplicate URLs: run `hugo build --printPathWarnings`.
- Template debugging helpers include `debug.Dump`, `printf "%[1]v (%[1]T)"`, `warnf`, and `templates.Current`.
- Performance tuning starts with `hugo build --templateMetrics --templateMetricsHints`; target high cumulative time and high cache-potential templates first.
