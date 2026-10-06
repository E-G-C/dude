---
title: Local and remote agent communication
slug: agent-to-agent-communication
work_type: design
design_status: approved
approved_direction: "Native proposal-result interaction v2 (sha256:4bc7f99210886742d80e74b6a5c794ad7f36828f2facf1a71f49fd9cc4600822): complete adapter-produced native proposal results, separate sharing and command scopes, exact one-use local approval, and honest proposal lifetime and unavailable outcomes."
preview_path: .dude/specs/068-agent-to-agent-communication/design/interaction-v2.md
---

# Feature Specification: Local and remote agent communication

**Source idea**: `.dude/ideas/068-agent-to-agent-communication.md`
**Intent basis**: Accepted AI-backed revision at `2026-09-23T12:28:40Z`; presentation redefinition selected by literal `1` at `2026-09-24T15:17:35Z`; fixed output-bound revision selected by literal `B` at `2026-09-30T11:29:27.063Z` (quoted reply time). CLI-first testing direction at `2026-09-30T20:21:13.749Z` changed T025's measurement host. The Windows CLI scope approved at `2026-10-01T20:43:35Z` is narrowed by the user's reply at `2026-10-02T00:56:31.239Z`: "yes, try to automate the local test using copilot cli as much as you can. Avoid the github copilot app". Remaining acceptance is local CLI coverage plus bounded retained LAN evidence, with untested physical-LAN, macOS/cross-OS, and App-specific qualification deferred.
**Status**: The exact native proposal-result interaction v2 remains approved. T025-T028 have completed calibration, guard implementation, independent offline verification, and delivery under their recorded boundaries. T019 remains residual local acceptance/evidence and T020 remains independent final review. Retained LAN sharing is narrow observed evidence, not complete qualification. This amendment supplies no new passing verdict, execution authority, or support claim.

## Purpose and Scope

A Dude user can ask another agent for confirmation that depends on evidence available to that agent. Both agents keep their AI reasoning and useful local tools. The asking agent, A, sends a question; the responding agent, B, inspects locally approved evidence, explains its conclusion in natural language, and states what remains uncertain. When existing evidence is insufficient, B may run specific verification operations approved beforehand by B's own user.

The historical motivating case is A on Windows asking B on Mac, with other Dude sessions in the GitHub Copilot desktop app as the first proposed peers. Same-computer and private local area network (LAN) communication remain capabilities, with authentication, recipient verification, and encryption required in both contexts. Remaining initial acceptance uses actual GitHub Copilot CLI in two isolated sessions/workspaces on one Windows machine. Separate contexts do not imply whole-session security isolation.

Retain the three observed Windows-to-Windows share-only LAN exchanges as user-supplied native-display evidence with coordinator hash checks. Do not repeat their setup or conversations. Untested physical-LAN commands, failure/cancellation, security negatives, and foreground/minimized/locked/busy availability remain deferred and unqualified; local results cannot qualify them. macOS/cross-OS and App-specific qualification are also deferred and nonblocking for this increment. The GitHub Copilot App is excluded from current execution and qualification, including as an automation fallback. Historical motivation, observations, failures, and approved mock labels remain unchanged.

All local functional, command, approval, security, refusal, lifetime, evidence, bound, and cleanup obligations remain applicable. Fill native/live gaps with actual local sessions, connections, and harmless verification processes, not simulated effects. Automate only supported orchestration and result collection, with evidence directly readable by Tester and Reviewer and no per-question user relay. Full native proposal review and the actual current local approval remain the human's responsibility. General automation direction grants no unnamed operation, expanded permission, approval replay, or restart.

The plan assigns requirement-linked applicability and evidence reuse to all 29 scenarios, SC-001 through SC-014, and VSC-001 through VSC-005. An observation may support only part of a criterion; deferral is never a pass. Support claims must name the observed host, operating-system, runtime, peer, and qualified behavior, with no broad version-compatibility or universal A2A promise.

The outcome is a useful agent conversation, including evidence inspection and bounded fresh verification, without transferring authority over either participant's work. A peer's question can trigger an operation already approved by the receiving agent's own user. It cannot supply that approval.

### Out of Scope

- General implementation delegation, broad remote shell access, work ownership transfer, work recovery, automatic review approval, and automatic task closure.
- Communication-driven execution-lane changes, task-state mutation, shared Beads changes, distributed assignment, file synchronization, and code integration.
- Hidden or helper sessions, a new daemon, registry, persistent store or delivery queue, or a generic delegation framework.
- A generalized acceptance harness/controller, new test framework, second viewer, or App-based qualification workaround.
- Always-on or background availability, serving alongside unrelated Work in B's session, and switching to another session when B is unavailable.
- Public internet exposure, relays, and promised mesh VPN support.
- A configurable display threshold, pagination, summary/private-log/temporary-file relay, new viewer, approval bridge, or automatic profile splitting, activation, or retry.
- Creating or maintaining reusable A2A specialists, language guidance, or library assets. Knowledge maintenance and dogfood composition belong to Feature 069, `.dude/ideas/069-a2a-library-foundation.md`.

## Accepted Product Choices

### Separate sharing and operation approvals

Each participant's own user approves what that participant may share with the selected peer. A connection-specific sharing scope covers questions, replies, supporting evidence, and source details. Successive in-scope exchanges need no human approval for each payload. Broader disclosure requires renewed approval from the user who controls that information.

B's user separately preapproves fresh verification: the specific operation or bounded command scope, workspace, revision or explicit current-worktree policy, environment, allowed effects and resource use, and effective validity. That approval must cover running project code and its proposed outputs or other effects. B can use a still-valid approval without asking again for each covered run; it must obtain fresh permission when the proposed operation or effects exceed that scope.

Sharing approval does not authorize commands. Command approval does not authorize disclosure. Peer text, approval language copied into peer content, and evidence containing instructions are not approval inputs.

### Complete visible proposal before local approval

