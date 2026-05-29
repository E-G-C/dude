---
applyTo: "**/content/**/*.md,_index.md,about/**/*.md,blog/**/*.md,community/**/*.md,docs/**/*.md,examples/**/*.md,project/**/*.md,tests/**/*.md"
description: Rules for authoring Markdown content in a Docsy Hugo site.
---

# Markdown content rules (Docsy)

## Front matter
- Use YAML (`---`) front matter. Don't quote strings unless the value contains `:`, `#`, or starts with a reserved char.
- Omit `linkTitle` when it equals `title`.
- Set `weight` on every page that should have a deterministic sidebar/list position. Use multiples of 10.
- Set `description` — it's used for SEO meta and section listings.
- Use only [Docsy-recognized keys](../skills/docsy/SKILL.md#3-content-structure). Don't invent keys hoping they'll be picked up.

## Section files
- Each section directory needs `_index.md` (branch bundle). Leaf pages with assets use `mypage/index.md` (leaf bundle) with images alongside.
- To make a custom top-level section use the docs layout (left nav, TOC, edit links), add `type: docs`.

## Links
- **Never** use `ref` / `relref` to point at `_index.md` or `index.md` — they don't resolve. Use site-rooted relative links: `[link](/docs/get-started/)`.
- Cross-page links use lowercase, trailing-slash URLs to match Hugo's pretty URLs.

## Shortcodes
- Pick the delimiter consciously:
  - `{{< name >}}` — raw/HTML body. Headings inside do NOT appear in the page TOC.
  - `{{% name %}}` — Markdown body. Headings inside DO appear in the TOC.
- `{{% alert %}}`:
  - Always put the body on a NEW line below the opening tag.
  - When inside a list item, indent the entire shortcode to match the list item.
- Only use shortcodes documented in [docs/content/shortcodes/index.md](../../docs/content/shortcodes/index.md) and the [skill reference](../skills/docsy/SKILL.md#5-shortcodes--complete-set). Don't fabricate parameters.
- For code-only tab panes use `text=false` (default); for prose tab panes use `{{% tab %}}` with `text=true`.

## Code blocks
- Use ` ```console` only when prompts/output should be unselectable (copy button strips them). Use ` ```bash-session` / ` ```shell-session` when the user must be able to copy the prompt.
- Set a language on every fenced block (Hugo's `guessSyntax` is a fallback, not a license to omit it).

## Style (per [project/style-guide.md](../../project/style-guide.md))
- Follow the Google Developer Documentation Style Guide.
- Present tense; past tense only in changelog entries.
- Lists: be consistent — periods for sentences/imperatives, omit for fragments.
- Run `npm run check:format` before committing; wrap Hugo directives Prettier mangles in `<!-- prettier-ignore-start -->` / `<!-- prettier-ignore-end -->`.
