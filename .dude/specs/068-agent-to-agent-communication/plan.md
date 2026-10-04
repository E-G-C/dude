# Implementation Plan: Local and remote agent communication

**Spec**: `.dude/specs/068-agent-to-agent-communication/spec.md`
**Exact owner**: `.dude/ideas/068-agent-to-agent-communication.md`
**Basis**: Accepted AI/tool-enabled revision and native-result presentation; literal `B` at `2026-09-30T11:29:27.063Z` (quoted reply time) accepts a measured fixed output bound and fail-closed oversized refusal. The direction at `2026-09-30T20:21:13.749Z` selected CLI calibration. After the Windows CLI scope approval at `2026-10-01T20:43:35Z`, the user's reply at `2026-10-02T00:56:31.239Z` approves local automated acceptance plus retained three-exchange LAN evidence: "yes, try to automate the local test using copilot cli as much as you can. Avoid the github copilot app". Untested physical-LAN, macOS/cross-OS, and App-specific qualification are deferred and unverified.
**Status**: T025 froze `C = 4490` UTF-8 bytes; T026-T028 implemented, independently verified, and delivered that guard under their recorded boundaries. All 14 completed units remain accepted history, not instructions to repeat calibration, design, implementation, verification suites, or delivery. T019 stays blocked residual local acceptance/evidence and T020 stays pending independent final review. The retained LAN sharing observations are not full qualification. No new passing verdict, working native automation runner, runtime authority, Work restart, or Git operation is claimed.

## Chosen Approach

Keep the delivered core Dude extension, single `joinSession`, and five A2A tools. The existing proposal-size admission renders the complete plain-text proposal, counts its actual UTF-8 bytes, and refuses an oversized body synchronously before queued-input awaiting, readiness, or result return. It reuses the existing failure cleanup and pending-proposal lifetime. The successful body, exact local approval, and all sharing/verification gates remain unchanged. This scope refresh requires no production change.

Retain the fixed source constant frozen by T025's calibration evidence and delivered by T026-T028. The configuration remains closed and has no display-limit field. There is no new state, registry, host probe, viewer, callback, sessionLog relay, alternate approval channel, or automatic splitting/retry.

Retain A2A v1.0.0 direct JSON-RPC Message exchange over mutual TLS on loopback or the same LAN. B's ordinary model continuation reasons about questions, uses locally permitted tools, and may select an operation approved beforehand by its own owner. No tool-filter, permission-hook, session-isolation, helper-session, or `session.send` change is needed.

For remaining acceptance, use two explicitly selected, isolated CLI session/workspace contexts on one Windows machine, real loopback mutual TLS, and actual harmless fixture processes. Reuse existing tests, US4 fixtures, native capture components, and evidence channels for the smallest gap-filling batch. Separate contexts are not a security sandbox. Supported CLI orchestration and direct result capture still need actual-tool verification; this plan does not assert that a full runner already works. The App is neither a current target nor a fallback.

The adapter checks its own bindings, selections, and message structure. It does not contain all normal model/tool activity or certify model-authored prose. Sharing remains a policy under ordinary controls; approved commands execute project code with the disclosed risks. The earlier isolation/excerpt-only design and failed Q0 stay historical.

## Technical Context

**Language/Version**: JavaScript ESM; Node.js >=20 for the pinned SDK and existing build conventions. Historical offline evidence used Node 24.21.0 on Windows; record actual embedded Node and host versions for each native claim. A declared minimum or installed version is not proof that the actual current test pair works.
**Primary Dependencies**: Existing `@a2a-js/sdk` 1.2.0 and Express 5.2.1 bundle; host-provided `@github/copilot-sdk/extension`; Node HTTPS/TLS, filesystem, cryptography, and child-process facilities. No new dependency.
**Storage**: Operator-owned external configuration and TLS files; existing transient pending proposal, activation, waiter, exchange, and bounded run records. Calibration results use ordinary task evidence outside the product, not a runtime-readable policy store.
**Testing**: Reuse completed `node:test`, build/release, independent verification, and T025 native CLI measurement evidence within their exact boundaries. T019 fills remaining local native/live gaps and assesses the retained LAN record; T020 independently reviews that scope. Existing local transport tests simulate TLS and bind no listener: they prove neither real loopback sockets/handshakes nor native host behavior.
**Target Platform**: Actual GitHub Copilot CLI on one Windows machine with two isolated sessions/workspaces. Record the actual host/OS/runtime/extension/peer versions, not an inferred compatibility range. Retain observed Windows-to-Windows LAN sharing only; remaining physical-LAN, macOS/cross-OS, and App-specific qualification are deferred and unqualified. The earlier App observation on package 1.0.87-0 at 2576x1408 remains historical, with no new App run.
**Project Type**: Opt-in capability in the existing core extension and native host result surface; no new Canvas or web surface.
**Performance Goals**: One pending proposal, exchange/waiter, and adapter verification run in their existing lifetimes. No queue or new latency SLO. Preserve explicit finite operator time/message/run limits; bound successful proposal output by `C`.
**Constraints**: Preserve the 1 MiB owner-file limit and existing closed inputs. No public endpoints, delegation, task mutation, replay, always-on service, per-host configurable cap, or approval store. Runtime never calibrates or reads calibration evidence.

## Evidence Basis and Limits

The prior output-bound definition recorded source inspection of `A2A_FILE_BYTES = 1024 * 1024`, the closed `PROPOSAL_REFUSALS` map, complete `renderProposal`/`commandLines`, and `propose`/`approve` in `src/extensions/dude/lib/a2a.mjs`. At that time, `propose` rendered while `ready` was false, called `checkProposalQueue`, awaited checks, revalidated, then marked ready and returned `textResultForLlm`. Its `finally` withdrew an unfinished attempt; an eligible replacement first withdrew the old pending proposal. `approve` consumed only the current ready proposal with matching code. The missing rendered-output guard was subsequently delivered by T026-T028; that pre-guard finding is not a current implementation gap.

