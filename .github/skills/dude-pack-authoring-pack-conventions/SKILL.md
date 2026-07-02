---
name: dude-pack-authoring-pack-conventions
description: "Use when authoring a Dude pack: pack.md manifest shape, provides and requires, dude-pack namespacing, and compose install and verify."
argument-hint: "the pack name and what it should provide"
---

# Pack Conventions

## Purpose

How to author a Dude pack: the `pack.md` manifest, the `dude-pack-<pack>-<slug>` namespace, and how compose installs and verifies it.

## Procedure

1. Create `library/packs/<pack>/pack.md` with `name`, `description`, `provides` (agents / skills), `requires` (tools), and `hooks`.
2. Add artifacts under the pack's `agents/`, `skills/`, `instructions/`, and `prompts/` directories using the `dude-pack-<pack>-<slug>` namespace; let the `--pack` mode of the scaffolders keep `provides` in sync.
3. Keep authoring-only files such as tests out of what ships, and reference sibling packs only as optional (orphan `dude-pack-*` references are warnings, not failures).
4. Verify with `compose verify`, which temp-installs each pack on top of the core bundle and lints it; confirm 0 failures and 0 leftovers.
