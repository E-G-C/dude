---
name: dude-pack-technical-docs-quality-audit
description: "Use when finalizing a technical document and you need the prohibited-elements list (what must never appear in the output) and the final semantic audit checklist (the traceability, diagram, tone, and formatting judgment calls a script cannot make) before the document is emitted. Load it during the reviewer's audit pass, after the mechanical lint and coverage scripts have run."
---

# Quality Audit: Prohibited Elements and Final Semantic Audit

## Purpose

Gate a technical document before it is published. This skill holds three things:
the hard prohibitions that must never appear in the output, the semantic audit
that a deterministic command cannot perform, and the review report that binds the
semantic pass to the deterministic gates on either side of it.

Semantic review sits **between** two deterministic passes. The pre-review coverage
and lint reports are diagnostics produced against the draft the reviewer is about
to read; they can never authorize publication. The final coverage and lint reports
are produced against the document the review actually left behind. Apply this
skill during the semantic pass, after the pre-review reports exist, so the
reviewer acts on judgment calls instead of re-deriving mechanical defects by eye.

For the full catalog of AI writing tells (em-dash density, "it's not X, it's Y"
reframes, rhetorical question-and-answer, filler vocabulary, bold-first bullets,
signposted conclusions), defer to `dude-pack-writing-avoid-ai-tropes` when the
`writing` pack is installed. When it is not, use the local writing fallback in
`dude-pack-technical-docs-pipeline`. Either way, scan for trope density during the
audit and rewrite the densest offenders; do not restate that catalog here.

## Part 1: Prohibited elements

These are hard prohibitions specific to technical-document output. None may appear
in the finished document.

- **No HTML tags.** The output is valid Markdown only. Do not use HTML tags or
  HTML formatting.
- **No dialogue or speaker references.** Remove every trace of dialogue format
  (for example, "Alice: ..."). Present information neutrally without attributing
  it to individuals, except where a Stakeholder or Decisions Log section requires
  the attribution.
- **No informal language.** Drop source-specific narration ("as we discussed"),
  conversational filler, jokes, and apologies.
