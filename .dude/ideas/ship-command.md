---
title: Ship Command
slug: ship-command
status: defined
spec_path: .dude/specs/017-ship-command/spec.md
---

# Idea: Ship Command

## Idea

The usual flow is brainstorm, then define, then work, and the feature gets implemented. But ideas come at two extremes. Some ideas are very simple and the implementation is straightforward, so I do not even look at the spec. Other ideas are very complicated, the spec becomes huge, and I will not read that either, because the specification was derived from my idea, I trust it, and it is too complicated to review. So the human review gate at the spec produces no value at either extreme.

To be completely clear: this is NOT about removing the spec. The spec serves the rest of the work really well. It is a ledger of the work, I go back to it, and I love it. What should be removed is the GATE, the human stop between define and work.

I want to emit one command and have Dude use the existing lifecycle to create the spec when needed, then go straight to work without waiting for me to ask it to work.

The same pattern shows up outside code. For visual or design work, a mockup or a visual design, I usually go from a brief or a brainstorming session straight to implementation.

There is a second, related ask. The autonomous Work options are too complicated for a user to remember. Assembling that invocation means reading through the documentation first. They should collapse into one simple verb that works whether the target needs definition or is already defined.

The verb is `ship`. I explicitly reject `go`.

### Agreed Shape

The unifying insight is that "don't stop at the spec" and the autonomous Work preset belong behind one lifecycle verb. One verb carries both without changing either workflow.

`@dude ship [<target>]` means advance until done or an existing Work stop. It accepts an optional target and no flags. Resolution uses existing lifecycle state:

- An unmatched raw idea follows the existing brainstorm path to create one ledger, then existing define, then Work.
- An existing `draft` ledger goes through existing define, then Work.
- An existing `defined` package goes straight to Work as-is.
- A bare `ship` resumes exactly one unambiguous live target.

When several otherwise-valid candidates exist, `ship` fails closed before mutation and asks exactly one disambiguation question listing the exact candidates. Resolution restarts from the answer; it never ranks candidates, infers a default, or persists one. Ownership or resolver diagnostics that target selection cannot fix remain hard refusals.

Existing ledgers and packages are used as-is. `ship` does not detect staleness, merge invocation text into existing intent, proactively redefine a package, or add drift detection. New or changed intent requires explicit `brainstorm`; deliberate package refresh requires explicit `define`. Work's existing unchanged-intent Lightweight repair exception remains unchanged.

After lifecycle resolution, `ship` delegates exactly to the semantics of `@dude work [<feature>] --max unlimited --recover-on-block --recovery-cycles unlimited --policy autonomous`. `--until blocked` is intentionally omitted because current Work forbids combining it with recovery; autonomous recovery already continues until an existing Work stop.

Work retains its existing one-time lane detection. Imported tracked work is authoritative and takes precedence; otherwise a newly defined target uses Lightweight. `ship` never invokes `track`, never imports into Beads, and never changes tracked-definition recovery, which still refuses. If an explicit lifecycle target conflicts with active tracked work, `ship` stops before mutation and reports that tracked work has precedence instead of silently working a different target.

This is a pragmatic, additive resolver plus preset over the existing lifecycle and Work behavior. It introduces no new authority and does not weaken, minimize, or reimplement any existing workflow. Every existing Work stop, verification rule, review rule, ownership gate, close protocol, audit, and reporting obligation remains authoritative.

### Checkpoint Disposition Under Ship

- Successful definition removes only the routine handoff that asks the human to start Work.
- Existing brainstorm and definition clarification gates remain authoritative. As presentation only, batch focused questions when practical. Unresolved, changed, or ambiguous intent still stops and returns to explicit `brainstorm` or `define`; unanswered questions never silently become assumptions, and there is no single-round bypass.
- Guardrail candidates retain the existing `accept|edit|reject|skip` ratification checkpoint. `ship` does not answer it for the user.
- Current lean-definition gates and existing review rules apply exactly. Simple or visual work may produce a short package, while fuller artifacts are created only when materially required. There is no depth dial, complexity score, or conditional spec-review policy.
- Reviewer rejection reuses Feature 005's existing autonomous recovery and learning-governance behavior.
- Existing autonomous final audit and reporting remain unchanged. Any visibility into decisions made for the user comes from that audit, not a new report or ledger.

