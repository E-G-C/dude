# Feature specification: Epic continuity

Owner: `.dude/ideas/094-epic-continuity.md`
Exact identity: `.dude/specs/094-epic-continuity/spec.md`

## Outcome and scope

A user can give related features a shared outcome by making that outcome an
ordinary target feature. Its declared prerequisites supply the features needed
first. Its own definition holds the goal and acceptance condition, and its own
tasks check that the features work together. The target's ordinary name and
identity are enough to name this Epic-like scope.

Later definitions use the relevant accepted contracts, decisions, outputs, and
evidence from completed declared prerequisites as read-only context. The target
keeps references to what it relies on. Completing the prerequisites satisfies
those dependencies; it does not establish combined acceptance or bypass the
target's own definition and Work gates.

This increment establishes that pattern in definition and Ship guidance and
documents how to use it. It keeps existing per-feature progress and execution.
It adds no separate Epic record, feature type, membership field, command, state,
board, aggregate progress view, or user interface.

Other exclusions:

- Inferring membership from related prose, names, or lifecycle numbers.
- Creating or enrolling additional features without their existing authority.
- Automatically changing a prerequisite or an already-defined downstream
  feature to fit another feature's result.
- Cross-feature task scheduling, saved Ship approvals, automatic continuation
  after a stop, or changes to Work, tracked precedence, or execution lanes.
- Git and release actions.

## Contract amendment

This feature qualifies the reporting restriction in
[088, FR-031](../088-multi-feature-ship/spec.md). Running features together or
completing every prerequisite still proves no combined outcome. The final
response may claim the combined outcome only when the target completes normally
and its Work verification and independent review accepted the specified combined
check, identifying the checked condition and evidence. This is a result of the
target feature, not a new Epic acceptance event.

088's selection, declared membership, approval, ordering, completion recheck,
fresh per-feature Work admission, first-stop behavior, and no-Git rule remain
unchanged. Its historical package and evidence are not rewritten.

## User scenarios and testing

Story priority ranks user value, not lifecycle number or execution order.
The change is guidance over existing execution. Deterministic lifecycle tests
and checks of written rules are identified separately; neither proves a live
coordinator completed a multi-feature Ship.

### US1: Define one shared outcome without another record (Priority: P1)

As a user, I want one named target to express why its prerequisite features
belong together and what will prove their combined result.

**Independent test:** Use isolated ordinary feature records for invoice export,
invoice import, and a target requiring an export/import round trip that preserves
invoice number, currency, and total. Check the target's goal, combined acceptance
scenario, and verification task against the definition rules. Exercise the
existing lifecycle view with complete prerequisites and an unfinished target.

**Acceptance scenarios:**
1. The target holds the shared goal, a scenario that uses both prerequisite
   outputs, and a bounded task that verifies the round trip.
2. Both prerequisites can be complete while the target remains unfinished.
   Blocking its combined check leaves the target blocked.
3. Completing and accepting the target's check supplies the target's result;
   no separate Epic record or completion state is required.
4. An unrelated feature with a similar name is not added to the scope.
5. A feature with dependencies but no shared-outcome intent acquires no extra
   Epic classification or mandatory combined-check stage.

### US2: Carry accepted context into the next definition (Priority: P1)

As a user, I want a later feature's definition to account for the contracts and
outputs already delivered by its prerequisites, without changing their history
or assuming that their results verify my new feature.

**Independent test:** Review the definition rules against two completed
prerequisite packages with exact identities, a relevant output contract and
decision, and unrelated historical material. Repeat with a required contract
missing and with an outcome-changing conflict. Section-bound checks must detect
removal of each required rule. This checks guidance, not a model's live behavior.

**Acceptance scenarios:**
1. The definition uses the exact completed prerequisite packages supplied by
   the existing handoff and reads relevant accepted material without editing it.
2. The target references the source of each contract, decision, output, or
   evidence item it relies on; unrelated history is not copied into a new record.
3. A missing fact or conflict that leaves the intended combined behavior
   unresolved goes through the existing definition clarification or
   contract-mismatch path. The definition invents no answer or upstream change.
4. An upstream approval or passing result supplies context only. The target
   still needs its own required approvals, verification, and review.
5. An already-defined feature goes to Work as-is. Continuity supplies no new
   authority to rewrite its definition.

### US3: Distinguish feature completion from the combined result (Priority: P2)

As a user, I want the final response to tell me what the target's combined check
actually established, without treating a list of completed features as proof.

**Independent test:** Check the reporting rules against a completed target with
an accepted check, and cases where the check is absent, not run, failed, or
blocked, or the target is still unfinished. Require the accepted case to identify
its condition and evidence, and require every other case to withhold a
combined-success claim. Deleting either requirement must fail its rule check.

**Acceptance scenarios:**
1. All prerequisites are complete, but the target check has not run: the response
   claims no combined outcome.
2. The target completes normally with its specified combined check accepted
   through verification and review: its result identifies the checked condition
   and supporting evidence.
3. The check fails or Work stops: the response preserves that outcome and says
   nothing implying the combined result was accepted.
4. The response still lists every planned feature's result, including features
   that did not start, and preserves the first stop without retry or override.

## Edge cases

