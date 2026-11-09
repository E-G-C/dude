# Feature specification: Feature number reservations

Owner: `.dude/ideas/089-feature-number-reservations.md`
Exact identity: `.dude/specs/089-feature-number-reservations/spec.md`

## Outcome and scope

Two independent Dudes exchange actual Agent2Agent (A2A) messages. B reasons
from its own approved local knowledge; A demonstrably uses the reply in a local
first capture. Numbering is a nice-to-have demonstration of distributed
collaboration. Feature 076 already permits same-number, different-slug identities.

Both main agents continue unrelated authorized work while waiting. The human
inspects actual messages live and afterward. Peers require no shared checkout,
common Git directory, shared filesystem, or common host. Two peers bound this
proof without claiming arbitrary many-to-many support.

The first milestone uses separate normal Copilot signed-in sessions and
independent workspaces. Reuse the session runtime's supported saved sign-in
directly; Feature 089 implements no sign-in and handles no authentication
secrets. The merged Canvas/public-GitHub-pack sign-in serves a different purpose
and remains entirely separate, with no collaboration dependency or handoff.
The existing token-only collaboration caller still needs the planned integration.

The owner explicitly selects normal real home/configuration and logging
behavior, with the usual runtime authentication lookup and storage effects
disclosed. This route does not claim authentication-only lookup or universal
confinement. Existing explicit-credential/strict callers keep their behavior.

Strict isolated-worker qualification is deferred, **not passed**, and is not
a prerequisite for this milestone. The first proof is same-computer Windows;
it certifies neither other platforms nor absence of ambient host reads,
authentication-only fresh-home isolation, every host setting's effectiveness,
or an operating-system sandbox. Existing strict implementation and historical
controlled/component evidence remain distinct from this revised acceptance.

## User scenarios and testing

### US1: Make a peer-informed capture (Priority: P1)

Demonstrate collaboration through a decision A could not make from local evidence alone.
**Independent test:** A knows a maximum of 100; B has a valid 101 record absent
from A. Observe B's permitted read and reasoned A2A reply, then A choosing 102.

**Acceptance scenarios:**
- Accepted advice reaches final publication with baseline, observation, choice,
  and exact resulting identity recorded.
- Rejected or invalid advice is not applied; explicit local-only capture is labeled.
- Simultaneous same-number/different-slug choices remain valid, not reservations.
- Observations identify the actual answering session and request. A separate
  test session, intended configuration, or artifact identity alone is insufficient.

### US2: Continue work while a peer reasons (Priority: P1)

Only answer-dependent work needs to wait.
**Independent test:** During a real pending exchange, each main agent completes
an unrelated authorized action after initiation and before the reply.

**Acceptance scenarios:**
- Initiation returns before reasoning completes; later reads remain correlated.
- A second active conversation returns busy without queueing.
- Cancellation rejects late success and reports possible prior disclosure.
- Both main agents initiate and finish their own unrelated actions while B's
  real request for evidence is pending. Observer-driven actions, a later prompt,
  or activity after the reply cannot substitute for this progress.

### US3: Inspect the conversation (Priority: P1)

Actual messages make collaboration inspectable, rather than inferred from a summary.
**Independent test:** Watch the request before B finishes and the reply on arrival,
then compare retained messages with both peers' evidence after session end.

**Acceptance scenarios:**
- Sending attempts, admission, validated receipt, outcomes, and gaps are distinct.
- Reading causes no peer action, permission, or workflow change.
- Unavailable/full recording refuses before disclosure; later gaps fail this proof.

### US4: Preserve local control and existing capture (Priority: P2)

Each owner controls participation and publication; collaboration stays optional.
**Independent test:** Exercise ordinary capture, expired/refused participation,
and existing duplicate-prefix identities.

**Acceptance scenarios:**
- Absent collaboration, ordinary A2A/capture needs no new contact or recording.
- An unavailable peer/answering session grants no write; explicit local fallback
  is not proof.
- Existing identities, histories, and publication gates remain valid.
- Collaboration uses narrow evidence tools, approved roots, and current owner
  permissions. It refuses protocol requests for arbitrary local writes, shell,
  delegation, or peer tools. Matching signed-in accounts grant no peer access.
- Observe the capabilities and permission behavior actually used in the proof.
  Configured normal-session settings are not universal host-confinement proof.
- Cancellation and shutdown stay bounded. Report uncertain delivery and
  unconfirmed cessation honestly, retain affected evidence/storage, and infer
  no kill or cleanup permission.

### US5: Reuse normal saved sign-in without implementing it here (Priority: P1)

The user must not create or export credentials for this feature.
**Independent test:** Through the supported normal-runtime route, check the
expected account on each actual runtime and session before its first prompt
and before evidence or answer disclosure. Exercise missing, mismatched,
unavailable, and changed observations without login or fallback. Controlled
checks establish caller behavior; only a separately authorized native run
establishes actual signed-in collaboration.

