# Agent-to-agent communication

Dude's core extension can let one existing Copilot session ask another existing
session a question and receive a reasoned answer with attached evidence. The
answering session can also run commands its owner approved in advance and
attach what it observed. Both sessions must be on the same computer or on the
same private LAN. Each owner first reviews a complete native proposal result,
then approves it separately in their own chat. Preparing a proposal leaves the
feature off.

## Current status

The native proposal-result path and its fixed 4,490-byte guard are delivered.
Independent offline acceptance covers complete content, the UTF-8 byte bound,
oversized refusal, and approval lifetime. Local distribution checks cover the
generated A2A module and disposable releases. These are separate from native
host qualification: no host or peer combination is qualified for the full
scope, and Dude does not claim support for any real use.

Feature 089 adds optional nonblocking collaboration between two independent
Dudes: the `dude_a2a_conversation` tool, B's restricted evidence worker,
bounded local transcripts with a read-only live view, and optional peer
number advice for a first capture. Its source, controlled checks, and a
real-TLS component suite are delivered. One native run of its normal route
passed on 2026-11-12 on one Windows computer. It observed an actual
independent AI exchange, unrelated main-agent progress, causal capture, live
and retained inspection, and a real cancellation, but not confirmed cleanup:
process-tree cessation stayed unconfirmed. See
[First passing normal-route run](#first-passing-normal-route-run) for its
evidence and limits. The maintainer runner's native branch is implemented, but
its strict route and fixed Windows observer are unverified: the strict route
has never run natively, only controlled checks have exercised the observer,
and the qualification preview still reports every native stage blocked. The
native branch now observes the two prerequisites it once could not: one
model-driven after-view control, and the session storage B's worker records,
whose files it classifies by documented purpose. Only controlled checks have
exercised them; whether a native host passes either is unknown.
See [Collaboration between two Dudes](#collaboration-between-two-dudes).

B's evidence worker can instead reuse the Copilot runtime's own saved
sign-in, on Windows only, without a token file. This existing-sign-in branch
is implemented in the product, and controlled checks and the real-TLS
component suite exercise it with fake SDKs. The passing native run used this
branch, with both mains also on their saved sign-in: every runtime and session
it checked reported the expected account, and B's worker read its evidence and
answered. In an earlier attempt, the worker had ended with
`unexpected_native_effect` after its prompt was admitted, before it read any
evidence. Strict isolated-worker qualification is deferred and not passed for
this branch. The Canvas GitHub sign-in in Settings > Accounts, which reads pack
sources, is a separate feature that collaboration never uses. See
[Existing sign-in](#existing-sign-in).

The approved remaining acceptance scope is local GitHub Copilot CLI on one
Windows computer, with two isolated session/workspace contexts, real loopback
TLS, and harmless fixture processes. Retain the three observed Windows-to-Windows
LAN share-only exchanges as narrow evidence. LAN capability remains available,
but broader LAN qualification is unclaimed. Untested physical-LAN command,
failure/cancellation, security-negative, and availability cases, macOS/cross-OS,
and App-specific qualification are deferred, unqualified, and nonblocking for
this increment. Do not use the GitHub Copilot App for remaining testing. All
applicable local functional, safety, lifetime, AI/tool, process, negative-case,
and final-review obligations remain.

These offline checks have passed:

- Offline tests of the closed proposal tool, complete returned text, approval
  lifetime, configuration parsing, both sides of an exchange, evidence
  handling, named commands, cancellation, and the transport. They use fake
  hosts and in-memory connections; nothing listens on a network port. Exact
  4,490-byte acceptance and 4,491-byte refusal are covered independently and
  at the delivered-module boundary, without qualifying actual host display.
- Delivery checks: the generated `.github/` copy and a disposable release carry
  the A2A modules, the bundled runtime, and its license notice byte for byte,
  without tests, `node_modules`, or build tooling. The released extension,
  started in a fake host without the optional `a2a` pack, still registers Needs
  You and the Dude canvas through one join. Proposal preparation keeps the
  feature off and loads no A2A runtime.

### Observed native cases

These retained observations qualify only the cases named here:

- On 2026-09-29 UTC, two same-computer Windows native CLI exchanges completed.
  B's model inspected all five synthetic retained fixtures with local tools.
  Both answers preserved exact whole-file bytes and hashes, provenance, and
  the conflict, missing-revision, partial-coverage, and third-party limitations.
  No commands ran and no fresh verification run record was supplied. Two
  exchanges mean one follow-up, short of T019's initial exchange plus two
  follow-ups. The user manually changed host permission and mode controls;
  the original `failed_acceptance` artifact remains unchanged, with separate
  operator attribution. This is functional CLI evidence, not a clean
  unattended result or App/macOS support.
- On 2026-09-30 UTC, the normal Copilot App B command-enabled minimal proposal
  display passed on native CLI package `1.0.87-0` at 2576x1408. Native **Copy
  raw output** exactly matched the 4,113-byte tool result and, after masking
  only dynamic IDs and the approval code, the oracle. Every field and the one
  command was present; the fixed environment name was visible, its value
  hidden, and no key material appeared. Full Windows UI Automation (UIA)
  reading order, keyboard/focus, scrolling, wrapping, and geometry checks
  passed. Directly measured contrast was 13.222:1 for result text and 6.406:1
  for essential controls. Open, Copy, and close were responsive at that
  viewport; other viewport sizes and performance benchmarks were not tested.
  Reopening the result after idle shutdown showed historical text, not current
  approval eligibility.
- The 2026-09-30 UTC supported-bound App case failed. A valid 1,048,356-byte
  configuration with 2,328 selected commands had an expected 1,145,494-byte
  proposal. The native host replaced it with an 862-byte temp-file notice and
  500-character preview. The native event's `detailedContent` was also
  incomplete at 5,161 bytes. No command blocks or approval field were exposed,
  and the App offered no full Raw/Copy controls. This is one observed case,
  not a universal command-count or output threshold. See
  [Propose](#propose) for the stop-before-approval rule.
- A separate model-less native execute probe on 2026-09-30 UTC returned only
  5,265 bytes of a 1,145,494-byte public SDK `sessionLog`, even with a 33-byte
  `textResultForLlm`. That direct path emitted no `tool.execution_complete`
  event or `detailedContent`, so model-path/App routing remains unverified.
  `sessionLog` is not a demonstrated fix, and no production workaround has
  been applied.
- In the accepted capture from 2026-10-01T00:54:48Z to
  2026-10-01T00:54:56Z, six model-less native CLI direct-RPC results retained
  their complete expected text, including both 4,490-byte boundary cases.
  The receiver was CLI `1.0.87-0`, protocol `3`, with SDK declared
  `1.0.90-0`, protocol `3`. This calibration supports the frozen byte bound
  only. It does not prove App visual or accessibility behavior, model-delivery
  equivalence, human review, or peer/LAN support, and it did not exercise the
  new guard.

- On 2026-10-01 UTC, user-supplied native CLI displays for physical Windows A
  (.154) to B (.193) contained an initial response and two question-specific
  follow-ups. The coordinator recomputed all 15 whole-file excerpt hashes
  (five synthetic retained fixtures per response); every expected size and
  hash matched. Question and `peerExchange` IDs matched B's native sent status
  for each reply. The displayed B certificate matched the configured pin,
  and its endpoint matched the configured peer. The native adapter reported
  TLS/correlation/binding checks, and file-read times advanced. Each response
  retained the exact marker `no run record supplied; execution unknown`.
  The peer initially invented a two-independent-passes criterion; its final
  follow-up clarified that as advisory, not a recorded requirement. The user
  supplied native stop results at `2026-10-01T23:54:27.344Z`: both activations
  inactive and B's listener closed. At `2026-10-02T00:02:05.105Z`, B's exact
  test-firewall-rule query returned count `0` after manual cleanup. These are
  narrow functional transport, evidence, and stop observations, not a raw
  wire capture, permission-history audit, real command or process outcomes,
  full Windows/LAN support, or fresh scope permission.

### Remaining qualification

Fill the remaining local native/live gaps with supported CLI orchestration and
direct native-result capture, minimizing manual relays. Reuse accepted offline,
calibration, and delivery evidence within its recorded limits; do not repeat
LAN setup or conversations. A full native runner for this remaining scope has
not been completed or run. Full native owner review and the exact current
local root approval remain human-owned; no code extraction/submission, replay,
new viewer, or approval bridge is authorized.

These remain unqualified beyond the observed cases:

- Complete local Windows CLI native custom-result visibility, scrolling, keyboard
  access, and applicable accessibility across all required profiles and
  supported bounds, with full owner review. Returning a complete
  `ToolResultObject` does not prove that the host displayed it or that the
  owner read it. A headless run cannot qualify interactive-terminal controls;
  absent controls are not applicable to that run, not passed.
- Delivery and attribution of the intended typed or pasted approval event
  as the next eligible local root input, including normal-return eligibility,
  one-use approval, and all proposal-lifetime invalidators.
- Activation, waiting, run, stop, and failure notices in the session log.
  Proposal results do not qualify these separate status surfaces.
- The full local AI/local-tool evidence-conversation sequence: an initial
  exchange plus two question-specific follow-ups under the same sharing
  approval, and real harmless fixture commands under both commit-pin and
  current-worktree revision policies, with completed, failed, and inconclusive
  runs.
- Real loopback mutual TLS and certificate/recipient checks, response/socket
  loss, cancellation, all permission/disclosure/security negatives, late or
  duplicate replies, no replay, process and descendant outcomes or explicit
  uncertainty, finite message/time/run/output bounds, effects accounting,
  and teardown.
- Local waiting, busy/no-waiter, inactive, expiry, and stop behavior, plus
  applicable foreground/minimized/locked availability. A shared-machine lock
  does not establish independent remote-B availability; applicable but
  unobserved behavior stays unqualified.
- Node versions other than the one the tests used (24.21.0 on Windows), and
  process termination on macOS or Linux.

Feature 068 task T019 remains incomplete and blocked pending fresh native/live
qualification for the remaining local Windows CLI scope; retained observations
do not complete it. Further live qualification needs its own exact current
authorization. See
[Before any live use](#before-any-live-use).

## Core feature and the optional `a2a` pack

The core Dude extension contains everything the feature needs at run time, so
consumers need no npm install:

- `lib/a2a.mjs` handles configuration, proposal preparation, activation, and the
  five synchronous tools: propose, ask, receive, verify, and reply.
- `lib/a2a-transport.mjs` sends and receives messages over mutual TLS.
- `lib/a2a-verify.mjs` runs named commands and records what it observed.
- `lib/a2a-collaboration.mjs` adds the optional nonblocking
  `dude_a2a_conversation` tool and its number-advice messages.
- `lib/a2a-peer-worker.mjs` runs B's restricted evidence worker for one
  conversation and checks its readiness before the worker's first prompt.
- `lib/a2a-sdk-loader.mjs` loads the public Copilot SDK for the extension's one
  join and for B's worker, and records which file each one imported.
- `lib/a2a-transcript.mjs` keeps each conversation's bounded local transcript
  and provides its read-only terminal view.
- `lib/a2a-runtime.mjs` is a prebuilt bundle of `@a2a-js/sdk` 1.2.0 and Express
  5.2.1. The extension loads it only after a local approval. License notices for
  every bundled package are in `lib/a2a-runtime.mjs.LEGAL.txt`.

The optional `a2a` pack is separate. It installs a read-only advisor and two
knowledge skills about the A2A protocol and its JavaScript SDK. It gives advice
only: the core feature works without it, and installing it turns nothing on.

## How an exchange works

Each side has its own owner, configuration file, profile, and approval. In this
guide, A asks and B serves.

1. Each owner asks their model to call `dude_a2a_propose` with the selected
   external configuration path and profile ID. The owner opens and reviews
   the complete adapter-produced native tool result, then types or pastes
   its exact `dude a2a approve <code>` as the next eligible local root input.
   Proposal preparation alone approves nothing.
2. B's model calls `dude_a2a_receive` and waits for one question.
3. A's model calls `dude_a2a_ask`. A's adapter checks A's approval, connects to
   B's configured address with mutual TLS, verifies B's pinned certificate, and
   sends the question.
4. B's receive returns the question and an exchange ID. B's model inspects
   approved evidence with its normal tools, may run one of its owner's approved
   commands with `dude_a2a_verify`, and answers once with `dude_a2a_reply`.
5. A's ask call returns B's answer, with each piece of evidence labeled by where
   it came from. Nothing is queued, retried, or delivered later.

Each exchange is one question and one reply over a direct A2A request and
response. A follow-up uses a new receive and a new ask under the same approvals.
The transport accepts only A2A protocol version 1.0 over JSON-RPC with direct
Message replies; tasks, streaming, push notifications, redirects, and the older
v0.3 protocol are refused. B serves an Agent Card only to its pinned peer, and
the card lists B's selected command IDs without their definitions. A does not
fetch the card; it sends straight to its configured endpoint.

## Before you start

Decide these values for each side. Dude supplies no defaults for any of them.

| Value | Notes |
| --- | --- |
| Configuration file | An absolute path outside the session's workspace. |
| Session and workspace | The existing session that will ask or serve, and its workspace folder. |
| Peer | The other side's display label, IP address, certificate fingerprint, and, for the asking side, B's port. |
| Your certificate and key | PEM files for this side. |
| Sharing | What this side may send, what it must not send, and why. |
| Limits | `contentBytes` for both sides, `askTimeoutMs` for the asking side, `repeatUse`, and an optional `expiresAt`. |
| Serving only | The listen address and port, the folders whose files B may attach, and optionally approved commands with a revision policy. |

### Certificates and addresses

Dude does not create certificates, change firewall rules, relay traffic, or
forward ports. Set those up yourself.

- Each side needs its own certificate and private key as PEM files.
  Self-signed certificates are expected. Trust comes from the pinned
  fingerprint rather than from a certificate authority, and each certificate
  must be within its validity dates. TLS 1.2 or later is required.
- Give the other owner your certificate, never your key, through a channel you
  trust. Record the fingerprint of theirs as `peer.certSha256`: the SHA-256
  digest of the certificate's DER encoding, as 64 hex digits with or without
  colons. With Node, this command prints it for a PEM file (checked with Node
  24 in Windows PowerShell; quoting differs in other shells):

  ```text
  node -e "const { X509Certificate } = require('node:crypto'); console.log(new X509Certificate(require('node:fs').readFileSync(process.argv[1])).fingerprint256)" <peer-certificate.pem>
  ```

- Addresses are canonical IP literals, not host names. Use loopback
  (`127.0.0.0/8` or `::1`) or a private LAN range (`10.0.0.0/8`,
  `172.16.0.0/12`, `192.168.0.0/16`, or `fc00::/7`). Wildcards such as
  `0.0.0.0` and `::`, link-local addresses, and public addresses are refused.
- B's listen address must belong to B's computer, and B's listener binds exactly
  that address and port. B accepts connections only from the address configured
  for A.

## Configuration file

The owner writes and keeps one JSON configuration file per computer:

- Put it at an absolute path outside the session's workspace. Dude never writes
  it, so protect it with ordinary file permissions.
- It must be a regular UTF-8 file of at most 1 MiB, not a link. The same rules
  apply to the TLS certificate and key files it names.
- Dude checks every key. Unknown keys, missing keys, and invalid values are
  refused with a bounded local reason, and nothing is filled in with a default.
- Changing the file, or this profile's TLS certificate or key, ends an
  activation at its next check.

The top level has two keys:

| Key | Required | Value |
| --- | --- | --- |
| `profiles` | yes | An object that maps each profile ID to a profile. It needs at least one. |
| `commands` | no | An object that maps each command ID to a catalog entry. Only serving profiles that approve commands use it. |

Profile and command IDs use letters, digits, `.`, `_`, and `-`, start with a
letter or digit, and have at most 64 characters. Text values must be non-empty
single-line text, and numbers must be positive integers.

| Profile key | Role | Required | Value |
| --- | --- | --- | --- |
| `role` | both | yes | `"ask"` or `"serve"` |
| `label` | both | yes | This side's display name, such as `"A (Windows)"` |
| `workspace` | both | yes | Absolute path of the session's workspace. It must resolve to the same folder. |
| `peer.label` | both | yes | The other side's display name |
| `peer.address` | both | yes | The other side's IP address |
| `peer.port` | ask | yes | B's listen port, from 1 to 65535. Serving profiles must not set it. |
| `peer.certSha256` | both | yes | The other side's certificate fingerprint |
| `tls.certFile`, `tls.keyFile` | both | yes | Absolute paths of this side's PEM certificate and private key |
| `sharing.allowed` | both | yes | What this side may send |
| `sharing.excluded` | both | yes | What this side must not send |
| `sharing.purpose` | both | yes | Why the exchange happens |
| `contentBytes` | both | yes | The largest message, in bytes. It also bounds the combined size of the files one reply cites. |
| `repeatUse` | both | yes | `"activation"` for any number of exchanges while active, or a positive number of exchanges |
| `expiresAt` | both | no | A UTC time written as `YYYY-MM-DDTHH:MM:SSZ`, when the activation ends. Without it, the activation lasts until something else ends it. |
| `askTimeoutMs` | ask | yes | The longest one ask may take, up to 2147483647 milliseconds |
| `listen.address`, `listen.port` | serve | yes | The IP address and port B listens on |
| `evidenceRoots` | serve | yes | Absolute paths of existing folders, not links, whose files B may attach. The array may be empty. |
| `verification` | serve | no | Command approval. See [Named commands](#named-commands). |
| `collaboration` | both | no | An agreed project ID and, for serving, B's evidence worker. See [Collaboration between two Dudes](#collaboration-between-two-dudes). |
| `pairing` | both | no | `true` asks for a standing pairing, so one approval also covers later matching activations; absent or `false` keeps one-use approval. It is a request, never consent. See [Standing pairing](#standing-pairing). |

### Example: share-only setup

These are templates, not working examples. Replace every `<...>` value with
your own; until you do, validation refuses the file, so a template cannot
activate anything. Choose every number yourself: Dude has no recommended values.
Mac labels throughout the examples retain the historical motivating case,
not a current support claim or a required initial-completion platform.

A's file, stored outside A's workspace:

```json
{
  "profiles": {
    "a-ask": {
      "role": "ask",
      "label": "A (Windows)",
      "workspace": "<absolute path of A's workspace>",
      "peer": {
        "label": "B (Mac)",
        "address": "<B's private IP address>",
        "port": "<B's listen port, as a number>",
        "certSha256": "<SHA-256 fingerprint of B's certificate>"
      },
      "tls": {
        "certFile": "<absolute path of A's certificate PEM>",
        "keyFile": "<absolute path of A's private key PEM>"
      },
      "sharing": {
        "allowed": "<what A may send, such as questions about recorded test results>",
        "excluded": "<what A must not send, such as source code and credentials>",
        "purpose": "<why A asks>"
      },
      "contentBytes": "<largest message in bytes, as a number>",
      "askTimeoutMs": "<longest ask in milliseconds, as a number>",
      "repeatUse": "<\"activation\" or a number of exchanges>"
    }
  }
}
```

B's file, stored outside B's workspace. It has no `verification` key, so this
activation grants no commands through `dude_a2a_verify`. B can answer from
existing files under the sharing scope:

```json
{
  "profiles": {
    "b-serve": {
      "role": "serve",
      "label": "B (Mac)",
      "workspace": "<absolute path of B's workspace>",
      "peer": {
        "label": "A (Windows)",
        "address": "<A's private IP address>",
        "certSha256": "<SHA-256 fingerprint of A's certificate>"
      },
      "tls": {
        "certFile": "<absolute path of B's certificate PEM>",
        "keyFile": "<absolute path of B's private key PEM>"
      },
      "sharing": {
        "allowed": "<what B may send, such as conclusions and excerpts from recorded test logs>",
        "excluded": "<what B must not send, such as credentials and unrelated source>",
        "purpose": "<why B answers>"
      },
      "contentBytes": "<largest message in bytes, as a number>",
      "repeatUse": "<\"activation\" or a number of exchanges>",
      "listen": {
        "address": "<B's own private IP address>",
        "port": "<listen port, as a number>"
      },
      "evidenceRoots": ["<absolute path of a folder whose files B may attach>"]
    }
  }
}
```

### Standing pairing

A profile that sets `"pairing": true` asks for a standing pairing: one
approval that also covers later matching activations. The setting is a
request, never consent. Without it, or with `false`, every activation still
needs its own proposal and approval, exactly as before. A serving profile
whose worker has a `qualification` block refuses `"pairing": true`, so a
native qualification run keeps its own typed approvals and consent.

A pairing has two steps:

1. **Enrollment, once.** Request the profile with `dude_a2a_propose`. The
   result is the complete proposal with its PAIRING lines. Review all of it,
   then type or paste the exact `dude a2a approve <code>` from its `Approval`
   line. That one approval also saves the pairing. See [Propose](#propose)
   and [Approve](#approve).
2. **Later use, with no prompt.** A later `dude_a2a_propose` request for the
   same profile, in this or a later session on this computer, starts a fresh
   activation at once when the pairing still matches exactly. There is no new
   proposal, code, or approval. Before the activation goes live, Dude logs
   the required `A2A standing pairing in use` notice, and the tool result
   then begins `Activation: active`. See
   [Reusing a standing pairing](#reusing-a-standing-pairing).

Each activation is new and belongs to its session: nothing from an earlier
activation carries over. Each owner pairs only their own side. One owner's
pairing never enrolls or wakes the other side, which stays unavailable until
its own owner activates it.

Dude keeps one small record for each paired profile, next to the
configuration file:

```text
<config>.pairings/<sha256(profile ID)>.json
```

`<config>` is the configuration file's full real path, and
`<sha256(profile ID)>` is the SHA-256 of the exact, case-sensitive profile ID
as 64 lowercase hex digits. The record is never kept in a repository: its
folder must be outside the session's workspace and outside every Git checkout
or worktree, judged by a `.git` file or folder on that folder or any folder
above it, even when an ignore rule covers it. The folder must not be a link,
and the record must be a regular file. If your configuration is inside a
repository, a paired profile is refused until you move the configuration to a
local folder outside every repository; ordinary profiles are unaffected. Dude
creates the folder only when an approval saves a record, and asks for
owner-only permissions where the platform supports them. Keep pairing
records on this computer: do not commit, sync, or copy them elsewhere.

A record holds only `{"version":1,"bindingSha256":"<64 hex digits>"}`, at
most 1 KiB: a digest of what was approved, never the values themselves, the
proposal, a code, a session, a key, a credential, or a time. A missing record
means the profile is not enrolled yet. A damaged, oversized, unreadable, or
linked record, or a disallowed location, refuses the request without showing
the record's content. Like the configuration and TLS files, this
configuration's pairing records are never attached as evidence.

The record matches only the exact binding its approval covered:

- the workspace path, its real folder, and that folder's identity on disk, so
  another folder later created at the same path does not match;
- the configuration path, its real path, its exact bytes, and the exact
  profile ID;
- the profile's parsed settings and each selected command's full definition,
  including the peer's address and certificate pin, the sharing text,
  evidence roots, limits, expiries, revision policy, and worker;
- the contents of this profile's TLS certificate and key files and of the
  worker's token file, or, for an existing sign-in, its resolved base
  directory and selected environment values, all hashed; no value is stored.

Any difference means no match, even a whitespace edit or a change to another
profile in the same file. The next request then gets the complete enrollment
proposal again, and only its approval replaces the record. Mutual TLS still
checks the actual peer's certificate on every connection; a matching label or
project ID is not trust.

Numeric `repeatUse` limits, for exchanges and for command runs, count within
one activation and restart with the next; there is no standing total. An
`expiresAt` time is absolute and never extended: once it passes, requests for
that profile are refused as expired, and changing it changes the binding,
which needs a new enrollment.

Restoring the exact approved configuration can match an old record again, so
editing the configuration does not revoke a pairing. Only deleting the record
revokes it; see [Stop](#stop).

Automated checks cover this behavior: offline provider and storage tests, a
disposable release, and the real-TLS component suite, in which two
independent processes each enroll once, then converse in two later automatic
activations with no approval input, including after both processes restart.
Native qualification of pairing is deferred and not passed: actual host
display of the PAIRING lines and the notice, human review and input delivery,
native model behavior, saved sign-in, physical LAN, and other platforms
remain unqualified. No new host support is claimed.

## Turning it on and off

### Propose

In the existing session that will ask or serve, ask the model to prepare a
proposal for your operator-selected external configuration file and profile,
without approving, connecting, or running anything. The registered local tool
is `dude_a2a_propose`. Its complete argument shape is:

```json
{
  "configPath": "<absolute path to the external configuration file>",
  "profileId": "<profile-id>"
}
```

These placeholders are inert, not valid configuration or permission to use a
real session. Both arguments must be strings. There is no approval code,
consent boolean, caller-supplied proposal, command override, or fallback
argument; extra or missing arguments are refused. A path containing spaces is
one JSON string, not a quoted chat-command fragment.

The former `dude a2a propose <config-path> <profile>` chat route is retired.
It gives unsupported-command guidance and does not generate a proposal.

The native inspect-then-propose sequence worked in one authorized App
observation: call `extensions_manage` with
`{"operation":"inspect","name":"dude"}`, verify the exact current extension,
session, and workspace, then request the proposal in that same live session.
An earlier cold first turn reported the tool unavailable, and registration
completed later; no retained request tool list proves a race. Treat this as
observed troubleshooting, not a guaranteed workaround or permission to retry
or reload. Historical inspection results or process IDs grant no current
authority.

For an unpaired profile, and for a paired profile without a matching standing
record, preparation validates the configuration, TLS files, and current local
binding. It does not approve, load the A2A runtime, open a listener or socket,
connect to the peer, send a question, run verification or Git probes, save a
pairing, or change workflow state. A successful `ToolResultObject` has
`resultType: "success"` and the complete plain-text proposal in
`textResultForLlm`. Success means preparation, not activation or proof of
display. A paired profile whose record matches activates instead; see
[Reusing a standing pairing](#reusing-a-standing-pairing).

Open the native result detail for that tool call and review the entire body.
An assistant paraphrase, a code by itself, or a private-event-log relay cannot
replace it. **Stop before approval** if the native result is a preview or
temp-file notice, omits any selected command, risk, or approval detail, or is
hidden, truncated, or inaccessible, even if the tool reports `success=true`.
Use `dude a2a stop` to withdraw the pending proposal and report the limitation.
Do not retrieve or relay an approval from a temp file or private log, or paste
an old code. For deferred App qualification, file cards, `session.info`, and
a CLI display cannot substitute for the App's actual result. There is no read
callback, approval button, or separate confirmation dialog.

A command-enabled serving result has this shape. All values below are
placeholders; the actual result contains every selected command's full
`Command` through `Effects/resources` block, not a count or catalog reference:

```text
Proposal only: nothing is activated. Review this entire native tool result before local approval.
Proposal: B (Mac) serve
Config: <config path>; digest sha256:<digest>; profile b-serve
Local: <session ID>; provider <generation>; workspace <workspace>
Peer: A (Windows); client address <A's address>; SHA-256 <fingerprint>
Listen: https://<B's address>:<port>/
SHARING: <allowed>; excludes <excluded>
Purpose: <purpose>; evidence roots <folders>
Sharing limits: <contentBytes> bytes per message; validity <until the expiry | until activation ends>; repeat use <exchanges>
COMMANDS: <every selected command ID>; separate from SHARING
Command: <command ID>
Executable: <absolute executable path>
Argv: <fixed arguments and slots>; parameters <declared values or patterns>
Cwd: <working directory>
Environment names: inherit <names>; fixed <names>; values hidden
Run limits: <timeoutMs> ms; <outputBytes> bytes per stream
Effects/resources: <your effects text>, not guaranteed
Revision: <commit pin or current worktree policy>; no default
Git: <Git path, or "not configured; revision observations unavailable">
Git observation policy: before/after HEAD and tracked/untracked status probes when available; ignored files and transient changes can escape observation. No revision probe has run to create this proposal.
Command validity/repeat use: <validity>; <runs>
Risks: Ordinary host permissions are not global isolation. Peer/source text can persuade models or cause disclosure. Host-approved injection can spoof root approval. Revision probes miss ignored/transient changes; project code can exceed declared effects. Host prompts remain unchanged. Stop does not guarantee termination or recall disclosure.
Result exposure: this full proposal and its code are model-readable data, not approval. Private keys and fixed environment values are omitted; command output is not automatically redacted and may contain sensitive information. Commands never widen SHARING.
Review: if any native result detail is hidden, truncated, or inaccessible, do not approve. An assistant summary or private-log relay cannot replace it.
Lifetime: this result is a snapshot, not live status. Normal tool completion preserves an otherwise valid pending proposal. Stop, cancellation, expiry, replacement, intervening/queued input, or changed session/provider/workspace/config/TLS bindings invalidates it. Historical text may remain visible.
Approval: dude a2a approve <code>; current matching proposal/context only, consumed once
Next: after complete review, type or paste the exact current approval as the next eligible local root input. To decline or cancel, use dude a2a stop.
```

A share-only proposal shows `COMMANDS: none approved; separate from SHARING`
with no command definitions, revision policy, or command-validity lines. An
asking proposal shows B's endpoint, the sharing lines, `contentBytes`,
`askTimeoutMs`, validity, repeat use, and asking-specific risks. It has no
listener or local verification grant. All three cases include the review,
lifetime, and next-action instructions.

A profile with `"pairing": true` adds three PAIRING lines after its scope
lines, just before `Risks`, and its `Approval` line ends with
`; also saves the PAIRING grant`. The record path is the profile's actual
path, described in [Standing pairing](#standing-pairing):

```text
PAIRING: this approval persists for later matching sessions on this machine; any binding change needs new full approval; numeric repeat use resets per activation; absolute expiries do not extend
Pairing record: <record path>; holds a digest only; revoke: dude a2a stop, then delete that file; stop or a config edit alone does not revoke
Pairing trust: ordinary root input does not prove human authorship; an unrestricted local file writer can forge or remove this grant
```

Private key material and fixed environment values are omitted from proposals.
That omission does not redact secrets placed in argv or prose, or anything a
command later prints. The full proposal and its approval code are model-readable
data, not consent.

Read every line before approving. The `Config` digest hashes the configuration
file's exact bytes. Approval also binds the current session, provider
generation, workspace, selected profile, peer address and certificate pin,
TLS material, commands, and policies.

Dude now applies a fixed cap of 4,490 UTF-8 bytes to the **complete rendered
proposal**, including bindings, paths, identifiers, every selected command,
notices, and approval text. Exactly 4,490 bytes is size-eligible; 4,491 bytes
is refused. This counts bytes, not characters or commands, and is not
user-configurable. The independent 1 MiB input limit for configuration and
TLS files still applies; rendering adds labels and can expand a smaller input.
Successful proposal text, approval checks, wire-message limits, and command-run
limits are unchanged.

An oversized proposal returns only the short `proposal_too_large` refusal,
with no proposal body, code, approval line, or partial approvable result.
This holds for a paired profile too: a matching standing record never
bypasses the cap. An eligible replacement attempt withdraws the previous
pending proposal even when the replacement is oversized. Neither a refused nor
a replaced code can activate anything. Choose an explicitly smaller profile,
request a fresh proposal, review its complete native result, and give fresh
local approval for each activation of an unpaired profile. A smaller paired
profile skips that only through its own exact, matching standing pairing; no
larger or refused profile lends it approval. There is no summary, file, log,
or paging fallback, and no automatic splitting or retry.

The bound comes from the limited native CLI calibration above, not from the
historical oversized App failure. Size eligibility and distribution parity
still do not prove complete display or human review. Stop before approval
whenever an accepted result is incomplete or inaccessible. A new refusal from
the delivered guard does not change the 2026-09-30 App failure's verdict.

#### Reusing a standing pairing

For a profile with `"pairing": true`, the same request first runs every check
above, including the 4,490-byte cap on the complete proposal it would show.
It then reads that profile's standing record, described in
[Standing pairing](#standing-pairing):

- **No record, or one that does not match:** the result is the complete
  enrollment proposal with its PAIRING lines. It activates nothing; only its
  approval saves or replaces the record.
- **A damaged, unreadable, or linked record, or a disallowed location:** a
  short refusal with no proposal body, code, or activation. The record's
  content is never shown.
- **A matching record:** no proposal, code, or approval input. The request
  starts a fresh activation for this session, with the same queued-input,
  binding, and startup checks as a typed approval. Before it can go live,
  Dude logs the required notice that begins `A2A standing pairing in use:`.
  The notice names the profile, the peer and its fingerprint, the workspace,
  SHARING, any separately approved COMMANDS and WORKER, the validity and
  limits, the record path, and how to revoke. It asks for nothing. If it
  cannot be logged, nothing goes live.

A successful automatic result begins `Activation: active`, and its
`Authority:` line names the standing pairing and how to revoke it. If startup
fails, the result begins `A2A automatic activation is not active:` and states
`Activation: inactive`: a saved pairing alone is never reported as a
connection, and nothing retries. Cancelling the request before its result
returns cancels the startup; the result's normal return does not end the
activation. A session still holds one activation at a time, so stop the
current one before requesting another profile.

### Approve

After complete review, type or paste the exact current command from the
result's `Approval` line as the **next eligible local root input in the same
session**:

```text
dude a2a approve <code>
```

The code is the fresh 12-character value in that line, not the inert `<code>`
placeholder above. It approves that one current proposal, once:

- Normal tool return, including the SDK aborting the finished invocation's
  signal, keeps an otherwise valid proposal pending. A genuine root abort,
  stop, intervening or opaque queued input, expiry, changed binding, or session
  or provider loss invalidates it.
- A new eligible proposal attempt replaces the earlier pending proposal.
  Failure does not restore the old code. If the invocation can still return,
  construction or cancellation failure returns a bounded refusal, never a
  partial approvable result. An invalid invocation cannot change another
  context's proposal.
- Before activating, Dude requires the complete result to be ready, settles
  queued-input checks, and rechecks the exact binding and sharing/command
  validity. A wrong code consumes the pending proposal without activating.
  Request and review a fresh proposal after any invalidation.
- For a proposal with PAIRING lines, the same approval also saves the
  standing record, once every check above passes and before anything starts.
  The log then shows `A2A pairing saved: <record path>. ...`. If the record
  cannot be saved, nothing activates, and there is no fallback to one-use
  approval. If startup fails after the save, the record stays, the log says
  `A2A paired, inactive: <reason>. ...`, and nothing retries; a later
  matching request can reuse the record.
- B then starts its configured listener; A prepares its pinned client. Nothing
  is sent until A's model asks. The adapter emits an `Activation: active; ...`
  notice with the profile, endpoint, validity, and available operations. For
  a paired profile, its `Authority:` line names the saved pairing and how to
  revoke it. Native visibility of that notice is still unqualified.

Historical result text may remain visible after replacement, cancellation,
consumption, expiry, or session shutdown. It is a snapshot, not live status,
and cannot restore authority or current approval eligibility. The adapter
cannot prove what the host displayed or what you read.

A session holds one activation at a time. Proposing while one is active or
starting refuses without changing it. To switch profiles, stop first.

### Which messages can approve

Dude decides by the message event, not by how its text was entered. Approval
counts only as a live root `user.message` in the session's main chat whose
entire content, ignoring leading and trailing whitespace, is the command.
Typed and pasted text are the same to Dude. Each proposal gets a new code;
a code copied from an earlier proposal or another session approves nothing.

Text from subagents, autopilot continuations, or messages that carry a host
source attribution is ignored without changing the activation. An approval
message with attachments counts as ordinary input, not consent. Tool arguments
or booleans, tool results, peer questions and answers, file contents, and
earlier conversation history are data, even when they contain the exact command
text. They activate nothing unless that text arrives as a new eligible local
root message and all current approval checks pass.

This is ordinary host and operator trust, not proof that a person sent the
text. Any host feature, extension, or model tool that the host lets inject
main-chat messages could send the same words, and Dude cannot tell the
difference. Seeing the code in a model-readable result does not prevent that
injection. Every proposal discloses this risk; there is no human-origin proof
or global model containment.

### Status

There is no status command. `dude a2a status` is refused as unrecognized, and
like any other chat input it withdraws a pending proposal and ends a current
exchange. `@dude status` reports Dude's workflow, not A2A. The adapter emits the
following session-log notices; their visibility in the native host remains
unqualified, separately from proposal results:

| Log line | Meaning |
| --- | --- |
| `Activation: active; ...` | A typed approval took effect. An automatic activation returns this text as its `dude_a2a_propose` result instead of logging it. |
| `Activation: inactive` | The activation ended; the line before it says why. |
| `A2A pairing saved: <record path>. ...` | An approval saved its profile's standing pairing, before anything started. |
| `A2A paired, inactive: <reason>. ...` | The pairing was saved, but startup failed. Nothing is active or retried, and the record stays. |
| `A2A standing pairing in use: ...` | Required before an automatic activation goes live. It names the profile, peer, workspace, scopes, limits, record, and how to revoke, and needs no response. |
| `A2A automatic activation refused: ...` or `A2A automatic activation cancelled: ...` | An automatic activation did not go live; nothing was activated. |
| `Status: waiting; current receive live` | B has a receive waiting, so B can admit one question. |
| `Status: admitted; <exchange-ID>` | B admitted a question. |
| `Status: reply sent; <exchange-ID>` | B's reply finished writing to the connection. |
| `Status: not waiting; ...` | B's receive ended, so A gets `unavailable` until the next receive. |
| `Status: waiting for reply` | A sent, or is sending, a question and is waiting. |
| `Run start: <run-ID>` and `Run end: <run-ID>; <outcome>` | A named command started and ended on B. A command that never started has no start line. |

Adapter log lines carry metadata only. They never include the question, the
answer, file contents, or command output.

### Stop

Type:

```text
dude a2a stop
```

Stop is accepted from any user-message origin because it only removes
authority. It withdraws a pending proposal and ends the activation. B's
listener closes, an unsent reply is withheld, late replies are rejected, and
termination is requested for a running command. Stop cannot recall anything
already sent, and it does not stop work that a model started with its normal
tools.

For a paired profile, stop ends only the current activation. It keeps the
standing record and never starts a replacement on its own. A later
`dude_a2a_propose` request for that profile can start a fresh activation from
the record.

Only deleting the record revokes a pairing. Use `dude a2a stop`, then delete
the record file named in the proposal, the approval notices, and the
automatic notice. Deletion works while Dude is not running and needs no
acknowledgment from the peer. A live paired activation rereads its record at
every check, so deleting the record also ends it at its next check, and later
requests get only the enrollment proposal. Editing the configuration,
removing the profile, or setting `pairing` to `false` does not revoke:
restoring the exact approved configuration can match the record again. There
is no unpair command or remote revocation, and revoking cannot recall anything
already disclosed or done.

An activation also ends when:

- the session shuts down or its conversation context is cleared;
- `expiresAt` passes;
- the activation notice's log call fails; a successful log call still does
  not establish native visibility;
- for an automatic activation, its required `A2A standing pairing in use`
  notice cannot be logged, so it never goes live;
- for a paired activation, its standing record is deleted, changed, or can no
  longer be read safely, checked during startup and before each admission,
  run, reply, and send;
- the configuration, the profile's TLS files, the session, or the workspace no
  longer matches the approval, checked before each admission, run, reply, and
  send.

If the session's workspace changes, the extension instance refuses further
activation until the extension restarts. Nothing is restored from history.
For an unpaired profile, propose and approve again. For a paired profile whose
record still matches, a new request starts a fresh activation, never the old
one.

## Asking a question

A's model calls `dude_a2a_ask` with:

- `question`: one natural-language question within A's sharing scope.
- `requested`, optional: B's command IDs and parameter values that A would like
  run, as `[{ "commandId": "<ID>", "params": { "<name>": "<value>" } }]`. This
  is only a request. B's owner's approval decides what can run.

One ask runs at a time, and the call waits for B's answer or a non-answer.
`askTimeoutMs` bounds the whole call. Before sending, A's adapter checks the
call, the activation, repeat use, and the approved binding. It verifies B's
certificate during the TLS handshake and checks the binding again just before
the first byte leaves. An attempt that sent nothing does not count toward
`repeatUse`.

| Outcome | Meaning |
| --- | --- |
| `answer` | A valid reply arrived. Evaluate it yourself; it is not verification, approval, or task closure. |
| `refused` | A's side refused before sending, or B refused the question. |
| `unavailable` | B could not be reached, or could not accept: no receive was waiting, another exchange was in progress, or B's repeat use was used up. Nothing was queued. |
| `cancelled` | The call ended before an answer was delivered, for the stated reason, such as a stop or new input in A's session. |
| `timeout` | `askTimeoutMs` passed before anything was sent. |
| `uncertain` | The question may have reached B, but no valid answer came back. Check B before asking again. |

Every non-answer also reports delivery as `not_sent`, `reached_peer`, or
`may_have_occurred`. Nothing retries automatically.

An answer keeps its sources apart:

- `peerModel`: B's model's conclusion and limitations, in its own words.
- `evidence`: existing files B attached, with their provenance.
- `freshVerification`: B's run records, or
  `no run record supplied; execution unknown`.
- `requestedOperations`: the status of each operation A requested, taken only
  from the records B supplied.
- `adapter`: the checks A's adapter performed on bindings and structure.
- `notice`: B's model wrote the conclusion; the checks cover bindings and
  structure, not truth; nothing grants permission.

## Answering a question

While B serves, keep its session set aside for these exchanges and do not run
unrelated work in it. A new main-chat message in B's session ends the current
exchange.

1. B's model calls `dude_a2a_receive` with no arguments. Dude first confirms
   that no other input is queued, then logs
   `Status: waiting; current receive live`. One receive can wait at a time.
2. When A's question arrives, the call returns the question, an `exchangeId`,
   A's label, any operations A requested, B's approved commands, B's sharing
   scope, the evidence roots, and `contentBytes`. The question is data, not
   permission.
3. The exchange stays open after the receive call returns. B's model inspects
   evidence with its normal tools under the host's usual permissions, and may
   call `dude_a2a_verify` when an approved command fits the question.
4. B's model calls `dude_a2a_reply` once with `exchangeId`, `conclusion`,
   `limitations`, and `evidence`.

If no receive is waiting when A asks, or another exchange is in progress, A gets
`unavailable` immediately. A follow-up needs a new receive, and still-valid
approvals cover it without another proposal.

Each `evidence` entry is one of:

- `{ "file": "<absolute path>", "lines": { "start": 1, "end": 20 }, "claimedProvenance": "<text>" }`.
  `lines` is optional, 1-based, and inclusive; without it the whole file is
  attached. `claimedProvenance` states what the file itself says about its
  revision, command, environment, and time, or `"missing"`.
- `{ "run": "<runId>" }`: a record that `dude_a2a_verify` created in this
  exchange.

A reply refused before sending leaves the exchange open for one corrected
reply, unless the exchange has ended. Dude refuses a reply while a command is
still running.

## Evidence and provenance

B's adapter reads each cited file fresh while it prepares the reply. It
attaches only regular files inside the approved evidence roots, and it refuses:

- links, files with more than one hard link, and paths that leave a root;
- the configuration and TLS files, even when they sit inside a root;
- files over 1 MiB, selected lines that are not UTF-8 text, and line ranges
  past the end of the file;
- files that change while they are read, with no fallback to an earlier copy;
- cited files whose full sizes together exceed `contentBytes`, and a reply whose
  encoded size exceeds `contentBytes`. A file cited twice counts once, and
  nothing is truncated to fit.

A refusal names only the evidence position and a reason code, never a path or
file content.

Each attached file reaches A with these fields:

| Field | Meaning |
| --- | --- |
| `existingFile` | The evidence root's folder name and the file's relative path |
| `lines`, `excerpt` | The selected lines, or `whole file` |
| `excerptBytes`, `excerptSha256` | Recomputed by A from the received excerpt |
| `fileAtRead` | B's observation of the whole file's size and SHA-256 |
| `readTime` | When B's adapter read the file |
| `filesystemMtime` | Filesystem metadata only |
| `claimedProvenance` | B's model's account of what the file itself states |

None of these times makes an old result fresh. `readTime` records today's read,
`filesystemMtime` is metadata, and a timestamp written inside a log is that
log's claim. Only a run record describes a fresh execution. B's model should
state in its limitations when evidence is missing, stale, partial, conflicting,
or someone else's claim. The adapter does not judge truth.

## Named commands

Sharing and permission to run commands are separate approvals, shown on
separate lines of B's proposal. Approving commands never widens sharing, and
approving sharing never authorizes a command. Only B's owner approves B's
commands; the operations A requests are wishes.

A command runs project code in B's workspace. Its declared effects are your
description, not a guarantee, and a run is not a sandbox: the code can use CPU,
memory, the network, files, and child processes beyond what the entry says.

### Catalog entries

Each entry in the top-level `commands` object fixes one operation:

| Key | Required | Value |
| --- | --- | --- |
| `executable` | yes | Absolute path of the program. `.cmd`, `.bat`, and `.ps1` files are refused; run a script through its interpreter. |
| `args` | yes | Array of arguments. An element that is exactly `{name}` is filled by the parameter `name`; braces anywhere else are refused. |
| `params` | yes | An object that maps each parameter name to `{ "enum": ["<value>", ...] }` or `{ "pattern": "^...$" }`. Every `{name}` slot needs a parameter and every parameter needs a slot. Use `{}` when there are none. |
| `cwd` | yes | Absolute working directory inside B's workspace |
| `env.inherit` | yes | Names of variables copied from the extension's environment when they are set |
| `env.set` | yes | An object that maps variable names to fixed values. Proposals, logs, the environment facts in run records, and the command digest name them without their values. The command itself receives the values, and its output is not redacted. |
| `timeoutMs` | yes | The longest run, up to 2147483647 milliseconds |
| `outputBytes` | yes | Bytes kept from each output stream |
| `effects` | yes | Your description of what the command changes and what it uses |

The model supplies every declared parameter and nothing else. Each value must be
one of the enum values or match the whole anchored pattern, and values with
control characters are refused. A value always fills exactly one argument, so it
cannot add arguments.

A command receives only the environment variables you declare. On Windows,
Node normally gives every child process system variables such as `PATH`,
`SystemRoot`, and `TEMP`; Dude passes those as empty unless you declare them.
Node-based commands on Windows need `SystemRoot` in `env.inherit`, as the
offline Windows test fixtures did. Those tests exercised only that kind of
inheritance, so inheriting other variables is not verified.

Fixed and inherited values reach the command, and Dude does not redact what the
command prints. Captured output goes into the run record exactly as captured,
B's model sees it in the verify result, and a cited record sends it to A. The
verify result tells B's model to cite a record only when its output fits
`sharing.allowed`, but that is guidance for the model, not a filter. Before you
approve a command, judge its possible output, including anything it could print
from its environment, against the sharing scope, and keep secrets away from
commands that might print them.

The serving profile's `verification` object selects entries and sets the
revision policy:

| Key | Required | Value |
| --- | --- | --- |
| `commands` | yes | A non-empty array of catalog IDs |
| `revision` | yes | `{ "commit": "<full 40- or 64-digit lowercase commit ID>" }` or `"worktree"`. There is no default. |
| `repeatUse` | yes | `"activation"` or a positive number of runs |
| `git` | no | Absolute path of the Git executable used to observe the revision |
| `expiresAt` | no | A UTC time after which new proposals/approvals and command runs are refused. An already active sharing scope continues. Without it, commands stay approved until the activation ends. |

### Revision policies

- **Commit pin.** Before each run, the configured Git must report `HEAD` equal
  to the pinned commit and an empty `git status --porcelain=v1 -z`, which counts
  untracked files. Missing Git, a failed probe, a different commit, or any
  tracked or untracked change refuses the run. An unknown revision never
  satisfies a pin.
- **Current worktree.** You approve the files as they are, changed or not. Dude
  records `HEAD` and a status digest when Git can observe them. Otherwise the
  record marks the revision unknown and says why, for example that Git is not
  configured or the folder is not a repository.

After the run, the same probes repeat, and `changedDuringRun` is `true`,
`false`, or `unknown`.

These observations have limits. Ignored files are not checked. A change made
and undone between the two probes is not seen. Checking the revision and
starting the command are not one atomic step, and a status digest does not pin
the contents of changed files. The probes run the configured Git with your Git
configuration, inside the command's deadline.

### Running a command

B's model calls `dude_a2a_verify` with `exchangeId`, `commandId`, and `params`.
It cannot pass an executable, arguments, a working directory, environment
values, or an approval. The adapter then:

1. Checks the call, the current exchange, the catalog entry and parameters,
   command validity, repeat use, and that no other run is active.
2. Observes the revision, applies the policy, and waits for any pending check
   of queued input. It checks everything again, with no wait in between, just
   before starting.
3. Starts the program without a shell, with stdin closed and only the declared
   environment.
4. Counts and hashes each output stream, keeps up to `outputBytes` of it cut at
   a character boundary, and reports a full-stream digest only for a stream it
   observed to the end.
5. Repeats the revision probes and returns a record it created.

One deadline, `timeoutMs`, covers the probes, the input check, the run, and the
final probes. Only one command runs at a time. A run counts toward repeat use
even when the program fails to start. Command validity is checked before each
run, so a run that already started continues if the command `expiresAt` passes.

A refusal starts nothing. Refusal reasons include `no_commands_approved`,
`command_not_approved`, `invalid_params`, `command_validity_ended`,
`run_repeat_exhausted`, `run_in_progress`, `git_unavailable`,
`revision_unobservable`, `revision_mismatch`, `worktree_dirty`,
`exchange_not_current`, and `activation_ended`.

### Run records

A run record lists the run and exchange IDs, the command ID and a digest of its
approved entry, the parameters, executable, arguments, and working directory,
the revision observations before and after, the environment variable names with
values hidden, start and end times, the outcome, the direct process's exit, any
termination request, and both output streams as captured, without redaction.
B's model can cite a record only as `{ "run": "<runId>" }`, only in the same
exchange, and only after the run finished. It cannot write or relabel any
field.

A checks each record's shape and its consistency with the exchange and the
revision policy, and recomputes the digest of any complete, untruncated output.
A reports each requested operation from the records B supplied:

| Status | Meaning |
| --- | --- |
| `no run record supplied; execution unknown` | B cited no matching record. B may not have run it, or may have run it and left the record out. |
| `fresh adapter record <id>: did not start (spawn failed)` | The program could not be started. |
| `fresh adapter record <id>: started; direct exit code <n>` | It ran, and its own process exited with that code, or `by signal <name>`. |
| `fresh adapter record <id>: started; timed out; termination ...` | It started and hit its deadline; the termination and exit observations follow. A cancelled run reads the same way with `cancelled`. |

A run record is B's adapter's observation of one command. It does not make B's
conclusion true.

### Example: serving with a named command

This template extends B's share-only profile. As before, every `<...>` value
must be replaced before validation accepts the file. The parameter values show
the two parameter forms; they are illustrations, not suggestions.

```json
{
  "profiles": {
    "b-serve": {
      "role": "serve",
      "label": "B (Mac)",
      "workspace": "<absolute path of B's workspace>",
      "peer": {
        "label": "A (Windows)",
        "address": "<A's private IP address>",
        "certSha256": "<SHA-256 fingerprint of A's certificate>"
      },
      "tls": {
        "certFile": "<absolute path of B's certificate PEM>",
        "keyFile": "<absolute path of B's private key PEM>"
      },
      "sharing": {
        "allowed": "<what B may send, such as conclusions and test output summaries>",
        "excluded": "<what B must not send, such as credentials and unrelated source>",
        "purpose": "<why B answers>"
      },
      "contentBytes": "<largest message in bytes, as a number>",
      "repeatUse": "<\"activation\" or a number of exchanges>",
      "listen": {
        "address": "<B's own private IP address>",
        "port": "<listen port, as a number>"
      },
      "evidenceRoots": ["<absolute path of a folder whose files B may attach>"],
      "verification": {
        "commands": ["unit-tests", "one-test"],
        "revision": { "commit": "<full 40- or 64-digit lowercase commit ID>" },
        "git": "<absolute path of the Git executable>",
        "repeatUse": "<\"activation\" or a number of runs>"
      }
    }
  },
  "commands": {
    "unit-tests": {
      "executable": "<absolute path of the node executable>",
      "args": ["--test", "{suite}"],
      "params": { "suite": { "enum": ["test/unit", "test/integration"] } },
      "cwd": "<absolute path inside B's workspace>",
      "env": { "inherit": ["<variable names the command needs>"], "set": {} },
      "timeoutMs": "<longest run in milliseconds, as a number>",
      "outputBytes": "<bytes kept per output stream, as a number>",
      "effects": "<what it changes and uses, such as: runs the unit tests, which may write temporary files>"
    },
    "one-test": {
      "executable": "<absolute path of the node executable>",
      "args": ["--test", "{file}"],
      "params": { "file": { "pattern": "^test/[a-z0-9-]+\\.test\\.mjs$" } },
      "cwd": "<absolute path inside B's workspace>",
      "env": { "inherit": ["<variable names the command needs>"], "set": {} },
      "timeoutMs": "<longest run in milliseconds, as a number>",
      "outputBytes": "<bytes kept per output stream, as a number>",
      "effects": "<what it changes and uses>"
    }
  }
}
```

To approve the current files instead of a pinned commit, set `"revision"` to
`"worktree"`. The `git` key is then optional, and without it every run records
the revision as unknown.

## Collaboration between two Dudes

Feature 089 lets two independent Dudes collaborate over approved activations.
Each peer has its own workspace root, owner configuration, TLS material,
journals, and approval. They need no shared checkout, Git directory, filesystem,
or host, and nothing allocates numbers for both. The delivered use is number
advice: A asks one question, B's restricted evidence worker reads B's own
approved lifecycle records and reports the highest number it found, and A may
use that observation in its own first capture. This is advice between
independent roots, not a shared allocator, lock, or reservation. Two captures
can still choose the same number with different slugs, which Feature 076 keeps
valid. Two peers bound this proof; it makes no many-to-many claim. Only
loopback runs on one computer have been exercised, in delivered component
tests and in native runs. Earlier native attempts of the normal collaboration
route (plan version 3) stopped before a pass; in one, B's worker ended with
`unexpected_native_effect` after its prompt was admitted, before it read any
evidence. One normal-route run then passed on 2026-11-12; see
[First passing normal-route run](#first-passing-normal-route-run). The strict
qualification (plan version 2) has never run natively, and strict isolation
remains deferred. Private-LAN and other-platform use remain unqualified.

### Collaboration profiles

A profile opts in with an optional `collaboration` object. Without it, the
activation behaves exactly as before, records nothing, and the conversation
tool refuses with `not_collaborating`.

| Key | Role | Value |
| --- | --- | --- |
| `collaboration.projectId` | both | The project ID both owners agree on: letters, digits, `.`, `_`, and `-`, at most 64 characters. It is correlation only, not authentication or enrollment. |
| `collaboration.worker` | serve | Required for serving and refused for asking. |
| `collaboration.worker.model` | serve | The worker's model ID. There is no default. |
| `collaboration.worker.runtime.path` | serve | Absolute path of the runtime executable; `.cmd`, `.bat`, and `.ps1` files are refused. |
| `collaboration.worker.runtime.args` | serve | Arguments placed before the SDK's own. Must be empty with `auth`. |
| `collaboration.worker.runtime.env` | serve | `inherit` and `set`, as for named commands; the worker receives only these variables. With `tokenFile`, credential variables (`COPILOT_SDK_AUTH_TOKEN`, `COPILOT_GITHUB_TOKEN`, `GH_TOKEN`, `GITHUB_TOKEN`) and `COPILOT_RUNTIME_PROCESS_FILE_LOGGING` are refused. So are home, temp, and per-user location variables (`HOME`, `USERPROFILE`, `HOMEDRIVE`, `HOMEPATH`, `TEMP`, `TMP`, `TMPDIR`, `APPDATA`, `LOCALAPPDATA`, and the `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_STATE_HOME`, and `XDG_CACHE_HOME` directories), in any letter case: the worker uses its own folders. With `auth`, `set` must be empty and `inherit` may name only `SystemRoot`, `windir`, `ComSpec`, `PATHEXT`, `PATH`, `HOME`, `USERPROFILE`, `HOMEDRIVE`, `HOMEPATH`, `APPDATA`, and `LOCALAPPDATA`, each once in any letter case, and must name `USERPROFILE`, `APPDATA`, and `LOCALAPPDATA`. |
| `collaboration.worker.runtime.tokenFile` | serve | The token branch: absolute path of a file holding the worker's one credential. Proposal preparation reads and hashes it; its value is never shown or recorded. A runtime names exactly one of `tokenFile` and `auth`. |
| `collaboration.worker.runtime.auth` | serve | The existing-sign-in branch, Windows only: exactly `kind` `"existing-sign-in"`, `baseDirectory`, and `expectedAccount`. It holds no credential. See [Existing sign-in](#existing-sign-in). |
| `collaboration.worker.runtime.auth.baseDirectory` | serve | The runtime's real base directory for its configuration, sessions, and logs, usually `%USERPROFILE%\.copilot`: an absolute path of at most 1,024 UTF-8 bytes, outside the workspace and every evidence root. Proposal preparation checks only that it is an existing directory, not a link, and where it resolves; it never reads the directory's contents. |
| `collaboration.worker.runtime.auth.expectedAccount` | serve | Exactly `host`, a canonical HTTPS origin such as `https://github.com`, and `login`; each is at most 256 UTF-8 bytes, and the login compares without letter case. It is the account the runtime and the worker's session must report, not a peer identity. |
| `collaboration.worker.roots` | serve | A non-empty list; each entry must be one of the profile's `evidenceRoots`. |
| `collaboration.worker.qualification` | serve | Optional, and only for a native qualification run: exactly `version`, a lowercase UUID `runId`, an absolute `fixtureRoot` outside the workspace and every evidence root, and the fixture manifest's lowercase SHA-256 `fixtureSha256`. `version` is `1` with `tokenFile` and `2` with `auth`. Ordinary use leaves it out. |

The proposal shows collaboration as separately labeled lines: `PROJECT` and
`RECORDING` on both sides, `CONVERSATION` on the asking side, and on the
serving side a `WORKER` scope naming the runtime, arguments, environment names,
token file (value hidden), model, the two evidence tools and roots, limits
including the 10-second startup, and the owned storage folders. An
existing-sign-in worker's `WORKER` scope names its expected login and host
instead of a token file, the resolved base directory the approval binds, and
the runtime's normal effects: the real home and app data, configuration,
sessions, logging, and sign-in lookup, which are not isolated. Its
`Worker startup` line says that the runtime may start the owner's configured
MCP servers and plugins, while the worker's model is offered only the two
evidence tools. A
qualification profile adds a `QUALIFICATION` line with its run, fixture, and
manifest digest, and lines for its probes and release latches; a version 2
profile has latches only. The serving
approval line says that it grants SHARING and the separate WORKER scope
together. Only an approval of such a proposal, or a standing pairing saved
from one, creates a worker permit, new for each activation; the transport
grant alone never starts a worker, and no permit outlives its activation. A
standing pairing without a WORKER scope starts no worker, and one whose
WORKER scope changed no longer matches. A worker with a `qualification` block
cannot be paired: its profile refuses `"pairing": true`, so a standing pairing
never replaces a native qualification run's typed approvals or consent. The
fixed 4,490-byte cap covers the complete proposal, including these lines and
any PAIRING lines.

### Begin, read, and cancel

`dude_a2a_conversation` takes exactly one of these argument shapes:

| Arguments | Result |
| --- | --- |
| `{"op":"begin_receive"}` | Serving: returns an `operationId` and the transcript path at once, then waits in the background for one project question. |
| `{"op":"begin_ask","slug":"<slug>","tentativeNumber":<1-999>,"question":"<text>"}` | Asking: returns at once and sends one `number_advice` question in the background. |
| `{"op":"read","operationId":"<id>"}` | The operation's current phase, or its decided result. |
| `{"op":"cancel","operationId":"<id>"}` | Ends answer acceptance at once and reports the result. |

- `accepted` means local admission only, not readiness or delivery. Both main
  agents can continue unrelated work and read the result at a later tool
  boundary. Read and cancel send, approve, and prompt nothing.
- One current operation runs per activation. A second begin is refused as
  `busy`, and the synchronous `dude_a2a_ask` and `dude_a2a_receive` refuse with
  `conversation_in_progress`; nothing is queued, retried, or fanned out. A new
  begin replaces the readable handle, never the old transcript.
- The begin call's normal return does not end the operation. Stop, expiry,
  binding drift, root abort, new or queued root input in that session, a
  context or workspace change, and shutdown do. Keep working within the
  current turn rather than sending a new prompt while an operation is pending.
- Cancel ends answer acceptance at once, and `read` may show bounded cleanup
  still settling. A question cancelled before its first byte is known unsent;
  after that, delivery is `may_have_occurred`. A late answer never revives a
  decided result.
- An operation ends by min(120 seconds, the asking profile's `askTimeoutMs`,
  validity). B's worker gets min(90 seconds, what remains). Cleanup is awaited
  at most 10 seconds before the result freezes with cleanup unconfirmed.

Asking results are `answer`, `refused`, `unavailable`, `rejected` (B answered,
but not with valid advice), `cancelled`, `timeout`, `uncertain`, or `failed`.
Serving results are `sent`, `refused`, `cancelled`, `timeout`, `uncertain`, or
`failed`. Each also reports `delivery`, the transcript path, and `recording`:
`pending` until the result freezes, then `complete` or `incomplete`.

B admits one authenticated question only while its receive waits, and only
when the question is closed `number_advice` JSON for B's project. Anything else
is refused or answered `unavailable` without reaching a model. Only then does
B start its worker. B's HTTP response stays open while the worker reasons; if
A disconnects, B's operation and worker end and nothing is written.

The session log shows `Status: conversation <operationId> accepted; <role>;
transcript <path>`, `... waiting for one project question`, `... admitted;
<exchangeId>`, and `... <outcome>`, plus warnings for kept worker storage,
unobserved cleanup, and an incomplete transcript. Log lines carry metadata
only.

### B's restricted evidence worker

The extension and B's worker load the public Copilot SDK only through two fixed
loaders in `lib/a2a-sdk-loader.mjs`: one for the extension's single
`joinSession` and one for the worker's client. Each resolves the normal package
name through Node's module resolution, requires the result to be a regular file
of at most 16 MiB at its real path, not a link, records that file's path, size,
and SHA-256, imports the same file, and checks that it did not change. There is
no other path, default location, or fallback. If the extension's loader
refuses, the extension does not join. If the worker's loader refuses, the
worker ends with `sdk_provenance_unavailable`, `sdk_artifact_changed`, or
`sdk_unavailable` before anything starts. An SDK handed in by a test adapter is
recorded as `test_adapter`, never as production provenance.

The worker creates one owned temporary directory with `work`, `config`, `home`,
and `temp` folders. It points `HOME` and `USERPROFILE` at `home` and `TEMP`,
`TMP`, and `TMPDIR` at `temp`, and starts exactly the approved runtime,
arguments, environment, credential, and model, with the logged-in user and
runtime logging off. Its fresh session turns off configuration discovery,
custom and on-demand instructions, file hooks, skills, memory, the session
store, host Git context, extensions, Canvas tools, and MCP servers. It offers
only `dude_a2a_evidence_inventory` and `dude_a2a_evidence_read`, which reach
only the approved lifecycle records through B's safe evidence reader, and it
rejects every permission request. These are configured settings, not proven
enforcement: no native run has shown that a host honors them.

Before its first prompt, within 10 seconds of starting, the worker checks its
own session through the public SDK. Right after the session is created, and
again at the end of these checks, it reads the session's own metadata snapshot
and its public `workspacePath`. The snapshot must name this session, a local
one not already in use, working in the worker's `work` folder, and the two
answers must agree. A reported workspace must be an existing folder, reached
through no link, strictly inside the worker's own `config` or `home` folder,
with a path of at most 1,024 UTF-8 bytes, and it must be the same folder both
times. A snapshot `null` with an `undefined` getter, both times, is recorded
only as observed absence: it does not show that the session keeps nothing on
disk, and it turns nothing on. The runtime must report its status; the
session's current model must be the approved model; the initialized tool
catalog must be exactly the two evidence tools with their approved schemas and
no deferred or MCP tool; and the session must report no instruction source,
skill, MCP server, extension, custom agent, or selected agent. A fixed invalid
inventory call then goes through the session's own tool pipeline, and it must
reach this worker's handler and return exactly `invalid_arguments`. A failed
check refuses before the prompt with a closed reason such as
`preflight_unsupported`, `storage_unavailable`, `model_mismatch`,
`tool_catalog_uninitialized`, `tool_catalog_mismatch`,
`probe_cause_unrecognized`, or `unexpected_native_effect`. A missing, failing,
malformed, or mismatched storage answer is `preflight_unsupported`, and an
unsafe, missing, oversized, or changed folder is `storage_unavailable`;
neither ever counts as absence.

B's journal then records `worker_preflight`, an observation of at most 8 KiB:
the binding, both loader records, the extension's process ID, the runtime
version, the model, the owned folder, the session storage the worker observed
(the workspace path with its device and inode, or `none`), the catalog's
schema digests, the counts, and each probe's classification. It holds no
prompt, instruction text, snapshot content, credential, or error text. Right
before it records `worker_ready`, and again right before the prompt, the
worker rereads the getter and the workspace folder's identity, and any change
refuses with `storage_unavailable`. The worker records `worker_ready`, sends
the prompt, and records the admission ID that `send` returns as
`worker_request_admitted`. Each record is checked against the operation, its
deadline, and the grant before and after it is written. Only that admission's
root replies count. The answer is the last root reply when the session goes
idle, and an evidence call is served only after a root tool request of that
admission names its call ID. Replies to another admission, subagent output,
and uncorrelated calls are non-answers. A hook, skill, subagent, or MCP event,
or a notification that an instruction file was discovered, at any time until
the worker's result is decided, or any permission request before the prompt,
ends the worker with `unexpected_native_effect`, and nothing more is
disclosed. The result's `detail`, which B's `worker_finished` record and its
read view keep, then names the trigger from one closed list: the event's
type, such as `hook.start` or `session.mcp_server_status_changed`, or
`tool_call`, `permission_request`, or `model_output_before_prompt` for an
evidence call outside the run, or a permission request or model output
before the prompt. Nothing the trigger carried is kept, and any detail
outside that list is recorded as `null`.

A native qualification run sets `collaboration.worker.qualification`. Before
its client starts, that worker copies the synthetic canaries listed in
`<fixtureRoot>/manifest.json`, which must match `fixtureSha256`, into its own
folders. Its readiness adds fixed probes: unknown-name controls before and
after, a read of a synthetic denied target, which must be `not_listed`, and
`view`, `create`, PowerShell `exit 0`, and a canary MCP name, each of which
must be rejected as an unoffered name with no effect. Only one answer counts
as that rejection: a JSON-RPC error with code `-32602` whose message is exactly
`Tool '<name>' is not available in this session.` for the name asked. Both
controls must give it, and every probe must match them. Any other answer
refuses with `probe_cause_unrecognized`, even when every lookup gives the same
one: another code or text, a result object, or a generic, transport, or
argument failure. The worker then waits for
`<fixtureRoot>/<workerId>.startup-release.json` before its prompt, and holds the
model's first evidence call, recorded as `worker_evidence_pending`, until
`<workerId>.evidence-release.json` appears. Each release must be the exact
closed record for this run, worker, operation, grant, session, and observation,
plus, for the evidence release, the admission and call. A release is an
observation, not permission. The 10-second startup bound ends when
`worker_preflight` is recorded; both waits count against the worker's own
limit.

On the token branch, only fake SDKs have run these checks; native attempts
have run the existing-sign-in branch's readiness checks, as
[Existing sign-in](#existing-sign-in) describes. No native run has shown that
a host reports its status, catalog, model, or ambient state truthfully. No
native run has shown what a host reports about a token-branch session's
storage either, or whether it sends the discovery notification. A host that
reports schemas or model IDs in another form than the approved ones makes the
worker refuse rather than
continue. The same holds for unoffered names: the
public SDK declares no code, text, or result for a name that `tools.execute`
does not offer, so the recognized rejection is the worker's own closed
contract, and only fake SDKs produce it. A native host that rejects unoffered
names any other way refuses qualification. Accepting another form needs
source evidence of that exact form and a reviewed change, never a broader
pattern.

B replies only when the worker's answer checks out: its maximum equals the
largest number in the listing it inspected, which must still be unchanged, and
each citation is a listed record it actually read, which must reread with the
same bytes. Otherwise the reply is a content-free non-answer; no number is
defaulted. A then checks that the reply names its project, conversation, and
slug, and that a positive maximum cites a record with that number. Otherwise
A's result is `rejected`.

Cleanup aborts a running worker, stops its client, and force-stops it when
needed, within 10 seconds. None of these steps proves that the runtime and
every process it started have exited. Once a runtime may have started,
cessation is reported `unconfirmed`, and the worker's temporary folder is kept
and reported locally, never deleted and never described to the peer.

### Existing sign-in

Instead of a token file, B's worker can reuse the saved sign-in that the
Copilot runtime itself keeps, as a normal Copilot session does. Dude
implements no sign-in for it: it never requests, reads, copies, or shows a
credential, and it never logs in, switches accounts, or falls back to the
token branch. This branch runs on Windows only; elsewhere the proposal is
refused.

The profile names the runtime's real base directory, usually
`%USERPROFILE%\.copilot`, and the expected account: a canonical HTTPS host and
a login. Its environment is an explicit selection from the names listed under
[Collaboration profiles](#collaboration-profiles), with no fixed values.
Unselected names that Windows would otherwise hand to the runtime are passed
empty, and `HOME` is `USERPROFILE` when it is not selected. Proposal
preparation binds the selected values and the resolved base directory into
the approval without showing the values, and every admission and readiness
checkpoint binds them again; any change ends the activation.

The worker owns only `work` and `temp` folders and points `TEMP`, `TMP`, and
`TMPDIR` at `temp`. Its client runs in the runtime's normal `copilot-cli`
mode with the logged-in user on, the approved base directory, and normal
logging, and it passes no token. The runtime therefore reads the owner's real
home, app data, and configuration, resolves its own saved sign-in or GitHub
CLI login as usual, and keeps its sessions and logs under the base directory.
These effects are not isolated, and the proposal says so. The session keeps
the token branch's two tools, rejected permissions, and disabled features;
those remain configured settings, not proven enforcement.

Before its first prompt, the worker asks the client it owns
(`getAuthStatus`) and its new session (`gitHubAuth.getStatus`) for their
accounts. Each must be signed in, by an interactive sign-in or the GitHub
CLI, as the expected login at the expected host. The worker asks again after
the startup latch, before each evidence text reaches the model, and before
an answer counts. Each check runs within the worker's deadline and
cancellation, and the worker rechecks its session and admission after each
wait. A missing, failing, or malformed answer ends the worker with
`auth_unavailable`, a signed-out one with `auth_required`, and another
account or kind with `auth_mismatch`; no status text or error is kept. These
checks hold at points in time; they are not an account lock, an entitlement
check, or a revocation check.

Readiness also observes the session's normal storage. Its metadata snapshot
and getter must agree on this session, the owned `work` folder, and a
workspace path of at most 1,024 UTF-8 bytes, or none, and they must agree
again after the latch and before the prompt. No ambient count or probe runs.
The worker records `worker_preflight` version 2, at most 8 KiB, with the
binding, loaders, process ID, runtime version, model, owned folder, both
accounts as observed, the normal storage, and the catalog digests, and with
no ambient or probe result. B's receiver records only the approved branch's
version and refuses the other as `readiness_mismatch`. A notification that an
instruction file was discovered is not an error on this branch, and neither
are the runtime's MCP server notices, `session.mcp_servers_loaded` and
`session.mcp_server_status_changed`, whatever they list: a normal runtime may
start the owner's configured MCP servers and plugins even though the session
itself names none, while the session's tool filters still offer the worker
model only the two evidence tools. A hook, skill, or subagent event, an
evidence call outside the run, or a permission request or model output before
the prompt still ends the worker, with its trigger in `detail`. A
version 2 qualification, for a native run only, binds a manifest of exactly
`{"version": 2, "runId": "<runId>"}`, copies nothing, runs no probe, and uses
the same two release latches.

Cleanup is unchanged: cessation stays unconfirmed once a runtime may have
started, the worker's own folder is kept, and nothing in the owner's home or
base directory is ever deleted. In the
[passing native run](#first-passing-normal-route-run), each worker's runtime
and session reported the expected account and each recorded its version 2
readiness; the answering worker read its evidence and answered, and both
workers' stops reported no errors, with cessation unconfirmed. An earlier
attempt's worker had ended with `unexpected_native_effect` after its prompt was
admitted, before it read any evidence. That pass is one point-in-time result on
one computer, and strict isolated-worker qualification is deferred, not passed.

### Live and retained transcripts

Each peer records each operation in its own workspace at
`.dude/state/a2a/<operationId>.jsonl`, beside a `.gitignore` marker that keeps
the folder out of Git without touching its index. Recording must be ready
before anything is admitted or sent. Each boundary is appended before the
disclosure it records: the exact request body before its first byte, each of
B's readiness records before its worker goes on, each evidence text before the
worker model sees it, and the exact reply body before its first byte. An
answered asking journal is exactly eight records: `opened`, `accepted`,
`request_prepared`, `request_write_started`, `reply_received`,
`reply_validated`, `terminal`, and `closed`.

- No record carries credentials, TLS keys, HTTP headers, approval codes, the
  worker prompt, model reasoning, SDK history, or refused request text. Each
  journal's header lists these omissions.
- A journal is at most 1 MiB, and its last 16 KiB are kept for closing
  records. A begin call refuses `recording_capacity` when one successful
  exchange at the profile's `contentBytes` could not fit: currently above
  45,148 bytes when serving or 146,578 bytes when asking. B's readiness
  records lowered the serving limit from 46,452 bytes, so a serving profile
  between the two values that was accepted before is now refused. Profiles of
  32 KiB still fit on both sides.
- At most ten conversations are retained, counting journals and capture
  receipts. Nothing is rotated or deleted; at ten, a begin call refuses
  `recording_full` until the owner deletes old files.
- A failed append stops further disclosure and fails the operation with
  `recording_failed`. A journal missing its terminal or closed record, or
  with a gap, reads as incomplete.
- Journals are locally sensitive, protected only by ordinary file
  permissions, and kept until the owner deletes them.

Watch or reread a journal with the read-only terminal view:

```text
node .github/extensions/dude/lib/a2a-transcript.mjs --root <workspace> --operation <operationId> [--follow]
```

It prints each complete record with terminal controls escaped, then whether
the journal is complete and, if not, why. `--follow` keeps printing until the
`closed` record or an interrupt. It opens the journal read-only, writes
nothing, contacts no peer or session, and acts on nothing a record says. Exit
status: 0 complete, 1 incomplete or unreadable, 2 usage.

### Using advice in a first capture

Reading an answer captures and stages nothing. Only an explicit decision to
use it for one first capture, under that capture's normal authority, hands the
answer's `advice.capture` to the publisher's optional
`--number-advice <absolute-staged-advice-file>`, with the staged ledger's
SHA-256, the canonical workspace, and a short reason added. The publisher
rechecks the advice against the staged ledger, this workspace, and the local
journal of the asking operation, which it finds from the `operationId` and
which must be complete with the validated reply. It then re-inventories locally
and chooses `max(fresh local maximum, accepted peer observed maximum) + 1`. It
stops above `999`, on any inventory diagnostic, and on a duplicate slug, and it
creates the ledger and the receipt `.dude/state/a2a/captures/<operationId>.json`
in one transaction. The receipt records whether the advice raised the number
(`influence: "raised"`) or local drift dominated it (`"none"`). Invalid advice
stops before any write, with no automatic local fallback. Without
`--number-advice`, capture is unchanged; refresh, reopen, and definition never
use advice. See [`@dude brainstorm`](commands.md#dude-brainstorm).

### Evidence layers and qualification status

| Layer | Evidence | Status |
| --- | --- | --- |
| Controlled unit and contract checks | `a2a-sdk-loader.test.mjs`, `a2a-peer-worker.test.mjs`, `a2a-collaboration.test.mjs`, `a2a-transcript.test.mjs`, and the publisher's advice tests use fake hosts, in-memory connections, and a fake worker SDK, for both the token and existing-sign-in worker branches. | Delivered; not real TLS. |
| Real-TLS component suite | In `a2a-collaboration-tls.test.mjs`, two independent Node processes with separate roots run the real listener, client, bundled SDK, Express, and journals over loopback mutual TLS with certificates the test creates. B's worker drives a labeled fake SDK, handed in through a test adapter so its readiness records carry no production SDK provenance, and a scripted model. One check gives B's worker the existing-sign-in branch, whose fake account proves no native sign-in. | Delivered; component evidence only. |
| Controlled native-branch checks | `qualify-collaboration.test.mjs`, `native-collaboration.test.mjs`, and `native-observer.test.mjs` cover the preview, the native branch's refusals, consent and approval handling, the permission relays, scripted runs from consent through the after-view control, startup, the held call, the answer, capture, cancellation, and the observer's final drain, the release files and recorded session storage against the actual worker module, the after-view control's required facts each removed alone, every session event type the SDK declares walked through each phase of that control and refused unless the phase permits it in its permitted form, each permitted type's other forms and identity statements walked where it is permitted, storage classification by documented purpose, and the observer's fixed source, event attribution, worker-relative paths, and stop sequence. Terminals, SDKs, and observers are scripted by the tests, and nothing stands in for an observation the run needs. | Delivered; controlled only, never native evidence. |
| Native independent AI | Two actual selected Dudes and B's actually served worker on the public host. | Passed once on the normal route (plan version 3) on 2026-11-12; see [First passing normal-route run](#first-passing-normal-route-run). The strict route has not run. |
| Native progress, capture, and inspection | Both main agents' unrelated progress while a real worker is pending, causal capture, and live plus retained reading. | Passed in that same run; process-tree cessation stayed unconfirmed. |

The component suite covers real wire correlation, wrong client and server
pins, certificates outside their validity, a client without a certificate, an
over-budget question, held work and busy refusals, cancellation and socket
loss with no late success, a killed peer, recording capacity and recording
failure on either side, live and retained reading, and both processes exiting
on their own. Its measured times are component observations; native times,
including begin, read, and cancel against their 1-second target, are recorded
under [First passing normal-route run](#first-passing-normal-route-run).

Cleanup evidence stays separate by layer:

- **Component:** the fake runtime reports a clean stop, yet the product still
  reports cessation `unconfirmed` and keeps the worker folder. The suite
  removes only its own temporary roots.
- **Native product:** once a real runtime may have started, `closed.runtime`
  stays `unconfirmed`, and `client.stop()` returning no errors is not
  process-tree proof.
- **External:** only an observer outside the product, anchored to the run's
  own process lineage, can confirm that every owned process ended. The fixed
  Windows observer, `scripts/dude-a2a/native-observer.ps1`, is that observer
  for a native qualification run, and it has never run natively. Its record
  stays in the run's proof folder, separate from product results and journals,
  which it never rewrites. It kills and deletes nothing.

Native qualification of Feature 089 is incomplete: the strict route has never
run natively, and none of its evidence sources has been established natively:

- **Served worker observation.** B's journal now records the served worker's
  own readiness before its prompt, and its admission once `send` returns and
  before any of that prompt's events are accepted. In the passing normal-route
  run, each of its two workers recorded both and held its first evidence call;
  that route checks them without an observer. A strict run checks them against
  the operation, session, permit, loaders, extension process, and observed
  processes before it writes each release.
- **Actual SDK use.** The fixed loaders now record the SDK file that the
  extension and its worker imported. In the passing normal-route run, B's
  records matched the plan's SDK files. A path, file hashes, or a qualifier's
  own import still do not show which SDK a running extension loaded.
  `createSession` silently falls back from an invalid `extensionSdkPath`, and
  `joinSession` ignores it.
- **Ambient feature enforcement.** Settings, tool metadata, refusals, or a
  model saying it cannot do something do not prove that discovery, hooks,
  skills, memory, the session store, and host Git stayed off in the served
  worker session. The native branch combines the worker's own counts and
  probes, synthetic canaries whose recognition a model-less control session
  checks first, and the observer's process and file counts. A kind none of
  them establishes fails as unobservable. The native branch now also runs one
  model-driven after-view control, whose genuine view must surface and load
  the control's `AGENTS.md` canary by public notification, loaded-source
  digest, and observed reads, and it validates the session storage B's
  worker records and classifies the worker's file accesses, reads and opens
  as well as writes, by that workspace's documented purpose; observed absence
  allows none. Only controlled checks have exercised these, and no native
  strict run has.
- **Owned process-tree cessation.** The fixed observer must see each worker's
  process tree end within 10 seconds of that worker's own recorded finish or
  cancellation, the control runtime's within 10 seconds of its own stop and
  before either main starts, and every other process the run started end
  within 10 seconds of teardown. Its event decoding and attribution are
  unverified.
- **Native permission.** Earlier native permissions expired, and a definition
  or Ship authorization grants none. The native branch asks for consent itself,
  at run time, on an interactive terminal.

Native main-agent progress needs model-requested native tool calls that
succeed while B's real worker is pending; harness counters and direct
`tools.execute` calls are not model progress. Each native proposal must be
shown complete, B's with its SHARING and WORKER scopes, and approved by the
human typing that session's exact current approval.

### First passing normal-route run

On 2026-11-12, native run `41f9334f-384c-4841-9c61-55fe06a1ccd6` of the
normal collaboration route (plan version 3) ended at
`2026-11-12T16:36:27.811Z` with exit status 0 and the verdict
`collaboration_qualified`: all 46 checks and all 11 phases passed. Its
retained report has SHA-256
`9983f87804e401feb8ada5acebb8488a2d33fc881215000ce1089241e5ac80e8`. It is the
first passing native run of Feature 089, and its verdict covers only the route
it observed, within the limits listed after the table.

| Area | What the run observed |
| --- | --- |
| Host | One Windows computer with Copilot runtime `1.0.102-0.unstable.r41779900948.gf482387`, protocol 3, and the qualifier running on Node 24.21.0. A and B were normal signed-in sessions in two independent fixture workspaces, connected by loopback mutual TLS with pinned certificates. |
| Models | Both main sessions reported the plan's main model as current, and each of B's workers recorded the plan's worker model, a different one, in its readiness. The run's plan and report keep the model IDs. |
| Accounts | Each main's runtime and actual session reported an authenticated GitHub CLI (`gh-cli`) sign-in as the expected login `E-G-C` at `https://github.com` in an initial check right after that session was created, and in a recheck before each of the main's prompts, including the first (5 rechecks for A, 4 for B). Each of B's workers recorded the same for its own runtime and session before its prompt. |
| Consent and approval | The qualifier received the fresh run consent at its interactive terminal. B's and A's complete proposals measured 4,401 and 2,235 bytes against the 4,490-byte cap. The qualifier received each session's exact current approval at the same terminal and relayed it to that session, and the unchanged classifier accepted each as an unattributed root message. No standing pairing was used. |
| Exchange | B's worker recorded readiness that matched the run's checks, and its first evidence call, an inventory, was held before any evidence was read. After the release it listed B's approved records, read record 101, and answered; B sent that reasoned reply, and A read and validated it. |
| Main progress | During the 5,177 ms that call was held, each main's own model edited its progress file through a tool call it requested: A's edit completed at 3,227 ms and B's at 5,161 ms. |
| Capture | A's model decided to use the advice. The installed Spec Lead staged the ledger and the advice in two synchronous tasks, and A's model ran the actual publisher with `--number-advice`. The receipt records fresh local maximum 100, peer maximum 101, chosen number 102, and `influence: "raised"`. The new ledger, `.dude/ideas/102-a2a-number-proof.md`, is in A's disposable fixture workspace, not this repository, and its SHA-256 matches the receipt. A's answered journal kept exactly its eight records. |
| Cancellation | In a second exchange, A's model cancelled while a fresh worker's first evidence call was held. The cancel call took 7 ms. A's result reported possible prior delivery, B's operation ended `cancelled`, and neither journal changed afterward. |
| Bounds | Begin and read calls took at most 24 ms in the advice exchange, and begin, read, and cancel calls at most 38 ms in the cancellation exchange, against 1 second. B's answering worker started in 1,462 ms and ran for 11,869 ms, against 10 and 90 seconds. A's and B's operations took 11,942 and 14,199 ms, against 120 seconds. |
| Stops | Both workers' bounded stops and both mains' SDK stops reported no errors and needed no force-stop; the mains stopped in 116 and 138 ms. Process-tree cessation stayed unconfirmed. All run and normal runtime storage and logs were kept, and nothing was killed or deleted. |
| Inspection | The qualifier wrote the journals to its terminal live as they grew. After the sessions ended, all four reread complete, closed, and identical to the live view: B's 17 and A's 8 records for the advice, and B's 11 and A's 6 for the cancellation. The qualifier then received the acknowledgment `reread reviewed` at that terminal. The report's `retained[].records` values (19, 10, 13, and 8) count rendered lines, including the reader's header and summary. |

These limits apply to that result:

- It covers one same-computer Windows run in the runtime's normal mode, with
  the effects that mode discloses. Strict isolated-worker qualification is
  deferred: not run and not passed. No observer, ETW trace, canary,
  after-view control, authentication-only fresh home, or process-tree check
  ran, so the run shows nothing about ambient-input exclusion, confinement, or
  complete cessation.
- It qualifies no physical LAN, macOS, Linux, GitHub Copilot App, other
  runtime or Node version, standing-pairing use, or any other A2A use.
  `collaboration_qualified` is not the strict verdict `qualified`.
- Its account results are point-in-time observations of one account that all
  three roles used, not an account lock, an entitlement check, or a peer
  identity.
- Its consent, approvals, and `reread reviewed` acknowledgment rest on
  ordinary local trust: terminal input and unattributed root messages are not
  proof of who entered them, and terminal output is not proof of what the
  screen displayed.
- It grants nothing. Any new run needs its own plan preview, freshly typed
  consent, typed activation approvals, current account checks, and new native
  evidence, and the preview still reports every native stage blocked.
  Recording the run here does not accept or close Feature 089's qualification
  task.

Earlier version-3 attempts stopped before a pass. In one, B's worker ended with
`unexpected_native_effect` after its prompt was admitted, before it read any
evidence. Others stopped, for example, at the progress, capture, or
cancellation checks, when no activation approval was entered in time, or when
consent timed out.

### Qualification preview for maintainers

`scripts/dude-a2a/qualify-collaboration.mjs` previews a native qualification
run without effects. With `--native`, it runs one under a fresh human
decision:

```text
node scripts/dude-a2a/qualify-collaboration.mjs --plan <absolute-plan.json>
node scripts/dude-a2a/qualify-collaboration.mjs --native --plan <absolute-v2-plan.json>
```

The plan is one closed JSON object. Version 2 runs the strict qualification
and version 3 the normal collaboration route, each natively only through
`--native` with a complete, current plan. Version 1
is still previewed; it names each main's progress as free text and has no
runtime payload or observation. This version-2 template is inert; for example,
its string port is refused:

```json
{
  "version": 2,
  "expiresAt": "<UTC time, YYYY-MM-DDTHH:MM:SSZ, when the requested scope ends>",
  "operator": "<the named human operator>",
  "coordinator": "<the named coordinator>",
  "fixtureParent": "<short absolute path of a new, empty folder outside this repository and any Git work tree>",
  "artifacts": {
    "cli": "<absolute path of the installed Copilot CLI executable>",
    "runtimePayload": "<absolute path of the runtime file that executable loads, or null if it is the whole runtime>",
    "sdk": "<absolute path of the public copilot-sdk folder>",
    "sdkAppliedAt": "createSession"
  },
  "models": { "a": "<A's model ID>", "b": "<B's model ID>", "worker": "<B's worker model ID>" },
  "credentials": { "a": "<A's credential file>", "b": "<B's credential file>", "worker": "<B's worker token file>" },
  "tls": {
    "a": { "certFile": "<A's certificate PEM>", "keyFile": "<A's private key PEM>" },
    "b": { "certFile": "<B's certificate PEM>", "keyFile": "<B's private key PEM>" }
  },
  "transport": { "port": "<B's loopback port from 1024 to 65535, as a number>", "projectId": "<the agreed project ID>" },
  "progress": {
    "a": { "path": "progress-a.txt", "initial": "pending\n", "final": "complete\n" },
    "b": { "path": "progress-b.txt", "initial": "pending\n", "final": "complete\n" }
  },
  "capture": { "slug": "<the slug A captures, at most 57 characters>" },
  "observation": "windows-etw"
}
```

The preview validates the plan and refuses: an SDK folder that would fall
back, being missing or without `index.js` and `extension.js`; an SDK path
applied at `joinSession`; a CLI that is Node, a script, or a file inside this
repository; a fixture folder that is not new or empty, or is inside this
repository or any Git work tree; secret files inside the repository or a fixture
workspace; and every unknown key, including approvals, consent, proof, stage
results, model providers, fakes, and adapters. For version 2 it also refuses
progress fixtures or an observation other than the fixed ones, a runtime
payload that is not a regular file outside this repository, and a longer slug.
It records the path, size, and SHA-256 of the CLI, the runtime payload, and
the SDK's two files, and prints one bounded JSON report: each check, the
planned effects for a human decision, a scope digest, the proof sources
(permission missing, every other source unverified), and every native stage
`blocked`. A version-2 digest also binds this runner's, the native branch's,
and the observer's source, which define the fixed after-view control and the
worker-relative path observation, the core bundle rendered from this
repository's source, and the fixed canary manifest. The planned effects
disclose that control's model, credential route, session, prompt, view
target, surfaced canary reads, relay, and bound, and the path observation,
before any consent. The preview never imports or
constructs the SDK; starts no runtime, session, model, listener, connection,
or observation; opens no credential or TLS file; asks for or records no
approval; and writes, kills, or deletes nothing. Exit status: 3 for a complete
plan, which qualifies nothing; 1 for an invalid, incomplete, or expired plan;
2 for usage or an unreadable plan. It never exits 0. No flag or plan field
grants authority.

#### Native run

The native branch, `scripts/dude-a2a/native-collaboration.mjs`, is
implemented, but it has never run this strict qualification natively, so
nothing about that run's native behavior is known. It needs:

- Windows, with Windows PowerShell 5.1 in
  `%SystemRoot%\System32\WindowsPowerShell\v1.0`, and an interactive terminal
  for both input and prompts.
- Membership in Administrators or Performance Log Users, in a terminal you
  opened that way, because the observer opens a real-time Event Tracing for
  Windows (ETW) session. Without it the run stops with
  `observer_privilege_missing`. Nothing elevates, installs, or registers a
  service.
- A version-2 plan that previews with no failing check, and everything it
  names: the installed CLI and public SDK, both owners' credential,
  certificate, and key files, B's worker token, the three models, and a free
  loopback port.
- A runtime payload. A plan whose `runtimePayload` is `null` previews, but a
  native run refuses it before consent as `runtime_identity_unobserved`:
  nothing observable shows that the executable alone is the whole runtime.
- A short fixture parent. B's complete proposal names the fixture paths and
  must fit the 4,490-byte cap. A longer path can exceed the cap, which is
  refused, never raised.

A run proceeds in this order and stops at the first failed check:

1. It shows the whole scope on the terminal. Under ACTION NEEDED it shows
   the exact consent line,
   `approve native <first 16 characters of the scope digest>`; type or paste
   that one line and press Enter. Redirected, ended, or multi-line input
   refuses; anything entered before a prompt appears is ignored, and the
   prompt asks again. It then recomputes
   the scope and stops if the plan, an artifact, its own source, the observer,
   the rendered core, or the fixture changed, or the plan expired.
2. It creates only the short folders below the fixture parent: `a`, `b`, and
   a control side `k`, each with `w`, `h`, `c`, and `t` for
   workspace, home, configuration, and temp; `q` for the canary fixture; and
   `p` for proof. It renders the core bundle into both workspaces, seeds A
   with record 100 and B with records 100 and 101, and writes each owner's
   configuration.
3. It starts the fixed observer, `scripts/dude-a2a/native-observer.ps1`,
   which must calibrate on a Node helper that writes, reads, and exits before
   any SDK loads. The run owns the observer from launch: if it never reports
   ready, the run closes its input, waits a bounded time for it to exit, and
   reports its end unconfirmed rather than killing it.
4. A control runtime, whose client uses the SDK's empty mode, must recognize
   each canary form from its own parsed public answer at its exact location:
   agents, instructions, hooks, skills, and MCP servers through discovery
   with no discovery errors, and the Git canary through the control session's
   metadata. A file read, or another form of the same kind, never stands in.
   Each instruction canary must come back with its own documented type, as a
   `repository` or `working-directory` source of the scanned project, the two
   locations the SDK documents for a project scan, still bound to its exact
   path and digest.
   An unrecognized form stops the run as `ambient_state_unobservable`. That
   discovery session is then disconnected, and one fresh session in the same
   runtime, with A's model and A's credential and only the built-in `view`,
   working in `k/t`, is sent one fixed prompt to view
   `k/w/dude-canary-denied-read.txt` once; type `approve-once` or `reject` for
   its read. Its own model's view must surface and load `k/w/AGENTS.md`: the
   run requires that one root view request, its successful model-facing
   output, at most 4,096 bytes, holding the synthetic file's text exactly
   once (a heading or line number around it is fine), the public
   instruction-discovered notification for `AGENTS.md`, `AGENTS.md` among the
   session's loaded sources by digest with a documented repository type and
   location (type `repo` or `nested-agents`, location `repository`), and the
   control runtime's observed reads of both files after the discovery
   checks, all within one 60-second phase that ends before either main
   starts. Anything less, including a host that sends no such notification,
   stops the run as `ambient_state_unobservable`. Every public event of that
   session must be one its phase permits, in the form that phase permits;
   any other stops the run the same way, including an event of a type the
   SDK does not declare, a subagent's, one without the documented envelope,
   and a list of skills, commands, custom agents, MCP servers, or extensions
   even when it is empty or disabled. Before the prompt, the session may only
   start once as itself while it is created, report idle, its system message,
   and its tool catalog, and, only until the run asks for each check, select
   its model at startup or through the SDK and report its working directory.
   From the prompt to its turn's end it may only admit that one prompt and
   show the system message, that turn's model messages, the view's one
   request, its read's permission, start, progress, output, and discovery
   notification, and the model's own processing: its turns, intent,
   reasoning, streaming, usage of its own conversation's calls (never a
   sub-agent's, sampling, background, or compaction call), successful model
   dispatches that requested no file edit, and an assistant idle that was
   not aborted. Its permission events must be that one read, for the relay to
   answer once, with no hook, delegated owner, assisted approval, recovery,
   or kept grant. After the turn's end, through the post-turn snapshot and
   source query, only housekeeping and another normal idle may come; every
   other event, including any further prompt, tool call, notification, or
   reply, stops the run, and none of them can supply a fact the turn did not
   show. Housekeeping, the session's title and its token or quota
   accounting, may come at any time. An event that states the session, an
   admission, or a tool call must state the ones the run established, so
   another session, a reply or prompt of another admission, or a tool call
   other than the view stops the run. Once the run asked for the model
   check, a tool catalog update must name the checked model. A change of the
   model or of the working directory after the run asked for its check stops
   the run, even the same one restated; a model selection or working
   directory reported before its check is superseded by that check. The
   model named on the turn's own events, such as its turns and usage, is a
   telemetry label, not proof of which model ran; the run does not compare
   it, and it may read `unknown`. Everything the session sent before the
   prompt is judged just before the prompt is sent, so after such an event
   nothing is sent. The control runtime is then
   stopped, and its whole process tree must be seen to end within 10 seconds
   of that stop before either main starts, or the run stops as
   `cessation_unconfirmed`; the final summary judges that window again. A
   snapshot that lost, could not decode, or could not attribute events while
   the runtime stopped confirms nothing, and the run stops with that
   observer coverage reason. The control's event judgment ends with its
   post-turn source query: what the session delivers during that stop is
   neither judged nor listed in `refusedEvents`, though the stop is still
   checked as above and the session's event log still fails the run if it
   overflows.
5. B and A start with project discovery, requested extensions, and
   `extensionSdkPath` at `createSession`. Each runtime, like the control's and
   each worker's, must be observed as the run's new CLI process loading the
   plan's runtime payload. Each session must run one `project:dude` extension
   and select the rendered Dude agent.
6. Each main's model calls `dude_a2a_propose`; under your consent the relay
   approves that exact call without asking, as described below. Its complete
   result is shown whole. Read it,
   then type that session's exact current approval or `dude a2a stop`. The
   ACTION NEEDED block shows that approval line; if it cannot pick out
   exactly one `Approval` line in the result, it explains where to find that
   line instead. Only your entered line, without surrounding spaces, is sent,
   and the unchanged classifier must accept it
   as an unattributed root message, or the run stops.
7. Both whole exchange instructions are sent together, and the relay approves
   each main's own conversation calls for that exchange, and its reads of its
   own workspace, under your consent, as described below. Sending them does not
   order them, so the run then requires the order in the runtimes' own event
   stamps: both instructions admitted strictly before the earlier begin
   request, and B reporting that it waits strictly before A asks. A tie, a
   missing stamp, or an uncorrelated request stops the run as
   `instruction_order_unproven`, and no root prompt follows while an operation
   is pending. The runner writes the worker's startup release only after its
   recorded readiness, its observed processes and their images, and its
   storage check out. Its recorded session workspace must still be the same
   directory by path, device, and inode; recorded absence allows no session
   persistence. Every file the worker touched since the observer started,
   before that check as well as after it, is then classified: in its
   configuration and home storage every access, a read or open as well as a
   write, must be the creation, opening, reading, or writing of that
   workspace's `events.jsonl`, `workspace.yaml`, or `plan.md` or of something
   in its `checkpoints` or `files` folder, or the creation or opening of that
   workspace or a folder on the way to it. Its temp area stays allowed, it may
   read its working folder, and it may open its own folder, whose name is
   compared without case, as Windows compares it. A shell or any
   other unverified image fails as `unexpected_native_effect`, and a store the
   run cannot classify, such as a sidecar or staging name, another session,
   the runtime's own settings or any other configuration or home file, a path
   in its own folder that the observer could not read as one plain spelling,
   or any session access after recorded absence, fails as
   `ambient_storage_unclassified`. A genuine
   run may stop here on a read it cannot explain, such as the runtime opening
   its own settings file. Nothing is learned from such traffic: any allowance
   for it needs a planning decision backed by evidence, and the
   worker-relative paths the observer keeps show what was touched. When the
   worker's first evidence call is held, `progress-a.txt` and `progress-b.txt`
   appear; each main's own model
   must change its file from `pending` to `complete` through a native tool
   call it requested for this instruction, inside that interval, before the
   evidence release is written. Under your consent the relay approves that
   exact edit without asking you.
8. A decides whether to use the advice. Its normal capture has the installed
   Spec Lead stage the ledger and then the advice, each in its own synchronous
   task, while A's root model runs the inventory, hash, and actual publisher
   commands, the publisher with `--number-advice`; the receipt must show local
   100, peer 101, chosen 102, and `raised`. Under your consent the relay
   approves, without asking you, reads of A's own workspace in this step, by
   A's model or that Spec Lead, and also the exact inventory, hash, and
   publisher commands, each new staging file, and any read of A's temp
   folder, as described below. Nothing in this step waits for your input.
9. One more exchange starts a fresh worker. While its first evidence call is
   held, `cancel-a.txt` appears, and A's model cancels through the
   conversation tool, a call the relay approves under your consent like the
   rest of that exchange's conversation calls.
10. Only SDK lifecycle stops run. The answering worker's process tree must end
    within 10 seconds of its recorded finish, checked before capture, and the
    cancelled worker's within 10 seconds of B's terminal record. At teardown,
    permissions close first, then every client stops at once within one
    shared 10-second budget, and every other owned process must end within
    it. The observer then stops its trace, drains every buffered event, and
    writes its final summary; every check runs again on that summary, and the
    helper's actual exit is awaited. Both journals are shown live as they grow
    and again after the sessions end; compare them, then type
    `reread reviewed`.

Each main's permission requests go to a fixed relay, and only for a tool
call that the session's own model requested for its current instruction,
with one exception in A's capture step, described below.
Dude's own tools ask for permission in the runtime's normal mode, and your
consent covers the current step's exact calls of them: the relay approves
each such call once without asking you, from the moment the step's
instruction is admitted until its turn ends. In each proposal step that is
`dude_a2a_propose` with that session's `a2a.json` and profile. In the advice
exchange it is B's `dude_a2a_conversation` `begin_receive` and `read`, and
A's `begin_ask` for the plan's slug with the fixed question and an integer
tentative number, and `read`; in the cancellation exchange it is the same
for B, and A's `begin_ask` for `<slug>-cancel`, `cancel`, and `read`.
`read` and `cancel` need a well-formed operation ID, and the product checks
which operation it names. A view can ask for permission to read too, even
inside the session's own working directory, so your consent also covers
reads of each session's own workspace, `a/w` for A and `b/w` for B: in both
exchanges and the capture step, the relay approves once, the same way, each
read that the session's own model requests of that folder or of anything in
it while the step's turn is open, and in the capture step the Spec Lead's
reads of `a/w` too. It never approves a read of the other session's
workspace or anywhere else, any other subagent's read, or a read after the
turn ended. A call or read that managed policy marks as needing a person is
rejected instead. The approval steps allow neither, and the capture step
allows no Dude tool call. The report counts these approvals for each session
in `toolApprovals`, by tool and operation and, for those reads, as
`workspace.read`, or `spec_lead.workspace.read` for the Spec Lead's. A request
rejected as `not_pending` is one that no open step or phase allows. One
rejected as `approval_withdrawn` exactly matched what its step or phase
allows, but that turn or interval ended, or the request otherwise stopped
being allowed, before the relay answered.

In A's capture step alone, the relay can also attribute a request to the
installed Spec Lead: the rendered `.github/agents/dude-spec-lead.agent.md`,
which A's session must list at that path with exactly its rendered bytes
before any prompt. A permission callback names the session but not the agent
that asked, so the relay waits briefly for A's own session events and
requires all of them: A's model requested a task call for the current
instruction that selects the Spec Lead in `sync` mode, and that call
started; the runtime started exactly one sub-agent for it, with no spawning
sub-agent; that sub-agent itself requested the call; and the request's
permission event is still pending. A background task, a sub-agent started by
another sub-agent, any other agent, an earlier instruction, or a task,
sub-agent, or call that already ended does not count, and the relay checks
all of this again right before it answers. A
sub-agent's request that fails it is rejected with a `spec_lead_` reason
naming the fact that failed. The Spec Lead may only read and stage: A's
model runs every command and stages nothing itself, and the Spec Lead runs
no command and calls no Dude or other tool.

Your consent also covers these exact actions, each a call that the session's
own model, or in the capture step that Spec Lead, requested for its current
instruction: inside the progress interval, the progress file's exact
`pending`-to-`complete` edit; and while the capture step's turn is open, from
A's model only, the exact inventory command, one fixed `Get-FileHash` of a
staged ledger, and the publisher command for the plan's slug with staged
files under A's temp folder; from the Spec Lead only, each new staging file
there, as its own complete creation; and from either, a read of that folder
itself or of anything in it. The relay approves each of these once without
asking you. Right before it answers, it checks again that the interval or
turn is still open with your consent granted, the run not closing, and the
scope current; that the call is still requested for that instruction, or is
still the same live Spec Lead's, and has not completed; and that the request
is still the exact action it matched. Otherwise it rejects the request as
`approval_withdrawn`. A request that managed policy marks as needing a person
is rejected instead. The report counts these approvals in `toolApprovals` as
`progress.edit` for the edits, `capture.command` for the commands,
`capture.read` for A's model's reads of its temp folder or
`spec_lead.capture.read` for the Spec Lead's, and `spec_lead.capture.staging`
for the staging files. Everything else is rejected without asking, including
removing the staging folder, so staged files stay in A's temp folder. The
worker's own permission requests stay denied by the product.

The report lists each rejected request in `permissions` with a `target` of at
most 256 bytes, the requested path or the tool, command, or extension name,
never a command's text, arguments, or contents. Each approval of the exact
actions just described is listed there too, with the answer `consented`. It
keeps the first 50 such entries, rejected or consented, and counts any
further rejected request in `permissionsOmitted`; a further approval is still
counted in `toolApprovals`. A request shown to you for a typed answer, which
only the after-view control's relay makes, is always kept.

The after-view control's session has its own fixed relay, the only relay
that asks you, for a typed `approve-once` or `reject`: it shows only a read
that its sole pending model-requested view needs,
of the view's target or a fixed instruction canary that view may surface,
and its prompt ends with the control's 60-second phase or the scope's
expiry, whichever comes first, when the prompt itself is released. Its
request is also withdrawn, before its turn or after your answer, as soon as
that session reports the view's turn ended, aborted, or failed, or any other
operation in it. Any other event that would fail the control, as in step 4,
withdraws it the same way. It never answers
for a main session or the worker. Apart from the exact requests above that
your consent covers, there is no approve-all mode, saved consent, computed
approval, or permission file. Both `dude a2a approve` lines and
`reread reviewed` are still yours to type.

The plan is at most 16 KiB. The report is at most 64 KiB; it goes to stdout
and, once the fixture exists, to `<fixtureParent>/p/report.json`. A larger
report is replaced by a closed `observation_overflow` refusal, never
truncated. Whenever the after-view control's session ran, however its phase
ended, the report's `control` record keeps `refusedEvents`: one entry per
distinct event type and class that it refused, in the order first seen, at
most 8, each `{ "type", "class", "count", "id" }`. Types are told apart by
their own values, never by how they are shown below, so two types shown alike
stay two entries.
`type` is the event's type when it is at most 64 characters from `A-Z`,
`a-z`, `0-9`, `_`, `.`, and `-`; otherwise it is `(unavailable: N bytes)`
with its UTF-8 length, or `(unavailable: no type)` for a delivery that was no
event. `class` is `undeclared` (a type the SDK does not declare), `malformed`
(an undocumented envelope), `competing` (a type its phase does not permit, or
a form that phase does not permit), `subagent`, `contradicting` (another
session, model, admission, or tool call than the control established), or
`after_turn` (anything after its turn ended other than housekeeping or
another normal idle). `id` is the first such event's ID when
that is a safe identifier, otherwise `null`. `refusedEventsOmitted` counts any
further distinct entries. A second view request, view start, or view
completion before the turn ends is named by the closed problems
`tool_requests`, `start`, and `completion` and need not appear in
`refusedEvents`; a second prompt is named `other_prompt` and, as another
admission, a `contradicting` entry. No event data, prompt, model text, or
reasoning is kept; the `after_view_control` check's detail names the same
entries, and so does the stop of a run that refused before the prompt. Each
session's event log keeps at most 8,192 events and 4 MiB, and
one message at most 64 tool requests; more fails the run as
`observation_overflow` instead of dropping events. The observer's summary
is at most 64 KiB and 128 processes. Below each worker's own folder it also
keeps, from its start, each file's path relative to that folder, except in
the worker's temp area, and charges each new row to that 64 KiB when it first
appears; a row that would not fit, or a path over 1,024 characters, is a
sticky overflow that fails the run, never a dropped row. A path there that is
not one plain spelling (a `.` or `..` segment, an empty or forward separator,
a trailing dot or space, a stream name, or an 8.3 short name) keeps no name,
gets no area, and fails the run. Outside the worker
folders it keeps path classes and counts only. An operation has 120 seconds,
the worker 90 seconds, its startup 10 seconds, and cleanup 10 seconds; begin,
read, and cancel must each return within 1 second by the runtime's own
timestamps. Exit status: 0 only when a native run passed every check; 4 for
every refusal or failure; 1 for a plan that cannot run natively. Nothing is
retried, rerun, killed, or deleted; the fixture, the worker folders, and the
staging files stay for inspection.

These native properties are unverified, and each one fails the run rather
than passing it:

- The observer reads fixed Kernel-Process and Kernel-File event properties by
  name and attributes each event to the process and thread identity current
  at its timestamp, including events delivered after their process exited.
  Those names, write attribution for cached or asynchronous I/O, and the
  mapping of device paths to drive letters are untested on a real host.
- The CLI's permission requests for reads and edits, whether the control's
  discovery and session metadata answer as documented, whether the host
  rejects unoffered tool names in the one recognized form, whether a runtime
  admits both instructions before either begins, and whether models follow
  the polling and progress instructions within the hold are untested.
- Whether a host sends the instruction-discovered notification and loads the
  surfaced `AGENTS.md` after the control's genuine view, what it reports as
  that view's output and as that source's type and location, which files a
  served worker's session actually reads and writes, and the names the
  observer sees for them are untested; a host that shows anything else fails
  the run.
- The control's phase lists are derived from the SDK 1.0.102 declarations
  its source cites, and any event outside them stops the control.
  Newer installed SDKs (1.0.106) also declare `session.journal_link` and
  `instruction.update`, an authoritative developer-instruction update that
  may accompany instruction discovery; older ones declare `factory.run_*`
  events; and the 1.0.102 runtime itself names events its SDK never
  declares, such as `session.usage_record` and `model.call_start`, which
  stay refused because nothing shows when it sends them. Use the CLI and
  SDK pair of the plan's source basis (1.0.102). A genuine host may also
  stop the control by sending any list of skills, commands, custom agents,
  MCP servers, or extensions, or a capability or indexed-search update,
  even an empty or disabled one; by updating its tool catalog during the
  turn, or its model or working directory after the run asked for that
  check, even unchanged; by delivering its own start only after its
  creation returned, or any turn event after the turn's idle; by
  reporting a completion receipt, a failed or retried model call, or an
  informational notice during the turn; by reporting a permission or mode
  change, such as `session.permissions_changed`, a task-completion notice,
  or a compaction or truncation of its conversation history; by sending a
  null `agentId` or
  `parentToolCallId`, an event ID over 128 bytes, or no `data` object; or
  by labeling `AGENTS.md` after the view, or an instruction canary in the
  scan, with another type or location than the documented ones above. The
  notification's `sourcePath` is documented only as a relative path, with
  no base, so only `k/w` and `k/t` are tried. A first genuine run may stop
  on any of these. The refused event's type and class in the report are
  where a planning decision starts; nothing is learned or allowed from such
  a refusal by itself.
- Product cessation stays `unconfirmed` by design; only the observer's record
  can confirm that owned processes ended.

This is the prerequisite sequence; nothing here authorizes any step:

1. Write a complete version-2 plan and preview it until no check fails.
2. B's own readiness records remain the only source of evidence about B's
   actually served worker; see
   [B's restricted evidence worker](#bs-restricted-evidence-worker). The native
   branch reads them from B's journal during a run; the preview does not.
3. Present the planned effects and scope digest to the human through the
   existing Needs You or manual operator handoff. The decision stays there;
   the runner neither receives nor verifies it.
4. Only under that current decision may an operator run the native branch at
   an interactive terminal, where it asks for the consent literal itself.
   Preview again on the day of the run, because any change to the plan, the
   hashed files, the runner, the observer, or the core changes the scope
   digest.

For Feature 089, this guide records one passing run's ID, end time, and report
digest under [First passing normal-route run](#first-passing-normal-route-run)
and summarizes earlier attempts. It records no native input, consent line,
approval code, private path, or raw result.

## Interruptions, cancellation, and uncertain outcomes

| Event | Effect |
| --- | --- |
| B's receive call returns normally | The exchange stays open for B's reply. |
| B's reply is sent | The exchange is used up; a follow-up needs a new receive. |
| Normal proposal tool return, including completion-abort of its invocation signal | An otherwise valid proposal stays pending for the next eligible local approval. The result proves neither display nor review. |
| Root abort, a new main-chat message, or queued input | Pending proposal eligibility or a starting approval ends. For a live activation, the current receive or exchange ends, and A gets `unavailable`; the activation stays. Messages attributed to subagents, autopilot, or another host source do not count as new input, but an opaque nonempty queue can still interrupt. |
| Stop, shutdown, expiry, or a changed configuration, profile TLS file, session, or workspace | The activation ends before anything else is admitted or sent. |
| A's call is cancelled or reaches `askTimeoutMs` | A stops waiting and drops later bytes. If the question may already have left, the outcome is `uncertain`. |
| A disconnects before B replies | B's exchange ends, termination is requested for a running command, and B's later reply is refused. |
| A late, duplicate, or cross-exchange reply | Refused as `exchange_not_current` and never delivered to another call. |

Stopping a command is a best-effort request for that command only:

- On Windows, Dude runs `%SystemRoot%\System32\taskkill.exe /PID <pid> /T /F`
  for the process it started.
- On macOS and Linux, Dude sends `SIGKILL` to the process group it created for
  the run. This path has not been exercised.
- Dude never signals a process by name, and never after the command's own exit
  was observed, when its process ID could already belong to something else.

The run record keeps the termination request, the Windows helper's start and
exit code, and the command's own exit as separate observations. A helper exit
code of 0 does not prove that the process tree stopped, and child processes
that outlive the request stay unknown. Observation waits at most 2 seconds after
the command exits or termination is requested; output still open then is marked
incomplete. Processes that B's model started with its normal tools are not
stopped.

## Security and disclosure limits

- Host permissions are unchanged. Activation neither answers nor removes host
  permission prompts; if a prompt appears, that operation was not fully
  preapproved.
- There is no global sandbox. Peer text and file contents can persuade a model,
  and a model can disclose anything its normal tools can reach. The sharing
  text guides both models and bounds what the adapter attaches; it does not
  contain every tool.
- Evidence roots bound what the adapter attaches, not what other tools can
  read. Command validation bounds this adapter's runs, not every process a model
  can start.
- Disclosure cannot be recalled, and ordinary host transcripts are not
  suppressed.
- Collaboration journals and capture receipts keep authorized message content
  in each workspace; they are locally sensitive until the owner deletes them.
- The configuration, key files, and pairing records are protected only by
  their file permissions.
- A standing pairing rests on the same ordinary local trust. Its one
  enrollment approval is root input, not proof of human authorship. Anything
  that can write the `.pairings` folder without restriction can forge or
  remove a grant; the record has no signature or seal. After enrollment,
  anything that can call `dude_a2a_propose` in that session, including its
  model, can start a paired activation within the stored scope without asking
  you. The required notice reports that activation; it does not ask.
- Communication never changes Dude's workflow state: no task claims, task
  states, reviews, or closures.

## Before any live use

Nothing in this guide authorizes a live run. Before any real validation, the
owners must explicitly authorize each of these by exact value:

- the two sessions and their workspaces;
- the endpoints, meaning addresses and ports;
- the certificates, keys, and fingerprints;
- what may be disclosed, and the evidence folders;
- the command catalog, parameters, revision policy, declared effects, and
  resource and time limits;
- for collaboration, the project ID, B's worker runtime, arguments,
  environment names, model, token file or existing-sign-in base directory
  and expected account, roots, and kept storage, and the
  recording and retention of both peers' journals and receipts;
- for a standing pairing, each paired profile and its record location;
- the cleanup afterward, such as stopping both activations and removing any
  certificates or firewall rules created for the test.

Permission given for earlier experiments, including Feature 068's retired
isolation gate (Q0), grants nothing now.

Standing pairing has automated evidence only, and its native qualification is
deferred and not passed; see [Standing pairing](#standing-pairing). Its
automated checks grant no actual pairing.

Proposal-only observation grants no activation, listener, peer exchange, or
command permission. Remaining local Windows CLI qualification must inspect
the actual custom result for asking, share-only serving, and command-enabled
serving profiles, including complete bodies through the fixed 4,490-byte cap
and every selected command.
The delivered guard's short oversized refusal and replaced-code rejection
also need native qualification. Built-in read/search cards, private
logs, and assistant summaries are not evidence that the custom result is
complete or accessible. Intended approval-event delivery and activation,
status, stop, and failure notices need separate observation under the
authorized scope.

The [observed native cases](#observed-native-cases) include three Windows LAN
share-only responses, with two question-specific follow-ups. They do not
complete the remaining local AI/tool conversation, native review/approval,
or fresh-verification qualification. T019 still requires an initial local
exchange plus two question-specific follow-ups, real harmless command runs
under both revision policies, and all applicable local TLS/socket-loss,
cancellation, negative-case, lifetime, process-outcome, resource-bound,
effects, availability, and teardown evidence. T020's independent final review
remains outstanding.

Untested physical-LAN command, failure/cancellation, security-negative, and
availability cases, macOS/cross-OS, and App-specific tests are deferred,
unqualified, and nonblocking for this increment. LAN capability remains
available, without a broader support claim. Do not use the GitHub Copilot App
for remaining testing. The supported-bound App display failed; earlier failed
and incomplete attempts remain unchanged history, not new permission or
support evidence. T019 remains incomplete and blocked pending fresh
native/live qualification.

## For maintainers

- Rebuild the runtime only when its pinned inputs in `scripts/dude-a2a/`
  change under authorized maintenance. Run
  `npm ci --prefix scripts/dude-a2a`, then `node scripts/dude-a2a/build.mjs`,
  which writes `src/extensions/dude/lib/a2a-runtime.mjs` and its `.LEGAL.txt`
  notice. `node --test scripts/dude-a2a/build.test.mjs` checks the pins, the
  notice, and that a scratch rebuild reproduces the committed bytes. Proposal
  presentation changes do not require a runtime or notice rebuild.
- `node scripts/build-dev.mjs` projects the extension, including these files,
  into `.github/`, and `scripts/build-release.mjs` ships them in releases
  without tests, `node_modules`, or build tooling. `scripts/build-dev.test.mjs`
  and `scripts/build-release.test.mjs` check that parity and the default-off
  release behavior.
- The offline tests are `src/extensions/dude/a2a.test.mjs`,
  `a2a-transport.test.mjs`, `a2a-verify.test.mjs`, `a2a-sdk-loader.test.mjs`,
  `a2a-peer-worker.test.mjs`, `a2a-collaboration.test.mjs`, and
  `a2a-transcript.test.mjs`. They use fake hosts and in-memory connections, so
  they do not prove real host behavior.
- `src/extensions/dude/a2a-collaboration-tls.test.mjs` runs two peer processes
  over real loopback mutual TLS with certificates it creates and a fake worker
  SDK. It needs no OpenSSL or install, and it is component evidence, not native
  qualification.
- `scripts/dude-a2a/qualify-collaboration.mjs` previews native qualification
  without effects. With `--native`, it runs the native branch in
  `native-collaboration.mjs`, whose version-3 route has passed natively once
  and whose strict version-2 route is unverified. That branch starts the fixed
  Windows observer `native-observer.ps1` for a strict version-2 run but not
  for a version-3 run; see
  [Qualification preview for maintainers](#qualification-preview-for-maintainers).
  None of them ships, and neither do their tests,
  `qualify-collaboration.test.mjs`, `native-collaboration.test.mjs`, and
  `native-observer.test.mjs`. The tests start no runtime, model, or ETW
  session. On Windows, the observer test compiles the embedded reader and
  drives its event entry points, attribution, and stop-and-drain sequence
  with synthetic events and test doubles for process handles.
