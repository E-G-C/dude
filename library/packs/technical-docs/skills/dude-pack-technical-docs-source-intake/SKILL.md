---
name: dude-pack-technical-docs-source-intake
description: "Use when a technical-docs run needs to classify the provided source material and preprocess it into evidence-ledger entries. Covers the source kinds (`repo`, `document`, `transcript`, `notes`, `draft`, or `mixed`), the front-door runtime script and chunk-id prefix (`C*`, `E*`, `R*`) each kind carries, and the read-only, bounded repository intake path. Load it before the extractor turns any source unit into ledger entries."
---

# Source Intake and the Source Registry

## Purpose

Register every provided source exactly once, then run the right front door for each
kind so each source becomes bounded, provenance-carrying work units.

`sources.json` is the sole authority for source identity, the work directory, the
output path, the output mode and its expected state, and the 17 effective limits for
one run. Every downstream artifact references its `sourceId`, and no downstream file
redefines source metadata. The commands live in `dude-pack-technical-docs-runtime`;
the unit, result, and ledger schemas live in
`dude-pack-technical-docs-evidence-ledger`.

Nothing that is not registered is a source. There is no ad-hoc reading of a file the
registry does not name, and no captured command output becomes evidence unless it was
first written to a file and registered as `notes` or `draft`.

## Classify the source

Read what was provided and assign one or more source kinds:

- `repo` — a repository or source tree: code, configuration, tests, schemas.
- `document` — an existing Markdown technical document to update in place.
- `transcript` — an audio transcript, WEBVTT/SRT or plain text.
- `notes` — rough or scratch notes, bulleted or free-form.
- `draft` — an in-progress Markdown draft of the document.

A run may combine kinds. Every kind converges on one ledger and one set of gates.

## Register the run

```bash
node <rt>/source-manifest.mjs \
  --workspace-root <dir> --mode <create|replace|update> \
  --workdir <dir> --output <file> \
  [--transcript <file>]... [--notes <file>]... [--draft <file>]... \
  [--document <file>]... [--update-document <file>] [--repo <dir>]... \
  [--limit-<name> <value>]... --out <sources.json>
```

`<rt>` is `.github/skills/dude-pack-technical-docs-runtime/scripts`.

**Workspace root.** `--workspace-root` is required here and on every downstream
command. It is resolved at invocation, rejects a symlinked root or root component,
and is never read back from a persisted artifact. The registry stores
`workspaceRoot: "@root"` and workspace-relative POSIX paths, so an intact workspace
can be relocated and the run still validates.

**`@root`.** The reserved `@root` anchor may be used only by a repository Source that
is the workspace root itself; such a Source has `path: "@root"` and `ref: "@root"`.
Every other path is an ordinary normalized workspace-relative POSIX path.

**Identity and ordering.** Sources are sorted by kind rank (`transcript`, `notes`,
`draft`, `document`, `repo`), then role, then bytewise normalized path, and receive
`S001`, `S002`, and so on from that order. Reordering the same declarations produces
the same ids. `Source.ref` is derived and always equals `Source.path`; no flag can set
it. File Sources record `sizeBytes` and `sha256`.

**Refusals.** Registration fails before any downstream work on an empty source set,
duplicate canonical paths or file identities, a symlink input, an unsafe root, an
output that aliases any Source other than the one update target, or a limit outside
its range or violating a cross-field rule.

## Output modes and the expected target

`--mode` has no default and is never inferred from whether the target exists.

| Mode | Target at registration | Recorded `expectedTarget` | Publication |
|---|---|---|---|
| `create` | must be absent | `state: absent` | atomic no-replace |
| `replace` | must be an existing regular file | `state: file` with its exact bytes and digest | adjacent atomic rename after revalidation |
| `update` | must be the one `--update-document` Source | `state: file` matching that Source's size and digest | adjacent atomic rename after revalidation |

`--update-document` is required exactly once for `update` and forbidden for `create`
and `replace`. In `update` mode the normalized `--output` and `--update-document`
paths must be equal and identify the same existing regular file; that Source carries
`role: update-target` and is the only Source the output may alias. `replace` forbids
registering the target as a Source at all.

`finalize.mjs` recomputes this state immediately before publication. Appearance,
disappearance, type change, byte drift, symlink substitution, path escape, or a
forbidden identity alias fails without touching the target.

## Front door by kind

| Source kind | Front door | Unit prefix | Unit `sourceRef` |
|---|---|---|---|
| `transcript` | `preprocess` → `chunk` | `C*` | `<ref>#L<start>-L<end>` |
| `notes` | `preprocess` → `chunk` | `C*` | `<ref>#L<start>-L<end>` |
| `draft` | `preprocess` → `chunk` | `C*` | `<ref>#L<start>-L<end>` |
| `document` | `headings` → `chunk` | `E*` | `<ref>:<Heading > Path>#L<start>-L<end>` |
| `repo` | `repo-inventory` | `R*` | `<rootRef>:<path>#L<start>-L<end>` |

Every registered Source must produce exactly one complete unit manifest, including the
`update-target` document in update mode. `merge-ledger.mjs --mode index` fails if any
registered Source has no manifest.

## One source at a time

No preprocessing command accepts more than one semantic Source. Each command takes
`--sources <sources.json> --source <S-id>`, so transcripts, notes, drafts, and
documents are never concatenated and no unit loses its origin.

