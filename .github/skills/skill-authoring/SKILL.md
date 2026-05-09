---
name: "skill-authoring"
description: "Use when the user wants Dude to create a reusable skill, codify a team convention, save recurring workflow knowledge, or add a new `.github/skills/<name>/SKILL.md` file."
---

## Purpose

Create focused reusable skills that improve how Dude works across repeated tasks.

## Workflow

When the user asks for a skill:

1. Name the skill for the recurring pattern, not the immediate task.
2. Check `.github/skills/` to avoid duplicates.
3. Create `.github/skills/<name>/SKILL.md`.
4. Include YAML frontmatter with:
   - `name`
   - `description` (include explicit trigger phrases)
5. Write sections that make the skill practical:
   - purpose
   - rules or workflow
   - examples or anti-patterns when useful
6. Make the description explicit enough that Copilot can discover it later.
7. Run the `dude-lint` skill (`pwsh .github/skills/dude-lint/lint.ps1` or `bash .github/skills/dude-lint/lint.sh`) to confirm the new file did not introduce orphan `@<role>` references and that the bundle still passes structural checks. Fix any `[FAIL]` before announcing the skill.

## Description Rules

- Start descriptions with `Use when`.
- Describe triggering conditions, symptoms, or contexts.
- Do NOT summarize the full workflow in the description.
- Keep descriptions in third person and concrete enough for discovery.
- Include likely search terms or synonyms when useful.

Good:

- `Use when receiving review feedback or rejection findings, especially before implementing suggested changes or disputing them.`
- `Use when encountering a bug, failing test, unexpected behavior, or repeated unsuccessful fixes, before proposing or implementing a change.`

Bad:

- `Use for debugging by reproducing, tracing, and fixing root cause.`
- `I can help with reviews and debugging.`

## Authoring Rules

- Prefer small, focused skills over broad umbrella skills.
- Put heavy references or scripts in supporting files only when they materially reduce noise in `SKILL.md`.
- Avoid project status, one-off outputs, or current-task summaries.
- When a skill changes behavior in a critical way, sanity-check it against at least one realistic trigger scenario before considering it done.
- If the skill overlaps heavily with an agent's permanent role, tighten the scope or move the rule to the agent instead.

## Good Skill Targets

- domain-specific conventions (naming rules, style guides, quality standards)
- recurring coordination patterns (handoff protocols, review checklists)
- validation or constraint rules that specialists often forget
- process steps that repeat across tasks (release, onboarding, intake)
- debugging or troubleshooting procedures that recur

## Bad Skill Targets

- one-off task output
- project status snapshots
- content that belongs in a specific agent instead of shared workflow knowledge
