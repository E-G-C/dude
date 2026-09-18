# Implementation Plan: Work Receipt Overflow Handling

**Owner:** `.dude/ideas/064-work-receipt-overflow-handling.md`  
**Spec path:** `.dude/specs/064-work-receipt-overflow-handling/spec.md`

Implement the Architect's selected lossless payload factoring and descriptor-backed accounting in the existing Work path. Use exact-content interning: represent a complete repeated payload once, with every original occurrence and binding retained separately. This familiar lossless representation pattern fits the measured repetition without introducing a compression service, stored summary, or history-retirement policy.

The amended WHAT has a supplied independent SPEC approval. Terminal accounting research supports this HOW through the first genuine ceiling; it does not prove production integration. The four tasks below remain open, including actual emitted-byte measurements and the selected lane-first application order.

## Technical Context

| Field | Decision |
| --- | --- |
| Language/Version | Node.js 20+; dependency-free ECMAScript modules with JSDoc and `@ts-check`. Research used Node 26.8.1, which is not cross-platform or minimum-version validation. |
| Primary Dependencies | Existing recovery, task, ownership, attestation, and board modules; Node built-ins only. |
| Storage | Existing canonical files, trusted captures, runner memory, and adapter-local permit entries. No new persistent field, format migration, store, reservation, or checkpoint. |
| Testing | Existing `node:test` suites, a test-owned inverse, and portable nonshipped reference fixtures. Use the actual adapter/runner and lane writer in disposable roots for integration. |
| Target Platform | Existing Node CLI/host-adapter environments. Preserve current Lightweight and tracked readers; add exact postimage prediction only for the supported Lightweight writer. |
| Project Type | Reusable bundle: authoritative core in `src/`, generated dogfood core in `.github/`, optional pack source in `library/packs/`. |
| Performance Goals | Satisfy the spec's complete-evidence byte/count bounds and exact-repeat payload stability. No latency target, constant-total-size claim, or autonomous optimization objective. |
| Constraints | All spec budgets and authority gates apply. Complete raw histories remain authoritative; only the existing maximal whole-event owner-log suffix may project history. |

## Structure And Reuse

| Location | Responsibility | Requirements |
| --- | --- | --- |
| `src/skills/dude-work/recovery.mjs` | Private pure encoder around `packetProjection`; one renderer for inspection, validation, model delivery, and prediction; original-descriptor headroom; exact known-growth checks; shared pure current-run capture construction. | FR-001–FR-011 |
| `src/skills/dude-engine/lib/lightweight-work-postimage.mjs` (new) | Small pure `buildLightweightWorkPostimages` helper extracted from the board's existing byte construction. Its two production callers are the board writer and recovery prediction. It does not import recovery. | FR-008, FR-009 |
| `src/skills/dude-lightweight-execution/board.mjs` | Retain owner/prestate validation, writer authority, existing atomic write/rollback, and receipt construction; delegate only deterministic postimage bytes. | FR-008–FR-011 |
| `src/skills/dude-work/host-adapter.mjs` | Bind preparation to existing local permit entries and freshly rederive it before application. Preserve default/injected-runtime and lane-owner safeguards. | FR-008–FR-012 |
| `src/skills/dude-work/host-adapter-runner.mjs` | Stage the next current-run record privately, apply the freshly checked lane effect first, then publish that same record and commit/finalize retention. | FR-008–FR-012 |
| Existing tests, Work guidance, direct limits readers, and build contracts | Prove the complete supported path, align the intentional count-policy change, and deliver matching authorized source/generated pairs. | FR-012, SC-001–SC-005 |

Keep specialist attestation and existing typed normalizers as the authority for eligibility. Do not add a public decoder: only the tests need an inverse. Task parsing and task-state serialization remain shared existing concepts, not new versions or duplicated rules.

## Closed Model-View Contract

