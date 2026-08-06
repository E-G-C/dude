# Feature Specification: Topology-First Enforcement Reset

## Purpose

A review then revision loop can quietly grow a design. Each review finding may be valid, yet every revision that answers it by adding a gate, a checkpoint, or cross-session coordination expands the design around an assumed enforcement point that no one has rechecked. After enough cycles the design carries machinery that guards no reachable path, while the real production behavior is still controlled somewhere narrower.

This feature adds a topology-first reset: a bounded, evidence-first checkpoint woven into the existing review and revision workflow guidance. When a reset trigger fires, the planning authority must re-establish where production behavior is actually controlled — the entry point, the call path, the controlling actor, the concrete reachable failure, and the narrowest existing enforcement point — before another revision is produced. Review then judges the revised design against that evidence, and new enforcement machinery is admitted only when a reachable failure and a covering acceptance test justify it.

The reset is guidance, not a new subsystem. It creates no new persistent workflow artifact, changes no existing safety, verification, or independent-review requirement, and leaves ordinary local review fixes untouched. It is deliberately small: it names the triggers where revisions are handled, adds the topology-evidence obligation the planning authority already ought to meet, and states the judgment the reviewer already ought to make.

Feature 013 is the illustrative example of the pattern. After several revisions, tracing the production call graph there showed the deterministic runner was the sole driver and every admitted work-loop terminal passed through a single chokepoint; one bounded attachment at that chokepoint satisfied the requirement while the proposed session and checkpoint machinery covered no additional reachable path. Feature 013 is named only to ground the problem and is not reopened.

## User Stories & Testing

### User Story 1 - The reset triggers are defined and fire only when they should (Priority: P1)

As a planning authority working a review then revision loop, I want the reset triggers named in the workflow guidance so that runaway accumulation of enforcement machinery is caught while ordinary fixes flow untouched.

**Why this priority**: The triggers are the entry condition for the whole discipline. Without a shared, testable definition of when a reset applies, neither the planning authority nor the reviewer can act consistently, and the reset either never fires or fires on everything.

**Independent Test**: Present review then revision scenarios that each match exactly one trigger — a control-boundary concern surviving two review cycles, a revision that introduces a new checkpoint or cross-session state, and enforcement that expands across modules or workflow boundaries — and confirm each calls for a topology-first reset. Present ordinary local fixes that match no trigger and confirm none calls for a reset.

**Acceptance Scenarios**:

1. **Given** a review then revision loop in which the same control-boundary concern is still open after two review cycles, **When** the next revision is considered, **Then** the guidance calls for a topology-first reset before that revision proceeds.
2. **Given** a proposed revision that introduces a new gate, store, checkpoint, or cross-session state, **When** the revision is considered, **Then** the guidance calls for a topology-first reset.
3. **Given** a proposed revision that expands enforcement across additional modules or workflow boundaries, **When** the revision is considered, **Then** the guidance calls for a topology-first reset.
4. **Given** an ordinary local review fix that introduces no new gate, store, checkpoint, cross-session state, or cross-boundary expansion, **When** the fix is considered, **Then** no reset is called for and the fix proceeds under the existing revision procedure.
5. **Given** a single revision that matches more than one trigger at once, **When** the reset is called for, **Then** it is a single reset answered by one topology-evidence set rather than a repeated or compounding obligation.

### User Story 2 - The planning authority performs the topology check before the next revision (Priority: P1)

As the planning authority, when a reset trigger fires I want to re-establish the actual control topology before I revise further, so that I add only machinery that guards a reachable path and I can prove it.

**Why this priority**: The topology check is the substance of the reset. It is what converts an accumulating design into an evidence-backed one, and it is the step Feature 013 showed was missing.

**Independent Test**: With a trigger active, confirm the next revision is preceded by all six topology facts. Confirm that when the evidence shows a proposed mechanism covers a reachable path not already covered by the narrowest existing enforcement point, the revision may proceed on that evidence rather than being blocked. Confirm that when the evidence shows an existing chokepoint already covers the failure, the added machinery is not carried forward.

**Acceptance Scenarios**:

1. **Given** an active reset trigger, **When** the planning authority prepares the next revision, **Then** it first identifies the production entry point and actual call path, which actor controls each operation and input, the concrete reachable failure being prevented, the narrowest existing enforcement point covering that failure, a focused check that could disprove the topology assumption, and why each proposed stateful mechanism covers a reachable path.
2. **Given** completed topology evidence showing that a proposed mechanism covers a reachable path the narrowest existing enforcement point does not, **When** the revision is prepared, **Then** the reset allows the revision to proceed on the strength of that evidence and does not veto the machinery.
3. **Given** completed topology evidence showing that an existing chokepoint already covers the reachable failure, **When** the revision is prepared, **Then** the proposed additional machinery is not carried forward and the design narrows onto the existing point.
4. **Given** a reset trigger for which the planning authority cannot identify any concrete reachable failure, **When** the topology evidence is assembled, **Then** the absence of a reachable failure is itself the finding and no new enforcement machinery is introduced on assumption.

