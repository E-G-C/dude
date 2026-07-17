---
name: "dude-work-intake"
description: "Use to triage a request, choose direct response or routing, capture an idea, or decide whether explicit definition is ready."
---

# Work Intake

## Triage

Read applicable project memory and conventions. Decide whether the request is a direct answer, one specialist task, independent subtasks, raw feature input for `brainstorm`, or an explicit `define` request. Ask only for missing information that changes outcome, hard constraints, approval, or routing.

For a fresh project, establish: one feature or several outcomes, implement now or define only, and material hard constraints. Do not repeat questions already answered. Implementation without an explicit Beads request defaults to Lightweight Execution.

## Brainstorm

`@dude brainstorm <idea>` creates or refreshes exactly one flat `.dude/ideas/<slug>.md` and never creates or refreshes `.dude/specs/`.

- Keep user intent in `## Idea`, followed by active `## Open Questions` and answer slots, then `## Assumptions`.
- Preserve meaning, tone, uncertainty, incomplete thought, creative intent, answered questions, assumptions, and user edits. Initial cleanup may fix only clear language or transcription errors.
- Set `status: draft` with an empty `spec_path:` only for a first or still-undefined draft. A brainstorm rerun of a ledger already at `status: defined` preserves that status and its exact `spec_path:`; never demote it or orphan its package.
- If the input contains separate bounded outcomes, ask one split question or propose separate idea ledgers.

The user controls `## Idea`, open-question answers, and `## Assumptions`; during explicit brainstorm the delegated Spec Lead preserves them and maintains definition metadata, managed sections, and definition log events.

## Definition Gate

Route explicit `define <slug>` to the Spec Lead and load `dude-feature-definition` when the outcome is clear, unresolved questions are answered or consciously assumed, and one package can contain the scope. Otherwise add or ask one focused clarification.

Direct facts stay direct. Implementation, verification, planning, artifact authoring, and review route through the closed-roster algorithm in `dude-generic-routing`.
