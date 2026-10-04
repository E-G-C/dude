# Readable Work Evidence Contracts

Spec: `.dude/specs/074-work-readable-evidence-handoff/spec.md`

This contract adds readable records to the existing acquired evidence streams. It does not change `TrustedSourceCaptureV2`, either v2 specialist envelope, authoritative events, RunState, permissions, or the runner's closed root fields.

## 1. Common Rules

`CJ` means the existing `canonicalJson` serialization. `H` means SHA-256 over its exact UTF-8 bytes. `Hash` is a lowercase 64-character hash. Targets use the existing exact canonical task-target shape.

All new records are closed inert data. Reject unknown fields, proxies, accessors, custom prototypes, sparse or extra-key arrays, cycles, invalid Unicode, and non-data values through the existing bounded validators before cloning or invoking caller behavior. Existing graph, transport, body, and aggregate limits apply.

`SemanticText` is an unchanged Unicode scalar string of 1 through 16,384 UTF-8 bytes, using the producer's existing bound. Do not trim, paraphrase, normalize Unicode, repair newlines, or substitute display text.

Reuse the producer's domain-separated identity calculation without changing its bytes:

```text
S(domain, material) =
  H(CJ({type: "specialist-attestation:" + domain, version: 1, material}))
```

The names `verification-text`, `independent-review-text`, and `readable-evidence-attachment` are reserved at this boundary. An invalid version or placement of a recognized type is an error, never opaque literal evidence or a reason to drop the record. Unrelated existing record types retain their current behavior.

## 2. Readable Records

```text
VerificationTextV1 = {
  type: "verification-text",
  version: 1,
  checks: [{
    definition: SemanticText,
    evidence: SemanticText
  }] // 1..16 rows, exactly matching the envelope's check order
}

IndependentReviewTextV1 = {
  type: "independent-review-text",
  version: 1,
  findings: [{
    expectationReference: SemanticText,
    checkDefinition: SemanticText,
    observedEvidence?: SemanticText
  }] // 0..16 rows, exactly matching the envelope's finding order
}

ReadableTextV1 = VerificationTextV1 | IndependentReviewTextV1
```

These records contain only semantic preimages. They contain no model rationale, summary, suggested alternative, approval, outcome override, new identity, path to load, or provenance claim.

### Full Row Correspondence

Validate raw array lengths before sorting, mapping, or building an index. A seventeenth raw row refuses even if it is identical to another row. Require the same number of readable and envelope rows; reject missing and extra rows. Receiver input is already in envelope order and is not repaired or reordered.

For verification row `i` and existing envelope check `c[i]`:

- `S("check-definition", text.checks[i].definition) == c[i].definitionIdentity`.
- `S("check-evidence", text.checks[i].evidence) == c[i].evidenceIdentity`.
- Reuse the existing check validator to recompute `c[i].checkIdentity`, including its unchanged outcome.
- Reject duplicate definitions, including identical rows and conflicting outcomes or evidence. No map insertion may hide a duplicate.

For review row `i` and existing finding `f[i]`:

- `S("finding-expectation", {kind: f[i].basis.expectation.kind, reference: text.findings[i].expectationReference}) == f[i].basis.expectation.identity`.
- `S("check-definition", text.findings[i].checkDefinition) == f[i].basis.checkDefinitionIdentity`.
- If `f[i].observation.kind == "observed-evidence"`, `observedEvidence` is required and `S("finding-observation", observedEvidence) == f[i].observation.identity`.
- If the kind is `check-result`, `observedEvidence` is forbidden. The observation must resolve to the exact check identity with the same definition in the bound verification envelope. Readable evidence for that check comes only from that verification's own valid text record or supplement.
- Reuse existing finding, basis, and review validators for canonical subjects, exact verdict, and sorted identities. Also require every finding basis target to equal the envelope target. Reject duplicate basis identities as well as duplicate finding identities, matching the producer's stricter duplicate rule.

An accepted review has exactly zero findings and an empty readable finding array. A rejected review has 1..16 findings with complete matching text. A valid review-text record does not manufacture missing verification preimages.

