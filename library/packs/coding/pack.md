---
name: coding
description: "Software-development specialists — coder, tester, architect, and code-reviewer. The coding-domain pack for using Dude on software projects."
provides:
  agents: [dude-pack-coding-architect, dude-pack-coding-coder, dude-pack-coding-reviewer, dude-pack-coding-tester]
  skills: [dude-pack-coding-spec-artifacts]
requires:
  tools: []
hooks: []
---

# Coding Pack

The software-development domain pack. Install it on a coding project to add the
specialists that a generic Dude core intentionally leaves out: an implementer, a
tester, an architect, and a code-reviewer. Dude's generic core keeps only the
definition (`spec-lead`) and generic approve/reject (`reviewer`) roles; software
expertise lives here so non-coding domains (design, restaurant, content, …) are
not saddled with it.

## Provides

- `dude-pack-coding-coder` — implements features from `tasks.md`: writes code,
  wires modules, follows project conventions, hands off to the tester.
- `dude-pack-coding-tester` — test authoring (unit, integration, E2E),
  regression coverage, edge cases, reproduction steps, and acceptance
  validation for software work.
- `dude-pack-coding-architect` — architecture and system shape: decomposition,
  tradeoffs, schema and migrations, tech-stack selection, module boundaries,
  interface contracts.
- `dude-pack-coding-reviewer` — code review for correctness, readability,
  maintainability, security (OWASP Top 10), and obvious performance
  anti-patterns, on top of the generic approve/reject that core's
  `dude-reviewer` already provides.
- `dude-pack-coding-spec-artifacts` — the software overlay for feature
  definition: the `plan.md` Technical Context fields and the software artifacts
  (data model, API/schema contracts, quickstart, and ux/test/security checklists)
  that `@dude-spec-lead` layers on top of the generic `spec`/`plan`/`tasks`
  package when defining a software feature.

## When installed

The coordinator can route implementation to `@dude-pack-coding-coder`,
verification to `@dude-pack-coding-tester`, architecture questions to
`@dude-pack-coding-architect`, and code review to `@dude-pack-coding-reviewer` —
in addition to the generic `dude-reviewer` in core.

## Install / remove

```bash
@dude add pack coding
@dude remove pack coding
```
