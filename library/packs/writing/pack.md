---
name: writing
description: "Avoid AI writing tropes: the canonical source of truth for AI writing tells (em-dash overuse, robotic/salesy phrasing, generic structure) when producing human-facing prose."
provides:
  agents: []
  skills:
    - dude-pack-writing-avoid-ai-tropes
---

# Writing Pack

A prose-quality skill for any human-facing text the bundle produces — READMEs,
docs, news/blog posts, release notes, PR/commit descriptions, agent/skill
descriptions, UI copy, email.

## Provides

- `dude-pack-writing-avoid-ai-tropes` — the canonical reference for AI writing
  tells and how to remove them. Triggers on requests like "make this sound less
  like AI", "remove the AI tropes", "de-slop this", "too many em dashes", or
  "why does this read like ChatGPT".

## When installed

Other skills and agents can defer to it as the bundle-wide authority on writing
voice. It is self-contained and has no dependencies, so it pairs with any other
pack (it complements `newsroom` article drafting and `docsy` content work in
particular).

## Install / remove

```bash
@dude add pack writing
@dude remove pack writing
```
