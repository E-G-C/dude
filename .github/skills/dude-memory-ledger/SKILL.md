---
name: "dude-memory-ledger"
description: "Use when the user wants Dude to remember a decision, guardrail, preference, project fact, or durable lesson in `.dude/memory/`."
---

## Purpose

Store durable team knowledge in a small set of predictable memory files.

`dude-work` (`## Inspection And Recovery`) decides when a recovery finding is worth proposing as project-reusable. This skill owns deduplication, the selected `.dude/memory/` write, and its lint gate; it never turns recovery advice into an automatic durable write.

## File Selection

Use:

- `.dude/memory/decisions.md` for durable technical, product, or workflow decisions
- `.dude/memory/guardrails.md` for enduring constraints, rules, and preferences
- `.dude/memory/context.md` for domain knowledge, project facts, and business rules
- `.dude/memory/lessons.md` for solved challenges and candidate reusable patterns

Two metadata files are owned by the `dude-bundle-upgrade` skill and should not be hand-edited as memory entries:

- `.dude/metadata/bundle-manifest.md` — install-time pin of the upstream source and the installed ref.
- `.dude/metadata/upgrade-log.md` — append-only history of `@dude upgrade` events and rollbacks.

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

## Append helper (`memory.mjs`)

To add an entry consistently and avoid silently duplicating an existing note,
use the append helper — it formats the bullet, scores token-overlap against the
existing entries, and refuses a near-duplicate (unless `--force`) instead of
piling on a contradiction:

```bash
node .github/skills/dude-memory-ledger/memory.mjs append .dude/memory/decisions.md --text "the decision"
node .github/skills/dude-memory-ledger/memory.mjs append .dude/memory/lessons.md   --text "the lesson" --check
```

It also warns when the file crosses the consolidation threshold. The judgment —
whether to consolidate, reword, or force a similar-but-distinct entry — stays
with you.

## Verification

After writing to any `.dude/memory/*.md` file, run the `dude-lint` skill (`node .github/skills/dude-lint/lint.mjs`). The linter warns when a memory file exceeds the consolidation threshold and confirms no orphan `@<role>` references slipped in. Treat any `[WARN]` on the file you just edited as a prompt to consolidate now rather than later.
