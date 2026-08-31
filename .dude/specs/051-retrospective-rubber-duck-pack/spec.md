# Feature Specification: Retrospective Rubber Duck Pack

**Idea:** `.dude/ideas/051-retrospective-rubber-duck-pack.md`
**Status:** Defined
**Priority:** Optional enhancement; no core-close dependency

## Problem

Successful feature work can close without a durable reflection on what helped,
what caused friction, and what might improve later work. Turning that reflection
into another reviewer or completion gate would make close slower and less
reliable. The product needs an optional, read-only retrospective teammate whose
output is useful after successful feature completion but cannot control that
completion.

## Goals

- Offer one installable retrospective capability for completed feature work.
- Run it once, at the last safe point before an eligible coordinator close.
- Preserve concise, dated observations with the feature package.
- Keep findings advisory and preserve all existing review and close authority.
- Leave core completion and its universal closeout fully useful without the pack.

## Non-Goals

- Retrospectives for ordinary task closes or release runs.
- Retrospectives for failed, blocked, cancelled, or abandoned endings.
- Another reviewer, approval gate, revision loop, or rerun mechanism.
- Events, callbacks, hooks, listeners, subscriptions, schedulers, registries, or
  a generic lifecycle extension API.
- Automatic learning promotion, task creation, memory updates, or workflow-state
  mutation.

## User Scenarios

### P1 — Reflect after successful feature completion

**Given** the optional capability is installed and final review has approved the
last work needed to complete a feature,
**when** the coordinator is about to close that feature,
**then** it dispatches the retrospective teammate exactly once as the final
agent dispatch, receives advisory observations, records one dated entry in the
feature retrospective, and completes the normal close.

**Independent test:** A successful non-Ship feature-completion path demonstrates
one post-review dispatch, no later agent dispatch, one durable entry, and an
otherwise unchanged close.

### P1 — Reflect after successful Ship completion

**Given** an explicit Ship run is successfully completing its feature and the
optional capability is installed,
**when** final review has approved the completing work,
**then** the same one retrospective dispatch and durable entry occur before
coordinator close. The completion is treated as one eligible close, not as
separate feature and Ship triggers.

**Independent test:** A successful Ship completion demonstrates exactly one
dispatch and one entry rather than one of each per trigger label.

### P1 — Preserve ineligible close paths

**Given** an ordinary task close, a successful release run, or an unsuccessful
feature or Ship ending,
**when** normal workflow reporting occurs,
**then** no retrospective dispatch or retrospective entry occurs.

**Independent test:** Each excluded ending has no retrospective call and no
artifact mutation.

### P1 — Keep reflection non-authoritative

**Given** the teammate reports serious concerns, returns no findings, is silent,
or fails,
**when** the coordinator continues the eligible close,
**then** it does not abort, revise, review again, add an approval decision, or
rerun the teammate. A dispatch or artifact-write failure is reported honestly
but does not delay close.

**Independent test:** Finding, empty, unavailable, and write-failure cases all
retain one dispatch attempt and the same coordinator close outcome.

### P2 — Preserve retrospective history

**Given** a feature already has a retrospective file,
**when** another eligible completion is recorded,
**then** the coordinator preserves every prior byte and appends one new,
UTC-dated entry identifying the completion mode, target, dispatch outcome, and
advisory observations.

**Independent test:** Two eligible completions yield one file with two ordered
entries and an unchanged first entry.

### P2 — Preserve the core baseline when absent

**Given** the optional capability is not installed,
**when** a feature or Ship completion succeeds,
**then** no retrospective step or artifact is required and normal close,
including the universal completion closeout, remains complete.

**Independent test:** Removing the capability removes only the optional dispatch
and artifact behavior.

## Functional Requirements

1. **FR-001:** The retrospective capability MUST be an optional installable pack
   with no required external runtime or command-line dependency.
2. **FR-002:** The retrospective teammate MUST have read and search capability
   only and MUST NOT mutate repository files, workflow state, task state,
   coordinator logs, memory, or delivery state.
3. **FR-003:** When the pack is available, the coordinator MUST attempt exactly
   one retrospective dispatch after final Reviewer approval and before closing a
   successfully completed feature or explicit Ship feature.
4. **FR-004:** The retrospective dispatch MUST be the final agent dispatch in
   that completion path. The coordinator MUST NOT dispatch another reviewer,
   reviser, or specialist because of its findings.
5. **FR-005:** A Ship completion that is also the feature completion MUST produce
   only one dispatch attempt and one retrospective entry.
6. **FR-006:** The coordinator MUST NOT dispatch the retrospective for an
   ordinary task close, a successful release run, or a failed, blocked,
   cancelled, or abandoned feature or Ship ending.
