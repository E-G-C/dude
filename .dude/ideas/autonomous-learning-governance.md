---
title: Autonomous Learning Governance
slug: autonomous-learning-governance
status: defined
spec_path: .dude/specs/009-autonomous-learning-governance/spec.md
---

# Idea: Autonomous Learning Governance

## Idea

A serious autonomous-governance violation occurred during explicit autonomous Work. A task received a first rejected review and one recovery revision. The second independent review repeated the same immediate pre-publication finding. Dude then applied the generic rule that a second occurrence of the same finding escalates to the user, blocked the task, and stopped without running the mandatory autonomous learning review.

That outcome violated the accepted Autonomous Work Modes requirements. Under autonomous policy, a repeated equivalent rejection must trigger a learning review before either another attempt is authorized or Work stops. No-progress is allowed only after complete evidence shows that no credible materially different alternative or new distinguishing evidence exists.

The desired outcome is deterministic governance that makes this exact failure impossible, not another advisory reminder. During explicit autonomous Work, mode-specific Work governance owns repeated-rejection disposition. Independent review still supplies grounded findings, while generic reviewer escalation remains authoritative for guarded and non-Work cycles. Runtime-derived repeat evidence must move the target into a mandatory unresolved learning state that seals further attempts, block, close, and controlled-end transitions until the learning review is complete, projected and freshly verified, and any selected alternative has a fresh Inspection.

The accepted scope is one core workflow-governance guarantee spanning authority precedence, deterministic repeat detection, mandatory learning review, no-objective support, sealed lane transitions, audit evidence, public-path tests, fail-closed rollout, and a later evidence-safe correction decision for the current incident. These parts are inseparable: instructions alone cannot guarantee the transition, and runtime enforcement without matching review, projection, audit, and test contracts would remain incomplete.

## Assumptions

- A repeated-finding decision uses a closed, normalized basis derived from independent review evidence. Free-form claims that findings are the same or equivalent do not grant transition authority.
- Deterministic identities establish repeat occurrence, material difference, and binding to a selected alternative. Semantic credibility remains constrained model reasoning over complete fresh evidence.
- First rejections and genuinely distinct later rejections retain ordinary recoverable handling. The mandatory learning state begins only when deterministic evidence establishes repetition under autonomous Work.
- The learning review examines complete fresh task and run history, attempts, evidence, rejection bases, and assumptions; records bounded findings; generates credible alternatives; and either selects a materially different approach with a discriminating check or records an evidence-grounded no-progress conclusion.
- Selecting an alternative does not approve or complete it. A new fresh Inspection, verification, and independent review remain mandatory, and the attempted approach must match the selected alternative and check.
- Learning governance applies whether or not the task has a registered progress objective. No objective sequence is invented solely to host learning evidence, and an existing learning-review event may omit objective-sequence identity while remaining authoritative and verifiable in current-run and lane history.
- Existing Work recovery, evidence, projection, reviewer, lane, and audit authorities can carry this guarantee. No parallel learning mechanism, second persistent ledger, new lane, external service, generic workflow framework, or new user-facing command is needed.
- Lightweight and tracked Work mutations both require deterministic transition evidence that cannot be bypassed through direct block, close, attempt, or controlled-end mutation. Ordinary manual, guarded, and non-Work authority remains unchanged.
- The autonomous final audit is derived from freshly verified authoritative history rather than caller-authored cycle prose. It reports learning-review requirement and resolution, repeat identity, event and projection status, selected approach and check or no-progress reason, and exact stop disposition.
- Public recovery command and CLI tests must prove the ordered transition end to end. Helper-only event tests do not establish the governance guarantee.
- Rollout is fail-closed: repeated rejection first becomes learning-required and block or end transitions refuse before continuation through a selected alternative is enabled.
- The current Feature 007 blocker is semantically wrong because repeated review is internal autonomous governance, not an external dependency requiring a user decision. This brainstorm does not repair it. A later explicit definition must choose an evidence-safe correction that preserves history, appends a superseding event, and returns T001 to in-progress learning-required only when exact review evidence exists; otherwise it records evidence-incomplete.
- Existing destructive, security, credential, spending, ownership, intent, fresh-verification, and independent-review hard stops remain intact. Execution stays sequential in v1, with no automatic commit and no post-task optimization.

<!-- dude:managed:start -->
## Normalized Intent

