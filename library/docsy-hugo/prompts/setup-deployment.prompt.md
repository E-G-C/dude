---
agent: agent
description: Set up deployment for a Docsy site (GitHub Pages, Netlify, or S3+CloudFront).
---

Ask the user which target:

- **GitHub Pages** — create `.github/workflows/deploy-github-pages.yml` using `peaceiris/actions-hugo@v3` (extended) and `peaceiris/actions-gh-pages@v4`. Use the template in the [skill reference](../skills/dude-local-docsy/SKILL.md#github-pages-githubworkflowsdeploy-github-pagesyml). Confirm `baseURL` (`https://<owner>.github.io/<repo>`).
- **Netlify** — produce a `netlify.toml`. Build command depends on install method:
  - Hugo module / NPM: `hugo`
  - Git submodule: `cd themes/docsy && git submodule update -f --init && cd ../.. && hugo`
  Set env vars `HUGO_VERSION`, `NODE_VERSION`, `GO_VERSION`. Use Ubuntu Focal 20.04 image. Suggest `-e development` for non-indexed preview branches.
- **Amazon S3 + CloudFront** — add `[deployment]` block to `hugo.toml` with the target, `URL = "s3://..."`, `cloudFrontDistributionID = "..."`. Deploy with `hugo --gc --minify && hugo deploy` (auto-invalidates CloudFront). Suggest `--maxDeletes` to bound destructive syncs.

For every target:
- Verify Hugo **extended** is being installed.
- Verify Node LTS + `npm ci` runs before `hugo` (PostCSS pipeline).
- Confirm `baseURL` in `hugo.toml` matches the deployment URL.
- Use the deployment recipes in [skill §16](../skills/dude-local-docsy/SKILL.md#16-deployment) as the full portable reference.
