# Implementation Plan: Automatic Unchanged-Intent Redefinition

## Summary

Extend the existing `reconcile-derived-definition` recovery action so explicit autonomous Work can select it automatically when fresh evidence proves a Lightweight blocker is caused by the derived definition. Preserve the existing action name, action class, hardcoded `lint`/`review`/`verification` checks, exact four-path scope, unchanged-intent requirement, tracked refusal, Spec Lead staging, coordinator reconciliation, atomic batch, and Feature 009 no-progress authority. Add only the missing eligibility, exact proposal identity, semantic proof contract, parsed structural validation, narrow `dropped-defective` exception, rollback-bound gates, and safe continuation behavior.

The transaction has one semantic review. The Spec Lead stages its authorized definition half and semantic mappings; the coordinator composes the exact final four-path bytes, including final canonical tasks and all reconciliation effects represented there; deterministic validation proves exact identity and closed form; and one independent reviewer judges the semantics of those exact bytes and mappings. Only that proposal applies. Inside the existing rollback-protected synchronous `afterApply` hook, the runtime rereads and reparses all four paths, compares exact descriptors, recomputes proposal identity, revalidates review identity, and runs fresh lint plus required verification. Any failure throws into reverse rollback. Successful identity revalidation does not trigger a second semantic review.

The implementation stays inside current machinery. `src/skills/dude-work/recovery.mjs` remains the deterministic recovery runtime and Feature 009 integration point. `src/skills/dude-feature-definition/atomic-file-batch.mjs` remains the sole all-or-restored definition filesystem engine. The optional coordinator-owned derived lane snapshot refresh remains outside that four-path transaction and must succeed through its existing all-or-restored lane boundary before resume. Prompt contracts describe the same route concisely, and `node scripts/build-dev.mjs` projects every source edit into the committed `.github/` runtime bundle in the same task that makes the edit.

This plan contains zero active ObjectiveRegistry regions. The feature optimizes no registered objective and creates no objective state.

## Technical Context

**Language/Version**: Node.js >= 20, dependency-free ESM with checked JavaScript and JSDoc types; Markdown authority contracts
**Primary Dependencies**: Node built-ins already used by the runtime (`node:buffer`, `node:crypto`, `node:fs`, `node:path`, `node:util`); existing feature-identity, task parser, workspace-path, recovery, Feature 009 learning-governance, atomic-file-batch, synchronous completion-gate, and lane-refresh boundaries; no external package
**Storage**: Existing owner idea plus sibling `spec.md`, `plan.md`, and `tasks.md`; transient exact proposal descriptors, semantic mappings, and review evidence carried through the current run; existing authoritative lane history only; no new persistent state or store
**Testing**: `node:test` suites for recovery and proposal identity, exact-proposal semantic review contracts, atomic structure and rollback, reconciliation, synchronous post-apply lint/verification, lane refresh, current prompt contracts, dev/release builds, the full discovered suite, workspace lint, compose verification, release lint, diff checks, and fresh independent acceptance
**Target Platform**: Cross-platform local Node.js execution in a Dude workspace; `src/` is authoritative source and `.github/` is the committed runtime projection loaded by VS Code/Copilot
**Project Type**: Core workflow runtime, definition transaction helper, and concise Markdown authority contracts
**Performance Goals**: Preserve existing evidence and packet bounds; derive exact identities with linear scans over the four recovery files and bounded mapping rows; perform one semantic review; add no unbounded retry, history, proposal accumulation, or semantic-normalization search
**Constraints**: Explicit autonomous Work only; Lightweight only; exact owner; user sections byte-identical; coordinator-composed final bytes before one semantic review; hashes prove identity only; complete reviewer-judged equal-or-stronger mappings; closed `dropped-defective` exception; coordinator-only state mutation; synchronously completed rollback-bound lint/verification; post-acceptance lane refresh outside the definition batch; no dependencies, new action, lane, command, store, ledger, transaction engine, objective system, or quality reduction

## Spec Quality Validation

