---
name: "dude-work"
description: "Use for @dude work continuous execution inside the active Lightweight or Tracked lane until a named natural stop."
---

# Continuous Work

`@dude work` is an execution accelerator, not a new workflow lane. It repeats ready work inside the lane detected at start and never bypasses that lane's close protocol.

## Grammar And Limits

```text
@dude work [<feature>] [--max <N|unlimited>] [--until blocked] [--parallel <N>] [--recover-on-block] [--recovery-cycles <N|unlimited>] [--policy guarded|autonomous]
```

Parse the complete invocation with `recovery.mjs` before any claim or mutation; it owns the exact grammar, value validation, and incompatible combinations. Accept at most one feature selector and only before flags. It disambiguates Lightweight work; Tracked Execution ignores it. `--max`: Default `3`, Hard floor `1`, soft ceiling `25` for warnings; `unlimited` removes only the numeric cap. `--until blocked` implies `25` only when max is omitted. Recovery defaults to one cycle but is disabled unless `--recover-on-block` is present. `--policy` defaults to `guarded`; `autonomous` is explicit opt-in and relaxes no hard stop, budget, verification, review, owner, evidence, lane, or close rule.

`--parallel <N>` is compatibility-only. Accept every positive ASCII safe integer, normalize effective `policy.parallel` and capacity to `1`, discard the requested value, and grant no concurrent recovery authorization. Reject zero, signed, unsafe, non-ASCII, `unlimited`, symbolic, missing, malformed, or duplicate `--parallel` values before mutation. Refuse every other invalid invocation, including recovery cycles without recovery opt-in, before mutation.

## Detect The Lane Once

1. If `bd list --all --limit 0 --json` returns any imported issue, use Tracked Execution. Resume executable in-progress work, otherwise use `bd ready --json`. `no ready Beads work` stops; do not fall through to Lightweight.
2. Otherwise use the named Lightweight feature with non-done canonical tasks, or the only unambiguous defined feature with such tasks. Multiple candidates are `ambiguous state`.
3. If neither lane is live, refuse and point to explicit `define` or `track`. Work never imports a feature or invents a lane.

Lane drift during the loop is `ambiguous state`; restart Work to redetect.

## Canonical Mutation Gate

For either lane, require exactly one `status: defined` owner by exact `spec_path:` from the sibling spec or tracked issue `spec:` identity. Any resolver diagnostic, no owner, or multiple owners stops before mutation. Never infer or fall back from slug, directory, or name.

After the canonical ownership gate passes but before the first claim, apply any deferred manual-completion reconciliation through the active lane. The unique owner is the only append-only coordinator log; it is audit context, not a second board.

## Inspection And Recovery

