---
name: "bundle-import"
description: "Use when importing an agent or skill from an external repository, fetching a Dude artifact from a URL, or copying a specialist or skill from another bundle. Triggers: import this agent, import this skill, fetch agent from <url>, copy skill from <repo>, install agent from <url>, bring in <name> agent, bring in <name> skill."
---

# Bundle Import

Fetch a single agent (`*.agent.md`) or skill (`<name>/SKILL.md`) from an external source, adapt it to bundle conventions, and write it locally — never silently. Adaptation is preview-then-confirm per category. No runtime, no Python, no transitive auto-fetch.

## Purpose

Bring in third-party or cross-repo Dude artifacts (or Claude/Anthropic-flavored skills, with caveats) without polluting the bundle. The skill produces a structured **adaptation report** before any file is written; the user confirms per category, then writes happen.

## When To Run

- User supplies a URL to a `*.agent.md` or `SKILL.md` and asks to import, fetch, copy, or install it.
- `team-expansion` or `skill-authoring` detects a remote source and routes here instead of authoring from scratch.
- Coordinator parses an "import this agent/skill" intent.

## Inputs

Accepted source forms (all transformed to a raw fetch URL):

- `https://raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>` — used as-is
- `https://github.com/<owner>/<repo>/blob/<ref>/<path>` — rewrite to `raw.githubusercontent.com`
- `https://github.com/<owner>/<repo>/tree/<ref>/<path>` — treat as a skill directory; primary file is `<path>/SKILL.md`
- `<owner>/<repo>:<path>` (shorthand) — assume `main` ref unless the user supplies one

Reject anything else with a clear reason and stop.

## Detection Rules

- Path ends in `.agent.md` → kind is **agent**; destination is `.github/agents/<basename>`.
- Path ends in `SKILL.md` → kind is **skill**; destination is `.github/skills/<parent-dirname>/SKILL.md`.
- Path is a directory URL → kind is **skill**; primary file is `<dir>/SKILL.md`.
- Anything else → refuse with `does not parse as a Dude agent or skill`.

If the destination already exists, do **not** proceed past Step 3 without an explicit `replace` confirmation.

## Workflow

### Step 1 — Fetch primary file

Use the host's fetch tool against the resolved raw URL. Verify the response parses as Dude-shaped markdown:

- frontmatter delimited by `---`
- contains `name:` (and `description:` for skills)
- body has at least one `## ` heading

If parsing fails, stop and report.

### Step 2 — Adaptation report (preview, no writes)

Produce a single structured report with these sections. Surface every item; do not auto-fix.

1. **Detected kind and destination** — `agent` or `skill`; absolute destination path; whether destination exists.
2. **Frontmatter changes** — fields to strip (`compatibility:`, `model:`, Claude-specific `tools:`), fields to keep, fields to remap.
3. **Anthropic / Claude tool references in body** — list every line containing `Bash`, `Read`, `Write`, `Edit`, `Task`, `present_files`, `claude -p`, `claude --print`, or similar tool-name tokens, with line numbers.
4. **MCP server assumptions** — list any named MCP server the body relies on.
5. **Heavy-import flags** — list every line that triggers any of the heavy-import detectors below. Each category is presented as its own opt-in.
6. **Sibling files (skills only)** — list every `<sibling>` referenced relative to the SKILL.md (e.g., `scripts/foo.py`, `assets/template.html`). Each sibling is its own opt-in.
7. **Referenced skills (agents only)** — list every `.github/skills/<name>/` path mentioned in the body and whether `<name>` already exists locally.
8. **Referenced handles (agents only)** — list every `@<role>` referenced and whether the role already exists in the local roster.
9. **Overlap warnings** — list any local agent/skill whose `description:` shares ≥30% token overlap with the imported artifact, or whose scope/purpose section overlaps semantically.
10. **Coordinator-only block** — for agents that are not coordinator-equivalents, note that the canonical `**Coordinator-only artifacts:**` block will be inserted during Step 4.
11. **Persona drift** — flag chatty Claude-style asides ("I am Claude," first-person tutorials, "Anthropic recommends," etc.). Do not auto-rewrite.

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
- insert the canonical coordinator-only block for non-coordinator-equivalent agents (see Adaptation Rules below)
- replace tool-name references with generic phrasing **only** when that category was confirmed
- normalize line endings to the destination repo's convention
- leave persona drift untouched unless the user explicitly confirmed that category

### Step 5 — Write primary file

