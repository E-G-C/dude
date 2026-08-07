---
name: "dude-bundle-import"
description: "Use when importing an agent, skill, or bounded clean artifact directory from an external repository or local source. Triggers: import this agent, import this skill, import this directory, analyze directory, fetch agent from <url>, copy skill from <repo>, install agent from <url>, bring in <name> agent, bring in <name> skill. Do NOT use for installing catalog packs (dude-compose), upgrading the bundle itself (dude-bundle-upgrade), or moving a whole bundle between repositories (dude-portability)."
---

# Bundle Import

Import either one focused agent or skill with reviewed adaptation, or one bounded clean directory with deterministic analysis and an exact reviewed plan. Neither workflow executes imported content, installs a runtime, or fetches transitive dependencies.

## Purpose

Bring in third-party or cross-repo Dude artifacts without polluting the bundle.
Focused import produces a structured adaptation report and requires per-category
confirmation. Guarded directory import produces deterministic analysis and a
reviewed plan before its exact confirmation gate.

## Mechanical prep (`import.mjs`)

The deterministic parts — strict remote-file authorization and canonical GitHub
`blob` -> `raw` resolution, frontmatter parsing, the strip plan (`compatibility`,
`model`, Claude-style `tools`), destination filename normalization to
`dude-local-*`, line-ending counting, and token-overlap against existing local
artifacts — are computed by a script so the report is reliable. Remote fetches
refuse redirects and enforce a streamed 1 MiB (1048576-byte) limit:

```bash
node .github/skills/dude-bundle-import/import.mjs analyze <url|path> --json   # adaptation report
node .github/skills/dude-bundle-import/import.mjs apply   <url|path> --plan plan.json
```

`analyze` never writes. It records whether the primary destination is absent or
the exact identity, hard-link count, and SHA-256 of the existing regular file.
For licensed skills it also records the candidate `LICENSE` and `NOTICE`
destination states. `apply` executes a confirmed plan only when
`destinationDecision` is the exact `create` or `replace` decision for the
analyzed state. The plan JSON is the reviewed authorization artifact; it is not
a cryptographic attestation. `apply` refuses destination appearance,
disappearance, type, identity, hard-link-count, or content drift. The judgment
calls below (license path, persona drift, opt-in tool remap) stay with the
coordinator; the script only prepares and executes the reviewed mechanical
edits.

## Guarded directory import

Directory import is a separate clean-source workflow. It does not route the
existing focused `analyze` or `apply` commands through directory handling, so
their accepted local-file and GitHub-file forms, adaptation report, naming,
license decisions, destination checks, and result behavior remain unchanged.

Run the three directory commands from the destination workspace:

```bash
node .github/skills/dude-bundle-import/import.mjs analyze-directory <source> > analysis.json
node .github/skills/dude-bundle-import/import.mjs plan-directory --analysis analysis.json [--review review.json] > plan.json
node .github/skills/dude-bundle-import/import.mjs apply-directory <source> --plan plan.json --confirm <literal>
```

`analyze-directory` and `plan-directory` emit canonical JSON and never mutate
an import destination. Planning accepts no confirmation. The only persisted
workflow artifacts are the directory analysis and reviewed directory plan; the
optional review and apply confirmation are inputs, and apply emits an ordinary
result rather than a third artifact.

The source is either one no-follow local directory or a canonical public
`https://github.com/<owner>/<repo>/tree/<ref>/<subtree...>` URL. Directory v1
limits are depth 12, 256 entries, 128 regular files, 1048576 bytes per file,
and 4194304 aggregate file bytes. GitHub acquisition allows at most 16 metadata
and 128 raw requests, 1048576 bytes per response, 4194304 aggregate bytes for
each response class, and 30 seconds per request. Review batches contain at most
16 complete strict-UTF-8 files and 262144 decoded bytes. The complete optional
review is limited to 1048576 UTF-8 bytes; its raw file is rejected before JSON
parsing and its canonical structured value is checked before acceptance. The
complete canonical reviewed plan, including `plan_sha256`, is limited to
16777216 UTF-8 bytes; apply rejects a larger raw plan before parsing. These are
fixed aggregate limits with no caller overrides or added per-finding limits.

