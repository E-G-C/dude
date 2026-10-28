---
name: writing
description: "Write plain, concise, actionable documents, feature definitions, and user replies, and remove common AI writing tells."
use-cases: [writing]
provides:
  agents: []
  skills:
    - dude-pack-writing-avoid-ai-tropes
    - dude-pack-writing-style
---

# Writing Pack

Complementary prose-quality skills for any human-facing text the bundle produces:
READMEs, docs, news and blog posts, release notes, PR and commit descriptions,
feature specs and plans, user replies, progress reports, reviews, handoffs,
agent and skill descriptions, UI copy, and email.

## Provides

- `dude-pack-writing-avoid-ai-tropes` — the canonical reference for AI writing
  tells and how to remove them. Triggers on requests like "make this sound less
  like AI", "humanize this", "remove the AI tropes", "de-slop this", "too many
  em dashes", or "why does this read like ChatGPT".
  Ships `repetition.mjs`, a deterministic cross-file repetition check.
- `dude-pack-writing-style` — positive guidance for professional voice,
  plain-language definitions, document structure, readable explanations, and
  action-oriented replies.
  Triggers on requests like "improve the writing style", "make this more
  professional", "tighten this document", or "make this easier to follow".

## When installed

Other skills and agents can defer to this pack for writing voice and readability.
Core dispatch carries both skills for human-facing prose, including definition
work and specialist handoffs. Shared writing rules also cover direct user
replies. Keep required detail, evidence, and safety checks; shorten the wording,
not the obligations.

The two skills are self-contained and have no dependencies, so the pack pairs
with any other pack. It complements `newsroom` article drafting and `docsy`
content work in particular.

The readability additions draw on
[`ayghri/i-have-adhd`](https://github.com/ayghri/i-have-adhd/blob/main/skills/i-have-adhd/SKILL.md)
(MIT): make starting easy, keep current state visible, and reduce distractions.
These principles extend the existing skills; they do not add an imported skill,
a session mode, or assumptions about the reader.

The trope catalog also draws on Wikipedia's
[Signs of AI writing](https://en.wikipedia.org/w/index.php?title=Wikipedia:Signs_of_AI_writing&oldid=1382312561)
field guide (CC BY-SA 4.0; revision of 2026-10-27) and
[`blader/humanizer`](https://github.com/blader/humanizer/blob/d4b81278e6604e237bf32f0f7ce5c217aee94269/SKILL.md)
(MIT; v3.1.0). The skill restates their patterns in its own words for general
prose and treats them as editing heuristics. It omits signs specific to
Wikipedia markup and editing processes and imports neither source.

## Install / remove

```bash
@dude add pack writing
@dude remove pack writing
```