- Six independently testable stories cover eligible continuation, non-weakening, structural integrity, task reconciliation, safe continuation and semantic termination, and authority preservation.
- FR-001 through FR-026 encode every settled answer and accepted review repair: eligible evidence, permitted artifact changes, coordinator-final composition, deterministic identity limits, one exact-proposal semantic review, intended-invariant preservation, the autonomous-only `dropped-defective` exception, rollback-bound lint/verification, lane refresh, Lightweight-only scope, and Feature 009-owned semantic no-progress.
- SC-001 through SC-012 are measurable through deterministic fixtures, byte comparisons, public recovery behavior, full validation, and independent review.
- Edge cases cover premature or stale review, byte-different semantic claims, direct contradiction, viable alternatives, outcome ambiguity, defective checks, byte drift, owner conflict, managed/log corruption, history loss, every reconciliation shape, asynchronous callbacks, post-write lint/verification failure, lane-refresh failure, equivalent decomposition, new evidence, and tracked refusal.
- The specification contains no source path, runtime record shape, implementation language, test-command choice, or unresolved clarification marker.

The specification passed its definition quality gate before this plan was staged. This is not a lint or readiness claim; coordinator lint remains pending.

## Guardrail Check

- Deterministic scripts own parsing, exact identity, eligibility facts, structure, byte comparison, anchors and references, mapping shape and completeness, final descriptors, and rollback. They never decide task-scope, acceptance-obligation, decomposition-basis, intended-invariant, successor-check, equal-or-stronger, or outcome equivalence.
- One independent semantic reviewer judges those meanings over the coordinator-composed exact final proposal. Hashes bind the reviewed bytes but confer no semantic authority.
- The smallest design extends the existing action, exact four-file atomic composition, synchronous post-apply hook, completion gates, and lane boundary. It introduces no parallel workflow, persistence layer, generic transaction framework, fifth definition path, or second learning policy.
- Model-facing instructions stay concise and point to one detailed Work owner plus one definition owner.
- `spec.md` holds WHAT and WHY; this plan owns source paths, record shape, validators, test commands, and build ordering.
- Every `src/` edit is followed by `node scripts/build-dev.mjs` in the same canonical task before parity-sensitive tests. Generated `.github/` files are never hand-edited.

No new project-wide guardrail is proposed. Existing deterministic-parsing, smallest-design, concise-instruction, source/generated, and spec/plan-separation guardrails cover this feature.

## Verified Existing Architecture

### Recovery action and checks

`src/skills/dude-work/recovery.mjs` already declares `reconcile-derived-definition` in `ACTIONS`, maps it to the `definition-reconciliation` action class, and fixes its completion checks to `lint`, `review`, and `verification`. `validateAssessment` already requires `intent: unchanged`; `actionInputsMatch` already resolves the owner from fresh Inspection evidence and requires exactly the owner idea plus sibling plan, spec, and tasks targets. `authorizeAttempt` and RunState validation already refuse the action for a tracked target.

The feature extends that action. It does not add an action, completion-check set, recovery counter, or action class.

### Work authority

`src/skills/dude-work/SKILL.md` already defines the exact recovery route: one exact owner idea and sibling `spec.md`, `plan.md`, and `tasks.md`; Spec Lead staging; coordinator reconciliation and state; complete user-section byte preservation; atomic application; fresh verification, lint, and review; and tracked refusal before writes.

The prompt change makes automatic eligibility, final-proposal composition before one semantic review, rollback-bound lint/verification, post-acceptance lane refresh, and Feature 009 termination explicit while leaving guarded, non-Work, and ordinary explicit-redefinition behavior unchanged.

### Atomic definition composition

`src/skills/dude-feature-definition/atomic-file-batch.mjs` already provides:

- `assertDefinitionRecoveryWritable`, which refuses tracked recovery before filesystem access;
- exact-owner resolution by canonical `spec_path`;
- exact four-path recovery scope;
- complete Idea, Open Questions, and Assumptions section byte comparison;
- one synchronous reconciliation validator over the staged batch;
- sorted temporary-file staging, expected-byte rechecks, rename application, post-apply callback, and reverse restoration/cleanup on caught failure; and
- a distinct incomplete-rollback error when restoration or cleanup cannot be proven.

