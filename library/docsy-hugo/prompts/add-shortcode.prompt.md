---
agent: ask
description: Help the user pick and correctly insert a Docsy shortcode.
---

The user wants to insert a Docsy shortcode. Walk them through:

1. **Pick the right shortcode** from the [full set](../skills/dude-local-docsy/SKILL.md#5-shortcodes--complete-set). Common picks:
   - Callouts → `alert` (with `color`)
   - Tabs (code or prose) → `tabpane` + `tab`
   - Cards / card grids → `cardpane` + `card`
   - Landing hero → `blocks/cover`
   - Landing feature row → `blocks/section type="row"` + `blocks/feature`
   - Include a file → `readfile`
   - Image from page bundle → `imgproc`
   - OpenAPI → `swaggerui` (with `type: swagger` on the page) or `redoc`
   - External page → `iframe`
   - Conditional build text → `conditional-text`

2. **Pick the delimiter**:
   - `{{< name >}}` if the body is raw HTML or code (headings won't enter the TOC).
   - `{{% name %}}` if the body is Markdown (headings enter the TOC).

3. **Show the exact snippet** with only the parameters the user needs — don't dump every option. Reference the parameter table in the skill if the user asks for more.

4. **Mention the gotcha** if one applies (e.g. `alert` body must be on a new line; `swaggerui` requires `type: swagger`; `readfile` paths are page-relative or `/`-rooted from `/content`).

Never invent shortcode names or parameters.
