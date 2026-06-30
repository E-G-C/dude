---
description: "Process Hugo assets with Hugo Pipes: Sass, PostCSS/Tailwind, JS bundling, minify, fingerprint, images, remote resources, and PostProcess."
name: "Process Hugo Assets"
argument-hint: "Asset goal: Sass/PostCSS/Tailwind, JS bundle, fingerprint, minify, images, remote data"
agent: "Hugo Template Specialist"
---
Build or fix this Hugo asset pipeline:

`$ARGUMENTS`

Use the `dude-pack-hugo-asset-pipeline` skill. Then:

1. Confirm the source is a resource: global (`assets/`), page (page bundle), or remote (`resources.GetRemote`). Move `static/` files into `assets/` if they must be processed.
2. Build the smallest pipe chain that meets the need and let Hugo cache the whole chain.
3. Publish only via `.Permalink`/`.RelPermalink`/`.Publish`, or inline with `.Content`.
4. Wrap `resources.GetRemote` with `try`, and branch on `.Err`, `.Value`, and nil. Use Dart Sass on `PATH` for cross-edition Sass; only embedded LibSass is Extended-only and deprecated.
5. Add `fingerprint` (and `integrity`) for cacheable production assets; use `resources.PostProcess` only when final-HTML context is required.
6. Verify with `hugo build` (add `--gc` after image/cache changes) and `--templateMetrics` if the pipeline is hot.

Apply the change when possible and report the verification result.
