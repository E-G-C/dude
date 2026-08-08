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
- Core stays runtime-independent of optional packs: when a core generator needs an optional pack's visual language or assets, bake a validated copy into a committed artifact (template) and update it deliberately; never read the installed pack projection at generation time, so the output is identical whether or not the pack is installed. Rely on always-present runtimes (Node), not on optional packs.
- No dead affordances in generated static or offline artifacts: present only controls that actually function (honest chrome plus real data); never render navigation, tabs, or switches that lead nowhere in a file that has no server or scripting.
- Pack lifecycle rule: edit authoritative pack source only under library/packs/<name>/ and use a disposable bundle for live validation; never develop by editing an installed .github/dude-pack-* projection in place. For a real install, use dude-compose add and remove while the profile inventory and artifacts remain hash-current, then verify the profile, namespace leftovers, and dude-lint. If a pack is absent from the profile but namespaced files remain, treat them as post-uninstall residue: establish their ownership and parity before explicit cleanup rather than fabricating profile authority or silently deleting unknown files.
