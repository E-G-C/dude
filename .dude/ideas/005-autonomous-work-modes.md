---
title: Autonomous Work Modes
slug: autonomous-work-modes
status: defined
spec_path: .dude/specs/005-autonomous-work-modes/spec.md
---

# Idea: Autonomous Work Modes

## Idea

I would like the Dude bundle to offer explicit options that let Dude keep working in an almost autonomous fashion instead of repeatedly asking me to make routine, recoverable decisions.

The motivating mismatch is that the current fully uncapped guarded-recovery invocation, `@dude work --max unlimited --recover-on-block --recovery-cycles unlimited`, still stopped for user approval after a second rejection on the same HTML-exclusion finding during T003. Unlimited numeric budgets did not provide the degree of policy autonomy I expected. I want to explore a more autonomous option, but the exact mechanics, authority boundaries, and irreducible human checkpoints are not yet settled.

When continuous autonomous work is meant to improve an outcome, Dude should optionally work against an explicit Progress Objective. The objective may be numeric, ordinal, or subjective. Comparable evaluation, rather than mere activity or novelty, determines whether a candidate is retained. This is a thin extension of existing recovery and learning, not an autoresearch-style optimizer platform.

## Open Questions

1. Which current human checkpoints may an autonomous option pass without asking, especially repeated reviewer-rejection escalation, and which must remain hard stops?
   Answer: An autonomous policy may pass routine recoverable checkpoints without asking: repeated reviewer-rejection escalation subject to Q3 and Q4, bounded local test-failure repair, derived-definition inconsistency when user intent is unchanged and the existing guarded transaction applies, and recoverable tool failures. Hard stops remain for destructive confirmation; credentials or secrets; spending or external side effects requiring authorization; unavailable external dependencies or input; ambiguous ownership or reconciliation; changed or ambiguous user intent; and safety or authority conflicts.
2. Should autonomy be one explicit mode or several levels or policies, and should it always be opt-in?
   Answer: Use several explicit opt-in policies rather than one vague mode. At minimum, preserve current `guarded` behavior and add `autonomous`, which may continue through bounded recoverable checkpoints. A later custom policy may tune budgets and stop rules, but autonomy is never enabled implicitly. This settles the desired policy experience, not syntax, configuration, profiles, or state-machine implementation.
3. What independent decision rule permits another revision after repeated rejection, such as bounded scope, unchanged intent, and a non-destructive change, without merely ignoring review?
   Answer: Autonomous work may authorize another revision when the rejection is concrete and actionable within the current task, user intent is unchanged, and the change remains within existing non-destructive authority. Every revision still requires fresh verification and independent re-review. If the rejection or approach is repeated or equivalent, Q4 must run before another attempt is authorized.
4. What termination controls must remain even in the most autonomous mode, such as no progress, time, cost or token limits, repeated equivalent findings, or external dependencies?
   Answer: A repeated equivalent approach or rejection triggers a mandatory learning review, not an immediate stop or blind retry. Pause; review history, completed work, evidence, rejections, and current assumptions; determine why the approach is repeating; extract learning; generate credible alternatives; and select a materially different approach with a discriminating check. Stop as no-progress only when no credible alternative or new distinguishing evidence can be found. The irreducible hard stops in Q1 still apply; configured time, cost, token, and attempt budgets remain policy limits. Normal verification and independent review still apply after the alternative attempt.
5. What summary or audit trail should the user receive after autonomous work?
   Answer: After autonomous work, produce a concise final audit listing tasks attempted, completed, skipped, and still blocked; each recovery or learning cycle and why it was authorized; files changed; verification and review outcomes; decisions made without user input; and remaining risks or hard stops. Keep detailed evidence in the existing Coordinator Log and execution history rather than creating a second persistent ledger.
6. When one task is blocked and other independent tasks are ready, should autonomous work keep repairing the blocked task, move to independent work, or do both sequentially under policy?
   Answer: Finish the currently authorized bounded recovery attempt first. If it reaches a hard stop, continue with independent ready work when dependencies and write sets are disjoint. Revisit the blocked task only when new evidence or a materially different approach exists. Keep v1 execution sequential; do not add concurrency merely for autonomy.
