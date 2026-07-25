---
name: technical-docs
description: "Create or update traceable technical documents from software repositories, source code, configuration, tests, transcripts, notes, drafts, and existing Markdown. Scales beyond the context window with an evidence ledger, incremental drafting, and coverage and lint gates."
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

The pack runs a five-agent pipeline. It reads the sources and records what they
say as an evidence ledger, plans a section outline from that ledger, drafts the
document one section at a time, then reviews the draft and audits it against
coverage and lint gates. Because the ledger and the outline carry state between
steps, the pipeline can document material larger than a single context window:
each step reads only the slice it needs instead of holding the whole document in
the prompt.

## Source kinds

Source material is diverse. A software repository is a first-class source, but it
is only one kind. The pack accepts:

- a repository or source tree, including code, configuration, and tests
- an existing Markdown document, which it updates in place
- a transcript
- meeting notes or scratch notes
- a rough draft
- any mix of these

Each kind has its own intake path into the evidence ledger. A repository-only
run, a transcript-only run, and a mixed run all converge on the same
ledger-backed pipeline, so the drafting and audit steps do not care where a given
fact originated.

## Provides

### Agents

- `dude-pack-technical-docs-writer` — orchestrator: classifies the sources, runs
  the pipeline, and owns the working directory and the final document.
- `dude-pack-technical-docs-extractor` — turns one source unit, either a prose
  chunk or a slice of a repository inventory, into atomic evidence-ledger entries.
- `dude-pack-technical-docs-planner` — reduces the evidence ledger to a section
  outline, which becomes the coverage contract for the draft.
- `dude-pack-technical-docs-drafter` — drafts the document section by section from
  the ledger and the outline.
- `dude-pack-technical-docs-reviewer` — inserts diagrams for genuine non-linear
  flows and runs the semantic audit.

### Skills

- `dude-pack-technical-docs-source-intake` — classifies and preprocesses each
  source kind (repository, document, transcript, notes, draft, or mixed) and
  defines how each becomes ledger entries.
- `dude-pack-technical-docs-evidence-ledger` — the ledger, outline, and
  consumed-data contracts: schema, ids, and source provenance.
- `dude-pack-technical-docs-traceability` — the zero-fabrication rule: every
  statement traces to a ledger entry, and every ledger entry traces to a named
  source reference.
- `dude-pack-technical-docs-pipeline` — the section-planning workflow, incremental
  section-by-section assembly, and the decisions and action-items conventions.
- `dude-pack-technical-docs-diagrams` — Mermaid diagram rules: type selection,
  diagram integrity, and when not to diagram.
- `dude-pack-technical-docs-quality-audit` — the prohibited-elements list and the
  final semantic audit checklist.
- `dude-pack-technical-docs-runtime` — the deterministic Node helper scripts:
  preprocess, chunk, recall audit, ledger digest, headings, coverage, lint, ledger
  merge, and repository inventory.

### Prompts

- `dude-pack-technical-docs-write-technical-document.prompt.md` — the general entry
  point: produce or update a document from any mix of sources.
- `dude-pack-technical-docs-document-this-repository.prompt.md` — the
  repository-focused entry point: inventory a repository and document what it
  contains.

## When installed

Documentation requests route to `dude-pack-technical-docs-writer`, which
classifies the sources and drives the extractor, planner, drafter, and reviewer
through the pipeline. The two prompts are the usual entry points: use
`write-technical-document` for any mix of sources, and `document-this-repository`
when the source is mainly a code repository.

## Requires

- Node.js, which the Dude bundle already assumes. The pack's runtime scripts run
  on it.
- No external tools. `requires.tools` is intentionally empty.

## Install / remove

```bash
@dude add pack technical-docs
@dude remove pack technical-docs
```

## Related packs

- `writing` — recommended. The drafter and reviewer defer to
  `dude-pack-writing-style` and `dude-pack-writing-avoid-ai-tropes` when those
  skills are installed, and fall back to their own built-in guidance when they are
  not. The manifest has no cross-pack `requires`, so this pairing is a
  recommendation, not a hard dependency.
