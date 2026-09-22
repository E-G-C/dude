<!-- audit log: .dude/ideas/068-agent-to-agent-communication.md#coordinator-log -->

# Tasks: Local and remote agent communication

**Spec**: `.dude/specs/068-agent-to-agent-communication/spec.md`
**Plan**: `.dude/specs/068-agent-to-agent-communication/plan.md`

Twelve proposed canonical units, all open. First definition has no prior task
state, archive, discovered work, or execution history to reconcile. No generated
board is needed. Dependencies express actual gates, not lifecycle chronology.

T001 is the qualification gate. It completes only with a recorded GO. NO-GO or
missing evidence keeps the feature unavailable and stops for a user decision;
no later task may proceed. Nothing that serves peers may be built or enabled
before GO. GO permits implementation, not automatic live enablement.

Real sessions, any live connections (including loopback), and a second computer
require separate user authorization for exact targets and operations. Ordinary
offline fixtures are not authorization to attach to a host or expose a server.
The coordinator owns dispatch, task state, verification handoff, and closure.
Named owners are routing guidance and must be rediscovered at dispatch.

## Phase 0: Setup and Qualification

- [ ] T001@a068d101 [Shared] Qualify the existing-session host controls in Plan Gate Q0 using the retained research, `src/extensions/dude/extension.mjs`, and `src/extensions/dude/lib/needs-you.mjs` as references, with an isolated temporary qualification harness only.
    Owner: Architect for contract assessment; Tester for independent observations; coordinator for authorization and the existing evidence/log handoff.
    Scope: Establish actual host/runtime identity, serving-session enforcement, activation races, direct/indirect denial, receive-completion versus reply lifetime, successive receives, provider loss, root abort, unrelated input, workspace/session changes, scope/control changes, and stop-before-relaxation. The serving allowlist must deny `dude_a2a_ask`; use a harmless sentinel under that name before production implementation exists. Q0 qualifies no asking-side restriction. Do not build a peer client/server or expose an endpoint. Record GO/NO-GO through existing task evidence, not a new registry.
    Authorization: Separate user authorization required before using any real session, connection, or second computer. Without it, stop pending authorization. A NO-GO stops for a user decision and does not complete this gate.
    Verify: Supply an observed result for every Q0 row, including harmless denied-effect sentinels, an observed denial of `dude_a2a_ask` during serving, and failure races. Source forwarding, hidden tools, prompt compliance, and absent rollback are insufficient. Independent verification must support GO.
    Trace: Plan Phase 0, Source and Version Basis, and Lifetime; US2, US3; FR-009 through FR-011, FR-017 through FR-020, FR-024 through FR-026; SC-002, SC-004, SC-006, SC-007.

- [ ] T002@a068d202 [Shared] Obtain approval for the bounded chat/host interaction using the existing design lane, preserving variants under `.dude/specs/068-agent-to-agent-communication/design/` before implementing presentation source.
    deps: T001@a068d101
    Owner: Existing design owner through the coordinator.
    Scope: Mock up peer/session identity, source scope, read-only serving interval, approval/expansion, availability, non-answer outcomes, and safe stop. Use existing chat/host controls; no Canvas redesign or new web UI. Follow the existing exploring/proposed/approved design states and preserve every explored variant.
    Verify: Obtain explicit user approval for the exact proposed interaction and retain the design evidence through the existing lane. Do not infer approval from C1 or the LAN answer.
    Trace: Plan Guardrail Check and Phase 1; US1 through US3; FR-003, FR-007, FR-021, FR-026, FR-028.

## Phase 1: Foundational Safety

- [ ] T003@a068d303 [Shared] Implement default-off scope and session enforcement in `src/extensions/dude/lib/a2a.mjs`, qualified wiring in `src/extensions/dude/extension.mjs`, and focused cases in `src/extensions/dude/a2a.test.mjs`.
    deps: T001@a068d101, T002@a068d202
    Owner: Coder, with Architect consultation on the qualified host contract.
    Scope: Register serving tools `dude_a2a_receive` and `dude_a2a_reply`, plus asking tool `dude_a2a_ask`. The question receiver (serving) uses the qualified whole-session allowlist, which excludes `ask`. The answer receiver (asking) uses one invocation-bound call with no inbound listener, receive waiter, or session.send, and no changes to filters, session options, approvals, connection configuration, trust material, or scope. Install only a coordinator-verified literal approval through the separate trusted local activation path; bind scope to peer/session/workspace and provider generation. Before serving admission, enforce the allowlist and refuse active project operations. Keep normal receive completion distinct from serving exchange authority. Do not reuse Needs You, Canvas, hidden sessions, or saved authority.
    Verify: Offline fixtures prove no startup listener, no serving before qualification/activation, no forged approval, no Work or tracker writes, one current serving waiter/exchange, valid reply after ordinary receive completion, and default-off Canvas/Needs You regressions. Assert that the asking handler touches none of the filter/session-option/approval/configuration/trust/scope mutation paths, an asking-only session has no A2A inbound handler, and the serving allowlist excludes `ask`. Live host checks require separate user authorization and are not implied by this task.
    Trace: Plan Existing-session Receive and Reply, Asking-side Answer Handling, Sharing Scope, Phase 1; US1 through US3; FR-002, FR-006 through FR-011, FR-014 through FR-020, FR-023, FR-024, FR-026, FR-028; SC-002, SC-004, SC-006, SC-007.

