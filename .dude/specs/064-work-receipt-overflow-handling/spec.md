# Feature Specification: Work Receipt Overflow Handling

**Owner:** `.dude/ideas/064-work-receipt-overflow-handling.md`  
**Spec path:** `.dude/specs/064-work-receipt-overflow-handling/spec.md`  
**Intent basis:** September 17, 2026, capacity expansion and sustained-compaction clarification.

## Outcome And Scope

Keep repeated recovery history from unnecessarily inflating Work's working model context. Compact redundant representation deterministically on fresh inspection while preserving complete original audit and machine evidence. The same bounded outcome must cover continuing recoveries, not merely make the last incident or one additional episode fit.

The conservative policy is a self-contained, lossless model view with no persistent compaction state. Required facts remain substantively accessible, and the original normalized view can be recovered exactly. Occurrence metadata and genuinely distinct information still grow. This feature provides sustained compression within finite resource bounds, not constant total size, unlimited recovery, or indefinite canonical-file growth.

The Architect selects an explicit count-policy revision under the user's delegated technical definition judgment: remove the independent 16-physical-model-item restriction and derive model-item capacity from the existing 64-original-descriptor ceiling. The prior proposal failed conservative next-result admission even though the measured packet still fit its byte budget. This amendment changes planned admission behavior; it records no literal user choice of 64 and grants no bypass of the current runtime. Fixed acquisition, byte, and validation bounds, complete evidence, and authority remain protective constraints.

The reference case is `T004@d062f4a7` in `.dude/specs/062-dude-canvas-workspace-integration/spec.md`. Its latest separately authorized invocation supplied one current-run, four verification, four review, and three lint captures, but stopped at fresh inspection before an attempt or accepted revision. The earlier receipt-classification and fresh halt-report repair is the accepted regression baseline, with coordinator-supplied 544/544 Tester results and independent CodeReviewer approval; it is not new work or completion credit here.

Both stopped 062 invocations remain stopped. Definition and fixture evidence grant no task dispatch, retry, restored ownership, or completion authority. Implementation requires a later authorized Work or Ship request.

## User Scenarios & Testing

### US1 - Retain repeated recovery evidence without repeated payload growth (P1)

A Work user can keep the evidence from successive recovery and settlement episodes without manually shortening history or removing captures.

Independent test: extend a complete, authority-valid fixture with repeated substantive content and separately recorded occurrences, then with controlled changes to checks, findings, identities, and authority. Measure every prefix through the first applicable fixed bound.

Acceptance: exact repeated facts do not keep adding physical payload items; every occurrence and its metadata remains present and charged. Changed facts and distinct judgments remain distinguishable, including earlier failures and repeat relationships. Every otherwise-valid prefix satisfying current limits and conservative raw capture headroom is capacity-admissible; genuine excess stops honestly.

### US2 - Admit the frozen case and the next existing mandatory episode (P1)

A maintainer can inspect the complete reference evidence and, in a separately owned fixture, retain the next required verification/review pair and associated lint evidence when the complete episode fits.

Independent test: first inspect the frozen reference read-only. Separately exercise an owned state-machine fixture through the existing admission, capture, projection, receipt, and dual-surface retention boundaries, using fully specified next results.

Acceptance: the full frozen model view fits. The next mandatory completion/retention episode does not fail solely because repeated representation consumes capacity when its actual combined evidence, conservative completion demand, and other gates fit. Read-only proof performs no model call or mutation; fixture progression is never actual 062 execution or revival.

### US3 - Stop at a real limit with accurate current evidence (P2)

A user receives an honest refusal when distinct evidence, occurrence metadata, or physical source growth reaches a limit, without losing accepted state or earlier audit writes.

Independent test: compare the real equality/first-excess boundaries, fully known excessive projection growth, unknown later growth, and invalid authority or retained-surface disagreement.

Acceptance: known excessive post-step evidence refuses before affected writes. Unknown bytes are checked when available. Each refused step preserves its accepted prestate and reports the fresh reason and affected target; prior applied projections remain visible and are not described as rolled back.

## Key Entities

