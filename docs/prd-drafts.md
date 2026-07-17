# Starting From A PRD Draft

[Back to root README](../README.md) | [Docs index](README.md) | [Workflow modes](workflow.md)

If you already have a product requirements draft in markdown, treat it as raw
input for `@dude brainstorm`.

The same three lanes apply when you start from a PRD draft. Dude does not send
the PRD directly to Beads. Brainstorm first captures the source in one flat
`.dude/ideas/<slug>.md` collaboration file without creating a spec package;
define then creates the normal package under `.dude/specs/<feature>/`. Stop
there for Definition Only, continue from `tasks.md` for Lightweight Execution,
or run `@dude track` if you want Tracked Execution.

## Practical flow

1. Write or collect your PRD draft or product brief in markdown.
2. Ask `@dude` to brainstorm that input.
3. Let `@dude-spec-lead` normalize it inside `.dude/ideas/<slug>.md`.
4. Resolve clarification questions in the same idea file.
5. Define the idea into the normal package.
6. If you want implementation without Beads, continue from `tasks.md`, starting with the generated board view when present.
7. If you want tracked execution, run `@dude track`.

```mermaid
flowchart LR
  PRD["PRD draft or product brief\nMarkdown document"] --> DUDE["@dude brainstorm"]
  DUDE --> IDEA[".dude/ideas/<slug>.md\ncollaboration file"]
  IDEA --> SPEC["@dude-spec-lead\nnormalizes intent"]
    SPEC --> CLARIFY{"Material ambiguity?"}
    CLARIFY -->|Yes| Q["Ask focused clarifications"]
  Q --> IDEA
    CLARIFY -->|No| PACKAGE["Define into .dude/specs/<feature>/\nspec.md + plan.md + tasks.md"]
    PACKAGE --> REVIEW["Optional review\n@dude-reviewer"]
    REVIEW --> EXECMODE{"Execution lane?"}
    EXECMODE -->|Definition Only| STOP["Stop at reusable package"]
    EXECMODE -->|Lightweight Execution| LIGHT["Execute from tasks.md\nvia @dude"]
    EXECMODE -->|Tracked Execution| IMPORT[@dude track\nautomatic handoff]
    IMPORT --> EXEC["Execute from Beads\nvia @dude"]
```

## What to ask Dude

Assume your PRD draft is at `docs/prd/<feature>.md`.

Start with brainstorm:

```text
@dude brainstorm docs/prd/<feature>.md
```

Then move into the normal package:

```text
@dude define <slug>
```

If you want tracked execution afterwards:

```text
@dude track
```

If you want implementation without Beads afterwards, keep working from
`.dude/specs/<feature>/tasks.md` and use `@dude status` for orientation.

If the PRD draft covers more than one feature, ask Dude to split it before
planning:

```text
@dude brainstorm docs/prd/billing.md and split it into separate idea files before definition
```

## What Dude produces from the PRD

The PRD draft or product brief remains source input, but Dude turns it into two
working layers:

- `.dude/ideas/<slug>.md` — pre-spec collaboration, open questions, assumptions,
  coordinator log
- `spec.md` — normalized WHAT and WHY after definition
- `plan.md` — implementation approach
- `tasks.md` — phased executable work with durable task IDs, explicit board
  states, and a generated `Ready / In Progress / Blocked / Done` view when
  Lightweight Execution is active
- supporting artifacts such as `research.md`, `data-model.md`, and `contracts/`
  when needed

This keeps the PRD draft or product brief as source input, the idea file as the
collaboration surface, and the `.dude/specs/<feature>/` package as the
implementation-ready output. Roadmap-sized input should produce separate idea
files so each later definition remains bounded.

## Suggested review points before definition

Before defining, check:

- the normalized intent matches the PRD's actual intent
- clarifications are resolved instead of hidden in assumptions
- the feature should become one defined package rather than several separate
  features

Then follow the same `@dude define` and optional Lightweight Execution or
`@dude track` sequence from [Workflow modes and lifecycle](workflow.md).