# Feature Specification: Autonomous Work Modes

## Purpose

Continuous work today still asks the user to approve routine, recoverable decisions even when numeric budgets are fully uncapped, because removing iteration limits is not the same as granting decision autonomy. A user who wants Dude to keep working must currently choose between stopping for approval at every recoverable checkpoint or having no principled way to continue.

This feature lets a user explicitly opt into a work policy that continues through routine recoverable checkpoints without asking, while every irreducible human checkpoint, verification gate, and independent review remains mandatory. Autonomy is a choice about *when Dude may make a recoverable decision without user approval* — never a relaxation of authority, safety, verification, or review. The existing default experience is preserved exactly, and autonomy is active only when the user selects it.

## User Stories & Testing

### User Story 1 - Choose an explicit work policy (Priority: P1)

A user can keep the current stop-and-ask behavior by default, or explicitly opt into an autonomous policy that continues through routine recoverable checkpoints without asking.

**Independent Test**: Run continuous work with no policy selection, with the `guarded` policy selected explicitly, and with the `autonomous` policy selected explicitly; confirm the no-selection and explicit-`guarded` runs behave identically to current work, the `autonomous` run continues through a routine recoverable checkpoint without asking, and autonomy is never enabled implicitly.

**Acceptance Scenarios**:

1. **Given** no policy is selected, **When** work reaches a routine recoverable checkpoint, **Then** it behaves exactly as current work and does not continue autonomously.
2. **Given** the `autonomous` policy is explicitly selected, **When** work reaches a routine recoverable checkpoint, **Then** it continues to the next guarded attempt without asking the user.
3. **Given** any invocation, **When** no explicit `autonomous` selection is present, **Then** autonomy is off.

### User Story 2 - Preserve every hard stop under autonomy (Priority: P1)

A user trusts that selecting autonomy never crosses an irreducible human checkpoint.

**Independent Test**: Under the `autonomous` policy, exercise each hard-stop category from the settled taxonomy — destructive confirmation; credentials or secrets; spending or external side effects requiring authorization; unavailable external dependency or input; ambiguous ownership or reconciliation; changed or ambiguous user intent; and safety or authority conflict — and confirm each still stops and asks.

**Acceptance Scenarios**:

1. **Given** the `autonomous` policy, **When** work encounters any hard-stop category, **Then** it stops and requests user input exactly as today.
2. **Given** the `autonomous` policy, **When** a recoverable checkpoint and a hard stop both apply, **Then** the hard stop takes precedence and work stops.

### User Story 3 - Learn before repeating an equivalent approach (Priority: P1)

A user is protected from blind retries: when the same approach or rejection repeats, Dude reviews and changes approach rather than immediately stopping or retrying the same thing.

**Independent Test**: Drive a repeated equivalent rejection or approach under autonomy twice — once where a credible, materially different alternative with fresh distinguishing evidence exists, and once where it does not — and confirm the first authorizes the different approach only after a learning review while the second stops as no-progress.

**Acceptance Scenarios**:

1. **Given** a repeated equivalent approach or rejection, **When** another attempt is considered under autonomy, **Then** a learning review runs before any authorization or stop.
2. **Given** the learning review finds a materially different approach and fresh distinguishing evidence, **When** authorization is considered, **Then** the different approach is authorized and still undergoes fresh verification and independent review.
3. **Given** the learning review finds no credible alternative or new distinguishing evidence, **When** authorization is considered, **Then** work stops as no-progress.

### User Story 4 - Receive a concise post-run audit (Priority: P2)

After autonomous work, a user gets a concise summary of what happened without a second place to maintain history.

**Independent Test**: After an autonomous run, confirm the audit lists tasks attempted, completed, skipped, and blocked; each recovery or learning cycle and why it was authorized; files changed; verification and review outcomes; decisions made without user input; and remaining risks or hard stops — and that no new persistent record was created.

**Acceptance Scenarios**:

1. **Given** an autonomous run completes or stops, **When** the audit is produced, **Then** it contains every required field and is concise.
2. **Given** the audit is produced, **When** detailed evidence is needed, **Then** it remains in the existing coordinator log and execution history rather than a new store.