Use the host's write tool to create or replace the destination file. Report the path written.

### Step 6 — Sibling files (skills only)

For each sibling the user confirmed in Step 2 item 6:

- fetch from the parallel path in the source repo
- adapt (same rules)
- write under `.github/skills/<name>/<sibling>`
- if the sibling is `*.py`, `*.js`, or another executable type and was *not* explicitly confirmed by the user as that filetype, refuse and note it in the final summary

### Step 7 — Run `dude-lint`

Invoke `dude-lint` against the destination. Treat any `[FAIL]` as a hard stop:

- if the failure is recoverable (e.g., missing coordinator-only block in an agent the importer should have inserted), fix and re-run once
- if not, leave the file in place and surface the failure in Step 9 so the user can revert or fix manually

### Step 8 — Dependency report

For agents: list every referenced skill not yet present locally. For each, ask whether to import it as a separate `bundle-import` invocation. Do **not** auto-recurse. The user re-invokes the skill per dependency.

### Step 9 — Final summary

- what was imported (paths)
- what adaptations were applied
- what categories were skipped
- what dependencies remain unresolved
- any `dude-lint` warnings still standing
- next-step suggestions (e.g., "run `bundle-import` on `<dep-skill>` to satisfy the missing dependency")

## Adaptation Rules

| Source token / pattern                     | Default action                               |
|---                                         |---                                           |
| `Bash`, `Read`, `Write`, `Edit` (Anthropic tool names) | Suggest generic phrasing; do not auto-rewrite. |
| `Task` tool / "subagent" / "spawn agents"  | Flag as unsupported pattern; require manual review. |
| `claude -p`, `claude --print`, `present_files` | Flag as Claude-CLI-only; note in summary. |
| `compatibility:` frontmatter               | Strip.                                       |
| `model:` frontmatter                       | Strip (Copilot does not enforce this).       |
| `tools:` frontmatter (Anthropic-style)     | Strip by default; remap only if user opts in. |
| Persona drift ("I am Claude," etc.)        | Flag, do not auto-rewrite.                   |
| Missing coordinator-only block (non-coord agent) | Insert canonical block during Step 4. |

The canonical coordinator-only block (insert verbatim, with surrounding blank lines, near the end of the agent body):

```
**Coordinator-only artifacts:** do not edit `## Coordinator Log`, task-state glyphs in `tasks.md`, fenced regions (`<!-- dude:managed:* -->`, `<!-- dude:board:* -->`), or `status:` / `spec_path:` frontmatter. Report changes back to `@dude` instead.
```

Coordinator-equivalent agents (skip block insertion): files named `dude.agent.md`, `spec-lead.agent.md`, or any agent whose body explicitly claims authority over `## Coordinator Log`.

## Heavy-Import Detection

Each trigger below escalates the source to "needs explicit per-category confirmation" in Step 2 item 5. The user can still proceed; the skill simply refuses to silently pull executable code or runtime-dependent patterns.

- any `python`, `python3`, `pip`, `python -m` invocation in the body
- any `*.py` sibling file
- any `nohup`, background-server pattern, or `webbrowser.open()` reference
- HTML viewer / eval-viewer references
- `*.json` evals or benchmark scaffolding
- subagent-driven evaluation loops
- explicit MCP server names not present in the destination

## Overlap Detection

On both agent and skill imports:

- compute case-folded token overlap between the imported `description:` and every existing local artifact's `description:`
- flag when overlap ≥ 30% or when the scope/purpose section shares a near-duplicate first paragraph
- present matches in Step 2 item 9 with three options: **replace**, **coexist** (rename imported file to disambiguate), **cancel**

Examples worth catching: a Claude `skill-creator` overlaps with the local `skill-authoring`; a third-party `architect.agent.md` overlaps with the local `lead.agent.md`.

## Boundaries

- never auto-fetch transitive dependencies — each one requires a fresh `bundle-import` invocation
- never write executable code files (`*.py`, `*.js`, `*.sh` other than the bundle's own lint scripts) without explicit per-file confirmation
- never overwrite an existing destination without `replace` confirmation
- never publish, push, or modify remote state — this skill only reads remote and writes local
- never install runtimes (Python, Node, etc.); refuse the import if the source is unusable without one and the user has not explicitly accepted that
- the skill itself stays a single SKILL.md with no siblings, by design

## Dry-Run Mode

If the user prefixes the request with `dry-run`, stop after Step 2 and present the adaptation report only. No fetches beyond the primary file; no writes.
