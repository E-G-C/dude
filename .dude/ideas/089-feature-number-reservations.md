---
title: Feature number reservations
slug: feature-number-reservations
status: draft
spec_path:
---

# Idea: Feature number reservations

## Idea

The user is encountering overlapping feature numbers and suggested that agents
announce a feature's creation so other agents can skip its number:

> one  feature that that could address an issue I'm  having is to avoid overlap features numbers , Agents could "talk" bradcasting that is creating a new feature so othes can skip that number for example.
>
> create roadmap

The later request was to "capture all these details in a brainstomring session".
The collision problem and the suggested broadcast mechanism both belong in this discussion.

## Open Questions

For later definition; unanswered questions do not block saving this draft.

1. Is one repository, one host, and explicitly participating sessions and linked worktrees enough for the first increment?
   Answer:
2. How should repository identity, writer enrollment, and bootstrap from divergent participating inventories work?
   Answer:
3. Which retained atomic backing fits the existing publisher, and who owns its access, recovery, and restoration?
   Answer:
4. How should one logical capture keep its retry identity across session loss, branch changes, and restart?
   Answer:
5. What policies should cover gaps, abandonment, uncertain reservations, offline use, and exhaustion of `001-999`?
   Answer:
6. What capture volumes, response deadlines, and recovery targets matter, and who will observe an opt-in pilot for how long?
   Answer:

## Assumptions

No user-supplied assumptions recorded. The local-first boundary below is a recommendation.

<!-- dude:managed:start -->
## Analysis

Roadmap A proposes an opt-in change to first-capture allocation. Today, clean
local inventory chooses `max(valid direct idea/package numbers) + 1`, without
filling gaps. First definition reuses the captured number and exact slug.
Refreshing or reopening an idea allocates nothing.

[Duplicate-prefix compatibility](076-duplicate-feature-number-prefixes.md)
already permits different slugs to share a number. This new idea neither reopens
that feature nor proposes renumbering or invalidating existing paths and evidence.
The slug remains the semantic selector; the exact numbered path identifies the
ledger, and exact `spec_path:` establishes package ownership.

Numbers record capture chronology, never priority, dependency, roadmap position,
task phase, readiness, dispatch, or execution order. Detecting equivalent feature
scope is a separate problem; unique allocation would not detect duplicate ideas.

Broadcasting after independently choosing a number can race: two agents can
choose the same number before either hears the other. A lock alone also fails
when successive writers have stale divergent inventories and no shared memory
of accepted allocations. Fetching main cannot reveal concurrent unpushed captures.

The coordinator recommends retained repository-scoped authority before valid
coordinated capture, initially on one host. Separate clones, disconnected hosts,
older clients, and nonparticipating writers would receive no new guarantee.
This scope and backing remain proposals, not accepted architecture.

## Proposed allocation behavior

- Atomically reserve a number and its intended capture identity for a stable
  logical request. Retain accepted reservations across sessions, branches, and
  restarts, including allocations absent from another worktree's inventory.
- Extend the existing first-capture publisher rather than bypassing its
  expected-missing publication and validation. Reservation precedes valid
  coordinated publication; announcements report accepted state afterward.
- Return the same reservation after an ambiguous or lost reply when the same
  request retries. Reject conflicting reuse of the request identity.
- Retain uncertain reservations after a crash or cancellation before publication.
  Reconcile publication explicitly; timeout alone must not free a number.
- Pause coordinated publication if authority is unavailable. Never silently use
  local allocation while claiming collision-free capture. Offline intent could
  remain ordinary unnumbered planning input, without a new canonical ledger type.

Reservation is a short required dependency of valid coordinated capture, not a
wait for peers to acknowledge broadcasts. Allocation needs deterministic code,
not a language model or subagent. Announcement delivery must not decide ownership.

Preserving gaps and uncertain reservations is the recommendation; abandonment
and bootstrap policy still need definition. At range exhaustion, the proposed
behavior is an explicit stop, not wrapping, recycling uncertain numbers, or
implicitly widening the format. No backing path, protocol, port, or new command
is selected here. Compare options within the existing Node/publisher stack;
shared Git metadata, if considered, needs scoped ownership and path safety.

## Future acceptance and rollout

These are proposed checks, all unrun:

- Two same-base worktrees capturing concurrently receive distinct new numbers.
  A retry after an ambiguous reply receives its original reservation.
- Client or authority restart, including reservation-before-publication crashes,
  retains accepted allocation knowledge even if every announcement is dropped.
- Old same-number, different-slug identities and definitions remain valid and
  unchanged. Missing or mismatched reservation evidence cannot count as a valid
  coordinated capture.
- Unavailability and exhaustion stop honestly. Diagnostics distinguish reserved,
  published, and uncertain requests using safe correlation identifiers and
  failure reasons, not prompt bodies.

The suggested rollout is an opt-in local pilot before notifications. Observe
concurrent capture, client and authority restart, an outage, and the next
successful capture against today's publication and exact-identity baseline.
The user-designated maintainer and observation duration remain undecided.

Proposed stop conditions are duplicate assignments, inconsistent retries, lost
retained reservations, changed old identities, or unauthorized workflow writes.
On a stop, halt coordinated publication and retain evidence for authorized
reconciliation. Application rollback must not free reservations or resume local
allocation under a coordinated guarantee. Restore accepted allocation knowledge
before reopening coordinated writes.

## Related references

- [Coordination roadmap, A](../../docs/agent-coordination-roadmap.md#a-collision-safe-first-capture): proposed outcome, risks, and open decisions.
- [First-capture workflow](../../.github/skills/dude-feature-definition/SKILL.md#brainstorm): current publication owner and lifecycle rules.
- [Chronological identity checks](../../src/skills/dude-engine/lib/chronological-identity.test.mjs): future regression basis, not new execution evidence.
- Sibling slug `agent-coordination-announcements` covers advisory visibility.
- Sibling slug `cross-machine-feature-reservations` holds optional remote scope;
  `nonblocking-agent-conversations` addresses waiting for peer reasoning.

These references add no dependency metadata or execution order. This draft
creates no package, tasks, runtime authority, or change to historical feature intent.
<!-- dude:managed:end -->

## Coordinator Log

- 2026-10-31T00:27:41Z - brainstorm: First-staged feature-number-reservations for coordinator first-capture publication from the capture request received at 2026-10-31T00:26:18Z. Retained the broadcast suggestion and unresolved reservation choices; allocated no lifecycle number and created no definition package, tasks, or implementation.
