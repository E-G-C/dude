---
name: dude-pack-technical-docs-runtime
description: "Use when a technical-docs pipeline step needs its deterministic Node helper scripts, or when wiring or debugging them: preprocess and chunk (segment sources), extraction-audit (recall gate), merge-ledger (combine ledger fragments), ledger-digest (planner prep), headings (update-mode outline), coverage (coverage gate), lint (structural gate), and repo-inventory (repository intake). All are Node-built-in-only, read-only helpers behind the technical-docs pipeline."
---

# Technical Docs Runtime — Deterministic Helper Scripts

These are the deterministic Node scripts behind `dude-pack-technical-docs-pipeline`.
Each one does the mechanical, reproducible work — parsing, counting, budgeting,
grouping, and structural checking — so the model spends its budget on semantic
judgment instead of bookkeeping.

Two invariants hold for every script here:

- **Node built-ins only.** No dependencies, no network. They run on the Node the
  Dude bundle already assumes.
- **Read-only with respect to source material.** A script reads its inputs and
  writes only to the path you pass on `--out` / `--outdir`. It never edits, moves,
  or deletes the files it reads. `repo-inventory` is the strictest case: it is a
  read-only scanner.

The `ledger.jsonl` entry schema these scripts read and write — stable
chunk-prefixed `id`s, `source-chunk`, `type`, `tag`, and the `consumed.jsonl`
contract — is defined in `dude-pack-technical-docs-evidence-ledger`. The phase
each script belongs to, and the order the gates run in, is owned by
`dude-pack-technical-docs-pipeline`.

## Pipeline order

For a prose source (transcript, notes, draft, existing document): **preprocess →
chunk → extract → merge-ledger → extraction-audit → ledger-digest → plan → draft
→ coverage → lint**. For a repository source, `repo-inventory` replaces
preprocess/chunk as the front door and feeds the same extract step. In update
mode, `headings` supplies the prior document's outline to the planner.

## Segment (prose sources)

### `preprocess.mjs`

- **Purpose:** clean transcript/notes/text input — strip WEBVTT/SRT timestamps,
  cue identifiers, and voice/format markup, then normalize whitespace, preserving
  speaker content.
- **Run:** `node .github/skills/dude-pack-technical-docs-runtime/scripts/preprocess.mjs <input...> [--out <file>]`
- **Inputs:** one or more transcript, notes, plain-text, or Markdown files.
- **Outputs:** cleaned UTF-8 text to `--out` (or stdout when omitted), plus a JSON
  summary (`inputChars`, `outputChars`, approximate token counts, `removedTimestamps`,
  `removedTags`). The summary goes to stdout when `--out` is given, otherwise to
  stderr so piped stdout stays clean.

### `chunk.mjs`

- **Purpose:** split cleaned text into token-budgeted chunks with a small overlap,
  producing the unit of scale that one extractor call consumes.
- **Run:** `node .github/skills/dude-pack-technical-docs-runtime/scripts/chunk.mjs <clean.txt> --outdir <dir> [--budget <tokens>] [--overlap <tokens>] [--prefix C]`
- **Inputs:** one cleaned text file; optional `--budget` (default 3000 tokens),
  `--overlap` (default 200 tokens), and `--prefix` (default `C`) for the chunk-id
  prefix.
- **Outputs:** `chunk-NNN.txt` files plus a `chunks.json` manifest in `--outdir`,
  and the manifest JSON on stdout. Each manifest entry carries `id`, `file`, `chars`,
  and `approxTokens`. Exits non-zero when the input is empty after preprocessing.
  The chunk `id` prefix is what makes ledger ids unique per
  `dude-pack-technical-docs-evidence-ledger`.

## Recall gate

### `extraction-audit.mjs`

- **Purpose:** gross-failure recall backstop — flag any chunk whose ledger yield is
  near zero or far below its peers so the orchestrator re-extracts it before
  planning.
