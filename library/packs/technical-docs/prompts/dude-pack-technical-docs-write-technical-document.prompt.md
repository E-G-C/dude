---
description: Generate or update a traceable technical document from any mix of sources.
agent: dude-pack-technical-docs-writer
---

Generate a technical document from the attached sources. The sources may be any mix of kinds: a repository or source tree, a transcript, meeting or scratch notes, a rough draft, an existing Markdown document, or a combination. A repository is one supported source, not the only one; treat every kind as first-class.

Run the canonical sequence end to end:

1. **Register once.** Run `source-manifest.mjs` with an explicit `--mode create`, `replace`, or `update`, a `--workdir`, and the `--output` path. Registration resolves every source identity, containment and alias rule, the expected target state, and all 17 limits. Use `--update-document` exactly once, and only for `--mode update`, pointing at the same path as `--output`. Never hand-edit `sources.json`.
2. **Segment each source separately.** One command per registered Source: `preprocess` then `chunk` for transcript, notes, and draft sources; `headings` then `chunk` for an existing document; `repo-inventory` for a repository. Keep independent `C`, `E`, and `R` ordinal counters, each starting at `1`, and chain each producer's `nextOrdinal` into the next `--start`. An incomplete repository inventory exits `1` and stops the run.
3. **Extract one result per unit** to `<workdir>/results/<UnitId>.json`, with an evidence fragment when the unit yields evidence. A unit with nothing documentable gets a `no-documentable-evidence` result and a reason, never a fabricated entry.
4. **Index, then merge.** Run `merge-ledger.mjs --mode index` with one `--unit-manifest` for every registered Source, then `merge-ledger.mjs --mode merge` against that index alone. The index is the only input merge reads.
5. **Reconcile and plan.** Run `extraction-audit.mjs --result-index`, then `ledger-digest.mjs`, then plan `outline.md` with its `ledger-sha256:` line and prove exact-once assignment with `coverage.mjs --mode outline`.
6. **Draft, then gate, then review, then gate again.** Draft section by section with strict `consumed.jsonl` records — one per ledger id, naming a heading the document actually contains. Run `coverage.mjs --mode document --stage pre-review` and `lint.mjs --stage pre-review`. Review the pre-gated draft and emit `review.json`. Then run both gates again at `--stage final` against the reviewed document.
7. **Finalize.** Run `finalize.mjs` with the registry, the reviewed draft, the consumed manifest, all six gate reports, and the review. It verifies the chain, re-reads every registered file source, revalidates the expected target immediately before publication, and atomically publishes to the registered output. Nothing else writes the final document.

**Mutation rule:** any change to a source, unit, result, index, ledger, outline, consumed record, draft, report, or expected target invalidates that artifact and every gate downstream of it. A post-review edit always requires a new `review.json` and a fresh run of both final gates.

**Update mode:** when an existing technical document is provided alongside new material, register it with `--update-document`, reuse its heading structure when planning, and merge the new information in place. Prior content is preserved unless the new ledger contradicts it.

**Writing pack:** optional. When `dude-pack-writing-style` and `dude-pack-writing-avoid-ai-tropes` are installed, defer to them for prose. When they are not, the local writing fallback in `dude-pack-technical-docs-pipeline` is complete on its own and the run is unchanged.
