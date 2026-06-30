# Hugo Diagnostic Matrix

## Page Is Missing

Check:

- `draft = true`
- `date` in the future
- `publishDate` in the future
- `expiryDate` in the past
- `hugo list drafts/future/expired/published`
- Whether the content file is under the expected `contentDir` in multilingual sites.
- Whether the page is a resource inside a leaf bundle rather than a rendered page.

## Descendants Are Missing

Check:

- `index.md` versus `_index.md`.
- Leaf bundles cannot have descendants.
- Section pages should use `_index.md`.

## URL Or Redirect Is Wrong

Check:

- `slug` versus `url`; `url` wins.
- `baseURL` protocol and trailing slash.
- Leading slashes in multilingual `url` front matter.
- Permalink configuration and aliases.
- Path warnings with `hugo build --printPathWarnings`.

## Stale Deployed Files

Check:

- Hugo does not clear `public` before builds.
- Draft/future/expired status may leave old files behind.
- Aliases, output formats, and permalinks may leave old paths behind.
- Deployment pipeline may reuse previous artifacts.

## Template Error

Check:

- Current context after `range` or `with`.
- Missing context in partial calls.
- Wrong template path or legacy layout naming.
- `taxonomy.html` versus `term.html`.
- `nil` assigned or passed to a function.
- HTML comments around template code.
- Use `debug.Dump`, `printf`, `warnf`, and `templates.Current` to inspect.

## Resource Or Image Problem

Check:

- Page resource exists inside the current page bundle.
- Global resource is under `assets/` or a mount to `assets`.
- Static files are copied directly and are not Hugo resources.
- Processable image format and dimensions.
- Metadata read from original resource, not transformed image.
- `hugo build --gc` for stale generated resources.

## Module Or Theme Problem

Check:

- Git and Go availability for modules.
- Import order and path collisions.
- `_vendor` precedence and `--ignoreVendorPaths`.
- Custom mounts replacing defaults.
- `hugo config mounts` and `hugo mod graph`.
- `hugo mod tidy` after dependency changes.

## Server Does Not Reload

Check:

- WSL, removable drive, NFS, SMB, or CIFS filesystem.
- Use `hugo server --poll 700ms`.
- Browser cache and LiveReload connection.

## Multilingual Problem

Check:

- Lowercase language suffixes in filenames.
- Non-overlapping `contentDir` values.
- Matching basenames/paths or shared `translationKey`.
- Language-specific menu definitions.
- Shared page resources and custom render hooks.
