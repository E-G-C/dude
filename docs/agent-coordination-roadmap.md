# Agent coordination roadmap

[Back to root README](../README.md) | [Docs index](README.md) | [Planning input and definition](prd-drafts.md)

**Recommendation:** start with collision-safe first capture for participating
sessions and linked worktrees on one host. Add announcements once allocation is
safe; broader communication should remain independently useful, conditional work.

**Status: proposed planning input.** This roadmap is neither accepted architecture
nor a canonical feature definition, live task board, or second source of feature
intent. It authorizes no capture, definition, implementation, or runtime activation.
As with a [product brief](prd-drafts.md), any later selected increment needs its
own bounded definition through `@dude` and `@dude-spec-lead`.

## Goal and first boundary

The user wants agents to avoid overlapping feature numbers and suggested
broadcasting when a feature is being created. Preventing duplicate assignments is
the first outcome. Detecting overlapping feature scope is a different problem;
neither number reservation nor chat automatically detects equivalent ideas.

The recommended first boundary is one repository, one host, and explicitly
participating sessions and linked worktrees. Separate clones, other machines,
older clients, and nonparticipating offline captures receive no new uniqueness
guarantee. This boundary is an assumption for future definition, not a user requirement.

## Current reality and reuse

- [Lifecycle inventory](../src/skills/dude-engine/lib/feature.mjs#L539-L680)
  validates the current workspace, then selects the greatest existing number plus
  one, stopping at `999`. [Commands](commands.md#dude-brainstorm) explicitly allow
  different slugs to share a number across branches. This is a coordination limit,
  not an identity-validation defect. Fetching main reduces stale inventory but
  cannot reveal concurrent or independently unpushed captures.
- [Current identity rules](../.github/instructions/dude.instructions.md) assign
  numbers at first brainstorm/capture. First definition reuses the number and slug;
  refresh and reopen allocate nothing. The slug is the semantic selector, the
  exact numbered path is physical identity, and exact `spec_path:` establishes
  package ownership through the [resolver](../src/skills/dude-engine/lib/feature.mjs#L800).
  Numbers express capture chronology, never priority, dependency, or execution order.
- [First-capture publication](../src/skills/dude-feature-definition/publish-first-capture.mjs)
  already re-inventories immediately before publication and uses expected-missing
  atomic creation, postcondition checks, and lint. Extend this entry point later;
  do not bypass it. Existing identities, definitions, and historical same-number,
  different-slug features must remain unchanged, valid, and readable.
- Current [A2A](../src/extensions/dude/lib/a2a.mjs#L1484-L1585) is approved,
  pairwise, session-bound, and single-flight. Its
  [transport](../src/extensions/dude/lib/a2a-transport.mjs#L798-L862) is not a
  durable queue, replay mechanism, or broadcast bus. Host-supplied session and
  subagent tools are distinct from portable Dude-shipped capability.
- Reuse [Canvas projection](../src/extensions/dude/lib/projection.mjs) for visibility,
  [Needs You](../src/extensions/dude/lib/needs-you.mjs) for transient human requests,
  and the exact resolver/[task parser](../src/skills/dude-engine/lib/tasks.mjs).
  Needs You is not durable message history. The [Work driver](../src/skills/dude-work/driver.mjs)
  remains supervised and invocation-bound, not a scheduler or safe automatic restart service.

## Proposed milestones

Labels below are roadmap labels, not lifecycle feature numbers. Each milestone
can be selected and defined separately. All exit criteria are future acceptance
evidence; no tests, benchmarks, or runtime experiments were executed for this document.

### A. Collision-safe first capture

**Outcome:** participating worktrees can capture concurrently without assigning
the same new number. No chat platform, UI, or always-on management backend is required.
**Dependency:** explicitly define participation, bootstrap, and retained-allocation
policy before implementation.

Recommend one repository-scoped authority that atomically reserves a number and
its intended capture identity for a stable logical request. It must retain
committed reservations across sessions, branches, and restarts, including when a
worktree's inventory cannot see a peer's published idea. Reservation precedes
valid coordinated publication through the existing publisher; notifications
report the accepted identity afterward and never grant ownership or write permission.

Two agents can read the same old maximum and broadcast simultaneously. A lock
without shared retained allocation knowledge also fails on divergent inventories.
The retained local authority is the smallest defensible change; a remote service
adds authentication and operations that this first boundary does not yet need.

Recommended failure behavior, subject to future definition:

| Situation | Proposed behavior |
| --- | --- |
| Response lost or request retried | Return the same reservation for the same logical request; reject conflicting reuse of that request identity. |
| Crash or cancellation after reservation, before publication | Retain the reservation and reconcile publication explicitly. A timeout alone must not make an uncertain number reusable. |
| Announcement lost, duplicated, delayed, or reordered | Allocation remains correct. Treat messages as advisory views of accepted state. |
| Authority unavailable | Pause coordinated publication; never silently fall back to local allocation while claiming uniqueness. Keep offline intent as ordinary unnumbered planning input, without inventing a canonical ledger type. |
| Range `001-999` exhausted | Stop explicitly. Do not wrap, recycle an uncertain number, or widen the identity format implicitly. |

**Exit:** deterministic concurrent captures in two worktrees with the same starting
maximum receive distinct new numbers; a retry after an ambiguous response returns
its original reservation. Restart and reservation-before-publication crash cases
preserve that result, even with every announcement dropped. Existing exact
identities and definitions remain unchanged; missing or mismatched reservation
evidence cannot be presented as a valid coordinated capture.

### B. Bounded repository announcements and visibility

**Outcome:** participating agents and the operator can discover accepted
reservations, publication outcomes, and unavailable or stale coordination state.
**Dependency:** A supplies authoritative accepted identities. Reuse Canvas and
Needs You where appropriate; any rendered UI change still needs approved design.

Recommend opt-in repository membership, minimal identity/status messages, and
best-effort delivery with no replay promise. There is no global message ordering
requirement; recipients deduplicate and refresh authoritative state after gaps.
Bound message size, fan-out, rate, and buffered history; unsubscribe and release
resources on cancellation or session exit. Do not broadcast private prompt contents.

**Exit:** lost, repeated, and reordered messages cannot affect number ownership;
reconnection refreshes status without depending on message replay. Unauthorized
recipients receive nothing, stale status is distinguishable, and messages mutate no workflow state.

### C. Cross-machine reservations, only if needed

**Outcome:** the same allocation guarantee covers approved separate clones or hosts.
**Dependency:** demonstrated demand beyond A, stable repository identity,
authentication, an operating owner, and an approved cutover/recovery plan.
B and later chat work are not prerequisites.

Evaluate an authenticated shared service against atomic remote backing using
the same retained-authority invariant. One local lock per host cannot provide
this guarantee. Do not promise globally unique disconnected integers, substitute
GitHub Issues numbering, assume named host tools are portable, or introduce
distributed consensus without a production need.

**Exit:** two hosts pass concurrency, retry, outage, authorization, and recovery
acceptance against one authority. Cutover preserves earlier reservations and
prevents split allocation between old and new authorities.

### D. Task-bound requests and handoffs

**Outcome:** agents can discuss a specific feature or task, request input, and
record a handoff with explicit membership and retained history.
**Dependency:** B's scoped visibility and a separately defined communication
boundary; C is needed only for cross-machine use.

Reuse exact feature/task resolution and source-backed roster routing. Recommend
per-thread ordering, at-least-once request delivery with duplicate suppression,
explicit acknowledgments, and bounded retries. Define membership revocation,
history retention/replay, and visible failed delivery; isolate invalid messages
instead of retrying them indefinitely. Cancellation ends delivery attempts without
silently accepting a late handoff. No end-to-end exactly-once claim is proposed.

Communication grants no workflow-write, review, execution, or close permission.
Lightweight `tasks.md`, or Beads after import, retains sole task authority;
threads must not become a second board or execute instructions from message text.

**Exit:** authorized history survives restart; duplicate delivery does not repeat
an accepted handoff; revoked members and stale targets are refused. Requests and
replies leave coordinator ownership and task authority intact.

### E. Optional durable supervision or Paperclip integration

**Outcome:** evaluate unattended scheduling or an integration only when an
explicit user requirement justifies a new management backend.
**Dependency:** a separate decision on service ownership, persistence, security,
operating cost, and recovery authority. Work's current driver is a reuse point,
not evidence of safe unattended restart.

**Exit:** a separately approved design and failure experiments establish bounded
execution, cancellation, duplicate-safe dispatch, and operator-controlled recovery
before activation. Paperclip-style organization charts, financial budgets,
multi-tenancy, generic chat, and automatic recovery are deferred, not dependencies of A.

## Decisions required before implementation

- **Guarantee and enrollment — user and Spec Lead through `@dude`:** approve the
  initial boundary, identify the repository across worktrees, and define how
  participating writers are recognized. Nonparticipating paths must not appear
  coordinated. Import known historical allocations unchanged before admitting writers.
- **Atomic backing and recovery — architect and implementer through `@dude`:**
  compare backing options within the existing Node/publisher stack before adding
  dependencies or a service. Select no production path, protocol schema, port, or
  new command here. Shared Git metadata, if considered, needs scoped ownership
  and path-safety design. Decide access controls, durability, and restoration;
  lost allocation knowledge must be reconciled before coordinated writes resume.
- **Allocation semantics — user and Spec Lead through `@dude`:** explicitly define
  the replacement for max-local-inventory-plus-one, bootstrap across participating
  inventories, stable retry identity across restarts, and reservation/publication
  chronology. Recommend preserving gaps and uncertain reservations; decide
  abandonment policy and range exhaustion without identity TTLs or automatic history deletion.
- **Capacity and privacy — maintainer and implementer through `@dude`:** establish
  expected/peak session count and capture bursts, response deadlines, recovery
  targets, and storage/history bounds. No production measurements, latency or
  availability targets, budgets, or retention periods have been supplied.

## Validation, rollout, and handoff

Use the existing [chronological identity tests](../src/skills/dude-engine/lib/chronological-identity.test.mjs)
as a regression basis, including historical shared prefixes and exact ownership.
Future engineer/tester work should add deterministic concurrency, ambiguous retry,
restart, unavailable-authority, invalid-reservation, and exhaustion coverage.
Diagnostics should answer whether a request reserved, published, or remains
uncertain, using safe correlation identifiers and failure reasons, not prompt bodies.

Propose an opt-in local pilot for A before adding notifications. The proposed
release observer is the repository maintainer designated by the user; assignment
and calendar duration remain open. The observation window should cover concurrent
capture, client and authority restart, an outage, and the next successful capture.
Baseline: existing publication, exact-identity, and historical-prefix behavior.
Proposed stop criteria: duplicate new assignments, inconsistent retries, lost
retained reservations, changed old identities, or unauthorized workflow writes.

On a stop, halt coordinated publication and retain allocation evidence for the
authorized owner to reconcile. Application rollback must not free reservations
or resume max-local allocation under a coordinated guarantee. Recovery must
preserve or reconstruct every accepted reservation before reopening writes.
This draft remains unready for implementation until the decisions above are
resolved in separately authorized definition work; it creates no execution backlog.
