# Feature specification: Trusted agent pairing

Owner: `.dude/ideas/095-trusted-agent-pairing.md`
Exact identity: `.dude/specs/095-trusted-agent-pairing/spec.md`

## Outcome and scope

Owners pair two Dudes once through a deliberate typed handshake. After each
owner approves the exact local scope, their agents can start later matching
activations without asking either owner to type another approval. Pairing
survives local sessions until revoked, expired, or no longer matched.

Reuse the existing Agent2Agent (A2A) participants, profiles, and conversation
capabilities. Pairing approves only the selected peer, local workspace, sharing
policy, and separately shown operations. It adds no conversation purpose,
evidence access, command, worker capability, or workflow authority.
Each side keeps its own approval; one owner's decision cannot enroll the other.

A pairing is standing permission to create a fresh activation, not an active
connection or a saved exchange. Each activation still belongs to its current
session. The existing connection authentication and all ordinary operational
checks apply again. A local agent requests activation through the existing
entry point; startup, a peer message, or retained history does not start it.
Once active, in-scope exchanges already need no per-payload approval.

Enrollment keeps the existing full-native-result review followed by an exact
typed local approval. The proposal explicitly states that approval will persist
and apply to later matching sessions. This increment introduces no new approval
surface, graphical interface, or visual direction.

## Contract amendments

These are explicit, paired-only amendments to
[068](../068-agent-to-agent-communication/spec.md) and
[089](../089-feature-number-reservations/spec.md). Their package bytes, task
state, historical approvals, and qualification evidence remain unchanged.

| Existing contract | Paired behavior and retained guarantee |
| --- | --- |
| 068, "Complete visible proposal before local approval"; FR-042 through FR-045 | The first pairing approval still requires the complete native proposal, a current eligible local input, and one unconsumed code. Later exact-match activation uses the standing grant without another typed approval or review checkpoint. Normal proposal completion preserves pending enrollment; interruption, replacement, expiry, or drift invalidates its code. |
| 068 FR-043 | Preparing an unapproved pairing still activates nothing. An activation request with an already valid matching pairing may activate immediately; its result must say that it activated, not claim preparation only. |
| 068 FR-052 and the size-eligibility choice | Oversized candidates still refuse without activation, partial approval, splitting, or retry. A smaller profile must be selected explicitly. It requires full review and local approval unless it independently has an exact, eligible standing pairing. No larger or refused profile lends its approval to a smaller one. |
| 068 FR-006 and "Separate sharing and operation approvals" | Automatic in-scope payloads remain automatic. A pairing can cover repeated activation of explicitly shown sharing and operation scopes; neither scope supplies the other. |
| 068 FR-018, FR-019, FR-023, and "Availability and cancellation" | Ending an exchange still ends its authority and rejects late results. Standing pairing may authorize a new activation in a new session, never restore an old activation, resume an old exchange, or replay a message from history. |
| 068 exclusions for a persistent store and automatic activation | Permit only the small local standing-approval record and exact-match activation needed here. Keep exclusions for daemons, registries, delivery queues, approval bridges, automatic profile selection/splitting, and retries. The product consumes its own stored grant; it never injects an approval message. |
| 089 FR-009 | "Current local approval" may be an unrevoked, matching standing grant from that participant's own owner. Worker authority must have been separately shown and explicitly included in that owner's initial approval; a transport-only or parent approval still supplies no worker effects. |
| 089 FR-025 and its T008 qualification | Unchanged. Pairing grants no native-run consent and does not replace T008's typed-handshake test. Native qualification profiles remain outside standing pairing. |
| 068 support boundaries and 089 FR-015, FR-016, FR-020 | Preserve status, actual retained conversation messages, sensitive-data exclusions, and honest evidence layers. Automated acceptance here establishes implementation behavior, not new native-host qualification or support. |

All other applicable guarantees remain, including recipient verification,
encrypted communication, independent operation permission, refusal when busy
or unavailable, bounded cancellation, and no communication-driven task closure.

## User scenarios and testing

Story priority ranks user value, not lifecycle number or execution order. Each
story uses its own controlled participants and approval fixtures.

### US1: Pair once and keep talking (Priority: P1)

