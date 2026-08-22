# Feature Specification: Ship Checkpoint Autonomy

## Purpose

Ship is intended to carry one feature through intake, definition, and Work until
the feature is done or an authoritative stop is reached. Today, a pre-Work stage
can interrupt solely because its workflow labels a decision as a checkpoint,
even when the accepted intent and available evidence already make one safe answer
clear.

This feature lets each existing pre-Work stage owner exercise bounded judgment
during an explicit Ship invocation. Owner eligibility, prerequisite, authority,
and safety gates run first. Only then may the owner continue without asking when
one conservative disposition is clearly dominant within its authority and leaves
no material unresolved risk.

The policy includes a narrow durable exception for definition guardrails. The
definition owner may adopt clearly protective, applicable candidates, or reject
an all-irrelevant set and continue under existing guardrails, under the authority
of the explicit Ship invocation. Attribution remains honestly Ship-authorized
rather than user-ratified. Genuine ambiguity still stops, and Work remains
unchanged once it begins.

## Relationship To Feature 017

This specification narrowly supersedes three coupled Feature 017 clauses:

- User Story 3 acceptance scenario 3, only where it requires every brainstorm or
  definition clarification or guardrail-ratification checkpoint to stop for the
  user's answer;
- FR-017, only its user-controlled/no-Ship-answer prohibition as applied to an
  already-answered clarification or a qualifying guardrail disposition; and
- SC-006, only its requirement that clarification and guardrail-ratification
  regressions produce identical stops with and without Ship.

The supersession applies only to an owner-eligible, answerable pre-Work
disposition during an explicit Ship invocation. It permits the existing
definition owner to resolve an already-answered clarification, adopt a wholly
protective set, narrow a qualifying mixed set, or reject an all-irrelevant set
and continue under applicable existing project and bundle guardrails. The same
stage owner and write authority remain, and every autonomous guardrail
disposition is Ship-authorized rather than a user checkpoint response.

Feature 017 FR-017's protections against turning genuine ambiguity into
assumptions and granting a one-round bypass remain authoritative. SC-006's
same-authority result and every non-conflicting regression subject remain
unchanged, including lean definition, verification, review, ownership,
reconciliation, close, audit, reporting, learning governance, and tracked
definition recovery. Feature 017's invocation and target validation, tracked
precedence, lifecycle and artifact ownership, stage-owner hard refusals, and all
other requirements also remain authoritative. In particular, FR-019 continues
to govern every Work stop, validation, verification, review, recovery,
reconciliation, close, audit, reporting, and learning rule without amendment.

## User Scenarios & Testing

### User Story 1 - Continue through answerable pre-Work checkpoints (Priority: P1)

As a Ship user, I want an existing pre-Work stage owner to make a clearly
dominant conservative decision from accepted intent and evidence, so that a
checkpoint label alone does not interrupt autonomous delivery.

**Why this priority**: Avoiding unnecessary pre-Work interruption is the primary
outcome.

**Independent Test**: Exercise eligible intake and definition decisions whose
basis already determines one conservative disposition, alongside equivalent
cases that fail an existing owner gate. Confirm the answerable cases continue
without a user prompt and every owner-gate failure retains its prior refusal.

**Acceptance Scenarios**:

1. **Given** an explicit Ship invocation and a pre-Work decision whose existing
   owner gates have passed, **When** accepted intent, context, guardrails,
   evidence, and the user's interests make one conservative disposition clearly
   dominant within the owner's authority, **Then** the owner applies that
   disposition and Ship continues without asking the user.
2. **Given** a decision described as a "normal checkpoint," **When** the label is
   the only reason to interrupt, **Then** the label neither establishes
   ineligibility nor causes a stop.
3. **Given** definition reaches a clarification whose answer is already supplied
   by accepted intent or material evidence, **When** the definition owner
   evaluates it under Ship authority, **Then** definition resolves it without
   inventing a fact, assumption, choice, permission, or user attribution.
4. **Given** an existing owner prerequisite, authority boundary, safety rule, or
   hard refusal does not pass, **When** Ship reaches that stage, **Then** the
   existing owner returns its established refusal before answerability is
   considered.

