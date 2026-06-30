---
description: "Prepare a Hugo site for deployment, including production build flags, baseURL, publishDir, stale public files, hosting target, environment config, and CI checks."
name: "Prepare Hugo Deployment"
argument-hint: "Host target, domain, build command, repo/CI details, deployment issue"
agent: "Hugo Site Architect"
---
Prepare this Hugo site for deployment:

`$ARGUMENTS`

Inspect the current project and host target. Ensure the deployment plan accounts for:

- `baseURL`, language prefixes, and environment-specific config.
- Production build command and flags such as `--gc`, `--minify`, `-D`, `-F`, and `-E` only when appropriate.
- Hugo's behavior that `public` is not cleared before builds.
- Generated output location through `publishDir` or `--destination`.
- Module/theme dependencies, vendoring, and Go/Git requirements.
- Host-specific files such as redirects, headers, or workflows.

Apply configuration or CI changes when enough information is available, verify with `hugo build`, and report any remaining host-specific steps.
