---
agent: agent
description: Scaffold a new Docsy Hugo site, choosing the right install method.
---

Help the user create a new Docsy site from scratch. Reference [skill §1](../skills/dude-local-docsy/SKILL.md#1-install-4-paths).

## 1. Confirm prerequisites
- **Hugo extended** (`hugo version` must say `extended`).
- **Node LTS** + PostCSS deps (`postcss`, `postcss-cli`, `autoprefixer` installed locally, not globally).
- **Go ≥ 1.12** and Git (only required for the Hugo Module path).

If any are missing, give the install command for the user's OS before continuing.

## 2. Pick the install method
Ask which fits, and default to **Hugo Module** unless the user has a reason otherwise:

| Method | When to recommend |
|---|---|
| **Hugo Module** (recommended) | New project, wants clean upgrades via `hugo mod get -u`. |
| **Example site** | First-time user who wants a fully populated, runnable starting point. |
| **Git submodule** | Team already standardized on submodules, or offline-friendly vendoring. |
| **NPM** | Project already uses an npm-centric toolchain. |

## 3. Scaffold
Run the matching commands from skill §1. For the Module path:
```bash
hugo new site my-site --format toml
cd my-site
hugo mod init github.com/<owner>/my-site
hugo mod get github.com/google/docsy@vX.Y.Z
```
Then add the `[module]` block to `hugo.toml` (`extended = true`, `min` Hugo version, the `[[module.imports]]` for docsy). **`[languages]` must come before `[module]`.**

## 4. Verify
- `hugo mod graph` lists `docsy`, `bootstrap`, `Font-Awesome`.
- `hugo server` serves at `http://localhost:1313/` with Docsy styling.

## 5. Next steps
Point the user to:
- the site config section of [skill §4](../skills/dude-local-docsy/SKILL.md#4-site-config-hugotoml--hugoyaml--key-blocks) to set `baseURL`, title, and repository links.
- the theme, search, and new-page prompts for the next tasks.

Don't set `theme: docsy` when using Hugo Modules — it's redundant.
