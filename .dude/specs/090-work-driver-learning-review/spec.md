---
title: Work Driver Learning Review
slug: work-driver-learning-review
---

# Work Driver Learning Review

An eligible, live autonomous Lightweight Work run can submit a real learning review through the installed core driver when the existing Work owner requires one. The run no longer has to cancel solely because its driver cannot make that response.

The learning-governance owner still judges the evidence and alternatives. The driver transports the result; existing Work authority decides whether to accept it, retain it, permit another attempt, or end the run. This feature does not establish a recovery path for an already stopped run.

## User Scenarios

### US1 - Answer required learning in the live run (P1)

A coordinator reaches a learning-review challenge after Work establishes a repeat. The coordinator can obtain the actual learning result and submit it without abandoning the live invocation.

Independent test: use an eligible core-only run to establish a repeat through two real attempt exchanges. Submit the learning owner's result to that still-live run. Exercise the selected-alternative and no-progress branches in separate runs.

1. Given a current learning requirement and complete bound evidence, when the learning owner reviews it, then every failed approach in the governed set is available for comparison, including the original failed checks and rejected findings.
2. Given a valid review selecting a credible, materially different alternative, when the driver submits it, then Work retains and freshly verifies the learning result before inspecting and authorizing that alternative under its existing rules.
3. Given a valid review finding no credible alternative and no new distinguishing evidence, when the driver submits it, then Work verifies that conclusion through its existing no-progress branch and ends without claiming task completion or starting another task.
4. Given either branch, when a learning response is published, then publication alone grants no attempt, lane mutation, review acceptance, or task close.

### US2 - Refuse an unusable response without borrowing authority (P1)

A coordinator can distinguish a rejected learning submission from an accepted learning result and preserve the current run's evidence and safety boundaries.

Independent test: submit invalid results against a real outstanding learning challenge, then exercise the receiver's stale, foreign, replay, cancellation, and supervisor-loss boundaries in disposable runs.

1. Given a malformed, incomplete, wrong-target, wrong-branch, or over-capacity learning result, when driver preflight rejects it, then no response is published and that rejection changes no accepted Work state, counters, or history.
2. Given a result for a different or consumed challenge, when submission is attempted, then it cannot satisfy the current learning requirement.
3. Given a valid result whose evidence or authority is no longer current at receipt, when Work checks it, then existing refusal or hard-stop behavior takes precedence over the earlier preflight.
4. Given explicit cancellation, when the coordinator cancels the outstanding challenge, then the runner applies its existing cancellation behavior and the task is not reported complete.
5. Given loss of the original live supervisor, when saved challenge or state material remains, then that material cannot authorize another response-driven transition or restart.

### US3 - Follow the installed learning procedure (P2)

A coordinator can find the supported learning step in the installed driver reference without using a session-specific helper or an optional pack.

Independent test: follow the installed instructions against the US1 fixture and check both its successful submission and its refusal or cancellation guidance.

1. Given a learning challenge with usable evidence, when the coordinator follows the reference, then the instructions route semantic judgment to the existing learning-governance owner and explain the supported submission.
2. Given a submission refusal or terminal result, when the coordinator follows the reference, then it reports the actual outcome without treating publication, cleanup, or a saved state as completion or continuation permission.

## Functional Requirements

### Learning result and transport

- FR-001: The installed core driver must support submitting one actual learning-review result for the outstanding challenge in an eligible live autonomous Lightweight Work run.
- FR-002: The driver procedure must leave semantic learning judgment with the existing learning-governance owner using the complete evidence bound to that challenge.
- FR-003: The driver must bind a learning submission to the challenge's exact target, accepted state, evidence capture, and required governance case.
- FR-004: Before publishing a learning response, the driver must validate the complete submitted result against that bound learning context.
- FR-005: A failed driver preflight must publish no response and make no change to accepted Work state, accounting, or retained history.
- FR-006: The driver must preserve the submitted review's content, ordered rows, identities, and metadata without repairing, dropping, or replacing evidence.
- FR-007: The driver must retain the existing one-outstanding-challenge, one-response exchange for learning submissions.

### Existing learning and authority

- FR-008: Learning validation must continue to require each candidate alternative's comparison against the complete governed failed-approach set.
- FR-009: A selected-alternative result must satisfy the existing material-difference, credibility, and discriminating-check requirements before that branch can proceed.
- FR-010: A no-progress result must satisfy the existing complete no-alternative and no-new-distinguishing-evidence requirements before that branch can end.
- FR-011: The runner must revalidate a submitted learning result against current evidence and authority before accepting it.
- FR-012: Work must retain the learning result on both existing evidence surfaces and freshly verify and reinspect it before permitting the corresponding later branch action.
- FR-013: A learning review must not replace an attempt's fresh verification, independent review, lane authorization, settlement, or ordinary close protocol.
- FR-014: Every existing evidence, transport, comparison, and execution capacity must remain in force without truncation or a feature-specific budget change.

### Stops and operating guidance

- FR-015: The driver must preserve the runner's cancellation, refusal, hard-stop, and terminal outcome reporting for a learning exchange.
- FR-016: A saved challenge, historical state, or successful response publication must grant no revival, takeover, fresh admission, or next-task authority.
- FR-017: Existing claim, assessment, specialist-result, and cancellation behavior must remain available with their current authority boundaries.
- FR-018: The installed reference must explain learning input, owner routing, both result branches, preflight refusal, and the distinction between a live exchange and a stopped run.