Every regular file belongs to its unique nearest agent or skill root. Only a
selected-root `LICENSE`, `LICENSE.*`, `NOTICE`, or `NOTICE.*` may be shared.
Outputs preserve exact bytes and line endings. The sole transform replaces a
skill entrypoint's parsed `name` scalar with its final `dude-local-*` directory
name while retaining its quote style; directory import never normalizes or
repairs other content. Fixed mapping that breaks a recognized literal relative
reference Blocks.

Every agent entrypoint must already contain exactly one standalone, unfenced,
unprefixed paragraph, bounded by blank lines or a body edge:

```text
**Coordinator-only artifacts:** do not edit `## Coordinator Log`, task-state glyphs in `tasks.md`, fenced regions (`<!-- dude:managed:* -->`, `<!-- dude:board:* -->`), or `status:` / `spec_path:` frontmatter. Report changes back to `@dude` instead.
```

Directory import never inserts, moves, normalizes, or rewrites this paragraph.
A missing, altered, split, repeated, fenced, prefixed, or prose-wrapped instance
Blocks with guidance to use focused import/adaptation or prepare a clean source.
Entrypoint metadata that focused import would strip, remap, preserve, or ask the
user to judge, including `compatibility`, `model`, `tools`, and `license`, also
Blocks the directory path. Use focused import for those files.

Static scanning is conservative. Broad indicators Warn even in documentation,
examples, or comments because v1 does no context parsing or context-based
severity reduction. Only tightly bound high-confidence dangerous constructs
whose operands are joined in one expression or command Block. Optional review
does not prove safety: each `reviewed_batch_id` claims review of that exact
complete generated batch, and omitted batches, over-budget text, or opaque files
force at least Warned. Review cannot Block, authorize, normalize, erase, or
downgrade deterministic evidence.

Apply accepts only the literal bound to the complete plan:

- Clean: `confirm-import`
- Warned: `confirm-warned-import:<plan_sha256>`
- Blocked: no plan or confirmation

`replace_paths` is the complete sorted set of existing regular-file outputs;
the literal authorizes all of them. There is no selection, merge, force,
implicit overwrite, or rename-on-collision. Planning and apply reject source,
output, destination, and transaction overlap or aliases. Apply stages exact
outputs and backups before mutation, verifies installation, and either reports
`installed`, verifies rollback and reports `rolled-back`, or retains recovery
material and reports `recovery-failed` with uncertain paths. It never executes
the imported files.

The checks detect observed drift but do not prove safety against a hostile
concurrent filesystem actor; use a locally controlled workspace. POSIX
transaction material requires current-UID ownership with `0700` directories and
`0600` files. On Windows, it uses the selected transaction parent's inherited
ACLs, does not manage ACLs, and makes no current-user-only access claim. Secure
that parent externally before apply when stronger privacy is required.

For focused import, the reviewed fields added to the JSON report use these exact
shapes:

```json
{
	"destinationDecision": {
		"action": "create",
		"state": { "type": "missing" }
	},
	"license_disposition": {
		"license": "MIT",
		"materialization": "agent-source-license-section"
	}
}
```

For a skill, `license_disposition` instead selects and authorizes one analyzed
license sibling:

```json
{
	"license_disposition": {
		"license": "MIT",
		"materialization": "skill-license-sibling",
		"sibling": {
			"filename": "LICENSE",
			"decision": {
				"action": "create",
				"state": { "type": "missing" }
			}
		}
	}
}
```

For `replace`, the decision's `state` must exactly repeat the analyzed regular
file state, including `identity.device`, `identity.inode`, `nlink`, and
`sha256`. Replacement is allowed only when the selected existing file has
`nlink: "1"`; a selected target with any additional hard-link alias is rejected.
Selected primary and license-sibling targets that resolve to the same file
identity are also rejected. A free-form `license_disposition` is invalid. Its
`license` must exactly equal the observed frontmatter value.

The only supported license metadata form is exactly one literal top-level line
beginning at column zero, `license: VALUE`, for example `license: MIT`. `VALUE` must match
`[A-Za-z0-9][A-Za-z0-9.+-]*(?: [A-Za-z0-9][A-Za-z0-9.+-]*)*`: one or more
non-empty ASCII alphanumeric tokens that may also contain `.`, `+`, or `-`,
separated only by single spaces. The observed value is preserved exactly.

Focused import validates the entire frontmatter with a strict, import-private
parser rather than a general YAML parser. Frontmatter is either absent or bounded
by exact column-zero `---` delimiters with LF or CRLF endings; bare carriage
returns, delimiter-shaped openers or closers (for example `--- # metadata` or
` ---`), tabs, and indented data outside a `tools` sequence are rejected. Every
data-bearing top-level entry must start at column zero with an unquoted ASCII key
immediately followed by `:`, so anchors, aliases, tags, merge or explicit keys,
directives, quoted or duplicate keys, block scalars, flow mappings, and nested
mappings fail closed. License metadata is at most one canonical `license: VALUE`,
and absence is proven only after the whole frontmatter validates; noncanonical or
semantic candidates — an indented `license: MIT`, `license : MIT`, `"license":
MIT`, `'license': MIT`, a semantic duplicate, and anchor, tag, quoted, comment,
colon, hash, `|`/`>` block, empty, flow, or sequence values — are rejected. Any
rejection fails both `analyze` and `apply` closed with a clear diagnostic and no
writes. The importer does not perform SPDX validation, rewrite frontmatter
automatically, accept arbitrary nested metadata, run transactionally, or
guarantee race-free safety on a hostile filesystem.

