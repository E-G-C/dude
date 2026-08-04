# Feature Specification: Specialist Attestation Producer

## Purpose

Autonomous Work already consumes trusted verification and independent-review captures, but ordinary production orchestration has no supported way to create those captures from the actual Tester and Reviewer results returned by real specialist dispatch. Tests can construct compatible captures directly, which leaves production callers able to depend on precomputed identity-bearing data rather than the specialist result that the capture is meant to record.

This feature adds one small production attestation boundary. Host integration owns acquisition of the sole admitted structured Tester or Reviewer result from real specialist dispatch and supplies the authoritative target, attempt, source-revision, dispatch, and chronology context. The boundary treats that result as the exclusive semantic source, preserves the complete semantic sets of check definitions, findings, and subjects and every row's exact semantic fields while transforming them into the existing trusted capture shape, and derives only the identities required by that shape. It emits set-like collections in the canonical order required by the existing validators rather than preserving input order. It refuses every duplicate check definition, finding, or subject, including a byte-identical duplicate, instead of silently dropping or deduplicating it, as well as separate semantic overrides, caller-precomputed identities, malformed, incomplete, internally inconsistent, context-mismatched, cyclic, extra-key, or behavior-bearing data.

The guarantee is deliberately limited: the resulting record is cooperative, coordinator-recorded specialist attestation. It records that host integration supplied one structurally valid, context-matched sole result to the production boundary. A different otherwise-valid sole result is a different cooperative assertion. The boundary does not detect a malicious or pre-boundary rewrite of that result, and it is not cryptographic proof or protection against a malicious coordinator.

The correction integrates through the ordinary Work host adapter and preserves the existing trusted-capture consumers and validators, guarded behavior, lane permits and receipts, review independence, safety rules, budgets, ownership, and current Feature 009 and Feature 018 semantics. It adds no source-byte or source-hash authenticity mechanism, trust architecture, lane, workflow, store, or state surface.

## User Stories & Testing

### User Story 1 - Capture actual Tester outcomes (Priority: P1)

As a user of autonomous Work, I want the real Tester result converted into the trusted verification capture so that completion evidence records the checks the Tester actually ran and their actual outcomes.

**Independent Test**: Have host integration acquire complete Tester results for one authorized attempt in valid noncanonical orders, pass each sole result and the authoritative dispatch context through the production boundary, and verify that the existing trusted-capture consumer accepts a canonically ordered capture preserving the complete check set and every row's exact semantic fields. Exercise equal and conflicting duplicate check definitions separately and verify refusal without silent deduplication.

**Acceptance Scenarios**:

1. **Given** host integration has acquired one complete structured Tester result from a real dispatch and holds the authoritative target, attempt, source revision, dispatch, and chronology context, **When** it invokes the attestation boundary, **Then** the boundary derives the required capture identities internally and emits one verification capture accepted by the existing consumer.
2. **Given** the sole Tester result contains a complete duplicate-free set of passing and failing checks in any valid input order, **When** the capture is produced, **Then** every check definition and every row's exact outcome, evidence reference, and other semantic field is preserved without omission, replacement, coercion, or upgrade, and the complete set is emitted in the canonical order required by the existing validators.
3. **Given** a Tester result containing any duplicate check definition, whether byte-identical or conflicting, **When** capture is requested, **Then** the request is refused rather than silently dropping, deduplicating, or selecting a row.
4. **Given** a malformed, incomplete, internally inconsistent, unknown-field, cyclic, extra-key-array, or behavior-bearing Tester result, **When** capture is requested, **Then** the request is refused and no trusted verification capture or completion authority is produced.
5. **Given** a result whose target, attempt, source revision, dispatch, or chronology facts differ from the authoritative host context, **When** capture is requested, **Then** the request is refused.
6. **Given** a separate semantic override or caller-supplied precomputed envelope, authority, invocation, check, result, or chronology identity, **When** capture is requested, **Then** the request is refused even if the supplied value appears internally consistent.
7. **Given** two different otherwise-valid sole Tester results for otherwise valid host contexts, **When** each is transformed, **Then** each is treated as its own cooperative assertion rather than one being classified as a detectable rewrite of the other.

