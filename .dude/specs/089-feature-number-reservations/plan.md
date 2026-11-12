# Implementation plan: Feature number reservations

Owner: `.dude/ideas/089-feature-number-reservations.md`
Exact identity: `.dude/specs/089-feature-number-reservations/spec.md`

Deliver the collaboration proof first through separate normal Copilot signed-in
sessions and independent workspaces. Reuse the existing conversation, transport,
transcript, advice, publisher, and component fixtures. Consume the supported
SDK's runtime-owned stored OAuth/ghCLI sign-in directly in normal mode;
implement no login, auth service, token-copy, or provider flow here.
Strict isolated-worker qualification remains deferred and not passed.

The user's 2026-11-08T21:42:49Z reply supersedes the supposed incoming-feature
dependency while retaining the 2026-11-06T13:41:39Z collaboration-first/no-sign-in
direction. This definition stage grants no implementation, tests, native work,
merges, or Work resumption. Historical completed units retain their original
acceptance and evidence limits.

## Technical Context

**Language/Version**: JavaScript ES modules with JSDoc, Node.js >= 20. The existing Windows PowerShell/C# ETW helper remains a deferred strict-qualification mechanism.
**Primary Dependencies**: Existing Node helpers, bundled A2A SDK 1.2.0/Express 5.2.1, and public Copilot SDK `1.0.102-0.unstable.r41779900948.gf482387`. Use its documented normal `copilot-cli` mode; no new package, installation, service, dependency-pin, or merge change.
**Storage**: Existing `.dude/state/a2a/` journals/receipts and approved fixture/evidence storage. Copilot owns authentication secrets. The selected normal branch uses real home/configuration and normal runtime logging/storage; disclose those effects without claiming fresh-home or universal ambient isolation.
**Testing**: Reuse existing `node:test` collaboration, transcript, advice/publisher, and real mutual-TLS/fake-AI fixtures. Controlled integration follows the bounded source-backed assessment; actual native collaboration requires accepted integration and separate specific consent. Strict ETW/canary/auth-only checks remain deferred, not passed.
**Target Platform**: First native proof uses separate normal signed-in sessions and independent Windows workspaces on one computer. Physical LAN, macOS, Linux, and App operation remain unqualified; the product still requires no shared checkout, common Git metadata, or common host.
**Project Type**: Existing joined extension and capture CLI with the existing Feature-089 maintainer qualifier; authoritative source in `src/`, generated core in `.github/`.
**Performance Goals**: Begin/read/cancel <=1 second, operation <=120 seconds, answering worker <=90 seconds including startup/waits, and cleanup attempt <=10 seconds. Native timings remain unmeasured.
**Constraints**: Default-off A2A, one active operation, separate worker permit, one parent join, narrow evidence tools, unchanged permission/correlation/content/delivery checks, and 4,490 UTF-8 bytes per complete product proposal only. No new UI, authentication, extension, join, session, readiness, or observer framework.

## Current evidence and chosen structure

T004-T007, T009, and T010 retain their entire closed canonical units and
controlled/component acceptance. T008 retains its partial implementation,
accepted controlled integration and R6 event guard, synthetic Git fixture,
failures, verification, and review. Neither historical native layer ran.
The earlier strict fresh-home source-only T011 finding remains historical
**UNPROVEN**, not positive normal-route evidence or a reason to repeat opaque
native/auth-only investigations.

The current production path is `extension.mjs` -> `a2a.mjs` ->
`a2a-collaboration.mjs` -> `a2a-peer-worker.mjs`. The reachable compatibility
gap is specific: `parseCollaboration` requires `runtime.tokenFile`; `bind`
reads it; the worker supplies `gitHubToken` and `useLoggedInUser:false`.
The existing qualifier treats credential roles as paths, writes the worker
token profile, and reads A/B tokens in `prepare`/`startRuntime`. The normal
branch below must reach those actual callers, not a second harness.

