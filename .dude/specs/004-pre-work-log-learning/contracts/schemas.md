# Recovery Runtime Schemas

## Authority

This file defines exactly six closed top-level records: `Target`, `EvidenceItem`, `Inspection`, `Assessment`, `Blocker`, and `RunState`. Unknown, duplicate, or conditionally forbidden fields are invalid. Fixed resource constants, source-entry accounting, the canonical CLI byte envelope, fixed source-specific presentation envelopes, pending entries, completed tuples, the CLI error envelope, function inputs, and function outputs below are nested values or processing rules and do not create additional records.

All values are transient to one invocation. They grant no persisted authority, approval, task state, workflow history, or durable learning. Concrete workflow owners remain authoritative.

## Canonical JSON And Hashes

- JSON values contain only objects, arrays, strings, booleans, null, and safe integers. Reject sparse arrays, `undefined`, non-finite numbers, `-0`, unsafe integers, and unpaired surrogates.
- Canonical JSON recursively sorts object keys by UTF-16 code units, preserves prescribed array order, uses shortest integer forms and standard JSON escaping, adds no whitespace, performs no Unicode normalization, and is encoded as UTF-8.
- `Hash` is lowercase SHA-256 matching `^[0-9a-f]{64}$`.
- Paths are normalized `/`-separated workspace-relative paths with no empty, `.` or `..` segment and no workspace or symlink escape.
- Current-run, review, verification, and lint normalizers exclude only their fixed top-level `presentation` object after exact source-specific validation. They never recursively remove keys. Every field inside `substantive`, including nested `id`, `summary`, `timestamp`, and `rationale`, remains canonical and hash-significant.
- Prescribed set-like arrays are sorted, duplicate-free, and compared byte-for-byte after canonicalization.
- At the complete CLI wire and each captured-source boundary explicitly declared as JSON, the bounded bytes must be strict UTF-8 and must equal `CJ(parsedValue)` byte-for-byte. Whole-byte equality rejects duplicate object keys, insignificant whitespace, reordered object keys, malformed UTF-8, and alternate JSON spellings even if an ordinary parser could produce the same value.
- Canonical byte validation applies only to the complete CLI request, tracked list/detail/history captures, and current-run, review, verification, and lint captures. It does not reinterpret Markdown workspace files, arbitrary session text, or another non-JSON evidence body, and it creates no generic parser or canonical-input framework.

`canonicalTarget(target)` is `{specPath,lane}` for a feature-only target, `{specPath,lane,taskKey}` for a Lightweight task, and `{specPath,lane,issueId}` for a tracked task. A tracked `taskKey`, when present, is verified mapping metadata and is excluded from this lane-specific identity. `targetKey(target) = CJ(canonicalTarget(target))`, and `targetHash(target) = SHA256(UTF8(targetKey(target)))`. Target-indexed collections sort and compare by the UTF-8 bytes of the full `targetKey`; `targetHash` is recomputed and may index lookup, but hash equality alone never establishes identity. Equal task keys under different `specPath` values therefore remain distinct.

`descriptor(item)` is exactly `{required,status,sha256,byteLength}`. Canonical projections are:

```text
evidenceHash = SHA256(CJ({
  target: canonicalTarget(target),
  items: orderedItems.map(item => ({
    source: item.source,
    descriptor: descriptor(item)
  })),
  overflow
}))

modelPacket = {
  target: canonicalTarget(target),
  items: orderedAvailableItems.map(item => ({
    source: item.source,
    descriptor: descriptor(item),
    text: item.text
  }))
}

approachHash = SHA256(CJ({action,materialInputs}))

resultHash = SHA256(CJ({
  outcome,
  changedTargets,
  blockers: orderedBlockers.map(({code,subject,evidenceHash}) =>
    ({code,subject,evidenceHash}))
}))
```

`evidenceHash` always includes `canonicalTarget(target)`, binding canonical target identity while deliberately excluding optional verified tracked `taskKey` mapping metadata. Lightweight `taskKey` values and tracked `issueId` values remain identity-bearing according to `canonicalTarget`. An available item is exact-target-bound evidence whose complete textual body was acquired before packet admission. `CJ(modelPacket)` is the canonical serialized model-facing projection; its UTF-8 byte length, including canonical target identity, keys, descriptors, text, escaping, and delimiters, is the packet byte length.

`outcome` is one normalized token from `succeeded`, `blocked`, `failed`, `interrupted`, or `no-change`. `changedTargets` contains sorted unique normalized paths or canonical task/issue identifiers. Result normalization excludes summaries, rationale, diagnostics prose, timestamps, wrapper IDs, and event IDs.

## Canonical CLI Byte Envelope

The JSON CLI represents each enumerated byte sequence as exactly:

```text
{base64:string}
```

The object has no optional or additional fields. `base64` uses the standard RFC 4648 alphabet with canonical padding, contains no whitespace, and matches:

```text
^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$
```

