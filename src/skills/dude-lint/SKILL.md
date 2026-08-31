---
name: "dude-lint"
description: "Use when validating Dude workspace and bundle hygiene: checking .dude idea/tasks/state shape, canonical identities, skill frontmatter names, bundle manifest shape, orphan references, memory size, coordinator-only boundaries, and generated Copilot profiles. Do NOT use to lint or format project source code, which belongs to the project's own linter."
---

# Dude Lint

Static validator for the bundle's structural conventions.

## Purpose

Catch the structural mistakes that would otherwise surface as runtime drift: malformed numbered ideas, ambiguous feature ownership, invalid task audit breadcrumbs, fence imbalance, stale `spec_path:` pointers, duplicate task IDs, oversized memory files, skill frontmatter/name drift, bundle manifest shape violations, orphaned agent-handle references, orphaned skill-path references, and source-only `model-class` leaking into an owned generated Copilot profile.

The linter is **read-only** and dependency-free beyond Node.js itself (Node >= 20 LTS, standard library only). It runs as a single Node script (`lint.mjs`). Node is a documented maintenance-time dependency: it is required only to run bundle tooling such as this linter and `@dude upgrade`, not for normal project work.

## Agent Source And Configuration Boundary

- Core and catalog-pack agent sources are canonical. `src/config/agent-models.json`
  is the canonical concrete-model and class-effort configuration.
- Builds package that configuration byte-for-byte at
  `.github/skills/dude-engine/config/agent-models.json`. Lint loads that exact
  packaged path after its workspace-root safety gate; it has no default, search,
  or fallback configuration location.
- `.github/agents/*.agent.md` is the only generated agent tree. Copilot emits
  one profile per source; class effort is validated intent and is not emitted.
- Claude and SDK are documentation-only adapter contracts. They have no generated
  files, ownership, lint, or drift behavior.

## When To Run

- Before `@dude track`, to make sure idea and task files resolve one exact feature identity.
- Before publishing or exporting the bundle (see `dude-portability`).
- After a large refresh of the coordinator artifacts (renamed sections, new agents, large memory edits).

Other skills also call this one as their final verification step. When loaded as part of those flows, run the appropriate script and report `[FAIL]` items back to the calling skill before it declares its work done:

- `dude-feature-definition` (`## Validation And Handoff`) after writing or refreshing idea and definition artifacts
- `dude-team-expansion` (`## Workflow`) after creating or modifying an agent file
- `dude-skill-authoring` (`## Workflow`) after creating a new `SKILL.md`
- `dude-memory-ledger` (`## Verification`) after writing to any `.dude/memory/*.md`
- `dude-learning-promotion` (transitively, via `dude-memory-ledger` for lessons and `dude-skill-authoring` for new skills)
- `dude-lightweight-execution` (`## Lightweight Close Protocol`) after the coordinator updates a task glyph or regenerates the board region
- `dude-pack-beads-spec-import` (`## Import Algorithm`) before parsing idea and task files
- `dude-portability` (`## Deploy Or Import`) after importing the bundle into a destination repo
- `dude-bundle-import` (`## Workflow`) after writing imported agent or skill files
- `dude-bundle-upgrade` (`## Workflow`) after writing upgraded base-owned files and refreshing the manifest

## Usage

Node.js (>= 20 LTS; works on Windows, macOS, Linux):

```bash
node .github/skills/dude-lint/lint.mjs
node .github/skills/dude-lint/lint.mjs /path/to/repo
```

`lint.mjs` is the single, canonical implementation. The previous `lint.sh` / `lint.ps1` parity scripts have been removed; all callers now invoke `lint.mjs` via `node`.

The shared namespace/ownership logic lives in `.github/skills/dude-engine/lib/ownership.mjs` and is reused by `dude-bundle-upgrade`, so both tools classify the core / pack / local tiers identically.

Exit code is `0` if no failures, `1` if any check produced a `[FAIL]`. Warnings do not fail the run.

Unit tests for the shared ownership module:

```bash
node --test .github/skills/dude-engine/lib/ownership.test.mjs
```

## Checks

