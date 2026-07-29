---
name: dude-pack-technical-docs-pipeline
description: "Use when the technical-docs planner or drafter turns the evidence ledger and outline into document prose: the six-step section-planning workflow (scan, plan, segment, write, neutralize, preserve), the skeleton-first incremental section-by-section emit mechanics that let output exceed one context window, and the decisions-and-action-items consolidation convention. Load it before planning sections or drafting them."
---

# Technical Docs Pipeline

This skill owns the order of the run and the middle of it: turning the **evidence
ledger** and the **outline** into the document itself. It holds five separable
concerns.

1. **Canonical gate sequence** — the fixed order every entry point follows.
2. **Section-planning workflow** — how the planner shapes the ledger into an outline.
3. **Incremental emit** — how the drafter assembles the document one section at a
   time so it can exceed a single context window.
4. **Decisions and action items** — how `decision` and `action` ledger entries
   become one consolidated section.
5. **Local writing fallback** — the prose baseline that keeps the pack complete
   without the optional `writing` pack.

The Source Registry is defined in `dude-pack-technical-docs-source-intake`. The
extraction result, result index, ledger, Outline, and `consumed.jsonl` contracts are
defined in `dude-pack-technical-docs-evidence-ledger`. The exact commands, flags,
limits, and exit codes are in `dude-pack-technical-docs-runtime`. Zero fabrication is
enforced by `dude-pack-technical-docs-traceability`.

## Canonical gate sequence

Every entry point runs these steps in this order. `<rt>` is
`.github/skills/dude-pack-technical-docs-runtime/scripts`.

1. **Register.** `source-manifest.mjs` writes `sources.json`: source identities,
   containment, aliases, work/output boundaries, explicit output mode,
   `expectedTarget`, and all 17 limits.
2. **Intake.** Process each Source on its own: `preprocess.mjs` then `chunk.mjs` for
   each `C*` Source, `headings.mjs` then `chunk.mjs` for each `E*` Source, and
   `repo-inventory.mjs` for each repository, chaining prefix-specific ordinals.
3. **Extract.** One semantic result per expected unit at
   `<workdir>/results/<UnitId>.json`.
4. **Index.** `merge-ledger.mjs --mode index` validates every expected result and
   fragment and authors `results.json`.
5. **Merge.** `merge-ledger.mjs --mode merge` consumes only that index and produces
   the nonempty `ledger.jsonl`.
6. **Reconcile.** `extraction-audit.mjs --result-index` revalidates the index and
   reconciles sources, units, examined members, fragments, ledger provenance,
   repository members, and recall density.
7. **Digest.** `ledger-digest.mjs` produces the exact `digest.json` / `digest.md`
   pair bound to the registry and the ledger.
8. **Plan and prove.** The planner writes `outline.md`; `coverage.mjs --mode outline`
   proves every ledger id is assigned exactly once.
9. **Draft.** Skeleton, then one section at a time, recording strict consumed data.
10. **Pre-review diagnostics.** `coverage.mjs --mode document --stage pre-review` and
    `lint.mjs --stage pre-review` against the same draft.
11. **Semantic review.** The reviewer works from the pre-gated draft and emits
    `review.json` binding the pre-review reports, the input draft, the resulting
    document, and the consumed manifest.
12. **Final gates.** `coverage.mjs --mode document --stage final` and
    `lint.mjs --stage final` against the reviewed output. Both must bind the same
    document digest.
13. **Finalize.** `finalize.mjs` verifies the whole chain, re-reads every registered
    file Source, revalidates `expectedTarget`, and publishes atomically.

Pre-review reports are diagnostics and can never authorize finalization. Final
reports cannot be reused for a changed document.

## Mutation invalidation

Any mutation of a Source, unit, result, index, fragment, ledger, digest, Outline,
consumed record, draft, report, expected target, or output invalidates that artifact
and every gate downstream of it. Rerun from the first invalidated step, not from the
end.

A post-review fix is the common case and has one rule: after any edit to the reviewed
document, the reviewer must produce a **new** `review.json` for the resulting
revision, and both final gates must run again against it. There is no way to patch a
document after review and reuse the old evidence.

