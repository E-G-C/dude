# Feature Specification: Completion Closeout Report

## User Scenarios & Testing

### User Story 1 - Receive one trustworthy closeout after successful close (Priority: P1)

As a user, I want the coordinator's final response to summarize the repository and workflow facts that were actually observed after work closed so I can leave the workflow with an accurate delivery state.

**Why this priority:** A universal closeout is useful only if its timing, evidence, and non-mutating behavior are reliable for every successful close.

**Independent Test:** Complete a workflow close with observed repository state but no pull request, tag, release, cleanup, or learning result. Verify that the same final coordinator response contains exactly one concise closeout with the observed worktree and branch state and no inapplicable categories.

**Acceptance Scenarios:**

1. **Given** a workflow invocation successfully closes at least one target, **When** the coordinator produces its final response, **Then** that response contains exactly one closeout covering the successful closure or closures.
2. **Given** no target closes successfully, **When** the invocation refuses, fails, or stops, **Then** no success closeout is produced.
3. **Given** repository state is observed after close, **When** the closeout is rendered, **Then** its worktree and branch claims match that evidence and the act of reporting causes no mutation.

---

### User Story 2 - See applicable delivery and follow-up facts (Priority: P2)

As a user completing a feature, Ship run, or release, I want actual delivery identities, links, optional cleanup, and existing learning outcomes surfaced together so I can follow the delivered work without searching through prior messages.

**Why this priority:** Long-running delivery workflows commonly produce several related identities and follow-up options, but none may be inferred or fabricated.

**Independent Test:** Complete a delivery with observed commit, pull request, tag, release, optional cleanup, and an already-retained or already-proposed learning item. Verify that the final closeout reports those exact facts in deterministic order, performs none of the actions, and creates no durable record.

**Acceptance Scenarios:**

1. **Given** delivery evidence contains actual identities and canonical links, **When** the closeout is rendered, **Then** it reports only those observed identities and links.
2. **Given** an exact cleanup action remains optional after successful close, **When** the closeout is rendered, **Then** it identifies the action and target as optional without executing it.
3. **Given** existing workflow evidence records retained learning or a proposed learning candidate, **When** the closeout is rendered, **Then** it reports that existing disposition without promoting, persisting, or reclassifying it.
4. **Given** no optional pack is installed, **When** feature, Ship, or release work closes successfully, **Then** the core closeout remains complete and usable.

---

### User Story 3 - Get a proportional bounded-task closeout (Priority: P3)

As a user closing one bounded task, I want a small closeout that omits unrelated delivery categories so a routine result is not buried in release-oriented boilerplate.

**Why this priority:** The same behavior must cover small closes without making every task response look like a release report.

**Independent Test:** Close one bounded task with no pull request, tag, release, cleanup, or learning outcome. Verify that the final response reports only the observed task, worktree, and branch state and contains no empty headings or placeholders for the absent categories.

**Acceptance Scenarios:**

1. **Given** a bounded task closes with no delivery link or cleanup, **When** the final response is rendered, **Then** pull request, tag, release, cleanup, and learning categories are absent.
2. **Given** several tasks close in one invocation, **When** the coordinator finishes, **Then** one final closeout summarizes the applicable facts rather than emitting a separate closeout for each task.
3. **Given** one task closes and later work in the same invocation stops, **When** the coordinator produces the final response, **Then** the closeout is limited to the successful closure and does not imply that the stopped target or overall feature completed.

## Edge Cases

- A detached HEAD, unborn branch, unavailable branch observation, or failed read-only status query must never be described as a named or clean branch. An applicable but unavailable observation is reported as unavailable with its observed reason.
- Dirty, untracked, ignored, or out-of-scope worktree content must not be collapsed into a clean-worktree claim.
- A recognizable issue, branch, tag, or release name is not enough to construct a URL; a link is reported only when evidence contains the actual URL.
- Multiple pull requests, tags, releases, or commits are included only when each is relevant to the successful closure and individually evidenced.
- Evidence captured before close may be used for immutable delivery facts, but mutable worktree and branch state must be observed after the successful close.
- A cleanup action that is unsafe, stale, ambiguous, already completed, or not tied to the closed work is omitted rather than generalized.
- Advisory output from an installed optional pack may be reflected only when it already reached the coordinator before close; pack absence, failure, or silence cannot block or weaken the core closeout.
- Existing blockers, failed closes, or unresolved work remain represented by their normal response conventions and are not relabeled as success because another target closed.