The Architect's supplied source basis is
`C:\Users\EG\AppData\Local\copilot\pkg\win32-x64\1.0.102-0.unstable.r41779900948.gf482387\copilot-sdk`:
`types.d.ts:228-298,329-340` for `copilot-cli`, `baseDirectory`, and
`useLoggedInUser`; `index:15085-15139` for normal logging/resolver behavior;
`types.d.ts:3285` for `client.getAuthStatus`; and the supplied generated RPC
auth/metadata reference `generated/rpc:34980`. These are returned source
findings, not fresh SDK/auth reads or native observations in this definition.

Merged `089-github-login-pack-reads` is Canvas-session/public-GitHub-pack-read
device authentication with empty scope and an API-only credential destination.
It owns no Copilot/chat/worker sign-in. Keep it entirely separate: no dependency,
token handoff, auth-owner code, or adapter to its service belongs here.

Use the existing structure: T011 assesses the documented normal route against
current callers; T012 integrates the product; T013 updates the existing qualifier
through that product parser; T008 proves and documents the first milestone.
Source capability plus the actual interface/metadata, lifetime, and bounded
error design can support controlled T012 work while native account behavior
remains unproven. T011 acceptance and T012/T013 dependencies still apply.

## First milestone: preserved collaboration contracts

These are active obligations, independent of the deferred strict proof.
FR-001-020 retain collaboration-first acceptance, including narrow permission,
message validation, causal publication, and bounds. Normal runtime observations
do not certify universal confinement.

### Approval, runtime, and fixed loaders

Keep approved endpoints and pinned peer TLS certificates, project correlation,
configuration/workspace/session binding, expiry, and current root approval.
Project IDs and signed-in accounts neither enroll peers nor grant evidence
access. Transport approval does not grant worker effects. Retain the separate
disclosed worker permission and normal main-session permission handling; no
computed approval, `approveAll`, or implicit transfer between sessions.

Each complete product proposal discloses SHARING and WORKER effects, selected
runtime/model, the chosen authentication branch and expected account, approved
evidence roots/tools, normal configuration/resolver/logging/storage effects,
deadlines, retention, and shutdown limits. Keep the actual product renderer,
eligible native root approval classifier, and 4,490-UTF-8-byte limit. Refuse
overflow without truncation, annex, paging, or override. Trace the actual
rendered proposal size and accepted approval, not a size estimate.

The qualifier's complete digest-bound pre-consent scope is separately
authorized without that product cap, under the existing 2026-11-04T09:20:29Z
ruling. Keep its input/report limits and inert preview; do not import the product
renderer during preview. A native run needs fresh permission for its actual
models/accounts, roots, normal runtime effects, TLS/endpoints, reads, progress
edits, publication, recording, cancellation, and allowed lifecycle stops.
Old preparation/receipts, definition approval, or plan values are not permission.

Keep `a2a-sdk-loader.mjs`'s two fixed production loaders and provenance behavior.
Bind the actual production artifacts/sessions used by the proof; configuration,
another test runtime, or an injected SDK cannot supply native provenance.
T012 has no loader or extension-join writer. The normal branch explicitly
opts into usual SDK resolver behavior, not an auth-only or no-ambient-read
guarantee. Its environment allowlist does not certify the resolver's internal
read set. Preserve the existing strict branch and its guards.

### Worker contract and served-worker correlation

Retain the existing narrow evidence inventory/read tools, approved root-relative
references, safe read limits, and exclusion of secrets, TLS/configuration
material, links/escapes, and unapproved roots. No collaboration request grants
arbitrary writes, shell, delegation, or peer tools. Unrelated main-agent work
still needs its own normal permission.

Preserve operation/permit/main-session/provider/config/project/conversation/
question/exchange binding. Tie each accepted answer to the actual answering
session, actual returned admission ID, root model tool request, permitted read,
and model-authored explanation/citations. Preflight/direct RPC or a scripted
delay is not B's model read. Do not fabricate a parent invocation or inject
the answer into a parent prompt.

T012 adds a closed normal observation branch at the existing checkpoints.
Keep account and storage metadata bounded and secret-free. Missing observations,
overflow, cancellation, expired approval, or broken session/admission binding
refuse before further disclosure; none becomes a successful strict observation.

### Conversation and application messages

