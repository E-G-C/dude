---
title: Work Driver In Core
slug: work-driver
---

# Work Driver In Core

A coordinator can run autonomous Lightweight Work, including the Work portion of Ship, using only the installed Dude core and its instructions. The bundle supplies the mechanical driver that coordinators currently have to borrow from a machine-local session kit.

The coordinator still makes semantic decisions and dispatches the implementation, Tester, and independent Reviewer. Existing Work rules and official components retain authority over selection, authorization, validation, canonical writes, settlement, and stops. This feature does not extend the runner to another execution lane or policy.

## User Scenarios

### US1 - Settle a ready task using the installed core (P1)

A coordinator starts with an eligible pending task and completes it through the official Work boundary without locating an old session or rebuilding host integration.

Independent test: install a core release into a fresh project with one defined owner and one pending task, without optional packs or a session kit. Drive a controlled task through claim, authorization, verification, review, and settlement.

1. Given an eligible pending task and a valid autonomous Work invocation, when the coordinator claims it, then the official lane records the in-progress task, matching snapshot, and one claim log entry. Setup leaves accepted Work state and accounting unchanged.
2. Given successful setup, when the runner requests an Assessment, then the coordinator can submit a validated response and wait for the authorization-bound specialist request before starting implementation.
3. Given an authorized change and accepted Tester and independent Reviewer results, when the runner settles the task, then the task is done, the snapshot agrees, the expected approach history and lane receipts are present, and the ownership pair is absent.
4. Given that successful settlement and another ready task in the same invocation, when the coordinator continues, then the next claim uses the accepted accounting and policy unchanged and acquires fresh ownership.

### US2 - Answer challenges without bypassing Work (P2)

A coordinator can answer each runner challenge in a later tool call while the original runner remains active.

Independent test: exercise separate challenge and response calls against a controlled active task, including invalid input, a failing specialist result, an out-of-scope change, cancellation, and a runner hard stop.

1. Given an outstanding challenge, when the coordinator has not answered yet, then the driver keeps waiting without expiring the response or issuing a second simultaneous challenge.
2. Given an invalid Assessment or specialist pair, when the coordinator submits it through the driver, then no response is published and the invalid submission causes no Work mutation.
3. Given a baseline captured after authorization and before implementation, when changes are checked, then the driver reports the attempt's additions, modifications, and deletions without attributing unchanged pre-existing dirty files to the attempt.
4. Given a valid specialist result containing a failed check or rejected review, when the response is built, then the original evidence and its failure meaning reach the runner unchanged.
5. Given cancellation or a hard stop, then the driver reports the runner's decision and resource disposition without treating cleanup, a process exit, or returned state as permission to continue.

### US3 - Follow durable instructions and inspect ownership (P3)

A coordinator can find the supported procedure from Work guidance and inspect one current workspace-target ownership pair without changing it.

Independent test: follow the installed reference from selection through its terminal-outcome table, and compare a read-only ownership probe with the official store for absent and present pairs.

1. Given the installed bundle, when the coordinator reads Work guidance, then it points to the driver and a separate reference containing the procedure and input examples.
2. Given an ineligible target, then the documented selection procedure and the driver's independent claim checks stop before a lane mutation.
3. Given no caller-selected run directory, then run files use a short temporary directory outside the workspace. A caller may instead choose an outside directory.
4. Given a current workspace and exact task target, when ownership is queried, then the result describes only that pair and removes nothing.

## Edge Cases

- Imported tracked work takes precedence: the driver refuses it rather than falling back to Lightweight Execution. Invalid or non-autonomous Work policy also refuses before claim.
- The owner is missing, resolved, ambiguous, or has resolver diagnostics: no claim is made. A matching number, slug, filename, or title supplies no fallback ownership.
- Tasks are malformed, the audit breadcrumb names another owner, a dependency is unfinished, another unblocked in-progress task exists, or the requested task is not first ready: claiming it is refused.
- An owner log cannot accept the required exact append: setup refuses rather than repairing user-controlled ledger bytes.
- Setup records a claim but cannot establish settlement, cleanup, or the required poststate: no runnable request is issued. Existing stop and ownership rules apply.
- A run directory was used before, a response already exists, or an output points into the workspace: refuse without overwriting the earlier files or creating transport files in the workspace.
- A foreign response reaches the bridge outside the response builder: preserve the runner's hard stop and ownership disposition. Add no driver cleanup or retry.
- A file was already dirty at the baseline: only a further change belongs in this attempt's delta. A newly discovered unauthorized path must not be hidden or added to the pending authorization.
- A specialist result exceeds an existing evidence limit: refuse it without dropping rows, grouping away obligations, or substituting passing evidence.
- Required retained evidence is unavailable, or learning review requires an answer the driver cannot produce: preserve the existing stop or cancellation path. Neither historical text nor a saved state file restores execution authority.

