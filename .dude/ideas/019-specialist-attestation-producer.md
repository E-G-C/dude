---
title: Specialist Attestation Producer
slug: specialist-attestation-producer
status: defined
spec_path: .dude/specs/019-specialist-attestation-producer/spec.md
---

# Idea: Specialist Attestation Producer

## Idea

Fix the missing production producer for Feature 009 trusted verification and review captures so autonomous Work and Ship do not require coordinator self-attestation.

Keep the correction pragmatic and simple. Preserve the existing envelope and capture schema for compatibility where practical, but describe it honestly as cooperative, coordinator-recorded specialist attestation rather than cryptographic proof. Do not add cryptographic signing, key management, an authority registry, an external service, an identity service, a transcript parser, editor integration, a daemon, a database, a new lane, or a new workflow.

Add one small production builder or boundary. After real specialist dispatch, it receives the actual Tester or Reviewer result supplied by the host or coordinator, derives all identities internally, and emits the trusted verification or review captures needed by the existing runtime. Callers must not supply envelope identities, authority identities, invocation identities, check outcomes, verdicts, findings, or chronology as arbitrary pre-computed identity fields.

The builder must preserve the complete semantic set of the specialist's check definitions, findings, and subjects and every row's exact semantic fields, including the real verdict and check outcomes. It must emit those set-like collections in the canonical order required by the existing validators rather than preserve input order. It must reject every duplicate check definition, finding, or subject, including a byte-identical duplicate, and never silently drop or deduplicate one. It must refuse malformed, incomplete, or mismatched results, must not upgrade or omit semantics during transformation, and must reject separately supplied semantic overrides. It must not claim to defeat a malicious coordinator; pre-boundary rewriting of the sole result is outside the cooperative guarantee, and that limitation must be explicit.

Integrate the builder into ordinary autonomous Work so the coordinator no longer selects low-level capture or finalize routes and no throwaway driver is needed. Preserve guarded Work behavior, existing Feature 009 and Feature 018 runtime semantics, envelope validators, lane permits and receipts, the review independence workflow, and all safety, budget, and ownership boundaries.

Corrective scope includes focused tests, prompt and static contract updates, the generated projection, concise documentation only if needed, and end-to-end autonomous close acceptance using actual specialist results.

Feature 018 T004 is blocked pending this producer. Feature 017 T001 and T002 may proceed guarded. Feature 017 T003 and actual Ship acceptance remain blocked until this correction is complete.

## Open Questions

No clarification is needed for brainstorm capture.

## Assumptions

- Feature 009's existing capture consumers, envelope schema, validators, and runtime semantics are the compatibility baseline; the missing production producer is the corrective target.
- The sole admitted structured Tester or Reviewer result is the semantic source. The boundary preserves the complete semantic set of checks, findings, and subjects and every row's exact semantic fields while applying the canonical ordering required by existing validators; it rejects every duplicate, including a byte-identical duplicate, rather than silently dropping or deduplicating it.
- Host integration owns acquisition of that result from real specialist dispatch, derives authoritative context from accepted host state, and threads the exact verification capture it just built into review construction; ordinary callers cannot select a different capture.
- Trust is cooperative and coordinator-recorded. A different otherwise-valid sole result is a different cooperative assertion; detecting or defeating a malicious coordinator, including detecting a malicious or pre-boundary rewrite of that sole result, is explicitly out of scope.
- The stated Feature 017 and Feature 018 task dependencies remain current until this correction is completed or those owning features are explicitly reconciled.

<!-- dude:managed:start -->
## Normalized Intent

- Add one small production boundary that converts the sole structured Tester or Reviewer result acquired from real specialist dispatch into the trusted verification and review captures already consumed by the runtime.
- Derive envelope, authority, invocation, and related identities inside the boundary from authoritative context accepted by host integration rather than accepting arbitrary pre-computed identity fields from callers.
- Treat that sole result as the semantic source: preserve the complete semantic set of check definitions, findings, and subjects and every row's exact semantic fields without upgrade or omission; apply the canonical ordering required by existing validators rather than preserving input order; reject every duplicate, including a byte-identical duplicate, instead of silently dropping or deduplicating it; and reject separately supplied semantic overrides, context mismatches, malformed data, and behavior-bearing containers.
- Integrate the boundary into ordinary autonomous Work through host-owned acquisition and context derivation, and thread the exact verification capture it just built into review construction. Ordinary callers must not select a different capture or low-level capture or finalize route, and no throwaway driver should be required.
- Keep the existing capture and envelope schema where practical, while naming the guarantee accurately as cooperative coordinator-recorded specialist attestation rather than cryptographic proof. A different otherwise-valid sole result is a different cooperative assertion; detecting a malicious or pre-boundary rewrite of that sole source is outside this guarantee.
- Prove the correction with focused tests and end-to-end autonomous close acceptance using actual specialist results, plus the necessary prompt, static contract, generated projection, and concise documentation updates.

