---
title: Agent coordination announcements
slug: agent-coordination-announcements
status: draft
spec_path:
---

# Idea: Agent coordination announcements

## Idea

The user suggested that agents announce feature creation so other agents know
which number to skip:

> Agents could "talk" bradcasting that is creating a new feature so othes can skip that number for example.

This came from a broader question about many-to-many agent communication for work
coordination. The user asked to capture the discussion; bounded announcements
were a roadmap proposal, not approval of a general chat service.

## Open Questions

The following choices remain unanswered for definition.

1. Which sessions may opt into repository announcements, and how should membership, recipient authorization, and revocation work?
   Answer:
2. Which accepted identity and status fields are useful without sharing private prompts or unnecessary repository information?
   Answer:
3. Which host can receive notifications in background code without a busy main-agent receive loop or a model turn per announcement?
   Answer:
4. What session count, message size, fan-out, rate, and buffered-history bounds fit actual use?
   Answer:
5. How should operators see unavailable or stale state, and what approved surface should expose refresh or failure?
   Answer:

## Assumptions

No user-supplied assumptions recorded.

<!-- dude:managed:start -->
## Analysis

Roadmap B separates awareness from allocation. The user's broadcast suggestion
is useful for visibility, but messages cannot make independently selected numbers
unique. The proposal in sibling slug `feature-number-reservations` supplies
authoritative accepted identities; announcements would report those identities
and publication outcomes without changing ownership.

Existing approved Agent2Agent (A2A) communication is pairwise, session-bound,
and single-flight. It is not a delivered repository broadcast bus or durable
queue. Host-provided session and subagent tools do not establish portable Dude
support for background reception.

The bounded outcome is that participating agents and the operator can discover
accepted reservations, publication outcomes, and stale or unavailable coordination
state. General conversations belong to `nonblocking-agent-conversations`.

## Proposed notification boundary

- Use opt-in repository membership and minimal accepted identity/status messages.
  Do not broadcast private prompt contents; share only with authorized recipients.
- Offer best-effort delivery without a replay promise or global message ordering.
  Deduplicate messages and refresh authoritative state after gaps or reconnection.
- Bound payload size, fan-out, rate, and buffered history. Define cancellation,
  unsubscribe, and session-exit cleanup so abandoned listeners release resources.
- Let deterministic background code handle routine transport and receipt.
  A busy main agent should not need a receive loop or a needless language-model
  turn to process each status announcement. Actual host support remains open.
- Make stale, unavailable, and refreshed status distinguishable. An announcement
  is an advisory view, never proof that the authoritative state is still current.

Capture must not wait for peer acknowledgments. Lost, delayed, duplicated, or
reordered notifications cannot allocate, free, or transfer a number. The retained
authority remains necessary even when every notification is missed.

For operator visibility, the coordinator suggested reusing Canvas projections
and Needs You where appropriate. Needs You is a transient human-request surface,
not retained message history. Any rendered UI change still needs an approved
mockup through the existing design process.

This is not a graph-editor proposal. The existing routing-map idea owns that
separate exploration. Notifications also need no durable autonomous supervisor;
an always-on manager is optional evaluation in `durable-agent-supervision`.

## Workflow and privacy limits

Messages grant no workflow-write, scope, execution, review, or close authority.
They must not become a second task board: Lightweight `tasks.md`, or Beads after
import, retains task authority. A status message cannot restart stopped Work.

Repository enrollment must not imply access to every session or another
repository. Define sharing and cleanup before implementation, and keep diagnostic
content minimal. There is no approved protocol schema, storage path, command,
retention period, latency target, or availability promise.

## Candidate acceptance

All of these checks are future evidence, not executed results:

- Loss, duplicates, delay, and reordering leave allocation ownership unchanged.
- Reconnection refreshes authoritative status without depending on message replay.
- Unauthorized or revoked recipients receive nothing; stale state is visible.
- Cancellation and session exit stop delivery and release bounded resources.
- Actual supported-host reception does not require polling by the busy main
  agent or a reasoning turn for every announcement.
- Announcements and any derived display mutate no task or lifecycle state, and
  publication does not wait for acknowledgment from peers.

## Related references

- [Coordination roadmap, B](../../docs/agent-coordination-roadmap.md#b-bounded-repository-announcements-and-visibility): proposed scope and future exit evidence.
- [Existing A2A idea](068-agent-to-agent-communication.md): accepted pairwise scope, left unchanged.
- [Canvas routing map](087-dude-canvas-routing-map.md): separate routing visualization and authoring exploration.
- Sibling slug `feature-number-reservations` covers accepted allocation state;
  `nonblocking-agent-conversations` covers task-bound reasoning and handoffs.
- Sibling slug `cross-machine-feature-reservations` is optional remote allocation
  exploration, not a global guarantee supplied by these announcements.

These are related proposals, not automatic dependencies or authorization to
define, implement, activate transport, or revise existing features.
<!-- dude:managed:end -->

## Coordinator Log

- 2026-10-31T00:27:41Z - brainstorm: First-staged agent-coordination-announcements from the capture request received at 2026-10-31T00:26:18Z for coordinator publication. Preserved the user's broadcast suggestion as advisory visibility and left membership, privacy, bounds, and host fit unanswered; no lifecycle number, package, tasks, or runtime changes.