## 3. Fresh Capture Carrier

Use the existing `CaptureStream` entry:

```text
entry = {target, state, outcomeHash, bytes: {base64}}

decoded bytes = UTF8(CJ({
  target,
  state,
  records: [
    {substantive: C},
    {substantive: R}
  ]
}))

outcomeHash = H(CJ({target, state, records: [C, R]}))
```

`C` is the unchanged builder-produced `TrustedSourceCaptureV2`; `R` is its matching `ReadableTextV1`. There is exactly one of each, in this order. The text wrapper has no presentation field. The new carrier is canonical and has no other records or wrapper fields.

Verification carriers belong in `verification`. A byte-identical copy may also occupy the existing `lint` co-role only when backed by the matching verification carrier. Review carriers belong in `review`. None belongs in `currentRun` or session evidence.

The outer target equals the capture and envelope target. Verification state is `failed` if any check failed, otherwise `passed`; review state equals the envelope verdict. Validate the capture's byte descriptor and exact canonical envelope bytes. For these new carriers, require `C.outcomeHash == C.bytes.sha256`; do not retrofit that additional admission check onto unchanged hash-only packets.

The trusted capture's envelope, identities, base64, authority, and invocation are unchanged for the same specialist result and host context. Only the new outer stream has additional substantive bytes and a new outcome hash. Presentation remains excluded and cannot carry substantive text.

## 4. Historical Attachment Carrier

```text
ReadableEvidenceAttachmentV1 = {
  type: "readable-evidence-attachment",
  version: 1,
  reference: {
    sourceCaptureIdentity: Hash,
    sourceOutcomeHash: Hash
  },
  text: ReadableTextV1
}

decoded new entry bytes = UTF8(CJ({
  target,
  state,
  records: [{substantive: attachment}]
}))

new entry outcomeHash =
  H(CJ({target, state, records: [attachment]}))
```

Supply this new entry after the original entries in the corresponding existing `retainedEvidence.verification` or `retainedEvidence.review` array. Preserve every original entry, byte string, relative order, and duplicate. Historical attachments are not admitted in `lint`, `currentRun`, session evidence, or a challenge response.

There is one attachment per new stream entry, no presentation, and no trusted capture in that entry. Do not append text to an original stream, submit a replacement stream, or submit `[oldCapture, text]` beside the original. The latter remains a duplicate-capture error.

### Exact Reference And Provenance

Resolve references from the complete supplied originals, not a path, model assertion, normalized packet supplied in place of a capture, or an attachment chain:

1. In the same source class, locate exactly one original, present, current-format capture-only stream whose validated normalized body hash equals `sourceOutcomeHash`.
2. Its sole trusted capture `C` must satisfy `trustedSourceCaptureIdentityV2(C) == sourceCaptureIdentity`. This identity includes the complete capture, authority, invocation, and exact byte envelope. The original stream and capture must both be supplied.
3. Decode and validate `C` with the existing specialist envelope normalizer. The original stream, capture, envelope, and new attachment stream must all bind the selected target. Both outer states must equal the envelope-derived outcome. Require the text discriminator to match the source/capture kind, canonical envelope bytes, and `C.outcomeHash == C.bytes.sha256`. Unsupported envelope types are ineligible.
4. For a review, resolve its exact trusted verification from the same complete evidence set. The existing normalizer must prove equal target, attempt identity, source revision identity, inspected evidence hash, result identity, verification-envelope identity, and valid check observations. Retain reviewer authority, invocation, attempt ordinal, and review ordinal; do not accept replacement context fields from the attachment.
5. Validate all semantic preimages under section 2.
6. At retained-history admission, the referenced verification or review must belong to the selected target's validated retained occurrence evidence. Reuse the existing approach/finding relationships, including exact review capture identity. Equal invocation-local ordinals or similar wording do not identify an attempt.

