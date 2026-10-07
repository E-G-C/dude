# Implementation Plan: Work Readable Evidence Handoff

Owner: `.dude/ideas/074-work-readable-evidence-handoff.md`  
Spec path: `.dude/specs/074-work-readable-evidence-handoff/spec.md`

## Current Release-Maintenance Retirement

The user's literal chat direction at `2026-10-06T20:32:52.137-04:00` permits the minimal retirement below instead of rescuing unsupported historical recovery scenarios. It supersedes future keep-failing-tests directions for these five cases in section 5 and the completed T004/T005 acceptance lists. The original implementation plan below remains the record of completed Feature074 work; its other contracts and historical acceptance evidence are unchanged.

Only these cases in `src/skills/dude-work/host-adapter.test.mjs` may be retired:

| Diagnosis ID | Exact source test name |
| --- | --- |
| G1 | `Feature 064 T003: full reference reaches natural settlement through the terminal receipt` |
| G2 | `Feature 064 T003: a misbound full-reference terminal receipt preserves governed authority` |
| G3 | `Feature 064 T003: premature ordinal-6 authorization remains a separate governance negative` |
| G4 | `Feature 065 T002 SC003: complete failed episode refuses direct re-review without changing the sealed successor` |
| G5 | `Feature 065 T002 SC003: separate complete failed episode refuses supported resume without changing the sealed successor` |

The retained release diagnosis confirms that each composite stops at history-only learning admission before its later oracle. Current no-rewind admission is correct. The user withdraws those composites' unique unsupported-path, later-oracle, and golden-measurement requirements from future CI. Their recorded failures and unreached measurements remain historical, unverified evidence; retirement supplies no equal-or-stronger coverage claim.

The later Code owner may remove these declarations and their exclusively unused private test glue in the same source test file. Check remaining callers before deleting `runT003FullReferenceCase`, `runFeature065FailedEpisode`, or any supporting function. Shared helpers stay, including helpers used by surviving cross-invocation, accounting, inverse, or admission controls. Add no replacement tests, harness, recovery route, state, timer, or production change.

Keep `reference.json`, `retention-episode.json`, and `retained-incident.json` immutable, together with their hash pins, complete historical captures, and the existing inverse. Retain all other source tests, including the `Work recovery admission:` controls, `Feature 064 T003: the production runner cannot settle after a misbound terminal receipt`, and `cross-invocation retention conflicts: exact captures, dual surfaces and one-use receipts remain required`. These existing tests cover their actual current admission, terminal-receipt, retention, and replay boundaries; they do not certify the retired full-history composite oracles. No-rewind, learning, permit, receipt, capacity, and other runtime guards remain unchanged.

After independent review and coordinator application of this definition stage, perform the separately authorized test-only maintenance and run the existing applicable CI commands. Report actual pass/fail/skip counts and the five retired names separately; never count retirement as a pass or skip. Keep all other required checks and the existing independent verification and review gates. This amendment itself reports no CI-green result.

The five completed canonical task units, keys, glyphs, metadata, board, and execution history remain unchanged. Retirement is current release maintenance, not a new Feature074 task or retroactive completion. Do not reopen or redefine 064/065, alter schemas or resource policies, or generate runtime outputs for this test-only change. No new guardrail candidate or human clarification is needed. The author read back the amended spec before staging this plan; independent stage review and coordinator zero-failure lint are still required.

## Chosen Design

Keep the existing trusted captures and authority contracts. Add exact semantic preimages as substantive readable records beside newly built captures. For historical hash-only captures, admit a separate attachment-only stream entry that references the exact original capture and its original substantive stream hash. Never put a duplicate old capture in the new entry.

Use the existing `retainedEvidence` transport, source collection, envelope validators, and single model renderer for both paths. The only new input contract is the closed substantive-record variant defined in `contracts/schemas.md`; the runner root and challenge-response fields do not expand. The current production consumer is Work learning review.

This follows the established supplemental-record pattern: preserve an immutable original and validate a separately identified addition against it. Presentation is unsuitable because `normalizeSourceRecord` drops it and hashing excludes it. Replacing an old stream changes history; resubmitting `[oldCapture, text]` alongside it trips the trusted-capture duplicate gate. A loader, archive service, second ledger, or new state machine is unnecessary.