### User Story 2 - Capture actual independent-review verdict and findings (Priority: P1)

As a user of autonomous Work, I want the real independent Reviewer result converted into the trusted review capture so that acceptance and rejection retain the Reviewer's actual verdict and complete findings.

**Independent Test**: Have host integration acquire an independent Reviewer result after verification, exercise accepted and rejected results with findings and subjects in valid noncanonical orders, and verify that review construction preserves the complete finding and subject sets and every row's exact semantic fields under required canonical ordering while binding the result to the exact verification capture previously returned by the builder. Exercise every duplicate finding and subject form, including byte-identical duplicates, and verify refusal without silent deduplication.

**Acceptance Scenarios**:

1. **Given** host integration acquired a sole independent-review result returning acceptance with no findings, **When** it passes that result, authoritative review context, and the exact prior builder-produced verification capture to review construction, **Then** the boundary emits one accepted review capture bound to that verification capture.
2. **Given** the sole independent-review result returns rejection with a complete duplicate-free finding set whose subjects and findings are in any valid input order, **When** the review capture is produced, **Then** the exact verdict, complete finding and subject sets, and every row's exact observation, evidence, check-result binding, and other semantic field are preserved, with set-like collections emitted in the canonical order required by the existing validators.
3. **Given** any duplicate finding or duplicate subject, including a byte-identical duplicate, **When** capture is requested, **Then** the request is refused rather than silently dropping, deduplicating, or selecting an entry.
4. **Given** an accepted result carrying findings, a rejected result with no findings, or any malformed, incomplete, internally inconsistent, unknown-field, cyclic, extra-key-array, or behavior-bearing review result, **When** capture is requested, **Then** the request is refused.
5. **Given** a review result or authoritative host context for another target, attempt, source revision, reviewer dispatch, or chronology position, **When** capture is requested, **Then** the request is refused; an ordinary request has no field with which to choose or substitute a verification capture.
6. **Given** a separate verdict or finding override or a caller-supplied precomputed reviewer-authority, review-invocation, finding, result, or chronology identity, **When** capture is requested, **Then** the request is refused and no review authority is produced.

### User Story 3 - Close autonomous Work through the ordinary host boundary (Priority: P1)

As a user of autonomous Work, I want ordinary orchestration to use actual specialist results without selecting low-level capture or finalize routes so that a valid task can close through the existing permit and receipt path.

**Independent Test**: Run one autonomous Lightweight task through authorization, real Tester and independent Reviewer dispatch, production attestation, existing capture consumption, projection, finalization, lane permit, lane receipt, and close; verify complete semantic-set preservation under required canonical ordering, and prove that every duplicate check definition, finding, and subject, separate semantic overrides, precomputed identities, caller-selected verification captures, and caller-selected low-level routes are refused before close authority exists.

**Acceptance Scenarios**:

1. **Given** one authorized autonomous attempt, **When** host integration acquires the sole Tester and independent Reviewer results from their actual dispatches, derives the authoritative context, and records them, **Then** it invokes the production attestation boundary, passes the exact prior builder-produced verification capture into review construction, and completes the existing trusted capture, projection, finalization, permit, receipt, and close sequence without caller-selected low-level routes or verification capture.
2. **Given** a failed check or rejected review in the sole admitted result, **When** ordinary Work records the result, **Then** that failure or rejection and every associated semantic row field reach existing recovery or learning governance unchanged apart from validator-required canonical set ordering.
3. **Given** guarded Work, existing Feature 009 validation, or existing Feature 018 host continuity behavior, **When** the new boundary is present, **Then** established behavior and authority remain unchanged outside the new autonomous actual-result input path.
4. **Given** any duplicate check definition, finding, or subject, including a byte-identical duplicate, or a separate semantic override, caller-precomputed identity, malformed or incomplete result, context mismatch, cyclic or extra-key array, behavior-bearing container, caller-selected verification capture, or caller-selected low-level route, **When** ordinary Work records the result, **Then** no trusted capture, completion, permit, receipt, or close is authorized and no duplicate is silently dropped or deduplicated.

