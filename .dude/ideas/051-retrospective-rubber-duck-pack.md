---
title: Retrospective Rubber Duck Pack
slug: retrospective-rubber-duck-pack
status: draft
spec_path:
---

# Idea: Retrospective Rubber Duck Pack

## Idea

Create an optional Dude pack that provides a read-only, non-authoritative Rubber Duck retrospective. When the pack is installed, the coordinator dispatches the Rubber Duck exactly once as the final agent dispatch before coordinator close on successful feature and Ship completion. It does not run on ordinary task closes; failed, blocked, cancelled, or abandoned endings; or successful release runs.

A release is an intentional action. Whoever authorizes it should already have reviewed or be aware of the Rubber Duck results. A release may also need to deliver a functional or security fix without adding another retrospective step, so successful release runs never dispatch the Rubber Duck.

This dispatch is an ordinary step in the pending-close sequence after existing approval requirements have passed:

1. final Reviewer approval
2. one Rubber Duck retrospective
3. coordinator close
4. universal core closeout report

The Rubber Duck's feedback must outlive the session. Persist the retrospective as a durable artifact rather than leaving it only in the session response. This durability lets someone authorizing a later release review or remain aware of the results.

The Rubber Duck's findings are advisory. A finding does not abort close, force revision, or cause another Rubber Duck dispatch. The artifact records feedback but grants no authority. Close proceeds after the one dispatch, and Tester and Reviewer authority remains unchanged. Without the pack, the existing Reviewer -> coordinator close -> universal core closeout behavior remains unchanged.

The coordinator performs the dispatch as a normal workflow step when the pack is installed. This behavior uses no event, callback, hook, listener, subscription, or lifecycle-extension mechanism. `pack.md` declares `hooks: []`; that field is inert metadata and does not activate the Rubber Duck.

The Rubber Duck can only read and search. It cannot mutate task state, Coordinator Logs, definition artifacts, memory, ideas, cleanup, delivery, or Git. It does not replace or overrule Tester or Reviewer. The coordinator-writer split is a working assumption to settle during explicit `define`.

Future improvements remain advisory and are not automatically captured as ideas or tasks. Reusable lessons continue through existing learning-promotion and memory authority.

Keep this as one bounded optional-pack outcome. Decide the pack name, whether it needs a separate procedural skill, its artifact filenames, and its model class during explicit `define`, based on the smallest design that satisfies this intent.

The separate core idea `.dude/ideas/050-completion-closeout-report.md` owns the universal deterministic closeout report and must not depend on this pack. This pack contributes optional advisory feedback and one bounded per-feature retrospective artifact.

## Open Questions

- None.

## Assumptions

- **Coordinator working assumption:** The optional dispatch is inserted after existing successful-completion approvals and before coordinator close; it adds no approval gate or retry path.
- **Coordinator working assumption:** Persist the result at `.dude/specs/<NNN>-<slug>/retrospective.md` as a supporting artifact inside the feature's existing definition package. The Rubber Duck runs only after successful feature or Ship completion, where a package already exists.
- **Coordinator working assumption:** The coordinator writes the artifact at close alongside the existing close event. The Rubber Duck remains read-only and never writes.
- **Coordinator working assumption:** Use append-only dated entries so a re-shipped feature accumulates history instead of overwriting earlier retrospectives.
- **Coordinator working assumption:** The artifact is durable evidence, never authority. It does not gate or delay close. Promoting its contents into an idea, task, or memory requires explicit action through existing learning-promotion and memory authority.
- **Coordinator working assumption:** During explicit `define`, decide whether the universal closeout report may cite the written retrospective path. This is not yet decided and must not create a dependency from core to this pack.

<!-- dude:managed:start -->
## Normalized Intent

- Add one optional pack that provides a read-only, non-authoritative Rubber Duck retrospective.
- When the pack is installed, dispatch the Rubber Duck exactly once as the final agent dispatch before coordinator close on successful feature and Ship completion.
- Do not dispatch it for successful release runs, ordinary task closes, or failed, blocked, cancelled, or abandoned endings.
- Exclude release runs because release is intentionally authorized, the authorizer should already have reviewed or be aware of the Rubber Duck results, and functional or security fixes may need to ship without another retrospective step.
- Preserve the successful installed sequence: final Reviewer approval -> one Rubber Duck retrospective -> coordinator close -> universal core closeout report.
- Persist every Rubber Duck retrospective as a durable per-feature artifact rather than leaving it only in a session response.
- Treat every Rubber Duck finding as advisory. A finding does not abort close, force revision, add an approval gate, or cause a rerun.
- Keep the Rubber Duck limited to read and search. It cannot mutate task state, Coordinator Logs, definition artifacts, memory, ideas, cleanup, delivery, or Git.
- Treat the artifact as evidence only. It does not gain authority from its location or persistence.
- Preserve Tester and Reviewer authority; the Rubber Duck neither replaces nor overrules either role.
- Keep future improvements advisory. Do not automatically create ideas or tasks from them.
- Route reusable lessons only through existing learning-promotion and memory authority.
- Keep the universal deterministic closeout report owned by `.dude/ideas/050-completion-closeout-report.md`; that core capability must not depend on this pack.
- Preserve existing Reviewer -> coordinator close -> universal core closeout behavior when the pack is absent.
- Defer the pack name, need for a separate procedural skill, artifact filenames, and model class to explicit definition.
- Leave any closeout-report citation of the retrospective path for explicit definition without creating a core dependency on the pack.

