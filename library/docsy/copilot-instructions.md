# Copilot Instructions — Docsy Hugo Theme

This workspace is the **user-facing documentation site for the [Docsy](https://github.com/google/docsy) Hugo theme**. Use these instructions when assisting any developer who is building a Hugo site with Docsy, contributing to these docs, or troubleshooting a Docsy project.

## What Docsy is (one-paragraph mental model)

Docsy is a **Hugo theme built on Bootstrap 5 + SCSS** for technical/product documentation sites. It provides three primary page templates — `docs` (left nav + TOC + edit links), `blog` (chronological), and `community` — plus a rich set of shortcodes (alerts, tabs, cards, blocks, swaggerui, readfile, imgproc, etc.), built-in search (Google CSE / Algolia / Lunr offline), light/dark mode, i18n, versioning menu, and configurable repository links. It requires **Hugo extended**.

## Non-negotiables when answering

1. **Always require Hugo extended** (SCSS support) and Node LTS. Min Hugo version per the example site's `hugo.toml` (currently `0.146+`).
2. **Default config file is `hugo.toml`** (Hugo ≥0.110). Treat `hugo.yaml` / `hugo.json` / legacy `config.*` as equivalent — match whichever the user already has.
3. **Hugo Module install is the recommended path.** Only suggest git submodule / NPM / clone when the user explicitly wants them or already uses them. See [docs/get-started/_index.md](docs/get-started/_index.md).
4. **One search engine at a time** — GCS, Algolia, or Lunr offline. Never enable two.
5. **`[languages]` must appear before `[module]`** in `hugo.toml` for multilingual sites.
6. **Shortcode delimiters matter**: `{{< name >}}` for raw/HTML bodies, `{{% name %}}` for Markdown bodies. Markdown-style headings inside `{{% %}}` shortcodes appear in the TOC.
7. **Project-customizable SCSS files** (only these are stable):
   - `assets/scss/_variables_project.scss` — overrides BEFORE Bootstrap
   - `assets/scss/_variables_project_after_bs.scss` — overrides AFTER Bootstrap (color maps)
   - `assets/scss/_styles_project.scss` — custom rules + opt-in imports (`td/code-dark`, `td/extra`, `td/color-adjustments-dark`)
   Shadowing other files in `assets/scss/td/` is unsupported (no SemVer stability).
8. **Production-only features**: Google Analytics, Google Custom Search, and the Lunr index only build under `hugo` (env=production), not `hugo server` (env=development). Use `hugo -e production` to test.
9. **`ref`/`relref` do not resolve `_index`/`index` pages** — use site-rooted relative links instead.
10. **Don't invent shortcode names or parameters.** Use only the ones documented in [docs/content/shortcodes/index.md](docs/content/shortcodes/index.md) and the skill reference.
11. **Hugo `outputs` map is a full replacement per page kind, not a merge.** When enabling agent-support (`markdown`, `LLMS`) or `print`, re-list every format that kind already used (`RSS`, `print`, …) or they silently disappear. See [docs/content/agent-support/index.md](docs/content/agent-support/index.md).

## Repository layout (this docs site)

```
content equivalent → top-level dirs: _index.md, about/, blog/, community/, docs/, examples/, project/, tests/
docs/              ← the user-facing Docsy User Guide (most editing happens here)
docs/content/      ← authoring (shortcodes, navigation, search, taxonomy, …)
docs/get-started/  ← installation, configuration, quickstart, docsy-as-module/
docs/deployment/   ← github-pages, netlify, amazon, local
docs/best-practices/, docs/updating/
project/           ← contributor docs (style guide, build, repo)
blog/              ← release notes & news (YYYY/ subdirs)
tests/             ← regression pages for layouts/shortcodes
```

When editing this site, the **live preview command** is run from `docsy.dev/` inside the upstream theme repo:
```bash
hugo server --themesDir ../..
```

## Style guide (writing) — see [project/style-guide.md](project/style-guide.md)

- Follow the **Google Developer Documentation Style Guide**.
- Front matter: don't quote strings unless required; omit `linkTitle` when equal to `title`.
- Present tense for docs; past tense only for changelog entries.
- Lists: be consistent — periods for sentences/imperatives, omit for fragments.
- Run `npm run check:format` before committing; fix with `npm run fix:format`. Wrap Hugo template directives with `<!-- prettier-ignore-start -->` / `<!-- prettier-ignore-end -->` where Prettier mangles them.

## How to use the supplemental files in this bundle

- **Deep reference** for shortcodes, config keys, gotchas, deployment, SCSS, and search: read [.github/skills/docsy/SKILL.md](.github/skills/docsy/SKILL.md) before answering questions about configuration, shortcodes, deployment, or troubleshooting.
- **Per-file-type rules** are auto-applied via the files under [.github/instructions/](.github/instructions/) (Markdown front matter, `hugo.*` config, SCSS).
- **Reusable prompts** for common tasks (new docs page, new blog post, add shortcode, set up deployment, troubleshoot build) live in [.github/prompts/](.github/prompts/).

## Default answering posture

- Give the user a **minimal working example first** (config snippet, shortcode call, or command), then link to the deeper doc page in this repo.
- Always include **the exact file path** the user should edit and the **exact section** in the config (e.g. `[params.ui]`, `[module.imports]`).
- When a feature has a known gotcha, mention it inline — don't make the user discover it.
- Avoid suggesting changes to internal Docsy partials/SCSS unless the user has confirmed they accept the unsupported-customization tradeoff.
