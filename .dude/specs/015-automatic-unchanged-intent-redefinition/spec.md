# Feature Specification: Automatic Unchanged-Intent Redefinition

## Purpose

Explicit autonomous Work can already recover through materially different implementation approaches, but it can still require a user round-trip when the blocker is caused by a contradiction or defect in the derived definition itself. This feature lets Work automatically repair that derived definition in the Lightweight lane when fresh evidence proves that another implementation approach cannot solve the blocker or when the contradiction is already deterministic.

The authority is narrow. The implementation route and task decomposition may change, but the promised outcome may not. The implementation plan and canonical task decomposition may be repaired. The specification may change only to clarify an outcome-equivalent contradiction, relocate or replace an accidental execution constraint, or record a verified execution assumption. No automatic revision may weaken or narrow an outcome, acceptance criterion, safety constraint, quality bar, scope boundary, failure obligation, or meaning of done.

The Spec Lead first stages its authorized definition artifacts and semantic mappings. The coordinator then composes the exact final four-artifact proposal, including canonical tasks and every reconciliation effect represented in those bytes. Deterministic validation may prove exact identity, closed structure, complete anchors and references, mapping shape, and complete final descriptors; it cannot prove semantic equivalence. One independent semantic reviewer judges the exact final proposal and mappings for outcome equivalence, complete equal-or-stronger obligations, task-scope and acceptance-obligation equivalence, decomposition-basis equivalence, intended-invariant and successor-check adequacy, and any proposed `dropped-defective` classification.

Only those exact reviewed bytes may be applied. Inside the atomic rollback boundary, one synchronous post-apply check rereads and reparses all four artifacts, compares exact bytes and identities, revalidates the review identity, and runs fresh lint and required verification. Any failure throws into rollback of all four artifacts; incomplete rollback remains a distinct hard failure. A successful exact-identity check does not rerun semantic review. An optional coordinator-owned derived lane snapshot must refresh through its existing all-or-restored boundary before Work resumes, but it is not part of the four-artifact definition transaction.

State may survive only for a true one-to-one task whose scope and acceptance obligations the exact-proposal reviewer finds unchanged. This feature creates one explicit exception to the ordinary user-confirmation pause for dropping non-open work: explicit autonomous Lightweight recovery may archive a trusted-evidence defective task only when the exact final proposal and independent review satisfy every successor, history, and open-state safeguard. Every other non-open drop still pauses for the user.

This capability is Lightweight-only. Tracked definition recovery still refuses before writes. Existing learning governance remains the owner of repeated approaches, distinguishing evidence, and `no-progress-verified`; redefinition consumes that evidence without replacing its policy or adding another lane, command, store, ledger, transaction engine, or objective system.

## User Stories & Testing

### User Story 1 - Continue through a proven definition defect (Priority: P1)

As the owner of an explicit autonomous Work run, I want Work to repair an outcome-equivalent definition defect without asking me to approve the repair, so unattended work does not stop merely because the plan or task decomposition is wrong.

**Independent Test**: Present one Lightweight blocker that is caused by a deterministic contradiction in the current definition and one blocker for which current learning evidence proves that materially different implementation approaches cannot resolve it. Confirm each eligible case selects the existing definition-reconciliation route without a user prompt, while a case with a viable implementation approach does not.

**Acceptance Scenarios**:

1. **Given** an explicit autonomous Work run and a deterministic impossible gate caused by the definition, **When** the contradiction is proven, **Then** redefinition is eligible immediately without pointless implementation retries.
2. **Given** no directly provable contradiction, **When** current learning-governance evidence proves that materially different implementation approaches cannot resolve the blocker, **Then** redefinition is eligible.
3. **Given** a materially different implementation approach that can resolve the blocker, **When** recovery is evaluated, **Then** automatic redefinition is not eligible.
4. **Given** guarded Work or a non-Work flow, **When** the same blocker occurs, **Then** this automatic continuation authority is unavailable and existing behavior is unchanged.

### User Story 2 - Preserve the promised outcome and every obligation (Priority: P1)