1. Before every task start or resume, after every block or failure, and on explicit inspection, use `recovery.mjs` to acquire all available supported current-format evidence exactly bound to the canonical task and feature. A feature-only inspection is a read-only report: do not authorize work, consume counters, or mutate state. Unavailable optional session history alone is nonblocking.
2. Treat each Inspection as one immutable evidence capture. Admit only the runtime's one complete model packet and obtain one schema-bound model Assessment carrying that Inspection's `evidenceHash`. Overflow produces a descriptor-only report, no model call, and no recovery; never truncate, split, or batch evidence. Scripts remain deterministic and make no model calls.
3. Authorization through `authorizeAttempt` freshly rebuilds one immutable Inspection from authoritative captures. If the Assessment `evidenceHash` differs, return `evidence-drift` with unchanged state, counters, pending entries, and completed tuples.
4. Ordinary work performs the post-block inspection, reports it, and stops. Only `--recover-on-block` permits recovery. `authorizeAttempt` alone charges each authorization once, and `completeAttempt` alone validates the stored action's concrete result. Recovery permits at most one pending authorization per invocation; never allow concurrent pending authorizations and never grant fan-out authority. Independent overall and exact-target recovery budgets remain in force, and `unlimited` removes only its numeric cap without bypassing hard blockers or no-progress stops. Completion or interruption clears only the exact pending authorization without refund; fresh verification or lint failure and review rejection stop completion and become evidence for a later inspection. Historical test, lint, or review failures may support their matching repair action. Missing or lost transient run state stops.
5. Keep the hardcoded action check sets: `execute-task` and `retry-task` require `verification`; `address-test` requires `lint` and `verification`; `address-review` requires `review` and `verification`; `reconcile-derived-definition` requires `lint`, `review`, and `verification`; `retain-learning` requires `lint`; action `none` requires no checks.
6. At the CLI boundary, every byte field uses canonical base64 `{base64}` with standard padded RFC 4648 encoding and decode/re-encode equality. Captured current-run, review, verification, and lint records use the exact closed `{substantive,presentation?}` envelope. Presentation exclusion is shallow, top-level, non-recursive, and source-specific; preserve every nested substantive field, including `id` and `summary`, as hash-significant.
7. Route every authorization through its existing execution, testing, review, definition, or retention owner. Runtime unchanged-intent Lightweight definition recovery has an exact four-path scope: one exact owner idea ledger plus its sibling `spec.md`, `plan.md`, and `tasks.md`, and no other path. The Spec Lead stages definition changes, the coordinator owns reconciliation and execution-state changes, and `dude-feature-definition/atomic-file-batch.mjs` applies the guarded all-or-restored batch before fresh verification, lint, and review. Independently byte-compare and preserve the complete `## Idea`, `## Open Questions`, and `## Assumptions` sections unchanged. Exclude `contracts/schemas.md`; only explicit definition may update it. Tracked definition recovery is unsupported: refuse it only after a fresh Inspection and Assessment validation, but before any helper or write path. Changed or ambiguous user intent escalates for clarification and explicit definition instead of recovery.
8. Report inspected evidence, diagnosis, action, result or stop reason, and the next permitted action. Keep findings transient by default. Durable retention requires the memory or skill owner to freshly inspect current artifacts, duplicates, destinations, and overlaps; caller or model assertions cannot establish their absence, ownership, or write authority. Route project-reusable proposals through `dude-memory-ledger` and broad recurring proposals through `dude-learning-promotion` and `dude-skill-authoring`, never as an automatic durable write.

## Autonomous Learning Governance

This section is the sole detailed owner of repeat-triggered learning governance under explicit `autonomous` Work. Every other prompt surface carries only authority, deferral, evidence, and wrapper-use pointers. Guarded and non-Work states never enter this policy, never carry its fields, and retain their existing result, escalation, review, and close behavior. Governance creates no lane, no persistent store, no second ledger, and no user-facing command; the runtime reaches it only through the existing `inspect`, `authorize`, `complete`, `learn`, `transition`, and `audit` routes.

A deterministically repeated normalized completion result, retained result pair, or exact normalized approach is not an ordinary no-progress outcome. Retention comes first: hold the second unadmitted completion in the single hash-only `pendingCompletion` slot when applicable, bind one exact affected target in `learningGovernance` at `required`, and return `learning-required` before the completion is admitted as a task result. Never overwrite either slot: an occupied `learningGovernance` singleton fails closed as `learning-governance-conflict` and a conflicting `pendingCompletion` slot as `occurrence-retention-conflict`, while `learning-governance-capacity` stays reserved for derivable failed-approach-set excess alone. Free-form `same` or `equivalent` claims cannot create governance and fail closed as incomplete evidence.

Only trusted source evidence establishes a repeat. Verification and independent-review captures arrive through the existing Inspection source mechanism; a caller cannot submit one as an envelope body, and a stale, partial, duplicate, conflicting, wrong-target, or wrong-authority capture rejects. Finding equivalence uses the normalized basis — target, expected condition or governing rule, affected subject, failure class, and check definition — while each occurrence separately binds one reviewed attempt, its review evidence, its observed result, and its chronology. Equal bases across two distinct valid occurrences establish a repeat; equal full occurrence identities do not. A runtime-derived approach repeat follows the same rule and requires no reviewer finding.

While the requirement is unresolved, refuse another attempt on the affected target and refuse generic escalation, no-progress, ordinary block, close, resolving status, task-boundary settlement, and ordinary controlled end before projection or mutation. Preserve the normalized result and its prior/current evidence and approach identities for later authoritative retention. This initial seal authorizes no selected alternative, learning resolution, target mutation, or controlled end.

Retention and projection travel as one bounded batch of at most 17 events; a normal completion batch carries exactly one approach event and zero through sixteen finding events. Project that same batch into existing current-run evidence and the exact authoritative lane history, then freshly reacquire and verify both surfaces. A missing, one-sided, stale, duplicate, wrong-target, or conflicting projection leaves governance unresolved and blocks every attempt, revisit, ordinary target disposition, and release of the evidence.

