---
name: "dude-bundle-upgrade"
description: "Use when the user wants to upgrade the Dude bundle itself, pull the newest base bundle from its source repo, refresh shipped agents/skills/instructions while preserving project memory and active work, or roll back a recent upgrade. Triggers: @dude upgrade, @dude upgrade --dry-run, @dude upgrade --rollback, upgrade dude, update dude bundle, pull latest dude."
---

# Bundle Upgrade

Pull the newest base Dude bundle from its source repo and overlay it onto this project, replacing only base-owned engine files (default agents, default skills, and the bundle instructions under `.github/`). Preserve everything project-local: project memory, project skills, project-custom agents and skills, `.github/copilot-instructions.md`, root files, repository docs, and all work state under `brainstorm/`, `specs/`, and Beads.

Upgrades are preview-then-confirm. Nothing is written to the working tree before the user confirms the upgrade plan.

## Purpose

Make engine updates routine, safe, and reversible. The user runs `@dude upgrade` and gets a clear report of what would change, confirms, and the bundle updates itself in place — without touching project memory, custom roster, or in-flight work.

## When To Run

- User asks to upgrade, update, refresh, or pull the latest Dude bundle.
- `@dude status` reports an upgrade is available and the user opts in.
- A coordinator-maintenance request asks to align with an upstream ref or version.

Do **not** run on routine project work. This skill is coordinator-maintenance, equivalent to `dude-lint` in scope and authority.

## Inputs

Accepted invocation forms:

- `@dude upgrade` — fetch the upstream ref recorded in the manifest and apply.
- `@dude upgrade --dry-run` — produce the upgrade report only, write nothing.
- `@dude upgrade --ref <branch|tag|sha>` — override the manifest-pinned ref.
- `@dude upgrade --source <url-or-local-path>` — override the source repo for this run.
- `@dude upgrade --rollback` — restore from the most recent pre-upgrade safety tag.
- `@dude upgrade --allow-dirty` — proceed even when the working tree has uncommitted changes (default is to refuse).

## File Classification

Every file under the project is placed into exactly one bucket. The bucket determines whether the upgrade may write to it.

| Bucket | Examples | Behavior |
|---|---|---|
| **Base-owned** (replaceable) | `.github/agents/<roster>/*.agent.md` listed in the manifest, `.github/skills/<skill>/**` listed in the manifest except `.github/skills/project/**`, `.github/instructions/dude.instructions.md` | Replaced by upstream version. |
| **Upgrade-owned** (operational) | `.github/dudestuff/bundle-manifest.md`, `.github/dudestuff/upgrade-log.md` | Maintained only by this skill. |
| **Project-owned** (preserve) | `.github/dudestuff/**` except the two upgrade-owned files, `.github/skills/project/**`, any `*.agent.md` or skill not in the manifest, `.github/copilot-instructions.md` | Never overwritten. |
| **Repo-local files and work state** (preserve) | `README.md`, `docs/**`, `.gitattributes`, `brainstorm/**`, `specs/**`, Beads database, product source, any path outside `.github/` | Never touched or brought in by upgrade. |
| **Path collision** (blocking) | a file or directory exists locally, is absent from the local manifest, but appears in the upstream manifest at the same path | Preserve local file and stop before apply unless the user explicitly skips the upstream addition or resolves the collision. |
| **Conflicted** | base-owned file whose current SHA-256 differs from its install-time hash in the manifest | Per-file user decision. |

Source of truth for "what is base-owned" is `.github/dudestuff/bundle-manifest.md`. The `files` map stores the clean base SHA-256 for each base-owned file. Optional `local_overrides` entries record user-approved local divergence for base-owned files without weakening the clean base map. This bundle does not support legacy installs without a seeded manifest: if the manifest is missing, empty, or uses placeholder values, refuse the upgrade and restore a current bundle copy first. Files not present in either the local manifest or the upstream manifest fall through to project-owned by default. Repository documentation and root files are intentionally excluded from the upgrade payload; users can read Dude docs in the upstream repository when needed.