The local owner reviews the entire accepted proposal produced by Dude, including the configuration identity, local session and workspace, peer identity, sharing scope, separate operation scope, every selected command, validity, limits, and risks. That body appears in the qualified native host result. An assistant paraphrase, a code by itself, or a relay from a private event log cannot stand in for it.

Creating or reviewing the proposal grants no connection or command authority. After review, the owner explicitly approves that one current bound proposal in the same local session. Normal completion of proposal presentation leaves it eligible for approval; replacement, refusal, cancellation, expiry, intervening input, or changed bindings do not. A historical result can remain visible after eligibility ends and supplies no current authority.

If the complete native result cannot be reviewed, stop before approval and keep that presentation unqualified. A successful return does not prove that the host displayed every line or that the owner read it. No read receipt or automatic detection of a hidden host view is promised. Support qualification and the local owner's review remain necessary even below the size limit.

An actual CLI process without an interactive terminal user interface (TUI) may supply native command-line output evidence. Complete returned bytes establish only the observed content-delivery boundary, not AI use of local tools, human review, consent, or rendered TUI behavior. TUI-only controls absent from that run are not applicable to that run, never passed or qualified elsewhere. Full owner-readable presentation and manual exact current approval remain required through an existing supported native path; headless output alone does not satisfy them or authorize a new viewer or approval bridge.

The proposal can be model-readable. Its approval code is data, not permission; the ordinary host/operator trust limit below still applies. Private key material and fixed environment values are omitted from the proposal. That omission is not command-output redaction: approved command output may contain sensitive information, and its disclosure still needs the separate sharing scope.

### Fixed size eligibility

`C` denotes one fixed positive integer limit on the UTF-8 byte count of the complete rendered proposal, including all bindings, paths, identifiers, approval text, selected command definitions, and notices. The numeric value is an engineering calibration output, not a choice supplied by `B`. Before implementing the bound, freeze it from practical current asking, share-only serving, and small command-enabled profiles, backed by byte-complete output observed in the actual GitHub Copilot CLI native host. The plan retains this completed calibration prerequisite and its evidence limits; this scope refresh does not repeat it.

A proposal at or below `C` is eligible by size only; every other approval and support condition still applies. Above `C`, Dude returns a short refusal before the proposal becomes ready or usable for approval. An eligible replacement attempt withdraws any earlier pending proposal; neither that earlier proposal nor the refused one can later be approved. No approval code, approval command, or partial approvable result is returned.

The 1 MiB configuration-input limit remains independent of `C`. A valid configuration below that input limit can still produce an oversized proposal. Wire-message and command-output limits retain their separate meanings.

Usable profiles must fit `C`. The owner may explicitly select a smaller profile for one activation at a time, with a fresh complete review and ordinary fresh local approval. Dude does not split a selection, omit commands, activate the next profile, or retry automatically. The refusal causes no listener or transport start, verification or command execution, revision probe, or disclosure of proposal content.

### AI reasoning under ordinary local controls

B can use its locally permitted tools to find and inspect approved evidence, compare results, explain why they do or do not answer A's question, and select an applicable preapproved verification operation. Answers may include synthesis and uncertainty; they are not restricted to quotes, fixed fields, or a lookup result. A also retains its AI and tools.

Both sessions rely on their ordinary host permissions and instructions, with their known limitations. This feature provides no enforced whole-session read-only isolation, global sandbox, or guarantee of zero arbitrary model effects or disclosure. The sharing scope is a policy for model-authored prose as well as evidence, not proof that every possible generated answer will obey it. Peer content and approved local sources can contain prompt injection; ordinary controls may not prevent persuasion or unintended disclosure.

Local approval also relies on the host and operator. Software already permitted to inject local instructions can spoof an approval without being distinguished; the feature does not prove human authorship. Peer payloads and model-supplied approval claims remain data, not an approval channel.

A treats B's response like information from a file or web page. A may reason and act under its existing user request and approvals. Delivery itself grants no permission and starts no separate activity. Broad preexisting tool approval or autonomous Work does not turn peer content into owner authority or remove its prompt-injection risk.

### Evidence and conclusions

B returns a question-specific conclusion, supporting evidence, relevant source and revision information, command and environment provenance, and uncertainty. Missing or inapplicable provenance is explicit. The answer distinguishes evidence that already existed from verification performed for this exchange, third-party claims, and unsupported assertions or model inferences.

Authentication establishes the participant, not the truth of its conclusion. A structured response, citations, or a successful command do not certify the model's reasoning or prove a broader claim than the observed evidence supports. Fresh evidence from B can inform A; it does not close tasks or replace A's required independent acceptance, verification, or review.

### Availability and cancellation

B's selected existing session is user-enabled and set aside for confirmation exchanges and their approved local operations, one exchange at a time. This is an operating policy under ordinary local controls, not a whole-session tool restriction. It does not authorize concurrent unrelated Work or promise that B remains available when its user is absent. While B is available and approvals remain applicable, follow-up exchanges require no per-payload prompt.

If B cannot currently accept a question, A receives unavailable. There is no queued delivery, substitute session, automatic Work pause or resume, or restoration of an old exchange from history.

Ending an exchange stops later message acceptance and sending, withholds unsent replies, and rejects late replies. Cancellation can request that an associated verification operation stop through available controls. It cannot guarantee termination of already-running operating-system processes or all B model activity, undo outputs or resource use, or recall information already delivered. Delivery and execution remain unknown when observations cannot establish their outcome.

Initial acceptance must report the local host's actual foreground, minimized, locked, busy, and inactive behavior where applicable. A lock on the one test machine affects both sessions; it is not evidence for an independently locked remote B while A stays active. A host-only fact that cannot be automated needs a bounded observation or remains unqualified, not a simulated equivalent.

## User Scenarios and Testing

Story priorities rank user value; approval, identity, and lifetime requirements apply to every story.

### US1 - Get a reasoned answer from existing local evidence (Priority: P1)

A user asks another Dude session whether its local evidence supports a particular claim, without manually copying the surrounding conversation.