## Edge Cases

- The sole result contains complete duplicate-free check, finding, or subject sets in a valid noncanonical input order; transformation emits the validator-required canonical order while preserving every member and every row's exact semantic fields.
- Two check rows identify the same check definition with byte-identical or conflicting fields; both forms are refused without selecting, dropping, or deduplicating a row.
- Two finding rows are duplicates, including when their bytes and semantic fields are identical; the result is refused rather than normalized to one finding.
- One finding repeats a subject, including a byte-identical subject value; the result is refused rather than normalized to one subject.
- A result is internally inconsistent, such as a passing summary with a failed check, or is structurally incomplete, such as a required check or finding row without its outcome or observation.
- The Tester result is complete but belongs to another target, attempt, source revision, or dispatch.
- The source revision changes between specialist dispatch and result recording.
- The same result is replayed for another attempt or chronology position.
- An accepted review contains one or more findings.
- A rejected review contains no findings or omits one returned finding.
- A review finding references a check that is absent from the bound verification result.
- An ordinary request supplies or selects a different otherwise-valid verification capture; the request is refused because verification selection is not an admitted request field, while host integration threads the exact prior builder output.
- A separate override attempts to change a failed check to passed, replace a rejected verdict, alter finding severity or substance, or drop a finding.
- A caller supplies any precomputed identity-bearing envelope, authority, invocation, check, verdict, finding, result, or chronology field.
- A specialist result contains unknown fields, a cycle, an array with an extra own key, or inherited, accessor, executable, or other behavior-bearing containers instead of inert structured data.
- A different otherwise-valid sole result reaches the boundary; it represents a different cooperative assertion, and no pre-boundary source-authenticity comparison is attempted.
- A valid specialist result reaches guarded Work or a non-Work path that does not use autonomous trusted completion.
- Capture construction succeeds but an existing downstream validator, projection, permit, receipt, ownership, safety, review-independence, or budget gate refuses.

## Functional Requirements

