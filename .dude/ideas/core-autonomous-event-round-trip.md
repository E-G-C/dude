---
title: Core Autonomous Event Round Trip
slug: core-autonomous-event-round-trip
status: draft
spec_path:
---

# Idea: Core Autonomous Event Round Trip

## Idea

Fix the core autonomous-mode defect where the runtime writes a lane-history event type that its own reader rejects, which permanently disables `--policy autonomous` on any affected feature. This came out of a live dogfooding session on 2026-07-28.

The outcome wanted is that `--policy autonomous` keeps working on a feature after the runtime has written its own audit records into that feature's lane history. Today it does not: an event the runtime itself emits is the thing that turns autonomous mode off, permanently, on that feature.

What matters is the write/read round trip being correct — that whatever the writer can put into an append-only lane history, the reader can read back. How that is achieved is not decided here.

## Open Questions

1. Is the right scope fixing this one event type, or the whole forward-compatibility class (any future writer-emitted type the reader does not yet know)?
   Answer:
2. Must already-affected features become autonomous-capable again, or is it enough to prevent new occurrences? Lane history is append-only and cannot be rewritten, so this decides whether recovery of existing history is in scope at all.
   Answer:
3. When the reader does recognize an audit-only record, should it validate that record strictly, or merely skip it?
   Answer:
4. What objective property of a record makes it safe to skip when the reader does not recognize it, versus one that must still fail closed? The hard stop exists to prevent exactly the blindness that unconditional skipping would introduce.
   Answer:
5. Must the round-trip invariant be enforced as a check that actually fails, or is fixing the vocabulary enough on its own?
   Answer:

## Assumptions

No additional assumptions have been provided.

<!-- dude:managed:start -->
## Normalized Intent

- The wanted outcome is a correct write/read round trip for lane-history event records in core: an event type the runtime can emit must be readable by the same runtime, so autonomous authorization is never disabled by the runtime's own audit output.
- The observed defect is a writer/reader vocabulary asymmetry, not a policy or workflow design gap.
- Acceptance intent is behavioral: on a feature whose lane history contains a runtime-written incident record, an autonomous authorization that is otherwise valid returns authorized rather than `evidence-incomplete`, and no audit evidence is deleted to achieve that.
- Fail-closed behavior for records that could affect authorization must not be weakened as a side effect of fixing the round trip.
- This idea owns the code-level correctness fix only. It does not own diagnosability or continuity policy; see Scope Boundary.

## Verified Evidence

All of the following was independently confirmed in the 2026-07-28 session.

- Invocation `@dude work --max unlimited --recover-on-block --recovery-cycles unlimited --policy autonomous` on feature `007-technical-docs-pack-remediation` hard-stopped *before* claiming any task. Reason `evidence-incomplete`, blocker subject `occurrence-retention`. `classifyOutcomeReason('evidence-incomplete')` returns `hard-stop` and `mayContinueAutonomously` returns false. No state was mutated.
- Root cause is a writer/reader asymmetry inside `src/skills/dude-work/recovery.mjs` (mirrored to `.github/`). The runtime writes a lane-history line of the form `- dude-run-event: {…,"type":"incident-supersession",…}` into a feature's `## Lightweight Execution History`, and `validateEventCommitmentV1` (~L3830) accepts that kind, but the reader constant `V2_EVENT_TYPES` (~L3198) lists only `approach-occurrence`, `finding-occurrence`, `learning-review`, and `learning-governance`. So `isV2AuthoritativeEventRecord` returns false, `t002EventCandidate` returns null, and `parseV2EventLines` throws `contains an unknown prefixed event record`. It surfaces through `dualRetainedOccurrenceEventsV2`.
- `validateT002AuthoritativeEvent` likewise dispatches only those same four types, so extending `V2_EVENT_TYPES` alone would not be sufficient.
- Causation was proven on a temp copy: with the event line present, identical autonomous authorization returns `evidence-incomplete`; with the line removed, it returns `authorized`.
- Guarded policy is completely unaffected. Five tasks were executed and closed under guarded in the same session.
- Severity: lane history is append-only audit evidence. Once an `incident-supersession` event exists on a feature, autonomous mode is permanently unusable there, because the only way to satisfy the reader is to delete audit evidence. The event is emitted by the incident-correction path, so the machinery that records a governance incident is what disables the governance mode. Feature 009's own T009 materialization wrote the one sitting on feature 007.
- `validateOccurrenceSurfaceV2` already ignores every type that is not `approach-occurrence` or `finding-occurrence`, so repeat detection does not depend on incident records.
- `parseV2EventLines` already has an audit-only skip precedent: wrapped v1 `CJ({event})` lines are skipped rather than rejected.

