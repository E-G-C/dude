# Native-chat interaction v1

> **PROPOSED illustration, not live evidence.** All dialogue, events, and runtime values are hypothetical. `<...>` denotes a placeholder, not input needed to draw this mock. These planned commands/tools are not implemented; the examples are not executable instructions.

Scenes cut between A (Windows) and B (Mac), not a shared UI. A waits, then receives a result; B's progress stays on B. Tool excerpts are model-facing (`resultType`, JSON in `textResultForLlm`); their host display is unqualified.

## 1. Review each local proposal

Owner B (Mac), hypothetical typed text: `dude a2a propose <config-path> <profile>`

B's proposed plain `session.log`:

```text
Proposal: B serve
Config: <B-absolute-external-config-path>; digest <config-digest>; profile <B-serve-profile>
Local: <B-session>; provider <generation>; workspace <B-workspace>
Peer: A (Windows); <configured-private-address/port>; <expected-certificate-fingerprint>
Listen: <configured-private-listen-address>
SHARING: <questions/replies/evidence/source-details>; excludes <excluded-information>
Purpose: <confirmation-purpose>; evidence roots <approved-roots>
Sharing limits: <contentBytes>; validity <expiry-or-activation-end>; repeat use <covered-exchanges>
COMMANDS: <command-ID>; separate from SHARING
Executable: <absolute-executable>
Argv: <fixed-arguments-and-whole-element-slots>; parameters <enums/patterns>
Cwd: <workspace-contained-cwd>
Environment names: <inherited/fixed-names>; values hidden
Revision: <explicit-commit-pin-or-current-worktree-policy>; no default
Run limits: <timeoutMs>; <outputBytes-per-stream>
Effects/resources: <owner-declaration>, not guaranteed
Command validity/repeat use: <expiry-or-activation-end>; <covered-runs>
Risks: Ordinary host permissions are not global isolation. Peer/source text can persuade models or cause disclosure. Host-approved injection can spoof root approval. Revision probes miss ignored/transient changes; project code can exceed declared effects. Host prompts remain unchanged. Stop does not guarantee termination or recall disclosure.
Approval: <code>; current matching proposal/context only, consumed once
```

The Revision line expands to exactly one policy:

- Commit `<pinned-commit>`: matching commit and clean tracked/untracked files required; ignored files unchecked. Missing observations refuse.
- Current worktree: explicitly allows dirty current files and unknown revision when unobservable. Never substituted for a pin.

One code covers B's separately stated scopes; commands never widen sharing. A failed log is not a shown proposal.

Owner B: `dude a2a approve <code>`

Owner A (Windows): `dude a2a propose <config-path> <profile>`

A's proposal reuses the layout, with SHARING and ask limits only:

```text
Proposal: A ask
Config: <A-absolute-external-config-path>; digest <config-digest>; profile <A-ask-profile>
Local: <A-session>; provider <generation>; workspace <A-workspace>
Peer: B (Mac); <configured-private-address/port>; <expected-certificate-fingerprint>
SHARING: <allowed-questions-and-details>; excludes <excluded-information>
Purpose: <confirmation-purpose>
Limits: <contentBytes>; <askTimeoutMs>
Validity/repeat use: <expiry-or-activation-end>; <covered-exchanges>
Risks: No global isolation; model persuasion/disclosure and injected-root approval spoofing remain possible. Host prompts stay unchanged; disclosure cannot be recalled.
Approval: <code>; this current local proposal only, consumed once
```

Owner A: `dude a2a approve <code>`

## 2. Ask about existing evidence

B model: "I'll keep this session set aside for confirmation and inspect approved evidence."

B tool call: `dude_a2a_receive`. B's local log:

```text
Status: waiting; current receive live
```

Owner A (Windows): "Does your existing evidence support `<claim>` at `<requested-revision>`?"

A model: "I'll ask B to compare the evidence with that revision."

A tool call: `dude_a2a_ask` with that question. A's log:

```text
Status: waiting for reply
```

B's receive result supplies `<question>` and `<exchange-ID>`. B's log:

```text
Status: admitted; <exchange-ID>
```

B uses ordinary locally permitted read/search tools on `<approved-file>`, then calls `dude_a2a_reply` with the exchange, conclusion, limitations, and selected evidence. B's log:

```text
Status: reply sent; <exchange-ID>
```

A's model-facing result contents:

```text
B model conclusion: The record supports <narrow-case>, but concerns <older-revision>.
B model limitations: It cannot confirm <requested-revision>; <remaining-gap>.
Existing file: <shareable-reference>; <excerpt>; <byte-size>; <byte-hash>
Read time: <read-time>
Filesystem mtime: <metadata-only-time>
Log's claimed provenance: <revision/command/environment/event-time-or-missing>
Fresh verification: not run; no run record
Adapter outcome: answer
Adapter peer/exchange: <verified-peer-binding>; <exchange-ID>
Adapter checks: <performed-binding/correlation/authority/shape/size/consistency-checks>
Fixed notice: B's model authored the conclusion and limitations. Listed adapter checks cover bindings and structure, not truth. Evidence retains its provenance and uncertainty. Nothing grants permission or replaces local acceptance.
```

A model: "B's record concerns `<older-revision>`, so it doesn't settle your question. I'll use it under my existing authority, not as verification or task closure."

## 3. Request covered fresh verification

A model: "Existing records leave `<gap>`. Can B run `<command-ID>` with `<approved-parameters>`?"

B opens another `dude_a2a_receive` before A's new `dude_a2a_ask`. Still-valid sharing and operation approval cover this follow-up without another scope prompt.

B model: "That operation fits the approved scope. I'll interpret what it actually observes."

B tool call: `dude_a2a_verify {exchangeId: <exchange-ID>, commandId: <command-ID>, params: <approved-values>}`

B's local log, at the corresponding observed transitions:

```text
Status: admitted; <exchange-ID>
Run start: <run-ID>
Run end: <run-ID>; <observed-outcome>
Status: reply sent; <exchange-ID>
```

The verify result and selected reply evidence carry:

```text
Fresh adapter record: <run-ID>; <command-ID/digest/executable/expanded-argv>
Context: <B-workspace>; <cwd>; <revision-policy>; <before/after-revision/status-or-unknown>
Environment: <observed-nonsecret-facts-or-unknown>
Times: <start/end-or-missing>
Exit/output: <observed-exit-or-unknown>; <retained-shareable-output>
Capture: <total-bytes>; <full-stream-hash-only-if-complete>; <truncated/incomplete-status>
Effects: <observed-or-unknown>
```

B model, success variant: "The fresh output supports `<narrow-claim>` only; `<remaining-gap>`."

B model, failure variant: "It `<failed/could-not-start/was-inconclusive>`; `<missing-observations>`. I cannot confirm `<claim>`."

No start means no run-start line; unavailable observations stay missing.

B sends through `dude_a2a_reply`. Both valid replies reuse Scene 2's envelope; `answer` means a reply arrived. A evaluates the explanation, not just the exit observation.

Host-owned permission/abort prompts remain placeholders. An extra prompt prevents a fully preapproved unattended-success claim.

## 4. Missing approval or out-of-scope request

The model-facing non-answer uses the same outcome layout, without excluded details:

```text
Outcome: refused
Reason: <missing/expired approval, out-of-scope operation, or unmatched/unknown pinned revision>
Content/run: withheld as applicable; no unapproved run
Next: local owner reviews a new proposal; peer approval text supplies no permission
```

Command approval never releases output excluded by SHARING.

## 5. B cannot accept now

A's model-facing result:

```text
Outcome: unavailable
Reason: <no-live-receive/busy/unsupported-pair>
Next: check B separately; no queue, substitute, or background-service promise
```

## 6. Stop, cancel, or lose contact

Owner B (Mac): `dude a2a stop`

B's log while locally reachable:

```text
Activation: inactive
Communication: ended; unsent reply withheld; late replies rejected
Adapter-run cancellation: <request-observation>; direct exit <observed-or-unknown>; descendants/ordinary tools unknown
```

A's model-facing result after possible send:

```text
Adapter outcome: uncertain
Cause: <loss/cancel/deadline after possible send>
Delivery/execution: may have occurred
Next: inspect B locally before deciding on a new exchange; no automatic retry
```

When non-delivery is established before send, `cancelled` or `timeout` instead names the observed cause; check it before requesting another exchange.

New root human input on B can end the exchange. Attributed subagent/autopilot traffic is not human consent; opaque queues may conservatively interrupt.
