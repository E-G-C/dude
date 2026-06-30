---
name: docsy
description: Authoritative reference for the Docsy Hugo theme — installation, configuration (hugo.toml), front matter, all shortcodes with parameters, navigation, search, i18n, versioning, SCSS customization, deployment (GitHub Pages / Netlify / S3), and common gotchas. Use whenever the user asks about Docsy, Hugo + Docsy, or is editing files in a Docsy-based site.
---

# Docsy Reference Skill

Dense, source-of-truth reference. Use this file as the portable source for Docsy details; do not depend on sibling repository documentation directories being present.

---

## 1. Install (4 paths)

### A. Hugo Module — recommended
Prereqs: **Hugo extended**, **Go ≥ 1.12**, Git, **Node LTS**, PostCSS deps (`postcss`, `postcss-cli`, `autoprefixer`).

```bash
hugo new site my-site
cd my-site
hugo mod init github.com/me/my-site
hugo mod get github.com/google/docsy@vX.Y.Z
```

`hugo.toml` additions:
```toml
[module]
  proxy = "direct"
  # replacements = "github.com/google/docsy -> <local-docsy-checkout>"  # local dev only
  [module.hugoVersion]
    extended = true
    min = "0.146.0"
  [[module.imports]]
    path = "github.com/google/docsy"
    disable = false
```

Update: `hugo mod get -u github.com/google/docsy`. Verify: `hugo mod graph` (expect docsy, bootstrap, Font-Awesome). Clean: `hugo mod clean`.

**Gotcha:** `[languages]` must come before `[module]`.

### B. Example site (fastest start for beginners)
```bash
git clone --depth 1 --branch vX.Y.Z https://github.com/google/docsy-example.git my-site
cd my-site && hugo server
```

### C. Git submodule
```bash
git submodule add https://github.com/google/docsy.git themes/docsy
cd themes/docsy && git checkout vX.Y.Z && npm install
echo 'theme: docsy' >> hugo.yaml
```
Update: `git submodule update --remote`.

### D. NPM
```bash
hugo new site --format yaml myproject && cd myproject
echo "theme: docsy"$'\n'"themesDir: node_modules" >> hugo.yaml
npm init -y
npm install --save-dev autoprefixer postcss-cli google/docsy#semver:X.Y.Z --omit=peer
```

### Common prereq commands
```bash
nvm install --lts
npm install -D autoprefixer postcss-cli postcss
# optional: install Hugo via npm
npm install hugo-extended@latest --save-dev
```

**Side effect:** `npm install` inside `themes/docsy` creates a sibling `themes/github.com/`. Suppress with `DOCSY_MKDIR_HUGO_MOD_SKIP=1`.

---

## 2. Serve & build

| Command | Env | Purpose |
|---|---|---|
| `hugo server` | development | live reload, no GA/GCS/Lunr index |
| `hugo` | production | full build, generates `public/` and offline-search index |
| `hugo -e <env>` | custom | override env (also enables `buildCondition` matching) |

- macOS FD limit: `sudo launchctl limit maxfiles 65535 200000`
- WSL: run from a Linux mount, never `/mnt/c/...`.

---

## 3. Content structure

- Content root: `content/` or `content/<lang>/`.
- Top-level dirs map to layouts: `docs/` → docs template (left nav, TOC, edit links); `blog/` → reverse-chronological list; `community/` → uses `params.links.user|developer`. Anything else → default landing layout.
- Promote a custom section to the docs layout: front matter `type: docs`.
- Each section needs `_index.md` (branch bundle). Leaf bundles use `mypage/index.md` with sibling assets.

### Doc-rooted site (no `/docs/` prefix, experimental)
```yaml
permalinks:
  page:    { docs: /:sections[1:]/:slug/ }
  section: { docs: /:sections[1:] }
```
Add `build: { render: link }` to the root `_index.md` per language. Debug paths with `hugo --printPathWarnings`.