`sourceOutcomeHash` binds the original normalized substantive stream, not excluded presentation. Original raw transport bytes remain retained separately and unchanged. Correspondence to a cooperative capture is the provenance guarantee; neither reference is a signature or proof that the supplier obtained text from a particular file.

Reject multiple attachments for one capture, including identical attachments, before any evidence-item deduplication. Also reject an attachment to a capture already carrying fresh readable text, a different source class, an unavailable reference, a reference to another attachment, or a conflict with any supplied readable record. Never choose a preferred candidate.

Per-capture coverage is all-or-nothing. A complete valid attachment to one capture may coexist with hash-only captures, but it provides no semantic coverage for them. In particular, one covered failed approach does not make a two-approach comparison complete.

## 5. Admission, Lifetime, And Refusal

The root `HostAdapterRunnerRequest` and its four-array `retainedEvidence` contract are unchanged. This is a new closed substantive-record variant inside that existing transport, not a new loader, root field, operation, or capability to change outstanding input.

The host supplies actual known preimages as literal bytes before `runHostAdapter`. It may use the existing canonical serialization and hashing helpers to form the new transport entry. Such transport hashes grant no match authority: the receiver repeats section 4. An input supplying only a file path, URL, hash-only placeholder, or `matches: true` field is not a valid attachment. Path-like text inside a genuine matching preimage remains inert text and is never loaded.

Keep existing prerequisite and authority precedence. Within evidence acquisition:

1. Charge source counts before decoding; charge transport, individual source, aggregate, and graph bounds before semantic work.
2. Validate existing transport, target, stream outcome, trusted capture, and envelope bindings. Recognize reserved readable types before wrong-target filtering can silently discard them.
3. Validate readable shapes, raw row bounds, unique references, and complete row correspondence over the full source set, before descriptor deduplication or rendering.
4. Build the immutable Inspection and measure the complete model projection. Preserve the initial Inspection blocker/capacity checks at their current position; computing a projection does not deliver it to a model.
5. Before adapter ownership or model delivery, run the existing retained-occurrence/authority preflight over that Inspection and apply attachment-to-retained-occurrence applicability there. Do not turn dual retention into a global Inspection invariant: later lane-first projection prefixes may be legitimately one-sided.

Repeat the same readable shape/reference/matching validation at direct Inspection validation/model rendering and subsequent runtime acquisition; no caller-created `present` status bypasses it. The runner retains its existing distinction between read-only Inspection construction, retained-history admission, and actual exchange delivery.

| Condition | Existing refusal behavior to retain |
| --- | --- |
| Invalid transport, unknown/forbidden fields, wrong readable version, row count, order, or duplicate | Malformed source or existing receiver TypeError; runner returns sanitized `evidence-incomplete` admission failure for the relevant verification/review class. |
| Wrong semantic hash, wrong source/target, orphan reference, conflicting supplements, or cross-envelope mismatch | Invalid/conflicting evidence; no readable admission or model handoff. Use existing evidence statuses and `evidence-incomplete`, not a new reason namespace. |
| Missing trusted or dual-retained history without an earlier readable-reference failure | Existing `occurrence-retention` refusal, with its actual current Inspection binding when available. |
| Source, descriptor, body, aggregate, request, or packet exhaustion | Existing runtime-owned capacity diagnostic and descriptor-only overflow behavior; never relabel it as malformed runtime output. |
| Extra attachment supplied in an outstanding response | Existing closed response-envelope refusal; never amend the already bound packet. |

Bounded diagnostics name only the existing source class and a fixed failure category. Do not emit rejected text, paths, identities, property names, or validator messages. Preserve accepted state, counters, pending entries, and earlier effects for the rejected operation; no new cleanup, retry, or resumption rule is added.

Omitting a whole supplement leaves a hash-only capture, with no invented text or new completeness flag. Existing readers and governance schemas remain compatible. Work guidance must treat absent semantic coverage honestly and use existing cancellation/stop behavior when the reviewer cannot justify a decision. This feature adds no automatic alternative or no-progress decision and no new learning-state transition.

## 6. Model View

