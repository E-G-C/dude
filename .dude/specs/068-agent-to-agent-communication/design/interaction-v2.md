# Native proposal-result interaction v2

> **PROPOSED, UNAPPROVED, INERT MOCK.** This is a plain-text interaction proposal, not a host screenshot or executed evidence. Every `/MOCK/`, `C:\MOCK\`, `<mock-...>`, command definition, and dialogue below is illustrative. `MOCK-B-NOT-LIVE`, `MOCK-A-NOT-LIVE`, and `MOCK-SHARE-NOT-LIVE` are deliberately invalid approval codes. No withdrawn runtime code appears here. Nothing in this file connects, approves, runs verification, or resumes Work.

**Canonical preview after coordinated publication**: `.dude/specs/068-agent-to-agent-communication/design/interaction-v2.md`.

The whole owner-reviewed proposal comes from the adapter in the native result of the proposed `dude_a2a_propose` tool. An assistant summary is not the proposal. The owner inspects the native result, then types or pastes its exact current approval command in that same session.

This follows the familiar pattern of inspecting an operation's arguments and effects before explicitly approving it. No custom button, dialog, logo, color, typography, or Canvas surface is proposed. Host-owned opening/expansion and scrolling are **provisional interactions to qualify**, not tested capabilities. There is no auto-expand or read callback. If the custom detail is unavailable, incomplete, or inaccessible, stop before approval; do not use a private-log relay or model paraphrase.

## 1. B requests a proposal, without enabling anything

Scenes alternate between B on Mac and A on Windows. They are separate existing sessions, not a combined screen. The example catalog below contains exactly two illustrative commands so their complete definitions can be inspected; these are not new product operations or configured targets.

**B owner, ordinary chat request**

> Show the local proposal for `/MOCK/operator/b-config.json`, profile `demo-b-serve`. Do not approve it, connect, or run anything.

**B model's proposed tool call**

```json
{
  "configPath": "/MOCK/operator/b-config.json",
  "profileId": "demo-b-serve"
}
```

Tool name: `dude_a2a_propose`. These are its only arguments. A boolean, approval code, or caller-supplied proposal body is not an accepted argument.

**Host-owned step, proposed**

Open the native result detail for that `dude_a2a_propose` call and inspect the entire returned body. The mock does not invent the host's control label, number of clicks, expansion default, keyboard shortcut, or maximum display size.

**Expanded native tool result: complete command-enabled B example**

The text below is the proposed complete result body, not a condensed assistant message. In the implementation it is adapter text in `textResultForLlm`; `resultType: success` means only that a proposal was prepared.

```text
Proposal only: nothing is activated. Review this entire native tool result before local approval.
Proposal: B (Mac) serve
Config: /MOCK/operator/b-config.json; digest sha256:<mock-B-config-digest>; profile demo-b-serve
Local: <mock-B-session-id>; provider <mock-B-provider-generation>; workspace /MOCK/b/workspace
Peer: A (Windows); client address <mock-A-private-IP>; SHA-256 <mock-A-certificate-pin>
Listen: https://<mock-B-private-IP>:<mock-B-port>/
SHARING: question-specific conclusions, approved evidence excerpts, and shareable source/run provenance; excludes credentials, unrelated project content, private keys, and fixed environment values
Purpose: confirm a claim about B's local evidence; evidence roots /MOCK/b/workspace/evidence
Sharing limits: <mock-contentBytes> bytes per message; validity until activation ends; repeat use every in-scope exchange while active
COMMANDS: unit-check, evidence-check; separate from SHARING
Command: unit-check
Executable: /MOCK/bin/node
Argv: ["/MOCK/b/workspace/scripts/verify.mjs","--suite","{suite}"]; parameters suite one of ["unit","integration"]
Cwd: /MOCK/b/workspace
Environment names: inherit PATH; fixed CI; values hidden
Run limits: <mock-unit-timeoutMs> ms; <mock-unit-outputBytes> bytes per stream
Effects/resources: executes project verification code, consumes CPU and memory, and may write reports under /MOCK/b/workspace/out/unit; no broader effects approved, not guaranteed
Command: evidence-check
Executable: /MOCK/bin/node
Argv: ["/MOCK/b/workspace/scripts/check-records.mjs","{record}"]; parameters record matching ^[A-Za-z0-9_-]{1,24}$
Cwd: /MOCK/b/workspace
Environment names: inherit PATH; fixed none; values hidden
Run limits: <mock-evidence-timeoutMs> ms; <mock-evidence-outputBytes> bytes per stream
Effects/resources: executes project checking code, reads local records, consumes CPU and memory, and may write a report under /MOCK/b/workspace/out/evidence; no broader effects approved, not guaranteed
Revision: current worktree; explicitly allows dirty current files and unknown revision when unobservable; never substituted for a pin; no default
Git: /MOCK/bin/git
Git observation policy: before/after HEAD and tracked/untracked status probes when available; ignored files and transient changes can escape observation. No revision probe has run to create this proposal.
Command validity/repeat use: until activation ends; every in-scope run while active
Risks: Ordinary host permissions are not global isolation. Peer/source text can persuade models or cause disclosure. Host-approved injection can spoof root approval. Revision probes miss ignored/transient changes; project code can exceed declared effects. Host prompts remain unchanged. Stop does not guarantee termination or recall disclosure.
Result exposure: this full proposal and its code are model-readable data, not approval. Private keys and fixed environment values are omitted; command output is not automatically redacted and may contain sensitive information. Commands never widen SHARING.
Review: if any native result detail is hidden, truncated, or inaccessible, do not approve. An assistant summary or private-log relay cannot replace it.
Lifetime: this result is a snapshot, not live status. Normal tool completion preserves an otherwise valid pending proposal. Stop, cancellation, expiry, replacement, intervening/queued input, or changed session/provider/workspace/config/TLS bindings invalidates it. Historical text may remain visible.
Approval: dude a2a approve MOCK-B-NOT-LIVE; current matching proposal/context only, consumed once
Next: after complete review, type or paste the exact current approval as the next eligible local root input. To decline or cancel, use dude a2a stop.
```

The worktree policy above is one explicit illustrative policy, not the default. When the owner's actual `verification.revision` is a commit pin, replace that policy line with:

```text
Revision: commit <mock-full-pinned-commit>; matching commit and clean tracked/untracked files required; ignored files unchecked; missing observations refuse; no default
```

With no configured Git, its line reads `Git: not configured; revision observations unavailable`. An unavailable observation cannot satisfy a commit pin. Showing either policy does not run the Git probes or prove the workspace matches it. Parameter templates disclose every permitted value/pattern, not a claimed command execution.

**Optional B assistant orientation, not an approval surface**

> Review the complete `dude_a2a_propose` result, including both COMMANDS and SHARING. I have not approved it. If you cannot inspect the whole result, do not approve.

The assistant must not replace the native detail with a shortened proposal or retrieve private event logs to relay it.

## 2. B approves only that reviewed, still-current proposal

**B owner, next eligible local chat input, inert illustration**

```text
dude a2a approve MOCK-B-NOT-LIVE
```

In real use, this line must contain the exact fresh code from the complete current native result, not the invalid mock code. The approval remains local root input with the existing attribution, queue, identity, drift, expiry, and one-use checks. Neither the preceding model tool call nor its success result supplies consent.

This accepts the separately stated sharing and command scopes only if they still match. It does not approve excluded disclosure, arbitrary commands, implementation delegation, or task closure. Host permission prompts remain unchanged.

The adapter's existing activation notice would describe active role/profile and current availability. **Its native log visibility is separately unqualified**; this mock does not add an activation card, progress stream, status tool, callback, or automatic change to the old proposal card. Failure to qualify those required notices remains a support gap.

## 3. A separately reviews its own complete asking proposal

**A owner, ordinary chat request**

> Show the local proposal for `C:\MOCK\operator\a-config.json`, profile `demo-a-ask`. Do not approve it or send a question.

**A model's proposed `dude_a2a_propose` call**

```json
{
  "configPath": "C:\\MOCK\\operator\\a-config.json",
  "profileId": "demo-a-ask"
}
```

**Host-owned opening/expansion, proposed**: inspect this call's complete native result.

```text
Proposal only: nothing is activated. Review this entire native tool result before local approval.
Proposal: A (Windows) ask
Config: C:\MOCK\operator\a-config.json; digest sha256:<mock-A-config-digest>; profile demo-a-ask
Local: <mock-A-session-id>; provider <mock-A-provider-generation>; workspace C:\MOCK\a\workspace
Peer: B (Mac); https://<mock-B-private-IP>:<mock-B-port>/; SHA-256 <mock-B-certificate-pin>
SHARING: confirmation questions and the approved revision/environment details needed to answer them; excludes credentials and unrelated project content
Purpose: ask whether B's evidence supports a particular claim
Limits: <mock-contentBytes> bytes per message; <mock-askTimeoutMs> ms ask timeout
Validity/repeat use: until activation ends; every in-scope exchange while active
Risks: No global isolation; model persuasion/disclosure and injected-root approval spoofing remain possible. Host prompts stay unchanged; disclosure cannot be recalled.
Result exposure: this full proposal and its code are model-readable data, not approval. Private keys and fixed environment values are omitted. This asking profile grants no local verification operation.
Review: if any native result detail is hidden, truncated, or inaccessible, do not approve. An assistant summary or private-log relay cannot replace it.
Lifetime: this result is a snapshot, not live status. Normal tool completion preserves an otherwise valid pending proposal. Stop, cancellation, expiry, replacement, intervening/queued input, or changed session/provider/workspace/config/TLS bindings invalidates it. Historical text may remain visible.
Approval: dude a2a approve MOCK-A-NOT-LIVE; this current local proposal only, consumed once
Next: after complete review, type or paste the exact current approval as the next eligible local root input. To decline or cancel, use dude a2a stop.
```

A has no listener or command catalog grant in this profile. It cannot grant B operation authority through its own approval.

**A owner, next eligible local input, inert illustration**

```text
dude a2a approve MOCK-A-NOT-LIVE
```

Approval is still subject to all current local checks. A question is a later ordinary operation under the approved sharing scope, not an effect of creating the proposal.

## 4. Complete share-only B case

This is the no-command state of the same direction, not a second design option. It makes the absence of B-owner command approval explicit. For a `demo-b-share` profile requested through the same closed proposal tool:

```text
Proposal only: nothing is activated. Review this entire native tool result before local approval.
Proposal: B (Mac) serve
Config: /MOCK/operator/b-config.json; digest sha256:<mock-B-config-digest>; profile demo-b-share
Local: <mock-B-session-id>; provider <mock-B-provider-generation>; workspace /MOCK/b/workspace
Peer: A (Windows); client address <mock-A-private-IP>; SHA-256 <mock-A-certificate-pin>
Listen: https://<mock-B-private-IP>:<mock-B-port>/
SHARING: question-specific conclusions, approved existing evidence excerpts, and shareable source provenance; excludes credentials, unrelated project content, private keys, and fixed environment values
Purpose: interpret existing local evidence; evidence roots /MOCK/b/workspace/evidence
Sharing limits: <mock-contentBytes> bytes per message; validity until activation ends; repeat use every in-scope exchange while active
COMMANDS: none approved; separate from SHARING
Risks: Ordinary host permissions are not global isolation. Peer/source text can persuade models or cause disclosure. Host-approved injection can spoof root approval. Revision probes miss ignored/transient changes; project code can exceed declared effects. Host prompts remain unchanged. Stop does not guarantee termination or recall disclosure.
Result exposure: this full proposal and its code are model-readable data, not approval. Private keys and fixed environment values are omitted; command output is not automatically redacted. No command is approved by this proposal.
Review: if any native result detail is hidden, truncated, or inaccessible, do not approve. An assistant summary or private-log relay cannot replace it.
Lifetime: this result is a snapshot, not live status. Normal tool completion preserves an otherwise valid pending proposal. Stop, cancellation, expiry, replacement, intervening/queued input, or changed session/provider/workspace/config/TLS bindings invalidates it. Historical text may remain visible.
Approval: dude a2a approve MOCK-SHARE-NOT-LIVE; current matching proposal/context only, consumed once
Next: after complete review, type or paste the exact current approval as the next eligible local root input. To decline or cancel, use dude a2a stop.
```

There are no command definitions, revision policy, or command-validity lines because this profile has no verification grant. General serving-risk text grants none. If an actual profile supplies expiry or finite repeat coverage, the renderer shows those actual values instead of `until activation ends` / `every in-scope ...`.

## 5. Result lifetime and refusal states

No historical card is promised to change, disappear, acquire a badge, or disable a command. The fixed Lifetime/Review text in every successful result is needed because the owner may still see an obsolete proposal. Actual eligibility comes from the adapter's current binding checks.

| Condition | Adapter behavior | Owner-visible meaning and next action |
| --- | --- | --- |
| Normal successful return, including the SDK aborting the completed invocation signal | Keep the otherwise-valid pending proposal. No activation. | Read the entire native detail, then submit its exact approve text as the next eligible input, or stop. Ordinary completion alone has not cancelled it. |
| Configuration/path/profile validation fails | Return a bounded failure; no approvable proposal from the attempt. In an eligible replacement attempt, the earlier pending proposal has been replaced, not restored. | Native failure text explains the local reason. Correct the local input and request a new proposal; do not reuse an older visible command. |
| Invalid invocation/session/provider/workspace identity | Refuse without changing another context's state. | No current proposal is created for this caller. Use the intended existing session; no substitute session or takeover. |
| Another activation is active or starting | Refuse a new proposal and leave activation unchanged. | Use `dude a2a stop` before requesting a replacement. The tool does not silently reconfigure active work. |
| A new eligible proposal attempt replaces an older one | Only the new complete, valid result may be approved. | Earlier result text remains historical. Review the new full result; never copy the old code. |
| Stop or genuine root cancellation | Withdraw pending eligibility; end applicable communication. | `dude a2a stop` is a typed authority-reducing action, not an approval button. A notice may be available through the existing log, whose display still needs qualification. Old text supplies no permission. |
| Expiry, changed config/TLS/peer/profile, changed session/provider/workspace, or context loss | Refuse stale approval through existing binding/validity checks. | Even a fully visible old result is no longer approvable. Request and review a fresh proposal only when the owner wants to continue. |
| Intervening root input or an opaque pending queue | Invalidate pending eligibility under the existing input guards. | A follow-up chat message is not a way to preserve or broaden approval. Review a fresh result after resolving the interruption. |
| Approval already consumed, wrong code, peer-supplied approval, or ignored attributed candidate | No new activation authority. | No replay, approval boolean, history restoration, or inferred assent. A valid current local input is required. |
| Tool is unavailable, the host cannot expose the entire custom result, or text is truncated/inaccessible | Proposal display is unqualified. The adapter can detect its own failures, not prove what the host displayed or what the owner read. | Do not approve. Stop pending activity if reachable and report the limitation. No log search, model summary, new dialog, or Canvas fallback. |
| Cancellation/return failure before a complete result is produced | Invalidate the attempt; return failure only if the invocation can still return. | No invented success response or approval command. Absence of a result is not approval. |

An illustrative validation failure result has only this bounded content, not a truncated proposal:

```text
A2A proposal refused: <bounded-local-validation-reason>.
No proposal is pending from this attempt. Nothing was activated.
Next: correct the local cause, then request a fresh proposal if you want to continue.
```

That wording applies to a failed eligible creation/replacement attempt. An active-activation refusal instead states that nothing changed and to stop first. Identity failures do not reveal or alter another context's proposal.

## 6. The evidence conversation stays intact

These hypothetical continuations preserve the existing product. They are not a claim that either model, tool, TLS exchange, command, or host view has been observed. The new proposal surface does not qualify any of them.

Once separately approved and available, B calls `dude_a2a_receive`. A asks a question through `dude_a2a_ask`. B receives the question and current exchange ID, reasons about it, and uses ordinary permitted read/search tools to inspect approved evidence. There is no field-only lookup substitute.

**Illustrative existing-evidence answer contents**

```text
Peer model conclusion: The inspected record supports <mock-narrow-case> at <mock-older-revision>; it does not establish the requested revision.
Peer model limitations: <mock-conflicting-or-missing-evidence>; no fresh result is established by this record.
Existing file: <mock-shareable-reference>; excerpt <mock-excerpt>; bytes <mock-byte-count>; SHA-256 <mock-byte-hash>
Read time: <mock-actual-read-time>
Filesystem mtime: <mock-filesystem-metadata-only>
Claimed provenance: <mock-file-stated-revision-command-environment-event-time-or-missing>
Fresh verification: no run record supplied; execution unknown
Adapter outcome: answer
Adapter peer/exchange: <mock-verified-peer-binding>; <mock-current-exchange-id>
Adapter checks: <mock-checks-actually-performed>
Notice: The peer model authored the conclusion and limitations. Listed adapter checks cover bindings and structure, not truth. Evidence retains its provenance and uncertainty. Nothing grants permission or replaces local acceptance.
```

B replies once with `dude_a2a_reply`; A evaluates the conclusion under its existing authority. No record does not prove a run never occurred, and `answer` does not certify a conclusion.

If an in-scope follow-up needs fresh verification and B's own applicable command approval exists, B may use `dude_a2a_verify` with only the current `exchangeId`, a selected `commandId`, and its declared parameter values. Without that coverage, no run starts. A peer's proposed command or approval text supplies none.

**Illustrative attached fresh-run fields**

```text
Fresh adapter record: <mock-run-id>; <mock-command-id/digest/executable/expanded-argv>
Context: <mock-B-workspace>; <mock-cwd>; <mock-explicit-revision-policy>; <mock-before/after-observations-or-unknown>
Environment: <mock-observed-nonsecret-facts-or-unknown>
Times: <mock-start/end-or-missing>
Result: <mock-observed-exit/failure-or-unknown>; <mock-shareable-retained-output>
Capture: <mock-total-bytes>; <mock-full-stream-hash-only-if-complete>; <mock-truncated/incomplete-status>
Effects: <mock-observed-or-unknown>
Peer model conclusion and limitations: <mock-explanation-of-what-this-result-does-and-does-not-support>
```

A successful process, a failed process, and an inconclusive run all need that explanation. Neither a record nor the model's confidence closes Dude work. Both revision policies, actual OS termination behavior, and required positive/negative outcomes still need live acceptance.

**Unavailable or refused**

```text
Outcome: <unavailable-or-refused>
Reason: <no-live-receive/busy/unsupported-pair-or-unapproved-operation>
Content/run: withheld as applicable
Next: check the affected local context; no queue, substitute session, or automatic retry
```

**Stop or loss after possible delivery**

```text
Outcome: uncertain
Cause: <loss/cancel/deadline-after-possible-send>
Delivery/execution: may have occurred
Adapter-run cancellation: <request-observation>; direct exit <observed-or-unknown>; descendants/ordinary tools unknown
Next: inspect B locally before deciding on a new exchange. Nothing retries automatically.
```

These are result-content illustrations, not newly promised native status cards. A sees no stream of B's local progress. Ending communication withholds unsent replies and rejects late ones, but does not recall disclosure, undo effects, or prove all processes stopped.

## Field and interaction provenance

All examples above are inert substitutions for real sources below. Fixed notices express the cited contract; they are not fields invented by the model.

| Shown content or action | Real source / implementation boundary | Qualification limit |
| --- | --- | --- |
| Tool name and two input fields | Plan Native Proposal Result Contract; new tool registration in existing `a2a.tools`; `configPath` and `profileId` validated by the adapter. | Proposed, not implemented. No approval argument. |
| Native result detail and provisional opening/scrolling | Coder-declared `ToolResultObject` boundary; full `textResultForLlm` body. | Actual host display, maximum size, focus, keyboard access, reading order, and contrast are unqualified. No read callback. |
| Proposal label/role | `profile.label`, `profile.role` rendered by `renderProposal`. A Windows/B Mac roles illustrate US1/US4. | Display names are not identity or support evidence. |
| Config path, digest, profile | Resolved operator-selected external path, hash of exact read config bytes, selected profile ID from `bind`. | The mock digest is a placeholder. The complete live value must be visible. |
| Local session, provider, workspace | Bound `session.sessionId`, provider generation, checked workspace identity. | These may not be supplied or replaced by model prose. |
| Peer address/endpoint, certificate pin, listener | `profile.peer` and applicable `profile.listen`; existing address/fingerprint formatting. | No endpoint here is live. Same-computer and private-LAN authentication/encryption remain required. |
| Sharing, exclusions, purpose, roots | `profile.sharing.allowed/excluded/purpose`, applicable `profile.evidenceRoots`. | Reading or command authority does not widen sharing. |
| Message/ask limits, expiry, repeat coverage | `contentBytes`, `askTimeoutMs`, `expiresAt`, `repeatUse`, with existing validity/repeat formatters. | Symbols are not defaults; host-result size is a separate qualification fact. |
| Every Command/Executable/Argv/parameters/Cwd/Environment names/Run limits/Effects line | Selected `profile.verification.commands` resolved to actual `config.commands` entries; `commandLines`. Both example entries show all these fields. | Show every selected entry, never a summary. Only environment names appear; effects are owner declarations, not a sandbox guarantee. |
| Revision, Git, observation policy, command validity/repeat | `verification.revision/git/expiresAt/repeatUse`; `revisionLine`, existing before/after probe contract, and fixed explanatory text. | No probe runs while proposing. Commit pin and worktree policy never substitute for one another. |
| Proposal-only, risk, result-exposure, review, lifetime, next-action notices | Spec FR-037 and FR-042 through FR-045; plan approval/lifecycle contracts; role-specific fixed risk text. | They disclose ordinary-control, model-code, output, and host-display limits rather than promising enforcement the host does not provide. |
| Exact approval command | Fresh code from the existing nonce/binding and pending proposal, rendered by the adapter; literal eligible local input invokes existing approval checks. | Mock codes are invalid. Seeing, copying, returning, or retaining a code does not confer authority. |
| Stop, replacement, refusal, expiry, cancellation | Existing pending/activation invalidation and safe reasons, with proposed result-lifetime adaptation. | Historical cards need not mutate. Existing notice/log visibility is separately unqualified. |
| Question/exchange and model conclusion/limitations | Existing ask/receive/reply contract and B's actual ordinary model continuation. | Illustrative text, not a claimed model run or truth certification. |
| File/run provenance, outcomes, checks, uncertainty | Existing file reader, verifier records, answer envelope, and lifetime/outcome contract. | Model claims, adapter observations, observed direct exit, and unknown descendants stay distinct. |

## Review boundary

Approval of this exact mock would approve the proposed native-result direction only. It would not prove that a particular host can display it, authorize live sessions/listeners/commands/cleanup, resume stopped Work, or approve task completion. Native tests must inspect the actual custom result at the supported bound and record the intended approval event; all four stories and original live acceptance remain required.

Historical [interaction-v1.md](interaction-v1.md) and its approval remain unchanged for comparison. They do not approve this revision. This file becomes the sole current preview entrypoint only when the complete coordinated redefinition is published; the external stage is not a separate live preview authority.
