# `.github/` — Copilot/LLM bundle for Docsy

This folder bundles everything an LLM (GitHub Copilot, Claude, etc.) needs to help a developer work productively with the **Docsy Hugo theme** — whether they're authoring a page in *this* docs site or building their own Docsy-based site.

## What's in here

| Path | Purpose | Loaded |
|---|---|---|
| [copilot-instructions.md](copilot-instructions.md) | Top-level instructions: mental model, non-negotiables, repo layout, where to find more | Always (Copilot) |
| [instructions/docsy-content.instructions.md](instructions/docsy-content.instructions.md) | Rules for Docsy content authoring (front matter, shortcodes, links, code blocks) | Auto on content Markdown paths |
| [instructions/docsy-config.instructions.md](instructions/docsy-config.instructions.md) | Rules for `hugo.toml`/`hugo.yaml` editing | Auto on `hugo.*` |
| [instructions/docsy-scss.instructions.md](instructions/docsy-scss.instructions.md) | SCSS customization rules (only 3 project files are stable) | Auto on `assets/scss/**` |
| [skills/docsy/SKILL.md](skills/docsy/SKILL.md) | Dense reference: install paths, full config, every shortcode + params, search/i18n/versioning, SCSS, AI-agent support, deployment, gotchas | On-demand |
| [prompts/install-site.prompt.md](prompts/install-site.prompt.md) | Scaffold a new Docsy site (Module/Example/Submodule/NPM) | `/install-site` |
| [prompts/new-docs-page.prompt.md](prompts/new-docs-page.prompt.md) | Scaffold a new docs page | `/new-docs-page` |
| [prompts/new-blog-post.prompt.md](prompts/new-blog-post.prompt.md) | Scaffold a new blog post | `/new-blog-post` |
| [prompts/add-shortcode.prompt.md](prompts/add-shortcode.prompt.md) | Pick and correctly insert a shortcode | `/add-shortcode` |
| [prompts/customize-theme.prompt.md](prompts/customize-theme.prompt.md) | Colors / fonts / logo / dark mode (3 project SCSS files) | `/customize-theme` |
| [prompts/setup-search.prompt.md](prompts/setup-search.prompt.md) | Enable GCS / Algolia / Lunr (pick one) | `/setup-search` |
| [prompts/setup-i18n.prompt.md](prompts/setup-i18n.prompt.md) | Add multilingual support | `/setup-i18n` |
| [prompts/setup-versioning.prompt.md](prompts/setup-versioning.prompt.md) | Version dropdown / archived banner | `/setup-versioning` |
| [prompts/enable-agent-support.prompt.md](prompts/enable-agent-support.prompt.md) | Markdown output + `llms.txt` for AI agents | `/enable-agent-support` |
| [prompts/setup-deployment.prompt.md](prompts/setup-deployment.prompt.md) | GitHub Pages / Netlify / S3+CloudFront setup | `/setup-deployment` |
| Update Docsy prompt | Update/upgrade Docsy or convert between install methods | Prompt command in chat |
| [prompts/troubleshoot-build.prompt.md](prompts/troubleshoot-build.prompt.md) | Diagnostic checklist for build/render failures | `/troubleshoot-build` |
| [agents/docsy-expert.agent.md](agents/docsy-expert.agent.md) | Subagent definition for end-to-end Docsy tasks | Invoke by name |

## Design

- **One mental model up front** in `copilot-instructions.md` so the assistant never invents the basics.
- **`applyTo`-scoped instructions** so file-type rules attach automatically without bloating the global context.
- **One thick skill** (`skills/docsy/SKILL.md`) as the authoritative reference for Docsy configuration, shortcodes, deployment, troubleshooting, search, i18n, versioning, SCSS, and upgrade tasks.
- **Task-shaped prompts** to standardize the most common asks.
- **An agent** for multi-step Docsy work that needs to orchestrate file edits + config changes + verification.
