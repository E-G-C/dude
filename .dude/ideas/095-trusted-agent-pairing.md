---
title: Trusted agent pairing
slug: trusted-agent-pairing
status: defined
spec_path: .dude/specs/095-trusted-agent-pairing/spec.md
work_intent: create
work_domain: code
---

# Idea: Trusted agent pairing

## Idea

During a live two-Dude qualification run, the user asked:

> why this interchange does not happen automatically? I mean in a real world scenario when two dudes talk to each other there should be an initial handshake and after that the communication happens transparent for the users while the agents talk

Later:

> knowing that I want this implemented why do I need to consent the interaction? why can't this run by itself automatically?

The coordinator offered either a relaunch with both typed activation approvals
or this second option:

> If you want Dudes to connect without a typed approval each time, that is a feature change. Say so and I'll write it up as a new feature idea.

The user sent `launch`, then `2` forty-seven seconds later. The coordinator
treated `2` as the decision to capture that feature change.

## Open Questions

1. What should the one-time handshake approve: which peer identity (for example, a pinned certificate) and project, which conversations (read-only number advice or broader questions), what may be shared, and what expiry or usage limits?
   Answer:
2. Should both owners approve the pairing, and must worker effects still receive their own local approval under FR-009?
   Answer:
3. Should pairing last only for this session, survive sessions on one machine, or be saved with the project, and how should an owner revoke it?
   Answer:
4. What should owners see while agents talk and afterward: nothing unless asked, a status line, or a transcript?
   Answer:
5. Should feature 089's live T008 wait for this change or finish under today's typed-approval rule?
   Answer:

## Assumptions

None were supplied.

<!-- dude:managed:start -->
## Defined outcome

The [definition](../specs/095-trusted-agent-pairing/spec.md) adds opt-in standing
approval for an exact existing A2A profile. Each owner reviews the complete
native proposal and supplies the existing typed local approval once. Later
matching activations, including in fresh local sessions, need no typed approval.
Sharing, commands, and worker effects remain separately disclosed scopes.
Pairing records stay outside repositories; revocation blocks later use.

The spec records Q1-Q5 as Ship-authorized definition-owner dispositions, not
user answers. The empty answers and user assumptions above remain unchanged.
The package grants no live approval, worker permission, or native qualification.

## Existing implementation baseline

