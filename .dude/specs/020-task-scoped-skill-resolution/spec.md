# Feature Specification: Task-Scoped Skill Resolution

## Purpose

Agent routing answers who owns a task. Nothing currently answers which installed guidance applies while that task is performed and checked. A skill can be installed, well written, and accurately described, and still never reach the specialist doing the work or the reviewer judging it.

The verified reproduction is the Feature 017 Ship documentation. Prose was authored across `README.md`, `docs/setup.md`, `docs/commands.md`, `docs/workflow.md`, `docs/walkthrough.md`, and `docs/reference.md`. One clause appears verbatim in five of those files, another phrase in six, and a third in four. `docs/commands.md` opens three consecutive paragraphs with the same construction. The same tricolon repeats across the set, and new headings introduced em dashes where that file's convention was a plain colon. Two installed skills, `dude-pack-writing-avoid-ai-tropes` and `dude-pack-writing-style`, already name every one of those failure modes. Neither was loaded. The static contract tests stayed green because they assert that required content is present and have no way to observe templated prose.

Why the guidance was missed is not established. This feature therefore does not fix a diagnosed cause. It closes the two places where the miss was silent: the guidance a task needs is now named when the task is dispatched and again when it is accepted, and the one measurable symptom of templated prose is detected by a deterministic check instead of by luck.

The change is deliberately small. It reuses the skill descriptions that already exist, the dispatch text that is already composed, and the review verdict that is already required. It adds one check for the failure that content-presence tests cannot see.

## User Stories & Testing

### User Story 1 - Applicable guidance reaches the specialist doing the work (Priority: P1)

As a user whose task will produce a specific kind of artifact, I want the installed skills that apply to that artifact named in the dispatch so that the specialist works from them rather than from whatever it happens to remember.

**Independent Test**: Dispatch a task whose output is human-facing documentation prose while both prose-quality skills are installed, and confirm the dispatch names them. Dispatch a task with no matching installed skill and confirm nothing is named and no step is added. Dispatch a task that semantically brushes an opt-in or authority-bearing procedure and confirm that procedure is not activated.

**Acceptance Scenarios**:

1. **Given** a task whose stated outcome is documentation prose and an installation containing both prose-quality skills, **When** the coordinator dispatches the task, **Then** the dispatch names those skills as applicable to that task and the receiving specialist loads them before working.
2. **Given** an installation where a relevant skill is bound to no agent, **When** applicability is determined, **Then** that skill is still named and no agent is created, renamed, or re-scoped to host it.
3. **Given** a task whose subject matter loosely resembles an opt-in discipline, a destructive procedure, or an authority-bearing procedure, **When** applicability is determined, **Then** that procedure is not named as applicable without explicit user intent or an explicit contract.
4. **Given** a task that no installed skill description matches, **When** the task is dispatched, **Then** the dispatch is unchanged from today and carries no empty applicability section.
5. **Given** a skill installed after the feature was defined, **When** a later task matches its description, **Then** it is eligible without any definition-time record naming it.

### User Story 2 - The same guidance reaches acceptance (Priority: P1)

As a user relying on independent review, I want the reviewer to judge the work against the guidance the task was given so that ignored guidance is caught before a completion claim rather than after release.

**Independent Test**: Submit finished documentation prose for independent review with both prose-quality skills named in the dispatch, and confirm the verdict states a judgment against them. Submit prose that reproduces the Feature 017 templating and confirm the reviewer can reject on prose grounds with no other finding present.

**Acceptance Scenarios**:

1. **Given** a completed task whose dispatch named applicable skills, **When** the independent reviewer records a verdict, **Then** the verdict states a judgment of the work against those named skills.
2. **Given** documentation prose that repeats a clause verbatim across several files and opens consecutive paragraphs identically, **When** it is reviewed, **Then** the reviewer may return `REJECT` on that basis alone, with the offending prose cited as the finding.
3. **Given** a task whose dispatch named no applicable skills, **When** the verdict is recorded, **Then** review proceeds exactly as it does today with no added obligation.
4. **Given** a rejection issued on prose grounds, **When** the finding is routed, **Then** it follows the existing rejection and revision procedure without a separate path.

### User Story 3 - Templated prose is detected instead of assumed absent (Priority: P2)