7. When autonomous work is intended to improve an outcome, how should progress be judged?
   Answer: A Progress Objective is optional and must come from user intent or the owning definition or task; Dude must not invent or silently change it. When one is present, a frozen Evaluation Contract defines the objective kind (numeric, ordinal, or subjective); baseline and retained incumbent; direction or rubric plus meaningful-improvement and tie rules; fixed evaluator, inputs, environment, comparison conditions, and per-comparison budget; keep, discard, or incomparable outcomes; and evidence provenance. Numeric objectives freeze unit, direction, tolerance, and noise aggregation. Ordinal objectives freeze levels or a pairwise rubric. Subjective objectives freeze a comparative rubric yielding better, equivalent, worse, or incomparable, preferably through independent judgment; an equivalent candidate may be retained only for a predeclared simplicity or risk reduction. Hard correctness, safety, compatibility, resource constraints, verification, and independent review veto objective gains; a better score never grants authority or closes a task alone. Failed, crashed, timed-out, regressed, rejected, or incomparable candidates are discarded and the retained incumbent is restored through existing lane-safe mechanisms; inability to prove restoration stops work, with no automatic commit or reset. Changing the evaluator, fixtures, rubric, environment, or budget invalidates comparability and starts a new baseline; results are never compared across that boundary.

## Assumptions

- The bundle has at least two explicit opt-in policies: the existing `guarded` policy and a new `autonomous` policy. Autonomy is never implicit, and no syntax or persistence or configuration mechanism is selected.
- Under `autonomous`, routine recoverable checkpoints may pass without user input: reviewer-rejection escalation governed by Q3 and Q4, bounded local test-failure repair, unchanged-intent derived-definition repair through the existing guarded transaction, and recoverable tool failures.
- Hard stops remain in force and follow the canonical Q1 taxonomy rather than a separately restated list.
- Review findings remain evidence, failed review is never approval, and every revision or alternative attempt still requires fresh verification and independent re-review.
- Q3 is the authorization rule for another revision; Q4 is the mandatory learning and materially different alternative rule for repeated or equivalent approaches or rejections. No-progress applies only when no credible alternative or new distinguishing evidence exists.
- The final audit is concise and user-visible, while detailed evidence remains in the existing Coordinator Log and execution history rather than a second persistent ledger.
- Scheduling is sequential in v1: finish the authorized bounded recovery attempt, move to disjoint independent ready work if it hard-stops, and revisit the blocked task only with new evidence or a materially different approach.
- Deterministic runtime continues to own budgets, state, and evidence, while model reasoning owns semantic decisions.
- A Progress Objective is optional and externally grounded in user intent or the owning definition or task; Dude neither invents nor silently changes it.
- When an objective is present, its Evaluation Contract freezes comparable evaluation around a baseline and retained incumbent; changing comparison terms starts a new baseline.
- Objective results are evidence, not authority, and remain subordinate to correctness, safety, compatibility, resource constraints, verification, and independent review.
- Existing evidence, history, audit, recovery, and learning mechanisms remain authoritative; no second ledger or automatic Git behavior is introduced.
- Objective-directed optimization ends when its scoped task completes unless another scoped task explicitly continues it.

<!-- dude:managed:start -->
## Normalized Intent