## Technical Context

| Field | Decision |
| --- | --- |
| Language/Version | Dependency-free JavaScript ESM, Node.js 20+, JSDoc with `@ts-check`; Markdown for active guidance. |
| Primary Dependencies | Existing specialist attestation, recovery, host adapter/runner, task and exact-owner readers, model-view helpers, and Node built-ins. No new package. |
| Storage | Original host-retained capture inputs plus the existing invocation's evidence arrays. No workspace store, checkpoint field, RunState field, registry, or additional ledger. |
| Testing | Existing `node:test` suites; a small synthetic immutable hash-only fixture; the existing independent model-view inverse; disposable runner/CLI and lane fixtures. |
| Target Platform | Existing supported Windows, macOS, and Linux Node host environments. Do not expand the Lightweight runner into a tracked runner. Recovery's existing canonical tracked inputs retain their current support. |
| Project Type | Reusable core runtime with generated dogfood projection. Authoritative edits are in `src/`; tests/fixtures and docs retain their existing owners. |
| Performance Goals | Bounded validation over existing source and row limits; indexed exact capture lookup and one shared rendering path. No latency promise or optimization objective. |
| Constraints | 64 sources, 64 descriptors, 131072 model bytes, 16 raw checks, and every other current bound. Complete raw history stays authoritative; only the existing owner-log whole-event suffix may omit text. No UI or visual design work. |

## Author Spec Gate And Guardrails

The Spec Lead wrote and read back `spec.md`, then recorded its author assessment before staging this plan or tasks. The WHAT/WHY gate is satisfied: three prioritized independent scenarios, FR-001 through FR-020, measurable SC-001 through SC-007, edge cases, entities, scope, and evidence limits are present. No implementation format or module is prescribed in the spec, and no clarification marker remains.

This is not independent approval or lint evidence. The coordinator's publication/lint and independent Reviewer verdict remain outstanding.

Existing project guardrails cover deterministic validation, smallest applicable design, source/generated ownership, privacy, independent review, and coordinator authority. No new guardrail candidate is proposed or adopted. There is no UI approval gate, additional checklist artifact, or ObjectiveRegistry: this feature has contract acceptance, not a compiled progress-optimization objective.

## Source Findings And Reuse

| Existing surface | Observed responsibility and planned use |
| --- | --- |
| `src/skills/dude-work/specialist-attestation.mjs` | `verificationChecks`, `findingBasis`, and `reviewFindings` derive semantic identities and canonical row order. `trustedCapture` retains only the envelope. Reuse these exact validations and mappings to return the lost preimages too. |
| `src/skills/dude-work/host-adapter.mjs` | `specialistAttestation` derives context from the accepted pending attempt and threads its exact verification capture into review. `trustedCaptureStream` currently emits only that capture. Extend the stream contents, not ordinary result fields or context authority. |
| `src/skills/dude-work/recovery.mjs` | `normalizeCaptureStream` verifies the substantive outer outcome; `normalizeSourceRecord` removes presentation. Add closed readable validation before deduplication and model use, retaining all old source rules. |
| Same recovery module | Reuse `normalizeVerificationEnvelopeV2`, `normalizeIndependentReviewEnvelopeV2`, `trustedSourceCaptureIdentityV2`, the trusted-envelope index, and retained occurrence authority. These establish existing bindings; supplemental text establishes none independently. |
| Same recovery module | `modelPayloadContext` currently types exactly one canonical capture record. Extend only the two new admitted carrier forms. `packetProjection`, Inspection build/validation, `modelPacket`, suffix selection, and known-postimage prediction continue using one renderer. |
| `src/skills/dude-work/host-adapter-runner.mjs` | Closed `retainedEvidence` already reaches initial inspection and every `runtimeInput`; original arrays remain separate from new observations. Preserve that path and pre-ownership validation. Do not add a root input field or exchange kind. |
| Runner and recovery admission | The current runner restores retained required learning with `resume-learning` before Assessment/authorization. `inspectRetainedOccurrencesV2` validates dual retention and trusted evidence. Preserve this accepted fix, incident-supersession validation, and chronology based on lane history rather than delivery order. |
| `scripts/fixtures/064-work-receipt-overflow-handling/model-view-test-helpers.mjs` | Extend `expandModelPacket` and reuse accounting/fixture helpers. No production decoder or separate test harness is needed. |
| `scripts/build-release.mjs` | Reuse `listCoreOutputs` and `writeCoreOutput` for an explicit changed-core allowlist. Do not invoke root-wide build-dev cleanup in the dirty checkout. |

