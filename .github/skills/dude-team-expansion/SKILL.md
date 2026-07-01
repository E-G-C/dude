---
name: "dude-team-expansion"
description: "Use when the user wants to hire a new agent, add a specialist, change the active roster, or create a new `.github/agents/*.agent.md` file."
---

## Purpose

Expand the active roster without introducing confusion or overlapping roles.

## Workflow

When the user supplies a URL or names an external repository as the source of the agent (e.g. "import this agent from `<url>`", "copy `<owner>/<repo>` agent"), do not author from the template here. Route to the `dude-bundle-import` skill instead, which fetches, adapts, and writes the file with explicit per-category confirmation. This skill stays focused on authoring new agents from scratch in the local bundle.

When the user asks for a new agent:

1. Determine the agent's role and specialization within the project's domain.
2. Choose a simple, durable slug that reflects the role (e.g. `chef`, `security`, `docs`, `decorator`, `logistics`). For project-local agents, reserve the path with the `dude-local-` prefix: `.github/agents/dude-local-<slug>.agent.md`.
3. Create `.github/agents/dude-local-<slug>.agent.md` unless the user explicitly says they are adding a new upstream/base Dude agent that will be shipped in the bundle manifest.
4. Include:
   - frontmatter with `name` and `description`
   - scope
   - rules or boundaries
   - memory awareness
   - concise return format
5. Update coordinator routing and any authority ownership so the agent becomes reachable without ambiguity.
6. Run the `dude-lint` skill (`node .github/skills/dude-lint/lint.mjs`) to verify the new agent file carries the required `**Coordinator-only artifacts:**` block and that no orphan `@<role>` references were introduced. Fix any `[FAIL]` before announcing the new specialist.
7. Confirm the new specialist and when to use it.

## Scaffolder (`scaffold-agent.mjs`)

To create the file with the required shape in one deterministic step (frontmatter,
the mandatory `**Coordinator-only artifacts:**` block, LF endings — guaranteed
lint-clean), use the scaffolder instead of hand-writing the skeleton:

```bash
node .github/skills/dude-team-expansion/scaffold-agent.mjs <slug> [--role "..."] [--desc "..."]
node .github/skills/dude-team-expansion/scaffold-agent.mjs <slug> --pack <name>   # dude-pack-<name>-<slug> + pack.md provides
```

Local (default) writes `dude-local-<slug>.agent.md`; `--pack` writes the pack
artifact and inserts the id into that pack's `pack.md` `provides.agents`. Then
fill in the scope/boundaries/rules content and update coordinator routing.

## Design Rules

- Prefer narrow specialists with a clear lane.
- Avoid duplicate roles that create routing ambiguity.
- Use the reserved `dude-local-` prefix for project-local agents so upstream Dude releases never claim the same path by accident.
- Treat the agent handle as `@dude-local-<slug>` for routing references when the file is project-local.
- Use the description as the discovery surface.
- Do not create a new agent if a skill would solve the need better.
- Treat existing specialists as current assignments, not immutable ownership.

## Agent Template

When creating a new agent, use this structure:

```markdown
---
name: "dude-team-expansion"
description: "<Role> specialist for <one-line scope description>."
tools: [<appropriate tool list>]
---

You are the <role> specialist.

**Coordinator-only artifacts:** do not edit `## Coordinator Log`, task-state glyphs in `tasks.md`, fenced regions (`<!-- dude:managed:* -->`, `<!-- dude:board:* -->`), or `status:` / `spec_path:` frontmatter. Report changes back to `@dude` instead.

## Scope

- <domain skill 1>
- <domain skill 2>
- <domain skill 3>

## Boundaries

- Do NOT <things outside this agent's scope>
- Do NOT <overlap with existing agents>

## Rules

- Check `.github/dudestuff/` for relevant decisions, guardrails, context, and lessons before working.
- Check `.github/skills/project/SKILL.md` if it exists for project conventions.
- Check `.github/skills/` for any other skills whose description matches the current task.
- <domain-specific rule 1>
- <domain-specific rule 2>

## Return Format

Return:

- what was done or recommended
- validation performed
- blockers or follow-up items

If you overcome a non-trivial challenge, tell the coordinator what was learned.
```

## Standard Tool Sets

Pick the right tool configuration for the agent's role:

| Role Type | Tools |
|-----------|-------|
| **Read-heavy** (reviewers, analysts) | `["read/readFile", "search/listDirectory", "search/codebase", "search/fileSearch", "search/textSearch", "execute/runInTerminal", "read/problems"]` |
| **Write-heavy** (implementers) | `["read/readFile", "edit/createFile", "edit/editFiles", "execute/runInTerminal", "search/listDirectory", "search/codebase", "search/fileSearch", "search/textSearch"]` |
| **Orchestrators** | Add `"agent"` to the write-heavy list |

## Use A Skill Instead Of An Agent When

- the user needs reusable domain guidance, not a new role
- the knowledge applies across several specialists
- the behavior is workflow-oriented rather than persona-oriented
