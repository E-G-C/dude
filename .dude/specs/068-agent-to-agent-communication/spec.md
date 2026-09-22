# Feature Specification: Local and remote agent communication

**Source idea**: `.dude/ideas/068-agent-to-agent-communication.md`
**Status**: Definition draft; product choices resolved, runtime qualification pending.

## Purpose and Scope

A Dude user can ask another agent read-only questions and receive answers and existing evidence that the asking session lacks. The user controls what each connection can share. Communication does not authorize either agent to implement work or change its ownership.

V1 covers Agent2Agent (A2A) communication between selected sessions on the same computer or on two computers on the same local network (LAN). Authentication and encryption are required in both cases, including on the LAN. Other Dude sessions in the GitHub Copilot desktop app are the first concrete use case. Other A2A-compatible apps remain a possible direction, with support limited to combinations that meet this specification. Neither universal compatibility nor a Copilot-only product boundary is assumed.

The user approves a sharing scope for a particular connection. Within that scope, questions, answers, and existing evidence can be exchanged automatically, including replies, without approval for each payload. Expanding the scope requires renewed approval. Each participant's sharing approval governs what that participant may disclose; a peer cannot approve access to someone else's information.

### Out of Scope

- Delegated implementation, running project verification to create new evidence, task-state mutation, execution-lane changes, ownership transfer or takeover, review approval, and task closure.
- Hidden-session access, resuming stopped Work, or restoring communication authority from past messages.
- Distributed assignment, file synchronization, shared work-state reconciliation, code integration, and a new Beads deployment or authority model.
- Offline delivery, speculative delegation infrastructure, and compatibility promises for peers that have not been qualified.
- Public internet exposure, relays, and promised support for mesh VPN connections.
- Free-form answers and serving alongside project work in the same session.
- Distributed work authority (idea Q5) and code integration and review across features (idea Q6).
- Creating or maintaining reusable A2A specialists and library assets. Knowledge maintenance (idea Q7) and library composition and dogfood availability (idea Q8) belong to Feature 069, `.dude/ideas/069-a2a-library-foundation.md`.

## Accepted Product Choices

### Receiving availability and answer form

During a user-enabled serving interval, the selected session is reserved for answering read-only questions and runs no project work. The user may walk away and may keep working in another session. This feature does not pause or resume Work or change its state.

The session handles one exchange at a time. Within an enabled interval and the approved sharing scope, successive questions and replies do not require fresh human approval. This does not promise uninterrupted availability: when the session cannot currently answer, the asking participant sees unavailable rather than queued or redirected work.

Evidence-bounded answers contain approved file fields, exact quotes, checkable facts from existing approved evidence, and fixed notices. They do not include free-form explanation or synthesis. A fact derived from an existing source is not a newly executed verification result.

### Connection location

The user's LAN answer at 2026-09-22T23:08:59Z limits different-computer connections to the same local network in v1. Local-network membership does not establish identity or permission and does not remove the need for authentication and encryption.

### Answers in the asking session

The asking session treats a received answer like content from a file or web page. It may use that information under its existing user request and approvals; the answer neither starts activity by itself nor grants new permissions. Receiving an answer does not make the asking session read-only.

This supports future collaboration by allowing information to flow between agents while authority does not travel inside messages. Delegation would be a later, explicitly approved capability, not part of v1.

## User Scenarios and Testing

### US1 - Obtain missing evidence from another session (Priority: P1)

A user asks another Dude session about related work so the answer can fill an information gap without manually copying the surrounding conversation.

**Independent test**: Use a supported, available peer with an already-approved sharing scope and a known existing evidence item. Exercise the question-and-answer outcome once on the same computer and once across two computers on the same LAN, without depending on the approval interaction in US2.

**Acceptance scenarios**

