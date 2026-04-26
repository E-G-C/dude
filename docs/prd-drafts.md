# Starting From A PRD Draft

[Back to root README](../README.md) | [Docs index](README.md) | [Workflow modes](workflow.md)

If you already have a product requirements draft in markdown, treat it as raw
input for `draft`.

The same three lanes apply when you start from a PRD draft. Dude does not send
the PRD directly to Beads. It first turns that draft into a working brainstorm
ledger, then defines it into the normal package under `specs/<feature>/`. Stop
there for Definition Only, continue from `tasks.md` for Lightweight Execution,
or run `@dude track` if you want Tracked Execution.

## Practical flow

1. Write or collect your PRD draft in markdown.
2. Ask `@dude` to draft that input.
3. Let `@spec-lead` normalize it inside `brainstorm/<slug>.md`.
4. Resolve clarification questions in the same brainstorm file.
5. Define the brainstorm into the normal package.
6. If you want implementation without Beads, continue from `tasks.md`, starting with the generated board view when present.
7. If you want tracked execution, run `@dude track`.

```mermaid
flowchart LR
    PRD["PRD draft\nMarkdown document"] --> DUDE["@dude"]
    DUDE --> BRAIN["brainstorm/<slug>.md\nworking ledger"]
    BRAIN --> SPEC["@spec-lead\nnormalizes draft"]
    SPEC --> CLARIFY{"Material ambiguity?"}
    CLARIFY -->|Yes| Q["Ask focused clarifications"]
    Q --> BRAIN
    CLARIFY -->|No| PACKAGE["Define into specs/<feature>/\nspec.md + plan.md + tasks.md"]
    PACKAGE --> REVIEW["Optional review\n@lead or @reviewer"]
    REVIEW --> EXECMODE{"Execution lane?"}
    EXECMODE -->|Definition Only| STOP["Stop at reusable package"]
    EXECMODE -->|Lightweight Execution| LIGHT["Execute from tasks.md\nvia @dude"]
    EXECMODE -->|Tracked Execution| IMPORT[@dude track\nautomatic handoff]
    IMPORT --> EXEC["Execute from Beads\nvia @dude"]
```

## What to ask Dude

Assume your PRD draft is at `docs/prd/<feature>.md`.

Start with draft:

```text
@dude draft docs/prd/<feature>.md
```

Then move into the normal package:

```text
@dude define <feature>
```

If you want tracked execution afterwards:

```text
@dude track
```

If you want implementation without Beads afterwards, keep working from
`specs/<feature>/tasks.md` and use `@dude status` for orientation.

If the PRD draft covers more than one feature, ask Dude to split it before
planning:

```text
@dude draft docs/prd/billing.md and split it into separate brainstorm files first
```

## What Dude produces from the PRD

The PRD draft remains source input, but Dude turns it into two working layers:

- `brainstorm/<slug>.md` — intake ledger, open questions, assumptions,
  definition record
- `spec.md` — normalized WHAT and WHY after definition
- `plan.md` — implementation approach
- `tasks.md` — phased executable work with durable task IDs, explicit board
  states, and a generated `Ready / In Progress / Blocked / Done` view when
  Lightweight Execution is active
- supporting artifacts such as `research.md`, `data-model.md`, and `contracts/`
  when needed

This keeps the PRD as product input, the brainstorm file as the collaboration
surface, and the `specs/<feature>/` package as the implementation-ready output.

## Suggested review points before definition

Before defining, check:

- the normalized intent matches the PRD's actual intent
- clarifications are resolved instead of hidden in assumptions
- the feature should become one defined package rather than several separate
  features

Then follow the same `@dude define` and optional Lightweight Execution or
`@dude track` sequence from [Workflow modes and lifecycle](workflow.md).