---
title: Local and remote agent communication
slug: agent-to-agent-communication
status: draft
spec_path:
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
   Answer:
3. For collaboration, should communication itself be limited to read-only questions and evidence exchange, or should delegated actions be allowed? What permissions would apply?
   Answer:
4. What connection and trust requirements should apply locally and remotely, including authentication, privacy, and access to shared information?
   Answer:
5. How should cooperating coordinators identify the single authoritative work state, avoid duplicate or conflicting ownership, and reconcile messages with that authority?
   Answer:
6. Who should own code integration and review across separately implemented features?
   Answer:
7. How should both A2A protocol guidance and SDK-specific guidance be kept current: cadence, triggers, ownership, version policy, and validation of updates?
   Answer:
8. Which reusable A2A library assets are actually needed for the initial cycle, and which existing bundle mechanism should project or install them for dogfood?
   Answer:

## Assumptions

No user-supplied assumptions recorded.

<!-- dude:managed:start -->
## Unresolved Discussion

The coordinator previously suggested read-only evidence exchange, an authenticated/private connection, supporting artifacts tied to their source and revision, and an adapter into the actual running session. These remain unresolved suggestions, not user decisions, accepted assumptions, or requirements.

### Proposals And Open Considerations

- Agent communication could cover questions, dependency and interface clarification, handoffs, progress, and evidence. Messages alone would not assign work or establish authority.
- Work state remains a separate concern. Today, canonical `tasks.md` task units are the live board in Lightweight; after tracked import, Beads is authoritative and markdown is only a one-way, non-authoritative mirror. For cooperating coordinators, a shared logical Beads project or a designated single owner of the canonical Lightweight tasks board are options to evaluate, not chosen contracts. Beads networking and deployment capabilities still need validation.
- Code integration could use isolated work areas, with an explicit integration owner and independent review. This is a possible approach, not an adopted design.

Communication location and execution lane are separate choices: local participation does not automatically mean Lightweight, and internet-separated participation does not automatically select Beads. The local networking arrangement remains unclear; no topology has been selected.

Messaging or a shared database alone does not solve duplicate assignment, conflicting ownership, concurrent writes, stale or offline state, review, or merges. Independent per-machine markdown copies are not safely synchronized merely because agents can message.

### Envisioned Collaboration Scenario

For example, one Dude agent could work on a reporting feature while another works on a separate export feature for the same project. They clarify a dependency on a shared data format, exchange progress and evidence, and coordinate integration and review. Participants could be local or separated by the internet. This is an envisioned use case, not implemented behavior or execution permission.

### Intended A2A Library And Dogfood Sequence

The four linked sources in `## Idea` are inputs for later research; none was inspected in this refresh. These are brainstorm steps, not executable tasks, a plan, or a new workflow.

1. Inspect the official A2A project, documentation, and site, plus the JavaScript SDK, for the initial protocol and SDK guidance.
2. Capture reusable knowledge and references as durable Dude library guidance, with only the A2A-specialized agents, skills, harness support, or other assets needed for the initial work. Not every artifact type is required.
3. Project or install the library capabilities through the appropriate existing bundle mechanism, then rebuild dogfood so those capabilities are available there.
4. Use the resulting specialists and capabilities to develop distributed local/remote Dude communication and collaboration features.

Other-language SDK learning is on demand: when a language is needed, inspect its official SDK guidance and create a corresponding specialized library agent. Do not pre-create unused language specialists or make them prerequisites for the initial JavaScript/dogfood cycle.

"Learn" means durable library guidance and specialist capabilities, not model training or permanent model memory. Reference-driven maintenance covers both A2A protocol guidance and SDK-specific guidance; cadence, triggers, ownership, version policy, and update validation remain TBD. No automatic updater is selected.

## Scope And Boundaries

Local and remote are two connection contexts of this agent-communication idea. Asking the originating session about missing work evidence and collaborating on separate features of one project are both motivating use cases; they do not settle the full scope of permitted communication.

The software-factory vision does not select a platform architecture. The user's literal chat reply `1` at 2026-09-21T12:36:29Z selected separate features with the library first. The reusable A2A/JavaScript specialists, knowledge maintenance, on-demand language onboarding, and dogfood availability are captured in [A2A library foundation](069-a2a-library-foundation.md), at `.dude/ideas/069-a2a-library-foundation.md`. This original ledger remains a distinct draft for later definition of live local/remote communication and collaboration. Its library motivation and sequence remain here as context; the split does not mean live integration has shipped.

Existing workflow, permission, and evidence rules still apply. Execution-lane and task-state changes, plus closure, remain coordinator-owned. Another agent's claims alone are not fresh verification. This capture does not authorize research, creating agents or other library assets, refreshing packs, installing capabilities, builds, remote execution, task ownership transfer or takeover, cross-session Work recovery, continuation of stopped Work, or automatic completion. A2A is the requested research and specialist direction; the runtime and SDK integration architecture is not decided. No new workflow, daemon, or registry is selected.
<!-- dude:managed:end -->

## Coordinator Log

- 2026-09-20T00:12:31Z: Initial brainstorm capture staged from the user's explicit request for local and remote agent communication, with missing work evidence as the motivating use case. Publication and lifecycle allocation remain pending; this capture does not authorize definition or execution.
- 2026-09-20T00:20:49Z: Brainstorm refreshed with the user's software-factory collaboration vision for local and internet-separated Dude agents implementing different features of one project. Beads and local/Lightweight work-state options remain undecided; ownership, integration, and possible definition-time scope separation remain open. This refresh authorizes no definition or execution.
- 2026-09-21T05:12:00Z: Brainstorm refreshed with the user's A2A library and dogfood direction, retaining four supplied sources for later research, JavaScript SDK guidance first, periodic protocol and SDK knowledge updates with cadence TBD, and on-demand language specialists. Captured later library projection/install, dogfood rebuild, and use of those capabilities for distributed local/remote communication and collaboration; no research, implementation, or execution was performed.
- 2026-09-21T12:43:57Z: Brainstorm refreshed for the accepted split from literal reply `1` at 2026-09-21T12:36:29Z, linking the published foundation capture `.dude/ideas/069-a2a-library-foundation.md` and recording library-first definition order. This ledger retains its draft status, empty spec_path, user-controlled sections, and prior history for separate later communication/collaboration definition; no live integration or execution is claimed.