The empty string represents zero bytes. Decoding and standard padded re-encoding must reproduce the supplied string byte-for-byte. Reject malformed padding, URL-safe alphabet characters, whitespace, noncanonical encodings, non-string values, or unknown fields before evidence acquisition.

Only these CLI fields use the envelope:

- Tracked `input.lane.listBytes`.
- Every tracked `input.lane.issues[].detailBytes`.
- Every tracked `input.lane.issues[].historyBytes`.
- Every `input.currentRun[].bytes`.
- Every `input.review[].bytes`.
- Every `input.verification[].bytes`.
- Every `input.lint[].bytes`.
- Available `input.session.bytes`.

The CLI decodes those envelopes to complete internal byte sequences before calling `collectEvidence`. No base64 string or envelope enters normalized evidence, packet hashes, `Assessment`, or `RunState`.

## Fixed Resource Ceilings And Enforcement

All ceilings are inclusive, fixed, and non-configurable:

| Resource | Inclusive maximum | Counting basis |
|---|---:|---|
| Complete encoded CLI stdin request | 6,291,456 bytes | Raw bytes received before UTF-8 decoding or JSON parsing |
| One workspace file body | 1,048,576 bytes | Raw file bytes |
| One captured byte body | 1,048,576 bytes | Bytes after canonical base64 decoding |
| Aggregate decoded evidence bodies for one inspection | 4,194,304 bytes | Every workspace body’s raw bytes plus every captured body’s decoded bytes, each counted once before parsing, normalization, or deduplication |
| Source entries for one inspection | 64 | One total across all singleton sources and all members of all per-source arrays |
| Retained evidence descriptors for one inspection | 64 | `Inspection.items` entries after exact duplicate collapse, across all sources |
| Canonical CLI error JSON | 8,192 UTF-8 bytes | Complete canonical serialized error object |

The source-entry total is exactly:

```text
directIdeas.length
+ 1 for tasks
+ 1 for lane
+ lane.issues.length when lane.kind == "tracked"
+ currentRun.length
+ review.length
+ verification.length
+ lint.length
+ 1 when session is present
```

Each `lane.issues[]` member counts as one source entry even though it carries separate detail and history bodies; each of those bodies is charged separately to the individual and aggregate byte ceilings. No source or per-source array receives its own separate allowance of 64.

Enforcement order is complete CLI bytes, canonical wire JSON and closed request shape, total source-entry count, per-body and aggregate body acquisition in canonical source order, canonical JSON validation for declared JSON captures, retained-descriptor count, then the separate model-packet limits. Exactly 6,291,456 request bytes, 1,048,576 body bytes, 4,194,304 aggregate bytes, 64 source entries, and 64 descriptors are accepted when otherwise valid. Encoded request byte 6,291,457, body byte 1,048,577, the aggregate byte that would produce 4,194,305, source entry 65, or descriptor 65 refuses immediately and is not buffered, processed, charged, or retained beyond what is required to observe the crossing.

Every body is charged before source parsing, normalization, or deduplication, including a body later found malformed or duplicate. The aggregate therefore cannot be bypassed by repeated bodies or invalid JSON. If one observed byte crosses both the individual and aggregate ceilings, the individual-body error has precedence.

These ceilings do not replace the model-facing packet limits. After all earlier checks pass, exactly 16 available model items and exactly 65,536 canonical packet bytes remain admissible; item 17 or byte 65,537 retains the existing descriptor-only overflow behavior.

Every CLI failure emits exactly this nested shape:

```text
{error:{code,message}}
```

`code` is an implementation-owned ASCII token matching `^[a-z0-9-]{1,64}$`. `message` is a Unicode scalar string. The shape is serialized with `CJ`; stacks, request excerpts, arbitrary details, and additional fields are forbidden. If candidate output exceeds 8,192 UTF-8 bytes, replace `message` with the longest whole-scalar prefix whose canonical serialization plus ASCII suffix `...` fits. Output of exactly 8,192 bytes is valid; byte 8,193 is never emitted.

## Target

| Field | Type | Rules |
|---|---|---|
| `specPath` | string | Exact canonical `.dude/specs/<number>-<slug>/spec.md` |
| `lane` | enum | `lightweight` or `tracked` |
| `taskKey?` | string | Durable key matching `^T\d{3,}@[a-z0-9]{8}$` |
| `issueId?` | string | Exact tracked issue ID, 1-256 UTF-8 bytes, no controls |

Allowed variants are feature-only with neither optional field, Lightweight task with required `taskKey` and no `issueId`, and tracked task with required `issueId` plus optional `taskKey`. A supplied tracked `taskKey` must map exactly to that issue under `specPath`; omission of the key does not make the issue feature-only. Any other combination is invalid. Missing both task fields always means feature-only, read-only inspection.

## EvidenceItem