## Workflow Boundary

- Installed successful feature or Ship path: existing approval requirements pass -> coordinator dispatches the Rubber Duck once while close is pending -> coordinator closes regardless of the advisory findings -> core closeout response.
- Excluded endings: ordinary task closes and failed, blocked, cancelled, or abandoned feature or Ship endings do not dispatch the Rubber Duck.
- Uninstalled path: existing Reviewer approval -> coordinator close -> core closeout response, with no missing-pack warning or degraded core behavior.
- Activation boundary: the coordinator dispatch is an ordinary workflow step. It is not an event, callback, hook, listener, subscription, or lifecycle extension.
- Release path: successful release runs never dispatch the Rubber Duck.
- Persistence boundary: the Rubber Duck returns read-only findings to the coordinator. Under the coordinator working assumptions, the coordinator writes the durable retrospective during close.

## Constraints

- Keep the outcome bounded to one optional pack.
- Keep `hooks: []` in `pack.md` as inert metadata, never as an activation mechanism.
- Give the Rubber Duck only read and search capabilities.
- Do not let the Rubber Duck approve, overrule, close, clean up, deliver, write Git state, or mutate task glyphs or metadata, Coordinator Logs, definition artifacts, retrospective artifacts, memory, or ideas.
- Under the coordinator working assumptions, let only the coordinator persist the bounded per-feature retrospective artifact.
- Do not replace or weaken Tester, Reviewer, learning-promotion, or memory authority.
- Do not let a finding block close, force revision, create a retry, or trigger a second Rubber Duck dispatch.
- Do not run after each task, after successful release runs, or after failed, blocked, cancelled, or abandoned endings.
- Do not create an event, callback, hook, listener, subscription, lifecycle-extension mechanism, or other activation subsystem.
- Do not create a new core command, lane, board, state model, registry, scheduler, daemon, index, or cross-feature aggregation surface. The only new durable output is one bounded per-feature retrospective artifact.
- Do not make core depend on the optional pack or name it as a required runtime participant.
- Do not duplicate the deterministic final report owned by `.dude/ideas/050-completion-closeout-report.md`.
- Do not automatically promote advisory feedback into ideas, tasks, or memory.
- Do not settle the pack name, procedural-skill split, artifact filenames, or model class during brainstorm.
- Create no definition package or implementation artifact during brainstorm.

## Current Project Context

- `library/packs/` is the authoritative catalog for optional expansions, and installed artifacts use the `dude-pack-<pack>-<slug>` namespace.
- Maintained catalog packs declare at least one real lowercase kebab-case `use-cases` value; discovery metadata does not itself activate routing or runtime behavior.
- Pack agents can use the read-only `["read", "search"]` tool set.
- `.dude/ideas/050-completion-closeout-report.md` separately owns the universal deterministic coordinator closeout report; its behavior cannot depend on whether this optional pack is installed.
- Pack identity, exact retrospective shape, and model selection are definition-stage design choices.

## Definition Checklist

- [x] Outcome is one bounded optional-pack capability
- [x] Successful feature and Ship trigger boundaries are explicit
- [x] Successful release runs, ordinary task closes, and unsuccessful endings are excluded
- [x] Release rationale preserves intentional authorization, prior awareness, and functional or security fix delivery
- [x] Exactly one dispatch occurs, findings remain advisory, and close proceeds without retry
- [x] Rubber Duck feedback must persist as a durable artifact rather than remain session-only
- [x] Rubber Duck remains read-only and the coordinator owns artifact writes
- [x] Artifact location, write timing, append behavior, and evidence-only role are labeled as coordinator working assumptions for definition
- [x] Reviewer, Tester, learning, and memory authority remain unchanged
- [x] Read-only tools and prohibited mutations are explicit
- [x] Coordinator dispatch is distinguished from events, callbacks, hooks, listeners, subscriptions, and lifecycle extensions
- [x] Pack name, procedural-skill split, artifact filenames, and model class remain deferred to definition
- [x] Final reporting remains owned by `.dude/ideas/050-completion-closeout-report.md`
- [x] Release-run scope is answered: successful release runs never dispatch the Rubber Duck
- [ ] Whether the closeout report cites the retrospective path remains deferred to explicit definition
- [x] Definition, implementation, validation, and publication remain deferred

## Coordinator Log

- 2026-08-31 UTC - brainstorm first-capture draft staged for coordinator publication; definition deferred to explicit `define retrospective-rubber-duck-pack`
- 2026-08-31 UTC - brainstorm draft refreshed at user direction to narrow successful-completion scope, make Rubber Duck findings advisory, clarify ordinary coordinator dispatch, and defer pack design choices
- 2026-08-31 UTC - brainstorm draft refreshed at user direction to exclude release runs, require durable retrospective feedback, and defer artifact shape to explicit definition
<!-- dude:managed:end -->