## When To Run

- User supplies a URL to a `*.agent.md` or `SKILL.md` and asks to import, fetch, copy, or install it.
- User asks to analyze and import one complete local artifact directory or canonical public GitHub tree.
- `dude-team-expansion` or `dude-skill-authoring` detects a remote source and routes here instead of authoring from scratch.
- Coordinator parses an "import this agent/skill" intent.

## Inputs

Focused single-file source forms:

- a local path to one agent or `SKILL.md` file
- `https://raw.githubusercontent.com/<owner>/<repo>/<ref>/<path...>`
- `https://github.com/<owner>/<repo>/blob/<ref>/<path...>` — canonicalized to the raw form

Focused remote sources accept exactly those two HTTPS GitHub file forms. They do
not follow redirects or accept URL aliases, repository trees, APIs, or shorthand.
The first segment after the repository is the ref; slash-bearing refs are not
supported. Reject anything else with a clear reason and stop.

Directory source forms and limits are defined in Guarded directory import above.

## Detection Rules

- Path ends in `.agent.md` → kind is **agent**; default destination is `.github/agents/dude-local-<source-name>.agent.md`, where `<source-name>` is the filename with `.agent.md` removed, unless the source name already starts with `dude-local-`.
- Path ends in `.md` under a directory named `agents/` (or otherwise framed as an agent file) and the body is agent-shaped (frontmatter `name`, second-person/third-person directive prose) → kind is **agent**; **normalize the destination filename** to `dude-local-<basename>.agent.md` and surface the rename in the adaptation report.
- Path ends in `SKILL.md` → kind is **skill**. Its actual parsed `name` is required and must contain one canonical lowercase stem matching `[a-z][a-z0-9-]*[a-z0-9]`. The importer strips at most one exact case-sensitive `dude-local-` or `dude-pack-` prefix and writes `.github/skills/dude-local-<stem>/SKILL.md`.
- Anything else → refuse with `does not parse as a Dude agent or skill`.