Keep A2A 1.0 direct `SendMessage` on SDK 1.2.0: one text request, direct data
reply, and the closed `dudeA2a` v1 envelope. Refuse Tasks, streaming, push,
redirects, and `returnImmediately`; do not infer v1.0.1 compatibility.

`dude_a2a_conversation` keeps `begin_receive`, `begin_ask`, `read`, and `cancel`.
Begin returns its operation/transcript handle before answering; admission is
not delivery/completion. Use the existing operation-owned cancellation and
shared finalizer, one active conversation, busy without queueing, and frozen
terminal outcome. Root abort, owner/context/config/session/provider loss,
expiry, and socket loss end acceptance; no late reply revives it.

Preserve tentative `1..999`, observed `0..999`, exact request/reply binding,
evidence hashes/citations, content limits, and fresh validity checks before and
after recording. A zero maximum requires valid inspected empty scope. Separate
known-unsent failure from possible disclosure. No automatic retry/reservation.

### Transcript and causal publisher

Each peer records actual authorized messages under root-safe
`.dude/state/a2a/<operationId>.jsonl`, preserving sequence/time/correlation,
write-started/admission/validation/terminal/gap distinctions, capacity refusal,
and recording-before-disclosure. Read-only terminal follow and retained reread
remain effect-free and escape terminal controls. Exclude secrets, authentication
and approval codes, private/system prompts, hidden reasoning, and SDK history.

A's answered journal stays exactly eight records:
`opened`, `accepted`, `request_prepared`, `request_write_started`,
`reply_received`, `reply_validated`, `terminal`, `closed`.
Do not append authentication, readiness, timings, OS proof, or control records
there or extend `advice.capture`. Use existing B observations and qualifier
reports for applicable bounded evidence; truncate no observation into success.

After A explicitly selects the recorded advice, preserve T007's closed
`--number-advice` route, ledger hash/canonical workspace/slug and conversation/
peer/reply binding, bounded reason, and gap-free actual journal lookup.
The actual publisher re-inventories and chooses
`max(freshLocalMaximum,acceptedPeerObservedMaximum)+1`, refusing diagnostics,
duplicate slug, or >999. Preserve expected-missing ledger creation, the <=4-KiB
one-use causal receipt, postcondition/lint rollback, exact reported path, and
ordinary no-advice command. Refresh/reopen/definition never allocate a number.

## Direct normal sign-in integration

### T011: assess the documented normal contract

Keep T011@r8c4n6p2's read-only authentication-compatibility assessment purpose.
Assess the pinned SDK's documented normal route and the actual production and
qualifier callers named above. Return source/contract references for constructor
mode, account APIs, actual new-session metadata, lifetime/ownership, cancellation,
and bounded failure behavior, with the minimum T012/T013 changes.
Use the supplied Architect findings; do not restart the deferred strict
auth-only investigation or require an actual account-positive run.

A usable assessment can support controlled implementation without claiming
native authentication, entitlement, continuous revocation detection, or
isolation. Report supported, unsupported, and still-unproven facts separately.
Retain the earlier strict source-only UNPROVEN finding with its original limits.
A concrete material contract gap stops the affected integration before writes;
it is not a dependency on Canvas pack-auth or permission to invent a provider.

Repository writers: none. Return the finding through the ordinary evidence
handoff, not a new report artifact, auth script, login, token request/readout,
OAuth/keychain investigation, runtime-store patch, or native launch.

### T012: minimal production caller integration

Keep T012@s6h3w9k5's production integration purpose, after a usable accepted
T011 assessment and its existing dependencies. Update `a2a.mjs`,
`a2a-peer-worker.mjs`, and `a2a-collaboration.mjs` together, with their three
generated counterparts, existing named tests, and directly affected docs/pins.
There is no loader, extension/join, transport, transcript API, publisher/advice,
Work, dependency, Canvas, profile-migration, or runtime/legal writer.

#### Closed configuration and approval binding

Preserve the old `runtime:{path,args,env,tokenFile}` branch and legacy
constructor unchanged. Add only the exclusive normal branch:

```text
runtime:{path,args,env,auth:{
  kind:'existing-sign-in',
  baseDirectory,
  expectedAccount:{host,login}
}}
```

