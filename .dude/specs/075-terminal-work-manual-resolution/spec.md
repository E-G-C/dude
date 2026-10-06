# Feature Specification: Terminal Work Manual Resolution

**Feature identity**: `.dude/specs/075-terminal-work-manual-resolution/spec.md`
**Idea**: `.dude/ideas/075-terminal-work-manual-resolution.md`

## Outcome And Scope

Let the user authorize a separate administrative acceptance and close of one
already-implemented Lightweight task when its old autonomous Work invocation can
no longer act. Preserve the task's genuine identity and every old failure,
learning disposition, accounting entry, and pending obligation.

The original overflow path remains supported without changing its requirements
or acceptance criteria. This re-definition adds the bounded administrative
reconciliation path below. That increment must be implemented and independently
accepted before use. Definition supplies no current permission or eligibility
verdict for Feature 068 T019, Feature 074, or any other live target.

### Original Overflow Scope

Let the user explicitly authorize fresh manual acceptance of one already-implemented
task after a narrowly supported terminal Work failure. The task keeps its identity
and requirements. Its eventual manual close does not make the failed Work run
successful or settle that run's outstanding obligations.

Initially support only an autonomous Lightweight review-repair attempt whose
completion projection stopped at the evidence-byte limit before any completion
lane write. The attempt follows an already-reviewed selected alternative whose
required learning projection is complete and verifiable. The old invocation must
be terminal with no active owner. The completion effect must be proved not to have
occurred. An unperformed historical obligation may remain recorded; an unknown or
unresolved possible side effect may not.

This path accepts the implementation currently present. It authorizes no new
implementation attempt, automatic repair, restart, supervisor restoration, task
rekeying, tracked recovery, general terminal recovery, new workflow state, or larger
evidence budget. Existing ownership records remain in place.

The original failure class is the first completion-projection overflow at the
then-active 131,072-byte limit. Its unchanged-obligation, unblocked in-progress,
retained-control, exact confirmation, absence, effect, and fresh acceptance
requirements remain mandatory. Today's resource limits are not changed.

### Administrative Reconciliation Increment

Support one already-worked, non-complete task whose old autonomous invocation is
provably terminal or abandoned and whose complete retained reviewed-learning
history deliberately prevents normal fresh admission without the old live
authority. The current work must already satisfy its explicitly defined
obligations. This is an outside-Work administrative action, not fresh Work
admission, recovery, or completion of the old attempt.

The task may remain blocked after its actual blocker has been independently
verified as resolved. Its obligations may have been explicitly amended through
definition, provided a genuine recorded one-to-one semantic mapping preserves
the same task purpose. Ownership controls may have been separately removed under
their own authorization, provided their actual preimages, removal results, and
current absence are inspectable. None of these conditions alone grants admission.

Assess the current definition rather than treating old obligations or historical
green results as current acceptance. Complete current acceptance, exact ownership
and dependency reconciliation, genuine terminal or abandonment provenance, no
active owner, and conclusive completion-effect evidence are required together.
A missing original terminal row must be reported accurately; other genuine
provenance may establish abandonment, but neither abandonment nor cleanup proves
absence of effects.

Feature 068 T019 is the reachable motivation: amended local Windows CLI acceptance
plus three retained physical-LAN sharing observations. This package does not alter
that scope, repeat native tests, request another busy-case token, or qualify
unexecuted wire-busy, broader concurrency, other physical-LAN behavior, macOS, the
GitHub Copilot App, or unknown descendant behavior. T020 and Git actions are outside
scope. Unknown historical lane or completion effects still make T019 ineligible.

Both paths reuse existing administrative authority and records. Add no command,
parser, flag, state, schema, registry, harness, daemon, generic override, larger
budget, automatic next-task selection, or authority restored from history.

## User Stories & Testing

US1 and US2 retain the original overflow acceptance contract. US3 and US4 cover
only the additional administrative reconciliation path.

### User Story 1 - Accept one task manually without rewriting its failure (Priority: P1)

As the user, I can authorize independent acceptance of an eligible terminal target
and have the coordinator close that same task manually while preserving the failed
run and its evidence.