### Git Isolation

`ship` creates no branch or worktree automatically. The existing optional recommendation remains available for risky or high-churn work, or genuinely independent work where isolation has a concrete benefit. `ship` never auto-commits, auto-pushes, or resets.

### Stop Rule And Positioning

There is no finite `ship` iteration ceiling, `N tasks left` checkpoint, or new report. The user-facing meaning remains qualified: advance until done or an existing Work stop, never an unconditional promise of completion.

`ship` becomes the usual convenience verb. `work` remains the explicit, advanced form for custom limits, recovery, and policy. Unsupported `ship` flags reject before mutation and point to the equivalent Work command; there are no aliases or hidden normalization.

### Naming And Rejected Alternatives

No `@dude ship` verb exists in core or in any pack. The release pack ships the `dude-pack-release-manager` agent plus three skills, routed by the keys `release`, `versioning`, and `pipeline`, so there is no verb collision. The accepted consequence is that a future release verb would be named `release` or `publish` rather than `ship`. `deliver` is the only fallback name considered acceptable.

One alternative is worth recording as rejected: changing Work's current defaults to autonomous unlimited recovery. Rejected because it changes behavior for existing invocations, since guarded-by-default is a deliberate safety choice, and because it does nothing for the lifecycle shortcut, which is the primary ask.

### Non-Goals

No new lane, state file, board, second ledger, concurrency, scheduler, configuration, or profile system. No staleness detection, heuristic intent merging, depth scoring, conditional review policy, automatic branching or worktrees, or new reports. No reduction or reimplementation of definition, verification, review, ownership, reconciliation, audit, reporting, or close behavior.

## Open Questions

1. Does `ship` support Tracked Execution, or Lightweight only in v1? The existing automatic unchanged-intent redefinition route in `dude-work` is Lightweight-only, and tracked definition recovery refuses before writes.
   Answer: Both current lanes. After lifecycle resolution, `ship` delegates to Work's existing one-time lane detection. Imported tracked work remains authoritative and takes precedence; otherwise a newly defined target uses Lightweight. `ship` never invokes `track`, imports into Beads, or changes tracked-definition recovery, which still refuses. If an explicit lifecycle target conflicts with active tracked work, `ship` stops before mutation and reports that tracked work has precedence instead of working a different target.
2. On an already-`defined` package, does `ship` re-define first to absorb any drift, or go straight to work on the existing package?
   Answer: Go straight to Work on the existing package. `ship` does not proactively redefine or add drift detection. Intent changes require explicit `brainstorm`; deliberate package refresh requires explicit `define`; Work's existing unchanged-intent Lightweight repair exception remains unchanged.
3. On an idea ledger that already exists, does `ship` re-run brainstorm to absorb new input from the invocation, or require the ledger to already be current and refuse otherwise?
   Answer: Use an existing idea ledger as-is. `ship` does not rerun brainstorm or detect staleness. A raw unmatched idea may follow the existing brainstorm path to create a new ledger, preserving raw-idea support. New or changed intent for an existing ledger requires explicit `brainstorm` first; `ship` does not heuristically merge intent.
4. Is the independent spec review always on, or only above a depth threshold? And is the depth dial inferred by Dude from the idea, or declared by the user in the idea?
   Answer: No depth dial, complexity score, or new conditional spec-review policy in v1. Apply the current lean-definition gates and existing review rules exactly: simple or visual work may produce a short package, while fuller artifacts are created only when materially required. `ship` removes only the successful post-definition handoff.
5. Is branch-or-worktree-by-default in scope for v1, or a separate follow-up that `ship` depends on but does not deliver?
   Answer: No automatic branch or worktree. Preserve the current optional recommendation for risky/high-churn or genuinely independent work. `ship` never auto-commits, auto-pushes, or resets.