The related exact ledgers named by the owner, including 009, 019, 060, 064, and 065, provide contract continuity only. Their definitions and histories are not write targets or newly inferred dependencies.

## 1. Shared Validation And Model Representation

`contracts/schemas.md` is the normative field, matching, refusal, and expansion contract. Implement its small shared validators in `recovery.mjs`, beside the existing capture/envelope logic. Move the producer's unchanged semantic-identity calculation into `specialistSemanticIdentityV1` in recovery, which the producer already imports. Update that producer import in the same slice. Do not introduce a reverse import or a generic hashing service.

Use the existing closed-data validation and resource charging. Check raw check/finding arrays and semantic string lengths before mapping or sorting. Require complete one-to-one row coverage in canonical envelope order. For verification, compare definition and evidence identities and the check identity including its outcome. For review, compare expectation kind/reference, check definition, and observed-evidence identity, or resolve the exact check-result observation through the bound verification. Preserve subjects, failure class, verdict, and all envelope fields.

Reject identical duplicates, conflicting duplicates, extra/missing rows, malformed reserved types, orphan text, wrong kinds, and changed text. Do not accept a recognized malformed record as an opaque literal. Unrelated old record shapes retain their existing behavior. Validate reserved types before wrong-target filtering or evidence deduplication can hide a bad supplemental input.

Prepare an immutable full-set readable context alongside the current trusted-payload context. Reuse or narrowly factor the existing trusted index, not a second authority reader. Run the new checks when readable records are present; do not impose new predicates on otherwise unchanged hash-only inputs. The same validation must cover collected inputs and direct Inspection/model entry points.

The existing typed verification/review payload gains optional `text`. A frame with `capture` describes an original capture; a new frame with `reference` instead describes an attachment. Its payload and binding come from the referenced validated envelope. This mutually exclusive frame shape makes later admission visible without a new item tag or persisted provenance record.

Use typed rendering for valid readable carriers so reviewers see text beside decoded check/finding identities. Keep legacy min-size/literal selection unchanged when text is absent. Payload sharing compares complete canonical payload bytes including text; no hash-only equality, similarity, empty default text, or text-only interning is allowed. An old capture remains a separate original occurrence even when its supplement needs another model item.

Extend the test-owned inverse to restore fresh `[capture, text]` and historical attachment-only bodies, then verify every descriptor and the referenced original capture. Preserve the existing current-run event references into literal task history. The final packet must contain its own original captures and bindings; prefix-measurement context cannot become an uncounted external source.

## 2. Fresh Production Capture

Add one adapter-used builder export, `buildSpecialistAttestationWithText`, returning `{capture, text}` from the same closed `{kind, context, result}` input as the existing builder. Keep `buildSpecialistAttestation`'s capture-only return and exact bytes compatible. Share the validated construction work instead of independently recomputing two semantic transformations.

Map actual result rows to their derived check/finding identities, reject duplicates before indexing, and emit preimages in the envelope's order. The text record retains only actual result fields, not model annotations or a reconstructed summary. Emit an empty review-text finding array for accepted empty reviews.

In `specialistAttestation`, use the new export for the Tester, pass that exact returned capture to review construction, and use the new export for the Reviewer. Extend `trustedCaptureStream` to carry the matching text as its second substantive record. Lint remains the same complete Tester stream under the existing co-role rule.

Do not change host-derived target, source revision, result material, dispatch facts, chronology, trusted completion, or the ordinary ApproachBasis arrays. `prepareSpecialistResult` remains pure preflight and the receiver repeats validation. Invalid result handling retains its current no-effect/correction eligibility, not a new retry.

The outer source outcome hash changes because it now covers text; the trusted capture and inner envelope do not change for the same input. The runner's existing observed-stream retention then carries the whole new entry into later inspections and host-retained raw inputs.

