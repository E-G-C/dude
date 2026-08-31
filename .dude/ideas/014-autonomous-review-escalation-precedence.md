---
title: Autonomous Review Escalation Precedence
slug: autonomous-review-escalation-precedence
status: defined
spec_path: .dude/specs/014-autonomous-review-escalation-precedence/spec.md
---

# Idea: Autonomous Review Escalation Precedence

## Idea

Flagging and capturing a defect found while reading the coordinator's own prompt surfaces. Classified as `contract-mismatch`.

Under explicit `autonomous` Work, the coordinator still escalates to the user on a second review failure of the same finding, even though the runtime does not require that ask and three other prompt surfaces say to defer it to `dude-work` learning governance.

**Four surfaces govern review rejection, and they disagree.** All four were read directly this session.

1. `src/instructions/dude.instructions.md` rule 8 says "Review is independent; rejection follows `dude-reviewer-protocol`" with no autonomous qualifier. Rule 13 in the same file carries the autonomous deferral.
2. `src/agents/dude.agent.md` line 77, section `## Review Rejection`, ends with "A second failure on the same finding escalates to the user." It has no autonomous carve-out and no cross-reference to `## Work` or to learning governance. This is the section a coordinator consults at the moment a rejection lands.
3. `src/agents/dude.agent.md` line 83, section `## Work`, carries the deferral: "During explicit autonomous Work, preserve exact repeat evidence and defer every affected-target disposition to the learning governance owned by `dude-work`". This section is consulted at run start, not mid-run.
4. `src/skills/dude-reviewer-protocol/SKILL.md` carries a deferral line above `## Rejection Procedure`, but step 5 of that procedure still reads "A second failure on the same finding escalates to the user; do not repeat the loop or fake certainty." `src/skills/dude-receiving-code-review/SKILL.md` carries a matching deferral line and has no escalation step.

**The likely root cause is an under-specified noun, not a missing rule.** Every deferral line says some variant of "defer every repeat-triggered disposition to `dude-work` learning governance." "Disposition" reads naturally as what happens to the *target* — block, close, no-progress, revisit. Escalating to the user is not obviously a target disposition; it reads as an orthogonal notification obligation. So a careful reader can correctly defer the disposition and still interrupt the user. That explains the observed symptom better than "the rule was ignored."

**The runtime does not require the ask.**

- `src/skills/dude-work/recovery.mjs` `OUTCOME_REASON_CLASSES` (around lines 5765-5788) classifies `review-rejected` and `verification-failed` as `recoverable-checkpoint`, not `hard-stop`.
- `mayContinueAutonomously` (around line 5742) explicitly licenses skipping the user-approval ask for an authorized recovery attempt under `autonomous` policy, gated on `authorized === true`, and does not bypass verification or independent review.
- `learning-required` is classified `learning-stop` and is resolvable through the learn/transition permit chain with no user step.

**Blast radius — this is a contract change, not a prose typo.**

- The exact sentence is pinned by `scripts/current-format-contract.test.mjs`: a `needles` entry at line 1335, the full `ruleLine` at line 1337, and the reviewer-protocol needle at line 1347.
- The identical sentence sits in the runtime mirror at `.github/agents/dude.agent.md` line 77. The runtime loads `.github/`, so a `src/`-only change is inert until the mirror is rebuilt.
- Minimum change set is roughly five files plus the contract test plus mirrors.

**Observed symptom — reported, but causation is inferred, not proven.** During `@dude work autonomous-learning-governance --max unlimited --recover-on-block --recovery-cycles unlimited --policy autonomous`, I was asked five separate times to authorize a bounded revision past a hard stop, and I approved all five. That is already recorded in `.dude/ideas/unattended-work-continuity.md`. The run transcript was not read, so the causal link between this contract mismatch and those five interruptions is an inference drawn from the prompt surfaces alone. Record it as an inference. The defect stands on internal-consistency grounds whether or not it was the sole cause.

**Counter-reading worth preserving.** There is a defensible position that the escalation is intentional even under autonomous Work: rule 9 holds that quality authority controls readiness and that unresolved cross-authority conflict escalates to the user, and two rejections on one finding is arguably exactly that. I do not find this persuasive, because rule 13 and the three deferral lines were clearly added to defer this specific case. But the fix reduces human oversight, so it warrants a deliberate confirmation rather than being treated as routine cleanup.

**Candidate fix shape — candidate only, not a selection.** Scope the escalation sentence so the operative section stands alone, and fix the noun across all four surfaces so the deferral explicitly covers user escalation as well as target disposition.