1. **Idea files** (`.dude/ideas/*.md`)
   - Only direct regular `.md` children are supported. A nested directory, non-Markdown file, symbolic link, non-regular entry, or unsafe canonical root/ancestor fails with its path.
   - Canonical current-format identity is exactly `.dude/ideas/<NNN>-<slug>.md`, with ASCII `001` through `999` and a suffix exactly matching frontmatter `slug:`. Unnumbered, malformed, out-of-range, duplicate-number, duplicate-slug, and filename/slug-mismatch identities fail.
   - Strict YAML frontmatter is present, including unique scalar keys and balanced quoted scalars.
   - `status:` is exactly `draft`, `defined`, or `resolved`. An exact
     `resolved` ledger has an exactly empty unnormalized `spec_path:` and no
     definition owner; any other resolved shape fails canonical ownership validation.
   - When `status: defined`, `spec_path:` is set, structurally matches `.dude/specs/<NNN>-<slug>/spec.md` with forward slashes, resolves to an existing file (not a directory), and has the matching lifecycle number and slug. Exact `spec_path:` remains the sole owner relation.
   - `<!-- dude:managed:start -->` / `<!-- dude:managed:end -->` fence pairs are both balanced **and** well-ordered (start, end, start, end, ...). Out-of-order or nested regions fail with the offending line number.
   - Exactly one real `## Idea` and exactly one real `## Coordinator Log` heading exist outside CommonMark backtick and tilde fenced blocks. Missing or duplicate headings fail; a noncanonical `## User Draft` heading is not valid in a canonical idea.
   - Every defined `spec_path:` has one unique idea owner. Duplicate owners fail and report every conflicting idea path.

2. **Task files** (`.dude/specs/*/tasks.md`)
   - Every file carries one exact audit breadcrumb. In an unrendered file it is the literal first line. In a rendered file, the recognized board block plus canonical notice form a generated preamble, and the breadcrumb is the **first canonical line** immediately after that preamble. A similar comment later in the file is not accepted.
   - Canonical form is exactly `<!-- audit log: .dude/ideas/<NNN>-<slug>.md#coordinator-log -->`, where the target is the exact current direct owner filename. The target must exist and be the unique defined idea whose exact `spec_path:` equals the package's sibling `spec.md`; matching numbers, slugs, titles, or directories never establish ownership. Missing targets, mismatches, missing owners, and duplicate owners fail with the package, breadcrumb, and candidate paths.
   - `<!-- dude:board:start -->` / `<!-- dude:board:end -->` fence pairs are balanced, ordered, and at most one pair exists. When the fence sequence is malformed, the parser does **not** enter board-skip mode, so canonical task rows after a stray fence are still validated.
   - The generated board region is ignored for canonical task validation.
   - `## Lightweight Execution History` is terminal archive context: task rows inside it are ignored. Sections after history (for example a `## Notes` appendix) are allowed and parsed normally, but a duplicate `## Lightweight Execution History` heading fails, and any canonical task row that appears below history fails so active or mirrored task rows cannot be hidden under the archive.
   - `## Discovered During Execution` task rows must use the reserved `T9001`-`T9999` range and carry a well-formed `(Beads: <id>)` tag with optional semicolon metadata inside the closing parenthesis. `T9000` and higher task IDs outside this section fail so spec-derived tasks stay below `T9000`.
   - Canonical task headers match the import-compatible shape from `dude-pack-beads-spec-import`: `- [ ] T001@a1b2c3d4 [P] [US1|Shared] Description`.
   - Task glyphs are exactly one of ` `, `~`, `!`, `x`.
   - Durable task IDs match `T\d{3,}@[a-z0-9]{8}`.
   - No duplicate canonical task IDs within the same file.

3. **Task-state snapshot** (`.dude/state/task-state.json`)
   - Fail malformed JSON or keys that do not match `.dude/specs/<NNN>-<slug>/tasks.md`.

4. **Memory files** (`.dude/memory/*.md`)
   - Warn when top-level `- ` bullet count exceeds 20 (per `dude-memory-ledger` consolidation threshold).

5. **Skill frontmatter names** (`.github/skills/*/SKILL.md`)
   - Fail when a skill directory is missing `SKILL.md`.
   - Fail when skill frontmatter is missing or malformed.
   - Fail when `name:` does not exactly match the containing skill directory name, including the `dude-` prefix for shipped skills.
   - Fail when `description:` is missing or empty; applicability matching reads it, so a skill without one is silently unreachable. A multi-line plain scalar counts as present.

6. **Bundle manifest** (`.dude/metadata/bundle-manifest.md`)
   - Fail when the seeded manifest is missing.
   - Fail when the fenced JSON manifest block is missing or malformed.
   - Fail when the manifest contains anything other than the metadata fields (`source_repo`, `source_ref`, `installed_ref`), or when a required field (`source_repo` / `source_ref`) is absent. `installed_ref` is optional.
   - The manifest is **metadata only**. Base ownership is derived from the namespace convention by the engine, not from a manifest list. Local edits to base files are silently overwritten on `@dude upgrade`; use the reserved `dude-local-<slug>` namespace to fork base files you want to customize.