The production format name is `dude-work-model-view-v1`. It replaces the research label `064-payload-1` without changing the selected structure or introducing a persistent state version. Keep this contract in the plan; separate schema, data-model, or research scaffolds add no useful capability.

| Part | Exact representation or invariant |
| --- | --- |
| Packet | `{format, target, items}`; `format` is `dude-work-model-view-v1`. |
| Literal item | `{tag:'literal', text, frames:[Frame]}`. Preserve the complete literal body. |
| Verification item | `{tag:'verification', payload, frames:[TrustedFrame,...]}`; payload contains exactly `type`, `version`, `target`, and `checks`. |
| Review item | `{tag:'review', payload, frames:[TrustedFrame,...]}`; payload contains exactly `type`, `version`, `target`, `verdict`, and `findings`. |
| Frame | `{descriptor, occurrences:[{source,position},...]}`. Preserve the complete original descriptor, including required/status/hash/length facts. |
| TrustedFrame | `{descriptor, occurrences, outer, capture, binding}`. `outer` retains the original normalized body's `target` and `state`. `capture` retains the complete trusted capture except `bytes.base64`, including its byte length and hash. `binding` contains exactly the closed v2 envelope fields outside the complete typed payload, including attempt, source, result, authority, invocation, review ordinal, and verification-envelope bindings. |
| Co-role occurrence pair | A frame has one occurrence, or exactly one verification-then-lint pair with complete descriptor/text byte equality. Use the earliest eligible verification and pair only when canonical encoding is smaller. Do not merge acquired captures or logical records. |
| Payload equality | Share only complete canonical payload bytes, never hash-only equality or similarity. Different check arrays or finding sets remain different physical items. Choose literal on equal encoding cost. |
| Order | Items and frames follow first original position; occurrences stay ordered. Every original available position from `0` through `N-1` appears exactly once. |
| Accounting | One item is one literal body after the allowed co-role pair, or one distinct complete typed payload. Frames carry occurrence bindings, not hidden extra payloads. Charge the entire canonical packet, including format, tags, frames, descriptors, and metadata. |

Typed eligibility requires a present canonical source body containing exactly one trusted record, successful existing normalizers, and exact canonical byte round trips. Unknown, unsupported, or multi-record shapes remain literal. Recognized malformed evidence retains its existing refusal rather than falling back to a success-shaped literal.

Prepare typed eligibility and cross-review verification bindings from the **full validated evidence set before** measuring any prefix or owner suffix. Reviews sort before verification sources; a partial prefix must not falsely leave an otherwise eligible review as a larger literal. Reuse that immutable full context for capacity calculations only. The final model view remains self-contained and includes all payloads and bindings needed for expansion.

The test-owned inverse must:

1. Disjointly merge each typed payload with its binding, canonicalize the envelope, verify captured byte length/hash, and recreate standard padded base64.
2. Restore the complete capture and the canonical outer body with `records:[capture]`, then verify the original descriptor. Copy literal text unchanged.
3. Expand each frame's occurrences and sort by original position to reproduce the entire original available projection byte-for-byte under the same allowed owner suffix.

`buildInspection`, `validateInspection`, `modelPacket`, and known-postimage calculations must use one canonical renderer. Preserve full raw Inspection evidence, captures, audit files, and the original source-hash/evidence-hash derivation. A different admissible owner suffix or status can legitimately produce a fresh evidence identity; do not assert equality with an old packet hash merely because source files are unchanged.

Task-history and current-run bodies stay literal and complete. Event factoring is deferred. Add no check dictionary, event dictionary, generic result dictionary, semantic pruning, metadata omission, rolling cutoff, or external lookup.

## Descriptor-Backed Admission

Remove the independent `MAX_PACKET_ITEMS = 16` decision from owner-suffix selection, prefix admission, and final model validation. Preserve the exported capacity envelope's exact `{items,bytes}` shape: derive `items` from `MAX_RETAINED_DESCRIPTORS` (64), and keep `bytes` at 131,072. The encoder must establish `physical items <= available original occurrences <= original descriptors <= 64`.