### Page front matter — Docsy-recognized keys
```yaml
title:
linkTitle:                # omit if equal to title
description:              # also used for SEO meta
date:
weight:                   # sidebar/list order
type: docs                # or swagger
toc_hide: true            # hide from side nav
hide_summary: true        # hide from section listing
notoc: true               # no TOC on page
simple_list: true         # or no_list: true — landing list style
exclude_search: true      # skip Lunr index
hide_feedback: true       # disable feedback widget on this page
disable_toc: true         # no TOC in print view
body_class: "a b"         # extra <body> classes
manualLink: "https://..." # placeholder menu links
manualLinkRelref: ""
manualLinkTitle: ""
manualLinkTarget: _blank
icon: "fa-solid fa-book"  # sidebar/menu icon
sitemap: { priority: 1.0 }
github_url: "..."         # per-page edit URL override (prefer path_base_for_github_subdir)
params:
  ui:
    navbar_theme: dark    # per-page dark navbar
sidebar_root_for: self    # experimental, needs params.ui.sidebar_root_enabled
menu:
  main:
    weight: 20
    pre: "<i class='fa-solid fa-book'></i>"
# blog only:
resources:
  - src: "**.{png,jpg}"
    title: "Image #:counter"
    params: { byline: "Photo: ..." }
```

---

## 4. Site config (`hugo.toml` / `hugo.yaml`) — key blocks

```yaml
baseURL: https://example.com/
title: My Site
enableRobotsTXT: true
enableGitInfo: true                # required for "Last modified"

markup:
  goldmark:
    renderer: { unsafe: true }     # required for HTML in Markdown
    extensions:
      passthrough:                 # only if using KaTeX
        enable: true
        delimiters:
          block:  [['\[','\]'], ['$$','$$']]
          inline: [['\(','\)']]
  highlight:
    style: tango
    noClasses: false               # required for light/dark code
    guessSyntax: true

services:
  googleAnalytics: { ID: G-XXXXXXXX }

params:
  github_repo: "https://github.com/me/my-site"
  github_subdir: ""
  github_project_repo: ""
  github_branch: main
  path_base_for_github_subdir: ""
  version: "0.1"
  version_menu: Releases
  version_menu_pagelinks: true
  archived_version: false
  url_latest_version: "https://example.com/"
  gcs_engine_id: ""                # GCS — pick ONE search
  offlineSearch: false             # Lunr
  offlineSearchSummaryLength: 200
  offlineSearchMaxResults: 25
  prism_syntax_highlighting: false
  disable_click2copy_chroma: false
  buildCondition: ""
  ui:
    breadcrumb_disable: false
    taxonomy_breadcrumb_disable: false
    sidebar_menu_compact: true
    ul_show: 1
    sidebar_menu_foldable: true
    sidebar_menu_truncate: 100
    sidebar_cache_limit: 2000
    sidebar_search_disable: false
    sidebar_root_enabled: false
    navbar_logo: true
    navbar_translucent_over_cover_disable: false
    navbar_theme: light            # or dark
    showLightDarkModeMenu: true
    scrollSpy: { rootMargin: "0px 0px -10%" }
    feedback:
      enable: true
      yes: 'Glad to hear it! <a href="...">File an issue</a>'
      no:  'Sorry. <a href="...">File an issue</a>'
      max_value: 100
  links:
    user:
      - { name: "Mailing list", url: "...", icon: "fa fa-envelope", desc: "...", rel: me }
    developer:
      - { name: "GitHub",       url: "...", icon: "fab fa-github",  desc: "..." }
  taxonomy:
    taxonomyCloud:       [tags, categories]   # [] to hide
    taxonomyCloudTitle:  ["Tag Cloud", "Categories"]
    taxonomyPageHeader:  [tags, categories]
  mermaid:   { theme: default }
  plantuml:  { enable: false, svg: true, svg_image_url: "https://www.plantuml.com/plantuml/svg/" }
  markmap:   { enable: false }
  drawio:    { enable: false, drawio_server: "https://embed.diagrams.net/" }

outputs:
  section: [HTML, RSS, print]      # 'print' enables /_print/ view

taxonomies:
  tag: tags
  category: categories
```