6. What is the v1 iteration ceiling, and exactly what does the "N tasks left, `ship` again to continue" checkpoint report contain?
   Answer: No finite iteration ceiling and no dependency on `good-enough-delivery`. After lifecycle resolution, delegate exactly to `@dude work [<feature>] --max unlimited --recover-on-block --recovery-cycles unlimited --policy autonomous`. Intentionally omit `--until blocked` because current Work forbids combining it with recovery; autonomous recovery already continues until an existing Work stop. Do not add an `N tasks left` checkpoint or a new report. User-facing wording is "advance until done or an existing Work stop," not an unconditional promise of completion.
7. Should `ship` accept any flags at all, or be strictly zero-flag with `work` retained as the only escape hatch?
   Answer: `ship` accepts only an optional target and no flags. Advanced or custom limits, recovery, and policy remain on `work`. Unsupported `ship` flags reject before mutation and point to the equivalent Work command; there are no aliases or hidden normalization.
8. How does `ship` behave when the resolver finds multiple candidate ideas or packages: refuse as ambiguous, or ask exactly one disambiguation question?
   Answer: When several otherwise-valid candidates exist, fail closed before mutation and ask exactly one disambiguation question listing the exact candidates. Restart resolution using the answer; never rank, infer, or persist a default. Ownership or resolver diagnostics that target selection cannot fix remain hard refusals.

## Assumptions

These are the Spec Lead's assumptions, not the user's, and any of them can be overturned.

- Spec artifacts are preserved unchanged. `ship` removes the human stop between define and work, not the specification, its package layout, or its role as the durable ledger of the work.
- `ship` is a preset plus a lifecycle resolver. It relaxes no hard stop, verification requirement, independent review, ownership gate, reconciliation rule, or close rule.
- Guarded `work` behavior is untouched. Existing `@dude work` invocations keep their current defaults and meaning.
- `ship` is additive. No existing verb changes meaning, and no existing invocation changes behavior because this feature exists.
- The autonomy primitives come from Feature 005 (`--policy autonomous`, the hard-stop taxonomy, recovery, and learning governance). `ship` composes them rather than reimplementing them, so it depends on 005 being in force.
- The exact preset is `@dude work [<feature>] --max unlimited --recover-on-block --recovery-cycles unlimited --policy autonomous`; `--until blocked` is omitted because Work forbids combining it with recovery.
- Both current execution lanes remain available through Work's existing one-time lane detection. Imported tracked work takes precedence; otherwise a newly defined target uses Lightweight. `ship` never tracks or imports work.
- Existing ledgers and defined packages are current inputs. `ship` adds no staleness detection, intent merging, proactive redefinition, or drift check; explicit `brainstorm`, explicit `define`, and Work's existing Lightweight repair exception retain their current roles.
- Existing lean-definition and review rules are sufficient. `ship` adds no depth score or conditional review policy.
- Guardrail ratification remains the existing `accept|edit|reject|skip` user checkpoint; `ship` does not choose for the user.
- Existing autonomous final audit and reporting provide decision visibility; `ship` adds no report or ledger.

<!-- dude:managed:start -->
## Normalized Intent

### Resolve The Lifecycle Once

- Provide `@dude ship [<target>]` as an additive convenience verb meaning "advance until done or an existing Work stop."
- For an unmatched raw idea, use the existing brainstorm path to create one ledger, then existing define, then Work. For an existing `draft` ledger, define then Work. For an existing `defined` package, go straight to Work as-is. A bare `ship` resumes exactly one unambiguous live target.
- Use existing ledgers and packages without staleness detection, heuristic intent merging, proactive redefinition, or drift detection. New or changed intent requires explicit `brainstorm`; deliberate package refresh requires explicit `define`.
- When several otherwise-valid candidates exist, fail closed before mutation and ask exactly one disambiguation question listing the exact candidates. Restart resolution from the answer without ranking, inference, or a persisted default. Unrelated ownership or resolver diagnostics remain hard refusals.

### Delegate To Existing Work

