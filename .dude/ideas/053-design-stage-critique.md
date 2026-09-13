---
title: Design-Stage Critique
slug: design-stage-critique
status: draft
spec_path:
---

# Idea: Design-Stage Critique

## Idea

> "should design-stage critique become a durable harness capability. I would say yes. so far the mockups are used to capture the feedback from the user. So it's a work between the user and the agent but there are details that might skip the user's eye and for that I believe the design critique can be very useful and handy. So I would say yes. Should be a durable hardness category."

The mockup loop today is a two-way exchange between the user and the agent. The
user supplies judgment on what they can see, but details can slip past the
user's eye. An independent critical pass during the design stage can catch what
neither party notices. This should be a durable harness category, not an ad-hoc
habit.

### Advisory-only authority is a hard constraint

The capability should make the user better informed before they approve, not
take the decision away from them. Severity assesses consequence and never
grants workflow authority: even a `Major` finding must not block anything,
abort or delay progress, force revision, or add an approval gate.

The user owns design approval. Letting a critic block `proposed` -> `approved`
would displace the user's authority over their own product and aesthetic
judgment. It would also change the harness authority model, which is a much
larger change than requested.

## Open Questions

1. Which pack owns it: a new agent in the `design` pack, which currently has
   none; a second agent in the `rubber-duck` pack alongside the
   completion-bound retrospective; or a step inside the
   `dude-pack-design-workflow` skill with no new agent?
   Recommendation: use an agent in the `design` pack because the capability is
   design-lane-specific and that pack already owns the workflow, gate, and
   mockup conventions. The competing argument is that co-locating both critics
   in the `rubber-duck` pack keeps all adversarial-review capability together.
   Answer:

2. Is the scope design-only, or should critique be available at other
   pre-completion stages such as spec and plan? The critique that produced this
   idea reviewed a brainstorm idea ledger rather than a mockup and was valuable
   there.
   Recommendation: name the capability and trigger around the design stage
   first because that is the user's stated need, while deliberately avoiding a
   design that would prevent a later broader stage.
   Answer:

3. Is critique automatic at a defined point in the design loop, or
   user-invoked on demand?
   Recommendation: make it user-invocable on demand, with a suggested prompt at
   settle before `proposed`. Automatic critique on every mock iteration risks
   noise and slows the fast loop the user explicitly wants.
   Answer:

4. How do findings persist, if at all? The completion retrospective writes
   `.dude/specs/<NNN>-<slug>/retrospective.md`, and only the coordinator may
   write it. Should design critique get its own artifact, append to the design
   revision log in `spec.md`, or stay transient in conversation?
   Recommendation: keep the first version transient and report findings in
   conversation. Add an artifact only if repeated use proves it is needed;
   avoid inventing a persistent state surface before that need is demonstrated.
   Answer:

5. Does critique review only what is visible in the mock, or also the
   surrounding spec, plan, and feasibility context?
   Recommendation: allow surrounding context because the strongest finding in
   the originating session concerned build packaging, which no mockup could
   reveal.
   Answer:

## Assumptions

- **Coordinator working assumption:** The first version should satisfy the
  stated design-stage need without adding persistence or broadening into a
  general critique framework before repeated use proves either capability is
  needed.
- **Coordinator working assumption:** Critique remains advisory regardless of
  severity, and the user remains the sole design-approval authority.

<!-- dude:managed:start -->
## Normalized Intent

- Establish design-stage critique as a durable harness category rather than an
  ad-hoc habit.
- Add an independent critical pass to the current two-way mockup exchange
  between user and agent so consequential details that escape the user's eye or
  the working agent can be surfaced while changes are cheap.
- Place critique during `design_status: exploring` or immediately before
  `proposed`, before the user is asked to approve.
- Keep every finding advisory. Severity communicates consequence but grants no
  workflow authority, including for a `Major` finding.
- Never let critique block `proposed` -> `approved`, abort or delay work, force
  revision, add an approval gate, or displace the user's product and aesthetic
  judgment.
- Let critique consider surrounding specification, plan, packaging, and
  feasibility context when useful rather than limiting it to visible mock
  details.
- Keep this outcome separate from `052-dude-canvas-ui`. That feature motivates
  and benefits from this capability but does not depend on it and can use the
  general-purpose on-demand advisor in the meantime.