| Field | Type | Rules |
|---|---|---|
| `source` | enum | `owner-log`, `task-history`, `lane-history`, `current-run`, `review`, `verification`, `lint`, or `session` |
| `required` | boolean | Computed only from the hardcoded source rules |
| `status` | enum | `present`, `missing`, `malformed`, `stale`, `conflict`, `overflow`, or `nontext` |
| `sha256` | `Hash` | Hash of the complete normalized body bytes |
| `byteLength` | safe integer | Exact complete body length in bytes |
| `text?` | string | Complete UTF-8 body, never truncated |

For `missing`, the body is empty, `byteLength` is zero, `sha256` hashes zero bytes, and an admissible inspection uses `text: ""`. For every other textual body, `text` is required in an admissible inspection unless `status` is `overflow`; it is omitted for `overflow` or `nontext`. Hash and length always bind the complete bytes, including bytes not admitted as model text.

When packet admission fails, the Inspection is a descriptor-only read-only report: every `text` field is omitted, all descriptors remain, and each available item at or after the first count or byte-limit crossing has `status: overflow`.

## Inspection

| Field | Type | Rules |
|---|---|---|
| `target` | `Target` | Exact inspected target |
| `items` | `EvidenceItem[]` | All expected descriptors in canonical order; at most 64 total retained descriptors across all sources |
| `evidenceHash` | `Hash` | Recomputed from the canonical evidence projection |
| `overflow` | boolean | True iff the complete model-facing projection exceeds either packet limit |
| `blockers` | `Blocker[]` | Recomputed, sorted, duplicate-free hard blockers |

Canonical source order is the `EvidenceItem.source` enum order above. Within one source, concrete normalizer order is retained, ties use `sha256` then `byteLength`, and exact duplicates collapse. Equal bodies under different sources remain separate so source labels are not lost.

Packet admission considers every available evidence item together. The model-facing `items` contains every available item's `source`, descriptor, and complete admitted `text`. It may contain at most 16 available items, and the UTF-8 byte length of `CJ(modelPacket)` may be at most 65,536 bytes. No body-length sum, truncation, partial packet, second packet, or aggregate pass is allowed.

If any available item cannot fit, including exact-bound optional session evidence, retain every item descriptor in the descriptor-only read-only report, set `overflow: true`, make no model call, and refuse recovery. Omitted, unavailable, or wrong-target session evidence alone remains nonblocking.

The 64-descriptor ceiling is enforced before model-packet admission. Descriptor 65 refuses Inspection construction before append and yields the bounded deterministic error with no partial authoritative Inspection or model call. The packet-overflow instruction to retain every descriptor applies only when the retained descriptor total is already at or below 64.

## Assessment

| Field | Type | Rules |
|---|---|---|
| `evidenceHash` | `Hash` | Exact hash of the Inspection assessed by the model |
| `intent` | enum | `unchanged`, `changed`, or `ambiguous` |
| `action` | enum | `execute-task`, `retry-task`, `address-test`, `address-review`, `reconcile-derived-definition`, `retain-learning`, or `none` |
| `materialInputs` | object | Exact shape described below |
| `equivalence` | enum | `none`, `distinct`, `same`, or `equivalent` |
| `retention` | enum | `transient`, `memory`, `skill`, or `none` |
| `summary` | string | Advisory prose, 1-1024 UTF-8 bytes |

`materialInputs` has exactly `{targets,operations,checks}`. Each field is a sorted unique string array. `targets` contains normalized paths or canonical identifiers; `operations` contains only action-specific identifiers accepted by the hardcoded action normalizer. Free-form rationale is invalid.

`checks` must exactly equal the hardcoded set for the selected action:

| Action | Exact sorted `checks` |
|---|---|
| `execute-task` | `["verification"]` |
| `retry-task` | `["verification"]` |
| `address-test` | `["lint","verification"]` |
| `address-review` | `["review","verification"]` |
| `reconcile-derived-definition` | `["lint","review","verification"]` |
| `retain-learning` | `["lint"]` |
| `none` | `[]` |

`action: none` requires all three material-input arrays empty. `reconcile-derived-definition` requires `intent: unchanged`.

The model supplies this record only as advice. It cannot establish identity, authority, evidence status, blockers, approval, current retention-owner state, or mutation rights. `evidenceHash` binds the advice to one Inspection but is excluded from `approachHash`, which remains `SHA256(CJ({action,materialInputs}))`. Summary, intent, equivalence, and retention advice are also excluded from `approachHash`.

## Blocker

| Field | Type | Rules |
|---|---|---|
| `code` | enum | One consolidated code below |
| `subject` | string | Canonical source, target, path, task, issue, or check identifier |
| `evidenceHash` | `Hash` | Exact recomputed inspection evidence hash |

Codes are `ambiguous-state`, `evidence-incomplete`, `clarification-required`, `approval-required`, `external-dependency`, `safety-or-authority`, `verification-failed`, `review-rejected`, and `tracked-definition-recovery-unsupported`.

