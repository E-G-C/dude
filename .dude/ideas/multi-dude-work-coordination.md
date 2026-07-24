---
title: Multi-Dude Work Coordination
slug: multi-dude-work-coordination
status: draft
spec_path:
---

# Idea: Multi-Dude Work Coordination

## Idea

> Dude Brainstorm approach for concrete work, maybe branching git tree or something. How can we keep a central place of coordination among multiple tasks and multiple dudes working

Explore one practical coordination approach for several concrete tasks and several Dude workers, centered on one authoritative coordination surface. Git branches or worktrees might help isolate code edits, but their role and the broader design are still uncertain. This idea does not assume they are required or that they replace the live execution authority.

The current motivating scenario has three separate Dude coordinator sessions, each with its own workers, working on different tasks in the same repository and the same branch and working directory. Staying in one checkout is valuable because it makes all changes easy to oversee, but overlapping work is a concern. Separate branches or Git worktrees are under consideration, yet switching branches or jumping among directories merely to see progress is undesirable. It remains uncertain whether combining multiple workers with branches or worktrees is useful or wasteful, and whether the shared-branch approach can be made workable.

## Open Questions

1. What should be the primary operating context and central authority for the first version?
   Answer: Most often than not we use the lightweight lane.
   Decision: Focus v1 on coordination within one owning defined feature in Lightweight Execution. The feature's canonical task units in `tasks.md` are the central authority, and any generated board remains derived. Cross-feature or Beads-tracked coordination is deferred and does not block v1.
2. How should the coordinator grant, observe, revoke, or reassign a worker's task claim, especially when a worker becomes stale, fails, or stops responding?
   Answer:
3. Must v1 support genuinely simultaneous implementation workers, or would centrally coordinated sequential implementation, with read-only, review, or planning work allowed to overlap, satisfy the practical need?
   Answer:
4. If simultaneous implementation is included, what dependency and known-disjoint-write-set evidence is required before dispatch, who determines that it is sufficient, and which Git, index, generated, or global operations remain reserved for the primary integration owner?
   Answer:
5. Should v1 mandate selective worktree isolation, offer it as an optional or recommended policy, or support both selective worktrees and a constrained shared checkout? What criteria choose among those modes?
   Answer:
6. If worktrees are used, who owns creation, naming, dependency setup, synchronization, integration, conflict handling, and cleanup, and what level of central progress visibility is needed?
   Answer:
7. What structured result and evidence packet must each worker return so the coordinator can synthesize changes, verify outcomes, hand off review, and update the central authority without workers editing that authority themselves?
   Answer:

## Assumptions

- The desired v1 outcome is one bounded coordination approach for concrete work by several Dude workers within one defined feature in Lightweight Execution, not a general replacement for Dude's definition and execution workflows.
- The owning feature's canonical task units in `tasks.md` remain the central authority, and any generated board remains derived. No second persistent ledger or duplicate board is introduced.
- Cross-feature coordination and coordination after Beads import are secondary or deferred concerns and do not block v1 definition.
- One primary coordinator and integration owner owns canonical `tasks.md`, claims and state transitions, synthesis, integration, verification and review handoff, and closure. The three current coordinator sessions are a motivating scenario, not an endorsement of three equal coordinators mutating central state.
- Read-only, review, and planning workers may share a checkout. Concurrent implementation workers may share one only when their write sets are known to be disjoint and one owner controls Git, the index, generated outputs, and other global state; otherwise checkout isolation is warranted.
- A branch name alone does not isolate concurrent sessions that share one working directory. Worktrees isolate checked-out files and branches, but do not prove task independence or provide central coordination.
- Sequential and simultaneous delegation remain alternatives to evaluate. If simultaneous work is selected, it is only a candidate when dependencies permit it and implementation write sets are known to be disjoint.
- Selective worktree isolation is materially relevant to the current concrete scenario, but whether v1 mandates it remains unresolved.
- The defined `autonomous-work-modes` feature keeps sequential v1 scheduling. This separate idea does not silently revise that feature's intent.

<!-- dude:managed:start -->
## Normalized Intent

- Explore a practical way to coordinate several concrete tasks and several Dude workers within one defined feature in Lightweight Execution.
- Address the concrete case of three separate Dude coordinator sessions and their workers operating on different tasks in one repository, branch, and working directory, while preserving the user's ability to oversee changes from one place and reducing overlap risk.
- Use the owning feature's canonical task units in `tasks.md` as the central authority while keeping any generated board derived.
- Establish one primary coordinator and integration owner for task claims and state, synthesis, integration, verification and review handoff, and closure; do not treat several coordinator sessions as equal writers of central state.
- Make task assignment, worker ownership, progress reporting, stale-worker recovery, integration, and evidence handoff understandable and reliable without choosing their detailed protocols during brainstorm.
- Let workers perform delegated implementation away from the central state and return structured result and evidence packets for coordinator-owned verification and state mutation.
- Determine whether the useful first outcome requires true simultaneous execution or can begin with coordinated sequential delegation.
- Evaluate whether a constrained shared checkout can be workable and where selective worktree isolation is warranted, without presupposing either answer.
- Treat cross-feature and Beads-tracked coordination as secondary or deferred rather than prerequisites for v1.
- Keep multi-worker coordination separate from the already-defined sequential v1 intent of `autonomous-work-modes`.

## Settled Decisions And Facts

