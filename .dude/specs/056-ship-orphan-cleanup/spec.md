# Feature Specification: Ship Orphan Cleanup

**Canonical identity:** `.dude/specs/056-ship-orphan-cleanup/spec.md`  
**Owner:** `.dude/ideas/056-ship-orphan-cleanup.md`

## Outcome

A surviving Work coordinator can terminally release its own unchanged
ownership-claim/checkpoint pair after a bounded rejection before work is
authorized, without asking the user to confirm that the supervisor is absent.

The Work invocation still stops. Releasing its resources does not make the
rejected input valid, complete a task, or authorize another invocation.

## Scope And Eligibility

This increment applies to the existing autonomous Lightweight Work path, whether
entered directly or through Ship. It adds one automatic finalization case:
rejection of an invalid or stale Assessment payload in a correctly bound response
to the first Assessment request for the current claim.

An Assessment is the proposed next work action. A stale Assessment is distinct
from stale ownership artifacts: the former can trigger this stop; the latter
always disqualify automatic finalization.

All of these conditions are required:

- The original coordinator and its owning execution context still survive.
  They retain the admitted invocation and worker identity independently of the
  ownership artifacts, together with authoritative accepted Work state.
- The response belongs to the exact outstanding first Assessment request.
  Cancellation, malformed response framing, foreign or replayed responses,
  transport loss, and missing context are not this case.
- Since acquiring this pair, the owner has performed only successful read-only
  inspections. It has not requested attempt authorization, dispatched work,
  advanced learning governance, or entered a lane mutation.
- Accepted Work state remains unchanged from admission. No pending attempt,
  provisional result, unverified effect, or unfinished governance or settlement
  obligation needs the pair to remain available.
- Fresh ownership checks still match the original workspace, target, defined
  feature owner, lane, and task prestate. Both artifacts are complete and match
  the owner's retained versions.
- The original terminal result is retained before release begins. No required
  audit or evidence-retention obligation remains unfulfilled.

A live coordinator, a terminal reason, an unchanged counter, or an apparently
idle pair alone is insufficient.

## User Scenarios

### US1 — Release The Owner's Pair Without A Cleanup Prompt (P1)

As a user whose autonomous Work run rejects its first Assessment, I want the
still-authorized owner to release its own safe pair so that I do not have to
confirm an orphan that has not occurred.

Independent acceptance scenarios:

1. Given every eligibility condition holds, when the correctly bound response
   contains an invalid Assessment, Work releases exactly its pair without an
   additional cleanup-confirmation prompt and returns the original hard stop.
2. Given the same conditions, when the Assessment is stale but the ownership
   pair and authoritative state are current, Work performs the same bounded
   finalization without correcting or resubmitting the Assessment.
3. Given accepted accounting from earlier work in the still-live outer
   invocation, when this claim qualifies, finalization preserves that accounting
   rather than resetting it.

### US2 — Preserve Ownership When Finalization Is Unsafe (P1)

As a user, I want uncertain or foreign ownership left untouched so that local
cleanup cannot take over another invocation or erase unresolved work.

Independent acceptance scenarios:

1. Given an otherwise eligible rejection, when either artifact differs from
   its retained version, Work removes neither artifact and reports that
   finalization was not performed.
2. Given only a returned state summary, a lost owner context, or a replacement
   worker, when cleanup is considered, the new automatic path is unavailable.
3. Given a pending attempt, effect, or governance obligation, when a rejection
   occurs, Work retains the existing stop and ownership behavior.
4. Given a valid cancellation response, Work follows the existing cancellation
   path and does not substitute the new rejection-finalization behavior.

### US3 — Keep The Stop And Future Admission Separate (P2)

As a user, I want the report to distinguish resource cleanup from execution
authority so that a cleared pair cannot silently restart my stopped goal.

Independent acceptance scenarios:

1. Given successful owner finalization, the terminal report retains the
   rejection reason and accepted state, identifies successful cleanup, and
   starts no further work.
2. Given a removal or absence-check failure, the report identifies unresolved
   cleanup separately from the original rejection and starts no replacement.
3. Given a later separate explicit execution request after successful
   finalization, Work performs normal fresh admission instead of reviving the
   prior invocation or trusting its returned state as authority.
4. Given reappearing ownership before that later admission, Work refuses the
   new claim under its existing collision rules.

## Edge Cases

| Case | Required behavior |
| --- | --- |
| Invalid initial input is rejected before any pair is acquired | Preserve the existing pre-admission refusal; there is nothing to finalize. |
| The initial Assessment falls back to an exchange, whose correctly bound payload is invalid or stale | The new path is eligible only if all other conditions still hold. |
| Response framing is invalid, foreign, replayed, out of order, or missing | Keep existing refusal behavior; do not treat a reason label as finalization authority. |
| The same payload rejection occurs after an authorization request or during later recovery | Do not use this increment's automatic finalization path. |
| Supervisor, context, independently retained identity, or authoritative state is lost | Keep the existing hard stop and manual orphan boundary. |
| The claim or checkpoint is missing, corrupt, substituted, or changed without a revision advance | Refuse before removal. |
| The feature owner, task, lane, or workspace binding changes | Refuse before removal. |
| Removal fails after the checkpoint has been removed | Stop; preserve the remaining claim and report partial cleanup. |
| An artifact changes or reappears during release | Stop further removal when detected; do not remove the replacement or report success. |
| Final absence cannot be established | Report unresolved cleanup, not successful finalization. |
| The user cancels | Preserve cancellation and its prohibition on automatic continuation. |
| A successful finalization is followed by a repeated call or another automatic claim attempt | No second automatic cleanup, retry, or replacement is authorized. |

