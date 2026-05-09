# Upgrading the Dude Bundle

[Back to docs index](README.md)

The Dude bundle ships with a manifest and a built-in upgrade skill so you can pull the latest engine version from upstream without losing project memory or in-flight work.

## What gets upgraded vs. preserved

The upgrader treats every file in your project as one of three things:

| Bucket | Examples | What `@dude upgrade` does |
|---|---|---|
| **Base-owned** | default agents in `.github/agents/`, default skills in `.github/skills/` except `.github/skills/project/`, `.github/instructions/dude.instructions.md` | Replaced from upstream when newer. |
| **Upgrade-owned** | `.github/dudestuff/bundle-manifest.md`, `.github/dudestuff/upgrade-log.md` | Maintained only by the upgrade skill. |
| **Project-owned** | `.github/dudestuff/*` except the two upgrade-owned files, `.github/skills/project/`, custom agents, custom skills, `.github/copilot-instructions.md` | Never overwritten. |
| **Repo-local files and work state** | `README.md`, `docs/`, `.gitattributes`, `brainstorm/`, `specs/`, Beads, your product source | Never touched or brought in by upgrade. |
| **Path collision** | local custom agent or skill exists at the same path as a new upstream base agent or skill | Blocks normal upgrade apply until resolved or explicitly skipped. |

The source of truth for which files are base-owned is [`.github/dudestuff/bundle-manifest.md`](../.github/dudestuff/bundle-manifest.md). It records the upstream repo, the installed commit sha for orientation, an informational `bundle_version`, and a SHA-256 of every clean base file at install time. Local edits to base files show up as **conflicts** and require an explicit per-file decision during upgrade. If you choose `keep mine`, the upgrader records a `local_overrides` entry with the base hash, current hash, reason, and timestamp; `dude-lint` warns about that accepted divergence instead of failing it. Current Dude installs always ship with a seeded manifest; legacy installs without one are not upgraded in place.

`bundle_version` should be bumped when publishing a material bundle change so downstream reports have a readable release label. Payload hashes remain the authoritative upgrade check.

Upstream documentation is intentionally not part of the manifest. A project using Dude does not need to track Dude's own docs; read them in the Dude repository when needed.

Path collisions protect local knowledge. If you created `.github/skills/foo/` locally and a future Dude release adds its own `.github/skills/foo/`, the upgrader does not overwrite yours and does not pretend the upstream `foo` was installed. The report marks it as a blocking collision. The safest fix is to cancel, rename your local skill or agent to a project-specific path, update local references if needed, then rerun the upgrade. Advanced users can choose `confirm upgrade skip-collisions` to take the rest of the upgrade while leaving the upstream colliding file uninstalled.

New project-local artifacts should use the reserved `dude-local-` namespace:

- agents: `.github/agents/dude-local-<slug>.agent.md`
- skills: `.github/skills/dude-local-<slug>/SKILL.md`

The Dude core bundle must never ship default agents or skills with `dude-local-` names, and `dude-lint` fails if the bundle manifest tries to claim them. This makes path collisions exceptional instead of routine. Older custom artifacts without the prefix remain protected by the collision policy; rename them into `dude-local-` when it is convenient.

Direct file edits are still possible. If someone manually adds an unprefixed agent or skill (for example `.github/agents/<custom>.agent.md` or `.github/skills/<custom>/`) without going through `@dude hire`, `@dude import`, or `@dude create skill`, Dude cannot prevent the name up front. Instead, `dude-lint` warns that the artifact is project-owned but outside the reserved namespace, and upgrades still preserve it. If upstream later claims the same path, the upgrade report treats it as a blocking path collision.

## Workflow

The upgrade surface is small on purpose: **status → dry-run → upgrade → (rollback if needed)**.

1. **Check** — `@dude status` reports whether an upgrade payload is available against the manifest's pinned source. The check is based on base-file hashes, not `installed_sha` alone, so upstream commits that touch only repo docs do not create false upgrade prompts.
2. **Preview** — `@dude upgrade --dry-run` produces an upgrade report listing every file that would be replaced, added, removed, or conflicted, plus the version delta. Nothing is written.
3. **Apply** — `@dude upgrade` re-runs the report, then waits for `confirm upgrade`. On confirm it creates a `dude-pre-upgrade-<timestamp>` git tag and a `chore/dude-upgrade-<sha>` branch as a safety net, then applies changes in this order:
   - **Add** new base files.
   - **Replace** base files where local matches install-time hash.
   - **Remove** base files dropped upstream (only when local matches install-time hash).
   - **Path collision** — stop if a local project-owned path blocks a new upstream path, unless explicitly skipped.
   - **Conflict** — for each base file you locally modified, prompt: `keep mine | take new | show diff | merge`.
4. **Verify** — runs `dude-lint` automatically. Accepted `local_overrides` produce warnings; any `[FAIL]` triggers a rollback offer before continuing.
5. **Review & merge** — `git diff` on the safety branch, then merge or open a PR like any normal change.

## Common commands

| Goal | Command |
|---|---|
| Preview only, no writes | `@dude upgrade --dry-run` |
| Routine upgrade against the manifest's pinned ref | `@dude upgrade` |
| Skip removals this run | reply `confirm upgrade skip-removals` at the gate |
| Preserve local path collisions and defer matching upstream additions | reply `confirm upgrade skip-collisions` at the gate |
| Pin to a specific upstream version | `@dude upgrade --ref v1.4.0` |
| Override the upstream source for one run | `@dude upgrade --source <url-or-local-path>` |
| Allow a dirty working tree | `@dude upgrade --allow-dirty` (refused by default) |
| Roll back the most recent upgrade | `@dude upgrade --rollback` |

## What is preserved, exactly

After any `@dude upgrade`, the following files and directories are byte-identical to what they were before the upgrade:

- everything under `.github/dudestuff/` except `bundle-manifest.md` (rewritten with the new sha, hash table, and any accepted local overrides) and `upgrade-log.md` (one new entry appended)
- everything under `.github/skills/project/`
- any agent file under `.github/agents/` not present in the upstream manifest
- any skill directory under `.github/skills/` not present in the upstream manifest
- `.github/copilot-instructions.md` if it exists
- project docs and root files such as `README.md` and `.gitattributes`
- everything under `brainstorm/`
- everything under `specs/`
- the Beads database
- everything outside `.github/`

If anything in those locations is touched by the upgrader, that is a bug.

## Rollback

`@dude upgrade --rollback`:

1. Resets to the most recent `dude-pre-upgrade-*` tag.
2. Restores the prior `bundle-manifest.md`.
3. Appends a rollback entry to `upgrade-log.md`.
4. Re-runs `dude-lint`.

The safety branch and tag remain until you delete them, so you can always roll forward again with another `@dude upgrade`.

## When to skip the upgrader

The upgrader is the right tool for engine refreshes. For first-time installs into a fresh repo or for cross-machine bundle transfers, see [dude-portability](../.github/skills/dude-portability/SKILL.md). For pulling in a single specialist or skill from a third-party source, see [dude-bundle-import](../.github/skills/dude-bundle-import/SKILL.md).