Replace `completionEntryDemand`'s internal model-item demand with original-descriptor growth. Before authorization changes state, require both:

- Fresh acquired source entries plus every mandatory new capture source are at most 64, counted before decoding, normalization, or sharing.
- Original `Inspection.items` plus conservative mandatory descriptor growth are at most 64, including unavailable descriptors.

Under autonomous policy, reserve one new verification and one new independent review, plus lint when the action's required checks include it and one current-run capture when none exists. An independent appended result adds a descriptor; replacement of its empty placeholder does not. Three completion captures replacing placeholders cost three sources and zero new descriptors; the same case with absent current-run costs four sources and one new descriptor. Guarded mode reserves none. An absent optional session reserves no source or capture, while its missing descriptor still pays the original descriptor count.

Never assume future payload equality or infer zero demand from current sharing. Preserve eligibility, authority, learning, and other budget precedence; inside headroom, source exhaustion wins before descriptor exhaustion. Keep source-body, aggregate, CLI, graph, error, attestation, and all other existing ceilings unchanged. In particular, the 16-check attestation limit remains 16.

Retire the now-unreachable `model-packet-items` diagnostic producer and closed token. Retain `retained-descriptors` for descriptor demand and add the exact-known-postimage `model-packet-bytes` diagnostic at 131,072 without changing the capacity envelope. Genuine late byte overflow remains the accepted descriptor-only `evidence-incomplete` behavior. Update active readers and guidance as one delivery; closed 061 artifacts remain immutable history.

## Exact Known-Growth Preflight

### Shared byte postimages

Extract only the board's deterministic byte construction into `buildLightweightWorkPostimages`. It must reproduce first-history-heading insertion, exact event append and deduplication, glyph/blocker edits, the exact owner-log append, board rendering, and task-state serialization. Reuse existing pure task operations and serialization rules; use the same explicit values as the writer, with no filesystem read, clock, authority check, or recovery import in the leaf.

The board still acquires and validates owner, target, mapping, source revisions, file preimages, and task state. It remains the sole writer and keeps its existing rollback boundary. Manual, guarded, non-Work, and mirror behavior must remain byte-compatible.

Recovery prediction starts from a private acquisition of complete canonical sources and all accumulated trusted captures **before owner-log truncation**. Substitute only exact known postimages and construct the candidate current-run capture through the same pure `currentRunCapture` helper used by the runner, preserving transport and substantive hashes. Do not patch a truncated Inspection, omit old captures, replace observations with guessed bytes, or use compact frames as acquisition authority.

`prepareProjectionV2` and applicable Lightweight `issueLanePermitV2` checks must measure every known remaining batch prefix and the resulting receipt footprint before returning usable permits. Use the full-set typed context and canonical renderer for each candidate, including maximal whole-event owner-suffix normalization. Unknown later results keep their existing fresh late check. Do not add prediction for unknown tracked postimages.

### Fresh application binding

In `createLaneLedger`, extend the existing local permit entries with one bounded frozen preparation-input capsule and bindings per batch, not a copy per permit. At application, freshly reacquire authoritative sources and rederive preparation/issuance through the existing owners. Require exact agreement with the permit, requested mutation, mapping, source binding, and prestate before `laneOwner.apply`.

This is private adapter memory, not an accepted-state or checkpoint field. Release the bulky capsule when the batch is consumed, superseded, or the adapter ends; retain the existing small replay seal. Add no public `laneApplication.input` shim, new operation, persistent reservation, or session schema. Invalid/default/injected-runtime and missing/indeterminate/observed-effect guards still refuse for their existing reasons.

### Runner order and failure boundary

For `projectEffect`, use this sequence:

1. Build the exact next current-run record privately; do not publish it to the runner's retained stream or `authorityObservation`.
2. Freshly precheck and apply the permit-bound lane mutation through the adapter and lane owner.
3. Publish the **same** staged current-run record.
4. Commit the receipt with new `runtimeInput` containing both updated retained surfaces, then perform existing dual-surface finalization.

