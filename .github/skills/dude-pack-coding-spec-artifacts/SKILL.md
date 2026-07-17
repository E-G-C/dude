---
name: dude-pack-coding-spec-artifacts
description: "Use when defining a software feature's .dude/specs/<feature>/ package: plan.md Technical Context fields (language, dependencies, storage, testing, platform, project type, performance) and the software supporting artifacts — data-model.md, contracts/api.md, contracts/schemas.md, quickstart.md, and ux/test/security(OWASP) checklists."
argument-hint: "the software feature being defined and which artifacts it needs"
---

# Coding Spec Artifacts

The software overlay for the generic feature-definition workflow. `@dude-spec-lead`
loads this when defining a **software** feature so that `spec.md` / `plan.md` /
`tasks.md` stay technology-agnostic while the software-specific package details
live here. Create only the artifacts the feature actually needs — a lean package
is still preferred over placeholder scaffolding.

## Software Feature Directory

When they materially apply, a software feature package looks like:

```text
.dude/specs/
└── 001-feature-name/
    ├── spec.md
    ├── plan.md
    ├── research.md
    ├── data-model.md
    ├── quickstart.md
    ├── tasks.md
    ├── contracts/
    │   ├── api.md
    │   └── schemas.md
    └── checklists/
        ├── ux.md
        ├── test.md
        └── security.md
```

## `plan.md` Technical Context (software fields)

Fill these in the plan's **Technical Context** section, marking unknowns as
`NEEDS CLARIFICATION`:

```markdown
**Language/Version**: [e.g., Python 3.11, TypeScript 5.x]
**Primary Dependencies**: [e.g., FastAPI, React]
**Storage**: [e.g., PostgreSQL, SQLite, N/A]
**Testing**: [e.g., pytest, vitest]
**Target Platform**: [e.g., Linux server, browser, iOS]
**Project Type**: [e.g., library, CLI, web-service, mobile-app]
**Performance Goals**: [domain-specific or NEEDS CLARIFICATION]
**Constraints**: [domain-specific or NEEDS CLARIFICATION]
```

## Supporting Artifacts

Create only the artifacts the feature actually needs:

- `research.md` for technical decisions and unknowns
- `data-model.md` for entities and relationships
- `contracts/api.md` for endpoints and shapes
- `contracts/schemas.md` for validation or shared data contracts
- `quickstart.md` for feature smoke-test steps and manual verification flows

A lean package is preferred over scaffolding placeholder files for artifacts that
do not apply to the feature.

## Checklist Files

Software quality-gate checklists under `checklists/`. Create a file only when that
kind of check materially applies to the feature.

- `checklists/ux.md` — user-facing quality checks: content copy, empty/loading/error
  states, accessibility (WCAG 2.1 AA), keyboard navigation, responsive breakpoints,
  and any design-system conformance the feature must satisfy.
- `checklists/test.md` — verification coverage the tester must confirm before
  acceptance: acceptance scenarios from `spec.md`, edge cases, regression hotspots,
  and any manual QA steps that cannot be automated.
- `checklists/security.md` — security-relevant checks for the feature: authN/authZ
  boundaries, input validation at trust boundaries, secret handling, sensitive-data
  storage and logging, and relevant OWASP Top 10 risks.

Each checklist is a plain markdown list of `- [ ]` items. Keep items testable and
specific to this feature — do not restate generic project rules that already live
in `.dude/memory/guardrails.md` or `.github/skills/project/SKILL.md`.

During Lightweight Execution and Beads import preparation, checklist files are
advisory reference, not a second live execution board. Do not mirror `tasks.md`
completion state into checklist files unless the project explicitly requires that
extra workflow.