**Independent test**: An independent Reviewer records how the guidance applies to
the synthetic eligible case, including exact current human confirmation and fresh
independent acceptance. Separately, a Tester-owned disposable fixture models those
preconditions as already satisfied, executes ordinary same-task manual close, and
compares the complete expected task-state postimage and retained evidence bytes.
The walkthrough proves interpretation; the executed fixture proves writer behavior.
Neither authenticates a real operator, establishes real owner absence, or runs or
restores the old invocation.

**Acceptance scenarios**:

1. Given complete eligibility evidence, when the user confirms the exact current
   target and evidence and fresh independent verification and review pass, then the
   coordinator records a MANUAL disposition and uses the ordinary task close path.
   The failed run, old captures, and ownership records remain unchanged.
2. Given that confirmation, when fresh verification fails, a mandatory check is
   skipped, or independent review rejects, then the task remains unclosed, the
   actual results remain visible, and no automatic repair or retry follows.
3. Given a successful manual task close, when the coordinator reports the result,
   then it distinguishes that task's manual acceptance from the old Work hard stop
   and starts no next task.

### User Story 2 - Refuse unsafe or stale manual requests (Priority: P1)

As the user, I cannot accidentally turn missing authority or uncertain effects into
permission by asking for manual resolution.

**Independent test**: Starting with the eligible example, remove or change one
required fact at a time while keeping the other facts valid. The independent
Reviewer records the required decision and its rule basis for each case; this
walkthrough does not demonstrate runtime enforcement.

**Acceptance scenarios**:

1. Given only an exited worker, an old ownership record, or unchanged accepted
   state, when manual resolution is requested, then the coordinator refuses:
   those observations do not establish terminal ownership or absence of effects.
2. Given a possible completion write, missing required projection evidence, or an
   active or unaccounted-for owner, when the user offers approval, then the
   coordinator still refuses before any manual disposition or lane mutation.
3. Given changed requirements, task identity, current implementation, or evidence
   after the preview, when the earlier confirmation is supplied, then it is stale
   and authorizes no close.
4. Given a tracked target, an active Work invocation, or another terminal failure
   class, when manual resolution is requested, then existing behavior applies
   without converting that case into this exception.

### User Story 3 - Reconcile current acceptance without reviving Work (Priority: P1)

As the user, I can authorize current acceptance and a separate same-task close
after an old invocation can no longer act, even when its current blocker metadata,
explicitly amended obligations, or separately cleaned controls prevent use of the
original overflow procedure.

**Independent test**: The Reviewer applies the finished instructions to a
synthetic case matching those conditions, including complete retained learning,
current independent acceptance, exact semantic mapping, and separately proved
effects. A separate disposable test executes the existing administrative writer
and checks full postimages. Neither exercise grants authority over a real task.

**Acceptance scenarios**:

1. Given the complete new admission basis and current target-bound human
   permission, when independent acceptance covers every current obligation and
   the blocker is verified resolved, then only that task's obsolete blocker
   metadata and completion state may change through ordinary administrative close.
2. Given explicitly amended obligations, when current evidence is assessed, then
   the assessment uses the accepted current scope and its genuine one-to-one
   definition mapping, without inheriting completion from an older revision.
3. Given independently authorized prior cleanup, when its actual preimages and
   results match fresh absence observations, then they establish only control
   disposition. The old authority and accepted state remain unusable.
4. Given genuine abandonment provenance but no original terminal row, when all
   other gates pass, then the report describes that actual provenance and the
   missing row without inventing a returned result or settling the old run.
5. Given that the current definition permits bounded retained observations,
   when their exact sources, scope, and current applicability are independently
   verified, then they support only those obligations. No redundant native run
   or additional permission token is required merely to repeat retained evidence.

### User Story 4 - Keep reconciliation narrower than a Work override (Priority: P1)

As the user, I can distinguish a supported administrative task outcome from an
unsafe attempt to reopen sealed learning, bypass acceptance, or acquire authority.

**Independent test**: For each refusal variant in the plan, the Reviewer removes
one necessary fact while holding the other facts valid and records the owning
rule and decision. Existing runtime refusal tests remain unchanged.

**Acceptance scenarios**:

1. Given unknown completion effects, incomplete retained authority, an active
   owner, or unresolved dependency or blocker, when reconciliation is requested,
   then it refuses before any disposition, metadata edit, or close.
2. Given a split, merge, rekey, changed task purpose, ambiguous owner, or an
   unreviewed scope amendment, when an old task key or green result is offered,
   then neither supplies the missing semantic mapping or current acceptance.