As a user, I want automatic redefinition to change only the route to my outcome, never the outcome or quality bar itself, so autonomy cannot redefine failure into success.

**Independent Test**: Have the Spec Lead stage its authorized half and mappings, then have the coordinator compose the exact final four-artifact proposal with canonical tasks and reconciliation effects. Confirm deterministic validation establishes only identity, structure, references, and mapping completeness; one independent reviewer then judges the exact final bytes and mappings for outcome, obligation, task-scope, acceptance, decomposition, invariant, successor-check, and any defect-classification semantics. Refuse every weakening, omission, ambiguity, normative change, stale review, or identity drift.

**Acceptance Scenarios**:

1. **Given** staged definition artifacts and semantic mappings, **When** the coordinator has not yet composed canonical tasks and every reconciliation effect into the exact final bytes, **Then** the proposal is not ready for semantic review.
2. **Given** a structurally complete exact final proposal, **When** deterministic validation succeeds, **Then** it establishes exact identity and complete closed form without claiming semantic equivalence.
3. **Given** one independent reviewer examines the exact final bytes and mappings, **When** the reviewer approves outcome equivalence, complete equal-or-stronger obligations, unchanged state-preserving task scope and acceptance, equivalent decomposition basis, adequate intended invariants and successor checks, and any `dropped-defective` authority, **Then** only that exact proposal may proceed to application.
4. **Given** any omitted, duplicate, dangling, weaker, narrower, ambiguous, or normative mapping, or review bound to different bytes, **When** the proposal is evaluated, **Then** Work pauses for the user where required and writes nothing.

### User Story 3 - Apply only structurally intact, all-or-restored definitions (Priority: P1)

As a maintainer, I want automatic definition writes protected by parsed structural checks and atomic rollback, so malformed fences, split log entries, ownership drift, or task-history loss cannot survive a failed recovery.

**Independent Test**: Exercise valid and malformed prestates and exact final proposals, an asynchronous post-apply callback, applied-byte and review-identity drift, lint failure, required-verification failure, mid-apply failure, post-write parse failure, and rollback failure. Confirm only an exact reviewed proposal with a synchronously completable callback can apply; every structural, identity, lint, or verification failure throws into four-artifact rollback; and incomplete rollback is reported distinctly.

**Acceptance Scenarios**:

1. **Given** a valid exact owner and exact final proposal, **When** pre-application validation runs, **Then** it proves exact identities, one balanced managed region, append-only log-prefix preservation, byte-identical user sections, valid canonical tasks, preserved history, complete mappings, and complete final descriptors.
2. **Given** the configured post-apply callback cannot complete synchronously, **When** application is requested, **Then** it is rejected before any artifact changes.
3. **Given** the exact reviewed bytes have been applied, **When** the synchronous rollback callback runs, **Then** it rereads and reparses all four artifacts, compares exact applied bytes, recomputes proposal identity, revalidates review identity, and runs fresh lint plus required verification before accepting the batch.
4. **Given** any apply, structural, identity, lint, or required-verification failure, **When** the callback throws, **Then** reverse rollback restores all four artifacts or reports a distinct incomplete-rollback hard failure without claiming restoration.

### User Story 4 - Reconcile task state without inventing completion (Priority: P1)

As a coordinator, I want task state to survive only when the task's scope and acceptance obligations truly survive one-to-one, so a corrected decomposition does not preserve stale progress or manufacture completion.

**Independent Test**: Reconcile open and non-open unchanged, changed, split, merged, new, ordinarily dropped, and `dropped-defective` tasks in the coordinator-composed final proposal. Confirm state survives only when independent review finds one-to-one task-scope and acceptance-obligation equivalence; all successors reopen without inherited state or completion evidence; automatic non-open archival occurs only under every narrow exception condition; every other non-open drop pauses before writes; and discovered work plus prior history bytes remain intact.

**Acceptance Scenarios**:

1. **Given** one old task maps to one new task, **When** the exact-proposal reviewer finds its scope and acceptance obligations unchanged one-to-one, **Then** its existing state may survive.
2. **Given** a changed task, split, merge, new task, or successor of a dropped defective task, **When** reconciliation is composed, **Then** every successor is open and inherits no state or completion evidence.
3. **Given** explicit autonomous Lightweight recovery, byte-unchanged intent and exact ownership, trusted defect evidence, complete equal-or-stronger successor mappings, exact-proposal review approval of the defect classification, successor obligations and checks, task-scope and decomposition equivalence, and archive mapping, byte-preserved prior history, and a complete archive record, **When** a non-open defective task is dropped, **Then** it may be archived without a user prompt and is never marked complete.
4. **Given** ambiguity, normative change, missing evidence or successor, failed review, guarded or non-Work operation, ordinary explicit redefinition, or any other non-open drop, **When** reconciliation is evaluated, **Then** the existing user-confirmation pause occurs before writes; only the coordinator may later apply task or archive state.

### User Story 5 - Resume safely and terminate repeated non-progress (Priority: P1)

As the owner of an autonomous run, I want Work to resume immediately after an approved outcome-equivalent repair and to stop semantically when redefinition repeats without progress, so autonomy continues when useful but cannot churn forever.

**Independent Test**: Complete an eligible repair by reviewing the coordinator-composed exact final proposal once before apply, applying only those bytes, passing the synchronous post-apply identity, lint, and verification callback, and refreshing any required derived lane snapshot through its existing boundary. Confirm Work resumes without a second semantic review. Then supply reviewer-bound semantic evidence that the same blocker and an equivalent decomposition returned without progress and confirm Feature 009 alone decides whether `no-progress-verified` applies.

**Acceptance Scenarios**:

1. **Given** one independent semantic review approves the coordinator-composed exact final bytes and mappings, **When** those exact bytes apply and all synchronous rollback-bound checks pass, **Then** semantic review is not rerun after application.
2. **Given** the definition transaction succeeds, **When** a coordinator-owned derived lane snapshot applies, **Then** it must refresh through its existing all-or-restored boundary before resume; snapshot failure prevents resume without joining the definition transaction.
3. **Given** the same blocker or a semantically equivalent decomposition returns without progress, **When** proposal-bound review evidence shows no meaningful change and no new distinguishing evidence exists, **Then** Feature 009 alone routes the outcome to existing `no-progress-verified` governance.
4. **Given** genuinely new distinguishing evidence, **When** another redefinition is considered, **Then** Feature 009 permits only a fresh eligibility decision and existing recovery budgets remain backstops.

### User Story 6 - Preserve lane, safety, and review authority (Priority: P2)

As a maintainer, I want the capability to extend existing authorities rather than create a parallel workflow, so every current safety floor and ownership boundary remains enforceable.

**Independent Test**: Compare autonomous Lightweight, guarded, non-Work, ordinary explicit redefinition, and tracked paths. Confirm only the autonomous Lightweight path gains the closed `dropped-defective` exception and exact-final-proposal sequence; all other non-open drops retain user confirmation; tracked recovery performs zero writes; the Spec Lead, coordinator, deterministic validator, independent reviewer, atomic rollback boundary, lane snapshot boundary, and Feature 009 each retain only their assigned authority; and no new workflow or persistence surface appears.

**Acceptance Scenarios**:

1. **Given** a tracked target, **When** automatic definition recovery is requested, **Then** it refuses before any filesystem helper or write.
2. **Given** missing or ambiguous exact ownership, **When** recovery is evaluated, **Then** it fails closed before mutation.
3. **Given** a safety, authority, semantic-review, exact-identity, lint, verification, rollback, or lane-snapshot failure, **When** recovery is evaluated, **Then** no redefinition bypasses it or resumes Work.
4. **Given** the completed feature, **When** its workflow surfaces are inspected, **Then** hashes establish only identity, Feature 009 remains the sole repeat/no-progress authority, and no lane, command, persistent store, ledger, transaction engine, objective system, or quality reduction has been added.

## Edge Cases