**Candidate verification — candidate only.** `node .github/skills/dude-lint/lint.mjs .`, the contract test suite, and ideally a fixture asserting that an autonomous run with two review rejections on one finding produces no user prompt and lets governance own the disposition.

**Deliberately out of scope here.** This is item A of a three-part design thread. The other two — bounded revision autonomy under autonomous Work, and automatic redefinition — are sequenced follow-on work and are not captured yet.

## Open Questions

1. Is the unconditional escalation in `## Review Rejection` a defect, or is it intended behavior that the deferral lines were never meant to override?
   Answer:yes, it should not
2. Should the fix scope the escalation sentence locally to non-autonomous Work, correct the "disposition" wording across all four surfaces, or both?
   Answer:  Do not over-engineer it. Be pragmatic.Prefer simplification over complication
3. Does the deferral to `dude-work` learning governance cover user escalation and notification, or only the disposition of the affected target?
   Answer: Preferred their smart route with minimal user intervention
4. Should the contract test pin the corrected wording as tightly as it currently pins the existing sentence, or should the pin be loosened so the surfaces can diverge in wording without breaking?
   Answer: Do not over-engineer it. Be pragmatic.Prefer simplification over complication
5. What evidence would demonstrate that the fix works — is a fixture asserting no user prompt under autonomous Work required, or is surface consistency plus lint sufficient?
   Answer: Do not over-engineer it. Be pragmatic.Prefer simplification over complication

## Assumptions

No additional assumptions have been provided.

<!-- dude:managed:start -->
## Normalized Intent

- The outcome wanted is a single, consistent contract for what happens when a review rejects the same finding twice under explicit `autonomous` Work, so the coordinator does not interrupt the user when the runtime does not require it.
- The defect is a disagreement across four prompt surfaces, not a missing capability: one operative section (`## Review Rejection`) escalates unconditionally while three other surfaces defer the same case to `dude-work` learning governance.
- Placement matters as much as wording. The escalating sentence sits in the section consulted at the moment a rejection lands; the deferral sits in the section consulted at run start.
- The proposed root cause is an under-specified noun — "disposition" reads as target-only, leaving user escalation as an apparently separate obligation that survives the deferral. This is a hypothesis to test during definition, not a settled finding.
- Runtime classification is evidence that the ask is unnecessary: `review-rejected` is a `recoverable-checkpoint`, and `mayContinueAutonomously` already licenses skipping the approval ask for an authorized recovery attempt under `autonomous`.
- Causation for the five observed interruptions is explicitly an inference from prompt surfaces; no run transcript was read. The defect is justified on internal-consistency grounds independently of that symptom.
- The counter-reading (rule 9 cross-authority escalation) is preserved as a live alternative, not dismissed. Because the fix reduces human oversight, it needs deliberate confirmation rather than routine cleanup treatment.
- Fix mechanics and verification are recorded as candidates only; brainstorm selects neither.

## Constraints

- Brainstorm intake only. No definition package, no `.dude/specs/` writes, no implementation.
- Do not select the fix shape, the wording, or the verification strategy during brainstorm.
- Preserve the counter-reading honestly; do not resolve question 1 by assertion.
- Keep causation for the five interruptions labeled as an inference unless a run transcript is read.
- Any eventual change must account for the runtime mirror at `.github/`, since a `src/`-only edit is inert until rebuilt.
- Any eventual change must account for the sentence being pinned in `scripts/current-format-contract.test.mjs`.
- Scope stays on item A. Bounded revision autonomy and automatic redefinition are separate captures.

## Relationship To Existing Work

- Feature 013 `unattended-work-continuity` (`status: defined`, `.dude/specs/013-unattended-work-continuity/spec.md`) deferred its Q2, and its SC-005 states that no previously absolute stop becomes continuable. This idea does not contradict SC-005: `review-rejected` was never classified `hard-stop`, so correcting the escalation reclassifies no stop.
- The five-interruption observation is already recorded in `.dude/ideas/unattended-work-continuity.md`. This ledger reuses that observation as symptom evidence; it does not restate or reopen that idea.
- `dude-work` learning governance is the named deferral target on three of the four surfaces, so any fix has to be consistent with what that governance already owns.

## Definition Disposition

