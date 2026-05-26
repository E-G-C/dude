---
name: "dude-lint"
description: "Use when validating bundle hygiene: checking brainstorm/tasks file shape, fence balance, durable task IDs, skill frontmatter names, bundle manifest shape, orphan agent-handle references, orphan skill-path references, memory file size, and coordinator-only boundary blocks."
---

# Dude Lint

Static validator for the bundle's structural conventions.

## Purpose

Catch the structural mistakes that would otherwise surface as runtime drift: malformed brainstorms, fence imbalance, stale `spec_path:` pointers, duplicate task IDs, oversized memory files, skill frontmatter/name drift, bundle manifest shape violations, orphaned agent-handle references, and orphaned skill-path references.

The linter is **read-only** and **dependency-free**. It runs as either PowerShell (`lint.ps1`) or Bash (`lint.sh`); both produce identical findings and exit codes. No Python, Node, or other runtime is required.

## When To Run

- Before `@dude track`, to make sure brainstorm and tasks files import cleanly.
- Before publishing or exporting the bundle (see `dude-portability`).
- After a large refresh of the coordinator artifacts (renamed sections, new agents, large memory edits).

Other skills also call this one as their final verification step. When loaded as part of those flows, run the appropriate script and report `[FAIL]` items back to the calling skill before it declares its work done:

- `dude-feature-definition` (Step 6) after writing or refreshing brainstorm and definition artifacts
- `dude-team-expansion` (step 6) after creating or modifying an agent file
- `dude-skill-authoring` (step 7) after creating a new `SKILL.md`
- `dude-memory-ledger` (Verification) after writing to any `.github/dudestuff/*.md`
- `dude-learning-promotion` (transitively, via `dude-memory-ledger` for lessons and `dude-skill-authoring` for new skills)
- `dude-lightweight-execution` (close protocol step 6) after the coordinator updates a task glyph or regenerates the board region
- `dude-spec-import-to-beads` (Import Algorithm step 2) before parsing brainstorm and tasks files
- `dude-portability` (Deploy step 5) after importing the bundle into a destination repo
- `dude-bundle-import` (Step 7) after writing imported agent or skill files
- `dude-bundle-upgrade` (Step 9) after writing upgraded base-owned files and refreshing the manifest

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
   - A `## Coordinator Log` heading is present.

2. **Task files** (`specs/*/tasks.md`)
   - `<!-- dude:board:start -->` / `<!-- dude:board:end -->` fence pairs are balanced, ordered, and at most one pair exists. When the fence sequence is malformed, the parser does **not** enter board-skip mode, so canonical task rows after a stray fence are still validated.
   - The generated board region is ignored for canonical task validation.
   - `## Lightweight Execution History` is terminal archive context: task rows inside it are ignored. Sections after history (for example a `## Notes` appendix) are allowed and parsed normally, but a duplicate `## Lightweight Execution History` heading fails, and any canonical task row that appears below history fails so active or mirrored task rows cannot be hidden under the archive.
   - `## Discovered During Execution` task rows must use the reserved `T9001`-`T9999` range and carry a well-formed `(Beads: <id>)` tag with optional semicolon metadata inside the closing parenthesis. `T9000` and higher task IDs outside this section fail so spec-derived tasks stay below `T9000`.
   - Canonical task headers match the import-compatible shape from `dude-spec-import-to-beads`: `- [ ] T001@a1b2c3d4 [P] [US1|Shared] Description`.
   - Task glyphs are exactly one of ` `, `~`, `!`, `x`.
   - Durable task IDs match `T\d{3,}@[a-z0-9]{8}`.
   - No duplicate canonical task IDs within the same file.

3. **Memory files** (`.github/dudestuff/*.md`)
   - Warn when top-level `- ` bullet count exceeds 20 (per `dude-memory-ledger` consolidation threshold).

4. **Skill frontmatter names** (`.github/skills/*/SKILL.md`)
   - Fail when a skill directory is missing `SKILL.md`.
   - Fail when skill frontmatter is missing or malformed.
   - Fail when `name:` does not exactly match the containing skill directory name, including the `dude-` prefix for shipped skills.

5. **Bundle manifest** (`.github/dudestuff/bundle-manifest.md`)
   - Fail when the seeded manifest is missing.
   - Fail when the fenced JSON manifest block is missing or malformed.
   - Fail when the manifest contains anything other than the four metadata fields (`source_repo`, `source_ref`, `installed_sha`, `installed_at`), when any required field is absent, or when `installed_sha` is not a 40-character lowercase git sha.
   - The manifest is **metadata only**: no `files` array, no per-file hashes. Base ownership is derived from the namespace convention by the engine, not from a manifest list. Local edits to base files are silently overwritten on `@dude upgrade`; use the reserved `dude-local-<slug>` namespace to fork base files you want to customize.

6. **Project-local namespace advisories**
   - Warn when an agent file under `.github/agents/` is neither `dude.agent.md` nor matches `dude-<slug>.agent.md` (with or without the `local-` prefix). The recommendation is to rename to `.github/agents/dude-local-<slug>.agent.md`.
   - Warn when a top-level skill directory under `.github/skills/` does not match `dude-<slug>` (with or without the `local-` prefix) and is not the reserved `.github/skills/project/` skill. The recommendation is to rename to `.github/skills/dude-local-<slug>/`.
   - Exempt `.github/skills/project/`, which is the reserved project knowledge skill.

7. **Roster orphans**
   - Collect every `@<role>` reference under `.github/` (excluding fenced code blocks, including indented fences, and the `dude` and `dude-lint` allowlist).
   - Only collect `@<role>` when the `@` is not preceded by an alphanumeric or underscore character, so durable task IDs like `T001@g7h8i9j0` are not reported as orphan roles.
   - Fail for any handle that does not match an existing `.github/agents/<name>.agent.md`.
   - Placeholder examples such as `@dude-local-<slug>` are ignored after placeholder stripping, but real `@dude-local-*` handles must resolve to actual agent files.

8. **Coordinator-only boundary block**
   - Fail when any `.github/agents/*.agent.md` (except `dude.agent.md` and `dude-spec-lead.agent.md`) is missing the `**Coordinator-only artifacts:**` block from `dude-team-expansion`. Spec-lead is exempt because its own Rules and Workflow step 11 explicitly authorize it to maintain `status:`, `spec_path:`, and `## Coordinator Log` during definition.

9. **Orphan skill references**
   - Collect every `.github/skills/<name>/...` path reference under `.github/**/*.md` (excluding fenced code blocks).
   - Fail for any `<name>` that does not match an existing `.github/skills/<name>/` directory.
   - Placeholder examples such as `.github/skills/dude-local-<slug>/` are ignored after placeholder stripping, but real `.github/skills/dude-local-*/` references must resolve to actual skill directories.
   - Path-form is the only trigger; backticked skill names in prose are not flagged here, since the false-positive rate would be too high for a `[FAIL]` check. Wire-up references in agents and skills should always use the full `.github/skills/<name>/` path so this check can validate them.

## Output

```
[INFO]  Scanning .github + brainstorm + specs under <root>
[FAIL]  brainstorm/auth.md  status: defined but spec_path is missing
[FAIL]  orphan @designer reference in .github/skills/project/SKILL.md
[FAIL]  orphan skill reference '.github/skills/made-up-skill/' in .github/agents/dude-lead.agent.md
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
