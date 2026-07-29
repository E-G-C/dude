---
name: dude-pack-technical-docs-runtime
description: "Use when a technical-docs pipeline step needs one of its eleven deterministic Node commands, or when wiring or debugging them: source-manifest (register sources, output mode, and limits), preprocess, headings, chunk, and repo-inventory (segment one source at a time), merge-ledger (index and merge extraction results into the ledger), extraction-audit (extraction backstop), ledger-digest (planner prep), coverage (coverage gate), lint (structural gate), and finalize (publish the document). All use Node built-ins only, fail closed, and never edit an input, with one exception: in update mode the registered update target is also the document finalize publishes."
---

# Technical Docs Runtime — Deterministic Commands

These are the deterministic Node commands behind `dude-pack-technical-docs-pipeline`.
Each one does the mechanical, reproducible work — registering sources, parsing,
budgeting, hashing, indexing, reconciling, and publishing — so the model spends its
budget on semantic judgment instead of bookkeeping.

Three invariants hold for every command:

- **Node built-ins only.** No dependency and no network access.
- **Inputs are not edited.** A command reads its declared inputs and writes only
  the outputs it was told to write. It never edits, moves, or deletes an input,
  with one exception: in `update` mode the single `--update-document` Source is
  also the registered output, and `finalize.mjs` replaces it by atomic rename
  after revalidating its expected bytes.
- **Fail closed.** An invalid option, unsafe path, alias, malformed record, stale
  digest, or exhausted bound stops the command instead of producing partial output.
  A failed write leaves no partial replacement and no temporary artifact.

`<rt>` below means `.github/skills/dude-pack-technical-docs-runtime/scripts` after
installation. Invoke every command as `node <rt>/<command>.mjs ...`.

The data contracts these commands read and write — extraction results, the result
index, `ledger.jsonl`, the Outline, and `consumed.jsonl` — are defined in
`dude-pack-technical-docs-evidence-ledger`. The order the gates run in is owned by
`dude-pack-technical-docs-pipeline`.

## Workspace root and portable paths

Every command requires `--workspace-root <dir>`. The command resolves that argument,
rejects a symlinked root or root component, requires an existing directory, takes its
canonical real path, and keeps that host path in memory only. `sources.json` persists
`workspaceRoot: "@root"` and workspace-relative POSIX paths, so an intact workspace can
be relocated and the run still validates beneath the newly reconstructed root.

`@root` is the reserved anchor and may be used only by a repository Source that is the
workspace root itself. Every other persisted path is a nonempty normalized
workspace-relative POSIX path with no absolute form, backslash, NUL, empty segment,
`.` segment, or `..` segment. Persisted artifacts carry no host path, timestamp, or
random id; only non-persisted stderr diagnostics may name the canonical host path.

## Shared module

`lib/runtime.mjs` is internal to this skill, not a public skill of its own. It owns
root resolution, strict option and numeric validation, bounded UTF-8/JSON/JSONL
readers, versioned schema validation, canonical containment and alias checks, safe
segment-by-segment parent creation, SHA-256 hashing and changed-during-read detection,
deterministic ordering, atomic and no-replace publication, Unicode code-point
budgeting, CommonMark fence state, and exit-code mapping. Every command uses it, and
nothing re-implements those rules.

## Command order

| Step | Command | Produces |
|---|---|---|
| 1 | `source-manifest.mjs` | `sources.json` |
| 2 | `preprocess.mjs`, `headings.mjs`, `chunk.mjs`, `repo-inventory.mjs` | per-source `clean.txt`, `headings.json`, `C*`/`E*` units and `chunks.json`, `inventory.json` |
| 3 | (the extractor) | `<workdir>/results/<UnitId>.json` and evidence fragments |
| 4 | `merge-ledger.mjs --mode index` | `results.json` |
| 5 | `merge-ledger.mjs --mode merge` | `ledger.jsonl` |
| 6 | `extraction-audit.mjs` | `extraction.json` |
| 7 | `ledger-digest.mjs` | `digest.json` and `digest.md` |
| 8 | `coverage.mjs --mode outline` | `outline-coverage.json` |
| 10 | `coverage.mjs --mode document --stage pre-review`, `lint.mjs --stage pre-review` | pre-review reports |
| 12 | `coverage.mjs --mode document --stage final`, `lint.mjs --stage final` | final reports |
| 13 | `finalize.mjs` | the published document |

