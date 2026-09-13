# Upgrading the Dude Bundle

[Back to docs index](README.md)

The Dude bundle ships with one manifest at `.dude/metadata/bundle-manifest.md`
and a built-in upgrade skill so you can pull the latest engine version from
upstream without losing project memory or in-flight work. That canonical path
is the sole local, upstream, development-build, and release manifest endpoint.

> ## Core files are upstream-owned
>
> A core upgrade may add, replace, or remove files in exactly four categories:
>
> - canonical default agents at `.github/agents/dude.agent.md` and
>   `.github/agents/dude-<slug>.agent.md`, excluding `dude-local-*` and
>   `dude-pack-*`;
> - canonical core Dude skill directories at
>   `.github/skills/dude-<slug>/**`, excluding `dude-local-*`,
>   `dude-pack-*`, and `.github/skills/project/**`;
> - `.github/instructions/dude.instructions.md`; and
> - the exact deployed runtime tree `.github/extensions/dude/**`.
>
> The last path is the only core-owned extension tree. Other names, including
> `.github/extensions/dude-preview/**`, `.github/extensions/dude-local/**`, and
> every other `.github/extensions/<name>/**` tree, are project-owned and
> preserved.
>
> Do not edit the core Dude runtime in place; the next confirmed upgrade can
> discard those edits. The `dude-local-` convention applies to agent and skill
> customization, not executable runtime copies:
>
> - agents: `.github/agents/dude-local-<slug>.agent.md`
> - skills: `.github/skills/dude-local-<slug>/`
>
> Installed `dude-pack-*` artifacts are a separate pack tier. Core upgrade
> preserves them; `@dude upgrade --all` refreshes only packs already recorded
> as installed through Compose.

## What gets upgraded vs. preserved

The upgrader treats every file in your project as one of the following ownership buckets:

| Bucket | Examples | What `@dude upgrade` does |
|---|---|---|
| **Core-owned** | canonical `.github/agents/dude.agent.md` and `.github/agents/dude-<slug>.agent.md`; canonical `.github/skills/dude-<slug>/**`; `.github/instructions/dude.instructions.md`; exact `.github/extensions/dude/**` runtime | Added, replaced, or removed to match upstream. Local edits are discarded. Agent and skill `dude-local-*` / `dude-pack-*` tiers and the `project` skill are excluded. |
| **Pack-owned** | installed `dude-pack-*` agents, skills, instructions, and prompts under `.github/`, plus `.dude/metadata/profile.md` | Never overwritten or deleted by a core upgrade. Added and removed only by `dude-compose`. |
| **Upgrade-owned** | `.dude/metadata/bundle-manifest.md`, `.dude/metadata/upgrade-log.md` | Maintained only by the upgrade skill. |
| **Project-owned engine customization** | `.github/skills/project/`, custom agents and skills under `dude-local-*` or unreserved names, `.github/copilot-instructions.md`, every extension tree except exact `.github/extensions/dude/**` | Preserved by core upgrade. |
| **Dude project state** | `.dude/ideas/`, `.dude/specs/`, `.dude/memory/`, `.dude/state/` | Never overwritten. |
| **Repo-local files and external work state** | `README.md`, `docs/`, `.gitattributes`, Beads, your product source | Never touched or brought in by upgrade. |

Core ownership is derived by the engine on each run.
`.github/agents/<stem>.agent.md` is core-owned when the stem is `dude` or
`dude-<slug>`, excluding the project-owned `dude-local-<slug>` and pack-owned
`dude-pack-<pack>-<slug>` names. The same naming rule covers canonical
`.github/skills/dude-<slug>/**` directories. Two fixed paths complete the core
set: `.github/instructions/dude.instructions.md` and
`.github/extensions/dude/**`. Recursive ownership of
`.github/skills/dude-engine/**` includes the packaged model configuration, so
an existing upgrader installs the current loader and configuration without a
new ownership rule. No generic `.github/extensions/**` rule exists:
`src/extensions/dude/**` and every deployed extension tree with another name
remain project-owned. The local
[`.dude/metadata/bundle-manifest.md`](../.dude/metadata/bundle-manifest.md)
records the upstream source and installed release for orientation. The upgrader
compares local bytes with the resolved upstream tree at `plan` time.

