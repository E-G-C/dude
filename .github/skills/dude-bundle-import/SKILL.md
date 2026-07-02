---
name: "dude-bundle-import"
description: "Use when importing an agent or skill from an external repository, fetching a Dude artifact from a URL, or copying a specialist or skill from another bundle. Triggers: import this agent, import this skill, fetch agent from <url>, copy skill from <repo>, install agent from <url>, bring in <name> agent, bring in <name> skill."
---

# Bundle Import

Fetch a single agent (`*.agent.md`) or skill (`<name>/SKILL.md`) from an external source, adapt it to bundle conventions, and write it locally — never silently. Adaptation is preview-then-confirm per category. No runtime, no Python, no transitive auto-fetch.

## Purpose

Bring in third-party or cross-repo Dude artifacts (or Claude/Anthropic-flavored skills, with caveats) without polluting the bundle. The skill produces a structured **adaptation report** before any file is written; the user confirms per category, then writes happen.

## Mechanical prep (`import.mjs`)

The deterministic parts — URL rewrite (github `blob` -> `raw`), frontmatter
parsing, the strip plan (`compatibility`, `model`, Claude-style `tools`),
destination filename normalization to `dude-local-*`, line-ending counting, and
token-overlap against existing local artifacts — are computed by a script so the
report is reliable:

```bash
node .github/skills/dude-bundle-import/import.mjs analyze <url|path> --json   # adaptation report
node .github/skills/dude-bundle-import/import.mjs apply   <url|path> --plan plan.json
```

`analyze` never writes. `apply` executes a confirmed plan and refuses unless the
plan records a `license_disposition` when the source carries license metadata.
The judgment calls below (license path, persona drift, opt-in tool remap) stay
with the coordinator; the script only prepares and executes the mechanical edits.

## When To Run

- User supplies a URL to a `*.agent.md` or `SKILL.md` and asks to import, fetch, copy, or install it.
- `dude-team-expansion` or `dude-skill-authoring` detects a remote source and routes here instead of authoring from scratch.
- Coordinator parses an "import this agent/skill" intent.

## Inputs

Accepted source forms (resolved to either a raw file fetch or a directory listing):

- `https://raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>` — used as-is
- `https://github.com/<owner>/<repo>/blob/<ref>/<path>` — rewrite to `raw.githubusercontent.com`
- `https://github.com/<owner>/<repo>/tree/<ref>/<path>` — treat as a directory source; list the directory first, then classify it as a skill directory, an agent directory, or unsupported
- `<owner>/<repo>:<path>` (shorthand) — assume `main` ref unless the user supplies one; resolve as a file when the path has a known artifact filename, otherwise resolve as a directory source

Reject anything else with a clear reason and stop.

## Detection Rules

- Path ends in `.agent.md` → kind is **agent**; default destination is `.github/agents/dude-local-<source-name>.agent.md`, where `<source-name>` is the filename with `.agent.md` removed, unless the source name already starts with `dude-local-`.
- Path ends in `.md` under a directory named `agents/` (or otherwise framed as an agent file) and the body is agent-shaped (frontmatter `name`, second-person/third-person directive prose) → kind is **agent**; **normalize the destination filename** to `dude-local-<basename>.agent.md` and surface the rename in the adaptation report.
- Path ends in `SKILL.md` → kind is **skill**; default destination is `.github/skills/dude-local-<parent-dirname>/SKILL.md` unless the parent directory already starts with `dude-local-`.
- Path is a directory source containing a `SKILL.md` child → kind is **skill**; default destination is `.github/skills/dude-local-<dirname>/SKILL.md` unless the directory already starts with `dude-local-`; primary source file is `<dir>/SKILL.md`.
- Path is a directory source whose children are mostly `*.md` agent files (no `SKILL.md`) → kind is **agent directory**; do **not** auto-fan-out. List the candidate files in the report and require the user to pick which to import; each pick becomes a separate `dude-bundle-import` invocation.
- Anything else → refuse with `does not parse as a Dude agent or skill`.

If the destination already exists, do **not** proceed past Step 3 without an explicit `replace` confirmation.

The `dude-local-` destination prefix is reserved for project-owned imports. Only omit it when the user explicitly says they are importing a new upstream/base Dude artifact that will be shipped in the bundle manifest.

## Workflow

### Step 1 — Resolve source, then fetch or list

For file sources, use the host's fetch tool against the resolved raw URL. Verify the response parses as Dude-shaped markdown:

- frontmatter delimited by `---`
- contains `name:` (and `description:` for skills)
- body has at least one `## ` heading

For directory sources, list the directory before attempting a primary fetch. Use the host's repository listing capability when available, or the GitHub contents API equivalent for the resolved owner/repo/ref/path. Do not assume `<dir>/SKILL.md` exists until the listing proves it.

- If the listing contains `SKILL.md`, classify as **skill**, fetch `<dir>/SKILL.md` as the primary file, and validate it with the file-source rules above.
- If the listing has no `SKILL.md` and mostly contains `*.md` files that look agent-shaped, classify as **agent directory**. Fetch only enough candidate markdown files to validate and report their names, normalized destination filenames, and overlap warnings. Stop at the Step 2 report and require the user to pick one or more candidates; each picked candidate becomes a separate `dude-bundle-import` invocation.
- If the directory cannot be listed, has neither `SKILL.md` nor agent-shaped markdown files, or mixes unrelated content too heavily to classify safely, stop and report `does not parse as a Dude agent or skill`.

If parsing or listing fails, stop and report.

### Step 2 — Adaptation report (preview, no writes)