Steps 9 and 11 are the drafting and semantic review phases; they produce
`consumed.jsonl` and `review.json` and have no runtime command.

## Register the sources

### `source-manifest.mjs`

- **Purpose:** resolve source identity, work/output boundaries, output mode, expected
  target state, and all 17 effective limits exactly once, so nine downstream commands
  read one validated registry instead of reinterpreting raw paths.
- **Run:**

```bash
node <rt>/source-manifest.mjs \
  --workspace-root <dir> --mode <create|replace|update> \
  --workdir <dir> --output <file> \
  [--transcript <file>]... [--notes <file>]... [--draft <file>]... \
  [--document <file>]... [--update-document <file>] [--repo <dir>]... \
  [--limit-<name> <value>]... --out <sources.json>
```

- **Inputs:** at least one Source. `--mode` has no default and is never inferred from
  whether the target exists. `--update-document` is required exactly once for
  `update` and is forbidden for `create` and `replace`.
- **Outputs:** the schema-version-2 registry at `--out`. Sources are sorted by kind
  rank (`transcript`, `notes`, `draft`, `document`, `repo`), then role, then bytewise
  normalized path, and receive `S001`, `S002`, … from that order. `Source.ref` is
  derived and always equals `Source.path`; no flag supplies it. File Sources carry
  `sizeBytes` and `sha256`.
- **Expected target:** `create` records `state: absent`, `replace` records the exact
  existing bytes and digest, and `update` binds the target to the one registered
  `update-document` Source and records the same bytes and digest.
- **Refuses:** duplicate canonical paths or file identities, symlink inputs, unsafe
  roots, an output that aliases any Source (except the one update target), and any
  limit outside its range or violating a cross-field rule.
- **Exits:** `0` after atomically writing the registry; `2` for any invalid option,
  path, alias, mode, target state, bound, or empty Source set, replacing no output.

## Segment each source

Each of these commands processes exactly **one** registered Source. Sources are never
concatenated, so no unit loses its origin.

### `preprocess.mjs`

- **Purpose:** normalize one transcript, notes, or draft Source into cleaned text with
  a line map back to the original.
- **Run:** `node <rt>/preprocess.mjs --workspace-root <dir> --sources <sources.json> --source <S-id> --out <clean.txt> --json <preprocess.json>`
- **Behavior:** transcripts are parsed as WEBVTT or SRT blocks, so only real structure
  is removed: the `WEBVTT` signature block, genuine `NOTE`/`STYLE`/`REGION` blocks, cue
  identifiers, cue timings, and cue markup. Cue text that merely begins with `NOTE`,
  `STYLE`, or `REGION` is content and is preserved. Notes and drafts keep their text
  apart from newline normalization.
- **Outputs:** the cleaned text at `--out` and a Preprocessing Report at `--json`
  carrying `sourceId`, `sourceSha256`, `complete`, the output digest, the `lineMap`,
  and removal counts. `complete` must be true before chunking.
- **Exits:** `0` on success; `2` for an invalid option, path, identity, digest, or bound.

### `headings.mjs`

- **Purpose:** author the Heading Manifest for one existing-document Source so
  document evidence stays locatable.
- **Run:** `node <rt>/headings.mjs --workspace-root <dir> --sources <sources.json> --source <S-id> --out <headings.json>`
- **Behavior:** every heading records its level, parsed text, hierarchical path, and
  the line span it governs, so repeated or nested headings stay distinguishable.
  Headings inside matching fences are excluded, an unclosed or mismatched fence keeps
  its content fenced, and a closing ATX hash sequence is removed only when
  whitespace-delimited, so a heading such as `C#` survives.
- **Exits:** `0` on success; `2` for an invalid option, path, identity, digest, or bound.

### `chunk.mjs`

- **Purpose:** author deterministic, provenance-rich `C*` or `E*` units for one Source.
- **Run:** `node <rt>/chunk.mjs --workspace-root <dir> --sources <sources.json> --source <S-id> --start <positive-int> [--preprocess <preprocess.json>] [--headings <headings.json>] --outdir <dir>`
- **Inputs:** a transcript, notes, or draft Source requires `--preprocess` and forbids
  `--headings`; a document Source requires `--headings` and forbids `--preprocess`.
  The prefix is derived from the Source kind and cannot be supplied.