**Independent test**: Provide an available local Windows CLI pair, an already-approved sharing scope, and existing local evidence with known revisions, including a relevant result and an older or conflicting result. No fresh-verification approval is present. B must inspect the evidence with its local tools and explain its bearing on the question; a prerecorded answer or field-only lookup is insufficient. Use the two isolated local contexts for remaining native/live gaps. Retained LAN exchanges provide only their recorded sharing evidence; no LAN conversation is repeated.

**Acceptance scenarios**

1. **Given** relevant approved local evidence, **when** A asks for confirmation, **then** B uses local tools to inspect it and returns a natural-language conclusion explaining what it supports and what it does not, without a per-payload approval prompt.
2. **Given** results for different revisions or environments, **when** A asks about one particular revision and environment, **then** B distinguishes the relevant result from the others and states any remaining gap instead of giving an unqualified confirmation.
3. **Given** absent evidence or only stale, partial, conflicting, or third-party material, **when** B answers, **then** those limits remain visible and B neither invents fresh results nor runs unapproved verification.
4. **Given** B remains available within the approved sharing scope, **when** A asks an in-scope follow-up, **then** B reasons about that question using approved evidence without requiring another sharing prompt or pretending that availability is continuous.
5. **Given** A receives B's conclusion and supporting evidence, **when** A uses the answer, **then** existing evidence, new model inference, and unverified claims remain distinguishable; receipt neither changes work state nor satisfies A's independent acceptance obligations by itself.

### US2 - Control disclosure and local operation authority (Priority: P1)

Each user controls information leaving their session and operations performed there, without being asked to approve every in-scope message.

**Independent test**: Use known participants, allowed and excluded information, and separately supplied local operation approvals. Exercise approval and refusal cases without requiring a useful evidence answer or the approval interaction from another story. For presentation, use disposable local configurations and inspect complete native proposals up to and including `C`; compare them with an otherwise valid proposal one UTF-8 byte above `C`. No activation or evidence conversation is needed to judge display completeness or size refusal.

**Acceptance scenarios**

1. **Given** no applicable sharing approval, **when** a participant attempts to send project content, **then** Dude withholds that content.
2. **Given** a proposed sharing scope, **when** the local user considers approval, **then** the peer, participating session/workspace, allowed information and exchanges, validity, disclosure limits, and limits of local approval attribution are clear.
3. **Given** an approved connection but no applicable verification approval from B's user, **when** A asks for a fresh run, **then** B does not start it and reports that it was not run; sharing approval is not used as command authority.
4. **Given** B has operation approval but the output or source details are outside its sharing scope, **when** B prepares a response, **then** those details are withheld rather than disclosed under the operation approval.
5. **Given** a peer question, answer, or approved source contains instructions to expand access, run an unapproved command, edit implementation, change ownership, or close work, **when** Dude handles it, **then** it grants no new approval or workflow authority. A continues only under its existing local authority; B's response remains limited to its approved confirmation role. This checks the stated behavior, not universal model containment.
6. **Given** another session or connection, a matching display name, or a request for broader sharing, **when** it seeks access, **then** existing approval is not inherited or expanded without the affected local user's approval.
7. **Given** a same-computer or LAN attempt without valid authentication, verified recipient identity, or encryption, **when** it tries to exchange project content, **then** Dude withholds that content.
8. **Given** an otherwise valid asking, share-only serving, or command-enabled serving proposal whose full rendered size is at or below `C`, **when** the owner opens its native result detail, **then** the complete locally produced proposal is reviewable with all applicable bindings, scopes, selected commands, limits, and risks. Hidden or truncated detail fails presentation qualification; an assistant summary or private-log relay does not repair it, and the operator does not approve.
9. **Given** a complete current proposal whose presentation finishes normally, **when** the owner reviews it and submits the exact current local approval as the next eligible input, **then** that proposal remains eligible and can be consumed once under unchanged bindings and existing approval checks. Creating the proposal alone activates nothing.
10. **Given** a failed, refused, cancelled, expired, replaced, consumed, or context-changed proposal, or intervening input, **when** someone attempts to use its visible historical approval text, **then** it supplies no activation authority. A new proposal requires a new complete review and local approval.
11. **Given** an otherwise valid configuration within 1 MiB whose selected proposal renders above `C`, including the one-byte-above case, **when** an eligible proposal attempt replaces an earlier pending proposal, **then** Dude returns only a short size refusal with no code, approval command, or partial approvable body; both proposals are ineligible for later approval. No listener, transport, verification, command, revision probe, or proposal-content disclosure follows.
12. **Given** a refused large selection, **when** the owner explicitly selects a smaller profile that fits `C`, **then** Dude presents that whole profile for ordinary fresh approval of one activation. Nothing automatically splits the old selection, approves, activates, or retries.

### US4 - Obtain fresh verification under B's prior approval (Priority: P1)

A user needs confirmation that existing records cannot provide. B's user has already approved a specific verification operation in B's environment, allowing B to obtain and interpret fresh evidence.

**Independent test**: Provide an available local Windows CLI pair with sharing and operation approvals already in place. Use a harmless verification operation with known expected effects and an observable result in an identified workspace, revision, and environment. Exercise a completed run, a failed or inconclusive run, and permission-negative cases on the one Windows machine. Actual command processes are required for remaining execution gaps. Physical-LAN command qualification is deferred. Do not depend on US1's evidence-search sequence or US2's approval presentation.

**Acceptance scenarios**