Keep `dude-work-model-view-v1`, its `{format, target, items}` root, and its existing item tags. Extend the existing verification/review typed payload with one optional `text: ReadableTextV1` field.

```text
verification payload = {type, version, target, checks, text?}
review payload       = {type, version, target, verdict, findings, text?}

CaptureFrame = {descriptor, occurrences, outer, capture, binding}
AttachmentFrame = {descriptor, occurrences, outer, reference, binding}
```

`descriptor`, `occurrences`, `outer`, `capture`, and `binding` retain the existing model-view definitions. `reference` is exactly section 4's pair of hashes. A frame has exactly one of `capture` and `reference`. `binding` contains the existing envelope fields outside the original payload fields; `text` is never an envelope field.

- Capture frame without payload text: the existing hash-only form, unchanged.
- Capture frame with payload text: the new fresh `[C, R]` carrier.
- Attachment frame: payload text is required. The original capture is a separate unchanged evidence occurrence. The payload and binding are derived from that exact validated original envelope, never from caller-supplied context.

An attachment frame is supplemental evidence, not a second trusted capture or authority frame. Its source is only verification or review and it has one occurrence. Verification/lint co-role pairing remains limited to complete byte-identical fresh or old verification carriers under the current rule.

Resolve new typed context against the full validated source set before prefix/suffix measurement. For valid readable carriers, emit the typed form so the text and decoded check/finding bindings are visible together. Keep the existing smaller-encoding/literal selection unchanged for inputs without readable records. This deliberate choice charges any added readable metadata instead of hiding the binding in encoded capture bytes to save space.

Share only complete canonical payload equality, now including `text` when present. Different text, check arrays, findings, or text availability cannot be interned together. Keep every frame, original descriptor, and occurrence position. An old capture and its attachment may therefore require separate items; that is real evidence cost, not a reason to rewrite the old item.

### Exact Expansion

The test-owned inverse must:

1. Separate optional text from the unchanged envelope payload and combine that payload with each frame's binding.
2. For a capture frame, reconstruct and verify the existing captured envelope bytes and complete capture; restore `[C]` or `[C, R]` according to text presence.
3. For an attachment frame, restore precisely the section 4 attachment from `reference` and text. After expanding all occurrences, resolve its original capture from the packet and verify that the derived envelope equals the frame's payload/binding.
4. Restore each canonical outer normalized body, verify its original descriptor, and expand all ordered occurrences. Preserve the existing history-reference inverse.

The delivered complete packet is self-contained. Full-set context used to measure an internal prefix is not permission to omit original captures from delivery. Only the test inverse is needed; do not add a public decoder.

## 7. Accounting And Compatibility

Fresh readable records add bytes to their existing stream entries, not additional sources. Each historical attachment adds one acquired source and one distinct original retained descriptor. Verification/lint mirrors still count as original acquisitions before sharing. Reject duplicate attachments before they could receive a deduplication discount.

Keep 64 sources, 64 retained descriptors, 131,072 canonical model bytes, 16 raw checks, 16 raw findings, and all existing ceilings: 1,048,576 bytes per source, 4,194,304 aggregate inspection-body bytes, 6,291,456 recovery request bytes, the runner's 1,048,576-byte input line, and the existing depth/entry limits. Charge string escaping, base64 transport where applicable, references, frame discriminants, bindings, descriptors, and all model metadata.

Reuse the sole renderer for build/validate Inspection, `modelPacket`, owner suffixes, and known postimages. Keep `physical items <= available original occurrences <= retained descriptors <= 64`. Add no attachment reservation, paging, compression dictionary, separate packet, or alternative history cut.

With no readable record, preserve old Inspection bytes, evidence hashing, packet encoding choices, and authority outcomes. Do not add default empty text or status fields. Valid additions legitimately change the new Inspection/evidence hash and may change the selected owner-log suffix, but never change old capture or event identities.

Readers and writers are delivered together. An older reader's ability to retain an unfamiliar record as literal data does not establish validation of this contract; using that older reader for historical semantic admission is unsupported, not a fallback.