- **Outputs:** `<outdir>/<UnitId>.txt` for every unit plus a `chunks.json` manifest,
  built in an adjacent staged directory and published atomically to a destination that
  must be absent or already byte-identical. The manifest records `startOrdinal`,
  `nextOrdinal`, the budget, and per-unit `sizeBytes`, `sha256`, `codePoints`,
  `approximateTokens`, clean and source line ranges, `sourceRef`, and — for `E*` units
  — `headingPath`.
- **Budgeting:** splitting operates on Unicode code points, so a non-BMP character is
  never divided. Approximate tokens are `ceil(codePoints / 4)`, and overlap carried
  from the preceding unit counts **inside** the unit budget rather than on top of it.
  `E*` units never cross a heading boundary.
- **Ordinals:** `--start` is the first ordinal this invocation may use; the manifest's
  `nextOrdinal` is the first unused one. `C` and `E` each have their own run-wide
  sequence beginning at `1`.

### `repo-inventory.mjs`

- **Purpose:** complete, bounded, read-only accounting of one repository Source into
  deterministic `R*` work units.
- **Run:** `node <rt>/repo-inventory.mjs --workspace-root <dir> --sources <sources.json> --source <S-id> --start <positive-int> --out <inventory.json>`
- **Accounting:** every encountered descendant path gets exactly one disposition —
  `admitted`, `skipped`, or `rejected` — with a reason for every non-admitted entry.
  Symlinks are never followed for traversal or content reads. A descendant symlink is
  `skipped` only when its target resolves and is contained beneath both the canonical
  repository root and the canonical workspace root; otherwise it is `rejected`. A
  repository Source that is itself a symlink is invalid input. The registered work
  directory and output receive explicit skip dispositions rather than being re-ingested.
- **Work units:** every admitted ordinary text file is hashed and represented by
  non-overlapping member slices in normalized POSIX path and line order. Small adjacent
  slices may share a bounded unit; large files split only at line boundaries. A file
  containing a single line larger than one unit budget is an accounted `skipped` entry
  with reason `oversized-line`, which may coexist with `complete: true`. Member
  references are `<rootRef>:<path>#L<start>-L<end>`.
- **Ordinals:** the first repository uses `--start 1`; each later repository uses the
  preceding inventory's `nextOrdinal`. Unit IDs are exactly the contiguous ordinals in
  `[startOrdinal, nextOrdinal)`. A complete empty repository emits no unit and keeps
  `nextOrdinal === startOrdinal`. The `sourceWorkUnits` ceiling applies once to the
  run-wide `R*` sequence, not once per repository.
- **Exits:** `0` for a complete inventory; `1` after persisting a deterministic
  `complete:false` inventory when an unreadable entry, unsafe symlink, escaping path,
  changed-during-read file, per-file overflow, or bound is hit; `2` for an invalid
  invocation, registry, Source, root, or path detected before traversal.

## Index and merge the extraction

### `merge-ledger.mjs`

Two explicit modes. There is no positional or compatibility form.

- **`--mode index`** reads the registry and exactly one complete unit manifest for
  every registered Source, derives the exact conventional result path
  `<results-dir>/<UnitId>.json` for every expected unit, validates each result and its
  result-declared evidence fragment, and atomically authors `results.json`.

```bash
node <rt>/merge-ledger.mjs --workspace-root <dir> --mode index \
  --sources <sources.json> \
  --unit-manifest <manifest> [--unit-manifest <manifest>]... \
  --results-dir <results-dir> --out <results.json>
```

  The results directory must contain exactly the expected per-unit result files.
  Missing, duplicate, unexpected, stale extra, aliased, malformed, or changed files
  fail. Result paths are derived, never accepted from model output, and fragment paths
  are read from the result object rather than inferred from a filename.

- **`--mode merge`** reads only that index and the exact files it names. It verifies
  every indexed result's path, bytes, digest, identity, schema, and declared fragment,
  then atomically writes strict object-only `ledger.jsonl` ordered by index unit order
  and then numeric `F` ordinal. It never enumerates a directory, expands a glob, or
  rereads a unit manifest.