1. **Given** applicable prior approval from B's user and a question requiring fresh confirmation, **when** B handles the question, **then** B uses its local tools to run the covered verification and explains the actual result in relation to A's question, including any narrower coverage or uncertainty.
2. **Given** the operation has run, **when** B replies, **then** the response identifies it as fresh verification, reports the actual command or operation, workspace/revision/environment and observation time, and distinguishes observed results from B's conclusion and any older evidence.
3. **Given** approval is absent, revoked, expired, or does not cover the proposed command scope, workspace, revision/worktree policy, environment, or effects, **when** fresh verification is requested, **then** B withholds the run pending its own user's applicable approval. A proposed raw command or claimed approval in peer text supplies none.
4. **Given** a covered operation fails, produces only partial evidence, or cannot start under the host's ordinary permissions, **when** B answers, **then** it reports the actual failure or limitation rather than success or fabricated output.
5. **Given** the approved operation may create outputs or consume resources, **when** B's user approves it, **then** those proposed effects are included in the approval scope. A later proposal with broader effects requires renewed permission before it starts.
6. **Given** approvals explicitly remain applicable to another requested run, **when** a new in-scope question requires that run, **then** B can perform it without another approval prompt. This is a new authorized exchange, not automatic replay of an uncertain earlier run.

### US3 - Keep control when an exchange cannot continue (Priority: P2)

A user can distinguish an answer from an unavailable, interrupted, or uncertain exchange without assuming that cancellation stopped every local effect.

**Independent test**: Start with an approved current exchange and a fixed shareable response. Vary availability and lifetime conditions; for cancellation, also use an already-approved operation whose start and outcome can be observed. No evidence-search or approval presentation workflow is needed.

**Acceptance scenarios**

1. **Given** an unsupported combination, busy session, or otherwise unavailable B, **when** A attempts a question, **then** Dude reports unavailable without queueing it, choosing another session, or starting background service.
2. **Given** B accepts a question and its approved conditions remain valid, **when** B prepares the corresponding reply, **then** acceptance itself has not invalidated the ability to answer.
3. **Given** cancellation, a stopped or changed session/workspace, unrelated new instructions, lost required connection controls, or revoked/expired sharing approval, **when** the exchange ends, **then** Dude stops accepting or sending later messages for it, withholds unsent replies, and rejects replies arriving afterward.
4. **Given** verification has already started, **when** the exchange is cancelled, **then** cancellation is requested through available controls and the reported execution outcome reflects observations. The report does not claim that all processes, model activity, or effects stopped merely because communication ended.
5. **Given** connection loss after a question or reply may have been delivered, **when** delivery or execution cannot be established, **then** Dude reports that uncertainty without automatically repeating the question, reply, or verification.
6. **Given** a late, duplicate, unsolicited, or different-peer reply, or a reconnect using saved history, **when** it attempts to continue the old exchange, **then** Dude rejects it as a current answer and does not restore authority from the historical record.

## Functional Requirements

### Connection and sharing approval

- **FR-001**: Dude must support AI-backed A2A questions, answers, and approved evidence exchange with selected existing GitHub Copilot CLI sessions on one Windows computer and on two Windows computers on the same private LAN. Initial qualification follows the boundary in Purpose and Scope; the LAN capability is not removed by deferring its remaining qualification.
- **FR-002**: Dude must require an applicable user-approved connection sharing scope before disclosing project content to a peer.
- **FR-003**: Dude must show the peer, participating session/workspace, allowed information and exchange purposes, and effective validity of a proposed sharing scope before approval.
- **FR-004**: Dude must establish that the recipient is the participant bound to the approved scope before sending scoped information.
- **FR-005**: Dude must protect connection content and authentication material in transit from unapproved recipients in both local and remote contexts.
- **FR-006**: While the connection scope and receiver availability are valid, Dude must allow in-scope questions and replies automatically without requiring per-payload approval.
- **FR-007**: Dude must obtain renewed user approval before expanding a connection's sharing scope.
- **FR-029**: Dude must require authentication and encryption for every same-computer or LAN connection before sharing project content.
- **FR-042**: Before approval, Dude must make every accepted locally produced proposal reviewable in full in the qualified native host result, with its configuration and participant/peer bindings, separate sharing and operation scopes, every selected command, limits, validity, and risks; a paraphrase or private-log relay is not a substitute.
- **FR-043**: Creating or reviewing a proposal must not activate communication or authorize a verification operation.
- **FR-044**: Dude must accept local approval only for the current matching, unconsumed proposal; refusal, a detected failure to produce or return the complete proposal, cancellation, expiry, replacement, intervening input, or changed bindings makes the old proposal ineligible.
- **FR-045**: Normal completion of proposal presentation must leave an otherwise valid proposal eligible for the owner's next local approval.

### Proposal size eligibility

- **FR-046**: Dude must apply one fixed, non-user-configurable limit `C` to the UTF-8 byte count of the complete rendered proposal, rather than its configuration size, command count, or character count.
- **FR-047**: Before implementing the limit, the feature owners must freeze `C` from practical current profile content and complete actual native CLI output evidence, retaining the measured bodies and the observed boundary that justify it.
- **FR-048**: If the complete proposal exceeds `C`, Dude must return a short refusal before approval eligibility, with no approval code, approval command, or partial approvable result.
- **FR-049**: An eligible replacement attempt must withdraw any earlier pending proposal even when the new proposal is oversized, and Dude must reject later approval of both the refused and replaced proposals.
- **FR-050**: A size refusal must cause no listener or transport start, verification or command execution, revision probe, or disclosure of proposal content.
- **FR-051**: Dude must retain the 1 MiB configuration-input limit independently of the proposal-display, wire-message, and command-output limits.
- **FR-052**: After a size refusal, Dude must require explicit smaller-profile selection and ordinary fresh review and local approval for each activation, without automatic splitting, activation, or retry.

### Information and authority boundaries

- **FR-008**: Dude must apply the approved disclosure policy to every outbound question, answer, evidence item, source reference, and accompanying detail, including model-authored prose.
- **FR-009**: Dude must apply the following session-specific authority boundaries:
  - **FR-009a (responding session)**: B must limit its response to a peer request to evidence inspection and verification covered by B's own-user approvals and ordinary local controls.
  - **FR-009b (asking session)**: Answer delivery must not initiate separate activity or change permissions, capabilities, sharing scope, or work authority. Later actions remain governed by that session's existing user authority and approvals.