- The definition contains a contradiction that is provable before any retry.
- A blocker is merely difficult but still has a materially different implementation approach.
- A proposed specification edit clarifies wording but also narrows an acceptance edge case.
- An accidental execution constraint is moved from the specification into the plan while its intended outcome remains binding.
- A literal acceptance check is proven defective, but its proposed successor tests only an easier condition.
- Trigger evidence is preserved, but the intended invariant behind the trigger is omitted.
- The Spec Lead proposal is reviewed before the coordinator composes final canonical tasks or reconciliation effects.
- The coordinator changes one final byte or reconciliation row after semantic review.
- Two byte-different decompositions have similar labels or hashes but lack reviewer evidence of task-scope, acceptance-obligation, and decomposition-basis equivalence.
- One user-owned section has identical rendered text but different bytes, line endings, or trailing whitespace.
- The owner path is correct but a second idea also claims the same exact specification path.
- A managed-region marker appears inside a fence, a marker is unbalanced, or more than one active managed region exists.
- A coordinator-log append starts in the middle of the previous event or alters any prior byte.
- Canonical tasks are valid but discovered work or Lightweight execution history is missing or moved.
- A task keeps its durable key while its scope or acceptance obligations change.
- One task splits into several successors, several tasks merge, or a defective constraint is dropped.
- A non-open defective task lacks trusted defect evidence, a complete equal-or-stronger successor mapping, or reviewer approval of the archive mapping.
- A non-open task is dropped during guarded Work, a non-Work flow, or ordinary explicit redefinition.
- A successor of a dropped defective task attempts to inherit progress or completion evidence.
- The post-apply callback is asynchronous or cannot finish all required checks synchronously.
- The batch passes staged validation but a post-write reparse observes malformed or drifted bytes.
- Applied bytes are exact, but review identity is stale or proposal recomputation differs.
- Fresh lint or required verification fails after all four artifacts have been applied.
- Rollback itself encounters a restoration or cleanup fault and must report that distinct failure without claiming restoration.
- The same blocker returns under cosmetically different wording but an equivalent decomposition.
- New distinguishing evidence appears after a prior no-progress conclusion.
- The four-artifact transaction succeeds but the coordinator-owned derived lane snapshot cannot refresh through its own all-or-restored boundary.
- A tracked target reaches the same diagnosis as an eligible Lightweight target.

## Functional Requirements