3. Given only implementation direction, old Work permission, a model-generated
   approval, or cleanup permission, when administrative close is proposed, then
   no current close authority is inferred.
4. Given stale preview bindings, failed or skipped required acceptance, or a
   post-write failure, when the coordinator reports, then it preserves the
   actual refusal or partial outcome and performs no automatic retry or next task.

## Requirements

FR-001 through FR-014 are unchanged obligations of the Original Overflow Scope.
FR-015 through FR-030 define the separate Administrative Reconciliation Increment;
they do not relax the original path or normal Work.

- **FR-001**: The coordinator must admit only the initial failure class and complete
  conditions in Outcome And Scope, for one in-progress task with one exact defined
  feature owner in the live Lightweight lane.
- **FR-002**: Before offering authorization, the coordinator must establish that
  the exact old invocation returned a terminal result and that no invocation,
  supervisor, worker, or pending handoff remains able to act for that target.
  Use current authoritative host observations or independently established operator
  confirmation of owner absence; age, process identifiers, worker exit, ownership
  records, or a model assertion alone are insufficient.
- **FR-003**: The coordinator must prove that the rejected completion entered no
  lane writer and produced no completion projection or receipt, using the original
  operation evidence and fresh comparison with the relevant pre-write surfaces.
  Missing, partial, conflicting, or unknown effect evidence requires refusal.
- **FR-004**: The coordinator must obtain explicit human confirmation bound to
  the exact feature and durable task, terminal evidence, accepted run revision, and
  current requirements and implementation revision before manual acceptance work.
  Generic assent, previous execution permission, and retrospective questions do
  not supply that confirmation.
- **FR-005**: That confirmation must authorize only fresh acceptance and, if it
  succeeds, ordinary manual close of the already-present work under the same task
  identity and unchanged requirements.
- **FR-006**: A fresh matching Tester and an independent Reviewer must establish
  acceptance of the current revision against every current required obligation.
  Historical results and author self-report cannot replace either result; required
  checks must pass, and failures, rejections, and skips must remain visible.
- **FR-007**: The coordinator must recheck ownership, owner absence, evidence, and
  the confirmed current revision before the first disposition or close write.
  Material drift invalidates confirmation and affected acceptance evidence.
- **FR-008**: After fresh acceptance and before lane mutation, the coordinator must
  append a clearly labeled MANUAL disposition to the exact owner's existing log.
  It must identify the target, terminal basis, confirmed revision and permission,
  fresh acceptance evidence, retained controls, and limited manual-close authority.
  It must not declare Work settlement or learning resolution.
- **FR-009**: Only the coordinator may close the same canonical task through the
  ordinary Lightweight close protocol, including its existing consistency,
  logging, and validation obligations.
- **FR-010**: Manual handling must preserve all previous history and captures,
  failed results, learning dispositions, accepted run state, counters, pending
  obligations, permits, and receipts without rewriting or relabeling them.
- **FR-011**: Manual handling must preserve retained ownership records unchanged.
  Any cleanup requires separate authority under existing cleanup rules; manual
  acceptance promises neither cleanup nor later Work admission.
- **FR-012**: The coordinator must never infer manual authorization from a Work
  stop or use MANUAL to restore a pending effect, resume the old run, waive
  acceptance, launch a hidden retry, or select the next task automatically.
- **FR-013**: All Work behavior outside this explicit manual path must remain
  unchanged, including ownership, learning seals, verification, review, admission,
  cancellation, recovery, settlement, and resource limits.
- **FR-014**: If ordinary close partially writes and then fails, the coordinator
  must report the actual committed and uncompleted effects without claiming
  rollback, successful close, or permission to retry.

- **FR-015**: The coordinator must admit the additional path only for the bounded
  already-worked task and retained reviewed-learning condition in Administrative
  Reconciliation Increment, outside any active Work invocation.
- **FR-016**: Before admission, the coordinator must reconcile the exact current
  defined owner, canonical task, dependencies, and definition history. Any owner
  diagnostic, unsatisfied dependency, missing mapping, or non-one-to-one semantic
  change refuses; a retained key alone is insufficient.
- **FR-017**: A matching independent verifier must establish resolution of the
  actual current blocker before the coordinator may remove its obsolete metadata.
  An amendment, completed prerequisite, or assertion that the blocker is stale
  cannot substitute for that proof.
