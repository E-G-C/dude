# Feature Specification: Autonomous Learning Governance

## Purpose

Feature 005 establishes that repeated equivalent rejection or a repeated equivalent approach during explicit autonomous Work requires learning before another attempt is authorized or Work receives an ordinary stop disposition. The current Feature 007 incident demonstrated that generic repeated-rejection escalation can bypass that requirement by blocking a task and ending Work before learning occurs.

This feature makes the required ordering enforceable through two independent trigger channels. Independent review remains authoritative for grounded findings. Runtime-derived approach evidence may independently establish a repeated equivalent approach without a repeated reviewer finding. Neither channel accepts free-form claims of sameness or equivalence as authority.

Finding equivalence and finding occurrence are separate. A stable normalized finding-equivalence basis excludes identities and evidence specific to an individual attempt or occurrence and includes the target, expected condition or governing rule, affected subject, failure class, and check definition. Each Finding Occurrence separately binds that basis identity to one reviewed attempt, its review evidence, its observed evidence or check result, and its chronology. A finding repeat exists only when two or more distinct valid occurrences have equal basis identities, not when their full occurrence identities are equal. Missing basis or occurrence evidence fails closed.

A repeated finding or repeated approach creates an unresolved learning requirement bound to the affected target. It seals another attempt on that target and any generic escalation, no-progress result, ordinary block, close, or status transition that would resolve the target or leave it in an ordinary terminal or blocked disposition without governance. It does not independently freeze run scheduling, transfer authority to another target, or prohibit an unchanged suspension of the affected target.

The Work scheduler may suspend the affected target unchanged and move sequentially to another ready target only when Feature 005's existing dependency and change-set rules prove the targets disjoint and independent. The affected target remains unresolved and may not be revisited without resumed learning, new distinguishing evidence, or a materially different alternative. No concurrent work is authorized.

Irreducible hard stops and budget exhaustion retain immediate precedence but have explicit scope. A target-scoped hard stop or exhausted per-target recovery budget halts or restricts work on that target without consuming otherwise valid scheduling authority for eligible disjoint work. Run-wide security, safety, authority, credential, destructive-confirmation, spending, or external-authorization issues, ambiguous lane or ownership, and exhausted overall budgets stop the invocation. No halt clears, resolves, or reclassifies the affected learning requirement.

Existing current-run evidence and authoritative lane history retain the bounded unresolved governance event before unchanged suspension whenever activity can safely project it. A target-scoped halt or exhausted per-target recovery budget may permit unchanged suspension and eligible sequential disjoint scheduling under Feature 005, including when exact captured repeat evidence must support deterministic re-derivation, but it does not make Controlled Unresolved End eligible.

Controlled Unresolved End is an ordinary lane-disposition deferral transition available only after branch-specific fresh evidence. A selected-alternative branch is eligible from `alternative-inspected`, after fresh post-learning Inspection and before attempt-permit issuance. A no-progress branch is eligible from `no-progress-verified`, after fresh no-new-distinguishing-evidence verification and before its lane no-progress disposition. Phase `projected` is not eligible. The governance branch is resolved for audit, while the target's lane disposition remains pending and unchanged; “unresolved” refers only to that unapplied lane disposition. The transition neither authorizes an attempt nor applies a no-progress lane mutation.

If an immediate hard stop or overall-budget cessation ends the invocation before either branch-specific eligibility exists, the outcome is Immediate Halt End. It creates no controlled-end permit, mutation, record, or receipt, preserves exact retained or re-derivable governance evidence, and is audited unresolved.

The feature preserves guarded and non-Work behavior, all existing hard stops, fresh verification, independent review, Lightweight and tracked lane authority, Feature 005's exact sequential disjoint scheduling rules, and existing history surfaces. It introduces no new user-facing command, execution lane, persistent store, concurrency behavior, or parallel learning mechanism.

## User Stories & Testing

### User Story 1 - Require learning before ordinary authorization or disposition (Priority: P1)

As a user of autonomous Work, I want repeated equivalent findings and approaches to trigger mandatory learning so that Work neither retries blindly nor resolves the affected target prematurely.

**Independent Test**: Exercise first, distinct, repeated-equivalent finding, repeated-approach-only, target-scoped hard-stop, run-wide hard-stop, per-target budget, and overall-budget cases. Verify that both repeat channels establish the same affected-target learning requirement, ordinary transitions on that target remain sealed, target-scoped halts preserve eligible sequential scheduling, and run-wide halts stop the invocation.

**Acceptance Scenarios**:

1. **Given** a first valid grounded finding occurrence, **When** autonomous Work handles it, **Then** ordinary recoverable handling remains available without treating it as a repeat.
2. **Given** a later valid finding occurrence with a distinct normalized basis, **When** its occurrence is derived, **Then** it remains distinct even if its wording resembles an earlier finding.
3. **Given** two or more distinct valid finding occurrences with equal normalized basis identities, **When** repetition is established, **Then** an unresolved learning requirement begins before another attempt, generic repeated-finding escalation, user escalation as an ordinary disposition, no-progress, ordinary task block, task close, or another status transition that would resolve or ordinarily dispose the affected target.
4. **Given** two or more distinct valid runtime-derived approach occurrences with equal normalized approach bases and no repeated reviewer finding, **When** approach repetition is established, **Then** the same affected-target learning requirement and transition sealing apply.
5. **Given** an unresolved learning requirement and no immediate halt condition, **When** Work considers another attempt or an ordinary resolving, blocked, terminal, or no-progress disposition for the affected target, **Then** required learning governance completes before that outcome is authorized.
6. **Given** valid repeat evidence and a target-scoped irreducible hard stop, **When** the conditions coexist, **Then** work on the affected target halts immediately, the target remains unresolved, and the scheduler may suspend it unchanged and continue only with an eligible disjoint target under Feature 005.
7. **Given** valid repeat evidence and an exhausted per-target recovery budget, **When** no further recovery is authorized for that target, **Then** the target remains unresolved and restricted while unrelated scheduling authority remains unchanged.
8. **Given** valid repeat evidence and a run-wide hard stop, **When** the stop arises, **Then** the invocation stops immediately with the affected target unresolved.
9. **Given** valid repeat evidence and an exhausted overall budget, **When** the budget is exhausted, **Then** the invocation stops immediately and later resumption must restore or re-derive the affected-target governance before any normal transition on that target.

