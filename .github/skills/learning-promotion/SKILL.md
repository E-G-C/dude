---
name: "learning-promotion"
description: "Use when Dude overcomes a non-trivial challenge, discovers a reusable pattern, or should promote a solved problem into a reusable skill to avoid the same issue in the future."
---

## Purpose

Turn solved challenges into reusable workflow knowledge.

## Detection Triggers

Consider promotion when:

- a specialist reports a workaround, root cause, or non-obvious fix
- a review reveals a repeated preventable issue
- the user explicitly says the team should remember how a problem was solved
- the same kind of challenge is likely to recur in this project

## Decision Rule

After Dude solves a challenge, decide whether the outcome is:

- one-off and local
- durable but still narrow
- broadly reusable as a skill

## Handling

### One-Off And Local

- Do not create a skill.
- Record only if the lesson is still worth remembering.

### Durable But Narrow

- Add a concise lesson to `.github/dudestuff/lessons.md`.
- Promote later if the pattern repeats.

### Broadly Reusable

- Create or update `.github/skills/<name>/SKILL.md`.
- Write trigger phrases into the description so Copilot can discover it.
- Focus on reusable workflow, rules, and anti-patterns.

## Quality Gates

Before promotion:

- check for duplicate or overlapping skills
- prefer extension of an existing skill over creating a near-copy
- keep the skill scoped to the reusable pattern, not the original task

## Skill Hygiene

To prevent skill sprawl:

- When creating a new skill, check whether an existing skill can be extended
  instead.
- If two skills substantially overlap, merge them into one.
- Skills that have not been useful across at least two tasks should be
  candidates for removal or demotion back to a lesson.
- Keep the total skill count manageable — if the roster grows past ~15
  project-specific skills, review and consolidate.

## Examples

### Good Promotion — Recurring Coordination Failure

> **Challenge**: Two specialists kept producing conflicting outputs because
> their scopes overlapped on a shared deliverable.
>
> **Outcome**: Created skill `artifact-ownership` with rules for declaring
> single owners and handoff points.
>
> **Why promote**: Any multi-specialist project can hit this. The prevention
> pattern is broadly reusable.

### Good Promotion — Repeated Review Finding

> **Challenge**: Quality authority flagged the same category of issue across
> three separate review cycles.
>
> **Outcome**: Created skill `boundary-validation` with prevention rules so
> the issue is caught at implementation time instead of review time.
>
> **Why promote**: The pattern kept recurring. A skill prevents the issue at
> creation time instead of catching it at review time.

### Good Promotion — Domain Constraint Handling

> **Challenge**: Specialists kept making decisions that violated a non-obvious
> domain constraint (e.g., regulatory rule, venue capacity, API rate limit).
>
> **Outcome**: Created skill with the constraint documented and trigger
> conditions for when specialists should check it.
>
> **Why promote**: Domain constraints that aren't obvious recur and cause
> rework every time they're forgotten.

### Skip — Too Trivial

> **Challenge**: A one-time miscommunication about task scope.
>
> **Why skip**: This is a one-off coordination hiccup, not a reusable pattern.
> Not worth a skill.

### Skip — One-Off External Issue

> **Challenge**: Work was blocked by a temporary external dependency (service
> outage, vendor delay, expired credential).
>
> **Why skip**: External transient issue, not a process pattern. Record in
> `lessons.md` if the debugging approach was interesting, but don't create a
> skill.