### User Story 5 - Continue disjoint independent ready work after a hard stop (Priority: P2)

Under autonomy, when the current bounded recovery attempt reaches a hard stop, a user still gets forward progress on unrelated ready work without concurrency.

**Independent Test**: With one task blocked at a hard stop and other independent ready tasks available, confirm autonomous work finishes the current authorized bounded recovery attempt first, then continues with disjoint independent ready work when dependencies and change sets are disjoint, revisits the blocked task only when new evidence or a materially different approach exists, and never runs work concurrently.

**Acceptance Scenarios**:

1. **Given** the current authorized recovery attempt reaches a hard stop, **When** independent ready work with disjoint dependencies and change sets exists, **Then** work continues with it sequentially.
2. **Given** a task is blocked, **When** no new evidence or materially different approach exists, **Then** work does not revisit it.

### User Story 6 - Improve against an explicit comparable objective (Priority: P2)

When autonomous work is intended to improve an outcome, a user can ground that work in one optional Progress Objective and trust that only comparable, verified candidates are retained.

**Independent Test**: Exercise autonomous work with no objective, an objective that does not map to the active task, and grounded numeric, ordinal, and subjective objectives. Confirm no objective is inferred from free-form prose; each grounded objective freezes one comparable evaluation contract; only a qualifying candidate that passes every authority, correctness, comparison, and review condition is retained; every other mutated candidate is restored exactly or work stops; contract drift closes the old sequence and requires a newly proven baseline; and comparison and learning history reaches both existing evidence surfaces before bounded transient detail is released or the task completes or blocks.

**Acceptance Scenarios**:

1. **Given** no structured objective is grounded for the active task, **When** autonomous work starts, **Then** it follows the normal no-objective behavior and does not infer an objective from idea, definition, task, or issue prose.
2. **Given** a grounded numeric, ordinal, or subjective objective, **When** a candidate is compared, **Then** the baseline, retained incumbent, evaluator, inputs, environment, conditions, rubric or direction, budget, meaningful-improvement rule, and tie rule remain frozen for that sequence.
3. **Given** a candidate improves the objective, **When** any authority, checkpoint, hard-constraint, comparison, or independent-review condition does not pass, **Then** the candidate is not retained and the incumbent is restored exactly before work continues or stops.
4. **Given** any frozen comparison term changes, **When** a further candidate is considered, **Then** the current sequence becomes incomparable, the incumbent is restored and proven, the old sequence is closed into existing history, and no result is compared across the contract boundary.
5. **Given** an objective comparison or learning review is about to leave bounded transient state, or its task is about to complete or block, **When** work proceeds, **Then** the full bounded event is first projected to both existing current-run evidence and the authoritative lane history without creating another ledger.
6. **Given** the scoped task completes or blocks, **When** autonomous work considers further objective-directed optimization, **Then** the sequence is closed and no post-task optimization occurs unless another scoped task has its own grounded objective.

## Edge Cases

- A repeated identical approach occurs with a credible, materially different alternative available.
- A repeated identical approach occurs with no credible alternative or new distinguishing evidence.
- A hard stop arises in the middle of autonomous work.
- The `guarded` default is selected, or no policy is selected, and behavior must be unchanged.
- Evidence changes between the learning review and the authorization (evidence drift).
- Configured time, cost, token, or attempt budgets are exhausted under autonomy.
- A failed verification or independent review occurs and must never be treated as approval.
- An owning definition contains no structured objective, or contains objectives but none maps uniquely to the active task or tracked issue.
- A structured objective declaration is missing, duplicated, malformed, stale, or bound to a different owner, task, or definition.
- Numeric samples are noisy, exactly tied within tolerance, meaningfully improved, regressed, or between the frozen tolerance and meaningful-improvement threshold.
- Ordinal evaluators use frozen levels or a frozen pairwise rubric; subjective evaluators disagree or return incomparable judgments.
- An equivalent candidate has no predeclared simplicity or risk tie review, or that distinct review does not prefer the candidate.
- A candidate changes protected state, produces an unsupported side effect, times out, crashes, or cannot be restored and proven identical to the retained incumbent.
- The owner, objective source, contract, evaluator, input, environment, condition, rubric, or budget changes during a comparison sequence.
- Bounded comparison or learning references fill while one or both existing history projections are missing or conflicting.
- A task completes or becomes blocked while an objective sequence or learning review is still open.

