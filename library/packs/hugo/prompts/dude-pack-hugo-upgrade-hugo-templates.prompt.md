---
description: "Upgrade an existing Hugo site to the v0.146+ template system and resolve deprecations: migrate the layouts folder, rename templates, replace internal template calls, and verify the build."
name: "Upgrade Hugo Templates"
argument-hint: "Current Hugo version, layout structure, build warnings, or specific upgrade error"
agent: "Hugo Migration Specialist"
---
Upgrade this Hugo site to current template conventions:

`$ARGUMENTS`

Use the bundled template authoring and migration references, especially the v0.146+ template upgrade map. Then:

1. Record the starting Hugo version and capture deprecation/path warnings with `hugo build --logLevel debug`.
2. Migrate `layouts/` to the v0.146+ structure: move `_default/*` to the root, rename `partials`/`shortcodes` to `_partials`/`_shortcodes`, move render hooks under `_markup`, and rename home `index.html` to `home.html`.
3. Split `taxonomy.html` and `term.html`, rename base templates to the `baseof.<id>.html` form, and replace `_internal` template calls with same-named partials.
4. Resolve remaining deprecations as upgrade work items, not noise.
5. Build against a clean `public`, run `hugo build --printPathWarnings`, and spot-check key URLs.

Work incrementally and keep the site building between batches.