## 3. Historical Input Before The Learning Exchange

The supported supplier is the coordinator/host that already has original runtime capture inputs and actual readable preimages. It forms the attachment-only entries described in the schema and appends them to the matching supplied `retainedEvidence` source array. It supplies no path to discover, replacement context, capture copy, or asserted match flag.

The host must supply these entries in the initial request of a separately authorized invocation. Initial `runCommand('inspect', ...)` performs raw accounting and readable binding checks before `createHostAdapter`. After that, the existing retained-occurrence preflight establishes applicability to the selected target's real retained approaches and findings. Keep the originals' transport bytes, ordering, and multiplicity unchanged; snapshot only after validation.

At every later `runtimeInput`, retain the original prefix and its supplemental entries unchanged beside the invocation's separately growing live current-run capture and observations. A caller can mutate neither the retained snapshot nor the evidence behind an outstanding challenge. Current `record-attempt-result` still rejects caller-selected trusted captures and only builds the current pending attempt's actual pair.

The matching sequence is fixed:

1. Resolve the unique referenced original source/capture pair by its substantive source hash and full capture identity.
2. Validate source kind, target, state, capture bytes, and the existing v2 envelope.
3. Resolve a review's exact verification and all cross-envelope bindings.
4. Match every readable preimage under the raw limits.
5. At retained-history admission, require that capture's existing occurrence/authority relationship. Reuse the history preflight; do not require dual retention globally during legitimate later lane-first prefixes.

Only after the usual adapter admission and fresh inspection may the existing runner restore required learning. The `learning-review` challenge then carries `modelPacket(currentInspection)` and the existing target, state, attempt, governance, and request bindings over those same inputs. New attachments cannot be returned through `HostAdapterChallengeResponse`, patched into that challenge, or sent as a second packet.

No historical source loader is added. If the host lacks an original capture or a preimage, the requested semantic admission is unavailable. A wholly absent supplement leaves the original hash-only packet compatible; a malformed or partial submitted supplement refuses. Complete text for one capture does not certify another capture or both failed approaches. Work guidance keeps the learning decision unresolved when needed meanings are unavailable, using existing stop/cancel behavior rather than a new coverage state or synthesized decision.

## 4. Failure, Capacity, And Trust Boundaries

Preserve all earlier exact-owner, lane, authority, source, and capacity gates. Use the schema's refusal order inside readable admission. Reuse `evidence-incomplete`, the current evidence statuses, the existing `occurrence-retention` blocker, and runtime-owned capacity diagnostics. Sanitize runner details to fixed categories and source classes; no new reason namespace or leaked rejected text.

Fresh text increases its existing source bodies. Each historical attachment costs one new source and original descriptor before sharing. Count all metadata, including references and derived model bindings. Retain completion headroom for future captures; do not assume their text or payload will match something already present.

All suffix and postimage calculations must see the same complete source set and renderer. Preserve 131072-byte fit and 131073-byte refusal, with no model call on overflow. If admission fits but later unpredictable evidence does not, keep the existing late refusal and every earlier effect/receipt; do not claim rollback of already applied work.

Readable data can contain sensitive text or hostile instructions. Do not execute it or treat it as permission. Limit it to the current approved evidence/model boundary; add no diagnostics, logs, or memory copies of the content. If a preimage cannot be supplied within current disclosure authority, report it unavailable rather than redact it into a supposedly matching value.

Hash correspondence is not authenticity. This cooperative host boundary cannot prove that a malicious coordinator obtained the text from the claimed specialist or source file. No key, signature, authority registry, transcript parser, or pre-boundary spoof-proof promise belongs here.

Neither readable entry path changes what ordinary alternatives can express. `mechanismIdentities`, `assumptionIdentities`, `evidenceAcquisitionIdentities`, and `validationPlanIdentities` in the original ordinary ApproachBasis remain empty. Definition-reconciliation attestation remains separately unsupported by this ordinary producer.

## 5. Verification

These are proposed implementation checks, not executed results. Keep synthetic semantic data separate from read-only historical compatibility fixtures.