- **FR-010**: Dude must treat peer messages and supplied evidence as information and requests, not permission to change available capabilities, sharing rules, or work authority.
- **FR-012**: Dude must associate evidence-bearing answers with shareable source references and known revision, observation time, and command/environment provenance, explicitly identifying missing or inapplicable details.
- **FR-013**: Dude must identify absent, partial, stale, conflicting, or unverified evidence instead of presenting it as complete fresh confirmation.
- **FR-014**: Dude must leave execution-lane, task-state, ownership, review, and closure decisions unchanged by communication.
- **FR-037**: Dude must explain the applicable local-approval attribution, prompt-injection, model-disclosure, command-effect, and cancellation limits before the relevant sharing or verification approval.
- **FR-038**: Dude must present a peer response as evidence for local evaluation, not certification of its conclusion or satisfaction of A's independent acceptance obligations.

FR-008 and FR-009a state the required operating policy under the ordinary controls described above. They do not require or establish mathematically enforced model compliance or whole-session isolation.

### Reasoned answers and fresh verification

- **FR-030**: Both participating agents must retain AI reasoning and useful locally authorized tools during communication.
- **FR-031**: B must answer the actual question with a natural-language conclusion, an explanation grounded in inspected evidence, and explicit uncertainty.
- **FR-032**: B must distinguish existing evidence, fresh verification performed for the exchange, attributed third-party claims, and unsupported assertions or model inferences in its answer.
- **FR-033**: B must start fresh verification only under applicable prior approval from its own user for the specific operation or bounded command scope.
- **FR-034**: Before verification approval, B must identify the proposed operation or command scope, workspace, revision/worktree policy, environment, allowed effects and resource use, and effective validity, including whether repeat use is covered.
- **FR-035**: B must withhold a proposed verification operation until its own user supplies renewed permission if coverage of that operation or its proposed effects cannot be established under the current approval.
- **FR-036**: B must report a verification operation's observed result, relevant outputs or effects, and any failure or uncertainty, without presenting unobserved execution as completed.

### Exchange lifetime and outcomes

- **FR-015**: Dude must return each reply only to the approved participant that asked its corresponding current question.
- **FR-016**: If the target cannot currently accept a question, Dude must return unavailable without scheduling later delivery or substituting another session.
- **FR-017**: Accepting a question must not by itself prevent the session from answering it while the approved conditions still hold.
- **FR-018**: Dude must end an exchange's communication authority when the operator cancels, the session stops or receives unrelated new instructions, the participating session or workspace changes, required connection controls become unavailable, or sharing approval is revoked or expires.
- **FR-019**: After an exchange's communication authority ends, Dude must stop accepting or sending later messages for that exchange, including withholding unsent replies.
- **FR-021**: Dude must distinguish an answer from missing evidence, refusal, unavailability, cancellation, and uncertain delivery or execution.
- **FR-022**: Dude must report uncertain delivery or execution without automatically repeating the question, reply, or verification.
- **FR-023**: After losing the current connection context, Dude must not treat saved messages or a prior exchange's approvals as permission to resume that exchange.
- **FR-039**: Dude must reject late, duplicate, unsolicited, or mismatched replies rather than deliver them as answers to a current or later exchange.
- **FR-040**: When ending an exchange with verification in progress, Dude must request cancellation through available controls without treating the request as proof of termination.
- **FR-041**: Dude must report the known execution outcome after cancellation and explicitly preserve uncertainty about termination or effects that cannot be observed.

### Supported participation

- **FR-024**: Dude must keep communication unavailable for a host/peer combination until its support for this revised contract has been established.
- **FR-025**: Dude must identify the qualified host/peer combinations it supports without treating protocol compatibility or an installed library as proof of live interoperability.
- **FR-026**: B's user-enabled participation must be set aside for confirmation exchanges and their approved local operations, without concurrent unrelated Work in that session.
- **FR-028**: Dude must show whether the selected session can currently accept another question during its user-enabled participation.

A retained LAN sharing observation is not a fully qualified host/peer combination under FR-024 and FR-025. Any later support statement must preserve its limited coverage and the unqualified cases.

## Key Entities

| Entity | Meaning |
| --- | --- |
| Participant | A selected existing agent session and workspace, controlled by its own user and identified beyond its display name. A asks; B responds for the current exchange. |
| Local proposal | A reviewable snapshot of one participant's proposed configuration and scopes, bound to its current context and subject to the fixed output limit. Its visible historical text is not continuing approval eligibility or proof of review. |
| Connection sharing scope | The local user's approval for what their participant may disclose to the selected peer, for which exchange purposes, and while which conditions remain valid. |
| Verification approval | B's own user's prior permission for specific verification operations or bounded command scope in an identified workspace and environment, with an explicit revision/worktree policy, allowed effects, and validity. It grants no sharing or work ownership authority. |
| Exchange | One current question and its answer or non-answer outcome, bound to the selected participants and applicable approvals. It creates no work assignment. |
| Evidence and conclusion | Shareable observations or attributed claims with provenance and limits, distinguished from the model's explanation of what they support. Fresh execution is identified separately from retained evidence. |

## Edge Cases