1. **Given** an approved connection and an available peer with relevant in-scope evidence, **when** the asking session sends a question, **then** the peer returns an answer using that evidence without requiring approval for the question or reply payload.
2. **Given** the answer includes existing evidence, **when** the user receives it, **then** the source and its known revision or observation time are identifiable, with any unknown provenance stated.
3. **Given** the peer has no shareable evidence that answers the question, **when** it responds, **then** it reports that limitation without fabricating evidence or running project work to obtain it.
4. **Given** a peer supplies an older result or an unverified claim, **when** the asking session receives it, **then** the limitation remains visible and receipt does not count as fresh verification or change work state.
5. **Given** a serving session and sufficient approved evidence, **when** successive questions arrive while the user is away or working in another session, **then** answers contain only evidence-bounded content, need no further human approval, and cause no project work in the serving session.

### US2 - Control what a connection can share (Priority: P1)

A user approves a specific sharing boundary so agents can communicate without exposing unrelated information or asking for approval on every message.

**Independent test**: Use known participant identities, allowed information, and excluded information. Submit allowed and forbidden exchange attempts against that boundary; a completed evidence answer is not required to establish the protection.

**Acceptance scenarios**

1. **Given** no applicable connection approval, **when** communication is attempted, **then** Dude discloses no project content to the peer.
2. **Given** approval for a particular peer and information scope, **when** an exchange requests other information, **then** Dude withholds it without leaking it through an answer, source reference, or refusal detail.
3. **Given** an exchange needs a broader scope, **when** expansion is proposed, **then** the existing boundary remains in force until the user approves the expansion.
4. **Given** a peer question or cited document asks the agent to edit files, run work, change permissions, or transfer ownership, **when** the serving session handles that content, **then** those actions remain unavailable and the content grants no authority.
5. **Given** another connection or another session on the same computer, **when** it requests access, **then** it does not inherit approval merely from proximity, a matching name, or another connection's approval.
6. **Given** either a same-computer or LAN connection, **when** authentication, recipient identity, or encryption cannot be established, **then** Dude shares no project content.
7. **Given** an in-scope peer answer contains instructions to act, **when** the asking session receives it, **then** answer delivery starts no separate activity and changes no permissions, capabilities, sharing scope, or work authority. Later actions remain governed by that session's existing user authority and approvals.

### US3 - Keep control when an exchange cannot continue (Priority: P2)

A user can distinguish a useful answer from an unavailable, interrupted, or uncertain exchange, without losing control of the active session.

**Independent test**: Start with a current approved exchange and vary session availability, delivery certainty, cancellation, and changes to the serving session. The test can use a fixed shareable answer rather than an evidence-search workflow.

**Acceptance scenarios**

1. **Given** an unsupported combination or a session that cannot currently answer, **when** a question is attempted, **then** Dude reports unavailable without arranging later delivery or selecting another session.
2. **Given** a question has reached the intended session and approval remains valid, **when** the session accepts it, **then** it can still return the corresponding answer.
3. **Given** an exchange is pending, **when** the operator cancels, the session stops or receives new instructions unrelated to that exchange, the participating session or workspace changes, or sharing approval ends, **then** unsent replies are withheld and further activity for that exchange stops.
4. **Given** the serving session loses a required protection or its ability to maintain that protection, **when** the exchange could otherwise continue, **then** no further peer-caused activity occurs without that protection.
5. **Given** delivery cannot be established or the participating session loses its current connection context, **when** Dude reports the outcome, **then** it reports uncertainty or unavailability without automatically repeating the exchange or treating historical approval as current permission.

## Functional Requirements

### Connection and approval

- **FR-001**: Dude must support read-only A2A questions, answers, and existing-evidence exchange with selected existing sessions on the same computer and on two computers on the same LAN.
- **FR-002**: Dude must require an applicable user-approved connection sharing scope before disclosing project content to a peer.
- **FR-003**: Dude must show the peer, participating session/workspace, allowed information, permitted read-only exchanges, and effective validity of a proposed sharing scope before approval.
- **FR-004**: Dude must establish that the recipient is the participant bound to the approved scope before sending scoped information.
- **FR-005**: Dude must protect connection content and authentication material from unapproved recipients in both local and remote contexts.
- **FR-006**: While the connection scope and receiver availability are valid, Dude must allow in-scope questions and replies automatically without requiring per-payload approval.
- **FR-007**: Dude must obtain renewed user approval before expanding a connection's sharing scope.