## Reserved Project Namespace

Project-local agents and skills should use the reserved `dude-local-` namespace:

- agents: `.github/agents/dude-local-<slug>.agent.md`
- skills: `.github/skills/dude-local-<slug>/SKILL.md`

Upstream/base Dude artifacts must never use `dude-local-` names and must never include `dude-local-` paths in `.github/dudestuff/bundle-manifest.md`. If a fetched upstream manifest contains a reserved `dude-local-` path, abort before building the plan and report the upstream bundle as invalid. If a downstream project has older custom artifacts without `dude-local-`, preserve them under the collision rules, but new local artifacts should be renamed into the reserved namespace when practical.

The namespace is preventive, not the only safety mechanism. A user can still bypass Dude and manually create an unprefixed agent or skill (for example `.github/agents/<custom>.agent.md` or `.github/skills/<custom>/`). Treat those as project-owned if they are not in the local manifest, warn that they are unreserved local artifacts, and preserve them. If a future upstream manifest claims the same path, the normal Path collision bucket protects the local file.

## Workflow

### Step 1 — Pre-flight

1. Verify `.github/dudestuff/bundle-manifest.md` exists, parses, has a non-placeholder `installed_sha`, and has a non-empty `files` map. If missing or malformed, refuse and tell the user to restore a current bundle copy. Do not attempt bootstrap or backward-compatible reconstruction.
2. If the working tree is dirty (`git status --porcelain` non-empty) and the user did not pass `--allow-dirty`, refuse.
3. Resolve the upstream source: `--source` flag → manifest `source_repo` → hardcoded fallback (the canonical Dude repo URL).
4. Resolve the upstream ref: `--ref` flag → manifest `source_ref` → `main`.

### Step 2 — Fetch upstream

Try transports in order until one succeeds; cache under the operating system temp directory at `dude-upgrade-cache/<short-sha>/`, outside the repository:

1. For branch or tag refs, `git clone --depth=1 --branch <ref> <source>` to a temp directory.
2. For raw commit SHA refs, shallow clone the default branch, `git fetch --depth=1 <source> <sha>`, then `git checkout <sha>`.
3. GitHub tarball download + extract for `https://github.com/<owner>/<repo>` sources.
4. Local path copy when `<source>` is a filesystem path.

Validate the fetched tree contains all of:

- `.github/agents/`
- `.github/skills/dude-lint/`
- `.github/instructions/dude.instructions.md`
- `.github/dudestuff/bundle-manifest.md`

If any are missing, abort before any write and report the validation failure.

Also validate that the fetched upstream manifest does not contain reserved project-local paths: `.github/agents/dude-local-*.agent.md` or `.github/skills/dude-local-*/**`. If any are present, abort and report an upstream bundle namespace violation.

### Step 3 — Build the upgrade plan (no writes)

Walk both manifests and the working tree, classifying every file:

- **Replace** — base-owned, current local hash matches install-time hash, upstream version differs.
- **Add** — present in upstream manifest, absent locally.
- **Remove (base-owned)** — present in local manifest, absent in upstream manifest, current local hash matches install-time hash.
- **Path collision** — present in upstream manifest, absent from local manifest, and already exists locally. Treat as project-owned local knowledge blocking an upstream addition.
- **Conflict** — base-owned, current local hash differs from install-time hash. Surface with three sub-cases: (a) only local diverged, (b) only upstream diverged, (c) both diverged (true 3-way merge candidate).
- **Preserve** — project-owned or work state. List as a count, not per-file.
- **Unreserved project-owned artifact** — a project-owned agent or skill that is outside the manifest and does not use `dude-local-`. Preserve it, but report it as an advisory because it may collide with a future upstream artifact.
- **Up to date** — base-owned, no change needed.

Compute per-file diff line counts (`+a / −b`) for Replace and Conflict. For status and dry-run reporting, treat payload hash parity as the practical up-to-date check: compare the local manifest `files` map plus any accepted `local_overrides` against the upstream manifest payload, not `installed_sha` alone. `installed_sha` is orientation for the last applied upstream source; it may differ when upstream commits touch repo-local files outside the portable bundle payload.

