---
description: "Inventory a software repository and produce a traceable technical document from its code, configuration, tests, schemas, and existing in-repo docs. Every statement grounds in the repository, and genuine gaps are flagged rather than invented."
name: "Document this repository"
argument-hint: "optional repo path (default: workspace root), plus scope, audience, and doc type; e.g. 'src/api as an API reference for integrators'"
agent: dude-pack-technical-docs-writer
---
Produce a technical document that describes what this repository actually contains, driving the technical-docs pipeline end to end. Read the repository as evidence and keep every claim traceable to where it came from.

**Target:** `$ARGUMENTS` names an optional repository path and scope. Leave it blank to document the current workspace root.

Steps:
1. Resolve the target as a `repo` source. If the argument names a path, use it; if it is blank, use the workspace root. If the user narrows the scope to a subdirectory or a subsystem, document only that; otherwise cover the whole tree. Handle the repository read-only and bounded, and never run a state-changing command.
2. Settle the audience and the document type before drafting: an architecture guide, an API reference, a developer guide, or a repository overview. Take them from the argument when stated; ask one question only when the choice materially changes the outline, and default to a repository overview for the whole tree otherwise.
3. Run the bounded, read-only repository intake from [the source-intake skill](../skills/dude-pack-technical-docs-source-intake/SKILL.md): inventory the tree, map the interface surface (exported and public symbols, endpoints, the CLI, environment variables, and configuration keys), then gather behavior evidence from tests, schemas, and existing in-repo docs. Emit atomic `R*` evidence, each carrying a precise `source-ref`: a repository path with a `#L<start>-L<end>` range or a trailing `:<symbol>`.
4. Run the evidence-ledger pipeline to completion: plan the section outline from the ledger, draft the document section by section, review it (diagrams plus semantic audit), and pass the coverage and lint gates. Write the result to a single Markdown file and name it for the user.
5. Ground every statement strictly. Each claim must trace to code, configuration, a test, or a schema. Mark a real gap with `[NEEDS CLARIFICATION: ...]`, and never infer behavior the repository does not show.

A repository is one supported source. To document it together with notes, a transcript, a rough draft, or an existing Markdown document, use the general `write-technical-document` prompt instead, which classifies a mix of sources into the same ledger.