- **FR-001:** Ordinary autonomous Work MUST have exactly one production attestation boundary that converts actual Tester and independent Reviewer result records from real specialist dispatch into the trusted verification and review captures already consumed by the runtime.
- **FR-002:** The boundary MUST accept only one closed, inert structured specialist-result record plus host-owned authoritative dispatch and attempt context. It MUST derive the identities required by the existing capture shape internally and MUST refuse caller-supplied precomputed values for any identity-bearing field.
- **FR-003:** The sole admitted structured Tester or Reviewer result MUST be the exclusive semantic source. Transformation MUST preserve the complete semantic sets of check definitions, findings, and subjects and every row's exact semantic fields, including outcomes, evidence references, verdict, and observation bindings, without omission, replacement, coercion, or upgrade. It MUST emit set-like collections in the canonical order required by the existing validators and MUST NOT promise or preserve input order. The boundary MUST refuse separate semantic overrides and MUST NOT compare the sole result with an unavailable second source or claim to detect a different otherwise-valid sole result as a rewrite.
- **FR-004:** The boundary MUST refuse every duplicate check definition, finding, and subject, including byte-identical duplicates, and MUST NOT silently drop, deduplicate, or select among duplicates. It MUST also refuse malformed, incomplete, internally inconsistent, unknown-field, cyclic, extra-key-array, behavior-bearing, or context-mismatched data. Context matching MUST cover the host-owned target, authorized attempt, dispatch source, source revision, reviewer independence, and chronology; replay is refused when those authoritative facts do not match.
- **FR-005:** The boundary MUST emit captures compatible with the current trusted-capture and envelope schemas where practical and MUST pass the existing validators before a capture becomes available to a consumer. Existing consumers and validators MUST remain the final schema and semantic authority rather than being duplicated or weakened.
- **FR-006:** Ordinary Work MUST invoke the boundary through the existing high-level host adapter. Host integration MUST own acquisition of each sole result from actual specialist dispatch and the authoritative target, attempt, source-revision, dispatch, and chronology context. For review construction it MUST pass the exact verification capture previously returned by the builder. The coordinator or other ordinary caller MUST NOT provide or select a verification capture or select low-level capture, finalize, projection, permit, receipt, or close routes.
- **FR-007:** A failed Tester outcome or rejected Reviewer verdict MUST flow unchanged into existing recovery or learning governance. Successful attestation alone MUST NOT authorize completion, lane mutation, or close; all existing projection, finalization, permit, receipt, ownership, safety, budget, and review-independence gates remain required.
- **FR-008:** The feature MUST preserve guarded and non-Work behavior and current Feature 009 and Feature 018 runtime semantics. It MUST create no new lane, workflow, command, state surface, persistent store, ledger, authority registry, or alternate review path.
- **FR-009:** Product and user-facing contracts MUST describe the guarantee as cooperative, coordinator-recorded specialist attestation and MUST NOT claim cryptographic provenance or protection against a malicious coordinator.
- **FR-010:** Acceptance MUST include one end-to-end autonomous close using sole Tester and Reviewer result records acquired by host integration from actual dispatch, host-owned authoritative context, and exact prior verification-output threading into review. Negative proof MUST show refusal of separate semantic overrides, caller-precomputed identities, malformed or incomplete records, behavior-bearing containers, context mismatches, caller-selected verification captures, and caller-selected low-level routes before close authority exists. Acceptance MUST NOT claim detection of a malicious or pre-boundary rewrite of an otherwise-valid sole result.
- **FR-011:** Definition and implementation of this feature MUST NOT mutate Feature 017 or Feature 018 execution state. Feature 018 T004 and Feature 017 T003 remain blocked until this feature is independently accepted and their owning packages are reconciled by the coordinator.

## Key Entities

- **Specialist Dispatch Context**: The authoritative target, attempt, source revision, resolved specialist role, dispatch occurrence, and ordering facts owned by host integration for one real Tester or Reviewer dispatch. It contains context facts, not caller-precomputed capture identities.
- **Actual Specialist Result Record**: The sole closed, inert structured result that host integration acquires from the dispatched Tester or Reviewer: complete check definitions, outcomes, and evidence for verification, or the verdict and complete findings for review. It is the exclusive semantic source for transformation.
- **Specialist Attestation Boundary**: The single production boundary that validates the host-owned dispatch context and sole result, preserves the result's semantics, derives the identities required by the compatible capture, and requires existing validator acceptance before returning it.
- **Cooperative Specialist Attestation**: A coordinator-recorded assertion that host integration supplied one structurally valid, context-matched sole specialist result to the boundary. A different otherwise-valid result is a different assertion; this is neither a signature nor protection against pre-boundary rewriting or a malicious coordinator.
- **Trusted Verification Capture**: The existing consumer-compatible capture containing a verification envelope derived from one actual Tester result.
- **Trusted Independent-Review Capture**: The existing consumer-compatible capture containing an independent-review envelope derived from one actual Reviewer result and bound verification capture.

## Success Criteria