### User Story 2 - Continue only through a materially different alternative (Priority: P1)

As a user, I want autonomous recovery to select a credible materially different alternative, or stop as no-progress only after complete learning proves that none exists.

**Independent Test**: Exercise finding-triggered and approach-only learning reviews with no credible alternatives, one credible alternative, and several credible alternatives; verify bounded selection, material difference, discriminating evidence, post-learning Inspection, fresh verification, and independent review.

**Acceptance Scenarios**:

1. **Given** one credible materially different alternative, **When** learning resolves, **Then** that alternative is bound to a discriminating check before continuation is considered.
2. **Given** several credible alternatives, **When** learning resolves, **Then** one bounded alternative is selected from complete evidence with its material difference and discriminating check established.
3. **Given** an approach that only disguises the repeated approach, **When** its normalized basis is evaluated, **Then** it is not accepted as materially different.
4. **Given** a selected alternative, **When** continuation is considered, **Then** a fresh post-learning Inspection binds the proposed attempt to that alternative and check, followed by fresh verification and independent review.
5. **Given** no credible materially different alternative and no new distinguishing evidence, **When** the complete learning result has been projected and freshly verified and a fresh post-projection Inspection proves no new distinguishing evidence, **Then** governance reaches `no-progress-verified` and only then may the lane no-progress disposition occur.
6. **Given** learning was triggered solely by repeated runtime-derived approaches, **When** alternatives are evaluated, **Then** the same selected-alternative and no-progress rules apply without requiring a reviewer finding.

### User Story 3 - Seal affected-target transitions without freezing eligible scheduling (Priority: P1)

As a user, I want unresolved learning governance to remain unavoidable on its affected target without preventing Feature 005 from scheduling proven disjoint work sequentially.

**Independent Test**: Through Lightweight and tracked Work, attempt another revision, ordinary block, close, resolving status transition, direct mutation, unchanged suspension, eligible and ineligible disjoint scheduling, and revisit while learning is unresolved. Verify that affected-target transitions are refused, eligible disjoint continuation remains sequential, and no suspension or halt is misclassified as target resolution.

**Acceptance Scenarios**:

1. **Given** unresolved learning, **When** Lightweight Work requests another attempt, ordinary block, close, no-progress, or status transition that would resolve or ordinarily dispose the affected target, **Then** the transition is refused.
2. **Given** unresolved learning, **When** tracked Work requests the same transitions for an exactly mapped affected target, **Then** the transition is refused.
3. **Given** a missing or ambiguous tracked mapping, **When** affected-target transition authorization is requested, **Then** authorization fails closed; if lane or ownership authority is ambiguous, the invocation stops.
4. **Given** a direct lane-mutation attempt without current affected-target governance authorization, **When** the lane evaluates it, **Then** no mutation occurs.
5. **Given** unresolved learning and another ready target whose dependencies and change set are proven disjoint, **When** Feature 005 permits sequential continuation, **Then** the affected target may be suspended unchanged and Work may move to the other target without treating the handoff as block, close, no-progress, or learning resolution.
6. **Given** sealed affected-target transitions and a halt or budget boundary, **When** the boundary applies, **Then** it authorizes no sealed mutation or revisit; a target-scoped halt or per-target budget may leave eligible disjoint scheduling available, while a run-wide halt or overall-budget exhaustion stops the invocation.

### User Story 4 - Preserve reviewer, guarded, and scoped halt behavior (Priority: P1)

As a guarded or non-Work user, I want existing rejection and escalation behavior to remain unchanged, and as an autonomous Work user I want every halt to retain its existing authority and correct target or run scope.

**Independent Test**: Compare guarded and non-Work review behavior with the accepted baseline, then exercise autonomous repeats with target-scoped hard stops, run-wide hard stops, per-target recovery-budget exhaustion, and overall-budget exhaustion.

**Acceptance Scenarios**:

1. **Given** guarded or non-Work review, **When** a finding repeats, **Then** the generic reviewer protocol retains its existing disposition behavior.
2. **Given** explicit autonomous Work, **When** independent review produces a repeated finding, **Then** the reviewer supplies the grounded finding and defers ordinary disposition to autonomous Work governance.
3. **Given** unresolved learning and an irreducible hard stop authoritatively scoped only to the affected target, **When** the stop arises, **Then** work on that target halts immediately without clearing or resolving learning, and eligible disjoint scheduling remains governed by Feature 005.
4. **Given** unresolved learning and a run-wide security, safety, authority, credential, destructive-confirmation, spending, external-authorization, lane, or ownership issue, **When** the issue arises, **Then** the invocation stops immediately.
5. **Given** unresolved learning and an exhausted per-target recovery budget, **When** no further recovery is permitted for that target, **Then** the target remains unresolved and restricted without consuming unrelated scheduling authority.
6. **Given** unresolved learning and an exhausted overall budget, **When** no further invocation activity is permitted, **Then** the invocation stops with governance unresolved rather than classifying the affected target as no-progress, blocked, or closed.

### User Story 5 - Learn with or without a progress objective (Priority: P1)

As a user, I want mandatory learning to work independently of optional progress objectives.

