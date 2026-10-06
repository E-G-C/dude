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
  five tools: propose, ask, receive, verify, and reply.
- `lib/a2a-transport.mjs` sends and receives messages over mutual TLS.
- `lib/a2a-verify.mjs` runs named commands and records what it observed.
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

Preparation validates the configuration, TLS files, and current local binding.
It does not approve, load the A2A runtime, open a listener or socket, connect to
the peer, send a question, run verification or Git probes, or change workflow
state. A successful `ToolResultObject` has `resultType: "success"` and the
complete plain-text proposal in `textResultForLlm`. Success means preparation,
not activation or proof of display.

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
An eligible replacement attempt withdraws the previous pending proposal even
when the replacement is oversized. Neither a refused nor a replaced code can
activate anything. Choose an explicitly smaller profile, request a fresh
proposal, review its complete native result, and give fresh local approval
for each activation. There is no summary, file, log, or paging fallback, and
no automatic splitting or retry.

The bound comes from the limited native CLI calibration above, not from the
historical oversized App failure. Size eligibility and distribution parity
still do not prove complete display or human review. Stop before approval
whenever an accepted result is incomplete or inaccessible. A new refusal from
the delivered guard does not change the 2026-09-30 App failure's verdict.

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
- B then starts its configured listener; A prepares its pinned client. Nothing
  is sent until A's model asks. The adapter emits an `Activation: active; ...`
  notice with the profile, endpoint, validity, and available operations.
  Native visibility of that notice is still unqualified.

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
| `Activation: active; ...` | The approval took effect. |
| `Activation: inactive` | The activation ended; the line before it says why. |
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

An activation also ends when:

- the session shuts down or its conversation context is cleared;
- `expiresAt` passes;
- the activation notice's log call fails; a successful log call still does
  not establish native visibility;
- the configuration, the profile's TLS files, the session, or the workspace no
  longer matches the approval, checked before each admission, run, reply, and
  send.

If the session's workspace changes, the extension instance refuses further
activation until the extension restarts. Nothing is restored from history;
propose and approve again.

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
- The configuration and key files are protected only by their file permissions.
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
- the cleanup afterward, such as stopping both activations and removing any
  certificates or firewall rules created for the test.

Permission given for earlier experiments, including Feature 068's retired
isolation gate (Q0), grants nothing now.

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
  `a2a-transport.test.mjs`, and `a2a-verify.test.mjs`. They use fake hosts and
  in-memory connections, so they do not prove real host behavior.
