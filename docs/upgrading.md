# Upgrading the Dude Bundle

[Back to docs index](README.md)

The Dude bundle ships with one manifest at `.dude/metadata/bundle-manifest.md`
and a built-in upgrade skill so you can pull the latest engine version from
upstream without losing project memory or in-flight work. That canonical path
is the sole local, upstream, development-build, and release manifest endpoint.

> ## ⚠️ Base files are upstream-owned
>
> Every file matching the upstream namespace convention — `.github/agents/dude.agent.md`, `.github/agents/dude-<slug>.agent.md` (slug not starting with `local-` or `pack-`), `.github/skills/dude-<slug>/**` (slug not starting with `local-` or `pack-`), and `.github/instructions/dude.instructions.md` — is owned by upstream and is **silently overwritten** by `@dude upgrade`. Editing a base agent, skill, or the bundle instructions in place is unsupported — your changes will be lost on the next upgrade.
>
> Installed **packs** (the reserved `dude-pack-<pack>-<slug>` namespace, managed by `dude-compose`) are their own tier and are **preserved** across upgrades — a core refresh never overwrites or deletes them.
>
> To customize a default agent or skill, copy it under the reserved `dude-local-<slug>` namespace and edit there:
>
> - agents: `.github/agents/dude-local-<slug>.agent.md`
> - skills: `.github/skills/dude-local-<slug>/`
>
> Files under `dude-local-` are project-owned and never touched by upgrade. They are also the place to add new project-specific agents and skills.

## What gets upgraded vs. preserved

The upgrader treats every file in your project as one of the following ownership buckets:

| Bucket | Examples | What `@dude upgrade` does |
|---|---|---|
| **Base-owned** | default agents in `.github/agents/`, default skills in `.github/skills/` except `.github/skills/project/`, `.github/instructions/dude.instructions.md` | Overwritten unconditionally when upstream differs. Local edits to these paths are discarded. |
| **Pack-owned** | installed packs under `.github/agents/dude-pack-*` and `.github/skills/dude-pack-*/`, plus `.dude/metadata/profile.md` | Never overwritten or deleted by a core upgrade. Added/removed only by `dude-compose` (`@dude add/remove pack`). |
| **Upgrade-owned** | `.dude/metadata/bundle-manifest.md`, `.dude/metadata/upgrade-log.md` | Maintained only by the upgrade skill. |
| **Project-owned engine customization** | `.github/skills/project/`, custom agents, custom skills under `dude-local-*` or other names, `.github/copilot-instructions.md` | Never overwritten. |
| **Dude project state** | `.dude/ideas/`, `.dude/specs/`, `.dude/memory/`, `.dude/state/` | Never overwritten. |
| **Repo-local files and external work state** | `README.md`, `docs/`, `.gitattributes`, Beads, your product source | Never touched or brought in by upgrade. |

Base ownership is derived from the **namespace convention** by the upgrader on each run — anything under `.github/agents/dude.agent.md`, `.github/agents/dude-<slug>.agent.md`, `.github/skills/dude-<slug>/**`, or `.github/instructions/dude.instructions.md` is base-owned, with the reserved `dude-local-<slug>` and `dude-pack-<pack>-<slug>` namespaces explicitly excluded (project-owned and pack-owned respectively). The local [`.dude/metadata/bundle-manifest.md`](../.dude/metadata/bundle-manifest.md) is **metadata only**: it records the upstream repo and the installed release version (`installed_ref`) for orientation. The upgrader compares your on-disk bytes against the fetched upstream tree directly at `plan` time.

The authoritative upgrade trigger is whether the locally recorded `installed_ref` differs from the newest release the source offers. On the `latest` channel `@dude status` resolves the highest stable `vX.Y.Z` tag with `git ls-remote --tags` (remote sources) or `git tag` (local-path sources); a pinned tag or branch ref is compared by name. When the channel is `latest` but no release tag exists yet, status reports `no releases published yet`.

Upstream documentation is intentionally not part of the upgrade payload. A project using Dude does not need to track Dude's own docs; read them in the Dude repository when needed.

The namespace convention protects local knowledge. If you create a project-local agent or skill under the reserved `dude-local-<slug>` namespace, it sits in a different namespace from upstream `dude-<slug>` artifacts and the upgrader simply does not touch it. There is no collision to resolve.

New project-local artifacts should use the reserved `dude-local-` namespace:

- agents: `.github/agents/dude-local-<slug>.agent.md`
- skills: `.github/skills/dude-local-<slug>/SKILL.md`