`applyAtomicFileBatch` invokes its synchronous `afterApply` hook inside the rollback-protected `try`, before the transaction is accepted. The feature closes the callback contract for definition recovery, adds parsed definition-specific validators and exact proposal/review identity checks, and runs fresh lint plus required verification there. It does not duplicate file staging, rename, expected-byte, cleanup, or rollback logic.

### Learning and termination authority

Feature 009 and the current `dude-work` runtime remain the sole owners of repeat relationships, complete failed-approach comparison, materially different alternatives, distinguishing evidence, recovery permits, and `no-progress-verified`. Redefinition reads current evidence from that authority. It neither modifies the Feature 009 package nor creates parallel repetition or no-progress state.

The independent reviewer supplies exact-proposal semantic evidence about blockers and decompositions. Feature 009, not proposal hashing or the reviewer, decides whether the same blocker or an equivalent decomposition lacks distinguishing evidence and what no-progress disposition follows.

### Current non-open-drop authority

`src/skills/dude-feature-definition/SKILL.md` currently pauses for user confirmation before dropping any non-open task. Feature 015 intentionally adds one closed exception only for explicit autonomous Lightweight recovery and only when trusted defect evidence, complete equal-or-stronger successors, exact-final-proposal review, open successor state, byte-preserved prior history, and complete archive evidence all hold. Every missing condition and every other workflow retains the current pause.

### Proven structural gap

Feature 014 observed a coordinator-log event split by a textual insertion anchor and a stray managed-end marker that existing lint did not detect. That evidence requires parser-based append-only and fence validation before and after automatic writes. A passing existing lint run is necessary but not sufficient for this transaction.

## Architecture

### 1. Deterministic eligibility on the existing action

Add a closed eligibility result inside `recovery.mjs` for the existing `reconcile-derived-definition` route. It has two mutually exclusive evidence variants:

1. `definition-contradiction`: fresh Inspection evidence identifies the exact blocker, the conflicting definition obligations, and a causal impossible gate. This variant needs no failed retry count.
2. `learning-no-alternative`: fresh current Feature 009 evidence binds the same target and blocker and proves that the complete materially different implementation-approach set cannot resolve it.

The runtime derives the variant and evidence identities from trusted Inspection sources. Assessment prose, caller flags, or a free-form assertion that the plan is wrong cannot establish eligibility. Missing, stale, wrong-target, conflicting, or ambiguous evidence returns the existing fail-closed outcome. A viable materially different implementation approach keeps the ordinary recovery route and makes definition reconciliation ineligible.

Eligibility is available only when policy mode is explicit `autonomous`, lane is `lightweight`, intent is `unchanged`, exact ownership is present, and the action remains within its current recovery budget. Guarded, non-Work, and ordinary explicit-redefinition behavior and the tracked refusal stay unchanged. This eligibility gate precedes the proposal transaction; it does not decide semantic equivalence or non-open-drop authority.

### 2. Exact transient proposal identity

Build one closed, transient `DefinitionRevisionProposal` through the existing authorization/completion flow rather than persisting it separately. The Spec Lead stage is an input, not yet the reviewable proposal. After the coordinator composes final canonical tasks and all reconciliation effects into exact bytes, the proposal contains:

- exact target, owner idea path, and specification path;
- eligibility variant and trusted trigger-evidence identities;
- complete prestate descriptors for the exact four paths;
- complete coordinator-final descriptors for the same paths;
- complete old-to-new obligation mapping rows;
- retained or successor acceptance-check rows, including intended-invariant and trigger-evidence references;
- canonical task reconciliation rows and every archive effect represented in final bytes;
- semantic review evidence fields bound to all final descriptors and mappings; and
- the exact proposal identity.

The runtime computes descriptors and canonical hashes from captured and coordinator-final bytes; callers and model output cannot submit authoritative hashes or gate verdicts. Canonical identity establishes only whether two proposal values are byte-for-byte and structurally identical. The same exact proposal can be recognized deterministically. Byte-different proposals, task scopes, or decompositions are never collapsed into one semantic basis by hashing, labels, normalization, or durable-key equality.