As a user who cannot read six documents in parallel, I want a deterministic report of phrases repeated verbatim across a changed document set so that templated writing cannot pass a green content check unnoticed.

**Independent Test**: Run the check over a fixture set reproducing the Feature 017 shape, including a clause present in five files and a phrase present in six, and confirm both are reported with every containing file listed. Run it over a set with no cross-file repetition and confirm it reports nothing. Run it over a set whose only repetition is deliberate contract wording and confirm the finding is reported for human resolution rather than silently suppressed or auto-accepted.

**Acceptance Scenarios**:

1. **Given** a document set in which a contiguous phrase appears verbatim in three or more files, **When** the check runs, **Then** it reports that phrase once with every file that contains it.
2. **Given** a document set with no contiguous phrase repeated across the threshold number of files, **When** the check runs, **Then** it reports no findings and signals a clean result.
3. **Given** repetition that occurs only inside fenced code, inline code, or command syntax, **When** the check runs, **Then** it is not reported as prose repetition.
4. **Given** a reported phrase that is deliberate contract wording repeated on purpose, **When** the reviewer resolves it, **Then** the work can proceed on the reviewer's recorded judgment without editing the check, adding an allowance file, or weakening the threshold.
5. **Given** a single-file document set or an empty set, **When** the check runs, **Then** it completes without error and reports no cross-file findings.

## Edge Cases

- A relevant installed skill belongs to no agent, so nothing in the roster would ever have surfaced it.
- Two installed skills both match a task, and both are named rather than one being scored above the other.
- A matching skill is opt-in, destructive, or authority-bearing, so a description match alone must not activate it.
- A skill is installed or removed between definition and execution, so applicability must be determined against the current installation.
- A task produces both code and documentation prose, so the applicable set spans more than one domain.
- The task text does not mention prose at all, but the target file paths are documentation.
- No skill matches, and the dispatch must not grow an empty or ceremonial section.
- Repeated wording is intentional: command grammar, task glyph legends, safety warnings, and identical contract sentences are legitimate and must remain possible.
- Repetition sits inside code fences, inline code spans, or file paths, where verbatim identity carries no prose signal.
- A document set has one file or none.
- A prose task is completed while no independent reviewer is available, in which case the existing readiness rules apply unchanged.
- The reviewer is given no named skills because none applied, and the verdict must not be blocked for a missing prose judgment.

## Functional Requirements

- **FR-001:** When the coordinator dispatches a task, it MUST determine which installed skills apply to that task's stated outcome and target artifacts, using each skill's existing description as the matching signal. Determination MUST read the current installation at dispatch time.
- **FR-002:** The dispatch MUST name the applicable installed skills to the receiving specialist by their installed identity, rather than relying on the specialist to rediscover them.
- **FR-003:** Independent acceptance for that task MUST receive the same named skills, MUST state a judgment of the work against them, and MUST be able to reject on that judgment alone. A rejection on those grounds MUST follow the existing rejection and revision procedure.
- **FR-004:** Skill applicability MUST NOT change agent routing. The roster stays closed, a skill MUST NOT manufacture or imply an agent, and no skill MUST require a dedicated agent to be reachable.
- **FR-005:** Opt-in disciplines, destructive procedures, and authority-bearing procedures MUST NOT be activated by a description match alone. They require explicit user intent or an explicit contract.
- **FR-006:** When no installed skill applies, dispatch and acceptance MUST be unchanged from current behavior and MUST NOT add an empty section, placeholder, or extra step.
- **FR-007:** A task that authors or revises human-facing documentation prose in this repository MUST carry `dude-pack-writing-avoid-ai-tropes` and `dude-pack-writing-style` in its applicable set while those skills are installed, and its acceptance MUST include an explicit prose-quality judgment.
- **FR-008:** A deterministic check MUST detect a contiguous prose phrase repeated verbatim across three or more files of a supplied document set and MUST report each such phrase together with every file that contains it. It MUST exclude fenced code, inline code spans, and command syntax from prose comparison, and MUST signal findings and a clean result distinguishably.
- **FR-009:** The check MUST report rather than adjudicate. Legitimacy of a reported repetition MUST be resolved by the reviewer's recorded judgment, without editing the check, adding an allowance list, or lowering its threshold, and the check MUST NOT be imposed as an unconditional gate on work that does not change prose.
- **FR-010:** Existing content-presence tests MUST remain in force. The new check adds a dimension those tests cannot observe and MUST NOT replace, relax, or subsume them.
- **FR-011:** The feature MUST NOT introduce a command, execution lane, workflow, agent, obligation or capability vocabulary, runtime mapper, resolver, activation tier, policy engine, registry, tag set, metadata schema, scoring model, or persistent resolution state. Applicability is computed at dispatch and is not stored.
- **FR-012:** Repairing the Feature 017 documentation MUST NOT occur under this feature, and no task in this package MUST mutate another feature's package or execution state.