| Proof | Required cases and observers |
| --- | --- |
| Local text contract | Existing specialist and recovery suites: complete canonical and shuffled producer inputs; receiver reordered rows; identical/conflicting duplicates; missing/extra rows; 16/17 raw rows; 16384/16385 semantic bytes; Unicode/escaping; forbidden extra fields and hostile containers. Each negative must fail at its intended guard. |
| Fresh production path | Actual builder -> adapter `record-attempt-result` -> host-observed complete capture inputs -> newly authorized disposable runner with `retainedEvidence` -> bound learning-review challenge. Two failed attempts retain every readable field. Test both review observation kinds and accepted empty review. Cancel the synthetic challenge rather than claim real learning acceptance. |
| Historical path | A small frozen synthetic hash-only pair at `scripts/fixtures/074-work-readable-evidence-handoff/hash-only-pair.json`, with known preimages and byte/hash assertions. Keep originals immutable. Valid attachment-only entries reach the same learning boundary; changing only a preimage must fail even after recomputing the outer transport hash. |
| Historical negatives | Missing original, missing readable bytes, partial rows, duplicate/equal/conflicting attachment, text already present, wrong kind/target/attempt/source/review, wrong referenced capture, unavailable bound verification, unsupported envelope, attachment chain, presentation-only text, and path/URL/match-flag substitutes. Partial coverage across attempts stays explicitly insufficient for a two-approach decision. |
| Integrity and model view | Existing inverse expands old, fresh, historical, mixed, shared, unshared, verification/lint, and history-bearing views exactly. Verify text/identity correspondence, frame provenance, every descriptor, and stable occurrence order. No literal fallback may hide a recognized bad readable record. |
| Capacity | Actual emitted 131072/131073-byte packets, with other bounds noncontrolling; independent 63/64/65 sources and descriptors; body, aggregate, request, and graph controls. Charge duplicates before refusal/sharing. Include attachments, all frame metadata, allowed owner suffix changes, and lane-first/receipt predictions. |
| Admission-fix compatibility | Preserve the accepted eight-file direct fix. Prove `resume-learning` occurs before Assessment, authorization, or charges; required learning restores with zero charges and no pending attempt. Keep valid incident-supersession, old T003 round-trip proof, wrong/partial history refusals, and lane-history chronology with reused local ordinals. No production identity is hard-coded. |
| Existing 064/065 behavior | Preserve immutable assets, exact hash-only bytes and inverse checks, and intended refusal reasons. Apply only the separate exceptions below: the frozen Feature064 full-reference fresh-resume path and the two exact Feature065 SC003 setup/reachability failures. Keep actual failures visible and unreached checks unverified. Other receipt/settlement checks remain required where admission permits them; remeasure only changed values actually reached. |
| Authority and delivery | Guarded and tracked controls; no learning, permit, state, or close authority from text; response-envelope rejection of late supplements; all source/generated pairs; fixtures excluded from bundles; independent Tester evidence and Reviewer judgment. |

### Legacy Full-Reference Acceptance Exception

The supplied compatibility assessment identifies one preexisting conflict: Feature064's frozen full-reference fixture includes a `learning-review` and required/reviewed governance history, but its fresh `derive-required`/resume request supplies no accepted learning state. The accepted no-rewind admission fix refuses this as `governance-unresolved`. For Feature074 only, the obsolete requirement that this path reach `learning-result:settled` at 113798 bytes and then full settlement is outside acceptance; its existing test remains a documented known baseline failure.

The initial 107680-byte read-only model measurement remains legitimate and required. The 113798-byte step is not reached on this path; later expected values 121813, 123557, and 123564, and the pre-terminal identities, are unreached and unmeasured. Keep the test, assertions, immutable fixture, and original history intact. Do not turn the failure into a pass or skip, delete the test, change its terminal result, inject required learning or old RunState, alter admission, or invent replacement measurements or a replacement recovery scenario.

This exception covers no new regression and is not a blanket exception for 064/065. Feature074's fresh and historical functional acceptance, exact legacy hash-only bytes and inverse, 131072/131073-byte boundary, 64 source and descriptor limits, actual permitted required-learning restoration, and fresh independent review all remain required.

