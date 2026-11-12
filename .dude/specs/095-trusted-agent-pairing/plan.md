# Implementation plan: Trusted agent pairing

Owner: `.dude/ideas/095-trusted-agent-pairing.md`
Exact identity: `.dude/specs/095-trusted-agent-pairing/spec.md`

Add reusable local approval to the existing A2A provider. Keep the current
native proposal and `dude a2a approve <code>` interaction for enrollment.
A profile opts in; a later `dude_a2a_propose` call with a matching stored grant
activates it directly and reports that fact. Add one small storage module,
not another tool, approval channel, transport, or session framework.

## Technical Context

**Language/Version**: JavaScript ES modules with JSDoc; Node.js >= 20, as used by the existing extension and tests.
**Primary Dependencies**: Node built-ins; existing bundled A2A SDK 1.2.0 and Express 5.2.1; current Copilot SDK loaders. Change no dependency, runtime bundle, or legal notice.
**Storage**: One small standing-approval file per opted-in profile, beside the canonical external configuration in a dedicated sibling directory outside repositories. Existing conversation journals remain unchanged.
**Testing**: Existing `node:test` provider, collaboration, verification, transcript, real-loopback-TLS, and build fixtures; one focused storage test file. No native CLI, real model, login, credential, interactive prompt, package install, or new acceptance harness.
**Target Platform**: Existing Node extension platforms; existing-sign-in workers retain their Windows-only gate. Controlled Windows/loopback evidence makes no additional native-host, LAN, or cross-platform support claim.
**Project Type**: Existing joined extension; edit `src/`, project generated runtime copies into `.github/`, and update the existing operator guide.
**Performance Goals**: No startup scan or background poll; one bounded local grant read at existing authority checks. Preserve the 5-second queue check, conversation/worker/cleanup bounds, and one-operation limits.
**Constraints**: Keep the fixed 4,490-byte complete-proposal limit and independent 1 MiB configuration/TLS limits. Never store authority under `.dude/state/`, accept peer consent, replay an exchange, or change 089's qualifier and task.

## Guardrail checks

- The coordinator selected the exact draft ledger and absent prospective
  package, Lightweight lane, and a prerequisite plan containing only 095.
  Staging uses that prospective owner; publication must recheck the preimage
  and direct identities through the first-definition transaction.
- Existing project and bundle guardrails apply. There are no new project-wide
  candidates, no guardrail write, and no autonomous ratification claim.
- Keep WHAT/WHY in the spec. The core trio is enough; storage, contract details,
  and verification fit here without supporting placeholder artifacts.
- Reuse the approved native inspect-then-type interaction convention: the owner
  sees the exact scope before accepting it. Persistence is another explicitly
  disclosed effect of that approval. Add no new visual direction, control,
  viewer, approval relay, or UI source; infer no new mock approval.
- Reuse producer-owned binding and lifecycle checks rather than duplicate
  authorization in the conversation module. The new helper has one current
  caller, `createA2a`, for this feature's required durable local grant.
- Preserve uncommitted, reviewed 089 guide edits. No task writes its package,
  native harness, logs, live state, or local configuration. No live-workspace
  Git mutation or native-host activation is part of these tasks.

## Current production path and chosen structure

`src/extensions/dude/extension.mjs` creates `createA2a`, registers its existing
tools, forwards session events, and joins once. No new wiring or tool name is
needed. In `src/extensions/dude/lib/a2a.mjs`:

- `parseProfile` and `parseA2aConfig` validate closed owner configuration.
- `bind` constructs the current identity; `bindProposal` also checks command
  validity. `renderProposal` produces the complete native result.
- `propose`, `approve`, and `activate` own preparation, eligible local approval,
  queue checks, transport startup, and activation notices.
- `admissible` rechecks authority for asking, serving, verification, and the
  `createConversation` host callbacks. `release`, `end`, `interrupt`, and
  `handleEvent` already terminate the corresponding live work.
- `ownerIdentities` and `readEvidence` exclude owner files from evidence.