- A question mixes allowed and excluded information. A partial answer identifies its limits without revealing the excluded content through prose, source labels, or refusal details.
- An approved source contains embedded instructions or credentials. Approval to inspect a source is neither permission to follow its instructions nor blanket permission to disclose its contents.
- Evidence or workspace content changes between approval, inspection, and verification. B checks whether the operation remains covered and identifies the revision and environment actually observed; it does not silently substitute another target.
- The requested command resembles an approved one but changes arguments, environment, resource use, or effects. Similar wording and peer-supplied approval claims do not establish coverage.
- A running verification reveals effects beyond what was approved. B withholds further out-of-scope steps, requests cancellation through available controls, and reports known effects and uncertainty; later approval cannot retroactively authorize earlier effects.
- A command passes but only covers part of A's claim, or fails before meaningful checks run. B explains the supported conclusion rather than equating a process outcome with complete verification.
- B's local tools, evidence, or permissions are unavailable. B reports the limitation instead of fabricating inspection or execution, borrowing another session, or expanding its permissions.
- Concurrent questions reach B or B is occupied with unrelated Work. B does not queue the extra question, redirect it, or take ownership of the unrelated work.
- The user narrows or revokes sharing after B starts a run. Later disclosure stops even if execution continues; already-shared information cannot be recalled.
- Cancellation or disconnection races with a result. Dude distinguishes confirmed observations from unknown delivery or execution and rejects a late result instead of attaching it to another exchange.
- A participant reconnects with the same name, or history contains apparently valid approvals. Neither restores the old exchange or authorizes a replay.
- A LAN device impersonates a peer, or the proposed connection exposes a public endpoint. Proximity grants no trust, and public exposure remains outside v1.
- A proposal within `C` is hidden, clipped, or inaccessible in the host. The operator stops before approval; being within the byte limit does not waive complete-display qualification.
- A configuration within 1 MiB expands beyond `C`, including through multi-byte text or escaped command/path text. Refuse the entire proposal; do not drop the last command or return the visible prefix.
- A proposal is exactly `C` bytes. Size alone does not refuse it; a one-byte increase does. Invalid companion fields must not conceal a broken size check during verification.
- An oversized replacement follows a still-pending small proposal. The earlier code is withdrawn, not restored after refusal.
- A proposal result finishes normally while the owner is reading. Normal completion alone does not cancel it. A genuine stop, queued/intervening input, changed context, replacement, or expiry still invalidates approval eligibility.
- An old result stays visible after replacement, cancellation, or approval. Its text cannot be used again; the feature does not promise to rewrite historical host cards.
- A model sees the approval code in its result. That does not give it approval authority or remove the disclosed risk of host-approved local-input injection.

## Success Criteria

- **SC-001**: US1 succeeds with two existing Dude sessions in actual GitHub Copilot CLI on one Windows computer, demonstrating actual local evidence inspection and a question-specific explanation with zero per-payload approval prompts after sharing approval. The three retained LAN exchanges support only their observed sharing behavior and do not require a repeat or establish full LAN qualification.
- **SC-002**: Every US2 case preserves the separation of sharing, local operation approval, and workflow authority. The defined refusal cases disclose none of their excluded fixture content and admit no operation solely on peer-supplied authority. These observed results do not certify arbitrary model behavior or a global sandbox.
- **SC-003**: Every evidence-bearing acceptance answer identifies the inspected source and applicable revision, command, environment, and observation time, or explicitly marks a missing or inapplicable detail. Existing evidence, fresh runs, third-party claims, and model conclusions remain distinguishable.
- **SC-004**: Every US3 authority-ending case prevents later message acceptance or sending for the old exchange and rejects late replies. Cancellation requests and known or unknown execution outcomes are reported separately; no case claims termination or reversed effects without evidence.
- **SC-005**: All unavailable and uncertain-outcome cases report the corresponding limitation with zero automatic replays, substitute sessions, or deferred deliveries.
- **SC-006**: Every claimed supported host/OS/peer combination has acceptance evidence for the behavior claimed under this increment's explicit qualification boundary. Protocol documentation, prior isolation tests, offline-only substitutes, and a refusal-only or permanently unavailable integration do not satisfy the positive conversation stories. Local acceptance and narrow retained LAN sharing cannot establish deferred LAN command, failure, security-negative, or availability support.
- **SC-007**: In US1's follow-up case, B gives two question-specific follow-up answers using its AI and local tools while available, in addition to the initial answer, with zero renewed sharing prompts. Neither receipt nor B's conclusion changes task state or replaces A's required independent acceptance.
- **SC-008**: Every missing-authentication, wrong-recipient, or missing-encryption case must disclose zero project content. Exercise the same-computer cases for initial acceptance; physical-LAN negative qualification is deferred and remains unverified.
- **SC-009**: In actual GitHub Copilot CLI on one Windows computer, US4 demonstrates a completed fresh run and a failed or inconclusive run under applicable prior approval, with actual operation, provenance, result, effects, and uncertainty accurately reported. A covered run requires zero additional approval prompts. Physical-LAN command execution is deferred and cannot be inferred from these local results or the retained share-only exchanges.
- **SC-010**: In every US4 permission-negative case, zero fresh verification operations start before applicable approval from B's own user. Changed command scope, workspace, revision/worktree policy, environment, effects, and validity are each exercised; copied peer approval supplies no authority.
- **SC-011**: Each claimed supported Windows CLI native presentation in this increment exposes every applicable proposal field, risk, and exact approval instruction for asking, share-only serving, and command-enabled serving, up to and including `C` and with all selected commands. The owner can reach and review the entire result using the host's normal reading and keyboard interaction. Hidden, truncated, or inaccessible content fails qualification; no paraphrase or private-log fallback counts as a pass.
- **SC-012**: In US2's proposal-lifetime cases, proposal creation alone causes zero activations or verification runs; normal presentation completion permits one otherwise valid next local approval, and failed, refused, cancelled, expired, replaced, consumed, interrupted, or binding-changed proposals permit zero activations.
- **SC-013**: With all companion inputs valid, the size boundary accepts a complete `C`-byte proposal and refuses a `C + 1`-byte proposal, including multi-byte and escape-heavy cases. Every oversized attempt returns only the short non-approvable refusal, withdraws any earlier pending proposal, and causes zero listener, transport, verification, command, revision-probe, or proposal-content disclosure effects. Later approval attempts for refused or replaced proposals activate nothing.
- **SC-014**: Before bound implementation, retained calibration evidence identifies the fixed numeric `C`, the practical profile inputs and complete rendered bodies, and actual GitHub Copilot CLI native-output observations. Every required practical profile fits, and every required practical and at-bound case has byte-complete native output matching the full production-rendered proposal, with only recorded dynamic-field substitutions for comparison. An unfrozen value, missing permission, unresolved native bindings, incomplete output, or a failed required comparison stops this prerequisite. Fake-host rendering alone and historical small/large App observations supply no frozen limit. App-only interaction and visual checks are outside this CLI calibration gate and remain not independently verified by CLI; the full-review and host-qualification requirements remain unchanged.

