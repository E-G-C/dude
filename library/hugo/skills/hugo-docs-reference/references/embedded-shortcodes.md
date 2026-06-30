# Hugo Embedded Shortcodes

Portable reference of the shortcodes Hugo ships built in. Call from content with `{{</* name args */>}}` (HTML pass-through) or `{{%/* name args */%}}` (render inner as Markdown). Do not mix named and positional arguments in one call. Custom shortcodes in `layouts/_shortcodes/` with the same name override these.

## Media embeds
- `youtube` — `{{</* youtube id="w7Ft2ymGmfc" */>}}` or positional `{{</* youtube w7Ft2ymGmfc */>}}`. Params: `id`, `title`, `loading`, `class`, `start`, `end`, `autoplay`, `mute`, `controls`, `loop`.
- `vimeo` — `{{</* vimeo id="55073825" */>}}`. Params include `id`, `title`, `class`, `loading`.
- `instagram` — `{{</* instagram CxOWiQNP2MO */>}}`.
- `x` (formerly twitter) — `{{</* x user="SanDiegoZoo" id="1453110110599868418" */>}}`.

## Images and figures
- `figure` — `{{</* figure src="/img/a.jpg" alt="..." caption="..." */>}}`. Params: `src`, `alt`, `link`, `target`, `rel`, `title`, `caption`, `class`, `width`, `height`, `loading`, `attr`, `attrlink`.
- `qr` — generate a QR code: `{{</* qr text="https://example.org" level="high" */>}}`. Params: `text`, `level`, `scale`, `targetDir`, plus styling. (Backed by `images.QR`.)

## Code and content
- `highlight` — syntax-highlight a block: `{{</* highlight go "linenos=table,hl_lines=2 4" */>}}...{{</* /highlight */>}}`. Options match Chroma highlight options.
- `details` — collapsible `<details>` block: `{{</* details summary="More" */>}}inner Markdown{{</* /details */>}}`.
- `param` — print a front matter or site param: `{{%/* param "author" */%}}`.

## Cross references (resolve to other pages — build fails on broken links by default)
- `ref` — absolute URL to another page: `{{</* ref "/about" */>}}` or `{{</* ref "post.md" */>}}`.
- `relref` — relative URL to another page: `{{</* relref "/about" */>}}`.
- Both accept a path, a logical path, or a heading anchor: `{{</* ref "/about#team" */>}}`.

## Notes
- Use `{{%/* ... */%}}` when the shortcode output (or its `.Inner`) is Markdown to be rendered; use `{{</* ... */>}}` when it is final HTML.
- Inline shortcodes (`{{</* name */>}}{{</* /name */>}}` defined in content) are disabled by default for security; enable via security config only for trusted content.
- Prefer the Markdown render-hook for links/images (`_markup/render-link.html`, `_markup/render-image.html`) over wrapping every image in `figure` when you want site-wide behavior.
