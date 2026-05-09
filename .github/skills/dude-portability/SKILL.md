---
name: "dude-portability"
description: "Use when saving, exporting, importing, or deploying a Dude bundle across repositories or directories."
---

## Purpose

Preserve Dude Coder as a portable markdown-only bundle.

## Save Or Export

When saving the Dude bundle:

1. copy `.github/agents/`
2. copy `.github/skills/`
3. copy `.github/dudestuff/`
4. copy `.github/instructions/dude.instructions.md` (do **not** overwrite any existing `.github/copilot-instructions.md` in the destination repo; the modular instruction file coexists with it)
5. place them into a portable destination such as `dude/` or another requested path
6. note any runtime-specific frontmatter assumptions that may need adaptation in the destination host
7. confirm what was exported

## Deploy Or Import

When deploying a Dude bundle into a project:

1. read the source bundle
2. copy agents, skills, memory, and instructions into the target `.github/` structure
3. adapt runtime-specific frontmatter such as `model` and `tools` when the target host differs from the source host
4. verify the coordinator and routing files exist after copy
5. run the `dude-lint` skill against the destination (`pwsh .github/skills/dude-lint/lint.ps1` or `bash .github/skills/dude-lint/lint.sh`) to confirm the bundle imported cleanly: every agent file carries the coordinator-only block (with the documented exemptions), no orphan `@<role>` references exist, and memory files are within the consolidation threshold
6. confirm what was imported

## Guardrails

- do not overwrite intentionally customized files without user approval when the destination already contains a Dude bundle
- keep the `.github` structure intact for portability
- prefer merge or update behavior over blind replacement when both source and destination have meaningful customizations
- portability means the markdown bundle should travel cleanly even when frontmatter details need host-specific translation
