# Hugo Copilot Bundle

This directory contains a portable Hugo-aware Copilot bundle. It helps assistants answer questions, scaffold sites, edit content, author templates, and troubleshoot Hugo projects using the reference material bundled under `.github/skills/**/references`.

## What Is Included

- `copilot-instructions.md`: always-on guidance for Hugo assistance.
- `instructions/`: file-specific rules for Hugo configuration, content, templates, assets, modules, and multilingual projects.
- `agents/`: role agents for documentation research, site architecture, template work, troubleshooting, and migration/upgrade.
- `prompts/`: reusable slash prompts for common Hugo tasks.
- `skills/`: on-demand workflows with reference material for Hugo lookup, site building, template authoring, troubleshooting, and migration.

## Recommended Use

For questions, fixes, and site creation work, start with the relevant prompt or agent. For example:

- Use `Answer Hugo Question` for any Hugo question grounded in the bundled reference material.
- Use `Look Up Hugo Function Or Method` for template functions and Page/Site/Resource/Pages methods.
- Use `Create Hugo Site` to plan or scaffold a site.
- Use `Design Hugo Content Model` for sections, bundles, taxonomies, menus, URLs, and multilingual structure.
- Use `Write Hugo Template` for layouts, partials, shortcodes, render hooks, and resource pipelines.
- Use `Process Hugo Assets` for Hugo Pipes: Sass, PostCSS/Tailwind, JS bundling, minify, fingerprint, and images.
- Use `Debug Hugo Site` for build errors, missing pages, stale output, or server issues.
- Use `Optimize Hugo Performance` for slow builds and template-metric tuning.
- Use `Migrate To Hugo` to import from Jekyll, WordPress, or other Markdown sources.
- Use `Upgrade Hugo Templates` to move an existing site to the v0.146+ template system and clear deprecations.
- Use `Prepare Hugo Deployment` for production build flags, `baseURL`, stale output, and host-specific files.

## Capability Map

| Need | Agent | Skill | Prompt |
|------|-------|-------|--------|
| Answer a Hugo question | Hugo Docs Researcher | hugo-docs-reference | Answer Hugo Question |
| Look up a function or method | Hugo Docs Researcher | hugo-functions-and-methods | Look Up Hugo Function Or Method |
| Build or scaffold a site | Hugo Site Architect | hugo-site-builder | Create Hugo Site / Design Hugo Content Model |
| Author or fix templates | Hugo Template Specialist | hugo-template-authoring | Write Hugo Template |
| Process assets (Hugo Pipes) | Hugo Template Specialist | hugo-asset-pipeline | Process Hugo Assets |
| Diagnose a problem | Hugo Troubleshooter | hugo-troubleshooting | Debug Hugo Site |
| Tune build performance | Hugo Troubleshooter | hugo-troubleshooting | Optimize Hugo Performance |
| Migrate in / upgrade | Hugo Migration Specialist | hugo-migration | Migrate To Hugo / Upgrade Hugo Templates |
| Deploy | Hugo Site Architect | hugo-site-builder | Prepare Hugo Deployment |

Assistants should consult the bundled reference files before relying on memory, especially for version-sensitive behavior such as the Hugo v0.146+ template system.
