# Feature Specification: Technical Docs Pack Remediation

## Purpose

Remediate the independently rejected `technical-docs` prototype into one materially ready library pack. Readiness requires correction of every accepted review finding through observable behavior and fresh evidence, not description-only changes or suppressed checks.

The pack must preserve diverse-source documentation workflows, fail-closed traceability, deterministic runtime accounting, safe repository handling, fresh final verification, and lifecycle readiness. A repository is a first-class source, but it is not required or exclusive.

## User Stories & Testing

### User Story 1: Traceable Multi-Source Intake (Priority: P1)

As a technical documentation producer, I can use transcripts, notes, drafts, repositories, existing Markdown documents, or mixed inputs without losing source identity or provenance.

**Independent Test:** Process each supported source mode with known evidence and verify that every admitted source unit remains distinguishable and traceable through extraction and the final document.

**Acceptance Scenarios:**

1. **Transcript-only:** Given a transcript and no repository, when documentation is produced, then transcript evidence retains its source reference and supports a traceable final document.
2. **Repository-only:** Given a repository and no prose source, when documentation is produced in a fresh workspace, then every encountered repository path is accounted for and all admitted files produce deterministic repository evidence.
3. **Mixed-source:** Given repository content, a transcript, notes, and a draft, when evidence is combined, then each source kind remains distinguishable and no provenance is replaced by an untraceable combined source.
4. **Existing-document update:** Given an existing Markdown document and supporting evidence, when the document is updated, then existing-document evidence retains its heading provenance and every substantive change is traceable to admitted evidence.

### User Story 2: Fail-Closed Deterministic Runtime (Priority: P1)

As a documentation workflow operator, I receive deterministic accounting and explicit failure whenever inputs, paths, evidence, limits, or outputs cannot be processed safely and completely.

**Independent Test:** Run the same valid fixture repeatedly and compare deterministic runtime results, then run malformed, unreadable, escaping, aliased, duplicate, and incomplete fixtures and verify that each fails without authorizing or partially replacing output.

**Acceptance Scenarios:**

1. Given identical admitted inputs and configuration, repeated processing produces identical repository accounting, source identities, ordering, and validation outcomes.
2. Given malformed or empty evidence, missing required provenance, or duplicate identities, processing fails and no completeness gate passes.
3. Given missing or unreadable input, an outside-root or symlink-escaping path, input/output aliasing, or an incomplete bounded scan, processing fails without silent omission.
4. Given valid WEBVTT, Unicode, Markdown, decision, and action fixtures, source text is preserved and each routable item reaches its intended destination exactly once.

### User Story 3: Freshly Verified Pack Readiness (Priority: P2)

As a pack maintainer, I can establish readiness from fresh post-review evidence across standalone operation, optional writing integration, installation, removal, testing, lint, release validation, and independent approval.

**Independent Test:** Exercise the pack both without and with the optional writing pack, perform install and removal checks, mutate an artifact after review, and verify that finalization remains blocked until all affected gates are rerun and an independent reviewer approves the resulting evidence.

**Acceptance Scenarios:**

1. Given no writing pack, the technical-docs pack completes every supported source mode using its local baseline guidance.
2. Given the writing pack, technical-docs may use its current style guidance without changing the standalone contract or requiring a sibling-pack dependency schema.
3. Given a reviewer mutation after an earlier passing gate, stale evidence cannot authorize finalization and all affected gates must be refreshed.
4. Given passing focused and full tests, lifecycle checks, lint, release verification, and fresh final gates, an independent reviewer can approve the pack based on reproducible evidence.

## Edge Cases

- Evidence is empty, malformed, not a valid evidence record, or lacks required identity or provenance.
- Source, source-unit, evidence, decision, or action identities are duplicated.
- An input is missing, unreadable initially, or becomes unreadable during processing.
- A declared entry point or encountered symlink resolves outside the admitted repository root.
- An input and output resolve to the same location, or prior output would be rediscovered as input.
- A traversal or read reaches its declared bound before complete accounting.
- Different source kinds have identical names or content but must retain separate identities.
- Existing-document sections have repeated or nested headings that still require unambiguous provenance.
- A reviewer changes an artifact after earlier gate evidence was produced.
- The optional writing pack is absent, present, installed later, or removed.
- Valid WEBVTT cue text begins with `NOTE`, `STYLE`, or `REGION`.
- A non-BMP Unicode character occurs at or near a chunk or overlap boundary.
- Markdown contains mismatched, insufficient, or unclosed fences, or headings containing `C#`.
- A decision or action appears repeatedly or resembles another identity but must route exactly once.
- A fresh output destination has no existing parent location.
- A processing limit or threshold is malformed or unsupported.
- Pack prose references a stale or unavailable skill identity.

