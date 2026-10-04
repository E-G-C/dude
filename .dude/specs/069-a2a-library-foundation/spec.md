# Feature Specification: A2A Library Foundation

**Idea:** `.dude/ideas/069-a2a-library-foundation.md`
**Scope:** Reusable library guidance, knowledge maintenance, and dogfood availability

## Problem

Dude needs reusable, source-backed knowledge of the Agent2Agent (A2A) protocol,
starting with its JavaScript software development kit (SDK). Repeating research
in each session loses version context and makes old advice look current.
Specialists must be available in rebuilt dogfood before they can help define
and implement the separate local/remote communication feature.

The user selected separate features with this library foundation first.
`.dude/ideas/068-agent-to-agent-communication.md` retains the communication and
collaboration vision. This package does not define or deliver that runtime.

## Goals

- Make A2A protocol and JavaScript SDK expertise reusable through the Dude library.
- Keep concise guidance tied to official sources, versions, and review dates.
- Provide complete, explicit procedures for refreshing knowledge and onboarding
  another language when a real task needs it.
- Demonstrate that the resulting capability can be discovered and used in
  rebuilt dogfood, rather than merely existing in the source catalog.

## Non-Goals

- Live local or remote A2A clients, servers, connections, or host adapters.
- Remote execution, autonomous assignment or claiming, Beads synchronization,
  work-state mutation, code integration, takeover, or cross-session Work recovery.
- A generic software-factory platform or a replacement for Dude's internal
  specialist routing, authoring, permission, review, or execution workflows.
- An update scheduler, daemon, automatic updater, or a chosen periodic interval.
- Pre-created support for unused languages, wholesale copies of upstream
  documentation, model training, or claims of permanent model memory.

## User Scenarios

### US1 - Get grounded A2A and JavaScript advice (P1)

As a contributor, I want reusable expertise that can explain the protocol and
the JavaScript SDK without claiming that a Dude integration already works.

**Acceptance scenarios**

1. Given the library capability is available, when a contributor asks how A2A
   agents discover one another and exchange results, the specialist explains
   the relevant protocol concepts, cites its source basis, and identifies
   application-owned security and work-authority decisions.
2. Given a JavaScript SDK question, when the specialist answers, it separates
   the SDK package version from the documented protocol target and identifies
   prerequisites, supported interaction choices, and compatibility limits.
3. Given a request to obtain another session's hidden memory or resume its work,
   when the specialist responds, it explains the unsupported assumption without
   connecting to that session or changing work state.

**Independent test:** Evaluate one protocol question and one JavaScript question
against the cited sources, then try the excluded session-access request. No
live A2A endpoint is needed.

### US2 - Use the library in rebuilt dogfood (P1)

As a Dude maintainer, I want the delivered capability available through normal
discovery and routing after installation and a dogfood rebuild.

**Acceptance scenarios**

1. Given the completed library sources, when the maintainer follows the existing
   installation and rebuild process, the coordinator can discover the
   specialist and select the applicable guidance for a bounded advice request.
2. Given the rebuilt dogfood installation, when that request is dispatched, the
   specialist returns source-grounded advice from the installed material.
3. Given an installation without this optional capability, when ordinary core
   operations are checked, they remain usable without an A2A dependency.

**Independent test:** Exercise installation, rebuild, fresh discovery, and an
actual advice dispatch. Separately check an installation without the capability;
source-file presence alone is insufficient.

### US3 - Refresh protocol and SDK knowledge explicitly (P2)

As a maintainer, I want to revisit official references and update guidance
without inventing a maintenance schedule or overstating freshness.

**Acceptance scenarios**

1. Given a refresh request or a relevant source/version-change signal, when the
   maintainer follows the procedure, both protocol and SDK references are
   checked and the result identifies changes, unchanged findings, and limits.
2. Given conflicting release and documentation claims, when guidance is
   refreshed, the conflict remains visible and unsupported compatibility claims
   are withheld.
3. Given an unavailable source, when a refresh is attempted, previously useful
   guidance remains identifiable by its original basis and the failed check
   does not become a successful review date.

**Independent test:** Walk through unchanged, protocol-only change, SDK-only
change, conflicting-source, and unavailable-source cases. Each must end with
usable guidance or a bounded limitation and a clear promotion decision.

### US4 - Onboard another language only when needed (P2)

As a coordinator with a concrete language-specific task, I want a procedure
that consults the official SDK and supplies a corresponding library specialist
without accumulating unused or duplicate agents.

**Acceptance scenarios**

1. Given a task naming another language and its needed outcome, when the
   procedure runs, it establishes the official SDK's source and compatibility
   basis and checks existing specialists before proposing a new one.
2. Given an adequate existing specialist, when the same language is requested,
   the coordinator reuses it with the relevant guidance.
3. Given no adequate specialist and authorized authoring, when the procedure
   completes, a scoped library specialist is authored, reviewed, installed, and
   verified through the existing workflows.
4. Given no verified official SDK or unresolved ownership, when the procedure
   reaches that limit, it reports the missing basis rather than inventing an SDK,
   creating speculative agents, or bypassing authority.

