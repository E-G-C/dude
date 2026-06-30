---
agent: agent
description: Scaffold a new Docsy docs page with correct front matter and section placement.
---

You are creating a new page under `docs/` in a Docsy Hugo site.

Before writing:
1. Ask which **section** (top-level `docs/` subdir) the page belongs to. If the section doesn't exist, ask whether to create it (you'll need an `_index.md` for the new section).
2. Ask for the page **title**, optional **linkTitle** (omit if same as title), short **description**, and desired **sidebar weight** (default 10/20/30…).
3. Ask whether the page needs **special behavior**: hide from sidebar (`toc_hide`), no TOC (`notoc`), exclude from search (`exclude_search`), placeholder external link (`manualLink`).

Then create the file:
- Use a **leaf bundle** (`section/my-page/index.md`) if the page will have images/assets; otherwise a single `section/my-page.md`.
- Front matter (YAML, unquoted unless required):
  ```yaml
  ---
  title: <Title>
  description: <One-sentence description, also used for SEO meta>
  weight: <N>
  ---
  ```
- Add a single H1-less intro paragraph, then content with `##` sections.
- Cite the [content authoring rules](../instructions/docsy-content.instructions.md) when relevant.

Do not:
- Use `ref`/`relref` to `_index.md` / `index.md` pages.
- Invent front matter keys not in the [Docsy reference](../skills/dude-local-docsy/SKILL.md#page-front-matter--docsy-recognized-keys).
- Quote strings unnecessarily.