## Functional Requirements

- **FR-001:** Work must derive finalization authority from the original admitted
  owner and its independently retained invocation context.
- **FR-002:** Work must limit the new automatic finalization path to the complete
  eligibility conditions in this specification.
- **FR-003:** Work must freshly validate the exact workspace, target, defined
  feature owner, lane, and task binding before release.
- **FR-004:** Work must retain the original terminal result before removing an
  ownership artifact.
- **FR-005:** Work must compare both artifacts with their retained authoritative
  versions immediately before removal.
- **FR-006:** Work must limit removal to the exact owner-derived pair.
- **FR-007:** Work must perform an eligible release without requesting an
  additional orphan-cleanup confirmation.
- **FR-008:** Work must make at most one automatic release attempt for the
  eligible terminal rejection.
- **FR-009:** Work must stop further removal on a detected mismatch, partial
  state, operation failure, or reappearance.
- **FR-010:** Work must report successful cleanup only after freshly establishing
  that both artifacts are absent.
- **FR-011:** Work must report cleanup disposition separately from the original
  terminal Work outcome and reason.
- **FR-012:** Work must preserve accepted Work state and retained execution
  history throughout finalization.
- **FR-013:** Work must leave task and lane state unchanged by finalization.
- **FR-014:** Work must not continue execution as a consequence of finalization.
- **FR-015:** Work must require a separate explicit execution request and normal
  fresh admission before a later claim for the stopped goal.
- **FR-016:** Work must preserve the existing cancellation behavior.
- **FR-017:** Work must keep cleanup diagnostics bounded to established facts
  without reproducing rejected payloads or private ownership credentials.

FR-014 excludes another Assessment request, implementation dispatch, automatic
retry, next-task selection, and automatic creation of a fresh invocation.
FR-015 includes current ownership, evidence, policy, limit, and both-artifacts-
absent checks. Cleanup failure supplies none of that authority; unresolved
cleanup stays with its existing owner.

## Relevant Entities

- **Owning invocation:** the surviving coordinator context and independently
  admitted identity authorized to act for the current workspace and target.
- **Accepted Work state:** authoritative accounting, pending work, completed
  results, and any governance obligations retained by that invocation.
- **Ownership pair:** the bounded claim and checkpoint belonging to one exact
  workspace-target binding.
- **Assessment request and response:** the outstanding first request and its
  matched response; response identity does not itself establish ownership.
- **Terminal result:** the original stop, its accepted-state evidence, and the
  separate disposition of the resource-release attempt.

## Success Criteria

- **SC-001:** Both eligible payload-rejection cases complete with zero additional
  cleanup-confirmation prompts, one release attempt, and both artifacts absent.
- **SC-002:** Every pre-removal refusal case in the edge-case matrix makes zero
  artifact removals.
- **SC-003:** Every finalization outcome preserves accepted-state content,
  accounting, task state, and retained history, with zero additional execution
  dispatches or automatic claims.
- **SC-004:** Every injected partial-removal, reappearance, or absence-check
  failure is reported as unresolved cleanup rather than success.
- **SC-005:** Every successful cleanup still returns the original Work hard stop;
  a later claim requires independent authorization and fresh admission.
- **SC-006:** Existing cancellation, successful task settlement, same-invocation
  next-task continuity, and true-orphan refusal scenarios retain their behavior.

These are correctness criteria, not a performance-optimization objective.

## Assumptions And Exclusions

The existing trusted coordinator and host-adapter boundary is cooperative.
Retained authority is not a cryptographic defense against a malicious
coordinator, and a response or process exit is not proof of supervisor liveness
or death.

The guarantee covers the original still-running owner at the defined boundary.
It does not cover a coordinator holding only a returned result after its runner
has ended, even if that coordinator remains alive.

This feature does not promise atomic deletion of two artifacts, crash-proof
report delivery, or protection against arbitrary concurrent filesystem
tampering. Detected drift and partial failures fail closed. No crash or lost
report authorizes continuation.

True-orphan cleanup, worker replacement, lost state reconstruction, foreign
ownership, general hard-stop finalization, automatic fresh invocations, and
general goal continuation are excluded. Existing manual cleanup remains
available only under its current prerequisites.

No UI, new command, workflow, state store, liveness service, lease, timer,
scheduler, batch cleanup, or cross-machine recovery is included. Verification,
independent review, settlement, closure, learning governance, and Work limits
are unchanged. Features 040, 055, and 060 remain separate and impose no
number-derived dependency.
