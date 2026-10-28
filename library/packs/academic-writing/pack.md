---
name: academic-writing
description: "Academic assignments, discussion posts, and APA-supported student writing grounded in assigned readings, with independent grammar and evidence checks and reviewable coursework companions."
use-cases:
  - academic-writing
  - apa-citations
  - coursework
provides:
  agents: [dude-pack-academic-writing-deliverable-verifier, dude-pack-academic-writing-writer]
  instructions: [dude-pack-academic-writing-coursework]
  skills: [dude-pack-academic-writing-foundation]
---

# Academic Writing

Reusable coursework guidance for assignments and discussions, with APA 7 source verification, student-appropriate depth, course-context isolation, one Markdown review draft per assignment question, user-confirmed content merges into one consolidated APA-formatted Word document as the official assignment draft and primary final deliverable, required worked-solution Markdown companions for problem answers, and conditional workbook and code deliverables.

Explicit task and instructor requirements govern citation style and output format. The pack also provides read-only academic deliverable findings. Assignment drafts are checked by default before approval and again after an approved merge; other writing is checked on request. Deterministic evidence is preferred where applicable, with contextual FIX/KEEP decisions and one bounded writer correction and recheck. Its verifier does not edit, approve, or grant merge authority.

## Prerequisites

Install Dude and its `writing` pack first. This pack reuses `dude-pack-writing-style` and `dude-pack-writing-avoid-ai-tropes`; it does not bundle copies. Compose does not install these dependencies automatically.

Python coursework that uses code requires `uv` and the dependencies selected for that task. They are not required for prose-only answers.

See [README.md](README.md) for contents, installation, and course setup.
