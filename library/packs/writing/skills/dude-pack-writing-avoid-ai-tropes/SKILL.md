---
name: dude-pack-writing-avoid-ai-tropes
description: "Use when writing, editing, or reviewing human-facing prose: docs, posts, release notes, PRs, agent and skill descriptions, UI copy, or email. Triggers: 'make this sound less like AI', 'remove AI tells/tropes', 'de-slop this', 'too many em dashes', 'sounds robotic/generic/salesy', or 'why does this read like ChatGPT'."
---

# Avoid AI Writing Tropes

This is the bundle's canonical guide to AI writing tropes. Other skills should
defer to it rather than maintain competing lists.

**Judge density, repetition, and context.** An isolated phrase can work well.
These are editing heuristics; they cannot prove whether an author used AI.

## Editing pass

1. Draft naturally, then scan for repeated patterns below.
2. Replace the densest offenders with direct, specific language. Remove filler
   without substituting another ornate phrase.
3. Check that meaning, evidence, personality, and sentence variety survived.
   Avoid turning every sentence into the same clipped shape.

## Preserve meaning

- Keep official titles, product names, quotations, and link labels unchanged;
  edit the surrounding prose.
- Keep factual lists, chronology, substantive feature descriptions, genuine
  comparisons, and real formulas or useful technical shorthand.
- Preserve honest uncertainty, warranted cautions, warmth, humor, and useful
  invitations such as "Bring your questions to AI Office Hours."
- Treat corrupted characters, editor control codes, broken tables, and typos
  as ordinary cleanup, separately from trope review.

## Patterns to revise

### Word choice

- Replace inflated vocabulary ("delve", "leverage", "empower", "tapestry"),
  vague praise ("powerful", "game-changing"), and abstract noun clusters with
  the concrete action or fact.
- Cut significance-padding adverbs ("quietly", "fundamentally") and empty
  promises such as "actionable insights" unless the text supplies an action.
- Prefer verbs: "implement" over "facilitate the implementation of". Use "is"
  when "serves as" or "represents" adds nothing.
- Remove stacked hedges ("may", "might", "generally") while retaining genuine
  uncertainty. Keep technical terms when they carry necessary meaning.

### Sentence formulas

- Repeated reframes: "not X, but Y", "Not X. Not Y. Just Z.", and
  "goes beyond X: it is about Y". State the claim directly.
- Manufactured drama: self-answered questions ("The result? Devastating."),
  punchy fragment chains, repeated sentence openings, and stacked tricolons.
- Empty scaffolding: "it's worth noting", "Moreover", "At its core", and
  trailing claims such as "highlighting its importance".
- False ranges and audience sweeps: "from innovation to transformation" or
  "whether you're a developer, leader, or curious beginner".
- Slogan equations ("Right tool + right problem = magic") that substitute
  a promise for an explanation. Give the practical advice instead.

### Tone

- Cut scene-setting, flattery, and assistant boilerplate: "In today's
  fast-paced world", "Great question", "Sure, here's", and
  "No event would be complete without...".
- Replace false suspense ("Here's the kicker"), teacherly setups
  ("Let's unpack this"), and forced analogies with the useful information.
- Remove scripted rescue: assume confusion, amplify difficulty, then present
  an ordinary resource as salvation. Describe the resource and its use;
  keep questions that genuinely help readers choose.
- Avoid performative vulnerability, invented concept labels, borrowed
  authority from company name-drops, and world-changing claims about narrow
  improvements. State what changed and for whom.
- Cut stock apologies, gratuitous moral caveats, and forced both-sides balance.
  Own actual mistakes; keep contrasts and cautions that affect a decision.

### Structure and formatting

- Use em dashes, bold labels, and emoji sparingly. Prefer straight quotes and
  `->` to decorative Unicode where protected wording does not require it.
- Choose paragraphs, lists, tables, and headings for the reader's task.
  Avoid template sections or disguising a list as "The first... The second...".
- Replace promotional titles ("Unlocking", "The Ultimate Guide") with
  descriptive ones.
- Vary sentence length naturally. Do not force uniform rhythm or replace
  connected explanations with fragments.

### Repetition and summaries

- State each point once. Cut repeated paragraphs, overworked metaphors,
  section-by-section recaps, and a single argument stretched across a document.
- Remove hollow endings ("Only time will tell"), announced conclusions, and
  repeated inspirational calls to action. End on substance or one useful action.
- Drop automatic sign-offs such as "I hope this helps" when they add nothing;
  preserve genuine invitations and warmth.
- Summarize content actually read. Repeating titles or promising "perspectives"
  does not explain a resource. Label unread collections as resource lists;
  never invent their takeaways.

## Match claims to evidence

- Distinguish what a feature does, what it aims to improve, and what has
  demonstrably improved. A list of shipped projects shows activity, not a
  productivity gain.
- Support outcomes with real examples, quotations, or measurements. Qualitative
  evidence can suffice; every claim does not need a metric. Without evidence,
  describe the capability or label the benefit as an aim.
- Never invent statistics, citations, testimonials, or results. Name sources
  instead of hiding behind "experts say".

## Cross-file repetition check

Run from the repository root:
`node .github/skills/dude-pack-writing-avoid-ai-tropes/repetition.mjs <file> <file> [...] [--min-words 8] [--min-files 3]`.

The tool reads only named files and ignores fenced code and inline code spans.
Defaults: phrases of at least 8 words appearing in at least 3 files. Exit codes:
`0` no findings, `1` findings, `2` usage or read error.

The command reports; it does not decide. A reviewer judges each finding,
including deliberate contract wording that should remain identical.