If the destination already exists, do **not** proceed past Step 3 without an explicit `replace` confirmation.

The `dude-local-` destination prefix is reserved for project-owned imports. Only omit it when the user explicitly says they are importing a new upstream/base Dude artifact that will be shipped in the bundle manifest.

## Workflow

This workflow applies to focused single-file import. Guarded directory import
uses the separate read-only analysis and planning flow above.

### Step 1 — Resolve source, then read or fetch

Read a local source directly. For a remote source, authorize and canonicalize it
through `import.mjs`; fetch with redirects disabled and one 30-second abort
budget. Reject a valid decimal `Content-Length` above 1 MiB early, and always
count the streamed bytes so a missing or false-small header cannot bypass the
1048576-byte limit. Verify the response parses as Dude-shaped markdown:

- frontmatter delimited by `---`
- contains `name:` (and `description:` for skills)
- body has at least one `## ` heading

If fetching or parsing fails, stop and report.

### Step 2 — Adaptation report (preview, no writes)

Produce a single structured report with these sections. Surface every item; do not auto-fix.

1. **Detected kind and destination** — `agent` or `skill`; absolute destination path; the analyzed missing or exact regular-file state; any filename normalization being applied (e.g., `<name>.md` → `<name>.agent.md`). A non-file destination type is not importable.
2. **Frontmatter changes** — fields to strip (`compatibility:`, `model:`, Claude-specific `tools:`), fields to keep, fields to remap, and any `license:` value that needs preservation. A `license:` field must not be silently discarded: report whether an existing `LICENSE`/`NOTICE` sibling is available, whether a license sibling should be created from the frontmatter value for a skill import, or whether an agent import should retain a short non-frontmatter `## Source License` section. If no preservation path is confirmed, cancel instead of importing with license metadata lost.
3. **Anthropic / Claude tool references in body** — list every line containing `Bash`, `Read`, `Write`, `Edit`, `Task`, `present_files`, `claude -p`, `claude --print`, or similar tool-name tokens, with line numbers.
4. **MCP server assumptions** — list any named MCP server the body relies on.
5. **Heavy-import flags** — list every line that triggers any of the heavy-import detectors below. Each category is presented as its own opt-in.
6. **Sibling references (skills only)** — list files referenced relative to `SKILL.md` as unresolved follow-up work. The importer does not fetch or copy arbitrary siblings. The only sibling it may materialize is the exact reviewed `LICENSE` or `NOTICE` destination selected to preserve observed license metadata.
7. **Referenced skills (agents only)** — list every `.github/skills/<name>/` path **and** every bare `skills/<name>` path mentioned in the body, and whether `<name>` already exists locally. Bare-path references that point at the source repo's structure (not the destination's `.github/skills/`) should be flagged for adaptation: either rewrite to `.github/skills/<name>/` if the dependency is being imported, or strip the reference entirely if it is not.
8. **Referenced handles (agents only)** — list every `@<role>` referenced and whether the role already exists in the local roster.
9. **Overlap warnings** — list any local agent/skill whose `description:` shares ≥30% token overlap with the imported artifact, or whose scope/purpose section overlaps semantically.
10. **Coordinator-only block** — for agents that are not coordinator-equivalents, note that the canonical `**Coordinator-only artifacts:**` block will be inserted during Step 4.
11. **Persona drift** — flag chatty Claude-style asides ("I am Claude," first-person tutorials, "Anthropic recommends," emphatic ALL-CAPS exhortations, etc.). Do not auto-rewrite.
12. **Description matchability** — check whether the imported `description:` uses this project's vocabulary or its origin system's, and whether a Dude task would plausibly phrase itself that way. Flag the opposite failure too: a description broad enough to match nearly any task dilutes dispatch. When either applies, propose **appending** a `Use when` trigger clause written in local vocabulary and leave the upstream sentence unchanged. Never rewrite or replace the upstream description. Report the proposal here; it is not auto-applied.