- **FR-018**: The coordinator must establish the exact old invocation's terminal
  or abandoned disposition and current absence of every owner able to act.
  It must use genuine invocation and lifecycle evidence, report a missing terminal
  row accurately, and refuse an unaccounted supervisor, worker, or pending handoff.
- **FR-019**: The coordinator must require fully inspectable original authority,
  failure, occurrence, and reviewed-learning evidence, with complete matching
  retention on its authoritative surfaces. Summaries, hashes without preimages,
  reconstructed captures, or returned historical state alone are insufficient.
- **FR-020**: The coordinator must reconcile actual operation evidence and
  relevant preimages with current lane and completion surfaces. The proof must
  account for known earlier writes and establish that the old completion neither
  closed the task nor left any possibly applied completion effect. Missing,
  one-sided, conflicting, unknown, or unsettled possible effects refuse.
- **FR-021**: The coordinator may recognize already-removed controls only from
  their actual preserved preimages, separate cleanup authorization, observed
  results, and fresh absence checks. Otherwise any retained complete pair stays
  unchanged; missing or partial unexplained controls refuse. Cleanup grants no
  task authority and restores nothing.
- **FR-022**: The coordinator must obtain explicit current human permission for
  acceptance, removal of the named resolved blocker metadata, and conditional
  same-task administrative close, bound to one exact current preview of the
  target, current definition and material, evidence, effects, and control disposition.
  A literal natural-language reply may unambiguously refer to that preview;
  no new prescribed phrase or token is required.
- **FR-023**: The coordinator must limit that permission to the displayed
  administrative action. General implementation direction, prior Work or Ship
  permission, cleanup consent, retrospective questions, model assertions, and
  native-operation approval do not supply it or expand it into other operations.
- **FR-024**: A matching independent Tester and an independent Reviewer must
  establish acceptance against every current explicitly defined obligation and
  the exact current material. Retained observations qualify only where the
  current definition permits them and fresh inspection verifies their actual
  sources, provenance, and applicability. Keep still-matching current acceptance;
  require missing or invalidated checks, not redundant native reruns. Old greens,
  unsupported substitutions, required skips, or review rejection cannot pass.
- **FR-025**: Before the first administrative write, the coordinator must freshly
  recheck every preview binding, dependency, blocker-resolution proof, acceptance
  result, owner-absence finding, control disposition, and effect comparison.
  Material drift invalidates the affected permission and acceptance.
- **FR-026**: After all gates pass, the coordinator must append a distinct
  administrative MANUAL disposition to the existing exact owner log before task
  mutation. It must identify the actual terminal or abandonment basis, current
  obligations and semantic mapping, permission, acceptance, resolved blocker, and
  effect and control findings, without declaring Work or learning resolution.
- **FR-027**: Only the coordinator may then remove the exact obsolete blocker
  metadata and close the same canonical task through ordinary administrative
  writing, snapshot, render, log, backlog, and validation duties. It must not
  create an intermediate Work claim or alter task meaning, identity, or dependencies.
- **FR-028**: Administrative reconciliation must preserve old run and capture
  bytes, all failure and learning history, pending obligations, accounting,
  permits, receipts, cleanup evidence, archives, and discovered work unchanged.
  It must neither restore nor use them as live authority or add a Work settlement
  or learning-resolution record.
- **FR-029**: The additional path must leave normal Work admission and all runtime
  behavior unchanged. Implementing or completing this feature grants no actual
  target close, native operation, automatic restart, next task, or Git action.
- **FR-030**: The coordinator must report only the actual administrative outcome
  and supported current acceptance scope, separately from old Work history.
  If any ordinary write or validation fails, it must stop and report committed
  and incomplete effects without claiming rollback, successful close, or retry
  permission.

## Key Entities

- **Target**: The exact owned feature, durable task, current obligations, and
  work being considered for acceptance. The original path requires unchanged
  failed-attempt obligations; the increment requires the accepted current definition.
- **Terminal basis**: Existing evidence of the old result, accepted revision,
  ownership disposition, and known absence of completion effects.
- **Human confirmation**: Current, target-bound permission in the existing
  coordinator interaction.
- **MANUAL disposition**: An append-only explanation of separate manual authority
  in the existing owner log, not a new task state or a replacement Work outcome.