As an owner, I want one explicit decision about a peer and scope to cover later
matching activations, including after a session restart.

**Independent test:** Start two unpaired participants, approve each local
pairing once, then perform two later activations and in-scope conversations.
Recreate both local sessions before one later activation. Count approval
requests and eligible approval inputs; none may occur after enrollment.

**Acceptance scenarios:**
1. With pairing selected but no standing grant, preparation returns the complete
   local proposal and causes no connection, grant write, command, or worker.
2. After both owners approve their respective current proposals, each local
   grant survives session end without preserving an active connection.
3. A later exact-match request creates a fresh activation without typed approval,
   and an in-scope conversation succeeds through the existing messaging path.
4. If only one owner has paired, that approval neither creates the other
   participant's grant nor makes an unavailable peer available.
5. Ordinary profiles that do not request pairing retain one-use approval.

### US2: Keep permission narrow and revoke it (Priority: P1)

As an owner, I want a reusable approval to stop working when its peer or scope
changes, and I want to revoke it without contacting the other owner.

**Independent test:** Create a paired fixture directly through the enrollment
path. Independently change each approval binding, expire its permission, remove
its standing record, and attempt out-of-scope operations. Observe the actual
admission, sending, and operation-start boundaries.

**Acceptance scenarios:**
1. A changed peer identity, local workspace, profile scope, or approved operation
   prevents automatic activation. A changed scope requires a new complete
   proposal and deliberate local approval.
2. A sharing-only pairing starts no command or worker. An explicitly paired
   worker or command runs only within its separately approved scope and limits.
3. Removing the local standing record prevents later automatic activation.
   For an already active participant, the next authority check ends its use
   before another admission, disclosure, or operation start.
4. Stop or cancellation ends current work as before. A subsequent fresh
   activation cannot accept a result from the ended exchange.
5. Peer content, model output, copied approval text, and conversation history
   create, widen, and revoke no pairing through the product's input channels.
6. Invalid storage or an oversized candidate activates nothing, even when a
   previously valid pairing existed.

### US3: See when agents communicate (Priority: P2)

As an owner, I want automatic activation to be visible without becoming another
approval prompt, and I want to inspect the conversation afterward.

**Independent test:** Enroll a fresh pair, automatically activate it, and perform
one recorded conversation. Inspect activation notices and actual live and
retained messages, then repeat with notice delivery and recording failures.

**Acceptance scenarios:**
1. Each automatic activation identifies its standing approval, peer, local
   scope, validity, and revocation action without requesting confirmation.
2. A failed activation is reported as inactive; it is not shown as an active
   connection merely because a standing grant exists.
3. Existing live and retained inspection shows the actual authorized
   conversation messages and their outcomes, with the existing omissions.
4. A failed required notice or recording boundary stops the affected activity;
   it does not silently continue in a less observable mode.

## Functional requirements

### Initial pairing

- **FR-001:** Dude must keep pairing opt-in for each owner-selected profile.
- **FR-002:** Before accepting a first or replacement pairing approval, Dude
  must present the complete native proposal, including its identities, sharing
  scope, separate operation and worker scopes, limits, repeated-activation
  lifetime, local persistence, revocation action, and risks.
- **FR-003:** Dude must accept enrollment only through the existing exact
  current local approval interaction, with its origin, readiness, binding,
  expiry, interruption, and single-use checks intact.
- **FR-004:** Each participant must obtain its own owner's approval before
  using standing authority on that participant.
- **FR-005:** Dude must bind a pairing to the exact approved local participant,
  peer identity, configuration, selected profile, and separately approved scopes.
- **FR-006:** Dude must retain the local pairing outside every repository so
  later sessions on that machine can use it without project synchronization.
- **FR-007:** If saving an approved pairing fails, Dude must refuse that
  enrollment's activation rather than downgrade it silently to one-use approval.

### Later activation and scope

- **FR-008:** On a fresh local activation request, Dude must activate an exact,
  eligible paired profile without another typed approval.
- **FR-009:** Before automatic activation, Dude must apply all remaining
  activation eligibility checks, including complete-proposal size eligibility,
  current context, queued input, connection controls, and validity.
