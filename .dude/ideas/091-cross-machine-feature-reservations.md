---
title: Cross-machine feature reservations
slug: cross-machine-feature-reservations
status: draft
spec_path:
---

# Idea: Cross-machine feature reservations

## Idea

The user asked to capture the full discussion about agents coordinating work and
avoiding overlapping feature numbers. Extending reservations across separate
clones or machines was an optional assistant-proposed roadmap increment.

No user decision to build remote infrastructure or promise global uniqueness was
made. Keep that possible extension visible without folding it into the initial
number-coordination outcome.

## Open Questions

These questions preserve the optional exploration; no answer is needed for capture.

1. What demonstrated use case needs coordinated capture across separate clones or hosts beyond the proposed local boundary?
   Answer:
2. How should approved clones establish one stable repository identity and authenticate participating writers?
   Answer:
3. Would an authenticated shared service or atomic remote backing be the smallest suitable authority, and who would operate it?
   Answer:
4. How should cutover and recovery retain earlier reservations and prevent old and new authorities allocating independently?
   Answer:
5. What offline or outage behavior should users see when the shared authority cannot be reached?
   Answer:
6. What scale, access and revocation rules, recovery targets, and operating costs are acceptable?
   Answer:

## Assumptions

No user-supplied assumptions recorded. Cross-machine support is not an accepted requirement.

<!-- dude:managed:start -->
## Analysis

Roadmap C proposes extending the reservation guarantee to approved separate
clones or hosts only if a real use case needs it. The local-first recommendation
in sibling slug `feature-number-reservations` does not supply that guarantee.

Every participating writer would need the same retained allocation authority.
One local lock per host cannot prevent conflicting reservations on another host.
Fetching shared Git history cannot reveal concurrent unpublished captures, and
disconnected writers cannot be promised globally unique integers through local
fallback allocation.

This is a first-capture allocation question, not remote task scheduling or chat.
Announcements and later conversation work are not prerequisites for a shared
allocator. A shared allocation service would not imply the broader supervision
platform explored in `durable-agent-supervision`.

## Proposed evaluation boundary

Compare authenticated shared service and atomic remote-backing options against
the same retained-authority invariant. Select neither here. Stable repository
identity, authentication, an operating owner, and an approved cutover/recovery
approach would be needed before implementation.

The candidate behavior carries forward the local reservation proposal:

- Bind each accepted reservation to its intended capture and stable logical
  request. Ambiguous replies and retries return the same reservation.
- Retain accepted knowledge across client and authority restarts, including
  allocations not yet visible as published ledgers.
- Reconcile uncertain reservations explicitly; neither a timeout nor rollback
  makes an uncertain number available again.
- Pause coordinated capture when the shared authority is unavailable. Never
  claim cross-machine uniqueness from an independent local allocator.

Cutover would have to preserve all earlier accepted reservations and stop split
allocation between old and new authorities. Bootstrap must preserve historical
same-number, different-slug ledgers rather than renumbering or rejecting them.
Older clients and nonparticipating writers remain outside the new guarantee.

No alternative feature identity, implicit range widening, GitHub Issues numbering,
or number-based task ordering is proposed. Do not assume named host tools are
portable, or add distributed consensus without a current production need.
Backing paths, commands, protocols, credentials, and deployment are undecided.

## Risks to resolve

Authentication and repository identity must prevent cross-repository allocation
or disclosure. Credential handling, authorization revocation, availability,
restoration, and operating cost add responsibilities absent from a local-only
pilot. The owner of those responsibilities has not been selected.

Lost retained knowledge or a partially completed cutover could allow duplicate
assignments. Recovery therefore needs evidence of accepted allocations before
coordinated writes resume. Local acceptance evidence would not qualify remote
outages, authorization, or recovery.

## Future acceptance

All checks below are proposed and unrun:

- Two authorized hosts with the same starting inventory receive distinct numbers
  from one authority; an ambiguous retry returns its original reservation.
- Client or authority restart preserves accepted knowledge even when publication
  or advisory announcements have not reached the other clone.
- Unavailable authority stops coordinated publication without a false local
  fallback guarantee. Unauthorized writers and revoked access are refused.
- Cutover and recovery retain earlier reservations and prevent simultaneous
  allocation by old and new authorities.
- Historical exact identities remain valid; participating and uncoordinated
  captures are distinguishable without rewriting old paths or evidence.

## Related references

- [Coordination roadmap, C](../../docs/agent-coordination-roadmap.md#c-cross-machine-reservations-only-if-needed): optional remote scope and required decisions.
- [Duplicate-prefix compatibility](076-duplicate-feature-number-prefixes.md): existing identities remain unchanged.
- Sibling slug `feature-number-reservations` holds the proposed retained-authority
  behavior; `agent-coordination-announcements` supplies advisory visibility only.
- Sibling slug `nonblocking-agent-conversations` would need a separate approved
  cross-machine communication boundary if that use is later selected.

This draft records a conditional extension, not a remote service approval,
definition package, execution dependency, or change to existing feature scope.
<!-- dude:managed:end -->

## Coordinator Log

- 2026-10-31T00:27:41Z - brainstorm: First-staged optional cross-machine-feature-reservations from the capture request received at 2026-10-31T00:26:18Z for coordinator first-capture publication. Kept demand, authority, authentication, cutover, and operations open; allocated no lifecycle number and created no package, tasks, service, or implementation.