Related cases involving only the same frozen Feature064 reference require named baseline proof. A named test qualifies only when fresh verification against the pre-readable baseline demonstrates the same preexisting cause: fresh resume of this frozen already-reviewed history without accepted learning state. Until then, report it as unverified; preserve any observed failure and do not infer acceptance from similarity. The existing comparison cited below establishes four Feature064 failures within this unchanged boundary.

### Feature065 Retained-Incident Acceptance Exception

For Feature074's shipping gate only, these two tests in `src/skills/dude-work/host-adapter.test.mjs` have a separate exception for their unsupported learning-resume setup/reachability requirement:

- `Feature 065 T002 SC003: complete failed episode refuses direct re-review without changing the sealed successor`
- `Feature 065 T002 SC003: separate complete failed episode refuses supported resume without changing the sealed successor`

Both use the separate immutable `scripts/fixtures/065-work-history-event-compaction/retained-incident.json`, SHA-256 `1800d8860abf55038087c6d8dc9b1657379c57f8796de6df76686164185ac88b`. This is not the frozen Feature064 full-reference fixture. The existing current and pre-readable baseline records show both fail in the shared `resume-learning` setup at `derive-governance: governance-unresolved`, with actual `hard-stop` rather than expected `accepted`. Both stop before their intended later negatives; `continuation` and `refusalProof` remain null. Neither later negative has been verified.

This exception covers only that proven setup/reachability failure in those two exact cases. It covers no changed cause or new regression, other Feature065 case, or extra Feature064 case. Keep the tests, assertions, fixture bytes, and failures intact; do not relabel failures as passes or skips. The exception grants no permission to alter no-rewind admission, inject accepted learning or old RunState to force either setup through, invent a replacement recovery scenario, or report fabricated measurements. Permitted required-learning restoration and all new readable-path, raw 16-check, 64-source/64-descriptor, 131072/131073-byte, hash-only/inverse, provenance/trust, independent-review, and close obligations remain required. Neither exception covers the separate Feature060 T001 test-only correction in section 6.

### Acceptance Evidence And Reporting

The retained T004 evidence under the session's `ship-074-delivery-20260926/T004/` directory supplies this classification: `revision-1/verification/verification.json`, `revision-1/verification/21-baseline-classification.stdout.log` and `21-baseline-classification.result.json`, `verification-initial/05-baseline-provenance-check.json`, and `revision-1/review.json`. These are existing records, not checks or review performed by this definition.

The sole Tester result remains 14 checks: 12 passed and 2 failed. The source suites report 780 passed, 0 failed, and 2 skipped; host/board reports 431 passed, 6 failed, and 3 skipped. The comparison confirms the same six failure names and causes against the integrity-verified pre-readable baseline of 97 files and 6913595 bytes: four Feature064 failures qualifying under the unchanged exception and the two Feature065 setup failures above. This classification does not turn any of the six failures into passing or skipped tests.

On separately authorized acceptance, run all required suites and exercise the verification matrix. Report full actual pass/fail/skip counts, including excepted failures, then classify only the exact established exceptions separately. Preserve the actual failure cause and mark every unreached later check or measurement unverified; similarity or preexistence alone is insufficient. Every unexcepted obligation and any new or changed-cause failure requires fresh proof. Existing records do not replace that verification or the independent review and close gates.

The motivating T019 case is not a test source to replay. Known candidate original result files cover at most post-v2; neither approach-wide availability nor matching for both failures is established. Mock two-approach fixtures prove the capability and honest failure only. Preserve all actual T019 records and obligations.

## 6. Source And Generated Delivery

Expected authoritative runtime/guidance paths:

```text
src/skills/dude-work/recovery.mjs
src/skills/dude-work/specialist-attestation.mjs
src/skills/dude-work/host-adapter.mjs
src/skills/dude-work/host-adapter-runner.mjs
src/skills/dude-work/SKILL.md
```

Tests and documentation:

```text
src/skills/dude-work/recovery.test.mjs
src/skills/dude-work/specialist-attestation.test.mjs
src/skills/dude-work/host-adapter.test.mjs
scripts/fixtures/064-work-receipt-overflow-handling/model-view-test-helpers.mjs
scripts/fixtures/074-work-readable-evidence-handoff/hash-only-pair.json
scripts/current-format-contract.test.mjs
docs/commands.md
```