Existing `laneApplication` callers do not require the new current-run occurrence before lane application. `validateHostAdapterRequest` and `commitLightweightWorkRequest` must still match fresh lane bytes and the exact permit; `authorityObservation` sees the old current-run until publication. No validator may substitute predicted bytes for observed authority.

Measure the lane-first intermediate specifically. The research prototype measured current-run-first and is not evidence for the new ordering. A crash after the lane write but before current-run publication leaves one-sided evidence, preserves accepted prestate, and grants no new authority. Later failures preserve earlier writes and receipts without claiming whole-operation rollback. This adds neither a transaction across runner memory and canonical files nor automatic retry/recovery; unknown later growth retains the fresh, honest hard stop.

## Research Inputs And Limits

Historical evidence base:
`/Users/eg/.copilot/session-state/6548ab4a-a610-4b77-bce6-4f630599ef4c/files/064-definition-N182DY/`

The following identities are supplied evidence bindings, not hashes recomputed during definition staging:

| Input | SHA-256 |
| --- | --- |
| Amended WHAT approved by the independent Reviewer: `sustained-stage/spec.md` | `6df4e8b72fdb6276cf0e0e053b1fec6d274250668cb34077be9f52b70f28fa8b` |
| Terminal `accounting-measurement/report.json` | `b9d280136b37b594a38aade989dbeef7b1037dd82e75c613d739e7fa666c091d` |
| Terminal `accounting-measurement/result.json` | `421a9a810e94d89d8aac7192af975119c4a1f855db67dd2254fa2691bf70add9` |
| `admission-policy-decision.json` | `b6d9fe7a6407d9838ff6ffd159c4066ef73bb6914d31e175df5e4eba522d7540` |
| `accounting-measurement/field-identities.json` | `fa240f40a6eac6875386909e1fe77d9c59988afdcf6b3cb2c4ee297203c48275` |

`payload-compaction-contract.json` supplies the unchanged factoring/expansion rules. Its old 16-item budget and item-headroom wording are superseded by the admission decision, not silently relabeled as the current policy. The original failed 15 + 3 = 18 proposal, its reports, and its log event stay unchanged.

The terminal research reused the recorded payload cohort with fresh bindings. All sizes below use **`064-payload-1` and the prototype's current-run-first order**:

| Reference stage | Model bytes at captures | Model bytes at current-run-first prefix | Model bytes at complete receipt | Physical / logical | Sources / descriptors |
| --- | ---: | ---: | ---: | --- | --- |
| Frozen current view | 131,013 | n/a | n/a | 13 / 16 | 16 / 17 |
| Specified ordinal 5 episode | 131,053 | 130,878 | 130,241 | 15 / 19 | 19 / 20 |
| Complete-reference ordinal 6 | 130,971 | 130,722 | 130,146 | 15 / 22 | 22 / 23 |
| Complete-reference ordinal 7 | 130,839 | 130,948 | 129,880 | 15 / 25 | 25 / 26 |
| Ordinal 8 first refusal | 131,879 | no event written | no receipt | 15 / 28 | 28 / 29 |

Ordinal 7 is the last admissible complete cycle. Ordinal 8 exceeds model bytes by 807 even with one owner event retained, before either new event write. Its 375,990 aggregate acquisition bytes, 77,433-byte largest source, and 210,155 request bytes are not the controlling limits. The report proves exact expansion, existing normalization, determinism, the structural count bound, and prior dual-surface preservation with equality restored at complete receipts. Literal history and occurrence metadata still grow; bounded total growth and unlimited history are not proved or promised.

The original reference retains all 50 checks (27 passed, 23 failed), four failed attempts across three bases, five finding occurrences, one learning review, and required/reviewed governance events. The new fixture's accepted 16-check frame is a controlled assertion, not a newly executed production verdict. Do not alter original assertions, identities, hashes, chronology, or failed evidence to make an episode pass.

