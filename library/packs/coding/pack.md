---
name: coding
description: "Software-development specialists for implementation, architecture, testing, and independent code review, with shared engineering standards."
use-cases: [software-development]
provides:
  agents: [dude-pack-coding-architect, dude-pack-coding-coder, dude-pack-coding-reviewer, dude-pack-coding-tester]
  skills: [dude-pack-coding-spec-artifacts]
  instructions:
    - dude-pack-coding-engineering-standards
    - dude-pack-coding-host-controls
requires:
  tools: []
hooks: []
---

# Coding Pack

Four software specialists with shared engineering standards. The profiles are
adapted from the `engineering-agents/dude-handoff` snapshot and retain Dude's
existing agent identities. Dude's core continues to own coordination,
feature-definition delegation, execution state, and work-product readiness.

Routine bounded requests can go straight to the coder without a preexisting
brainstorm, specification, or `tasks.md`. The coder handles related tests and
local design; the architect handles unresolved consequential design decisions.
Existing definition, approval, and independent-verification gates still apply.

## Provides

- `dude-pack-coding-coder` — implementation, debugging, focused refactoring,
  integration, routine tests, and related documentation from a direct request
  or assigned task.
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
- `dude-pack-coding-engineering-standards` — shared scope, reuse, evidence,
  role-selection, and handoff rules, explicitly loaded by all four agents.
- `dude-pack-coding-host-controls` — host capability and isolation guidance;
  the profiles do not enforce permissions by themselves.
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

The pack keeps the display names `Architect`, `Coder`, `Tester`, and
`Code Reviewer`, their logical model classes, and leaf-agent declarations.
Architect has no command-execution selector; Code Reviewer has neither edit
nor execution selectors. Unsupported upstream `web` selectors are omitted.
Concrete models continue to come from the bundle's model configuration.

Both shared instruction files use
`applyTo: ".github/agents/dude-pack-coding-*.agent.md"`. Each profile explicitly
loads the standards for its assigned work, so the pack does not depend on
automatic instruction attachment to application files or a source-directory
fallback. The standards link to the colocated host-controls document.

Specialists return findings to Dude instead of dispatching peers or advancing
tasks. Spec Lead retains definition writes, the generic Reviewer retains
work-product readiness, and only Dude mutates execution state or closes work.

## Install / refresh / remove

```bash
@dude add pack coding
@dude remove pack coding
```

For a local source update, preview with
`node .github/skills/dude-compose/compose.mjs refresh coding --dry-run --json`,
then confirm before `refresh coding --json`. Refresh projects the agents and
shared instructions together and can overwrite installed edits; do not update
generated `.github` profiles by hand.