### Step 3 — User confirmation gate

Present the report. Wait for one of:

- `confirm import` — proceed with all flagged adaptations applied.
- `confirm import without <category>` (repeatable) — proceed but skip the named categories (e.g., `without persona-drift edits`).
- `replace` — when the analyzed destination is an existing regular file, authorize overwrite of exactly that file identity and content.
- `cancel` — stop, write nothing.

Never write files before this gate clears.

Confirmation produces an exact `destinationDecision`: `create` is valid only
for an analyzed missing destination, and `replace` is valid only for the exact
existing-file state shown in the report. A licensed import also requires the
structured `license_disposition` shown above. Re-run `analyze` instead of
reusing a plan after any destination changes.

### Step 4 — Adapt

Apply only the confirmed adaptations to the in-memory copy:

- strip/remap frontmatter per Step 2 item 2
- preserve confirmed license metadata outside stripped frontmatter, using the reported `LICENSE`/`NOTICE` sibling path for skills or a `## Source License` section for agents
- insert the canonical coordinator-only block for non-coordinator-equivalent agents (see Adaptation Rules below)
- replace tool-name references with generic phrasing **only** when that category was confirmed
- apply confirmed referenced-skill path changes, including rewriting bare `skills/<name>` references to `.github/skills/<name>/` when the dependency exists or is being imported, or stripping the reference when the dependency is intentionally skipped
- normalize line endings to the destination repo's convention
- leave persona drift untouched unless the user explicitly confirmed that category
- append the proposed `Use when` trigger clause to the imported `description:`, keeping the upstream sentence intact, **only** when that category was confirmed

### Step 5 — Preflight the complete write set, then write the primary file

Before the first filesystem mutation, preflight the primary destination and
every selected license-sibling destination. Resolve every path through
`resolveMutationPath` again and reject any appearance, disappearance, type,
identity, hard-link-count, or content drift from its analyzed state. Reject
replacement if any selected existing target has more than one hard link, and
reject selected targets that alias each other. If any target fails, write
nothing. After the complete preflight passes, create or replace the primary file
using its exact reviewed action. Report every path written, including license
siblings.

### Step 6 — Sibling references (skills only)

Report referenced sibling files as unresolved. Do not fetch, copy, traverse, or
write them as part of this import. A separately reviewed license-preservation
destination selected in Steps 2–5 is the sole supported sibling write.

### Step 7 — Run `dude-lint`

Invoke `dude-lint` against the destination. Treat any `[FAIL]` as a hard stop:

- if the failure is recoverable (e.g., missing coordinator-only block in an agent the importer should have inserted), fix and re-run once
- if not, leave the file in place and surface the failure in Step 9 so the user can revert or fix manually

### Step 8 — Dependency report

For agents: list every referenced skill not yet present locally. For each, ask whether to import it as a separate `dude-bundle-import` invocation. Do **not** auto-recurse. The user re-invokes the skill per dependency.

### Step 9 — Final summary

- what was imported (paths)
- what adaptations were applied
- what categories were skipped
- what dependencies remain unresolved
- any `dude-lint` warnings still standing
- next-step suggestions (e.g., "run `dude-bundle-import` on `<dep-skill>` to satisfy the missing dependency")

## Adaptation Rules

| Source token / pattern                     | Default action                               |
|---                                         |---                                           |
| `Bash`, `Read`, `Write`, `Edit` (Anthropic tool names) | Suggest generic phrasing; do not auto-rewrite. |
| `Task` tool / "subagent" / "spawn agents"  | Flag as unsupported pattern; require manual review. |
| `claude -p`, `claude --print`, `present_files` | Flag as Claude-CLI-only; note in summary. |
| `compatibility:` frontmatter               | Strip.                                       |
| `model:` frontmatter                       | Strip (Copilot does not enforce this).       |
| `license:` frontmatter                     | Strip from frontmatter only after preserving it through a confirmed `LICENSE`/`NOTICE` sibling for skills or a non-frontmatter `## Source License` section for agents; otherwise cancel. |
| `tools:` frontmatter (Anthropic-style)     | Strip by default; remap only if user opts in. |
| Persona drift ("I am Claude," etc.)        | Flag, do not auto-rewrite.                   |
| Missing coordinator-only block (non-coord agent) | Insert canonical block during Step 4. |

