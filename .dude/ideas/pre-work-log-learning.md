---
title: Pre-work Log Learning
slug: pre-work-log-learning
status: defined
spec_path: .dude/specs/004-pre-work-log-learning/spec.md
---

# Idea: Pre-work Log Learning

## Idea

Before starting or resuming work on a given task, analyze its prior work or execution log for lessons or discoveries that could facilitate progress.

The observed pattern is that repeated attempts on the same task become blocked, get logged, resume, and become blocked again. Across those attempts, the history may reveal something missing from the current spec, plan, or task; a flawed assumption; or a different approach worth taking.

I do not yet have a clear mechanism for this. Keep it open for discussion now, with the details to be defined later.

I want Dude to become capable of working on its own. Rather than always stopping at a blocker and asking me to invoke `define`, it should be able to pause internally, analyze task or feature history and findings, revise itself through the appropriate workflow, and continue.

I am now considering two distinct `work` behaviors: the current stop-at-block behavior (for example, `work --until blocked`) and a separate `--recover-on-block` behavior that attempts the learning and recovery loop above. The command flag is settled as `--recover-on-block`; whether recovery is opt-in or the default, and its exact semantics, are still open.

The default policy is now settled: ordinary `work` stops on block, and only explicit `--recover-on-block` authorizes bounded, guarded recovery.

I also want the feature to identify deterministic logic suitable for scripts, follow already implemented feature patterns, and minimize model-facing wording and token use without weakening behavior.

## Open Questions

1. Which history surfaces should count as input, such as the idea Coordinator Log, Lightweight Execution history, Beads history, review findings, verification results, or session history?
   Answer:Any log related to the task that is being worked on or the feature so anything related to the current item that is being worked on.
2. When should the analysis trigger: before every task start and resume, only after prior blockage or failed attempts, or on explicit request?
   Answer:All of them.
3. What should the analysis produce or cause, such as temporary working context, a concise durable summary, a recommendation to revise the spec/plan/task, or a pause before execution?
   Answer:I I think it would depend on the finding. If it's a durable learning should be kept as a durable summary or learning kept in the memory of of the dude. If it's just the simple realization that will allow us to move on, maybe a temporary context. So it will depend. You can scalate the durability of the item depending on the severity. For example, it may be an actual blocking for the general affecting the the general performance of the dude, then it's a durable long term. If it's just maybe a short realisation, just keep it in the short term. think on it and recommend the best approach.
4. Should stop-on-block remain the default, with bounded guarded recovery through `--recover-on-block` available only by explicit opt-in, or should another default policy be considered?  Stop on block should be the default, recovery on block should be explicitly.
5. Should the default recovery budget allow at most two recovery cycles for the same task during one `work` run, with no retry of the same unchanged approach, then escalate?
   Answer:Recovery cycles should be parameterized rather than fixed at two, accepting a finite count or an explicit `unlimited` option.
6. For an experimental "work until done" invocation, should the separate overall work budget also allow `unlimited` (for example, `--max unlimited`), or should Dude use a distinct completion-oriented option? Recommendation: keep the recovery and overall-work budgets separate; exact syntax remains unsettled.
   Answer: `--max unlimited` is the settled syntax for removing the overall work-iteration limit in an experimental work invocation.
7. Should `--recover-on-block` be allowed to autonomously refresh derived definition artifacts (`spec.md`, `plan.md`, and `tasks.md`) through the existing guarded definition and reconciliation transaction when user-owned intent remains unchanged, while escalating any intent change to the user? Recommendation: allow this only through the existing guarded transaction when user-owned intent is unchanged; any intent change must escalate to the user.
   Answer: Yes.
8. Should the candidate spelling `--recovery-cycles <N|unlimited>` be settled, with the budget counted per task per `work` run? Recommendation: yes.
   Answer: Yes.

## Assumptions

