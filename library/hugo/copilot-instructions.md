# Hugo Assistance Guidelines

This workspace contains a portable Hugo assistance bundle. When helping a developer create, maintain, or troubleshoot a Hugo site, prefer the bundled reference material under `.github/skills/**/references` over generic memory. Do not assume the upstream Hugo documentation repository is available.

## Operating Model

- Treat Hugo as a pipeline: configuration and modules define the unified file system, content and resources provide data, templates render output, and builds publish to `public`.
- Before changing a Hugo site, inspect the relevant root files and directories: `hugo.toml`, `hugo.yaml`, `hugo.json`, `config/`, `content/`, `layouts/`, `assets/`, `data/`, `i18n/`, `static/`, `themes/`, `go.mod`, and `go.sum`.
- Prefer minimal configuration. The bundled Hugo guidance recommends short config files and defining only settings that differ from defaults.
- Use Hugo's current template model. For v0.146+ templates, prefer `layouts/_partials`, `layouts/_shortcodes`, `layouts/_markup`, and root templates such as `home.html`, `page.html`, `section.html`, `taxonomy.html`, `term.html`, `list.html`, and `all.html`.
- Keep answers practical: show the file path, the exact Hugo concept involved, the smallest safe fix, and the command that verifies it.
- When the user reports a symptom, gather the exact command, Hugo version, error output, relevant front matter/config, and whether it happens under `hugo server` or `hugo build`.

## Bundled Reference Anchors

- General Hugo facts and command map: `.github/skills/hugo-docs-reference/references/authority-map.md`.
- Common gotchas: `.github/skills/hugo-docs-reference/references/gotchas.md`.
- Embedded shortcodes: `.github/skills/hugo-docs-reference/references/embedded-shortcodes.md`.
- Markdown content features (highlighting, math, diagrams, TOC, summaries, related, emoji): `.github/skills/hugo-docs-reference/references/content-features.md`.
- Install, quick start, and hosting: `.github/skills/hugo-docs-reference/references/install-and-host.md`.
- Template functions cheat sheet: `.github/skills/hugo-functions-and-methods/references/template-functions.md`.
- Object methods cheat sheet (Page, Site, Pages, Resource, ...): `.github/skills/hugo-functions-and-methods/references/methods.md`.
- Asset pipeline / Hugo Pipes: `.github/skills/hugo-asset-pipeline/SKILL.md`.
- Site planning checklist: `.github/skills/hugo-site-builder/references/site-blueprint.md`.
- Troubleshooting matrix: `.github/skills/hugo-troubleshooting/references/diagnostic-matrix.md`.
- Template lookup and authoring checklist: `.github/skills/hugo-template-authoring/references/template-checklist.md`.
- Migration and upgrade workflow: `.github/skills/hugo-migration/references/upgrade-and-import.md`.

## Command Habits

- Use `hugo version` or `hugo env` when version or environment matters.
- Use `hugo server -D` while drafting content; add `--navigateToChanged` when editing content-heavy sites.
- Use `hugo build --logLevel debug`, `--printPathWarnings`, `--printI18nWarnings`, `--templateMetrics`, and `--templateMetricsHints` for targeted diagnostics.
- Use `hugo list drafts`, `hugo list future`, `hugo list expired`, and `hugo list published` when pages are missing or unexpected.
- Use `hugo config` and `hugo config mounts` to inspect merged configuration and unified file-system mounts.
- Use `hugo build --gc` after image pipeline changes or cache cleanup needs.

## Hugo Gotchas To Remember

- `baseURL` in a project config should include the protocol and trailing slash.
- Hugo does not clear `public` before building. Stale files can remain after draft, future, expired, alias, permalink, or output changes.
- Draft, future, and expired content is excluded by default unless `-D`, `-F`, or `-E` is used.
- `_index.md` creates content/front matter for home, section, taxonomy, and term list pages; `index.md` creates a leaf bundle regular page.
- A leaf bundle has no descendants. If descendants disappear, check for `index.md` where `_index.md` was intended.
- `section` is derived from the content path and cannot be overridden in front matter. Use `type` to affect template lookup when needed.
- Put custom front matter under `params`; reserved fields include `date`, `draft`, `layout`, `menus`, `outputs`, `params`, `slug`, `translationKey`, `type`, `url`, `weight`, `build`, and `cascade`.
- If both `slug` and `url` are set, `url` wins. Hugo does not sanitize `url`, and reserved Windows path characters can break builds.
- Avoid casually recommending `canonifyURLs` or `relativeURLs`; the docs describe them as legacy or special-case post-processing.
- Raw HTML in Markdown is disabled by default through Goldmark `renderer.unsafe = false`.
- Inline shortcodes are disabled by default for security.
- HTML comments do not safely comment out template code. Use template comments.
- Template context changes inside `range` and `with`; use `$` for root context and pass context explicitly to partials.
- `partialCached` needs variant keys when output depends on page, language, params, output format, or other changing context.
- Custom module mounts replace default mounts unless defaults are explicitly re-added.
- Do not edit `_vendor`; override vendored files by creating the same relative path in the project.
- When upgrading to v0.146+, move `layouts/_default/*` to the root, rename `partials`/`shortcodes` to `_partials`/`_shortcodes`, rename home `index.html` to `home.html`, split `taxonomy.html` and `term.html`, and replace `_internal` template calls with same-named partials.
- Treat deprecation warnings as upgrade work; do not pin an old Hugo version to hide them when a documented forward path exists.
- Multilingual file-name language codes must be lowercase, and `contentDir` values cannot overlap.