**Independent Test**: Exercise an active task with no objective, no uniquely matching objective, and a valid matching objective; verify identical learning ordering and no invented objective sequence.

**Acceptance Scenarios**:

1. **Given** no objective, **When** a finding or approach repeat requires learning, **Then** learning proceeds without creating or requiring an objective sequence.
2. **Given** objectives exist but none maps uniquely to the task, **When** learning is required, **Then** no objective is inferred or invented.
3. **Given** a valid matching objective, **When** learning is required, **Then** the objective may provide relevant evidence but does not replace or reorder learning governance.

### User Story 6 - Produce an authoritative conditional governance and unresolved-end audit (Priority: P2)

As a user, I want the audit to prove how repeated behavior was governed, including unresolved targets, sequential continuation, and invocations that ended before target governance resolved.

**Independent Test**: Exercise resolved-alternative, resolved-no-progress, unresolved target suspension with disjoint continuation, unresolved target-scoped halt, unresolved run-wide halt, per-target and overall-budget outcomes, dual-projected Controlled Unresolved End for both learning-result branches, and Immediate Halt End before controlled-end eligibility. Verify that every audit reports the actual target and invocation outcomes from existing authoritative history and never derives controlled-end authority from a halt.

**Acceptance Scenarios**:

1. **Given** any learning-triggered run, **When** its governance audit is produced, **Then** it always reports the affected target, learning requirement, triggering Repeat Relationship and channel, current governance status, exact target disposition, and exact invocation outcome.
2. **Given** governance resolved through an alternative, **When** the audit is produced, **Then** it reports verified projection, the selected alternative, discriminating check, post-learning Inspection, verification, and independent review outcomes.
3. **Given** governance resolved as no-progress, **When** the audit is produced, **Then** it reports verified projection and proves the complete no-alternative and no-new-distinguishing-evidence conclusion rather than repeating caller-authored prose.
4. **Given** a target-scoped hard stop or per-target budget leaves the affected target unresolved while eligible disjoint work continues, **When** the audit is produced, **Then** it reports the unchanged target suspension, unresolved reason, retained or re-derivable evidence, and subsequent sequential work without calling the target blocked, closed, or no-progress.
5. **Given** a run-wide hard stop or exhausted overall budget, **When** the audit is produced, **Then** it reports the invocation stop and unresolved target governance without claiming target resolution.
6. **Given** activity can project before unchanged target suspension, **When** control leaves the affected target, **Then** existing current-run evidence and authoritative lane history both retain the bounded unresolved learning-required event.
7. **Given** Immediate Halt End occurs after verified projection, before projection with exact retained occurrences, or with unrecoverable evidence, **When** history is audited, **Then** its disposition equals the halt's and binds respectively the verified revision, deterministic re-derivation evidence, or authoritative unrecoverable-evidence identity and run-wide stop, with no controlled-end permit, mutation, record, or receipt.
8. **Given** a selected-alternative branch at `alternative-inspected` or a no-progress branch at `no-progress-verified`, **When** the invocation takes Controlled Unresolved End before the corresponding attempt permit or lane no-progress disposition, **Then** the audit reports the governance branch resolved, the target lane disposition pending and unchanged, and no attempt or lane no-progress mutation applied.
9. **Given** any audit detail, **When** its evidence is inspected, **Then** it comes from existing current-run and authoritative lane history rather than a second store.

### User Story 7 - Prove ordering and scheduling through public paths (Priority: P2)

As a maintainer, I want tests through the public Work and transition paths so that helper behavior cannot mask either a governance bypass or an accidental run-wide scheduling freeze.

**Independent Test**: Run finding-repeat, approach-only repeat, learning, projection, Inspection, affected-target transition, unchanged suspension, sequential disjoint continuation, scoped halt, scoped budget, controlled unresolved end, resume, and audit scenarios through the public Work path in both lanes, including direct-mutation refusal and concurrency rejection.

**Acceptance Scenarios**:

1. **Given** a repeated-equivalent finding through the public Work path, **When** the affected target proceeds normally, **Then** observed ordering is valid occurrences, basis equality, unresolved learning, complete learning, required projection, fresh Inspection when required, and only then an authorized ordinary transition on that target.
2. **Given** a repeated-equivalent approach without a repeated reviewer finding, **When** alternative and no-progress branches run through the public path, **Then** each branch observes the same governance ordering and evidence requirements.
3. **Given** a repeat combined with a target-scoped hard stop or exhausted per-target recovery budget, **When** an eligible disjoint target exists, **Then** the public path suspends the affected target unchanged, continues sequentially with the disjoint target, and does not revisit the affected target without resumed governance, new evidence, or a materially different alternative.
4. **Given** a repeat combined with a run-wide hard stop or exhausted overall budget, **When** the public path evaluates scheduling, **Then** the invocation stops and no other target starts.
5. **Given** an affected target was suspended or the invocation ended unresolved, **When** that target is later reconsidered, **Then** the public path restores or deterministically re-derives governance before any normal transition.
6. **Given** helper-level tests pass but the public path bypasses required ordering or wrongly freezes eligible disjoint scheduling, **When** acceptance is evaluated, **Then** the feature is rejected.
7. **Given** static authority contracts, **When** they are evaluated, **Then** affected-target governance, Feature 005 sequential scheduling, guarded compatibility, scoped halt precedence, budget scope, and no-concurrency rules are explicit.
8. **Given** implementation is complete, **When** full bundle validation and independent review run, **Then** all gates must pass before acceptance.

### User Story 8 - Correct the Feature 007 incident without rewriting history (Priority: P2)

As a maintainer, I want the current incident corrected only after governance exists and only to the extent supported by exact evidence.