### User Story 2 - Resolve clear definition guardrail sets (Priority: P1)

As a Ship user, I want the definition owner to apply a clearly determined
guardrail disposition, so that an obviously protective or irrelevant set does
not require a round trip that adds no decision.

**Why this priority**: Guardrail ratification is the concrete recurring
checkpoint that motivated the feature and the only new durable-policy exception.

**Independent Test**: Present a wholly protective set, a mixed set with clearly
irrelevant candidates, an all-irrelevant set, and sets requiring a material
rewrite, tradeoff, or conflict decision. Confirm the first two adopt, the
all-irrelevant set is rejected while existing project and bundle guardrails
continue, and no autonomous result is attributed to the user.

**Acceptance Scenarios**:

1. **Given** a definition candidate set that is wholly protective, applicable,
   consistent with accepted intent, and within existing definition authority,
   **When** explicit Ship reaches the guardrail gate, **Then** the definition
   owner adopts the set under Ship authority and continues.
2. **Given** a mixed candidate set, **When** some candidates are clearly
   irrelevant, speculative, or contrary to accepted intent, **Then** the
   definition owner may remove only those candidates and adopt the qualifying
   remainder without materially rewriting any candidate.
3. **Given** a candidate set in which every candidate is clearly irrelevant,
   **When** explicit Ship reaches the guardrail gate, **Then** the definition
   owner rejects the whole set and continues under the applicable existing
   project and bundle guardrails.
4. **Given** a candidate set that requires material rewriting, a tradeoff,
   resolution of a conflict, or consequential judgment under uncertainty,
   **When** definition evaluates it, **Then** it stops for the user and identifies
   the outcome-changing choice.
5. **Given** applicable project guardrails already govern the project, **When**
   definition chooses an autonomous disposition, **Then** it does not use
   `skip` in a way that discards those applicable project rules.
6. **Given** the definition owner adopts, narrows, or rejects all candidates under
   Ship authority, **When** the coordinator reports the result, **Then** it
   identifies the disposition as Ship-authorized and does not say the user
   accepted, edited, rejected, skipped, or supplied the answer.

### User Story 3 - Preserve genuine stops and Work authority (Priority: P1)

As a Ship user, I want uncertainty and existing authority boundaries to keep
their established owners, so that bounded pre-Work judgment does not become a
general permission bypass.

**Why this priority**: The feature is safe only if owner gates and Work's complete
contract retain precedence.

**Independent Test**: Exercise unresolved intent, unavailable evidence,
user-owned authority, target and ownership diagnostics, tracked precedence, and
representative Work stops. Confirm pre-Work ambiguity produces an actionable user
stop and Work outcomes are identical to the current Work contract.

**Acceptance Scenarios**:

1. **Given** an owner-eligible pre-Work decision with no clearly dominant
   disposition, **When** Ship cannot proceed within bounded authority, **Then**
   the stop states what basis is missing, why delegation is insufficient, and
   which user choice would change the outcome.
2. **Given** unresolved or changed product intent, unavailable material evidence,
   user-owned authority, or consequential uncertainty, **When** an existing owner
   evaluates the decision, **Then** Ship does not turn the gap into an assumption
   or a one-round bypass.
3. **Given** target ambiguity, tracked precedence, canonical ownership failure,
   lifecycle refusal, or another existing stage-owner hard stop, **When** Ship
   reaches it, **Then** its current owner and outcome remain unchanged.
4. **Given** Work has begun, **When** Work returns any natural stop, hard stop,
   verification or review failure, recovery outcome, or learning-governance
   result, **Then** Ship returns it without reinterpreting, minimizing, retrying
   around, or overriding it.
5. **Given** an ordinary brainstorm, define, or Work invocation rather than
   explicit Ship, **When** it reaches a checkpoint, **Then** this feature grants
   it no new autonomy.

### User Story 4 - See what Ship decided and diagnose unnecessary stops (Priority: P2)

As a Ship user, I want autonomous pre-Work dispositions reported plainly, so that
I can understand what continued and distinguish a genuinely required stop from
an unnecessary interruption.