A learning review reads complete fresh task, run, attempt, approach, verification, review, lane-history, and assumption evidence, and compares each candidate alternative against the complete failed-approach set for that target and channel rather than the most recent attempt alone. Deterministic identity establishes material difference and binds the selected alternative to its discriminating check; model reasoning may judge only credibility inside that bounded evidence, and a disguised repetition is never materially different. When no credible alternative and no new distinguishing evidence exist, the complete no-alternative conclusion is projected, freshly verified, and re-inspected before `no-progress-verified`.

Permit order is fixed and acyclic, and no route returns to an earlier phase. `learn` records the learning result. `transition prepare-projection` then `transition verify-projection` retain and verify it. The selected-alternative branch then runs `transition bind-post-learning-inspection`; the no-progress branch runs `transition verify-no-progress`. Only afterwards may `transition issue-attempt-permit`, `transition issue-lane-permit`, and `transition commit-lane-receipt` run in that order, or `transition controlled-end` close the branch. Phase `projected` issues no permit and no controlled end.

Every Work-originated lane mutation passes through the active lane's own Work boundary with its exact permit and receipt. Autonomous Work never mutates a lane through that lane's ordinary CLI or a direct edit, and a caller-authored authorization, verdict, projection, receipt, or audit claim is not authority. Lightweight and tracked targets are governed identically; an absent or ambiguous tracked mapping fails closed, and ambiguous lane or ownership authority stops the invocation.

Irreducible hard stops and exhausted budgets keep immediate precedence at their authoritative scope. A target-scoped hard stop or an exhausted per-target recovery budget halts or restricts that target alone, leaves it unresolved, and consumes no unrelated scheduling authority. A run-wide security, safety, authority, credential, destructive-confirmation, spending, or external-authorization issue, ambiguous lane or ownership, or an exhausted overall budget stops the invocation. No halt clears, resolves, or reclassifies the requirement, and no halt creates controlled-end authority.

Scheduling stays sequential. The affected target may be suspended unchanged, and Work may move to one other ready target only when the existing dependency and change-set rules prove the two disjoint and independent. An unchanged suspension is a scheduler action, not a target disposition, and it is never a block, close, no-progress, or learning resolution. No concurrent, simultaneous, or fanned-out work is authorized at any point, and several eligible disjoint targets still run one at a time. The affected target is never revisited without resumed governance, new distinguishing evidence, or a materially different alternative.

`transition controlled-end` is available only from `alternative-inspected`, after fresh post-learning Inspection and before attempt-permit issuance, or from `no-progress-verified`, after fresh no-new-distinguishing-evidence verification and before the lane no-progress disposition. It resolves the governance branch for audit while the target's lane disposition stays pending and unchanged; it authorizes no attempt and applies no no-progress. An invocation that a hard stop or overall-budget exhaustion ends before that eligibility exists is an immediate halt end and creates no controlled-end permit, mutation, record, or receipt.

`transition resume-governance` restores or deterministically re-derives the requirement before any normal transition on the affected target. Where projection was impossible, the exact captured basis, occurrence, evidence, and chronology already in existing history remain authoritative and sufficient for that re-derivation. If governance is neither safely retained nor deterministically re-derivable, stop without releasing the required evidence.

`audit` reads existing current-run and authoritative lane history and never a second store. It always reports the affected target, the learning requirement, the triggering repeat relationship and its channel, the current governance status, the exact target disposition, and the exact invocation outcome. The remaining detail is conditional: a resolved alternative adds verified projection, the selected alternative and check, and the post-learning Inspection, verification, and review outcomes; a resolved no-progress adds verified projection and the complete no-alternative proof; an unresolved suspension, scoped halt, budget outcome, or immediate halt end adds the unresolved reason, scope, scheduling outcome, and exact projection or re-derivation status; a controlled end reports the branch resolved, the lane disposition pending, and the target unchanged. No audit claims target completion, an ordinary block, a close, an attempted alternative, or an applied no-progress that did not occur.

A progress objective changes none of this. Learning governance runs identically with no objective, no uniquely matching objective, or a valid matching objective, and never invents an objective, sequence, or identity to carry its evidence.

## Objective Evaluation And Projection

