---
title: Core Autonomous Event Round Trip
slug: core-autonomous-event-round-trip
status: defined
spec_path: .dude/specs/010-core-autonomous-event-round-trip/spec.md
---

# Idea: Core Autonomous Event Round Trip

## Idea

Fix the core autonomous-mode defect where the runtime writes a lane-history event type that its own reader rejects, which permanently disables `--policy autonomous` on any affected feature. This came out of a live dogfooding session on 2026-07-28.

The outcome wanted is that `--policy autonomous` keeps working on a feature after the runtime has written its own audit records into that feature's lane history. Today it does not: an event the runtime itself emits is the thing that turns autonomous mode off, permanently, on that feature.

What matters is the write/read round trip being correct — that whatever the writer can put into an append-only lane history, the reader can read back. How that is achieved is not decided here.

## Open Questions

1. Is the right scope fixing this one event type, or the whole forward-compatibility class (any future writer-emitted type the reader does not yet know)?
   Answer: whole forward-compatibility class
2. Must already-affected features become autonomous-capable again, or is it enough to prevent new occurrences? Lane history is append-only and cannot be rewritten, so this decides whether recovery of existing history is in scope at all.
   Answer: Least effort, just prevent new occurrences
3. When the reader does recognize an audit-only record, should it validate that record strictly, or merely skip it?
   Answer (delegated; coordinator recommendation accepted by the user): Validate strictly. A recognized record is validated with its existing validator (`validateIncidentSupersessionEventV1` already exists, so the cost is negligible) and is then ignored for retention purposes. "Audit-only" means not used for retention decisions, not unchecked. Rationale: this catches a corrupted audit record instead of silently trusting it.
4. What objective property of a record makes it safe to skip when the reader does not recognize it, versus one that must still fail closed? The hard stop exists to prevent exactly the blindness that unconditional skipping would introduce.
   Answer (delegated; coordinator recommendation accepted by the user): Nothing. Unknown types keep failing closed. Do not weaken fail-closed behavior, because tolerating unknowns is what could reintroduce the blindness the hard stop exists to prevent. Address the forward-compatibility class from the writer side instead: a single shared vocabulary consumed by both the writer and the reader paths, declaring for each type whether it is retention-relevant or audit-only. "Safe to skip" therefore means known AND declared audit-only. The class is fixed by making it impossible for this runtime's own writer to emit a type its reader does not know, not by relaxing the reader.
5. Must the round-trip invariant be enforced as a check that actually fails, or is fixing the vocabulary enough on its own?
   Answer (delegated; coordinator recommendation accepted by the user): Yes, enforce it as a check that actually fails. Enumerate every writer-emittable event type and assert the reader accepts each one. Without it the vocabulary re-diverges the next time a type is added, which is precisely the class Q1 selected.

## Assumptions

No additional assumptions have been provided.

<!-- dude:managed:start -->
## Normalized Intent

- The wanted outcome is a correct write/read round trip for lane-history event records in core: an event type the runtime can emit must be readable by the same runtime, so autonomous authorization is never disabled by the runtime's own audit output.
- The observed defect is a writer/reader vocabulary asymmetry, not a policy or workflow design gap.
- Acceptance intent is behavioral: on a feature whose lane history contains a runtime-written incident record, an autonomous authorization that is otherwise valid returns authorized rather than `evidence-incomplete`, and no audit evidence is deleted to achieve that.
- Fail-closed behavior for records that could affect authorization must not be weakened as a side effect of fixing the round trip.
- This idea owns the code-level correctness fix only. It does not own diagnosability or continuity policy; see Scope Boundary.

Direction selected by the now-answered open questions, stated as intended outcomes rather than mechanics:

- The fix targets the whole forward-compatibility class, not only the one observed event type.
- Existing lane-history records are never rewritten, migrated, or deleted to obtain the outcome.
- Fail-closed behavior for records the reader does not recognize is preserved, and a record that is skipped for retention is still checked rather than trusted.
- Recurrence is prevented by an enforced round-trip check that actually fails, not by convention or reviewer diligence.

## Expected Side Effect On Existing Features

Q2 chose to prevent new occurrences, which rules out migrating or rewriting existing lane history. The selected direction still restores already-affected features as a side effect, because the correction is in the reader rather than in the data. Once `incident-supersession` is a known audit-only type, the record already present on feature 007 parses and is ignored for retention without being modified.