| Entity | Meaning |
| --- | --- |
| Original evidence | Complete acquired sources, trusted captures, and audit history with original byte/hash identities; these remain the machine authority. |
| Logical occurrence | Each required appearance of evidence with its role, descriptor, position, identity, invocation/attempt, source revision, and authority/review bindings. Equal content does not erase separate occurrences. |
| Physical model item | A charged payload-bearing evidence unit in the compact view. Exact repeated content can serve multiple occurrences; distinct substantive result bodies cannot be bundled into one item to evade accounting. Individual checks retain their existing per-attestation bound. |
| Compact model view | All required substantive content and occurrence relationships, contained within the counted packet and exactly expandable to the known original normalized view under the same allowed owner-log projection. |

## Functional Requirements

### Complete Model Evidence

- **FR-001:** Produce the same deterministic compact model view for the same freshly verified inputs at every existing inspection and capacity decision. Compaction requires no manual cleanup, new command, timer, saved checkpoint, or prior compaction run.
- **FR-002:** Preserve substantive access to every required check, finding, failed approach and repeated basis, source content, ordering, multiplicity, provenance, and authority relationship. Prove exact, bounded per-packet expansion to the original normalized view, including original framing and bindings. Hash-only references, opaque encoded content without accessible facts, and external or uncounted dependencies do not satisfy this requirement.
- **FR-003:** Factor only exactly repeated validated content without merging separate specialist judgments, approvals, or logical result records. Changed outcomes, checks, finding observations, evidence/result identities, source revisions, or authority must remain distinguishable even when other content is shared. A hash cannot supply a missing report or check description; a retained Tester's full-run or not-run assertion remains as recorded until its owner legitimately corrects it.
- **FR-004:** Keep full original machine-inspection evidence, trusted captures and normalizers, byte/hash identities, source-hash and evidence-hash derivation, and canonical audit boundaries intact. Preserve the existing complete-log-bound maximal whole-event owner-log suffix rule as the sole existing history-projection exception. Do not drop task/current-run history or infer retirement from acceptance, a completed task, or settled governance; existing repeat/no-progress readers still require complete occurrences and trusted inputs.

### Capacity And Growth

- **FR-005:** Remove the independent 16-physical-model-item restriction. An admitted compact view must satisfy `physical items <= available original occurrences <= original retained descriptors <= 64`; compaction cannot create additional payload items. Thus 64 is a derived physical-item maximum, not a new independent allowance. Retain 64 acquired source entries counted before normalization/sharing and 64 original normalized descriptors counted before compaction, including unavailable descriptors. Charge the entire canonical model packet, including every tag, frame, binding, descriptor, body, reference, and other metadata byte, against 131,072 bytes. Sharing cannot reduce raw acquisition obligations or hide unrelated results in a catch-all payload.
- **FR-006:** Across a bounded extension series containing only exact repeated substantive payloads, keep distinct payload-item demand stable while preserving and charging every new occurrence. Changed substantive facts require distinct represented content; changed identities or authority require distinct bindings even if content can be shared. Metadata growth and original-file growth remain measurable and bounded, not constant-size promises.
- **FR-007:** Admit the complete frozen case and support the next existing mandatory completion/retention episode when the full compact evidence and other gates fit. Reserve known mandatory capture demand independently against freshly acquired sources and pre-compaction original descriptors, regardless of present or assumed future sharing; each total must remain at most 64. Replacing an existing empty placeholder adds no descriptor, appending an independent result adds one, guarded mode adds no mandatory completion demand, and an absent optional session adds no capture demand. Within this headroom check, source exhaustion precedes descriptor exhaustion when both are known, preserving existing eligibility, authority, learning, and other budget precedence. This is raw-count headroom, not a physical-payload quota or a promise that unknown future bytes fit.
- **FR-008:** Where exact current-step inputs make post-write evidence fully knowable, preflight the complete accumulated evidence at every affected projection prefix and resulting capture/receipt boundary before that step's writes. Recheck bound evidence, exact target, authority, and prestate at application. Unknown future content gets a fresh check at the existing late boundary, without a prior fit promise or persistent reservation.

### Authority And Refusal