- [ ] T004@a068d404 [Shared] Add the protected direct-message transport in `src/extensions/dude/lib/a2a-transport.mjs`, its SDK build entry/package lock under `scripts/dude-a2a/`, and offline adapter cases in `src/extensions/dude/a2a-transport.test.mjs`.
    deps: T001@a068d101, T003@a068d303
    Owner: Coder.
    Scope: Pin SDK 1.2.0 and its compatible Express/build dependencies; select A2A v1.0.0 JSON-RPC. Implement mutual TLS, expected peer/session binding, explicit local interface/address selection, authenticated minimal metadata, direct Message responses, limits, and pre-model admission checks. Before any asking-side answer reaches the model, correlate it with the outstanding request, take peer identity from TLS, and validate exact feature-payload keys, enums, UTF-8, and the 256 KiB limit. Reject task routes, redirects, unsupported bindings, public endpoints, unqualified combinations, and excess input. Lazy-load the runtime; add no discovery, store, relay, or queue.
    Verify: Offline adapter and certificate fixtures cover wrong/missing identity, plaintext refusal, interface/version mismatch, endpoint/session mismatch, unsupported operations, preapproval content leaks, and bounded errors. Reject forged identity fields, reserved or unknown feature keys, oversized answers, and malformed answers before any peer-bearing tool result; only a fixed local failure outcome may be returned. Inspect the lock and dependency notices. Any installation/build uses normal implementation authority; opening a real listener or connection requires separate user authorization.
    Trace: Plan Connection, Trust, and LAN Transport; Asking-side Answer Handling; Source Layout; US1, US2, US3; FR-001, FR-004, FR-005, FR-009, FR-010, FR-015, FR-016, FR-024, FR-025, FR-029; SC-001, SC-002, SC-005, SC-006, SC-008.

## Phase 2: US1 - Obtain Missing Evidence

- [ ] T005@a068d505 [US1] Complete bounded questions, evidence selection, replies, and successive receiving in `src/extensions/dude/lib/a2a.mjs` with matching cases in `src/extensions/dude/a2a.test.mjs`.
    deps: T001@a068d101, T003@a068d303, T004@a068d404
    Owner: Coder.
    Scope: Resolve approved regular-file snapshots and shareable source labels; render exact excerpts, fields, the plan's three checkable fact operations, and fixed notices from approved bytes. Apply the same egress boundary to question text. Build the asking-side envelope with adapter-owned outcome, TLS identity, and the plan's exact fixed notice. Keep peer bytes only in data fields, never interpreted as paths, URLs, commands, tool calls, or approvals. The handler performs no state writes and logs metadata only; received bytes cannot become question text. Preserve provenance and evidence limitations; exclude credentials, path escapes, URL fetches, arbitrary prose, and executable expressions. Rearm serving by a normal receive call within the active interval, without per-question approval or session.send.
    Verify: Use preapproved fixtures to prove exact known-evidence answers, missing/partial/stale/conflicting/unverified cases, source changes, unsupported free-form requests, and successive exchanges with no human response. A permitted quote containing instructions must arrive byte-exact in its data field with the fixed notice and cause zero handler changes to files, scope, approvals, filters, connection configuration, or workflow. Assert no new project verification, no arbitrary model text egress, no answer bytes in handler logs, and no workflow-state mutation.
    Trace: Plan Sharing Scope and Bounded Evidence, Asking-side Answer Handling, Phase 2; US1; FR-001, FR-006, FR-008 through FR-014, FR-026 through FR-028; SC-001, SC-002, SC-003, SC-007.

- [ ] T006@a068d606 [US1] Independently verify US1's observable sequence against realistic offline fixtures in `src/extensions/dude/a2a.test.mjs` and `src/extensions/dude/a2a-transport.test.mjs`.
    deps: T001@a068d101, T005@a068d505
    Owner: Tester in a separate verification context.
    Scope: Use an already-approved scope and a fixed evidence source so the story does not depend on the approval UX. Cover all four answer forms, source/observation provenance, absent and limited evidence, repeated questions, unavailable gaps, and an operator who is absent or working elsewhere.
    Verify: Report every US1 acceptance result, zero per-payload prompts, zero project actions, and unchanged task/ownership records. Label adapter evidence as offline; it does not satisfy SC-001 real-session interoperability. No live session or connection without separate user authorization.
    Trace: Plan Phase 2 and Guardrail Check; US1; FR-001, FR-006, FR-011 through FR-014, FR-026 through FR-028; SC-001, SC-003, SC-007.