- **SC-001:** In 100% of valid Tester fixtures covering passing, failing, and mixed complete duplicate-free check sets in canonical and noncanonical input orders, the producer emits a capture accepted by the existing validators, preserves the complete check set and every row's exact semantic fields, and emits validator-required canonical ordering without promising input-order preservation.
- **SC-002:** In 100% of valid accepted and rejected Reviewer fixtures with duplicate-free findings and subjects in canonical and noncanonical input orders, the producer emits a capture accepted by the existing validators and preserves the exact verdict, complete finding and subject sets, and every row's exact semantic fields under validator-required canonical ordering; rejected findings remain rejected evidence and accepted reviews contain no findings.
- **SC-003:** In 100% of negative fixtures for duplicate check definitions, findings, and subjects, including byte-identical duplicates, separate semantic overrides, precomputed identity fields, malformed or incomplete records, internal inconsistencies, unknown fields, cycles, arrays with extra own keys, behavior-bearing containers, caller-selected verification captures, caller-selected low-level routes, replay across mismatched context, and target, attempt, dispatch, chronology, or source-revision mismatch, the responsible boundary refuses without silent dropping or deduplication and before producing trusted capture, completion, permit, receipt, or close authority. No fixture treats a different otherwise-valid sole result as a detectable rewrite.
- **SC-004:** At least one production-path autonomous Lightweight acceptance fixture closes through the ordinary host adapter using actual Tester and independent Reviewer result records, with zero caller-selected low-level capture, finalize, projection, permit, receipt, or close routes.
- **SC-005:** All established guarded, Feature 009 trusted-capture and governance, Feature 018 host-adapter continuity, lane permit and receipt, ownership, safety, budget, and independent-review regression checks pass unchanged.
- **SC-006:** Acceptance introduces zero source-byte or source-hash authenticity mechanisms, signing or key mechanisms, authority registries, external or identity services, transcript parsers, editor integrations, daemons, databases, new state surfaces, lanes, workflows, stores, or ledgers, and all product wording states the cooperative trust limitation.
- **SC-007:** Full bundle validation passes and fresh independent Tester and Code Reviewer evidence approves the same unchanged implementation revision with no unresolved finding.

## Assumptions

- Feature 009's existing capture consumers, envelope schema, validators, and runtime semantics remain the compatibility baseline.
- Feature 018's high-level Work host adapter remains the sole ordinary runtime integration boundary.
- Host integration acquires the sole Tester or Reviewer result from real specialist dispatch and owns the corresponding authoritative target, attempt, source-revision, dispatch, and chronology context.
- Host integration retains and passes the exact verification capture returned by the builder into review construction; no ordinary request chooses that capture.
- The result record can carry complete semantic checks, verdict, findings, and evidence without requiring a transcript parser.
- Trust is cooperative and coordinator-recorded; detecting or defeating a malicious coordinator is outside the guarantee.
- Existing projection, permit, receipt, review-independence, ownership, safety, and budget authorities remain sufficient once a valid capture exists.
- Feature 018 T004 and Feature 017 T003 remain blocked until this correction is accepted and the coordinator explicitly reconciles those owning packages.

## Out of Scope

- Cryptographic signing, signatures, keys, certificates, or key management.
- An authority registry, external service, identity service, or remote attestation system.
- Detecting, deterring, or proving misconduct by a malicious coordinator.
- Detecting a malicious or pre-boundary rewrite by comparing the sole result with another source, or treating a different otherwise-valid sole result as anything other than a different cooperative assertion.
- Source-byte snapshots, source-result hashes, or compare-and-hash machinery presented as proof of pre-boundary authenticity.
- Parsing free-form specialist transcripts or inferring missing result fields from prose.
- Editor integration, a daemon, a database, or another persistent service.
- A new command, execution lane, workflow, policy, store, ledger, board, or task-state surface.
- Replacing or redesigning Feature 009 capture schemas, consumers, validators, governance, permits, receipts, or audits.
- Replacing or redesigning Feature 018 host continuity, checkpointing, worker handoff, or refusal semantics.
- Changing guarded Work, review independence, safety boundaries, budgets, ownership, or lane authority.
- Mutating or reconciling Feature 017 or Feature 018 tasks, blockers, history, or execution state.
- Ship-specific routing, a throwaway driver, or direct low-level runtime orchestration.
