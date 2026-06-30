---
name: dude-compose
description: "Use when installing, removing, or listing optional Dude packs from the library catalog. Triggers: @dude add pack <name>, @dude remove pack <name>, @dude list packs, install pack, enable pack, uninstall pack, which packs are available, compose the bundle, add tracked execution, add release tooling, add web specialists, add TDD."
---

# Pack Compose

Install and remove optional **capability packs** from the local catalog
(`library/packs/<name>/`) into a project's `.github/`. Packs are how the lean
Dude core gains domain- or workflow-specific powers (tracked execution, release
tooling, web specialists, TDD) without bloating every install.

Installed pack artifacts use the reserved `dude-pack-<name>-*` namespace, which
the engine treats as a distinct ownership tier and **preserves across
`@dude upgrade`**. The composer records every install in
`.github/dudestuff/profile.md` so removal is exact.

## When To Run

- `@dude add pack <name>` / `install the <name> pack` / `enable <name>`
- `@dude remove pack <name>` / `uninstall the <name> pack`
- `@dude list packs` / `which packs are available` / `what packs are installed`
- Another skill (e.g. `dude-work`, routing) detects the user wants a capability
  that lives in a pack and the pack is not yet installed.

## Engine

The deterministic file work is done by a dependency-free Node script. Targets
Node >= 20.

```bash
node .github/skills/dude-compose/compose.mjs list            # catalog + installed flag
node .github/skills/dude-compose/compose.mjs status          # installed packs
node .github/skills/dude-compose/compose.mjs add <name>      # install
node .github/skills/dude-compose/compose.mjs remove <name>   # uninstall
```

Flags: `--root <dir>` (bundle root, default cwd), `--library <dir>` (catalog,
default `<root>/library/packs`), `--json` (machine output), `--force`
(overwrite existing destinations on add). Exit codes: `0` ok, `1` usage, `2`
operation error.

## Add Flow (coordinator)

1. Run `node .github/skills/dude-compose/compose.mjs list --json` to confirm the
   pack exists in the catalog and is not already installed.
2. **Preview, then confirm.** Tell the user exactly what will be written
   (the pack's `dude-pack-<name>-*` agents and skills) and any `requires:` tools
   from `library/packs/<name>/pack.md`. Wait for confirmation before writing.
3. Run `node .github/skills/dude-compose/compose.mjs add <name> --json`. The
   script copies artifacts, updates `enabled_packs`, and records the exact file
   list in the profile.
4. Run `node .github/skills/dude-lint/lint.mjs .` and treat any `[FAIL]` as a
   hard stop — if installing the pack broke hygiene, remove it and report.
5. Tell the user the pack is active and summarize what it added (new agents,
   new skills, any new `@dude` verbs the pack enables).

## Remove Flow (coordinator)

1. Run `status --json` to confirm the pack is installed.
2. Preview the artifacts that will be deleted (from `installed.<name>.files`).
3. Run `node .github/skills/dude-compose/compose.mjs remove <name> --json`.
4. Run lint and confirm `0 failures`.

## Catalog Resolution

`compose.mjs` reads packs from `<root>/library/packs/`. This is present in the
Dude source/dogfood repo and in any install that vendors the catalog.

If a lean-core install does **not** carry a local `library/packs/`, the pack
source must first be made available before `add` can run:

- Preferred: fetch `library/packs/<name>/` from the bundle's upstream
  (`source_repo` / `source_ref` in `.github/dudestuff/bundle-manifest.md`) into
  a local `library/packs/<name>/`, then run `add` — reuse the fetch approach
  from `dude-bundle-import` / `dude-bundle-upgrade`.
- Alternative: vendor the whole `library/` once via `dude-portability`.

Do not invent network calls inside `compose.mjs`; keep the script's job to local
copy/remove + profile bookkeeping.

## Rules

- Packs are **opt-in**. Never install a pack without explicit user intent.
- Always preview before writing; always lint after.
- A pack ships its artifacts under its own `dude-pack-<name>-*` prefix; the
  composer rejects artifacts outside that namespace.
- Pack names must not be hyphen-prefixes of one another (e.g. `hugo` /
  `hugo-docsy`); the composer rejects such collisions because `remove` matches
  on the `dude-pack-<name>-` prefix.
- `profile.md`'s `installed` map is the removal manifest — do not hand-edit it.
- The lean-core dogfood repo keeps `.github/` pack-free; test packs in a
  throwaway copy (`--root <tmp>`), not in the core tree.