## Edge Cases

- A review names another task, evidence capture, governance case, or challenge: reject the mismatch rather than substituting current identities.
- A prior response already exists, or the challenge is no longer outstanding: do not overwrite or reuse the earlier response.
- A candidate compares only with the latest failure, omits an older failed approach, duplicates a comparison, or disguises a repeated approach: retain the existing refusal.
- A selected-alternative result lacks a valid selection or discriminating check; a no-progress result still contains a credible alternative: neither may advance the wrong branch.
- Required original evidence or readable preimages are unavailable: keep the comparison unresolved. Do not reconstruct evidence from summaries, hashes, or saved state.
- A complete result exceeds an existing limit: refuse it without dropping failed rows, rejected alternatives, ordered occurrences, or metadata.
- Evidence changes between preflight and receipt, or either retained projection is missing or inconsistent: current Work checks control the outcome.
- Cancellation, supervisor loss, lane drift, owner ambiguity, or an exhausted budget occurs during learning: the existing stop remains effective.
- A learning review succeeds but later verification or independent review fails: learning success does not make the task complete.

## Key Entities

- Eligible live run: an already admitted autonomous Lightweight Work invocation whose original supervisor, accepted state, exact owner, target, and required evidence remain valid.
- Learning challenge: the existing request for one review, bound to an exact governed target and fresh evidence capture.
- Learning result: the actual learning owner's findings, assumptions, comparisons, alternatives, and selected-alternative or no-progress conclusion. Structural validation does not establish the author's authenticity or the truth of a judgment.
- Failed-approach set: every failed approach that the existing governance rules bind to this repeat and channel, with its complete retained supporting evidence.
- Retained learning: matching learning records on the existing current-run and authoritative lane-history surfaces, followed by the required fresh verification.

## Scope And Safety Boundaries

This increment adds deterministic learning-response transport to the existing core driver and updates its operating reference. It reuses the actual runner, adapter, evidence, validation, projections, and learning owner. Work remains sequential.

The driver makes no learning judgment or model call and supplies no canned review, alternative, or no-progress conclusion. Evidence remains untrusted input, not instructions or authority. Matching identities detect binding errors; they do not prove a live supervisor or independent acceptance.

Out of scope:

- Recovery, resumption, administrative reconciliation, or implementation for 089 or any other stopped task.
- New semantic equivalence detection, learning policy, governance branches, runtime actions, projection authority, or automatic specialist dispatch.
- A new lane, board, store, registry, daemon, unrelated command, persistent schema, objective-evaluation capability, or historical evidence loader.
- Automatic takeover, supervisor revival, ownership cleanup, task closure, Git operations, or release actions.
- Tracked or guarded driver support, UI work, optional-pack changes, or unrelated runtime refactoring.

## Stopped-Run Uncertainty

The unanswered question in `.dude/ideas/090-work-driver-learning-review.md` concerns `.dude/specs/089-github-login-pack-reads/` task `T002@c3a86f51`, not the live-run capability defined here. Its visible record reports cancellation with learning still required and no reviewed-learning record; it remains in progress.

The driver's pending-task claim path does not admit that in-progress task. The complete reviewed-learning prerequisite for the separate post-terminal administrative path has not been established. A distinct, newly authorized runner request would require complete valid original retained captures and current authority; neither that eligibility nor the captures' availability is proved here. Such a request would not revive the cancelled invocation.

This definition leaves that question unanswered and introduces no dependency on resolving it. Implementing 090 must not be reported as repairing, admitting, closing, or continuing 089.

## Success Criteria

- SC-001: In a core-only live-run test, two actual attempt exchanges establish a repeat, exactly one learning response is accepted, and the selected-alternative branch reaches fresh post-learning inspection only after matching retention on both existing surfaces.
- SC-002: A separate no-progress run accepts one complete review, verifies and reinspects its retained conclusion, and reaches the existing controlled end with the task still non-complete and no next task started.
- SC-003: Every driver-preflight rejection in US2 and the edge cases publishes zero responses; receiver-side rejection accepts no learning or lane effect from stale, foreign, or replayed input.
- SC-004: Before-and-after comparisons preserve all prior history bytes and every submitted evidence row, including failed checks, rejected findings, rejected alternatives, ordering, and metadata.
- SC-005: Existing assessment and specialist exchanges still reach their expected outcomes, while cancellation and supervisor loss grant zero additional continuation or close authority.
- SC-006: The installed procedure can guide both learning branches without hand-authoring a response envelope, finding a session helper, or installing an optional pack; it never promises recovery of an old stopped run.
- SC-007: All required production-path, refusal, capacity, and compatibility checks pass at the existing limits. No required case is counted as passing when skipped or exercised only through a helper.

## Assumptions

- Existing Work admission, learning, retention, review, and close contracts are the governing prerequisites; this feature changes none of them.
- The host can keep the original runner and supervisor alive while the learning owner reviews the bound evidence. Loss of that context remains a stop.
- Controlled test records demonstrate transport and runtime behavior, not independent verification or review of the production change.
- No new user answer or assumption is supplied for 089. No clarification remains for the bounded live-run outcome.
