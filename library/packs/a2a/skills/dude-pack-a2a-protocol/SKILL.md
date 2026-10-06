---
name: dude-pack-a2a-protocol
description: "Use when a request concerns Agent2Agent (A2A) discovery, Agent Cards, messages, tasks, artifacts, interaction modes, security, protocol versions or bindings, or explicitly asks to refresh A2A sources or evaluate an official SDK for another language."
argument-hint: "the A2A question, target protocol/version, or authorized refresh or language request"
---

# A2A Protocol

## Purpose

Give source-backed advice about the A2A protocol while keeping protocol
resources separate from Dude's internal workflow. This skill belongs to the
optional `a2a` pack; loading it installs no A2A runtime, opens no endpoint, and
grants no remote or work-state authority.

## Procedure

1. Identify the advice question, target protocol version, expected binding,
   and security or deployment constraints. If the request is a source refresh
   or another-language SDK request, follow the
   [shared maintenance procedure](references/maintenance.md) before changing or
   onboarding anything.
2. Explain the protocol using the model below. Prefer the selected normative
   specification over descriptive topic pages when they disagree.
3. Separate:
   - source-backed facts, with the applicable source-table row;
   - design recommendations, including application-owned policy choices; and
   - executed evidence. Documentation inspection is not an interoperability
     test, installed SDK check, or live endpoint result.
4. State stale, unavailable, contradictory, or out-of-scope evidence beside
   the affected claim. Do not turn a repository release, SDK release, or
   moving `latest` page into an automatic compatibility conclusion.
5. Return the answer, source and version basis, recommendations, and remaining
   limits. Route any separately authorized implementation, source edit,
   installation, permission, or workflow-state need back through the
   coordinator and the current roster.

## Protocol model

### Participants and discovery

- A user initiates a goal. An A2A client acts for that user or another system
  and calls an A2A server (the remote agent).
- The remote agent is opaque. A2A exchanges declared capabilities and protocol
  data; it does not expose the remote agent's internal memory, tools, plans, or
  hidden Dude session.
- An Agent Card describes identity, skills, supported interfaces, capabilities,
  content modes, and authentication requirements. Discovery can use the
  well-known Agent Card URL, a curated catalog, or direct configuration.
- A card is descriptive input, not trust or permission by itself. Select only a
  declared interface, validate signatures when the trust model requires it,
  and apply the caller's authentication and authorization policy.

### Messages, tasks, and results

- A `Message` is one communication turn. Its `Part` values carry text, raw or
  referenced files, or structured data. A simple interaction can return a
  `Message` directly.
- A `Task` is a server-created, stateful protocol resource for work that needs
  lifecycle tracking. A `contextId` can group related messages and tasks, but
  it does not grant access to an agent's private context.
- `Artifact` values are task outputs. Messages carry requests, clarification,
  and status context; the normative guidance recommends artifacts for durable
  task results.
- Active states include `TASK_STATE_SUBMITTED` and `TASK_STATE_WORKING`.
  `TASK_STATE_INPUT_REQUIRED` and `TASK_STATE_AUTH_REQUIRED` interrupt progress
  until the application resolves the request. Terminal states are
  `TASK_STATE_COMPLETED`, `TASK_STATE_FAILED`, `TASK_STATE_CANCELED`, and
  `TASK_STATE_REJECTED`.

An A2A `Task` is not a Dude task claim, a Beads issue, a review verdict, or
evidence that Dude work is complete. A protocol state transition cannot mutate
those records.

### Interaction choices

- Blocking send waits for a terminal or interrupted task state. Non-blocking
  send returns the current task and leaves update retrieval to the client.
- Polling uses `GetTask`. Streaming uses `SendStreamingMessage` or
  `SubscribeToTask` when the Agent Card declares streaming support. Standard
  HTTP bindings use Server-Sent Events; gRPC uses server streaming.
- Push notifications send task, message, status, or artifact events to a
  registered webhook when the Agent Card declares that capability. The
  receiver must be reachable and must authenticate the sender, validate the
  expected task, and handle possible duplicate delivery.
- `CancelTask` is a request. The server can reject it when the task is missing,
  terminal, or otherwise not cancelable; cancellation is not a client-side
  completion guarantee.

Choose among polling, streaming, and push based on latency, connection,
reachability, and security needs. Do not assume every advertised agent supports
every optional mode.

### Bindings and versions