## Functional Requirements

- **FR-001**: The coordinator MUST include exactly one closeout in the final response of an invocation that successfully closes one or more workflow targets.
- **FR-002**: Successful bounded task close, completed feature work, completed Ship work, and completed release work MUST all use the same core closeout behavior, scaled to their applicable evidence.
- **FR-003**: The closeout MUST remain part of the existing final coordinator response and MUST NOT create another response, workflow stage, hook, reviewer, acceptance decision, task, lane, board, audit carrier, report file, registry, or persistent state.
- **FR-004**: The closeout MUST be read-only and MUST NOT perform cleanup, delivery, release, Git mutation, reopening, learning promotion, or memory persistence.
- **FR-005**: The closeout MUST use evidence available to the coordinator and MUST NOT invent a status, identity, relationship, cleanliness claim, or link.
- **FR-006**: Mutable worktree and branch state MUST be observed after the successful close before it is claimed; if an applicable observation fails, the response MUST state that it is unavailable without asserting the missing state.
- **FR-007**: The closeout MUST report the observed worktree status and current branch identity or detached/unavailable state for repository-backed work.
- **FR-008**: The closeout MUST report actual delivery identities that are relevant to the successful closure, including observed commit identities when applicable.
- **FR-009**: Pull request, tag, and release categories MUST appear only when the successful closure has supporting evidence for them, and links MUST be copied from observed evidence rather than synthesized.
- **FR-010**: When cleanup remains applicable, the closeout MUST describe the exact optional action and exact target, label it optional, and leave it unexecuted.
- **FR-011**: Learning content MUST be limited to items already retained or already proposed through existing learning and memory governance, preserving that disposition without creating a new candidate.
- **FR-012**: Inapplicable categories MUST be omitted completely, without empty headings, placeholders, or negative boilerplate.
- **FR-013**: Applicable categories MUST use one deterministic order: repository state, delivery identities and links, optional cleanup, then retained or proposed learning.
- **FR-014**: A mixed invocation with successful and unsuccessful targets MUST scope the closeout to successful closures and preserve the normal blocker or stop reporting for all unfinished work.
- **FR-015**: Core closeout behavior MUST have no runtime dependency on `retrospective-rubber-duck-pack` or any other optional pack.
- **FR-016**: Optional advisory feedback MAY contribute evidence before coordinator close when already available, but it MUST NOT add authority, delay close, or create another closeout.

## Key Entities

- **Successful Closure**: An existing workflow owner's verified close outcome for a bounded task, feature, Ship invocation, or release; it is the trigger for the final closeout and grants no new authority.
- **Closeout Evidence**: Read-only facts already available or freshly observed by the coordinator, with mutable repository state observed after close.
- **Applicable Category**: A closeout category supported by the closure type and real evidence; unsupported categories are absent.
- **Optional Cleanup**: A precise, unexecuted action against an evidenced target that remains after close.
- **Learning Disposition**: An existing retained item or proposed candidate established by the current learning and memory authorities.

## Success Criteria

- **SC-001**: In all acceptance fixtures containing at least one successful close, the final coordinator response contains exactly one closeout; fixtures with no successful close contain none.
- **SC-002**: In bounded-task fixtures without delivery, cleanup, or learning evidence, 100% of pull request, tag, release, cleanup, and learning headings and placeholders are absent.
- **SC-003**: Every reported repository state, delivery identity, and URL in representative feature, Ship, and release fixtures matches captured evidence exactly; unavailable or absent evidence produces no invented claim.
- **SC-004**: Reporting a closeout produces zero repository, workflow-state, cleanup, delivery, release, or learning-persistence mutations.
- **SC-005**: The same successful-close fixtures pass with all optional packs absent.
- **SC-006**: A mixed-result fixture reports successful closures without claiming completion for blocked, failed, or unclosed targets.

## Assumptions

- Existing workflow owners continue to decide when a close is successful; this feature consumes that outcome and does not redefine close eligibility.
- The coordinator can use its existing read-only repository and delivery evidence sources; no new collector, parser, service, or state store is needed.
- Repository-backed workflow closes normally have applicable worktree and branch state. A failed observation is an explicit unavailable result, not permission to infer state.
- A learning item is reportable only after existing learning or memory governance has already classified it as retained or proposed.
- Optional-pack advisory feedback is opportunistic input only and is never required for the core response.
