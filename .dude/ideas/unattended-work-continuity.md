---
title: Unattended Work Continuity
slug: unattended-work-continuity
status: defined
spec_path: .dude/specs/013-unattended-work-continuity/spec.md
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
7. Beyond naming a reason from the closed set, what must a halt identify about its specific cause so the owner of an unattended run can act on it without reading the runtime's internals?
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
- A named halt is not automatically an actionable halt. The 2026-07-28 run below did name a legitimate reason from the closed set and was still effectively undiagnosable: locating the cause took reading four internal functions and bisecting a temp copy. The wanted outcome extends question 5 rather than replacing it — a halt should name its reason *and* identify what specifically made it stop, so the owner of an unattended run can act without reading the runtime's internals. Naming remains necessary; on this evidence it is not sufficient.
- Unattended continuity must survive its own audit trail. An append-only record the system writes must never permanently disable the policy that wrote it. A run that records a governance incident and thereby loses the ability to run unattended on that feature has defeated the outcome this idea exists to produce.

## Dogfooding Evidence

### 2026-07-28 — autonomous run hard-stopped before claiming any task (feature 007)

Invocation: `@dude work --max unlimited --recover-on-block --recovery-cycles unlimited --policy autonomous` on feature `007-technical-docs-pack-remediation`.

Outcome: a hard stop *before* any task was claimed. Reason `evidence-incomplete`, blocker subject `occurrence-retention`. `classifyOutcomeReason('evidence-incomplete')` returns `hard-stop` and `mayContinueAutonomously` returns false. No task state, board, snapshot, or definition byte changed.

Root cause — a write/read round-trip defect in core `src/skills/dude-work/recovery.mjs` (mirrored to `.github/`): the runtime writes a lane-history line of the form `- dude-run-event: {...,"type":"incident-supersession",...}` into a feature's `## Lightweight Execution History`, and `validateEventCommitmentV1` accepts that kind, but the reader constant `V2_EVENT_TYPES` omits it. `isV2AuthoritativeEventRecord` therefore returns false, `t002EventCandidate` returns null, and `parseV2EventLines` throws `contains an unknown prefixed event record`. That surfaces through `dualRetainedOccurrenceEventsV2` as `evidence-incomplete`.

Causation proven on a temp copy: with the event line present, identical autonomous authorization returns `evidence-incomplete`; with the line removed, it returns `authorized`. Guarded policy is unaffected.

Severity worth carrying into definition: lane history is append-only audit evidence. Once an `incident-supersession` event is written to a feature, autonomous mode is permanently unusable on that feature, because the only way to satisfy the reader is to delete audit evidence — exactly what must not happen. The event is written by the incident-correction path, so the machinery that records a governance incident is what disables the governance mode. Feature 009's own `T009@696e6369` materialization wrote the one now sitting on feature 007.

What this evidence establishes for this idea:

- Diagnosability: the closed-set naming rule contemplated by question 5 held here, and the halt was still opaque without source-level investigation.
- Continuity: a record the system itself wrote permanently disabled the policy that wrote it.

## Relationship To Existing Work