**Why this priority**: Bounded autonomy needs visibility without another ledger
or audit system.

**Independent Test**: Complete and stop Ship invocations containing autonomous
pre-Work dispositions, then apply the fixed-basis `why did you stop?`
counterfactual. Confirm reporting uses the existing response, persists no new
audit record, and treats a changed basis as inconclusive.

**Acceptance Scenarios**:

1. **Given** one or more autonomous pre-Work dispositions, **When** the same Ship
   invocation returns a final or stop response, **Then** the response identifies
   each checkpoint, disposition, and concise rationale.
2. **Given** reversibility or residual risk is material, **When** the disposition
   is reported, **Then** that material detail is included; otherwise no
   boilerplate risk field is required.
3. **Given** a user asks `why did you stop?` without changing the target,
   accepted intent, material evidence, workflow state, authority, or environment
   and without adding a fact, choice, permission, or authority, **When** the
   original stop is reassessed, **Then** the question can falsify an unnecessary
   stop but grants no permission.
4. **Given** any part of that decision basis changed, **When** the retrospective
   test is applied, **Then** its result is inconclusive.
5. **Given** a pre-Work disposition and a later Work disposition in one Ship
   invocation, **When** reporting completes, **Then** the pre-Work item stays in
   the coordinator's invocation response and the Work item stays in Work's
   existing audit and reporting.

## Edge Cases

- A stage calls a decision a checkpoint but has not yet run its selection,
  ownership, authority, or safety gates. The gates run first.
- Accepted intent states the answer directly, but the generated clarification
  still asks for it. Definition may use the accepted answer without writing a
  new user answer or attributing one.
- Evidence strongly favors a convenient option but not the conservative one. The
  clearly dominant test is not met.
- Two protective choices have materially different costs or reversibility. The
  tradeoff remains a user decision.
- A guardrail set is mostly applicable, but one candidate would expand product
  scope. The definition owner may remove that candidate only when its
  irrelevance, speculation, or conflict with accepted intent is clear; otherwise
  the set stops.
- Every candidate is clearly irrelevant. Definition may reject the candidates
  and continue under the applicable existing project and bundle guardrails; it
  does not present that as a user `reject`.
- `skip` would omit applicable project-specific guardrails. Ship does not choose
  that disposition.
- A proposed guardrail handles secrets, spending, remote publication, or another
  action whose existing owner has not granted authority. The owner refusal
  precedes the protective-character judgment.
- A resolved ledger, ambiguous target, conflicting tracked target, or malformed
  ownership record is encountered. Existing lifecycle and ownership refusal
  remains authoritative.
- A pre-Work disposition is made, then the environment or available evidence
  changes before a retrospective question. The fixed-basis test is inconclusive.
- Work starts after several pre-Work dispositions and later stops. The
  coordinator may report the earlier dispositions but cannot alter the Work
  stop.

## Requirements

### Functional Requirements

- **FR-001**: The answerability policy MUST apply only during an explicit Ship
  invocation and only before Work begins.
- **FR-002**: Each existing pre-Work stage owner MUST apply its current
  eligibility, prerequisite, authority, and safety gates before evaluating
  answerability, and MUST retain its existing write authority.
- **FR-003**: Existing owner refusals MUST retain precedence. Examples in this
  specification MUST remain illustrative and MUST NOT become a duplicate or
  exhaustive hard-stop taxonomy.
- **FR-004**: A checkpoint label by itself MUST NOT establish ineligibility,
  answerability, or a reason to interrupt Ship.
- **FR-005**: After owner gates pass, the owner MUST continue autonomously only
  when accepted intent, applicable context and guardrails, material evidence, and
  the user's interests make one conservative disposition clearly dominant
  within existing authority and leave no material unresolved risk.
- **FR-006**: Answerability MUST remain a qualitative bounded judgment and MUST
  NOT use a fixed score, rubric, checkpoint-class allowlist, or confidence
  threshold.
- **FR-007**: The definition owner MAY resolve a clarification already answered
  by accepted intent or material evidence, but MUST NOT invent or attribute a new
  fact, choice, permission, assumption, or user answer.