7. **Namespace advisories (core / pack / local tiers)**
   - Ownership is derived from the namespace convention by the shared classifier in `dude-engine`. Three reserved tiers are never warned: **core** (`dude.agent.md`, `dude-<slug>.agent.md`, `dude-<slug>/` skills), **pack** (`dude-pack-<pack>-<slug>`), and **local** (`dude-local-<slug>`).
   - Warn when an agent file under `.github/agents/` falls outside all three tiers (an unreserved, project-owned agent). The recommendation is to rename to `.github/agents/dude-local-<slug>.agent.md`.
   - Warn when a top-level skill directory under `.github/skills/` falls outside all three tiers and is not the reserved `.github/skills/project/` skill. The recommendation is to rename to `.github/skills/dude-local-<slug>/`.
   - Exempt `.github/skills/project/`, which is the reserved project knowledge skill.

8. **Roster orphans**
   - Collect every `@<role>` reference under `.github/` (excluding fenced code blocks, including indented fences, and the `dude` and `dude-lint` allowlist).
   - Only collect `@<role>` when the `@` is not preceded by an alphanumeric or underscore character, so durable task IDs like `T001@g7h8i9j0` are not reported as orphan roles.
   - Fail for any handle that does not match an existing `.github/agents/<name>.agent.md`.
   - Placeholder examples such as `@dude-local-<slug>` and `@dude-pack-<pack>-<slug>` are ignored after placeholder stripping, but real `@dude-local-*` and `@dude-pack-*` handles must resolve to actual agent files.

9. **Direct-agent authoring contract**
   - Fail when any direct `.github/agents/*.agent.md` except `dude.agent.md` does not contain exactly one exact level-2 `## Scope` heading with non-whitespace content before the next level-2 heading or EOF. Missing, duplicate, and empty or whitespace-only Scope sections fail. Scope content has no required bullet grammar or minimum length. `dude-spec-lead.agent.md` is not exempt from this Scope requirement.
   - Fail when any `.github/agents/*.agent.md` (except `dude.agent.md` and `dude-spec-lead.agent.md`) is missing the `**Coordinator-only artifacts:**` block from `dude-team-expansion`. Spec Lead is exempt because `Spec Lead ## Required Workflow` and `Feature Definition ## First Definition Transaction` explicitly delegate definition-time maintenance of `status:`, exact `spec_path:`, managed definition regions, and definition `## Coordinator Log` events.

10. **Orphan skill references**
   - Collect every `.github/skills/<name>/...` path reference under `.github/**/*.md` (excluding fenced code blocks).
   - Fail for any `<name>` that does not match an existing `.github/skills/<name>/` directory.
   - Placeholder examples such as `.github/skills/dude-local-<slug>/` and `.github/skills/dude-pack-<pack>-<slug>/` are ignored after placeholder stripping, but real `.github/skills/dude-local-*/` and `.github/skills/dude-pack-*/` references must resolve to actual skill directories.
   - Path-form is the only trigger; backticked skill names in prose are not flagged here, since the false-positive rate would be too high for a `[FAIL]` check. Wire-up references in agents and skills should always use the full `.github/skills/<name>/` path so this check can validate them.

11. **Generated Copilot profiles** (`.github/agents/*.agent.md`)
    - Scan direct profile files only. Scope is decided by each file's namespace;
     core and pack tiers are checked, while local and project tiers are exempt.
    - Fail when an owned profile declares the source-only `model-class` key. A
     source class belongs in canonical source, never in its Copilot output.
    - Do not compare an installed profile's `model:` literal with configuration:
     the host may rewrite that one value.

## Output

```
[INFO]  Scanning .github + .dude under <root>
[FAIL]  .dude/ideas/auth.md  status: defined but spec_path is missing
[FAIL]  .dude/specs/001-auth/tasks.md  audit breadcrumb target mismatch for package .dude/specs/001-auth/spec.md: .dude/ideas/other.md points to .dude/specs/002-other/spec.md, but the unique owner is .dude/ideas/auth.md; candidate owners: .dude/ideas/auth.md
[FAIL]  orphan @designer reference in .github/skills/project/SKILL.md
[FAIL]  orphan skill reference '.github/skills/made-up-skill/' in .github/agents/dude-reviewer.agent.md
[WARN]  .dude/memory/decisions.md  35 entries (consider consolidation; threshold is 20)
[INFO]  Scanned: 2 idea(s), 1 task file(s), 4 memory file(s), 8 agent(s)
[INFO]  Findings: 1 warning(s), 4 failure(s)
```

## Boundaries

- The linter does **not** mutate state. Use `@dude self-check` for runtime drift detection (lane banner, manual `[x]` flips, append-only log).
- The linter does **not** validate Beads state. Use `bd ready --json` and `bd list --all --limit 0 --json` for that.
- The linter does **not** parse spec or plan content; only structural shape is checked.

## Boundaries For Coordinator Use

When `@dude` invokes this skill, it should:

1. Run the appropriate script for the user's shell.
2. Report findings verbatim.
3. Recommend the smallest corrective action per FAIL; do not auto-fix without an explicit user instruction.