Add `src/extensions/dude/lib/a2a-pairing.mjs` for only the deterministic storage
path and bounded grant reads/writes. Its proposed internal exports are
`pairingPath`, `readPairing`, and `writePairing`. Keep stable binding assembly
in `bind`, beside the existing binding it derives from.

`a2a-collaboration.mjs` already reaches the provider through `host.admissible`
before admission, worker checkpoints, evidence reads, and reply handoff.
Keep that path and the activation-bound worker permit. Neither that module,
`a2a-peer-worker.mjs`, nor the transport needs a new pairing protocol or store.

## Profile and enrollment contract

Add one optional boolean, `pairing`, to both profile shapes. Absence or `false`
keeps today's behavior; `true` requests standing approval. This configuration
value is a request, never consent. Keep `dude_a2a_propose`'s existing closed
arguments, `configPath` and `profileId`; there is no grant path, approval token,
consent boolean, or scope override in tool arguments.

Reject `pairing: true` when a serving worker has a `qualification` block.
The existing qualifier continues generating ordinary profiles and obtaining
its native consent and typed activation approvals. Do not edit it to use pairing.

For an unpaired or nonmatching opted-in profile:

1. `propose` performs the existing preparation and size/queue checks. It returns
   the complete native body and leaves a pending proposal, without writing a
   pairing or starting transport, verification, or a worker.
2. `renderProposal` retains every existing applicable SHARING, COMMANDS,
   WORKER, project, binding, limit, and risk disclosure. Add a clearly labeled
   PAIRING section: approval persists across future matching local sessions;
   numeric allowances reset per activation; absolute expiries do not extend;
   show the exact external record path and revocation action.
3. Keep the exact current `dude a2a approve <code>` command. Its code remains
   single-use, but this proposal's approval explicitly saves a standing grant.
   `classifyInput`, `approve`, pending readiness, and next-root-input rules
   remain the only enrollment route. Model readability supplies no approval.
4. After settling queue checks and rechecking the exact proposal, save the
   pairing before starting this enrollment's transport. A storage failure
   returns an inactive failure; it cannot fall back to one-use activation.
   The enrollment's own activation then uses the same record-checked standing
   authority as later activations, so revocation applies to it too.
5. If saving succeeded but transport startup later fails, retain the approved
   pairing and report "paired, inactive." A later fresh local request can
   reuse it. Do not retry the failed activation automatically.

The pairing text must disclose ordinary root-input spoofing and unrestricted
local-file-write forgery. Do not display secrets, private keys, token values,
or fixed environment values. Keep ordinary nonpairing proposal text unchanged.
For pairing text, shorten redundant prose if necessary, never omit a scope,
command, effect, or risk to fit the cap. Test practical ask, share-only,
command, and ordinary worker profiles within 4,490 bytes; oversized profiles
refuse rather than raising the cap.

## Exact binding and lifetime

Extend `Binding` with a stable `pairingDigest`, computed from a fixed-order
identity assembled by `bind`. It covers:

| Included binding | Concrete source |
| --- | --- |
| Local participant | Normalized workspace path, canonical real workspace, and its filesystem directory identity, so replacement at the same path does not inherit approval after a restart. Serialize file identity exactly. |
| External configuration | Normalized and canonical configuration path, SHA-256 of its exact bytes, and exact case-sensitive profile ID. A whitespace or unrelated-profile edit invalidates reuse conservatively. |
| Selected peer and scope | The parsed profile and selected command definitions already included in `bind`: role, labels, endpoint/listener, peer certificate pin, local TLS paths, sharing and exclusions/purpose, evidence roots, project correlation, limits, expiries, command/revision/environment policies, and worker configuration. |
| Bound material | Digests of the local TLS certificate/key bytes and token-worker credential bytes; for existing sign-in, `bindSignIn`'s resolved base directory and selected environment values. Hash these inputs; persist none of their values. |

Exclude only transient session ID, provider generation, proposal nonce/code,
invocation ID, exchange/operation IDs, worker permit, and counters. Each new
activation still gets a fresh ordinary session/provider/nonce binding for its
own lifetime. Never weaken the existing `digest` comparison to achieve reuse.

