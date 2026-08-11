---
name: "dude-work-intake"
description: "Use to triage a request, choose direct response or routing, capture an idea, or decide whether explicit definition is ready. Do NOT use to write the definition artifacts themselves (dude-feature-definition) or to run execution (dude-work)."
---

# Work Intake

## Triage

Read applicable project memory and conventions. Decide whether the request is a direct answer, one specialist task, independent subtasks, raw feature input for `brainstorm`, or an explicit `define` request. Ask only for missing information that changes outcome, hard constraints, approval, or routing.

For a fresh project, establish: one feature or several outcomes, implement now or define only, and material hard constraints. Do not repeat questions already answered. Implementation without an explicit Beads request defaults to Lightweight Execution.

## Brainstorm

`@dude brainstorm <idea>` creates or refreshes exactly one flat `.dude/ideas/<slug>.md` and never creates or refreshes `.dude/specs/`.

- Keep user intent in `## Idea`, followed by active `## Open Questions` and answer slots, then `## Assumptions`.
- Preserve meaning, tone, uncertainty, incomplete thought, creative intent, answered questions, assumptions, and user edits. Initial cleanup may fix only clear language or transcription errors.
- Set `status: draft` with an empty `spec_path:` only for a first or still-undefined draft. A brainstorm rerun of a ledger already at `status: defined` preserves that status and its exact `spec_path:`; never demote it or orphan its package.
- A normal refresh of an exact `status: resolved` ledger preserves its empty path. Reopen it only when the user explicitly asks to reopen through `brainstorm <slug>`; then return it to draft with an empty path and append one lifecycle event.
- If the input contains separate bounded outcomes, ask one split question or propose separate idea ledgers.

The user controls `## Idea`, open-question answers, and `## Assumptions`; during explicit brainstorm the delegated Spec Lead preserves them and maintains definition metadata, managed sections, and definition log events.

## Definition Gate

Route explicit `define <slug>` to the Spec Lead and load `dude-feature-definition` when the outcome is clear, unresolved questions are answered or consciously assumed, and one package can contain the scope. A resolved ledger must first be explicitly reopened through `brainstorm <slug>`; definition does not infer reopen or create its package. Otherwise add or ask one focused clarification.

Direct facts stay direct. Implementation, verification, planning, artifact authoring, and review route through the closed-roster algorithm in `dude-generic-routing`.

## Ship

`@dude ship [<target>]` accepts exactly one optional target and no flags. Validate the complete invocation before any mutation. Refuse a flag in any position or form, a target-like value beginning with `-`, or more than one target; for custom controls, point to semantically equivalent advanced Work usage without silently normalizing the Ship request.

Resolve the lifecycle target by invoking only existing explicit lifecycle routes; Ship has no definition-write authority of its own:

1. Imported tracked work wins. Bare Ship selects that authoritative tracked target; an explicit lifecycle target that conflicts with it stops before mutation and reports tracked precedence. Ship never invokes `track`, imports work, or falls back from tracked work to Lightweight Execution.
2. An unmatched raw idea invokes the existing explicit `brainstorm <idea>` route as one lifecycle subaction to create exactly one ledger, then invokes the existing explicit `define <slug>` route as a distinct lifecycle subaction, then Work.
3. An existing draft ledger invokes the existing explicit `define <slug>` route as a lifecycle subaction, then Work.
4. An existing defined package goes to Work as-is. Do not proactively redefine it, check staleness or drift, or merge invocation text into its intent. New or changed intent requires explicit `brainstorm`; deliberate package refresh requires explicit `define`.
5. An existing resolved ledger is terminal and is not a live package candidate. Stop before definition or Work and point to explicit `brainstorm <slug>` reopen; Ship never infers reopen.
6. Bare Ship without tracked work proceeds only for exactly one unambiguous live lifecycle target.

Ship creates no alternate definition-write route or authority. In every invoked `brainstorm` or `define <slug>` subroute, the delegated Spec Lead owns all definition artifacts, `status:`, exact `spec_path:`, managed definition regions, and definition log events exactly as the existing lifecycle contract requires; Ship writes none of them.

If several otherwise-valid candidates remain, ask exactly one pre-mutation disambiguation question that lists their exact identities. Do not rank them, infer or persist a default, or mutate anything. Restart the complete resolution from the answer; if it is still ambiguous, ask no second question in that pass and stop. A resolver or canonical-ownership diagnostic that target selection cannot repair is a hard refusal, not disambiguation.

After successful lifecycle resolution, hand the exact resolved target to existing Work semantics with normalized policy `{overall:'unlimited', recovery:'unlimited', recover:true, untilBlocked:false, mode:'autonomous'}`. This is semantically equivalent to `work [feature] --max unlimited --recover-on-block --recovery-cycles unlimited --policy autonomous`; explicitly omit `--until blocked` because Work forbids combining until-blocked mode with recovery. Work retains its one-time lane detection, imported-tracked precedence, execution loop, natural and hard stops, verification, review, ownership, reconciliation, close, audit, reporting, and learning governance.

Reuse every existing brainstorm and definition clarification and guardrail-ratification checkpoint. Ship never supplies an answer, creates an assumption, grants a bypass, or changes Spec Lead, coordinator, specialist, or reviewer authority. It creates no workflow, lane, board, state, ledger, configuration, profile, alias, parser, runtime, scheduler, report, persistent default, or automatic Git or release action; existing commands and defaults remain unchanged. Ship adds no alternate Work implementation and never reproduces or reinterprets Work's parser, runtime, lane detection, recovery, scheduling, or execution loop.