**Independent Test**: Exercise correction with exact original review evidence available and unavailable; verify append-only supersession, evidence-safe state handling, and no technical-docs implementation work.

**Acceptance Scenarios**:

1. **Given** governance is accepted and exact review evidence supports a stable basis and two distinct valid occurrences, **When** the incident is corrected, **Then** existing history is preserved, the unauthorized block is superseded rather than validated, and the affected task may return to in-progress with unresolved learning.
2. **Given** exact basis or occurrence evidence is unavailable, **When** correction is considered, **Then** an evidence-incomplete disposition is recorded without fabricating a repeat relationship or resuming the task.
3. **Given** either correction path, **When** history is audited, **Then** it never represents the original unauthorized block as valid autonomous governance.
4. **Given** definition or revision of this feature, **When** staging occurs, **Then** Feature 007 is not silently resumed, corrected, or otherwise mutated.

## Edge Cases

- A first valid finding occurrence, a genuinely distinct later basis, and two distinct occurrences sharing one basis.
- Two records that replay the same occurrence rather than representing distinct occurrences.
- Equal stable bases whose attempt identities, review evidence identities, observed results, or chronology differ.
- Repeated wording whose normalized finding basis is distinct.
- Different wording whose normalized finding basis establishes equivalence.
- A missing, incomplete, stale, malformed, or conflicting finding basis.
- A complete basis with missing, incomplete, stale, duplicated, or conflicting occurrence evidence.
- A repeated equivalent approach established without any repeated reviewer finding.
- A first approach, distinct later approach, and repeated equivalent approach.
- Missing, stale, malformed, or conflicting runtime approach or approach-occurrence evidence.
- No credible alternatives, exactly one credible alternative, or several credible alternatives.
- The same approach presented with different wording or superficial changes.
- New distinguishing evidence that supports a materially different evidence-gathering approach.
- A post-learning Inspection that predates learning, predates projection, targets another alternative, or becomes stale after evidence drift.
- Missing projection, projection to only one required history surface, or conflicting projections.
- An irreducible target-scoped hard stop before unresolved-event projection can occur.
- An irreducible run-wide hard stop before unresolved-event projection can occur.
- A hard stop after learning begins or after an alternative is selected but before required post-learning evidence completes.
- Per-target recovery-budget exhaustion immediately after repeat detection, during learning, or after an alternative is selected.
- Overall-budget exhaustion at the same points.
- A target-scoped unavailable dependency or input contrasted with a run-wide authority, credential, destructive, spending, or external-authorization issue.
- Ambiguous lane or ownership authority that prevents safe selection of any target.
- An affected target suspended unchanged while an eligible disjoint ready target proceeds sequentially.
- A candidate target whose dependency or change-set disjointness is missing, stale, ambiguous, or disproven.
- An attempted scheduling handoff that also tries to block, close, resolve, or otherwise mutate the affected target.
- An attempted revisit of the affected target without resumed learning, new distinguishing evidence, or a materially different alternative.
- Several eligible disjoint targets that must still run sequentially.
- An attempted concurrent start despite otherwise valid disjointness.
- Controlled Unresolved End from `alternative-inspected` before attempt-permit issuance or from `no-progress-verified` before lane no-progress disposition.
- Immediate Halt End when an immediate hard stop or overall-budget cessation ends the invocation before controlled-end eligibility, with no controlled-end permit, mutation, record, or receipt.
- Attempted Controlled Unresolved End from `required`, `reviewed`, `projected`, an authorized or verified alternative phase, or without the source phase's exact fresh branch evidence.
- Resumption from captured repeat evidence when no unresolved-event projection was possible before halt.
- An audit for resolved alternative, resolved no-progress, unresolved target suspension, unresolved target-scoped halt, unresolved run-wide halt, per-target budget halt, Immediate Halt End, or Controlled Unresolved End.
- No objective, no uniquely matching objective, or a valid matching objective.
- Guarded policy or non-Work review receiving an equivalent repeated finding.
- A tracked target with a missing, stale, conflicting, or ambiguous authoritative mapping.
- A direct Lightweight or tracked lane-mutation attempt.
- Exact Feature 007 review evidence being unavailable, partial, duplicated, or conflicting.

## Functional Requirements

