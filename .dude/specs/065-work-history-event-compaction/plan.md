# Implementation Plan: Work History Event Compaction

**Owner:** `.dude/ideas/065-work-history-event-compaction.md`  
**Spec path:** `.dude/specs/065-work-history-event-compaction/spec.md`

Use backward references from current-run records to exact event bodies already present in literal task history. This familiar lossless delta-encoding pattern needs one private model-item variant and no separate event dictionary. The existing source order puts task history before current-run, so a reference can stay local to the packet being measured.

## Technical Context

| Field | Decision |
| --- | --- |
| Language/Version | Node.js 20+; dependency-free ECMAScript modules with JSDoc and `@ts-check`. |
| Primary Dependencies | Existing recovery, task parsing, postimage, adapter, runner, and attestation code; Node built-ins only. |
| Storage | Existing canonical files and trusted captures remain unchanged. No new persistent or cross-call state. |
| Testing | `node:test`, existing model-view helpers, one portable retained-incident asset, and disposable adapter/runner integration. |
| Target Platform | Existing Node CLI/host environments. New sharing applies to exact Lightweight task-history/current-run projections; other lane shapes retain their existing representation. |
| Project Type | Reusable core bundle: edit `src/`; generate corresponding `.github/` core files through the existing build. |
| Performance Goals | Actual net canonical-byte reduction and the bounded complete path in SC-002/SC-003. No percentage, latency, or unlimited-retention target. |
| Constraints | Spec FR-001–FR-008 and all fixed limits. No public decoder, new runtime API, or alternate encoder. |

## Production Reuse

| Existing location | Change or retained responsibility |
| --- | --- |
| `src/skills/dude-work/recovery.mjs`: `normalizeTaskHistory`, `normalizeCaptureStream` | Keep acquisition and normalization unchanged. Their current closed bodies supply the representation below. |
| Same file: `modelPayloadContext` and `packetProjection` (currently near 3078 and 3168) | Add the narrow history candidate inside the sole renderer. Preserve existing verification/review eligibility, payload sharing, and verification/lint co-role frames. |
| Same file: `measuredInspection`, `buildInspection`, `validateInspection`, `modelPacket` | Continue using that renderer for admission, owner-suffix selection, prefixes, validation, and delivery. |
| Same file: `preflightLightweightWorkV2` (currently near 11633) | Keep complete acquisition, `collectEvidenceInternal`, every lane-first and both-surfaces measurement, and fresh permit checks. The new rendering is inherited through `measuredInspection`. |
| `src/skills/dude-engine/lib/lightweight-work-postimage.mjs`, the lane board, `host-adapter.mjs`, and `host-adapter-runner.mjs` | Reuse existing postimage construction, `currentRunCapture`, application order, receipts, and settlement. No writer, adapter-state, or runner-order change is planned. |

The new form deliberately extends 064's model-only literal-history contract. Do not edit that completed package. Keep the root format `dude-work-model-view-v1`; this adds a private item variant, not a persisted format migration or a new operation.

## Selected Representation

The packet root remains `{format,target,items}`. Existing `literal`, `verification`, and `review` items and frames retain their current contract.

| Part | Representation |
| --- | --- |
| Anchor | The existing complete `literal` task-history item, unchanged, including its descriptor and occurrence frame. Its parsed text has exactly `{path,canonicalTasks,dependencies,discovered,history}`. |
| New current-run item | `{tag:'current-run',body:{target,state,records},frames:[Frame]}`. `Frame` is the existing `{descriptor,occurrences}` with exactly one original current-run occurrence. |
| Inline record | The original normalized `{event:E}` object, unchanged. |
| Shared record | The two-integer tuple `[historyPosition,lineIndex]`, replacing exactly one `{event:E}` record. |
| Coordinates | `historyPosition` is the anchor's original available-occurrence position, **not** a physical item index. `lineIndex` is zero-based in `logicalLines(parsedHistory.history)`, including headings, blank lines, and other history lines. |
| Expansion | Resolve the earlier literal occurrence, take the selected line's exact event suffix, parse it as `E`, and replace the tuple with `{event:E}`. Canonicalize the restored body to reproduce the original current-run text. |