- Make autonomous Work the detailed operational authority for repeated-rejection disposition while preserving generic reviewer authority for grounded findings and for guarded or non-Work review cycles.
- Keep coordinator and shared instructions concise by pointing to Work precedence rather than duplicating the full autonomous policy.
- Derive repeat and occurrence identities deterministically from a normalized closed basis of independent review evidence; do not accept free-form equivalence claims as transition authority.
- On a repeated finding under autonomous policy, enter a mandatory unresolved learning state before any further authorization, no-progress conclusion, user escalation, task block, task close, or controlled Work end.
- Require the learning review to inspect complete fresh history, attempts, evidence, rejection bases, and assumptions; record bounded findings; generate credible alternatives; and either bind a materially different approach to a discriminating check or mechanically record why no credible alternative or new distinguishing evidence exists.
- Require a fresh post-learning Inspection, verification, and independent review for any selected alternative, and refuse an attempt that does not match the selected approach and check.
- Apply learning governance at task boundaries with or without a progress-objective entry. Do not invent an objective sequence for learning, and require the learning event to project to and verify against both current-run and authoritative lane history.
- Seal autonomous attempt, block, and close transitions while learning or projection is unresolved; permit Controlled Unresolved End only after fresh dual projection and either a selected alternative's fresh post-learning Inspection or fresh no-progress verification, before the corresponding attempt permit or lane no-progress disposition.
- Require deterministic transition evidence for Work-originated Lightweight and tracked mutations so direct mutation cannot bypass autonomous governance, while preserving manual, guarded, and non-Work authority boundaries.
- Extend the autonomous final audit with freshly derived learning-review, repeat, projection, selected-alternative or no-progress, and exact stop-disposition evidence without creating another store.
- Prove the guarantee through public recovery command and CLI paths across first, repeated-equivalent, and distinct rejections; credible-alternative and no-alternative outcomes; stale Inspection; missing, partial, or conflicting projection; selected-approach mismatch; block and end refusal; guarded compatibility; objective and no-objective tasks; and Lightweight and tracked transitions.
- Add static authority and documentation contracts that keep autonomous Work precedence above generic second-failure escalation and keep public guidance aligned.
- Roll out fail-closed by enforcing learning-required and block or end refusal before enabling continuation through a selected alternative. Keep guarded behavior unchanged.
- Defer the current Feature 007 incident correction to explicit definition, where the procedure must preserve history, append a superseding event, and distinguish exact-evidence recovery from evidence-incomplete recovery.
- Treat instruction precedence, runtime enforcement, transition sealing, audit, and tests as one core workflow-governance feature.

## Constraints

- This artifact is brainstorm intake only. Do not create or modify any `.dude/specs/` package.
- Do not begin implementation, select implementation phases, or freeze exact field names, command names, schema versions, fingerprints, transition-permit shapes, or other low-level mechanics.
- Do not alter Feature 005, Feature 007 or its T001 blocker or log, Feature 008, task state, runtime code, instructions, docs, or any other idea during brainstorm.
- Do not repair or supersede the current incident blocker during brainstorm; its evidence-safe correction procedure belongs to later explicit definition.
- Reuse current Work recovery, evidence, projection, reviewer, lane, and audit authorities. Do not add a parallel learning mechanism, second ledger or store, lane, external service, generic workflow framework, or new user-facing command.
- Preserve destructive, security, credential, spending, ownership, and changed-intent hard stops; fresh verification and independent review; sequential v1 execution; no automatic commits; and no post-task optimization.
- Keep the feature in core workflow governance rather than routing it as a technical-documentation implementation.

## Definition Checklist

- [x] Governance outcome is settled and coherent for brainstorm
- [x] Scope is bounded to one inseparable workflow-governance feature
- [x] No user decision or open question blocks later explicit definition

## Coordinator Log

- 2026-07-22 UTC - brainstorm captured
- 2026-07-22 UTC - defined -> .dude/specs/009-autonomous-learning-governance/spec.md
- 2026-07-23 11:16 UTC - blocked T001@7365616c as external-dependency after pre-start Inspection a67034564f512daf68fbfdde352a17a41876da6d7420cec9ff66caab9c88be94: Feature008 baseline preflight found existing unrelated changes under `src/**` and base-owned generated core plus source/generated parity drift at `.github/agents/dude.agent.md`; no Feature009 source mutation or baseline event was permitted
- 2026-07-23 11:16 UTC - regenerated the derived Lightweight board after blocking T001@7365616c (1 blocked, 8 todo, 0 ready)
- 2026-07-23 11:16 UTC - Work iteration 1/3 stopped: task blocked by external-dependency; resume requires a clean source/generated boundary or a user-approved isolated worktree
- 2026-07-23 11:18 UTC - post-block Inspection 3c4255c03483f3109ee22752eacc96b5fdea327ecd26efc7dccde3d4b03bc3e5 confirmed T001@7365616c remains unchanged and blocked, Dude lint passed with 0 warnings and 0 failures, no task is ready, and guarded Work authorizes no recovery
<!-- dude:managed:end -->