```bash
node <rt>/merge-ledger.mjs --workspace-root <dir> --mode merge \
  --index <results.json> --out <ledger.jsonl>
```

- **Exits:** `0` on success; `2` for invalid CLI, schema, alias, containment, or
  freshness input, including a missing `--index`, a missing indexed file, or a result
  set that omits an expected unit; `3` for a syntactically valid but empty
  expected-unit, result, or ledger set. Exits `2` and `3` leave prior output
  byte-for-byte unchanged.

### `extraction-audit.mjs`

- **Purpose:** independently revalidate the result index and reconcile Sources,
  expected units, results, examined members, fragments, ledger provenance, repository
  members, and recall density.
- **Run:**

```bash
node <rt>/extraction-audit.mjs \
  --workspace-root <dir> --sources <sources.json> \
  --ledger <ledger.jsonl> --result-index <results.json> \
  [--min-entries <int>] [--floor-per-1k <decimal>] [--ratio <decimal>] \
  --json <extraction.json>
```

- **Scope:** the density comparison is a gross-failure backstop. It catches a unit that
  yielded zero, near-zero, or far fewer entries than its peers. It does not prove every
  topic inside an otherwise healthy unit was captured.
- **Exits:** `0` when no unit is flagged; `1` after atomically replacing the report with
  `ok:false`; `2` for invalid CLI, threshold, schema, alias, or freshness input; `3` for
  an empty expected-unit, result, or ledger set.

### `ledger-digest.mjs`

- **Purpose:** author the exact planning digest pair so the planner only arranges tag
  groups into sections.
- **Run:** `node <rt>/ledger-digest.mjs --workspace-root <dir> --sources <sources.json> --ledger <ledger.jsonl> --out <digest.md> --json <digest.json>`
- **Outputs:** `digest.json` is the canonical machine representation and `digest.md` is
  its exact rendering. Every `decision` and `action` id routes exactly once to
  `Decisions and action items` and never appears in a tag group; every other ledger id
  appears once in exactly one tag group. Snippets collapse maximal Unicode whitespace
  to one space, trim both ends, and truncate to `limits.digestSnippetCodePoints` with a
  trailing `...`. Both outputs are regenerated together; mutating either invalidates
  the pair.
- **Exits:** `0` on success; `2` for invalid CLI, schema, alias, or provenance input;
  `3` for an empty ledger. Exits `2` and `3` leave both prior outputs unchanged.

## Gates

### `coverage.mjs`

Two modes. **The old `--ledger --consumed` invocation without a mode is not accepted.**

- **Outline mode** proves the planner assigned every ledger id to exactly one Outline
  section, and that the Outline's `ledger-sha256:` line matches the ledger it was
  planned against.

```bash
node <rt>/coverage.mjs --workspace-root <dir> --mode outline \
  --ledger <ledger.jsonl> --outline <outline.md> \
  --json <outline-coverage.json>
```

  Counts are `ledger`, `assigned`, `missing`, `unknown`, and `duplicate`.

- **Document mode** proves the drafter consumed every ledger id exactly once, into a
  section heading that actually exists in the evaluated document. `--stage` is required
  and is `pre-review` or `final`.

```bash
node <rt>/coverage.mjs --workspace-root <dir> --mode document \
  --stage <pre-review|final> \
  --ledger <ledger.jsonl> --consumed <consumed.jsonl> \
  --document <document.md> --json <coverage.json>
```

  Counts are `ledger`, `consumed`, `uncovered`, `dangling`, `duplicate`, and
  `missingSection`.

Each mode forbids the other mode's flags. Both bind the report to the exact bytes they
evaluated, so a stale Outline or stale report cannot authorize later work, and a
`pre-review` report can never satisfy a final-report requirement.

- **Exits:** `0` when coverage is exact; `1` after atomically replacing the report with
  `ok:false`; `2` for invalid CLI, schema, grammar, alias, or stale input; `3` for a
  syntactically valid but empty ledger or consumed set.

### `lint.mjs`

- **Purpose:** deterministic structural checks on one document revision, so the reviewer
  acts on real violations instead of re-reading the whole document.