**Acceptance scenarios:**
- Feature 089 consumes runtime-owned saved sign-in directly, without a Canvas
  pack-auth handoff, new authentication service, or credential handling.
- The runtime retains authentication secrets. Feature 089 neither creates,
  reads out, copies, nor exports them.
- Expected and observed account identity refers to the actual runtime and
  session, not another session or an intended setting. Account identity is
  not peer identity, entitlement proof, or a continuous account lock.
- Normal home/configuration, authentication lookup, logging, and storage effects
  are disclosed before approval. The normal route is an explicit choice, never
  an automatic fallback from a strict failure.
- A supported source contract plus a bounded current-caller design can support
  controlled implementation while native account behavior remains unproven.
  A material interface, identity, lifetime, or error-handling gap stops that
  integration; it does not justify another opaque authentication investigation.
- Existing explicitly supplied credential configurations keep their accepted
  behavior for current callers; their compatibility authorizes no fallback
  for this proof.

### Deferred strict qualification

The former US4/US5 requirement to prove exclusion of forbidden ambient input
before the actual worker's first prompt, authentication-only lookup with fresh
owned home/configuration, and continuous isolation/process observation through
complete owned-tree cessation is retained for later strict qualification.
Those checks are unrun/not passed, not satisfied by ordinary signed-in sessions,
component fixtures, intended settings, quiet output, or a parent process exit.
They do not gate the first collaboration milestone or authorize weakening the
existing strict route.

## Edge cases

- Offline/late peers, partial evidence, disagreement, or evidence changing before reply.
- Local inventory drift or advice for another project, peer, slug, exchange, or draft.
- Reply races cancellation, expiry, disconnect, or owner/context loss.
- Recording fails after possible sending, or shutdown remains unconfirmed.
- A collaboration observation cannot be tied to the actual session/request,
  has a gap, or reports only intended permission/configuration; the claimed
  collaboration check fails.
- A normal runtime is unavailable; account observations are missing, malformed,
  mismatched, or change during an exchange; no later answer revives the operation.
- Approval-bound normal configuration or environment changes before use.
- Integration would require a new login flow, credential copying, a guessed
  interface, or a broader permission; stop rather than inventing the route.
- An unexercised strict-isolation check stays deferred, not green.
- Exhausted 999 range or publication failure; no automatic renumber/retry.

## Functional requirements

- **FR-001:** Peers must exchange actual A2A messages without shared coordination files or common Git metadata.
- **FR-002:** B must use approved local evidence and return its explanation, references, and limitations.
- **FR-003:** A must explicitly decide whether to use advice; receipt must not trigger capture.
- **FR-004:** With accepted advice, the publisher must choose one greater than the greater of fresh local maximum and peer observation.
- **FR-005:** The publisher must reject advice not bound to the actual recorded reply and exact local capture.
- **FR-006:** The publisher must preserve validation, expected-missing creation, postcondition, lint, rollback, exhaustion, and reported-path behavior.
- **FR-007:** Ordinary capture without advice must remain unchanged.
- **FR-008:** Collaboration must preserve 076 identities, exact ownership, and history; numbers mean capture chronology only.
- **FR-009:** Peers must require current local approval; parent approval must not implicitly grant worker effects.
- **FR-010:** For collaboration requests, the answering session must offer only approved evidence reads and answering, and refuse protocol-requested general writes, shell, delegation, or peer tools. This revised milestone does not certify universal confinement of normal host sessions.
- **FR-011:** Initiation and result reads must return without waiting for the answer, allowing both main agents to progress.
- **FR-012:** Each activation must allow only one active conversation, with no automatic queue, retry, or reservation.
- **FR-013:** Cancellation/invalidation must end result acceptance and reject late revival.
- **FR-014:** The system must bound waits/cleanup and report uncertain delivery or unconfirmed cessation honestly.
- **FR-015:** The system must let the human inspect actual authorized messages live and in a retained local transcript afterward.
- **FR-016:** Transcripts must exclude secrets, private/system prompts, and hidden reasoning; omissions must be visible.
- **FR-017:** Collaboration must refuse at recording capacity and stop further disclosure on failure, without silent evidence deletion.
- **FR-018:** Messages/logs/receipts must remain observations, not permissions, replay instructions, or workflow authority.
- **FR-019:** Hosts unable to provide the approved collaboration capabilities must refuse rather than use an unrestricted fallback; strict isolated-host certification is deferred.
- **FR-020:** Acceptance must distinguish controlled tests, real transport tests, and actual independent native AI proof.
- **FR-021:** Feature 089 must directly reuse supported normal-runtime saved sign-in without implementing authentication or extracting, copying, exporting, or creating credentials.
- **FR-022:** Each actual runtime and session used by the proof must match the owner's expected account before its first prompt and at subsequent evidence/answer disclosure boundaries.
- **FR-023:** Missing, unavailable, malformed, or mismatched account observations must refuse without interactive login, account creation, account switching, or authentication fallback.
- **FR-024:** **Deferred strict qualification, not passed:** Existing-sign-in lookup must preserve fresh owned work, home, configuration, and temporary storage and all existing ambient-input, tool, logging, and permitted session-storage boundaries. This is not a first-milestone prerequisite.
- **FR-025:** Controlled integration must follow an assessed supported normal-session contract and bounded current-caller design; actual native qualification additionally requires accepted integration and specific native consent.
- **FR-026:** Existing explicit-credential configurations must remain compatible for their current callers.
- **FR-027:** Compatibility assessment must distinguish documented normal-route capability, actual native account behavior, and the historical strict source-only UNPROVEN finding, without treating any one as proof of the others.