The homogeneous control keeps seven physical items. Correct acquired-source counting includes current-run: `5 + 3*n`, not `4 + 3*n`. Ordinal 19 has 62 sources, 63 descriptors, and a 130,761-byte representation. Ordinal 20 needs 65 sources, so acquisition refuses before normalization; the prior 66-descriptor/136,580-byte projection is counterfactual, not the first reachable refusal. Keep the old report intact with this correction.

For the original overflow control, use `measurement/result-corrected.json` and the exact input identities in `accounting-measurement/field-identities.json`, including the incident's `result-67.json`. The corrected old inline packet measured 159,163 bytes. Keep earlier research details in the idea/proof, not another active proposal.

The production format label is ten UTF-8 bytes longer than the research label. Remeasure **actual emitted bytes and maximal whole-suffix normalization**, including every lane-first prefix; do not simply add ten to historical numbers or treat the research packet hashes as production expectations.

### Portable fixture boundary

In T001, place only required canonical source content, trusted captures, and their hash/length bindings under the future `scripts/fixtures/064-work-receipt-overflow-handling/`. Keep these fixtures out of dev/release bundles. Preserve required evidence bytes; exclude historical supervisor/worker/control/permission tokens and unrelated machine-absolute context. Tests resolve fixtures relative to the repository and use fresh disposable roots, with no dependency on this session path.

The immutable reference proof remains read-only after fixture setup. Integration derives fresh fixture-owned authority and captures through supported boundaries; copying a historical envelope grants no live authority. Full-run/not-run assertions and synthetic fixture checks must remain honestly labeled.

## Verification Plan

| Proof | Existing test owners and acceptance |
| --- | --- |
| Losslessness and deterministic accounting | `src/skills/dude-work/recovery.test.mjs`: reproduce SC-001's baseline, expand the emitted compact view exactly, cover literal/typed/co-role and fallback/refusal cases, full-set review bindings before prefix measurement, payload equality versus near-equality, complete histories, and stable repeat payload demand. |
| Real capacity boundaries | `recovery.test.mjs` and `src/skills/dude-work/specialist-attestation.test.mjs`: SC-003's actual 131,071/131,072/131,073-byte packets; count-admissible 15/16/17 items; independent 63/64/65 source, descriptor, and mandatory-headroom totals; placeholder/absent-current-run/guarded/session controls; source precedence; unchanged 16-check and other equality/first-excess guards. Do not lower limits to reach a test. |
| Writer/predictor equivalence | `src/skills/dude-lightweight-execution/board.test.mjs`, `src/skills/dude-engine/lib/tasks.test.mjs`, and `task-state.test.mjs`: exact postimage bytes for first append, duplicate event, glyph/blocker and owner append, task-state absence/corruption, unchanged unrelated rows, and existing atomic rollback. Test source/prestate drift before application. |
| Supported retention and authority | `src/skills/dude-work/host-adapter.test.mjs` (including its runner coverage), with recovery/attestation suites: SC-002, SC-004, and SC-005 through the actual disposable adapter/runner/lane path. Complete the specified episode and full-reference growth series through first refusal; measure lane-first, both-surface, and receipt prefixes. Cover one-sided crash, stale/replayed permits, missing/forged/conflicting captures, wrong targets, default/injected no-effect controls, and late descriptor-only overflow. Assert fresh reason/subject, exact accepted prestate and prior-write preservation. A negative test must fail for its intended guard. |
| Active contract and distribution | `scripts/current-format-contract.test.mjs`, `scripts/build-dev.test.mjs`, `scripts/build-release.test.mjs`, and `library/packs/beads/skills/dude-pack-beads-workflow/beads.test.mjs`: current limits/diagnostics/guidance agree; the new leaf ships with its consumers; fixtures do not ship; installed Beads still works with its real shared task/recovery imports. No new tracked prediction capability. |