## Functional Requirements

- **FR-001:** The pack MUST support transcript-only, repository-only, mixed-source, and existing-document update modes, including notes and drafts as admitted source kinds.
- **FR-002:** Every admitted source MUST retain a distinguishable source kind and stable source reference throughout processing.
- **FR-003:** Source units from different sources or source kinds MUST remain separately attributable and MUST NOT be collapsed into untraceable combined input.
- **FR-004:** `C*`, `E*`, and `R*` evidence identities MUST retain their applicable source kind and source reference through extraction, merge, review, and final traceability.
- **FR-005:** Existing-document evidence MUST retain sufficient heading provenance to locate and distinguish its originating section.
- **FR-006:** Every substantive final-document claim or change MUST be traceable to admitted evidence without fabricated support.
- **FR-007:** Repository intake MUST produce a complete accounting of every encountered path as admitted, skipped, or rejected with an explicit reason.
- **FR-008:** Every ordinary source file admitted by repository policy MUST appear in repository accounting and MUST NOT disappear silently.
- **FR-009:** Repository source units, `R*` identities, and ordering MUST be deterministic for identical admitted inputs and configuration.
- **FR-010:** Repository processing MUST remain read-only and contained within the admitted root; outside-root paths, escaping symlinks, and escaping entry points MUST fail closed.
- **FR-011:** A bounded repository scan MUST report whether accounting is complete, and an incomplete scan MUST NOT pass an intake or completeness gate.
- **FR-012:** Missing or unreadable inputs MUST fail closed and MUST NOT be silently omitted.
- **FR-013:** Repository-only processing in a fresh workspace MUST safely produce contained output without requiring a pre-existing destination parent.
- **FR-014:** Inputs and outputs MUST NOT alias, and generated or prior output MUST NOT be re-ingested as an implicit input.
- **FR-015:** Evidence input MUST contain only valid evidence records with required identity and provenance; malformed records MUST fail closed.
- **FR-016:** An empty evidence set or a gate that consumed no admissible evidence MUST NOT produce a passing completeness or coverage result.
- **FR-017:** Duplicate source, source-unit, evidence, decision, or action identities MUST fail before merge or final authorization.
- **FR-018:** Evidence merge MUST reject malformed, unreadable, aliased, or self-referential inputs rather than silently skipping them.
- **FR-019:** User-supplied processing limits and thresholds MUST be validated before dependent work begins, and invalid values MUST fail closed.
- **FR-020:** Reads and traversal MUST remain within declared bounds, and reaching a bound before completion MUST be reported as incomplete.
- **FR-021:** Persisted outputs MUST be atomic so that failure leaves no partial replacement and preserves any prior valid output.
- **FR-022:** Identical inputs and configuration MUST produce identical deterministic runtime accounting, identities, ordering, gate decisions, and machine-produced artifacts.
- **FR-023:** WEBVTT intake MUST preserve valid cue text beginning with `NOTE`, `STYLE`, or `REGION` while still recognizing actual reserved blocks.
- **FR-024:** Chunking MUST keep content and overlap within the applicable budget and MUST preserve non-BMP Unicode characters intact.
- **FR-025:** Markdown extraction MUST distinguish actual fenced content from mismatched or unclosed fences and MUST preserve valid headings containing `C#`.
- **FR-026:** Every admitted decision and action identity MUST route to its intended outline destination exactly once, with neither omission nor duplication.
- **FR-027:** Final authorization MUST follow this ordered evidence contract: intake and extraction completeness, strict merge, recall and completeness, planning and exact-once outline coverage, drafting, semantic review, final coverage and lint, then safe finalization.
- **FR-028:** Every gate result MUST identify the exact inputs and artifacts it evaluated and MUST be unusable after those inputs or artifacts change.
- **FR-029:** Reviewer or workflow mutations MUST invalidate affected earlier evidence and MUST require fresh execution of every affected downstream gate.
- **FR-030:** Finalization MUST occur only when all required gates are current and passing, and it MUST preserve containment and atomicity.
- **FR-031:** The pack MUST remain fully functional without the writing pack and MAY use its current guidance when present without making it required.
- **FR-032:** Pack instructions and handoffs MUST use current, resolvable skill identities and consistent optional-writing language.
- **FR-033:** The public surface MUST remain 5 agents, 7 skills, and 2 prompts unless separately accepted evidence narrowly justifies a specification amendment.
- **FR-034:** The pack MUST preserve its namespace, zero-fabrication traceability, coordinator-owned workflow boundaries, and independent approval boundary.
- **FR-035:** Focused automated tests MUST cover each accepted runtime, parsing, provenance, accounting, freshness, and routing defect.
- **FR-036:** End-to-end verification MUST cover transcript-only, repository-only, mixed-source, and existing-document update modes.
- **FR-037:** Composition verification MUST cover both standalone technical-docs operation and operation with the optional writing pack present.
- **FR-038:** Installation and removal verification MUST prove that the pack is added completely and removed without residual pack-owned artifacts or references.
- **FR-039:** Readiness evidence MUST include passing focused tests, the full repository test suite, pack composition checks, lint, and release-artifact verification.
- **FR-040:** The pack MUST receive fresh independent approval after all readiness evidence is produced, and any later mutation MUST invalidate that approval.