- **FR-001**: Automatic unchanged-intent redefinition MUST be available only during explicit autonomous Work and only through the existing derived-definition reconciliation action.
- **FR-002**: Guarded Work, non-Work behavior, and ordinary explicit redefinition MUST remain unchanged, including the existing user-confirmation pause for every non-open task drop.
- **FR-003**: Redefinition eligibility MUST require either a deterministic contradiction or impossible gate causally traced to the current definition, or current learning-governance evidence proving that materially different implementation approaches cannot resolve the blocker.
- **FR-004**: A provable deterministic contradiction MUST NOT require pointless retries. Without such a proof, incomplete, stale, ambiguous, or caller-asserted no-alternative evidence MUST NOT establish eligibility.
- **FR-005**: Automatic redefinition MAY change the route to the promised outcome but MUST NOT change the promised outcome.
- **FR-006**: The implementation plan and canonical task decomposition MAY change. The specification MAY change only to clarify an outcome-equivalent contradiction, relocate or replace an accidental execution constraint, or add a verified execution assumption.
- **FR-007**: Automatic redefinition MUST NOT weaken, narrow, remove, or reinterpret any outcome, acceptance criterion, safety constraint, quality bar, scope boundary, failure obligation, meaning-of-done obligation, or intended invariant.
- **FR-008**: The coordinator-composed exact final proposal MUST map every pre-change outcome, acceptance, safety, quality, scope, failure, and meaning-of-done obligation completely to one or more post-change obligations that the independent semantic reviewer judges equal or stronger.
- **FR-009**: The complete user-owned Idea, Open Questions, and Assumptions sections MUST remain byte-identical.
- **FR-010**: Every acceptance or verification check MUST be retained or replaced by a successor check that the independent semantic reviewer judges adequate to prove the same intended invariant against the exact final proposal.
- **FR-011**: A proven-defective literal condition MAY be replaced, but its intended invariant and triggering evidence MUST remain binding and the successor mapping MUST be explicit.
- **FR-012**: Exactly one independent semantic review MUST occur after coordinator composition and deterministic validation but before application, MUST bind the exact final four-artifact bytes and complete mappings, and MUST judge outcome equivalence, complete equal-or-stronger obligations, state-preserving task-scope and acceptance-obligation equivalence, decomposition-basis equivalence, intended-invariant and successor-check adequacy, and `dropped-defective` authority when present. Hashes, canonical identities, deterministic validation, or self-attestation MUST NOT establish semantic equivalence.
- **FR-013**: Ambiguous outcome equivalence, any normative change, missing semantic evidence, or any non-open drop outside the explicit `dropped-defective` exception MUST stop for the user before definition writes.
- **FR-014**: Recovery MUST require exactly one defined owner by the exact specification path and MUST fail closed on any resolver diagnostic, missing owner, or duplicate owner.
- **FR-015**: Before semantic review, deterministic validation MUST parse and require exact proposal and evidence identities, one balanced managed region, exact append-only coordinator-log prefix preservation, exact ownership, byte-identical user sections, valid canonical tasks, preserved discovered work and task history, closed and complete anchor/reference sets, valid mapping shape, and complete final descriptors. It MUST NOT decide semantic equivalence.
- **FR-016**: The Spec Lead MUST stage only its authorized definition half and semantic mappings; the coordinator MUST then compose the exact final owner idea, specification, implementation plan, and canonical-task bytes with every reconciliation effect represented in those bytes. Only that reviewed proposal MAY be applied as one guarded atomic four-artifact batch, and no derived lane snapshot or additional definition artifact may join it.
- **FR-017**: The atomic post-apply callback MUST be rejected before application unless it can complete synchronously. Inside that rollback callback, the system MUST reread and reparse all four artifacts, compare exact applied bytes with final descriptors, recompute proposal identity, revalidate semantic-review identity, and run fresh lint plus required verification. Any structural, identity, lint, or verification failure MUST throw into reverse rollback of all four artifacts; incomplete rollback MUST remain a distinct hard failure without a restoration claim. Semantic review MUST NOT be rerun after application.
- **FR-018**: Task state MAY survive only for a one-to-one task mapping whose scope and acceptance obligations the independent reviewer judges unchanged in the exact final proposal; deterministic identity or durable-key equality alone MUST NOT preserve state.
- **FR-019**: Changed tasks and every successor of a split or merge MUST be open after reconciliation.
- **FR-020**: Automatic archival of a non-open `dropped-defective` task MUST be allowed only during explicit autonomous Lightweight recovery with exact ownership and byte-unchanged intent, trusted evidence of a definition defect, complete equal-or-stronger obligation and check successors in the coordinator-composed exact final proposal, independent approval of the defect classification, successor obligations and checks, task-scope and decomposition equivalence, and archive mapping, open successors with no inherited state or completion evidence, byte-preserved prior terminal history except an append-only archive addition, and an archive record containing prior task identity and state, defect reason, trigger evidence, and successor mapping. The task MUST never be marked complete. Any missing condition MUST retain the user-confirmation pause.
- **FR-021**: Only the coordinator MAY compose final canonical task and reconciliation bytes or apply task glyphs, task metadata, board, mirror, archive, discovered-work, execution-history, reconciliation state, and the optional derived lane snapshot.
- **FR-022**: Work MAY resume without a user prompt only after one pre-apply semantic review has approved the coordinator-composed exact final proposal, the exact reviewed bytes have passed atomic application and every synchronous rollback-bound structural, identity, lint, and required-verification check, and any optional derived lane snapshot has refreshed through its existing all-or-restored boundary. No second semantic review is required or permitted as a substitute for exact identity revalidation.
- **FR-023**: A further redefinition MUST require new distinguishing evidence under Feature 009, which remains the sole repeat/no-progress authority. Proposal-bound reviewer evidence MAY establish semantic blocker and decomposition relationships, but hashes and deterministic identities MUST NOT do so; Feature 009 MUST decide whether the same blocker or equivalent decomposition lacks distinguishing evidence and routes to existing `no-progress-verified` governance.
- **FR-024**: Existing overall and target recovery budgets MUST remain backstops and MUST NOT substitute for the semantic termination rule.
- **FR-025**: Every existing safety floor, exact-owner gate, authority boundary, ordinary non-open-drop confirmation rule, fresh lint and verification requirement, independent-review requirement, rollback guarantee, and lane refresh boundary MUST remain in force except for the explicit autonomous-Lightweight `dropped-defective` exception. The feature MUST introduce no quality reduction, lane, user-facing command, persistent store, ledger, transaction engine, or objective system.
- **FR-026**: Automatic definition recovery MUST be Lightweight-only. Tracked definition recovery MUST continue to refuse before filesystem helper entry or mutation.