Include exact proposal identity in the existing definition-reconciliation approach evidence. The independent reviewer may supply proposal-bound semantic evidence that two blocker/decomposition descriptions are equivalent or meaningfully different; Feature 009 consumes that evidence under its existing repeat and distinguishing-evidence authority. Cosmetic byte changes create a different exact proposal but do not, by themselves, create distinguishing evidence or authorize another attempt.

### 3. Non-weakening and successor-check proof

Build the proposal from the user-owned intent and complete current definition, never from the desired implementation result. Mapping rows reference exact pre-change obligation anchors and exact post-change anchors and classify the post obligation only as equal or stronger. Deterministic validation requires every pre-change outcome, acceptance, quality, safety, scope, failure, and meaning-of-done anchor to appear exactly once as a mapping source and rejects missing, duplicate, dangling, or unknown references.

The allowed edit policy is closed:

- `plan.md` and canonical `tasks.md` may change when the proposal remains outcome-equivalent.
- `spec.md` may change only for contradiction clarification, relocation or replacement of an accidental execution constraint, or addition of a verified execution assumption.
- User-owned Idea, Open Questions, and Assumptions bytes never change.
- No mapping may claim a weaker or narrower successor.

For a retained check, bind the exact old and new check identity. For a proven-defective literal, preserve its trigger evidence and intended invariant, record why the literal is invalid, and bind one reviewed successor check proving that invariant. Independent review must approve mapping completeness, allowed spec-change class, equal-or-stronger obligations, and every successor check against the exact proposal identity. Ambiguity or a normative change returns `clarification-required` before the atomic helper is entered.

Implement the reviewer input and result as a closed proof capability over the coordinator-final descriptors and mappings. Deterministic code validates closed shape, complete anchors, exact references, mapping completeness, reviewer independence, and exact proposal binding. The reviewer alone judges outcome equivalence; complete and equal-or-stronger obligations; state-preserving task-scope and acceptance-obligation equivalence; decomposition-basis equivalence; intended-invariant and successor-check adequacy; and `dropped-defective` classification and archive mapping when present. A review of the Spec Lead-only stage, a partial task proposal, or different final descriptors is invalid.

### 4. Parsed pre-apply and post-write integrity

Extend `atomic-file-batch.mjs` with definition-specific parsers and validators composed by `applyDefinitionRecovery`:

- Parse current and coordinator-final owner frontmatter and require the same exact defined owner and `spec_path`.
- Parse active managed markers outside fences and require exactly one balanced region.
- Parse exactly one Coordinator Log in that managed region and require the coordinator-final log to preserve every current byte as an exact prefix before appending only complete event lines.
- Reuse complete protected-section extraction and byte comparison for Idea, Open Questions, and Assumptions.
- Parse current and coordinator-final tasks through the existing task parser; require canonical syntax and exact owner breadcrumb.
- Preserve any `## Discovered During Execution` and terminal `## Lightweight Execution History` bytes except coordinator-authorized append-only archive additions represented in the exact final reconciliation.
- Require balanced optional board and managed fences without treating generated board content as canonical task state.

Run these checks first over expected and coordinator-final bytes through the existing synchronous validator path. Validate the complete callback capability before temporary staging: definition recovery accepts only its closed internal synchronous callback form and rejects a declared asynchronous callback before writes. After rename application, the callback rereads all four targets, parses them again, compares exact bytes with final descriptors, re-resolves the exact owner, recomputes proposal identity, and revalidates the independent review identity. It then runs fresh lint and required verification synchronously and binds their evidence to the same applied descriptors. A returned thenable or any thrown structural, identity, lint, or verification failure is a transaction failure and enters reverse rollback; the thenable check is defense in depth after preflight rejection of asynchronous callback forms.

Keep the engine's current process-local all-or-restored boundary and distinct incomplete-rollback error; make no power-loss or crash-consistency claim. Acceptance of the callback completes the definition transaction. It does not rerun semantic review.

### 5. Coordinator-owned reconciliation

The Spec Lead stages canonical task descriptions and semantic durable-key mappings. The coordinator composes the final `tasks.md` bytes and every reconciliation effect represented in the four-path proposal before deterministic validation and review. The coordinator exclusively applies state, metadata, board, archive, discovered-work, execution-history, and reconciliation effects. The atomic helper's reconciliation validator checks the complete composed batch before any rename.

