---
title: Unattended Work Continuity
slug: unattended-work-continuity
status: draft
spec_path:
---

# Idea: Unattended Work Continuity

## Idea

The idea is to avoid these stops and avoid stopping to continue working on a loop. I already lost half a day as I left you unsupervised and you stopped for no reason.

While it was happening I kept asking the same thing: "Were you blocked? Why do you stop? Go for it" and "why did you stop? what do I need to do so you respect `--max unlimited`".

The concrete run was `@dude work autonomous-learning-governance --max unlimited --recover-on-block --recovery-cycles unlimited --policy autonomous`. `dude-work` already defines a closed list of nine named stop reasons. The coordinator halted three times: after closing T004, after closing T005, and after two failed review cycles on T005. Only the third halt named a reason from that list (`two failed attempts on T005@7065726d`). The first two named nothing — the coordinator wrote a progress summary and ended the turn, treating "this is worth reporting" as if it meant "this is a stop." Nothing forces a halt to name one of the nine reasons, so an unnameable halt looks exactly like a legitimate one in the transcript.

There is a second pattern I do not want to treat as settled. Across this session I was asked five separate times to authorize a bounded revision past a hard stop, and I authorized every one. If the answer is always yes, being asked each time is what costs me the day.

One precedent already in the bundle seems relevant: `flag` has to echo `Classified as: <type>` from a closed set. Stops have a closed set but no equivalent echo requirement.

I do not know yet whether this is a new capability or just a tightening of the existing `dude-work` stop discipline.

## Open Questions

1. Which of the nine named stops must stay absolute under any policy, and which should become continuable when a run is explicitly unattended?
   Answer:
2. Should the `two failed attempts` hard stop auto-authorize a bounded number of further revisions under an explicit unattended policy, given that every such request this session was authorized? If so, what bounds it — an attempt count, a budget, or a class of finding?
   Answer:
3. Should reporting be decoupled from stopping, so progress is surfaced inline while the loop keeps running?
   Answer:
4. What is the safety floor that must never be crossed without a human, whatever the policy? The existing invocation-wide categories are destructive operations, spending, credentials, external authorization, and ownership ambiguity.
   Answer:
5. Should every halt be required to echo a named reason, so an unnameable halt becomes structurally impossible rather than merely discouraged?
   Answer:
6. Is this a new capability, or a tightening of `dude-work` stop discipline inside what Feature 005 already settled?
   Answer:

## Assumptions

No additional assumptions have been provided.

<!-- dude:managed:start -->
## Normalized Intent

- The outcome wanted is an unattended run that keeps working, not one that idles on a halt with no legitimate basis.
- The observed defect is discretionary halting: two of three halts in the run named no reason from the closed nine-reason list, and the third (`two failed attempts on T005@7065726d`) was legitimate.
- Reporting progress and stopping work were conflated; the coordinator ended turns to summarize rather than because a stop condition applied.
- Because no rule forces a halt to name its reason, an illegitimate halt is indistinguishable from a legitimate one after the fact.
- The repeated hard-stop authorization pattern (five requests, five approvals) is raised as an open design question, not as a settled requirement.
- Whether this is a new capability or a tightening of existing `dude-work` stop discipline is deliberately left open.

## Relationship To Existing Work

- Feature 005 (`autonomous-work-modes`, complete) settled *which* recoverable checkpoints an autonomous policy may pass, and shipped the policy selector, the hard-stop taxonomy, and sequential continuation after a stop. The gap here is different: the coordinator halted without invoking any checkpoint at all. That reads as a discipline and observability gap in `dude-work`, not a change to 005's policy semantics.
- Feature 009 (`autonomous-learning-governance`) governs the opposite failure mode — work that repeats without progress — and deliberately *adds* stop conditions (`learning-required`, `learning-governance-conflict`, scoped halts, budget exhaustion, Controlled Unresolved End). Any "closed set of named stops" rule this idea produces would have to account for those additions, so the set is a moving target until 009 closes.
- Current assessment: a new, small feature rather than a refinement of 005 — sequenced after Feature 009 closes. Question 5 (named-reason echo) is largely a discipline rule and the cheaper half; question 2 (auto-authorized revisions past `two failed attempts`) lands directly on the runtime that 009's in-flight tasks are actively changing.
- Feature 009's package is `.dude/specs/009-autonomous-learning-governance/`. As of 2026-07-25 it is near-terminal but not closed: 8 of 9 tasks are closed, and the remaining `T009@696e6369` is `[!]` blocked on a typed `external-dependency`, waiting for Feature 008's core dogfood promotion to complete on main. Its `spec.md` is immutable through that implementation. That status is a point-in-time observation, so re-check it at definition time rather than trusting it as current. Everything above is a sequencing note only; this idea proposes no change to Feature 009's package.
- The external "struggle indicators / stuck-detection" pattern captured below is the complementary half to Feature 009 (`autonomous-learning-governance`), which governs work that repeats without progress: the same liveness/progress signal that decides continue-versus-stop is what would replace discretionary, human-style halts here — a design observation only, implying no change to Feature 009's package.
- For whoever defines this idea: 009 is related because both features govern the same continue-versus-stop decision from opposite directions. This idea targets halts that happen without a legitimate named reason; 009 targets work that continues without progress. Read 009's shipped stop conditions first, and treat its closed set of named stops as the baseline to extend rather than contradict. The two have to stay consistent: any rule requiring every halt to name a reason from a closed set must accommodate the stop conditions 009 adds.