### User Story 3 - Review evaluates the revised design against the topology evidence (Priority: P2)

As an independent reviewer, I want to judge the revised design against the topology evidence and check its claims against the current source, so that machinery whose justification does not hold is caught before a completion claim.

**Why this priority**: Review closes the loop. The planning authority's evidence becomes trustworthy only when an independent reviewer verifies its topology claims against the real call sites and holds new machinery to a reachable failure and a test. It builds on the evidence the first two stories produce.

**Independent Test**: Submit a revised design under an active reset with its topology evidence and confirm the verdict states a judgment against that evidence. Submit a revision whose topology claim contradicts the current source or call sites and confirm it is not approved on that basis. Submit new enforcement machinery with a reachable failure and a covering acceptance test and confirm it can be admitted; submit the same machinery missing either the reachable failure or the test and confirm it is not admitted.

**Acceptance Scenarios**:

1. **Given** a revised design submitted under an active reset with its topology evidence, **When** the reviewer records a verdict, **Then** the verdict states a judgment of the revised design against that evidence.
2. **Given** topology evidence whose claim about the entry point, call path, or controlling actor contradicts the current source and call sites, **When** the design is reviewed, **Then** the reviewer does not approve it until the claim is corrected or withdrawn.
3. **Given** a revision that introduces new enforcement machinery accompanied by a demonstrated reachable failure and an acceptance test covering that failure, **When** the design is reviewed, **Then** the machinery may be admitted.
4. **Given** a revision that introduces new enforcement machinery with no demonstrated reachable failure or with no acceptance test covering it, **When** the design is reviewed, **Then** the machinery is not admitted.
5. **Given** a reset that is otherwise satisfied, **When** the verdict is recorded, **Then** every existing safety, verification, and independent-review obligation is applied unchanged and none is relaxed by the reset.

## Edge Cases

- A reset trigger fires, and the topology check shows the proposed machinery does cover a reachable path the narrowest existing enforcement point does not; the reset must allow the revision to proceed with that evidence rather than block it.
- The same concern survives two review cycles, but every revision answering it is an ordinary local fix that introduces no new gate, store, checkpoint, cross-session state, or cross-boundary expansion; it is not a control-boundary concern and is exempt from the reset.
- One revision matches more than one trigger at once; it is a single reset answered by one topology-evidence set, not a stacked or repeated obligation.
- A revision removes, narrows, or collapses machinery onto an existing chokepoint rather than adding any; no trigger fires and the reset never penalizes simplification.
- A topology claim in the evidence contradicts the current source or call sites; the design is not approved until the claim is corrected or withdrawn.
- No independent reviewer is available where a reset would apply; the existing readiness and safety rules govern unchanged and the reset introduces no bypass.
- New enforcement machinery is offered with a reachable failure but no acceptance test, or with a test but no demonstrated reachable failure; in either case it is not admitted until both exist.
- A control-boundary concern recurs across separate features or loops; the two-cycle count is per concern within a review then revision loop, not a global tally across unrelated work.

## Functional Requirements

- **FR-001:** The existing review and revision workflow guidance MUST define the three topology-first reset triggers and MUST call for a topology-first reset when any single trigger is present: the same control-boundary concern survives two review cycles; a revision introduces a new gate, store, checkpoint, or cross-session state; or enforcement expands across modules or workflow boundaries.
- **FR-002:** When any reset trigger is present, the planning authority MUST complete the topology check before producing another revision, identifying all of: the production entry point and actual call path; which actor controls each operation and input; the concrete reachable failure being prevented; the narrowest existing enforcement point that already covers that failure; a focused check that could disprove the topology assumption; and why each proposed stateful mechanism covers a reachable path.
- **FR-003:** Independent review MUST evaluate the revised design against the topology evidence, and every topology claim in that evidence MUST be verified against the current source and call sites before the design can be approved.
- **FR-004:** New enforcement machinery — a new gate, store, checkpoint, or cross-session state — MUST NOT be admitted unless a concrete reachable failure it prevents is demonstrated and an acceptance test covering that failure exists.
- **FR-005:** When a reset trigger fires and the topology evidence shows a proposed mechanism covers a reachable path the narrowest existing enforcement point does not already cover, the reset MUST allow that revision to proceed on the strength of the evidence; the reset gates on evidence and MUST NOT act as an automatic veto on necessary machinery.
- **FR-006:** The reset MUST preserve every existing safety, verification, and independent-review requirement unchanged; it MAY add the topology-evidence obligation but MUST NOT remove, relax, reorder, or bypass any existing gate.
- **FR-007:** Ordinary local review fixes MUST NOT trigger a topology reset or require an architecture review; a concern that survives two review cycles solely through ordinary local fixes introducing no new gate, store, checkpoint, cross-session state, or cross-boundary expansion is exempt.
- **FR-008:** The reset MUST create no new persistent workflow artifact — no new skill, agent, state file, board, command, lane, or registry — and the topology evidence MUST remain transient within the existing review and revision exchange with no stored form.
- **FR-009:** The reset MUST NOT dismiss or weaken review findings, MUST NOT bypass any safety or approval gate, and MUST NOT require an architecture review after every rejection.
- **FR-010:** This feature MUST NOT fix the separate unattended-runner attribution and coverage defects, which are owned by the `runner-reason-code-coverage-fix` idea, and no task in this package MUST mutate another feature's package or execution state.