An evidence-file edit is not a new sharing policy. Current evidence inspection
and command revision checks still decide its use. Inherited environment names
retain their approved existing policy; do not invent a freeze of every ambient
host setting or read runtime authentication stores. Project IDs remain
correlation, not remote-workspace attestation. Mutual TLS still checks the
actual peer on every connection.

There is no standing activation-count budget, automatic expiry extension,
or durable operation counter. Existing numeric `repeatUse` values apply to
each fresh activation and that repeated use is explicit at enrollment.
Command expiry during an active connection still withholds commands without
ending otherwise valid sharing; `bindProposal` keeps its existing stricter
check before a new activation. Changing expiry or dropping an expired command
changes the scope and requires fresh pairing approval.

Matching is equality against the saved scope, not automatic updating. A
different current scope cannot use the record. Restoring the original bytes
can match again; owners must delete the record to revoke permanently. No
tombstone, migration, history, or invalidation journal is needed.

## Local record and revocation

Use this single layout, derived from the canonical external config path:

```text
<canonical-config-path>.pairings/<sha256(exact-profile-id)>.json
```

Hashing the exact profile ID avoids case-insensitive filename collisions
without changing the accepted ID grammar. The directory is a sibling of the
configuration file, not a child of the workspace. There is no global index or
discovery scan. The sole record is a closed object:

```json
{"version":1,"bindingSha256":"<64 lowercase hex characters>"}
```

Use bounded regular files, at most 1 KiB, and reject unknown keys, versions,
invalid digests, links, nonregular files, and unreadable content. A genuinely
absent record is the first-enrollment case; a damaged record is a refusal.
Do not store proposal text, code, session state, keys, credentials, timestamps,
transcripts, or derived task state.

Validate the storage path before reading or writing: it must be outside the
canonical workspace and outside any ordinary Git checkout/worktree ancestry,
detected by `.git` file or directory markers without running Git. Resolve
existing parents and reject linked storage directories. Recheck at use; an
ignored location inside a repository is still disallowed. If the external
configuration itself is in another checkout, pairing refuses until the owner
selects a suitable nonrepository local configuration location. Ordinary
nonpairing configuration behavior does not change.

Create the directory only after eligible local enrollment approval. Write a
new record to an exclusively created sibling temporary file and rename it
into place; a caught failure must preserve the previous record and remove
only that attempt's temporary file. Request owner-only file/directory modes
where supported. Promise neither crash-proof transactions nor protection from
an actor already allowed to write those files. No ACL service, secret store,
signature, or adversarial concurrent-directory-swap defense is introduced.

Add the derived record paths for the configuration's profiles to `ownerFiles`
so the existing evidence reader excludes them, including through file identity.
Do not put records in `.dude/state/a2a/`: that repository surface is not an
authority-safe location merely because a transcript writer may create an ignore
marker. Leave transcripts and their retention policy where they are.

The operator revokes locally by using `dude a2a stop` for immediate termination
of current participation, then deleting the exact record path shown in the
proposal and automatic notice. Deletion works while Dude is not running and
requires no peer acknowledgment. Active paired checks reread the record;
deletion alone ends authority at the next checked boundary. There is no
filesystem watcher, remote revocation message, or new unpair/status tool.

Stop alone ends the current activation and leaves the standing grant intact.
It starts no replacement. A fresh later local activation request can reuse the
grant. Editing or disabling the profile is not a substitute for deleting it:
restoring the originally approved configuration can otherwise match again.
Owners must keep the external directory local and must not sync or export its
grants. The product neither copies them across machines nor claims to detect
arbitrary backup/synchronization software or deliberate file forgery.

## Automatic activation and notices

Within `propose`, validate the invocation, workspace, profile, and complete
candidate size before considering reuse. For `pairing: true`, read the derived
record and compare the stable digest:

- **Absent or nonmatching:** return the complete enrollment proposal and no
  activation. Describe a nonmatch honestly; replace its record only after
  fresh exact local approval.
- **Malformed, unreadable, or unsafe:** return a bounded refusal with no
  pending code and no activation. Do not echo record content.
