---
title: Duplicate Feature Number Prefixes
slug: duplicate-feature-number-prefixes
status: defined
spec_path: .dude/specs/076-duplicate-feature-number-prefixes/spec.md
---

# Idea: Duplicate Feature Number Prefixes

## Idea

Independent worktrees create distinct features with the same numeric prefixes; auto-renumbering would change full feature paths and invalidate path-bound Work evidence/state. The user chose to permit duplicate numeric prefixes instead, preserving all existing paths.

Full canonical `spec_path` remains identity, unique unnumbered `slug` remains semantic selector, and each idea/spec pair must match its own number+slug exactly. Duplicate slugs, malformed identities, missing/ambiguous owners, and evidence bound to a wrong full target remain errors. New capture stays local `max(valid direct idea/package numbers) + 1`, no gap reuse, supported `001`-`999` range unchanged.

Do not add global reservations, worktree scanning at runtime, migrations/aliases, new state stores, or number-only identity fallback. Existing histories, task IDs/states, claims/checkpoints, hashes, and retained evidence are not rewritten.

No feature-specific fix for the other worktree's `T004` hard-stop/evidence-incomplete; new support neither resumes that invocation nor certifies stale evidence.

The reported collision examples are local `074-work-readable-evidence-handoff` vs upstream `074-dude-canvas-about`, and local `075-terminal-work-manual-resolution` vs upstream draft `075-dude-development-base-release`. They are regression examples, not files to rename or modify.

No visual design change is requested. Implement source/instructions/docs/tests and generated `.github/` together eventually; no definition-only push. Commit/push is separate from this Ship's execution, and nothing should be pushed automatically.

## Open Questions

None.

## Assumptions

No additional user assumptions supplied.

<!-- dude:managed:start -->
## Scope And Proposals

This is one bounded compatibility change: a shared numeric prefix must not reject otherwise valid, distinct features. Preserve the existing identity and evidence boundaries described in the Idea rather than introducing another identity scheme or a recovery workflow.

Lifecycle numbers continue to record capture chronology only. They never determine priority, dependency, roadmap position, task phase, readiness, dispatch, or execution order.

## Related References

- `.github/skills/dude-feature-definition/SKILL.md`: current first-capture publication and exact-owner definition contracts.
- `.github/skills/dude-work-intake/SKILL.md`: distinct Ship lifecycle subactions and the unchanged Work stop boundary.
- `.dude/memory/decisions.md`: existing lifecycle allocation and canonical identity decisions.
- `.dude/specs/076-duplicate-feature-number-prefixes/spec.md`: duplicate-prefix acceptance and retained identity requirements.
- `.dude/specs/076-duplicate-feature-number-prefixes/plan.md`: bounded implementation paths and focused regression coverage.
- `.dude/specs/076-duplicate-feature-number-prefixes/tasks.md`: one open durable task for the integrated compatibility change.
<!-- dude:managed:end -->

## Coordinator Log

- 2026-09-27T02:30:31Z - brainstorm: Staged the accepted duplicate-prefix idea for first-capture publication. No lifecycle number allocated and no definition package, task state, memory, or implementation changes.
- 2026-09-27T02:34:16Z - define: Prepared first-definition spec, plan, and one open durable task T001@9c4e71b2 for .dude/specs/076-duplicate-feature-number-prefixes/spec.md. Prior intent and history retained; no implementation or execution evidence recorded.
- 2026-09-27T03:05:48Z - execution: claimed T001@9c4e71b2 for duplicate-prefix compatibility under autonomous Ship.