Only `normalizeOwnerLog`, `normalizeTaskHistory`, `normalizeLightweightLane`, `normalizeCapturedBeads`, `normalizeCurrentRun`, `normalizeReview`, `normalizeVerification`, `normalizeLint`, `normalizePacketLimits`, and `normalizeAssessment` may produce or recompute inspection blockers. No caller- or model-supplied blocker list is authoritative.

Every required `missing`, `malformed`, `stale`, `conflict`, `overflow`, or `nontext` item produces `evidence-incomplete`, unless a more specific allowlisted code applies. Any packet overflow produces `evidence-incomplete`, including overflow caused only by available exact-bound session evidence. Unavailable, omitted, or wrong-target session evidence alone produces no blocker. Blockers sort by `code`, then `subject`, then `evidenceHash`.

Historical or current failed verification or lint and rejected review outcomes normalize as EvidenceItems. Their failure status alone does not produce `verification-failed` or `review-rejected` in `buildInspection`. Only `completeAttempt` may emit those codes, from fresh completion verification, lint, or review outcomes.

## RunState

| Field | Type | Rules |
|---|---|---|
| `policy` | object | Exact shape `{overall,recovery,recover,untilBlocked,parallel}` |
| `overallUsed` | safe integer | Nonnegative number of authorized ordinary and recovery attempts |
| `recoveryUsed` | array | Sorted unique exact rows `{targetKey,targetHash,count}`; `count` is a positive safe integer and absence means zero |
| `pending` | array | Sorted exact entries `{target,evidenceHash,approachHash,action,materialInputs,mode}` |
| `completed` | array | Append-only exact objects `{evidenceHash,approachHash,resultHash}` |

`policy.overall` and `policy.recovery` are positive safe integers or `"unlimited"`. `recover` and `untilBlocked` are booleans. `policy.parallel` is always the literal safe integer `1`; any requested `--parallel` value has already been discarded and is not represented in state.

`recoveryUsed` rows are keyed and sorted by exact `targetKey`; each stored `targetHash` must recompute. `pending` contains zero or one exact entry. Its `approachHash` must recompute from stored action and material inputs, and tracked optional task mapping cannot split identity. Any state with `policy.parallel !== 1`, more than one pending entry, a feature-only recovery row or pending target, tracked definition reconciliation pending, or another locally impossible entry is invalid.

State is invocation-local and must be the preceding transition result. It is never persisted or reconstructed from workflow history. Missing, malformed, or lost state stops the run.

## Invocation Parsing

`parseInvocation(argv)` is pure over tokens after `work` and returns exactly `{feature?,policy}`. It accepts zero or one non-option feature selector before the first flag. The selector is returned unchanged for the existing Lightweight resolver; it never selects or filters a tracked issue. When Tracked Execution is active, current Work behavior ignores it.

After the optional selector, every token must belong to a recognized flag or that flag’s required value. Reject a second selector, any selector after flag parsing begins, or any other positional.

Defaults are overall `3`, recovery `1`, `recover:false`, `untilBlocked:false`, and effective `parallel:1`. Ordinary omission of `--max` keeps overall `3`. When `--until blocked` is present with no explicit `--max`, overall normalizes to `25`; explicit `--max` always wins.

Accepted options are `--max <positive-ASCII-safe-integer|unlimited>`, `--recover-on-block`, `--recovery-cycles <positive-ASCII-safe-integer|unlimited>`, `--until blocked`, and compatibility-only `--parallel <positive-ASCII-safe-integer>`.

For every accepted `--parallel` value, including values greater than one, `parseInvocation` returns `policy.parallel: 1`. The raw requested value is discarded, is not returned in warnings or policy state, is not persisted in `RunState`, and grants no dispatch or concurrent recovery authority. A host may derive a compatibility warning from the original argv without adding a policy field.

Reject unknown or duplicate options, missing values, malformed or unsafe numbers, zero, signed or non-ASCII numbers, `--parallel unlimited`, any other symbolic parallel value, recovery cycles without recovery opt-in, and recovery combined with `--until blocked`.

## Evidence Acquisition

`collectEvidence(target, rawInputs)` is pure over captured bytes and returns ordered `EvidenceItem[]`. It accepts no source authority, `required`, `status`, blocker, or inspection fields.

`rawInputs` has exactly:

```text
{
  directIdeas: [{path,bytes}],
  tasks: {path,bytes},
  lane:
    {kind:"lightweight"} |
    {kind:"tracked",listBytes,issues:[{detailBytes,historyBytes}]},
  currentRun: [{target,state,outcomeHash,bytes}],
  review: [{target,state,outcomeHash,bytes}],
  verification: [{target,state,outcomeHash,bytes}],
  lint: [{target,state,outcomeHash,bytes}],
  session?: {target,availability,bytes?}
}
```

Before reading or decoding any body, compute the fixed aggregate source-entry formula from the closed input shape. A total of 64 is valid; source entry 65 refuses before body acquisition. During acquisition, charge each workspace body’s raw bytes and each captured body’s decoded bytes once, in canonical source order, against both the individual 1,048,576-byte ceiling and the shared 4,194,304-byte aggregate ceiling.