The Dude core bundle must never ship default agents or skills with `dude-local-` names; the engine excludes those names from base enumeration by convention. Anything else outside both the base and `dude-local-` namespaces — say, an agent file `.github/agents/<custom>.agent.md` that does not use the `dude-` prefix at all — is project-owned and never overwritten by upgrade, but `dude-lint` warns about it so it can be renamed before colliding with a future upstream artifact of the same name.

Direct file edits are still possible. If someone manually adds an unprefixed agent or skill (for example `.github/agents/<custom>.agent.md` or `.github/skills/<custom>/`) without going through `@dude hire`, `@dude import`, or `@dude create skill`, Dude cannot prevent the name up front. Instead, `dude-lint` warns that the artifact is project-owned but outside the reserved namespace, and upgrades still preserve it.

## Current bundle prerequisite

`@dude upgrade` requires the canonical
`.dude/metadata/bundle-manifest.md` and an inventory-backed
`.dude/metadata/profile.md` whose installed packs carry versioned file
inventories. Unsupported prior formats need external or manual recovery before
upgrade; the upgrader does not translate project-state, profile, or manifest
formats.

## Workflow

The upgrade surface is small on purpose: **status → dry-run → upgrade → (rollback if needed)**.

1. **Check** — `@dude status` reports whether an upgrade is available against the manifest's configured source. The decision compares the locally recorded `installed_ref` against the newest release tag on the source (for the `latest` channel, the highest stable `vX.Y.Z`).
2. **Preview** — `@dude upgrade --dry-run` produces an upgrade report listing every file that would be replaced, added, or removed, plus per-file line stats. Nothing is written. Use this to spot any local edits to base files you may want to preserve in `dude-local-<slug>` before proceeding.
3. **Apply** — `@dude upgrade` re-runs the report, then waits for `confirm upgrade`. On confirm it creates a `dude-pre-upgrade-<timestamp>` git tag and a `chore/dude-upgrade-<sha>` branch as a safety net, then applies changes in this order:
   - **Add** new base files.
   - **Replace** base files (overwrite from upstream; any local edits are discarded).
   - **Remove** base files dropped upstream (unless `--skip-removals`).
4. **Verify** — runs `dude-lint` automatically. Any `[FAIL]` triggers a rollback offer before continuing.
5. **Review & merge** — `git diff` on the safety branch, then merge or open a PR like any normal change.

## Common commands

| Goal | Command |
|---|---|
| Preview only, no writes | `@dude upgrade --dry-run` |
| Routine upgrade against the manifest's pinned ref | `@dude upgrade` |
| Skip removals this run | reply `confirm upgrade skip-removals` at the gate |
| Pin to a specific upstream version | `@dude upgrade --ref v1.4.0` |
| Override the upstream source for one run | `@dude upgrade --source <url-or-local-path>` |
| Roll back the most recent upgrade | `@dude upgrade --rollback` |

## What is preserved, exactly

After any `@dude upgrade`, the following files and directories are byte-identical to what they were before the upgrade:

- everything under `.dude/` except `.dude/metadata/bundle-manifest.md` (rewritten with the new `installed_ref`) and `.dude/metadata/upgrade-log.md` (one new entry appended)
- everything under `.github/skills/project/`
- any agent file under `.github/agents/` outside the upstream base namespace (including everything under `dude-local-*`)
- any skill directory under `.github/skills/` outside the upstream base namespace (including everything under `dude-local-*`)
- `.github/copilot-instructions.md` if it exists
- project docs and root files such as `README.md` and `.gitattributes`
- the Beads database
- product and repository files outside the base-owned `.github/` namespace

If anything in those locations is touched by the upgrader, that is a bug.

Files matching the upstream base namespace are not preserved. Any local edits to those paths are silently discarded on apply. Use the `dude-local-<slug>` namespace to keep customizations of shipped agents or skills.

## Rollback

`@dude upgrade --rollback`:

1. Resets to the most recent `dude-pre-upgrade-*` tag.
2. Restores the prior `bundle-manifest.md` from the tagged commit.
3. Appends a rollback entry to `upgrade-log.md`.
4. Re-runs `dude-lint`.

The safety branch and tag remain until you delete them, so you can always roll forward again with another `@dude upgrade`.

## When to skip the upgrader

The upgrader is the right tool for engine refreshes. For first-time installs into a fresh repo or for cross-machine bundle transfers, see [dude-portability](../.github/skills/dude-portability/SKILL.md). For pulling in a single specialist or skill from a third-party source, see [dude-bundle-import](../.github/skills/dude-bundle-import/SKILL.md).