- **FR-009:** Keep complete fresh source verification, exact ownership/target checks, original capture validation, and complete matching ordered retained inputs at both existing surfaces and their bound bases. Repeat, earliest-repeat, governance, no-progress, receipt, and other current readers retain their full evidence and authority requirements. Preserve result rederivation and default/injected-runtime no-effect safeguards; view reuse supplies no trust.
- **FR-010:** Genuine complete-evidence model-byte overflow remains the existing `evidence-incomplete` hard stop, including legitimate descriptor-only results; raw source/descriptor, other resource, and invalid-input refusals retain their applicable classifications. Report the fresh reason, affected subject, exact target, observed current evidence identity, and existing next action within the bounded diagnostic. Do not relabel valid overflow as `runtime-output-malformed` or treat predicted evidence as observed authority. The refused step makes no model call or accepted-state/counter/task/lane mutation and fabricates no transition or receipt. Preserve earlier projections, receipts, and history without claiming whole-operation rollback.
- **FR-011:** Preserve existing refusals for missing versus empty, unreadable, malformed, nontext, stale, raced, or symlinked sources, forged/conflicting identities, invalid authority, wrong targets, and missing/indeterminate/observed-effect proofs. Invalid or incomplete evidence cannot become a compact success-shaped view.
- **FR-012:** Apply the model-view contract consistently through the current inspection, capture, projection, adapter, and runner callers, active guidance, direct capacity readers, and source/generated surfaces. Preserve the existing capacity-reporting shape. Add no trusted summary, history-retirement authority, persistent compaction state, alternate workflow, or speculative caller. Keep verification, independent review, learning, approval, and closure gates unchanged.

## Fixed Capacity Obligations

The selected policy changes only model-item admission. Acquisition, byte, and validation ceilings remain fixed; physical model capacity is derived from original evidence counts rather than an independent quota. Equality passes only that budget check, and all other prerequisites still apply.

| Budget | Maximum |
| --- | ---: |
| Direct idea inventory entries | 999 |
| Acquired bytes per source body | 1,048,576 |
| Aggregate decoded acquisition bytes | 4,194,304 |
| Encoded command-line request bytes | 6,291,456 |
| Acquired source entries, charged before normalization/sharing | 64 |
| Original retained descriptors, including unavailable entries, charged before compaction | 64 |
| Physical compact model items, derived from available occurrences and original descriptors | 64 (derived) |
| Canonical model-packet bytes, including every payload and mapping | 131,072 |
| Error-response bytes | 8,192 |
| Checks per attestation | 16 |
| Structured graph depth | 32 |
| Structured graph entries | 4,096 |

All other applicable current bounds remain unchanged. The 16-check attestation validation/decoding bound stays 16; it is not the model-item bound. Per-packet expansion and compaction cannot evade the full source-body, acquisition, request, or validation limits.

## Edge Cases

- Repeated payloads occur under new roles, authorities, identities, attempts, or revisions; near-identical findings differ in one observation. Preserve exact content and every separate binding rather than equating similarity with identity.
- A settled episode contains an earlier failed approach needed to derive the earliest repeat. No success, terminal glyph, or governance disposition establishes a history-retirement watermark.
- One retained surface is missing an occurrence, changes order, or disagrees with the other; a source changes between prediction and application. Compaction cannot repair or conceal that disagreement.
- A compact packet fits, but mandatory raw-source or original-descriptor headroom does not; alternatively those counts fit while bytes or a full source file exceed their own ceiling. Count admissibility cannot approve the whole episode.
- All currently available payloads share, but unavailable descriptors and independent mandatory captures still consume raw headroom. Replacing a placeholder and appending a fresh result have different descriptor growth.
- A known prefix fits and a later projection or newly received result does not. Preserve already applied writes and the rejected-step prestate, retain the complete evidence, and stop without automatic pruning or retry.

## Success Criteria

