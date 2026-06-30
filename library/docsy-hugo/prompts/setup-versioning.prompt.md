---
agent: agent
description: Add a version dropdown / archived-version banner to a Docsy site.
---

Help the user configure documentation versioning. Reference [skill §11](../skills/dude-local-docsy/SKILL.md#11-versioning).

## Version dropdown
Add to `hugo.toml` `params`:
```yaml
params:
  version_menu: Releases
  version_menu_pagelinks: true        # link to same page in other versions when possible
  versions:
    - { version: master,  url: "https://master.example.com" }
    - { name: "**Versions**" }                       # bold heading, no url
    - { version: v1.3-dev, kind: next,   url: "..." }
    - { version: v1.2,     kind: latest, url: "..." }
    - { name: "---" }                                # separator
    - { name: "Preview", kind: home, pagelinks: false, url: "..." }
```
- Each entry's `kind` adds CSS class `dropdown-item-<kind>`. Built-in styles: `latest`, `next`, `home`.
- An entry with only `name` (no `version`/`url`) is a heading or separator.

## Archived-version banner
On an older, frozen version's site:
```yaml
params:
  archived_version: true
  version: "0.1"
  url_latest_version: "https://your-latest-doc-site.com"
```
This shows a banner telling readers they're viewing archived docs and links to the latest.

## Verify
- The version dropdown appears in the navbar.
- `version_menu_pagelinks: true` resolves to the current page in other versions where it exists.

Point the user at [skill §11](../skills/dude-local-docsy/SKILL.md#11-versioning).