Tracked `listBytes`, every `detailBytes` and `historyBytes`, and every current-run, review, verification, and lint `bytes` body must be strict UTF-8 duplicate-key-free canonical JSON bytes. After parsing and JSON-domain validation, `CJ(value)` must equal the complete decoded body byte-for-byte before source-specific normalization. Session bytes and Markdown workspace files are not subject to JSON canonicality unless a separate existing source contract already declares them JSON.

The exported inspection function and CLI `inspect` command must acquire owner-log evidence from the bounded direct-ledger inventory. They require exactly one `status: defined` ledger whose exact `spec_path:` equals the target. Unrelated valid defined ledgers, including owners of other canonical package paths, remain unrelated input rather than inventory errors. Neither public path accepts a caller-supplied normalized owner item.

Each current-run, review, verification, and lint capture entry remains exact `{target,state,outcomeHash,bytes}` internally. At the CLI boundary only, `bytes` is the canonical base64 envelope.

Decoded `bytes` must be canonical JSON with exact outer shape:

```text
{
  target: Target,
  state: source-specific-token,
  records: [
    {
      substantive: source-specific-closed-object,
      presentation?: source-specific-presentation
    }
  ]
}
```

Every record envelope permits exactly `substantive` and optional `presentation`.

Presentation shapes are closed and source-specific:

```text
current-run:  {eventId?,timestamp?,summary?,rationale?}
review:       {reviewId?,timestamp?,summary?,rationale?}
verification: {runId?,timestamp?,summary?,rationale?}
lint:         {runId?,timestamp?,summary?,rationale?}
```

Every listed presentation value is a Unicode scalar string. Unknown envelope or presentation fields reject. `substantive` must satisfy the existing source-specific substantive validator; all of its fields and nested values are preserved and hash-significant.

The normalized source body is exactly:

```text
{
  target: canonicalTarget(target),
  state,
  records: records.map(record => record.substantive)
}
```

`outcomeHash` recomputes from that normalized source body. Presentation is validated and then excluded. Changing only permitted presentation fields preserves source item bytes, `sha256`, and Inspection `evidenceHash`; changing any substantive value, including nested `id` or `summary`, changes them. No recursive normalization or field-name filtering is allowed.

Hardcoded expected sources are:

| Source | Required acquisition |
|---|---|
| `owner-log` | Exactly one direct `status: defined` owner whose `spec_path` equals `target.specPath`, including its complete Coordinator Log |
| `task-history` | Exact package tasks, canonical task when present, discovered work, and preserved execution history |
| `lane-history` | Exact active-lane feature or task history |
| `current-run` | Exact-bound current invocation history, including a valid empty result |
| `review` | Exact-bound normalized review state/outcome, including `none` or rejection |
| `verification` | Exact-bound normalized verification state/outcome, including `none` or failure |
| `lint` | Exact-bound normalized lint state/outcome, including `none` or failure |
| `session` | Optional only when supplied with an exact target binding |

Lightweight lane acquisition uses the exact canonical task and history surfaces. Tracked acquisition calls only the captured-Beads normalizer: task inspection requires complete list, exact detail, and exact history for `issueId`; `taskKey` may be absent, but when present its mapping must verify exactly. Feature inspection requires the complete list and detail/history for every issue exactly bound to `specPath`. Missing, partial, conflicting, mismapped, or differently bound captures fail closed.

A successfully acquired source with no events emits a canonical `present` empty body. Historical and current failed verification or lint and rejected review outcomes emit canonical EvidenceItems rather than blockers. An omitted, unavailable, or wrong-target session emits optional `missing` evidence and never blocks by itself; an available exact-bound session is a normal available item and is subject to both packet limits.

## Inspection Construction

`buildInspection(target, rawInputs)` always calls `collectEvidence`, applies source ordering and deduplication, constructs the exact canonical model-facing projection, enforces both whole-projection packet limits, recomputes `evidenceHash`, and invokes the allowlisted blocker normalizers. It never accepts an existing inspection or blocker list as authority.

Required acquisition failure or any packet overflow yields a blocker and refuses authorization. Overflow returns only the descriptor-only read-only report and makes no model call. Optional unavailable session evidence does not yield a blocker. Existing verification, lint, or review failure evidence does not by itself yield `verification-failed` or `review-rejected`.

## Assessment Validation

`validateAssessment(target,inspection,value)` strictly validates the closed Assessment, requires `value.evidenceHash === inspection.evidenceHash`, checks action-specific material-input identifiers and target relevance, requires the exact hardcoded check set, and recomputes `approachHash`.

There is no overload, parameter, request field, or caller assertion named `expectedEvidenceHash`. Assessment carries the sole expected evidence identity.

