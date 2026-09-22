---
title: Local and remote agent communication
slug: agent-to-agent-communication
status: defined
spec_path: .dude/specs/068-agent-to-agent-communication/spec.md
---

# Idea: Local and remote agent communication

## Idea

Create a brainstorm for a feature that would allow us to talk to another agent using agent-to-agent protocols, both locally on the same computer and remotely on another computer.

Hey, I have another Dude session running on a different computer. I wonder if we can implement an agent-to-agent protocol so you can talk directly to the other agent hosting the main session. Maybe it can answer some related questions about the work evidence that is missing.

I was thinking one of the scenarios this communication would enable is collaborating on implementing different features in a distributed manner. For that, they might use Beads as a database or central place to make it easier to work together. I don't know what you think about it. Should we capture this in the brainstorm? I would say yes; please help shape this idea.

Enabling a software factory where distributed Dude agents can work locally or maybe across the internet on one project, keeping the implementation state in Beads or locally while communicating. It's kind of a gray area if they decide to keep it local, say with the Lightweight lane rather than Beads. Again, I'm just brainstorming; help me figure things out later.

Add steps to the brainstorm to create agents, skills, a harness, or whatever is needed, specialized in the Agent2Agent (A2A) protocol, as reusable parts of the Dude library.

Periodically refer back to the sources to update that knowledge; the cadence is TBD. For that, the research should include:

- [Agent2Agent (A2A) Project](https://github.com/a2aproject)
- [A2A/docs at main · a2aproject/A2A](https://github.com/a2aproject/A2A/tree/main/docs)
- [A2A Protocol](https://a2a-protocol.org/latest/)

Start with the JavaScript SDK: capture the knowledge needed and keep the reference for periodic knowledge updates, [a2aproject/a2a-js: Official JavaScript SDK for the Agent2Agent (A2A) Protocol](https://github.com/a2aproject/a2a-js).

When a new language is needed, Dude should go to the site, read the SDK for that language, learn it, and create a corresponding specialized agent for the library.

After the agents and other needed capabilities are created and part of the library, we need to rebuild the dogfood version and use them to create the features. Distributed local/remote Dude should be able to communicate and collaborate. You'll help me craft the details.

## Open Questions

For future definition; these questions do not block capture.

1. A2A is the requested research and specialist direction. Which protocol and SDK versions and compatibility requirements should apply, and is any additional protocol support needed?
   Answer:
2. Which hosts and agents should interoperate? The other Dude session's host is still unknown: Copilot app, VS Code, standalone CLI, or another host.
   Answer: User text (verbatim):

```text
I guess any other app supporting A2A  
First main use case will be  Other Dudes running on  GitHub Copilot desktop app 
```

3. For collaboration, should communication itself be limited to read-only questions and evidence exchange, or should delegated actions be allowed? What permissions would apply?
   Answer: Selected option `exchange-only`, "Read-only questions and evidence exchange". User text (verbatim): "However set the foundations for further enhancements as the proposes exchange and delegations."
4. What connection and trust requirements should apply locally and remotely, including authentication, privacy, and access to shared information?
   Answer: User chat reply (verbatim): `2`. Selected option `approve-connection-scope`, "Approve a sharing scope for the connection", for `v1-sharing-approval`: approve a connection-specific sharing scope, then let agents automatically exchange read-only questions, answers, and existing evidence within it. Expanding that scope requires renewed approval.
5. How should cooperating coordinators identify the single authoritative work state, avoid duplicate or conflicting ownership, and reconcile messages with that authority?
   Answer:
6. Who should own code integration and review across separately implemented features?
   Answer:
7. How should both A2A protocol guidance and SDK-specific guidance be kept current: cadence, triggers, ownership, version policy, and validation of updates?
   Answer:
8. Which reusable A2A library assets are actually needed for the initial cycle, and which existing bundle mechanism should project or install them for dogfood?
   Answer:

9. For v1, is a session reserved for read-only serving with evidence-bounded answers sufficient, or must it provide free-form answers, serve alongside other work in that session, or both?
   Answer: User chat reply at 2026-09-22T23:10:55Z (verbatim): `1`. Selected option `foreground-bounded`, "Set-aside session, evidence only".
10. How do different computers reach each other in v1?
   Answer: User chat reply at 2026-09-22T23:08:59Z (verbatim):

```text
**how do two computers reach each other?** **assume lan for now( does it makes a diference as long as they can communicate?)**
```

11. In the asking session, how should Dude treat a received answer that contains embedded instructions, including when the session runs autonomously or with tools approved in advance?
   Answer: User chat reply at 2026-09-22T23:43:42Z (verbatim): `its 1 then`. Selected option 1, "Treat it like any file or web page. The agent uses answers under the approvals the session already has. Nothing in an answer can grant new permissions or start anything by itself." Preceding user message at 2026-09-22T23:42:33Z (verbatim):

```text
help me to find the right answer, I'd like to set the foundations for a collaborarive environment ofr my dude agents, so the answer shouldn't be treated as a peer and take actions on it? what do you think
```

## Assumptions

No user-supplied assumptions recorded.

<!-- dude:managed:start -->
## Unresolved Discussion

No v1 product clarification remains. Open Question 1 is an agent-owned technical version selection recorded in the plan; its user answer remains blank. Questions 5 and 6 concern distributed work authority, code integration, and review, which are outside v1. Questions 7 and 8 belong to Feature 069, [A2A library foundation](069-a2a-library-foundation.md).

The broader software-factory vision remains future intent. Messaging does not resolve work ownership, shared Beads deployment, synchronization, or integration. Local versus remote participation does not select an execution lane. Internet-separated collaboration is not included in this first communication increment.

## Scope And Boundaries

V1 exchanges read-only questions, evidence-bounded answers, and existing evidence. Open Question 4 selects a sharing scope approved for each connection, with automatic in-scope questions and replies and renewed approval for expansion. Each participant controls its own disclosure. Authentication, recipient verification, and encryption remain required on the same computer and on the LAN.

Open Question 9 selects a session set aside only for answering, with no project work while it serves. The user may walk away or work in a different session. Answers use approved existing file fields, exact quotes, checkable facts, and fixed notices. Free-form answers and serving alongside other work in the same session are outside v1. Successive exchanges do not require per-payload approval, but an unavailable session does not queue questions or redirect them elsewhere.

Open Question 10 limits different-computer connections to the same local network in v1. Public internet exposure and relays are out of scope. A mesh VPN might provide similar reachability but is not promised without qualification.

Open Question 11 treats an answer in the asking session like content from a file or web page. The session may use that information under its existing user request and approvals; receiving an answer does not make it read-only. The answer grants no permission and starts no activity by itself. The asking session retains the same embedded-instruction exposure as other content it reads, including under blanket tool approval or autonomous Work. Information can flow between agents, but authority does not travel inside messages. Delegation remains a later, explicitly approved capability.

Other Dude sessions in the GitHub Copilot desktop app remain the first concrete use case from Question 2. Other A2A-compatible apps are a possible direction, not a universal-compatibility claim or a Copilot-only boundary. Actual host, OS, runtime, peer identity, address, and effective controls must be established for each supported combination.

Delegated implementation, new verification work for an exchange, task-state changes, ownership transfer, work recovery, code integration, review approval, and closure remain outside communication authority. Add no registry, daemon, persistent store, delegation mechanism, hidden session, or generic framework for future needs. The library motivation remains in the user's Idea; reusable guidance, maintenance, language onboarding, and dogfood composition belong to Feature 069 rather than expanding this package.

## Definition Assessment And Prerequisite

The core package at `.dude/specs/068-agent-to-agent-communication/` records the accepted scope, qualification-first plan, and proposed tasks. The plan contains the version basis and host research. Source evidence suggests that restrictions can be refreshed for a running session, but their whole-session effect and lifetime are not yet proven. Those host restrictions apply to serving; asking-side answer delivery preserves the session's existing authority.

The first execution gate must record GO before anything that serves peers is built or enabled. A NO-GO leaves communication unavailable and stops for a user decision. Real sessions, connections, and a second computer require separate user authorization; this definition grants none. No runtime qualification or live interoperability is claimed. The ordinary-chat answers in Questions 9 through 11 resolve the product choices; no Canvas answer, receipt, or acknowledgment is inferred.
<!-- dude:managed:end -->

## Coordinator Log

- 2026-09-20T00:12:31Z: Initial brainstorm capture staged from the user's explicit request for local and remote agent communication, with missing work evidence as the motivating use case. Publication and lifecycle allocation remain pending; this capture does not authorize definition or execution.
- 2026-09-20T00:20:49Z: Brainstorm refreshed with the user's software-factory collaboration vision for local and internet-separated Dude agents implementing different features of one project. Beads and local/Lightweight work-state options remain undecided; ownership, integration, and possible definition-time scope separation remain open. This refresh authorizes no definition or execution.
- 2026-09-21T05:12:00Z: Brainstorm refreshed with the user's A2A library and dogfood direction, retaining four supplied sources for later research, JavaScript SDK guidance first, periodic protocol and SDK knowledge updates with cadence TBD, and on-demand language specialists. Captured later library projection/install, dogfood rebuild, and use of those capabilities for distributed local/remote communication and collaboration; no research, implementation, or execution was performed.
- 2026-09-21T12:43:57Z: Brainstorm refreshed for the accepted split from literal reply `1` at 2026-09-21T12:36:29Z, linking the published foundation capture `.dude/ideas/069-a2a-library-foundation.md` and recording library-first definition order. This ledger retains its draft status, empty spec_path, user-controlled sections, and prior history for separate later communication/collaboration definition; no live integration or execution is claimed.
- 2026-09-22T11:11:43Z - Ordinary definition resumed after the user's `exchange-only` selection. Recorded the option label and verbatim sentence in Open Question 3 and updated the related v1 scope note without adopting an implementation architecture or delegation capability. The other Dude session's host remains a material clarification; retained draft status and empty spec_path, with no definition package created.
- 2026-09-22T11:25:10Z - Ordinary definition clarification recorded the peer-host answer verbatim in Open Question 2. Clarified other Dude sessions in the GitHub Copilot desktop app as the first concrete v1 use case and other A2A-compatible apps as a tentative interoperability direction, without adopting universal compatibility or a Copilot-only requirement. Protocol, SDK, transport, and host integration assessment remain agent-owned; connection, trust, and privacy scope remain unresolved. Retained draft status and empty spec_path, with no definition package created.
- 2026-09-22T12:45:21Z - Ordinary definition clarification recorded the current chat-fallback reply `2` in Open Question 4 as `approve-connection-scope`, "Approve a sharing scope for the connection", for `v1-sharing-approval`. Updated the related boundary for automatic read-only questions, answers, and existing-evidence exchange within a preapproved connection-specific sharing scope, with renewed approval for expansion. This product-policy choice grants no live connection, sending, or session-access permission and leaves authentication, networking, and other trust questions unresolved. Retained draft status and empty spec_path, with no definition package created.
- 2026-09-22T13:48:29Z - Ordinary definition assessment recorded the retained source-backed A2A/JavaScript fit and bounded Architect/Tester findings. Retained draft status and empty spec_path; first publication awaits a supported existing-session enforcement approach and evidence from the Architect/planning and Copilot host-capability owners. No package was created or implementation architecture adopted. This continuation stops without active qualification, a new human prompt, or automatic further specialist work.
- 2026-09-22T17:05:33Z - Ordinary definition assessment recorded the Architect's bounded existing-session receive/reply candidate and single allowlist-contract recheck. Narrowed the technical plan-gap to the Copilot desktop host-capability owner's supported application, activation, and lifetime contract for a read-only serving restriction, with Architect planning ownership. Bounded evidence-backed reply forms remain an unapproved product tradeoff. Retained draft status and empty spec_path; no partial package, runtime action, new permission prompt, or further specialist loop.
- 2026-09-22T19:06:04Z - Ordinary definition assessment recorded a staged spec draft and Architect support for a host-source-backed qualification-first receive/reply plan. The current gate is unchosen C1 (answer form and serving alongside work), replacing the earlier blanket plan-gap; effective controls remain a go/no-go before serving. Canvas yielded no typed answer or receipt; the same question moves to ordinary chat fallback without inferred choice, cancellation, or acknowledgment. Retained draft status and empty spec_path; no plan/tasks or full package was created, and no runtime qualification occurred.
- 2026-09-22T23:30:10Z - Ordinary definition clarification recorded the current chat-fallback replies in new Open Questions 9 and 10: literal `1` selecting `foreground-bounded`, "Set-aside session, evidence only", and the verbatim same-LAN answer. No Canvas answer, receipt, or acknowledgment is inferred; definition remains draft pending the revised stage.
- 2026-09-22T23:44:06Z - Ordinary definition clarification recorded the current chat reply `its 1 then` in new Open Question 11, selecting option 1, "Treat it like any file or web page", with the preceding user message verbatim. Definition remains draft pending the revised stage.
- 2026-09-22T23:50:28Z - First definition records the accepted serving, same-LAN, and asking-session boundaries in the core package at .dude/specs/068-agent-to-agent-communication/spec.md. The qualification-first plan separates restricted serving from invocation-bound answer delivery under existing local authority. Host-control GO and separately authorized live acceptance remain required; no implementation, runtime qualification, live connection, new execution authority, or task completion is claimed.
- 2026-09-22T23:57:54Z - Re-defined wording in FR-009a/FR-009b and US2 scenarios 4 and 7 to separate serving restrictions from asking-side answer delivery, preserving Q11's existing-authority policy. User intent, scope, plan, and all 12 task meanings remain unchanged.
- 2026-09-22T23:58:56Z - Re-definition reconciliation applied for .dude/specs/068-agent-to-agent-communication/spec.md: 12 tasks kept, 0 changed, 0 dropped, 0 new. No task state, task metadata, board, archive, discovered work, or execution history changed.
