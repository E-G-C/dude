# Dude Pack Catalog

`library/packs/` is the central catalog of **optional expansions** for the lean
Dude core. The bundle under `.github/` ships only what every project needs;
everything domain- or workflow-specific lives here as an installable **pack**.

## What is a pack?

A pack is a self-contained capability brick — agents, skills, and optionally
scoped instructions or prompts — that you install into a project's `.github/`
only when you need it. Installed pack artifacts use the reserved `dude-pack-*`
namespace, which the engine treats as a distinct ownership tier:

- `dude-*` — core (upstream-owned; replaced by `@dude upgrade`)
- `dude-pack-<pack>-*` — installed pack (preserved across core upgrades)
- `dude-local-*` — project-bespoke (never synced)

## Catalog

| Pack | Provides | Install when |
|---|---|---|
| `beads` | tracked execution via Beads (workflow + spec import) | you want a Beads-backed live board instead of `tasks.md` |
| `release` | release-manager agent + tag / pipeline-parity / writeback skills | you ship versioned releases via GitHub Actions or Azure Pipelines |
| `web` | backend + frontend specialist agents | you build web apps (APIs + UI) |
| `practices` | tests-first (TDD) workflow skill | you want a tests-first implementation discipline |

Packs are added to this table as they are migrated out of core.

## Layout

Each pack is a directory:

```text
library/packs/<name>/
  pack.md              # manifest (schema below)
  agents/              # dude-pack-<name>-*.agent.md   (optional)
  skills/              # dude-pack-<name>-*/SKILL.md   (optional)
  instructions/        # *.instructions.md, NARROW applyTo only (optional)
  prompts/             # *.prompt.md                   (optional)
```

**Naming:** pack source files already carry their **install** names
(`dude-pack-<name>-<slug>`). Installing a pack is a direct copy into `.github/`
with no rename step; authors edit the verbose installed names in place. Pack
names must not be hyphen-prefixes of one another (e.g. `hugo` and `hugo-docsy`)
because removal matches on the `dude-pack-<name>-` prefix.

## `pack.md` manifest schema

```yaml
---
name: <pack-name>                 # matches the directory name
description: <one line>
provides:
  agents: [dude-pack-<name>-<slug>, ...]
  skills: [dude-pack-<name>-<slug>, ...]
requires:
  tools: [<runtime tools the pack assumes>]   # optional
routing_hints:                    # optional: keyword -> agent handle
  <keyword>: "@dude-pack-<name>-<slug>"
hooks:                            # optional: core extension points it fills
  - <routing | definition-exception | execution-lane | close-protocol>
---

# <Pack Name>

<What it adds, when to install it, and any setup notes.>
```

## Installing / removing

- `@dude add pack <name>` — copies `library/packs/<name>/` contents into
  `.github/`, records the pack in `.github/dudestuff/profile.md`, and runs lint.
- `@dude remove pack <name>` — deletes the pack's `dude-pack-<name>-*` artifacts,
  updates the profile, and runs lint.

The compose mechanism lands with the pack-runtime phase.

## Verifying a pack

The core linter scans only `.github/`, so pack sources under `library/packs/`
are validated by **installing into a throwaway copy and linting**:

```bash
tmp=$(mktemp -d)
cp -R .github "$tmp/.github"
cp -R library/packs/<name>/agents/. "$tmp/.github/agents/" 2>/dev/null || true
cp -R library/packs/<name>/skills/. "$tmp/.github/skills/" 2>/dev/null || true
node .github/skills/dude-lint/lint.mjs "$tmp"
```

A pack is valid when the install lints clean (exit 0).