Both branches, neither branch, unknown kinds/keys, and branch-mismatched
qualification data refuse before effects; no fallback. `baseDirectory` is an
existing absolute directory, <=1,024 UTF-8 bytes, resolved and disjoint from
workspace/evidence roots. Validate directory metadata only; never read its
contents. `host` is a canonical HTTPS origin <=256 UTF-8 bytes. `login` is
nonempty, control-free, <=256 UTF-8 bytes, and compared case-insensitively;
compare canonical hosts exactly.

The first normal branch is Windows-only, with `args:[]` and `env.set:{}`.
Use the existing explicit inheritance selection, allowing only `SystemRoot`,
`windir`, `ComSpec`, `PATHEXT`, `PATH`, `HOME`, `USERPROFILE`, `HOMEDRIVE`,
`HOMEPATH`, `APPDATA`, and `LOCALAPPDATA`. Require usable `USERPROFILE` and
app-data paths; if `HOME` is absent, use `USERPROFILE`. `TEMP`, `TMP`, and
`TMPDIR` remain worker-owned. Do not spread all of `process.env` or inherit
explicit credential variables. Bind the selected environment values and
resolved base directory to the current approval digest and rebind before use;
drift refuses under the existing approval/config rules.

The normal worker-input variant contains `auth` and no `gitHubToken`.
The normal `bind` branch never calls `readCredential`. Construct the actual
owned `CopilotClient` in `mode:'copilot-cli'`, with `useLoggedInUser:true`,
the approved real `baseDirectory`, owned CWD/temp, and no explicit token.
Keep normal SDK logging/resolution behavior disclosed; do not use the legacy
empty/fresh-home/logging-disabled constructor for this branch. Retain narrow
tools, reject-all worker permissions, and configured disabled optional
features, without certifying those settings as universal native confinement.

#### Actual account checks and closed observations

Use `client.getAuthStatus()` on that owned client and
`session.rpc.gitHubAuth.getStatus()` on its actual newly created session.
Use existing startup/operation deadline and abort guards for these queries;
a hung observation cannot extend the budget.
Before the first prompt, both must report authenticated, the expected
host/login, and `authType` of `user` or `gh-cli`. Missing, malformed, throwing,
or unsupported observations fail closed through bounded readiness failures;
unauthenticated is `auth_required`, and account mismatch is `auth_mismatch`.
Never emit raw errors, status messages, or credentials, or perform login,
account switching, token fallback, or a retry in another session.

Repeat the pair after the qualification latch, before returning evidence
text, and before accepting an answer. After every awaited check, recheck
abort, deadline, operation/session binding, and the current admission when
available. Use the existing single finalizer; stale success cannot revive
the operation. These are point-in-time account observations, not atomic
account locks, entitlement proof, or revocation certification.

Keep strict `worker_preflight` v1 unchanged. Normal mode emits only exclusive
v2, retaining existing worker/binding/session identifiers, loader/PID/runtime
version/protocol/model/scratch/catalog-schema-hash/timestamp fields and adding:

```text
auth:{
  runtime:{isAuthenticated,authType,host,login},
  session:{isAuthenticated,authType,host,login}
},
sessionStorage:{
  kind:'normal',metadataSessionId,workingDirectory,workspacePath
},
qualification: <bound qualification or null>
```

Only validated bounded public values enter this record. The two account objects
use the rules above; identifiers retain their existing 256-unit bounds.
Storage paths are bounded absolute paths (<=1,024 UTF-8 bytes), with
`workspacePath` allowed to be null. Match actual public metadata and the
storage getter to the local new session and owned CWD; recheck after the latch.
Normal storage need not be fresh owned home/config storage. Missing or
incoherent metadata/getter observations refuse, never become absence.

V2 omits strict ambient/probe results instead of fabricating successful
empty-input or negative-probe evidence. Normal discovery notices are not
isolation errors; unauthorized actions still refuse. Keep the required
evidence-tool catalog/schema observation, permission/correlation checks, and
all existing budgets. Update both the production checkpoint receiver and the
qualifier receiver to discriminate v1/v2, reject branch mismatches, and retain
recording/deadline guards. The qualifier receiver is T013's writer, not T012's.