Mapping shape and resulting state rules are deterministic; semantic equivalence comes from the exact-proposal review:

- `kept`: exactly one old task to one new task with the same durable key and reviewer-confirmed unchanged scope and acceptance obligations; its glyph and valid metadata may survive.
- `changed`: one-to-one identity whose scope or acceptance changed; reopen it and remove stale blocker/completion metadata.
- `split` or `merged`: every successor reopens, even if a durable key is reused.
- `dropped-defective`: only in explicit autonomous Lightweight recovery, archive a non-open task without another prompt when exact ownership and byte-unchanged intent hold; trusted evidence proves a definition defect; every obligation and check maps to reviewer-approved equal-or-stronger successors; the reviewer approves defect classification, task-scope/decomposition equivalence, successor checks, and archive mapping; every successor reopens and inherits no state or completion evidence; prior terminal history is byte-preserved; and the append-only archive records prior task identity/state, defect reason, trigger evidence, and successor mapping. Never represent the dropped task as complete.
- `new`: starts open.

Preserve the complete discovered-work section and existing Lightweight execution history. Ambiguity, normative change, missing evidence or successor, failed review, or any `dropped-defective` condition failure pauses for the user before writes. Guarded Work, non-Work, ordinary explicit redefinition, and every other non-open drop retain the existing confirmation pause. Reject incomplete, duplicate, or state-preserving mappings that lack the one-to-one reviewer-confirmed unchanged rule.

### 6. Gate ordering, continuation, and semantic termination

Fresh Inspection and Assessment first establish unchanged intent, exact ownership, trusted eligibility, explicit autonomous Lightweight policy, and the existing action. Once eligible, use this mandatory transaction order without a new command or state machine:

1. The Spec Lead stages only its authorized definition half and semantic mappings.
2. The coordinator composes the exact final four-path bytes, including final canonical tasks and every reconciliation effect represented in those bytes.
3. Deterministic validation checks exact identities, parsed structure, complete anchors and references, mapping shape and completeness, and complete final descriptors. It makes no semantic-equivalence claim.
4. One independent semantic reviewer judges the exact final bytes and mappings for outcome equivalence; complete equal-or-stronger obligations; task-scope and acceptance-obligation equivalence for state preservation; decomposition-basis equivalence; intended-invariant and successor-check adequacy; and `dropped-defective` authority when present.
5. Existing atomic application writes that exact approved four-path proposal.
6. Inside the existing synchronous rollback callback, reread and reparse all four paths, compare exact applied bytes, recompute proposal identity, revalidate review identity, and run fresh lint plus required verification. Any structural, identity, lint, or verification failure throws into reverse rollback of all four paths; incomplete rollback remains a distinct hard failure.
7. After definition acceptance, refresh any optional coordinator-owned derived lane snapshot through the existing lane boundary before resume. Snapshot failure prevents resume and follows that boundary's own all-or-restored semantics; the snapshot is not a fifth definition-recovery path.
8. Resume Work without a second semantic review because the one review already binds the exact final applied proposal.

There is no semantic review of a pre-coordinator partial proposal and no second pre-apply or post-apply semantic review. Post-apply work only revalidates exact review identity. A rejection, semantic ambiguity, normative change, structural or identity fault, lint or verification failure, incomplete rollback, or lane-refresh failure prevents resume under its owning boundary.

For termination, attach reviewer-supplied semantic evidence about blocker and decomposition relationships to the exact proposal, then pass it to Feature 009's existing comparison and permit logic. Feature 009 alone decides whether the same blocker or an equivalent decomposition lacks distinguishing evidence and routes to `no-progress-verified`. A further redefinition requires Feature 009-owned new distinguishing evidence; overall and target budgets remain independent backstops. Do not add a redefinition counter, deterministic semantic normalizer, or separate no-progress rule.

### 7. Concise authority contracts and generated parity

Update only the source authority surfaces that own or directly point to this behavior:

- `src/skills/dude-work/SKILL.md` remains the detailed owner of automatic eligibility, final composition/review/apply ordering, rollback-bound checks, lane-refresh prerequisite, continuation, and Feature 009 termination.
- `src/skills/dude-feature-definition/SKILL.md` remains the detailed owner of Spec Lead staging, protected intent, parsed validation, coordinator reconciliation boundaries, the ordinary non-open-drop pause, and the narrow autonomous-Lightweight `dropped-defective` exception.
- `src/agents/dude.agent.md`, `src/agents/dude-spec-lead.agent.md`, and `src/instructions/dude.instructions.md` receive only the minimum authority or deferral wording required to avoid contradiction.
- `scripts/current-format-contract.test.mjs` pins the concise ownership, single exact-final-proposal review, rollback-bound gate, narrow exception, and tracked-refusal contracts without copying runtime schema details into prompts.

Every task that edits `src/` runs `node scripts/build-dev.mjs` in that same unit before parity-sensitive tests. Never hand-edit `.github/`. Build and contract tests prove source/generated parity, and the release build proves the same contracts ship.

## Test Strategy

### Focused recovery tests

Extend `src/skills/dude-work/recovery.test.mjs` through public inspection, authorization, completion, and learning transitions:

- direct contradiction eligibility with zero retries;
- current no-alternative eligibility;
- viable implementation alternative refusal;
- guarded, non-Work, wrong-owner, ambiguous-owner, stale-evidence, changed-intent, and tracked refusal;
- exact proposal identity and evidence drift, proving byte-different proposals never deterministically collapse into semantic equivalence;
- complete obligation and check mapping shape;
- reviewer capability over coordinator-final descriptors and complete mappings, including task-scope, acceptance-obligation, decomposition-basis, intended-invariant, successor-check, and `dropped-defective` judgments;
- refusal of review bound to a Spec Lead-only stage, pre-reconciliation bytes, or drifted final descriptors;
- exactly one pre-apply semantic review and post-apply identity revalidation without semantic rerun;
- immediate continuation only after rollback-bound `lint` and `verification`, review identity, and applicable lane refresh; and
- Feature 009-owned equivalent-decomposition termination versus genuinely new distinguishing evidence.

### Atomic and structural tests

Extend `src/skills/dude-feature-definition/atomic-file-batch.test.mjs` with table-driven expected/staged/post-write cases for:

- missing, duplicate, reversed, nested, fenced-lookalike, and unbalanced managed markers;
- missing, duplicate, moved, split, truncated, or prefix-altered Coordinator Log;
- wrong or duplicate owner;
- changed protected user-section bytes including line endings and whitespace;
- malformed audit breadcrumb, canonical tasks, board fence, discovered-work section, and execution history;
- legal append-only `dropped-defective` archive additions tied to exact final reconciliation;
- declared asynchronous callback refusal before writes and returned-thenable defense;
- expected-byte drift, mid-rename failure, post-write descriptor drift, proposal/review identity drift, post-write reparse failure, lint failure, and required-verification failure; and
- complete restoration, new-path removal, temporary cleanup, and distinct incomplete-rollback reporting.

### Reconciliation tests

Exercise open and non-open one-to-one unchanged, changed, split, merged, `dropped-defective`, ordinarily dropped, and new task mappings. Prove that state survives only with reviewer-confirmed one-to-one task-scope and acceptance-obligation equivalence; every changed/split/merged/new/dropped successor reopens without inherited state or completion evidence; all FR-020 conditions are required for automatic archival; every other non-open drop pauses before writes; archive records are complete; and discovered work/prior history remain byte-preserved.

### Contract and parity tests

Update current-format contracts for one detailed Work owner, one definition owner, terse coordinator pointers, exact-final composition before one semantic review, deterministic identity limits, rollback-bound lint/verification, the narrow autonomous-only exception with all ordinary pauses preserved, coordinator-only state/snapshot authority, unchanged tracked refusal, and no new action or command. Run `node scripts/build-dev.mjs` before these tests and verify the `.github/` projection is exact.

### Full acceptance

Run focused recovery, exact-review, atomic, reconciliation, lane-boundary, prompt-contract, and build tests; the full discovered suite; workspace lint; compose verification; a pristine release build plus release lint; `.github` diff inspection; and `git diff --check`. Route the same fresh evidence to an independent Tester and Code Reviewer. Acceptance covers all four repaired findings and requires no Feature 009, 013, or 014 package mutation and no new lane, command, store, ledger, transaction engine, objective system, or quality reduction.