## Functional Requirements

### Availability and admission

- FR-001: The core release supplies one driver entry point for autonomous Lightweight Work that requires neither a session kit nor an optional pack.
- FR-002: Work guidance points to a separate driver reference that coordinators read when operating the driver.
- FR-003: The driver uses existing official components for Work authority and canonical mutations without changing their contracts.
- FR-004: The driver refuses a tracked execution target instead of falling back to Lightweight Execution.
- FR-005: The driver refuses invalid or non-autonomous Work policy before claiming a task.
- FR-006: Before claim, the driver requires exactly one defined owner by exact `spec_path:` and no ownership resolver diagnostic.
- FR-007: The driver refuses a pending claim unless the task meets every eligible-pending-task condition defined below.
- FR-008: A successful claim records the in-progress task, matching canonical snapshot, and exactly one owner claim log entry through the official lane.
- FR-009: The driver issues a runnable request only after setup has settled, released its ownership pair, and reacquired the exact owner, mapping, and unblocked in-progress poststate.
- FR-010: Claim setup preserves the accepted Work state byte-for-byte, including policy, nonzero accounting, and completed-task records.

### Challenge exchange and run files

- FR-011: The driver exposes one bound outstanding challenge at a time and waits for its later response or cancellation without a response timeout.
- FR-012: The driver publishes each challenge and response as a complete file so a reader cannot observe a partially written message.
- FR-013: The driver refuses reused exchange directories and duplicate response publication without replacing existing message bytes.
- FR-014: The driver places run files in a caller-selected outside directory or, by default, a short temporary directory outside the workspace.
- FR-015: The driver rejects a transport or evidence output at the workspace root or beneath it before writing that output.

### Assessment, evidence, and scope

- FR-016: The driver validates each built Assessment against the outstanding target and Inspection before publishing its response.
- FR-017: The driver preflights the actual sole Tester result and independent Reviewer result against the outstanding accepted state before publishing a specialist response.
- FR-018: The driver preserves every submitted specialist evidence row, including failed checks and rejection findings.
- FR-019: The driver derives the specialist outcome from the evidence: failed verification takes precedence, then rejected review, then success with changes or success without changes.
- FR-020: Using the baseline captured at the specialist request before implementation, the driver reports the exact added, modified, and deleted paths for that attempt.
- FR-021: The driver refuses a changed-path set containing a path outside the pending authorization without widening the authorized set or hiding the path.

### Terminal behavior and retained evidence

- FR-022: The driver submits cancellation to the runner's existing cancellation path rather than deleting ownership artifacts itself.
- FR-023: Only successful task settlement permits the driver procedure to carry accepted state into a fresh next-task claim within the same still-authorized invocation.
- FR-024: The driver preserves the runner's terminal outcome, reason, accepted state, halt report, blocker and capacity diagnostics, and cleanup and ownership disposition.
- FR-025: The ownership probe reports the official store's status for exactly one current workspace-target pair without mutation or unrelated-store enumeration.
- FR-026: Retained-evidence output and pass-through preserve the original captures actually received through the runtime, including their order and duplicates; the driver reconstructs no missing proof.

### Operating reference

- FR-027: The reference documents selection, claim order, authorization before implementation, complete writer scope, baseline timing, canonical paths, actual specialist evidence, outcome derivation, preflight, cancellation, retained-evidence provenance, stops, bounded manual cleanup, same-invocation continuation, and ordinary closeout.
- FR-028: Current driver guidance contains no machine-specific session dependency, retired backlog-report maintenance duty, or learning-review response maker.

## Key Entities