`recovery.mjs` owns the optional autonomous objective flow. Guarded work never opens it, and objective evidence never authorizes an effect, mutates task state, satisfies a lane close, or completes a task. Under `autonomous`, an explicit plan `ObjectiveRegistry` compiles one frozen `EvaluationContract` per selected `RunState` task; no registry or no selected entry follows ordinary no-objective behavior with no sequence, event, or projection.

Each candidate is bounded by a `CandidateWriteSet` — candidate paths may change, protected paths stay byte-identical — captured through the injected checkpoint host: acquire the prestate, capture the candidate poststate, and never release a pending or unsettled context. Exactly five derived gates decide retention in fixed order: `authorization`, `checkpoint`, `hard-constraints` (always including the mandatory `candidate-bound-completion` verification), `comparison`, and `independent-review`. Callers and model output cannot submit any gate status, result, verdict, relation, or `ComparisonDecision`; each gate is normalized only from fresh authority evidence. Numeric, ordinal-level, and pairwise/subjective comparators derive `better`, `equivalent`, `worse`, or `incomparable` with exact scaled integers and no floating point. Keep requires all five gates to pass and a qualifying relation (`better`, or `equivalent` only under a predeclared passing tie review); every other outcome restores the exact prestate first. A restore or release fault is `stop-unsettled`: retain the context and identities and hard stop without release.

Every complete comparison, learning review, and sequence closure projects one bounded event (`ObjectiveComparisonEvent`, `LearningReviewEvent`, `EvaluationSequenceClosedEvent`), each at most 16,384 canonical UTF-8 bytes and carrying identities and bounded findings only. Projection is exact and dual through the injected owner: one current-run capture record whose substantive payload is `{substantive:{event}}`, plus one lane line `- dude-run-event: ` immediately followed by `CJ({event})`. Fresh dual-surface verification reacquires both surfaces and requires exactly one byte-equivalent event with a valid recomputed `eventHash` and matching target on each; a missing, duplicate-conflicting, wrong-target, malformed, or hash-mismatched projection blocks reference eviction, sequence close or rebaseline, task close or block, and controlled end. A `ProjectionReference` is admitted only after that verification, so pressure never drops an unprojected comparison.

`RunState` retains only bounded references: at most eight comparison references per sequence, 64 across all sequences, and 16 learning-review references. Reaching any bound re-verifies the oldest reference's projection before eviction. Task completion or block first settles the active candidate, projects every pending comparison and learning review, projects one close event with the matching reason, and freshly verifies both surfaces before the coordinator's lane transition; this runtime never invokes that transition and permits no post-task optimization — the sequence row is removed with no continuation. After any learning review, authorization rebuilds one complete fresh Inspection and never reuses the review's earlier evidence identity. Existing current-run and lane history hold the full events, so no second ledger is created; the deterministic audit renderer reads bounded references plus freshly acquired history and writes no file.

## Iterate

For Lightweight, use `dude-lightweight-execution` to select, claim, block, close, render, log, and lint each task. For Tracked, use the installed tracked-execution skill to resume or select, claim, block, close, mirror, log, and lint. Route every implementation through `dude-generic-routing`; use `dude-verification-before-completion` and independent review as required by the lane.

## Stops

Stop on the first natural boundary and report partial results, exact reason, and next action:

- `no ready task`
- `no ready Beads work`
- `task blocked: <classification>`
- `verification failed on <task-id>`
- `reviewer rejected <task-id>`
- `clarification required: <detail>`
- `two failed attempts on <task-id>`
- `ambiguous state: <detail>`
- `tool error: <detail>`
- `iteration limit reached (<N>)`

Never silently retry a failed iteration.

## Boundaries

- Work is not a lane and never imports a feature.
- Do not edit user intent or definition artifacts in ordinary work. Only authorized unchanged-intent derived definition recovery may use the guarded route above; return intent changes to the idea and explicit `define`.
- Never create new state, a lane, or a board; reuse canonical lane state and the unique owner log.
- No auto-commit, push, or other VCS mutation.
- Never bypass verification, independent review when required, or coordinator-only state and close authority.

## Report

Use the active lane banner and coordinator `Action / Updated / Next / Blockers` shape. Report each iteration, verification/close result, stopped reason when applicable, warnings for limits above soft ceilings, and the next executable action.
