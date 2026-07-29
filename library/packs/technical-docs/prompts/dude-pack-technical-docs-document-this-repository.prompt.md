---
description: "Inventory a software repository and produce a traceable technical document from its code, configuration, tests, schemas, and existing in-repo docs. Every statement grounds in the repository, and genuine gaps are flagged rather than invented."
name: "Document this repository"
argument-hint: "optional repo path (default: workspace root), plus scope, audience, and doc type; e.g. 'src/api as an API reference for integrators'"
agent: dude-pack-technical-docs-writer
---
Produce a technical document that describes what this repository actually contains, driving the technical-docs pipeline end to end. Read the repository as evidence and keep every claim traceable to where it came from.

**Target:** `$ARGUMENTS` names an optional repository path and scope. Leave it blank to document the current workspace root.

Steps:
1. Resolve the target as a `repo` source. If the argument names a path, use it; if it is blank, use the workspace root, which registers as the reserved `@root` anchor. If the user narrows the scope to a subdirectory or a subsystem, register only that directory; otherwise register the whole tree. Handle the repository read-only and bounded, and never run a state-changing command.
2. Settle the audience and the document type before drafting: an architecture guide, an API reference, a developer guide, or a repository overview. Take them from the argument when stated; ask one question only when the choice materially changes the outline, and default to a repository overview for the whole tree otherwise.
3. Register the run once with `source-manifest.mjs`: an explicit `--mode create`, `replace`, or `update`, a `--workdir`, the `--output` path, and `--repo <dir>`. Registration fixes source identity, containment and alias rules, the expected target state, and all 17 limits. The work directory and the output path are excluded from traversal, so they are skipped rather than re-ingested.
4. Run `repo-inventory.mjs` with `--start 1` for the repository, per [the source-intake skill](../skills/dude-pack-technical-docs-source-intake/SKILL.md). The inventory accounts for **every** encountered path as `admitted`, `skipped`, or `rejected`, hashes every admitted file, and builds deterministic `R*` work units whose members are exact file line ranges. It never follows a symlink. If it exits `1`, the inventory is incomplete: read its `limitHits` and violations, fix the cause, and rerun. Do not proceed on a partial inventory.
5. Extract one result per `R*` unit to `<workdir>/results/<UnitId>.json`, reading exactly the member line ranges that unit names and nothing else. Every evidence record carries `source-id`, `source-kind: repo`, `source-chunk`, and a `source-ref` of the form `<repo ref>:<path>#L<start>-L<end>` that falls inside its unit's own member span. A unit with nothing documentable gets a `no-documentable-evidence` result and a reason, never a fabricated entry.
6. Index and merge with `merge-ledger.mjs --mode index` (one `--unit-manifest` per registered Source) followed by `--mode merge` against that index alone. Then run `extraction-audit.mjs --result-index`, `ledger-digest.mjs`, the plan, and `coverage.mjs --mode outline` to prove every ledger id is assigned exactly once.
7. Draft section by section with strict `consumed.jsonl` records, run coverage and lint at `--stage pre-review`, review the pre-gated draft and emit `review.json`, then run both gates again at `--stage final`. Finish with `finalize.mjs`, which verifies the whole chain, revalidates the expected target immediately before publication, and atomically publishes the registered output. Name that file for the user.
8. Ground every statement strictly. Each claim must trace to code, configuration, a test, or a schema. Mark a real gap with `[NEEDS CLARIFICATION: ...]`, and never infer behavior the repository does not show.

**Mutation rule:** any change to the repository, an inventory, a result, the index, the ledger, the outline, a consumed record, the draft, a report, or the expected target invalidates that artifact and every gate downstream of it. A post-review edit always requires a new `review.json` and a fresh run of both final gates.

**Writing pack:** optional. Defer to `dude-pack-writing-style` and `dude-pack-writing-avoid-ai-tropes` when they are installed; otherwise the local writing fallback in `dude-pack-technical-docs-pipeline` is complete on its own.

A repository is one supported source. To document it together with notes, a transcript, a rough draft, or an existing Markdown document, use the general `write-technical-document` prompt instead, which registers a mix of sources into the same ledger.
