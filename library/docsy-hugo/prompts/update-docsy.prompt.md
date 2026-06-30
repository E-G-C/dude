---
agent: agent
description: Update or upgrade Docsy (Hugo module, git submodule, or convert to module).
---

Help the user update Docsy safely. First detect the install method, then follow the matching path.

## Detect install method
- `go.mod` + `[module.imports]` in `hugo.toml` → **Hugo Module**.
- `themes/docsy/` + `.gitmodules` → **Git submodule**.
- `theme: docsy` + `themesDir: node_modules` → **NPM**.

## Hugo Module
```bash
hugo mod get -u github.com/google/docsy        # latest
hugo mod get github.com/google/docsy@vX.Y.Z    # pin specific version
hugo mod graph                                 # verify docsy + bootstrap + Font-Awesome
hugo mod clean                                 # if caches look stale
```
Use the Hugo Module update commands below.

## Git submodule
```bash
git submodule update --remote
cd themes/docsy && npm install && cd ../..
```
Use the git submodule update commands below.

## Convert submodule → module (recommended migration)
Walk through this conversion sequence:
1. `hugo mod init github.com/<owner>/<repo>`.
2. Add `[module]` block (`extended = true`, `min` Hugo version, `[[module.imports]]` docsy).
3. `hugo mod get github.com/google/docsy@vX.Y.Z`.
4. Remove the submodule: `git submodule deinit themes/docsy`, `git rm themes/docsy`, delete `theme:` setting.

## After any update
- Check Docsy release notes for breaking changes (especially the minimum Hugo version).
- Bump `[module.hugoVersion].min` and your CI Hugo version to match.
- Run `hugo server`, then a full `hugo` build, and skim for deprecation warnings.