## Coordinator-Verified Findings

- **Origin:** This idea came out of the `052-dude-canvas-ui` brainstorm. Before
  definition, the coordinator ran a general-purpose `rubber-duck` advisor
  against that in-progress ledger. It returned ten findings, including three
  consequential gaps the participants had missed:
  - `scripts/build-release.mjs` has no `.github/extensions/` handling, so a
    canvas extension would not reach release users;
  - the UI-to-agent control plane was assumed rather than specified; and
  - the premise that all Dude state is Markdown is false because
    `.dude/state/task-state.json` holds authoritative task glyphs.
  This directly supports the user's point that a critical pass catches details
  the user-and-agent loop does not.
- **Current gap:** The installed `dude-pack-rubber-duck-retrospective` agent
  declares `user-invocable: false`. Its agent contract and
  `library/packs/rubber-duck/pack.md` bind it to exactly one dispatch as the
  final agent before coordinator close for an eligible successful feature or
  Ship completion. It does not run for ordinary closes or in-progress work.
  The harness therefore has end-of-feature critique but none during design,
  when changes are cheapest.
- **Existing doctrine:** `dude-pack-design-workflow` says, "Fail fast on the
  page, not after approval. A great-looking mock with an affordance that can't
  exist forces the whole loop again — approve, try to build, discover it's
  impossible, strip it, redo the mock. Catch it while it is still a cheap
  edit." The workflow already argues for this capability but has no agent to
  perform it.
- **Natural insertion point:** The design workflow moves through
  `design_status: exploring` -> `proposed` -> `approved`, with the user
  approving at the final gate. Critique belongs during `exploring`, or
  immediately before `proposed`, so findings can be incorporated before the
  user is asked to approve.
- **Available home:** `library/packs/design/pack.md` currently declares
  `agents: []` and provides only `dude-pack-design-workflow` and
  `dude-pack-design-frontend-aesthetics`. Adding a design-critic agent there
  would be additive rather than disruptive.
- **Related defined work:** `032-theme-agnostic-design-workflow` and
  `044-persistent-design-mockups` shape the design workflow this capability
  would extend and must be checked for overlap during definition.

## Relationship to Dude Canvas UI

- `.dude/ideas/052-dude-canvas-ui.md` is the motivating case and benefits from
  this capability, but it must not depend on it.
- Idea 052 can proceed with the general-purpose advisor invoked on demand
  during its design phase.
- These are separate bounded outcomes with separate success tests, which is why
  design-stage critique has its own ledger.

## Constraints

- Preserve the user's framing of this as a durable harness category.
- Keep the critic advisory-only regardless of finding severity.
- Preserve the user's sole authority over design approval.
- Do not add a blocking transition, forced revision, delay, retry, or approval
  gate.
- Do not alter the completion-bound retrospective agent's one-dispatch
  contract.
- Do not make idea 052 depend on this capability.
- Keep the first version lean. Do not create a persistent critique artifact,
  generalized multi-stage framework, new state surface, or other machinery
  unless definition resolves a demonstrated current need.
- This brainstorm creates one idea ledger only. Definition, package artifacts,
  tasks, and implementation require a later explicit workflow action.

## Definition Checklist

- [x] One bounded capability is captured
- [x] User reasoning and durable-harness-category framing are preserved
- [x] Advisory-only authority and user-owned design approval are explicit
- [x] Originating evidence and the current critique gap are recorded
- [x] Natural workflow insertion point and possible pack home are recorded
- [x] Relationship to idea 052 is non-blocking
- [x] Related defined work to inspect during definition is identified
- [ ] Pack ownership is unresolved
- [ ] Design-only versus broader pre-completion scope is unresolved
- [ ] Automatic versus on-demand invocation is unresolved
- [ ] Finding persistence is unresolved
- [ ] Visible-mock-only versus surrounding-context review is unresolved

## Coordinator Log

- 2026-09-01 UTC - brainstorm first-capture draft staged for coordinator publication; recorded design-stage critique as a durable advisory-only harness category, its origin in idea 052, the current completion-only critique gap, five open questions, and the non-dependency from 052; definition deferred to explicit `define design-stage-critique`
<!-- dude:managed:end -->
