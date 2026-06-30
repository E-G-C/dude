# Hugo Site Blueprint Checklist

## Discovery

- Site purpose and audience.
- Content types and editorial workflow.
- Expected URL structure and redirects.
- Languages, regions, and localization requirements.
- Theme, custom templates, or Hugo Modules.
- Asset pipeline needs: images, Sass, JavaScript, TypeScript, remote resources.
- Data needs: local data, remote data, CSV, generated content.
- Deployment host and production build constraints.

## Project Structure

```text
my-project/
├── archetypes/
├── assets/
├── content/
├── data/
├── i18n/
├── layouts/
├── static/
├── themes/
└── hugo.toml
```

Use `config/_default/` plus environment directories when production, staging, and development differ.

## Content Model

- Use sections for top-level content groups.
- Add `_index.md` where a section, taxonomy, term, or home page needs content/front matter.
- Use leaf bundles with `index.md` when pages own resources.
- Use archetypes for repeatable front matter and starter body content.
- Put custom fields under `params`.
- Add taxonomies only when they support real browsing or filtering needs.
- Choose one menu strategy and apply it consistently.

## Template Model

- Use root templates such as `home.html`, `page.html`, `section.html`, `taxonomy.html`, `term.html`, `list.html`, and `all.html`.
- Use `_partials` for shared HTML, `_shortcodes` for content-author components, and `_markup` for Markdown render hooks.
- Use `type` and `layout` in front matter only when the default lookup is not the desired behavior.

## Validation

- `hugo version`
- `hugo server -D`
- `hugo build`
- `hugo build --printPathWarnings`
- `hugo list drafts/future/expired/published` when content visibility is uncertain.
- `hugo config mounts` when modules, themes, or mounts are involved.
