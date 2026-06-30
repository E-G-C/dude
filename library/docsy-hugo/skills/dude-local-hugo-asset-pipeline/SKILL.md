---
name: dude-local-hugo-asset-pipeline
description: "Portable guide to Hugo Pipes and asset processing. Use when bundling/minifying/fingerprinting CSS or JS, transpiling Sass, running PostCSS/Tailwind, processing images, reading remote resources, or using resources.PostProcess."
argument-hint: "Asset task: Sass, PostCSS, Tailwind, JS bundling, fingerprint, minify, images, remote data"
---
# Hugo Asset Pipeline (Hugo Pipes)

Use this skill for `assets/` processing with Hugo Pipes. For directory/module placement of assets, also use the assets-modules instruction.

## Procedure

1. Confirm the file is a **resource**: global (`assets/`), page (page bundle), or remote (HTTP/S).
2. Capture it: `resources.Get`, `resources.GetMatch`, `resources.Match`, `.Resources.Get`, or `resources.GetRemote`.
3. Build the smallest pipe chain that meets the need; let Hugo cache the whole chain.
4. Publish only when needed via `.Permalink`, `.RelPermalink`, or `.Publish`; use `.Content` to inline.
5. Verify with `hugo build` (add `--gc` after image/cache changes); use `hugo build --templateMetrics` if pipelines are hot.

## Core Rules

- A resource must exist before processing. Static files under `static/` are **not** resources; move them to `assets/` to process them.
- Pipe chains are cached by the entire chain, so they are safe in templates executed many times.
- Wrap `resources.GetRemote` with `try`; branch on `.Err`, `.Value`, and nil before use.
- Dart Sass works with any Hugo edition when the `dart-sass` binary is on `PATH`. Embedded LibSass requires Extended and is deprecated. WebP encoding is supported in all current Hugo editions.
- Fingerprinting enables long cache lifetimes and Subresource Integrity (`.Data.Integrity`).

## Recipes

### CSS from Sass
```go-html-template
{{ $opts := dict "transpiler" "dartsass" "targetPath" "css/main.css" }}
{{ $css := resources.Get "scss/main.scss" | css.Sass $opts | minify | fingerprint }}
<link rel="stylesheet" href="{{ $css.RelPermalink }}" integrity="{{ $css.Data.Integrity }}">
```
- `transpiler` is `dartsass` (recommended) or `libsass`. Dart Sass requires the `dart-sass` binary on `PATH`; embedded LibSass requires Extended and is deprecated.

### PostCSS / Tailwind
```go-html-template
{{ $css := resources.Get "css/main.css" | css.PostCSS }}
```
- Requires Node, a `postcss.config.js`, and `postcss-cli` installed. For Tailwind v4 use `css.TailwindCSS`; for older setups use a PostCSS plugin.

### JavaScript bundling (esbuild)
```go-html-template
{{ $opts := dict "minify" hugo.IsProduction "target" "es2018" }}
{{ $js := resources.Get "js/main.js" | js.Build $opts | fingerprint }}
<script src="{{ $js.RelPermalink }}"></script>
```
- `js.Build` (esbuild) handles imports, JSX/TS, and tree-shaking. `js.Babel` runs Babel; `js.Batch` builds many entry points together.

### Minify and fingerprint
- `resources.Minify` (`minify`) supports CSS, JS, JSON, SVG, HTML, XML.
- `resources.Fingerprint` (`fingerprint`) hashes the file into its name; default algorithm `sha256`.

### Concatenate / bundle
```go-html-template
{{ $bundle := slice (resources.Get "js/a.js") (resources.Get "js/b.js") | resources.Concat "js/bundle.js" }}
```

### Resource from string or template
- `resources.FromString "path" $content` makes a resource from a string.
- `resources.ExecuteAsTemplate "out.css" . (resources.Get "in.css")` renders Go-template syntax inside an asset (e.g., inject site params).

### Remote resources
```go-html-template
{{ $url := "https://example.org/data.json" }}
{{ with try (resources.GetRemote $url) }}
	{{ with .Err }}
		{{ errorf "%s" . }}
	{{ else with .Value }}
		{{ $data := . | transform.Unmarshal }}
	{{ else }}
		{{ errorf "Unable to get remote resource %q" $url }}
	{{ end }}
{{ end }}
```

### Images
```go-html-template
{{ $img := (resources.Get "images/hero.jpg").Fill "1200x630 webp q85" }}
<img src="{{ $img.RelPermalink }}" width="{{ $img.Width }}" height="{{ $img.Height }}" alt="">
```
- Methods: `.Resize`, `.Fit`, `.Fill`, `.Crop`, `.Filter`, `.Process`. Filters live in the `images.*` namespace.
- Transformed images lose metadata; read `.Exif`/`.Meta` from the original.
- Configure defaults in `[imaging]` (quality, resampling filter, anchor, format).

### PostProcess (defer until build end)
```go-html-template
{{ $css := resources.Get "css/main.css" | css.PostCSS | minify | fingerprint | resources.PostProcess }}
```
- `resources.PostProcess` defers work (e.g., PurgeCSS that needs final HTML). Only call it on production-relevant chains; it runs after templates render.

## Diagnostics

- Slow pipelines: `hugo build --templateMetrics --templateMetricsHints`.
- Stale or orphaned generated assets: `hugo build --gc`.
- Resource not found: confirm it is in `assets/` (or mounted there) and the path is correct; `hugo config mounts`.
- Sass/PostCSS errors: confirm Dart Sass or the intended Sass transpiler is installed, and confirm Node tooling for PostCSS/Tailwind/Babel workflows.