### Step 4 — Render the upgrade report

Present a single structured report to the user:

```
Upgrade report: <local-sha> → <upstream-sha>
Source: <source_repo> @ <ref>

Will replace (N): file path  [+a / -b]
Will add (N):     file path
Will remove (N):  file path
Path collisions (N, blocking): file path  [local project-owned path blocks upstream base-owned path]
Conflicts (N):    file path  [reason]
Advisories (N):   unreserved project-owned agents/skills that should be renamed to dude-local- when practical
Preserved:        <count> project-memory files, <count> work-state files
Up to date (N):   collapsed unless --verbose
```

If there are no Replace/Add/Remove/Conflict entries, report `Already up to date` and stop without creating a safety tag.

If any Path collision entries exist, stop at the report unless the user explicitly chooses `confirm upgrade skip-collisions`. A normal `confirm upgrade` is not accepted while collisions exist, because applying the rest of the remote bundle could make core routing refer to a local artifact with unrelated behavior.

### Step 5 — User confirmation gate

Wait for one of:

- `confirm upgrade` — proceed with all Replace/Add/Remove operations; resolve conflicts interactively in Step 7.
- `confirm upgrade skip-removals` — apply Replace and Add but leave Remove items in place; report them as deferred.
- `confirm upgrade skip-collisions` — apply non-colliding changes and leave upstream additions blocked by local project-owned paths uninstalled; record them as deferred. This is advanced and can leave the upgraded core missing optional new upstream artifacts.
- `cancel` — stop, write nothing, delete the cache.

Plain "yes" / "ok" / "go" do not satisfy the gate. The dry-run flag short-circuits this gate by stopping after Step 4.

### Step 6 — Create safety net

1. Create a git tag `dude-pre-upgrade-<YYYYMMDD-HHMMSS>` at current HEAD.
2. Create and switch to branch `chore/dude-upgrade-<short-upstream-sha>`.
3. Record the tag name in memory for the rollback command.

### Step 7 — Apply changes

In deterministic order:

1. **Add** files.
2. **Replace** files (overwrite in place).
3. **Remove** files (only when the local hash matches install-time hash; never delete a file the user has modified).
4. **Conflict** files, one at a time, prompt:
  - `keep mine` — leave local file unchanged and write or refresh a `local_overrides[path]` entry with `base_sha256` from `files[path]`, `current_sha256` from the current file, `reason`, and `accepted_at`.
   - `take new` — overwrite with upstream.
   - `show diff` — display unified diff, then re-prompt.
   - `merge` — invoke `git merge-file <local> <install-time> <upstream>` when the install-time blob is reconstructable from git history; otherwise fall back to `take new` after explicit confirmation.

Skip every Preserve-bucket file. Do not modify any file outside the manifest's base-owned set.

Path collisions are never overwritten during Step 7. The recommended resolution is to cancel, rename the local agent or skill to a project-specific path, update any local references or routing assumptions, and rerun the upgrade. If the user instead chooses `confirm upgrade skip-collisions`, leave the local path untouched and do not add that upstream path to the refreshed manifest.

Conflict outcomes affect future protection:

- `take new` updates that file's manifest hash to the upstream hash and removes any existing `local_overrides[path]` entry.
- `keep mine` leaves that file's previous manifest hash unchanged and records `local_overrides[path]`, so future upgrades continue to detect it as locally modified while `dude-lint` can distinguish approved divergence from accidental drift.
- `merge` leaves that file's previous manifest hash unchanged and records `local_overrides[path]` unless the user explicitly says `accept merged as base`; `accept merged as base` updates `files[path]` to the merged file hash and removes any override.

### Step 8 — Update manifest and log

1. Rewrite `.github/dudestuff/bundle-manifest.md` with the new `source_ref`, `installed_sha`, `installed_at`, refreshed `files` hashes for clean base files only, and `local_overrides` for accepted local divergence. Do not replace `files[path]` hashes for `keep mine` or unaccepted `merge` conflicts.
2. Append an entry to `.github/dudestuff/upgrade-log.md` with timestamp, from→to sha, counts per bucket, conflict resolutions, accepted local overrides, and pending deferrals.

