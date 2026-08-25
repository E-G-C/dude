---
name: technical-docs
description: "Create or update traceable technical documents from software repositories, source code, configuration, tests, transcripts, notes, drafts, and existing Markdown. Scales beyond the context window with an evidence ledger, incremental drafting, and coverage and lint gates."
use-cases: [documentation, writing]
provides:
  agents:
    - dude-pack-technical-docs-writer
    - dude-pack-technical-docs-extractor
    - dude-pack-technical-docs-planner
    - dude-pack-technical-docs-drafter
    - dude-pack-technical-docs-reviewer
  skills:
    - dude-pack-technical-docs-source-intake
    - dude-pack-technical-docs-evidence-ledger
    - dude-pack-technical-docs-traceability
    - dude-pack-technical-docs-pipeline
    - dude-pack-technical-docs-diagrams
    - dude-pack-technical-docs-quality-audit
    - dude-pack-technical-docs-runtime
  prompts:
    - dude-pack-technical-docs-write-technical-document.prompt.md
    - dude-pack-technical-docs-document-this-repository.prompt.md
requires:
  tools: []
routing_hints:
  "document this repository": "@dude-pack-technical-docs-writer"
  "generate technical documentation": "@dude-pack-technical-docs-writer"
  "write a technical document": "@dude-pack-technical-docs-writer"
  "update the technical document": "@dude-pack-technical-docs-writer"
hooks:
  - routing
---

# Technical Docs Pack

The technical-documentation domain pack. Install it when you need to write or
update a technical document from real source material and keep every claim
traceable to where it came from.

The pack runs a five-agent pipeline over one authoritative Source Registry.
`source-manifest.mjs` resolves source identity, the work directory, the output,
the output mode, and all 17 limits exactly once. Each registered source is then
processed on its own into bounded work units, distilled into an evidence ledger,
planned into a section outline, drafted one section at a time, reviewed, and
published by `finalize.mjs` only when a chain of digest-bound gate reports still
describes the exact bytes on disk. Because the registry, the ledger, and the
outline carry state between steps, the pipeline can document material larger than
a single context window: each step reads only the slice it needs instead of
holding the whole document in the prompt.

## Source kinds

Source material is diverse. A software repository is a first-class source, but it
is only one kind. The pack accepts:

- a repository or source tree, including code, configuration, and tests
- an existing Markdown document, which it updates in place
- a transcript
- meeting notes or scratch notes
- a rough draft
- any mix of these

Every source is registered separately and keeps its own id, so nothing is
concatenated and no unit loses its origin. A repository-only run, a
transcript-only run, and a mixed run all converge on the same ledger and the same
gates, so drafting and audit do not care where a given fact originated.

## Output modes

The output mode is explicit and is never inferred from whether the target exists:

- `create` — the output must be absent at registration and is published with
  no-replace semantics.
- `replace` — the output must exist, and its registered bytes must still be there
  immediately before publication.
- `update` — exactly one `--update-document` is registered both as a source and as
  the output target, and it is the only source the output may alias.

## Provides

### Agents

- `dude-pack-technical-docs-writer` — orchestrator: registers the sources, runs the
  canonical gate sequence, and owns the work directory and finalization.
- `dude-pack-technical-docs-extractor` — turns exactly one declared work unit into
  one strict extraction result plus, when the unit carries evidence, one evidence
  fragment.
- `dude-pack-technical-docs-planner` — reduces the evidence ledger to a section
  outline, the exact-once coverage contract for the draft.
- `dude-pack-technical-docs-drafter` — drafts the document section by section from
  the ledger and the outline and records strict consumed data.
- `dude-pack-technical-docs-reviewer` — reviews the pre-gated draft, inserts
  diagrams for genuine non-linear flows, and emits the semantic review report.

### Skills

- `dude-pack-technical-docs-source-intake` — the Source Registry contract: the
  `@root` anchor, explicit output modes, expected target state, independent
  per-source processing, ordinal handoffs, and complete repository accounting.
- `dude-pack-technical-docs-evidence-ledger` — the schema-version-2 data
  contracts: per-unit extraction results, the result index, `ledger.jsonl`, the
  Outline, and `consumed.jsonl`.
- `dude-pack-technical-docs-traceability` — the zero-fabrication rule: every
  statement traces to a ledger entry, and every ledger entry carries a source id
  and a validated source reference.
- `dude-pack-technical-docs-pipeline` — the canonical gate sequence, incremental
  section-by-section assembly, the mutation-invalidation rule, the decisions and
  action-items convention, and the local writing fallback.
- `dude-pack-technical-docs-diagrams` — Mermaid diagram rules: type selection,
  diagram integrity, and when not to diagram.
- `dude-pack-technical-docs-quality-audit` — the prohibited-elements list, the
  semantic audit checklist, and the review report the final gates bind to.
- `dude-pack-technical-docs-runtime` — the eleven deterministic Node commands
  (`source-manifest`, `preprocess`, `headings`, `chunk`, `repo-inventory`,
  `merge-ledger`, `extraction-audit`, `ledger-digest`, `coverage`, `lint`, and
  `finalize`) and the internal `lib/runtime.mjs` module they share.

### Prompts

- `dude-pack-technical-docs-write-technical-document.prompt.md` — the general entry
  point: produce or update a document from any mix of sources.
- `dude-pack-technical-docs-document-this-repository.prompt.md` — the
  repository-focused entry point: inventory a repository and document what it
  contains.

## When installed

Documentation requests route to `dude-pack-technical-docs-writer`, which registers
the sources and drives the extractor, planner, drafter, and reviewer through the
canonical sequence. The two prompts are the usual entry points: use
`write-technical-document` for any mix of sources, and `document-this-repository`
when the source is mainly a code repository.

## Requires

- Node.js, which the Dude bundle already assumes. The pack's runtime commands use
  Node built-ins only, with no dependency and no network access.
- No external tools. `requires.tools` is intentionally empty.

## Install / remove

```bash
@dude add pack technical-docs
@dude remove pack technical-docs
```

## Related packs

- `writing` — recommended, never required. The drafter and reviewer defer to
  `dude-pack-writing-style` and `dude-pack-writing-avoid-ai-tropes` when those
  skills are installed. When they are not, the local writing fallback in
  `dude-pack-technical-docs-pipeline` stands on its own, so every supported source
  mode completes standalone. Installed writing skills refine style only; they
  cannot change intake, traceability, the gates, or finalization. The manifest has
  no cross-pack `requires`.
