---
name: dude-compose
description: "Use when installing, removing, refreshing, previewing a refresh for, or listing optional Dude packs. Triggers: @dude add pack <name>, @dude remove pack <name>, @dude list packs, install pack, enable pack, uninstall pack, refresh an installed pack, preview `refresh <name> --dry-run`, re-project a pack after editing its source, the pack source or model mapping changed, which packs are available, compose the bundle, add tracked execution, add release tooling, add web specialists, add TDD. Do NOT use for upgrading the bundle itself (dude-bundle-upgrade) or importing an agent or skill from an external repository (dude-bundle-import)."
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
node .github/skills/dude-compose/compose.mjs list --use-case ui --json  # exact discovery matches
node .github/skills/dude-compose/compose.mjs status          # installed packs
node .github/skills/dude-compose/compose.mjs add <name>      # install (local or fetched)
node .github/skills/dude-compose/compose.mjs add <name> --dry-run  # read-only add preview
node .github/skills/dude-compose/compose.mjs remove <name>   # uninstall
node .github/skills/dude-compose/compose.mjs remove <name> --dry-run  # read-only remove preview
node .github/skills/dude-compose/compose.mjs refresh <name>  # re-project an installed pack from current source
node .github/skills/dude-compose/compose.mjs refresh <name> --dry-run  # read-only refresh preview
node .github/skills/dude-compose/compose.mjs verify          # temp-install + lint every pack
```

Flags: `--root <dir>` (bundle root, default cwd), `--library <dir>` (catalog,
default `<root>/library/packs`), `--source <repo>` / `--ref <ref>` (the one
source for `add`/`list`/`refresh`: a remote repository, or a local folder that
contains `library/packs`; default the bundle manifest's `source_repo` /
`source_ref`; an explicit `--source` is exclusive, see Catalog Resolution),
`--no-fetch` (never fetch — require the pack locally), `--json`
(machine output), `--use-case <id>` (exact discovery filter for `list` only),
`--dry-run` (read-only preview for `add`, `remove`, and `refresh`), `--force`
(overwrite existing destinations on add).
Exit codes: `0` ok, `1` usage, `2` operation error.

`add <name> --dry-run` runs the add's own source resolution, staging, namespace,
and destination checks, then removes its staging and writes nothing. It returns
`{ items, files, source, conflicts, tools }`: each item it would add as
`{ kind, name }`, where `kind` is `Agent`, `Skill`, `Prompt`, or `Instructions`;
the files and the source identity the add would record (a remote includes
`resolved_commit`); the destinations that conflict; and each `requires.tools`
entry in `pack.md` as `{ name, found }`, found when it is on `PATH` (with
`PATHEXT` on Windows). The preview reports conflicts and missing tools rather
than refusing; `add` itself does not check tools. `remove <name> --dry-run`
returns `{ files }`, the pack's recorded files after the path checks `remove`
makes, and deletes nothing.

The command is selected before projection dependencies are loaded. `add` and
`refresh` (each including `--dry-run`), and `verify` load the model configuration and renderer from the
installed engine, using the absolute path
`.github/skills/dude-engine/config/agent-models.json`. `remove`, `list`, and
`status` do not load that configuration or the renderer.

## Discovery metadata

`list` retains `name`, `installed`, and `description`, and adds `use_cases` to
each pack result. `list --use-case <id>` returns only packs that declare that
exact value, in catalog order.

External manifests may omit `use-cases`; list returns `use_cases: []` for them.
A present declaration must be a non-empty list of unique lowercase kebab-case
identifiers. `add`, `refresh --dry-run`, and `refresh` validate a present
declaration before staging, so malformed metadata stops before projection or a
profile write.

`verify` deliberately excludes discovery-metadata validation. Use cases are
read-only discovery metadata: they add no profile data, and other Compose
lifecycle behavior is unchanged.

## Add Flow (coordinator)

1. Run `node .github/skills/dude-compose/compose.mjs list --json` to confirm the
   pack is not already installed. If it is not in the local catalog, `add` will
   fetch it from the bundle's configured upstream source (see Catalog
   Resolution) — tell the user it will be fetched.
2. **Preview, then confirm.** Run
   `node .github/skills/dude-compose/compose.mjs add <name> --dry-run --json`
   and show its output: the items it adds by kind and name, its files, source,
   conflicts, and required tools as found or missing. Wait for confirmation
   before writing.
3. Run `node .github/skills/dude-compose/compose.mjs add <name> --json`. The
   script parses the complete incoming agent set,
   validates its `agents` declarations once, and renders one Copilot profile per
   source before staging. It then preflights every destination and the next
   profile, copies transactionally, and records the exact file list plus source
   identity. A copy or profile-write failure restores prior files and profile
   bytes.
4. Run `node .github/skills/dude-lint/lint.mjs .` and treat any `[FAIL]` as a
   hard stop — if installing the pack broke hygiene, remove it and report.
5. Tell the user the pack is active and summarize what it added (new agents,
   new skills, any new `@dude` verbs the pack enables).

## Remove Flow (coordinator)

1. Run `status --json` to confirm the pack is installed.
2. Preview the deletion with
   `node .github/skills/dude-compose/compose.mjs remove <name> --dry-run --json`
   and show its output: the pack's recorded files, after the path checks removal
   makes.
3. Run `node .github/skills/dude-compose/compose.mjs remove <name> --json`. The
   script authorizes deletion only from that pack's exact recorded safe paths.
   It validates namespace, ownership, containment, and symbolic-link safety
   before deleting. Changed source or installed bytes do not expand, block, or
   alter that deletion set; a missing listed destination stays missing. A
   released bundle can remove a pack without a local catalog because the exact
   file list is persisted.
4. Run lint and confirm `0 failures`.

Removal rereads its authorized profile bytes before applying changes. It retains
artifact backups and restores them on a caught artifact or profile-write failure,
backing up every existing listed artifact before deleting any and sweeping
transaction residue on rollback. This is not a crash-proof atomicity guarantee.

## Refresh Flow (coordinator)

Use refresh after a pack's authoritative source or a model mapping changed, to
re-project the installed pack in one transaction instead of a manual
remove-then-add. Ordinary `refresh <name>` remains the canonical mutation path;
`--dry-run` prepares and reports that same refresh without applying it.

1. Run `status --json` to confirm the pack is installed. Refresh updates an
   installed pack; it does not install a new one.
2. Preview the change with
   `node .github/skills/dude-compose/compose.mjs refresh <name> --dry-run --json`.
   It returns `{ previewed, replaced, added, removed, files, source }`: edited
   destinations are replacements, new source destinations are additions, and
   destinations the source dropped are removals. The preview uses the same
   source resolution, projection, ownership checks, profile authority, and
   destination classification as refresh. It removes its staging area and
   changes neither artifacts nor the profile. Wait for confirmation.
3. Run `node .github/skills/dude-compose/compose.mjs refresh <name> --json`. The
   script uses the old exact file list for its replaceable destinations, stages
   the current source through that canonical preparation, then applies removals,
   replacements, and additions plus the profile update as one all-or-restored
   transaction. It always reprojects, including when the source and projected
   bytes appear unchanged. A caught failure restores the prior artifacts and
   profile bytes; process termination or machine failure is outside that
   guarantee.
4. Run lint and confirm `0 failures`.

Refresh reports `{ refreshed, replaced, added, removed, files }`; the human line
summarizes the replaced, added, and removed counts. It never takes `--force` and
never hand-edits the profile.

## Profile Authority And Customization

The `installed` map is the one pack authority. Its keys are opt-in membership,
and each entry contains only its sorted exact safe `files` list and source
identity. A direct local source records `{ type, location }`; it does not claim
a Git commit. A remote source records its configured repository, its requested
ref (including `latest`), and the concrete commit fetched for that operation,
never the temporary folder it was read from. Source identity identifies where the
projection came from. It does not attest installed bytes.

An existing complete predecessor profile can make one in-memory transition to
this shape. The next successful add, remove, or refresh writes the canonical
map. Older, partial, malformed, mixed, or ambiguous profiles refuse rather than
being repaired.

Installed pack output is a replaceable generated projection. Refresh can
overwrite edits, and remove deletes the exact recorded safe files. Put a
persistent project customization under `dude-local-*`, not inside
`dude-pack-<name>-*`. Concrete model mappings live in
`src/config/agent-models.json`; refresh a pack after changing a mapping or pack
source.

## Catalog Resolution

`list` prefers a whole local catalog. `add` and `refresh` prefer the requested
local target pack, but fetch that target when it is absent locally and fetching
is enabled, even if other local packs exist.

1. **Local catalog** — `<root>/library/packs/`. Present in the Dude
   source/dogfood repo and in any install that vendors the catalog. It supplies
   `list` and any requested target it contains (it is the copy you can edit).
2. **Remote catalog** — when `list` has no local catalog, or `add` or `refresh`
   needs a missing local target, `compose.mjs` fetches from the bundle's upstream
   source. The source is read from `.dude/metadata/bundle-manifest.md`
   (`source_repo` / `source_ref`) — the same trusted pin
   `dude-bundle-upgrade` already uses — or overridden with `--source` / `--ref`.
   Local-path sources are read in place. Every remote request resolves the ref
   to one commit and gets current upstream bytes for that invocation in a new
   temporary folder under the OS temp dir, which Compose removes before it
   answers or writes, including after a failure. The one exception is a Git
   clone whose process tree cannot be confirmed stopped: because a process may
   still write to that folder, Compose keeps it and reports the unconfirmed
   cleanup in its refusal. An exact full commit SHA selects exact content but
   never reuses an earlier copy. A required remote fetch failure refuses rather
   than using old fetched bytes.

How a remote source is fetched depends on its host:

- **GitHub.** A public GitHub repository (`https://github.com/<owner>/<repo>`,
  `ssh://git@github.com/<owner>/<repo>`, or `git@github.com:<owner>/<repo>`) is
  read over anonymous HTTPS and never cloned, not even after a failure. `list`
  downloads only each direct `library/packs/<name>/pack.md` and the tree
  listings that find them. `add` and `refresh` download only the selected
  pack's complete folder, including nested skill files, scripts, assets, and
  shipped notices. Each file is checked against its Git object ID at the
  resolved commit, and a branch, tag, or `latest` that moves during the read is
  refused rather than mixed.