## Key Entities

- **Applicable Skill Set**: the installed skills whose descriptions match one task's outcome and target artifacts, computed at dispatch from the current installation and discarded when the task ends. It has no stored form and no identity beyond the task.
- **Named Guidance In Dispatch**: the applicable skill identities carried in the dispatch text to the performing specialist and to the independent reviewer for that same task.
- **Prose Repetition Finding**: one contiguous phrase reported as appearing verbatim in three or more files of a supplied document set, together with the containing files. It is evidence for a reviewer, not a verdict.

## Success Criteria

- **SC-001:** For 100% of sampled tasks whose output includes human-facing documentation prose in an installation carrying the prose-quality skills, the dispatch names those skills. Zero such dispatches omit them.
- **SC-002:** For 100% of acceptance records on those tasks, a prose-quality judgment is present and attributable to the named skills, and at least one rehearsal shows a rejection issued on prose grounds with no other finding.
- **SC-003:** Given a document set containing a clause repeated verbatim in five files and a phrase repeated in six, the check reports both with every containing file listed and misses neither. Given a set with no phrase repeated across three or more files, it reports zero findings.
- **SC-004:** For tasks that match no installed skill, dispatch and acceptance output is byte-comparable to current behavior and adds no step, section, or prompt.
- **SC-005:** The agent roster and routing outcomes are unchanged, zero agents are added or re-scoped, and in every negative fixture no opt-in, destructive, or authority-bearing procedure activates from a description match alone.
- **SC-006:** Inspection of the complete change shows zero new commands, lanes, workflows, state surfaces, registries, tag sets, metadata schemas, scoring models, obligation vocabularies, and persistent resolution state.
- **SC-007:** Repetition inside fenced code, inline code, and command syntax produces zero findings across the fixture matrix, and deliberate repeated contract wording remains resolvable by reviewer judgment alone.
- **SC-008:** Repository validation passes and one fresh independent review approves the unchanged revision with no unresolved finding.

## Assumptions

- The two named prose-quality skills are installed here and are adequate for the job. Their content is not the gap.
- Every installed skill already carries a description written to be matched, so applicability needs no new vocabulary, tag, or annotation. The idea ledger provisionally preferred recording obligations instead of exact skill identities; this specification consciously assumes the existing descriptions are enough, and the user may overturn that.
- Naming applicable skills at dispatch is cheap enough to apply to every task without a selection budget or cache.
- Cross-file verbatim repetition is the one templating symptom in the verified incident that can be measured without semantic judgment. The rest stays with the reviewer.
- Three files is a defensible default threshold because the verified incident repeated wording across four, five, and six files. The exact parameters belong to the plan.
- The scope of this feature is the verified documentation-prose surface. Other output surfaces are deferred, not denied.
- Existing routing, roster closure, review independence, execution lanes, and close gates remain authoritative and unchanged.

## Out of Scope

- Repairing, rewriting, or re-reviewing the Feature 017 Ship documentation.
- An obligation or capability vocabulary, a runtime mapper between needs and installed skills, or definition-time recording of required skills.
- A skill registry, tag set, metadata schema, applicability score, activation tier, policy engine, or persisted resolution state.
- A second routing system, changes to closed-roster agent routing, or a new agent for the writing skills.
- Generalizing to prompts, agent and skill authority text, PR and commit content, release content, UI copy, or design, branding, accessibility, security, and domain procedures. Each remains a deferred non-goal until a concrete failure and acceptance test justify it.
- Semantic prose scoring, a style linter for tone or voice, or any automated verdict on writing quality.
- Turning optional style preferences into an unconditional repository gate.
- A new command, execution lane, workflow, board, task-state surface, or project state file.
