---
name: "memory-ledger"
description: "Use when the user wants Dude to remember a decision, guardrail, preference, project fact, or durable lesson, or when Dude should store important knowledge in `.github/dudestuff/` files."
---

## Purpose

Store durable team knowledge in a small set of predictable memory files.

## File Selection

Use:

- `.github/dudestuff/decisions.md` for durable technical, product, or workflow decisions
- `.github/dudestuff/guardrails.md` for enduring constraints, rules, and preferences
- `.github/dudestuff/context.md` for domain knowledge, project facts, and business rules
- `.github/dudestuff/lessons.md` for solved challenges and candidate reusable patterns

## Writing Rules

- Keep entries concise.
- Prefer durable statements over narrative session logs.
- Capture enough context that future sessions can understand why it matters.
- Do not use these files for transient task status.
- If an old memory is superseded, update or mark the older entry clearly.

## Entry Heuristics

Write to `decisions.md` when:

- the team made a real choice between alternatives
- a project direction was locked in
- a workflow rule became part of how the project should operate

Write to `guardrails.md` when:

- the knowledge is a stable rule or preference
- the team wants a durable constraint or standard

Write to `context.md` when:

- the knowledge is domain-specific and repeatedly useful
- the fact will help future reasoning or implementation

Write to `lessons.md` when:

- Dude solved a challenge worth reusing later
- the pattern is useful but not yet mature enough to become a skill

## Promotion Trigger

If the lesson is clearly reusable across future tasks, create or update a skill instead of only recording the note.

## Pruning And Consolidation

Memory files are append-only by default, but they need periodic maintenance:

1. **Before appending**, scan the target file for entries that the new one
   supersedes. Update or remove the older entry instead of creating a
   contradiction.
2. **When a memory file exceeds ~20 entries**, review it for consolidation:
   - merge entries that say the same thing differently
   - remove entries invalidated by later decisions
   - archive entries that are no longer relevant to the active project
3. **When the user asks to clean up memory**, apply these rules across all
   four files.
4. **Promotion is pruning**: when a lesson becomes a skill, remove or shorten
   the lesson entry and reference the skill instead.
