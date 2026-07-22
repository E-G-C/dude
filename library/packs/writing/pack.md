---
name: writing
description: "Write clear, professional, actionable prose and remove common AI writing tells from human-facing content."
provides:
  agents: []
  skills:
    - dude-pack-writing-avoid-ai-tropes
    - dude-pack-writing-style
---

# Writing Pack

Complementary prose-quality skills for any human-facing text the bundle produces:
READMEs, docs, news and blog posts, release notes, PR and commit descriptions,
agent and skill descriptions, UI copy, and email.

## Provides

- `dude-pack-writing-avoid-ai-tropes` — the canonical reference for AI writing
  tells and how to remove them. Triggers on requests like "make this sound less
  like AI", "remove the AI tropes", "de-slop this", "too many em dashes", or
  "why does this read like ChatGPT".
- `dude-pack-writing-style` — positive guidance for professional voice,
  document structure, readable explanations, and action-oriented task output.
  Triggers on requests like "improve the writing style", "make this more
  professional", "tighten this document", or "make this easier to follow".

## When installed

Other skills and agents can defer to this pack for writing voice and readability.
The two skills are self-contained and have no dependencies, so the pack pairs
with any other pack. It complements `newsroom` article drafting and `docsy`
content work in particular.

## Install / remove

```bash
@dude add pack writing
@dude remove pack writing
```
