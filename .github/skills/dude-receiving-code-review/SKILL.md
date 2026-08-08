---
name: "dude-receiving-code-review"
description: "Use before accepting, implementing, or disputing review feedback and rejection findings. Do NOT use when issuing the verdict yourself as the reviewer (dude-reviewer-protocol)."
---

# Receiving Code Review

## Revision Procedure

The selected reviser or original author validates and addresses findings; the coordinator owns assignment and selection of the next independent reviewer.

For explicit autonomous Work, preserve the exact finding and attempt evidence and defer every repeat-triggered disposition, escalation, and user notification to `dude-work` learning governance; guarded and non-Work revision behavior remains unchanged.

1. Read every finding and clarify ambiguity before changing artifacts.
2. Verify each finding against requirements, project guardrails, code, and available evidence.
3. Accept, partially accept, or challenge it with concrete technical reasoning.
4. Address accepted findings directly and one bounded item at a time.
5. Run fresh relevant verification before claiming a finding is resolved, then report the result to the coordinator for independent re-review.

Escalate conflicts with user direction or planning authority. Do not blindly implement speculation, perform agreement, reopen unrelated scope, self-approve, assign revision ownership, or select the next reviewer.

Report accepted, clarified, and challenged findings plus fresh verification status.

## Topology-First Reset

Repeated review revisions can accumulate enforcement machinery around an assumed control point. Before producing another revision, apply a topology-first reset when any one trigger holds: the same control-boundary concern survives two review cycles; a revision introduces a new gate, store, checkpoint, or cross-session state; or enforcement expands across modules or workflow boundaries.

When a trigger holds, the planning authority must establish the topology evidence before the next revision: the production entry point and actual call path; which actor controls each operation and input; the concrete reachable failure being prevented; the narrowest existing enforcement point already covering that failure; a focused check that could disprove the topology assumption; and why each proposed stateful mechanism covers a reachable path.

Evidence that a mechanism covers a reachable path the narrowest existing point does not lets the revision proceed on that evidence; an existing chokepoint that already covers the failure means the added machinery is not carried forward. Ordinary local fixes that introduce none of that machinery are exempt even across two cycles. The reset adds this evidence obligation and weakens no existing safety, verification, or independent-review requirement.