- **Matching and otherwise eligible:** create a fresh `Activation` with
  internal authorization source `pairing`, its expected record/digest, and
  the new session-bound proposal identity. Set no pending approval code.
  Await the common `activate` path and return its actual outcome.

Refactor `activate` only enough to report completion to the automatic caller
while retaining `approve` as its ordinary event-driven caller. Keep the same
queue settling, post-await context/binding checks, transport cleanup, expiry
timer, and failure handling. The automatic call's cancellation signal owns
startup until its result returns; normal completion-abort must not end the
resulting activation. A stale completion cannot replace current state.

Before any automatic communication becomes admissible, send a required local
notice through the existing `log` path. It must identify automatic use of a
standing pairing, profile/role, peer and fingerprint, local workspace,
SHARING and the presence/IDs of separately approved COMMANDS/WORKER,
effective validity/limits, the record path, and the stop-then-delete revocation
action. It asks for no response. Failure to deliver it must leave no live
communication. Do not make `activation.live` available while that notice is
still pending. The tool result reports `active` only after successful startup
and final checks; a stored grant alone is never reported as a live connection.

`activationText`, the provider header, and the existing tool descriptions must
explain both authority sources. An automatic result must not contain a fresh
approval instruction or claim "preparation only." Ordinary proposal review
stays in the native tool result; logs never become its substitute. Successful
log delivery is not proof of actual host visibility.

Extend `admissible` to require the same readable, matching standing record for
an activation using pairing, in addition to the current session binding.
Removal, corruption, mismatch, or disallowed location ends the activation
through existing `end`/`release`, including its conversation and worker.
Use that shared check at existing admission, send, reply, verification, and
worker boundaries, including after awaits. Apply the same record comparison
during `activate` startup, before opening transport and again after its awaits,
including immediately before making the activation live. Do not call the
live-only `admissible` predicate as a substitute for these startup checks.
Never cache approval until restart.

Create a new worker permit for each fresh paired activation only when the
saved exact scope included its separately displayed WORKER grant. Preserve
worker account checks, narrow tools, deadlines, recording readiness, and
uncertain cleanup. Old permits, operation handles, and replies cannot migrate.
There is no transport/worker inheritance shortcut.

## Automated acceptance and regression coverage

Use real production handlers and file storage. Synthetic root messages are
test inputs, never human consent. Required pairing checks must not be skipped
or replaced by source-text assertions.

| Checks | Existing fixture and intended extension |
| --- | --- |
| Storage and stable identity | New `a2a-pairing.test.mjs` uses disposable external folders. Exercise missing/malformed/unreadable records, bounded writes, failed replacement preservation, repository/worktree exclusion, distinct profile IDs, and no secrets. Provider tests compare reuse across new session/provider identities and refusal for each stable binding group. |
| Complete enrollment and ordinary regression | `a2a.test.mjs`: extend `providerFixture`, `proposalTool`, `propose`, and synthetic `userMessage` cases. Check no effects before approval, persistence only after valid root approval, single-use/ignored-origin/queue/cancellation behavior, unsafe storage, and normal one-use profiles. |
| Size eligibility | Exercise pairing ask, share-only, command-enabled, and ordinary worker proposals at 4,490 and 4,491 UTF-8 bytes with valid companion inputs, including multibyte content. After enrolling an at-bound profile, lengthen only the new session's displayed identifier so the stable grant still matches but the complete candidate exceeds the bound. No record bypass, code, listener, worker, command, or revision probe is allowed. |
| Current scopes and loss of authority | `a2a.test.mjs`, `a2a-verify.test.mjs`, and `a2a-collaboration.test.mjs`: exact binding mutations, expiry, per-activation limits, stop/context changes, deletion before send and during held work, held notice failure, no stale activation/result, and exclusion of pairing records from evidence. |
| Worker and recording integration | `a2a-collaboration.test.mjs`: paired worker approval produces a fresh permit; sharing-only or changed worker scope does not. Keep actual recorder and controlled worker/account checks, recording failure, retained reading, and known/unknown outcomes. No worker module permission policy is relaxed. |
| Actual transport across restarts | Extend `a2a-collaboration-tls.test.mjs`'s existing `runPeer` and independent-process fixtures. Enroll each side once using synthetic eligible inputs; perform two later automatic activations and conversations, recreating both providers/sessions for one. Reuse the same external config/grant files and real mutual TLS. Count zero later approval inputs/prompts. Confirm actual messages and transcripts, deletion refusal, and no replay. |
| Qualification compatibility | Run existing controlled `qualify-collaboration.test.mjs` and `native-collaboration.test.mjs` unchanged. Also test that a profile cannot combine pairing with worker qualification. These are automated regressions, not permission to invoke the native qualifier. |
| Distribution and operator contract | Extend existing build tests to cover the new runtime/test-only files, source/generated byte parity, paired behavior from disposable generated output, and guide wording. Retain all ordinary native-result and qualification assertions. |