- **Run:** `node .github/skills/dude-pack-technical-docs-runtime/scripts/extraction-audit.mjs --ledger <ledger.jsonl> --chunks <chunks.json> [--chunks <existing/chunks.json> ...] [--min-entries <n>] [--floor-per-1k <n>] [--ratio <r>] [--json <out>]`
- **Inputs:** the `ledger.jsonl` (counted by each entry's `source-chunk`) and one or
  more `chunks.json` manifests; optional thresholds `--min-entries` (default 2),
  `--floor-per-1k` (default 5), and `--ratio` (default 0.5).
- **Outputs:** a JSON report on stdout (and `--json` when given) listing per-chunk
  density and any flagged chunks. Exits non-zero when at least one chunk is flagged,
  0 when every chunk clears the backstop. This checks extractor recall; the coverage
  gate below checks that extracted ids reached the document.

## Merge

### `merge-ledger.mjs`

- **Purpose:** concatenate the per-unit JSONL ledger fragments the extractor wrote
  into one ordered `ledger.jsonl`. Portable replacement for the old shell/PowerShell
  merge one-liner.
- **Run:** `node .github/skills/dude-pack-technical-docs-runtime/scripts/merge-ledger.mjs <input...> --out <ledger.jsonl>`
- **Inputs:** one or more JSONL fragment files and/or directories; a directory
  contributes its own `*.jsonl` files (non-recursive). Missing inputs are skipped
  silently.
- **Outputs:** the merged `ledger.jsonl` at `--out`, with entries ordered stably by
  parsed `id` (unparseable lines keep their order and follow the keyed block), plus
  a one-line summary on stderr. Ids are unique by contract, so nothing is
  de-duplicated. Exits non-zero when no entries are found across all inputs.

## Plan prep

### `ledger-digest.mjs`

- **Purpose:** reduce the ledger to a compact, pre-grouped digest for the planner —
  ids grouped by `tag` in first-appearance order, with the decision/action and
  open-question ids pre-listed and one example snippet per tag.
- **Run:** `node .github/skills/dude-pack-technical-docs-runtime/scripts/ledger-digest.mjs --ledger <ledger.jsonl> [--out <digest.md>] [--snippet <chars>]`
- **Inputs:** the `ledger.jsonl` (reads each entry's `id`, `type`, `tag`,
  `importance`, and `text`); optional `--snippet` (default 90) for example length.
- **Outputs:** a Markdown digest on stdout, or to `--out` with a one-line stderr
  summary. The digest is a lighter input for the planner; the full ledger stays
  available for detail. Section routing follows `dude-pack-technical-docs-pipeline`.

## Update mode

### `headings.mjs`

- **Purpose:** extract just the heading outline (ATX and setext) from an existing
  Markdown document, so the planner can reuse its section structure in update mode
  without reading the whole prior document.
- **Run:** `node .github/skills/dude-pack-technical-docs-runtime/scripts/headings.mjs <doc.md> [--out <file>]`
- **Inputs:** one existing Markdown document. `#` inside fenced code blocks and a
  leading YAML front-matter block are ignored.
- **Outputs:** the heading list, one per line normalized to ATX form, on stdout and
  to `--out` when given. An empty outline is a valid result (exit 0).

## Coverage gate

### `coverage.mjs`

- **Purpose:** prove no source detail was dropped — compare the ledger ids against
  the ids the drafter recorded consuming, and report anything uncovered, dangling,
  or duplicated.
- **Run:** `node .github/skills/dude-pack-technical-docs-runtime/scripts/coverage.mjs --ledger <ledger.jsonl> --consumed <consumed.jsonl> [--json <out>]`
- **Inputs:** the `ledger.jsonl` and the `consumed.jsonl` manifest, both per
  `dude-pack-technical-docs-evidence-ledger`. Each line may be a JSONL object, a JSON
  string, or a bare id token.
- **Outputs:** a JSON report on stdout (and `--json` when given) with the uncovered,
  dangling, and duplicate-id lists. Exits non-zero when anything is uncovered,
  dangling, or has duplicate ledger ids; 0 when coverage is complete.

## Lint gate

### `lint.mjs`

- **Purpose:** deterministic structural checks on the finished document, catching the
  mechanical defects a semantic audit tends to miss.
- **Run:** `node .github/skills/dude-pack-technical-docs-runtime/scripts/lint.mjs <file.md> [--json <out>]`
- **Inputs:** one finished Markdown document.
- **Outputs:** a JSON report on stdout (and `--json` when given) flagging leftover
  `<!-- DIAGRAM -->` / `<!-- SECTION -->` markers, HTML comments and tags, unbalanced
  code fences, a missing top-level title, heading-level jumps, and purely linear
  Mermaid blocks, and tallying `[NEEDS CLARIFICATION]`. Exits non-zero when
  violations exist, 0 when clean.

## Repository intake

### `repo-inventory.mjs`

- **Purpose:** bounded, read-only scan of a repository into a compact JSON inventory
  the extractor turns into `R*` (repository-derived) evidence. This is the
  repository front door, in place of preprocess/chunk.
- **Run:** `node .github/skills/dude-pack-technical-docs-runtime/scripts/repo-inventory.mjs <repoRoot> [--out <inventory.json>] [--max-files <n>]`
- **Inputs:** a repository root directory; optional `--max-files` (default 5000).
  The walk skips `.git`, `node_modules`, `dist`, `build`, `out`, `.next`, `coverage`,
  `.venv`, `__pycache__`, `target`, `vendor`, and any dot-directory, and best-effort
  honors simple root `.gitignore` directory entries. It reads file contents only for
  package manifests (to resolve entry points) and the root `.gitignore`; everything
  else is path-only.
- **Outputs:** compact JSON (`root`, `fileCount`, `truncated`, `languages`,
  `packageManifests`, `entryPoints`, `configFiles`, `testDirs`, `schemaFiles`, `docs`)
  to `--out` or stdout, plus a one-line stderr summary. `truncated` is `true` when the
  `--max-files` bound is hit. Feed the JSON to the extractor, which emits
  `source-kind: repo` entries per `dude-pack-technical-docs-evidence-ledger`.