Support the latch-only qualification v2 below in both T012's profile parser
and worker parser. Keep the 8,192-byte startup/receiving reservation, both
32-KiB profiles, the complete product cap, A's exact eight-record journal,
and `advice.capture` unchanged. Overflow refuses; no new journal record kind,
proof input, or success-shaped strict payload.

### T013: bounded collaboration qualifier integration

Keep T013@v4m7q2d8's qualifier integration purpose, after accepted T011 and T012.
Writers remain only `scripts/dude-a2a/qualify-collaboration.mjs`,
`scripts/dude-a2a/native-collaboration.mjs`, and their two existing tests.
There are no generated, production, observer, authentication-owner, or Work writers.

Add closed plan v3 exclusively for normal collaboration. Reuse common fields
and v2 main-progress fields; replace `credentials` with:

```text
auth:{
  kind:'existing-sign-in',
  a:{baseDirectory,expectedAccount},
  b:{baseDirectory,expectedAccount},
  worker:{baseDirectory,expectedAccount}
}
```

Apply the T012 path/account/environment rules to each role. V3 omits strict
`observation` and `artifacts.runtimePayload`; reject these or credential fields
in v3, unknown fields, and mixed branches. V1/v2 compatibility remains unchanged.
Select the branch before any effect; a failed strict run never falls through
to normal collaboration.

Normal worker qualification reuses exactly the four existing profile keys:
`{version:2,runId,fixtureRoot,fixtureSha256}`. Its bounded manifest is exactly
`{version:2,runId}`. Reuse current root/hash/run binding and closed startup/evidence
release helpers for pending-read latches; copy no strict canaries or control
fixtures. Qualification v1 is strict-only; v2 is normal-only. The product
profile/worker parsers and both observation receivers reject branch mismatch.

Update existing `a2aConfigs`, `prepare`, `startRuntime`, readiness, and lifecycle
helpers. Validate produced configurations through the actual T012 parser.
V3 prepares no worker token file and reads no A/B token. Construct both actual
main clients/new sessions through the normal route, with the selected real
base directories, owned workspace/temp, and no token; check both clients and
both sessions against their expected accounts before any model prompt.
Reuse applicable T012 account checks and post-await validity rules at later
disclosure boundaries. Reuse the existing progress, conversation, transcript,
capture, cancellation, and stop helpers; build no second harness.

The v3 pre-consent digest binds source/core/fixture/artifacts, selected
environment/base-directory/account bindings, and the full effects scope:
normal runtime authentication resolution, home/configuration reads, logging
and session storage, fixture/profile/TLS reads and writes, model calls,
messages/evidence disclosure, main progress, capture, retention, cancellation,
and authorized stops. Do not hide normal effects behind "existing sign-in."
Preview stays inert: no SDK import, account lookup, credential/TLS-content read,
client, process, connection, write, consent, or product-renderer import.
Permitted input/artifact and directory-metadata inspection supplies no auth proof.
Preserve expiry/change refusal, 16-KiB plan, 64-KiB report, complete separately
authorized qualifier disclosure, and the unchanged complete-product
4,490-UTF-8-byte cap and approval classifier.

Pure controlled injection always yields `controlled_only`, exit 4, including
v3. A native positive v3 result can only be `collaboration_qualified`, with
strict isolation explicitly deferred/not run/not passed. Neither injected
metadata, intended configuration, nor a failed strict run can yield native
success. Existing strict helpers, observer, R6 guard, and tests remain unchanged.

Preserve honest unconfirmed cessation and retained affected storage. Never
delete real home/configuration or claim complete process coverage from SDK
stop/parent exit. No auth-owner code, service, SDK dependency, observer change,
or generalized mode/profile framework belongs in this task.

## T008: actual collaboration qualification and documentation

T008@l9r3q6t4 remains the same qualification/docs task, with `[~]`, all six
current dependencies, partial implementation, and evidence retained. It is not
ready. After accepted T011/T012/T013 results, separate native authority, and
applicable execution admission, use the existing qualifier's v3 route for
this first milestone. Old strict-isolation portions remain deferred, not passed.