Keep `orderAndDedupeItems` unchanged; coordinates refer to its existing available original list. Keep one physical item and frame per retained current-run item, with no additional capture merging. Preserve record-array order and every duplicate record. Inline events without an exact anchor. The task-history literal retains all line prefixes, terminators, unrelated text, duplicates, and conflicts; it is not rewritten into a list of events.

### Eligibility And Fallback

1. Require an exact Lightweight task target and one present, canonical task-history body at the expected sibling tasks path in the actual packet. The anchor must precede the current-run occurrence. An absent or ineligible anchor leaves current-run literal.
2. Index only column-zero `- dude-run-event: ` lines terminated by exactly one LF. Use existing logical-line handling and event declarations/validators, including the current type/version distinction for learning review. The suffix must equal the event's complete canonical JSON bytes. Wrapped legacy lines, CRLF/unterminated event lines, and unsupported bodies are not anchors.
3. Require a present current-run item whose text exactly round-trips through the closed `{target,state,records}` body with the matching target and an existing valid state. Every record must be exactly `{event:E}` with an eligible declared event. An unknown record shape or noncanonical body leaves that entire capture literal. For eligible records, match the complete canonical event bytes and target; a hash is not the equality key.
4. Select the earliest exact matching history line for each shared record. Repeated matching lines remain in task history, and repeated records remain in current-run. A changed event, conflicting identifier, or missing counterpart is never corrected or substituted.
5. Require at least one reference and a strictly smaller canonical encoding than the original literal item. Otherwise choose the original literal, including on a tie.

Use existing event validation only to establish candidate eligibility; do not add a new acquisition refusal or replace the authority readers with an index. Ineligible candidates retain their original text and established behavior. Do not catch or downgrade existing acquisition, trusted-envelope, or authority refusals. The unchanged raw Inspection still reaches the existing duplicate/conflict, chronology, and dual-surface checks.

This structure avoids substring replacement and a general-purpose fragment codec. JSON parsing is safe for this representation only after the exact canonical round-trip check: alternate escape spellings, whitespace, or duplicate keys must not be silently rewritten. All fields outside the substituted record, and every field of the referenced event, remain recoverable.

## Prefixes, Accounting, And Identity

Build event references from `originals.filter(isAvailable)` for **each actual `packetProjection` call**. Do not reuse coordinates from a complete acquisition in a shorter prefix or the non-owner projection. A prefix without its anchor stays literal. Keep `modelPayloadContext`'s full-set verification/review binding preparation unchanged; that context must not become an uncounted source of history bodies.

Measure candidates with `Buffer.byteLength(canonicalJson(...))`. Replacing one item leaves packet item count and separators unchanged, so the item comparison includes the complete incremental cost; final admission still measures the whole packet. Charge tuple digits, tags, frames, descriptors, inline records, and JSON escaping. Reuse existing graph, acquisition, mandatory-headroom, and byte guards rather than creating a history-specific budget.

The existing maximal owner suffix can grow when sharing frees space. Keep that selection algorithm and all complete-log metadata. For SC-002, compare new and literal-history encodings over identical selected evidence, and separately report each actual maximal-suffix result. Do not promise equality with an older evidence hash when the selected owner body changes; the hash derivation itself remains untouched.

## Portable Incident And Complete-Path Proof

Later implementation creates only the needed test asset at `scripts/fixtures/065-work-history-event-compaction/retained-incident.json`. Reuse and narrowly extend `scripts/fixtures/064-work-receipt-overflow-handling/model-view-test-helpers.mjs`; retain its immutable reference assets unchanged.

The read-only forensic report is linked from the owner's Incident Context. Its sibling `062-compacted-ship-OnmdQZ/t004/` evidence supplies:

- `request-17.json`: the full accumulated preparation input and bindings, not the smaller last-returned Inspection.
- `result-16.json`: the pending batch and provisional values, usable only as inert inputs to read-only deterministic preflight proof.
- `result-17.json` and `result-18.json`: the refusal and ended/null-ownership provenance, never a resumable session.