For wrong-peer transport tests, keep the approved configuration valid and
change the presented peer identity, so a preceding local mismatch does not
hide a broken TLS check. Use the existing controlled file/transport/clock/worker
seams for deterministic error paths, not a new generic test framework.

Run each listed test file in its own Node process on Windows. Keep roots short
and test-owned, outside retained evidence directories. Report executed, failed,
and skipped counts by command; historical skips are not new coverage.
Actual-host and live-native qualification remain the spec's separately labeled,
nonblocking deferral. No acceptance command asks the user to type consent.

## Operator guide and build projection

Update only the affected configuration, Propose, Approve, Status, Stop,
security/limitations, and collaboration-scope passages in
`docs/agent-to-agent-communication.md`. Explain `pairing`, first enrollment,
automatic results, exact-match invalidation, record location, deletion versus
stop, per-activation allowances, and the local-writer trust limit. Scope
"fresh approval for each activation" and "propose never activates" statements
to the nonpaired path. Preserve the reviewed 089 native-run instructions,
run observations, consent wording, and all historical evidence.

`scripts/build-dev.mjs` uses `listCoreOutputs`/`writeCoreOutput` from
`scripts/build-release.mjs`. `isDudeExtensionRuntimeFile` includes runtime
files under `.github/extensions/dude/lib/`, excludes test files and
`node_modules`, and projects extension runtime bytes without rebundling.
No build filter change is needed for `lib/a2a-pairing.mjs`. Add it to the
runtime inventories in `scripts/build-dev.test.mjs` and
`scripts/build-release.test.mjs`; add the new test to their test-only inventory.
Keep SDK/legal and Canvas asset pins unchanged.

Generate using `node scripts/build-dev.mjs` in a disposable copy containing
the current source, not directly in this dirty checkout: that builder cleans
and rewrites the whole core and may reconcile development-base metadata.
Copy back only `.github/extensions/dude/lib/a2a.mjs` and
`.github/extensions/dude/lib/a2a-pairing.mjs` from that output. Verify their
byte parity through the build tests. No other generated or metadata write is
part of this feature, and generated files are never hand-edited.

## Phases and traceability

| Phase / canonical task | Deliverable | Spec trace |
| --- | --- | --- |
| 1 / T001@k8m2q7v4 | External record helper and stable binding, with focused tests | FR-005, FR-006, FR-011, FR-026; SC-002 |
| 2 / T002@r5c9n3h6 | Explicit persistent enrollment through the existing typed handshake | US1/US2; FR-001-007, FR-010, FR-012-014, FR-018, FR-022-024; SC-002, SC-005 |
| 3 / T003@s4w8d2p7 | Fresh automatic activation, shared revocation checks, and notices | US1/US2/US3; FR-008-021, FR-026; SC-001-005 |
| 4 / T004@t6j3b9f5 | Repeated real-TLS conversations and boundary regressions | US1/US2/US3; FR-003-005, FR-008-026; SC-001-006 |
| 5 / T005@v7g2x4m8 | Narrow guide update and generated runtime delivery | FR-002, FR-006, FR-019, FR-022-025; SC-004-006 |

Tasks are serial because they share the provider and its fixtures; none is a
parallel candidate. This is first definition, so every canonical task is new
and open. There is no previous task reconciliation, archive, or execution
history to rewrite. Independent verification, review, publication, and lane
state remain with their existing owners.
