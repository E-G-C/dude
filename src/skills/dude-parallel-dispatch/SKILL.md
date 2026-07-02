---
name: "dude-parallel-dispatch"
description: "Use when several subtasks may run independently, when deciding between sequential and parallel specialist dispatch, when automatically fanning out ready Beads work, or when coordinating multi-agent fan-out."
---

## Purpose

Use parallelism only when it is safe, useful, and deterministic.

## Safe Parallelism Conditions

Parallel dispatch is appropriate when:

- the tasks are already ready in Beads or otherwise explicitly unblocked
- subtasks are independently scoped
- there is no unresolved blocker between them
- they do not obviously compete for the same files or artifact ownership
- one subtask does not need the output of another first

## Automatic Fan-Out Rules

- Preserve Beads ready order as the default dispatch order.
- Launch at most 2 specialists in parallel by default unless the user explicitly asks for more. The cap keeps coordination overhead low, makes synthesis predictable, and reduces the chance of context contention on shared artifacts. Raise it only when the user opts in or when the ready set is clearly partitioned across independent features.
- Prefer tasks from different features or clearly separate artifact areas.
- Do not parallelize tasks that touch the same brainstorm file, the same spec package, or the same implementation files unless independence is explicit. File overlap is a reason to stay sequential, not a reason to add worktrees.
- Do not suggest worktrees for every parallel split. Consider offering them only when the split is already safe and there is a concrete isolation benefit, such as protecting the current checkout during a risky or high-churn refactor, isolating a schema or dependency branch likely to churn many files, or separating two already-independent tasks from different features or artifact trees.
- If the user already declined a worktree suggestion in the current session and the situation has not materially changed, do not repeat it.
- After each execution round, re-query Beads before dispatching more work.

## Concrete Worktree Trigger

When deciding whether to offer a worktree proactively, use this trigger instead of leaving it to vague judgment:

- offer a worktree once, dismissibly, when executable implementation work is already safe to split and either the declared file paths or artifact areas are disjoint across the parallel tasks, or one task is a risky/high-churn refactor such as a schema change, dependency upgrade, or cross-cutting rewrite
- do not offer a worktree as a fix for overlapping file ownership, shared spec-package edits, or other sequencing problems; stay sequential instead

## Good Uses

- two specialists working on independent deliverables with no shared artifacts
- implementation work and review preparation on unrelated items
- separate investigations in different problem areas
- a risky cross-cutting refactor kept separate from unrelated implementation work
- two ready tasks from different features or clearly different directories where separate branches would keep churn contained

## Bad Uses

- concurrent edits to the same artifact
- concurrent edits to the same brainstorm file or definition package
- review before implementation is complete
- tasks with unclear ownership boundaries
- work that depends on the output of another specialist not yet finished
- sequential steps that must land in order
- using worktrees to justify a parallel split that is still unsafe at the file or artifact level
- recommending worktrees merely because more than one task is running
- suggesting worktrees for tasks inside the same spec package or the same implementation directory when sequential execution is the real fix

## Output Pattern

When dispatching in parallel, state:

- which specialists are being launched
- what each one owns
- why the parallel split is safe
- whether worktree isolation was suggested and why, if relevant
- what the simpler fallback is, if a worktree was suggested
- what capped the fan-out size, if not all ready tasks were dispatched