- **Other hosts**, GitHub Enterprise included, are cloned whole with Git, as
  before.

Remote reads have fixed bounds: 30 seconds for a GitHub catalog, 120 seconds
for a selected GitHub pack, and 60 seconds for another host's clone, plus size
and request limits. Exceeding one, a GitHub rate limit, or an incomplete answer
is a refusal, never a partial or empty result. When a stopped clone cannot be
confirmed stopped, the error says so and names the temporary material it kept.

GitHub reads are anonymous: Compose sends no token and uses none of Git's
credential helpers, `.netrc`, SSH keys, or proxy settings for them. A private
GitHub repository, or one reachable only through Git's sign-in or proxy
configuration, therefore fails visibly, and Compose never retries it through
Git. Use a local folder source (`--source <folder>`) or a vendored `library/`
for such a catalog.

`--no-fetch` disables step 2 (require the pack locally; `list` then shows only
the local catalog, which may be empty). Remote selection uses only the manifest
source pin unless `--source` / `--ref` overrides it; it does not invent
arbitrary URLs. Git is required only for remote sources on other hosts. For a
fully offline/vendored install, use `dude-portability` to vendor the whole
`library/` once.

An explicit `--source` replaces that order. Only the named source is consulted:
a remote repository at `--ref` (default `main`), or a local folder read in place
as `<folder>/library/packs`. The local catalog is skipped, the manifest is not
consulted, `--library` is ignored, and a missing pack, a missing catalog, or a
fetch failure is a refusal, never a reason to try another catalog. With
`--no-fetch`, an explicit remote source is refused rather than fetched; an
explicit local folder needs no fetch. Calls without `--source` behave exactly as
above, and no Compose call reads or lists `.dude/metadata/pack-sources.md`:
Canvas reads that file and passes exactly one saved source to Compose.

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
pack not installed alongside it: `hugo` -> docsy and `fluent-ui` ->
web. Warnings are fine; only failures block.

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
  <pack>`.
- Pack names must not be hyphen-prefixes of one another (e.g. `hugo` /
  `hugo-docsy`); the composer rejects such collisions because `remove` matches
  on the `dude-pack-<name>-` prefix.
- The `installed` map and each pack's exact safe `files` list are removal
   authority. Do not hand-edit the profile.