Record this as an expected observable outcome rather than an added requirement: the user intends to validate the fix by resuming feature 007, so acceptance should expect that resumption to succeed even though no history was changed.

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

Recorded as candidate inputs. The answered questions now select a direction at candidate level only; brainstorm still chooses no syntax, constant name, schema field, file, or enforcement mechanic.

1. Backfill the reader vocabulary for this type — add it to `V2_EVENT_TYPES` *and* dispatch it in `validateT002AuthoritativeEvent` to the existing `validateIncidentSupersessionEventV1`. Small and fully validating. Fixes the instance, not the class.
2. Tolerant reader that skips unknown types. Fixes the class, but naively unsafe: silently ignoring an unknown *governance* record written by a newer writer is the exact blindness the hard stop exists to prevent.
3. Criticality marker on the event envelope (audit versus governing), so unknown-and-audit may be skipped while unknown-and-governing or unmarked fails closed. Forward-compatible and safe, but existing records predate any marker, so it would ship together with option 1 as legacy backfill.
4. Split the log streams so the occurrence/retention parser only sees records it must understand. Cleanest separation, highest migration cost on an append-only log.
5. Filter-before-validate in the retention path only. Tiny, but it is the same unsafe skip as option 2 applied to the most safety-critical read path.

Which directions the answers select, and which they exclude:

- In: option 1, so the type the writer already emits is known to the reader, combined with the shared writer/reader vocabulary described in the Q4 answer.
- In: the round-trip invariant below, which Q5 turns from an unchosen note into a required acceptance element.
- Out: option 2 and option 5. Both skip records the reader does not recognize, and Q4 keeps unknown records failing closed.
- Not required: option 3's envelope marker and option 4's stream split. The selected direction does not depend on either, and definition may still consider them on their own merits.

Candidate acceptance requirement, now selected by the Q5 answer: a round-trip invariant test asserting that every event type the writer can emit is accepted by the reader. None of the options above prevents recurrence without it.

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
- [x] Open questions are resolved or consciously assumed

## Coordinator Log

