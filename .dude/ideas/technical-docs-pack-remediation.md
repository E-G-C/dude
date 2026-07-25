---
title: Technical Docs Pack Remediation
slug: technical-docs-pack-remediation
status: defined
spec_path: .dude/specs/007-technical-docs-pack-remediation/spec.md
---

# Idea: Technical Docs Pack Remediation

## Idea

Remediate the newly created `library/packs/technical-docs/` pack after independent review returned REJECT. Follow the traditional Dude workflow: this brainstorm captures intent only; implementation must not begin until explicit `@dude define technical-docs-pack-remediation` and later execution.

The desired outcome is one materially ready `technical-docs` library pack that:

- Preserves the agreed pack name, library destination, namespace, and public surface unless definition evidence requires a narrowly justified correction: 5 agents, 7 skills, and 2 prompts.
- Preserves the central multi-source principle: source material can come from multiple diverse kinds. A software repository or source tree is a first-class source, but not the only one; transcripts, notes, drafts, existing Markdown documents, and mixed inputs remain first-class supported paths.
- Corrects every accepted review finding rather than merely changing descriptions or suppressing checks.
- Makes repository intake complete, deterministic, bounded, read-only, and traceable: ordinary admitted source files cannot disappear; every examined or skipped path is accounted for; repository work units and `R*` identities are deterministic; symlink or path escapes and incomplete scans fail closed.
- Preserves source identity and provenance across mixed inputs: inputs do not collapse into an untraceable combined file; `C*`, `E*`, and `R*` evidence retains source kind and source reference; existing-document evidence retains heading provenance.
- Makes runtime scripts fail closed and safely repeatable: strict object-only JSONL, no malformed or empty-ledger false pass, no silent unreadable-input omissions, no input/output aliasing or self-ingestion, safe output-parent creation, canonical containment, bounded reads and traversal, validated numeric thresholds, and atomic writes.
- Corrects parser and routing defects identified by review: valid WEBVTT cue text beginning `NOTE`, `STYLE`, or `REGION` is preserved; chunk overlap remains inside budget and Unicode is not split; Markdown fences match correctly and C# headings survive; decision and action IDs route exactly once.
- Establishes one consistent final gate sequence with fresh evidence after reviewer mutations: intake and extraction completeness, strict merge, recall and completeness, planning and exact-once outline coverage, drafting, semantic review, final coverage and lint, then safe finalization. Stale gate reports cannot authorize output.
- Keeps the existing `writing` pack optional. When present, `technical-docs` may defer to its style and trope skills; when absent, `technical-docs` remains functional with complete local baseline guidance. Do not create a new required sibling-pack schema merely for this feature.
- Adds focused automated tests outside shipped pack artifacts and validates transcript-only, repository-only, mixed-source, and existing-document update modes. Pack composition, install and remove cleanup, standalone and writing-enabled operation, lint, full tests, release validation, and independent re-review are required before readiness.
- Does not weaken zero-fabrication traceability, coordinator-only boundaries, pack namespace rules, or the requirement for fresh independent approval.

The rejected review reproducibly established the following problem context. These findings define defects and acceptance concerns, not prescribed implementation mechanics:

1. Repository inventory omitted ordinary implementation files and had no deterministic repository unit or `R*` allocation or repository completeness gate.
2. Mixed prose preprocessing concatenated different source kinds and lost source boundaries.
3. `coverage.mjs` returned `ok:true` and exit 0 for a ledger containing `{"text":"missing id"}` with empty consumed data.
4. Package-manifest entry points could point through a skipped symlink outside the repository.
5. Fresh repository-only output could fail because the inventory output parent did not exist.
6. Existing-document `E*` provenance contradicted the evidence-ledger contract.
7. Coverage, review, and lint order left final evidence stale or internally inconsistent.
8. Ledger merge could ingest its own prior output and silently skip unreadable inputs.
9. Inventory completeness, bounds, threshold validation, WEBVTT parsing, Unicode chunking, Markdown fence and C# parsing, and decision or action digest routing had accepted defects.
10. Optional-writing language was inconsistent, and stale source skill names remained in prose.
11. No automated runtime or handoff tests or live end-to-end evidence covered the four source modes.

Keep WHAT, WHY, and acceptance intent in this idea. Do not freeze implementation details such as exact new helper filenames, JSON schema versions, command flags, limit values, or data structures; those belong to explicit definition and planning. Deterministic helpers may own reproducible parsing, validation, accounting, and safety, while agents own semantic extraction, drafting, and review, consistent with existing project guardrails.

Because the pack has not been released, do not require legacy compatibility or migration unless definition discovers a real current consumer. Existing prototype `.td-work` artifacts may be regenerated rather than silently normalized. Keep this as one feature because all accepted findings share the same source, provenance, and runtime-correctness contract and one acceptance boundary. Existing project guardrails already cover deterministic validation, minimal design, and optional disciplines, so this brainstorm proposes no new guardrail.

