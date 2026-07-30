# Feature Specification: Autonomous Review Escalation Precedence

## Purpose

The coordinator's governing instructions disagree about what happens when independent review rejects the same finding a second time during an explicitly autonomous run. The section a coordinator consults at the moment a rejection lands states an unconditional escalation to the user. Three other surfaces defer the same case to the autonomous learning-governance owner, but they defer it using a term — "disposition" — that reads naturally as covering only what happens to the affected target: block, close, no-progress, revisit. Interrupting the user does not read as a target disposition; it reads as a separate notification obligation that survives the deferral. A careful reader can therefore honor the deferral exactly as written and still interrupt the user.

This feature makes the rule consistent. Under an explicit autonomous policy, a repeated review failure on the same finding belongs to the learning-governance owner, including whether the user is interrupted, and every governing surface says so in the same way. The correction is made by fixing the under-specified term on the sentences that already exist, not by adding a conditional carve-out, so the instruction surfaces get clearer without getting longer.

Nothing about behavior outside an explicit autonomous policy changes. Guarded and non-Work review rejection, fresh verification, and independent review are untouched, no stop is reclassified, and no runtime code path changes. The governance owner already refuses generic escalation while a learning requirement is unresolved; this feature only makes the surfaces that hand off to it say what it already owns.

This feature is item A of a three-part thread. Bounded revision autonomy under autonomous Work and automatic redefinition are sequenced follow-on work and are not owned here.

## User Stories & Testing

### User Story 1 - An autonomous run is not interrupted by a repeated review rejection (Priority: P1)

As the owner of an explicitly autonomous run, I want a second review failure on the same finding to be handled by the learning-governance owner rather than bounced to me, so an unattended run stays unattended when the governing rules already say it should.

**Independent Test**: Read the review-rejection path as a coordinator would at the moment a rejection lands under an explicit autonomous policy. Confirm the surface reached at that moment does not direct an unconditional user interruption, and that it routes the outcome — including whether to notify the user — to the learning-governance owner.

**Acceptance Scenarios**:

1. **Given** an explicit autonomous policy and a second independent-review failure on the same finding, **When** the coordinator consults the review-rejection rule, **Then** the outcome is owned by the learning-governance owner and no user interruption is directed by that path.
2. **Given** the same case, **When** the deferral sentence is read on its own, **Then** it plainly covers user escalation and notification, not only the affected target's disposition.
3. **Given** a guarded, default, or non-Work run, **When** a second failure on the same finding occurs, **Then** the escalation to the user stands exactly as it does today.

### User Story 2 - One rule, readable from any single surface (Priority: P1)

As a reader of the coordinator's instructions, I want every surface that states the review-rejection rule to state the same rule, so I never have to resolve a contradiction by reasoning about which surface takes precedence.

**Independent Test**: Enumerate every governing surface that states the repeated-failure or deferral rule. Confirm each one, read alone and without consulting the others, yields the same answer for an explicit autonomous run and the same answer for a guarded run.

**Acceptance Scenarios**:

1. **Given** the full set of governing surfaces, **When** each is read in isolation, **Then** all produce the same answer for the autonomous case and the same answer for the guarded case.
2. **Given** any surface that states an escalation, **When** it is read, **Then** it is scoped so it does not contradict the deferral and does not require precedence reasoning to reconcile.
3. **Given** the corrected surfaces, **When** their length is compared with the current ones, **Then** no surface has gained a new conditional carve-out sentence and each stays within its existing per-surface pointer budget.

### User Story 3 - No behavior, stop, or safety floor changes (Priority: P1)

As a maintainer, I want this correction to change wording only, so a change that reduces one human checkpoint cannot quietly reduce any other.

**Independent Test**: Diff the change set and confirm it touches no runtime code path. Confirm the safety floor, every hard stop, fresh verification, and independent review are unchanged, that no stop is reclassified from absolute to continuable, and that the learning-governance owner's own vocabulary is untouched.

**Acceptance Scenarios**:

1. **Given** the completed change, **When** the change set is inspected, **Then** no runtime code path, stop classification, stop reason, lane, board, command, or persistent store has changed.
2. **Given** the completed change, **When** the safety floor and gates are checked, **Then** fresh verification and independent review remain mandatory and a rejection is never treated as approval.
3. **Given** the learning-governance owner's own text, **When** it is inspected, **Then** its established use of "disposition" for the affected target's lane disposition is unchanged.