---

## 5. Shortcodes — complete set

Delimiters: `{{< name >}}` (raw/HTML body) | `{{% name %}}` (Markdown body).

### Landing-page blocks
| Name | Params | Notes |
|---|---|---|
| `blocks/cover` | `title`, `image_anchor`, `height` (`min|med|max|full|auto`), `color`, `byline` | Background image = page-bundle file with `background` in name. `featured` in name → Twitter card. |
| `blocks/lead` | `height` (default `auto`), `color` | Centered intro with down arrow. |
| `blocks/section` | `height`, `color`, `type` (use `row` for column children) | Generic container. |
| `blocks/feature` | `title`, `url`, `url_text` (defaults to i18n `ui_read_more`), `icon` | Use inside `blocks/section type="row"`. |
| `blocks/link-down` | `color` (default `info`) | Arrow link to next section. |

### Content helpers
| Name | Params | Notes |
|---|---|---|
| `alert` | `title`, `color` (`primary|info|warning|success|danger|...`) | Use `{{% alert %}}` for Markdown body. Indent body in lists. **Never** put content on the same line as the opening tag. |
| `pageinfo` | `color` (default `primary`) | Banner box at top of page. |
| `imgproc` | positional: `<filename-glob> <Fit|Resize|Fill|Crop> "WxH [opts]"`; body = caption | Reads `resources[*].params.byline`. |
| `swaggerui` | `src="/openapi/petstore.yaml"` | Requires page `type: swagger`. Loads JS from unpkg. |
| `redoc` | positional URL or path | ReDoc rendering. |
| `iframe` | `src`, `width` (`100%`), `tryautoheight` (`true`), `style` (`min-height:98vh; border:none;`), `sandbox`, `name`, `id`, `class`, `sub` (fallback text) | Embed external page. |
| `readfile` | `file` (relative to page, or `/`-rooted from `/content`), `code` (false), `lang` (`plaintext`), `draft` (`"true"` → warn instead of error) | Use `{{% readfile "x.md" %}}` for Markdown content. Nested shortcodes need Hugo ≥ 0.101. |
| `conditional-text` | `include-if="foo"` OR `exclude-if="bar"` | Matched against site `params.buildCondition` (substring). |
| `comment` | — | Hidden by build. |

### Tabs
- `tabpane` params: `lang`, `highlight`, `langEqualsHeader` (use header as language), `persist` (`header|lang|disabled`), `right`, `text` (default false → code).
- `tab` params: `header` (positional OK), `lang`, `highlight`, `right`, `disabled`, `text`. Use `{{% tab %}}` when body is Markdown.

```markdown
{{< tabpane lang="bash" persist="header" >}}
{{< tab header="npm" >}}npm install foo{{< /tab >}}
{{< tab header="yarn" >}}yarn add foo{{< /tab >}}
{{< /tabpane >}}
```

### Cards
- `cardpane` — wrap multiple cards side by side.
- `card` params: `header`, `title`, `subtitle`, `footer`, `code` (bool — render body as code), `lang`, `highlight`.

---

## 6. Code highlighting

### Chroma (default)
- Required for light/dark mode: `noClasses = false`. Add `@import "td/code-dark";` to `_styles_project.scss`.
- Default styles: `friendly` (light), `native` (dark). Override via `assets/scss/td/chroma/_light.scss` & `_dark.scss` (regenerate with `hugo gen chromastyles --style=NAME`).
- Console blocks: ` ```console` → prompts/output unselectable, copy button strips them. Use ` ```bash-session` / ` ```shell-session` to keep selectable.
- Disable copy button: `params.disable_click2copy_chroma: true`.

### Prism (opt-in)
```yaml
params: { prism_syntax_highlighting: true }
```
Replace `static/js/prism.js` and `static/css/prism.css` for custom languages. ` ```none` for unstyled.