- Defined owner: the one direct idea ledger with `status: defined` and the exact package `spec_path:`. Its numbered path is the task audit target; its number records capture chronology only.
- Eligible pending task: one exact, unblocked pending canonical task in a valid task file with the exact owner breadcrumb, all dependencies done, first in the existing ready-task order, and no other unblocked in-progress task. Parser warnings or malformed task structure make it ineligible.
- Accepted Work state: the official policy, accounting, pending work, and completed records. A transport copy is evidence, not independent authority.
- Challenge and response: one runner-bound request and the coordinator's matching Assessment, specialist pair, or cancellation. Publication grants no authorization or acceptance.
- Attempt baseline: the authored and generated workspace file state observed after the specialist request and before implementation, excluding version-control internals and installed dependencies. It distinguishes this attempt's changes from earlier dirty work.
- Ownership pair: the existing exclusive claim and checkpoint for one canonical workspace-target binding. Status, age, and process identifiers do not authorize deletion, takeover, or continuation.
- Retained evidence: complete original runtime capture inputs usable only through the existing admission and provenance checks.

## Scope And Surfaces

In scope: ship the kit's needed host-integration behavior as one core driver, use existing read-only selection tools, perform pending-task claim setup, bridge runner challenges, build and validate Assessment and specialist responses, submit cancellation, capture and compare attempt baselines, inspect one ownership pair, and provide a separate operating reference.

The driver itself writes nothing inside the workspace except through official adapter lane effects. Authorized implementation and specialist edits remain separate work performed after authorization. Temporary run files neither replace the official checkpoint store nor become a board, ledger, or authority source.

Out of scope: tracked execution through this driver, guarded policy through this runner, changes to the runner or validators, automatic specialist dispatch, automatic Git, a new Work or Ship command or grammar, new resume or takeover behavior, cleanup commands, background sweeps, configurable polling or debug frameworks, a learning-review maker, and removal of old session kits. The existing retained-evidence handoff remains available without adding a historical loader.

## Success Criteria

- SC-001: In a fresh core-only installation, the US1 task reaches official successful settlement with a done task, matching snapshot, one claim log entry, the expected approach occurrence, committed lane receipts, and no remaining ownership pair.
- SC-002: Each admission refusal in FR-004 through FR-007 produces zero lane writes and no runnable request; claim setup never changes accepted state or policy.
- SC-003: Challenge exchange has at most one outstanding request, waits without a response deadline, and publishes zero responses for invalid Assessment or specialist input.
- SC-004: For passing verification, failed verification, accepted review, rejected review, and no-change input, response outcomes match FR-019 and every supplied evidence row remains intact.
- SC-005: Baseline comparison identifies additions, modifications, and deletions exactly, excludes unchanged pre-existing dirt, and reports every unauthorized changed path without allowing its completion submission.
- SC-006: Default and caller-selected run locations stay outside the workspace; workspace-root and descendant destinations, reused exchange directories, and duplicate responses are refused without overwriting protected bytes.
- SC-007: Cancellation uses the runner's cleanup result and leaves the task in progress; a foreign-response hard stop preserves the runner's decision and resource diagnostics. Neither outcome permits next-task continuation.
- SC-008: A same-invocation next-task claim preserves the previous settled state and caller policy exactly, including nonzero counters. Non-settled terminal state is not offered or accepted as continuation state, and retained capture bytes are preserved rather than reconstructed.
- SC-009: For absent and present ownership pairs, the probe agrees with the official store and changes zero workspace or ownership-store files.
- SC-010: The installed Work pointer and separate reference cover every step in FR-027 with usable input examples and mutation and terminal-outcome tables; they contain zero dependencies on old session paths, optional packs, or retired report maintenance.

## Assumptions

- This increment covers the existing autonomous Lightweight runner used by the kit. Other Work lanes and guarded execution keep their existing routes.
- The host can keep one runner process active while the coordinator answers challenges in later tool calls. Loss of that live context keeps the current Work stop behavior.
- Production specialist records come from actual dispatches. Controlled test-owned records establish integration behavior, not independent acceptance of this feature.
- Ordinary path checks satisfy the accepted outside-workspace requirement. Protection from concurrent directory replacement and other hostile filesystem races is not required.
- Existing project guardrails remain in force. The definition-owner refinements recorded in the owner's Definition Package do not edit the user's three answers or add a user assumption.
