---
description: "Use when working with Hugo assets, Hugo Pipes, image processing, data files, static files, i18n, modules, themes, mounts, vendoring, or Node dependencies."
name: "Hugo Assets Modules And Data"
applyTo:
  - "assets/**/*"
  - "data/**/*"
  - "i18n/**/*"
  - "static/**/*"
  - "package.json"
  - "package-lock.json"
  - "pnpm-lock.yaml"
  - "yarn.lock"
  - "go.mod"
  - "go.sum"
---
# Hugo Assets, Modules, And Data

- Use `assets/` for global resources processed by Hugo Pipes. Use `static/` for files copied directly to `public`.
- A resource must be captured before processing: page resources with `.Resources`, global resources with `resources.Get`, and remote resources with `resources.GetRemote`.
- Assets are published when `.Permalink`, `.RelPermalink`, or `.Publish` is invoked. Use `.Content` to inline resource content.
- Hugo Pipes caches complete pipe chains. Pipeline-heavy templates can be safe when the chain is stable and cached.
- To process images, capture the file as a page, global, or remote resource first. Use `reflect.IsImageResourceProcessable` when format support is uncertain.
- Image metadata is not preserved across transformations. Read metadata from the original resource when needed.
- Use `hugo build --gc` to remove unused generated resources after image processing changes, renames, or removals.
- The `data/` directory supports JSON, TOML, YAML, and XML merged into `site.Data`. Do not place CSV files in `data/`; use page/global/remote resources with `transform.Unmarshal` instead.
- For infrequently accessed data, prefer page, global, or remote resources over loading everything into `site.Data` for the entire build.
- Hugo Modules can provide static files, content, layouts, data, assets, i18n resources, and archetypes through the unified file system.
- Module imports are recursive and top-down. Project files take precedence over theme and module files at the same virtual path.
- Custom mounts replace defaults unless the default mount is explicitly re-added.
- Do not edit `_vendor`. Override vendored module or theme files by creating matching paths in the project.
- Use `hugo mod graph`, `hugo mod tidy`, `hugo mod get`, `hugo mod vendor`, and `hugo config mounts` to diagnose module resolution.
- For multilingual page resources, shared Markdown resources are not duplicated by default in single-host projects; embedded link/image hooks can resolve shared resources unless custom hooks override them.
- For full Hugo Pipes pipelines (Sass, PostCSS/Tailwind, `js.Build`, fingerprint, minify, images, remote resources, `resources.PostProcess`), use the `hugo-asset-pipeline` skill.
