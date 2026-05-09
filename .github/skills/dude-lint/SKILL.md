---
name: "dude-lint"
description: "Use when validating bundle hygiene: checking brainstorm/tasks file shape, fence balance, durable task IDs, orphan agent-handle references, orphan skill-path references, memory file size, and coordinator-only boundary blocks."
---

# Dude Lint

Static validator for the bundle's structural conventions.

## Purpose

Catch the structural mistakes that would otherwise surface as runtime drift: malformed brainstorms, fence imbalance, stale `spec_path:` pointers, duplicate task IDs, oversized memory files, orphaned agent-handle references, and orphaned skill-path references.

The linter is **read-only** and **dependency-free**. It runs as either PowerShell (`lint.ps1`) or Bash (`lint.sh`); both produce identical findings and exit codes. No Python, Node, or other runtime is required.

## When To Run

- Before `@dude track`, to make sure brainstorm and tasks files import cleanly.
- Before publishing or exporting the bundle (see `dude-portability`).
- After a large refresh of the coordinator artifacts (renamed sections, new agents, large memory edits).

Other skills also call this one as their final verification step. When loaded as part of those flows, run the appropriate script and report `[FAIL]` items back to the calling skill before it declares its work done:

- `feature-definition` (Step 6) after writing or refreshing brainstorm and definition artifacts
- `team-expansion` (step 6) after creating or modifying an agent file
- `skill-authoring` (step 7) after creating a new `SKILL.md`
- `memory-ledger` (Verification) after writing to any `.github/dudestuff/*.md`
- `learning-promotion` (transitively, via `memory-ledger` for lessons and `skill-authoring` for new skills)
- `lightweight-execution` (close protocol step 6) after the coordinator updates a task glyph or regenerates the board region
- `spec-import-to-beads` (Import Algorithm step 2) before parsing brainstorm and tasks files
- `dude-portability` (Deploy step 5) after importing the bundle into a destination repo
- `bundle-import` (Step 7) after writing imported agent or skill files

## Usage

PowerShell (works on Windows, macOS, Linux with `pwsh`):

```pwsh
pwsh .github/skills/dude-lint/lint.ps1
pwsh .github/skills/dude-lint/lint.ps1 -Root C:\Work\AI\dude
```

Bash (works on macOS, Linux, WSL, Git Bash; uses only Bash 3.2-safe constructs so it runs under stock macOS `/bin/bash`):

```bash
bash .github/skills/dude-lint/lint.sh
bash .github/skills/dude-lint/lint.sh /path/to/repo
```

Exit code is `0` if no failures, `1` if any check produced a `[FAIL]`. Warnings do not fail the run.

## Checks

1. **Brainstorm files** (`brainstorm/*.md`)
   - YAML frontmatter present.
   - `status:` is `draft` or `defined`.
   - When `status: defined`, `spec_path:` is set, structurally matches `specs/<feature>/spec.md` with forward slashes, and resolves to an existing file (not a directory).
   - `<!-- dude:managed:start -->` / `<!-- dude:managed:end -->` fence pairs are both balanced **and** well-ordered (start, end, start, end, ...). Out-of-order or nested regions fail with the offending line number.
   - A `## Coordinator Log` heading is present (or `## Definition Record` is flagged as a rename candidate).

2. **Task files** (`specs/*/tasks.md`)
   - `<!-- dude:board:start -->` / `<!-- dude:board:end -->` fence pairs are balanced, ordered, and at most one pair exists. When the fence sequence is malformed, the parser does **not** enter board-skip mode, so canonical task rows after a stray fence are still validated.
   - The generated board region and `## Lightweight Execution History` block are ignored for canonical task validation.
   - Canonical task headers match the import-compatible shape from `spec-import-to-beads`: `- [ ] T001@a1b2c3d4 [P] [US1|Shared] Description`.
   - Task glyphs are exactly one of ` `, `~`, `!`, `x`.
   - Durable task IDs match `T\d{3,}@[a-z0-9]{8}` or legacy `T\d{3,}` (legacy emits a soft warning).
   - No duplicate canonical task IDs within the same file.

3. **Memory files** (`.github/dudestuff/*.md`)
   - Warn when top-level `- ` bullet count exceeds 20 (per `memory-ledger` consolidation threshold).

4. **Roster orphans**
   - Collect every `@<role>` reference under `.github/` (excluding fenced code blocks, including indented fences, and the `dude` and `dude-lint` allowlist).
   - Only collect `@<role>` when the `@` is not preceded by an alphanumeric or underscore character, so durable task IDs like `T001@g7h8i9j0` are not reported as orphan roles.
   - Fail for any handle that does not match an existing `.github/agents/<name>.agent.md`.

5. **Coordinator-only boundary block**
   - Fail when any `.github/agents/*.agent.md` (except `dude.agent.md` and `spec-lead.agent.md`) is missing the `**Coordinator-only artifacts:**` block from `team-expansion`. Spec-lead is exempt because its own Rules and Workflow step 11 explicitly authorize it to maintain `status:`, `spec_path:`, and `## Coordinator Log` during definition.

6. **Orphan skill references**
   - Collect every `.github/skills/<name>/...` path reference under `.github/**/*.md` (excluding fenced code blocks).
   - Fail for any `<name>` that does not match an existing `.github/skills/<name>/` directory.
   - Path-form is the only trigger; backticked skill names in prose are not flagged here, since the false-positive rate would be too high for a `[FAIL]` check. Wire-up references in agents and skills should always use the full `.github/skills/<name>/` path so this check can validate them.

## Output

```
[INFO]  Scanning .github + brainstorm + specs under <root>
[FAIL]  brainstorm/auth.md  status: defined but spec_path is missing
[WARN]  specs/001-auth/tasks.md:14  legacy task ID T003 (consider durable suffix)
[FAIL]  orphan @designer reference in .github/skills/project/SKILL.md
[FAIL]  orphan skill reference '.github/skills/made-up-skill/' in .github/agents/lead.agent.md
[WARN]  .github/dudestuff/decisions.md  35 entries (consider consolidation; threshold is 20)
[INFO]  Scanned: 1 brainstorm, 1 task file, 4 memory files, 8 agents
[INFO]  Findings: 2 warnings, 2 failures
```

## Boundaries

- The linter does **not** mutate state. Use `@dude self-check` for runtime drift detection (lane banner, manual `[x]` flips, append-only log).
- The linter does **not** validate Beads state. Use `bd ready --json` and `bd list --json` for that.
- The linter does **not** parse spec or plan content; only structural shape is checked.

## Boundaries For Coordinator Use

When `@dude` invokes this skill, it should:

1. Run the appropriate script for the user's shell.
2. Report findings verbatim.
3. Recommend the smallest corrective action per FAIL; do not auto-fix without an explicit user instruction.
