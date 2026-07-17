---
name: dude-compose
description: "Use when installing, removing, or listing optional Dude packs. Triggers: @dude add pack <name>, @dude remove pack <name>, @dude list packs, install pack, enable pack, uninstall pack, which packs are available, compose the bundle, add tracked execution, add release tooling, add web specialists, add TDD."
---

# Pack Compose

Install and remove optional **capability packs** from the local catalog
(`library/packs/<name>/`) into a project's `.github/`. Packs are how the lean
Dude core gains domain- or workflow-specific powers (tracked execution, release
tooling, web specialists, TDD) without bloating every install.

Installed pack artifacts use the reserved `dude-pack-<name>-*` namespace, which
the engine treats as a distinct ownership tier and **preserves across
`@dude upgrade`**. The composer records every install in
`.dude/metadata/profile.md` so removal is exact. The namespace applies to every
category: agents, skill directories, `.instructions.md` files, and `.prompt.md`
files. New packs must use that namespace.

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
node .github/skills/dude-compose/compose.mjs list            # catalog (local or fetched) + installed flag
node .github/skills/dude-compose/compose.mjs status          # installed packs
node .github/skills/dude-compose/compose.mjs add <name>      # install (local or fetched)
node .github/skills/dude-compose/compose.mjs remove <name>   # uninstall
node .github/skills/dude-compose/compose.mjs verify          # temp-install + lint every pack
```

Flags: `--root <dir>` (bundle root, default cwd), `--library <dir>` (catalog,
default `<root>/library/packs`), `--source <repo>` / `--ref <ref>` (upstream for
the `add`/`list` fetch fallback; default the bundle manifest's
`source_repo` / `source_ref`), `--no-fetch` (never fetch — require the pack locally), `--json`
(machine output), `--force` (overwrite existing destinations on add).
Exit codes: `0` ok, `1` usage, `2` operation error.

## Add Flow (coordinator)

1. Run `node .github/skills/dude-compose/compose.mjs list --json` to confirm the
   pack is not already installed. If it is not in the local catalog, `add` will
   fetch it from the bundle's configured upstream source (see Catalog
   Resolution) — tell the user it will be fetched.
2. **Preview, then confirm.** Tell the user exactly what will be written
   (the pack's `dude-pack-<name>-*` agents and skills) and any `requires:` tools
   from `library/packs/<name>/pack.md`. Wait for confirmation before writing.
3. Run `node .github/skills/dude-compose/compose.mjs add <name> --json`. The
   script stages and hashes every artifact, preflights all destinations and the
   next profile, then copies transactionally. It records the exact source,
   manifest digest, source/install hashes, and file list in the profile. A copy
   or profile-write failure restores prior files and profile bytes.
4. Run `node .github/skills/dude-lint/lint.mjs .` and treat any `[FAIL]` as a
   hard stop — if installing the pack broke hygiene, remove it and report.
5. Tell the user the pack is active and summarize what it added (new agents,
   new skills, any new `@dude` verbs the pack enables).

## Remove Flow (coordinator)

1. Run `status --json` to confirm the pack is installed.
2. Preview the artifacts that will be deleted (from `installed.<name>.files`),
   but do not treat that list alone as deletion authority.
3. Run `node .github/skills/dude-compose/compose.mjs remove <name> --json`. The
   script authorizes removal only from a complete current inventory whose
   artifact paths exactly equal `files`. It validates the inventory digest and
   available source/manifest evidence, requires every installed artifact to
   match its recorded installed hash, and rejects profile drift before deleting
   anything. It also requires the entire loaded profile to be fully current —
   every installed entry carrying a complete inventory and no enabled-only
   ghost — so serializing the next profile never rewrites unrelated legacy or
   partial evidence. A released bundle can remove a pack without a local catalog
   because the exact inventory is persisted.
4. Run lint and confirm `0 failures`.

Legacy and partially populated profiles remain readable for status and
diagnosis, but cannot authorize removal of any pack. Removal retains the exact
authorizing profile bytes plus artifact backups and restores them on a failed
artifact or profile write, backing up every artifact before deleting any and
sweeping stray transaction siblings on rollback. It does not require a separate
removal-plan artifact or literal confirmation token beyond the coordinator
preview.

## Catalog Resolution

`add` and `list` resolve the pack catalog in this order:

1. **Local catalog** — `<root>/library/packs/`. Present in the Dude
   source/dogfood repo and in any install that vendors the catalog. Always wins
   (it is the copy you can edit).
2. **Fetch fallback** — when the local catalog is absent (a released core ships
   no `library/`), `compose.mjs` fetches the catalog from the bundle's upstream
   source. `add` fetches the single `library/packs/<name>/`; `list` reads the
   whole `library/packs/` to enumerate installable packs. The source is read
   from `.dude/metadata/bundle-manifest.md` (`source_repo` / `source_ref`) —
   the same trusted pin `dude-bundle-upgrade` already uses — or overridden with
   `--source` / `--ref`. Local-path sources are read in place; remote sources are
   shallow-cloned into a per-source cache under the OS temp dir and reused.

`--no-fetch` disables step 2 (require the pack locally; `list` then shows only
the local catalog, which may be empty). The fetch reuses only the manifest's
existing source pin; it does not invent arbitrary URLs. `git` is required for
remote sources. For a fully offline/vendored install, use `dude-portability` to
vendor the whole `library/` once.

## Verify (pack-source lint)

`node .github/skills/dude-compose/compose.mjs verify` diagnoses the current
profile without rewriting it, then validates every catalog
pack by temp-installing it into a throwaway copy of the current bundle, running
`dude-lint` against the result, then removing it and checking for leftovers. Use
it before publishing a pack or in CI. Exit code `2` if any pack lints with a
failure or leaves artifacts behind.

Expected sibling-pack **warnings** (not failures) when a pack references another
pack not installed alongside it: `hugo` -> docsy/ms-brand, `design` -> ms-brand,
`fluent-ui` -> web. Warnings are fine; only failures block.

## Rules

- Packs are **opt-in**. Never install a pack without explicit user intent.
- Always preview before writing; always lint after.
- A pack ships its artifacts under its own `dude-pack-<name>-*` prefix; the
  composer rejects artifacts outside that namespace.
- Pack names must not be hyphen-prefixes of one another (e.g. `hugo` /
  `hugo-docsy`); the composer rejects such collisions because `remove` matches
  on the `dude-pack-<name>-` prefix.
- Only a complete current `profile.md` inventory with exact `files` parity and
   installed hashes is a removal manifest. Legacy or partial evidence is
   diagnostic-only; do not hand-edit it into authority.
- Historical loose instruction/prompt removal requires the exact inventory
   source to remain available and hash-matching.
- The dogfood repo may install its active authoring/coding packs through compose;
   test other packs in a throwaway copy (`--root <tmp>`).