## Key Entities

- **Promised Outcome**: The complete user-requested result and its acceptance, safety, quality, scope, failure, and meaning-of-done obligations. A route may change while this remains unchanged.
- **Derived Definition**: The specification, implementation plan, and canonical task decomposition produced from user-owned intent. Its automatic edit authority is narrower than explicit definition authority.
- **Definition Defect Evidence**: Fresh evidence proving either a deterministic contradiction or impossible gate caused by the definition, or a current no-alternative conclusion from existing learning governance.
- **Redefinition Proposal**: The exact final four-artifact bytes composed by the coordinator after Spec Lead staging, together with complete obligation, check, task-reconciliation, trigger-evidence, prestate, and final-descriptor mappings. Review and application bind this value, not an earlier partial stage.
- **Obligation Mapping**: A complete old-to-new mapping in which every old obligation has one or more equal-or-stronger successors.
- **Intended Invariant**: The actual outcome or property an acceptance condition is meant to prove, which remains binding even when a defective literal check is replaced.
- **Structural Integrity Proof**: Deterministic evidence of exact identities, parsed structure, complete anchors and references, valid mapping shape, complete final descriptors, and preserved protected bytes. It proves closed integrity before review and exact applied identity inside rollback, never semantic equivalence.
- **Independent Semantic Review**: One proposal-bound judgment over the coordinator-composed exact final bytes and mappings that decides outcome, obligation, task-scope, acceptance-obligation, decomposition-basis, invariant, successor-check, and any `dropped-defective` semantics.
- **Task Reconciliation**: The complete one-to-one, changed, split, merged, `dropped-defective`, and new mapping composed into final canonical task and archive bytes by the coordinator. It identifies candidate state effects; review supplies the semantic equivalence judgment required for preservation or automatic archival.
- **Distinguishing Evidence**: Feature 009-owned evidence that differentiates a proposed repair from a previously ineffective approach. Proposal-bound semantic review may describe blocker and decomposition relationships, but Feature 009 alone decides whether the evidence distinguishes another attempt.
- **Derived Lane Snapshot**: An optional coordinator-owned execution view refreshed after the definition transaction through its existing all-or-restored boundary. It is a prerequisite to resume when applicable, never a fifth definition artifact.

## Success Criteria