- **FR-001:** Every existing irreducible hard stop and configured budget MUST retain immediate precedence and MUST be applied at its authoritative scope. A target-scoped hard stop or exhausted per-target recovery budget MUST halt or restrict the affected target without resolving it or consuming unrelated scheduling authority. Run-wide security, safety, authority, credential, destructive-confirmation, spending, or external-authorization issues, ambiguous lane or ownership, and exhausted overall budgets MUST stop the invocation. Beneath those boundaries, explicit autonomous Work governance MUST require learning before another attempt or ordinary resolving, blocked, terminal, no-progress, or escalation disposition on the affected target.
- **FR-002:** Independent review MUST remain authoritative for grounded findings, while the generic reviewer protocol MUST defer autonomous Work disposition and MUST retain its existing guarded and non-Work behavior.
- **FR-003:** Every grounded review finding MUST carry a stable normalized equivalence basis that excludes reviewed-attempt identity, occurrence-specific evidence identity, observed result, chronology, and other per-occurrence details while including the target, expected condition or governing rule, affected subject, failure class, and check definition.
- **FR-004:** Each Finding Occurrence MUST separately bind its normalized basis identity to one reviewed attempt identity, review evidence identity, observed evidence or check result, and chronology. A finding Repeat Relationship MUST be derived as equality of basis identities across at least two distinct valid occurrences, never as equality of full occurrence identities. Runtime-derived approach occurrences and approach equivalence MUST likewise come from complete normalized approach evidence rather than free-form equivalence claims.
- **FR-005:** Missing, incomplete, stale, duplicated, or conflicting basis or occurrence evidence for either trigger channel MUST fail closed, MUST NOT fabricate an occurrence or Repeat Relationship, and MUST NOT authorize continuation or no-progress.
- **FR-006:** A first valid occurrence, a later occurrence with a distinct normalized basis, and a replay of the same occurrence MUST NOT be classified as repetition. Wording similarity alone MUST NOT establish equivalence, while differences in occurrence-specific attempt, evidence, result, or chronology MUST NOT prevent two distinct valid occurrences with equal bases from establishing repetition.
- **FR-007:** A deterministically repeated equivalent finding or deterministically repeated equivalent approach during autonomous Work MUST establish the same unresolved Affected Target Governance before another attempt, generic escalation, user escalation as an ordinary disposition, no-progress, ordinary block, close, or status transition that would resolve or ordinarily dispose that target. Review findings are one trigger channel and MUST NOT be a prerequisite for approach-triggered learning. This ordering MUST NOT delay a halt required by FR-024, prohibit unchanged target suspension and eligible sequential disjoint scheduling, or prohibit a Controlled Unresolved End satisfying FR-015.
- **FR-008:** A learning review MUST inspect complete fresh task, run, attempt, approach, verification, review when present, lane-history, and assumption evidence and MUST record bounded findings explaining the repeated finding or repeated approach.
- **FR-009:** A learning review MUST generate a bounded set of credible alternatives and MUST establish material difference from the repeated approach through deterministic identity and a discriminating check grounded in fresh evidence.
- **FR-010:** Model reasoning MAY assess semantic credibility within the complete bounded evidence, but deterministic evidence MUST establish identity, equivalence, binding, and authorization, and a disguised repetition MUST NOT qualify as an alternative.
- **FR-011:** When credible alternatives exist, learning MUST select exactly one materially different alternative and bind it to its discriminating check; when none exists, learning MUST establish that neither a credible alternative nor new distinguishing evidence is available.
- **FR-012:** Repeat detection alone MUST NOT produce no-progress. No-progress MUST be authorized only after the complete no-alternative learning conclusion has been recorded and freshly dual-projected and a fresh post-projection Inspection and proof establish no new distinguishing evidence, producing `no-progress-verified`.
- **FR-013:** One bounded governance event MUST represent the affected target, triggering Repeat Relationship, its distinct occurrences and evidence, unresolved learning requirement, current governance status, and resulting target and invocation outcomes. When resolved, it MUST additionally bind the completed learning findings, selected alternative and check or no-progress proof, and applicable post-learning evidence. When unresolved, it MUST retain any suspension, scoped halt, budget scope, Immediate Halt End or Controlled Unresolved End, and the applicable projection or re-derivation status without claiming target resolution.
- **FR-014:** When immediate-halt authority permits projection, existing current-run evidence and the exact authoritative lane history MUST each project or retain the same bounded unresolved learning-required governance event before the affected target is suspended for other work or a Controlled Unresolved End satisfying FR-015 occurs. A governance event MUST NOT be treated as resolved until both projections are freshly verified.
- **FR-015:** Missing, one-sided, stale, or conflicting projection MUST leave Affected Target Governance unresolved and MUST block another attempt, revisit, ordinary target disposition, and any release that would make governance unavailable. Controlled Unresolved End MUST NOT be issued from `projected`. A selected-alternative branch MUST first reach `alternative-inspected` through a fresh post-learning Inspection and MUST take Controlled Unresolved End before attempt-permit issuance. A no-progress branch MUST first reach `no-progress-verified` through fresh no-new-distinguishing-evidence verification and MUST take Controlled Unresolved End before its lane no-progress disposition. In either branch, the governance decision is resolved for audit while the target lane disposition remains pending and unchanged. Controlled Unresolved End MUST NOT itself authorize an attempt or apply no-progress. Without an immediate-halt exception, unchanged suspension MUST wait until the bounded unresolved event is safely projected and retained. If an immediate hard stop or applicable budget exhaustion prevents one or both projections, exact basis, occurrence, evidence, and chronology already captured in existing history MUST remain authoritative and sufficient for deterministic re-derivation. That exception MAY permit unchanged target suspension or eligible sequential disjoint scheduling and MAY end the invocation as an Immediate Halt End, but MUST NOT create Controlled Unresolved End or invoke its ordinary transition. Later resumption MUST re-derive and project governance before any normal transition on the affected target. If unresolved governance is neither safely retained nor deterministically re-derivable, the invocation MUST stop without releasing the required evidence.
	For Immediate Halt End, the reported projection disposition MUST equal the nested halt disposition: `verified` MUST bind the exact projection reference and governance revision; `rederive-required` MUST bind deterministic proof and exact retained occurrences; `unavailable` MUST bind authoritative unrecoverable-evidence identity and remain run-wide.