## Source And Generated Parity

Authoritative implementation and prompt files live under `src/`. The committed `.github/` core is generated output used by the current workspace. Each source-editing task owns its own `node scripts/build-dev.mjs` run before any test that inspects generated parity, so no task can leave a source-only change that is inert at runtime or makes its own gate unsatisfiable.

## Supporting Artifacts

Only `spec.md`, `plan.md`, and `tasks.md` apply. No research, data model, API contract, schema contract, quickstart, UX checklist, test checklist, or security checklist is created. The feature changes an internal bounded workflow over existing records and files; its closed runtime values and exhaustive test matrix belong in source and tests, not a second definition artifact.

## Complexity Tracking

No guardrail deviation is required. The transient proposal identity binds exact evidence, final bytes, obligation/check mappings, reconciliation, and review identity through the existing action; it proves identity only and is not persisted. A closed semantic review result records judgments already required by policy without creating another workflow authority. The `dropped-defective` branch is one explicit autonomous-only exception, not generic drop authority. Parsed validators and synchronous gates extend the existing atomic composition, the lane snapshot keeps its existing boundary, and Feature 009 remains the only repetition and no-progress owner.

## Phases

- **Phase 1 - Eligibility and exact identity (T001)**: extend the existing action with trusted two-variant eligibility and exact transient proposal identity over coordinator-final descriptors, while proving identity never establishes semantic decomposition equivalence and preserving action class, checks, budgets, and tracked refusal.
- **Phase 2 - Semantic proof capability (T002)**: implement complete mapping validation and one independent-review capability over exact final bytes for outcome, equal-or-stronger obligations, task-scope, acceptance-obligation, decomposition-basis, intended-invariant, successor-check, and `dropped-defective` semantics; orchestration remains for T004.
- **Phase 3 - Parsed integrity and rollback gates (T003)**: add parsed validators, exact applied/review identity revalidation, synchronous callback enforcement, and rollback-bound fresh lint/verification through the existing atomic engine, with exhaustive restoration tests.
- **Phase 4 - Final composition, reconciliation, continuation, and termination (T004)**: compose coordinator-final bytes before review, enforce the closed `dropped-defective` exception and all other pauses, apply the mandatory order, refresh the lane snapshot before resume, and delegate equivalent-decomposition termination to Feature 009.
- **Phase 5 - Authority contracts and parity (T005)**: align concise source prompts and static contracts, including the narrow exception in definition authority, rebuild generated core in-unit, and prove dev/release parity.
- **Phase 6 - Final acceptance (T006)**: validate all four repaired findings and run complete regression plus independent acceptance over the integrated feature.

## Traceability

| Task | Stories | Requirements | Primary proof |
|---|---|---|---|
| T001@656c6967 | US1, US5, US6 | FR-001 through FR-005, FR-012, FR-014, FR-023 through FR-026 | Trusted eligibility, exact-only identity, Feature 009 evidence integration, policy, owner, budget, and tracked fixtures |
| T002@73616665 | US2, US4 | FR-005 through FR-013, FR-018, FR-020 | Complete deterministic mapping shape plus exact-proposal semantic-review capability for every required judgment |
| T003@61746f6d | US3, US5 | FR-009, FR-014 through FR-017, FR-022, FR-025 | Parsed pre/post structure, synchronous callback, exact applied/review identity, lint/verification rollback, and incomplete-rollback fixtures |
| T004@636f6e74 | US4, US5, US6 | FR-012, FR-013, FR-016, FR-018 through FR-026 | Coordinator-final composition, reconciliation and exception matrix, mandatory ordering, lane refresh, and Feature 009 termination |
| T005@61757468 | US1, US3, US4, US6 | FR-001, FR-002, FR-012 through FR-017, FR-020 through FR-026 | Authority contracts, preserved ordinary pause, source/generated parity, and release materialization |
| T006@76726679 | US1 through US6 | FR-001 through FR-026 | Four-finding regression, lint, package verification, and independent acceptance |