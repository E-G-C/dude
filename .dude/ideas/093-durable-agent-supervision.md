---
title: Durable agent supervision
slug: durable-agent-supervision
status: draft
spec_path:
---

# Idea: Durable agent supervision

## Idea

The user asked for a research-only comparison with Paperclip:

> look at [paperclipai/paperclip: The open-source app everyone uses to manage agents at work](https://github.com/paperclipai/paperclip)
>
> how diffucult would be to implement similar features using our implementation ? research only for now

The later request was to capture the whole discussion in a brainstorming session.
Durable supervision and a Paperclip bridge were optional roadmap ideas, not a
commitment to build a service, adopt its architecture, or reproduce every feature.

## Open Questions

These evaluation choices remain unanswered.

1. What unmet use case actually needs persistent scheduling or unattended service ownership beyond current Work and bounded background communication?
   Answer:
2. If that need exists, should the next evaluation compare a constrained local manager, a Paperclip bridge, or another narrower option?
   Answer:
3. Which hosts and runtimes matter, and can their real tool, cancellation, supervision, and result contracts support Dude?
   Answer:
4. Who would own service operation, persistence, security, credentials, operating cost, and recovery?
   Answer:
5. How should an outer assignment map to Dude's repository workflow with one lifecycle and approval owner per scope?
   Answer:
6. What data may leave the current session, how long may it be retained, and what operator action may start a new invocation after a stop or restart?
   Answer:

## Assumptions

No user-supplied assumptions recorded. A new service architecture is not approved.

<!-- dude:managed:start -->
## Prior research and its limits

The prior comparison inspected `paperclipai/paperclip` on 2026-10-29 at commit
`fa5e70faf47ef2ca20bf2daf95b7503c94469b89`, under MIT. The Dude baseline was
`b4cf71423381dca0dd9fdafbc564c7e641891de8`. This draft preserves that research;
it contains no new upstream inspection or claim about the latest version.

The [pinned overview][paperclip-readme] and retained comparison described:

- A Node/React application with Postgres/Drizzle and durable agent/task records
  and organization roles.
- Queued wakeups with atomic checkout, review gates, and routines; the
  [pinned queue source][paperclip-queue] was part of the inspected material.
- Recorded-spend budgets, multi-user/multi-company operation, a skills studio
  with versioning and testing, and providers, Model Context Protocol (MCP), and plugins.

[Agent Chat][paperclip-chat] was described as experimental. The separately
discussed conference-room was a local Claude concierge, not proven general
many-agent group chat.

Copilot integration already existed through `paperclip_runner`/ACPX, including
authentication and model probing in the [adapter registry][paperclip-adapters].
Compatibility with Dude's custom tools, skills, agents, Canvas, and actual
supervisor/cancel/result behavior remains unproven; this is not install-and-go.

## Reuse and remaining gaps

Dude's reuse points include Canvas/projection, transient Needs You requests,
the roster, packs and model configuration, exact feature/task resolution,
the supervised invocation-bound Work driver, and approved pairwise Agent2Agent (A2A).
Needs You is not durable message history, and Work is not an unattended scheduler.

Those pieces do not establish a delivered durable queue, repository broadcast
bus, group chat, 24/7 manager, or financial ledger. Background peer communication
in sibling slug `nonblocking-agent-conversations` is a distinct, narrower question.

## Optional paths discussed

Roadmap E calls for evaluation only when an explicit user need justifies a new
management backend. The options discussed were a constrained durable local
manager or a Paperclip integration; continuing without either remains possible.
Do not add capabilities without a current production use case.

One candidate bridge would let Paperclip own outer assignments while Dude retains
its repository workflow and internal tasks. Each scope would have one lifecycle
and approval owner. Lightweight `tasks.md`, or Beads after import, would remain
Dude's sole task board; no two writable boards could compete for the same work.
The mapping and failure behavior need definition, not assumptions of compatibility.

Persistence would not authorize recovery. A server restart must not automatically
revive stopped Work, replay approvals, or accept a stale result. Any new invocation
would still need the existing authority and stop rules. Retained chat or queue
history cannot restore permission.

Service ownership, persistence, authentication, data retention, operating costs,
and recovery authority all remain open. No backend, deployment, schema, command,
listener, or always-on process is selected or authorized.

Organization charts, financial budgets, multi-tenancy, generic chat, and automatic
recovery are deferred comparison topics, not dependencies of number reservation.
Skills-studio research likewise does not admit new skill or pack-authoring scope.

## Rough effort from the prior comparison

These were the coordinator's rough judgments for experienced developers, limited
runtimes, and a Windows/local-user boundary. They are not measurements, calendar
commitments, accepted estimates for these drafts, or feature promises.

| Discussed option | Prior rough effort |
| --- | --- |
| Full Paperclip-style parity | Tens of engineer-months |
| Selected Canvas improvements | 3-8 engineer-weeks |
| Constrained durable local manager | 4-9 engineer-months |
| Conditional Paperclip bridge | 6-12 engineer-weeks |
| Broader hardened bridge | 3-6+ engineer-months |

Actual host and supervisor compatibility could change the bridge estimate
materially. The Canvas estimate does not add a UI project to this draft.

## Evidence needed before activation

All proposed acceptance remains unrun. A separately approved design and failure
experiments would need to show bounded execution, cancellation, duplicate-safe
dispatch, and operator-controlled recovery. Qualification must use actual Dude
tools, skills, agents, result handling, and any selected Canvas integration.
It must also show that service restart cannot revive stopped Work or create a
competing task authority. No research estimate proves these properties.

## Related references

- [Coordination roadmap, E](../../docs/agent-coordination-roadmap.md#e-optional-durable-supervision-or-paperclip-integration): conditional service evaluation.
- [Unattended Work continuity](013-unattended-work-continuity.md): existing supervised stop discipline, not an external platform.
- [Epic and multi-feature Ship](088-multi-feature-ship.md): separate cross-feature lifecycle continuity; this idea neither duplicates nor authorizes it.
- [Canvas skill customization](070-dude-canvas-skill-customization.md) and [pack authoring](071-dude-canvas-pack-authoring.md): related studio topics with their own intent, unchanged here.
- Sibling slugs `feature-number-reservations`, `agent-coordination-announcements`,
  and `nonblocking-agent-conversations` remain bounded coordination proposals,
  not a commitment to this management backend.

[paperclip-readme]: https://github.com/paperclipai/paperclip/blob/fa5e70faf47ef2ca20bf2daf95b7503c94469b89/README.md
[paperclip-adapters]: https://github.com/paperclipai/paperclip/blob/fa5e70faf47ef2ca20bf2daf95b7503c94469b89/server/src/adapters/registry.ts#L393-L515
[paperclip-queue]: https://github.com/paperclipai/paperclip/blob/fa5e70faf47ef2ca20bf2daf95b7503c94469b89/server/src/services/heartbeat/queue.ts#L1844-L1910
[paperclip-chat]: https://github.com/paperclipai/paperclip/blob/fa5e70faf47ef2ca20bf2daf95b7503c94469b89/maps/feature-map/agent-chat.md
<!-- dude:managed:end -->

## Coordinator Log

- 2026-10-31T00:27:41Z - brainstorm: First-staged optional durable-agent-supervision from the capture request received at 2026-10-31T00:26:18Z for coordinator publication. Retained the pinned prior Paperclip comparison, uncertain effort judgments, and open service/host-fit choices; no lifecycle number, definition, tasks, service architecture approval, or implementation.