- **FR-016:** A selected alternative MUST receive a fresh post-learning Inspection that uses current evidence and binds the proposed attempt to the selected alternative and discriminating check.
- **FR-017:** Evidence drift after learning or Inspection MUST invalidate affected authorization and MUST require fresh learning projection, Inspection, or both according to the changed evidence.
- **FR-018:** An attempt through a selected alternative MUST match the selected alternative and discriminating check and MUST undergo fresh verification and independent review before task close or success.
- **FR-019:** While learning, required projection, or required post-learning Inspection is unresolved, autonomous Work MUST seal another attempt on the affected target, generic repeated-finding escalation, no-progress, ordinary block, close, any status transition that would resolve or leave that target in an ordinary terminal or blocked disposition, and any revisit lacking resumed governance. An unchanged suspension that preserves the target's unresolved state is a scheduler action, not a sealed target disposition. The seal MUST NOT prevent Feature 005 from selecting an eligible disjoint target sequentially, MUST NOT authorize concurrent work, and MUST NOT prevent the scoped halt required by FR-024 or a Controlled Unresolved End satisfying FR-015.
- **FR-020:** Every Work-originated sealed mutation MUST require deterministic transition authorization derived from freshly verified governance state; caller-authored claims or direct mutation requests MUST NOT substitute for authorization.
- **FR-021:** Affected-target transition authorization MUST apply equivalently to Lightweight and tracked Work and MUST bind the exact authoritative target mapping. An absent or ambiguous target mapping MUST fail closed, and ambiguous lane or ownership authority MUST stop the invocation. Authorization concerning one target MUST NOT transfer to another. Selection of another target MUST independently satisfy existing readiness, dependency, change-set disjointness, ownership, and lane authority.
- **FR-022:** Learning governance MUST operate when an objective is absent, unmatched, or present and MUST NOT invent an objective, objective sequence, or objective identity solely to carry learning evidence.
- **FR-023:** A matching objective MUST NOT override repeat detection, learning, projection, Inspection, affected-target transition sealing, scoped hard stops, per-target or overall-budget exhaustion, verification, independent review, or scheduling authority.
- **FR-024:** Irreducible hard stops and applicable budget exhaustion MUST halt activity immediately even when learning governance is unresolved. A target-scoped hard stop or exhausted per-target recovery budget MUST halt or restrict the affected target, preserve its unresolved obligation, and MUST NOT by itself consume authority to suspend that target unchanged and continue sequentially with an eligible disjoint target under Feature 005. A run-wide security, safety, authority, credential, destructive-confirmation, spending, or external-authorization issue, ambiguous lane or ownership, or exhausted overall budget MUST stop the invocation. No scoped halt MUST clear, resolve, or misclassify learning or authorize no-progress, ordinary block, close, or another resolving target transition. Affected-target revisit MUST restore or re-derive governance first. An invocation ended directly by such a halt MUST be audited as unresolved with invocation outcome Immediate Halt End and its exact projection or re-derivation status; it is not a Controlled Unresolved End. An ordinary Controlled Unresolved End MUST satisfy FR-015.
- **FR-025:** Guarded and non-Work behavior, all existing hard-stop categories and authority, failed-review semantics, fresh verification, independent review, existing lane mutation authority, and Feature 005's sequential disjoint scheduling behavior MUST remain unchanged. Scope classification MUST NOT downgrade a hard stop, transfer authority across targets, or permit concurrency.
- **FR-026:** Every audit for a learning-triggered run MUST always report the affected target, learning requirement, triggering Repeat Relationship and channel, current governance status, exact target disposition, and exact invocation outcome. A resolved-alternative audit MUST include verified projection, selected alternative and check, and completed post-learning Inspection, verification, and review evidence. A resolved-no-progress audit MUST include verified projection and complete no-alternative proof. An unresolved suspension, target-scoped halt, per-target budget, run-wide halt, overall-budget, or Immediate Halt End audit MUST include the unresolved reason, scope, scheduling outcome, and exact projection or re-derivation status. A Controlled Unresolved End audit MUST prove the exact eligible source phase and branch evidence: selected alternative, check, and fresh post-learning Inspection for `alternative-inspected`, or complete proof and fresh no-new-evidence verification for `no-progress-verified`. It MUST report `governance branch resolved`, `lane disposition pending`, and `target unchanged`, and MUST claim neither an attempted alternative nor an applied no-progress disposition. Neither audit form may claim target completion, ordinary block, close, or unsupported post-learning evidence.
- **FR-027:** Governance evidence, unresolved-event retention, deterministic re-derivation, and audit detail MUST use existing current-run and authoritative lane-history surfaces and MUST NOT create a second ledger, durable store, or parallel learning mechanism.
- **FR-028:** Rollout MUST fail closed by enforcing repeat-triggered learning and affected-target transition sealing before continuation through a selected alternative can be enabled.
- **FR-029:** Integration tests MUST exercise public Work and real transition paths across first, distinct, repeated-finding, repeated-approach-only, alternative, no-progress, projection, projection-prevented halt, target suspension, eligible and ineligible disjoint scheduling, target revisit, target-scoped and run-wide hard stops, per-target and overall-budget exhaustion, Controlled Unresolved End, resume, Inspection, objective, policy, lane, audit, direct-mutation refusal, and concurrency refusal scenarios. Repeated-approach-only fixtures MUST cover selected-alternative and no-progress outcomes, and helper-only tests MUST NOT satisfy acceptance.
- **FR-030:** Static contracts MUST prove autonomous Work disposition precedence, scoped immediate-halt precedence, affected-target governance, Feature 005 sequential scheduling, guarded compatibility, and no-concurrency behavior, and full bundle validation plus fresh independent approval MUST be required for acceptance.
- **FR-031:** Feature 007 incident correction MUST occur only after this governance is active and accepted, MUST preserve prior history, and MUST append a superseding correction rather than rewrite or validate the unauthorized block.
- **FR-032:** With exact incident evidence sufficient to establish the stable basis and distinct valid occurrences, correction MUST derive the supported Repeat Relationship and return the affected task only to in-progress unresolved learning. Without that evidence, correction MUST record evidence-incomplete and MUST NOT fabricate repetition or resume work.
- **FR-033:** The feature MUST preserve Feature 005's accepted intended behavior, including learning triggered by repeated equivalent approaches independently of reviewer findings, review findings as a separate trigger channel, sequential continuation to eligible disjoint independent work after a target-scoped halt, exact dependency and change-set eligibility, affected-target revisit only with new evidence or a materially different approach, and no concurrency. It MUST preserve Feature 008 behavior, MUST NOT perform technical-docs remediation, MUST NOT mutate Feature 007 during definition or revision, and MUST NOT mutate unrelated workflow state.
- **FR-034:** The feature MUST introduce no new user-facing command, execution lane, external service, persistent store, concurrency behavior, parallel scheduling authority, or automatic repository delivery action.