## Functional Requirements

- **FR-001** (Q2): Dude MUST offer several explicit, opt-in work policies. At minimum it MUST preserve the current behavior as a `guarded` default and add an `autonomous` policy. Autonomy MUST NEVER be enabled implicitly; absent an explicit `autonomous` selection, work behaves as `guarded`.
- **FR-002** (Q1): Under `autonomous`, only routine recoverable checkpoints MAY continue without user approval: repeated reviewer-rejection escalation subject to FR-003 and FR-004, bounded local test-failure repair, unchanged-intent derived-definition repair through the existing guarded transaction, and recoverable tool failures. Every irreducible hard stop MUST remain: destructive confirmation; credentials or secrets; spending or external side effects requiring authorization; unavailable external dependency or input; ambiguous ownership or reconciliation; changed or ambiguous user intent; and safety or authority conflict.
- **FR-003** (Q3): Autonomous work MAY authorize another revision only when the rejection is concrete and actionable within the current task, user intent is unchanged, and the change remains within existing non-destructive authority. Every revision MUST still undergo fresh verification and independent re-review. A repeated or equivalent rejection or approach MUST route through FR-004 before any further authorization.
- **FR-004** (Q4): A repeated equivalent approach or rejection MUST trigger a mandatory learning review — not an immediate stop or blind retry. The review MUST inspect history, completed work, evidence, rejections, and current assumptions; determine why the approach repeats; extract learning; generate credible alternatives; and select a materially different approach with a discriminating check. Work MUST stop as no-progress only when no credible alternative or new distinguishing evidence exists. Configured time, cost, token, and attempt budgets MUST remain policy limits, and normal verification and independent review MUST still follow the alternative attempt.
- **FR-005** (Q5): After autonomous work, Dude MUST produce a concise final audit listing tasks attempted, completed, skipped, and blocked; each recovery or learning cycle and why it was authorized; files changed; verification and review outcomes; decisions made without user input; and remaining risks or hard stops. Detailed evidence MUST remain in the existing coordinator log and execution history.
- **FR-006** (Q6): Autonomous scheduling MUST remain sequential in v1: finish the currently authorized bounded recovery attempt first; on a hard stop, continue with independent ready work only when its dependencies and change sets are disjoint; and revisit a blocked task only when new evidence or a materially different approach exists. No concurrency MAY be added for autonomy.
- **FR-007**: Verification and independent review MUST remain mandatory for every ordinary attempt, revision, and alternative. A failed review MUST remain evidence and MUST NEVER be treated as approval.
- **FR-008**: The feature MUST reuse the existing recovery and learning capability rather than creating a parallel recovery or learning mechanism.
- **FR-009**: The feature MUST NOT create a second persistent audit ledger or any new durable store; the audit MUST be derived from existing transient run state and existing history.
- **FR-010**: The deterministic runtime MUST own budgets, run state, evidence identity, authority checks, comparison rules, retain/discard/incomparable verdicts, and stop detection. Model reasoning MAY perform semantic diagnosis, alternative selection, and judgments constrained by a frozen ordinal or subjective rubric, but those judgments MUST remain evidence and MUST NOT establish authority, gate status, a comparison verdict, task completion, or mutation rights.
- **FR-011** (Q7): A Progress Objective MUST be optional and MUST be grounded by user intent compiled through the owning definition into a structured declaration uniquely mapped to a durable task identity. Runtime work MUST NOT parse arbitrary idea, definition, task, issue, or history prose to invent or recover an objective. No declaration or no unique task match MUST preserve normal no-objective behavior.
- **FR-012** (Q7): Every grounded objective MUST freeze one Evaluation Contract before its first candidate. The contract MUST identify a numeric, ordinal, or subjective objective; its baseline and retained incumbent; evaluator; inputs; environment; comparison conditions; budget; direction, ordered levels, or rubric; meaningful-improvement and equivalence rules; and tie treatment. Numeric comparison MUST use exact values and a fixed noise rule; ordinal comparison MUST use frozen levels or a frozen pairwise rubric; subjective comparison MUST use a frozen comparative rubric. Baseline, incumbent, and candidate observations MUST be successful, contract-bound, and mutually comparable; evaluator disagreement MUST be incomparable.
- **FR-013** (Q7): Before objective-directed mutation, autonomous work MUST establish a bounded candidate change set and a restorable checkpoint owned by the existing execution host. A candidate MAY be retained only when authoritative authorization, checkpoint integrity, every hard correctness and anti-gaming constraint including fresh candidate-bound completion verification, qualifying comparison, and independent readiness review all pass. A non-qualifying, failed, timed-out, crashed, regressed, rejected, or incomparable candidate MUST restore the retained incumbent first; inability to prove exact restoration MUST stop work. Objective evidence MUST NEVER grant authority or complete a task.
- **FR-014** (Q7): Any change to the active owner, objective source, contract, evaluator, input, environment, comparison condition, rubric, or budget MUST make the current comparison incomparable. Intentional change MUST occur only through brainstorm and definition between candidates, close the old sequence into existing history, prove the retained incumbent, and establish a new baseline; results MUST NEVER be compared across contracts.
- **FR-015** (Q5, Q7): Before a complete objective comparison or learning review leaves bounded transient state, before a sequence closes or rebaselines, before its task completes or blocks, and before a controlled invocation ends, a full bounded canonical event MUST be projected to both existing current-run substantive evidence and the exact authoritative lane history and freshly verified on both surfaces. Missing or conflicting projection MUST block release or closure. The feature MUST create no second ledger, MUST close objective work when its scoped task completes or blocks, and MUST perform no post-task optimization without another scoped grounded objective.