### Step 9 — Verify

Run `dude-lint` (either `pwsh .github/skills/dude-lint/lint.ps1` or `bash .github/skills/dude-lint/lint.sh`; both produce identical findings). Accepted `local_overrides` produce warnings, not failures, when the recorded current hash matches the local file. On any `[FAIL]`:

1. Report the failure.
2. Offer rollback: `rollback` (reset to safety tag, delete branch) or `keep` (leave the current state and resolve manually).

On all `[OK]`, continue to Step 10.

### Step 10 — Final summary

Report:

- `from <sha> → to <sha>`
- counts: replaced, added, removed, conflicts (resolved by category), preserved, deferred
- safety tag and branch names for rollback
- any new upstream agent or skill the user may want to enable
- next-step suggestions (e.g., `git diff main...HEAD` to review, then merge/PR)

## Rollback

`@dude upgrade --rollback`:

1. Find the most recent `dude-pre-upgrade-*` tag.
2. Refuse if the working tree is dirty unless `--allow-dirty` is passed.
3. `git reset --hard <tag>` on the upgrade branch (or current branch if it descends from the tag).
4. Restore the prior `bundle-manifest.md` from the tagged commit.
5. Append a rollback entry to `upgrade-log.md`.
6. Run `dude-lint`.
7. Report the restored sha and any cleanup the user should do (delete the safety branch, delete the tag once satisfied).

## Boundaries

- Never auto-push, auto-merge, or modify remote state.
- Never delete or modify any file under `.github/dudestuff/` except the upgrade-owned manifest and upgrade log this skill itself owns.
- Never delete or modify `.github/skills/project/`.
- Never modify `.github/copilot-instructions.md`.
- Never touch `brainstorm/`, `specs/`, Beads, or product source.
- Never run upgrade on a dirty working tree without explicit `--allow-dirty`. When `--allow-dirty` is used, uncommitted local changes are interleaved with upgrade writes; a subsequent `--rollback` performs a `git reset --hard` to the safety tag and will discard those uncommitted changes. Commit or stash first when in doubt.
- Never proceed past Step 4 without an explicit confirmation token.
- Never recurse into transitive bundle composition (a single upgrade pulls one upstream bundle, not bundle-of-bundles).
- For non-git projects, the safety net degrades to a timestamped backup directory under the OS temp `dude-upgrade-cache/backups/<ts>/`; rollback restores from there.

## Manifest Shape

`.github/dudestuff/bundle-manifest.md` contains a single fenced JSON block:

```json
{
  "source_repo": "https://github.com/<owner>/<repo>",
  "source_ref": "main",
  "installed_sha": "<commit-sha>",
  "installed_at": "<iso-8601-timestamp>",
  "bundle_version": "<semver-or-date>",
    "files": {
    ".github/agents/dude.agent.md": "<sha256>",
    ".github/skills/dude-lint/lint.ps1": "<sha256>",
    ".github/skills/dude-lint/lint.sh": "<sha256>",
    ".github/skills/dude-lint/SKILL.md": "<sha256>",
    ".github/instructions/dude.instructions.md": "<sha256>"
  },
  "local_overrides": {
    ".github/agents/dude.agent.md": {
      "base_sha256": "<sha256-from-files-map>",
      "current_sha256": "<sha256-of-current-local-file>",
      "reason": "kept local coordinator customization during upgrade",
      "accepted_at": "<iso-8601-timestamp>"
    }
  }
}
```

The `files` map enumerates every clean base-owned file at install time or after the latest accepted base refresh. It is intentionally scoped to the portable `.github` core: shipped agents, shipped skills except `.github/skills/project/`, and `.github/instructions/dude.instructions.md`. Anything not in this map is treated as project-owned during upgrade classification. `local_overrides` is optional and should be `{}` when no accepted local divergence exists.