## Key Entities

- **Normalized Finding Equivalence Basis**: The stable identity-bearing review basis containing the target, expected condition or governing rule, affected subject, failure class, and check definition while excluding attempt, occurrence, evidence, observed-result, and chronology details.
- **Grounded Review Finding**: An independent-review finding carrying a complete Normalized Finding Equivalence Basis and complete evidence for one Finding Occurrence.
- **Finding Occurrence**: One distinct valid occurrence that binds a finding basis identity to its reviewed attempt, review evidence, observed evidence or check result, and chronology.
- **Normalized Approach Equivalence Basis**: A deterministic representation of an attempted approach derived from complete runtime evidence and sufficient to distinguish materially different approaches without accepting free-form sameness claims.
- **Approach Occurrence**: One distinct runtime-derived attempt binding an approach basis to its attempt evidence, observed result, and chronology.
- **Repeat Relationship**: Equality of normalized basis identities across two or more distinct valid occurrences in the finding or approach trigger channel; equality of full occurrence identity does not establish repetition.
- **Learning Requirement**: The unresolved governance obligation created by a valid finding or approach Repeat Relationship and cleared only through complete required learning, projection, and post-learning governance.
- **Affected Target Governance**: The exact binding between one Learning Requirement and the bounded target whose repeated behavior triggered it. It seals another attempt and ordinary resolving or blocked disposition on that target while preserving separate scheduler authority for independently eligible disjoint targets.
- **Learning Review**: The bounded semantic review of complete fresh history that explains repetition and selects a credible alternative or establishes no-progress.
- **Alternative and Discriminating Check**: A materially different bounded approach and the evidence-producing check that distinguishes it from the repeated approach.
- **Governance Event**: The bounded authoritative account of the affected target, trigger, occurrences, unresolved or resolved status, suspension or disposition, scoped halt or budget, conditional evidence, and invocation outcome.
- **Projection**: Retention of the same bounded governance event in existing current-run evidence and authoritative lane history.
- **Post-Learning Inspection**: A fresh inspection that binds a proposed attempt to the selected alternative, discriminating check, and current evidence.
- **Transition Authorization**: The deterministic decision allowing or refusing a Work-originated attempt or ordinary disposition on one exact affected target. It does not itself authorize selection or mutation of another target.
- **Unresolved Halt**: A target-scoped or run-wide hard-stop or budget outcome that halts the applicable activity without resolving governance or authorizing an ordinary target disposition.
- **Controlled Unresolved End**: An ordinary invocation-end transition from `alternative-inspected` before attempt-permit issuance or `no-progress-verified` before lane no-progress disposition. The governance branch is resolved, but the target lane disposition remains pending and unchanged.
- **Governance Audit**: The authoritative history-derived account whose evidence varies according to resolved alternative, resolved no-progress, unresolved target suspension, scoped halt, scoped budget, Immediate Halt End, or Controlled Unresolved End status.
- **Incident Correction**: The append-only supersession of the Feature 007 unauthorized block, constrained by recoverable exact evidence.

## Success Criteria

- **SC-001:** In 100% of repeated-equivalent autonomous fixtures, including repeated-finding and repeated-approach-only fixtures, learning is required before any further attempt or ordinary governance-controlled disposition on the affected target. Target-scoped and run-wide halts preserve that requirement unresolved, and eligible disjoint scheduling is not misclassified as affected-target continuation.
- **SC-002:** Repeat detection produces zero direct autonomous no-progress dispositions, user escalations as ordinary dispositions, ordinary task blocks, task closes, or resolving status transitions. Target-scoped halts and per-target budgets produce only unresolved target outcomes; run-wide halts and overall budgets stop only as unresolved invocation outcomes; Controlled Unresolved Ends are never reported as target dispositions.
- **SC-003:** Zero Work-originated attempts, ordinary blocks, closes, resolving status transitions, or unauthorized revisits succeed on an affected target while required learning, projection, or post-learning Inspection is unresolved. In 100% of fixtures where Feature 005 proves another target ready, independent, and disjoint, sequential continuation remains available without concurrent work.
- **SC-004:** The classification oracle uses only target, expected condition or rule, affected subject, failure class, and check definition to determine finding-basis equality, and separately requires reviewed attempt, review evidence, observed evidence or check result, and chronology to establish each distinct valid occurrence. Across 100% of first, distinct, replayed-occurrence, repeated-wording-distinct-basis, different-wording-equal-basis, occurrence-specific-evidence-change, missing-basis, and missing-occurrence fixtures, repeat classification matches that oracle. The corresponding deterministic basis-and-distinct-occurrence oracle also classifies 100% of approach fixtures correctly without free-form equivalence authority.
- **SC-005:** Every authorized alternative is materially different, bound to a discriminating check, freshly inspected, freshly verified, and independently reviewed; disguised repetitions receive zero authorizations.
- **SC-006:** In 100% of resolved governance fixtures, the same governance event is present and freshly verified in both required history surfaces. In 100% of Controlled Unresolved End fixtures, the learning result is freshly dual-verified and the source phase is exactly `alternative-inspected` with fresh branch Inspection or `no-progress-verified` with fresh no-new-evidence verification; `projected` authorizes zero controlled ends. In 100% of unresolved suspension, halt, budget, and Immediate Halt End fixtures, the unresolved event is retained where projection was possible or exact captured repeat evidence deterministically supports re-derivation; every invocation ending before controlled-end eligibility has zero controlled-end permits, mutations, records, and receipts. Zero missing, one-sided, stale, conflicting, or unrecoverable projections authorize affected-target revisit or ordinary disposition.
- **SC-007:** In 100% of selected-alternative fixtures, post-learning Inspection follows verified projection and evidence drift invalidates stale Inspection.
- **SC-008:** In 100% of no-objective, no-match, and matching-objective fixtures, learning completes with the same governance ordering and no objective sequence is invented.
- **SC-009:** For 100% of guarded and non-Work baseline fixtures, public outputs and authoritative history remain byte-for-byte equivalent and review and transition behavior remains unchanged.
- **SC-010:** Lightweight and tracked public-path suites both reject every direct or unresolved affected-target mutation, including missing or ambiguous mappings. Authorization for one target grants zero authority over another, while independently proven Feature 005 disjoint scheduling remains available in both lanes.
- **SC-011:** In 100% of audit fixtures, affected target, common requirement, Repeat Relationship, status, target disposition, and invocation outcome evidence is present. Resolved-alternative audits contain selected-alternative, check, projection, and post-learning evidence; resolved-no-progress audits contain complete no-alternative proof; unresolved suspension, scoped halt, scoped budget, and Immediate Halt End audits contain scope, unresolved reason, scheduling outcome, and exact projection or re-derivation status. Controlled Unresolved End audits contain exact eligible source-phase evidence, report the governance branch resolved and lane disposition pending, and make no false attempt, applied no-progress, block, close, or target-completion claim.
- **SC-012:** Public Work integration tests prove complete ordering for finding-repeat and repeated-approach-only selected-alternative and no-progress fixtures, plus target-scoped halt, run-wide halt, per-target budget, overall budget, eligible and ineligible disjoint scheduling, projection-prevented, Controlled Unresolved End, resume, revisit-refusal, and concurrency-refusal fixtures. Helper-only success never satisfies the gate.
- **SC-013:** Feature 007 correction fixtures preserve all prior history, supersede rather than validate the unauthorized block, resume only with exact basis and distinct-occurrence evidence, and remain evidence-incomplete without it.
- **SC-014:** Acceptance creates zero new commands, lanes, persistent stores, ledgers, concurrency behavior, or parallel scheduling authority; preserves both Feature 005 trigger channels and its exact sequential disjoint continuation behavior; leaves Feature 008 behavior and unrelated workflow state unchanged; and produces no Feature 007 mutation during definition or revision.
- **SC-015:** All established full bundle validation gates pass with no failures, and a fresh independent reviewer approves the complete evidence with no unresolved finding.