### User Story 4 - The corrected rule stays enforced and actually reaches the runtime (Priority: P2)

As a maintainer, I want the corrected wording pinned as tightly as the wording it replaces and present in the artifacts the coordinator actually loads, so the same drift cannot recur and the fix is not inert.

**Independent Test**: Confirm the existing prose-contract enforcement still pins the rule with unchanged strength and mechanism, and that the pinned strings match the corrected surfaces exactly. Confirm the artifacts the coordinator loads at run time carry the corrected wording and are in exact parity with the authoring source.

**Acceptance Scenarios**:

1. **Given** the corrected wording, **When** the prose-contract enforcement runs, **Then** it passes, and its mechanism and strength are unchanged from before.
2. **Given** a hypothetical future edit that reintroduces the unqualified escalation, **When** the enforcement runs, **Then** it fails.
3. **Given** the completed change, **When** the runtime-loaded artifacts are compared with the authoring source, **Then** they are in exact parity with no drift.

## Edge Cases

- A reader consults only the surface reached at the moment a rejection lands and never reaches the surface carrying the deferral.
- A reader honors the deferral for the affected target's disposition and still treats interrupting the user as a separate surviving obligation.
- A guarded run and an autonomous run reach the same surface; the surface must answer both without ambiguity.
- The correction would push a surface past its existing single-pointer or byte budget for the deferral sentence.
- The correction would introduce a second governance pointer on a surface that is permitted only one.
- A surface where "disposition" already correctly means the affected target's lane disposition is swept up by a blanket term change.
- The authoring source is corrected but the runtime-loaded artifacts are left stale, making the fix inert.
- The pinned contract strings are updated on some surfaces but not all, leaving the enforcement out of lockstep with the prose.

## Functional Requirements

- **FR-001** (Q1): Under an explicit autonomous policy, a second independent-review failure on the same finding MUST NOT direct a user interruption from the review-rejection path. The autonomous learning-governance owner MUST own that outcome.
- **FR-002** (Q3): Every deferral to autonomous learning governance MUST explicitly cover user escalation and notification in addition to the affected target's disposition, so no reader can honor the deferral and still interrupt the user.
- **FR-003** (Q2): Every governing surface that states the review-rejection or repeated-failure rule MUST state one consistent rule. No surface MAY state an escalation that a reader must reconcile against another surface by precedence reasoning.
- **FR-004** (Q2): The correction MUST be made by correcting the under-specified term on the sentences that already exist rather than by adding a new conditional carve-out. No corrected surface MAY gain a carve-out sentence, exceed its existing per-surface governance-pointer count, or exceed its existing per-surface pointer byte budget.
- **FR-005**: Guarded, default, and non-Work review-rejection behavior MUST remain unchanged. Fresh verification and independent review MUST remain mandatory, and a rejection MUST NEVER be treated as approval.
- **FR-006**: This feature MUST reclassify no stop, introduce no new stop reason, lane, board, command, or persistent store, and MUST change no runtime code path or observable runtime behavior.
- **FR-007** (Q4): The existing prose-contract enforcement MUST keep its current mechanism and strength. Only the pinned wording changes, and it MUST change in lockstep with the surfaces so the enforcement never lags the prose.
- **FR-008**: The learning-governance owner's own established use of "disposition" to mean the affected target's lane disposition MUST remain unchanged; only the deferral sentences that hand off to that owner are corrected.
- **FR-009**: The corrected instructions MUST reach the artifacts the coordinator actually loads at run time, and those artifacts MUST end in exact parity with the authoring source.

## Key Entities

- **Governing surface**: any instruction artifact that states the review-rejection rule, the repeated-failure rule, or the deferral to autonomous learning governance.
- **Deferral pointer**: the single sentence on a governing surface that hands the autonomous repeat case to the learning-governance owner, subject to an existing one-per-surface count and byte budget.
- **Escalation statement**: the sentence that currently directs a user interruption on a second failure of the same finding, stated without an autonomous qualifier.
- **Learning-governance owner**: the single detailed owner of repeat-triggered governance under an explicit autonomous policy; every other surface carries only authority, deferral, evidence, and pointer text.
- **Prose-contract pin**: the existing enforcement that fixes these sentences as a contract and fails when a surface drifts from the pinned wording.

## Success Criteria