The current implementation starts each ask or serve activation with
`dude_a2a_propose`, followed by `dude a2a approve <code>` for the exact current
proposal. Approval is single-use and activation is session-bound. Model/tool or
peer text cannot supply approval; root-message attribution is not proof of
human authorship. In-scope conversations within a valid activation already
need no per-payload prompts.
Sources: [provider](../../src/extensions/dude/lib/a2a.mjs),
[conversation code](../../src/extensions/dude/lib/a2a-collaboration.mjs),
and [operator guide](../../docs/agent-to-agent-communication.md#approve).

Feature 095 explicitly amends
[068's approval contract](../specs/068-agent-to-agent-communication/spec.md#complete-visible-proposal-before-local-approval)
for paired activation and
[089's FR-009](../specs/089-feature-number-reservations/spec.md#functional-requirements)
for an explicitly approved standing worker scope. It preserves complete first
review, independent local authority, ordinary one-use approval, and 089's
separate native-consent requirement. Neither older package is rewritten.

## Captured qualification context

The capture recorded runs `a99991c3-4986-4edb-8242-a5b5076644ff` and
`14fa865e-2487-467e-b6f0-a6abf435f716`: their pre-activation checks passed,
then they stopped `approval_input_refused` because no B approval line arrived
within the five-minute bound. No entered line was refused.
Source: [recorded consent change and live runs](089-feature-number-reservations.md#coordinator-log).

Feature 089's [T008](../specs/089-feature-number-reservations/tasks.md#phase-10-native-qualification-and-delivery)
remains separate work under its existing typed-handshake and native-consent
contract. This definition neither changes that task nor makes it a prerequisite.
Automated acceptance for 095 does not pass or replace a native qualification.

## Related drafts

- [Nonblocking agent conversations](092-nonblocking-agent-conversations.md): nonblocking exchanges and live/retained inspection.
- [Agent coordination announcements](090-agent-coordination-announcements.md): bounded coordination broadcasts.
- [Durable agent supervision](093-durable-agent-supervision.md): optional durable supervision and service evaluation.

Their broader capabilities are outside this definition, not prerequisites.
<!-- dude:managed:end -->

## Coordinator Log

- 2026-11-11T03:53:53Z - brainstorm: First-staged trusted-agent-pairing from the user's chat request received at 2026-11-11T03:50:58Z for coordinator publication. Allocated no lifecycle number, created no definition, tasks, or implementation, and changed no existing approval rule.
- 2026-11-11T20:49:37Z - define: Staged the first Lightweight definition at .dude/specs/095-trusted-agent-pairing/spec.md with exact-scope, machine-local standing pairing and five open task units. Recorded Ship-authorized definition-owner dispositions in the spec without filling user answers or assumptions. Preserved 068/089 packages and 089 T008; no implementation, native consent, publication, lint result, or task completion is asserted.
- 2026-11-11T21:24:19Z - work: Claimed T001@k8m2q7v4 for the user-authorized autonomous Work invocation; implementation has not started.
- 2026-11-11T22:57:24Z - close: T001@k8m2q7v4 settled through the autonomous Work adapter on attempt 2 after the independent Code Reviewer rejected attempt 1 for test-only-provider-capability (a read-only bindingDigests accessor on the production provider used only by tests); the finding remains in retained history. Attempt 2, by a different reviser, removed the accessor and moved the stable pairing identity into the exported pairingDigest function that bind() calls in production, with digests byte-identical to attempt 1 on four fixtures, and rewrote the digest regressions against real parsed inputs. Independent verification passed a2a-pairing 12/12, a2a 82/82, a2a-verify 27/27, a2a-collaboration 62/62, and the LF and diff-check row; the independent Code Reviewer accepted with no findings. POSIX owner-only mode assertions do not run on Windows. The generated .github copies remain for T005.
- 2026-11-11T22:57:25Z - work: Claimed T002@r5c9n3h6 for the user-authorized autonomous Work invocation; implementation has not started.
- 2026-11-11T23:40:58Z - close: T002@r5c9n3h6 settled through the autonomous Work adapter on attempt 1. Opted-in profiles (pairing: true) now get a complete enrollment proposal with PAIRING disclosures (standing reuse, per-activation counters, unextended expiries, the external record path, stop-then-delete revocation, and host and file trust limits) within the unchanged 4,490-byte cap; only the existing exact dude a2a approve code saves the record, after queue settling and the binding recheck and before transport starts, with no one-use fallback when saving fails and an honest paired-but-inactive report when startup fails afterwards. Ordinary profiles are byte-identical, and pairing with a worker qualification is refused. Independent verification passed a2a 94/94, a2a-pairing 12/12, a2a-collaboration 64/64, a2a-verify 27/27, and the LF and diff-check row; the independent Code Reviewer accepted with no findings. Noted risk: an existing-sign-in worker with pairing measured 4,561 bytes in a scratch fixture and would be refused as oversized. Automatic activation and revocation of live use remain for T003.
- 2026-11-11T23:40:59Z - work: Claimed T003@s4w8d2p7 for the user-authorized autonomous Work invocation; implementation has not started.
- 2026-11-12T00:29:09Z - close: T003@s4w8d2p7 settled through the autonomous Work adapter on attempt 1. A fresh dude_a2a_propose request for an opted-in profile whose stored record equals the stable binding digest, after every existing eligibility and size check, now starts a new session-bound activation with no code or typed approval; the required local notice must be delivered before anything becomes admissible, and the result reports active only for a live, current activation. The record is reread before transport, after each startup await, before going live, and at every admissible boundary, so deletion, damage, mismatch, or an unsafe location ends authority at the next boundary (pairing_revoked); stop keeps the record and starts nothing. Worker permits are fresh per activation and only for saved WORKER scope; tool descriptions and activation text explain both authority sources. Independent verification passed a2a 100/100, a2a-pairing 12/12, a2a-verify 29/29, a2a-collaboration 68/68, a2a-collaboration-tls 5/5, a2a-transport 56/56, and the LF and diff-check row; the independent Code Reviewer accepted with no findings. By design, anything that can call dude_a2a_propose can start a paired activation within the stored scope, and the notice gives visibility, not proof the owner saw it; a paired existing-sign-in worker proposal measured 4,673 bytes and is refused by the 4,490-byte cap.
- 2026-11-12T00:29:10Z - work: Claimed T004@t6j3b9f5 for the user-authorized autonomous Work invocation; implementation has not started.
- 2026-11-12T01:25:29Z - close: T004@t6j3b9f5 settled through the autonomous Work adapter on attempt 1 with no source fix; the new real-TLS checks exposed no pairing defect. Five new tests over real mutual TLS between independent processes show each owner enrolling once and two later automatic activations and conversations (one after recreating both processes, sessions, and providers) with approval prompts and inputs staying at one per side, exactly one notice per automatic activation, all-new permit, operation, and exchange IDs, and intact retained transcripts; plus one-sided pairing, record deletion ending a held worker and forcing re-enrollment, no replay after stops, and impostor peers refused by the real pin checks while the approved configs and records stay valid. Independent verification passed a2a-pairing 12/12, a2a 100/100, a2a-collaboration 68/68, a2a-collaboration-tls 10/10, a2a-transport 56/56, a2a-peer-worker 362/362, a2a-transcript 10/10, the unchanged controlled qualifier tests qualify-collaboration 22/22 and native-collaboration 122/122, and the LF and diff-check row; the independent Code Reviewer accepted with no findings. Real host, model, account, LAN, and non-Windows behavior remain unexercised, as the spec defers.
- 2026-11-12T01:25:32Z - work: Claimed T005@v7g2x4m8 for the user-authorized autonomous Work invocation; implementation has not started.
- 2026-11-12T02:14:38Z - close: T005@v7g2x4m8 settled through the autonomous Work adapter on attempt 1. The operator guide now documents the pairing option and its qualification refusal, first typed enrollment, zero-prompt reuse with the required notice, exact-match drift, the external record location, stop versus deletion, per-activation allowances, the local trust limit, and deferred native qualification, with fresh-approval and propose-never-activates statements scoped to unpaired profiles and the reviewed 089 text preserved. The build inventories include lib/a2a-pairing.mjs and its test, a released-runtime subtest covers enrollment and code-free reuse, and the two generated .github runtime files were produced in a disposable build copy and are byte-identical to src with no other .github drift. Independent verification passed build-dev 27 of 28 (one pre-existing Windows symlink skip), build-release 23/23, a2a-pairing 12/12, a2a 100/100, lint with 0 failures, and the LF, parity, and diff-check row; the independent Code Reviewer accepted with no findings.
- 2026-11-12T02:14:38Z - close: Feature 095 trusted-agent-pairing is complete under the explicit Ship invocation: all five tasks (T001@k8m2q7v4, T002@r5c9n3h6, T003@s4w8d2p7, T004@t6j3b9f5, T005@v7g2x4m8) are done, each with independent verification and an independent Code Reviewer acceptance; one review rejection (T001 attempt 1, test-only-provider-capability) was fixed by a different reviser and remains in retained history. Native-host qualification of pairing remains deferred and not passed, as the spec states; feature 089 and its T008 are unchanged. Known limits: paired existing-sign-in worker proposals exceed the 4,490-byte cap, any caller of dude_a2a_propose can start a paired activation within the stored scope, and an unrestricted local writer can forge or remove a grant. One advisory Rubber Duck retrospective was recorded in the package retrospective.md. Nothing was committed.
