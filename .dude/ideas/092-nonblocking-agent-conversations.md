---
title: Nonblocking agent conversations
slug: nonblocking-agent-conversations
status: draft
spec_path:
---

# Idea: Nonblocking agent conversations

## Idea

The user asked about many-to-many work coordination:

> Can an agent talk to multiple agents basically like almost like a chat many to many for work coordination?

Their current concern is whether peer conversations would block the main agent:

> would the conversation take plac with the main agent or subagent which will communicate back to the main? what i'm concerned is blocking the main agent while is working

The user asked to capture all these details in a brainstorming session. Whether
the main agent or a subagent communicates, and what the host supports, remain open.

The user added:

> I'd like to able to inspect the conversationg as well , keep log and at runtime

The human wants to inspect actual agent conversations while they run and retain
a log to read afterward.

## Open Questions

Host fit and communication scope need answers before definition, not before saving this draft.

1. Which host should support the first increment, and does it provide genuinely independent background execution, authorized Agent2Agent (A2A) tools, and result delivery to the main coordinator?
   Answer:
2. What is the first task-bound conversation or handoff, and which peers may join it?
   Answer:
3. What membership, privacy, history retention, and replay behavior should apply, including after restart or revocation?
   Answer:
4. How should the coordinator recognize dependent work and consume replies at a safe task or tool boundary?
   Answer:
5. What timeouts, retry and concurrency bounds, cancellation behavior, and late-reply disposition fit actual use?
   Answer:
6. If the host cannot support independent background communication, is an explicitly synchronous option useful, or should the requested operation be refused?
   Answer:
7. Where should the human inspect live conversations and browse the retained log?
   Answer:
8. If saving fails or cannot keep up with incoming messages, how should recording and the conversation proceed?
   Answer:

## Assumptions

No user-supplied assumptions recorded. Background host support has not been established.

<!-- dude:managed:start -->
## Analysis

Roadmap D proposed task-bound requests, discussion, and handoffs with explicit
membership and retained history. This new follow-on does not broaden or reopen
the accepted pairwise increment in [existing A2A work](068-agent-to-agent-communication.md).

Current A2A ask/receive operations occupy the calling session and turn. Calling
them on the main agent blocks that turn. Moving the same call to a child helps
only if the host lets that child run independently while the main agent proceeds.
Synchronous child delegation still blocks.

There is no established evidence that A2A session authority or tool access
transfers to a child. Host execution, permissions, and result delivery all need
qualification. Unsupported operation should fail explicitly or retain a clearly
labeled synchronous option; it must never silently claim to be nonblocking.

The coordinator's proposed outcome is:

> routine communication never stalls unrelated work; waiting is confined to the action that needs the answer.

This is intent and candidate acceptance wording, not a hard real-time guarantee
or measured performance result.

## Proposed division of work

Deterministic background code should handle transport and routine reservation or
status notifications. Use a bounded background subagent only when the discussion
requires reasoning, with the tools and permissions actually available to it.
Do not create a reasoning turn merely to forward each notification.

The subagent would return a result, evidence, uncertainty, and unresolved
decisions to the main coordinator at its next safe task or tool boundary.
The main coordinator could continue independent authorized work while the
conversation runs; only work dependent on the answer would wait.

For example, the main agent implements an unrelated task while a background
subagent asks a peer about a shared interface. The main agent waits before using
that interface in dependent work, then checks the correlated reply and evidence
before deciding what to do. The reply does not authorize either task.

Number reservation is different: it is a short required dependency of valid
coordinated capture, not a wait for peers to acknowledge broadcasts. No language
model or subagent is needed for allocation itself. If authority is unavailable,
local fallback cannot be described as collision-free capture; sibling slug
`feature-number-reservations` holds that proposal.

## Proposed conversation boundary

- Bind requests, replies, and handoffs to exact resolved features or tasks and
  route through the source-backed roster. Define membership and sharing scope.
- Consider per-thread ordering, at-least-once request delivery with duplicate
  suppression, explicit acknowledgments, and bounded retries. These are candidate
  designs, not an end-to-end exactly-once promise.
- Define retained history, replay, privacy, and membership revocation separately
  from best-effort announcements. Make timeout, lost-peer, and failed delivery
  visible; isolate invalid messages instead of retrying them indefinitely.