- **SC-001**: In 100% of readings of the review-rejection path under an explicit autonomous policy, the path directs no user interruption and assigns the outcome to the learning-governance owner.
- **SC-002**: 100% of deferral pointers state that the deferral covers user escalation and notification as well as the affected target's disposition.
- **SC-003**: Zero governing surfaces state an escalation that contradicts the deferral, and every governing surface read in isolation yields the same answer for the autonomous case and the same answer for the guarded case.
- **SC-004**: Zero carve-out sentences are added; every corrected surface still satisfies its existing governance-pointer count and byte budget.
- **SC-005**: Zero runtime code paths change, zero stops are reclassified, and zero new stop reasons, lanes, boards, commands, or persistent stores exist.
- **SC-006**: 100% of guarded, default, and non-Work review-rejection behavior is unchanged, with fresh verification and independent review still mandatory.
- **SC-007**: The prose-contract enforcement passes with the corrected wording, its mechanism and strength are unchanged, and it still fails if the unqualified escalation is reintroduced.
- **SC-008**: The runtime-loaded artifacts and the authoring source are in exact parity with zero drift, and workspace lint reports zero failures.
- **SC-009**: The learning-governance owner's own text is unchanged, verified by inspection of its change set.

## Assumptions

These resolve the idea's open questions as conscious definition-time assumptions. The user's governing preference for questions 2, 4, and 5 was "Do not over-engineer it. Be pragmatic. Prefer simplification over complication"; each interpretation below was confirmed by the user before definition. No assumption invents scope beyond the idea's normalized intent, constraints, and relationship notes.

- (Q1) The unconditional escalation is a defect. Under an explicit autonomous policy the coordinator must not interrupt the user on a second failure of the same finding.
- (Q2) The fix is the term correction across every affected surface, not a carve-out confined to the section a rejection lands in. Correcting only that one section is insufficient, because the reviewer protocol's own procedure still states the escalation with no qualifier and the shared rules route a rejection to that protocol. The end state is one consistent rule rather than several surfaces requiring precedence reasoning. Adding a new conditional carve-out sentence is explicitly not preferred: correcting the term is less prose, not more.
- (Q3) The deferral to learning governance covers user escalation and notification, not only the affected target's disposition. Scope stays on item A; bounded revision autonomy is not imported into this feature.
- (Q4) The existing pin keeps its current mechanism and strength; only the pinned strings change. The pin is the only thing that makes this prose a contract, and loosening it would re-enable the exact drift class being fixed.
- (Q5) No new behavioral fixture is required. Surface consistency plus workspace lint plus the updated prose-contract enforcement is sufficient evidence. This is a prose-only change with no runtime change, so there is no deterministic code path to test, and a fixture asserting "no user prompt under autonomous Work" would require a model-behavior evaluation rig that is disproportionate to the change.
- (Reconciliation with Feature 013) This feature changes no runtime behavior and reclassifies no stop, so it does not conflict with Feature 013's SC-005 that no previously absolute stop becomes continuable. A review rejection was never classified as a hard stop; the runtime already classifies it as a recoverable checkpoint, and the autonomous path already licenses skipping the approval ask for an authorized recovery attempt without bypassing verification or independent review.
- (Causation) The five observed interruptions remain an inference drawn from the instruction surfaces; no run transcript was read. The defect stands on internal-consistency grounds independently of that symptom, and this feature claims no proven causal link.
- (Counter-reading) The reading that two rejections on one finding is a cross-authority conflict warranting user escalation is preserved as considered and rejected: the deferral rules were added specifically to cover this case. Because the correction reduces one human checkpoint, it was confirmed deliberately rather than treated as routine cleanup.

## Out of Scope

- Bounded revision autonomy under autonomous Work, and automatic redefinition: sequenced follow-on items B and C of the same thread, not owned here.
- Any change to the learning-governance owner's policy, phases, permits, evidence rules, or its own use of "disposition" for the affected target's lane disposition.
- Any runtime code change, including the separate known reader-constant defect recorded in project context.
- Loosening, relaxing, or restructuring the existing prose-contract enforcement.
- Any new behavioral fixture, model-behavior evaluation rig, or attempt to prove causation for the five observed interruptions.
- Reclassifying any stop, weakening any safety-floor category, or weakening fresh verification or independent review.
- Selecting exact replacement wording, which belongs to the plan and implementation rather than the spec.