- **SC-001**: In 100% of eligible explicit-autonomous Lightweight fixtures, the existing definition-reconciliation route is selected without a user prompt; in 100% of fixtures with a viable implementation alternative, it is not selected.
- **SC-002**: Deterministically provable definition contradictions require zero artificial retry attempts, while incomplete or unverified no-alternative claims authorize zero redefinitions.
- **SC-003**: Every applied proposal has one independent semantic review bound to 100% of its coordinator-composed exact final bytes and mappings; the review covers outcome, obligation, task-scope, acceptance-obligation, decomposition-basis, invariant, successor-check, and any `dropped-defective` semantics, with zero weakened, narrowed, removed, unmapped, or review-unbound obligations.
- **SC-004**: The complete user-owned Idea, Open Questions, and Assumptions section bytes are identical before and after every accepted proposal.
- **SC-005**: Across malformed-region, log-prefix, owner, task-history, asynchronous-callback, mid-apply, post-write-parse, applied-byte, proposal-identity, review-identity, lint, and required-verification fixtures, zero invalid batches survive; every completed rollback restores all four exact prestates, and every incomplete rollback is reported distinctly.
- **SC-006**: In 100% of reconciliation fixtures, state survives only with exact-proposal review evidence of one-to-one unchanged task scope and acceptance obligations; changed, split, merged, new, and `dropped-defective` successors reopen without inherited state or completion evidence; automatic non-open archival occurs only when every FR-020 condition holds; and every other non-open drop pauses before writes.
- **SC-007**: Every accepted proposal preserves 100% of discovered work and Lightweight execution history bytes outside coordinator-authorized additions.
- **SC-008**: Tracked definition-recovery fixtures perform zero filesystem helper calls and zero writes.
- **SC-009**: When proposal-bound semantic evidence shows the same blocker and an equivalent decomposition returned without progress, Feature 009 grants zero additional redefinition authorizations without new distinguishing evidence and reaches existing `no-progress-verified`; deterministic identities alone authorize or reject zero semantic-repeat cases.
- **SC-010**: Every resumed run has exactly one semantic review bound before apply to the coordinator-composed final proposal, exact post-apply review-identity revalidation, fresh passing lint and required verification from the synchronous rollback callback, and a successful applicable lane-snapshot refresh; zero rejected, stale, drifted, or rollback-failed proposals resume, and zero successful proposals require a second semantic review.
- **SC-011**: Guarded, non-Work, ordinary explicit-redefinition, and tracked baselines remain unchanged; every non-open drop outside FR-020 still pauses; every safety, authority, review, rollback, and lane-boundary negative fixture still fails closed; and acceptance adds zero lanes, commands, stores, ledgers, transaction engines, objective systems, or quality reductions.
- **SC-012**: Focused recovery, structural-integrity, reconciliation, prompt-contract, generated-parity, and full regression suites pass, and a fresh independent reviewer approves the complete feature contract.

## Assumptions

- The existing exact-owner, four-path Lightweight recovery route and all-or-restored atomic batch remain the implementation base rather than being replaced.
- Existing learning governance can provide current, identity-bound evidence about failed approaches, materially different alternatives, distinguishing evidence, and `no-progress-verified`.
- The user-owned Idea, Open Questions, and Assumptions sections are the authoritative intent boundary and can be compared as complete byte sequences.
- Natural-language task scope, acceptance obligations, decomposition basis, outcome equivalence, and equal-or-stronger meaning cannot be established by deterministic code, so one independent semantic review remains mandatory and binds the coordinator-composed exact final proposal.
- Existing canonical task history contains enough durable identity and execution evidence for one-to-one, changed, split, merged, dropped, and new reconciliation.
- Fresh lint and required verification can complete synchronously inside the existing post-apply rollback boundary; a callback that cannot do so is ineligible for application.
- The existing coordinator-owned derived lane snapshot boundary can refresh after definition acceptance without joining the four-artifact transaction.
- No progress objective is required for this capability, so this definition compiles no active objective registry.

## Out of Scope

- Bounded revision autonomy or additional attempt authority.
- Any change to Feature 009, Feature 013, or Feature 014 definition packages or accepted behavior.
- `good-enough-delivery`, reduced quality, relaxed acceptance, or reinterpretation of failure as success.
- Tracked or Beads definition recovery.
- New lanes, commands, persistent stores, ledgers, transaction engines, objective systems, or generic definition-editing authority.
- Replacing coordinator ownership of task glyphs, metadata, boards, mirrors, archives, discovered work, execution history, or reconciliation state.
- Weakening exact ownership, safety floors, fresh verification, lint, independent review, or rollback evidence.
- Treating hashes, canonical identities, or deterministic normalization as proof of semantic task or decomposition equivalence.
- Automatically dropping any non-open task outside the closed explicit-autonomous Lightweight `dropped-defective` exception.
- Adding the optional derived lane snapshot to the four-artifact definition transaction.