**Independent test:** Exercise reuse, create, and unavailable/ambiguous cases in
a disposable authoring environment. Verify the create path through discovery
and one advice request, then discard the test-only language material.

## Functional Requirements

- **FR-001:** The library must offer an optional specialist capability for A2A
  protocol and JavaScript SDK advice.
- **FR-002:** Protocol guidance must cover participants, capability discovery,
  messages and results, task lifecycle, interaction modes, compatibility, and
  authentication, authorization, and privacy responsibilities.
- **FR-003:** JavaScript guidance must explain SDK prerequisites, client and
  server responsibilities, available transport choices, streaming and
  cancellation concepts, and where to find official examples.
- **FR-004:** The maintainer must retain all four user-supplied references and
  give each material guidance topic an official source, identifiable revision
  or release, retrieval/review date, and supported version scope.
- **FR-005:** The specialist must distinguish documented facts, recommendations,
  and observed execution evidence in its answers.
- **FR-006:** The specialist must disclose stale, unavailable, or contradictory
  evidence before relying on an affected claim.
- **FR-007:** The maintainer must make the capability discoverable and usable in
  rebuilt dogfood through the existing library installation workflow.
- **FR-008:** Core Dude behavior must remain independent of this optional
  capability and of an installed A2A SDK.
- **FR-009:** The maintainer must have an explicit refresh procedure with
  inputs, source-change checks, ownership, update steps, and verification for
  both protocol and SDK guidance.
- **FR-010:** A failed or incomplete refresh must preserve the last supported
  guidance basis and identify the remaining verification limit.
- **FR-011:** Initial maintenance must work on explicit invocation without
  selecting a periodic cadence or requiring a scheduled process.
- **FR-012:** For an admitted language-specific task, the coordinator must be
  able to identify the official SDK and produce a source-backed onboarding
  handoff containing the needed scope, version basis, and verification plan.
- **FR-013:** The onboarding procedure must reuse a suitable existing specialist
  or create a corresponding scoped library specialist through existing
  authoring and composition authority when no suitable one exists.
- **FR-014:** If official SDK evidence or authoring authority is missing, the
  onboarding procedure must stop the affected action and return the missing
  basis without making unsupported substitutions.
- **FR-015:** Refresh and onboarding changes must receive applicable validation
  and independent review before the coordinator presents them as available.
- **FR-016:** Library advice and protocol terminology must not grant remote
  execution, access to hidden session internals, or authority over Dude work
  state, reviews, or completion.

## Key Entities

- **Guidance baseline:** Concise protocol or SDK knowledge with source references,
  supported version scope, dates, and known limits.
- **Library specialist:** A discoverable role that applies that guidance to an
  authorized request; it is not an A2A server.
- **Refresh request:** A bounded request to compare the baseline with official
  sources and return reviewed changes, no change, or a supported limitation.
- **Language onboarding handoff:** A task-specific source and scope summary for
  reusing or authoring a corresponding specialist.
- **Dogfood availability evidence:** Observed installation, discovery, and use
  of the delivered capability after rebuilding Dude.

These are concepts in the existing library workflow, not new runtime records.

## Edge Cases

- A protocol repository release, the documentation label, and the SDK target
  disagree: retain their separate meanings and do not claim automatic support.
- A topic page is older than the selected specification: identify the conflict
  and ground the affected advice in the selected authoritative contract.
- A reference cannot be reached: offer the dated supported baseline, not a
  claim that the latest upstream material was checked.
- A requested SDK is unofficial, absent, or incompatible with the task's target:
  return the limitation before creating or installing a specialist.
- An existing agent partially overlaps the language need: inspect its actual
  scope; do not create a duplicate or resolve ambiguous ownership by name alone.
- Installation or refresh fails, or the host still sees an old roster: report
  unavailable or unverified capability; do not count catalog presence as use.
- Upstream content contains operational instructions: treat it as source data,
  not permission to execute, disclose private data, or change workflow state.

## Success Criteria

- **SC-001:** Both US1 advice cases cover the required topics, identify their
  source/version basis, and distinguish advice from execution evidence.
- **SC-002:** US2 demonstrates a fresh installation/rebuild/discovery/use cycle,
  plus an absent-capability check with no new core dependency.
- **SC-003:** All five US3 cases produce the specified result without an
  invented interval, false review date, or unsupported compatibility upgrade.
- **SC-004:** US4 demonstrates reuse and a complete disposable create path;
  missing-evidence and ambiguous-owner cases stop correctly, and no unused
  non-JavaScript specialist remains in the delivered library.
- **SC-005:** All four original references remain available, and every material
  guidance topic has the provenance required by FR-004.
- **SC-006:** Exclusion probes cause no live A2A connection, hidden-session
  access, workflow-state mutation, or claimed integration success.

## Assumptions And Deferred Decisions

The literal scope choice `1` is recorded in the idea ledger. No additional
user-supplied assumptions are asserted here. Official sources can be consulted
for technical decisions; unavailable evidence is handled as specified above.

Periodic maintenance cadence remains deliberately unselected. Remote hosts,
network topology, distributed permissions and work authority, Beads deployment,
and code integration remain with idea 068. They are not prerequisites for this
library-only outcome. No blocking definition clarification remains.