- **SC-001:** On an immutable, hash-bound reference fixture, reproduce the baseline overflow and demonstrate a complete compact view within 131,072 canonical bytes and the derived bound `physical items <= available original occurrences <= original retained descriptors <= 64`, with acquired sources also at most 64. Account for all 12 captures and required canonical sources, all 50 checks, and the complete ordered 12-event retained sequence: four failed attempts across three bases, five finding occurrences, one learning review, and two governance events covering required/reviewed. Revalidate trusted envelopes and both surfaces. Record exact sizes, counts, identities, and zero model calls or state/file mutations for this read-only proof.
- **SC-002:** Measure the complete reference, its fully specified next verification/review and required-lint episode, and otherwise-valid repeated recovery/settlement extensions through the first genuine canonical-byte, acquisition, or other guard bound. Record every capture, projection, receipt, and retained-evidence prefix, the last admitted prefix, and the first refusal with its controlling reason. Include logical occurrences, physical items, canonical bytes, raw source/original-descriptor counts, and conservative mandatory headroom. Exact expansion and original identities hold throughout; changed outcomes, checks, findings, identities, revisions, authority, and chronology remain distinct. A separate exact-repeat series must keep payload-item demand stable while charging new occurrence metadata. Initial or one-extra-pair fit alone is insufficient.
- **SC-003:** Exercise genuine 131,071/131,072/131,073-byte compact packets. Controls with 15, 16, and 17 physical items are all count-admissible when raw acquisition, mandatory headroom, bytes, and every other guard fit. Cover 63/64/65 acquired sources and original descriptors independently, plus admission-headroom totals of 63/64/65 after mandatory growth: 63 and 64 pass that count check; 65 refuses acquisition/headroom, including descriptor 65, rather than manufacturing compact-packet item overflow. When both headroom totals exceed 64, source exhaustion takes precedence without reordering earlier gates. Retain equality/first-excess coverage for all other ceilings without lowering limits, hiding payload, pruning evidence, or packing unrelated results. Repeated unchanged evaluation produces identical representation and accounting.
- **SC-004:** For each fully known excessive projection prefix, refusal precedes its affected writes; drift at application invalidates the earlier prediction. Unknown later growth is checked at its real boundary. Accepted-state bytes/revision, counters, pending/completed entries, task/lane state, and rejected-step file preimages remain unchanged, while previous applied projections/receipts remain byte-preserved. Diagnostics identify the fresh boundary and never claim whole-operation rollback.
- **SC-005:** After implementation, an independently authorized disposable state-machine fixture completes the fully specified next mandatory verification/review and required-lint retention episode when all bounds and other gates fit, through the supported adapter/runner path. Repeat the complete-reference SC-002 extensions through production inspection/admission and supported retention boundaries to the first genuine byte, acquisition, or other guard refusal; preserve the measured last-admitted/first-refused outcomes. Missing/conflicting/forged/stale evidence, wrong targets, and default/injected no-effect controls refuse for their intended reasons. Complete repeat/governance/no-progress evidence, honest descriptor-only `evidence-incomplete` reporting, no fabricated acceptance/close, and source/generated behavior remain intact. This proves integration, not real 062 continuation.

## Observed Research Basis

The coordinator reports independent Reviewer `APPROVE` for the amended requirements in `sustained-stage/spec.md`. The terminal `accounting-measurement/report.json` and `result.json` establish same-representation feasibility through the first genuine ceiling: the complete frozen case and specified next episode fit, as do two further complete-reference cycles. The last complete receipt is ordinal 7 at 129,880 bytes; ordinal 8 first refuses at capture acquisition with a 131,879-byte model view, before either new retained event is written. Count headroom alone does not establish byte fit.

This is read-only definition research, not production integration or product-test acceptance. Original evidence, exact expansion, deterministic accounting, and completed dual-surface equality passed the reported checks. Metadata and literal histories still grow to a finite stop. The former 16-item proposal remains failed at 15 + 3 = 18; its reports and history are unchanged. The plan binds the exact research inputs, corrections, and remaining implementation proof.

## Assumptions And Exclusions

Original user-controlled question answers and Assumptions remain unchanged in the idea ledger; their historical blank slots are not current human requests. Existing project guardrails cover this definition. No new guardrail ratification or UI preview is needed.

Keep 056 orphan cleanup, 060 invalid-handoff recovery, and closed 061 artifacts unchanged. The historical assumption that model 16 dominates descriptor headroom no longer applies to 064. Canvas picker fixtures, 062 T005, UI work, automatic retry/cleanup or pruning, stopped-run revival, lost-supervisor resume, Git delivery, archival/deletion/editing of canonical events, and historical migration are outside scope. Add no external lookup, trusted summary, checkpoint, daemon, cache, registry, store, lane, command, setting, or scheduler schema.
