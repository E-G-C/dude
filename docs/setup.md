# Setup And First Feature

[Back to root README](../README.md) | [Docs index](README.md) | [Workflow modes](workflow.md)

Use the root README for the short no-Beads quick start and the basic repo
layout. This page owns the deeper setup material: prerequisites, first real
feature setup, guardrails, advanced memory seeding, roster changes, and
workflow boundaries.

## Prerequisites

- GitHub Copilot (VS Code or CLI)
- Beads if you want tracked execution:
  `go install github.com/steveyegge/beads/cmd/bd@latest`
- On Windows, keep the manual Dolt server-mode steps from [Workflow modes and lifecycle](workflow.md)
  handy before you run `bd init`. If embedded Dolt or CGO fails, switch to that
  path immediately instead of retrying plain `bd init`.

## First-Time Setup

You do not need to seed every bundle memory file, decide the final roster, or
pre-write every guardrail before the first feature. Dude can learn from one real
feature as long as you provide the desired outcome and any hard constraints.

The minimum useful setup is:

- copy `.github/` into the target repository
- optionally remember one to three durable constraints
- start with `@dude draft <feature>`

If you are not sure which artifact is live after any step, run `@dude status`.
In Definition Only it points you back to the current brainstorm file or
generated package; in Lightweight Execution it points to `tasks.md` and the
generated board view there; after
tracked execution starts, it also reports Beads state.

### Editing rule of thumb

- Edit `## User Draft`, `## Open Questions`, and `## Assumptions` in
  `brainstorm/<slug>.md`.
- Leave `status:`, `spec_path:`, and `## Definition Record` to Dude.
- Leave any generated board region in `tasks.md` to Dude.
- Refresh generated artifacts with `@dude define <feature>` instead of
  hand-maintaining `spec.md`, `plan.md`, or `tasks.md`.
- On Windows tracked execution, switch to the manual Dolt server-mode path as
  soon as plain `bd init` shows embedded-Dolt or CGO problems.

Optional starter prompts:

```text
@dude remember: audit events must be retained for 90 days
@dude remember: admin actions require an audit trail
```

If no project-specific guardrails exist yet, Dude can infer a short candidate
set once it understands the repo and feature, then present those guardrails for
your approval before planning continues. Add decisions, context, and lessons
incrementally as they emerge.

Depending on current project guardrails, `@dude define` either completes the
package immediately or pauses briefly for this approval step before planning
continues.

For example, after `@dude define authentication`, Dude might pause with
something like:

```text
Action: define
Updated:
- specs/001-authentication/spec.md created or refreshed
- Candidate guardrails inferred from the repo, current feature, and remembered context
Next:
- Accept, edit, reject, or skip the proposed guardrails
- Planning will continue after guardrails are ratified
Blockers:
- `plan.md` and later definition artifacts are paused until guardrails are ratified or bundle defaults are accepted

Proposed guardrails:
1. Public APIs stay backward compatible for one release.
    Why: this feature is likely to expose externally consumed auth endpoints.
2. Authentication and admin actions must emit audit events retained for 90 days.
    Why: the project already records audit retention as remembered context.
3. Secrets, reset tokens, and passwords must never appear in logs.
    Why: the feature handles sensitive authentication data.

Reply with:
- accept 1,2,3
- edit 2: Authentication and admin actions must emit audit events retained for 180 days.
- reject 1
- skip
```

If you reply in the same conversation, Dude can continue the paused definition
immediately. If you return later, rerun `@dude define <feature>` to resume.

### Guardrails explained

Guardrails are durable project rules that shape planning and execution across
features. Typical examples are compatibility promises, audit retention,
accessibility expectations, or security rules such as never logging secrets.

If `@dude define` pauses for guardrails, the workflow is waiting for approval,
not failing. Accept, edit, reject, or skip the proposed rules in the same
conversation, or rerun `@dude define <feature>` later to resume from that
checkpoint. `skip` means continue with bundle defaults only and do not add new
project-specific guardrails for that pause. In clearly solo or exploratory
repos, the inferred candidate set should usually stay short, and `skip` is a
normal response when bundle defaults are enough. If no project-specific
guardrails are inferred beyond bundle defaults, definition should continue
without a separate pause.

### Advanced setup

If you already know durable project guardrails or want to seed bundle memory
more deliberately from day one:

- add a few real project guardrails to `.github/dudestuff/guardrails.md`
- capture durable decisions in `.github/dudestuff/decisions.md` as they are made
- capture important domain facts in `.github/dudestuff/context.md`
- capture repeated solved patterns in `.github/dudestuff/lessons.md`

More example prompts:

```text
@dude remember: public APIs stay backward compatible for one release
@dude remember: audit events must be retained for 90 days
```

### Optional: customize the roster after your first feature

Once you have completed your first successful `draft -> define` loop, you can
prune agents that do not fit your project:

```text
@dude remove the frontend agent, this is a backend-only project
```

Dude will delete the `.github/agents/frontend.agent.md` file and update its
routing automatically. The Dynamic Roster Rule in `generic-routing` adapts based
on whichever agents remain.

### Solo developer path

If you are using Dude Coder solo, you can keep the default roster for the first
feature or remove roles you do not want after the first successful
`draft -> define` loop:

```text
@dude remove the tester agent
@dude remove the reviewer agent
```

The current delivery pipeline already adapts when those roles are absent. Dude
still uses `verification-before-completion` before close, but it does not
require a separate solo-only workflow or command surface.

If you are only using Dude Coder for feature definition, you can stop at the
`specs/<feature>/` package. Beads-specific execution rules apply once you choose
tracked execution and import tasks.

## Operational Skills

Dude Coder includes explicit operational skills for common failure modes:

- `systematic-debugging` — investigate root cause before changing code
- `test-driven-development` — optional tests-first implementation aid
- `verification-before-completion` — require fresh evidence before saying
  something is done or fixed
- `receiving-code-review` — handle review feedback technically instead of
  reflexively

These skills strengthen execution discipline without changing the main workflow.

`test-driven-development` is available when the user or project wants
tests-first work. There is no global TDD requirement.

## Workflow Boundaries

Dude Coder focuses on file-based feature intake under `brainstorm/<slug>.md`,
native feature definition under `specs/<feature>/`, and tracked execution in
Beads.

### Worktrees are optional, not part of the core workflow

Git worktrees can still be useful, but they are not part of Dude Coder's default
operating model. In a downstream Git repository, Dude may suggest a worktree
when isolated branch work has a concrete benefit, for example during a risky
high-churn refactor or for truly independent parallel implementation tasks.
Dude should not suggest worktrees for every parallel split. It should offer the
option with a brief reason, not assume it silently.

That offer should be honest about the cost: another directory, another branch,
and usually a later merge step. It should also offer the simpler fallback of
staying in the current checkout and running sequentially when that tradeoff is
better for the user.

Worktrees help isolate checkouts; they do not make overlapping file edits safe.
If two tasks still compete for the same files or artifacts, keep them
sequential instead of treating worktrees as a conflict fix.

### Execution stays in @dude, with Beads optional

Dude Coder does not add a separate plan executor or branch-completion workflow.

Use the three-lane flow in [Workflow modes and lifecycle](workflow.md) as the
authoritative user-facing model: stop after `@dude define` for Definition Only,
continue from `tasks.md` for Lightweight Execution, or continue to `@dude track`
when you want Tracked Execution in Beads. This keeps one definition path and
one live execution board at a time.