## Phase 3: US2 - Control Disclosure

- [ ] T007@a068d707 [US2] Independently verify connection approval and disclosure/authority boundaries in `src/extensions/dude/a2a.test.mjs` and `src/extensions/dude/a2a-transport.test.mjs`.
    deps: T001@a068d101, T005@a068d505
    Owner: Tester; production defects return to the coordinator for the implementation owner.
    Scope: Use scope and identity fixtures without requiring a useful evidence answer. Cover no approval, expansion without approval, cross-connection/session access, wrong/missing certificates, missing encryption, resource/path/label escape, secret-bearing sources, arbitrary outbound question/answer prose, stale approval, and direct/indirect mutation attempts. Split instruction injection by receiver: on the serving side, instructions in a peer question or approved source cause no prohibited action under the allowlist and replies render only approved bytes; on the asking side, deliver a permitted in-scope quote directing file edits, a build, scope approval/expansion, permission changes, work-verification claims, or credential disclosure. Exercise the approved interaction's refusal/error transitions.
    Verify: Report all US2 cases with zero unauthorized disclosure or effects and unchanged workflow state. The asking quote is delivered byte-exact with the fixed notice and no handler state changes. Refuse scope expansion supplied only through tool arguments without a local human-input event. Follow-up questions use only approved forms and cannot carry received bytes. Compare delivery of the same bytes from a local file and a peer answer: files, scope, approvals, filters, connection settings, and workflow remain identical before and after each delivery. Model compliance or refusal, and identical later model decisions, are not the measured result. Check both same-computer and LAN configuration paths offline; real transport/host enforcement remains for separately authorized T011.
    Trace: Plan Sharing Scope, Asking-side Answer Handling, Connection and Trust, Phase 3; US2; FR-002 through FR-011, FR-014, FR-029; SC-002, SC-008.

## Phase 4: US3 - Stop Safely

- [ ] T008@a068d808 [US3] Complete interruption, expiry, shutdown, and uncertainty handling in `src/extensions/dude/lib/a2a.mjs`, `src/extensions/dude/lib/a2a-transport.mjs`, and their tests.
    deps: T001@a068d101, T005@a068d505
    Owner: Coder.
    Scope: Cover root abort, unrelated/pending input, session/workspace/provider changes or loss, scope revocation/expiry, control changes, deadlines, and transport loss. On the serving side, revoke the binding before further access or unsent replies, stop continuation before relaxing controls, and consume replies once. On the asking side, the exchange exists only inside the `ask` invocation: root abort, cancel, deadline, transport loss, and scope revocation return fixed outcomes, and bytes arriving afterward are dropped. No retry, reconnect restoration, substitute session, or deferred delivery.
    Verify: Deterministic race fixtures prove before/after-receive invalidation, reply-after-normal-receive, safe provider loss, duplicate/cross-peer rejection, timeout cleanup, and honest uncertain delivery. A late asking-side answer after abort or timeout is never delivered later; disconnect after sending reports uncertain delivery with no retry. Do not treat a dead provider's cleanup callback as proof of serving-host safety. Live checks require separate user authorization.
    Trace: Plan Asking-side Answer Handling; Lifetime, Capacity, and Failure; Phase 4; US3; FR-009, FR-010, FR-015 through FR-023, FR-028; SC-002, SC-004, SC-005.

- [ ] T009@a068d909 [US3] Independently verify the US3 race and outcome matrix in `src/extensions/dude/a2a.test.mjs` and `src/extensions/dude/a2a-transport.test.mjs` against Q0's recorded contract.
    deps: T001@a068d101, T008@a068d808
    Owner: Tester.
    Scope: Use a fixed approved answer to isolate lifecycle behavior. Test every serving invalidator before/after question acceptance and before reply emission, ordinary receive completion, no waiter, concurrent arrival, stale scope, duplicate reply, provider disappearance, and ambiguous delivery. Add the asking call to the race matrix: cancel, deadline, revocation, and transport loss before sending, after sending, and after response arrival but before the tool result returns. Include late and unsolicited responses.
    Verify: Report all US3 cases, no unsent reply or further access after invalidation, no serving continuation during relaxed controls, and zero replay/queue/substitution. Verify that no peer bytes reach the model after the `ask` call ends, including a late response that could otherwise enter a later turn. Separate simulated event evidence from host-only gaps; route the latter to separately authorized T011.
    Trace: Plan Phase 0, Asking-side Answer Handling, and Phase 4; US3; FR-009, FR-010, FR-015 through FR-024; SC-002, SC-004 through SC-006.

