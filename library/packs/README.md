# Dude Pack Catalog

`library/packs/` is the central catalog of **optional expansions** for the lean
Dude core. The engine under `.github/` ships only what every project needs;
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
| `hugo` | 5 Hugo specialist agents + 7 skills + instructions + prompts | you build or maintain Hugo static sites |
| `docsy` | Docsy theme expert + theme skill + Docsy-specific prompts | you use the Docsy Hugo theme (pairs with `hugo`) |
| `ms-brand` | Microsoft visual-brand stylist + brand reference assets | you apply Microsoft branding to a site (pairs with `hugo` / `docsy`) |
| `rust` | Rust specialist agent + Tauri development skill | you write Rust or build Tauri desktop/mobile apps |
| `fluent-ui` | Fluent UI React v9 specialist agent | you build UIs with `@fluentui/react-components` |
| `copilot-sdk` | GitHub Copilot SDK specialist agent | you build apps on the Copilot SDK |
| `newsroom` | newsroom writer + event deep-fetcher agents + article / calendar-event / static-safe-time skills | you publish news & events to a Hugo/Docsy site's News section |
| `writing` | avoid-AI-writing-tropes prose-quality skill | you want a canonical guard against AI writing tells |
| `design` | design-proposal lane skill (propose → mockup → preview → approve → apply) | you want a visual design workflow overlaid on the task lifecycle |

Packs are added to this table as they are migrated out of core.

## Layout

Each pack is a directory:

```text
library/packs/<name>/
  pack.md              # manifest (schema below)
  agents/              # dude-pack-<name>-*.agent.md   (optional)
  skills/              # dude-pack-<name>-*/SKILL.md   (optional)
  instructions/        # dude-pack-<name>-*.instructions.md (optional)
  prompts/             # dude-pack-<name>-*.prompt.md       (optional)
```

**Naming:** pack source files already carry their **install** names
(`dude-pack-<name>-<slug>`), including instruction and prompt basenames. Installing a pack is a direct copy into `.github/`
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

- `@dude add pack <name>` — installs the pack's `dude-pack-<name>-*` artifacts
  into `.github/`, records the exact file list in `.dude/metadata/profile.md`,
  and runs lint. The source is the local `library/packs/<name>/` when present,
  otherwise it is fetched from the bundle's configured upstream (`source_repo` /
  `source_ref` in the bundle manifest); `--no-fetch` disables the fallback.
- `@dude remove pack <name>` — deletes exactly what was installed (from the
  profile's removal manifest), updates the profile, and runs lint.

## Verifying a pack

The core linter scans installed `.github/` artifacts and `.dude/` state, not
catalog source directories under `library/packs/`. Pack sources are therefore
validated by temp-installing and linting; `dude-compose` does this for every
catalog pack in one command:

```bash
node .github/skills/dude-compose/compose.mjs verify
```

It temp-installs each pack into a throwaway copy of the bundle, runs
`dude-lint`, removes the pack, and checks for leftovers. Exit code `2` if any
pack lints with a failure. Sibling-pack **warnings** (e.g. `hugo` referencing
docsy/ms-brand when they are not installed) are expected and do not fail.