| Condition | Required behavior |
| --- | --- |
| Every prerequisite is already complete | The target still has its own lifecycle and verification. Ship adds no prerequisite approval question or extra stage. |
| A prerequisite is shared by several targets | Each target references the existing feature; no feature is duplicated or enrolled in a persistent group. |
| A completed prerequisite hides its own unfinished prerequisites | Keep 088's existing completion boundary; do not recursively expand its history for continuity. |
| A required output reference is unavailable | Identify the missing basis through the existing definition gate; do not claim to have read it. |
| A source contains a proposal beside an accepted decision | Preserve that distinction; the proposal is not an accepted contract or permission. |
| Upstream output conflicts with an already-defined target | Do not silently rewrite either package or weaken its check. Use the existing owner-qualified gap or definition route. |
| The target lacks a combined check | Its ordinary completion supplies no combined-outcome claim. Adding scope requires the existing authorized definition route. |
| A combined check passed, but the target is still unfinished | Report the check's evidence and remaining work without claiming the shared outcome is accepted. |
| A prerequisite is resolved or ownership is ambiguous | Existing lifecycle refusal applies before definition or Work; an Epic label supplies no fallback. |
| Declared prerequisites change during Ship | Keep the existing plan recheck and stop; continuity never expands the approved run. |
| Cancellation, a human-only gate, or a Work hard stop | Preserve the existing stop, with no inherited approval or automatic continuation. |
| Imported tracked work exists | Keep tracked precedence; this feature does not introduce a tracked multi-feature run. |

## Functional requirements

### Shared-outcome definition

- **FR-001:** When accepted intent calls for a shared outcome across declared
  prerequisites, the definition owner must represent it as an ordinary target
  feature, without a separate Epic record or identity.
- **FR-002:** The target's definition must state the shared user outcome.
- **FR-003:** The target's acceptance scenarios must include a check that uses
  the required prerequisite outputs together.
- **FR-004:** The target's tasks must include bounded verification of that
  combined condition, distinct from checking prerequisite completion.
- **FR-005:** Dude must use only explicitly declared prerequisites to select
  the features involved; relatedness and lifecycle numbers supply no membership
  or execution order.

### Read-only continuity

- **FR-006:** During an authorized later definition, the definition owner must
  use the exact completed prerequisite packages supplied by the existing
  handoff as read-only context.
- **FR-007:** The definition owner must reference relevant accepted contracts,
  decisions, outputs, and evidence in the target's ordinary definition, with
  enough source identity to find what the target relies on.
- **FR-008:** The definition owner must treat upstream evidence and approvals
  as context, not as the target's approval, fresh verification, or Work authority.
- **FR-009:** When required context leaves an outcome-changing fact or conflict
  unresolved, the definition owner must use the existing clarification or
  contract-mismatch path instead of inventing an answer or altering the source.
- **FR-010:** Ship must pass an already-defined target to Work as-is; continuity
  grants no additional definition-write or recovery authority.

### Results and retained execution rules

- **FR-011:** Dude must not infer combined acceptance from prerequisite
  completion, shared names, or running features in one Ship request.
- **FR-012:** The coordinator may claim a combined outcome only after the target
  completes normally with its specified check accepted through Work verification
  and independent review, identifying the condition checked and its evidence.
- **FR-013:** When that check is absent, not run, failed, or blocked, or the
  target is unfinished, the coordinator must report the actual state without
  claiming combined success.
- **FR-014:** The coordinator must preserve 088's existing plan approval,
  sequential execution, recheck, fresh admission, first-stop, and per-feature
  reporting rules when using this pattern.

## Key entities

| Entity | Meaning |
| --- | --- |
| Target feature | An ordinary feature whose accepted intent includes the shared outcome. It keeps its existing lifecycle, exact identity, definition, and tasks. |
| Declared prerequisite | An existing feature explicitly required before the target, under the existing dependency contract. |
| Continuity reference | A source reference in an ordinary definition to relevant accepted upstream material; it grants no permission or completion. |
| Combined check | The target's own verifiable acceptance condition that exercises the required outputs together. It is not a new task type or acceptance state. |

## Success criteria

- **SC-001:** In isolated ordinary-feature fixtures, completing both prerequisites
  leaves an open target unfinished; a blocked combined task leaves it blocked;
  its own completed tasks establish its normal completed stage. The plan returns
  the expected exact prerequisite identities and changes zero fixture bytes.
- **SC-002:** Section-bound checks cover every definition rule in FR-001 through
  FR-010; removing each new owning rule makes its check fail. Independent review
  confirms the shared-outcome condition does not impose extra stages on all
  dependent features.
- **SC-003:** Reporting checks distinguish all six US3 cases and detect removal
  of the evidence requirement or the prohibition on inferred combined success.
  Existing per-feature results and unchanged stops remain required.
- **SC-004:** Existing checks for Ship selection, approvals, ordering, ownership,
  tracked precedence, and Work delegation retain their results; only the
  explicitly qualified combined-outcome reporting contract changes.
- **SC-005:** Distributed guidance matches its authoritative source. This
  increment creates no Epic storage, new state field, command, or UI surface.

## Assumptions

- **Question 1, Ship-authorized definition-owner disposition:** Use the ordinary
  target pattern for the evidenced need. The existing prerequisite run provides
  order and exact read-only package context; an ordinary definition already
  holds a name, goal, acceptance scenarios, and verification tasks. No material
  evidence requires a separate identity or aggregate progress view. This is an
  owner disposition under explicit Ship, not a user answer.
- **Question 2, Ship-authorized definition-owner disposition:** Its condition
  is unmet, so introduce no separate durable record. Existing feature artifacts
  and relevant source references hold the needed continuity. No future Epic
  schema is selected or promised.
- Applicable project and bundle guardrails remain in force. No new
  project-specific candidate emerged; none is adopted, narrowed, rejected, or
  skipped. There is no UI work or inferred mockup approval.
- Automated acceptance proves existing lifecycle behavior and the written
  contracts. It does not qualify live model compliance or guarantee completion
  of a long Ship run.