Update only Work's existing inspection, specialist-result, and retained-input guidance. Pin the semantic obligations with focused section-based static assertions and deletion falsifiers, not a new document or broad instruction rewrite.

The separate Feature060 T001 host-adapter oracle correction remains test-only work in T004, outside this exception. Preserve its original missing-verification check with valid legacy capture-only companions and a positive legacy control; add a fresh-readable missing-verification case expecting the earlier invalid-review refusal, as required by schema section 5. Keep the no-runtime, no-checkpoint, and unchanged-state assertions, and verify each guard's deletion falsifier in scratch. No production change is authorized for that correction.

Future authorized verification sequence:

1. Preserve the dirty-work baseline and accepted admission fix. Do not attribute unrelated edits to this feature or reset them.
2. Run source tests before projection:

   ```text
   node --test --test-reporter=tap src/skills/dude-work/specialist-attestation.test.mjs src/skills/dude-work/recovery.test.mjs
   node --test --test-reporter=tap src/skills/dude-work/host-adapter.test.mjs src/skills/dude-lightweight-execution/board.test.mjs
   ```

3. Generate only the five matching `.github/skills/dude-work/` paths through `listCoreOutputs` filtered to the explicit allowlist and `writeCoreOutput`. Validate the selected source/output correspondence before writing. Do not call full `buildDev` cleanup in this checkout or carry agent-model, profile, pack, Canvas, or machine-local changes.
4. Run the relevant current-format, build-dev, and build-release tests using their disposable fixtures or an authorized isolated validation copy. Check exact selected parity and exclusion of test assets. Do not publish a release.
5. Return actual commands, runtime, pass/fail/skip counts, byte measurements, unchanged-fixture proof, and limits to the coordinator. The coordinator runs `node .github/skills/dude-lint/lint.mjs .` and routes independent review. No self-approval or task-state mutation belongs to a specialist.

No implementation writes to `.dude/`, other feature packages, memory, guardrails, models, profiles, boards, or tracked state are included. Any needed scope change returns through the existing owner rather than widening the write set.

## Phases And Traceability

| Task | Slice | Spec coverage |
| --- | --- | --- |
| `T001@d074a101` | Shared readable validation, model contract, inverse, and local refusal/budget proofs | FR-003 through FR-005, FR-009 through FR-018; SC-003 through SC-006 |
| `T002@d074b202` | Fresh sole-result producer and adapter retention through the learning boundary | US1; FR-001 through FR-005, FR-009, FR-010, FR-015, FR-018 through FR-020; SC-001, SC-005, SC-006 |
| `T003@d074c303` | Historical retained-input admission, exact reference/applicability, and immutable fixture integration | US2/US3; FR-006 through FR-014, FR-016 through FR-020; SC-002 through SC-007 |
| `T004@d074d404` | Concise active guidance, scoped generated delivery, and delivery contracts | All stories; FR-010, FR-012 through FR-020; SC-005, SC-007 |
| `T005@d074e505` | Independent complete acceptance and read-only review | FR-001 through FR-020; SC-001 through SC-007 |

The slices are serial: shared validation precedes producer integration; historical integration uses that representation and the production capture fixture; guidance/projection follows the complete contract; independent acceptance judges the integrated delivery. Lifecycle number 074 supplies no priority or execution order.

## Remaining Risks

- Preimage availability is external to this feature. It cannot promise recovery of a particular incident's meaning.
- Added readable facts and binding metadata can exhaust finite budgets sooner. Correct refusal is required; unlimited fit is not promised.
- The model-view frame extension and raw-before-dedup validation need exact inverse and public-path proofs, not helper-only passing tests.
- A version-skewed older runtime may retain new records literally but cannot validate historical admission. Deliver the changed readers and writers together; do not fall back or migrate old evidence.
- The checkout contains unrelated work and accepted fixes. Scoped generation and preservation checks are mandatory; root cleanup is not a remedy for unrelated drift.

No outcome-changing clarification or implementation-critical design alternative is left open. Execution, test results, actual incident availability, coordinator lint, and independent readiness remain unestablished by this definition.