## Assumptions

- The exact desired user outcome and governance boundary are settled.
- Feature 005's accepted intended behavior includes repeated equivalent approaches as a learning trigger independently of repeated reviewer findings.
- Review findings remain an independent trigger channel and require separation between stable equivalence basis and occurrence-specific evidence.
- Deterministic identities establish repeat occurrence, material difference, and binding to a selected alternative. Semantic credibility remains constrained model reasoning over complete fresh evidence.
- First occurrences and genuinely distinct later occurrences retain ordinary recoverable handling.
- A Learning Requirement is bound to its affected target rather than automatically freezing the entire invocation.
- Affected-target suspension leaves the target and its governance unchanged and is not an ordinary block, close, no-progress, or resolving status transition.
- Feature 005 remains the sole authority for sequential continuation to another ready target and requires disjoint dependencies and change sets.
- No affected target is revisited without resumed learning, new distinguishing evidence, or a materially different alternative.
- Target-scoped irreducible hard stops and exhausted per-target recovery budgets halt or restrict only the affected target unless existing authority classifies the condition as run-wide.
- Run-wide security, safety, authority, credential, destructive-confirmation, spending, or external-authorization issues, ambiguous lane or ownership, and exhausted overall budgets stop the invocation.
- Existing current-run and authoritative lane histories can retain the unresolved governance event or exact captured evidence sufficient for deterministic re-derivation.
- A Controlled Unresolved End is permitted only from `alternative-inspected` before attempt-permit issuance or `no-progress-verified` before lane no-progress disposition; `projected` is ineligible. An immediate halt or overall-budget cessation before branch-specific eligibility is Immediate Halt End and creates no controlled-end authority or artifact.
- Learning governance applies whether or not the target has a registered progress objective.
- Existing Work recovery, evidence, projection, reviewer, lane, scheduler, and audit authorities can carry this guarantee without another store.
- Lightweight and tracked Work mutations both require deterministic transition evidence that cannot be bypassed through direct mutation.
- Public Work and transition tests must prove the ordered behavior end to end.
- Exact evidence for the current Feature 007 incident may or may not be fully recoverable.

## Out of Scope

- Technical-docs implementation fixes or remediation.
- Silently resuming, correcting, or otherwise mutating Feature 007 during definition or revision.
- Rewriting the generic reviewer protocol beyond the narrow autonomous Work disposition deferral.
- Weakening or redefining destructive, security, safety, credential, spending, external-authorization, external-dependency, ownership, reconciliation, intent, authority, verification, review, or budget hard stops.
- Converting a run-wide stop into target-scoped continuation.
- Treating unchanged suspension or Immediate Halt End as controlled-end authority, or treating Controlled Unresolved End as target completion, ordinary block, close, an attempted alternative, or an applied lane no-progress disposition.
- Concurrent or parallel autonomous execution.
- Weakening Feature 005's dependency or change-set disjointness requirements.
- External services or remote governance dependencies.
- A second ledger, persistent audit store, parallel learning mechanism, or new lane.
- A new user-facing command or policy surface.
- Automatic commit, push, publication, or other repository delivery.
- Changes to Feature 005's accepted intent or Feature 008 behavior.
- Post-task optimization or an unscoped objective system.
- Freezing exact commands, field names, permit shapes, hashes, modules, phases, or other implementation design.