FR-021-023, FR-025, and FR-027 now cover the direct normal-runtime route.
FR-024 and the strict portions of US4/US5 remain deferred. Other numbered
requirements retain their obligations. Historical completed task units and
logs retain their original acceptance wording and evidence limits.

## Key entities

- **Peer/project binding:** Approved participant and project correlation, not enrollment by label.
- **Conversation:** One request/reply with correlated operation, delivery, and terminal state.
- **Observation:** B's local finding, evidence, and uncertainty, not a global inventory.
- **Advice/receipt:** A's selected observation for one draft and the actual publication decision.
- **Transcript:** Retained authorized messages and state observations.
- **Expected account identity:** The owner's selected account, compared with
  public observations from the actual runtime and session; neither a credential
  nor a peer identity.
- **Compatibility finding:** A bounded assessment of the documented normal
  route and its current callers. It grants no permission or native proof.

## Success criteria

- **SC-001:** A native run proves US1's actual A2A exchange, B's read/reasoning, and causal capture. Mocks, different numbers, or public types alone fail.
- **SC-002:** Each main agent completes at least one unrelated authorized action while pending; start/read/cancel return before the answer.
- **SC-003:** The human sees both messages live and rereads matching retained content after session end without unexplained gaps.
- **SC-004:** Negative collaboration checks refuse out-of-scope evidence reads, unauthorized peer disclosure/publication, and late acceptance; uncertainty and shutdown limits are explicit. This revised criterion does not certify absence of ambient host reads.
- **SC-005:** Ordinary capture, duplicate-prefix, exact-identity, and rollback regressions pass.
- **SC-006:** Qualification records actual hosts, accounts, permissions, configured versus observed capabilities, and measured timings: begin/read/cancel <=1 second, operation <=120 seconds, answering work <=90 seconds, and cleanup attempt <=10 seconds. Untested platforms and strict isolation remain unqualified.
- **SC-007:** A source-backed assessment identifies the normal route's actual interface, identity/metadata, lifetime, and bounded error behavior at current callers. It states whether controlled integration is supported and separates unproven native account behavior from the historical strict-route UNPROVEN finding.
- **SC-008:** Every actual runtime/session in the first milestone passes expected-account checks before prompt and evidence/answer disclosure; all missing/mismatched/unavailable controlled cases refuse without login or fallback, and existing explicit-credential regressions still pass.

SC-007-008 now assess direct saved-sign-in reuse. SC-001-006 retain their
collaboration-first obligations. A collaboration pass must name its scope
and report strict qualification as deferred/not run/not passed.

## Conscious definition assumptions

Earlier Q7-Q10 were Ship-authorized Spec Lead choices, not user answers;
the ledger's questions, blank answers, and assumptions remain unchanged.
Retain independent workspaces, approved peer/project binding and a separate
worker grant, one bounded request/reply with explicit cancellation/local
fallback, no reservation, and read-only terminal inspection with bounded
retention. The first host remains Windows on one computer, without waiving
the graphical mockup gate or claiming other topologies/platforms qualified.

The user's 2026-11-06T13:41:39Z direction selects collaboration first and
forbids implementing sign-in here. The 2026-11-08T21:42:49Z authorization
supersedes only the supposed incoming-feature dependency with direct normal
Copilot saved-sign-in reuse. The runtime's normal configuration/authentication
lookup, logging, and storage behavior must be disclosed, not misreported as
strict isolation. No outcome-changing product clarification remains.
Native account behavior, specific consent, and both actual collaboration
acceptance groups remain outstanding. This definition supplies no new test
result or task acceptance.

## Out of scope

No global uniqueness, atomic allocator, consensus, shared lock/ledger,
cross-worktree scan, automatic enrollment/peer writes, public-internet expansion,
fan-out, arbitrary many-to-many, durable supervision, or whole 090-093 platform.
No sign-in UI/flow, authentication service, token creation/copy/export, credential
request or cache research, secret-store patch, speculative authentication
provider/interface/shim, or Canvas pack-auth integration. Add no extension,
join, session, readiness, or observer framework. Strict isolation is deferred
without weakening the existing strict route. Preserve 068/076/090-093 workflow
bytes and local profile customizations. This definition grants no
implementation, native execution, merge/Git mutation, cleanup, Work continuation,
or task-close authority.