## Key Entities

- **Source:** A declared origin of documentation evidence, such as a transcript, note, draft, repository, or existing document, with a stable kind and reference.
- **Source Unit:** A bounded, independently traceable portion of a source that preserves its parent source, identity, and ordering context.
- **Evidence Entry:** An admissible unit of support with a unique identity and enough provenance to trace it back to a source unit.
- **Repository Accounting Result:** The complete outcome of repository intake, distinguishing admitted, skipped, and rejected paths and stating whether traversal completed safely.
- **Extraction Result:** The evidence and diagnostics produced from admitted source units, including completeness and provenance outcomes.
- **Gate Evidence:** A passing or failing verification result bound to the exact inputs, artifacts, and review state it evaluated.
- **Final Document:** The safely finalized documentation output whose substantive content is traceable to evidence and authorized only by current passing gates.

## Success Criteria

- **SC-001:** Across accepted fixtures, zero admitted source units disappear silently; every encountered repository path and every admitted non-repository source is represented or has an explicit disposition.
- **SC-002:** Transcript-only, repository-only from a fresh workspace, mixed-source, and existing-document update acceptance suites all pass.
- **SC-003:** Every malformed, empty, duplicate, missing, or unreadable-input fixture fails closed without a passing completeness result or authorized output.
- **SC-004:** Every outside-root, symlink-escape, entry-point escape, and input/output-alias fixture is rejected with no read or write outside the admitted boundary.
- **SC-005:** Repeated valid runs produce identical deterministic runtime results, while injected failures leave prior valid output unchanged and create no partial output.
- **SC-006:** Regression fixtures for WEBVTT reserved-word cue text, non-BMP Unicode, chunk budgets, fence mismatches, `C#` headings, and decision/action routing all pass without content loss, duplication, or misrouting.
- **SC-007:** A post-review mutation makes affected gate evidence unusable, blocks finalization, and is accepted only after all affected gates produce fresh passing evidence.
- **SC-008:** Standalone and writing-enabled composition checks both pass, with equivalent core capability and no required sibling-pack dependency contract.
- **SC-009:** Installation adds the complete pack surface and removal leaves no pack-owned artifacts or stale references.
- **SC-010:** All focused regression tests and the full repository test suite pass without failures.
- **SC-011:** A pristine core-only release build and lint of that pristine release complete without failures; in a separate disposable copy of the pristine release, installing technical-docs from the catalog yields its complete intended installed surface, and removing it leaves zero pack-owned artifacts or stale references.
- **SC-012:** An independent reviewer approves the complete fresh evidence set with no unresolved rejection finding.
- **SC-013:** Unless separately amended from accepted evidence, pack inspection reports exactly 5 agents, 7 skills, and 2 prompts under the intended namespace.

## Assumptions

- The technical-docs pack is unreleased and has no demonstrated consumer requiring compatibility or migration.
- Prototype work artifacts may be regenerated rather than silently normalized or migrated.
- The baseline public surface is 5 agents, 7 skills, and 2 prompts unless evidence narrowly justifies a separately accepted change.
- The accepted review findings are authoritative problem evidence but do not prescribe implementation mechanics.
- Node runtime choices and pack implementation mechanics belong in planning, not this specification.

## Out of Scope

- Legacy compatibility or migration without evidence of a real current consumer.
- A required sibling-pack dependency schema for optional writing integration.
- Broad refactoring outside the technical-docs pack and its focused external verification.
- Any weakening of traceability, source provenance, namespace rules, coordinator-owned boundaries, or independent approval.
- Release publication, tag creation, branch creation, or commit creation.
- Changes to Feature 006 or any unrelated idea, specification, task state, or implementation.
