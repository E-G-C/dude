---
agent: ask
description: Diagnose a failing Docsy build or unexpected rendering.
---

Run through this checklist before deep-diving. Ask the user for the exact error message and the command they ran.

## 1. Environment
- `hugo version` — must include `extended`. If not, install hugo-extended.
- `node --version` — must be active LTS. Old Node + PostCSS → `Unexpected identifier`.
- `go version` — required ≥ 1.12 for Hugo modules.
- Local installs of `autoprefixer`, `postcss-cli`, `postcss` (PostCSS 8+ requires `postcss` explicitly).

## 2. Config
- Is `[languages]` before `[module]` in `hugo.toml`? Reorder if not.
- Is **exactly one** search option enabled (`gcs_engine_id`, `search.algolia.*`, or `offlineSearch`)?
- Is `markup.goldmark.renderer.unsafe = true` set if HTML in Markdown isn't rendering?
- Is `markup.highlight.noClasses = false` set if light/dark code styling is missing?

## 3. Modules
- `hugo mod graph` — does it list `docsy`, `bootstrap`, `Font-Awesome`?
- `hugo mod clean && hugo mod get -u` to refresh.
- If submodule install: `git submodule update --init --recursive` and `cd themes/docsy && npm install`.

## 4. Content
- `ref` / `relref` failing on a section? It can't resolve `_index.md` / `index.md` — use a site-rooted link.
- `{{% alert %}}` body on the same line as the opening tag? Move it to a new line; indent if inside a list.
- Shortcode name or parameter not recognized? Cross-check the [authoritative list](../skills/docsy/SKILL.md#5-shortcodes--complete-set).

## 5. Platform-specific
- macOS `too many open files`: `sudo launchctl limit maxfiles 65535 200000`.
- WSL: source tree must live on a Linux mount, not `/mnt/c/...`.
- `themes/github.com/` directory appeared after `npm install`: harmless; suppress with `DOCSY_MKDIR_HUGO_MOD_SKIP=1`.

## 6. Production-only behavior
- GA / GCS / Lunr index missing in `hugo server`? Run `hugo -e production` or `hugo` to test — those features build only in production.

Once you've isolated the failure, point the user at the relevant section of [skill §19](../skills/docsy/SKILL.md#19-gotchas--check-these-first-when-something-breaks) or the matching configuration/deployment section in the skill.