---

## 7. Diagrams & math

- **KaTeX**: enable goldmark `passthrough` (see config snippet above), then add `layouts/_markup/render-passthrough.html` containing `{{ partial "scripts/math.html" . }}`. Use ` ```math`, ` ```chem`. mhchem `\ce{...}` supported since Hugo 0.144.
- **Mermaid**: ` ```mermaid` blocks. Configure with `params.mermaid` (`version`, `theme`, `flowchart.diagramPadding`, …).
- **PlantUML**: enable with `params.plantuml.enable: true`. Options: `theme`, `svg_image_url`, `svg`.
- **MarkMap**: ` ```markmap` blocks, `params.markmap.enable: true`.
- **Diagrams.net (drawio)**: `params.drawio.enable: true`, optional `drawio_server`. SVG/PNG with embedded source gets an Edit button.

---

## 8. Search — **pick exactly one**

### Google Custom Search (default)
```yaml
params: { gcs_engine_id: "011737558837375720776:fsdu1nryfng" }
```
Create `content/<lang>/search.md` with `layout: search`. Production build only.

### Algolia DocSearch v3
```yaml
params:
  search:
    algolia: { appId: "...", apiKey: "...", indexName: "..." }
```
Override `layouts/_partials/algolia/head.html` and `…/scripts.html` to customize (empty = disable).

### Lunr (offline)
```yaml
params:
  offlineSearch: true
  offlineSearchSummaryLength: 200
  offlineSearchMaxResults: 25
```
Per-page: `exclude_search: true`. Index only generated by `hugo` (not `hugo server`).

### Custom
Override `layouts/_partials/search-input.html`, `assets/scss/td/_search.scss`, `assets/js/search.js`.

---

## 9. Look & feel / SCSS

**Only these three files are project-customizable (everything else in `assets/scss/` is internal & unstable):**

- `assets/scss/_variables_project.scss` — overrides BEFORE Bootstrap.
- `assets/scss/_variables_project_after_bs.scss` — overrides AFTER Bootstrap (color maps, theme colors).
- `assets/scss/_styles_project.scss` — custom rules + opt-in imports.

Key vars:
```scss
$primary: #...;
$secondary: #...;
$enable-gradients: true;
$enable-shadows: true;
$enable-dark-mode: false;          // disable dark mode entirely
$td-enable-google-fonts: true;
$td-google-font-name: "Roboto";
$td-google-font-family: "Roboto:300,400,700";
$td-navbar-bg-color: $primary;
$td-navbar-min-height: 4rem;
$lighten-amount-for-dark-color-variant: 28%;
```

Add a theme color:
```scss
$custom-colors: ("brand-purple": #6f42c1);
$theme-colors: map-merge($theme-colors, $custom-colors);
// → utility classes .-bg-brand-purple, .-text-brand-purple
```

Opt-in imports in `_styles_project.scss`:
```scss
@import "td/code-dark";              // dark code highlighting
@import "td/extra";                  // extra utilities
@import "td/color-adjustments-dark"; // tweak palettes for dark mode
```

Tables: default class `.td-table` (responsive + striped). Opt out with the Markdown attribute `{.td-initial}`.

### Logo & favicons
- Logo: `assets/icons/logo.svg`. Disable: `params.ui.navbar_logo: false`. Hide site name: `.td-navbar .navbar-brand__name { display: none; }`.
- Favicons: drop set in `static/favicons/`. Override partial: `layouts/_partials/favicons.html`.

### Template hooks
- `layouts/_partials/hooks/head-end.html` — inject into `<head>`.
- `layouts/_partials/hooks/body-end.html` — inject before `</body>`.
- `layouts/<section>/_td-content-after-header.html` — banner above page content (experimental).
- `layouts/_partials/theme-toggler.html` — replace the light/dark menu.

---

## 10. Repository links (`docs` / `blog`)