## Constraints

- Do not add cryptographic signing, key management, an authority registry, an external service, an identity service, a transcript parser, editor integration, a daemon, a database, a new lane, or a new workflow.
- Admit only the sole structured Tester or Reviewer result as the semantic source. Preserve complete check, finding, and subject sets with exact row semantics under existing canonical ordering, and reject every duplicate row or subject, including byte-identical duplicates, without silent deduplication. Reject separately supplied semantic overrides, pre-computed envelope, authority, or invocation identities, context mismatches, malformed data, and behavior-bearing containers; do not accept check outcomes, verdicts, findings, or chronology through separate caller fields.
- Do not claim protection from a malicious coordinator. A different otherwise-valid sole result is a different cooperative assertion, and pre-boundary rewriting of that sole result is outside the cooperative guarantee.
- Host integration owns real-dispatch acquisition, accepted authoritative context, and exact verification-to-review threading; ordinary callers cannot choose a different capture.
- Preserve guarded Work behavior, Feature 009 and Feature 018 runtime semantics, envelope validators, lane permits and receipts, review independence, and every existing safety, budget, and ownership boundary.
- Keep Feature 018 T004 blocked pending this producer. Allow Feature 017 T001 and T002 to proceed only under guarded behavior; keep Feature 017 T003 and actual Ship acceptance blocked until the correction is complete.
- Keep the correction bounded and pragmatic; add no broader trust architecture or workflow machinery.
- This action is brainstorm intake only. Do not create a definition package, implementation, task-state change, or generated board.

## Definition Checklist

- [x] Corrective outcome and missing production boundary are clear
- [x] Complete semantic-set and exact row-field preservation, canonical ordering, universal duplicate refusal, override and hostile-container refusal, cooperative trust limit, and non-goals are explicit
- [x] Compatibility, integration, acceptance, and cross-feature constraints are captured
- [x] No clarification is required for brainstorm capture

## Coordinator Log