- Distinguish numeric unboundedness, which removes configured iteration limits, from policy autonomy, which determines when Dude may make a recoverable decision without user approval.
- Offer several explicit opt-in policies, including existing `guarded` behavior and an `autonomous` policy that may cross bounded routine recoverable checkpoints without asking.
- Permit another revision only under Q3: the rejection is concrete and actionable within the current task, intent is unchanged, authority remains non-destructive, and fresh verification and independent re-review follow.
- Apply Q4 before another repeated or equivalent attempt: review history and evidence, extract learning, generate credible alternatives, and select a materially different approach with a discriminating check; stop as no-progress only when no credible alternative or new distinguishing evidence exists.
- Preserve hard stops per the canonical Q1 taxonomy; configured budgets remain policy limits.
- Produce a concise final audit of task outcomes, authorized recovery and learning cycles, changed files, verification and review, autonomous decisions, and remaining risks, while retaining detailed evidence in existing history.
- Keep v1 scheduling sequential: finish the current bounded recovery attempt, continue with disjoint independent ready work after a hard stop, and revisit blocked work only with new evidence or a materially different approach.
- Reuse the existing recovery and learning capability rather than creating a parallel mechanism.
- Support an optional, externally grounded Progress Objective when continuous autonomous work is intended to improve a numeric, ordinal, or subjective outcome.
- Freeze an Evaluation Contract around the baseline, retained incumbent, evaluator, rubric or direction, comparison conditions, budget, outcomes, and provenance; changed terms start a new baseline.
- Keep only candidates supported by comparable evaluation; discard failed, regressed, rejected, or incomparable candidates, restore the retained incumbent through lane-safe mechanisms, and stop if restoration cannot be proven.
- Treat objective results as evidence subordinate to correctness, safety, compatibility, resource constraints, verification, and independent review; no score grants authority or closes work.

## Constraints

- This artifact is brainstorm intake only; do not create a definition package or begin implementation.
- No implementation syntax, framework, profile, configuration, persistence mechanism, agent arrangement, or state machine is selected during brainstorm.
- Do not weaken destructive, security, authorization, ownership, reconciliation, or user-intent authority.
- Verification and independent review remain mandatory; failed review remains evidence, never approval.
- Reuse the existing evidence, history, audit, recovery, and learning runtime rather than duplicating it.
- Do not introduce a generic metrics DSL, optimizer framework, champion manager, durable experiment table, or second persistent audit ledger.
- Do not add automatic commits or resets.
- Do not continue objective-directed optimization after task completion unless another scoped task exists.
- Keep v1 execution sequential.
- This idea does not authorize changing current T003 or bypassing current workflow rules.

## Definition Checklist

- [x] Outcome is coherent for brainstorm
- [x] Scope is bounded to a single idea ledger
- [x] Open questions are resolved or consciously assumed

## Coordinator Log