Freeze required canonical source preimages, complete capture streams, and their byte/hash bindings. Verify source preimages against the retained lane binding before using them. Preserve seed and failed Tester/Reviewer streams and every contradictory assertion; record actual per-stream, record, and check-outcome counts rather than assuming only the latest result matters. Do not copy supervisor, worker, checkpoint, control, or permission material into the fixture. Historical paths inside evidence are inert text, not I/O dependencies.

Supplied pre-change measurements, not re-executed here:

| Boundary | Model bytes |
| --- | ---: |
| Complete accumulated input: 20 descriptors, 19 available occurrences, 15 items | 130,975 |
| Approach event: lane-first / both surfaces | 129,151 / 130,678 |
| Finding event: lane-first refusal | 131,619 |

The first failure has one owner event left. The reported 90,890 history bytes and 31,036 bytes of repeated event bodies identify the target; neither is net savings for this design.

### Focused Representation Checks

Extend `expandModelPacket` with the independent inverse described above and compare against `originalAvailableProjection`. The inverse resolves references from emitted literals, not renderer maps or external fixture lookups, and verifies each restored descriptor. Reuse `measurePrivateModelView` for observation of selected bytes, including descriptor-only overflows.

Use the same test-only in-memory helper for the pre-change control, suppressing only selection of the new item while keeping acquisition, other sharing, suffix selection, and guards unchanged. Do not copy the runtime or add a production flag/second encoder. Also obtain the literal counterpart of each exact selected projection for net-byte comparisons.

Cover exact repeats and near-equality; duplicate lines and ordered records; separate current-run captures sharing events; extra-field/unknown-record fallback; LF versus ineligible framing; quotes, backslashes, control escapes, and Unicode; absent anchors; owner-suffix and prefix position changes; and unchanged verification/review/co-role behavior. Exercise supported shapes with existing event builders, not invented consumer formats.

### Supported Integration And Later Growth

Use fresh disposable roots and fresh test-owned authority through the existing adapter/runner and lane owner. Never instantiate any worker, adapter, or supervisor from archived host/session state. Keep the exact incident's pure preflight proof separate from integration's freshly derived bindings.

Start with all retained incident captures and rederive the required learning from that evidence. Review learning, project its two events through both surfaces and commit their receipts, settle learning, and bind the fixture-declared material alternative through the existing owner. From the actual returned state, authorize the governed failed counterpart. Reuse `buildRetentionPair`/`appendRetentionPair` and existing attestation helpers to add genuinely new bound verification/review and applicable lint captures with their actual failed/rejected outcomes; do not replace or relabel any old capture.

Drive the new approach/finding batch through preparation, permit issuance/application, current-run publication, each receipt, and `settle-effect`. Require all four actual receipts in this fixture: two learning and two occurrence receipts. For every event, measure the lane-first intermediate and both-surfaces state and compare predicted postimages with actual writer bytes using `buildLightweightWorkPostimages` and the existing `currentRunCapture`. Settlement must report `verification-failed`, with no pending effect or attempt and governance still `alternative-authorized`. The new captures and later event growth within this reachable episode satisfy the growth obligation; mere reinspection does not.

The old requirement for a second recovery after this sealed failure is removed, not treated as implemented. In `recovery.mjs`, failed governed finalization preserves the authorized seal, `learnGovernanceV2` requires `required`, and `resumeGovernanceV2` does not reset present governance; `host-adapter.mjs` also requires unchanged governance on that failure. The retained independent resume probe confirms this boundary, not a passing SC-003. No continuation capability or state-machine change belongs to this feature.

In separate fresh fixture runs through the same complete prefix, verify direct re-review refuses with `learning-phase-mismatch` and the supported `resume-learning` route returns `resumed:false`/`governance-unresolved` with an adapter hard stop. Both must preserve the exact accepted-state bytes, phase, counters, prior captures, and all four receipts; do not attempt new authorization after the hard stop. Preserve the fixture task/snapshot state and report only its allowed `hard-stop-recorded` cleanup, never `task-settled`, closure, or capacity failure.

SC-003 fails if growth, a required effect/receipt, actual failure settlement, or either sealed-continuation refusal lacks proof. Changing only the old continuation assertion to expect a hard stop is insufficient. Do not replace accepted state, reset pending effects or phase, drop governance, or change a failed result to a pass. The 064 fixture README's counterfactual later component measurements remain separate; they cannot establish this supported path.

