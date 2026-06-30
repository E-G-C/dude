# Hugo Content Features

Portable reference for Markdown rendering features handled by Goldmark and Hugo. Configure under `[markup.goldmark]` and `[markup.highlight]` in site config. Raw HTML and some extensions are off by default for security.

## Syntax highlighting
- Engine: Chroma, configured in `[markup.highlight]`.
- Key options: `style` (theme), `lineNos` (`true`/`false`/`table`/`inline`), `lineNumbersInTable`, `anchorLineNos`, `codeFences`, `guessSyntax`, `hl_Lines`, `tabWidth`, `noClasses`.
- Fenced code: ```` ```go {linenos=table,hl_lines=["2-3"]} ````.
- Inline/template: `transform.Highlight`, `transform.CanHighlight`, the `highlight` shortcode.
- `noClasses = false` emits CSS classes; generate a stylesheet with `hugo gen chromastyles --style=monokai > syntax.css`.

## Mathematics (LaTeX)
- Enable the Goldmark **passthrough** extension and set delimiters, then load KaTeX/MathJax client-side, or render at build time with `transform.ToMath`.
```toml
[markup.goldmark.extensions.passthrough]
enable = true
[markup.goldmark.extensions.passthrough.delimiters]
block  = [['\[', '\]'], ['$$', '$$']]
inline = [['\(', '\)']]
```
- Gate per page with a `math` param in front matter and a conditional script include in `baseof.html`.
- Build-time alternative (no JS): `{{ transform.ToMath "a^2+b^2=c^2" }}` (KaTeX, server-side).

## Diagrams
- GoAT (ASCII) diagrams render to inline SVG automatically from fenced ```` ```goat ```` blocks (`diagrams.Goat`).
- Mermaid is not built in; add a `_shortcodes/mermaid.html` (or render hook) that loads mermaid.js and wraps the code block.

## Markdown attributes
- Enable `[markup.goldmark.parser.attribute]` `title = true` and `block = true` to add `{.class #id key="val"}` to headings/blocks.
- Used for adding classes/IDs without raw HTML.

## Table of contents
- `{{ .TableOfContents }}` renders a nested list from headings.
- Control depth with `[markup.tableOfContents]` `startLevel`, `endLevel`, `ordered`.

## Summaries
- Automatic summary = first N words (`summaryLength` in config) or up to a `<!--more-->` divider.
- Manual: set `summary` in front matter. Access with `.Summary`; `.Truncated` is true when content exceeds the summary.

## Related content
- Configure `[related]` with indices (e.g., `keywords`, `tags`, `date`).
- In templates: `{{ $related := .Site.RegularPages.Related . }}` or `.Pages.Related`.

## Emoji
- Enable `enableEmoji = true` in config, then use `:smile:` in content, or `transform.Emojify` / the `emojify` function in templates.

## Render hooks (Markdown only)
- Override link/image/heading/codeblock/blockquote/table/passthrough rendering with templates in `layouts/_markup/` (`render-link.html`, `render-image.html`, `render-heading.html`, `render-codeblock.html`, `render-blockquote.html`, `render-table.html`, `render-passthrough.html`).
- Code-block hooks can target a language: `render-codeblock-mermaid.html`.

## Security defaults to remember
- Goldmark `renderer.unsafe = false` strips raw HTML in Markdown. Enable only for trusted content.
- Inline shortcodes are disabled by default.
- `transform.Highlight` and the passthrough extension are safe; raw HTML and `safe.*` bypasses are not — restrict to content you control.