The future native script must observe:

1. Two actual Dudes in independent Windows workspaces, using separate normal
   sessions with direct runtime-owned saved sign-in. Bind actual runtime/session
   identity and account/permission observations; disclose normal resolver,
   home/configuration, logging, and storage effects without claiming isolation.
   Use the independent 100/101 fixtures and keep B's maximum/expected 102 out
   of A's prompt/local evidence.
2. Both actual product proposals and current root approvals with pinned peer
   TLS, current grants, approved roots, and their complete byte-size evidence.
   The human's literal input remains the approval source, not a parsed code
   turned into computed consent.
3. B's real model-requested permitted evidence read and reasoned A2A reply.
   Use the latch-only normal qualification and pending-evidence observations.
   Each main must request and finish its own unrelated authorized action while
   that read is pending, without a later root prompt. Existing `progress-a.txt` /
   `progress-b.txt` fixtures supply postconditions; a helper edit or scripted
   delay is not main-agent progress.
4. A's actual use decision and unchanged recorded advice through the actual
   publisher: fresh local 100, peer 101, choice 102, `influence:"raised"`,
   exact reported path, and causal receipt. No fabricated journal or publisher.
5. Human inspection of both actual messages live, then matching retained reread
   after session end. Under separately disclosed repeat scope, exercise one
   real pending cancellation with no late revival. Measure bounds and report
   delivery/cessation truthfully. Use only already authorized bounded lifecycle
   stops, retain unconfirmed storage/evidence, never delete real home/config,
   and infer no kill/delete authority.

Retain native rows 14 and 15 as the two live acceptance groups in the same
task: row 14 proves actual sessions/accounts/permissions, B's read/reasoning
and A2A reply; row 15 proves both mains' pending progress, causal publication,
human live/retained messages, cancellation, and bounded honest shutdown.
The old ambient/ETW/canary/auth-only/complete-tree certification portions are
explicitly deferred, not silently reported as executed. No component result
passes either current live group. Report any unconfirmed cessation as such,
not clean shutdown or strict qualification; administrative close is a separate gate.

Keep the existing T008 writer ceiling for qualifier/native helpers and tests,
the TLS test, build pins, and named operator docs. The observer source/test and
accepted strict control need no change for this milestone. Do not duplicate
T012/T013 implementation or repair production through generated files.
Retain all thirteen read-only final parity pairs in its canonical unit.
Update guidance only for implemented and actually observed behavior, including
direct saved-sign-in use and the separate Canvas pack-auth purpose.

## Retained deferred strict mechanisms

This section preserves the existing strict design and controlled evidence
without making it a first-milestone dependency or authorizing further work.
It is not a new task/platform. Completed T004-T007/T009/T010 units remain the
unaltered record of their historical requirements. Future strict qualification
needs its own applicable scope/permission. The old auth-only source-positive/
two-profile prerequisite is not an active route to this first milestone.

### Actual public session storage and existing readiness sequence

Retain the strict worker's empty mode, fresh owned work/home/config/temp,
disabled discovery/hooks/skills/MCP/memory/shared store/host Git, two evidence
tools, and denied worker permissions. Configured options alone never prove
these restrictions effective.

Keep T009/T010's fixed loaders, actual-session storage getter and two public
metadata snapshots, same local/fresh session/CWD checks, canonical directory
identity/freshness checks through pre-send, and closed `sessionStorage` observation.
Coherent null/undefined is observed absence only; errors never become absence.
Keep the exact tool catalog/schema checks, live invalid-argument cause,
empty ambient observations, actual admission/tool-call binding, early-event
handling, finite checkpoints/latches, and instruction-discovery refusal.
No caller-supplied proof, configured path, or status-only result substitutes.

### Qualification-only probes, fixtures, and latches

Retain the fixed recognized synthetic canaries, valid synthetic Git fixture,
same-session live/negative lookup controls, exact denied read/write/shell/MCP
causes, closed startup/evidence release records, and existing budgets.
They belong to the strict route; ordinary collaboration does not claim them
executed. Normal qualification reuses release/latch mechanics only, as specified
in T013, without canaries or strict probe results.