- **FR-008**: When no clearly dominant disposition exists, the owning stage MUST
  stop and state the missing basis, why Ship's bounded delegation is
  insufficient, and which user choice changes the outcome.
- **FR-009**: Under explicit Ship, the definition owner MAY adopt a guardrail set
  only when every adopted candidate is clearly protective, applicable,
  consistent with accepted intent, and within existing authority.
- **FR-010**: For a mixed guardrail set, the definition owner MAY remove only
  candidates that are clearly irrelevant, speculative, or contrary to accepted
  intent. If every candidate is clearly irrelevant, the definition owner MAY
  reject the whole set and continue under applicable existing project and bundle
  guardrails. It MUST NOT materially rewrite candidates under autonomous
  authority.
- **FR-011**: Material rewriting, tradeoffs, conflicts, user-owned decisions, or
  consequential uncertainty in guardrail disposition MUST stop for the user.
  Ship MUST NOT choose `skip` when doing so would discard applicable project
  guardrails.
- **FR-012**: Every guardrail adoption, narrowing, or reject-all disposition made
  under this policy MUST be attributed as Ship-authorized definition-owner
  action and MUST NOT be represented as direct user ratification or as a user
  `accept`, `edit`, `reject`, or `skip`.
- **FR-013**: Ordinary brainstorm, define, and Work invocations MUST retain their
  current checkpoint authority and behavior. Durable guardrail-authority
  guidance MUST distinguish that ordinary rule from this explicit Ship exception
  without treating authority reconciliation as adoption of a new guardrail.
- **FR-014**: This feature MUST supersede Feature 017 User Story 3 acceptance
  scenario 3, the corresponding user-controlled/no-answer slice of FR-017, and
  SC-006's identical clarification and guardrail-stop result only for the
  owner-eligible, answerable pre-Work dispositions defined here. Feature 017's
  invocation validation, target resolution, tracked precedence, resolved-ledger
  refusal, canonical ownership, lifecycle authority, same stage owners, all
  other SC-006 outcomes, and other stage-owner hard refusals MUST remain
  unchanged.
- **FR-015**: Once Work begins, every existing Work classifier, hard and natural
  stop, validation, verification, review, recovery, reconciliation, close,
  audit, reporting, and learning-governance rule MUST remain unchanged.
- **FR-016**: Ship MUST NOT reinterpret, minimize, retry around, or override a
  stop or disposition returned by Work, and this feature MUST NOT broaden general
  Work autonomy.
- **FR-017**: Every autonomous pre-Work disposition MUST appear in the
  coordinator's existing final or stop response for the same Ship invocation
  with its checkpoint, disposition, and concise rationale; reversibility or
  residual risk MUST appear only when material.
- **FR-018**: Pre-Work dispositions MUST use transient invocation context only,
  MUST NOT enter Work's formal audit, and MUST NOT create a durable disposition
  carrier. Work-owned dispositions MUST remain in Work's existing audit and
  reporting.
- **FR-019**: `why did you stop?` MUST remain a retrospective diagnostic. It MAY
  falsify the original stop only when target, accepted intent, material evidence,
  workflow state, authority, and environment are unchanged and the question adds
  no fact, choice, permission, or authority; otherwise it MUST be inconclusive.
- **FR-020**: This feature MUST add no central checkpoint resolver, command,
  mode, parser, lane, taxonomy registry, state store, daemon, scheduler,
  persistent audit carrier, duplicate workflow, or alternate Work
  implementation.

### Key Entities

- **Explicit Ship invocation**: The existing top-level lifecycle request that
  supplies bounded pre-Work judgment authority and no new artifact authority.
- **Stage owner**: The existing intake, brainstorm, definition, coordinator, or
  Work authority that keeps its current gates and writes.
- **Owner-eligible pre-Work decision**: A decision considered only after its
  stage owner has passed every applicable prerequisite, authority, and safety
  gate and before Work begins.
- **Decision basis**: The accepted intent, applicable context and guardrails,
  material evidence, workflow state, authority, environment, and user interests
  available to the owner.