- Feature 005 (`autonomous-work-modes`, complete) settled *which* recoverable checkpoints an autonomous policy may pass, and shipped the policy selector, the hard-stop taxonomy, and sequential continuation after a stop. The gap here is different: the coordinator halted without invoking any checkpoint at all. That reads as a discipline and observability gap in `dude-work`, not a change to 005's policy semantics.
- Feature 009 (`autonomous-learning-governance`) governs the opposite failure mode — work that repeats without progress — and deliberately *adds* stop conditions (`learning-required`, `learning-governance-conflict`, scoped halts, budget exhaustion, Controlled Unresolved End). Any "closed set of named stops" rule this idea produces would have to account for those additions, so the set is a moving target until 009 closes.
- Current assessment: a new, small feature rather than a refinement of 005 — sequenced after Feature 009 closes. Question 5 (named-reason echo) is largely a discipline rule and the cheaper half; question 2 (auto-authorized revisions past `two failed attempts`) lands directly on the runtime Feature 009 changed.
- Feature 009's package is `.dude/specs/009-autonomous-learning-governance/`. Observed on 2026-07-28 by reading `.dude/specs/009-autonomous-learning-governance/tasks.md` directly: all nine canonical tasks, `T001@7365616c` through `T009@696e6369`, carry `[x]`, and the generated board lists all nine under Done with Ready Now, In Progress, and Blocked empty. This supersedes the 2026-07-25 note here, which recorded 8 of 9 closed with `T009@696e6369` `[!]` blocked on a typed `external-dependency` awaiting Feature 008's core dogfood promotion. Only task states in that one file were observed; package closure itself was not verified. Its `spec.md` remains immutable through implementation. This is still a point-in-time observation, so re-check it at definition time rather than trusting it as current. It is a sequencing note only; this idea proposes no change to Feature 009's package.
- The external "struggle indicators / stuck-detection" pattern captured below is the complementary half to Feature 009 (`autonomous-learning-governance`), which governs work that repeats without progress: the same liveness/progress signal that decides continue-versus-stop is what would replace discretionary, human-style halts here — a design observation only, implying no change to Feature 009's package.
- For whoever defines this idea: 009 is related because both features govern the same continue-versus-stop decision from opposite directions. This idea targets halts that happen without a legitimate named reason; 009 targets work that continues without progress. Read 009's shipped stop conditions first, and treat its closed set of named stops as the baseline to extend rather than contradict. The two have to stay consistent: any rule requiring every halt to name a reason from a closed set must accommodate the stop conditions 009 adds.
- Scope boundary drawn by the coordinator on 2026-07-28: the writer/reader vocabulary mismatch recorded under Dogfooding Evidence is a `src/**` correctness bug in Feature 009's shipped runtime, and it is blocking autonomous mode now. This idea is sequenced after Feature 009 closes and still has unanswered open questions. The coordinator's assessment is that the vocabulary and round-trip *fix* should be separable from this idea and may warrant its own small feature. This idea carries the diagnosability and continuity requirements and keeps the 2026-07-28 run as evidence; it does not own the code fix, and nothing here schedules or specifies it.
- Candidate requirement the coordinator flagged as valuable regardless of where that fix lands: a round-trip invariant asserting that every event type the writer can emit is accepted by the reader. Recorded as a candidate outcome only — brainstorm selects no mechanic, test shape, or enforcement point.

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

## Definition Disposition

Recorded by @dude-spec-lead at first definition (`define unattended-work-continuity` → `.dude/specs/013-unattended-work-continuity/spec.md`). The `## Open Questions` answers stay user-controlled and unchanged; the following are conscious definition-time assumptions carried into the spec's `## Assumptions` and `## Clarifications` equivalents, inventing no scope beyond the normalized intent, constraints, and relationship notes.

- Q1, Q6 — Assumed: reclassify no stop; this is a discipline and observability tightening of `dude-work`, not a change to Feature 005 policy semantics. A new, small feature sequenced after Feature 009 (observed 2026-07-28 with all nine canonical tasks closed; point-in-time, package closure not independently verified).
- Q2 — Deferred (out of scope): auto-authorizing bounded revisions past `two failed attempts` would relax an existing Feature 005 / Feature 009 hard stop and lands on the runtime Feature 009 changed; the idea itself raised it as unsettled. Not decided here.
- Q3 — Assumed yes: reporting is decoupled from stopping; a progress report is never a stop.
- Q4 — Assumed: safety floor is exactly the existing invocation-wide categories (destructive operations, spending, credentials, external authorization, ownership ambiguity) plus mandatory verification and independent review; none weakened.
- Q5 — Assumed yes: every halt echoes a named reason from the existing closed stop set, making an unnameable halt structurally impossible.
- Q7 — Assumed: beyond naming a reason, a halt must identify the affected target, the specific subject or condition that caused it, and the next owner action, sufficient to act without reading the runtime's internals.
- Continuity / round-trip invariant — Handed off, not re-owned: the audit-trail continuity outcome and the round-trip invariant (every writer-emittable event type is reader-acceptable) are already owned by defined Feature 010 (`.dude/specs/010-core-autonomous-event-round-trip/spec.md`, User Stories 1 and 3). Feature 013 adds no overlapping guard.

## Definition Checklist

- [x] Outcome is clear enough for brainstorm
- [x] Scope is coherent as one idea ledger
- [x] Open questions are resolved or consciously assumed

## Coordinator Log