- Correlate results with the correct request and current target before consuming
  them. Cancellation ends delivery attempts and background activity without
  automatically accepting a late reply or handoff.
- Reject revoked members and stale targets. Retained conversation history after
  restart does not restore permission or revive stopped Work.

The roadmap suggests scoped visibility from `agent-coordination-announcements`
and a separately defined communication boundary. Cross-machine communication
would need its own approved boundary; `cross-machine-feature-reservations` covers
only optional allocation there. No dependency metadata is established by capture.

## Coordinator authority

A subagent cannot change the main scope, accept work, or mutate coordinator state.
Messages are input to reasoning, not execution instructions or permission,
review, acceptance, or closure. The existing coordinator owns those decisions.
Lightweight `tasks.md`, or Beads after import, remains the only live task board.

Keep background conversation separate from durable autonomous supervision.
An independent child during a live session is not a 24/7 manager or permission
to restart an ended invocation. Existing Work stop and recovery rules remain intact.

## Proposed live inspection and retained review

Let the human inspect exchanged messages while the conversation runs and
review a retained log afterward. A final summary alone does not meet this intent.

Live observation and history browsing must not require unrelated main work to
stop or a new main-agent reasoning turn per message. Keep transport
in background code; reasoning subagents still require genuinely asynchronous
host execution, authorized tools, and supported result delivery.

Possible context includes participants, timestamps, thread/task identity, and
wait/reply/failure/cancellation state. These are design proposals, not a
user-approved schema. Use actual observed messages and events; mark unavailable
content and gaps honestly rather than inferring missing activity.

Limit inspection and logging to authorized conversation content and permitted
evidence. Exclude hidden chain-of-thought, secrets, and private or system prompts.
Read-only inspection gives no permission to steer, approve, resume, or close work.

The retention period and deletion, export, and access policy remain open under
question 3. Questions 7 and 8 leave the viewing surface and recording-failure or
backpressure behavior open; no zero-loss or absolute nonblocking guarantee is
established.

No UI mockup or graphical source is requested now. Any later UI follows the
existing mockup and explicit-approval rules before UI source is written.

## Future evidence

These checks are unrun and would need the actual supported host:

- Observe unrelated main-agent progress during a real peer wait, not merely
  concurrent-looking transcripts or a synchronous child returning later.
- Confirm independent execution, permitted tools, correct result correlation,
  and consumption at the intended safe boundary without transferring authority.
- Exercise timeout, lost peer, cancellation, duplicate delivery, revocation,
  invalid messages, and late replies without unintended acceptance.
- Show authorized history surviving restart without restoring old permission,
  repeating an accepted handoff, or silently restarting stopped Work.
- Show unsupported host/tool combinations refusing or reporting synchronous
  behavior honestly, and dependent work waiting for the answer it actually needs.
- Inspect exchanged messages during a real conversation and read the authorized
  retained log afterward, rather than receiving only a final summary.
- Observe unrelated main-agent progress during live inspection and history
  browsing, without a new main-agent reasoning turn for each message.
- Compare visible events with permitted evidence; expose unavailable content or
  gaps without revealing excluded content or treating inspection as Work authority.

## Related references

- [Coordination roadmap, D](../../docs/agent-coordination-roadmap.md#d-task-bound-requests-and-handoffs): task-bound discussion proposal.
- [Current A2A operations](../../src/extensions/dude/lib/a2a.mjs#L1484-L1585): baseline referenced in the roadmap, not new host-fit evidence.
- [Unattended Work continuity](013-unattended-work-continuity.md): supervised stop discipline, unchanged by this follow-on.
- Sibling slug `durable-agent-supervision` records optional service evaluation,
  not a prerequisite for a bounded background conversation.
<!-- dude:managed:end -->

## Coordinator Log

- 2026-10-31T00:27:41Z - brainstorm: First-staged nonblocking-agent-conversations from the capture request received at 2026-10-31T00:26:18Z for coordinator publication. Preserved the main-agent blocking concern, background-code/subagent proposal, host-fit uncertainty, and authority limits; no lifecycle number, definition, tasks, live conversation, or implementation.
- 2026-10-31T00:53:25Z - brainstorm: Added the user's intent for live inspection of actual agent conversations and retained logs, with proposed visibility boundaries and future checks. Preserved the main-agent nonblocking concern and read-only authority limits; viewing, retention/access, and recording-failure choices remain open. This records intent, not implemented functionality or verification.