Retain the one genuine model-driven after-view positive control in the existing
owned control runtime after its discovery-only session disconnects: A's
separately approved model/account, only built-in view, exact target/source,
actual admission/request/start/output, public discovery notification before
passive post-turn queries, matching loaded-source discriminators/digest, and
process-bound target/source OS read deltas from a post-discovery baseline.
The actual strict worker remains the negative comparison. Static discovery,
direct RPC, a hook, model assertions, or proof inputs do not pass it.

### Accepted R6 control-event boundary

Keep the accepted exhaustive phase allowlists/default refusal, last-moment
synchronous pre-send gate, terminal-idle event-index boundary through both
post-turn observations, late-events-not-proof rule, bounded original-type/class
report, and separation of session-event judgment from shutdown OS coverage.
Preserve the fixed control-only human approve-once/reject relay, actual pending
call/path and post-wait checks, and the existing 60-second phase deadline.
These controls are unexecuted native obligations of the deferred strict scope,
not a requirement to run a control model for ordinary collaboration.

### Fixed Windows observation and cleanup

Retain `native-observer.ps1`'s 25 classes/input/providers/protocol, calibration,
PID/creation/image/exit identities and orphan tracking, continuous coverage,
and bounded worker-relative path observations from startup before association.
Keep public session-purpose classification and safe structural ancestors,
no sibling/private-store guesses, no persistence exception for absence,
and sticky 64-KiB aggregation overflow. Gaps, PID ambiguity, unclassified
activity, or missing public observations never prove isolation.

Complete observed owned-tree cessation remains a strict proof obligation;
parent exit/SDK stop is insufficient. Product `closed.runtime:unconfirmed`
and retained storage cannot be rewritten by later external observations.
The observer grants no kill, delete, elevation, service, credential, or broad
machine-trace permission. No observer/gated check is marked green here.

## Bounds and failure behavior

| Resource | Preserved bound and scope |
| --- | --- |
| Operation / answering worker | Earlier of grant/ask deadline and 120 s; worker earlier of remaining operation time and 90 s, including applicable startup/waits. |
| Startup / begin-read-cancel / cleanup | Existing <=10 s worker startup where used; <=1 s immediate tools while pending; <=10 s approved stop/confirmation attempt, no assumed tree-exit result. |
| Messages / evidence / output / observations | Existing `contentBytes`; both 32-KiB profiles and the 8,192-byte startup/receiving reservation cover the exclusive normal payload as well as unchanged strict v1. |
| Journal / retention | 1 MiB per journal, 16 KiB closing reserve, ten retained conversations; explicit deletion only, no silent rotation. |
| Product proposal / qualifier scope | <=4,490 UTF-8 bytes per complete product proposal; complete separately authorized qualifier scope has no such cap. Keep actual cap checks. |
| Qualifier / artifacts | Existing 16-KiB plan, 64-KiB report, 16-MiB SDK-entry and 1-GiB CLI/payload ceilings with bounded reads; v3 has no runtime-payload field. |
| Deferred strict mechanisms | Existing 60 s control phase, 16-KiB fixture manifest, 64-KiB canaries, 1-KiB releases, 128 process identities, and 64-KiB OS summary; no obligation to execute them for the first milestone. |

Recording readiness precedes disclosure; on failure stop disclosure and cancel,
with honest gaps/possible delivery. Preserve source/correlation/content and
delivery checks, safe closed failure reasons, and no secret/raw-error output.
Unknown active collaboration capability is a refusal, not an unrestricted or
success-shaped fallback. Deferred strict checks are explicitly unexecuted,
not silently skipped into a full-qualification success. Raise no cap.

## Phases, writer ownership, and verification