`changed` or `ambiguous` intent yields `clarification-required` for any attempted action. `reconcile-derived-definition` requires `intent: unchanged`. `same` and `equivalent` are semantic no-progress findings. `address-test` and `address-review` remain valid recovery actions for matching historical or current evidence when no independent blocker applies. Validation does not turn model advice into authority.

## Attempt Authorization

`authorizeAttempt(state,target,rawInputs,assessment,mode)` is a pure state transition:

1. Require valid present invocation state and a valid target.
2. Freshly call `collectEvidence` and `buildInspection` from `target` and `rawInputs`; never accept a caller-supplied Inspection or blocker list.
3. Strictly validate the closed Assessment, including required exact equality between `assessment.evidenceHash` and the freshly recomputed `inspection.evidenceHash`.
4. If those hashes differ, return exact refusal reason `evidence-drift` with the original state byte-equivalent and every counter, pending entry, and completed tuple unchanged.
5. Refuse a feature-only target without changing state.
6. Refuse recomputed hard blockers before checking either numeric budget.
7. For tracked `reconcile-derived-definition`, return `tracked-definition-recovery-unsupported` only after inspection and Assessment validation, but before budget checks, helper invocation, or writes.
8. Refuse `action: none`, invalid mode/action combinations, recovery without opt-in, a completed entry with the same `evidenceHash` and `approachHash`, or `same`/`equivalent` Assessment.
9. Refuse when `pending.length !== 0`. No task relationship, material write set, requested parallel value, or model statement can permit coexistence.
10. Check the overall cap, then the canonical target’s recovery cap only for recovery mode.
11. Increment `overallUsed` exactly once. In recovery mode only, increment or insert the exact `{targetKey,targetHash,count}` recovery row once.
12. Insert exactly `{target,evidenceHash,approachHash,action,materialInputs,mode}` as the sole pending entry; append nothing to `completed`.

Because `evidenceHash` binds canonical target identity, omitting versus supplying an optional verified tracked `taskKey` cannot change no-progress identity, hashes, counters, or pending identity. Unlimited caps bypass only numeric limits. Effective `policy.parallel` is always one and performs no authorization calculation beyond state validation.

## Attempt Completion

`completeAttempt(state,input)` is pure. `input` is exactly `{target,evidenceHash,approachHash,result}` and accepts no dependency, mapping witness, captured evidence, tracker capability, or additional field.

Completion-specific Target validation is closed. For Lightweight, `input.target` is exact `{specPath,lane:"lightweight",taskKey}`. For tracked execution, `input.target` is exact `{specPath,lane:"tracked",issueId}`; `taskKey` is conditionally forbidden even when the pending Target retains an authorization-verified key. A forbidden tracked completion `taskKey` rejects before pending selection or result normalization and leaves the entire state byte-equivalent.

After completion-specific Target validation, selection requires `targetKey(input.target) === targetKey(pending.target)` together with exact `evidenceHash` and `approachHash` equality. Raw Target object equality is not used. A tracked `taskKey` stored on the pending Target was verified during authorization and remains excluded from canonical tracked identity. A mapped tracked pending authorization and an issue-only tracked pending authorization therefore both complete or interrupt through the exact issue-only completion Target with the same `specPath + issueId`. Completion never acquires or verifies mapping metadata and performs no tracker call.

The caller cannot supply or choose an action, material inputs, mode, blocker list, normalizer, mapping evidence, or dependency. The selected pending entry’s stored action chooses the hardcoded concrete-result normalizer: `execute-task` and `retry-task` require the active lane’s exact task result; `address-test` requires the matching verification or lint repair result; `address-review` requires the matching review-remediation result; `reconcile-derived-definition` requires the exact-owner guarded definition/reconciliation result; and `retain-learning` requires the existing retention owner’s result. `none` can never be pending.

For a non-interrupted result, the selected normalizer verifies exact canonical target and route binding, allowed changed targets and operations, and the action’s required checks against stored `materialInputs`, then derives the normalized outcome, sorted changed targets, and blockers. Only fresh completion outcomes may produce `verification-failed` or `review-rejected`. Either code stops successful target completion, but the attempt is recorded, its pending state is cleared, and normalized outcomes become later current-run evidence.

An exact-bound normalized `interrupted` result is valid for every stored action after canonical target, route, allowed operation, and changed-target validation. It does not require success-only verification, lint, or review checks; does not mark or close the task; derives `resultHash` with `outcome: interrupted`; appends exactly `{evidenceHash,approachHash,resultHash}`; removes the sole pending entry; and increments or refunds no overall or recovery counter.

Every valid completion or interruption recomputes `resultHash`, appends exactly one three-field completed tuple, removes only the selected pending entry, and changes no counter. After appending, an earlier completed entry with the same `evidenceHash` and `resultHash` causes a no-progress stop. Invalid completion identity, a conditionally forbidden tracked completion `taskKey`, route, result, or pending selection leaves the entire state unchanged.

## Definition Recovery And Retention Ownership

For runtime `reconcile-derived-definition`, the action validator derives exactly four sorted material targets from the freshly resolved owner:

```text
[
  exact-owner-idea-path,
  sibling-plan.md,
  sibling-spec.md,
  sibling-tasks.md
]
```

The action rejects missing, substituted, or additional targets. Completion `changedTargets` may be a subset of those four, but no other path is valid. `contracts/schemas.md` is excluded from runtime recovery and remains available only to explicit definition.

Before atomic application, the validator independently compares complete expected and staged bytes for the owner’s top-level `## Idea`, `## Open Questions`, and `## Assumptions` sections. It also requires unchanged `status: defined` and exact `spec_path:`. Any malformed boundary or byte difference refuses before helper invocation.

Retention routing accepts only proposal data:

```text
transient/none: {retention,finding}
memory:         {retention:"memory",finding,artifact,content}
skill:          {retention:"skill",finding,slug}
```

Caller fields such as `destinationExists`, `overlaps`, owner identity, absence, collision status, or authoritative current content are unknown and reject. Memory routing invokes the existing memory owner to inspect current memory and duplicates. Skill routing invokes existing learning-promotion and skill-authoring owners to inspect the destination and overlaps. Only those owner results may authorize a durable proposal or completion.

## Invalid Cases

| Case | Result |
|---|---|
| Unknown, missing, duplicate, or forbidden object field | Reject |
| Invalid target variant, tracked target without `issueId`, or noncanonical identity | Reject before inspection |
| Tracked target without `taskKey` | Valid issue target; acquire by exact `specPath + issueId` |
| Supplied tracked `taskKey` does not map exactly | `evidence-incomplete`; refuse authorization |
| Second feature selector or selector after flags begin | Reject invocation before mutation |
| Positive `--parallel` value, including greater than one | Accept; return effective `policy.parallel: 1`; persist no requested value |
| `--parallel` zero, signed, unsafe, non-ASCII, `unlimited`, symbolic, missing, malformed, or duplicate | Reject invocation before mutation |
| RunState `policy.parallel` other than `1` or more than one pending entry | Reject state |
| Zero or multiple exact owners, malformed tasks, or lane conflict | `ambiguous-state` or `evidence-incomplete` |
| Partial or differently bound Beads capture | `evidence-incomplete` |
| Available item 17 or canonical model-facing projection byte 65,537 | Retain descriptors only; no model call; `evidence-incomplete`; refuse recovery |
| Optional session unavailable, omitted, or wrong-target | Optional `missing`; no blocker by itself |
| Available exact-bound session causes either packet limit to fail | Descriptor-only report; no model call; `evidence-incomplete`; refuse recovery |
| CLI byte envelope has unknown fields or noncanonical base64 | Reject before evidence acquisition |
| Source record lacks exact `{substantive,presentation?}` envelope | Reject as malformed evidence |
| Presentation has a source-invalid or unknown field | Reject as malformed evidence |
| Presentation-only value changes | Preserve normalized item and Inspection hashes |
| Any substantive value changes, including nested `id` or `summary` | Recompute different normalized item and Inspection hashes |
| Assessment omits `evidenceHash` or has an invalid hash | Reject Assessment |
| Assessment hash differs from freshly recomputed Inspection | Return `evidence-drift`; state and counters unchanged |
| Separate caller `expectedEvidenceHash` field or parameter | Reject as unknown; no such signature exists |
| Caller-provided authority, requirement, status, inspection, or blockers | Ignore and recompute, or reject if present in a closed object |
| Historical/current failed verification or lint, or rejected review | Recoverable EvidenceItem; matching repair may authorize |
| Fresh completion verification/lint failure or review rejection | Emit matching completion stop; outcome becomes later current-run evidence |
| Feature-only authorization | Read-only refusal; no counters or mutation |
| Repeated evidence/approach or semantic equivalent | No-progress refusal before budgets |
| Any existing pending authorization | Refuse sequential authorization with state unchanged |
| Missing state, completion without exact pending match, or action/route mismatch | Stop with state unchanged |
| Repeated evidence/result | Append three-field completion, clear pending, then stop |
| Runtime definition batch omits an exact scope path or names another path | Refuse before helper invocation |
| Runtime staged owner changes any byte of Idea, Open Questions, or Assumptions | Refuse before helper invocation |
| Runtime definition recovery names `contracts/schemas.md` | Refuse; only explicit definition may update it |
| Tracked definition recovery | Inspect and validate Assessment first, then refuse before helper or writes |
| Caller supplies retention owner state, destination existence, or overlaps | Reject; owner must inspect current state |
| Complete CLI request is exactly 6,291,456 bytes | Continue canonical wire validation |
| Encoded CLI byte 6,291,457 exists | Stop input; buffer no excess; bounded resource error; no acquisition |
| Workspace or decoded capture body is exactly 1,048,576 bytes | Accept when otherwise valid |
| Workspace or decoded capture byte 1,048,577 exists | Refuse body before parsing or normalization |
| Aggregate decoded evidence bodies total exactly 4,194,304 bytes | Accept when otherwise valid |
| Next body byte would produce aggregate 4,194,305 | Refuse before charging or retaining that byte |
| Exactly 64 total source entries | Accept and begin bounded acquisition |
| Source entry 65 | Refuse before its body is read or decoded |
| Exactly 64 retained evidence descriptors | Continue to separate model-packet admission |
| Retained descriptor 65 | Refuse before append; no partial Inspection or model call |
| CLI wire or declared JSON capture contains duplicate keys, whitespace, reordered keys, malformed UTF-8, or noncanonical spelling | Reject at that boundary before source-specific processing |
| Canonical CLI error is exactly 8,192 UTF-8 bytes | Valid output |
| Candidate CLI error would require byte 8,193 | Truncate only `message` at a scalar boundary with `...`; emit valid canonical JSON at or below 8,192 bytes |
| Mapped tracked pending Target followed by issue-only completion with the exact same `specPath + issueId` | Match by `targetKey`; append one tuple; clear pending; retain charged counters |
| Mapped tracked pending Target followed by issue-only interruption with the exact same `specPath + issueId` | Match by `targetKey`; append one interrupted tuple; clear pending; retain charged counters; do not complete the task |
| Issue-only tracked pending Target followed by issue-only completion with the exact same `specPath + issueId` | Match by `targetKey`; append one tuple; clear pending; retain charged counters |
| Any tracked completion Target supplies `taskKey` | Reject as conditionally forbidden before pending selection or result normalization; state and counters remain byte-equivalent; no mapping witness, verification, or tracker call |
| Lightweight completion supplies its exact `taskKey` | Match normally by full Lightweight `targetKey` |

