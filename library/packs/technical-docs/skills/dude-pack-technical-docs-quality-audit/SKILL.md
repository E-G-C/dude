---
name: dude-pack-technical-docs-quality-audit
description: "Use when finalizing a technical document and you need the prohibited-elements list (what must never appear in the output) and the final semantic audit checklist (the traceability, diagram, tone, and formatting judgment calls a script cannot make) before the document is emitted. Load it during the reviewer's audit pass, after the mechanical lint and coverage scripts have run."
---

# Quality Audit: Prohibited Elements and Final Semantic Audit

## Purpose

Gate a technical document before it is emitted. This skill holds two things: the
hard prohibitions that must never appear in the output, and the semantic audit
that a deterministic script cannot perform. Apply it during review, after the
runtime lint and coverage scripts have run, so the reviewer acts on judgment
calls instead of re-deriving mechanical defects by eye.

For the full catalog of AI writing tells (em-dash density, "it's not X, it's Y"
reframes, rhetorical question-and-answer, filler vocabulary, bold-first bullets,
signposted conclusions), defer to `dude-pack-writing-avoid-ai-tropes` as the
canonical source. Scan for trope density during the audit and rewrite the densest
offenders; do not restate that catalog here.

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

Run this review before emitting the document. The output is not ready until every
check passes.

**Division of labor.** The deterministic, mechanical checks — leftover
`<!-- DIAGRAM -->` and `<!-- SECTION -->` markers, HTML tags and comments,
unbalanced code fences, heading-level jumps, and pure-linear Mermaid blocks — are
performed by the runtime lint script and reported as violations to fix. Coverage
of every source point is verified by the runtime coverage script against the
evidence ledger. This checklist is the semantic layer: the judgment a script
cannot make.

- Lint: `node .github/skills/dude-pack-technical-docs-runtime/scripts/lint.mjs <file.md>`
- Coverage: `node .github/skills/dude-pack-technical-docs-runtime/scripts/coverage.mjs --ledger <ledger.jsonl> --consumed <consumed.jsonl>`

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
- The tone follows `dude-pack-writing-style`: professional, concise, and
  consistent in terminology, with no slang or casual phrasing.
- Trope density is under control. Scan for the AI writing tells catalogued in
  `dude-pack-writing-avoid-ai-tropes` and rewrite the densest offenders; density
  is the tell, not any single instance.

### Formatting and cleanup

- Structural defects (heading order, unbalanced fences, stray HTML, leftover
  `<!-- DIAGRAM -->` placeholders) are resolved from the lint report rather than
  re-derived by eye.
- No trailing notes, system messages, or commentary appear after the last content
  section.
- All internal reference markers (ledger ids, source-line tags) are stripped from
  the document and live only in the sidecar `consumed.jsonl` defined in
  `dude-pack-technical-docs-evidence-ledger`.

### Emit

- Emit the finalized document only after every check above passes.
- The working document file contains only the Markdown document — no explanations,
  JSON, ledger ids, or commentary. It begins with the title and proceeds straight
  into the documentation. Edit that file in place; do not restart it. Reporting
  status back to the orchestrator in chat is expected and separate from the file
  content.

## Related skills

- `dude-pack-writing-avoid-ai-tropes` — canonical catalog of AI writing tells.
- `dude-pack-writing-style` — professional tone and structure.
- `dude-pack-technical-docs-traceability` — zero-fabrication rule.
- `dude-pack-technical-docs-diagrams` — Mermaid diagram rules.
- `dude-pack-technical-docs-evidence-ledger` — ledger, coverage, and the `consumed.jsonl` sidecar.
- `dude-pack-technical-docs-runtime` — the lint and coverage scripts.