## Assumptions and Dependencies

- No user-supplied assumptions are added. The AI-backed revision supersedes the former no-new-verification, whole-session read-only, and excerpt-only boundaries. Still-applicable connection sharing, same-LAN, asking-side authority, and set-aside participation choices remain in force.
- The accepted local CLI amendment changes qualification scope, not the LAN capability. Untested physical-LAN, Mac/cross-OS, and App-specific cases remain deferred and unqualified, with no new future tasks or implied support. No LAN setup, conversation, or stopped context is repeated.
- The output-bound revision changes proposal-size eligibility only. T025's measured prerequisite is complete and T026-T028 delivered the guard; preserve that accepted evidence without repeating calibration or adding a machine-readable definition field for its numeric value.
- Existing A2A and JavaScript guidance supports technical assessment, not a live compatibility claim. The plan owns concrete integration, version selection, and qualification of actual host/OS combinations; no transport or runtime mechanism is selected here.
- Ordinary host permissions and instructions are not strict isolation. Approved verification can execute project code, create outputs, and use resources; communication cancellation cannot guarantee that all resulting activity stops.
- The earlier Q0 test was NO-GO for the former isolation-based contract. Its failed and unproven observations remain historical evidence. This revision neither reclassifies them as passes nor requires replaying Q0 as the current gate.
- T013-T018, T021-T024, and T025-T028 remain 14 completed historical slices with their exact original units and evidence. T019 remains residual local qualification and bounded LAN evidence assessment; T020 remains final independent review after it. Neither task inherits completion. Reuse accepted calibration, offline verification, and delivery within their exact boundaries, without recalibration or repeated full suites.
- Live use requires authorization for the actual named sessions, configuration, certificates, connection, information, verification operations, effects, bounds, and cleanup. Batch those permissions where legitimate; do not substitute general "automate" direction, blanket permissions, old codes/grants, or expired bindings. The human reviews the complete native proposal and supplies current local approval; agents neither extract nor submit it on the human's behalf.
- Sharing is not reversible after delivery. Ending communication or revoking approval blocks later use of that exchange's authority, not access to information already received.
- Idea Q1 remains an agent-owned technical selection. Q5 and Q6 concern out-of-scope distributed work authority and integration; Q7 and Q8 belong to Feature 069. Their unanswered user fields do not create new product clarification requirements for this increment.
- Retain the original stopped T019 failure, later large-output failure, successful small-case observations, partial controlled-run evidence, and separate user-attribution addendum unchanged. Expected oversized refusal applies only to new observations after the new guard is delivered; no old failure becomes a pass. The reported two-round CLI demo on 2026-10-01 is functional partial proof, not full T019 acceptance.
- The later three-exchange LAN record contains user-supplied native displays and coordinator hash checks, not a raw wire capture or permission-history audit. Its fixture excerpts are retained synthetic records, with `no run record supplied; execution unknown`. Preserve the unsupported initial second-pass criterion and its later advisory clarification. Stops and separately authorized cleanup confer no authority to relaunch those contexts.

## Visual Intent

Make the approval decision depend on the complete local proposal the owner can inspect, before continuing the two local Windows CLI sessions' evidence conversation. Follow the familiar tool-inspection convention: inspect an operation's exact arguments and effects, then explicitly approve.

Keep the conversation readable as an ordinary question and reasoned reply. Keep evidence limitations beside the conclusion, rather than presenting a successful exchange as certified verification. This interaction overlay preserves the software contract above.

## Scope And Surfaces

- In scope: existing Windows CLI host chat, the complete accepted adapter-produced proposal in native tool-result detail, the existing short refusal result, exact typed or pasted local approval, and stop.
- Host-owned opening, expansion, and scrolling where provided must be qualified for the selected CLI content and target. No automatic expansion, custom button, confirmation dialog, typography, read callback, or mutable historical result is promised.
- Native command-line output from actual headless CLI processes is eligible evidence within its observed boundary. Distinguish it from AI/model-turn evidence and an owner-facing presentation; no interactive TUI qualification follows.
- Out of scope: new Canvas or web surfaces, a second approval surface, custom controls, branding, tokens, or a separate visual system. Native typography, focus, and contrast remain host-owned; App-specific visual/accessibility qualification is deferred, not established by CLI evidence.
- The Markdown primary artifact remains inherently viewable through ordinary chat/file inspection. Preserve its exact published bytes; no HTML duplicate or external-only preview becomes approval authority.
- The retained small native case does not qualify all profiles at `C`, intended approval-event delivery, or activation/status-log visibility. Those remain separate Windows CLI acceptance obligations.

## Proposed Direction

Approved direction: review the complete native proposal result, then submit the exact local approval. The primary mock is [interaction-v2.md](design/interaction-v2.md), at exact `preview_path` `.dude/specs/068-agent-to-agent-communication/design/interaction-v2.md`. The user's literal `approve interaction v2` at `2026-09-24T17:33:44Z` approves this exact published revision, SHA-256 `4bc7f99210886742d80e74b6a5c794ad7f36828f2facf1a71f49fd9cc4600822`. Its bytes, including the original PROPOSED/UNAPPROVED labels, remain unchanged. It shows both local roles, full expanded proposal content, and the states that invalidate a still-visible result. There is no assistant-summary or private-log relay fallback.

The frontmatter `approved_direction` records the exact v2 approval. The user previously approved [interaction-v1.md](design/interaction-v1.md), SHA-256 `3d844ae96e829cafad31a1c748375ff5b537b1fd195ba97af17270c431a5e8ac`, at `2026-09-23T16:00:44Z`. Preserve those bytes and that historical approval; they are not the basis for v2 approval. The user's `1` at `2026-09-24T15:17:35Z` authorized ending the live run and redefining the presentation with a revised mock for approval, not approval of an unseen revision or renewed live activity.

### Output-bound qualification of the existing direction

