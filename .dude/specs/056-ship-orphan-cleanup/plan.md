# Implementation Plan: Ship Orphan Cleanup

**Spec:** `.dude/specs/056-ship-orphan-cleanup/spec.md`  
**Owner:** `.dude/ideas/056-ship-orphan-cleanup.md`

## Decision

Use the existing autonomous Lightweight runner's first Assessment rejection
path to finalize its original retained adapter before returning the hard stop.
Use the adapter's existing `end('hard-stop-recorded')` framing and checkpoint
store, with complete expected-pair comparison before removal.

Do not add a general terminal cleanup handler. Only a correctly bound first
Assessment response whose payload is invalid or stale can enter the new path,
and only before any authorization request or effect-producing operation under
that claim. A reason string alone never selects it.

Successful cleanup grants no new invocation. A later separate explicit Work or
Ship request must pass existing fresh admission. This is the chosen disposition
of the draft's fresh-claim question, not a deferred implementation option.

## Technical Context

**Language/Version:** JavaScript ES modules with `// @ts-check`; Node.js 20 or
later, plus Markdown guidance.

**Primary Dependencies:** Node standard library; existing feature-owner,
canonical-state, host-adapter, recovery, and Lightweight lane modules. No new
package dependency.

**Storage:** The existing bounded ownership claim and checkpoint beneath the
operating system temporary directory. No new persistent fields, files, or
project-state surfaces.