- **FR-010:** When the standing record is absent or does not match, Dude must
  require a complete new local pairing approval before automatic use.
- **FR-011:** An unreadable, malformed, or unsafe standing record must refuse
  automatic activation without a fallback that treats it as permission.
- **FR-012:** Dude must keep disclosure authority separate from command
  authority in every paired activation.
- **FR-013:** Dude must create worker authority only from the receiving
  owner's standing scope that explicitly included that exact worker and its effects.
- **FR-014:** Dude must enforce the existing exchange and operation usage
  limits within each activation, with their per-activation reset disclosed at enrollment.
- **FR-015:** Dude must preserve configured absolute expiries without extending
  them when it reuses a pairing.

### Control and observation

- **FR-016:** Revoking a local pairing must prevent its next automatic
  activation and its active participant's next authority-checked use.
- **FR-017:** Dude must reject reuse of an ended activation's exchanges,
  messages, results, and worker permits after stop, cancellation, context loss,
  revocation, or expiry.
- **FR-018:** Dude must treat peer messages, model/tool output, and retained
  text as data rather than inputs that create, widen, or revoke a pairing.
- **FR-019:** Each automatic activation must provide a local notice identifying
  the standing grant, peer, profile and scopes, effective validity, and how to
  revoke it; failure to provide the required notice must prevent communication.
- **FR-020:** Paired conversations must preserve existing live and retained
  message inspection, including recording failures, omissions, and uncertain outcomes.
- **FR-021:** Dude must start no activation or replay automatically from
  startup, a stopped exchange, an unavailable peer, or retained history.
- **FR-022:** Profiles without pairing must retain the existing one-use
  approval behavior.
- **FR-023:** Dude must exclude native qualification profiles from standing
  pairing so it cannot substitute for qualification-specific approval.
- **FR-024:** Before pairing, Dude must disclose that ordinary host and local
  file permissions do not prove human authorship or protect a grant from an
  unrestricted local writer.
- **FR-025:** Feature claims must distinguish automated implementation evidence
  from actual native-host qualification.
- **FR-026:** Dude must exclude standing-approval records from outbound evidence.

## Key entities

| Entity | Meaning |
| --- | --- |
| Pairing proposal | A complete current local proposal whose explicit effect is reusable approval of the shown scope. Preparing it supplies no permission. |
| Local pairing | One owner's standing approval for an exact participant, peer, and scope. The other participant has its own independent approval. |
| Approval binding | The stable identity and scope that must still match. A new session is allowed; a different peer, workspace, or approved scope is not silently substituted. |
| Activation | Fresh session-bound communication authority derived from current one-use approval or an eligible pairing. It ends under the existing lifetime rules. |
| Exchange and transcript | A current request/reply and its retained observations. Neither is reusable permission or a continuation token. |

## Edge cases

- One side is paired while the other is stopped, unpaired, or unavailable.
  Return the existing unavailable outcome; do not enroll, wake, or replace it.
- The same display name, account, or project label appears with a different
  authenticated peer. Labels and account observations do not confer peer trust.
- A new session uses the same approved participant and scope. It may create a
  fresh activation, but every exchange identifier and worker permit is new.
- A configuration edit changes even an otherwise unused part of the approval
  binding. Refuse reuse conservatively rather than infer a narrower equivalent.
- Restoring exactly the originally approved configuration can match an existing
  grant again. Editing configuration is therefore not durable revocation:
  deleting the standing record is the revocation action.
- A numeric allowance is exhausted. It stays exhausted within that activation;
  a separately requested fresh activation receives only the per-activation
  allowance the initial pairing explicitly covered. There is no automatic rollover.
- Command approval expires during active sharing. Existing sharing and command
  validity remain separate; no expired operation is run.
- A stop, queued input, expiry, record deletion, or binding change occurs during
  startup or before a reply. Recheck at existing boundaries and reject late success.
- A complete candidate is exactly at the existing display limit or one byte
  above it. A saved pairing never bypasses the size check or supplies a partial
  approvable proposal.
- Pairing storage is missing, unwritable, linked, malformed, or located in a
  repository even though the configuration is outside the current workspace.
  Only ordinary absent storage permits first enrollment; unsafe storage refuses.
