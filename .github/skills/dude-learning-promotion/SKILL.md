---
name: "dude-learning-promotion"
description: "Use when Dude solves a non-trivial challenge, review or delivery reveals a reusable prevention rule, the user asks to synthesize session learning, or a solved pattern may merit memory or skill promotion. Do NOT use to record a plain decision, preference, or project fact (dude-memory-ledger), or to author the skill file itself (dude-skill-authoring)."
---

## Purpose

Turn solved challenges into reusable workflow knowledge.

`dude-work` (`## Inspection And Recovery`) owns recovery retention routing. This skill owns deduplicating broadly recurring findings and deciding whether to extend or create a skill through `dude-skill-authoring`; it does not persist recovery advice automatically.

## Detection Triggers

Consider promotion when:

- a specialist reports a workaround, root cause, or non-obvious fix
- a review reveals a repeated preventable issue
- implementation, failed approaches, review corrections, and delivery together reveal a reusable lesson
- the user explicitly says the team should remember how a problem was solved
- the same kind of challenge is likely to recur in this project

## Decision Rule

After Dude solves a challenge, decide whether the outcome is:

- one-off and local
- durable but still narrow
- broadly reusable as a skill

## Bounded Synthesis

When a trigger calls for synthesis rather than classification of one isolated
lesson, make one bounded pass before choosing a handling route:

1. Use only relevant available evidence from implementation, failed approaches,
   review corrections, verification, and delivery. Do not reconstruct missing
   events or scan unrelated sessions.
2. Separate proven causes and fixes from hypotheses, assumptions, and unresolved
   defects. Do not promote the latter as established guidance.
3. For each candidate, extract the cause, the prevention rule, and when the rule
   should be reused. Keep a merely suspected cause or open defect explicitly
   scoped if it is worth retaining at all.
4. Compare candidates with existing memory and skills, consolidate overlap, then
   apply the existing handling route and retention owner below. Synthesis grants
   no new write owner.
5. Report each candidate as `retained`, `proposed`, `already-covered`, or
   `not-retained`, with its destination or concise reason. This report is not
   another ledger or status system.

An explicit user request is enough to run this pass, but does not transfer
recovery authority. `dude-work` remains the sole owner of recovery retention and
autonomous learning governance; normal completion closeout remains read-only
and may report only an existing retention disposition.

An optional feature retrospective is advisory evidence scoped to the feature
and evidence available at its single completion dispatch. A positive or
no-findings retrospective is not exhaustive analysis of later failures or the
whole session. Do not dispatch it again for synthesis. This pass adds no command,
automatic session scanner, close hook, approval gate, required worksheet, or
mandatory artifact.

## Handling

### One-Off And Local

- Do not create a skill.
- Record only if the lesson is still worth remembering.

### Durable But Narrow

- Add a concise lesson to `.dude/memory/lessons.md` using the `dude-memory-ledger` skill (which runs its own `dude-lint` verification on the file after writing).
- Promote later if the pattern repeats.

### Broadly Reusable

- Create or update `.github/skills/dude-local-<name>/SKILL.md` using the `dude-skill-authoring` skill, unless the change is explicitly an upstream/base Dude skill update (the authoring skill runs its own `dude-lint` verification after creation).
- Write trigger phrases into the description so Copilot can discover it.
- Focus on reusable workflow, rules, and anti-patterns.

## Quality Gates

Before promotion:

- check for duplicate or overlapping skills
- prefer extension of an existing skill over creating a near-copy
- keep the skill scoped to the reusable pattern, not the original task

## Skill Hygiene

To prevent skill sprawl:

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