## External Precedents

Sources: `snarktank/ralph` (https://github.com/snarktank/ralph), `Th0rgal/open-ralph-wiggum` (https://github.com/Th0rgal/open-ralph-wiggum).

These patterns come from researching two implementations of Geoffrey Huntley's "Ralph" agent-loop technique: `snarktank/ralph` (a bash loop that re-spawns a fresh AI CLI each iteration from the same prompt, so cross-iteration memory lives only in git history plus `progress.txt` and `prd.json`) and `Th0rgal/open-ralph-wiggum` (a CLI wrapping several agent CLIs that adds live status, mid-loop hint injection, a tasks mode, and persisted attempt/history state). Each entry is a candidate design input for the open questions, not an answer to them.

- Inverted default (continue is the default, stopping is the exception). In both tools the loop keeps running by default and the only way to end early is an explicit, structurally-detected terminal signal (a promise tag emitted as the final line); ending a turn or writing a progress note never stops the loop. This bears on the core defect (turns ended to summarize were read as stops) and on Q5: an unnameable halt becomes structurally impossible, because a halt that emits no recognized signal simply is not a halt.
- Closed, named terminal vocabulary. `open-ralph-wiggum` exposes two distinct explicit signals: a completion signal and a separate early-abort signal for legitimate early exits (for example, a precondition failed). This mirrors the closed nine-reason stop set plus the existing `flag` / `Classified as:` echo precedent (Q1, Q5): a legitimate early stop must be one of a closed, named set and emitted explicitly.
- Reporting decoupled from stopping. `snarktank/ralph` appends learnings to `progress.txt` every iteration without stopping; `open-ralph-wiggum` surfaces a live status view from a second terminal and lets a human inject guidance mid-loop without halting. This is a direct precedent for Q3: surface progress inline while the loop keeps running.
- Stuck-detection instead of discretionary halting. `open-ralph-wiggum` shows "struggle indicators" (for example, no file changes across several iterations, or repeated errors) that warn a run is stuck without stopping it, plus a ledger fallback that can advance even when the agent forgets to emit the completion signal. This complements Q3/Q5 and connects to the repeats-without-progress problem covered under Relationship To Existing Work.
- Explicit unattended-policy toggles that change stop behavior. Minimum-iteration gates prevent premature completion (do not quit too early), a "do not pause to ask, keep looping" mode turns interactive questions into continued work, and persisted attempt counts bound retries. These are candidate inputs for Q2 (auto-authorizing a bounded number of revisions past a hard stop, bounded by an attempt count) and Q1 (which stops become continuable under an explicit unattended policy).
- Safety net plus durable continuity state. Both keep a runaway iteration cap and persist cross-iteration state in files, so continuity survives restarts. This supports the wanted outcome of an unattended run that keeps working, bounded.

Cautions (do not import): Ralph achieves unattended runs by auto-approving everything (blanket "allow all" / "skip permissions" / "full auto" / "yolo" / "no questions") and has no independent review step ("commit if checks pass"). That blanket permission bypass is exactly the boundary Q4's safety floor must not cross, and the missing review is what this idea's constraints forbid weakening. The transferable part is the discipline — default-continue, explicit named stop, reporting decoupled from stopping, structural stuck-detection — not the permissiveness.

## Constraints

- Brainstorm intake only; do not create a definition package or begin implementation.
- Do not modify Feature 009's package, task state, board, or log, and do not treat any note here as a change to it.
- Do not select syntax, flag spellings, policy names, state shapes, or enforcement mechanics during brainstorm.
- Do not weaken destructive, spending, credential, external-authorization, or ownership-ambiguity hard stops.
- Do not weaken fresh verification or independent review; a continued loop is not an approved loop.
- Keep the scope proportionate — no new lane, ledger, or command is assumed.

## Definition Checklist

- [x] Outcome is clear enough for brainstorm
- [x] Scope is coherent as one idea ledger
- [ ] Open questions are resolved or consciously assumed

## Coordinator Log

- 2026-07-25 UTC - brainstorm captured
- 2026-07-25 UTC - brainstorm refreshed with external research: snarktank/ralph and Th0rgal/open-ralph-wiggum (Ralph loop technique); added External Precedents.
- 2026-07-25 UTC - recorded external source repository URLs in External Precedents for future reference.
- 2026-07-25 UTC - refreshed the Feature 009 relationship note with its package path and current blocked status.
<!-- dude:managed:end -->