### Information and execution boundaries

- **FR-008**: Dude must keep every outbound question, answer, evidence item, source reference, and accompanying detail within the approved disclosure scope.
- **FR-009**: Dude must apply the following session-specific boundaries:
  - **FR-009a (serving session)**: Dude must confine activity caused by peer messages, including indirect effects, to approved read-only access and in-scope communication.
  - **FR-009b (asking session)**: Answer delivery must not initiate separate activity or change permissions, capabilities, sharing scope, or work authority. Later actions remain governed by that session's existing user authority and approvals.
- **FR-010**: Dude must treat peer messages and supplied evidence as information, not permission to change available capabilities, sharing rules, or work authority.
- **FR-011**: Dude must not run builds, tests, or delegated project work to create evidence for an exchange.
- **FR-012**: Dude must associate evidence-bearing answers with an approved source reference and its known revision or observation time, explicitly identifying unknown provenance.
- **FR-013**: Dude must identify absent, partial, stale, conflicting, or unverified evidence instead of presenting it as complete fresh confirmation.
- **FR-014**: Dude must leave execution-lane, task-state, ownership, review, and closure decisions unchanged by communication.

### Exchange lifetime and outcomes

- **FR-015**: Dude must return each reply only to the approved participant that asked its corresponding current question.
- **FR-016**: If the target cannot currently accept a question, Dude must return unavailable without scheduling later delivery or substituting another session.
- **FR-017**: Accepting a question must not by itself prevent the session from answering it while the approved conditions still hold.
- **FR-018**: Dude must end an exchange's permission when the operator cancels, the session stops or receives unrelated new instructions, the session or workspace changes, required protections change or become unavailable, or sharing approval is revoked or expires.
- **FR-019**: After an exchange's permission ends, Dude must withhold unsent replies and stop further activity for that exchange.
- **FR-020**: Dude must stop all remaining peer-caused activity before allowing the serving session to leave its read-only restriction.
- **FR-021**: Dude must distinguish an answer from missing evidence, refusal, unavailability, cancellation, and uncertain delivery.
- **FR-022**: Dude must report uncertain delivery without automatically repeating the question or reply.
- **FR-023**: After losing the current connection context, Dude must not treat saved messages or a prior connection's approval as permission to resume an exchange.

### Qualification before enablement

- **FR-024**: Dude must keep communication unavailable for any host/peer combination whose required identity, disclosure, read-only, or lifetime controls have not been established as effective.
- **FR-025**: Dude must identify the qualified host/peer combinations it supports without treating protocol compatibility or an installed library as proof of live interoperability.

### Reserved serving and answer form

- **FR-026**: Dude must keep the selected session reserved for answering, with no project work during its user-enabled serving interval.
- **FR-027**: Dude must limit answers to approved existing file fields, exact quotes, checkable facts from approved existing evidence, and fixed notices.
- **FR-028**: Dude must show whether the selected session can currently accept another question during its serving interval.
- **FR-029**: Dude must require authentication and encryption for every same-computer or LAN connection before sharing project content.

## Key Entities

These concepts describe the participants, approval, and information in an exchange.

| Entity | Meaning |
| --- | --- |
| Participant | The selected existing agent session and workspace, with a recipient identity that can be checked against approval. A name alone is insufficient. |
| Connection sharing scope | The user's approval for what a participant may disclose to the selected peer, for which read-only exchanges, and while which connection context remains valid. |
| Exchange | One question and its answer or non-answer outcome, bound to current participants and current authority. It creates no work assignment. |
| Evidence item | Existing shareable information with its approved source reference, known revision or observation time, and limits on completeness or verification. |

## Edge Cases