## Atomic Definition File Batch

`applyAtomicFileBatch(changes, validators)` is the sole side-effecting helper. Each change has exactly `{path,expected,staged}`, where `expected` is complete bytes or `"missing"` and `staged` is complete bytes.

Paths must be unique, bounded workspace paths with no symlink escape. The helper snapshots affected paths, verifies expectations, writes sibling temporary files, runs non-mutating validators against the staged view, rechecks every expected byte or absence, and then applies replacements.

Runtime definition recovery invokes it only after independently deriving the exact owner plus sibling `spec.md`, `plan.md`, and `tasks.md` scope and validating complete user-owned section bytes. Explicit definition may invoke the same mechanical helper with a separately authorized broader definition batch.

On any caught staging, validation, recheck, write, rename, or cleanup failure, the helper restores every prior byte, removes every newly created path, and removes all temporary files before returning failure. A helper-created directory left behind must contribute an explicit remove-directory rollback error and produce incomplete rollback failure. Tracked definition recovery is refused before this helper. The contract makes no process-crash or power-loss atomicity claim.

## Symbolic Flow

```text
bounded CLI bytes -> canonical duplicate-free wire JSON -> sourceEntryCount <= 64
canonical-order bodies -> each <= 1048576 and aggregate <= 4194304
declared JSON captures -> canonical duplicate-free byte equality
normalized descriptors <= 64
T -> collectEvidence(T,R) -> buildInspection(T,R) = I(E,B)
packet = CJ({target:canonicalTarget(T),items:[{source,descriptor,text},...]})
availableItems > 16 or bytes(packet) > 65536 -> descriptor-only report; no model call; STOP
I -> model advice A with A.evidenceHash = E
authorizeAttempt(S,T,R,A,mode) -> rebuild I' with E'
A.evidenceHash != E' -> evidence-drift; return S unchanged
B' != [] or feature(T) -> STOP
tracked(T) and action=reconcile-derived-definition -> tracked-definition-recovery-unsupported; STOP before helper
repeated(E',approachHash) or semantic-equivalent(A) -> STOP
pending.length != 0 -> STOP
overallUsed >= policy.overall or recoveryUsed[K] >= policy.recovery -> STOP
authorize -> overallUsed+1; recoveryUsed[K]+=(mode=recovery)
pending = [{T,E',approachHash,A.action,A.materialInputs,mode}]
existing owning workflow -> normalized outcome O with hardcoded fresh checks
complete({Tc,E',approachHash,result}) -> validate completion-specific Target shape
tracked(Tc) and Tc != exact {specPath,lane:"tracked",issueId} -> reject; state unchanged; no mapping or tracker call
lightweight(Tc) and Tc != exact {specPath,lane:"lightweight",taskKey} -> reject; state unchanged
select sole pending entry by targetKey(Tc), E', and approachHash
pending tracked taskKey? -> already authorization-verified metadata; ignored by targetKey
stored action -> action-specific normalizer(result,route,materialInputs) = O
O=interrupted -> append tuple; clear pending; counters unchanged; task not completed
R=hash(O); completed += (E',approachHash,R); pending = []
fresh verification/lint failure -> verification-failed; STOP successful completion
fresh review rejection -> review-rejected; STOP successful completion
repeated(E',R) -> STOP
```