- 2026-07-20 UTC - brainstorm captured
- 2026-07-20 UTC - brainstorm refreshed: question 4 settled with mandatory stand-up-style learning review and materially different alternatives before no-progress stop
- 2026-07-20 UTC - brainstorm refreshed: all six autonomy-policy questions settled; definition is ready on explicit request
- 2026-07-20 UTC - brainstorm revised: consolidated the hard-stop taxonomy into Q1 and referenced it from Q4, assumptions, and normalized intent to remove duplication
- 2026-07-20 UTC - defined -> .dude/specs/005-autonomous-work-modes/spec.md
- 2026-07-21 UTC - brainstorm refreshed: optional Progress Objective and frozen numeric, ordinal, or subjective Evaluation Contract settled for objective-directed autonomous work
- 2026-07-21 UTC - re-defined with user-approved final evidence-channel contract: autonomous plan evidence, candidate-bound verification, objective-history projection, and exact registry markers
- 2026-07-21 UTC - work run started (Lightweight; policy max=unlimited, recover-on-block, recovery-cycles=unlimited)
- 2026-07-21 UTC - T001 closed: `--policy guarded|autonomous` selector + `RunState.policy.mode`; 154 tests green, independent review APPROVE; generated `.github` recovery.mjs projection parity deferred to T007 (3 known build-dev.test.mjs failures until then)
- 2026-07-21 UTC - T002 closed: pure additive `mayContinueAutonomously(outcome)` + `classifyOutcomeReason`/`OUTCOME_REASON_CLASSES` (21-reason hard-stop taxonomy); zero decision-path change, guarded byte-identical; recovery.test.mjs 111 green, independent review APPROVE
- 2026-07-21 UTC - T003 closed: pure additive `mayScheduleAfterStop(stopped,candidate)` sequential-continuation predicate (autonomous + hard-stop + no-pending + distinct + disjoint change-set + dependency-independent); zero decision-path change; recovery.test.mjs 119 green, independent review APPROVE. Deferred (non-blocking): harden tracked `durableId` via `canonicalTarget` + add a tracked gate-9 fixture in T008 hardening pass. Phases 1-2 (autonomous work modes core, no objectives) complete.
- 2026-07-21 UTC - T004 closed: autonomous-only `definition-plan` evidence (source position 3) + `scanObjectiveRegistry`/`validateObjectiveRegistry`/`validateEvaluationContract` + normalized 4-hash body + `objective-source-conflict` blocker/taxonomy + SKILL.md compilation rules; guarded byte-identical (zero plan opens), fresh reacquisition = drift/objective-conflict; recovery.test.mjs + current-format-contract 177 green, independent review APPROVE. Deferred projection parity now spans recovery.mjs + feature-definition SKILL.md (build-dev + prompt-audit) → T007 `build-dev.mjs` rebuild.
- 2026-07-21 UTC - T005 closed: objective-evaluation machinery (29 exports) - identity layer, CandidateWriteSet, bounded evaluationSequences/learningReviewRefs RunState validation, injected checkpoint host + acquire/capture/restore/keep/release phase machine, numeric/ordinal/subjective comparators, five derived gate normalizers + mandatory candidate-bound-completion, keep-or-restore. Guarded byte-identical (host not in dependencies); five invariants tested; recovery.test.mjs 169 green, independent review APPROVE. Carry into T006 (orchestration): (1) protected-path byte-identity comparison, (2) `restoreCheckpoint` phase guard for captured-context restores, (3) optional comparison-gate identity cross-check.
- 2026-07-21 UTC - T006 closed: 18 exports - 3 bounded events (+eventHash, ≤16384), injected projection owner + `projectEvent`/`verifyProjection` dual-surface + `reacquireProjection` fail-closed, reference admit/evict (≤8/row,≤64,≤16, evict-after-verify), `resolveComparison` keep-advance/non-keep-restore-first, `closeEvaluationSequence`, `settleTaskBoundary` (no lane mutation, no post-task optimization), `renderAuditSummary`; all 3 T005 residuals fixed (S1); S9 authorize carry-forward byte-identical; `dude-work/SKILL.md` single detail owner. Focused suite 237 green (recovery + current-format-contract), independent review APPROVE. Carry into T007: (1) reconcile schema `AuditSummary` `no-objective` outcome (unrepresentable - a no-objective task creates no sequence row); (2) `node scripts/build-dev.mjs` rebuild clears all deferred `.github` projection parity (build-dev + prompt-audit).
- 2026-07-21 UTC - T007 closed: schema `AuditSummary` outcome enum reconciled to `{kept,discarded,blocked,unsettled}` (Spec Lead, bounded); generated core rebuilt (`build-dev.mjs`, 51 synced/25 removed) clearing all deferred `.github` projection parity; docs (commands/workflow/reference) document policy selection, autonomous-only definition-plan, five gates, comparators, projection, audit, no-objective; +3 feature-005 assertions in current-format-contract.test.mjs. Full suite 1404 pass / 0 fail; independent review APPROVE. Carry into T008: apply deferred tracked `durableId` via `canonicalTarget` + tracked gate-9 fixture (T003 residual).
- 2026-07-21 UTC - T008 closed — FEATURE COMPLETE (8/8): applied deferred tracked `durableId` canonicalization + tracked gate-9 test; full gate battery green (full suite 1406 pass/0 fail/4 skipped, dude-lint 0/0, compose verify 0 failures, pristine release build + release-lint 0 failures, `git diff --check` clean, `.github` clean src projection); independent Tester ACCEPT (all 8 proof obligations + SC-001..SC-012 covered; authored one `stale` definition-plan fail-closed test) and independent Code Reviewer APPROVE (acyclic identity DAG, guarded byte-invariance, safety invariants, OWASP, scope discipline all PASS). Minor `--policy` grammar completeness added to `dude-work/SKILL.md`. Autonomous work modes + optional objective evaluation delivered end-to-end in the existing `dude-work` runtime; no new module/lane/ledger; guarded default unchanged.
<!-- dude:managed:end -->