- After lifecycle resolution, delegate exactly to `@dude work [<feature>] --max unlimited --recover-on-block --recovery-cycles unlimited --policy autonomous`.
- Omit `--until blocked` because current Work forbids combining it with recovery; autonomous recovery already continues until an existing Work stop.
- Delegate lane choice to Work's existing one-time detection. Imported tracked work remains authoritative and takes precedence; otherwise a newly defined target uses Lightweight.
- Never invoke `track`, import into Beads, or change tracked-definition recovery. If an explicit lifecycle target conflicts with active tracked work, stop before mutation and report tracked precedence.
- Accept only an optional target and no flags. Reject unsupported flags before mutation and point to the equivalent Work command; keep custom limits, recovery, and policy on `work` without aliases or hidden normalization.

### Preserve Definition And Review

- Preserve specifications and the complete existing definition workflow; remove only the routine successful handoff between define and Work.
- Apply current lean-definition gates and existing review rules exactly. Add no depth dial, complexity score, or conditional spec-review policy.
- As presentation only, batch focused questions already required by brainstorm and definition when practical. Unresolved, changed, or ambiguous intent still stops and returns to explicit `brainstorm` or `define`; never convert unanswered questions into assumptions or grant a single-round bypass.
- Retain the existing `accept|edit|reject|skip` guardrail checkpoint when candidates exist. `ship` never answers it for the user.

### Preserve Existing Authority And Reporting

- Keep every existing Work stop, verification rule, review rule, ownership gate, reconciliation rule, close protocol, audit, and reporting obligation authoritative.
- Reuse Feature 005's autonomous reviewer-rejection, recovery, and learning-governance behavior without adding a path.
- Keep Git isolation optional under the existing recommendation rules. Never create a branch or worktree automatically, and never auto-commit, auto-push, or reset.
- Use the existing autonomous final audit and reporting for decisions made for the user. Add no report, ledger, finite iteration checkpoint, or task-count checkpoint.

## Constraints

- This ledger owns the defined package at `.dude/specs/017-ship-command/spec.md`; later intent changes still require explicit `brainstorm` followed by explicit `define`.
- Preserve spec artifacts and existing lean-definition and review behavior; remove only the routine handoff after successful definition.
- Delegate execution exactly to `@dude work [<feature>] --max unlimited --recover-on-block --recovery-cycles unlimited --policy autonomous`; do not add `--until blocked`, a finite ceiling, or a new checkpoint.
- Delegate both current lanes to Work's existing one-time detection. Tracked work remains authoritative and takes precedence; never invoke `track`, import into Beads, or alter tracked-definition recovery.
- Accept no `ship` flags. Reject unsupported flags before mutation and direct advanced use to the equivalent Work command.
- Do not change the meaning or defaults of any existing verb or reimplement Work behavior.
- Do not relax any existing stop, verification, review, ownership, reconciliation, close, audit, or reporting rule.
- Keep guardrail ratification unchanged; `ship` must not choose `accept`, `edit`, `reject`, or `skip` for the user.
- Do not automatically create branches or worktrees, commit, push, or reset.
- Do not introduce staleness detection, heuristic intent merging, depth scoring, conditional review policy, or new reports.
- Do not introduce a new lane, state file, board, second ledger, concurrency, scheduler, configuration system, or profile system.
- The verb is `ship`; `go` is rejected. `deliver` is the only acceptable fallback name. A future release verb must be named `release` or `publish`.
- Do not adopt the rejected alternative of changing Work's existing defaults.

## Definition Checklist

- [x] Outcome is clear enough for brainstorm
- [x] Scope is coherent as one idea ledger
- [x] Naming and verb-collision check recorded
- [x] Cross-feature dependency on Feature 005 is captured
- [x] All eight open questions have user-approved answers

## Coordinator Log

- 2026-07-31 UTC - brainstorm captured
- 2026-08-01 UTC - brainstorm refreshed: all eight Ship resolution, lane, lifecycle, review, Git, preset, flag, and ambiguity questions settled around a thin wrapper over existing workflows
- 2026-08-01 UTC - defined -> .dude/specs/017-ship-command/spec.md
<!-- dude:managed:end -->
- 2026-08-01T15:18:20Z - Work iteration 1/3 started T001@73686970: add the thin Ship lifecycle resolver and exact Work delegation.