Recorded by @dude-spec-lead at first definition (`define autonomous-review-escalation-precedence` → `.dude/specs/014-autonomous-review-escalation-precedence/spec.md`). The `## Open Questions` answers stay user-controlled and byte-unchanged; the following are conscious definition-time assumptions carried into the spec's `## Assumptions`, inventing no scope beyond the normalized intent, constraints, and relationship notes.

For questions 2, 4, and 5 the user gave one governing preference — "Do not over-engineer it. Be pragmatic. Prefer simplification over complication" — and the coordinator interpreted each question against that preference. The user confirmed all interpretations before invoking define. Both the raw preference and the interpretation are recorded below.

- Q1 — Answered: the unconditional escalation is a defect. Under explicit `autonomous` Work the coordinator must not interrupt the user on a second failure of the same finding.
- Q2 — Raw preference: pragmatic, prefer simplification. Interpretation confirmed by the user: the noun fix across all four surfaces, not a carve-out confined to `## Review Rejection`. Patching only `src/agents/dude.agent.md` is insufficient, because `src/skills/dude-reviewer-protocol/SKILL.md` step 5 still states the escalation with no qualifier and shared rule 8 routes rejection handling to that skill. The end state must be one consistent rule rather than four surfaces requiring precedence reasoning. Adding a new conditional carve-out sentence is explicitly not preferred: correcting the term is less prose, not more.
- Q3 — Answered ("preferred their smart route with minimal user intervention"): the deferral to `dude-work` learning governance covers user escalation and notification, not only the disposition of the affected target. Scope stays on item A; bounded revision autonomy (item B) is not imported into this feature.
- Q4 — Raw preference: pragmatic, prefer simplification. Interpretation confirmed by the user: keep the pinning mechanism in `scripts/current-format-contract.test.mjs` exactly as-is and update only the pinned strings. Do not loosen the pin — it is the only thing making this prose a contract, and loosening it would re-enable the exact drift class being fixed.
- Q5 — Raw preference: pragmatic, prefer simplification. Interpretation confirmed by the user: no new behavioral fixture. Surface consistency plus `dude-lint` plus the updated contract test is sufficient. This is a prose-only change with zero runtime change, so there is no deterministic code path to test, and a fixture asserting "no user prompt under autonomous Work" would require a model-behavior eval rig, which is disproportionate.
- Reconciliation with Feature 013 — This feature changes no runtime behavior and reclassifies no stop, so it does not conflict with Feature 013's SC-005 ("no previously absolute stop is continuable"). `review-rejected` was never classified `hard-stop`.
- Causation and counter-reading — Both preserved as the idea recorded them: causation for the five observed interruptions remains an inference from prompt surfaces, and the rule 9 counter-reading was considered and consciously rejected rather than ignored.

### Re-definition (2026-07-30, unchanged intent)

Decomposition correction only. No open question was reopened, no answer reinterpreted, and no requirement, success criterion, or scope boundary changed. `spec.md` is byte-unchanged.

The package contradicted itself about where the `.github/` rebuild belongs. `plan.md` section 6 states the rebuild is part of the change set rather than a follow-up, but `tasks.md` assigned it to a separate T003 while giving T001 a gate of `node --test scripts/current-format-contract.test.mjs`. Execution proved that gate unsatisfiable inside T001's scope: the contract suite's generated-core guard short-circuits only on full `src/` to `.github/` byte parity, so any `src/`-only edit makes it scan generated files and flag `.github/skills/dude-work/**`, which T001 is forbidden to touch. `plan.md` was right and `tasks.md` was wrong, so the decomposition was corrected rather than the plan's reasoning.

The governing principle is now explicit in both artifacts: every task that edits `src/` also rebuilds `.github/` in the same unit, so each task leaves the tree in a verifiable state. Four canonical units become three, consistent with the user's governing preference to prefer simplification over complication. No task, phase, artifact, or requirement was invented.

- T001@64656672 — kept, scope changed: absorbs the `node scripts/build-dev.mjs` rebuild and the `.github` projection check, so its gate is satisfiable within its own scope. Trace widened to US4 and FR-009.
- T002@73636f70 — kept, scope changed: same rebuild addition and the same trace widening.
- T003@73796e63 — dropped while open. Its rebuild content moved into T001 and T002; its only remaining content was the `docs/workflow.md` and `docs/reference.md` consistency check, which plan section 7 already frames as a verification rather than a change, and which T004 absorbed.
- T004@76726679 — kept, scope changed: absorbs the documentation-consistency verification and now depends on T002@73636f70. Its existing full-suite, lint, compose verify, release build, `.github` diff gate, and independent-review scope is unchanged.