- **No hedging or vague phrasing.** Write confidently. Replace uncertainty ("we
  think that...", "I'm not sure but...") with factual statements about open
  issues, such as "X is under evaluation" or a `[NEEDS CLARIFICATION]`
  placeholder. State considerations factually or record them as open issues, never
  in a conversational tone.
- **No external links or fabricated content.** The document is self-contained. Do
  not add hyperlinks or any information the source material does not contain. If
  something important seems missing, mark the gap with `[NEEDS CLARIFICATION]` or
  leave it out; never invent details, data, or steps.
  `dude-pack-technical-docs-traceability` owns the zero-fabrication rule.
- **No empty or redundant sections.** Do not emit a heading that has neither
  substantive content nor a `[NEEDS CLARIFICATION: ...]` placeholder; a section
  holding only a placeholder is allowed. Do not repeat the same information in
  several narrative forms without purpose. It is acceptable to describe a flow in
  text and show it once as a Mermaid diagram, or to give both a version-history
  table and a short narrative summary.
- **No linear diagrams.** Do not include a Mermaid diagram that shows only a
  straight sequence with no branch, decision, alternate path, loop, merge,
  exception, or parallel route. Represent linear material as prose, numbered
  steps, or a table. See `dude-pack-technical-docs-diagrams`.
- **No internal references.** Do not include links, filenames, or line numbers
  that point back to the source material (source files, transcripts, or prompts)
  or to this skill. The output stands alone.
- **No off-topic or source-specific narration.** Exclude anything that does not
  serve the technical or operational understanding of the subject: small talk,
  jokes, speaker names and attributions, meeting dynamics and logistics ("Let's
  get started", "Thanks for joining"), and any narration of the source itself ("in
  this session we discussed...", "laughter", "break for lunch"). Do not mention
  the original transcript, recording, or source context. Rewrite content as if
  authored directly as documentation, not as a description of the source
  conversation.
- **No formulaic transitions or conclusions.** Avoid stock phrases such as "By
  following these recommendations", "By utilizing", "In conclusion", "To
  summarize", "As discussed", and "We covered". Do not add a closing summary
  unless the source itself contained a formal summary or conclusion that must be
  captured.
- **No sign-offs or interjections.** Present the whole document as one continuous
  Markdown output. Do not add concluding pleasantries ("Hope this was helpful"),
  sign-offs, commentary, or system messages. The document ends professionally
  after the last content section.
- **One name per concept, no filler.** Remove verbal fillers. If the source states
  a concept many times, state it once, clearly. If the source uses several names
  for one thing, choose one and keep it, noting the alternative in parentheses on
  first use.

## Part 2: Final semantic audit

Run this review before the final gates. The document is not ready until every
check passes.

**Division of labor.** The deterministic, mechanical checks — leftover
`<!-- DIAGRAM -->` and `<!-- SECTION -->` markers, HTML tags and comments,
unclosed code fences, empty headings, a missing title, heading-level jumps, and
pure-linear Mermaid blocks — are performed by `lint.mjs` and reported as
violations to fix. Exact-once coverage of every ledger id is verified by
`coverage.mjs`. This checklist is the semantic layer: the judgment no command can
make.

With `<rt>` as `.github/skills/dude-pack-technical-docs-runtime/scripts`, the two
deterministic gates run once before review and once after:

```bash
node <rt>/coverage.mjs --workspace-root <dir> --mode document \
  --stage <pre-review|final> --ledger <ledger.jsonl> \
  --consumed <consumed.jsonl> --document <document.md> --json <coverage.json>

node <rt>/lint.mjs --workspace-root <dir> --sources <sources.json> \
  --stage <pre-review|final> <document.md> --json <lint.json>
```

Each report is stage-tagged and bound to the exact bytes it evaluated, so a
`pre-review` report can never satisfy a final-report requirement and no report
survives a change to what it examined.

### Traceability and completeness

- Every statement traces back to a specific point in the source material. Where an
  assumption is unavoidable, mark it `[NEEDS CLARIFICATION: ...]` instead of
  fabricating the detail. `dude-pack-technical-docs-traceability` owns this rule.
- All major points, decisions, and action items from the source are captured.
  Nothing important is missing or half-documented.
- No information is repeated unnecessarily. Keep any repetition minimal and only
  where it aids clarity.

### Diagram mandate

- The document contains Mermaid diagrams for qualifying non-linear flows. If the
  source holds only linear procedures or straight-through exchanges, do not force
  a diagram.
- Every qualifying non-linear flow is diagrammed: branching, decisions, alternate
  paths, retries, exceptions, loops, parallel routing, branching state lifecycles,
  and multi-actor interactions with non-linear control flow.
- No Mermaid diagram is a pure linear sequence. Replace a straight-line diagram
  with prose, numbered steps, or a table.
- Each table and diagram has a lead-in sentence and follows the format rules in
  `dude-pack-technical-docs-diagrams`.

### Tone and style

- No dialogue artifacts remain. Speaker names, question-and-answer format, and
  conversational fillers are gone, and the text reads as documentation, not a
  transcript.
- The tone follows `dude-pack-writing-style` when the `writing` pack is installed,
  and the local writing fallback in `dude-pack-technical-docs-pipeline` otherwise:
  professional, concise, and consistent in terminology, with no slang or casual
  phrasing.
- Trope density is under control. Scan for the AI writing tells catalogued in
  `dude-pack-writing-avoid-ai-tropes`, or the summary in the local writing
  fallback, and rewrite the densest offenders; density is the tell, not any single
  instance.

### Formatting and cleanup

- Structural defects (heading order, unclosed fences, stray HTML, leftover
  `<!-- DIAGRAM -->` placeholders) are resolved from the lint report rather than
  re-derived by eye.
- No trailing notes, system messages, or commentary appear after the last content
  section.
- All internal reference markers (ledger ids, source-line tags) are stripped from
  the document and live only in the sidecar `consumed.jsonl` defined in
  `dude-pack-technical-docs-evidence-ledger`.

### Hand off

- Finish the audit only after every check above passes.
- The working document file contains only the Markdown document — no explanations,
  JSON, ledger ids, or commentary. It begins with the title and proceeds straight
  into the documentation. Edit that file in place; do not restart it. Reporting
  status back to the orchestrator in chat is expected and separate from the file
  content.
- Then write the review report described below. The final gates and `finalize.mjs`
  refuse to proceed without it.

## Part 3: The review handoff

The semantic pass is the one link in the chain a command cannot verify, so the
reviewer records what it saw and what it produced. `review.json` is a strict
schema-version-2 object:

```json
{
  "schemaVersion": 2,
  "gate": "semantic-review",
  "ok": true,
  "reviewer": "dude-pack-technical-docs-reviewer",
  "inputDocumentSha256": "<digest of the draft the reviewer received>",
  "outputDocumentSha256": "<digest of the document the reviewer produced>",
  "consumedSha256": "<digest of the consumed manifest for that document>",
  "preReviewCoverageSha256": "<digest of the pre-review coverage report>",
  "preReviewLintSha256": "<digest of the pre-review lint report>",
  "touchedSections": ["Configuration", "Sessions"],
  "findings": [
    { "code": "linear-diagram", "severity": "major", "section": "Sessions", "resolution": "removed placeholder" }
  ]
}
```

Rules the finalizer enforces:

- `gate` must be `semantic-review`, `ok` must be `true`, and `reviewer` must be
  exactly `dude-pack-technical-docs-reviewer`.
- The two pre-review digests must match the exact pre-review report bytes, and
  those reports must have evaluated the document named by `inputDocumentSha256`.
- `outputDocumentSha256` must equal the document both final gates evaluated and the
  draft that gets published.
- `touchedSections` is unique and sorted. A review that changed the document must
  name at least one section; a review that changed nothing must name none.
- `findings` entries are closed `{code, severity, section, resolution}` records,
  unique by code and section, ordered by code then section.
- Any edit after the report is written invalidates it. Produce a new report for the
  resulting revision and rerun both final gates.

## Related skills

- `dude-pack-technical-docs-pipeline` — the canonical gate sequence, the mutation
  rule, and the local writing fallback.
- `dude-pack-writing-avoid-ai-tropes` — canonical catalog of AI writing tells when
  the `writing` pack is installed.
- `dude-pack-writing-style` — professional tone and structure when installed.
- `dude-pack-technical-docs-traceability` — zero-fabrication rule.
- `dude-pack-technical-docs-diagrams` — Mermaid diagram rules.
- `dude-pack-technical-docs-evidence-ledger` — ledger, Outline, and the
  `consumed.jsonl` sidecar.
- `dude-pack-technical-docs-runtime` — the coverage, lint, and finalize commands.