## Section-planning workflow

Follow this six-step workflow to shape content into a technical document. It
operates over the **evidence ledger** — the traceable items distilled from the
source material — and the **outline** that assigns ledger ids to sections, not
over the raw source directly. "Content" below means those ledger entries;
planning and segmentation are expressed as the outline's section→id assignments
(`covers:` lines).

1. **Initial analysis — scan and identify topics.** Read the full set of ledger
   entries (the traceable facts distilled from the source material) to identify
   the main topics, sections, or thematic areas. Use each entry's `tag` and
   meaning to detect topic boundaries. If a single topic appears non-contiguously,
   with entries scattered across many chunks, plan to **consolidate those
   fragments** into one coherent section. When boundaries are unclear, prefer
   fewer, broader sections over many tiny ones.
2. **Section planning — define sections.** Formulate a list of high-level sections
   from the identified topics and themes. **Group related content together** under
   these headings so the same theme is not duplicated in several places.
3. **Segment the content.** Assign every ledger entry to exactly one planned
   section, recorded as the outline's `covers:` lines. Each section carries all
   entries about its topic. If entries from later chunks return to an earlier
   topic, fold them into that topic's existing section rather than creating a
   duplicate.
4. **Write each section.** Begin with a concise **introduction** (roughly one to
   three short paragraphs) that explains the feature, process, or topic in general
   terms for the reader. Then expand with detailed content, using structured
   paragraphs, **bullet points**, **numbered steps**, **tables**, or **diagrams**
   as best conveys the information. Keep a logical flow within the section.
5. **Neutralize tone and narration.** Apply the local writing fallback below —
   or `dude-pack-writing-style` and `dude-pack-writing-avoid-ai-tropes` when the
   `writing` pack is installed — together with the prohibited-elements list in
   `dude-pack-technical-docs-quality-audit` to rewrite all content as factual
   exposition or instructional text, as if authored directly as documentation. A
   section should read like a chapter in a user guide, **not** like meeting
   minutes or a recap of the source.
6. **Preserve all key information.** Lose **no important point**. Include every
   instructional step, fact, decision, rationale, definition, requirement, figure,
   and action item the source material contains: technical setup steps, process
   descriptions, examples (such as JSON or code snippets), configuration or
   **parameter details**, options considered, outcomes decided, metrics,
   constraints or rules, and any stated **action items or next steps**. If
   something is present in the source material and would be relevant to a reader
   using the document for guidance or reference, **it must appear in the output**.
   The coverage contract in `dude-pack-technical-docs-evidence-ledger` is what
   proves this held.

## Incremental emit

A document assembled in a single model response is capped by the output context
window; anything past it is silently truncated and detail is lost. To produce
documents that exceed that ceiling, build the file **incrementally**, one section
per step, filling a working file at fixed markers with in-place edits. Each edit
is a bounded generation; the file on disk accumulates past any single-response
limit.

This governs the *generation process*, not the result. Incremental assembly is the
method; one coherent, single-contiguous document is the outcome.

### Procedure

1. **Skeleton first.** From the outline, write the title and every section heading
   in order, in one pass. Under each heading place a body marker
   `<!-- SECTION: <exact heading text> -->` — the insertion anchor the fill step
   replaces. Under any heading the outline flags with a `diagram:` line, also place
   a `<!-- DIAGRAM: [flow name] -->` placeholder. The skeleton is small and
   establishes the document's full shape up front.
2. **Fill one section per step.** For each heading, **replace that heading's
   `<!-- SECTION: <heading> -->` marker** with the section's prose — an in-place
   edit at the marker, never an append to the end of the file. Cover every ledger
   id the outline's `covers:` line assigns to the section. Leave any
   `<!-- DIAGRAM: ... -->` placeholder in place: diagram authoring is the
   reviewer's job, the drafter only leaves the placeholder, and the full diagram
   rules live in `dude-pack-technical-docs-diagrams`. Do not touch sections already
   written.