`plan.md` changed only in `## Phases`: the four-phase list became three, and one sentence now states that the rebuild belongs to whichever task edits `src/`. Section 6 and every other plan section are byte-unchanged. The change was necessary because the old list named the dropped T003 and would have left a dangling durable key plus the same plan/tasks contradiction.

## Definition Checklist

- [x] Outcome is clear enough for brainstorm
- [x] Scope is coherent as one idea ledger
- [x] Open questions are resolved or consciously assumed

## Coordinator Log

- 2026-07-30 UTC - brainstorm captured
- 2026-07-30 UTC - defined as Feature 014; spec_path `.dude/specs/014-autonomous-review-escalation-precedence/spec.md`. Open questions resolved as conscious assumptions (see Definition Disposition): Q1 defect confirmed; Q2 noun fix across all four surfaces rather than a local carve-out; Q3 deferral covers user escalation and notification; Q4 contract pin mechanism unchanged with pinned strings updated in lockstep; Q5 no new behavioral fixture. Staged spec/plan/tasks (four all-open canonical units: T001@64656672, T002@73636f70, T003@73796e63, T004@76726679, linear deps); lean package with no data-model, contracts, quickstart, or checklist artifacts, since this is a prose-contract correction with zero runtime change. Plan carries zero active ObjectiveRegistry regions. `src/skills/dude-work/SKILL.md` and its governance vocabulary are explicitly out of scope. Generated board fence left for coordinator regeneration. No new project-specific guardrail candidates surfaced, so no guardrail pause was raised.
- 2026-07-30 UTC - coordinator regenerated the derived board fence in `.dude/specs/014-autonomous-review-escalation-precedence/tasks.md` deterministically via `dude-lightweight-execution/board.mjs render --write`. `Ready Now` lists only T001@64656672; the dependency-gated T002@73636f70 through T004@76726679 correctly appear in no bucket, and `Blocked` stays reserved for `[!]`. The `.dude/state/task-state.json` snapshot gained exactly one additive entry for this package with all four glyphs `[ ]` and no other feature's recorded state altered. `node .github/skills/dude-lint/lint.mjs .` reports 0 warnings and 0 failures. No task glyph or execution state changed; the lane remains Definition Only with all four tasks `[ ]`.
- 2026-07-30 UTC - Work iteration 1 (`--recover-on-block --recovery-cycles unlimited --policy autonomous`, `--max` defaulted to 3). Runtime `parseInvocation` accepted the invocation; lane detected once as Lightweight with exactly one `status: defined` owner at the exact `spec_path:`. Claimed T001@64656672 `[~]` and routed implementation to @coder (T001 spans an instructions file, an agent file, two SKILL.md files, and a test, so no unique artifact-type owner applies and routing followed primary outcome). Implementation landed: all four deferral sentences now defer `disposition, escalation, and user notification` to `dude-work` learning governance, each within the 260-byte pointer cap (197/251/243/227) with exactly one `learning governance` sentence per file and each guarded/non-Work parity clause preserved; the four matching `T007` `ruleLine` pins were updated in lockstep with the pin mechanism, cap, and one-pointer rule unchanged. Coordinator reproduced verification independently: `node --test scripts/current-format-contract.test.mjs` returns 55 pass / 1 fail. T001 set `[!]` blocked, classified `plan-gap`: the sole failure is `T007 generated core carries no governance content outside a complete materialization`, whose guard short-circuits only on full `src/` ↔ `.github/` byte parity, so any `src/`-only edit trips it on untouched `.github/skills/dude-work/**`. `plan.md` section 6 states the `build-dev.mjs` rebuild is part of this change set while `tasks.md` assigns it to T003, so T001's stated gate is unsatisfiable within T001's stated scope. No task was closed, no `[x]` applied, and no definition artifact was mutated.
- 2026-07-30 UTC - explicit re-definition (`define autonomous-review-escalation-precedence`), unchanged intent, decomposition correction only. Exactly one `status: defined` owner resolved by exact `spec_path:` `.dude/specs/014-autonomous-review-escalation-precedence/spec.md`; `status:` and `spec_path:` preserved. Cause: `plan.md` section 6 places the `build-dev.mjs` rebuild inside the change set while `tasks.md` assigned it to a separate T003, which made T001's stated gate unsatisfiable within T001's stated scope. Correction: every task that edits `src/` now rebuilds `.github/` in the same unit; four canonical units become three. Staged reconciliation by durable key — kept-and-changed T001@64656672 (adds the rebuild plus the `.github` projection check, trace widened to US4/FR-009), kept-and-changed T002@73636f70 (same rebuild addition and trace widening), dropped-while-open T003@73796e63 (rebuild content absorbed by T001 and T002, docs check absorbed by T004), kept-and-changed T004@76726679 (absorbs the docs-consistency verification, dependency moved from T003@73796e63 to T002@73636f70); zero new. All three surviving durable keys retain their identity, and no scope change is a split or merge. `spec.md` byte-unchanged; `plan.md` changed only in `## Phases` to drop the dangling T003 reference and state the rebuild-with-the-edit boundary. The user-controlled `## Idea`, `## Open Questions`, and `## Assumptions` are byte-unchanged. No task glyph, no `blocked-by:` metadata, and no board fence content was set, cleared, or proposed; T001's existing `[!]` glyph and recorded blocker were left byte-unchanged for coordinator reconciliation. Nothing under `src/`, `.github/`, `scripts/`, or `docs/` was touched. Coordinator lint, task-state application, and board regeneration remain pending.
- 2026-07-30 UTC - coordinator applied execution reconciliation after the re-definition. `T001@64656672` moved `[!]` to `[~]`: the recorded `plan-gap` blocker is resolved by the corrected scope, so its stale `blocked-by:` metadata line was removed. Its deferral-sentence and contract-pin work already landed and is preserved; only the in-unit `node scripts/build-dev.mjs` rebuild remains outstanding. `T002@73636f70` and `T004@76726679` stay `[ ]`. Dropped `T003@73796e63` self-pruned from `.dude/state/task-state.json`, which now holds exactly the three surviving keys and no orphan. Regenerated the derived board fence via `dude-lightweight-execution/board.mjs render --write`; `render --check` reports up to date, with `In Progress` holding T001 alone, `Ready Now` and `Blocked` empty, and the dependency-gated T002 and T004 correctly in no bucket. No source, `.github/`, or `scripts/` byte changed during reconciliation, and no task was closed.
- 2026-07-30 UTC - Work run 2 (`--max unlimited --recover-on-block --recovery-cycles unlimited --policy autonomous`) completed all three canonical tasks; `no ready task`. Runtime `parseInvocation` returned `overall: unlimited`, `recovery: unlimited`, `recover: true`, `mode: autonomous`; lane detected once as Lightweight with exactly one `status: defined` owner at the exact `spec_path:`. T001@64656672 resumed from `[~]` and closed `[x]` after @coder ran the in-unit `node scripts/build-dev.mjs`; coordinator independently reproduced the gate at 56/56 with exactly four `.github/` projections. T002@73636f70 claimed and closed `[x]`: both unconditional escalation statements were corrected in place to `Outside an explicit autonomous policy, a second failure on the same finding escalates to the user; under that policy the autonomous Work deferral governs instead.`, neither uses the phrase `learning governance` (the one-pointer invariant holds at 1 per surface), no carve-out sentence was added, and the three `T008` pins were updated in lockstep. T004@76726679 claimed and closed `[x]` on full verification plus an independent @code-reviewer `APPROVE`: docs already consistent (`docs/workflow.md` line 355, `docs/reference.md` line 242) so no docs change; contract 56/56; build-dev and build-release 29/29; full discovered suite 1880 tests with 0 failures; `dude-lint` 0/0; `compose verify` all packs OK with 0 failures and 0 leftovers; `git diff --check` clean; pristine release build 55 files with 0 lint failures and both corrections present in the release artifact. The reviewer flagged that items 1, 2, 5, and part of 8 rested on content inspection, so the coordinator closed that gap at byte level: `git diff --name-only -- 'src/**/*.mjs'` and `-- src/skills/dude-work/` are both empty, and `OUTCOME_REASON_CLASSES` still binds `'review-rejected': 'recoverable-checkpoint'`. Two non-blocking reviewer findings recorded and deliberately not actioned: F1, rule 13 and `## Work` scope the widened object with `affected-target` while the two skills use `repeat-triggered`, so the adjective binds `disposition` alone and an over-broad reading is available in principle though defeated by refuse-semantics safety floors (measured substitution would fit at 228 and 244 bytes); F2, the `dude-receiving-code-review` pointer now sits at 251 of 260 bytes, so any future edit to it must measure first. All three tasks `[x]`; no runtime behavior changed and no stop was reclassified.
<!-- dude:managed:end -->