The upgrade workflow's internal `upgrade.mjs status` phase compares refs for
orientation. It can report `up_to_date` for an incomplete or divergent core
tree; that result proves neither a complete inventory nor matching bytes. This
phase is separate from global `@dude status`, which reports workflow lane
orientation and does not check upgrades. Unless the internal phase returns an
error, an offline result, or `no releases published yet`, the workflow always
continues to the authoritative full-core `plan` phase. Matching refs may still
yield Add, Replace, or Remove operations that require review and
`confirm upgrade`. A true no-op requires matching `source_repo`, `source_ref`,
and `installed_ref` metadata plus an empty file-operation plan. On the `latest`
channel, `upgrade.mjs status` resolves the highest stable `vX.Y.Z` tag.

A historical install may need two explicit `@dude upgrade` invocations when its
old ownership engine cannot see a newly introduced core category. Complete the
first invocation with its fresh plan and confirmation to install the current
engine. Then invoke `@dude upgrade` again, review its fresh same-ref plan, and
provide a fresh `confirm upgrade`. The workflow never hides the follow-up,
reuses the first plan, or auto-applies the second plan.

Upstream documentation is intentionally not part of the upgrade payload. A project using Dude does not need to track Dude's own docs; read them in the Dude repository when needed.

The agent and skill naming convention protects local knowledge. A
project-local agent or skill under `dude-local-<slug>` is outside the canonical
core names, so the upgrader does not touch it.

New project-local artifacts should use the reserved `dude-local-` namespace:

- agents: `.github/agents/dude-local-<slug>.agent.md`
- skills: `.github/skills/dude-local-<slug>/SKILL.md`

The Dude core bundle must never ship default agents or skills with
`dude-local-` names. Unreserved custom agents and skills, such as
`.github/agents/<custom>.agent.md`, are also project-owned and preserved, but
`dude-lint` warns about them so they can be renamed before a future name
collision.

Direct file edits are still possible. If someone manually adds an unprefixed agent or skill (for example `.github/agents/<custom>.agent.md` or `.github/skills/<custom>/`) without going through `@dude hire`, `@dude import`, or `@dude create skill`, Dude cannot prevent the name up front. Instead, `dude-lint` warns that the artifact is project-owned but outside the reserved namespace, and upgrades still preserve it.

## Current bundle prerequisite

`@dude upgrade` requires the canonical
`.dude/metadata/bundle-manifest.md` and a valid
`.dude/metadata/profile.md`. The pack profile's installed map records opt-in
membership, exact safe files, and source identity. The upgrader does not translate project-state, profile, or manifest formats.

In the Dude source repository, `src/config/agent-models.json` is the model
authority. Both build modes validate that file, then copy its exact content to
`.github/skills/dude-engine/config/agent-models.json`. Upgrade copies that file
as ordinary content of the engine skill.

## Unrestorable planned destinations

`apply` checks every planned destination before writing. If a path is ignored
and untracked, Git cannot restore it during rollback, so the upgrader refuses
the plan and names the path. Track or un-ignore that destination, create a fresh
plan, and apply the new plan.

## Refreshing installed packs

`compose refresh <pack>`

Run this after a core upgrade or pack-source change to re-project the installed
pack from its current source. A core upgrade refreshes core-owned files only; it
preserves installed packs rather than projecting them in place. Pack output is
replaceable generated output: refresh may overwrite edits and always runs its
projection path. Keep a persistent customization under `dude-local-*`, not in
an installed `dude-pack-*` path.

Use `@dude upgrade --all` when you want to refresh the core and every pack
already listed in the installed profile. Dude applies and commits the reviewed
core upgrade first. The upgraded engine then previews each installed pack and
waits for the separate `confirm packs` confirmation before it refreshes any
pack. A dry run with `--all` still previews only the core because an
authoritative pack preview must come from the engine after core apply.

The bulk path never installs a pack. It processes installed names in a stable
order, keeps a local catalog target authoritative, and binds a remote target to
the concrete upstream commit selected for the core upgrade. This also lets a
released bundle refresh remote packs without a local `library/` directory.

Each pack refresh retains its ordinary all-or-restored transaction. If one
refuses, later packs are not attempted. Earlier successful output is staged
with the profile and committed once, so normal and partial results leave the
upgrade branch clean. A staging, commit, or lint failure is reported as an
operational failure with the branch state and rollback command; it does not
claim a clean result.

## Workflow

Start with `@dude upgrade --dry-run` for a preview or `@dude upgrade` for the
report and confirmation gate. Roll back only if needed.