- 2026-07-28 UTC - brainstorm captured
- 2026-07-28 UTC - brainstorm refreshed; all five open questions are now answered. Q1 and Q2 were user-answered; Q3, Q4, and Q5 were delegated and recorded as coordinator recommendations the user accepted. Managed regions re-normalized to match; status remains draft and no package was created.
- 2026-07-28 UTC - defined -> .dude/specs/010-core-autonomous-event-round-trip/spec.md
- 2026-07-28T12:19:41Z - core-dogfood-baseline v1 terminal=T004@636c6f73 head=c7e36d786c2d752010c9a62af9ef913b3096f1dc src_tree=c8d0563e5f90a262de7b50e1d125d33718764f32
- 2026-07-28T13:12:25Z - T001@766f6361 closed: introduced the shared `LANE_EVENT_TYPES` declaration carrying per-type retention relevance and validator, derived reader recognition, dispatch, and the retention filter from it, and declared `incident-supersession` audit-only reusing the existing validator. Coordinator-run fresh verification passed 311/311 recovery and 36/36 board with 0 skipped, git diff --check clean, dude-lint 0/0, and independent Code Reviewer returned APPROVE after tracing the full causal chain, proving filter set-equivalence, and showing the legacy learning-review carve-out relocation is behavior-preserving. Tester proved non-vacuity with four scratch mutations and confirmed feature 007 is autonomous-capable now and was not pre-fix, with `.dude/` byte-identical
- 2026-07-28T13:12:25Z - Lightweight board rendered after T001@766f6361 close; T002@77726974 is ready. Reviewer raised two forward findings for coordinator routing: `validateEventCommitmentV1` still carries an independent writer-side event-type enum, which leaves FR-002 half-satisfied and makes T003's invariant same-source unless one task derives it from the shared declaration; and T002's task statement names duplicated event-type literals in `board.mjs`, but board's actual duplication is the lane kind/reason vocabulary, not event types
- 2026-07-28T14:38:45Z - execution reconciliation after re-definition: T001@766f6361 kept exactly with verified `[x]`; T002@77726974 changed one-to-one to derive the real `validateEventCommitmentV1` writer boundary from the shared declaration; T003@74726970 changed one-to-one to compare independently exercised writer validation against reader parse-and-validate behavior using the exact Feature 007 target for incident evidence; T004@636c6f73 changed one-to-one to narrow `declared-src:` to `src/skills/dude-work/recovery.mjs` and `src/skills/dude-work/recovery.test.mjs`; no task dropped or added, no archive/discovered/history content changed, and coordinator-run dude-lint reported 0 warnings and 0 failures
- 2026-07-28T14:38:45Z - Lightweight board rendered after Feature 010 re-definition; T002@77726974 is the only ready task
- 2026-07-28T15:07:47Z - T002@77726974 closed: `validateEventCommitmentV1` now derives its writer-emittable event-type set from `Object.keys(LANE_EVENT_TYPES)` instead of an independent literal; coordinator-run fresh verification passed 313/313 recovery and 36/36 board with 0 skipped, git diff --check clean, dude-lint 0/0, and independent Code Reviewer returned APPROVE with no blocking findings
- 2026-07-28T16:02:24Z - T003@74726970 closed after one bounded test-proof revision: the final invariant discovers the complete writer set from the real `validateEventCommitmentV1` enum diagnostic, requires an explicit valid fixture for every discovered kind, proves strict reader validation with corrupt companions through real lane-history authorization, compares writer/reader/declaration sets, preserves undeclared fail-closed behavior, and validates exact relevance; coordinator-run fresh verification passed 315/315 recovery and 36/36 board with 0 skipped, git diff --check clean, dude-lint 0/0, and independent Code Reviewer returned APPROVE with no findings after confirming all five divergence mutations are killed
- 2026-07-28T16:02:24Z - Lightweight board rendered after T003@74726970 close; terminal T004@636c6f73 is ready for core dogfood promotion
- 2026-07-28 UTC - re-defined with the writer boundary retargeted to `validateEventCommitmentV1` in `src/skills/dude-work/recovery.mjs` and the round-trip invariant sharpened to compare independently exercised writer and reader surfaces using the Feature 007-bound incident fixture; staged reconciliation: kept T001@766f6361; changed T002@77726974, T003@74726970, and T004@636c6f73; dropped none; new none
- 2026-07-28T17:42:01Z - T004@636c6f73 core dogfood promotion materialized exactly once after clean ten-layer preflight, exact baseline equality, exact two-file declaration/delta equality, source verification 315/315 and board verification 36/36, one isolated expected pre-materialization parity failure, independent Tester PASS and Code Reviewer APPROVE, and an unchanged immediate packet recheck. `node scripts/build-dev.mjs` synced 52 core files and removed 25 stale outputs; the resulting Git delta is exactly `src/skills/dude-work/recovery.mjs`, `src/skills/dude-work/recovery.test.mjs`, and generated `.github/skills/dude-work/recovery.mjs`; post-materialization parity is 1/1 green, protected boundaries reverified byte-identical at 91 files with digest `7ee3968f342554a3c298d2a6f150d2cf462e479c5a71da610f3fd55d52227866`, Dude lint 0/0, compose 0 failures, pristine release built 55 files and release lint had 0 failures, and git diff --check was clean
- 2026-07-28T17:42:01Z - Feature 007 dogfood validation succeeded through the promoted `.github/skills/dude-work/recovery.mjs`: autonomous resume authorization for T006@0073b54a returned `authorized` with no blocker and `.dude/specs/007-technical-docs-pack-remediation/tasks.md` remained byte-identical at SHA-256 `5bc03542c1fd2394e5f5282351adff794d490394b616bc2e091fc00b234d4d15`
- 2026-07-28T17:42:01Z - T004@636c6f73 remains blocked as test-failure because the recursively discovered full suite reported 1858 tests, 1848 pass, 6 fail, 4 skipped. All six failures are Feature 008 T007 one-time first-adopter tests in `scripts/current-format-contract.test.mjs`; independent Tester root-cause analysis proved clean c7e36d7 reproduces 0/6, a controlled 21f9dc5 pre-materialization reconstruction passes 6/6, and overlaying Feature 010 source/generated files does not change the failure names or codes. The tests incorrectly bind their historical pre-materialization event to current HEAD and green parity; no close-policy waiver permits expected failures, so terminal close and accepted evidence are withheld pending a separately defined Feature 008-owned fixture repair
- 2026-07-29T00:04:29Z - T004@636c6f73 unblocked and returned to in-progress: the 2026-07-28T17:42:01Z `test-failure` block is cleared. Feature 011 (`.dude/specs/011-historical-core-dogfood-fixture-repair/`) repaired the six Feature 008 T007 one-time first-adopter tests in `scripts/current-format-contract.test.mjs` by reconstructing the historical pre-materialization event inside a transient synthetic fixture, preserving all six assertions and the strict future-feature gates with no expected-failure waiver. The recursively discovered full suite now reports 1859 tests, 1855 pass, 0 fail, 4 skipped at unchanged head=c7e36d786c2d752010c9a62af9ef913b3096f1dc and src_tree=c8d0563e5f90a262de7b50e1d125d33718764f32. The stale `blocked-by:` line was removed, the canonical glyph moved `[!]` to `[~]`, the Lightweight board was re-rendered, and `.dude/state/task-state.json` was reconciled to match. Disclosed for audit: the green full suite depends on Feature 011's `scripts/current-format-contract.test.mjs` repair, which lies outside the `src/**` `source` and `changed` evidence and is therefore not pinned by the accepted-evidence line
- 2026-07-29T00:04:29Z - independent final review for T004@636c6f73 returned REJECT with three blocking findings, all lane-state and audit-trail integrity and none in the source change: (1) `.dude/state/task-state.json` still recorded `T004@636c6f73` as `!` while canonical `tasks.md` already carried `[~]`; (2) the newest owner-log Feature 010 event still asserted the terminal was blocked with accepted evidence withheld, leaving the unblock unrecorded; (3) terminal authority must already agree when the fresh review runs rather than be reconciled afterward. The same review confirmed spec and plan satisfaction, genuine T001/T002/T003 implementation, a non-tautological failing-capable T003 invariant, the exact two-file source delta, a faithful generated projection, preserved fail-closed posture, and single unambiguous ownership, and it performed no revision. Findings 1 and 2 are remediated by the preceding event; finding 3 is satisfied by obtaining a new independent review after reconciliation
- 2026-07-29T00:17:50Z - core-dogfood-accepted v1 terminal=T004@636c6f73 head=c7e36d786c2d752010c9a62af9ef913b3096f1dc declared=a99dc67360dd1abb58c89722f7aea86b738007d4316acc3d5a2b9874543b555e source=31f659bf6a8cef4346d95aa87638e144dbc6260efea191d1a8b52de29ef0a14a changed=17d00415836f88c95986e123659b5e6a8e32f8a6cb2035127e6312b34dc5562c review=d195ac1672b6c2f9e65833aa917abba14352f2f68c772501fbf4af9ba3db6444
- 2026-07-29T00:18:58Z - T004@636c6f73 closed: the core dogfood close is complete. The accepted evidence line was appended at 2026-07-29T00:17:50Z and every bound identity was re-derived unchanged immediately afterward, with head=c7e36d786c2d752010c9a62af9ef913b3096f1dc, src_tree=c8d0563e5f90a262de7b50e1d125d33718764f32, `declared` equal to `changed` at exactly `src/skills/dude-work/recovery.mjs` and `src/skills/dude-work/recovery.test.mjs`, 78 `source` rows, generated delta exactly `.github/skills/dude-work/recovery.mjs`, parity 1/1, and the review envelope digest re-derived identical. Coordinator-run fresh verification after lane-state reconciliation: full recursively discovered suite 1859 tests, 1855 pass, 0 fail, 4 skipped; Dude lint 0 warnings and 0 failures; compose verification 16 of 16 catalog packs with 0 failures; pristine external release build 55 files with release lint 0 failures; git diff --check clean
- 2026-07-29T00:18:58Z - Feature 010 review history for the terminal: the first final independent review returned REJECT on three lane-state and audit-trail findings and explicitly found no defect in the source change; the coordinator reconciled `.dude/state/task-state.json` to the canonical glyph and recorded the unblock, then a second independent review returned APPROVE after confirming the shared `LANE_EVENT_TYPES` declaration, the derived writer set, strict-then-exclude retention ordering, preserved undeclared fail-closed refusal, a non-tautological failing-capable T003 invariant, a faithful generated projection, and single unambiguous ownership
- 2026-07-29T00:18:58Z - Lightweight board rendered after T004@636c6f73 close; all four Feature 010 tasks are `[x]` and no task remains ready, in progress, or blocked. Feature 010 is complete and the autonomous lane-history round-trip fix is promoted into the base-owned generated core
<!-- dude:managed:end -->