- **Run:** `node <rt>/lint.mjs --workspace-root <dir> --sources <sources.json> --stage <pre-review|final> <document.md> --json <lint.json>`
- **Required:** `--workspace-root`, `--sources`, `--stage`, the positional document, and
  `--json`. **The old bare `lint.mjs <file>` form is not accepted.**
- **Checks:** leftover `<!-- DIAGRAM -->` and `<!-- SECTION -->` markers, any HTML
  comment or tag, unclosed CommonMark fences, empty headings, a missing top-level
  title, heading-level jumps, and purely linear Mermaid blocks. `[NEEDS CLARIFICATION`
  markers are counted, not flagged. Fence tracking is the shared CommonMark
  implementation, so a fence line using the other marker character does not close an
  open block, and a closer shorter than its opener does not close it either.
  `#### Diagram N – Flow` captions are transparent to the structural heading sequence.
- **Report:** stage-tagged and bound to the exact document and Source Registry bytes,
  with counts `headings`, `fences`, `clarificationMarkers`, and `violations`.
- **Exits:** `0` when clean; `1` after atomically replacing the report with `ok:false`;
  `2` for invalid CLI, schema, path, alias, or bound input; `3` for an empty document.

## Publish

### `finalize.mjs`

- **Purpose:** the one place every earlier claim about exact bytes is reconciled with
  what is on disk right now, and the only command that writes the final document.
- **Run:**

```bash
node <rt>/finalize.mjs \
  --workspace-root <dir> --sources <sources.json> \
  --draft <reviewed.md> --consumed <consumed.jsonl> \
  --extraction <extraction.json> \
  --outline-coverage <outline-coverage.json> \
  --pre-coverage <pre-review-coverage.json> \
  --pre-lint <pre-review-lint.json> --review <review.json> \
  --final-coverage <final-coverage.json> \
  --final-lint <final-lint.json>
```

- **Report chain:** all six gate reports must be present, correctly staged, `ok:true`,
  free of violations, and zero on their decisive counts. Extraction and both lint
  reports must bind these exact registry bytes; extraction, outline coverage, and both
  document-coverage reports must bind one identical ledger; the review must bind the
  supplied pre-review report bytes and the draft those reports evaluated; both final
  reports and the review must describe the supplied draft; and the final coverage
  report and the review must describe the supplied consumed manifest. Independently
  recomputable counts are re-reconciled, so a report edited after its gate ran fails.
- **Current state:** every registered **file** Source is re-read and must still match
  its registered digest. A repository Source is re-authorized as a contained,
  non-symlink directory; the registry carries no repository content digest, so its
  members are not re-hashed here — repository completeness is proven earlier by
  `repo-inventory.mjs` and `extraction-audit.mjs`.
- **Publication:** the update target is re-authorized against the registry, aliases are
  rechecked, a missing output parent is created one contained segment at a time, and the
  reviewed draft's exact bytes are published atomically — no-replace for `create`, and
  an adjacent atomic rename that revalidates `expectedTarget` for `replace` and `update`.
  The destination and mode come from `sources.json` and cannot be overridden.
- **Exits:** `0` after publication; `2` for invalid CLI, schema, path, alias, stale, or
  drifted input; `3` for an empty draft or consumed set. Exits `2` and `3` leave the
  registered output byte-for-byte unchanged.

## Limits

Only `source-manifest.mjs` accepts limit flags, and it persists every effective value
in `sources.json.limits`. No downstream command accepts an override. Each value is a
canonical decimal safe integer (`0|[1-9][0-9]*`) inside its inclusive range.