**Testing:** `node:test` in
`src\skills\dude-work\host-adapter.test.mjs`, existing recovery regressions, and
the current-format/build tests under `scripts\`.

**Target Platform:** Existing Node-supported Windows and POSIX hosts. Windows
continues to use inherited filesystem permissions; no new locking or
crash-durability guarantee is claimed.

**Project Type:** Reusable bundle runtime and its owning workflow guidance.

**Performance Goals:** Inspect only the one derived pair and the existing exact
owner/lane bindings. Add no inventory of temporary artifacts, polling,
background work, or model call.

**Constraints:** Retain existing Work outcomes, cancellation, accounting,
verification, review, settlement, close, and evidence limits. Edit authoritative
core under `src\`; generate dogfood output with `scripts\build-dev.mjs`.

## Current Source And Technical Resolutions

| Evidence | Existing behavior | Definition consequence |
| --- | --- | --- |
| `src\skills\dude-work\SKILL.md`, `Supervisor And Worker Continuity` and `Checkpoint Lifecycle And Manual Cleanup` | Work owns supervisor authority, hard stops, and cleanup. A safely recorded irreducible hard stop is an allowed terminal release boundary; actual orphans require confirmed manual cleanup. | Put the narrow eligibility rule here, not in Ship intake. |
| `src\skills\dude-work\host-adapter-runner.mjs:351-371,1226-1251` | `supervisorSession` retains random invocation/worker identity outside checkpoint bytes; `runHostAdapter` retains its ports and admitted adapter in the current call. | This unreturned call is the concrete production owner context. Nothing is recovered from public output. |
| `src\skills\dude-work\host-adapter-runner.mjs:1094-1116` and `exchange` | `requestAssessment` distinguishes invalid and stale payloads after a matched exchange. Its rejection currently calls `orphan`. | Change only these payload-rejection branches when the initial, settled owner context is still eligible. |
| `src\skills\dude-work\host-adapter-runner.mjs:605-623,1613-1655` | `orphan` attempts no cleanup. Exchange loss and CLI EOF remain terminal. | Leave transport/context-loss behavior outside the new path. |
| `src\skills\dude-work\host-adapter.mjs`, `trustedPorts`, `survivingAuthorityFailure`, and `createCheckpointHost` | The retained handle has admitted supervisor authority, worker identity, accepted state, and the last checkpoint record. | Reuse these checks; a checkpoint, public state summary, or synthetic liveness assertion supplies no owner capability. |
| `src\skills\dude-work\host-adapter.mjs:3660-3687,4333-4347` | `clear` checks the checkpoint's active worker and host revision; `end` can clear through `hard-stop-recorded`. Full retained claim/checkpoint equality is not currently checked. | Extend the existing expected-state boundary to bind both complete artifacts. Do not describe this protection as already implemented. |
| `src\skills\dude-work\host-adapter.mjs`, `openCheckpointHost` | Fresh admission checks both artifacts absent before an exclusive claim. | Reuse unchanged admission after a later independently authorized request; do not add replacement logic here. |
| `src\skills\dude-work\host-adapter.test.mjs`, terminal-boundary tests and `focused table A: sequential challenge protocol and foreground CLI` | Existing fixtures cover retained handles, pair collisions, Assessment rejections, cancellation, and CLI exchange behavior. | Extend these source tests and the real runner path. Synthetic supervisor fixtures do not prove production supervisor death. |

The runner's trusted supervisor object is usable while its original owning call
survives. It is not an independently verifiable process-liveness service. The
new behavior runs before that call returns and requires its original capability;
it does not help a later caller whose only evidence is `stateBase64`, revision
numbers, a checkpoint, or an exited child.

## Chosen Integration

### 1. Retain Exact Pair Expectations In The Existing Checkpoint Host

Extend the existing closed checkpoint-port results that carry `record` to also
carry the immutable claim's `claimHash`. The checkpoint already has
`recordHash`. Validate both through the existing result boundary.

At successful initial claim, establish the expected claim from the same
canonical claim construction used by the default store. Retain that claim hash
beside the existing last checkpoint record in `createCheckpointHost`.
Host-authorized updates advance the expected checkpoint record only after their
existing success checks; they must not silently adopt a changed claim.

Carry these expectations through the existing update, handoff, and clear
expected-state arguments. Update their validators and in-repository test
doubles together. Handoff still changes only its permitted worker/checkpoint
facts and preserves the immutable claim. This protocol bookkeeping grants no
new handoff or resume eligibility.

The hashes are transient comparison metadata, not another evidence store and
not persisted additions to either artifact. They are not exported in runner
results or accepted from a model. A missing or mismatched expectation refuses;
there is no identity-free compatibility fallback.

For the newly automated end, recheck surviving authority inside the retained
adapter with the existing supervisor-required and settled-checkpoint checks.
The runner additionally establishes the narrower pre-authorization conditions
below. Keep ordinary legal end reasons and their existing owners; do not turn
this change into automatic finalization of every adapter hard stop.

### 2. Guard The Existing Clear Operation

Before the first removal, the store must establish:

- Both derived paths name bounded regular artifacts under the existing trusted
  temporary root.
- Both canonical artifacts match the retained claim and checkpoint hashes.
- The pair agrees with the supplied admitted invocation, active worker, target,
  and exact expected revisions.
- The new automatic path's accepted state and checkpoint are settled.

Use the existing derived key and path construction. Accept no cleanup path from
the request or rejected Assessment.

Keep the existing checkpoint-then-claim removal order so the claim reserves the
target while the checkpoint is being removed. Immediately before each removal,
revalidate the artifact still to be removed. After checkpoint removal, establish
its absence and revalidate the unchanged claim before removing that claim.
Finally prove both artifacts absent.

On an initial mismatch or incomplete pair, remove neither artifact. On a later
failure, stop without deleting a replacement or retrying the remaining removal.
Preserve any remaining collision and return the existing cleanup-failure
boundary. Do not promise rollback of an already removed file or atomic deletion
of the pair.

Revisions and hashes detect observed drift; they are not filesystem locks. This
design relies on the existing single admitted writer and refuses detected
interference. It introduces no lock, lease, timer, sweep, or takeover mechanism.

### 3. Select The Narrow Runner Case By Control-Flow Provenance

In `requestAssessment`, retain the distinction between a successfully matched
exchange envelope and rejection of its payload. Only the latter can nominate
the new path.

Before finalization, deterministically check:

1. This is the first Assessment exchange for the current claim, and no
   authorization request, specialist dispatch, governance transition, or lane
   operation has been entered under that claim. Reuse existing step/phase
   evidence rather than adding a persistent counter.
2. Since admission, every adapter operation was a successful fresh Inspection.
   The original adapter remains active; no handoff or replacement is involved.
3. Accepted canonical RunState bytes, hash, and accepted revision still match
   admission. Existing accounting may be nonzero and must remain unchanged.
4. There is no pending attempt, pending completion, pending effect, or unfinished
   learning, evaluation, projection, receipt, or audit obligation.
5. Fresh `freshLaneBinding` resolution matches the original exact owner,
   canonical target, workspace, task mapping, lane, and prestate.
6. The original supervisor capability and worker identity still match, and the
   complete pair passes the adapter/store checks.

A completed bound response is not itself liveness proof. Any observed
supervisor/context/transport loss disqualifies the path. Do not catch arbitrary
exceptions and reinterpret them as eligible cleanup.

Leave malformed envelopes, foreign/replayed/out-of-order replies, missing
exchange capability, EOF, exchange errors, later Assessment requests,
specialist-result failures, governance failures, capacity stops, and unknown
effects on their existing routes. In particular, a
`challenge-response-invalid` string raised by the CLI transport is not the
payload-rejection provenance needed here.

### 4. Retain The Stop Before Release And Report It Once

Keep `finish` as the single terminal-report boundary. Prepare and retain the
original hard-stop row and its existing halt report before invoking the private
eligible-path finalizer. If required result retention or state validation fails,
do not release the pair.

Invoke the retained adapter's `end('hard-stop-recorded')` once. Its internal
`ended` result describes resource lifecycle only. Do not replace the runner's
Work outcome with that result or route it through reporting that discards the
original refusal evidence.

Use the existing transient result surface:

| Disposition | Runner reporting |
| --- | --- |
| Pair released and absence verified | Preserve `outcome: 'hard-stop'`, original `reason`, safe `detail`, and halt report; set `cleanup: 'cleared'` and `orphan: false`. |
| Eligibility or pre-removal comparison fails | Preserve the original hard stop; report `cleanup: 'not-attempted'` with a bounded owner-derived cleanup reason. |
| Removal or final absence check fails | Preserve the original hard stop; report `cleanup: 'failed'` and the cleanup hard-stop reason separately. |

For an unsuccessful release, preserve the existing ownership diagnostic when
available. The existing `orphan` flag describes retained unresolved artifacts;
it must not be presented as proof that a supervisor died. A separate transient
`cleanupReason` may carry only a validated owner-derived reason, never an
exception message or rejected input.

Preserve `stateBase64`, `stateHash`, and `acceptedRevision`. Host revision may
advance through the real end framing; report the actual value rather than
fabricating one. Do not write an additional Work audit, learning event, task
event, or persistent finalization record.

The CLI still emits one terminal result and exits nonzero for the preserved hard
stop. A successful release sends no further exchange challenge and starts no
new claim. A failed release is not retried.

### 5. Keep Later Execution Under Existing Authority

The terminal return ends this invocation's execution authority. Do not return
a restart token, retain a background callback, or automatically call
`runHostAdapter` again.

A later explicit Work or Ship request follows normal selection, exact ownership,
evidence acquisition, policy validation, lane prerequisites, and fresh
exclusive admission. The old result is evidence of what stopped, not a way to
revive its RunState, counters, permits, or pending work. Existing retained-history
requirements still apply.

Keep the pending task's state unchanged by cleanup. This feature does not
settle, block, close, or reclassify it.

## Source And Generated Write Boundaries

Authoritative changes are limited to:

- `src\skills\dude-work\host-adapter.mjs`
- `src\skills\dude-work\host-adapter-runner.mjs`
- `src\skills\dude-work\host-adapter.test.mjs`
- `src\skills\dude-work\SKILL.md`
- `docs\commands.md`
- `scripts\current-format-contract.test.mjs`

Regenerate only the corresponding changed dogfood core outputs:

- `.github\skills\dude-work\host-adapter.mjs`
- `.github\skills\dude-work\host-adapter-runner.mjs`
- `.github\skills\dude-work\SKILL.md`

Do not edit generated core directly. Do not change `recovery.mjs`'s stop taxonomy,
budgets, state schema, governance, or permit rules. Do not change Ship intake,
Canvas, another feature ledger/package, a task-state snapshot, or a manifest.
Unexpected additional generated changes require scope resolution rather than
silent inclusion.

## Verification Design

Use disposable fixture workspaces and temporary checkpoint roots. No test needs
a real orphan, another session, a live provider, or process-death inference.

Add focused tests under the name prefix `056 owner finalization`. Exercise the
real runner and default store as well as deterministic fault-injected ports.

| Check group | Required observations |
| --- | --- |
| Eligible invalid and stale payloads | Correct envelope and initial claim; exactly one clear; both artifacts absent; original hard stop; no extra challenge, authorization, dispatch, or claim. |
| Authority and state refusals | Missing/mismatched supervisor capability, stale worker, returned-state-only caller, changed owner/prestate, pending obligations, or later phase yields no new automatic release. |
| Exact artifact guards | Independently changed claim and checkpoint, including valid recomputed internal hashes with unchanged revisions, are refused before deletion. Include partial, corrupt, and unsafe-file cases. |
| Partial-release failures | Fail each removal and absence check; inject claim drift and checkpoint reappearance at deterministic boundaries; assert no replacement deletion, second cleanup attempt, or false success. |
| Reporting and accounting | Preserve accepted bytes/hash/revision, nonzero prior accounting, original diagnostics, and unresolved halt attribution. Do not echo hostile payloads or credentials. |
| Fresh admission | Successful cleanup alone causes no claim; a separately invoked fixture admission checks absence anew; remaining or reappeared artifacts refuse. |
| Existing behavior | Preserve cancellation, task-settled cleanup, legal natural/controlled ends, worker handoff, closed-refusal correction, late effect failures, and manual-orphan collisions. |
| Guidance and projection | Section-bounded assertions distinguish eligible payload rejection from transport loss and forbid restart authority; generated core matches authoritative source. |

Negative tests must fail for the intended guard. Keep companion inputs valid;
do not use a broken hash, malformed envelope, or earlier failed prerequisite to
claim coverage of a later ownership check.

Proposed verification commands, not execution evidence:

```powershell
node --test --test-name-pattern="056 owner finalization|focused table A|every allowed terminal boundary|a failed clear" src\skills\dude-work\host-adapter.test.mjs
node --test src\skills\dude-work\host-adapter.test.mjs src\skills\dude-work\recovery.test.mjs
node scripts\build-dev.mjs
node --test scripts\current-format-contract.test.mjs scripts\build-dev.test.mjs scripts\build-release.test.mjs
node .github\skills\dude-lint\lint.mjs .
```

Independent review must check the eligibility boundary and reporting, not only
passing storage tests. No UI/browser acceptance or live cleanup is required.

## Guardrail Check And Complexity

| Rule | Application |
| --- | --- |
| Deterministic authority and transitions | Existing owner resolution, accepted-state validation, worker identity, exact pair hashes, and absence checks decide eligibility and effects. |
| YAGNI | One existing caller and end boundary; no general retry, new command, liveness system, or background work. |
| No duplicate state | Pair fingerprints remain private transient metadata; existing persisted pair and execution records remain the only stores. |
| Preserve execution authority | Work remains stopped; cancellation, budgets, learning, verification, independent review, settlement, and close are unchanged. |
| Source ownership | Core changes originate in `src\`; dogfood output is generated. No pack or project-state maintenance is included. |
| UI approval | Not applicable; no UI artifact or interaction is introduced. |

The only added protocol detail is complete expected-pair comparison, needed
because the current clear can miss a changed claim or checkpoint content at the
same revision. This is ordinary owner-bound resource release with optimistic
drift detection, not a recovery platform.

No supporting artifact is indispensable. The core trio contains the contract,
integration, and acceptance matrix.

## Objective Registry

This feature has no candidate-evaluation or performance-optimization objective.
Keep zero active ObjectiveRegistry regions. Use the specification's correctness
criteria and ordinary verification; do not invent an EvaluationContract or
runtime objective sequence.

## Phases And Requirements Traceability

| Phase | Durable task | Requirements | Acceptance |
| --- | --- | --- | --- |
| Foundational: exact owner-bound release | `T001@6f3a2c18` | FR-005, FR-006, FR-008, FR-009, FR-010, FR-017 | US2; artifact and partial-release matrix; SC-002, SC-004 |
| User behavior: bounded initial rejection | `T002@4b7d9e02` | FR-001 through FR-004, FR-007 through FR-017 | US1, US2, US3; SC-001 through SC-006 |
| Polish: owning guidance and bundle parity | `T003@c581e6af` | FR-002, FR-011, FR-014, FR-015, FR-016, FR-017 | Guidance boundary, full regressions, generated parity |

The tasks are sequential because they share the adapter tests and depend on the
same cleanup contract. No lifecycle number supplies dependency or priority.

## Risks And Limits

- This increment does not clean pairs left by a dead runner or handle every
  hard-stop reason. Those cases deliberately retain existing behavior.
- Two-file removal can fail partway through. Preserve the remaining collision;
  do not imply rollback or use failure to authorize replacement.
- A crash between release and terminal-result delivery can lose the report.
  No durable reporting service is added, and lost delivery grants no continuation.
- Strict pair expectations can expose incomplete injected checkpoint backends.
  Update in-repository implementations together and fail closed on missing
  metadata rather than weakening checks.
- The trusted supervisor boundary remains cooperative. Tests prove the stated
  ownership and drift checks, not supervisor death or hostile-process isolation.