Future commands, **not run during definition**, from an authorized disposable validation copy containing the exact reviewed sources and generated outputs:

```sh
node --test src/skills/dude-work/recovery.test.mjs src/skills/dude-work/host-adapter.test.mjs src/skills/dude-work/specialist-attestation.test.mjs
node --test src/skills/dude-lightweight-execution/board.test.mjs src/skills/dude-engine/lib/tasks.test.mjs src/skills/dude-engine/lib/task-state.test.mjs
node --test scripts/current-format-contract.test.mjs scripts/build-dev.test.mjs scripts/build-release.test.mjs library/packs/beads/skills/dude-pack-beads-workflow/beads.test.mjs
node .github/skills/dude-lint/lint.mjs .
```

Report exact commands, runtime, pass/fail/skip counts, fixture identities, actual sizes, and first-refusal causes. Research counts and test authorship do not substitute for fresh execution or independent acceptance.

## Delivery And Guardrails

T004 owns active guidance and direct-reader alignment, including `src/skills/dude-work/SKILL.md`, applicable `docs/commands.md` guidance, and current-format/build assertions. T001/T002 own runtime changes and their focused regressions; T003 owns the supported end-to-end proof. This avoids duplicate documentation tasks while keeping the final delivered contract coherent.

Generate core only in an explicitly isolated copy. Once `ISOLATED_ROOT` names an authorized disposable repository root, the later execution owner uses:

```sh
(cd "$ISOLATED_ROOT" && node "$ISOLATED_ROOT/scripts/build-dev.mjs" --repo "$ISOLATED_ROOT")
```

Compare and copy back only the explicitly authorized source/generated pairs. Preserve all unrelated dirty files, user overrides, local instructions, pack model choices, and machine-specific paths. Do not run blanket build-dev in the real root or overwrite a local instruction to satisfy CI parity. Validate pristine isolated bundle parity separately from disclosed, preserved local overrides. Pack changes, if required by an actual import, belong in `library/packs/` and are validated through disposable composition, never by editing installed pack projections. No UI rebuild, dependency addition, Git action, or release is part of this plan's authority.

Existing guardrails suffice; none are proposed. The new leaf has two current callers and removes writer/predictor duplication. The encoder is private, the inverse is test-only, and retained preparation memory is bounded and released. Capacity acceptance is functional behavior, so this plan contains no ObjectiveRegistry or new evaluation flow. No additional supporting artifacts are needed.

Material risks remain: the frozen packet has little byte headroom; the longer production label and lane-first intermediate need fresh measurements; source races invalidate predictions; and complete literal histories still reach finite ceilings. The mitigations are the one renderer, exact shared postimages, fresh application binding, and the required boundary/retention tests, not a wider allowance or deletion policy.

## Phases And Traceability

| Phase | Canonical task | Spec trace | Exit evidence |
| --- | --- | --- | --- |
| Foundational representation and fixture setup | `T001@c064a71e` | US1–US3; FR-001–FR-007, FR-009–FR-011; SC-001–SC-003 | Exact emitted-view inverse, descriptor-backed counts, real boundaries, portable reference fixture. |
| Known-growth integration | `T002@c064b82f` | US1, US3; FR-001, FR-004, FR-008–FR-012; SC-004, SC-005 | Shared postimage parity, complete-prefix preflight, fresh permit binding, lane-first unit regressions. |
| Supported episode and refusal proof | `T003@c064c930` | US1–US3; FR-002–FR-012; SC-001–SC-005 | Actual adapter/runner complete-reference series, first genuine refusal, crash/no-effect/authority controls. |
| Polish and delivery integration | `T004@c064da41` | FR-012; SC-003, SC-005 | Current guidance/readers, authorized generated pairs, build/installed-consumer parity, fresh final verification. |

All four tasks are serial because their write sets and verification depend on the preceding slice. Definition ends with independent whole-package review and coordinator lint/publication. No task is complete, no real 062 state is repaired, and no later execution request is implied.
