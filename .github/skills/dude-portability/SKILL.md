---
name: "dude-portability"
description: "Use when saving, exporting, importing, or deploying a Dude bundle across repositories or directories."
---

## Purpose

Preserve Dude as a portable markdown-only bundle.

> For upgrading an already-installed bundle to a newer upstream version, prefer `dude-bundle-upgrade`. The save/export and deploy/import flows below remain the canonical path for first-time installs and for cross-machine bundle transfers; routine engine refreshes belong in `dude-bundle-upgrade`.

## Save Or Export

When saving the Dude bundle:

1. copy `.github/agents/`
2. copy `.github/skills/`
3. copy `.github/instructions/dude.instructions.md` (do **not** overwrite any existing `.github/copilot-instructions.md` in the destination repo; the modular instruction file coexists with it)
4. copy `.dude/` when exporting project work, including canonical `.dude/ideas/`, specs, memory, state or execution data, and metadata
5. when building a generic release, omit project-specific `.dude/ideas/`, `.dude/specs/`, `.dude/memory/`, `.dude/state/`, and Beads or other execution state as applicable; include only release-owned generic metadata
6. place the export into a portable destination such as `dude/` or another requested path
7. note any runtime-specific frontmatter assumptions that may need adaptation in the destination host
8. confirm what was exported

## Deploy Or Import

When deploying a Dude bundle into a project:

1. read the source bundle
2. copy agents, skills, and instructions into the target `.github/` structure, and copy canonical project state into `.dude/`, treating `.dude/ideas/` as project state
3. preserve each idea ledger's `status:`, exact `spec_path:`, and complete `## Coordinator Log` contents while copying or merging
4. adapt runtime-specific frontmatter such as `model` and `tools` when the target host differs from the source host
5. verify the coordinator and routing files exist after copy
6. run the `dude-lint` skill against the destination (`node .github/skills/dude-lint/lint.mjs`) to confirm the bundle imported cleanly: every agent file carries the coordinator-only block (with the documented exemptions), no orphan `@<role>` references exist, and memory files are within the consolidation threshold
7. confirm what was imported

## Guardrails

- do not overwrite intentionally customized files without user approval when the destination already contains a Dude bundle
- keep the `.github` structure intact for portability
- keep the engine/workspace split intact: discovery files under `.github/`, Dude-created project state under `.dude/`
- canonical `.dude/ideas/` ledgers copy or merge only as project state; never create split ledgers
- preserve idea `status:`, `spec_path:`, and Coordinator Log contents at their canonical paths
- prefer merge or update behavior over blind replacement when both source and destination have meaningful customizations
- portability means the markdown bundle should travel cleanly even when frontmatter details need host-specific translation
- if the user wants a customized copy of a shipped base agent or skill (any file matching the upstream base namespace \u2014 `dude.agent.md`, `dude-<slug>.agent.md`, `dude-<slug>` skill directories, or `dude.instructions.md`, excluding the reserved `dude-local-<slug>` namespace), fork it into a project-owned `dude-local-<slug>` artifact (a `dude-local-<slug>.agent.md` agent or a `dude-local-<slug>/` skill directory). Direct edits to base files are silently overwritten by `@dude upgrade`; the `dude-local-` namespace is the only durable customization path.