7. **FR-007:** Findings MUST remain advisory and MUST NOT abort or delay close,
   force revision, add an approval gate, change an existing review verdict,
   create work, or cause a rerun.
8. **FR-008:** For each eligible installed-pack completion, the coordinator MUST
   create or append `.dude/specs/<NNN>-<slug>/retrospective.md`; the teammate MUST
   never write that artifact.
9. **FR-009:** A new retrospective file MUST begin with one feature-level title.
   Each entry MUST use a UTC ISO-8601 dated heading and identify the completion
   mode (`Feature` or `Ship`), target, dispatch outcome, and concise advisory
   observations. Existing entries MUST be preserved byte-for-byte.
10. **FR-010:** Silence or dispatch failure MUST yield at most one concise
    unavailable outcome entry. Artifact-write failure MUST be reported without a
    retry or close failure.
11. **FR-011:** Pack absence MUST add no dispatch, artifact requirement, warning,
    degraded behavior, or delay to core close.
12. **FR-012:** The universal `Completion Closeout:` block MUST retain its fixed
    core behavior and MUST NOT cite `retrospective.md`, add a retrospective
    category, or depend on retrospective availability.
13. **FR-013:** The solution MUST remain an ordinary conditional coordinator
    step. It MUST NOT introduce or activate an event, callback, hook, listener,
    subscription, scheduler, registry, or generic lifecycle extension.
14. **FR-014:** Installing, removing, and refreshing the pack MUST use the
    existing optional-pack lifecycle without a new command or configuration
    state.

## Key Entities

- **Retrospective pack:** The optional installable capability. Its presence
  enables the step; its absence has no effect on core completion.
- **Rubber Duck:** The read-only teammate that returns advisory observations and
  holds no review, write, workflow, or learning authority.
- **Eligible completion:** One pending successful feature close, reached through
  direct feature work or explicit Ship, after final Reviewer approval.
- **Retrospective entry:** One coordinator-written, dated, append-only record for
  an eligible completion.
- **Universal closeout:** The core completion report that remains complete,
  fixed in shape, and independent of the optional retrospective.

## Retrospective Entry Contract

The durable file has this minimal shape:

```markdown
# Retrospective: <feature title>

## <UTC ISO-8601 timestamp> — <Feature|Ship> completion
- **Target:** <exact feature identity>
- **Dispatch:** completed | unavailable

### Observations
<concise advisory observations, no-findings statement, or observed unavailable reason>
```

The coordinator creates the heading with the first entry and appends subsequent
entries after the existing final byte. It may normalize the teammate's response
into this shape but must not present an observation as a review verdict or
accepted learning.

## Edge Cases

- Final review rejects or escalates: no dispatch occurs because successful close
  is not yet eligible.
- The pack is absent at the eligibility check: close proceeds with no mention of
  a missing optional capability.
- The teammate returns no observations: one completed entry may say that no
  advisory findings were returned.
- The teammate errors or is silent: no retry or substitute agent is dispatched;
  close continues and an unavailable entry is appended when writable.
- The retrospective file exists: append only; do not replace its title or prior
  entries.
- The retrospective path cannot be written: report the observed failure outside
  the universal closeout block and continue close.
- The active command is Ship: label the one entry `Ship completion`; do not also
  create a `Feature completion` entry.
- A release succeeds: no dispatch occurs even if release work touched a feature
  package.

## Success Criteria

- **SC-001:** Every eligible installed-pack feature or Ship completion produces
  exactly one retrospective attempt; every listed excluded ending produces zero.
- **SC-002:** Every retrospective attempt is the final agent dispatch before
  close and produces one coordinator-owned append when the package is writable.
- **SC-003:** Rubber Duck repository, workflow, delivery, task, memory, and
  artifact mutations remain zero.
- **SC-004:** Findings, no findings, silence, dispatch failure, and persistence
  failure produce zero close aborts, forced revisions, approval gates, extra
  reviews, or reruns.
- **SC-005:** With the pack absent, retrospective dispatches, artifacts,
  warnings, delays, and changes to the successful core outcome all remain zero.
- **SC-006:** Two eligible completions preserve the complete first entry and
  yield exactly two chronologically appended dated entries.
- **SC-007:** The universal closeout adds zero retrospective categories and zero
  citations of `retrospective.md`, whether the pack is present or absent.

## Assumptions

- An eligible close has one exact feature package and stable spec path.
- The coordinator can observe final Reviewer approval and whether the pending
  close completes the feature.
- Explicit Ship operates on one selected feature package, so one completion mode
  labels the entry.
- Existing pack installation already exposes installed agents in the direct
  coordinator roster.
- A natural-language coordinator and agent contract is sufficient; no
  deterministic retrospective engine is needed.
