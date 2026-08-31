---
title: Good Enough Delivery
slug: good-enough-delivery
status: resolved
spec_path:
---

# Idea: Good Enough Delivery

## Idea

Introduce the idea of "good enough." Sometimes implementation takes too long because failing tests reveal edge cases. This goes along the lines of not doing all of the engineering things before deciding when we can do a release.

So, what is good enough? It is when users can make use of Dude without falling into weird edge cases. Think from an agile perspective, obviously. This applies to most software development, but it is not necessarily meant only for software development. It could be a generic process where the product being built reaches a stable, usable point; we deliver it, and then we make it better in the next iteration.

Maybe this could be an idea for a different bundle, or maybe one of the skills or agents. But for now, let's brainstorm it, see where it fits, and work on it later.

## Open Questions

1. What would distinguish a known edge case that is acceptable for this iteration from one that must block delivery?
   Answer:
2. What evidence would demonstrate that a product or work product is genuinely usable and stable enough to deliver?
   Answer:
3. How generic should this principle be, and which parts, if any, should be specific to software development or Dude?
   Answer:
4. What form, if any, should this eventually take: a different bundle, a skill, an agent, or something else?
   Answer:

## Assumptions

No additional assumptions have been provided.

<!-- dude:managed:start -->
## Normalized Intent

- Record the terminal package-less resolution: existing shipped directives already deliver the idea's scope-discipline and good-enough delivery intent.
- Bundle-wide YAGNI and pragmatism guidance, reinforced by the Spec Lead and coding architect, coder, and reviewer copies, already requires the smallest solution for current production needs rather than speculative hardening.
- The reviewer protocol's materially-ready standard and repeated-finding escalation, together with the verification skill's partial-claim and residual-gap rules, already provide the delivery-stopping judgment and honest evidence boundaries this idea sought.
- A separate skill, agent, or bundle would duplicate those existing rules, so no definition package is required.
- The four open questions remain unanswered. They are moot for delivery purposes because the intended outcome is already covered, not because answers were inferred.

## Constraints

- Keep this ledger terminal at `status: resolved` with an exactly empty `spec_path:` and no `.dude/specs/**` package.
- Do not create a separate skill, agent, bundle, threshold, metric, or release framework that duplicates the existing directives.
- Preserve all four unanswered questions as user-controlled text; do not fill them in, remove them, or claim they were resolved.
- Treat any consistency work for agents that lack a direct YAGNI/pragmatism copy as separate coordinator-owned follow-up, not unfinished work or a delivery gate for this ledger.

## Known Separate Follow-up

- `library/packs/coding/agents/dude-pack-coding-tester.agent.md` and `src/agents/dude-reviewer.agent.md` do not carry the YAGNI/pragmatism directive present in sibling agents. Aligning them is a separate opportunity for coordinator decision, not unfinished work of this resolved ledger.

## Definition Checklist

- [x] Existing directives covering YAGNI, pragmatism, and current-need scope discipline are identified
- [x] Existing directives covering materially-ready delivery, repeated-finding escalation, partial claims, and residual gaps are identified
- [x] A separate skill, agent, or bundle would duplicate current rules, so no package is required
- [x] All four open questions remain unanswered and no longer gate anything because the intended outcome is already covered
- [x] Missing direct agent copies are recorded only as a separate coordinator-owned follow-up opportunity

## Coordinator Log

- 2026-07-20 UTC - brainstorm captured
- 2026-08-11 UTC - idea resolved without a package because its intent is already delivered by existing directives: bundle-wide YAGNI and pragmatism guidance plus the Spec Lead and coding architect/coder/reviewer copies cover scope discipline; the reviewer protocol's materially-ready standard and repeated-finding escalation, together with the verification skill's partial-claim and residual-gap rules, cover when work is good enough to deliver; a separate skill, agent, or bundle would duplicate those existing rules
<!-- dude:managed:end -->