- A local agent can write arbitrary files or inject eligible local messages.
  It can forge or remove local approval under that host authority. Pairing
  does not add cryptographic protection against this actor.
- Revocation follows possible delivery or process start. Later authority ends;
  already disclosed information and already caused effects cannot be recalled.

## Success criteria

- **SC-001:** Two controlled participants each require exactly one initial
  enrollment approval and zero further typed approvals across two later
  successful activations, including one after both sessions are recreated.
- **SC-002:** Every defined mismatch, expiry, unsafe-storage, scope, and
  untrusted-input case grants zero new standing authority and starts zero
  unauthorized operations or disclosures.
- **SC-003:** Revocation is effective by the next authority boundary in every
  tested active-use case, and by the next activation request after session end.
  No ended exchange produces an accepted late reply.
- **SC-004:** Every successful automatic activation has its required notice;
  every recorded paired conversation can be inspected live and afterward with
  matching messages and explicit outcomes or recording gaps.
- **SC-005:** Ordinary one-use approval, proposal-size boundaries, transport
  authentication, worker permission, and qualification-consent regressions
  retain their previous behavior.
- **SC-006:** Automated acceptance exercises the actual extension behavior and
  an actual authenticated local connection between independent test processes.
  It requires no human input, real account, native model run, or new harness.
  Controlled host and reasoning substitutes are identified as such.

## Assumptions and dependencies

There are no new user-supplied answers or assumptions. The following are
**Ship-authorized definition-owner dispositions**, made before Work under the
accepted one-time-handshake intent. The ledger's five empty answer slots and
`## Assumptions` remain untouched.

| Question | Disposition | Basis |
| --- | --- | --- |
| Q1 | Bind the exact existing owner-selected profile: authenticated peer, local workspace, agreed project correlation when present, existing conversation purpose, sharing, explicitly selected operations, and configured limits. Approval covers repeated fresh activations; no extra expiry or lifetime counter is invented. | Existing profiles already expose these choices for actual owner review. Reusing precisely that scope meets the request without choosing a real peer, disclosure, or operation for the user. |
| Q2 | Require each owner's initial local approval. Include worker reuse only when that owner's complete proposal separately shows and explicitly grants its worker effects. | This preserves independent authority and FR-009's no-inheritance rule without recreating a per-run worker prompt. |
| Q3 | Persist on one machine outside repositories; revoke locally by stopping current participation and deleting the displayed standing record. | Session-only consent recreates repeated approval; project-carried consent can be committed and inherited. A local record is sufficient without shared infrastructure. |
| Q4 | Give a notice for each automatic activation and preserve current status plus live/retained conversation inspection. | Existing visibility obligations already settle this choice; silence would remove an accepted guarantee. |
| Q5 | Leave 089 T008 under its current typed-approval and native-consent contract, with no dependency on 095. | This package has its own automated acceptance and cannot change another feature's live task or turn prior attempts into passes. |

The existing A2A runtime and controls are implementation context, not declared
Ship prerequisites. The coordinator's prerequisite plan contains only this
target. The lifecycle number records capture chronology, not priority.

Owners still select real profiles and approve their complete first proposals
at actual use. Ship authorizes this definition, not an actual pairing, native
session, disclosure, command, worker, or live test. A peer identity establishes
the selected credential holder, not the truth of its response or attestation
of its remote workspace. Both local scopes remain independently enforced.

### Deferred native qualification

Actual host presentation, human review/input delivery, notice visibility,
native model behavior, saved-sign-in behavior, physical LAN, and additional
platform qualification are **deferred, not passed, and not blockers for this
package's automated implementation acceptance**. They remain subject to the
existing support and operation-permission gates before live use. No task here
launches such a run, and no new support claim follows from controlled tests.

## Out of scope

No new conversation protocol, general delegation, automatic peer discovery,
shared registry, central service, daemon, delivery queue, background reconnect,
retry, supervision, grant synchronization, authentication service, cryptographic
local-consent seal, or second approval channel. No graphical surface, new
viewer, transcript migration, unlimited operation permission, workflow-state
mutation, or automatic task closure. Do not edit the 068 or 089 packages,
change 089 T008, run its native qualifier, or implement the broader 090-093 ideas.