- Settled intent: all task- or feature-relevant logs are eligible input, and analysis may trigger before task start, before resume, after blockage or failed attempts, and on explicit request.
- Observation, not a settled requirement: repeated blocked and resumed attempts may expose a missing definition detail, a flawed assumption, or a more promising approach.
- Settled intent: retention depends on the finding, ranging from temporary working context through durable memory or skill promotion for broadly consequential learning.
- Settled intent: ordinary `work` stops on block by default; only explicit `--recover-on-block` authorizes bounded, guarded recovery. Recovery is an attempt, not a guarantee that every blocker can be overcome.
- Settled authority: `--recover-on-block` may autonomously refresh derived definition artifacts (`spec.md`, `plan.md`, and `tasks.md`) through the existing guarded definition and reconciliation transaction when user-owned intent remains unchanged; any intent change must escalate to the user.
- Settled intent: recovery cycles are configurable rather than fixed at two through `--recovery-cycles <N|unlimited>`, with a finite-count mode and an explicit `unlimited` mode.
- Settled scope: the recovery-cycle budget applies separately to each task during one `work` run.
- Settled semantics: a finite positive integer caps guarded recovery cycles, while `unlimited` removes only the numeric recovery-cycle cap and never bypasses hard escalation boundaries.
- Settled distinction and syntax: `--max <N|unlimited>` independently controls overall work iterations; `--max unlimited` removes only that numeric cap and does not alter the separate finite-or-unlimited recovery-cycle budget.
- Settled safeguards: neither `--max unlimited` nor unlimited recovery cycles bypasses hard stops for user-owned intent ambiguity, required approval or destructive confirmation, unavailable external input or dependency, ambiguous ownership or reconciliation, safety or authority gates, or repeated unchanged or no-progress recovery.

<!-- dude:managed:start -->
## Normalized Intent

- Explore a learning step that can use all logs relevant to the current task or feature before starts and resumes, after blockage or failed attempts, and on explicit request.
- Classify findings so their retention can range from temporary working context to durable memory or skill promotion, according to their significance and reuse value.
- Treat ordinary `work` as stop-on-block by default. Only explicit `--recover-on-block` authorizes a guarded recovery process that pauses, learns, routes needed revisions through the appropriate workflow, and continues when safeguards permit; recovery is not guaranteed.
- Allow `--recover-on-block` to autonomously refresh derived definition artifacts (`spec.md`, `plan.md`, and `tasks.md`) through the existing guarded definition and reconciliation transaction only when user-owned intent remains unchanged; escalate any intent change to the user.
- Make recovery cycles configurable through the settled `--recovery-cycles <N|unlimited>` option, accepting a finite positive count or an explicit `unlimited` mode; use it with the settled `--recover-on-block` flag.
- Count the recovery-cycle budget separately for each task during one `work` run. `unlimited` removes only the numeric recovery-cycle cap, not other safeguards.
- Keep recovery cycles separate from the `--max <N|unlimited>` overall work-iteration budget. `--max unlimited` is settled as removing only the numeric overall iteration cap and does not change the finite-or-unlimited recovery-cycle budget.
- Preserve the full experimental example `@dude work --max unlimited --recover-on-block --recovery-cycles unlimited`; `--recovery-cycles` is the settled recovery-budget option spelling.
- Recovery v1 permits at most one pending authorization per invocation. Accepted `--parallel <positive-integer>` values are compatibility-only and grant no concurrent recovery authority; the effective recovery policy remains sequential.

## Constraints

- This artifact is brainstorm intake only; do not create a definition package or begin implementation.
- Autonomous definition refresh must still use exact ownership resolution; staged, atomic definition and reconciliation; preservation of task history and state under existing rules; verification; lint; and independent review. It does not bypass coordinator-only execution-state mutation.
- Recovery cannot change user-owned intent without user input and does not authorize mutation of specs, plans, tasks, memory, or execution state outside their owning workflows.
- Neither `--max unlimited` nor unlimited recovery cycles bypasses hard stops for user-owned intent ambiguity, required approval or destructive confirmation, unavailable external input or dependency, ambiguous ownership or reconciliation, safety or authority gates, or repeated unchanged or no-progress recovery.
- Recovery v1 must normalize effective parallel capacity to one and must not persist or use a requested `--parallel` value as concurrent recovery authority.
- Exact recovery implementation remains for later definition; the overall work-iteration and recovery-cycle budgets remain independent.
- Use fixed binary resource ceilings: 6,291,456 encoded CLI-request bytes; 1,048,576 bytes per workspace file or individual captured byte body; 4,194,304 aggregate decoded evidence-body bytes per inspection; 64 total source entries and 64 total retained evidence descriptors per inspection, including all per-source array entries; and 8,192 UTF-8 bytes for deterministic error JSON. These limits are separate from the existing 16-item and 65,536-byte model-packet limits.
<!-- dude:managed:end -->