At each acquisition, lane-first, both-surfaces, receipt, and settlement boundary, including later growth within the episode, record actual emitted bytes, same-projection literal bytes, owner suffix counts, physical items, original occurrences/descriptors, source counts/headroom, and existing source/aggregate/request metrics. Assert exact inverse reconstruction and unchanged retained failed assertions throughout. Label new fixture checks and learning results as synthetic; they do not resolve real 062 failures or browser acceptance.

For SC-004, add history-bearing real byte-boundary and known/unknown excess controls. Reuse current authority, prestate-drift, one-sided-write, missing/conflicting capture, and permit/receipt negatives. Assert their intended reasons, no rejected-step mutation, and preservation of earlier writes. Keep finite-limit refusal distinct from the complete path required to pass.

## Delivery And Verification

Update the active literal-history statement in `src/skills/dude-work/SKILL.md` with the new private model form and unchanged authority boundary. Update actual closed test readers, especially the inverse and current-format assertions. No change to the board/postimage algorithm, adapter protocol, or runtime state is needed.

The seven retained host/board regressions remain mandatory T002 repairs: unknown post-apply overflow, known-growth pre-write refusal, effectful-port/no-effect refusal, reference component accounting, full-reference natural settlement, misbound terminal receipt, and premature authorization. Remeasure affected expectations while preserving each intended guard and the real fixed-limit boundary. The prior independent 199-pass/8-fail run and Reviewer rejection remain failed evidence; this criterion correction does not make them pass or waive guidance, source/generated parity, or delivery-suite alignment.

Future commands, not run during definition, from an authorized isolated validation copy containing current source, required static `.dude/` test inputs, and fixtures. Run the source checks first:

```sh
node --test --test-reporter=tap src/skills/dude-work/recovery.test.mjs src/skills/dude-work/specialist-attestation.test.mjs
node --test --test-reporter=tap src/skills/dude-work/host-adapter.test.mjs src/skills/dude-lightweight-execution/board.test.mjs
```

Generate core only after `ISOLATED_ROOT` names that authorized disposable repository, with the working directory also inside it:

```sh
(cd "$ISOLATED_ROOT" && node "$ISOLATED_ROOT/scripts/build-dev.mjs" --repo "$ISOLATED_ROOT")
```

Then run the current-format and build checks in the same copy:

```sh
node --test --test-reporter=tap scripts/current-format-contract.test.mjs scripts/build-dev.test.mjs scripts/build-release.test.mjs
```

Compare/carry back only the authorized `recovery.mjs` and Work `SKILL.md` source/generated pairs. Preserve unrelated dirty files and local overrides. Verify that fixtures remain excluded from dev/release output. No browser rebuild, pack change, Git write, or release is included. Return exact commands, runtime, pass/fail/skip counts, fixture identities, boundary measurements, and any unexecuted acceptance path; test authorship is not independent approval.

## Phases, Traceability, And Risks

| Phase | Task | Requirements | Exit evidence |
| --- | --- | --- | --- |
| Lossless representation | `T001@e065a1c8` | US1; FR-001–FR-004, FR-006, FR-008; SC-001/SC-002 | Portable incident, exact inverse, literal fallback, deterministic complete-byte accounting, and focused renderer regressions. |
| Complete retained path and delivery | `T002@e065b2d9` | US2/US3; FR-003–FR-008; SC-001–SC-004 | Reachable recovery growth and failure settlement, sealed-continuation refusals, real capacity controls, active guidance, and generated/build parity. |

The second slice depends on the first representation and fixture; no other dependency or parallel stage is needed. Existing guardrails suffice, with no new candidates. These are functional acceptance requirements, so there is no ObjectiveRegistry or separate architecture/supporting document.

Full T002 acceptance remains unproved; retained measurements and the isolated probe do not establish a passing revised suite. The literal anchor, occurrence metadata, raw captures, and structured output still reach finite limits. Source preimages must match the retained bindings, and a larger owner suffix can change evidence identity. If implementation cannot satisfy the bounded path within this representation and the existing ceilings, report that specific gap rather than widening scope, limits, or execution authority.