| `limits` field | Flag | Default | Min | Max |
|---|---|---:|---:|---:|
| `sourcesPerRun` | `--limit-sources-per-run` | 100 | 1 | 1,000 |
| `textSourceBytesPerFile` | `--limit-text-source-bytes-per-file` | 33,554,432 | 1 | 268,435,456 |
| `documentBytes` | `--limit-document-bytes` | 67,108,864 | 1 | 268,435,456 |
| `jsonBytesPerFile` | `--limit-json-bytes-per-file` | 16,777,216 | 1 | 67,108,864 |
| `jsonlBytesPerFile` | `--limit-jsonl-bytes-per-file` | 67,108,864 | 1 | 536,870,912 |
| `jsonlBytesPerLine` | `--limit-jsonl-bytes-per-line` | 1,048,576 | 1 | 16,777,216 |
| `jsonlRecords` | `--limit-jsonl-records` | 100,000 | 1 | 1,000,000 |
| `repositoryChildrenPerDirectory` | `--limit-repository-children-per-directory` | 10,000 | 1 | 100,000 |
| `repositoryTraversalDepth` | `--limit-repository-traversal-depth` | 64 | 1 | 256 |
| `repositoryEncounteredEntries` | `--limit-repository-encountered-entries` | 100,000 | 1 | 1,000,000 |
| `repositoryAdmittedFiles` | `--limit-repository-admitted-files` | 5,000 | 1 | 100,000 |
| `repositoryCandidateBytes` | `--limit-repository-candidate-bytes` | 268,435,456 | 1 | 17,179,869,184 |
| `repositoryBytesPerAdmittedFile` | `--limit-repository-bytes-per-admitted-file` | 33,554,432 | 1 | 268,435,456 |
| `sourceWorkUnits` | `--limit-source-work-units` | 20,000 | 1 | 200,000 |
| `unitApproximateTokens` | `--limit-unit-approximate-tokens` | 3,000 | 1 | 32,000 |
| `unitOverlapApproximateTokens` | `--limit-unit-overlap-approximate-tokens` | 200 | 0 | 8,000 |
| `digestSnippetCodePoints` | `--limit-digest-snippet-code-points` | 90 | 20 | 4,096 |

Cross-field rules: `jsonlBytesPerLine <= jsonlBytesPerFile`,
`repositoryChildrenPerDirectory <= repositoryEncounteredEntries`,
`repositoryAdmittedFiles <= repositoryEncounteredEntries`,
`repositoryBytesPerAdmittedFile <= repositoryCandidateBytes`, and
`unitOverlapApproximateTokens < unitApproximateTokens`. A violation exits `2` before any
dependent work. No limit silently clips successful work.

## Extraction-audit thresholds

| Flag | Field | Type | Default | Range |
|---|---|---|---:|---:|
| `--min-entries` | `minEntries` | canonical nonnegative integer | 2 | 0–1,000 |
| `--floor-per-1k` | `floorPer1k` | canonical decimal | 5 | 0–1,000 |
| `--ratio` | `ratio` | canonical decimal | 0.5 | 0–1 |

A canonical decimal is `(?:0|[1-9][0-9]*)(?:\.[0-9]{0,5}[1-9])?`: at most six fractional
digits, no redundant trailing zero, no sign, exponent, leading zero, `.5`, `5.`, or
`5.0`. At least one threshold must be greater than zero.

Thresholds apply only to validated `status: evidence` units; validated no-evidence units
stay in the completeness counts and are excluded from the calculations. A unit is
flagged when `entryCount < minEntries`, when `entryCount * 1000 / approximateTokens <
floorPer1k`, or when `density < ratio * medianDensity`. Comparisons use unrounded values
and equality passes. The relative comparison applies only when at least three evidence
units have positive token counts and their median density is positive. Any flagged unit
makes the gate `ok:false` and exits `1`.

## Exit codes

| Exit | Meaning | Persistence |
|---:|---|---|
| `0` | Success or passing gate | Atomically replace the declared output. |
| `1` | Completed failed gate, or a persisted incomplete inventory | Atomically replace the report or inventory with `ok:false` / `complete:false`; preserve data and final output. |
| `2` | Invalid CLI, schema, path, alias, containment, digest, bound, or stale input | Replace no declared output; remove every temporary artifact. |
| `3` | Syntactically valid but empty required expected-unit, result, ledger, consumed, or document set | Replace no declared output; emit no passing completeness report. |

## Cross-references

- `dude-pack-technical-docs-evidence-ledger` — the schemas these commands validate.
- `dude-pack-technical-docs-pipeline` — the canonical gate sequence and the mutation
  rule that decides what has to be rerun.
- `dude-pack-technical-docs-source-intake` — the Source Registry contract and the
  per-kind front door.
- `dude-pack-technical-docs-quality-audit` — the semantic review report the final gates
  bind to.