<!-- dude:managed:start -->
## Definition Checklist

- [x] Outcome is clear
- [x] Scope is bounded: autonomous recovery authority over derived definition artifacts is settled within the existing guarded transaction
- [x] Open questions are resolved or consciously assumed

## Coordinator Log

- 2026-07-18 UTC - brainstorm captured
- 2026-07-18 UTC - brainstorm refreshed with two-policy work and bounded self-recovery intent
- 2026-07-18 UTC - brainstorm refreshed with `--recover-on-block` settled; default policy and recovery boundaries remain open
- 2026-07-18 UTC - brainstorm refreshed with explicit-opt-in recovery and a focused recovery-budget question
- 2026-07-18 UTC - brainstorm refreshed with configurable finite-or-unlimited recovery cycles and a separate overall-work budget question
- 2026-07-18 UTC - brainstorm refreshed with `--max unlimited` settled and recovery authority left open
- 2026-07-18 UTC - brainstorm refreshed with guarded autonomous definition refresh settled and recovery-cycle spelling left open
- 2026-07-18 UTC - brainstorm refreshed with `--recovery-cycles` spelling and per-task-per-run scope settled
- 2026-07-18 UTC - defined -> .dude/specs/004-pre-work-log-learning/spec.md
- 2026-07-18 UTC - re-defined after independent review and user-approved simplification; definition now uses three implementation modules, six transient records, one bounded packet, and fail-closed tracked definition refusal
- 2026-07-18 UTC - execution reconciliation: dropped open T001@4c8a1f2e-T011@b6e2d8a0 and added open T001@8f31c2a7-T008@c9b461e7; no task state, board, discovered work, archive, or execution history transferred
- 2026-07-18 UTC - re-defined after independent review compatibility corrections for bounded parallel authorization, tracked issue-only identity, optional feature selection, and action-bound completion; preserved three modules, six records, one packet, and eight open tasks
- 2026-07-18 UTC - execution reconciliation after compatibility review: kept open T002@d4a90e6b, T005@3b94f0c6, T007@5f0a3c8d, and T008@c9b461e7; changed open T001@8f31c2a7, T003@6c1f8b42, T004@a7e25d19, and T006@e2d7185a in place; dropped 0, new 0, and transferred no execution state or history
- 2026-07-18 UTC - re-defined with user-approved canonical-target hashing; optional verified tracked task mapping no longer changes packet identity or no-progress hashes
- 2026-07-18 UTC - execution reconciliation after canonical-target hash correction: changed open T001@8f31c2a7 in place to add the omitted-versus-supplied tracked mapping regression; kept open T002@d4a90e6b-T008@c9b461e7, dropped 0, new 0, and transferred no execution state or history
- 2026-07-18 UTC - started T001@8f31c2a7: six-record runtime contract, invocation grammar, canonical hashes, and bounded single-packet behavior
- 2026-07-18 UTC - T001@8f31c2a7 blocked after repeated reviewer rejection: public six-record validators still need one descriptor-based dense-array check before any indexing, mapping, or iteration so holes, symbols, extra or non-enumerable properties, and accessors are rejected without invoking getters
- 2026-07-18 UTC - regenerated the derived board after blocking T001@8f31c2a7
- 2026-07-19 UTC - resumed T001@8f31c2a7 with user approval for the final shared dense-array validator revision
- 2026-07-19 UTC - completed T001@8f31c2a7: six-record runtime validators, invocation grammar, canonical hashes, bounded single-packet behavior, and strict caller-array validation; 16 focused tests passed, independent Tester passed, and Code Reviewer approved
- 2026-07-19 UTC - regenerated the derived board after completing T001@8f31c2a7
- 2026-07-19 UTC - started T002@d4a90e6b: concrete exact-owner, Lightweight, run, review, verification, lint, and optional session evidence acquisition
- 2026-07-19 UTC - T002@d4a90e6b blocked after reviewer rejection: remove synthetic tracked authority until T003, make issue-only and verified-key acquisition hash-identical, align CommonMark fence parsing, ignore discovered headings inside archived history, and keep malformed or unbound optional session evidence out of model packets
- 2026-07-19 UTC - regenerated the derived board after blocking T002@d4a90e6b
- 2026-07-19 UTC - resumed T002@d4a90e6b for a lean reviewer-finding revision with no new module or abstraction
- 2026-07-19 UTC - completed T002@d4a90e6b: exact owner, canonical task/history, Lightweight, run, review, verification, lint, and optional session acquisition; 32 focused and 38 neighboring tests passed, independent Tester passed, and Code Reviewer approved
- 2026-07-19 UTC - regenerated the derived board after completing T002@d4a90e6b
- 2026-07-19 UTC - started T003@6c1f8b42: strict captured Beads list, detail, and history normalization for recovery evidence
- 2026-07-19 UTC - T003@6c1f8b42 blocked after Tester and Code Reviewer rejection: replace the duplicate 469-line parser/canonicalizer with a minimal existing-parser projection, preserve supported history order, ground capture shapes in current Beads output, enforce exact task-key and list-detail consistency, and remove speculative field policing
- 2026-07-19 UTC - regenerated the derived board after blocking T003@6c1f8b42
- 2026-07-19 UTC - T003@6c1f8b42 lean rewrite reduced runtime by 289 lines and tests by 163 lines, grounded list/show/history in Beads 0.62.0 captures, preserved history order, and removed speculative parsing and field policing; 56 focused tests passed
- 2026-07-19 UTC - T003@6c1f8b42 remains blocked after repeated reviewer escalation: require exactly one exact-feature issue owner for a supplied task key and validate issue IDs as 1-256 UTF-8 bytes without controls; only two focused regressions are authorized pending user approval
- 2026-07-19 UTC - resumed T003@6c1f8b42 with user approval for only the unique task-key owner and bounded issue-ID checks
- 2026-07-19 UTC - completed T003@6c1f8b42: grounded Beads 0.62.0 list/show/history normalization, exact capture sets and mappings, history-order preservation, bounded issue IDs, and no-I/O projection; 58 focused tests passed, independent Tester passed, and Code Reviewer approved
- 2026-07-19 UTC - regenerated the derived board after completing T003@6c1f8b42
- 2026-07-19 UTC - started T004@a7e25d19: transient authorization and completion transitions, canonical-target counters, bounded independent fan-out, and no-progress stops
- 2026-07-19 UTC - T004@a7e25d19 blocked after reviewer rejection: reject bare dot and dot-dot material targets before overlap checks, and make RunState reject feature-only counters or pending entries, tracked definition pending actions, and locally impossible parallel coexistence using only local validation changes
- 2026-07-19 UTC - regenerated the derived board after blocking T004@a7e25d19
- 2026-07-19 UTC - resumed T004@a7e25d19 for two local validator fixes only, with no new state or scheduling abstraction
- 2026-07-19 UTC - completed T004@a7e25d19: pure authorization/completion transitions, canonical-target counters, bounded independent fan-out, no-progress stops, and impossible-state validation; 48 focused tests passed, independent Tester passed, and Code Reviewer approved
- 2026-07-19 UTC - regenerated the derived board after completing T004@a7e25d19
- 2026-07-19 UTC - started T005@3b94f0c6: expected-byte atomic file batch, rollback, new-path cleanup, validators, and tracked definition pre-write refusal
- 2026-07-19 UTC - stopped T005@3b94f0c6 on Coder tool error after a partial specialist write: the helper and one success test were left untracked; that test passed, but required failure, rollback, cleanup, and tracked-refusal coverage is absent, so T005 remains in progress
- 2026-07-19 UTC - regenerated the derived board after the T005@3b94f0c6 tool-error stop
- 2026-07-19 UTC - resumed T005@3b94f0c6 with a deletion-first helper revision and focused acceptance coverage; 45 atomic-batch and current-format tests passed, but independent review rejected silent ENOTEMPTY handling because a helper-created directory can remain without ATOMIC_FILE_BATCH_ROLLBACK_FAILED
- 2026-07-19 UTC - blocked T005@3b94f0c6 after reviewer rejection: any helper-created directory left after a caught failure must add a remove-directory rollback error and produce ATOMIC_FILE_BATCH_ROLLBACK_FAILED
- 2026-07-19 UTC - regenerated the derived board after blocking T005@3b94f0c6
- 2026-07-19 UTC - resumed T005@3b94f0c6 with user approval for a bounded reviewer-finding revision: add retained-directory rollback-failure coverage and evaluate broader race findings without adding transaction machinery
- 2026-07-19 UTC - completed T005@3b94f0c6: expected-byte atomic file batch, sibling staging, validator isolation, final destination and staged-byte rechecks, caught-failure restoration and cleanup, distinct incomplete rollback, and tracked pre-write refusal; 49 focused tests passed, Dude lint had zero findings, and independent Reviewer approved
- 2026-07-19 UTC - regenerated the derived board after completing T005@3b94f0c6
- 2026-07-19 UTC - started T006@e2d7185a: detailed dude-work recovery procedure with terse agent, instruction, lane, definition, Beads, and retention pointers
- 2026-07-19 UTC - regenerated the derived board after starting T006@e2d7185a
- 2026-07-19 UTC - T006@e2d7185a prompt integration passed 82 focused tests, Dude lint, and independent prompt review with a 1,027-byte always-loaded pointer proxy, but Tester found tracked Beads captures disconnected from recovery acquisition and contradictory explicit-define-only authority wording
- 2026-07-19 UTC - blocked T006@e2d7185a on verification failure: connect captured Beads normalization to tracked lane history and make the unchanged-intent recovery exception explicit without weakening ordinary brainstorm, define, or flag authority
- 2026-07-19 UTC - regenerated the derived board after blocking T006@e2d7185a
- 2026-07-19 UTC - resumed T006@e2d7185a for a bounded verification revision: inject the existing captured-Beads normalizer as one trusted synchronous capability using the schema's tracked capture envelope, and reconcile only the conflicting authority wording
- 2026-07-19 UTC - regenerated the derived board after resuming T006@e2d7185a
- 2026-07-19 UTC - T006@e2d7185a tracked acquisition connected the schema envelope to the existing Beads normalizer and passed 110 focused tests, but Code Reviewer rejected duplicate core capture parsing, divergent UTF-8 issue ordering, and the absence of sealed installed-host composition; two authority and host prompt contracts remain intentionally red
- 2026-07-19 UTC - blocked T006@e2d7185a after reviewer rejection: pass the tracked envelope directly to the Beads normalizer, align UTF-8 ordering, seal composition in the existing Beads host, and reconcile only the five conflicting authority lines plus the terse host pointer
- 2026-07-19 UTC - regenerated the derived board after blocking T006@e2d7185a
- 2026-07-19 UTC - resumed T006@e2d7185a for the deletion-first reviewer revision: remove duplicate core capture parsing, align UTF-8 ordering, bind the real normalizer in the existing Beads host, and change only the red-tested authority and host wording
- 2026-07-19 UTC - regenerated the derived board after resuming T006@e2d7185a
- 2026-07-19 UTC - completed T006@e2d7185a: exact pre-work inspection and explicit recovery procedure, sealed captured-Beads host composition, consistent Lightweight definition-repair authority, proportional retention routing, and terse consumer pointers; 147 focused tests passed, the authority proxy was 1,112 bytes, Dude lint and compose had zero failures, Tester passed, and Code Reviewer and Reviewer approved
- 2026-07-19 UTC - regenerated the derived board after completing T006@e2d7185a
- 2026-07-19 UTC - started T007@5f0a3c8d: prompt-budget enforcement, public command/workflow/reference documentation, durable decision supersession, and generated development projection
- 2026-07-19 UTC - regenerated the derived board after starting T007@5f0a3c8d
- 2026-07-19 UTC - T007@5f0a3c8d completed recovery prompt-budget enforcement, public docs, durable decision supersession, and byte-identical development/release projection checks; 52 current-format and build-dev tests pass, recovery release staging passes, and the generated recovery runtime is exact
- 2026-07-19 UTC - blocked T007@5f0a3c8d on verification failure: the required full release gate finds a pre-existing missing terminal newline in src/skills/dude-bundle-import/lib/directory-import.mjs and its exact generated copy; no T007-owned check fails
- 2026-07-19 UTC - regenerated the derived board after blocking T007@5f0a3c8d
- 2026-07-19 UTC - resumed T007@5f0a3c8d for the one-byte external release-gate repair: append a terminal LF to authoritative directory-import source, rerun its owning tests, and regenerate the exact core projection without changing behavior
- 2026-07-19 UTC - completed T007@5f0a3c8d: deterministic 1,112-byte recovery prompt budget, sole detailed Work prompt owner, current public docs, durable decision supersession, byte-identical development and release projection, and terminal-newline hygiene; 92 focused and 68 projection/release tests passed, Dude lint had zero findings, Tester passed, and Reviewer approved
- 2026-07-19 UTC - regenerated the derived board after completing T007@5f0a3c8d
- 2026-07-19 UTC - started T008@c9b461e7: full discovered-suite, lint, compose, pristine-release, generated-projection, and independent final acceptance verification
- 2026-07-19 UTC - regenerated the derived board after starting T008@c9b461e7
- 2026-07-19 UTC - T008@c9b461e7 verification passed 1,209 of 1,212 discovered tests with 0 failures and 3 skips, workspace lint with zero findings, compose with zero failures or leftovers, a lint-clean 54-file pristine release with no tests, exact generated runtime parity, and clean diff hygiene
- 2026-07-19 UTC - blocked T008@c9b461e7 after independent Tester and Code Reviewer rejection: add a shipped Work command/trigger host; derive parallel dispatch and mandatory definition completion checks from authoritative rules; normalize wrapper-insensitive evidence; inspect before tracked definition refusal; and prove atomic recovery plus retention routing end to end
- 2026-07-19 UTC - regenerated the derived board after blocking T008@c9b461e7
- 2026-07-19 UTC - resumed T008@c9b461e7 for a bounded trust-boundary revision inside the existing three modules: add the planned thin CLI, fail closed to sequential work without authoritative write sets, hardcode completion checks, normalize presentation wrappers, inspect before tracked refusal, and prove atomic and retention composition
- 2026-07-19 UTC - regenerated the derived board after resuming T008@c9b461e7
- 2026-07-19 UTC - T008@c9b461e7 trust-boundary revision added the thin CLI, sequential fail-closed authorization, hardcoded completion checks, inspection-first tracked refusal, atomic definition composition, and retention routing; 152 focused tests passed and real CLI inspection succeeded
- 2026-07-19 UTC - T008@c9b461e7 remains blocked after a second independent rejection: authorization is not bound to the model's evidenceHash, JSON CLI cannot carry required byte captures, generic wrapper stripping is unsafe, atomic mutation scope does not independently preserve user intent, retention trusts caller state, and sequential execution conflicts with the published parallel contract
- 2026-07-19 UTC - regenerated the derived board after escalating the repeated T008@c9b461e7 rejection
- 2026-07-20 UTC - re-defined after independent Reviewer rejection and user-approved sequential recovery v1; bound Assessment advice to fresh inspection evidence, specified canonical CLI byte and fixed source presentation envelopes, constrained runtime definition recovery with byte-preserved user intent, required owner-inspected retention, and preserved three modules, six records, one packet, and all eight task identities
- 2026-07-20 UTC - execution reconciliation after sequential-v1 re-definition: kept T001@8f31c2a7-T007@5f0a3c8d byte-for-byte with completed state, changed T008@c9b461e7 in place while preserving its blocked state, blocker, dependency, and verification commands, dropped 0, new 0, and preserved all execution history
- 2026-07-20 UTC - resumed T008@c9b461e7 under the approved sequential-v1 contract for evidence-bound authorization, canonical CLI bytes, fixed source envelopes, exact definition scope, owner-inspected retention, and final acceptance
- 2026-07-20 UTC - regenerated the derived board after resuming T008@c9b461e7
- 2026-07-20 UTC - stopped T008@c9b461e7 on Tester tool error after a partial red test write: recovery has 43 expected contract failures and Beads/atomic have 22, while all edited tests remain syntax- and diff-clean; T008 stays in progress for a clean resume
- 2026-07-20 UTC - resumed T008@c9b461e7 from the partial red suite; Tester completed 189 focused contracts with 74 expected failures mapped to the approved sequential-v1 requirements
- 2026-07-20 UTC - stopped T008@c9b461e7 on two Coder network errors after partial implementation: Beads passes 61/61, atomic definition recovery passes 50/50, and recovery passes 76/78; remaining failures are duplicate workspace acquisition during command authorization and one invalid source-envelope classification
- 2026-07-20 UTC - T008@c9b461e7 localized recovery fixes completed the sequential-v1 implementation slice; recovery, Beads, and atomic definition suites passed 189/189, canonical owner tests passed 13/13, and Dude lint reported zero findings
- 2026-07-20 UTC - blocked T008@c9b461e7 after Code Reviewer rejection: the single-read owner inventory duplicates canonical identity semantics with a numbered-only spec path check and falsely rejects valid unrelated owners such as .dude/specs/x/spec.md
- 2026-07-20 UTC - resumed T008@c9b461e7 for one canonical identity correction; recovery now reuses parseSpecIdentity for unrelated defined ledgers while retaining numbered recovery-target validation, and focused tests passed 190/190 plus canonical owner tests
- 2026-07-20 UTC - blocked T008@c9b461e7 after Code Reviewer re-review: source-level sequential-v1 trust boundaries are approved, but checked-in recovery and atomic generated runtimes remain stale and fail byte-identical build-dev projection checks
- 2026-07-20 UTC - resumed T008@c9b461e7 for deterministic projection and final integration; source/generated recovery, atomic, and Work prompt bytes became exact, focused tests passed 190/190, integration tests passed 69/69, full suite passed 1,274 of 1,277 with 0 failures and 3 skips, and pristine release/lint/compose gates passed
- 2026-07-20 UTC - blocked T008@c9b461e7 after final Tester and Code Reviewer rejection: add interrupted and public owner-acquisition regressions, canonicalize mapped tracked completion identity, enforce canonical duplicate-free JSON at the wire boundary, and explicitly define bounded CLI, workspace, capture, descriptor, and error limits before implementation
- 2026-07-20 UTC - re-defined with user-approved fixed resource ceilings and strict canonical JSON boundaries; made tracked completion input issue-only with conditionally forbidden taskKey while preserving authorization-verified mapping as non-identity metadata, added interrupted-completion and public owner-acquisition acceptance, and preserved three modules, six records, one packet, sequential v1, all eight task identities, and all execution history
- 2026-07-20 UTC - execution reconciliation after fixed-resource re-definition: kept T001@8f31c2a7-T007@5f0a3c8d byte-for-byte with completed state, changed T008@c9b461e7 in place while preserving its blocked state, blocker, dependency, and verification commands, dropped 0, new 0, and preserved all execution history
- 2026-07-20 UTC - resumed T008@c9b461e7 for fixed-resource implementation; six module-local ceilings, bounded CLI/error handling, canonical JSON checks, canonical tracked completion, and exact boundary fixtures brought focused recovery, Beads, and atomic suites to 202/202 with zero lint findings
- 2026-07-20 UTC - blocked T008@c9b461e7 after Code Reviewer rejection: generated runtime is stale, canonical capture JSON is bypassable outside CLI, programmatic bodies copy before limits, workspace reads have a bounded-read TOCTOU gap, nested result taskKey is accepted, descriptor 65 is appended before refusal, and errors echo caller input
- 2026-07-20 UTC - resumed T008@c9b461e7 for bounded acquisition correction; canonical capture validation, copy-late accounting, descriptor-based workspace reads, nested completion identity, pre-append descriptor caps, and fixed bounded errors brought focused suites to 208/208 and current-format to 42/42
- 2026-07-20 UTC - blocked T008@c9b461e7 after Code Reviewer re-review: direct-ledger enumeration still materializes metadata beyond source entry 65, and a regular-file-to-FIFO race can block during open before descriptor type and identity validation
- 2026-07-20 UTC - resumed T008@c9b461e7 for the final two acquisition fixes; nonblocking no-follow descriptor opening and first-crossing direct-ledger refusal brought focused suites to 210/210 with zero lint findings
- 2026-07-20 UTC - blocked T008@c9b461e7 after Code Reviewer re-review: FIFO-safe descriptor acquisition is approved, but readdirSync plus global name sorting still materializes and processes direct-ledger entries beyond source entry 65 before refusal
- 2026-07-20 UTC - resumed T008@c9b461e7 for bounded incremental direct-ledger iteration; opendirSync/readSync now stops at the first Markdown-ledger crossing, closes once, and preserves 210/210 focused behavior
- 2026-07-20 UTC - T008@c9b461e7 remains blocked after a second Code Reviewer rejection on the same direct-ledger bound: unsupported non-Markdown children still bypass the 64-entry ceiling and can accumulate unbounded metadata diagnostics; escalation requires user approval before another revision
- 2026-07-20 UTC - resumed T008@c9b461e7 after user approval that every direct child of .dude/ideas counts toward the 64-entry ceiling before classification; fresh exact-target inspection 74941aaa932256b15c1ca1a1a7e97350766c68b8bd079bb8f498414154b039a2 had no blockers or overflow
- 2026-07-20 UTC - T008@c9b461e7 all-child inventory revision passed 212/212 focused tests and 4/4 exact source-entry boundaries; exact-bound probing confirmed deterministic handling of 62 direct children plus fixed task and lane entries
- 2026-07-20 UTC - blocked T008@c9b461e7 after Code Reviewer rejection: entry 65 still accesses its name and allocates a path before the ceiling check, while a throwing directory close can replace the terminal resource refusal and allow later acquisition; generated projection remains intentionally untouched
- 2026-07-20 UTC - resumed T008@c9b461e7 with user approval for only the two terminal-crossing corrections: refuse child 65 before name/path work and preserve that resource refusal if directory close fails; fresh exact-target inspection cf1e8d305282decaf2d81d6823748cef736b64fa6f7750292eef9b850288364d had no blockers or overflow
- 2026-07-20 UTC - terminal-crossing corrections passed 213/213 focused tests, 69/69 projection contracts, 1,297/1,300 full-discovery tests with 3 skips and 0 failures, workspace and release lint, compose, pristine release, Tester acceptance, and source review before exact projection
- 2026-07-20 UTC - final Code Reviewer rejected T008@c9b461e7 on two remaining acquisition-order defects: workspace descriptor close can replace a terminal body-limit refusal, and malformed CLI byte envelopes are rejected only after workspace reads; continued immediately under the user's direction for these two local corrections only
- 2026-07-20 UTC - completed T008@c9b461e7: fixed-limit body refusals now survive descriptor cleanup and all declared CLI byte envelopes preflight before workspace body acquisition; 215/215 focused tests, 69/69 projection contracts, and 1,299/1,302 full-discovery tests passed with 3 platform skips and 0 failures; source/generated bytes were exact, workspace and release lint had 0 failures, compose had 0 failures or leftovers, the 54-file pristine release contained 0 tests, Tester passed, and Code Reviewer approved
<!-- dude:managed:end -->
