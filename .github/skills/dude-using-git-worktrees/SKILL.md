---
name: "dude-using-git-worktrees"
description: "Use when the user explicitly asks for a git worktree, isolated branch workspace, parallel checkout, or branch-safe implementation area for risky or independent work, or when the coordinator should suggest that option because isolation would materially reduce risk or working-tree contention for a risky or truly independent change."
---

# Using Git Worktrees

## Purpose

Set up or recommend an isolated git worktree only when isolation has a concrete, explainable benefit.

This skill is optional. It is not part of Dude Coder's default workflow.

## Use When

- the user explicitly asks for a worktree
- the coordinator can point to a concrete benefit from isolation and should offer that option to the user
- the user wants isolated branch work for a risky refactor
- the user wants separate checkouts for truly independent parallel implementation work
- the user wants to protect the current working tree while trying a change

## Do Not Use When

- normal work can happen in the current checkout
- the request is only to define a feature or import work into Beads
- there is no clear isolation benefit worth the extra branch and merge overhead
- the extra directory, branch, and merge overhead would likely outweigh the benefit for this user or task
- the tasks still compete for the same files or artifacts in a way that would likely create merge conflicts anyway
- the user already declined a worktree suggestion in the current session and the conditions have not materially changed

Worktrees do not change the live execution system. In Lightweight Execution, `tasks.md` remains the live markdown execution board; after Beads import, Beads remains the live execution board and any `tasks.md` updates are only a non-authoritative Beads mirror. A worktree only changes where code is edited.

## Proactive Suggestion Rule

The user does not need to know about worktrees in advance.

Dude may suggest a worktree proactively, but should not create one silently.

Recommend a worktree only when all of these are true:

1. The work is executable implementation work in a real Git repository, not just definition or import flow.
2. Either the change is risky or high-churn, or Dude is about to run truly independent implementation tasks in parallel.
3. Dude can explain a concrete isolation benefit and offer a simpler fallback.

If the user declines a worktree suggestion, do not keep repeating it in the same session unless the situation materially changes.

Good reasons to suggest one:

- a risky refactor where the user may want a clean fallback in the current checkout
- a schema change, dependency upgrade, or cross-cutting refactor likely to churn many files or require repeated resets
- two truly independent implementation tasks that are already safe to run in parallel and easier to manage in separate branches
- two ready tasks from different features or clearly separate directories where branch isolation keeps unrelated churn out of the current checkout

Bad reasons to suggest one:

- suggesting one for every parallel split by default
- as a substitute for unresolved ownership or sequencing problems
- when the same files or artifacts are likely to conflict across tasks
- when the tasks are in the same feature package or implementation directory and sequential work is the simpler fix
- for ordinary single-threaded work that fits comfortably in the current checkout
- for solo or novice workflows where sequential work in the current checkout is clearly the simpler tradeoff

When suggesting a worktree, give a short reason, explain the cost honestly, and ask for approval before setup. For example: "These two tasks are already independent, and separate branches would keep the current checkout clean. I can create `.worktrees/auth-refactor` on branch `auth-refactor`; that means another directory and a later merge step. Or I can keep the work sequential in the current checkout, which is slower but simpler."

## Directory Selection

Use this order:

1. If `.worktrees/` exists, prefer it.
2. Else if `worktrees/` exists, use it.
3. Else ask the user where to place worktrees.

Recommended options to offer:

1. `.worktrees/` inside the repo
2. `worktrees/` inside the repo
3. another explicit path the user prefers

## Safety Rules

If using a repo-local directory such as `.worktrees/` or `worktrees/`:

1. Verify the directory is ignored before creating the worktree.
2. If it is not ignored, add the ignore entry first.
3. Do not create the worktree until ignore coverage is clear.

Use `git check-ignore` to verify ignore behavior.

## Windows Notes

- Use PowerShell-friendly commands when working in this environment.
- Prefer paths relative to the repository root where possible.
- Quote paths with spaces.
- Use `git worktree add <path> -b <branch>` normally; no Windows-specific git flags are required.

## Setup Steps

1. Determine the repository root and project name.
2. Choose the worktree directory using the rules above.
3. Verify ignore coverage if the directory is repo-local.
4. Create a branch name that reflects the task.
5. Run `git worktree add <path> -b <branch>`.
6. Move into the worktree and run lightweight setup only if needed for the project.
7. If practical, run a baseline verification command before starting implementation.

## Return Pattern

Report:

- worktree path
- branch name
- whether ignore coverage was verified or changed
- any baseline verification run
- whether the user should continue work in the new worktree or the current checkout