## Key Entities

- **Work policy value set**: the explicit, opt-in policies governing autonomy. v1 contains the `guarded` default and the `autonomous` policy; a later custom, budget-tunable policy is out of scope.
- **Learning review**: the mandatory review triggered by a repeated equivalent approach or rejection that extracts learning, generates credible alternatives, and either selects a materially different approach or concludes no-progress.
- **Audit summary**: the concise, user-visible post-run summary of outcomes, authorized recovery and learning cycles, changed files, verification and review results, autonomous decisions, and remaining risks or hard stops.
- **Progress Objective**: an optional externally grounded outcome for one durable task, compiled into the owning definition rather than inferred at runtime from free-form prose.
- **Evaluation Contract**: the frozen comparable terms for one objective sequence, including objective kind, baseline, incumbent, evaluator, inputs, environment, conditions, budget, comparison rule, and tie treatment.
- **Evaluation sequence**: the bounded series of candidate comparisons under one unchanged Evaluation Contract; it ends on task completion or block, contract drift, rebaseline, or controlled invocation end.
- **Candidate checkpoint**: the bounded pre-mutation state and exact candidate change set needed to prove the retained incumbent, evaluate a candidate, or restore exactly after any non-keep outcome.
- **Objective comparison event**: the bounded canonical account of comparable observations, deterministic relation, authoritative conditions, retain-or-restore decision, and projection identities for one candidate.

## Success Criteria