The accepted `B` changes eligibility for v2's success scenes: their complete-body promise applies to proposals at or below `C`. Oversized proposals use the short validation-failure result and replacement semantics already illustrated in mock section 5. The former promise to display the largest body admitted by the configuration-input limit no longer applies. No approved mock bytes, labels, or approval records are rewritten.

This adds a bounded validation reason within the approved native-text failure affordance, not a new visual direction or new approval. No new mock or design-approval request is proposed for that unchanged interaction. Any later proposal for a different surface, control, or approval flow returns through the ordinary design gate. Native display and the new refusal still need actual qualification.

Every symbolic field retains its definition source:

| Mock fields | Source in the plan |
| --- | --- |
| Proposal-only notice, external config path/digest, profile, local session/provider/workspace, peer address/fingerprint, listener, sharing/purpose/exclusions/evidence roots, validity/repeat use, content/ask limits, current approval command | Configuration and Approval Boundary; Native Proposal Result Contract |
| Every selected command ID, executable, argv/parameter slots, cwd, environment names, run limits, declared effects/resources, explicit commit/worktree policy, Git observation policy, command validity/repeat use | Verification Contract; Native Proposal Result Contract |
| Short failure, normal-return lifetime, stop, cancellation, expiry, replacement, drift, historical-result warning, and next eligible approval | Fixed Output Bound and Calibration; Lifecycle and Outcomes |
| Question, exchange, model conclusion/limitations, existing sources, fresh records, missing provenance, adapter checks, and non-answer outcomes | Existing-session Tools and Transport; Evidence and Answer Contract; Verification Contract |

A Windows / B Mac labels retain the historical US1 and US4 motivation; they do not set the current Windows CLI completion matrix. The two local scopes trace to US2, and non-answer endings to US3. Unknown paths, peers, commits, and commands remain inert placeholders, not configuration or additional user answers. The scope-only `yes` is not another approval of a design artifact.

## Visual Success Criteria

- **VSC-001**: Before either illustrated approval, the reader can inspect the entire adapter-produced result and identify every applicable binding, sharing scope, operation, validity, limit, and risk. B's operation authority is visibly separate from sharing.
- **VSC-002**: The evidence scenes distinguish B's conclusion from existing sources, fresh observations, adapter checks, and missing provenance. Neither receipt nor process outcome reads as task closure.
- **VSC-003**: Each non-answer gives a bounded next step without implying replay, background readiness, or guaranteed termination. Possible delivery or execution remains visible after loss. Historical proposals never imply continuing approval eligibility.
- **VSC-004**: The mock uses only the declared native-text affordances and visibly hypothetical values. It claims no host rendering, accessibility, permission, or runtime qualification.
- **VSC-005**: For this increment, native qualification checks the actual Windows CLI custom result through `C`, including long and multi-command content, complete owner-readable text, and the claimed presentation's applicable opening/scrolling, keyboard reachability, and focus behavior. Headless result bytes do not qualify rendered TUI controls or prove human review; absent TUI-only controls are not applicable to that run, not passed. Proposal, approval, activation, status, stop, and failure output must remain readable to the owner through a supported native path. The short oversized refusal exposes no approval. App-specific geometry/wrapping, accessibility-tree reading order, and WCAG AA text/essential-UI contrast qualification remain deferred and unverified, not blocking this CLI increment. A CLI host limitation that prevents complete review or required visibility still fails qualification; no summary hides or repairs it.

## Revision Log

- 2026-09-23T15:11:16Z - Initial interaction-v1 exploration under the coordinator's bounded design-preparation handoff. This supplied handoff time records exploration, not approval. The user's `approved` reply at 2026-09-23T15:09:29Z authorized preparation of the mock, not approval of an unseen revision or implementation/live activity.
- 2026-09-23T16:02:03Z - Settled the unchanged interaction-v1 direction as proposed before applying the user's explicit approval. Canonical preview SHA-256: 3d844ae96e829cafad31a1c748375ff5b537b1fd195ba97af17270c431a5e8ac. No mock, software requirement, or runtime behavior changed.
- 2026-09-23T16:02:03Z - Recorded the user's literal `approve interaction v1` at 2026-09-23T16:00:44Z for preview_path .dude/specs/068-agent-to-agent-communication/design/interaction-v1.md, SHA-256 3d844ae96e829cafad31a1c748375ff5b537b1fd195ba97af17270c431a5e8ac. Set design_status to approved after settle. This is design approval only; no implementation, host qualification, live connection, command execution, Work restart, or Git action is implied.
- 2026-09-24T15:25:18Z - Re-definition staged after the user's literal `1` at 2026-09-24T15:17:35Z requested a host-visible proposal/approval presentation and a revised mock before implementation. Reopened design_status to proposed for exact preview_path .dude/specs/068-agent-to-agent-communication/design/interaction-v2.md. Retained approved_direction and interaction-v1 unchanged as historical context, not v2 approval. The native tool-result direction uses the implementation owner's proposed envelope; complete native display, accessibility, intended approval-event delivery, status visibility, and live acceptance remain unqualified. No implementation, new live permission, execution reconciliation, or publication/lint verdict is recorded by this staged event.
- 2026-09-24T17:36:20Z - Recorded the user's literal `approve interaction v2` received at `2026-09-24T17:33:44Z` for exact preview_path .dude/specs/068-agent-to-agent-communication/design/interaction-v2.md, SHA-256 4bc7f99210886742d80e74b6a5c794ad7f36828f2facf1a71f49fd9cc4600822. Set design_status to approved and approved_direction to this exact published revision. Preserve the mock's bytes, including its original PROPOSED/UNAPPROVED labels, and interaction-v1 with its historical approval unchanged. This is outside-chat/file design approval only, with no Canvas response, receipt, or acknowledgment. The new tool/presentation is not implemented or qualified; native display, approval-event delivery, status visibility, and live acceptance remain unqualified. This approval grants no implementation, Work restart, live operation, cleanup, Git action, or task completion.