| Param | Purpose |
|---|---|
| `github_repo` | Required for edit & issue links. |
| `github_subdir` | Content dir not at repo root. |
| `github_project_repo` | Separate project repo → "Create project issue". |
| `github_branch` | Default branch override. |
| `path_base_for_github_subdir` | For content sourced from other repos (regex `{from, to}` supported). |
| `enableGitInfo: true` + `github_repo` | Shows "Last modified" footer. |

Page-meta CSS hooks: `.td-page-meta__view|edit|child|issue|project-issue|lastmod`.

Child page stub template: `assets/stubs/new-page-template.md`.

---

## 11. Versioning

```yaml
params:
  version_menu: Releases
  version_menu_pagelinks: true
  versions:
    - { version: master,  url: https://master.example.com }
    - { name: "**Versions**" }                # heading (no url)
    - { version: v1.3-dev, kind: next,   url: ... }
    - { version: v1.2,     kind: latest, url: ... }
    - { name: "---" }                         # separator
    - { name: "Preview", kind: home, pagelinks: false, url: ... }
  archived_version: true
  version: "0.1"
  url_latest_version: https://your-latest-doc-site.com
```
`kind` → class `dropdown-item-<kind>`. Built-in styles: `latest`, `next`, `home`.

---

## 12. i18n

```yaml
contentDir: content/en
defaultContentLanguage: en
defaultContentLanguageInSubdir: false
languages:
  en:
    languageName: English
    weight: 1
    params: { title: "...", description: "..." }
  no:
    languageName: Norsk
    contentDir: content/no
    params:
      time_format_default: "02.01.2006"
      time_format_blog:    "02.01.2006"
```

RTL: per-language `languageDirection: rtl`, then `npm install rtlcss --save-dev`.

UI strings: `i18n/<lang>.yaml` (project overrides theme). Debug: `hugo server --printI18nWarnings`.

---

## 13. Taxonomies

Defaults: `tags`, `categories`. Disable all: `disableKinds: [taxonomy]`. See config snippet above for `params.taxonomy.*` keys. Override partials: `taxonomy_terms_article`, `taxonomy_terms_article_wrapper`, `taxonomy_terms_cloud`, `taxonomy_terms_clouds`.

---

## 14. Print

```yaml
outputs:
  section: [HTML, RSS, print]
params:
  print: { disable_toc: false }
```
Per-page: `disable_toc: true`. Layout hooks: `layouts/_partials/print/page-heading-<type>.html`, `content-<type>.html`.

---

## 15. Analytics & feedback

GA only fires in `production` builds. Feedback widget emits GA event `page_helpful` (100 for yes, 0 for no). Disable per page: `hide_feedback: true`. SEO meta `description` precedence: page → summary → site.

---

## 16. Deployment

### GitHub Pages (`.github/workflows/deploy-github-pages.yml`)
```yaml
- uses: peaceiris/actions-hugo@v3
  with: { hugo-version: "0.146.0", extended: true }
- uses: actions/setup-node@v4
  with: { node-version: "20", cache: "npm" }
- run: npm ci
- run: hugo --baseURL "https://${REPO_OWNER}.github.io/${REPO_NAME}" --minify
- uses: peaceiris/actions-gh-pages@v4
  with: { github_token: "${{ secrets.GITHUB_TOKEN }}" }
```

### Netlify
| Install method | Build command |
|---|---|
| Hugo module / NPM | `hugo` |
| Git submodule | `cd themes/docsy && git submodule update -f --init && cd ../.. && hugo` |

Env vars: `NODE_VERSION`, `HUGO_VERSION`, `GO_VERSION`. Use Ubuntu Focal 20.04 image. Append `-e development` for non-indexed preview builds.

### Amazon S3 + CloudFront
```toml
[deployment]
[[deployment.targets]]
name = "aws"
URL  = "s3://www.example.com"
cloudFrontDistributionID = "E9RZ8T1EXAMPLEID"
```
Deploy: `hugo --gc --minify && hugo deploy` (auto-invalidates CloudFront). Useful flags: `--maxDeletes`, `--force`.

