---
name: dude-compose
description: "Use when installing, removing, refreshing, or listing optional Dude packs. Triggers: @dude add pack <name>, @dude remove pack <name>, @dude list packs, install pack, enable pack, uninstall pack, refresh an installed pack, re-project a pack after editing its source, the pack source or model mapping changed, which packs are available, compose the bundle, add tracked execution, add release tooling, add web specialists, add TDD. Do NOT use for upgrading the bundle itself (dude-bundle-upgrade) or importing an agent or skill from an external repository (dude-bundle-import)."
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

A pack `agents/<stem>.agent.md` source is projected, not copied. It installs one
Copilot profile at `.github/agents/<stem>.agent.md`. The destination stem must
carry the `dude-pack-<name>-` prefix.

## When To Run

- `@dude add pack <name>` / `install the <name> pack` / `enable <name>`
- `@dude remove pack <name>` / `uninstall the <name> pack`
- `refresh the <name> pack` after editing its source or a model mapping (see
  Refresh Flow)
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
node .github/skills/dude-compose/compose.mjs refresh <name>  # re-project an installed pack from current source
node .github/skills/dude-compose/compose.mjs verify          # temp-install + lint every pack
```

Flags: `--root <dir>` (bundle root, default cwd), `--library <dir>` (catalog,
default `<root>/library/packs`), `--source <repo>` / `--ref <ref>` (upstream for
remote `add`/`list`; default the bundle manifest's
`source_repo` / `source_ref`), `--no-fetch` (never fetch — require the pack locally), `--json`
(machine output), `--force` (overwrite existing destinations on add).
Exit codes: `0` ok, `1` usage, `2` operation error.

The command is selected before projection dependencies are loaded. `add`,
`refresh`, and `verify` load the model configuration and renderer from the
installed engine, using the absolute path
`.github/skills/dude-engine/config/agent-models.json`. `remove`, `list`, and
`status` do not load that configuration or the renderer.

## Add Flow (coordinator)

1. Run `node .github/skills/dude-compose/compose.mjs list --json` to confirm the
   pack is not already installed. If it is not in the local catalog, `add` will
   fetch it from the bundle's configured upstream source (see Catalog
   Resolution) — tell the user it will be fetched.
2. **Preview, then confirm.** Tell the user exactly what will be written
   (the pack's `dude-pack-<name>-*` agents and skills) and any `requires:` tools
   from `library/packs/<name>/pack.md`. Wait for confirmation before writing.
3. Run `node .github/skills/dude-compose/compose.mjs add <name> --json`. The
   script parses the complete incoming agent set, validates its `agents`
   declarations once, and renders one Copilot profile per source before staging.
   It then preflights every destination and the next profile, copies
   transactionally, and records the source, manifest digest, source/install
   hashes, and file list. A copy or profile-write failure restores prior files
   and profile bytes.
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
   artifact paths exactly equal `files`. It validates the inventory digest,
   requires every installed artifact to match its recorded installed hash, and
   rejects profile drift before deleting anything. When the recorded source is
   available, its raw digest must match; a missing source does not block removal,
   but invalid source evidence does. The command also requires the entire loaded
   profile to be fully current —
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

## Refresh Flow (coordinator)

Use refresh after a pack's authoritative source or a model mapping changed, to
re-project the installed pack in one transaction instead of a manual
remove-then-add.

1. Run `status --json` to confirm the pack is installed. Refresh updates an
   installed pack that still carries a complete current inventory; it does not
   install a new one.
2. Preview the change. Tell the user the pack will be re-projected from its
   current source: edited destinations are replaced in place, new source
   destinations are added, and destinations the source dropped are deleted. Wait
   for confirmation.
3. Run `node .github/skills/dude-compose/compose.mjs refresh <name> --json`. The
   script proves installed-side authority exactly as `remove` does (exact
   authorized profile bytes, whole-profile currency, exact `files`-to-inventory
   parity, and every installed artifact matching its recorded hash) and refuses
   on any drift before touching a file. Unlike `remove`, it expects the source to
   have changed, so it does not apply the uninstall recorded-source digest guard.
   It stages the current source through the same pipeline as `add`, computes the
   old-versus-new destination set, refuses any new destination that is occupied
   or claimed by another pack, and applies removals, replacements, and additions
   plus the profile update as one all-or-restored transaction. Any failure
   restores the prior artifacts and profile bytes.
4. Run lint and confirm `0 failures`.

Refresh reports `{ refreshed, replaced, added, removed, files }`; the human line
summarizes the replaced, added, and removed counts. It never takes `--force` and
never hand-edits the profile.

## Parity, Refresh, And Inventory

The installed Copilot profile is measured through the narrow `model:`
normalizer. A host may replace one well-formed `model:` line without changing
the recorded installed hash. Duplicate or malformed model lines are not
normalized, and `model-class` is never removed. Any other hand edit is drift,
so `remove` refuses until the installed profile is restored.

Concrete model mappings live in `src/config/agent-models.json`; the installed
engine carries a byte-identical copy at
`.github/skills/dude-engine/config/agent-models.json`. A mapping or pack-source
change does not rewrite an installed pack. Refresh it with `compose refresh
<pack>`, which re-projects the current source in one all-or-restored transaction
after proving installed-side authority (see Refresh Flow). On a released bundle
without the `refresh` subcommand, fall back to `compose remove <pack>` then
`compose add <pack>`; that removal uses the persisted inventory and does not
render the source again.

Current inventories use `version: 1`. Each source artifact has one direct
destination at `.github/<source>`, and the `files` list must exactly match the
inventory paths.

## Catalog Resolution

`add` and `list` resolve the pack catalog in this order:

1. **Local catalog** — `<root>/library/packs/`. Present in the Dude
   source/dogfood repo and in any install that vendors the catalog. Always wins
   (it is the copy you can edit).
2. **Remote catalog** — when the local catalog is absent (a released core ships
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
failure or leaves artifacts behind. The throwaway copy and the leftover sweep
cover every install location: `.github/agents`, `.github/skills`,
`.github/instructions`, and `.github/prompts`.

Expected sibling-pack **warnings** (not failures) when a pack references another
pack not installed alongside it: `hugo` -> docsy/ms-brand, `design` -> strata,
`fluent-ui` -> web. Warnings are fine; only failures block.

## Rules

- Packs are **opt-in**. Never install a pack without explicit user intent.
- Always preview before writing; always lint after.
- A pack ships its artifacts under its own `dude-pack-<name>-*` prefix; the
  composer rejects artifacts outside that namespace, including an agent
  destination whose stem leaves it.
- A pack agent source declares `model-class`, never a concrete `model:` or
  `effort:`; the composer refuses a source it cannot project.
- `agents` is the only composite declaration. Omission means leaf; a present
  value is a non-empty roster of unique stable stems. Only `dude` may use the
  unmixed `["*"]` roster.
- Agent-set validation covers the complete incoming pack only. It does not make
  a cross-pack roster claim.
- Never hand-edit an installed representation. Refresh with `compose refresh
  <pack>`; on a released bundle without it, fall back to `remove` then `add`.
- Pack names must not be hyphen-prefixes of one another (e.g. `hugo` /
  `hugo-docsy`); the composer rejects such collisions because `remove` matches
  on the `dude-pack-<name>-` prefix.
- Only a complete current `profile.md` inventory with exact `files` parity and
   installed hashes is a removal manifest. Legacy or partial evidence is
   diagnostic-only; do not hand-edit it into authority.
- Historical loose instruction/prompt removal requires the exact inventory
   source to remain available and hash-matching.
- In the dogfood repo, compose may use only its six currently installed profile
   packs: `authoring`, `coding`, `design`, `release`, `strata`, and `writing`.
   Test any other catalog pack in a throwaway root (`--root <tmp>`).