The canonical coordinator-only block (insert verbatim, with surrounding blank lines, near the end of the agent body):

```
**Coordinator-only artifacts:** do not edit `## Coordinator Log`, task-state glyphs in `tasks.md`, fenced regions (`<!-- dude:managed:* -->`, `<!-- dude:board:* -->`), or `status:` / `spec_path:` frontmatter. Report changes back to `@dude` instead.
```

Coordinator-equivalent agents (skip block insertion): files named `dude.agent.md`, `dude-spec-lead.agent.md`, or any agent whose body explicitly claims authority over `## Coordinator Log`.

## Heavy-Import Detection

Each trigger below escalates the source to "needs explicit per-category confirmation" in Step 2 item 5. The user can still proceed; the skill simply refuses to silently pull executable code or runtime-dependent patterns.

- any `python`, `python3`, `pip`, `python -m` invocation in the body
- any generic shell invocation (`bash`, `sh`, `zsh`, `pwsh`, `powershell`, or shell command block) that is not clearly part of the artifact's declared shell/git/build domain
- any `*.py` sibling file
- any `nohup`, background-server pattern, or `webbrowser.open()` reference
- HTML viewer / eval-viewer references
- `*.json` evals or benchmark scaffolding
- subagent-driven evaluation loops
- explicit MCP server names not present in the destination

**Domain-aware suppression:** when the imported artifact's primary domain is itself shell/git/build tooling (declared in frontmatter `name` or `description`, e.g., `dude-using-git-worktrees`, `npm-release`, `cargo-build`), suppress the generic shell-invocation heuristic for shell snippets that match the declared domain. The Python/HTML/subagent triggers above still fire. The intent is to avoid drowning a legitimately shell-centric skill in noise while still catching cross-domain runtime dependencies.

## Overlap Detection

On both agent and skill imports:

- compute case-folded token overlap between the imported `description:` and every existing local artifact's `description:`
- flag when overlap ≥ 30% or when the scope/purpose section shares a near-duplicate first paragraph
- present matches in Step 2 item 9 with three options: **replace**, **coexist** (rename imported file to disambiguate), **cancel**

Examples worth catching: a Claude `skill-creator` overlaps with the local `dude-skill-authoring`; a third-party `architect.agent.md` overlaps with the coding pack's `dude-pack-coding-architect`.

## Boundaries

- never auto-fetch transitive dependencies — each one requires a fresh `dude-bundle-import` invocation
- focused import never lists or imports repository directories, trees, or arbitrary sibling files; guarded directory import handles only its selected bounded subtree
- focused import never follows a remote redirect or accepts more than 1048576 streamed source bytes
- focused import never writes referenced executable siblings; it reports them as unresolved
- focused import never creates or replaces without its exact reviewed destination decision, and it preflights the complete selected write set first
- never treat these checks as race-free protection against a hostile filesystem; imports operate only in a locally controlled workspace, and an external process can still change paths after preflight
- never publish, push, or modify remote state — this skill only reads remote and writes local
- never install runtimes (Python, Node, etc.); refuse the import if the source is unusable without one and the user has not explicitly accepted that
- the skill guidance itself stays a single SKILL.md, while the shipped deterministic directory modules remain implementation details

## Dry-Run Mode

For focused single-file import, if the user prefixes the request with `dry-run`, stop after Step 2 and present the adaptation report only. Read or fetch only the primary file; no writes. Directory analysis and planning are already read-only.