## Key Entities

- **Reset Trigger**: one of the three defined conditions whose presence in a review then revision loop calls for a topology-first reset. Any single trigger is sufficient.
- **Topology Check**: the six-part evidence set the planning authority establishes before the next revision — entry point and call path, controlling actor, concrete reachable failure, narrowest existing enforcement point, a disproving check, and why each stateful mechanism covers a reachable path. It is transient and lives in the review and revision exchange; it has no stored form.
- **Reachable Failure**: a concrete failure reachable through the production entry point and call path that a proposed enforcement mechanism prevents. It is the precondition for admitting new machinery.
- **Narrowest Existing Enforcement Point**: the tightest control already present on the reachable path that covers the failure. When it already covers the failure, proposed additional machinery is not carried forward.
- **Enforcement Machinery**: a gate, store, checkpoint, or cross-session state a revision proposes to add. Under a reset it is admitted only with a reachable failure and a covering acceptance test.

## Success Criteria

- **SC-001:** Across a matrix of review then revision scenarios, 100% that contain at least one trigger call for a topology-first reset and 100% of ordinary local fixes that contain no trigger call for zero resets.
- **SC-002:** For 100% of fired-trigger scenarios, the next revision is preceded by the complete topology evidence with none of the six required facts omitted.
- **SC-003:** For 100% of revised designs under an active reset, review states a judgment against the topology evidence, and any design whose topology claim contradicts the current source or call sites is not approved until corrected or withdrawn.
- **SC-004:** Across scenarios that introduce new enforcement machinery, admission requires both a demonstrated reachable failure and a covering acceptance test, and zero instances of new machinery are admitted lacking either.
- **SC-005:** Inspection of the complete change shows zero new persistent workflow artifacts — zero new skills, agents, state files, boards, commands, lanes, or registries — and the topology evidence has no stored form.
- **SC-006:** On scenarios containing no trigger, existing safety, verification, and independent-review behavior is unchanged, and no existing gate is removed, relaxed, reordered, or bypassed anywhere in the change.
- **SC-007:** At least one rehearsal shows a trigger firing where the topology evidence demonstrates a mechanism covers a reachable path, and the revision proceeds on that evidence without being blocked by the reset.
- **SC-008:** Repository validation passes and one fresh independent review approves the change with no unresolved finding, touching no other feature's package or execution state.

## Assumptions

- The review then revision loop already has an owner for the reviser and planning-authority side and an owner for the independent-reviewer side; the reset is woven into that existing guidance rather than a new home.
- The topology evidence is transient and belongs in the existing review and revision exchange; it needs no store, record, or board to be useful.
- Existing safety, verification, and independent-review requirements are correct and remain the base the reset builds on.
- "Control-boundary concern" is the load-bearing qualifier on the two-cycle trigger; ordinary local fixes are not control-boundary concerns even when they take more than one pass.
- Feature 013 is an illustrative example only and is not reopened, rolled back, or otherwise reworked here.
- The pre-existing guidance against holding run state in a shell environment already exists and is not duplicated by this feature.
- This feature has no progress objective and compiles no objective registry.

## Out of Scope

- Dismissing, overriding, or weakening any review finding.
- Bypassing, relaxing, or reordering any safety, approval, verification, or independent-review gate.
- Requiring an architecture review after every rejection, or on ordinary local fixes.
- Fixing the separate unattended-runner attribution and coverage defects, which are owned by the `runner-reason-code-coverage-fix` idea.
- Any new skill, agent, state file, board, command, execution lane, registry, or persistent evidence surface.
- Reopening, rolling back, or reworking Feature 013.
- Adding another guidance entry against holding run state in a shell environment, which already exists.
