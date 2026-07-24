---
description: Generate or update a traceable technical document from any mix of sources.
agent: dude-pack-technical-docs-writer
---

Generate a technical document from the attached sources. The sources may be any mix of kinds: a repository or source tree, a transcript, meeting or scratch notes, a rough draft, an existing Markdown document, or a combination. A repository is one supported source, not the only one; treat every kind as first-class.

1. Classify the sources by kind.
2. Run the evidence-ledger pipeline: intake each kind, extract the ledger, plan the outline, draft the document section by section, review the draft, then verify the coverage and lint gates.
3. Write the final document to a single Markdown file in the workspace.

If an existing technical document is provided alongside new material, run in update mode: reuse its section structure and merge the new information in place.