| Existing key | One-to-one purpose and trace |
| --- | --- |
| T004@d7k2m9q4 | Historical controlled worker; US1/2/4, FR-002/009-010/013-014/019. Entire canonical unit unchanged. |
| T005@f3n8r5v2 | Historical conversation/grants; US1/2/4, FR-001-003/009-014/018-020. Entire canonical unit unchanged. |
| T006@h6p4s9c7 | Historical recording; US3, FR-015-018. Entire canonical unit unchanged. |
| T007@j2w7b5m8 | Historical causal capture; US1/4, FR-003-008/018, SC-005. Entire canonical unit unchanged. |
| T009@n5v8c2s6 | Historical controlled loader/readiness; FR-002/009-010/013-020. Entire canonical unit unchanged. |
| T010@q7m2v8c4 | Historical controlled storage/discovery observations; FR-009-010/013-020, SC-004/006. Entire canonical unit unchanged. |
| T011@r8c4n6p2, after T010 | Same read-only compatibility assessment, now documented normal SDK/current callers; US5, FR-021-023/025/027, SC-007. No inherited completion or native proof. |
| T012@s6h3w9k5, after T010/T011 | Same production integration, explicit direct normal branch; US4/5, FR-009-010/014/016-023/025-027, SC-004/006/008. |
| T013@v4m7q2d8, after T011/T012 | Same qualifier integration, closed v3 through T012 and collaboration-only acceptance; US5, FR-009/016/019-023/025-027, SC-006/008. |
| T008@l9r3q6t4, after T007/T009/T010/T011/T012/T013 | Same native qualification/docs purpose for the direct normal milestone; US1-US5, active FR/SC. Strict FR-024 and related portions remain deferred, not passed. |

Keep all durable keys, dependencies, phase identities, writer ceilings, and
history. No drop, reset, rekey, split, successor, or closure. Separate
reconciliation removes the obsolete incoming-feature dependency from proposed
blocker wording; only the coordinator applies its state half after independent review.
T012/T013 still require their dependencies and acceptance, and T008 keeps its
terminal gate below.

Keep evidence layers separate: documented contract assessment, controlled caller
checks, real TLS with fake AI, and the two real native collaboration groups.
Use the existing focused suites and single-cause negatives rather than a new
matrix or framework. Retain T012's 9, T013's 6, and T008's 16 check rows.
Retain strict tests as regressions of their existing code without requiring
native observer/control execution for collaboration. None has run in this
definition. Report executed/failed/skipped counts and limits. On Windows run
each file/selector in its own process; add no Canvas check.

## Terminal Work and coordinator disposition

The supplied T008 state remains terminal `hard-stop` / `evidence-incomplete`
at accepted revision 5, with no original owner fence or published terminal
handoff and the retained control pair whose key begins `b6fe4f22`. Preserve
ownership controls, pending state, failures, learning, counters, captures, and
history. This is supplied provenance, not a fresh Work inspection.

The new scope changes product acceptance only. It grants no fresh claim,
old-run continuation, cleanup, MANUAL disposition, runtime/Work-policy change,
or Git action. Same-key administrative close must still satisfy the existing
owner procedure, current acceptance, genuine retained provenance/terminal
evidence, fresh ownership/effect checks, exact control disposition, and separately
bound current human close authority. Scope approval supplies none of those.
Do not promise readiness, resume, or close and do not evade the gate by renaming
a phase or replacing the key.

## Guardrails and handoff

Existing project/bundle guardrails continue; no new rules or supporting package
files are needed. Earlier Q7-Q10 remain attributed definition-owner choices,
not rewritten user answers. The direct normal route is the settled current
choice, not a new brainstorm alternative or native approval.

Generate only task-listed `.github/` outputs from authoritative source through
the existing build, using a disposable projection root and carrying back only
those files. Preserve profiles, pack/model overrides, manifest refs,
068/076/090-093 workflow bytes, selectors, T007 schema/skills, SDK/Express/esbuild
pins, runtime/legal and Canvas assets. Maintainer helpers/tests remain excluded
from release. No broader workflow migration, platform, or auth future is planned.

Return the staged trio and one-to-one proposed units/reconciliation for
independent review. The coordinator owns final metadata/glyph composition,
byte-preserved history splicing, snapshots, reconciliation events, atomic
publication/rollback, and fresh lint. Keep board/archive/discovered/objective
regions absent. No readiness claim is allowed until coordinator lint reports
zero failures; native acceptance and the terminal close gate remain separate.