- 2026-08-03 UTC - brainstorm captured for the missing Feature 009 specialist-attestation production boundary
- 2026-08-03 UTC - definition created at .dude/specs/019-specialist-attestation-producer/spec.md with three canonical tasks
- 2026-08-03T20:32:44Z - Guarded Lightweight execution started T001@70726f64: implement the closed production specialist-attestation builder and focused semantic-preservation and refusal matrix. Guarded execution is required because the missing autonomous trusted-source producer cannot authorize its own correction.
- 2026-08-03T21:39:40Z - Work blocked T001@70726f64 (spec-gap). Tester FAIL and Code Reviewer REJECT: the first definition required detection of a malicious rewrite to the sole admitted specialist-result source while also excluding signatures, an authority registry, and malicious-coordinator protection. Architecture confirmed that requirement is impossible under cooperative attestation. Accepted implementation defect: behavior-bearing array prototypes can rewrite semantic rows. Required resolution: explicit brainstorm clarification and define; preserve the sole structured specialist result exactly, reject separate overrides and hostile containers, and let host integration own actual dispatch acquisition and exact verification threading.
- 2026-08-03 UTC - brainstorm clarified sole-result semantic preservation, host-owned context and capture threading, override and hostile-container refusal, and the pre-boundary cooperative-trust limit
- 2026-08-03 UTC - definition redefined around exact sole-result preservation, hostile-container refusal, host-owned dispatch acquisition, and exact verification threading
- 2026-08-03T21:56:59Z - execution reconciliation after explicit redefinition: kept T001@70726f64, T002@696e7467, and T003@76616c69 as one-to-one task identities; cleared T001's resolved spec-gap blocker and returned it to open; retained T002 and T003 open with unchanged dependencies; regenerated the board and snapshot. Prior failed implementation and review evidence remains history only.
- 2026-08-03T22:32:38Z - Work blocked T001@70726f64 (contract-mismatch). Tester FAIL and Code Reviewer REJECT: Feature 019's redefined sequence-preservation wording conflicts with Feature 009's required sorted duplicate-free check and finding schemas. Existing code silently deduplicates exact checks and sorts checks, findings, and subjects. Resolution: explicit brainstorm clarification and define; preserve the complete semantic set under canonical ordering, refuse every duplicate instead of dropping it, and add focused cycle and extra-key array refusal fixtures.
- 2026-08-03 UTC - brainstorm clarified complete check, finding, and subject set preservation with exact row semantics, required canonical ordering, and refusal of every duplicate including byte-identical duplicates
- 2026-08-03 UTC - definition refreshed for canonical semantic-set preservation, exact row fields, universal duplicate refusal, and focused cycle and extra-key-array verification while retaining all three task identities for coordinator reconciliation
- 2026-08-03T22:40:53Z - execution reconciliation after explicit definition refresh: kept all three task identities and dependencies; cleared T001's resolved ordering-contract blocker and returned it to open; retained T002 and T003 open; regenerated the board and snapshot. Prior rejected evidence remains history only.
<!-- dude:managed:end -->
- 2026-08-03T23:14:05Z - Guarded Work closed T001@70726f64: `src/skills/dude-work/specialist-attestation.mjs` builds verification and independent-review captures from one exact structured specialist result, derives every identity and hash internally, refuses separate caller overrides and duplicate checks/subjects/findings, and bounds hostile containers without recursion. Two review rejections fixed: duplicate findings are keyed by normalized basis, and the recursive prewalk was replaced with the existing depth/entry bound. Evidence: focused 34/34, lint 0/0, whitespace clean, Tester PASS with 12/12 mutations killed, Code Reviewer APPROVE.
- 2026-08-03T23:14:05Z - Guarded Work started T002@696e7467: integrate the builder into autonomous `record-attempt-result` so the host acquires captures from the real specialist result instead of caller-authored envelopes.
- 2026-08-03T23:52:10Z - Guarded Work closed T002@696e7467: autonomous `record-attempt-result` now builds trusted captures from the sole dispatched Tester and Reviewer results through `buildSpecialistAttestation`; target, attempt, source revision, dispatch, and chronology derive from accepted host state, and ordinary requests can no longer supply identities, overrides, capture streams, or low-level routes. Review rejection fixed: a pending `reconcile-derived-definition` attempt now hard-stops with the truthful `definition-reconciliation-attestation-unsupported` before any capture instead of a false `learning-governance-conflict`, and the failed-verification path gained live coverage. Evidence: focused 648/648, full suite 2198 tests 2194 pass 0 fail, parity, lint 0/0, Tester PASS, Code Reviewer APPROVE.
- 2026-08-03T23:52:10Z - Recorded T002 follow-ups: (D1) autonomous authorize-attempt still grants a `reconcile-derived-definition` row whose completion the boundary always refuses, so the refusal would be cheaper at authorize time; (D2) the SKILL.md limitation sentence does not mention that authorization may still be granted; (D3) disposition precedence between a failed verification and a rejected review remains unpinned in recovery.mjs.
- 2026-08-03T23:52:10Z - Guarded Work started T003@76616c69: full acceptance over the integrated Feature 019 revision.
- 2026-08-04T00:18:40Z - Guarded Work closed T003@76616c69: Feature 019 acceptance complete. One end-to-end autonomous Lightweight close runs from sole structured Tester and Reviewer results through the production builder and the ordinary adapter with no throwaway driver, and separate overrides, precomputed identities, malformed or inconsistent records, unknown fields, hostile containers, ordinary-request capture selection, low-level routes, and context mismatches all refuse before trusted capture. A different otherwise-valid sole result is treated as a different cooperative assertion with no rewrite-detection claim. Evidence: focused 648/648, full suite 2198 tests 2194 pass 0 fail, mutation sweep 21 with 20 killed and 1 proven equivalent, generated parity, lint 0/0, compose 16/16, pristine release 57 files with no test files shipped, whitespace clean, Tester PASS, Code Reviewer APPROVE.
- 2026-08-04T00:18:40Z - Recorded Feature 019 follow-ups: autonomous authorize-attempt still grants a `reconcile-derived-definition` row whose completion always refuses, so refusing at authorize time would avoid charging the budget; disposition precedence between a failed verification and a rejected review remains unpinned in recovery.mjs; the duplicate-finding rule is deliberately stricter than Feature 009 and should stay that way; an unreachable defensive findingIdentity branch may be removed. Cross-feature state confirmed: Feature 018 T004 remains `[!]`, and the Feature 017 package is unmutated with T003 still `[ ]` behind unmet dependencies rather than a blocked glyph.