## Phase 5: Polish and Independent Acceptance

- [ ] T010@a068da10 [Shared] Deliver the pinned runtime and operator guidance through `scripts/dude-a2a/`, `src/extensions/dude/lib/a2a-runtime.mjs` and dependency notices, `src/skills/dude-a2a/SKILL.md`, `docs/agent-to-agent-communication.md`, and the existing build/release checks.
    deps: T001@a068d101, T006@a068d606, T007@a068d707, T009@a068d909
    Owner: Coder for packaging; Skill Smith for skill prose; coordinator for source rebuild; Tester for fresh distribution evidence.
    Scope: Document exact current support evidence, reserved serving, approved snapshots, automatic in-scope exchanges, LAN/mutual-TLS setup, operator-owned secrets, safe stop, and unsupported internet/VPN/free-form/concurrent-work cases. Use `scripts/build-dev.mjs`; verify release inclusion of the lazy runtime/notices and exclusion of tests/node_modules. No generated hand edits, optional-pack runtime reads, model-map edits, or agent-profile changes.
    Guidance: Answers are untrusted quoted data; in sessions with blanket tool approval or autonomous Work, they carry the same embedded-instruction risk as any file or web page the agent reads.
    Verify: Run extension tests, build/release checks, and `node .github/skills/dude-lint/lint.mjs .` through authorized execution. Check absent-pack/default-off behavior and Canvas/Needs You regressions. Report actual results, not anticipated passes. Do not claim live support before T011 supplies evidence.
    Trace: Plan Source Layout, Guardrail Check, Phase 5; all stories; FR-014, FR-024 through FR-029; SC-006 plus regression coverage for SC-001 through SC-008.

- [ ] T011@a068db11 [Shared] Qualify the complete host/peer combination and perform real same-computer and same-LAN acceptance using the delivered extension, `docs/agent-to-agent-communication.md`, and existing verification evidence channels.
    deps: T001@a068d101, T010@a068da10
    Owner: Tester; coordinator obtains permission and routes any host-specific operator steps.
    Authorization: Separate user authorization required for the exact real sessions, connections, evidence scope, certificates, and second computer. No authorization is implied by prior product answers, Q0 GO, or completed offline tests.
    Scope: Recheck current host identity and protections before admission; establish authenticated/encrypted recipient binding and bounded disclosure with test evidence before project content. Exercise all stories on one computer and two computers on the same LAN, including successive questions while the operator is away, all lifetime invalidators, wrong-peer/refused transport, and loss/uncertainty cases. Deliver a permitted quote containing instructions to the asking side. Perform automated interaction coverage first; request human observation only for host-specific gaps.
    Verify: Record observed identities, approval scopes, revisions, results, and safe teardown without secrets. For the instruction-bearing quote, record that scope, approvals, and tools remain unchanged; model compliance is not the criterion. Record whether the desktop app displays the tool result and provenance for US1 AS2, not as a safety control. Prove SC-001 through SC-008 for the actual combination. Missing authorization or evidence stops; a failed combination remains unavailable. Update only the tested support statements in the operator documentation through the authorized owner.
    Trace: Plan Phase 0 gate separation, Phases 2 through 5; all US/FR/SC.

- [ ] T012@a068dc12 [Shared] Independently assess the implementation, approved interaction, distribution, and offline/live evidence against `.dude/specs/068-agent-to-agent-communication/spec.md` and `plan.md`.
    deps: T001@a068d101, T011@a068db11
    Owner: Reviewer, read-only and independent of implementation/test execution.
    Scope: Judge every requirement and success criterion, recorded Q0 GO, current combination qualification, disclosure and whole-session enforcement, bounded answers, LAN protection, preserved core behavior, and excluded authority. Check that no permanent-unavailable fallback is presented as successful delivery.
    Verify: Return the existing review verdict with requirement-linked findings and evidence limits. Missing checks go to their normal owners; this task grants no testing, fixes, live execution, publication, import, task-state changes, or closure authority.
    Trace: Plan Phase 5 and Traceability; all US/FR/SC.

## Execution Notes

No parallel-candidate flags are proposed because the implementation and tests
share extension files and safety contracts. Dependency ordering is deliberate:
Q0 first, approved interaction before presentation, foundations before stories,
and complete offline coverage before real acceptance.

The coordinator records future task transitions and evidence using the existing
lane. This file proposes no reconciliation event, execution history, board,
tracker import, Work resumption, or completion. All listed commands and checks
are future work; none ran during definition.