Produce a single structured report with these sections. Surface every item; do not auto-fix.

1. **Detected kind and destination** — `agent`, `skill`, or `agent directory`; absolute destination path; whether destination exists; any filename normalization being applied (e.g., `<name>.md` → `<name>.agent.md`).
2. **Frontmatter changes** — fields to strip (`compatibility:`, `model:`, Claude-specific `tools:`), fields to keep, fields to remap, and any `license:` value that needs preservation. A `license:` field must not be silently discarded: report whether an existing `LICENSE`/`NOTICE` sibling is available, whether a license sibling should be created from the frontmatter value for a skill import, or whether an agent import should retain a short non-frontmatter `## Source License` section. If no preservation path is confirmed, cancel instead of importing with license metadata lost.
3. **Anthropic / Claude tool references in body** — list every line containing `Bash`, `Read`, `Write`, `Edit`, `Task`, `present_files`, `claude -p`, `claude --print`, or similar tool-name tokens, with line numbers.
4. **MCP server assumptions** — list any named MCP server the body relies on.
5. **Heavy-import flags** — list every line that triggers any of the heavy-import detectors below. Each category is presented as its own opt-in.
6. **Sibling files (skills only)** — list every `<sibling>` referenced relative to the SKILL.md (e.g., `scripts/foo.py`, `assets/template.html`, `theme-showcase.pdf`) plus any license-preservation sibling from item 2. Each sibling is its own opt-in. Classify each as **text-adaptable** (`*.md`, `*.txt`, `*.json`, `*.html`, `*.ps1`, `*.sh`), **binary** (`*.pdf`, `*.png`, `*.jpg`, `*.ico`, `*.woff*`, `*.ttf`, `*.zip`), or **directory** (e.g., `themes/`, `agents/`, `references/`). Binary siblings are copied byte-for-byte without adaptation. Directory siblings require explicit per-directory recursion confirmation, but confirming a directory does not confirm executable children inside it: list directory children before writing, classify each child, and require per-file confirmation for executable files. The skill never recursively pulls a directory by default.
7. **Referenced skills (agents only)** — list every `.github/skills/<name>/` path **and** every bare `skills/<name>` path mentioned in the body, and whether `<name>` already exists locally. Bare-path references that point at the source repo's structure (not the destination's `.github/skills/`) should be flagged for adaptation: either rewrite to `.github/skills/<name>/` if the dependency is being imported, or strip the reference entirely if it is not.
8. **Referenced handles (agents only)** — list every `@<role>` referenced and whether the role already exists in the local roster.
9. **Overlap warnings** — list any local agent/skill whose `description:` shares ≥30% token overlap with the imported artifact, or whose scope/purpose section overlaps semantically.
10. **Coordinator-only block** — for agents that are not coordinator-equivalents, note that the canonical `**Coordinator-only artifacts:**` block will be inserted during Step 4.
11. **Persona drift** — flag chatty Claude-style asides ("I am Claude," first-person tutorials, "Anthropic recommends," emphatic ALL-CAPS exhortations, etc.). Do not auto-rewrite.

### Step 3 — User confirmation gate

Present the report. Wait for one of:

- `confirm import` — proceed with all flagged adaptations applied.
- `confirm import without <category>` (repeatable) — proceed but skip the named categories (e.g., `without sibling scripts/`, `without persona-drift edits`).
- `replace` — when destination exists, authorize overwrite.
- `cancel` — stop, write nothing.

Never write files before this gate clears.

### Step 4 — Adapt

Apply only the confirmed adaptations to the in-memory copy:

- strip/remap frontmatter per Step 2 item 2
- preserve confirmed license metadata outside stripped frontmatter, using the reported `LICENSE`/`NOTICE` sibling path for skills or a `## Source License` section for agents
- insert the canonical coordinator-only block for non-coordinator-equivalent agents (see Adaptation Rules below)
- replace tool-name references with generic phrasing **only** when that category was confirmed
- apply confirmed referenced-skill path changes, including rewriting bare `skills/<name>` references to `.github/skills/<name>/` when the dependency exists or is being imported, or stripping the reference when the dependency is intentionally skipped
- normalize line endings to the destination repo's convention
- leave persona drift untouched unless the user explicitly confirmed that category

### Step 5 — Write primary file

Use the host's write tool to create or replace the destination file. Report the path written.

### Step 6 — Sibling files (skills only)

For each sibling the user confirmed in Step 2 item 6:

- fetch from the parallel path in the source repo
- adapt text-adaptable siblings with the same confirmed text rules as the primary file
- copy binary siblings byte-for-byte without frontmatter, prose, or line-ending adaptation
- write under `.github/skills/<name>/<sibling>`
- for confirmed directory siblings, list children first and apply this same classification recursively; a directory confirmation only permits traversal, not automatic writing of every child
- if the sibling or any discovered directory child is `*.py`, `*.js`, `*.sh`, or another executable type and was *not* explicitly confirmed by the user as that specific file, refuse and note it in the final summary

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
- never write executable code files (`*.py`, `*.js`, `*.sh` other than the bundle's own lint scripts) without explicit per-file confirmation
- never overwrite an existing destination without `replace` confirmation
- never publish, push, or modify remote state — this skill only reads remote and writes local
- never install runtimes (Python, Node, etc.); refuse the import if the source is unusable without one and the user has not explicitly accepted that
- the skill itself stays a single SKILL.md with no siblings, by design

## Dry-Run Mode

If the user prefixes the request with `dry-run`, stop after Step 2 and present the adaptation report only. No fetches beyond the primary file; no writes.
