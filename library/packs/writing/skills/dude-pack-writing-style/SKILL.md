---
name: dude-pack-writing-style
description: "Use when drafting, revising, or reviewing professional documents and action-oriented guidance where tone, structure, readability, concision, or scannability matters. Triggers: 'improve the writing style', 'make this more professional', 'make this easier to follow', 'tighten this document', 'make this actionable', or 'write for an ADHD reader'."
---

# Professional Writing Style

Use this skill to make human-facing writing clear, cohesive, and easy to act on.
It defines positive choices for voice, structure, and task readability. Defer to
`dude-pack-writing-avoid-ai-tropes` for the bundle's canonical catalog of AI
writing tells and patterns to remove.

## Match the form to the reader's job

Choose the document shape before editing individual sentences. Explanatory
documents need enough connective prose to show why facts relate. Instructions
and operational responses should expose the next useful action quickly.

- Use paragraphs for concepts, rationale, cause and effect, and tradeoffs.
- Use numbered lists for ordered work and bullets for genuinely parallel items.
- Use tables when readers need to compare several items across the same fields.
- Put commands, paths, code, and literal values in the format readers can use
  directly.
- Do not force prose-first structure onto a response whose main purpose is to
  provide an immediate command, decision, or next step.

## Voice and language

Write as one informed human author. The tone should be direct, professional,
neutral, and appropriate for the audience rather than robotic or promotional.

- Prefer active voice and concrete verbs.
- Use second person for instructions and direct guidance. Use neutral
  explanatory prose elsewhere.
- Use imperative mood for steps: "Select **Start**," not "The user should
  select **Start**."
- Present verified information as facts without narrating meetings, transcripts,
  prompts, or the writing process. Preserve attribution when the source matters.
- Use inclusive, gender-neutral language and literal wording that translates
  well across cultures.
- Use standard American English, a single space after periods, and Oxford
  commas. Avoid exclamation points unless the quoted content requires one.
- Expand unfamiliar acronyms on first use and keep terminology consistent.

## Concision with context

Remove waste without removing the relationships that make the material
understandable. The clearest version is not always the shortest version.

- Consolidate repeated source material and state each idea once unless
  traceability requires repetition.
- Split overloaded sentences, but do not reduce complete explanations to clipped
  fragments or bare labels.
- Give a list or table a short introduction when readers need context to
  interpret it. Skip that introduction when the list itself is the requested
  answer or procedure.
- Prefer direct causal constructions. For example, "Caching reduces repeated
  queries" is clearer than "By using caching, repeated queries are reduced."
- Remove filler transitions and announced summaries. End with the last
  substantive point or a concrete next action.
- Preserve honest uncertainty. Remove empty hedging, but never turn an unknown
  into a confident claim.

## Document structure

The final artifact should read as one contiguous work, even when it was drafted
in stages. Structure should help retrieval rather than advertise the template.

- Use one title and one final version of each section. Do not restart the
  document, duplicate sections, or include competing drafts.
- Choose headings from the reader's questions and tasks. Use standard Markdown
  and apply bold emphasis sparingly.
- Keep paragraphs readable; two to four sentences is a useful default, not a
  quota.
- Use concise tables only when shared columns improve comparison. Do not repeat
  the same facts in both a table and prose.
- Put source code and literal examples in fenced code blocks with a language
  identifier when known.
- Use a Mermaid diagram for meaningful branching, retries, loops, parallel work,
  or complex routing. Use prose or numbered steps for a simple linear sequence.
- Keep planning notes, audits, and drafting scaffolds out of the final artifact.

## Action-oriented guidance

When the reader needs to complete work, optimize for starting and resuming. Keep
the current state visible so the response does not depend on working memory.

1. Lead with the answer or smallest useful next action when it is safe to do so.
2. Break multi-step work into bounded numbered steps, each with one clear
   outcome.
3. Finish the current issue before introducing unrelated follow-up work.
4. Report progress with a concrete result and identify the next incomplete step.
5. Describe failures matter-of-factly: state the observed symptom and location,
   then the supported cause and fix. Distinguish evidence from hypotheses.

Keep short lists short. When a list becomes difficult to scan, group it by
priority or by "do now" and "later" instead of presenting one long unranked set.
If work remains for the reader, end with one action they can start immediately.
Do not manufacture a next step after the task is complete.

Give time estimates only when the reader asks for one or needs one to choose a
path. Use concrete units, state the assumptions that affect the estimate, and
avoid invented precision.

## When another constraint wins

These are defaults, not reasons to damage the requested artifact.

- Explain fully when the reader asks for an explanation or walkthrough.
- Put safety context and confirmation before destructive or irreversible work.
- Ask one focused question when genuine ambiguity would make action unsafe or
  wasteful.
- After repeated failed fixes, stop varying the patch and identify the assumption
  that the evidence now calls into question.
- Follow the requested format and applicable system, repository, and workflow
  rules when they conflict with this skill.

## Final pass

Before sending or publishing, check that:

1. The opening gives the reader useful content rather than announcing the act of
   writing.
2. The structure matches the reader's job and uses prose, lists, tables, code,
   and diagrams deliberately.
3. Each fact appears once, terminology is consistent, and uncertainty remains
   explicit.
4. The completed result or current state is visible without reconstructing prior
   messages.
5. The ending contains the last substantive point or one concrete next action,
   with no generic recap or invitation for more work.