The session-evidence root below is `C:\Users\EG\.copilot\session-state\284969b2-a103-41d2-952d-adb70a25fabb\files\`. Hashes identify supplied retained evidence, not new hashes calculated by this definition. The table preserves the prior definition's observations and limits, not fresh test results or a new guide inspection.

| Evidence under that root | Recorded fact | Limit |
| --- | --- | --- |
| `t019-app-command-proposal-handoff-20260929T1814-0400/minimal-assessment-addendum-20260930T0121Z/minimal-assessment-addendum.json`, SHA-256 `5d1a866df6d1794ed6c2cc80914132eeed6e65509bac0530741c216115191c96` | The actual App one-command 4,113-byte result passed complete raw Copy, UIA reading order, keyboard/focus, scrolling, geometry/wrapping, and measured contrast at 2576x1408 on package 1.0.87-0. | One profile and viewport, not a global host byte limit, approval grant, or full T019 pass. Its original assessment remains unchanged. |
| `t019-app-command-proposal-handoff-20260929T1814-0400/supported-bound-capture-20260930T0130Z/supported-bound-assessment.json`, SHA-256 `15562921c6b22906b5854dc4d8364784a4184f9e64fba977856ee5bf496c8617` | A valid 1,048,356-byte configuration with 2,328 commands expected 1,145,494 rendered bytes. The host exposed an 862-byte notice/preview; detailedContent was also truncated at 5,161 bytes and full native Raw/Copy was unavailable. | Failed historical full-output observation; no approval, activation, or command followed. Do not relabel it as an expected refusal or infer a threshold from it. |
| `t019-native-sessionlog-contract-probe-20260930T0202Z/assessment.json`, SHA-256 `7089fda5df69a54396b728575ad2e58a7fb8c9df2aeacc864977d37d4c1aba14` | Public sessionLog was also truncated on the model-less native execute path; the short-text/large-sessionLog variant did not retain the full body. | Not App/model-call equivalence and no demonstrated full-output patch. No sessionLog fallback. |
| `t019-us4-offline-prep-20260930T0234Z/packet.json`, SHA-256 `1e4f5665da4d5e7648d42ff1318349e3fb90fb54687a0561c4dd0965665b0e1a`; `us4-fixture.mjs`, SHA-256 `607b6c14c258a7d931c81c302d6d16627b4fda669d1394da0e3c62e4ea1d263b` | Current practical templates: `a-ask`, `b-pin`, and `b-worktree`, with one `us4-fixture` command and declared pass/fail/inconclusive modes; four positive and fifteen negative prepared cases. | Offline preparation only. Workspace setup, commit, TLS, sessions, current expiries, and live identities are unresolved. A placeholder is not a current binding or permission. |
| Previously supplied `docs/agent-to-agent-communication.md`, Observed native cases | Reports two same-computer Windows CLI evidence exchanges, hence only one follow-up, and separate manual host-control attribution. | Preserve the original `failed_acceptance` and later user-attribution addendum. Functional partial CLI observations do not prove an unattended pass, the required two follow-ups, App support, or Mac/LAN support. The separately edited guide is not modified by definition. |
| `ship-068-implementation-f24fdfd0/T019/fresh-run/` | Original stopped attempt: verification SHA-256 `3248a3582b9e60a5c2c3618e98b57a2a0fcb09942e69d6e974f56193fbf359f1`, six passed and ten failed/incomplete checks; independent review rejected native proposal qualification and missing live acceptance. | B generated full text into an event, while the observed user surface showed private-log search and a model summary missing bindings. Keep the failed result and extra effects unchanged. |
| `ship-068-lgb351/T001/` and the exact archived T001 unit | Q0 NO-GO: ID passed; M3 allowed app/session/extension tools; M1 did not deny a same-turn write; RvR, LOSS, and LEAVE were unproven. | Old isolation contract only. A process begun before activation was not a fresh peer-caused effect. Do not replay or rename Q0 as the current gate. |

The owning idea's existing `2026-10-01T01:03:40Z`, `2026-10-01T01:33:22Z`, `2026-10-01T02:08:15Z`, and `2026-10-01T10:38:46Z` completion entries retain T025's six-case acceptance, T026's source guard, T027's independent checks, and T028's scoped delivery. The accepted 4490-byte value remains ordinary task evidence and the source constant, not a new definition field. These historical completions do not qualify the full Windows CLI matrix or transfer permission.

The supplied 2026-10-01 demo report describes two completed functional rounds, with model-chosen follow-up and session-wide permissions. It is partial functional proof, not the required initial answer plus two question-specific follow-ups or full T019. No new test, approval, or human ratification of an artifact is inferred.

Earlier preparation facts were supplied, not independently observed here: B reported Windows PowerShell 7.6.6, Node 25.3.0, CLI 1.0.91-1, Git 2.55.0.windows.5, and `192.168.50.193` with a Private profile. A was observed at `192.168.50.154` with a Public profile at `2026-10-01T20:37:02Z`; Mac was unavailable. These values alone established neither SDK compatibility nor a working LAN connection. The later observations below are bounded evidence, not current bindings or permission for another LAN run. No firewall, network-profile, certificate, setup, or cleanup action is authorized by definition.

Retain the prior Architect handoff `redefine-068-ai-tools-7bbd5972/contracts-handoff.md` and the native-result capability envelope under `redefine-068-visible-approval-20260924/`. SDK/source declarations describe APIs, not actual native display or human authorship.

The protocol basis remains the v1.0.0-labeled specification at `afda8316c64951a2ecb2a0d3d10867405d2b4095` and JavaScript SDK 1.2.0 at `e0cdc9141ded14d3e787c400a7729b2c2360d3d3`, retained by the A2A guidance skills and checked in the earlier definition. No version upgrade or optional-pack runtime dependency is introduced.

### Retained Windows LAN sharing evidence

A used `192.168.50.154`, workspace `C:\Work\DudeA2A-LAN-A-20261001`; B used `192.168.50.193`, workspace `C:\Work\DudeA2A-LAN-B-20261001`. Each had an independently locally approved share-only profile, with no verification-command grant. These are historical contexts, not targets to relaunch.

The following user-supplied native attachments are under `C:\Users\EG\.copilot\workspaces\284969b2-a103-41d2-952d-adb70a25fabb\attachments\`. Hashes are coordinator-supplied checks, not computations performed by this definition.

| Exchange | A question -> B response | Native attachment | Supplied SHA-256 |
| --- | --- | --- | --- |
| Initial | `355a9a47-724c-460b-8421-b35106c2bc87` -> `f8038316-1c95-4277-a29f-2f6603bdb185` | `pasted-text-625db484-2fb9-4c2b-b3e2-be93b49d3ef3.txt` | `09dcce9756b3d00eaa2026ffe18f6e2e5bf1c41a4f4f9e1fd2ac99b5f48a545a` |
| Follow-up 1 | `0fdcb9f3-e192-46ec-9175-f3d9e8c1eefc` -> `a0d4c341-2088-4b5c-aad4-5fddb08d1e22` | `pasted-text-c2ed68e3-ad97-4135-9a82-fa2ee3eb2c04.txt` | `9afc3a8dcd854c284fb61b54570d1b9d2120dfb00f846605304d9e0f49f923f6` |
| Follow-up 2 | `55428f61-da38-49c3-b5a7-c18aecfc8653` -> `27e3d87e-85c1-457a-ab55-686fb724d5b9` | `pasted-text-d4e2e295-c09c-4914-b158-1798c9fd2b25.txt` | `7fb607328debef828c7147aca883bfc600381b0259ebf9ebbc17307ef95a46cd` |

Each response included the five whole-file fixture excerpts at their expected sizes/hashes; successive native read times advanced. The certificate/endpoint matched approved B, and the adapter reported encryption, pin, binding, and correlation checks. These displays and hash checks are not a raw wire capture, a permission-history audit, or proof of every negative security case.

All excerpts remained synthetic retained records, with the exact native marker `no run record supplied; execution unknown`. No real verification record was supplied. The initial model added an unsupported second-pass acceptance criterion; the final reply clarified it as advisory and distinguished incomplete results, missing revisions, and inert third-party approval-like text. Preserve that limitation and correction, not a flawless-answer account.

The user supplied native stops at `2026-10-01T23:54:27.344Z`: A inactive with no further sends; B inactive with its listener closed and late replies rejected. At `2026-10-02T00:02:05.105Z`, B's exact PersistentStore test firewall rule query returned count `0` after separately authorized manual cleanup. No native grant remains active. Do not repeat LAN certificate/firewall/setup work or conversations, or restart these contexts. These stops and cleanup are narrow observations, not the untested LAN failure/cancellation or availability matrix.

## Configuration and Approval Boundary

Keep one operator-authored JSON configuration at a selected absolute path outside the bound workspace. The adapter never writes it. Preserve exact-key validation and the existing `A2A_FILE_BYTES` regular-file read bound for configuration and TLS files. A configuration may fit 1 MiB yet render beyond `C`; the two checks are independent.

Profiles select `ask` or `serve`, an absolute workspace, peer address and expected certificate fingerprint, local certificate/key files, sharing text, `contentBytes`, `repeatUse`, and optional `expiresAt`. Ask profiles require peer port and `askTimeoutMs`. Serve profiles add a listen address/port and evidence roots. Optional `verification` selects catalog command IDs, required explicit `revision` and `repeatUse`, optional `git`, and optional command expiry. Share-only serving has no command approval. No tool installs or expands a profile.

`contentBytes` bounds each wire message and aggregate source-file bytes selected for a reply. Command stream capture has its separate required `outputBytes`. Neither is a host-display limit. Refuse invalid/missing limits or an over-budget message instead of silently truncating files or prose. Only command streams have explicit, reported truncation.

1. The local user requests `dude_a2a_propose` with exactly the external `configPath` and selected `profileId`. Preparation grants no approval. If the complete rendered body exceeds `C`, return the short refusal and stop this flow.
2. For a successful proposal, the owner opens the native custom result and reviews every line. The assistant may point to it, but cannot replace it with a summary, relay a private log/file, or approve for the owner.
3. The owner types or pastes exact current `dude a2a approve <code>` as the next eligible local root `user.message`. Existing binding, expiry, queue, source, cancellation, and one-use checks decide whether it activates.
4. `dude a2a stop` remains an authority-reducing input from any existing supported user-message origin. It withdraws pending approval and ends activation as applicable.

The retired chat-only `dude a2a propose <config-path> <profile>` branch stays retired. Do not restore it as a compatibility route or use `session.log` as an alternative proposal surface.

Only a live eligible root `user.message` with exact trimmed approve content supplies approval. Preserve ignoring `agentId`, `isAutopilotContinuation`, `agentMode: autopilot`, and source-attributed non-user candidates. Tool arguments or booleans, peer payloads, transformed content, attachments, and history are not consent. Ignored candidates leave activation unchanged; they do not establish a global off state.

An unattributed root event relies on ordinary host/operator trust, not proof of human authorship. Per-host integration records intended typed/pasted input's actual `source` state against the existing classifier; do not broaden admission speculatively. Software already permitted to inject eligible root messages may spoof approval. Model-readable codes do not remove that disclosed risk.

Retain the in-memory binding to local session, invocation, provider generation, workspace identity, config path/digest, profile, peer endpoint/pin, TLS material, and command definitions/policy/validity. Recheck at approval, admission, verification, evidence attachment, and sending. Stop, shutdown, drift, context change, reload/loss, or expiry ends applicable authority. Never restore it from logs.

Sharing and commands remain separate. Each side approves its own disclosure; only B's own approval covers its verification. Activation changes no host permission and answers no host prompt. A remaining host prompt prevents an unattended-preapproval claim.

For local automation, batch concrete setup/run/effect/cleanup permissions where supported, naming the actual sessions/workspaces, config and TLS files, loopback listener/peer, evidence, command IDs/parameters, revision policies, environment, finite limits, repeat coverage, and resource disposition. General "automate" direction covers none of those unnamed future operations. Never extract or submit an approval code for the human, replay an approval, enable blanket/session-wide permissions, or change profiles automatically. Each current full native review and exact eligible local root approval stays human-owned; supported result collection is not an approval channel.

## Native Proposal Result Contract

| Surface | Contract |
| --- | --- |
| Tool and join | Keep `dude_a2a_propose` in the existing `a2a.tools` array and single join. |
| Arguments | Exactly `{configPath, profileId}`, both strings, with existing path/profile validation. No cap, approval boolean, supplied body, command override, or display-mode field. |
| Preparation | Reuse `bindProposal`, `renderProposal`, and one ephemeral pending proposal. Read only the selected config/TLS/binding inputs already needed. No runtime load, listener/socket, command or Git probe, peer question, or workflow mutation. |
| Size admission | Count the entire final `text` with `Buffer.byteLength(text, 'utf8')`; at `C` continue, above `C` fail before the first preparation await and before `ready`. |
| Success | Existing `ToolResultObject` with `resultType: "success"` and complete plain text in `textResultForLlm`, unchanged. No text is appended after the size check. Success proves construction only, not review or support. |
| Failure | Existing short native failure shape with a fixed reason, no proposal body/code/approval line, and no ready pending proposal from the attempt. Never return a partial success. |
| sessionLog | No proposal-body relay. Existing metadata-only notices remain separate and do not prove native rendering. |
| Approval | Existing exact local root approve input; no approval tool, native-confirm boolean, callback, or bridge. |

The full counted body includes external config path and exact-byte digest, profile, local session/provider/workspace, peer endpoint/pin and applicable listener, SHARING/purpose/exclusions/evidence roots, message/ask limits, validity/repeat coverage, every selected COMMANDS entry, and all risks/review/lifetime/approval/next/stop notices. Each command includes ID, executable, complete argv/parameter declarations, cwd, environment names, timeout/output limits, effects/resources, explicit revision/Git policy, validity, and repeat coverage. The generated code and all line separators count.

Preserve omission of private key material and fixed environment values, without promising that argv, prose, or future command output is scrubbed of secrets. Ask profiles have no listener or local verification grant. Share-only serving shows `COMMANDS: none approved` with no invented revision policy.

Invalid invocation identity cannot change another context. Proposing while activation is active or starting refuses without changing it. Within an eligible inactive context, a new attempt first withdraws the old pending proposal, even if validation or the new size check fails. Stop, replacement, root abort, queued/intervening input, expiry, drift, or provider loss invalidate current eligibility. Normal completion-abort of a finished successful invocation does not invalidate a still-current proposal.

There is no display/read callback. A body within `C` that is hidden or inaccessible still fails native qualification and must not be approved. Status and activation notices require their own observations.

## Fixed Output Bound and Calibration

T025 completed this prerequisite and froze `C = 4490`; T026 embedded that exact value as the fixed source constant `A2A_PROPOSAL_BYTES` in `src/extensions/dude/lib/a2a.mjs`, and T027-T028 verified and delivered it. The following procedure and guard/check contracts retain completed-slice traceability, not a new calibration or implementation request. Product code never reads the evidence folder. No definition-field update, new registry, or runtime option is needed.

### T025: select and freeze one practical bound

1. **Pin the finite inputs offline.** Re-pin the current source/delivered renderer and use the US4 packet's `a-ask`, `b-pin`, and `b-worktree` templates plus the existing share-only profile form. Keep the `us4-fixture` command's declared modes, scopes, effects, revision choices, and required limits intact. Use the current same-computer profile content and inert, schema-valid companions for offline-only cases. Retain `at-multi` and `at-utf8` as the existing at-bound cases alongside the four practical profiles (`a-ask`, `b-pin`, `b-worktree`, and `share-only`); add no speculative catalog size. Record which are practical profiles and which are boundary checks. Mac availability was not a calibration prerequisite; T019's current Windows CLI matrix is defined under Native qualification boundaries.
2. **Resolve the measurement bindings.** Record the exact current candidate paths, session/provider identity lengths, peer/pin fields, command definitions, and validity text that affect rendered bytes. Placeholder rendering can guide preparation but cannot freeze `C`. Any native target/config materialization, certificate action, session startup, inspection, or result call needs its normal exact permission first. Do not silently reuse expired profiles/certificates or old live identities. Commit-pin text may be an explicitly inert fixture pin for proposal-only display; it is not a verified revision and authorizes no Git probe or command.
3. **Calculate one candidate deterministically.** For each required practical profile with resolved display bindings, obtain the exact full production-renderer body offline with fake transport/process/host effects. Let `C_candidate` equal the largest measured UTF-8 body among those practical profiles, without invented headroom, rounding, or a guessed constant. Retain input bytes/digests and full output bytes/digests. Neither the 1 MiB ceiling, 4,113-byte observation, nor failed 2,328-command fixture defines this candidate. Prepare a finite at-candidate-bound matrix with valid long/multi-command and multi-byte/escape-heavy cases; all selected commands and notices must remain present. If required coverage cannot fit, stop and return that concrete limitation rather than deleting required profile content.
4. **Qualify that candidate in the actual GitHub Copilot CLI native host, only when authorized.** Measure all six cases on the exact permitted target/config, without approval or activation. The implementation owner selects an existing supported native transport/seam and identifies the caller, actual native CLI receiver, body-bearing field(s), observed events, and whether a model participates. Compare the complete proposal body received in those native fields with the full production-renderer oracle. Retain original UTF-8 bytes/counts/digests before masking; mask only enumerated dynamic session/provider/code fields and record each substitution. Never mask missing content or substitute a preview, summary, or private log. Check every binding, selected command, notice, and secret omission. A producer return or fake in-process host is preparation only; SDK-direct evidence proves only its observed boundary, not model-path or App equivalence. Do not assume an SDK method or event exists. Preserve existing model/root-input approval boundaries: model-visible text and codes grant no consent. Add no UI bridge or framework.
5. **Freeze or stop.** Freeze `C = C_candidate` only when every practical profile's complete current body fits, both at-bound bodies are exactly `C_candidate` bytes, and all six native CLI comparisons pass. Retain the fixed value, renderer/build/profile identities, unmasked input/oracle/native-output bytes/counts/digests, comparison substitutions, exact CLI target/version and observed transport/receiver fields, permission reference, and pending-withdrawal/resource disposition in ordinary T025 evidence. No approval code or grant remains usable. Missing permission, unresolved or changed native bindings, placeholder-only measurements, incomplete receiver output, a mismatch, or a required profile that cannot fit leaves `C` unfrozen and prevents T026. Retain preparation and failure evidence; do not automatically retry, scan host capacity, or adjust the bound speculatively.

App-only geometry/wrapping, contrast, focus, scrolling, and accessibility-tree checks did not block this completed CLI calibration. CLI does not independently verify them, and historical App observations remain unchanged. For remaining work, SC-011, VSC-005, and T019 retain the applicable Windows CLI presentation obligations. Before any activation, the operator must still review the entire native proposal; byte-complete receipt alone proves neither that review nor consent.

This was one bounded calibration unit, not a host benchmark or universal capacity claim. The original 4,113-byte observation supports only its exact facts. T019 still qualifies actual local Windows CLI proposal/approval delivery, notices, and the applicable local stories under the frozen cap; retained LAN evidence is assessed separately. An actual target unable to show accepted bodies is unsupported, not a reason for a second configurable limit or another calibration.

### T026: one guard in the existing path

After `renderProposal(...)` returns complete `text`, check its UTF-8 byte length before `checkProposalQueue(...)`, `await checksSettled(...)`, result construction, or `proposal.ready = true`. Throw the existing local error type on `> A2A_PROPOSAL_BYTES`; equality passes this check. Keep the existing `catch`/`finally` cleanup, identity ownership, and earlier `withdraw` call. Rendering may create an internal nonce/code while `ready` is false; the failed body/code must never be returned, logged, or become usable approval.

The pre-guard refusal map lacked an honest output-size reason: `file_too_large` means configuration/TLS input and `internal_error` would misstate this recoverable cause. T026 added only `proposal_too_large` through the existing short failure layout. Its fixed reason and next-action text must not reflect paths, IDs, codes, command fragments, or configuration content.

Do not change the successful renderer to make bodies fit. Keep `A2A_FILE_BYTES` and all message/run limits unchanged. Do not add any configuration key, threshold override, size service, render cache, pending state, runtime calibration, transport hook, or file/log fallback. If a proposed implementation changes successful renderer bytes, stop because T025's measurement basis no longer matches; return that conflict through the existing prerequisite rather than silently expanding `C`.

### T027: independent boundary and regression checks

Use otherwise valid configuration, TLS, workspace, invocation, queue, and time companions so a negative actually reaches the output-size branch. Exercise asking, share-only serving, command-enabled commit-pin/current-worktree, multiple selected commands, multi-byte text, and escaping in valid paths/argv. Establish exact full-body sizes at `C` and `C + 1`; character counts and input bytes are not output bytes. Assert the specific size refusal, and use a test-only deletion/mutation falsifier to show that removing the guard admits the oversized case. Never alter production approval gates to make a fixture pass.

Check both an empty pending state and replacement of a valid small proposal. Refusal exposes no body/code/approval line, leaves no ready pending proposal, and later old/refused approval attempts cannot start activation. Assert no SDK load, listener, transport preparation, peer disclosure, Git probe, verification, or command; no auto split/retry. At-cap success still carries every selected command/notice and retains normal-completion approval eligibility. Recheck identity mismatch, active/starting refusal, cancellation, queue races, drift/expiry, stale returns, exact one-use approval, source attribution, and adjacent Needs You/Canvas behavior.

Retain the 1 MiB configuration read tests independently: valid near-input-limit configurations selecting a small profile may still succeed, while an oversized selected body below 1 MiB refuses. Reuse the historical command-dense expansion fixture offline as a new post-guard refusal observation, without modifying its old result or requiring another giant native call.

Report all 29 current acceptance scenarios, SC-001 through SC-014, and applicable visual criteria with explicit offline/native/live dispositions. An offline pass proves neither App display nor the four live stories.

## Existing-session Tools and Transport

| Tool | Bounded responsibility |
| --- | --- |
| `dude_a2a_propose` | Prepare one full local proposal within `C` or a short refusal. No activation or operation. |
| `dude_a2a_ask` | Accept an in-scope natural-language question and optional requested command IDs/parameters; send once and wait inside the invocation. No inbound listener or later-turn delivery on A. |
| `dude_a2a_receive` | Keep one current blocking waiter in B; return one admitted question and exchange ID to B's ordinary continuation. |
| `dude_a2a_verify` | Accept only `{exchangeId, commandId, params}` for one covered catalog operation; no executable, arbitrary argv, cwd, environment, or approval input. |
| `dude_a2a_reply` | Accept `{exchangeId, conclusion, limitations, evidence[]}`; validate authority, attach approved evidence, and consume one reply. |

Preserve isolated event fan-out through one join and unchanged Needs You behavior. An A2A failure cannot suppress the adjacent handler. Registration and proposal construction are not enablement. Do not call resume APIs or set tool filters, permission handlers, or isolation hooks.

B keeps its ordinary tools. Evidence roots bound attachments, not every host read; named-command checks bound this adapter, not every model shell/subprocess.

Retain the SDK JSON-RPC client and Express adapter with v1.0.0 direct blocking Messages. No A2A Tasks, task routes, streaming, polling, push, redirects, discovery, fallback transport, or v0.3 compatibility. Any internal SDK store remains inert.

Mutual TLS verifies configured trust, peer address/port/fingerprint, and selected-session/workspace activation. A certificate or display name cannot authorize another session or restore an exchange. Bind/connect only to configured loopback/private-LAN literals; reject wildcard/public endpoints. Certificate generation, firewall edits, and setup remain separately authorized; no automatic generation, relay, or port forwarding.

Agent Card access is authenticated and scope-limited; command advertisement lists selected IDs only, not executable/parameter details or secrets. Capabilities do not approve operations. Refuse unsupported versions/operations/identities and malformed/oversized envelopes before model delivery.

## Verification Contract

Each catalog entry fixes an absolute executable, argv, workspace-contained cwd, environment policy, required `timeoutMs`, per-stream `outputBytes`, and declared effects/resources. Parameters are enums or anchored patterns, substituted only as whole argv elements. Scripts name their interpreter; direct `.cmd`, `.bat`, and `.ps1` executable entries refuse. Unknown IDs, extra/missing parameters, and invalid values refuse before spawn.

The optional serving verification scope requires explicit `revision`, with no default:

| Policy | Check before spawn |
| --- | --- |
| `{commit: <sha>}` | Configured Git `rev-parse HEAD` must equal the pin and `status --porcelain=v1 -z` must be empty. Untracked files count; ignored files do not. Mismatch, dirt, missing Git, or probe failure refuses. Unknown cannot satisfy the pin. |
| `"worktree"` | Explicitly approve current workspace files, dirty or not. Record HEAD/status digest when observable; otherwise revision is unknown. Never substitute this policy for a pin. |

Before each run, check activation, exchange, entry digest, workspace, declared environment/limits/effects, and validity. Admit only one adapter run. Spawn with `shell: false`, ignored stdin, and declared inherited environment names/fixed values. The custom-tool call is not a separate host-displayed shell approval, so the full proposal must disclose operation and revision policy.

Declarations do not verify effects, executable contents, or inherited values. Project code can exceed them; there is no CPU/memory/network/filesystem/descendant isolation. With Git, repeat probes after the run and report persistent `changedDuringRun`; unavailable comparisons remain unknown. Checks do not atomically freeze inputs and miss ignored files/transient changes; a status digest does not pin all dirty contents.

Keep an ephemeral adapter record with run/exchange/command IDs, entry digest, expanded argv, cwd, policy and before/after observations, observable nonsecret environment facts, start/end times, and exit/failure observations. Unknown details remain unknown; add no probe just to populate provenance. Secrets are not reportable environment provenance.

Drain output while incrementally counting/hashing; retain only each approved stream prefix. Record total bytes, full-stream SHA-256 only if fully observed, retained text, and truncation/incompleteness. A can recompute a digest only for complete untruncated bytes received. Output is not automatically redacted; operation approval and sharing must cover that risk separately.

Timeout/cancellation/exchange end requests termination only for the adapter-created run through its supported POSIX process group or Windows `taskkill /T /F` path. Record request separately from observed direct exit. A kill request, helper/parent exit, timeout, or extension loss proves neither descendants nor ordinary model tools stopped. Add no orphan recovery, takeover, or retry.

## Evidence and Answer Contract

B's model supplies conclusion and limitations. Evidence is either a `{run: runId}` created by this adapter for the current exchange, or `{file: path, lines?, claimedProvenance}` within approved evidence roots. The model cannot author/replace a run record. File reads enforce root/path identity, no escape, bounds, and change detection; reject unsafe/changed paths and config/TLS files.

Attach file reference, selected text, exact bytes/hash, actual read time, and filesystem modification time labeled as metadata. A timestamp stated in a file remains attributed content, not today's execution. Fresh adapter-run times are distinct; normal-tool output remains model-reported unless supported by attached evidence.

A checks outstanding-exchange correlation, authenticated peer, payload shape/sizes, current authority, and run/exchange/command/policy consistency. Missing requested run records mean execution unknown, not never-run, and cause no retry. Missing evidence and inconclusive conclusions remain explicit; `answer` means a valid reply arrived, not that its claim is true.

Keep the fixed notice: the peer model authored conclusions/limitations; the adapter checked specified bindings/structure; evidence retains provenance and uncertainty; nothing grants permission or replaces local acceptance. B-side stamping is not remote certification or a signature proving observations correct. Surface contradictions for A; structured fields do not automatically outrank prose.

Every question, reply, source reference, and run output remains subject to sharing. Refusals reveal no excluded content. Adapter logs remain metadata-only; ordinary host transcripts and normal model effects are not globally contained. Local proposals are not sent as peer authority.

## Lifecycle and Outcomes

| Condition | Required behavior |
| --- | --- |
| Proposal invalid or over `C` before return | Return the bounded failure if reachable; withdraw the attempted pending proposal through existing cleanup. No partial body/code/readiness. An eligible replacement already withdrew its predecessor. |
| Invalid proposal invocation identity or active/starting activation | Preserve the existing unchanged-context refusal; do not mutate another context or silently stop/reconfigure an activation. |
| Successful proposal return | Retain current pending eligibility for the next exact local approval; normal finished-invocation abort does not revoke it. No activation/runtime/listener/send/run follows. |
| Stop, root abort, replacement, queued/intervening input, expiry, drift, session/provider/context loss | Invalidate applicable pending eligibility. Old visible text supplies no authority; no card rewriting or read receipt. |
| Exact current approval | Recheck binding and queued input; consume once before activation. No peer/model/old-code approval. |
| Normal receive completion | Remove waiter, retain exchange for ordinary B continuation, verify, and reply. Finished-invocation abort alone does not cancel it. |
| Normal reply completion | Consume once. Another ordinary receive under valid activation is possible; a gap without a waiter is unavailable, not queued. |
| Root abort/new root input/opaque queue during exchange | End affected exchange. Reliably attributed subagent events are not root human approval; opaque queued input may conservatively interrupt. |
| Stop/shutdown/session/workspace/config change/expiry/extension loss | End activation or affected exchange before later admission/sending. No restored authority; this does not stop all host/model activity. |
| No waiter, unsupported peer, known pre-send failure | Return unavailable/refused without substitute session or delivery scheduling. |
| Asking cancellation/deadline | End invocation, drop later bytes, release transport using explicit `askTimeoutMs`; request best-effort local run cancellation where reachable. |
| Loss after possible send | Report uncertain delivery/execution with observed cause; never infer non-delivery/non-execution or replay. |
| Late/duplicate/unsolicited/cross-exchange reply | Reject as `exchange_not_current` or existing bounded equivalent; never deliver to a later invocation. |

Keep outcome family `answer`, `refused`, `unavailable`, `cancelled`, `timeout`, `uncertain`. Possible delivery without a definitive result means `uncertain`, with timeout/cancellation as cause. These are not process or Dude task states.

Do not infer client loss from request `close` after a completed body. Observe premature response closure before `writableFinished` or associated socket close before response completion; T019 verifies actual SDK/Express/Node behavior, not just synthetic events.

Qualify local waiting/busy/inactive notices separately. Ready means a current receive waiter and valid checks, not background progress. Automate those states where supported, and record actual foreground/minimized/locked behavior through the bounded local observation described below. A shared-machine lock does not simulate independent remote availability. Do not keep a session apparently ready by queueing, substituting sessions, or changing Work.

## Source Layout and Delivery

| Path | Responsibility for the delivered guard |
| --- | --- |
| `src/extensions/dude/lib/a2a.mjs` | One frozen constant, synchronous post-render size check, and one closed failure reason; preserve successful renderer and existing cleanup/approval. |
| `src/extensions/dude/a2a.test.mjs` | Coupled and independent boundary, pending/approval, expansion, and regression fixtures. No production test-only cap override. |
| `src/extensions/dude/extension.mjs` | Only directly affected user-facing tool guidance if needed; retain one join and existing event fan-out. |
| `src/extensions/dude/lib/a2a-transport.mjs`, `a2a-verify.mjs`, and their existing tests | Preserve transport, verification, provenance, limits, and lifetime; run applicable regressions, not a redesign. |
| `src/extensions/dude/lib/a2a-runtime.mjs`, legal notice, `scripts/dude-a2a/` | Preserve pinned bundle/build inputs and legal bytes; the guard needs no dependency or runtime rebuild. |
| `docs/agent-to-agent-communication.md` | T028 delivered the fixed-cap guidance. Later scope/evidence wording alignment remains with the existing delivery owner, outside this definition stage; no further product function is implied. Preserve separately authored observations and unrelated guide edits. |
| Existing core projection and `scripts/build-dev.test.mjs` / `scripts/build-release.test.mjs` | Scoped source/generated/disposable-release parity, lazy-runtime/default-off behavior, absent-pack startup, runtime/notices inclusion, and tests/node_modules exclusion. |

T028 used existing validated projection machinery, not hand-edited `.github/` files or a broad root rebuild/cleanup. This scope refresh repeats no delivery and changes no source, guide, README, user models/profiles, source manifest, optional packs, Canvas/Needs You, Feature 062, or unrelated edits. No new skill, schema, research file, checklist board, or product artifact is needed.

## Guardrail Check

| Existing rule | Application |
| --- | --- |
| WHAT/WHY separate from HOW | Spec defines fixed size eligibility and outcomes; calibration algorithm, byte count, insertion point, source constant, and error reason are here. |
| Smallest design for current needs | Retain the measured constant, pending state, and failure layout. This completion-scope refresh adds no capability, capacity scanner, fallback, registry, extra surface, or speculative command-count goal. |
| Core independent of optional packs | Keep pinned lazy runtime, default-off behavior, one join, and adjacent tools. Proposal preparation still loads no SDK. |
| Approved UI before source | Keep exact approved v2 preview/hash and v1 history. Mock section 5 already supplies the short validation-failure affordance. The Windows CLI scope change requests no new design or approval. Different controls/surfaces would return through the design gate. |
| Harness before host observation | Reuse accepted offline evidence rather than replay complete suites, then fill real local TLS/process/native gaps with supported CLI automation. Human checks cover only current approval and unavoidable host-specific facts; no new harness product or App fallback. |
| Permission and evidence honesty | Concrete local operations need applicable exact permissions; general automation direction is insufficient. Preserve failures and operator attribution. Retain narrow LAN sharing only; defer untested physical-LAN and Mac/App qualification without inferring it from local results. |
| Coordinator-owned state/history | Preserve all 14 completed units and historical suffix bytes. Only T019/T020 definition text changes one-to-one; no task is new or dropped and no completion is inherited. Coordinator alone composes metadata, glyphs, boards, and execution reconciliation. |

The familiar interaction remains inspect exact operation details, then explicitly approve; failure uses the already approved short validation-error pattern. New project-wide guardrail candidates: none.

## Implementation and Acceptance Sequence

The original sequence remains useful as historical traceability, not directions to repeat completed work:

1. **T013 original design**: retain the exact v1 artifact and approval.
2. **T014 foundations / US2**: retain activation/binding, mutual-TLS transport, one join, and original evidence; the retired chat-only proposal is historical.
3. **T015 US1 and communication lifetime**: retain evidence conversation, provenance, one-shot reply, interruption, and uncertainty.
4. **T016 US4 and operation lifetime**: retain named verification, revision policy, observed records, bounds, and best-effort cancellation.
5. **T017 original independent offline verification**: retain all original 24-scenario dispositions.
6. **T018 original delivery**: retain source/generated/runtime/notices and original guide evidence. T021-T024 subsequently delivered the approved native-result refinement; all four units remain unchanged completed history.
7. **T019 separately authorized residual acceptance**: keep the same qualification/evidence task and failed/partial records, now for local Windows CLI gaps and bounded retained LAN evidence. T025-T028 prerequisites are complete and are not repeated. Neither those completions nor a retained conversation closes this task.
8. **T020 independent final review**: still follows completed T019 and assesses the complete current initial contract, approved interaction, delivery, and all evidence. No automatic closure or execution authority follows.

### Completed fixed-bound prerequisites to step 7

| Existing unit | Retained outcome | Existing dependency |
| --- | --- | --- |
| T025@d068g025 | Practical-profile sizing and six-case native CLI output comparison froze `C`; preserve ordinary accepted evidence. | T024@c068f024 |
| T026@d068g026 | Fixed byte admission and existing cleanup/refusal, with tightly coupled offline checks, implemented. | T025@d068g025 |
| T027@d068g027 | Independent exact-boundary, effect-negative, pending-lifetime, and four-story regression verification completed. | T026@d068g026 |
| T028@d068g028 | Scoped projection, guide contract, and independent distribution checks completed. | T027@d068g027 |

Preserve T019's existing dependency on T028 and T020's dependency on T019. Keep all 14 completed canonical units exactly; amend only T019/T020 semantic bodies one-to-one. Preserve headers, metadata, board, notes, and history. The current task bodies and this plan supersede earlier full-LAN summary wording retained in tasks.md; that wording is not another execution requirement. No drop, new task, archive, state transfer, follow-up feature/task, or board is proposed. The coordinator owns actual state and execution reconciliation. Dependencies, not lifecycle/task numbers, govern ordering.

### Native qualification boundaries

Initial acceptance combines remaining local Windows CLI coverage with the bounded retained LAN evidence above. Only the two explicit local sessions/workspaces participate in new live checks. Untested physical-LAN commands, failure/cancellation, authentication/disclosure negatives, and availability are deferred, as are macOS/cross-OS and App-specific qualification. Do not infer those results from loopback, repeat LAN setup/conversations, or use the App as a workaround.

Reuse T025's six-case native measurement for its recorded body/receiver boundary and frozen `C = 4490`, T026-T027's source/offline assertions, and T028's scoped delivery checks. They do not establish human review, actual current root-event delivery, model behavior, or live socket/process outcomes. The transport suite's simulated TLS with no bound listener is not a real-loopback test. Retained evidence should eliminate redundant checks, not conceal these gaps. No recalibration, giant native output replay, second viewer, or repeated full offline suite is required.

Read-only Tester feasibility, with no new native run, reports that the existing SDK can own two real headless CLI processes, `session.rpc.tools.execute` returns full native body bytes, and `getEvents` correlates identities. SDK-created headless sessions are actual CLI, not the App. These are usable automation candidates, not fresh execution or qualification evidence. Observed direct model-less calls can establish native body and component behavior at that API boundary; they do not establish AI reasoning, actual model use of local tools, or model-driven verification. Keep those observations separate from the model-turn evidence required by US1 and US4.

One visible terminal controller could print each direct result verbatim and forward only one unchanged line actually typed by the owner as current root input. That remains a method candidate, not an adopted viewer or approval path. A supported bridge to existing visible CLI TUI sessions is not established. A headless run has no rendered TUI to qualify: mark absent TUI-only keyboard/focus controls not applicable to that run, not passed, and make no claim for an interactive TUI. The actual owner-facing terminal's complete readability and manual next-eligible one-use approval still need evidence. `getEvents` correlation alone proves neither review nor human input; retain the ordinary host/operator trust limit rather than promising universal origin proof.

The concrete method gate is FR-042/SC-011/VSC-005 for full native owner review and FR-044/SC-012 for the current local root approval. If the controller would supply a new viewer or approval bridge rather than use an existing supported native path, it conflicts with the retained out-of-scope boundary and must return to the coordinator before adoption or activation. Do not silently waive that boundary, infer human coverage from SDK bytes, or submit/extract approval text for the owner. This does not prevent separately authorized direct native evidence capture within its narrower boundary; no full acceptance or activation follows from it.

Keep the remaining work inside T019 as one small, bounded local batch:

1. Reuse the existing `t019-us4-offline-prep-20260930T0234Z/` packet and `us4-fixture.mjs`, the fixtures/oracles in `src/extensions/dude/a2a.test.mjs`, `a2a-transport.test.mjs`, and `a2a-verify.test.mjs`, and retained CLI capture components where their current APIs work. Adapt only the disposable orchestration and collection needed for uncovered cases; add no dependency, daemon, generalized controller, or product capability. Verify actual CLI tool entrypoints and complete native receiver output only inside the exact permission batch below, recording host, embedded runtime, extension/build, and session/workspace identities. A fake host, declared SDK method, or successful producer return is not that verification. A genuine API limitation ends that attempted path with an explicit unqualified result, not a speculative probe/retry loop.
2. Use two short, isolated local workspace paths outside the repository and separate from retained evidence. Admit only a concrete permission batch under Configuration and Approval Boundary, including named loopback TLS/files/listener and harmless fixture effects/cleanup. Current paths, profiles, expiries, and grants must be real, not copied placeholders. Preserve full native proposals for A asking, B share-only, and command-enabled profiles under both revision policies; reuse earlier byte comparisons only where their recorded basis still applies. Fill remaining complete-display, applicable keyboard/reading, notice, short-refusal, and approval-lifetime gaps through an established native owner-facing/input path, not a presumed controller or TUI bridge. The owner reviews each whole current proposal and supplies the next eligible local root approval; automation never extracts/submits its code, replays it, or answers native permission prompts for the owner.
3. After those gates, orchestrate covered questions, replies, and collection without a user relay between questions. Use B's actual AI/local tools for US1, a real loopback mutual-TLS listener/handshake and socket lifecycle for transport gaps, and actual harmless fixture processes for US4. Cover both commit-pin and explicit current-worktree policies, success/failure/inconclusive outcomes, every permission negative, finite message/time/run/output limits, cancellation, and effect accounting. Distinguish normal completed request bodies from premature response/socket loss and preserve unknown delivery/execution without replay. Reuse accepted offline cases for their assertions; only missing native/live behavior needs another observation. Changing a profile or scope still requires ordinary fresh review/approval, never automatic splitting or blanket/session-wide permissions.
4. Capture literal native results and supported events, source/run/exchange identities, timestamps, complete bytes or explicit output truncation/incompleteness, counts/hashes, exit/cancellation observations, and effects through the existing evidence channels. Tester and Reviewer must read them directly without per-question copy/paste or model-summary substitution. Evidence files are for evaluation, never an alternate proposal-approval surface. Stop the owned local contexts and dispose only of exactly authorized resources; confirm the owned process tree stopped before removing its scratch directory. A cancellation request or parent exit is not proof about descendants. Retain and report any unconfirmed process/resource disposition rather than sweeping it away or restarting an old run.

Prefer direct local native output/evidence capture. The user's additional willingness to use computer interaction permits considering local CLI result inspection when needed, using only an actually available, permitted computer-use tool. Do not assume tool availability or build a UI harness. Inspection grants no GitHub Copilot App use, approval-code extraction/submission, or A2A consent on the user's behalf, and cannot replace the owner's full native proposal review and current local root approval.

Local availability needs honest host observations. Automate waiting, busy/no-waiter, inactive, expiry, and stop checks where supported. If foreground/minimized/locked behavior or complete native reading/keyboard interaction cannot be captured through supported CLI interfaces or permitted local CLI inspection, collect one bounded set of current human-only observations through the coordinator. Record the actual terminal/host and what happened to both sessions. Locking this single Windows machine affects both peers; it cannot prove a remote A remains active while B is locked. State a concrete reason for any inapplicable local host affordance; an applicable but unobserved fact stays unqualified. Do not add App visual checks or pretend simulated events establish native availability.

Missing current authority, incomplete native output, unavailable required tools, failed applicable checks, or a permanently unavailable integration is not success. Report the exact limitation; use no private-log/App relay, summary, auto-approval, permission escalation, silent restart, or promised host patch. Preserve all old failures and attribution addenda. No passing verdict or task closure follows from this amendment.

### Requirement-linked acceptance applicability

These are definition dispositions, not test results or another board. `US1.1` means US1 acceptance scenario 1. Every row remains applicable locally; reuse accepted evidence for the assertion it actually covers and leave native/live gaps unqualified until observed. The retained LAN record adds only the described sharing observations; every untested physical-LAN counterpart is deferred, not passed. No remote repetition is required.

| Scenario | Requirement link | Local obligation and reuse boundary |
| --- | --- | --- |
| US1.1 | FR-001, FR-006, FR-030, FR-031 | Actual AI/tool evidence inspection and question-specific answer; retain the LAN initial display as narrow additional evidence. |
| US1.2 | FR-012, FR-013, FR-031, FR-032 | Distinguish relevant revision/environment from conflicting records; preserve missing-revision and advisory-claim limits. |
| US1.3 | FR-009a, FR-013, FR-032, FR-033 | Identify missing/stale/partial/third-party evidence explicitly; no unapproved run. LAN synthetic files do not become fresh verification. |
| US1.4 | FR-006, FR-028, FR-031 | Initial local answer plus two question-specific follow-ups while available; retain the three LAN displays without repeating them. |
| US1.5 | FR-014, FR-032, FR-038 | Keep evidence/inference/claims distinct and task authority unchanged; native receipt is not independent acceptance. |
| US2.1 | FR-002, FR-008 | No sharing approval means no project-content disclosure; retain offline negatives and fill any local native gap. |
| US2.2 | FR-003, FR-034, FR-037, FR-042 | Complete current native peer/session/scope/validity/risk presentation before human approval. |
| US2.3 | FR-009a, FR-033, FR-035 | Sharing-only approval starts no fresh verification; actual missing command authority is not bypassed. |
| US2.4 | FR-008, FR-034 | Withhold output/source details outside sharing even when the command is approved. |
| US2.5 | FR-009a, FR-009b, FR-010, FR-014 | Peer/source instructions grant no capability or workflow authority; retained inert LAN text is no universal containment proof. |
| US2.6 | FR-004, FR-007, FR-044 | No inherited permission from another session, matching name, changed connection, or wider scope. |
| US2.7 | FR-004, FR-005, FR-029 | Real local authentication/recipient/encryption negatives disclose no fixture content; simulated TLS alone is insufficient. |
| US2.8 | FR-042, FR-046 | Full native proposals through C for all profile forms; reuse T025's exact boundary, fill current host-reading gaps. |
| US2.9 | FR-043, FR-044, FR-045 | Actual current human root approval consumes once after normal presentation completion; proposing alone has no effects. |
| US2.10 | FR-018, FR-044 | Failed/refused/stale/interrupted/drifted/expired/consumed proposals cannot activate; reuse offline lifetime proof, verify native gaps. |
| US2.11 | FR-048, FR-049, FR-050, FR-051 | Reuse valid C+1/effect-negative/replacement evidence; qualify the delivered short native refusal, never replay a giant output. |
| US2.12 | FR-052 | Smaller-profile selection and new approval are explicit human actions; retain no-split/no-retry assertions. |
| US4.1 | FR-009a, FR-030, FR-033, FR-034, FR-036 | Actual harmless covered processes under both revision policies, with B's question-specific interpretation. |
| US4.2 | FR-012, FR-032, FR-036 | Actual fresh run records carry command/workspace/revision/environment/time provenance, separate from old files and inference. |
| US4.3 | FR-033, FR-034, FR-035 | Zero runs for absent/revoked/expired or changed command/workspace/revision/environment/effect coverage; copied approval is inert. |
| US4.4 | FR-013, FR-021, FR-036 | Observe failed/inconclusive process results and real host/tool limitations; report them without fabricated success. |
| US4.5 | FR-034, FR-035, FR-037 | Named output/resource effects need prior coverage; broader effects do not inherit approval. |
| US4.6 | FR-006, FR-022, FR-034 | New covered runs need no extra prompt within explicit repeat validity; an uncertain old run is never replayed. |
| US3.1 | FR-016, FR-024, FR-026, FR-028 | Observe local unavailable/busy/no-waiter and applicable host availability without queue, substitute session, or unrelated Work. |
| US3.2 | FR-017 | Actual receive completion leaves the current reply eligible; positive local exchanges cover this native gap. |
| US3.3 | FR-018, FR-019, FR-039 | Stop/invalidation withholds later sends and rejects late replies; retain each offline invalidator plus native gaps. |
| US3.4 | FR-040, FR-041 | Cancel actual harmless processes; distinguish request, direct exit, unknown descendants, and remaining effects. |
| US3.5 | FR-021, FR-022 | Real response/socket loss after possible delivery produces uncertainty, not replay; normal request completion is not loss. |
| US3.6 | FR-015, FR-023, FR-039 | Reject late/duplicate/unsolicited/cross-peer replies and history-based resumption; no old authority returns. |

The same applicability governs every success and visual criterion:

| Criteria | Requirement/scenario link | Disposition for this amendment |
| --- | --- | --- |
| SC-001, SC-007 | US1.1-US1.5; FR-001, FR-006, FR-030, FR-031 | Local AI/tool inspection and two follow-ups remain required; model-less direct calls cannot satisfy them. Retained LAN displays are bounded evidence, not a new pass or remote rerun. |
| SC-002, SC-008, SC-010 | US2.1-US2.7, US4.3, US4.5; FR-002, FR-004, FR-005, FR-008, FR-010, FR-029, FR-033-FR-035 | Preserve local authority/disclosure/permission negatives; real loopback security gaps remain. LAN counterparts are deferred. |
| SC-003, VSC-002 | US1.2, US1.3, US1.5, US4.2; FR-012, FR-013, FR-032, FR-036, FR-038 | Direct evidence must retain provenance and uncertainty. LAN records remain synthetic with execution unknown and the earlier advisory overclaim visible. |
| SC-004, SC-005, VSC-003 | US3.1-US3.6; FR-015-FR-019, FR-021-FR-023, FR-039-FR-041 | Retain local actual loss/cancellation/availability/late-reply and effects obligations; no remote or descendant equivalence. |
| SC-006 | All scenarios; FR-024, FR-025 | Claim only the exact observed local behavior/target after acceptance; retained LAN sharing cannot qualify deferred capability cases. |
| SC-009 | US4.1, US4.2, US4.4, US4.6; FR-033, FR-034, FR-036 | Actual local successful and failed/inconclusive fixture runs, with prior approval, accurate provenance/effects, and zero extra prompts for covered runs. Direct model-less verification is component evidence, not B's required AI interpretation. Physical-LAN execution stays deferred. |
| SC-011, VSC-001, VSC-005 | US2.2, US2.8; FR-003, FR-034, FR-037, FR-042 | Reuse native body evidence only within its receiver boundary. Complete current owner review, actual presentation readability, and notices still need qualification. Headless API output proves no TUI keyboard/focus behavior; absent TUI-only controls are not applicable to that run, not passed. App visuals remain deferred. |
| SC-012 | US2.9, US2.10; FR-043-FR-045 | Reuse delivered lifetime assertions; fill actual current root-input/normal-return/one-use gaps with manual human approval. Identity correlation does not establish review or authorize a controller/approval bridge. |
| SC-013 | US2.11, US2.12; FR-046, FR-048-FR-052 | Retain T026-T028 exact-bound/effect-negative/delivery evidence; only residual delivered-native refusal gaps remain. No recalibration or giant replay. |
| SC-014 | FR-047; completed T025 | Retain accepted six-case native calibration at C = 4490, unchanged. No new measurement or passing verdict. |
| VSC-004 | FR-042; exact approved interaction-v2 and preserved v1 history | Keep approved mock bytes and hypothetical values; no new artifact approval or native qualification is inferred. |

T019 reports each scenario/criterion with its requirement links, evidence reference, actual boundary, and passed/failed/unexecuted/deferred or partial disposition in the existing evidence channels. A retained result keeps its original verdict and limitations. T020 independently judges the complete amended scope; neither this table nor a copied completion supplies an approval or result.

There is no objective registry: use ordinary task verification evidence, not a compiled objective-evaluation contract. Do not create a second live workflow store.

## Traceability

| Spec obligations | Plan sections | Task/evidence boundary |
| --- | --- | --- |
| FR-046, FR-047; SC-014 | Fixed Output Bound and Calibration | Retained completed T025 CLI output calibration only; T020 reviews the frozen basis without rerunning it. SC-011 and VSC-005 Windows CLI host-interaction coverage remains with T019. |
| US2 8-12; FR-042 through FR-052; SC-011 through SC-014; VSC-001, VSC-003 through VSC-005 | Configuration/approval, native result, size guard, lifecycle | T026 guard/coupled tests; T027 independent offline; T028 delivery; T019 delivered Windows CLI native qualification. T021-T028 remain completed history. |
| US1/US2; FR-001 through FR-007, FR-024 through FR-026, FR-028, FR-029; SC-001, SC-002, SC-006, SC-008 | Transport, approval, delivery, native qualification | T014/T018 historical; T027 regressions; T028 distribution; T019 actual local support and bounded retained LAN evidence. |
| US1; FR-008 through FR-010, FR-012 through FR-014, FR-030 through FR-032, FR-038; SC-001, SC-003, SC-007; VSC-002 | Tools, evidence/answer, native qualification | T015/T017 historical; T027 regressions; T019 real local AI/tool evidence and follow-ups, plus retained LAN displays without repetition. |
| US4; FR-009a, FR-012, FR-013, FR-032 through FR-038; SC-003, SC-009, SC-010 | Verification, approval, evidence | T016/T017 historical; T025 practical profiles; T026/T027 command presentation; T019 real local commands and negatives. LAN command qualification is deferred. |
| US3; FR-015 through FR-019, FR-021 through FR-023, FR-039 through FR-041; SC-004, SC-005 | Lifecycle, cancellation, response/socket observations | T014-T017 historical; T027 regressions; T019 actual local loss, cancellation, availability, effects, and teardown. Physical-LAN counterparts stay unqualified. |
| All stories and FR/SC/VSC obligations | Sequence and requirement-linked acceptance applicability | T019 remains residual local qualification and retained-evidence assessment; T020 remains final independent review. No old completion supplies new approval or evidence. |
