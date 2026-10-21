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
> replace those edits. The `dude-local-` convention applies to agent and skill
> customization, not executable runtime copies:
>
> - agents: `.github/agents/dude-local-<slug>.agent.md`
> - skills: `.github/skills/dude-local-<slug>/`
>
> Installed `dude-pack-*` artifacts are a separate pack tier. Core upgrade
> preserves them; `@dude upgrade --all` also refreshes the installed packs
> whose recorded source is the bundle's own upstream.

## How an update works

An update is prepared first and written once:

1. **Prepare.** `@dude upgrade` resolves the recorded channel to one exact
   release commit, fetches only that commit's deployment files with Git, and
   lets that release's own engine build every changed byte in a temporary
   staging copy. Nothing in your project changes.
2. **Review.** Dude shows the installed and target versions and the actual
   added, replaced, and removed files, grouped into core, metadata, and each
   affected pack. It names the current branch and any touched file that has
   uncommitted or staged edits.
3. **Confirm.** Reply `confirm upgrade` to apply exactly that prepared result.
   Plain "yes" or "ok" does not count. Anything else discards it.
4. **Apply.** Dude rechecks that nothing it will touch changed since the
   preview, then writes exactly the prepared bytes in place as one
   all-or-restored batch, with the bundle check run before the batch and again
   inside its rollback boundary.
5. **Finish.** The changes stay uncommitted on the current branch. Review them
   with `git status` and `git diff`, commit them like any other change, and
   start a new session so the updated agents, skills, and Canvas load.

Dude never switches branches, stages, commits, tags, pushes, or merges, and it
does not need a clean working tree.

> **Git is not a backup for overwritten edits.** Confirming replaces
> customizations in the touched files. Git cannot recover pre-existing
> uncommitted edits that the update overwrites, because Git never held those
> bytes. Commit or copy anything you want to keep first. After the update and
> before you commit, `git restore -- <path>` returns a modified or deleted
> tracked file to its staged version, which is its committed version unless
> you staged a change to it (`git restore --source=HEAD -- <path>` takes the
> committed version); a file the update added is untracked,
> so delete it instead, for example with `git clean -f -- <path>`. After you
> commit, revert your commit. There is no separate undo command.

## What gets upgraded vs. preserved

The upgrader treats every file in your project as one of the following ownership buckets:

| Bucket | Examples | What `@dude upgrade` does |
|---|---|---|
| **Core-owned** | canonical `.github/agents/dude.agent.md` and `.github/agents/dude-<slug>.agent.md`; canonical `.github/skills/dude-<slug>/**`; `.github/instructions/dude.instructions.md`; exact `.github/extensions/dude/**` runtime | Added, replaced, or removed to match the target release. Local edits are replaced. Agent and skill `dude-local-*` / `dude-pack-*` tiers and the `project` skill are excluded. |
| **Pack-owned** | installed `dude-pack-*` agents, skills, instructions, and prompts under `.github/`, plus `.dude/metadata/profile.md` | Never changed by a core-only upgrade. With `--all`, eligible packs and their profile records are refreshed through Compose; see [Refreshing installed packs](#refreshing-installed-packs). |
| **Upgrade-owned metadata** | `.dude/metadata/bundle-manifest.md`, `.dude/metadata/upgrade-log.md`, optional `.dude/metadata/development-base-release.md` | In an installed bundle, the upgrade skill prepares and applies the manifest and optional source-associated base record, and appends one log entry. In the Dude source repository, `build-dev` owns the generated base-record copy. Stable release bundles omit that record. |
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
compares your local bytes with the exact target commit at `plan` time.

## Checking for a newer release

The upgrade workflow's internal `upgrade.mjs status` check lists the source's
release tags and compares the newest stable `vX.Y.Z` with your installed
version, numerically. It runs only for a `latest` channel, has a five-second
deadline, and writes nothing. It uses none of your Git configuration, saved
Git logins, cookies, proxies, or client certificates, never signs in (not
even with your Windows or Kerberos account), and follows no redirect. For an
`ssh://` or `git@host:path` source, an address with a user name, password,
query, or fragment, or a network share, it reports that it could not check,
without contacting the source, and `@dude upgrade --dry-run` checks with your
own Git sign-in instead. On Windows it needs Git for Windows 2.32.0(2) or
later. Pinned and development
installs make no lookup. It never offers a release older than the installed
one. The check is separate from global `@dude status`, which reports workflow
lane orientation and does not check upgrades.

A matching version proves neither a complete core inventory nor matching
bytes. The `plan` comparison is authoritative: it compares the complete core
inventory byte for byte, so matching refs may still yield Add, Replace, or
Remove operations that require review and `confirm upgrade`. A true no-op
requires matching `source_repo`, `source_ref`, and `installed_ref` metadata, a
matching development-base record or matching absence, and no file difference;
it prepares nothing and adds no log entry.

For a reviewed `main` refresh, the preview includes the optional
development-base record only when the selected target has a valid record for
the same source. Missing, invalid, or differently sourced
provenance plans removal or omission rather than retaining an unrelated base.
The record follows the same preview and `confirm upgrade` gate as other
upgrade-owned metadata. If application fails after writing, the batch's
rollback restores its earlier bytes or absence along with every other touched
file. The upgrader does not infer a base from the installed project's Git
history. Stable release bundles intentionally contain only the seeded manifest
and profile metadata, so they omit this development-only record.

A historical install may need two explicit `@dude upgrade` invocations when its
older engine predates staged upgrades or cannot see a newly introduced core
category. The first invocation runs that older engine's own procedure and
installs the current engine. Then invoke `@dude upgrade` again, review its fresh
preview, and provide a fresh `confirm upgrade`. The workflow never hides the
follow-up or applies it for you. This also applies when an
old engine cannot plan the optional development-base record: its later
record-only refresh remains a separate, explicit upgrade.

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

The target release must carry the staged-upgrade contract in its own engine.
A target without it is refused before anything is written; Dude does not fall
back to an older upgrade workflow.

In the Dude source repository, `src/config/agent-models.json` is the model
authority. Both build modes validate that file, then copy its exact content to
`.github/skills/dude-engine/config/agent-models.json`. Upgrade copies that file
as ordinary content of the engine skill.

## When an update does not apply

Every result says what happened:

| Result | Meaning | What to do |
|---|---|---|
| **Nothing changed** | Dude refused before writing: a touched file, installation record, the branch, or the prepared result changed since the preview, or the bundle check could not run first. | Run `@dude upgrade` again for a fresh preview. |
| **Files restored** | Dude wrote the update, then put every touched file back: the update introduced a new bundle check failure, or the check crashed, timed out, or could not be read. | Read the reported failure; nothing needs repair. |
| **Restoration unconfirmed** | Writing failed and Dude could not confirm that every file was put back. | Inspect the listed paths with `git status` and `git diff`. |

A caught failure restores every touched core, pack, and metadata file,
including additions and removals and including the record's prior absence.
This covers failures Dude catches while it runs, not power loss or a killed
process. Dude never repeats an update on its own.

Existing bundle check failures do not block an update. Only failures the
update introduces do, compared by their exact text and count, so an update
that fixes one failure but adds a different one is still restored. A
successful update lists any failures that were already there; it does not
call the result clean.

## Refreshing installed packs

`compose refresh <pack>`

Run this after a core upgrade or pack-source change to re-project the installed
pack from its current source. A core upgrade refreshes core-owned files only; it
preserves installed packs rather than projecting them in place. Pack output is
replaceable generated output: refresh may overwrite edits and always runs its
projection path. Keep a persistent customization under `dude-local-*`, not in
an installed `dude-pack-*` path.

Use `@dude upgrade --all` to include the out-of-the-box packs in the same
update. A pack is included only when the installed profile lists it and its
recorded source is the bundle upstream selected for the upgrade. Packs from
another repository or from your project's `library/packs` are left alone;
refresh those in Settings > Packs or with `compose refresh <pack>`. The source
must then be a Git address, such as an HTTPS or `file:` URL: Dude refuses
`--all` with a local folder path, which Compose would read as its current
working tree instead of the exact target commit. A core-only `@dude upgrade`
from a local folder is unaffected.

The target release's Compose refreshes each included pack from that source at
the exact target commit, so your project's own `library/` never takes
precedence, and a released bundle needs no local `library/` directory. Only
packs whose files actually change appear in the preview; an unchanged pack
keeps its files and record. All of it is reviewed and confirmed together with
the core, with one `confirm upgrade`. If any included pack cannot be
prepared, for example because another file already occupies a new pack
destination, the combined preview is refused and plain `@dude upgrade`
prepares the core alone.

## Common commands

| Goal | Command |
|---|---|
| Check whether a newer release exists | ask Dude whether an update is available |
| Preview only, keep nothing | `@dude upgrade --dry-run` |
| Routine upgrade against the manifest's channel | `@dude upgrade` |
| Upgrade the core and the out-of-the-box packs together | `@dude upgrade --all` |
| Preview that combined update only | `@dude upgrade --all --dry-run` |
| Pin to a specific upstream version | `@dude upgrade --ref v1.4.0` |
| Override the upstream source for one run | `@dude upgrade --source <url-or-local-path>` |
| Undo an applied update before committing | `git restore -- <path>` for modified or deleted tracked files (it restores the staged version; `git restore --source=HEAD -- <path>` restores the committed one); delete added, untracked files, for example with `git clean -f -- <path>` |
| Undo an applied update after committing | revert your commit |

## What is preserved, exactly

After a core-only `@dude upgrade`, the following files and directories are
byte-identical to what they were before the upgrade:

- everything under `.dude/` except `.dude/metadata/bundle-manifest.md` (rewritten with the new `installed_ref`), optional `.dude/metadata/development-base-release.md` (written or removed only as shown in the reviewed preview), and `.dude/metadata/upgrade-log.md` (one new entry appended)
- everything under `.github/skills/project/`
- any agent file outside the canonical core names (including `dude-local-*` and `dude-pack-*`)
- any skill directory outside the canonical core names (including `dude-local-*`, `dude-pack-*`, and `project`)
- every extension tree except exact `.github/extensions/dude/**`, including `.github/extensions/dude-preview/**` and `.github/extensions/dude-local/**`
- `.github/copilot-instructions.md` if it exists
- project docs and root files such as `README.md` and `.gitattributes`
- the Beads database
- product and repository files outside the exact core-owned paths, including `src/extensions/dude/**`
- your Git HEAD, current branch, staging area, tags, and other branches

With `@dude upgrade --all`, the same boundaries hold, and the reviewed result
may also update `.dude/metadata/profile.md` records and recorded artifacts of
the changed out-of-the-box packs. It never installs or enables a pack. The
installed profile remains the only pack authority. If an update touches any
other location in the list above, that is a bug.

Core-owned files are not preserved when the target differs or removes them.
Use the `dude-local-<slug>` agent or skill namespace for persistent
customization of shipped agents or skills. Do not edit
`.github/extensions/dude/**` in place; maintain project extension work under a
different named extension tree, which core upgrade preserves but does not treat
as a core-runtime override.

## When to skip the upgrader

The upgrader is the right tool for engine refreshes. For first-time installs into a fresh repo or for cross-machine bundle transfers, see [dude-portability](../.github/skills/dude-portability/SKILL.md). For importing one focused specialist or skill, or one bounded clean artifact directory from a third-party source, see [dude-bundle-import](../.github/skills/dude-bundle-import/SKILL.md). Directory import is not an upgrade or bundle-deployment path.