1. **Preview (optional)** — `@dude upgrade --dry-run` runs the internal ref
   check followed by the authoritative full-core plan and lists every file that
   would be replaced, added, or removed, plus per-file line stats. Nothing is
   written. Preserve agent or skill customizations under their
   `dude-local-<slug>` paths before proceeding. Do not treat that convention as
   a place to copy the core extension runtime.
2. **Apply** — `@dude upgrade` runs the internal check and a fresh plan, reports
   the result, then waits for `confirm upgrade`. On confirm it creates a
   `dude-pre-upgrade-<timestamp>` git tag and a
   `chore/dude-upgrade-<sha>` branch as a safety net, then applies changes in
   this order:
   - **Add** new core files.
   - **Replace** core files (overwrite from upstream; any local edits are discarded).
   - **Remove** core files dropped upstream (unless `--skip-removals`).
3. **Verify** — runs `dude-lint` automatically. Any `[FAIL]` triggers a rollback offer before continuing.
4. **Review & merge** — `git diff` on the safety branch, then merge or open a PR like any normal change.

For `@dude upgrade --all`, confirm the core phase first. Inspect the
post-core pack preview, then reply `confirm packs` to start pack refresh. The
pre-core safety tag covers rollback of both the core commit and the optional
aggregate pack commit. Dude does not push or merge either commit.

## Common commands

| Goal | Command |
|---|---|
| Preview only, no writes | `@dude upgrade --dry-run` |
| Routine upgrade against the manifest's pinned ref | `@dude upgrade` |
| Upgrade core, then preview and refresh installed packs | `@dude upgrade --all` |
| Skip removals this run | reply `confirm upgrade skip-removals` at the gate |
| Pin to a specific upstream version | `@dude upgrade --ref v1.4.0` |
| Override the upstream source for one run | `@dude upgrade --source <url-or-local-path>` |
| Roll back the most recent upgrade | `@dude upgrade --rollback` |

## What is preserved, exactly

After a core-only `@dude upgrade`, the following files and directories are
byte-identical to what they were before the upgrade:

- everything under `.dude/` except `.dude/metadata/bundle-manifest.md` (rewritten with the new `installed_ref`) and `.dude/metadata/upgrade-log.md` (one new entry appended)
- everything under `.github/skills/project/`
- any agent file outside the canonical core names (including `dude-local-*` and `dude-pack-*`)
- any skill directory outside the canonical core names (including `dude-local-*`, `dude-pack-*`, and `project`)
- every extension tree except exact `.github/extensions/dude/**`, including `.github/extensions/dude-preview/**` and `.github/extensions/dude-local/**`
- `.github/copilot-instructions.md` if it exists
- project docs and root files such as `README.md` and `.gitattributes`
- the Beads database
- product and repository files outside the exact core-owned paths, including `src/extensions/dude/**`

With `@dude upgrade --all`, the core phase preserves those boundaries. Its
separate, confirmed pack phase then refreshes only packs already listed in the
installed profile through Compose. That phase may update
`.dude/metadata/profile.md` and those packs' recorded artifacts; it never
installs or enables a pack. The installed profile remains the only pack
authority. If it touches any other location in the list above, that is a bug.

Core-owned files are not preserved when upstream differs or removes them. Use
the `dude-local-<slug>` agent or skill namespace for persistent customization
of shipped agents or skills. Do not edit `.github/extensions/dude/**` in place;
maintain project extension work under a different named extension tree, which
core upgrade preserves but does not treat as a core-runtime override.

## Rollback

`@dude upgrade --rollback`:

1. Resets to the most recent `dude-pre-upgrade-*` tag.
2. Restores the prior `bundle-manifest.md` from the tagged commit.
3. Appends a rollback entry to `upgrade-log.md`.
4. Re-runs `dude-lint`.

The safety branch and tag remain until you delete them, so you can always roll forward again with another `@dude upgrade`.

## When to skip the upgrader

The upgrader is the right tool for engine refreshes. For first-time installs into a fresh repo or for cross-machine bundle transfers, see [dude-portability](../.github/skills/dude-portability/SKILL.md). For importing one focused specialist or skill, or one bounded clean artifact directory from a third-party source, see [dude-bundle-import](../.github/skills/dude-bundle-import/SKILL.md). Directory import is not an upgrade or bundle-deployment path.
