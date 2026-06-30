# Hugo Installation, Quick Start, And Hosting

Portable reference for installing Hugo, scaffolding a first site, and publishing to common hosts. Use the standard edition unless you need direct cloud deployment or legacy embedded LibSass; Dart Sass works with any edition when installed separately.

## Install

- macOS: `brew install hugo`.
- Windows: `winget install Hugo.Hugo.Extended` or `choco install hugo-extended` or `scoop install hugo-extended`.
- Linux: `sudo snap install hugo`, distro package, or download a release binary.
- BSD: package manager (`pkg install hugo`) or binary.
- Prebuilt binaries: extract and place on `PATH`; verify with `hugo version`.
- Build from source needs Go; Extended builds also need a C toolchain.
- Sass via Dart Sass: install the `dart-sass` binary on `PATH` and set the `css.Sass` option `transpiler = "dartsass"`.
- Node is required only for PostCSS/Tailwind/Babel workflows.

## Quick start

```text
hugo new project my-site
cd my-site
# add a theme (module or git submodule), or build your own layouts
hugo new content posts/first.md
hugo server -D        # draft-inclusive dev server with LiveReload
hugo                  # production build to ./public
```
- Verify environment and edition: `hugo env`.
- Inspect the standard directory layout with the site blueprint reference.

## Production build checklist

- Set `baseURL` (protocol + trailing slash) for the deploy target, or pass `hugo --baseURL https://example.org/`.
- `hugo --minify --gc` for a clean, minified build.
- Hugo does **not** clear `public`; delete it (or use a clean CI runner) when content/output paths change.
- Confirm with `hugo build --printPathWarnings` and spot-check key URLs.

## Hosting

### GitHub Pages (GitHub Actions)
- Settings → Pages → Source = **GitHub Actions**.
- Add `.github/workflows/hugo.yaml` that installs Hugo Extended, runs `hugo --minify --baseURL "${{ steps.pages.outputs.base_url }}/"`, and uploads/deploys `public/` via the Pages actions.
- Point image cache at `:cacheDir/images` so CI caching works.

### GitLab Pages
- Add `.gitlab-ci.yml` using a Hugo image; publish the `public/` artifact. Set `baseURL` to the Pages URL.

### Netlify / Vercel / Cloudflare Pages / Render / AWS Amplify
- Build command `hugo --gc --minify`; publish directory `public`.
- Pin the Hugo version via an environment variable (e.g. `HUGO_VERSION`) so local and CI match.
- Set `HUGO_ENV=production` (or rely on the default) for production builds.

### Firebase / Azure Static Web Apps / SourceHut Pages
- Build to `public` and deploy that folder with the host's CLI/action (`firebase deploy`, the SWA action, etc.).

### Generic copy-based deploy
- `rsync` or `rclone` the contents of `public/` to the server/bucket.
- `hugo deploy` targets configured cloud storage (S3-compatible, Azure Blob, Google Cloud Storage) defined under `[deployment]`.

## Common host gotchas
- Wrong/missing trailing slash in `baseURL` breaks relative asset/links.
- Mismatched Hugo version between local and CI causes "works locally, fails in CI"; pin it.
- Stale files appear when the host reuses a non-clean output directory; build clean.
- Embedded LibSass fails on a non-Extended CI binary and is deprecated; prefer Dart Sass on `PATH`. WebP encoding is supported in all current Hugo editions.