- **Autonomous pre-Work disposition**: A transient checkpoint choice and
  rationale made by the stage owner under explicit Ship authority.
- **Guardrail candidate set**: The existing definition-stage proposal whose
  qualifying rules may become durable project guardrails through the definition
  owner's existing write path.

These terms describe existing lifecycle authority and transient reasoning.
Adopted project guardrails use the existing durable guardrail artifact, and its
authority guidance may be reconciled without adding a guardrail entry.

## Success Criteria

### Measurable Outcomes

- **SC-001**: In 100% of owner-gate regression fixtures for invalid invocation,
  target or ownership ambiguity, resolved-ledger refusal, tracked precedence,
  unavailable authority, and representative safety refusals, Ship returns the
  established owner outcome before any answerability decision.
- **SC-002**: In every eligible fixture with one clearly dominant conservative
  pre-Work disposition, the owning stage continues without a user prompt; changing
  only the checkpoint label does not change the result.
- **SC-003**: Definition fixtures distinguish an already-answered clarification
  from genuine ambiguity: all already-answered cases continue with no invented
  user attribution, and all materially unresolved cases stop with the three
  actionable details required by FR-008.
- **SC-004**: Guardrail fixtures cover a wholly protective set, a mixed set with
  clearly removable candidates, an all-irrelevant set, a material rewrite, a
  tradeoff, a conflict, consequential uncertainty, and an
  applicable-project-guardrail `skip` case. The first two adopt, the
  all-irrelevant set is rejected while applicable existing project and bundle
  guardrails continue, and the rewrite, tradeoff, conflict, and uncertainty cases
  stop. The `skip` fixture never discards applicable project rules: it follows
  another qualifying disposition or stops. Every autonomous result is reported
  as Ship-authorized rather than a user `accept`, `edit`, `reject`, or `skip`,
  and durable authority guidance reflects the same narrow exception without
  adding a guardrail entry.
- **SC-005**: Representative Work-stop fixtures produce the same Work outcomes
  before and after this feature, with zero Ship reclassification, extra retry, or
  override outcomes after Work begins.
- **SC-006**: Every final or stop response fixture containing autonomous
  pre-Work dispositions reports the checkpoint, disposition, and rationale,
  while inspection finds zero new disposition files, audit records, or Work-audit
  entries.
- **SC-007**: Fixed-basis retrospective fixtures falsify an unnecessary stop only
  when all six basis categories are unchanged and the question adds no authority;
  every changed-basis fixture is inconclusive.
- **SC-008**: Repository and release inspection finds zero new checkpoint
  resolver, command, mode, parser, lane, registry, state, daemon, scheduler,
  persistent audit carrier, duplicate workflow, or alternate Work
  implementation.

## Assumptions

- Feature 017 is complete and is the starting Ship contract except for the narrow
  supersession stated here.
- Existing stage owners can inspect accepted intent and available evidence
  without a new resolver or persisted decision model.
- An explicit Ship invocation is sufficient bounded authority for the eligible
  pre-Work dispositions defined here; it grants no authority outside that scope.
- The coordinator's existing final and stop responses can include concise
  disposition bullets without a new response schema.
- The definition owner already owns guardrail persistence during definition; this
  feature changes eligibility and attribution, not write ownership.
- Existing project and bundle guardrails remain applicable unless an authorized
  disposition changes the project guardrail artifact.
- Work has a clear start boundary in the existing lifecycle and remains the sole
  owner of execution-time autonomous decisions.

## Out of Scope

- Changing Ship invocation grammar, target selection, tracked precedence,
  lifecycle resolution, or canonical ownership.
- Weakening an existing stage owner's prerequisite, authority, safety, or hard
  refusal.
- Answering genuine product ambiguity, supplying unavailable evidence, granting
  external authority, or choosing consequential user tradeoffs.
- Changing ordinary brainstorm, define, or Work behavior.
- Modifying Work's classifier, stops, retries, recovery, verification, review,
  reconciliation, close, audit, reporting, or learning governance.
- Adding a central checkpoint service, shared taxonomy, scoring model, durable
  disposition history, alternate workflow, or new execution mechanism.
