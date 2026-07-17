---
name: "dude-generic-routing"
description: "Use when matching a user request, subtask, or task to the right specialist agent in the active roster."
---

# Generic Routing

Route work to the smallest credible specialist set. Routing is based on the current roster, never on assumed pack identities.

## Routing Algorithm

1. **Discover the closed roster**: list the direct `.github/agents/*.agent.md` entries at routing time, excluding `dude.agent.md`. Those direct `.github/agents/*.agent.md` entries are the closed candidate set for specialist dispatch.
2. **Parse each candidate**: record its canonical file stem, frontmatter `name` and `description`, and `## Scope` section.
3. **Prefer exact artifact ownership for requested artifacts**: a unique literal artifact type or file suffix match in `description` or `## Scope` outranks semantic overlap only when that artifact is the requested output or an explicit create, author, refine, or review target. Incidental mentions, including test subjects, examples, inputs, or references, do not trigger artifact-owner precedence; route those by the primary requested outcome and scope.
4. **Match by scope specificity**: otherwise compare the task with each candidate's `description` and `## Scope`; prefer the narrowest credible owner.
5. **Resolve the identity**: before dispatch, the emitted identity must resolve uniquely to one discovered entry and be copied from its canonical file stem or declared frontmatter `name`; never synthesize an identity.
6. **Fail closed**: zero matches or ambiguous top matches must be reported, escalated, or clarified. Do not dispatch or invent a specialist identity.

## Tie Breakers

- Prefer one credible owner; split only genuinely different domains.
- Keep implementation and independent acceptance with different agents.
- Prefer a narrower current scope over a broader or older role.
- If evidence cannot break a tie, ask the user instead of guessing.

## Authority Ownership

Assign planning authority to the roster specialist whose scope owns structure and design tradeoffs, and quality authority to an independent specialist whose scope owns acceptance. Feature definition defaults to the Spec Lead; implementation planning uses a matching planning specialist when one exists, otherwise the coordinator. Reassign explicitly when the roster changes.

When authorities disagree, planning controls structure, quality controls acceptance, and cross-authority or unowned conflicts escalate to the user.

## Task Matching

Use these signals only after applying the algorithm:

- **Definition**: brainstorm, idea intake, requirements, spec, plan, tasks, definition consistency.
- **Planning**: architecture, setup, boundaries, configuration, design tradeoffs.
- **Implementation**: build, implement, integrate, refactor, fix.
- **Verification**: test, regression, edge case, validation, coverage, QA.
- **Review**: independent review, approve, reject, readiness, acceptance.
- **Coordinator skill**: importing one agent or skill uses `dude-bundle-import` directly rather than a specialist dispatch.

For mixed requests, route by the primary outcome or split independent concerns. Report the task, selected discovered identity, and one-line scope reason.