- 2026-07-25 UTC - brainstorm captured
- 2026-07-25 UTC - brainstorm refreshed with external research: snarktank/ralph and Th0rgal/open-ralph-wiggum (Ralph loop technique); added External Precedents.
- 2026-07-25 UTC - recorded external source repository URLs in External Precedents for future reference.
- 2026-07-25 UTC - refreshed the Feature 009 relationship note with its package path and current blocked status.
- 2026-07-28 UTC - brainstorm refreshed: added Dogfooding Evidence for the 2026-07-28 autonomous hard-stop on feature 007, derived diagnosability and audit-trail-continuity outcomes into Normalized Intent, recorded the coordinator's scope boundary excluding the underlying `src/**` fix plus the round-trip invariant candidate, re-observed Feature 009's tasks as all closed, and appended one unanswered open question.
- 2026-07-30 UTC - defined as Feature 013; spec_path `.dude/specs/013-unattended-work-continuity/spec.md`. Open questions resolved as conscious assumptions (see Definition Disposition): Q1/Q6 discipline-and-observability tightening reclassifying no stop; Q3 decoupled reporting; Q4 unchanged safety floor; Q5 mandatory named-reason echo; Q7 actionable halt detail; Q2 deferred as out of scope (would relax an existing hard stop). Continuity and the round-trip invariant handed to defined Feature 010 rather than re-owned. Staged spec/plan/tasks (five all-open canonical units); plan carries zero active ObjectiveRegistry regions.
- 2026-07-30 UTC - re-defined (unchanged-intent refresh): user-controlled `## Idea`, `## Open Questions` (answers still blank), and `## Assumptions` are byte-unchanged; `status: defined` and exact `spec_path:` preserved. Reconciliation re-verified against unchanged intent — all five canonical tasks kept one-to-one with durable keys preserved and states left `[ ]` (kept T001@6b656570; T002@6e616d65, T003@73616665, T004@646f6373, T005@72657677 kept with a non-semantic auditability refinement); zero dropped, zero new. Normalized `tasks.md` traceability breadcrumbs by adding explicit `(US… → FR…)` trace suffixes to T002–T005 to match T001, changing no scope, key, or state. spec.md and plan.md unchanged (plan still carries zero active ObjectiveRegistry regions). Feature 010's opposite-ownership prose is in its own package and untouched; Feature 013's handoff wording verified accurate against Feature 010 US1/US3 and left as-is. Generated board fence left for coordinator regeneration (dependency-gated T002–T005).
- 2026-07-30 UTC - coordinator regenerated the derived board fence in `.dude/specs/013-unattended-work-continuity/tasks.md` deterministically via `dude-lightweight-execution/board.mjs render`, refreshing the stale T001@6b656570 board entry to match its canonical unit. Verified against the renderer contract that dependency-gated open tasks (T002@6e616d65 through T005@72657677) correctly appear in no bucket: `Ready Now` lists only dependency-satisfied open tasks and `Blocked` is reserved for `[!]`. No task glyph, task metadata, or execution state changed; the lane remains Definition Only with all five tasks `[ ]`.
- 2026-08-05 UTC - `@dude ship unattended-work-continuity`: intake resolved the existing defined package (sole owner, zero resolver diagnostics) and handed it to Work with the autonomous Ship policy `{overall:unlimited, recovery:unlimited, recover:true, untilBlocked:false, mode:autonomous}`. Work detected lane = Lightweight Execution (no Beads import); baseline green (recovery.test.mjs 441 pass, dude-lint 0/0). Claimed T001@6b656570 `[~]` in-progress and rendered the derived board; dispatching the Coder to implement the Phase 1 continuity discipline.
- 2026-08-05 UTC - T001@6b656570 closed `[x]` (Lightweight). Coder implemented the loop-level `endsUnattendedLoop(outcome)` predicate in `recovery.mjs` (reuses the frozen `OUTCOME_REASON_CLASSES` closed stop set; autonomous keeps working on no-reason/progress/authorized/completed, halts on any closed-set stop, fail-closed on malformed input; `mayContinueAutonomously`/`classifyOutcomeReason` and default/`guarded` paths byte-unchanged), added six FR-001/FR-002/SC-006/SC-007/fail-closed tests to `recovery.test.mjs`, and documented the discipline in `SKILL.md` `## Stops` as the single detailed owner. Tester verified fresh: `node --test recovery.test.mjs` 447 pass / 0 fail. First Code Reviewer returned a REJECT whose blocking "tests missing" finding was adjudicated false (it misread the pre-existing Feature 005 `T005a–h` and Feature 009 `T005` sections); the real defect it surfaced — the new tests mislabeled `T005 A–F`, colliding with those sections — was accepted and fixed by the Tester (renamed to `Feature 013 T001 A–F`, titles-only, re-verified 447 pass / 0 fail). Independent Code Reviewer re-review: APPROVE. Coordinator applied the `[x]` glyph and regenerated the derived board. No new stop reason, lane, board, command, or store; definition artifacts and unrelated features preserved.
<!-- dude:managed:end -->
