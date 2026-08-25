---
name: dude-pack-authoring-pack-conventions
description: "Use when authoring a Dude pack: pack.md manifest shape, provides and requires, dude-pack namespacing, and compose install and verify."
argument-hint: "the pack name and what it should provide"
---

# Pack Conventions

## Purpose

How to author a Dude pack: the `pack.md` manifest, the `dude-pack-<pack>-<slug>` namespace, and how compose installs and verifies it.

## Procedure

1. Create `library/packs/<pack>/pack.md` with `name`, `description`, `use-cases`, `provides` (agents / skills), `requires` (tools), and `hooks`.
2. For a maintained catalog pack, `use-cases` is required discovery metadata: declare a non-empty, unique lowercase kebab-case list, reuse a current catalog value where accurate, and add a value only for a real present use case.
3. Add artifacts under the pack's `agents/`, `skills/`, `instructions/`, and `prompts/` directories using the `dude-pack-<pack>-<slug>` namespace; let the `--pack` mode of the scaffolders keep `provides` in sync.
4. Keep `use-cases` separate from `routing_hints`: use cases support discovery, while routing hints map request keywords to agent handles. Keep authoring-only files such as tests out of what ships, and reference sibling packs only as optional (orphan `dude-pack-*` references are warnings, not failures).
5. Keep visual choice out of the pack. A visual system is any named look-and-feel authority (theme, style, styles, design system, brand, skin, palette, or token set) that decides palette, typography, spacing, elevation, motion, iconography, or component treatment. Name no such provider in prose, routing hints, or agent handles, and do not scope the pack's own `instructions/` to generic visual globs such as `**/*.css`, `**/*.scss`, or `**/*.tsx`. A project selects its system per surface through its own `dude-local-*` instructions, so several systems may coexist in one repository.
6. Verify with `compose verify`, which temp-installs each pack on top of the core bundle and lints it; confirm 0 failures and 0 leftovers.