## Candidate Approaches

Recorded as candidate inputs only. None is selected, and brainstorm chooses no syntax, constant name, schema field, or enforcement mechanic.

1. Backfill the reader vocabulary for this type — add it to `V2_EVENT_TYPES` *and* dispatch it in `validateT002AuthoritativeEvent` to the existing `validateIncidentSupersessionEventV1`. Small and fully validating. Fixes the instance, not the class.
2. Tolerant reader that skips unknown types. Fixes the class, but naively unsafe: silently ignoring an unknown *governance* record written by a newer writer is the exact blindness the hard stop exists to prevent.
3. Criticality marker on the event envelope (audit versus governing), so unknown-and-audit may be skipped while unknown-and-governing or unmarked fails closed. Forward-compatible and safe, but existing records predate any marker, so it would ship together with option 1 as legacy backfill.
4. Split the log streams so the occurrence/retention parser only sees records it must understand. Cleanest separation, highest migration cost on an append-only log.
5. Filter-before-validate in the retention path only. Tiny, but it is the same unsafe skip as option 2 applied to the most safety-critical read path.

Candidate acceptance requirement, also not chosen: a round-trip invariant test asserting that every event type the writer can emit is accepted by the reader. Worth noting that none of the options above prevents recurrence without something like it.

## Scope Boundary

- `.dude/ideas/unattended-work-continuity.md` (still `status: draft`) already carries two requirements derived from the same 2026-07-28 run: the diagnosability requirement (a named halt must also identify what specifically stopped it) and the continuity requirement (an append-only record the system writes must never permanently disable the policy that wrote it). Those requirements belong to that idea and are deliberately not restated as this idea's own.
- This idea owns the code-level round-trip correctness fix in `src/skills/dude-work/recovery.mjs` and its generated projection. It owns no policy, halt-naming, or unattended-loop behavior.
- Stated plainly so the two do not collide at definition time: if both are defined, the round-trip fix is defined from this ledger, and diagnosability plus continuity are defined from `unattended-work-continuity`. Neither ledger should absorb the other's requirements.

## Facts Relevant At Definition Time

Recorded for the definer, not acted on here.

- This changes `src/**`, so the repository's project-local `Core Dogfood Close` convention applies. Definition must stage exactly one open, non-`[P]`, `[Shared]` terminal task carrying a complete `declared-src:` clause, and the generated `.github/` projection must be rebuilt via `node scripts/build-dev.mjs`. This is a known constraint, not a plan.
- Feature 009 (`autonomous-learning-governance`) shipped the affected runtime. Observed on 2026-07-28 by reading `.dude/specs/009-autonomous-learning-governance/tasks.md` directly: all nine canonical units, `T001@7365616c` through `T009@696e6369`, carry `[x]`, and the generated board lists all nine under Done with Ready Now, In Progress, and Blocked empty. Only task glyphs in that one file were observed; package closure itself was not verified. This is a point-in-time observation — re-check it at definition time rather than trusting it as current.
- A durable memory entry in `.dude/memory/context.md` already records this defect as a known live core defect. Do not duplicate it.

## Constraints

- Brainstorm intake only; no spec package, no implementation.
- Do not select syntax, constant names, schema field names, or enforcement mechanics during brainstorm.
- Do not weaken fail-closed behavior for records that could affect authorization.
- Do not propose deleting or rewriting existing lane-history audit evidence.
- Keep scope proportionate; assume no new lane, command, or ledger.

## Definition Checklist

- [x] Outcome is clear enough for brainstorm
- [x] Scope is coherent as one idea ledger
- [ ] Open questions are resolved or consciously assumed

## Coordinator Log

- 2026-07-28 UTC - brainstorm captured
<!-- dude:managed:end -->
