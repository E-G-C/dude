---
agent: agent
description: Enable Docsy's AI-agent support — Markdown output and llms.txt.
---

Help the user expose machine-readable content for AI agents. This is **experimental**. Reference [skill §18](../skills/docsy/SKILL.md#18-ai-agent-support-experimental).

## Critical gotcha
Hugo's `outputs` map is a **full replacement per page kind, not a merge**. When you add `markdown`/`LLMS`, you must re-list every format that kind already used (`RSS`, `print`, …) or they silently disappear.

## Enable Markdown output
```yaml
outputs:
  home:    [HTML, markdown]
  page:    [HTML, markdown]
  section: [HTML, RSS, print, markdown]
```
This adds `rel="alternate"` Markdown links in page headers and a **View Markdown** link in the page meta area.

Opt a single page out: front matter `outputs: [HTML]` (list its real defaults minus `markdown`).

## Enable `llms.txt`
Add `LLMS` to the **home** page's outputs:
```yaml
outputs:
  home:    [HTML, markdown, LLMS]
  page:    [HTML, markdown]
  section: [HTML, RSS, print, markdown]
```
Docsy generates `/llms.txt` listing the home page, main-menu pages, and Markdown alternates (format spec: llmstxt.org).

## Customize (optional)
- Markdown rendering: override theme `layouts/all.md` with project `layouts/home.md`, `layouts/_default/single.md`, etc.
- `llms.txt`: override theme `layouts/index.llms.txt` in your project `layouts/`.
- Shortcodes: add output-format-specific shortcode templates for Markdown-friendly output.

## Verify
- Build (`hugo`), then check a page has a `.md` alternate and the **View Markdown** link.
- Confirm `/llms.txt` exists at the site root.
- Optionally score with AFDocs if the user's project includes an AFDocs configuration and script.