---

## 17. Upstream Docsy contribution (optional)

For upstream Docsy theme contribution, follow the upstream repository's contributor instructions. For regular Docsy site work, use this portable bundle's install, configuration, content, deployment, and troubleshooting sections instead of assuming any local upstream checkout layout.

General portable notes:
- Use the project's configured formatter or `npm run check:format` / `npm run fix:format` when those scripts exist.
- Wrap Hugo directives that a formatter mangles in `<!-- prettier-ignore-start -->` / `<!-- prettier-ignore-end -->`.
- Use the project's own Docker, CI, or scorecard scripts only when they are present in that project.

---

## 18. AI-agent support (experimental)

Opt-in features that make site content discoverable/consumable by AI agents and automated tools. This feature is experimental; use the examples in this section as the portable reference.

### Markdown output
Add `markdown` to the Hugo `outputs` map for each page kind you want to expose. The `outputs` map is a **full replacement per kind, not a merge** — keep every format the kind already uses (`RSS`, `print`, …) when adding `markdown`.
```yaml
outputs:
  home:    [HTML, markdown]
  page:    [HTML, markdown]
  section: [HTML, RSS, print, markdown]
```
- Page HTML headers gain `rel="alternate"` links to the Markdown version.
- The page meta area gains a **View Markdown** link.
- Opt a single page out: front matter `outputs: [HTML]` (list its real defaults, minus `markdown`).

### `llms.txt`
Add `LLMS` to the **home** page's `outputs`. Docsy generates `/llms.txt` listing the home page, main-menu pages, and Markdown alternates. Format spec: llmstxt.org.
```yaml
outputs:
  home:    [HTML, markdown, LLMS]
  page:    [HTML, markdown]
  section: [HTML, RSS, print, markdown]
```

### Customize output
- Markdown rendering: theme uses `layouts/all.md`; override per kind with project `layouts/home.md`, `layouts/_default/single.md`, etc.
- `llms.txt`: theme uses `layouts/index.llms.txt`; override in project `layouts/`.
- Per shortcode: add output-format-specific shortcode templates so they emit Markdown-friendly content.

### Validation
Docsy projects can use AFDocs to score agent-facing support (Markdown URLs, `llms.txt`, related checks). If a project includes an AFDocs configuration, run the project's documented scorecard command after building or serving the site.

**Server-side (out of Docsy scope):** sites may add content negotiation honoring `Accept: text/markdown` on the same URL as HTML.

---

## 19. Gotchas — check these first when something breaks

- macOS `too many open files` → raise `launchctl limit maxfiles`.
- WSL: run from Linux mount, not `/mnt/c`.
- Node must be active LTS; old Node breaks PostCSS with `Unexpected identifier`.
- PostCSS ≥ 8 requires installing `postcss` explicitly (not just `postcss-cli`).
- `autoprefixer` ≥ 5.0.1 must be installed locally, not globally.
- `[languages]` MUST precede `[module]` in `hugo.toml`.
- Only **one** search option enabled at a time.
- `ref` / `relref` don't work for `_index` / `index` pages — use site-rooted relative links.
- Markdown shortcodes (`{{% %}}`) headings appear in TOC; HTML shortcodes (`{{< >}}`) don't.
- `{{% alert %}}` content in lists must be indented; never on the same line as the opening tag.
- After `npm install` in `themes/docsy/`, expect a sibling `themes/github.com/` directory. Suppress with `DOCSY_MKDIR_HUGO_MOD_SKIP=1`.
- `hugo --printPathWarnings` to diagnose doc-rooted permalink conflicts.
- GA, GCS, Lunr index → production builds only.
- Hugo `outputs` map is a **full replacement per page kind, not a merge** — when adding `markdown`/`LLMS`, re-list `RSS`, `print`, etc. or you'll silently drop them.
- Shadowing internal Docsy SCSS files (`assets/scss/td/*`) works but is **not covered by SemVer**.