3. **Record consumption.** After writing a section, append the ledger ids it
   represented to `consumed.jsonl` (schema in
   `dude-pack-technical-docs-evidence-ledger`). Consumption is **exact-once**:
   write one record per ledger id, naming a heading the document actually
   contains. A second record for the same id fails the coverage gate, so an id
   whose content spans sections is recorded in the section that carries the point.
   Keep these ids out of the Markdown.
4. **Stop when the skeleton is filled.** The document is complete when every
   `<!-- SECTION: ... -->` marker has been replaced — every heading has substantive
   content or an explicit `[NEEDS CLARIFICATION: ...]` placeholder. No
   `<!-- SECTION: ... -->` marker may remain in the final document.

### Hard rules

- **No restarts.** Never re-emit the title or re-open the document. There is
  exactly one title and one cover.
- **No regeneration.** Never rewrite a section that is already written. Fixes are
  targeted edits to that section only.
- **No duplicates.** Each heading appears once. Do not emit alternate versions or
  drafts of a section.
- **Cover every assigned id exactly once.** If an assigned id cannot be fully
  represented from the ledger, keep it as a `[NEEDS CLARIFICATION: ...]` in the
  relevant section rather than dropping it — and still record it as consumed.
  Losing a point is a failure; flagging it is acceptable. Consuming it twice is
  also a failure.
- **One coherent document.** Headings stay in order with no skipped levels. The
  result must read as if written in one pass, even though it was assembled in many.

### Why this is safe

Each section is bounded and the file is the source of truth between steps, so
neither the input (the ledger slice for one section) nor the output (one section's
prose) needs to hold the whole document in a single window. The same property lets
a later step revise a single section without reloading or re-emitting the entire
document.

## Decisions and action items

When the source material contains concrete decisions, action items, assigned
tasks, or identified risks and blockers, surface them clearly. In the evidence
ledger these arrive as `decision` and `action` entries (see the type taxonomy in
`dude-pack-technical-docs-evidence-ledger`).

Consolidate them into one **final section** titled `## Decisions and action
items`, placed after the main topic sections and before any closing summary. Use a
table when it adds clarity:

```markdown
| Item                  | Owner        | Due/Timeline    | Notes                     |
|-----------------------|--------------|-----------------|---------------------------|
| Set up QA environment | <PersonName> | By next release | Requires hardware from IT |
| ...                   | ...          | ...             | ...                       |
```

Include only the columns that have data; omit owner or timeline when the source
does not specify them. If there are only one or two items tied to a specific
section, you may instead place them as a bullet list or subsection within that
section — but **do not scatter** them across the document. They must be easy for a
reader to find, and multiple sections' worth of items belong in the consolidated
final section. Label decisions and actions clearly so they stand out.

## Local writing fallback

The `writing` pack is optional. This baseline is complete on its own, so every
supported source mode finishes standalone. When `dude-pack-writing-style` and
`dude-pack-writing-avoid-ai-tropes` are installed, defer to them for style; they
refine this baseline and can never change intake, traceability, the gates, or
finalization.

The baseline:

- **Write for the reader, not the source.** Factual, audience-oriented exposition
  addressed to a technology professional with no prior context. No meeting-recap
  narration, no "as we discussed", no reference to the transcript, recording, or
  prompt.
- **One name per concept.** Pick the canonical term for each entity and use it
  everywhere. Note an alternative name once, in parentheses, at first use.
- **Useful headings.** A heading names what its section covers. No empty section,
  and no heading that only restates its parent.
- **Concise and active.** Short paragraphs, concrete subjects, active
  constructions. Cut filler and stock transitions.
- **No unsupported claims.** Every statement traces to a ledger entry or carries a
  `[NEEDS CLARIFICATION: ...]` marker.
- **Structure only when it helps.** A table when values line up in columns, a
  numbered list for ordered steps, a code block for literal syntax, and a diagram
  only for a genuine non-linear flow. Prose is the default.
- **Watch for AI tells.** Density is the tell, not any single instance: em-dash
  pileups, "it's not X, it's Y" reframes, rhetorical question-and-answer,
  bold-first bullets, signposted conclusions, and filler vocabulary such as delve,
  leverage, robust, or seamless. Rewrite the densest offenders plainly without
  overcorrecting.