- **SC-001**: In 100% of no-selection and explicit-`guarded` fixtures, observable behavior is identical to current work with no autonomous authorization.
- **SC-002**: In 100% of `autonomous` fixtures exercising any hard-stop category, work stops and asks; no hard stop is ever crossed.
- **SC-003**: In 100% of repeated-equivalent fixtures under autonomy, a learning review runs before any authorization or stop; the run never stops immediately without the review.
- **SC-004**: No repeated-equivalent attempt is authorized without a materially different approach and fresh distinguishing evidence; an equivalent approach is never re-authorized.
- **SC-005**: Every autonomous run's audit contains all required fields and is concise.
- **SC-006**: No autonomous run creates a second persistent ledger or new durable store; all detailed evidence remains in existing history.
- **SC-007**: In 100% of no-declaration, no-match, and uniquely mapped fixtures, work respectively uses no objective, uses no objective, or selects exactly the declared task objective; no fixture derives an objective from free-form prose.
- **SC-008**: In 100% of numeric, ordinal, and subjective comparison fixtures, baseline, incumbent, and candidate observations are successful and share one frozen contract, evaluator, input, environment, condition, rubric, and budget identity; disagreement or any identity mismatch yields incomparable.
- **SC-009**: In 100% of mutated-candidate fixtures, a candidate is retained only after all five required conditions pass and the frozen comparator qualifies it; every non-keep outcome restores the incumbent exactly before continuation, and an unproven restoration stops work.
- **SC-010**: In 100% of owner, objective-source, contract, evaluator, input, environment, condition, rubric, or budget drift fixtures, no cross-boundary comparison or retention occurs; the old sequence is closed, the incumbent is proven, and a new baseline is required.
- **SC-011**: In 100% of comparison and learning-review eviction, sequence-close or rebaseline, task-complete or block, and controlled-end fixtures, byte-equivalent bounded events are freshly verified in both existing evidence surfaces before references or context are released; no second ledger is created.
- **SC-012**: In 100% of task-complete and task-block fixtures, the scoped evaluation sequence closes before the task transition and no objective-directed optimization continues without another scoped grounded objective.

## Assumptions

- At least two explicit opt-in policies exist — the existing `guarded` policy and a new `autonomous` policy. Autonomy is never implicit, and this specification fixes no selection syntax, configuration, or persistence mechanism.
- Under `autonomous`, routine recoverable checkpoints may pass without user input: reviewer-rejection escalation governed by FR-003 and FR-004, bounded local test-failure repair, unchanged-intent derived-definition repair through the existing guarded transaction, and recoverable tool failures.
- Hard stops remain in force and follow the settled taxonomy in FR-002 rather than a separately restated list.
- Review findings remain evidence, a failed review is never approval, and every revision or alternative attempt still requires fresh verification and independent re-review.
- FR-003 is the authorization rule for another revision; FR-004 is the mandatory learning and materially-different-alternative rule for repeated or equivalent approaches or rejections. No-progress applies only when no credible alternative or new distinguishing evidence exists.
- The final audit is concise and user-visible, while detailed evidence remains in the existing coordinator log and execution history rather than a second persistent ledger.
- Scheduling is sequential in v1: finish the authorized bounded recovery attempt, move to disjoint independent ready work if it hard-stops, and revisit the blocked task only with new evidence or a materially different approach.
- The deterministic runtime continues to own budgets, state, and evidence, while model reasoning owns semantic decisions.
- Optional objectives are compiled only during explicit brainstorm and definition. Runtime work reads only the resulting structured declaration and never reinterprets user-controlled prose.
- Objective-directed candidates use the existing execution host's invocation-local recovery capability; they introduce no general transaction system, Git behavior, or durable experiment store.
- Comparison and learning events are retained through the existing current-run and lane-history surfaces before bounded invocation-local references are released.

## Out of Scope

- Implicit or always-on autonomy.
- Any concurrency or parallel execution in v1.
- A second persistent audit ledger or any new durable store.
- Weakening destructive, security, authorization, ownership, reconciliation, or user-intent authority.
- Bypassing verification or independent review, or treating a failed review as approval.
- A later custom, budget-tunable policy beyond `guarded` and `autonomous`.
- Selecting a specific policy-selection syntax, configuration, profile, or persistence mechanism, which is design rather than intent.
- Changing the current in-flight work or bypassing current workflow rules.
- A generic objective language, optimizer platform, durable experiment table, champion manager, or unscoped post-task optimization.
- Inferring objectives from arbitrary prose or changing an Evaluation Contract between candidates without explicit brainstorm and definition.
- Automatic commits, resets, general filesystem transactions, or any objective-based grant of authority or task completion.