The normative specification separates the canonical data model and abstract
operations from protocol bindings. Its standard bindings are JSON-RPC over
HTTP, gRPC, and HTTP+JSON/REST. Do not repeat the topic-page claim that
all traffic must use JSON-RPC.

Clients select a compatible entry from `AgentCard.supportedInterfaces` and send
the applicable `A2A-Version`. The specification describes negotiation by
major/minor version and says patch releases do not change protocol
compatibility. Even so, the retained evidence does not show that JavaScript SDK
1.2.0 was tested against every change represented by the protocol repository's
v1.0.1 release. That SDK-to-release compatibility remains unknown.

### Security and authority

- Production transports use HTTPS or TLS. Agent Cards declare authentication
  schemes; credentials are normally acquired through the applicable
  out-of-band flow and sent in transport headers or metadata. Any in-band
  credential exchange needs explicit negotiation and additional safeguards.
- The server authenticates each request and applies its own authorization
  model to task access, cancellation, subscriptions, and data. It must avoid
  revealing resources outside the caller's scope.
- `TASK_STATE_AUTH_REQUIRED` asks for authorization. The state itself grants
  nothing; the application or credential issuer defines scope, validity,
  revocation, and the operation allowed.
- Applications own privacy, retention, secret handling, webhook validation,
  rate limits, audit policy, and approval for consequential actions. A2A does
  not supply those policies or bypass Dude's coordinator, review, completion,
  or permission boundaries.

## Source basis

These are the four retained official entry points supplied for this guidance:

- [A2A project organization](https://github.com/a2aproject)
- [A2A protocol documentation tree](https://github.com/a2aproject/A2A/tree/main/docs)
- [A2A protocol site](https://a2a-protocol.org/latest/)
- [Official JavaScript SDK repository](https://github.com/a2aproject/a2a-js)

Material claims use immutable sources where available:

| Topic | Official source | Revision or release | Checked (UTC) | Version scope and limit |
| --- | --- | --- | --- | --- |
| Participants, opacity, discovery, and data model | [Specification, sections 1, 2, 4, and 8](https://github.com/a2aproject/A2A/blob/afda8316c64951a2ecb2a0d3d10867405d2b4095/docs/specification.md) | `afda8316c64951a2ecb2a0d3d10867405d2b4095`; document label v1.0.0 | 2026-09-21T15:16:27Z | Normative protocol guidance for the labeled v1.0.0 document; no runtime conformance claim |
| Operations, task states, delivery modes, cancellation, and security | [Specification, sections 3, 7, and 13](https://github.com/a2aproject/A2A/blob/afda8316c64951a2ecb2a0d3d10867405d2b4095/docs/specification.md) | `afda8316c64951a2ecb2a0d3d10867405d2b4095`; document label v1.0.0 | 2026-09-21T15:16:27Z | Protocol behavior and application responsibilities; documentation inspection only |
| Bindings and version negotiation | [Specification, sections 3.6 and 5, 9-12](https://github.com/a2aproject/A2A/blob/afda8316c64951a2ecb2a0d3d10867405d2b4095/docs/specification.md) | `afda8316c64951a2ecb2a0d3d10867405d2b4095`; document label v1.0.0 | 2026-09-21T15:16:27Z | JSON-RPC, gRPC, and HTTP+JSON/REST semantics in the inspected document |
| Repository release comparison | [A2A release v1.0.1](https://github.com/a2aproject/A2A/releases/tag/v1.0.1) | v1.0.1, published 2026-05-28T11:34:36Z | 2026-09-21T15:16:27Z | Repository release identity only; it neither relabels the inspected specification nor proves SDK compatibility |
| Official language SDK directory | [SDK index at the inspected commit](https://github.com/a2aproject/A2A/blob/afda8316c64951a2ecb2a0d3d10867405d2b4095/docs/sdk/index.md) | `afda8316c64951a2ecb2a0d3d10867405d2b4095` | 2026-09-21T15:16:27Z | Official repository roster at that revision; listing alone does not prove an SDK's API, version support, or behavior |
| Conflicting topic summary | [Key concepts at the inspected commit](https://github.com/a2aproject/A2A/blob/afda8316c64951a2ecb2a0d3d10867405d2b4095/docs/topics/key-concepts.md) | `afda8316c64951a2ecb2a0d3d10867405d2b4095` | 2026-09-21T15:16:27Z | Its JSON-RPC-only transport sentence conflicts with the normative multi-binding specification and is not used for that claim |