**Ordinal handoff.** `C`, `E`, and `R` each have their own run-wide ordinal sequence
beginning at `1`. Sources are processed in registry order; each producer takes
`--start`, persists `startOrdinal`, and reports the first unused `nextOrdinal`. Chain
repositories explicitly: the first repository takes `--start 1`, and every later
repository takes the preceding inventory's `nextOrdinal`. The `sourceWorkUnits`
ceiling applies once to the whole run-wide `R*` sequence, not once per repository.

## Prose intake (`transcript` / `notes` / `draft`)

```bash
node <rt>/preprocess.mjs --workspace-root <dir> --sources sources.json \
  --source S001 --out clean.txt --json preprocess.json
node <rt>/chunk.mjs --workspace-root <dir> --sources sources.json \
  --source S001 --start 1 --preprocess preprocess.json --outdir units/
```

- **Genuine WEBVTT/SRT structure only.** The `WEBVTT` signature block, real
  `NOTE`/`STYLE`/`REGION` blocks, cue identifiers, cue timings, and cue markup are
  removed. Cue text that merely begins with `NOTE`, `STYLE`, or `REGION` is content
  and is preserved.
- **Notes and drafts are content line by line,** normalized only for newlines.
- The Preprocessing Report must have `complete: true` before chunking, and it carries
  the `lineMap` that keeps every cleaned line traceable to its original source line.

## Existing-document intake

An existing `document` is already clean Markdown, so it is never preprocessed. Extract
its Heading Manifest first, then chunk against it:

```bash
node <rt>/headings.mjs --workspace-root <dir> --sources sources.json \
  --source S004 --out headings.json
node <rt>/chunk.mjs --workspace-root <dir> --sources sources.json \
  --source S004 --start 1 --headings headings.json --outdir existing-units/
```

`E*` units never cross a heading boundary and always carry the `headingPath` that
locates them, so document evidence stays addressable. Closing ATX hashes are stripped
only when whitespace-delimited, so a heading such as `C#` survives. `E*` content is
preserved unless newer `C*` or `R*` material contradicts the same point.

## Repository intake (`repo`)

Repository intake is read-only, bounded, and **complete** — it is an accounting, not a
category summary.

```bash
node <rt>/repo-inventory.mjs --workspace-root <dir> --sources sources.json \
  --source S007 --start 1 --out inventory.json
```

- Every encountered descendant path receives exactly one disposition: `admitted`,
  `skipped`, or `rejected`, with a reason for every non-admitted entry. An ordinary
  admitted file cannot disappear from the accounting.
- Symlinks are never followed. A descendant symlink is `skipped` only when its target
  resolves inside both the canonical repository root and the canonical workspace root;
  otherwise it is `rejected` and the inventory is incomplete.
- The registered work directory and output path receive explicit skip dispositions
  instead of being re-ingested.
- Every admitted ordinary text file is hashed and covered by non-overlapping member
  slices in normalized path and line order. A file with a single line larger than one
  unit budget is an accounted `skipped` entry with reason `oversized-line`.
- The inventory is complete only when traversal finished inside every bound, no
  rejected or unreadable path exists, no file changed during the read, and the unit,
  accounting, and ordinal totals reconcile. An incomplete inventory exits `1` and
  cannot proceed to indexing or finalization.

The inventory does not read package manifests to guess entry points and does not
classify files into categories. Interface, behavior, schema, and parameter judgment
belongs to `dude-pack-technical-docs-extractor`, which reads exactly the member slices
one `R*` unit names. Apply `dude-pack-technical-docs-traceability`: a behavior claim
traces to code, tests, configuration, or a schema, never to assumption, and never to a
state-changing command.

## Mixed runs

A mixed run registers every source in one registry, runs each front door above, and
then indexes and merges once:

```bash
node <rt>/merge-ledger.mjs --workspace-root <dir> --mode index \
  --sources sources.json --unit-manifest units/chunks.json \
  --unit-manifest existing-units/chunks.json --unit-manifest inventory.json \
  --results-dir results/ --out results.json
node <rt>/merge-ledger.mjs --workspace-root <dir> --mode merge \
  --index results.json --out ledger.jsonl
```

`C*`, `E*`, and `R*` ids coexist in that one ledger and coverage spans their union, so
a repository-only run, a prose-only run, and a mixed run share the same gates.

## Diagrams and fenced code in sources

When source material contains a fenced diagram such as a Mermaid block (common in an
existing `document` or a hand-authored `draft`), do not atomize its internal syntax
into many ledger entries. Capture at most one entry naming what the diagram depicts.
The diagram is preserved or regenerated downstream, so its node-by-node markup is not
separately traceable content.

## No legacy artifacts

Every structured artifact is `schemaVersion: 2`. An unversioned or prototype artifact
is rejected, not normalized: regenerate it under the current contracts. There is no
compatibility flag and no migration path.

## Cross-references

- `dude-pack-technical-docs-runtime` — the commands, their exact flags, the limits,
  and the exit codes.
- `dude-pack-technical-docs-evidence-ledger` — unit manifests, extraction results, the
  result index, `ledger.jsonl`, the Outline, and `consumed.jsonl`.
- `dude-pack-technical-docs-traceability` — the zero-fabrication rule for every source
  kind.
- `dude-pack-technical-docs-pipeline` — the canonical gate sequence these front doors
  feed.
