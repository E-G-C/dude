---
name: dude-pack-technical-docs-traceability
description: "Use when writing, drafting, or auditing a technical document that must stay grounded in its sources: the zero-fabrication traceability rule that binds every document statement to an evidence-ledger entry and every ledger entry to a named source reference, across all source kinds (repository code, configuration, tests, transcripts, notes, drafts, or existing documents)."
---

# The Golden Rule: Traceability

## Purpose

Enforce zero fabrication across every source kind. Apply this rule while
extracting evidence, drafting a section, or auditing a draft, so nothing reaches
the reader that the source material does not support.

## The rule

Every element or topic in the output must be directly traceable to the provided
source material (repository code, configuration, tests, transcripts, notes,
drafts, or existing documents). Paraphrase and restructure wording for clarity
and style, but do not introduce facts, actors, systems, flows, or metrics that
the source does not support. When in doubt about a fact, omit it or represent it
as a `[NEEDS CLARIFICATION: ...]` placeholder.

## Hard rules

- **Zero fabrication.** No invention, speculation, hallucination, extrapolated
  examples, synthetic data, or unstated assumptions. If the source does not
  support a fact, omit it or mark it `[NEEDS CLARIFICATION: ...]`.
- **Self-contained context.** The document must read clearly for someone who
  never saw the source material.
- **Strict adherence.** Obey every instruction in the skill. Do not reinterpret,
  reorder, or weaken the rules themselves. You may freely re-sequence and
  restructure source *content* to fit sections, flows, and diagrams logically.
- **Placeholder policy.** Represent any missing quantitative, temporal, role,
  system, or conditional detail as `[NEEDS CLARIFICATION: <descriptor>]` and keep
  it until it is supplied. Keep placeholders concise and reusable (for example,
  `[NEEDS CLARIFICATION: SLA target]`). Reuse the exact same placeholder phrase
  for the same missing detail.
- **Traceable synthesis only.** Consolidate only across multiple explicit
  mentions of the same fact in the source. Do not introduce net-new concepts,
  actors, states, or metrics.

## Grounding claims in a repository

When the source is a repository, a claim about behavior must trace to actual
code, tests, configuration, or schema, not to assumption or convention.

- Do not infer undocumented behavior.
- Do not describe planned-but-absent features.
- Do not promote a comment or TODO into a guarantee.
- Cite the exact lines the evidence came from. A repository locator is
  `<repo ref>:<path>#L<start>-L<end>`; a symbol name alone is not a locator.
- Read only what the work unit's members name. A file the unit does not cover is
  not admitted evidence for that unit.

## Mandatory provenance

Traceability is not advisory here; it is enforced by the runtime. Every ledger
entry carries all four provenance fields, and they are checked against the Source
Registry and the unit manifests:

- `source-id` — the `S*` Source the entry came from, which must match its unit's
  Source.
- `source-kind` — which must match that Source's registered kind.
- `source-chunk` — the `C*` / `E*` / `R*` unit that produced the entry.
- `source-ref` — a locator ending in `#L<start>-L<end>` whose prefix equals one of
  the unit's own locators and whose line span falls inside it.

No entry may omit `source-ref`, including entries from a transcript, notes, or a
draft. An entry whose locator does not agree with its unit is rejected before it
can reach the ledger, so a fabricated or guessed pointer fails the run rather than
reaching the reader. The exact forms are in
`dude-pack-technical-docs-evidence-ledger`.

## Ledger traceability

Every document statement maps to one or more ledger ids, and the coverage gate
verifies that every ledger id is represented exactly once in the final document.
Representing an id, even as a `[NEEDS CLARIFICATION: ...]` open issue, preserves
the point; silently dropping an id is a traceability failure and fails the gate.

The chain therefore runs end to end and is machine-checked at every link:
statement → consumed record → ledger id → `source-ref` → registered Source →
registered bytes. `finalize.mjs` re-reads every registered file Source before
publication, so a document can only be published while its evidence still matches
the sources it claims.
