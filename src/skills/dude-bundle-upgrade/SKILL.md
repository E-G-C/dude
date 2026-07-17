---
name: "dude-bundle-upgrade"
description: "Use when the user wants to upgrade the Dude bundle itself, pull the newest base bundle from its source repo, refresh shipped agents/skills/instructions while preserving project memory and active work, or roll back a recent upgrade. Triggers: @dude upgrade, @dude upgrade --dry-run, @dude upgrade --rollback, upgrade dude, update dude bundle, pull latest dude."
---

# Bundle Upgrade

Pull the newest base Dude bundle from its source repo and overlay it onto this project, replacing only base-owned engine files (default agents, default skills, and the bundle instructions under `.github/`). Preserve everything project-local: all project-specific ideas under `.dude/ideas/`, definition specs, memory, execution state, project skills, project-custom agents and skills, `.github/copilot-instructions.md`, root files, repository docs, and Beads. Only the upgrade-owned metadata exceptions named in [Boundaries](#boundaries) may change.

Upgrades are preview-then-confirm. The `upgrade.mjs` script does the heavy lifting for status, plan, apply, and rollback; the LLM orchestrates the conversation, surfaces the report, and translates the user's confirmation phrase into the apply invocation. Nothing is written to the working tree before the user confirms the upgrade plan.

> **Base files are upstream-owned.** Every file matching the dude base namespace convention (the `dude.agent.md` / `dude-<slug>.agent.md` agents, `dude-<slug>` skill directories, and the `dude.instructions.md` instructions file) is owned by upstream and is silently overwritten on apply. Editing a base file in place is unsupported \u2014 those edits will be lost on the next upgrade. To customize a default agent or skill, copy it under the reserved `dude-local-<slug>` namespace and edit there. See [Reserved Project Namespace](#reserved-project-namespace).

## Purpose

Make engine updates routine, safe, and reversible. The user runs `@dude upgrade` and gets a clear report of what would change. After `confirm upgrade`, Dude applies the upgrade, verifies it, and commits it on a safety branch. Publish (merge + push) is a deliberate opt-in step, not automatic.

## When To Run

- User asks to upgrade, update, refresh, or pull the latest Dude bundle.
- `@dude status` reports an upgrade is available and the user opts in.
- A coordinator-maintenance request asks to align with an upstream ref or version.

Do **not** run on routine project work. This skill is coordinator-maintenance, equivalent to `dude-lint` in scope and authority.

## Inputs

Accepted invocation forms:

- `@dude upgrade` — fetch the upstream ref recorded in the manifest and apply after confirmation.
- `@dude upgrade --dry-run` — produce the upgrade report only, write nothing.
- `@dude upgrade --ref <branch|tag|sha>` — override the manifest-pinned ref.
- `@dude upgrade --source <url-or-local-path>` — override the source repo for this run.
- `@dude upgrade --rollback` — restore from the most recent pre-upgrade safety tag.

### Release channel

The manifest `source_ref` is an upgrade channel. For remote sources, released bundles use the sentinel `latest`, which resolves to the newest **stable** `vX.Y.Z` tag (pre-releases like `v1.0.0-rc1` are ignored) on every run. A concrete `vX.Y.Z` pins to one release, and a branch name such as `main` tracks that branch's HEAD. A local-path source must use an explicit branch or tag; `latest` is rejected with that guidance. Use `--ref` to override the channel for a single run. When a remote `latest` channel has no release tags, `status` reports "no releases published yet" and `plan` declines with nothing to do.

## Script Contract

The `upgrade.mjs` engine handles fetch, classification, validation, and reporting. The LLM never re-derives this work. It runs on Node (>= 20 LTS) and shares the namespace/ownership classifier in `.github/skills/dude-engine/lib/ownership.mjs` with `dude-lint`. `plan` emits a canonical schema-v1 authorization envelope; `apply` validates that exact envelope and executes its persisted buckets without reclassification.

### Subcommands

| Subcommand | Purpose | Writes? |
|---|---|---|
| `status`   | Compare local manifest against upstream manifest. Cheap availability check. | No |
| `plan`     | Fetch full upstream tree, classify every file, persist a plan JSON for apply. | No (cache only) |
| `apply`    | Apply a persisted plan: safety tag + branch, file ops, manifest rewrite, log append, lint, commit. | Yes |
| `rollback` | `git reset --hard` to the most recent (or named) `dude-pre-upgrade-*` safety tag, append rollback log entry, lint. | Yes |
| `help`     | Print usage. | No |

Invocation (Node >= 20 LTS):

```bash
node .github/skills/dude-bundle-upgrade/upgrade.mjs status   --format json
node .github/skills/dude-bundle-upgrade/upgrade.mjs plan     --format json [--ref <r>] [--source <s>] [--out <path>]
node .github/skills/dude-bundle-upgrade/upgrade.mjs apply    --plan <id|path> --confirm confirm-upgrade \
  [--skip-removals] [--format text|json]
node .github/skills/dude-bundle-upgrade/upgrade.mjs rollback [--tag <name>] [--format text|json]
```

`apply` does not push or merge. It leaves the upgrade commit on a local `chore/dude-upgrade-<short-sha>` branch for the user to review and merge themselves. The `--confirm` value is the literal token `confirm-upgrade`; the LLM maps the user-facing phrase `confirm upgrade [skip-removals]` into the corresponding flag combination.

### Exit Codes

| Code | Meaning |
|---|---|
| 0 | up-to-date, informational output, successful apply, or successful rollback |
| 10 | plan ready, changes detected |
| 40 | invalid input, malformed manifest, unreachable upstream, or post-apply lint failure |

### JSON Shapes

`status` JSON:

```json
{
  "status": "up_to_date|upgrade_available|offline|error",
  "source": "<url-or-path>",
  "ref": "<latest|tag|branch>",
  "installed_ref": "<tag-or-branch-or-empty>",
  "upstream_ref": "<tag-or-empty>",
  "detail": "<reason-when-offline-or-error>"
}
```

`status` compares the locally recorded `installed_ref` against the selected remote release or literal ref. For a remote `latest` channel it lists release tags with `git ls-remote --tags <source>` and picks the highest stable `vX.Y.Z`; a pinned tag or branch is compared by name. Local paths reject `latest` and require an explicit branch or tag. The status command does not classify file deltas; run `plan` for the full per-file picture.

`plan` JSON:

```json
{
  "kind": "dude-upgrade-plan",
  "schema_version": 1,
  "plan_id": "<ts>-<from>-<to>-<random-suffix>",
  "created_at": "<iso-8601>",
  "ttl_warn_at": "<created+1h>",
  "ttl_expire_at": "<created+24h>",
  "scope": {
    "identity_scope": "same-host-filesystem",
    "workspace_path": "<absolute-path>",
    "workspace_realpath": "<absolute-realpath>",
    "workspace_identity": { "device": "<decimal>", "inode": "<decimal>" }
  },
  "source": {
    "type": "local-path|git-remote",
    "location": "<selected-source>",
    "identity": "<source-realpath-or-remote-origin>",
    "requested_ref": "<requested-ref>",
    "resolved_ref": "<resolved-ref>",
    "resolved_commit": "<git-commit>"
  },
  "from_ref": "...", "to_ref": "...",
  "cache": {
    "root_path": "<absolute-path>",
    "root_realpath": "<absolute-realpath>",
    "root_identity": { "device": "<decimal>", "inode": "<decimal>" },
    "manifest": { "path": ".dude/metadata/bundle-manifest.md", "type": "file", "sha256": "<sha256>" },
    "inventory": [{ "path": "<core-path>", "type": "file", "sha256": "<sha256>" }]
  },
  "local": {
    "manifest": { "path": ".dude/metadata/bundle-manifest.md", "state": "<expected-state>", "data": "<exact-values>" },
    "upgrade_log": { "path": ".dude/metadata/upgrade-log.md", "state": "<expected-state>" },
    "core_inventory": [{ "path": "<core-path>", "state": "<expected-state>" }]
  },
  "summary": {
    "replace": N, "add": N, "remove": N,
    "advisory": N, "up_to_date": N
  },
  "buckets": {
    "replace":  [{"path","added_lines","removed_lines"}],
    "add":      [{"path"}],
    "remove":   [{"path"}],
    "advisory": [{"path","kind"}],
    "up_to_date": [{"path"}]
  },
  "digest": "<sha256-of-all-fields-except-digest>"
}
```

An expected mutation state is either `{ "type": "missing" }` or a regular-file record containing its SHA-256. All operation and inventory arrays use canonical code-unit path ordering.

Plans are persisted to `$TMPDIR/dude-upgrade-cache/plans/<plan_id>.json` so a later `apply` can validate the exact reviewed state. Plan IDs include a cryptographically random suffix, and persistence uses exclusive creation with bounded collision retries; existing plan bytes are never overwritten. `--out` is also exclusive and refuses an existing destination. Plans carry a TTL (`ttl_warn_at` at +1h, `ttl_expire_at` at +24h); `apply` refuses an expired plan and requires a fresh `plan` invocation. Older plan schemas are unsupported and must be recreated with the current engine.

## Workflow

### Step 1 — Status (script)

Run `upgrade.mjs status --format json` and parse the result. If `status` is `up_to_date`, report and stop. If `offline`, report and offer the user a re-try. Otherwise continue to Step 2.

### Step 2 — Plan (script)

Run `upgrade.mjs plan --format json` (pass `--ref` / `--source` if the user provided overrides). Read the persisted plan from `plans/<plan_id>.json` so subsequent steps reference the same plan_id.

Summarize the plan for the user using the `summary` counts plus a short bulleted list per non-empty bucket. Show file paths. For `replace` entries, include `[+a / -b]` line stats from `added_lines` / `removed_lines`.

An empty file-operation summary is a true no-op only when the planned `source_repo`, `source_ref`, and `installed_ref` values already equal the current manifest values. When those values differ, `plan` exits 10 and `apply` performs the reviewed metadata manifest, log, branch, and commit transition even though Add/Replace/Remove are empty. A true no-op apply still requires confirmation and validates all reviewed evidence; it returns without creating a safety tag, branch, log entry, manifest write, or target write.

If `--dry-run`, stop here.

### Step 3 — Confirmation gate

Wait for one of:

- `confirm upgrade` — proceed with all Replace, Add, and Remove operations.
- `confirm upgrade skip-removals` — apply Replace and Add entries but leave Remove items in place; report them as deferred.
- `cancel` — stop, write nothing.

Plain "yes" / "ok" / "go" do not satisfy the gate.

Before confirming, surface a single warning summarizing local edits that will be discarded. Compare each Replace/Remove path against its fetched upstream copy: anything that differs is local divergence about to be overwritten. The user should either rename those files to `dude-local-<slug>` first or accept the loss.

### Step 4 — Apply (script)

The script does the entire write phase in one invocation. Translate the user's confirmation phrase into flags and run:

```bash
node .github/skills/dude-bundle-upgrade/upgrade.mjs apply \
    --plan <plan_id-or-path> --confirm confirm-upgrade \
  [--skip-removals] \
    [--format text|json]
```

Mapping from user-facing phrase to flags:

| User phrase | Flags |
|---|---|
| `confirm upgrade` | `--confirm confirm-upgrade` |
| `confirm upgrade skip-removals` | `--confirm confirm-upgrade --skip-removals` |

In one pass the script:

1. Requires the literal confirmation token, then validates canonical serialization, schema version, digest, timestamps, and expiry.
2. Requires a clean Git working tree. It validates workspace identity, every path, the exact local manifest bytes and values, the reviewed upgrade-log state, each local core path's expected SHA-256 or missing state, source identity, requested/resolved ref and concrete commit, cache identity, upstream manifest bytes, and every cached core path/type/SHA-256 before the first tag, branch, checkout, log, manifest, or content mutation. Literal refs must resolve exactly; remote `latest` must resolve to the recorded stable tag; local-path `latest` is unsupported.
3. Retains the validated cached Add/Replace bytes and consumes the persisted Add, Replace, and Remove buckets directly. It never calls classification during apply. `--skip-removals` defers only the persisted Remove bucket, which is still fully validated.
4. Creates safety tag `dude-pre-upgrade-<YYYYMMDD-HHMMSS>` at current HEAD and switches to branch `chore/dude-upgrade-<to-ref>` (timestamp suffix on collision). Git hooks are disabled only for this upgrade-owned branch checkout and the final upgrade commit.
5. Applies file ops: Add (copy in), Replace (overwrite), Remove (delete unless `--skip-removals`).
6. Rewrites the fenced JSON block in `.dude/metadata/bundle-manifest.md`, preserving the surrounding markdown. Updates `source_repo`, `source_ref`, and `installed_ref`. The manifest is metadata only — there is no `files` array to refresh.
7. Appends a structured entry to `.dude/metadata/upgrade-log.md` matching its Entry shape.
8. Runs `node .github/skills/dude-lint/lint.mjs` and patches the lint result into the just-written log entry.
9. Stages the persisted operation paths actually written plus manifest/log, excludes skipped removals, and commits with message `chore: upgrade Dude bundle to <to-ref>`. It does not push, merge, or modify remote state.

If an ordinary operation fails after mutation begins, report the failure and the created safety tag and upgrade branch. Recovery relies on those Git boundaries; the workflow does not promise byte-perfect restoration of arbitrary working-tree state.

On `lint = [FAIL]` the script exits 40 and prints the suggested `rollback --tag <safety_tag>` command.

### Step 5 — Surface the result

Relay the apply output to the user:

- `from <ref> → to <ref>`
- per-bucket counts (replaced, added, removed, removals deferred)
- safety tag and upgrade branch names
- lint result
- the suggested review command (`git diff <target-branch>...<upgrade-branch>`) plus a reminder that merge is a manual user step
- any new upstream agent or skill the user may want to enable

## Rollback

`@dude upgrade --rollback` maps to:

```bash
node .github/skills/dude-bundle-upgrade/upgrade.mjs rollback [--tag <name>] [--format text|json]
```

The script:

1. Refuses a dirty working tree.
2. Selects the most recent `dude-pre-upgrade-*` tag (or the one passed via `--tag`).
3. Runs `git reset --hard <tag>` on the current branch.
4. Appends a rollback entry to `upgrade-log.md` (left uncommitted; the user decides whether to commit or discard it).
5. Runs `dude-lint` and reports the restored sha plus the lint result.

The **already-merged** path (creating a rollback commit on the target branch by restoring base-owned files from the safety tag, rather than force-pushing) is not yet automated. For now: invoke `rollback` from a fresh branch off the target, then merge that rollback branch via a normal PR. Force-push is never used.

## Reserved Project Namespace

Project-local agents and skills should use the reserved `dude-local-` namespace:

- agents: `.github/agents/dude-local-<slug>.agent.md`
- skills: `.github/skills/dude-local-<slug>/SKILL.md`

Upstream/base Dude artifacts must never use `dude-local-` names. The upgrade engine treats any path whose name matches `dude-local-*` as project-owned and excludes it from base ownership.

The namespace is the **primary** safety mechanism for keeping project work across upgrades. If you fork a base agent or skill by copying it under `dude-local-<slug>`, your copy is project-owned and is never touched by upgrade. Editing the original base file is unsupported and your changes will be lost on the next upgrade.

Unprefixed user-created artifacts (an agent file or top-level skill directory that is neither `dude.agent.md` nor matches `dude-<slug>` / `dude-local-<slug>`) surface as `advisory` entries in the plan and are still preserved. Rename them into `dude-local-` when practical.

## File Classification (reference)

The script classifies every base-owned file into one of the buckets below. Base ownership is derived from the **namespace convention** (see [Manifest Shape](#manifest-shape) for the full pattern list) — the engine enumerates the live tree under each side and treats agents named `dude.agent.md` or `dude-<slug>.agent.md`, skill directories named `dude-<slug>/**`, and the bundle instructions file `dude.instructions.md` as base-owned, with the reserved `dude-local-<slug>` namespace explicitly excluded. There is no manifest `files` array; the manifest is metadata only.

Classification is done by **byte comparison** of local disk content vs the fetched upstream tree.

| Bucket | Behavior |
|---|---|
| Replace | Base path on both sides; local on-disk bytes differ from upstream. Overwrite local with upstream. Any local edits are discarded. |
| Add | Base path only in the upstream tree. Copy upstream in. |
| Remove | Base path only in the local tree (upstream dropped it). Delete local file (unless `--skip-removals`). |
| Advisory | Project-owned agent or skill outside both the base and `dude-local-` namespaces. Preserved; flagged for rename. |
| Up to date | Base path on both sides; bytes match. Skip silently. |

## Boundaries

- Never auto-push, auto-merge, or modify remote state. The upgrade branch is the deliverable; merging is a user action.
- Never delete or modify `.dude/` project state except the upgrade-owned `.dude/metadata/bundle-manifest.md` and `.dude/metadata/upgrade-log.md`. All project-specific ideas under `.dude/ideas/` are preserved through every upgrade.
- Never delete or modify `.github/skills/project/`.
- Never modify `.github/copilot-instructions.md`.
- Never touch `.dude/ideas/`, `.dude/specs/`, `.dude/memory/`, `.dude/state/`, Beads, or product source.
- Never apply or roll back on a dirty working tree. Commit or stash changes first.
- Path containment and symbolic-link checks assume a locally controlled workspace without concurrent hostile mutation. They detect observed drift but do not claim race-free protection from adversarial transient replacement.
- Never proceed past the confirmation gate without an explicit confirmation token.
- Never recurse into transitive bundle composition (one upgrade pulls one upstream bundle).

## Pre-flight Requirements

The script enforces these; the LLM does not need to re-check:

- `git` is installed and the project root is inside a git working tree. The upgrade workflow uses git for safety tags, branches, rollback, and pre-overwrite drift detection; non-git projects must run `git init` before upgrading.
- `.dude/metadata/bundle-manifest.md` is the sole manifest; it exists locally, parses, and uses the exact metadata shape (`source_repo`, `source_ref`, `installed_ref`).
- Upstream tree must contain `.github/agents/`, `.github/skills/dude-lint/`, `.github/instructions/dude.instructions.md`, and `.dude/metadata/bundle-manifest.md`. No old-path fallback is accepted.
- Upstream manifest must use the same exact metadata shape.

For local-path upstream sources, the source directory must carry its own canonical seeded `bundle-manifest.md`, be a git repo, and use an explicit branch or tag. Local `latest` and local sources without canonical seeded metadata are refused.

This is forward-only. A pre-`.dude` upgrader cannot consume a current release
directly. Recovery is to install or copy a current bundle engine, or reinstall
the current bundle while preserving project data. Older project state requires
external or manual recovery; there is no in-bundle migration workflow.

## Manifest Shape

`.dude/metadata/bundle-manifest.md` contains a single fenced JSON block. The manifest is **metadata only**: it carries the upstream source pin and the installed version, and nothing else.

```json
{
  "source_repo": "https://github.com/<owner>/<repo>",
  "source_ref": "latest",
  "installed_ref": "<tag-or-branch>"
}
```

Base ownership is derived from the **namespace convention** by the engine on each run:

```text
.github/agents/dude.agent.md
.github/agents/dude-<slug>.agent.md         # <slug> must NOT start with "local-"
.github/skills/dude-<slug>/**               # <slug> must NOT start with "local-"
.github/instructions/dude.instructions.md
```

Anything else is project-owned and never touched by upgrade. The reserved `dude-local-<slug>` namespace is explicitly project-owned and excluded from base enumeration.