## Assumptions

- The stated pack identity and public surface of 5 agents, 7 skills, and 2 prompts remain the baseline; later definition may propose only a narrowly justified correction supported by evidence.
- The review findings are accepted problem evidence. Definition will translate them into technology-appropriate contracts and acceptance criteria without treating the observed defects as fixed implementation prescriptions.
- No current released consumer requires compatibility or migration. Definition may verify this assumption, and prototype `.td-work` artifacts may be regenerated rather than silently normalized.
- Transcript-only, repository-only, mixed-source, and existing-document update modes collectively bound the required source-mode acceptance surface.
- Feature 006, `simplify-context-footprint-audit`, is unrelated active execution and remains byte-untouched by this brainstorm and any later work unless separately authorized.

<!-- dude:managed:start -->
## Normalized Intent

### Remediate The Pack As One Acceptance Boundary

- Bring the existing `technical-docs` library pack from independently rejected prototype to materially ready status while preserving its agreed identity, optional integration model, and 5-agent, 7-skill, 2-prompt public surface unless definition evidence narrowly justifies a correction.
- Resolve every accepted review finding through working behavior and fresh evidence, not prose-only changes or suppressed checks.
- Treat repository intake, source identity, provenance, runtime safety, parser correctness, exact-once routing, final gate ordering, and four-mode validation as one coherent correctness contract.

### Preserve Multi-Source Traceability

- Keep repositories, transcripts, notes, drafts, existing Markdown documents, and mixed inputs as first-class paths without collapsing source identity.
- Require complete, deterministic, bounded, read-only, fail-closed repository accounting and traceable `C*`, `E*`, and `R*` evidence, including existing-document heading provenance.
- Preserve zero-fabrication traceability, coordinator-only boundaries, pack namespace rules, and fresh independent approval.

### Require Safe, Freshly Verified Operation

- Require fail-closed, repeatable runtime behavior for strict ledgers, readable and non-aliasing inputs, safe contained outputs, bounded processing, valid thresholds, correct parsing and chunking, and atomic persistence.
- Require a single final gate order whose evidence is refreshed after mutations and cannot become stale before safe finalization.
- Keep `writing` optional with complete local baseline guidance, and require focused external tests plus composition, cleanup, standalone and integrated operation, lint, full-suite, release, end-to-end, and independent review evidence before readiness.

## Constraints

- This is brainstorm intake only. Do not create a spec package under `.dude/specs/` and do not begin implementation until explicit definition and later execution.
- Do not prescribe exact helper filenames, schema versions, command flags, numeric limits, or internal data structures during brainstorm.
- Do not introduce a required sibling-pack schema solely for this feature or require unreleased compatibility or migration without evidence of a real current consumer.
- Keep all remediation findings in one feature because they share one source, provenance, runtime-correctness, and readiness boundary.
- Do not mutate Feature 006 or any unrelated idea, task state, profile, generated board, installed pack, or implementation artifact.

## Definition Checklist

- [x] Outcome is clear enough for brainstorm
- [x] Scope is coherent as one idea ledger
- [x] Open questions are resolved or consciously assumed

## Coordinator Log

- 2026-07-22 UTC - brainstorm captured
- 2026-07-22 UTC - defined -> .dude/specs/007-technical-docs-pack-remediation/spec.md
- 2026-07-22 UTC - Work iteration 1 claimed T001@00709e37 under autonomous policy; pre-start Inspection 6757a733ff3ae81dfffad0b8a6f3d800b0fbb70407eea4ff15a633d27feb3888 had no blockers and no ObjectiveRegistry entry
- 2026-07-22 UTC - Lightweight board rendered after T001@00709e37 claim
- 2026-07-22 UTC - T001@00709e37 attempt 1 verified 29/29 focused tests but independent Tester and Code Reviewer rejected filesystem-safety and foundation-contract gaps; autonomous post-block Inspection fb2cfa1ca15d4b4ddad85c1fa1bfc8f6bd604f4577cb37cfeea7d0aa600a26ec authorized one address-review recovery
- 2026-07-22 UTC - T001@00709e37 recovery attempt verified 39/39 focused tests but independent re-review repeated the immediate pre-publication finding and found two staged-directory defects
- 2026-07-22 UTC - T001@00709e37 blocked after post-block Inspection bbb42d01f0b9b0eac9597674dcd5a15ddf9e833e643e598de6bb772e9a4417ae; repeated-review protocol requires user decision before any third revision
- 2026-07-22 UTC - Lightweight board rendered after T001@00709e37 block
<!-- dude:managed:end -->