- Focus v1 on one owning defined feature in Lightweight Execution. Its canonical task units in `tasks.md` are authoritative, and any generated board is derived.
- One primary coordinator and integration owner owns canonical `tasks.md`, worker claims and state transitions, result synthesis, code integration, verification and review handoff, and closure.
- A branch name alone does not isolate sessions that operate in the same working directory.
- Git worktrees provide simultaneous checked-out directories and branches while sharing Git object storage. They avoid switching the single checkout, but add directory, dependency, synchronization, integration, and cleanup overhead.
- Worktrees isolate files and checkouts only. They neither establish that tasks are independent nor replace scheduling, claim ownership, integration, or central coordination.
- Read-only, review, and planning workers may share a checkout. Concurrent implementation workers may share only when write sets are known to be disjoint and one owner controls Git, the index, generated outputs, and other global state; otherwise isolation is warranted.
- As observed on 2026-07-22 UTC, `git worktree list --porcelain` reports one worktree only: `/Users/eg/work/AI/dude`, on `main`.
- The observed working tree is substantially dirty across `.dude` workflow state, `.github`, `src`, `scripts`, `library`, and `docs`. Those changes cannot be attributed to a particular session, but concurrent implementation in this checkout has a concrete collision and integration risk.

## Candidate Approach Dimensions

- A coordinator-owned control plane over one Lightweight feature's canonical task units, with the generated board used only as a derived view.
- Claim lifecycle alternatives for granting, observing, revoking, and reassigning worker ownership, including stale or failed workers.
- Sequential and simultaneous delegation models to compare, with dependency and known-disjoint-write-set evidence required if simultaneous implementation is selected.
- A constrained shared-checkout mode for implementation only when disjoint write sets are known and Git, index, generated, and global state have one owner.
- Selective worktree isolation at the granularity of one independent top-level implementation task or worker group, rather than one worktree for every subagent. This is a candidate approach, not a selected requirement.
- A coordination checkout paired with multi-root VS Code or status and diff commands across worktree paths, so central oversight need not require branch switching or manually navigating every directory. These are candidate plan options, not requirements.
- Optional worktree lifecycle policies covering ownership of creation, naming, dependency setup, synchronization, integration, conflict handling, and cleanup.
- Worker result and evidence packet shapes to evaluate for coordinator-owned verification and state mutation.
- An explicit primary integration responsibility for accepting, sequencing, combining, or rejecting worker changes, without selecting its detailed protocol yet.

## Constraints

- This artifact is brainstorm intake only; do not create or modify a package under `.dude/specs/` or begin implementation.
- Scope v1 to coordination within one owning defined feature in Lightweight Execution.
- Do not create another persistent ledger, duplicate board, scheduler authority, or execution lane.
- Preserve the owning feature's canonical task units in `tasks.md` as the sole Lightweight authority; any generated board remains derived.
- Preserve one primary coordinator and integration owner for canonical state, claims, synthesis, integration, verification and review handoff, and closure; specialists and workers report findings, changes, and evidence.
- Do not silently permit three equal coordinators to mutate central workflow state.
- Treat worktrees and branches as checkout isolation only. They do not solve scheduling, task ownership, stale claims, dependency management, conflict resolution, integration, or canonical-state ownership.
- Do not treat a distinct branch name as isolation when concurrent sessions still share one working directory.
- Permit concurrent implementation in a shared checkout only when write sets are known to be disjoint and Git, index, generated, and global state have one owner; otherwise require an isolated checkout boundary if concurrent implementation is selected.
- Do not assume that v1 mandates worktrees, true concurrency, sequential-only behavior, automatic Git behavior, a claim protocol, or a result-packet and evidence schema before definition resolves the open questions.
- Defer cross-feature and Beads-tracked coordination from v1; do not invent requirements for either context during this brainstorm refresh.
- Do not rewrite or expand the defined sequential v1 scope of `autonomous-work-modes` through this idea.

## Definition Checklist

- [x] Outcome is coherent for brainstorm
- [x] Primary/v1 context is bounded to one Lightweight feature
- [x] Canonical authority and derived-board relationship are identified
- [x] Concrete three-session shared-checkout scenario and current collision risk are captured
- [x] Primary coordinator and integration ownership is established
- [x] Branch and worktree isolation boundaries are distinguished
- [x] Cross-feature and Beads-tracked coordination are explicitly deferred from v1
- [ ] Claim and stale-worker recovery behavior is selected
- [ ] Sequential-versus-simultaneous behavior is selected
- [ ] Any simultaneous-work readiness evidence is defined
- [ ] Shared-checkout versus selective-worktree policy is selected
- [ ] Any selected worktree lifecycle is defined
- [ ] Worker result and evidence requirements are defined

## Coordinator Log

- 2026-07-22 UTC - brainstorm captured: multi-worker coordination with one central live authority; branches and worktrees remain an unselected checkout-isolation option
- 2026-07-22 UTC - brainstorm refreshed: primary/v1 context set to Lightweight Execution within one owning defined feature; canonical task units in `tasks.md` remain authoritative and any generated board remains derived; cross-feature and Beads-tracked coordination deferred
- 2026-07-22 UTC - brainstorm refreshed: captured the three-coordinator shared-checkout scenario and current one-worktree dirty-state collision risk; established one primary coordination and integration owner and clarified branch and worktree isolation boundaries; selective worktrees and true simultaneous implementation remain unresolved
<!-- dude:managed:end -->