---
name: "dude-bundle-upgrade"
description: "Use when the user wants to upgrade the Dude bundle itself, pull the newest core bundle from its source repo, refresh shipped agents/skills/instructions/runtime while preserving project memory and active work, refresh all installed packs after an upgrade, or roll back a recent upgrade. Triggers: @dude upgrade, @dude upgrade --all, @dude upgrade --dry-run, @dude upgrade --rollback, upgrade dude, update dude bundle, pull latest dude. Do NOT use for a standalone optional-pack install, removal, refresh, or refresh preview (dude-compose), or importing a single external agent or skill (dude-bundle-import)."
---

# Bundle Upgrade

Pull the newest core Dude bundle from its source repo and reconcile only the
core-owned paths listed below. The core phase preserves project-local ideas,
definition specs, memory, execution state, project skills, project-custom
agents and skills, other extension trees, `.github/copilot-instructions.md`,
root files, repository docs, and Beads. With the explicit `--all` option, a
later pack phase refreshes only packs already recorded as installed. Only the
exceptions named in [Boundaries](#boundaries) may change.

Upgrades are preview-then-confirm. The `upgrade.mjs` script handles status, plan, core apply, post-core pack work, and rollback; the LLM orchestrates the conversation, surfaces the report, and translates confirmation phrases into apply invocations. Nothing is written to the working tree before the user confirms the reviewed core plan.

> **Core files are upstream-owned.** A core upgrade reconciles exactly these
> categories:
>
> - canonical default agents at `.github/agents/dude.agent.md` and
>   `.github/agents/dude-<slug>.agent.md`, excluding `dude-local-*` and
>   `dude-pack-*` agents;
> - canonical core Dude skill directories named `dude-<slug>` directly under
>   `.github/skills/`, excluding `dude-local-*`, `dude-pack-*`, and
>   `.github/skills/project/**`;
> - `.github/instructions/dude.instructions.md`; and
> - the exact deployed runtime tree `.github/extensions/dude/**`.
>
> Apply may add, replace, or remove files in those categories. The runtime path
> above is the only core-owned extension tree. Siblings and near matches such as
> `.github/extensions/dude-preview/**`, `.github/extensions/dude-local/**`, and
> every other named extension tree are project-owned and preserved.
> `src/extensions/dude/**` remains project-owned source content and is not a
> deployed core target.
>
> Editing a core path in place is unsupported because apply can discard the
> edit. Copy a default agent or skill under the reserved
> `dude-local-<slug>` agent or skill namespace for customization. That
> convention is not an extension-runtime override: do not edit
> `.github/extensions/dude/**` in place or copy it under a `dude-local-`
> extension name as a persistent customization. See
> [Reserved Project Namespace](#reserved-project-namespace).

## Purpose

Make engine updates routine, safe, and reversible. The user runs `@dude upgrade` and gets a clear core report. After `confirm upgrade`, Dude applies, verifies, and commits the core update on a safety branch. `@dude upgrade --all` then offers a separate installed-pack refresh. Publish (merge + push) is a deliberate opt-in step, not automatic.

## When To Run

- User asks to upgrade, update, refresh, or pull the latest Dude bundle.
- User requests an upgrade preview or a complete same-ref byte check or repair.
- A coordinator-maintenance request asks to align with an upstream ref or version.

Do **not** run on routine project work. This skill is coordinator-maintenance, equivalent to `dude-lint` in scope and authority.

## Inputs

Accepted invocation forms:

- `@dude upgrade` — fetch the upstream ref recorded in the manifest, verify its
  complete current core inventory even when the installed ref already matches,
  and apply any reviewed changes after confirmation.
- `@dude upgrade --all` — complete the reviewed core upgrade, then preview and optionally refresh every installed pack.
- `@dude upgrade --dry-run` — produce the upgrade report only, write nothing.
- `@dude upgrade --all --dry-run` — produce only the ordinary reviewed core report; authoritative pack preview requires the applied upgraded engine.
- `@dude upgrade --ref <branch|tag|sha>` — override the manifest-pinned ref.
- `@dude upgrade --source <url-or-local-path>` — override the source repo for this run.
- `@dude upgrade --rollback` — restore from the most recent pre-upgrade safety tag.

Plain upgrade stays core-only. `--all` does not add a user-facing status mode,
change rollback, or alter `--ref`, `--source`, or `--skip-removals` behavior for
the core phase.

### Release channel

The manifest `source_ref` is an upgrade channel. For remote sources, released bundles use the sentinel `latest`, which resolves to the newest **stable** `vX.Y.Z` tag (pre-releases like `v1.0.0-rc1` are ignored) on every run. A concrete `vX.Y.Z` pins to one release, and a branch name such as `main` tracks that branch's HEAD. A local-path source must use an explicit branch or tag; `latest` is rejected with that guidance. Use `--ref` to override the channel for a single run. When a remote `latest` channel has no release tags, the upgrade workflow's `upgrade.mjs status` phase reports "no releases published yet" and stops before `plan`.

## Script Contract

The `upgrade.mjs` engine handles fetch, classification, validation, and reporting. The LLM never re-derives this work. It runs on Node (>= 20 LTS) and shares the namespace/ownership classifier in `.github/skills/dude-engine/lib/ownership.mjs` with `dude-lint`. `plan` emits a canonical schema-v1 authorization envelope; `apply` validates that exact envelope and executes its persisted buckets without reclassification.

Here, `status` means the upgrade workflow's internal `upgrade.mjs status`
phase. It is distinct from global `@dude status`, the read-only workflow
lane-orientation command; global status does not check upgrade availability.

### Subcommands

| Subcommand | Purpose | Writes? |
|---|---|---|
| `status`   | Compare local and candidate refs for orientation; do not inspect file bytes. | No |
| `plan`     | Fetch the full upstream tree, compare the complete core inventory and bytes, and persist a plan JSON for apply. | No (cache only) |
| `apply`    | Apply a persisted plan: safety tag + branch, file ops, manifest rewrite, log append, lint, commit. | Yes |
| `packs-preview` | Preview installed-pack refreshes after the matching core commit. | No |
| `packs-apply` | Refresh previewed installed packs after separate confirmation. | Yes |
| `rollback` | `git reset --hard` to the most recent (or named) `dude-pre-upgrade-*` safety tag, append rollback log entry, lint. | Yes |
| `help`     | Print usage. | No |

Invocation (Node >= 20 LTS):

```bash
node .github/skills/dude-bundle-upgrade/upgrade.mjs status   --format json
node .github/skills/dude-bundle-upgrade/upgrade.mjs plan     --format json [--ref <r>] [--source <s>] [--out <path>]
node .github/skills/dude-bundle-upgrade/upgrade.mjs apply    --plan <id|path> --confirm confirm-upgrade \
  [--skip-removals] [--format text|json]
node .github/skills/dude-bundle-upgrade/upgrade.mjs packs-preview --plan <id|path> [--format text|json]
node .github/skills/dude-bundle-upgrade/upgrade.mjs packs-apply --plan <id|path> --confirm confirm-packs \
  [--format text|json]
node .github/skills/dude-bundle-upgrade/upgrade.mjs rollback [--tag <name>] [--format text|json]
```

`apply` does not push or merge. It leaves the upgrade commit on a local `chore/dude-upgrade-<short-sha>` branch for the user to review and merge themselves. The `--confirm` value is the literal token `confirm-upgrade`; the LLM maps the user-facing phrase `confirm upgrade [skip-removals]` into the corresponding flag combination. For the separate pack phase, only `confirm packs` maps to `--confirm confirm-packs`.

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

`upgrade.mjs status` compares the locally recorded `installed_ref` against the
selected remote release or literal ref. For a remote `latest` channel it lists
release tags with `git ls-remote --tags <source>` and picks the highest stable
`vX.Y.Z`; a pinned tag or branch is compared by name. Local paths reject
`latest` and require an explicit branch or tag. This phase may report
`up_to_date` when core bytes are missing or different, so matching refs are not
byte-completeness proof. `plan` is authoritative for the complete core
inventory and per-file bytes. Matching refs can still produce Add, Replace, or
Remove operations.

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

### Step 1 — Ref orientation (`upgrade.mjs status`)

Run `upgrade.mjs status --format json` and parse the result. On `error`, report
the detail and stop. If `offline`, report and offer the user a re-try. If
it reports `no releases published yet`, report that result and stop. Otherwise,
continue to Step 2 even when the result is `up_to_date`: this phase compares
release refs only, and a matching ref is not byte-completeness evidence.

### Step 2 — Plan (script)

Run `upgrade.mjs plan --format json` (pass `--ref` / `--source` if the user
provided overrides). This full byte comparison is authoritative even when
the internal status phase reported `up_to_date`. Read the persisted plan from
`plans/<plan_id>.json` so subsequent steps reference the same plan_id.

Summarize the plan for the user using the `summary` counts plus a short bulleted list per non-empty bucket. Show file paths. For `replace` entries, include `[+a / -b]` line stats from `added_lines` / `removed_lines`.

An empty file-operation summary is a true no-op only when the planned
`source_repo`, `source_ref`, and `installed_ref` values already equal the
current manifest values. When those values differ, `plan` exits 10 and `apply`
performs the reviewed metadata manifest, log, branch, and commit transition
even though Add/Replace/Remove are empty. When both operations and metadata are
unchanged, report that the exact current core is installed and stop without an
apply. If a true no-op apply is invoked directly, it still requires confirmation
and validates all reviewed evidence; it returns without creating a safety tag,
branch, log entry, manifest write, or target write.

A same-ref plan may legitimately find Add, Replace, or Remove operations. This
is the supported repair and forward-bootstrap path. In particular, a consumer
whose older installed ownership engine could not enumerate a core path category
introduced by the candidate may finish its first reviewed apply with matching
refs but incomplete bytes. The safe historical workflow is an explicit second
`@dude upgrade`: the newly installed procedure continues past matching-ref
status, creates and displays a fresh exact plan, and requires a fresh `confirm
upgrade` before applying it. Never call an internal planner as a hidden
follow-up, reuse the first persisted plan, or auto-apply the second plan.

If `--dry-run`, stop here. With `--all`, explain that no authoritative pack
preview exists yet because it must be prepared by the upgraded engine after the
core commit; do not render a speculative pack plan.

### Step 3 — Confirmation gate

Wait for one of:

- `confirm upgrade` — proceed with all Replace, Add, and Remove operations.
- `confirm upgrade skip-removals` — apply Replace and Add entries but leave Remove items in place; report them as deferred.
- `cancel` — stop, write nothing.

Plain "yes" / "ok" / "go" do not satisfy the gate.

Before confirming, surface a single warning summarizing local edits that will
be discarded. Compare each Replace/Remove path against its fetched upstream
copy: anything that differs is local divergence about to be overwritten. A
default agent or skill customization can be copied to its corresponding
`dude-local-<slug>` agent or skill path. Do not present that namespace as a
home for executable extension runtime; edits under `.github/extensions/dude/**`
must instead be accepted as replaceable or removed before upgrade.

### Step 4 — Apply (script)

The script does the core write phase in one invocation. Translate the user's confirmation phrase into flags and run:

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

### Step 5 — Surface the core result

Relay the apply output to the user:

- `from <ref> → to <ref>`
- per-bucket counts (replaced, added, removed, removals deferred)
- safety tag and upgrade branch names
- lint result
- the suggested review command (`git diff <target-branch>...<upgrade-branch>`) plus a reminder that merge is a manual user step
- any new upstream agent or skill the user may want to enable

For plain upgrade, stop here. For `--all`, continue only after a successful,
committed core apply. The core commit is the first transaction boundary.

### Step 6 — Preview installed packs (`--all` only)

Run:

```bash
node .github/skills/dude-bundle-upgrade/upgrade.mjs packs-preview \
  --plan <plan_id-or-path> --format json
```

This command requires the matching committed core result, upgrade branch, and a
clean tree before it dynamically loads Compose from the upgraded installation.
It reads only the canonical installed-pack map, in sorted order. It never
scans the catalog to add membership and never installs or enables a pack.

For each installed pack, show the Compose preview's replacements, additions,
and removals. Compose retains local target precedence. When a target is absent
locally, remote preview uses the exact `resolved_commit` selected by the
reviewed core plan, rather than resolving its source ref again. This also lets
an installed remote pack refresh from a released bundle without `library/`.

If no packs are installed, report a core-only completion. Request no pack
confirmation, make no pack commit, and leave the committed branch clean.

### Step 7 — Pack confirmation and apply (`--all` only)

After showing the complete post-core preview, wait for `confirm packs`. Map
only that phrase to `--confirm confirm-packs`:

```bash
node .github/skills/dude-bundle-upgrade/upgrade.mjs packs-apply \
  --plan <plan_id-or-path> --confirm confirm-packs --format json
```

Plain "yes", "ok", and "go" do not authorize pack mutation. If the user
declines or does not provide `confirm packs`, do not invoke pack apply; retain
the committed core result and clean branch.

Pack apply repeats the committed-core and clean-tree checks, reads the sorted
installed map again, and uses the same local-precedence and exact-remote-
revision rules as preview. Each pack refresh keeps Compose's own
all-or-restored transaction. Process packs sequentially and stop on the first
refusal. Report successful packs, the failed pack and reason, and every later
pack as not attempted.

After all packs succeed or processing stops at the first refusal, lint once.
If successful refreshes have a net change, create at most one hook-disabled
aggregate pack commit for their reported pack paths and the profile. Do not
create an empty commit. Before a successful or partial-failure result, verify
the upgrade branch is clean and report the core commit, pack commit or `none`,
lint result, safety tag, review command, and rollback command. A lint, staging,
or commit failure is an operational failure: report the actual branch state and
recovery command without claiming a clean or successful result.

Core and pack work are separate transaction boundaries. A pack refusal does not
roll back the committed core or earlier successful packs, and the workflow makes
no global atomicity claim.

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

The **already-merged** path (creating a rollback commit on the target branch by restoring core-owned files from the safety tag, rather than force-pushing) is not yet automated. For now: invoke `rollback` from a fresh branch off the target, then merge that rollback branch via a normal PR. Force-push is never used.

For `--all`, the same pre-core safety tag remains the rollback boundary for the
core commit and any aggregate pack commit. There is no pack-only or alternate
rollback mode.

## Reserved Project Namespace

Project-local agents and skills should use the reserved `dude-local-` namespace:

- agents: `.github/agents/dude-local-<slug>.agent.md`
- skills: `.github/skills/dude-local-<slug>/SKILL.md`

Upstream core agents and skills must never use `dude-local-` names. The upgrade
engine treats agent and skill names matching `dude-local-*` as project-owned
and excludes them from core ownership.

The namespace is the **primary** safety mechanism for keeping project agent and
skill work across upgrades. If you fork a core agent or skill by copying it
under `dude-local-<slug>`, your copy is project-owned and is never touched by
upgrade. Editing the original core file is unsupported and your changes will be
lost on the next upgrade. This convention does not define an extension-runtime
fork or override.

Unprefixed user-created agents and top-level skill directories outside the
canonical core, pack, and `dude-local-` names surface as `advisory` entries in
the plan and are still preserved. Rename them into `dude-local-` when
practical.

## Ownership Boundary For Generated Agent Profiles

Each core agent source has one generated destination:
`.github/agents/<stem>.agent.md`. The path is core-owned when its stem is
`dude` or `dude-<slug>`. A `dude-pack-<pack>-<slug>` profile is pack-owned, a
`dude-local-<slug>` profile is project-owned, and any other stem is preserved as
project content.

Upgrade copies upstream core bytes. It does not project or repair installed pack
profiles. A pack source or model mapping change reaches an installed pack only
through `compose refresh <pack>`. That refresh reprojects replaceable pack output
and can overwrite edits; keep persistent customizations under `dude-local-*`.

The existing `.github/skills/dude-engine/**` ownership recursively includes
`.github/skills/dude-engine/config/agent-models.json` and the loader. This lets
an older installed upgrader bootstrap the current engine without a new
ownership rule.

The source repository authors that configuration at
`src/config/agent-models.json`. Development and release builds validate it
before changing output and package the same bytes under the engine skill.

Before any write, `apply` checks every planned destination for rollback
restorability. An ignored, untracked destination that Git could not restore is
refused by its actual path. Track or un-ignore the destination, then create a
fresh plan.

## File Classification (reference)

The script classifies every core-owned file into one of the buckets below. The
engine derives the set from the local and upstream trees: canonical
`.github/agents/dude.agent.md` and
`.github/agents/dude-<slug>.agent.md` agents, canonical
`dude-<slug>` skill directories directly under `.github/skills/`, the exact
`.github/instructions/dude.instructions.md` file, and the exact deployed
`.github/extensions/dude/**` tree. Agent and skill names in the
`dude-local-*` and `dude-pack-*` tiers are excluded, as is the `project` skill.
No other extension tree is included. There is no manifest `files` array; the
manifest is metadata only.

Classification is done by **byte comparison** of local disk content vs the fetched upstream tree.

| Bucket | Behavior |
|---|---|
| Replace | Core path on both sides; local on-disk bytes differ from upstream. Overwrite local with upstream. Any local edits are discarded. |
| Add | Core path only in the upstream tree. Copy upstream in. |
| Remove | Core path only in the local tree (upstream dropped it). Delete local file (unless `--skip-removals`). |
| Advisory | Project-owned agent or skill outside the canonical core, pack, and local names. Preserved; flagged. |
| Up to date | Core path on both sides; bytes match. Skip silently. |

## Boundaries

- Never auto-push, auto-merge, or modify remote state. The upgrade branch is the deliverable; merging is a user action.
- Never project or repair an agent profile. Upgrade copies upstream bytes for core paths; installed pack profiles refresh only through `compose refresh <pack>`.
- With `--all`, after the core commit, orchestrate that same canonical Compose
  refresh path only for profile-installed packs; retain local target precedence,
  never install or enable a pack, and keep core and pack work as separate
  transaction boundaries.
- A core-only upgrade never deletes or modifies `.dude/` project state except
  the upgrade-owned `.dude/metadata/bundle-manifest.md` and
  `.dude/metadata/upgrade-log.md`. The explicit `--all` phase may update the
  profile and artifacts of packs already recorded as installed through Compose.
  That profile remains the only pack authority; the phase never installs or
  enables a pack. All project-specific ideas under `.dude/ideas/` are
  preserved through every upgrade.
- Never delete or modify `.github/skills/project/`.
- Never modify `.github/copilot-instructions.md`.
- Never modify an extension tree other than the exact core-owned
  `.github/extensions/dude/**` tree.
- Never touch `.dude/ideas/`, `.dude/specs/`, `.dude/memory/`, `.dude/state/`, Beads, or product source.
- Never apply or roll back on a dirty working tree. Commit or stash changes first.
- Path containment and symbolic-link checks assume a locally controlled workspace without concurrent hostile mutation. They detect observed drift but do not claim race-free protection from adversarial transient replacement.
- Never proceed past the confirmation gate without an explicit confirmation token.
- Never treat core and pack work as one globally atomic transaction.
- Never recurse into transitive bundle composition (one upgrade pulls one upstream bundle).

## Pre-flight Requirements

The script enforces these; the LLM does not need to re-check:

- `git` is installed and the project root is inside a git working tree. The upgrade workflow uses git for safety tags, branches, rollback, and pre-overwrite drift detection; non-git projects must run `git init` before upgrading.
- `.dude/metadata/bundle-manifest.md` is the sole manifest; it exists locally, parses, and uses the exact metadata shape (`source_repo`, `source_ref`, `installed_ref`).
- Upstream tree must contain `.github/agents/`, `.github/skills/dude-lint/`, `.github/instructions/dude.instructions.md`, and `.dude/metadata/bundle-manifest.md`.
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

The manifest does not register file ownership. On each run, the engine derives
the exact core set from these categories:

```text
.github/agents/dude.agent.md
.github/agents/dude-<slug>.agent.md         # excludes dude-local-* and dude-pack-*
.github/skills/dude-<slug>/**               # excludes dude-local-*, dude-pack-*, and project
.github/instructions/dude.instructions.md
.github/extensions/dude/**
```

Only that exact extension tree is core-owned; sibling, near-match, and other
named extension trees are project-owned and preserved. The agent and skill
`dude-local-*` tier is project-owned, the `dude-pack-*` tier remains
pack-owned, and the `project` skill is project-owned. The engine enumerates
these paths from the live trees; the metadata-only manifest never carries a
`files` array.