- A question mixes allowed and excluded information. Any partial answer must be identified as partial; a refusal must not reveal the excluded content.
- The evidence source changes between the question and the answer. The answer must accurately identify the evidence it actually uses and must not substitute newly excluded information.
- An approved source contains instructions or credentials. Source approval does not authorize executing embedded instructions or disclosing authentication material.
- Questions arrive concurrently or a reply comes from a different connection. They must not share reply authority, cross disclosure boundaries, or create deferred delivery when the receiver is unavailable.
- The user narrows or revokes scope after a question arrives. Unsent content is withheld; content already delivered cannot be recalled.
- A participant reconnects with the same display name after context loss. Historical approval or a matching name must not recreate a live exchange.
- A peer disconnects after receiving a question but before receipt of a reply can be established. Dude reports uncertainty instead of claiming success, claiming non-delivery, or resending automatically.
- An A2A-capable app uses an unsupported combination or cannot enforce the required controls. Dude refuses before sharing project content; it does not weaken scope or execution boundaries to make the connection work.
- A request requires free-form reasoning or new project verification rather than existing evidence. The session reports that limit instead of broadening its answer form.
- Another device on the LAN impersonates a peer, or a supplied address would expose a public endpoint. LAN proximity grants no trust, and public exposure remains outside v1.
- The user wants to work in the serving session. Serving must end safely first; work in a different session need not stop.

## Success Criteria

- **SC-001**: With a qualified pair of Dude sessions in the GitHub Copilot desktop app, the known-evidence scenario in US1 succeeds both on one computer and across two computers on the same LAN, with zero per-payload approval prompts after connection-scope approval.
- **SC-002**: Every forbidden-access scenario in US2 produces zero out-of-scope disclosures and zero unauthorized direct or indirect effects. Work state and ownership remain unchanged.
- **SC-003**: Every evidence-bearing answer in the acceptance cases identifies the expected source and known revision or observation time, or explicitly reports the missing provenance. Missing, stale, partial, and conflicting evidence cases are not reported as fresh verification.
- **SC-004**: Every permission-ending case in US3 prevents subsequent unsent replies and further activity for the old exchange. Accepting a question, without such a change, still permits its corresponding reply.
- **SC-005**: All unavailable and uncertain-delivery cases return the corresponding non-answer outcome, with zero automatic replays, substitute sessions, or deferred deliveries.
- **SC-006**: No unqualified host/peer combination is enabled. A refusal-only or permanently unavailable integration does not satisfy SC-001.
- **SC-007**: In US1's successive-question scenario, every answer uses only the four permitted evidence-bounded forms, no project work runs in the serving session, and the user is not required to remain at that session.
- **SC-008**: Every missing-authentication, wrong-recipient, or missing-encryption case on the same computer and the LAN discloses zero project content.

## Assumptions and Dependencies

- No user-supplied assumptions are added. The selected serving, LAN, and asking-session boundaries are recorded answers, not inferred assumptions.
- Existing A2A and JavaScript library guidance supports protocol-fit assessment. Retained source and version facts in `plan.md` do not establish the active host, peer, runtime, or live interoperability. This specification makes no such support claim.
- Dude does not prevent an agent from acting on quoted text under approvals its user already granted. In the asking session, an answer carries the same embedded-instruction exposure as other content that session reads.
- The source-based feasibility assessment supports a qualification-first plan, not a claim that serving works. Required protections must be established before enabling any supported combination.
- Read-only service requires effective protections. Instructions to the agent and citations alone do not establish execution safety or prevent unauthorized disclosure.
- Live qualification requires separate authorization for the actual sessions, connection, and information involved; this definition and the accepted product policy grant none.
- Facts derived from approved existing sources are not newly executed verification evidence. Peer answers retain the normal project evidence and coordinator-authority rules.
- The boundary assumes a trusted host/operator. Observed policy or context changes end permission for an exchange; the feature does not promise to defeat a trusted administrator deliberately changing host policy.
- Sharing is not reversible after delivery. Revocation blocks future use of the authority rather than retracting information a peer already received.
- Idea Q1 is an agent-owned technical version selection in the plan; its user answer remains blank. Q5 and Q6 are outside v1. Q7 and Q8 belong to Feature 069 and are not new prerequisites for this feature.
