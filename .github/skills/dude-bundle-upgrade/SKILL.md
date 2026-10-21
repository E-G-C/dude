---
name: "dude-bundle-upgrade"
description: "Use when the user wants to upgrade the Dude bundle itself, check whether a newer Dude release exists, pull the newest core bundle from its source repo, refresh shipped agents/skills/instructions/runtime while preserving project memory and active work, or refresh installed out-of-the-box packs with the same update. Triggers: @dude upgrade, @dude upgrade --all, @dude upgrade --dry-run, upgrade dude, update dude bundle, pull latest dude. Do NOT use for a standalone optional-pack install, removal, refresh, or refresh preview (dude-compose), or importing a single external agent or skill (dude-bundle-import)."
---

# Bundle Upgrade

Update the installed Dude bundle to one exact release from its source repo,
in place on the current branch. The engine prepares every changed byte first,
shows the actual file differences, and writes exactly that prepared result
after the literal `confirm upgrade`. The changes stay uncommitted on the
current branch for the user to review and commit. Project-local ideas,
definition specs, memory, execution state, project skills, project-custom
agents and skills, other extension trees, `.github/copilot-instructions.md`,
root files, repository docs, and Beads are preserved. Only the exceptions
named in [Boundaries](#boundaries) may change.

The `upgrade.mjs` script checks, prepares, applies, and discards; the LLM
orchestrates the conversation, relays the report, and maps the user's
confirmation phrase to the apply flag. Nothing in the project is written before
the user confirms one prepared result.

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
> Editing a core path in place is unsupported because apply can replace the
> edit, and Git cannot recover pre-existing uncommitted edits that an update
> overwrites. Copy a default agent or skill under the reserved
> `dude-local-<slug>` agent or skill namespace for customization. That
> convention is not an extension-runtime override: do not edit
> `.github/extensions/dude/**` in place or copy it under a `dude-local-`
> extension name as a persistent customization. See
> [Reserved Project Namespace](#reserved-project-namespace).

## Purpose

Make engine updates routine and predictable. The user runs `@dude upgrade`,
reads one report of the actual file changes, and confirms once. Dude writes
those bytes as one all-or-restored batch, leaves them uncommitted on the
current branch, and asks the user to start a new session so the updated agents,
skills, and Canvas load. Committing, pushing, and merging remain the user's
decisions.

## When To Run

- User asks to upgrade, update, refresh, or pull the latest Dude bundle.
- User asks whether a newer Dude release is available.
- User requests an upgrade preview or a complete same-ref byte check or repair.
- A coordinator-maintenance request asks to align with an upstream ref or version.

Do **not** run on routine project work. This skill is coordinator-maintenance, equivalent to `dude-lint` in scope and authority.

## Inputs

Accepted invocation forms:

- `@dude upgrade` — prepare the core update for the recorded channel, show it,
  and apply it after `confirm upgrade`.
- `@dude upgrade --all` — the same, plus the eligible out-of-the-box packs (see
  [Packs](#packs)) in the same prepared result and the same confirmation.
- `@dude upgrade --dry-run` — show the prepared core changes and keep nothing.
- `@dude upgrade --all --dry-run` — show the combined core and pack changes and
  keep nothing.
- `@dude upgrade --ref <branch|tag|sha>` — override the manifest's channel for
  this run.
- `@dude upgrade --source <url-or-local-path>` — override the source repo for
  this run.

Plain upgrade stays core-only. No form switches branches, stages, commits, or
requires a clean working tree.

### Release channel

The manifest `source_ref` is an upgrade channel. For remote sources, released bundles use the sentinel `latest`, which resolves to the newest **stable** `vX.Y.Z` tag (pre-releases like `v1.0.0-rc1` are ignored) on every run. A concrete `vX.Y.Z` pins to one release, and a branch name such as `main` tracks that branch. A local-path source must use an explicit branch or tag; `latest` is rejected with that guidance. Use `--ref` to override the channel for a single run. A `latest` channel never offers a release older than the installed one.

## Script Contract

The `upgrade.mjs` engine does all acquisition, comparison, validation,
writing, and reporting; the LLM never re-derives this work. It runs on Node
(>= 20 LTS) with Git, and shares the namespace/ownership classifier in
`.github/skills/dude-engine/lib/ownership.mjs` with `dude-lint`.

Here, `status` means the upgrade workflow's internal `upgrade.mjs status`
check. It is distinct from global `@dude status`, the read-only workflow
lane-orientation command; global status does not check upgrade availability.

### Subcommands

| Subcommand | Purpose | Writes? |
|---|---|---|
| `status`  | Check the recorded channel for a newer stable release by listing tags only. | No |
| `plan`    | Resolve the exact target commit, prepare every intended byte, and report the actual file differences. Keeps one prepared result unless `--dry-run`. | No project file |
| `apply`   | Apply one prepared result in place after `--confirm confirm-upgrade`. | Yes, uncommitted |
| `discard` | Release a prepared result that will not be applied. | No project file |
| `help`    | Print usage. | No |

Invocation (Node >= 20 LTS):

```bash
node .github/skills/dude-bundle-upgrade/upgrade.mjs status  [--source <s>] [--ref <r>] --format json
node .github/skills/dude-bundle-upgrade/upgrade.mjs plan    [--all] [--dry-run] [--source <s>] [--ref <r>] --format json
node .github/skills/dude-bundle-upgrade/upgrade.mjs apply   --plan <id> --confirm confirm-upgrade --format json
node .github/skills/dude-bundle-upgrade/upgrade.mjs discard --plan <id> --format json
```

The `--confirm` value is the literal token `confirm-upgrade`; the LLM maps the
user's literal phrase `confirm upgrade` to it. `--format text` (the default)
prints the same results for a person.

### Exit Codes

| Code | Meaning |
|---|---|
| 0  | status reported, nothing to update, or a successful apply or discard |
| 10 | plan ready, changes detected |
| 40 | invalid input, a refusal, or an apply that did not succeed |

### The check (`status`)

`upgrade.mjs status` reads the manifest first. Only a `latest` channel with a
stable installed `vX.Y.Z` makes a lookup: one noninteractive
`git ls-remote --tags` with a five-second deadline. Its Git inherits only
`PATH` and the system and temporary folder variables, has a home folder that
is never created, and runs with fixed settings of its own, so it reads none
of the user's Git configuration, saved logins, `.netrc`, cookies, proxies, or
client certificates, never signs in (not even with the user's Windows or
Kerberos account), and follows no redirect. An `ssh://` or `user@host:path`
source, an address with a user name, password, query, or fragment, and a
network share report `check_failed` without starting any process, explaining
that a plain HTTPS source can be checked or that `@dude upgrade --dry-run`
uses the user's own Git sign-in; Git may use only the file, git, http, and
https transports, so no address can start SSH either. On Windows the check
needs Git for Windows 2.32.0(2) or later, because an older one can offer a
Windows client certificate by itself. It
compares versions numerically and never offers a downgrade. It writes
nothing: no file, folder, cache, or manifest download. Pinned and development
(branch) installs make no lookup. A matching version is not byte-completeness
proof; the `plan` comparison is authoritative for the bytes.

```json
{
  "status": "upgrade_available|up_to_date|no_stable_releases|check_failed|pinned|development|installation_unavailable",
  "channel": "latest|pinned|development|null",
  "source": "<url-or-path>",
  "ref": "<requested-ref>",
  "installed_ref": "<recorded-version>",
  "available_ref": "<newest-stable-tag-or-null>",
  "release_url": "<GitHub release page or null>",
  "checked_at": "<iso-8601-or-null>",
  "detail": "<why checks do not apply, or why checking failed>"
}
```

### Preparation (`plan`)

`plan` resolves the selected channel to one exact commit (an annotated tag is
peeled to its commit) and acquires only that commit's deployment files with a
depth-one, blob-filtered Git fetch into a new folder under the operating
system's temporary folder. It reads raw Git blobs, so checkout line-ending
conversion never changes the reviewed bytes, and keeps no clone or cache.
Foreground chat uses the user's ordinary Git environment without prompting.
Acquisition has a 55-second deadline, stops Git's whole process tree when it
ends early, and keeps any folder whose Git could not be confirmed stopped,
naming it.

The acquired release's own engine then prepares the result in a staging copy:
its core files, the eligible packs when `--all` is given, the
`.dude/metadata/bundle-manifest.md` and
`.dude/metadata/development-base-release.md` transitions, and one new
`.dude/metadata/upgrade-log.md` entry. A target release without this staging
contract is refused as `unsupported-target`; the engine never falls back to an
older workflow. The report lists the actual added, replaced, and removed files
grouped into core, metadata, and each affected pack, plus the current branch
and any touched paths with uncommitted or staged edits. It shows no hashes.

`plan` is authoritative: it compares the complete core inventory byte for byte,
so a matching installed version can still show Add, Replace, or Remove
changes. A true no-op is a target with no file change and no installation-record
change: `plan` reports `nothing_to_update`, exits 0, keeps nothing, and adds no
log entry.

A ready `plan` keeps one prepared result in `<temp>/dude-up-<random>/`, bound
to this workspace and branch, under an opaque ID: the folder's cryptographically
random name followed by a digest of the result's description and every
retained release file. Every
new `plan` for the workspace, including a dry run, replaces the earlier one.
`apply`, `discard`, and a replacing `plan` first invalidate a result by
renaming its description, so no command accepts its ID again, and only then
remove its folder. A folder that cannot be removed, for example because a file
in it is locked, is kept and named in the output (`cleanup`); it is never
usable again. If an earlier result cannot be invalidated, `plan` is refused
with reason `invalidation-failed` rather than leave two usable results. A
process that is killed can leave a folder behind. Earlier plan files from
older engines are not accepted; prepare again.

```json
{
  "status": "ready",
  "id": "<32 hex characters, or null for a dry run>",
  "from_ref": "<installed>",
  "to_ref": "<target>",
  "source": { "location": "<source>", "requested_ref": "<ref>", "resolved_ref": "<tag-or-ref>", "commit": "<commit>" },
  "branch": "<current branch>",
  "include_packs": false,
  "counts": {
    "core": { "added": 0, "replaced": 0, "removed": 0 },
    "metadata": { "added": 0, "replaced": 0, "removed": 0 },
    "packs": { "<pack>": { "added": 0, "replaced": 0, "removed": 0 } }
  },
  "changes": [{ "path": "<relative path>", "group": "core|metadata|pack", "pack": "<pack-or-null>", "op": "add|replace|remove" }],
  "packs": { "eligible": [], "selected": false, "affected": [], "unchanged": [], "not_selected": [] },
  "base_release": { "from": "<release-or-null>", "to": "<release-or-null>", "changed": false },
  "dirty_paths": ["<touched path with uncommitted or staged edits>"],
  "dry_run": false
}
```

A refusal prints `{ "status": "refused", "reason": "<code>", "detail": "<text>" }`
and exits 40; a selected pack's failure also names its `pack`.

### Application (`apply`)

`apply --plan <id> --confirm confirm-upgrade` first invalidates the prepared
result, so it can never apply twice, then checks the ID's digest against the
retained description and every retained release file. A result that changed
since the preview writes nothing and runs none of its retained code; prepare
again. It then hands the verified result to the target release's own retained
engine, which runs from the temporary folder rather than from the deployed
files it replaces. It:

1. Rechecks the workspace and branch binding, the bytes or absence of every
   touched path, the manifest, base release record, upgrade log, and (with
   packs) pack profile, and every retained prepared byte. Any difference writes
   nothing; a fresh `plan` is needed.
2. Runs the target release's `dude-lint` against the project. A check that
   crashes, times out, or produces an unreadable report refuses before writing.
3. Rechecks once more, then writes exactly the prepared bytes in place as one
   all-or-restored batch of additions, replacements, and removals. A folder
   left empty by a removal is removed too.
4. Runs the same linter again inside the batch's rollback boundary and compares
   `[FAIL]` diagnostics by identity and occurrence. Existing failures are
   accepted and disclosed. Any new failure, including one that replaces an old
   failure at the same total, and any check that crashes, times out, or cannot
   be read restores every touched file.

`apply` never touches HEAD, the branch, or the index, needs no clean working
tree, and creates no tag, branch, or commit. The all-or-restored boundary covers
failures this process catches; it is not a promise against power loss or a
killed process. Each prepared result applies at most once: `apply` invalidates
it before writing anything, whatever the outcome, so a repeated or superseded
confirmation is refused without writing even when its folder could not be
removed.

| `outcome` | Meaning |
|---|---|
| `applied` | The prepared bytes are in place, uncommitted; `existing_failures` lists check failures that were already there. |
| `nothing_changed` | Refused before writing, with `reason`; prepare again. When the result could not be marked as used, or changed since the preview, only `id` and `reason` are reported. |
| `restored` | Files restored: written, then put back after a new failure or an unusable check (`new_failures`, `reason`). |
| `restoration_unconfirmed` | Restoration unconfirmed: inspect `paths`. |

Never repeat an apply automatically after any outcome other than `applied`.

```json
{
  "outcome": "applied|nothing_changed|restored|restoration_unconfirmed",
  "id": "<prepared id>",
  "from_ref": "<installed>",
  "to_ref": "<target>",
  "branch": "<branch>",
  "counts": { "core": {}, "metadata": {}, "packs": {} },
  "changes": [{ "path": "<relative path>", "group": "core|metadata|pack", "pack": null, "op": "add|replace|remove" }],
  "existing_failures": ["<applied only>"],
  "new_failures": ["<restored outcomes>"],
  "reason": "<not applied>",
  "paths": ["<restoration_unconfirmed only>"],
  "cleanup": "<a prepared folder that could not be removed, when any>"
}
```

### Packs

`--all` adds the eligible out-of-the-box packs to the same prepared result. A
pack is eligible only when the installed profile lists it and its recorded
source matches the bundle upstream selected for this upgrade; a matching
catalog name is not enough. Packs from another repository or from the
project's `library/packs` stay untouched; refresh them in Settings > Packs or
with Compose.

`--all` needs the source as a Git address, such as an HTTPS or `file:` URL.
Compose reads a local folder path as its current working tree, not the exact
target commit, so `plan --all` with a local folder source is refused
(`invalid-input`) before anything is prepared. A core-only `plan` from a local
folder is unaffected.

The target release's Compose refreshes each eligible pack in the staging copy
with the selected source given explicitly at the exact target commit, so the
project's own `library/` never takes precedence. Packs are prepared one at a
time within one finite deadline: the core acquisition window plus 130 seconds
for each pack, while each fetch keeps Compose's own smaller bound. Compose runs
for each pack as a child process the engine owns, with the same noninteractive
Git environment as core acquisition and its temporary folders inside the
prepared folder, which is observed against the same 1 GiB / 65,536-entry bound.
Cancellation, the deadline, or that bound stops the child's whole process tree
without leaving Compose running after its Git, so Compose cannot start its
full-clone fallback: on Windows Compose is stopped first, and the stop is
confirmed only when the process table shows none of its processes left. A
source other than github.com, which Compose clones with Git under a 60-second
deadline of its own, is stopped after 55 seconds, first. When a stop cannot be
confirmed, the prepared folder is kept and named. Only actual
byte differences make a pack affected; an unchanged pack keeps its files and
its installation record. A foreign file at a new pack destination, or any other
pack failure, blocks the combined result: say so and offer plain
`@dude upgrade` for a core-only preview. Locally edited pack files are
replaced after the warning; committed customizations cannot be detected.

### Base release record

`.dude/metadata/development-base-release.md` is an optional, upgrade-owned
installation record. It holds exactly one fenced JSON object with a nonblank
`source_repo` and a stable `vX.Y.Z` `base_release`: the highest stable Dude
release evidenced as included in the development source when the record was
made. It is provenance only. It does not verify installed files or name the
newest available release, and an absent file means the base is unknown. In
the Dude source repository, `node scripts/build-dev.mjs` produces it from that
checkout's own merged release tags. Never hand-edit it.

`plan` derives the record to leave from the selected target only. A `main`
target keeps a base when the target's manifest records `installed_ref: main`
and the target's record has the same `source_repo` as that manifest. The local
record then pairs that release with the selected source, so a `--source`
override stays associated with the resulting manifest. Any other target ref, a
release bundle, or a missing, malformed, or differently sourced target record
leaves no local record and clears any earlier base. Deriving the record never
reads the consumer project's history or looks up releases.

A record difference is a metadata change: the preview shows the recorded and
target base, `plan` exits 10, and the ordinary confirmation applies it even
when no other file changes. Records compare by value, so an equal record with
other line endings needs no write. A failed application restores the earlier
record or its absence with every other touched file.

## Workflow

### Step 1 — Check (only when asked)

When the user asks whether an update exists, run
`upgrade.mjs status --format json` and relay it: an available version with its
What's new link when one exists, Up to date, no stable releases, couldn't
check, or why checks do not apply to a pinned or development install. A
check is never needed before a preview.

### Step 2 — Preview (`plan`)

Run `upgrade.mjs plan --format json`, adding `--all`, `--dry-run`, `--ref`, or
`--source` as the user asked. Summarize from the JSON: the installed and target
versions, the grouped counts, the affected packs, the files and their
operations, any base release record change, and any dirty touched paths.

- Exit 0 (`nothing_to_update`): report that the exact target is already
  installed and stop without an apply.
- Exit 40 (refused): report the reason and stop. For `pack-failed`, offer the
  core-only `@dude upgrade`.
- `--dry-run`: stop after the summary; nothing was kept.

### Step 3 — Confirmation gate

Before asking, state plainly that applying overwrites local customizations in
the touched files (name the dirty paths), that Git cannot recover pre-existing
uncommitted edits it overwrites, that the changes stay uncommitted on the named
current branch, and that a new session is needed afterward. Then wait for:

- `confirm upgrade` — apply this prepared result, including its packs.
- `cancel`, or anything else — run `upgrade.mjs discard --plan <id>` and stop.

Plain "yes" / "ok" / "go" do not satisfy the gate. There is no second pack
confirmation. A new request, such as adding `--all`, needs a new `plan` and a
new confirmation.

### Step 4 — Apply

```bash
node .github/skills/dude-bundle-upgrade/upgrade.mjs apply \
  --plan <id> --confirm confirm-upgrade --format json
```

| User phrase | Flags |
|---|---|
| `confirm upgrade` | `--confirm confirm-upgrade` |

### Step 5 — Report the outcome

- `applied`: the version now installed on disk, the counts, any existing check
  failures (never describe them as a clean result), and that the changes are
  uncommitted on the current branch. Suggest `git status` and `git diff`, then
  a commit. Before committing, `git restore -- <path>` returns a modified or
  deleted tracked file to its staged version, which is its committed version
  unless the user staged a change to it (`git restore --source=HEAD -- <path>`
  takes the committed version), while an untracked file that
  the update added is deleted instead, for example with
  `git clean -f -- <path>`; after committing, revert that commit. Ask the user
  to start a new session to load the updated Dude.
- `nothing_changed`: the reason. A new `@dude upgrade` prepares a fresh preview.
- `restored`: Files restored, with the new failures or the check problem.
- `restoration_unconfirmed`: Restoration unconfirmed, with the paths to inspect.

Never retry an apply on your own.

A historical install whose older engine predates staged upgrades runs its own
older procedure the first time. After that update installs this engine, the
safe workflow is an explicit second `@dude upgrade`: this engine prepares a
fresh preview of whatever the older engine could not see, such as a newly
introduced core category or the base release record, and applies it only after
a fresh `confirm upgrade`. Never run a hidden follow-up or apply it on the
user's behalf.

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
canonical core, pack, and `dude-local-` names are preserved, and `dude-lint`
warns about them. Rename them into `dude-local-` when practical.

## Ownership Boundary For Generated Agent Profiles

Each core agent source has one generated destination:
`.github/agents/<stem>.agent.md`. The path is core-owned when its stem is
`dude` or `dude-<slug>`. A `dude-pack-<pack>-<slug>` profile is pack-owned, a
`dude-local-<slug>` profile is project-owned, and any other stem is preserved as
project content.

Upgrade copies upstream core bytes. It does not project or repair installed pack
profiles. A pack source or model mapping change reaches an installed pack only through `compose refresh <pack>`. That refresh reprojects replaceable pack output
and can overwrite edits; keep persistent customizations under `dude-local-*`.
With `--all`, the upgrade runs that same refresh for eligible packs, from the
target release, in its staging copy.

The existing `.github/skills/dude-engine/**` ownership recursively includes
`.github/skills/dude-engine/config/agent-models.json` and the loader. This lets
an older installed upgrader bootstrap the current engine without a new
ownership rule.

The source repository authors that configuration at
`src/config/agent-models.json`. Development and release builds validate it
before changing output and package the same bytes under the engine skill.

## Boundaries

- Never stage, commit, push, merge, tag, switch branches, or modify remote state. The uncommitted changes on the current branch are the deliverable; committing is the user's action.
- Never project or repair an agent profile. Upgrade copies upstream bytes for core paths; installed pack profiles refresh only through `compose refresh <pack>`.
- With `--all`, refresh only eligible packs, through the target release's Compose, from the selected source at the exact target commit. Never install or enable a pack, and never refresh a foreign-source or project-library pack.
- A core-only upgrade never deletes or modifies `.dude/` project state except
  the upgrade-owned `.dude/metadata/bundle-manifest.md`,
  `.dude/metadata/upgrade-log.md`, and optional
  `.dude/metadata/development-base-release.md`. With `--all`, the affected
  packs' records in `.dude/metadata/profile.md` may change too. That profile
  remains the only pack authority. All project-specific ideas under
  `.dude/ideas/` are preserved through every upgrade.
- Never delete or modify `.github/skills/project/`.
- Never modify `.github/copilot-instructions.md`.
- Never modify an extension tree other than the exact core-owned
  `.github/extensions/dude/**` tree.
- Never touch `.dude/ideas/`, `.dude/specs/`, `.dude/memory/`, `.dude/state/`, Beads, or product source.
- Path containment and symbolic-link checks assume a locally controlled workspace without concurrent hostile mutation. They detect observed drift but do not claim race-free protection from adversarial transient replacement, or from another writer between the last check and the write.
- Never proceed past the confirmation gate without the literal confirmation token.
- Never repeat an apply automatically, and never apply a result other than the one the user reviewed.
- Never recurse into transitive bundle composition (one upgrade pulls one upstream bundle).

## Pre-flight Requirements

The script enforces these; the LLM does not need to re-check:

- `git` is installed and the project root is inside a Git working tree. The engine fetches with Git and reads the current branch and dirty paths without writing; non-git projects must run `git init` before upgrading. A clean working tree is not required.
- `.dude/metadata/bundle-manifest.md` is the sole manifest; it exists locally, parses, and uses the exact metadata shape (`source_repo`, `source_ref`, `installed_ref`). An installed `.dude/metadata/profile.md` must be valid.
- The target release must contain `.github/agents/`, `.github/skills/dude-lint/lint.mjs`, `.github/instructions/dude.instructions.md`, a valid `.dude/metadata/bundle-manifest.md`, and the staging contract in its `upgrade.mjs`.
- A local-path source must use an explicit branch or tag.

This is forward-only. A pre-`.dude` upgrader cannot consume a current release
directly. Recovery is to install or copy a current bundle engine, or reinstall
the current bundle while preserving project data. Older project state requires
external or manual recovery; there is no in-bundle migration workflow.

## Manifest Shape

`.dude/metadata/bundle-manifest.md` contains a single fenced JSON block. The manifest is **metadata only**: it carries the upstream source pin and the installed version, and nothing else. Base release provenance lives in the separate optional [base release record](#base-release-record), so the manifest's closed shape stays readable by older engines.

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
