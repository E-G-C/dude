# Dude Guardrails

Durable project rules and preferences that Dude should follow.

Entries prefixed with `[bundle]` are shipped defaults. When no project-specific guardrails exist yet, Dude may infer candidate guardrails from the repo, current definition work, and remembered context, but only user-accepted guardrails become durable project rules here.

## Entries

- `[bundle]` Once execution work is imported, Beads is the only live tracker for pending and completed work.
- `[bundle]` Keep intent separate from implementation: `spec.md` stays technology-agnostic, while `plan.md` carries technical design.
- `[bundle]` Optional disciplines such as worktrees and TDD are opt-in unless the user explicitly adopts them for the project.
- Specialist visibility (user preference): whenever Dude dispatches a specialist as a subagent (reviewer, coder, tester, architect, spec-lead, etc.), make the hand-off visible. Announce it before the work with a one-line `→ Dispatching: <Specialist>` marker, and present that specialist's raw findings/output under its own attributed heading (e.g. `<Specialist> — findings:`), kept separate from Dude's own synthesis and decision. Rationale: VS Code does not render subagent turns, so explicit labeling is how the user sees which specialist actually engaged.
- Prefer deterministic scripts for reproducible parsing, counting, budgeting, validation, state transitions, and rendering; reserve model reasoning for semantic diagnosis and recovery decisions.
- Keep model-facing instructions concise and non-redundant while preserving required authority, safety, and behavior.
- Choose the smallest design that satisfies proven requirements; reject speculative abstractions, state, schemas, or safeguards without a concrete failure mode or acceptance test.