- **Current reconciliation basis**: For the additional path, the accepted current
  obligations, genuine one-to-one task mapping, dependency and blocker findings,
  actual terminal or abandonment provenance, and independently checked evidence.
  It is ordinary evidence, not a new stored authority object.

## Edge Cases

- A terminal reason or equal accepted state does not prove that no writer ran.
  An uncertain or one-sided effect refuses even when the implementation looks good.
- Earlier reviewed learning can remain retained while the old alternative and
  attempt remain unsettled. Manual acceptance does not clear or reopen that branch.
- If the old supervisor's absence cannot be independently established, retained
  records stay untouched and the manual path is unavailable.
- A post-preview implementation fix needs separate authorization and fresh
  acceptance; it cannot inherit the earlier manual confirmation.
- Evidence that cannot be inspected completely within existing limits stops
  acceptance. History is not shortened, split into a replacement Work packet, or
  rewritten to make it fit.
- A close-time projection or validation failure is reported at its actual boundary;
  preserving history does not imply an atomic multi-surface close.
- In the additional path, a blocked task, amended scope, or absent control pair
  never substitutes for proof. Unreviewed changes and merely asserted cleanup
  refuse even if every software check is green.
- A retained unperformed obligation may remain historical only when actual
  evidence rules out an unresolved possible effect. An unqualified product
  limitation is not evidence that a workflow completion effect did not occur.
- A completed prerequisite does not close its dependent task. Neither
  reconciliation nor independent acceptance of one task selects its successor.

## Success Criteria

SC-001 through SC-005 retain the original overflow acceptance criteria.

- **SC-001**: The Reviewer's recorded eligible-case judgment requires exact current
  human confirmation and fresh independent Tester and Reviewer acceptance before
  MANUAL and close. In a separate disposable fixture with those preconditions
  explicitly modeled, the Tester executes manual close of exactly the same task
  and verifies one modeled MANUAL disposition followed by ordinary close events.
  Modeled permission and acceptance supply no authority for a real target.
- **SC-002**: In the recorded independent walkthrough, every unsupported or
  incomplete admission example requires refusal before a MANUAL disposition or
  lane mutation.
- **SC-003**: The executed fixture compares retained synthetic old-run, capture,
  ownership-record, and history-prefix bytes before and after close and proves
  they are unchanged. The complete task-state postimage contains only the expected
  same-task close and ordinary derived updates; task identity, requirements, and
  other tasks remain unchanged. No retained failed or skipped result becomes a pass.
- **SC-004**: The walkthrough's successful-report example identifies the manual
  task outcome, preserves the old terminal failure and outstanding obligations,
  and makes no restart, cleanup, next-task, or future-admission claim.
- **SC-005**: Existing ordinary Work and manual-close cases retain their prior
  behavior unless all conditions of this explicit exception apply.

- **SC-006**: The additional-path walkthrough admits the complete blocked,
  explicitly amended, separately cleaned-control case only after every current
  gate passes. It also accepts genuine abandonment provenance without inventing
  an unavailable terminal row, and refuses the same case when effect proof is absent.
- **SC-007**: Every additional-path refusal variant in the plan has a recorded
  independent decision and rule basis. No missing authority, stale material,
  unresolved blocker, or unknown effect is replaced by permission or old success.
- **SC-008**: A separate executed disposable fixture proves exactly one
  same-key blocked-to-done close with only the approved blocker-line removal,
  ordinary owner-log appends, and expected derived updates. Complete postimage
  and retained-byte comparisons prove that other tasks, current obligations,
  dependencies, old run and learning records, and cleanup preimages are unchanged.
  Removed controls remain absent; no Work authority or history is manufactured.
- **SC-009**: The successful administrative report names the current accepted
  scope and its unqualified limits, actual provenance, and separate task outcome.
  It leaves old failure, learning, pending obligations, and accounting unresolved
  exactly as recorded and makes no successor, native-consent, or Git claim.
- **SC-010**: All original manual acceptance checks remain valid, normal runner
  refusal regressions retain their behavior, and the additional guidance reaches
  the same four existing generated instruction surfaces without runtime changes.

## Assumptions

The existing coordinator, owner log, manual task writer, and independent
verification and review roles suffice. This is a cooperative instruction-level
procedure, not protection against a malicious coordinator. Missing evidence makes
a target ineligible rather than justifying a new recovery capability.
