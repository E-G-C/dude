# Version 2 Machine Contracts

These contracts are normative. `MUST`, `MUST NOT`, `SHOULD`, and `MAY` carry their usual requirements meaning.

## Common Types

| Type | Contract |
|---|---|
| `Digest` | Exactly 64 lowercase hexadecimal characters containing SHA-256 over exact file bytes. |
| `RootAnchor` | The exact literal string `@root`. It represents the invocation workspace root and is not an ordinary `Path`. |
| `Path` | Nonempty normalized workspace-relative POSIX path. Absolute paths, backslashes, NUL, empty segments, `.` segments, `..` segments, and the exact scalar `@root` are invalid. |
| `WorkspacePath` | Either `RootAnchor` or `Path`. Only a repository Source may use `RootAnchor`. |
| `IndexPath` | Nonempty normalized POSIX path relative to the directory containing `results.json`; it has the same forbidden forms as `Path` and must resolve beneath the invocation root. |
| `SourceRef` | Derived identity equal to the Source's `WorkspacePath`; callers cannot supply it. |
| `SourceId` | `S` followed by a positive ordinal padded to at least three digits, such as `S001`. |
| `UnitId` | `C`, `E`, or `R` followed by a positive ordinal padded to at least three digits. |
| `EvidenceId` | `<UnitId>-F<NNN>`, where `NNN` is a positive three-digit unit-local ordinal. |
| `Line` | Positive safe integer using 1-based inclusive indexing. |
| `ByteCount` | Nonnegative safe integer. |
| `TokenCount` | Nonnegative safe integer using `ceil(UnicodeCodePointCount / 4)`. |
| `NonemptyString` | String containing at least one non-whitespace Unicode code point. |

Every runtime CLI requires `--workspace-root <dir>`. A relative value is resolved against the process working directory. Before dependent reads or writes, the CLI rejects a symlink root or symlink component, requires an existing directory, obtains its canonical real path, and keeps that host path only in memory.

Every downstream CLI requires the supplied Source Registry to be contained beneath that root and validates `workspaceRoot: "@root"`. A persisted `Path` is resolved beneath the in-memory canonical root. Existing targets must remain contained both lexically and after `realpath`; missing output parents are validated and created one segment at a time. A registry may move with an intact workspace only when every persisted path, declared filesystem type, identity, and digest validates beneath the new invocation root.

Persisted artifacts, including report paths and messages, MUST NOT contain absolute host paths. Non-persisted stderr diagnostics MAY contain the canonical host path.

JSON schemas are closed: unknown fields are invalid unless a field is explicitly described as a gate-specific object. Optional fields are omitted rather than serialized as `null`, except where `null` is explicitly required.

## Canonical Serialization

- JSON files use UTF-8 without BOM, field order shown in these tables, two-space indentation, LF endings, and one terminal newline.
- JSONL uses one compact JSON object per nonblank line, field order shown below, LF endings, and one terminal newline.
- JSONL scalars, arrays, comments, blank records, malformed lines, and unknown fields are invalid.
- JSON roots carry `schemaVersion: 2`. Evidence and consumed JSONL use the version-2 record grammar below and are validated in the context of the supplied version-2 Source Registry.
- Hashes cover exact bytes, including line endings and terminal newline.
- Persisted deterministic artifacts contain no timestamps, random values, absolute host paths, or locale-dependent ordering.
- Text comparisons and path ordering use normalized UTF-8 byte order, not locale collation.
- Sources use registry order. Units and evidence use numeric identity order. Repository paths use normalized path order. Violations use `(code, path, line, id, message)` order.
- Integers are canonical decimal safe integers. Ratio options must be finite canonical numbers within their command-declared inclusive range. Partial parses, exponent aliases, `NaN`, infinities, negative values, and unsupported options are invalid.
- Successful writes are adjacent atomic replacements. A failed write leaves prior valid output unchanged and removes temporary artifacts.

## `sources.json`

### Root

| Field | Type | Required | Contract |
|---|---|---:|---|
| `schemaVersion` | integer | yes | Constant `2`. |
| `workspaceRoot` | `RootAnchor` | yes | Constant `@root`; no host path is serialized. |
| `workdir` | `Path` | yes | Contained work directory. It cannot alias a file Source or final output. |
| `output` | object | yes | Final-output authorization with fields in the order below. |
| `output.path` | `Path` | yes | Sole final destination. |
| `output.mode` | enum | yes | Explicitly `create`, `replace`, or `update`; never inferred. |
| `output.updateSourceId` | `SourceId` or `null` | yes | Update-target ID for `update`; otherwise `null`. |
| `output.expectedTarget` | ExpectedTarget | yes | Portable destination state captured at registration. |
| `limits` | Limits | yes | Complete effective bounds object. |
| `sources` | Source[] | yes | Between 1 and `limits.sourcesPerRun` entries in canonical registry order. |

### Expected Target

| Field | Type | Required | Contract |
|---|---|---:|---|
| `state` | enum | yes | `absent` or `file`. |
| `bytes` | `ByteCount` or `null` | yes | `null` for `absent`; exact stable-read length for `file`. |
| `sha256` | `Digest` or `null` | yes | `null` for `absent`; exact stable-read digest for `file`. |

### Source

| Field | Type | Required | Contract |
|---|---|---:|---|
| `id` | `SourceId` | yes | Assigned after canonical sorting; unique. |
| `kind` | enum | yes | `transcript`, `notes`, `draft`, `document`, or `repo`. |
| `role` | enum | yes | `input` or `update-target`. |
| `ref` | `SourceRef` | yes | Derived by `source-manifest.mjs` and exactly equal to `path`. |
| `path` | `WorkspacePath` | yes | Canonical contained Source path. Only a `repo` Source may use `@root`. |
| `pathType` | enum | yes | `file` or `directory`; `repo` requires `directory`, all other kinds require `file`. |
| `sizeBytes` | `ByteCount` | file only | Exact registered file size. |
| `sha256` | `Digest` | file only | Exact registered file digest. |

Rules:

- `source-manifest.mjs` requires `--workspace-root` and `--mode`; no mode is inferred and no option alias exists.
- Source order is fixed kind rank `transcript`, `notes`, `draft`, `document`, `repo`, then role, then the UTF-8 bytes of `path`; `@root` is compared as its literal bytes.
- Canonical-path duplicates, file-identity duplicates, source symlinks, unsafe roots, and unauthorized aliases are invalid.
- `source-manifest.mjs` derives `ref`; callers cannot supply it. A repository equal to the workspace root has `path: "@root"` and `ref: "@root"`.
- `create` requires the output to be absent at registration. It records `expectedTarget.state: "absent"` with `bytes: null` and `sha256: null`.
- `replace` requires an existing regular non-symlink output at registration. That file is not a Source. Stable read records `expectedTarget.state: "file"`, its exact byte length, and its digest.
- `update` requires exactly one `--update-document`. `--output` and `--update-document` must normalize to the same `Path` and identify the same existing regular non-symlink file. That document is the sole `role: "update-target"` Source; its ID equals `output.updateSourceId`, and its size and digest equal `expectedTarget.bytes` and `expectedTarget.sha256`.
- `--update-document` is forbidden for `create` and `replace`. `output.updateSourceId` is `null` in those modes.
- For `create` and `replace`, output cannot alias any Source through normalized path, canonical path, symlink, or available file identity. For `update`, the declared update-target is the sole permitted Source/output alias and must not alias another Source or the work directory.
- A repository may contain the work directory or output path, including when the repository is `@root`. Traversal gives those registered paths explicit skip dispositions.
- Work and output paths are registered before repository traversal so encountered generated paths receive explicit skip dispositions.

Final publication rules:

- `finalize.mjs` reads destination, mode, and expected state only from `sources.json`; it accepts no destination or mode override.
- `create` requires the target still to be absent. Appearance of any filesystem object fails. Publication uses an adjacent completed temporary file and an atomic no-replace operation, never an overwriting rename.
- `replace` requires the target still to be a regular non-symlink file with the registered byte length and digest. Disappearance, type change, content drift, symlink substitution, path escape, or a current alias to any protected Source, candidate, manifest, gate input, or work artifact fails.
- `update` requires the target still to match the update-target Source identity and registered digest and permits only that declared Source/output alias. Any alias to another protected input fails.
- A byte-identical replacement between registration and finalization is equivalent. Device and inode continuity is not persisted; current identity values are used only to reject unsafe aliases.
- After successful replace or update validation, publication uses an adjacent completed temporary file and atomic rename. Every failed check leaves the prior target unchanged.

## Preprocessing Manifest

| Field | Type | Required | Contract |
|---|---|---:|---|
| `schemaVersion` | integer | yes | Constant `2`. |
| `sourceId` | `SourceId` | yes | One transcript, notes, or draft Source. |
| `sourceSha256` | `Digest` | yes | Must equal the registered Source digest. |
| `complete` | boolean | yes | Must be `true` before chunking. |
| `output` | object | yes | Cleaned text identity. |
| `output.path` | `Path` | yes | Contained, non-aliasing output path. |
| `output.sizeBytes` | `ByteCount` | yes | Exact output size. |
| `output.sha256` | `Digest` | yes | Exact output digest. |
| `lineMap` | LineMap[] | yes | Ordered, non-overlapping mapping from output to source lines. |
| `counts` | object | yes | Deterministic preprocessing counts. |

`LineMap` fields, in order, are `outputStartLine`, `outputEndLine`, `sourceStartLine`, and `sourceEndLine`, all `Line` values with starts not greater than ends.

`counts` fields, in order, are:

- `inputLines`
- `outputLines`
- `removedTimestamps`
- `removedCueIds`
- `removedTags`
- `removedReservedBlocks`

All are nonnegative safe integers. Actual WEBVTT `NOTE`, `STYLE`, and `REGION` blocks count as reserved blocks; cue text merely beginning with those words remains content.

## Heading Manifest

| Field | Type | Required | Contract |
|---|---|---:|---|
| `schemaVersion` | integer | yes | Constant `2`. |
| `sourceId` | `SourceId` | yes | One document Source. |
| `sourceSha256` | `Digest` | yes | Must equal the registered Source digest. |
| `complete` | boolean | yes | Must be `true` before `E*` chunking. |
| `headings` | Heading[] | yes | Source-order headings outside fenced content. |

### Heading

| Field | Type | Required | Contract |
|---|---|---:|---|
| `level` | integer | yes | `1` through `6`. |
| `text` | `NonemptyString` | yes | Parsed heading text. |
| `path` | `NonemptyString` | yes | Hierarchical heading path. |
| `startLine` | `Line` | yes | Heading line. |
| `endLine` | `Line` | yes | Last line governed by the heading, not before `startLine`. |

Matching backtick or tilde fences exclude fenced headings. A closer uses the opener's marker and at least its marker length. Closing ATX hashes are removed only when whitespace-delimited, preserving headings such as `C#`. Repeated paths remain distinguishable by line span.

## `C*` and `E*` Chunk Manifest

| Field | Type | Required | Contract |
|---|---|---:|---|
| `schemaVersion` | integer | yes | Constant `2`. |
| `sourceId` | `SourceId` | yes | Parent Source. |
| `sourceKind` | enum | yes | Parent Source kind. |
| `sourceSha256` | `Digest` | yes | Registered parent-source digest. |
| `prefix` | enum | yes | Derived `C` or `E`; never caller-selected. |
| `startOrdinal` | positive integer | yes | Exact `--start` value and first allocated ordinal. |
| `nextOrdinal` | positive integer | yes | First unused ordinal after this manifest. |
| `budget` | object | yes | Effective unit and overlap budgets. |
| `budget.approximateTokens` | positive integer | yes | At most the configured unit budget. |
| `budget.overlapTokens` | nonnegative integer | yes | Included inside, and less than, the unit budget. |
| `complete` | boolean | yes | Must be `true` before extraction. |
| `units` | ChunkUnit[] | yes | Deterministic unit order. |

### Chunk Unit

| Field | Type | Required | Contract |
|---|---|---:|---|
| `id` | `UnitId` | yes | Prefix agrees with the manifest and ordinal range. |
| `file` | `Path` | yes | Contained unit text file. |
| `sizeBytes` | `ByteCount` | yes | Exact unit-file size. |
| `sha256` | `Digest` | yes | Exact unit-file digest. |
| `codePoints` | nonnegative integer | yes | Unicode code-point count. |
| `approximateTokens` | `TokenCount` | yes | Includes overlap and does not exceed budget. |
| `cleanRange` | LineRange | yes | Inclusive range in normalized input. |
| `sourceRange` | LineRange | yes | Inclusive range in the original Source. |
| `sourceRef` | `NonemptyString` | yes | Valid locator rooted in Source `ref`. |
| `headingPath` | `NonemptyString` | `E*` only | Must agree with the Heading Manifest. |
| `overlapFrom` | `UnitId` | no | Immediately preceding same-source unit supplying overlap. |

`LineRange` has `startLine` and `endLine`. `C*` units come from transcript, notes, or draft Sources. `E*` units come from document Sources and never cross heading boundaries. Splits operate on Unicode code points and never divide a non-BMP character.

Each prefix has an independent run-wide ordinal sequence beginning at `1`. Applicable Sources are processed in Source Registry order. Each producer persists its exact `startOrdinal` and returns the first unused `nextOrdinal`. Unit IDs are contiguous across `[startOrdinal, nextOrdinal)`. A complete Source producing no units preserves the handoff with equal ordinals.

## Repository Inventory

| Field | Type | Required | Contract |
|---|---|---:|---|
| `schemaVersion` | integer | yes | Constant `2`. |
| `sourceId` | `SourceId` | yes | One repository Source. |
| `rootRef` | `SourceRef` | yes | Must equal that Source's `ref`, including `@root` for a workspace-root repository. |
| `startOrdinal` | positive integer | yes | Exact `--start` value and first ordinal available to this repository. |
| `nextOrdinal` | positive integer | yes | First unused `R*` ordinal after this repository. |
| `repositoryDigest` | `Digest` | yes | Digest of canonical accounting, work units, effective limits, ordinal handoff, and admitted-file hashes. |
| `limits` | Limits | yes | Effective limits used for this traversal. |
| `complete` | boolean | yes | True only when all completeness rules hold. |
| `limitHits` | string[] | yes | Sorted canonical limit names; empty when complete. |
| `totals` | object | yes | Reconciled traversal totals. |
| `accounting` | AccountingEntry[] | yes | Exactly one entry per encountered descendant path. |
| `workUnits` | RepositoryUnit[] | yes | Deterministic `R*` units. |

`totals` fields, in order, are `encountered`, `admitted`, `skipped`, `rejected`, `files`, `directories`, `symlinks`, and `candidateBytes`. All are nonnegative safe integers and must reconcile with `accounting`.

### Accounting Entry

| Field | Type | Required | Contract |
|---|---|---:|---|
| `path` | `Path` | yes | Unique encountered descendant path in normalized order. |
| `pathType` | enum | yes | `file`, `directory`, `symlink`, or `other`. |
| `disposition` | enum | yes | `admitted`, `skipped`, or `rejected`. |
| `reason` | `NonemptyString` | non-admitted only | Deterministic reason code or message; forbidden for admitted entries. |
| `sizeBytes` | `ByteCount` | admitted file only | Exact file size. |
| `sha256` | `Digest` | admitted file only | Exact file digest. |
| `unitIds` | `UnitId`[] | admitted file only | Nonempty unique `R*` IDs covering the file. |

### Repository Unit

| Field | Type | Required | Contract |
|---|---|---:|---|
| `id` | `UnitId` | yes | Unique `R*` identity. |
| `approximateTokens` | `TokenCount` | yes | Positive and within unit budget. |
| `digest` | `Digest` | yes | Digest of canonical member identity and slices. |
| `members` | RepositoryMember[] | yes | Nonempty ordered member list. |

`RepositoryMember` fields, in order, are `path`, `startLine`, `endLine`, `sizeBytes`, `sha256`, and `sourceRef`.

Allocation rules:

- Repository Sources are inventoried in Source Registry order, irrespective of `--repo` argument order.
- The first inventory has `startOrdinal: 1`. Every subsequent inventory has `startOrdinal` equal to the preceding inventory's `nextOrdinal`.
- Unit IDs are exactly the contiguous `R*` ordinals in `[startOrdinal, nextOrdinal)` and `workUnits.length === nextOrdinal - startOrdinal`.
- A complete repository with no admitted content has `workUnits: []` and `nextOrdinal === startOrdinal`; the unchanged value is handed to the next repository.
- `sourceWorkUnits` is one run-wide ceiling for the `R*` sequence, not a fresh allowance per repository. Every complete inventory requires `nextOrdinal - 1 <= limits.sourceWorkUnits`.
- If another unit would exceed the ceiling, the current inventory is `complete: false`, `limitHits` includes `sourceWorkUnits`, exit status is `1`, and no later inventory in that chain may authorize downstream work.
- The repository root is represented by its Source and `rootRef`; `accounting` contains encountered descendants. An empty workspace-root repository may therefore have empty accounting and work-unit arrays.

Completeness requires:

- Traversal finished within every bound.
- Every encountered path has exactly one disposition.
- Every admitted ordinary file is hashed and its content is represented once by non-overlapping member slices.
- No rejected, unreadable, changed-during-read, or escaping path remains.
- Work and output paths are not admitted.
- Symlinks are never followed for traversal or content reads. A descendant symlink is `skipped` only when its target resolves and is proven contained beneath both the canonical repository root and canonical workspace root; such an accounted skip may coexist with `complete: true`. A dangling, unresolvable, or escaping descendant symlink is `rejected` and requires `complete: false`. A repository Source, workspace root, or authorization-boundary component that is itself a symlink is invalid direct input, exits `2` before traversal, and is not represented by an inventory.
- Totals, accounting, unit membership, ordinal allocation, and digests reconcile.

An incomplete persisted inventory has `complete: false`, exits `1`, and cannot feed extraction or finalization.

## Per-Unit Extraction Result

The extractor writes exactly one semantic result for every expected unit at the conventional path `<workdir>/results/<UnitId>.json`. The filename is derived from the expected unit ID, not accepted from extractor output. Result files are strict version-2 JSON objects with this shape:

| Field | Type | Required | Contract |
|---|---|---:|---|
| `schemaVersion` | integer | yes | Constant `2`. |
| `unitId` | `UnitId` | yes | One expected unit and the ID encoded by the result filename. |
| `sourceId` | `SourceId` | yes | Must agree with that unit's parent Source. |
| `unitDigest` | `Digest` | yes | Exact unit or repository-unit digest. |
| `status` | enum | yes | `evidence` or `no-documentable-evidence`. |
| `examined` | ExaminedMember[] | yes | Nonempty and complete for all unit members. |
| `fragment` | object | evidence only | Closed `{path,bytes,sha256,entryCount}` identity for the declared evidence fragment. |
| `reason` | `NonemptyString` | no-evidence only | Explanation of semantic absence. |

`ExaminedMember` contains `sourceRef` then `sha256`. An evidence `fragment` contains, in order, `path` (`Path`), `bytes` (`ByteCount`), `sha256` (`Digest`), and `entryCount` (positive integer). `bytes`, `sha256`, and `entryCount` describe the same stable-read fragment bytes.

The fragment path is declared only by the per-unit result. No consumer infers a fragment filename or discovers fragments from a directory. Index mode resolves the declared path beneath the invocation root, stable-reads a contained non-symlink regular file, rejects aliases, validates strict evidence JSONL, verifies digest and record count, and binds that declaration through the indexed result identity. Merge mode repeats those checks before consuming the fragment.

Exactly one result must exist for every expected unit. `evidence` requires `entryCount > 0`. `no-documentable-evidence` requires `reason` and forbids `fragment`. Missing, duplicate, stale, extra, malformed, aliased, or changed result files are invalid.

## `merge-ledger.mjs`

### Index Mode

```text
node <rt>/merge-ledger.mjs \
  --workspace-root <dir> \
  --mode index \
  --sources <workdir>/sources.json \
  --unit-manifest <manifest> [--unit-manifest <manifest> ...] \
  --results-dir <workdir>/results \
  --out <workdir>/results.json
```

- `--unit-manifest` occurs once for every chunk or repository inventory required by the Source Registry.
- Manifest source IDs exactly equal extraction-bearing Source IDs. Omission, duplication, an unexpected manifest, an incomplete manifest, or duplicate expected unit identity fails.
- Index mode derives only `<results-dir>/<UnitId>.json` for each expected unit. The results directory must contain exactly those direct JSON files; missing or stale extra result files fail.
- The bounded membership check is not recursive discovery: index mode does not expand globs, infer fragment names, or search other directories.
- Every result and its result-declared fragment is validated against the expected unit, strict schema, size, digest, count, containment, and alias rules.
- Index mode atomically authors `<workdir>/results.json`; the writer and extractor do not author that index.

### Result Set Index (`results.json`)

The closed root fields, in order, are:

| Field | Type | Required | Contract |
|---|---|---:|---|
| `schemaVersion` | integer | yes | Constant `2`. |
| `sourceRegistry` | SourceRegistryRef | yes | Exact identity of the supplied Source Registry. |
| `unitManifests` | UnitManifestRef[] | yes | Exactly one complete manifest for each extraction-bearing Source. |
| `results` | ResultRef[] | yes | Exactly one validated result reference per expected unit. |

`SourceRegistryRef` fields, in order, are `path`, `bytes`, and `sha256`.

`UnitManifestRef` fields, in order, are:

| Field | Type | Contract |
|---|---|---|
| `sourceId` | `SourceId` | Existing extraction-bearing Source. |
| `path` | `IndexPath` | Exact manifest path relative to `results.json`. |
| `bytes` | `ByteCount` | Exact manifest file length. |
| `sha256` | `Digest` | Exact manifest digest. |

`ResultRef` fields, in order, are:

| Field | Type | Contract |
|---|---|---|
| `unitId` | `UnitId` | One expected unit. |
| `sourceId` | `SourceId` | Exact expected parent Source. |
| `sourceKind` | enum | Parent Source kind. |
| `path` | `IndexPath` | Exact conventional result path relative to `results.json`. |
| `bytes` | `ByteCount` | Exact result file length. |
| `sha256` | `Digest` | Exact result digest. |

All index paths are normalized relative to the directory containing `results.json`; every resolved target must remain beneath the invocation root. The Source Registry, manifests, results, fragments, index, and output must satisfy regular-file, containment, distinctness, symlink, hard-link, and canonical-alias rules.

`unitManifests` follows Source Registry order, with path as a deterministic tiebreaker. `results` follows unit prefix rank `C`, `E`, `R`, then numeric unit ordinal. Counts are derived from arrays and are not duplicated.

A `ResultRef` binds the entire closed per-unit result object. For `status: "evidence"`, that object declares the only accepted fragment path, byte length, digest, and entry count; index mode validates all four values against one stable read of the fragment before writing the result reference. The index therefore includes the validated fragment declaration through the exact result bytes without duplicating fragment fields or inventing a fragment filename.

The expected-unit set is the union of `units` and `workUnits` in the indexed manifests. Exactly one result is required for every expected unit. Missing, duplicate, unexpected, stale, aliased, malformed, or fragment-invalid inputs fail. An empty expected-unit or result set is syntactically valid but exits `3` and cannot produce an authorizing index.

### Merge Mode

```text
node <rt>/merge-ledger.mjs \
  --workspace-root <dir> \
  --mode merge \
  --index <workdir>/results.json \
  --out <workdir>/ledger.jsonl
```

Merge mode reads only the index and the exact files it references. It accepts no Source Registry, unit-manifest, result-directory, result-file, fragment-directory, or glob input. It does not enumerate a directory, infer a filename, or consume an unindexed file.

Merge mode stable-reads the indexed Source Registry, manifests, and results; verifies their lengths, hashes, identities, strict schemas, and complete expected-unit relation; resolves and validates every result-declared fragment; enforces global ledger invariants; orders fragments by unit order and entries by numeric `F` ordinal; and atomically replaces the strict nonempty Evidence Ledger.

## Evidence Ledger JSONL

Each line has this closed version-2 record shape:

| Field | Type | Required | Contract |
|---|---|---:|---|
| `id` | `EvidenceId` | yes | Globally unique; unit prefix and identity must exist. |
| `text` | `NonemptyString` | yes | Atomic supported evidence statement. |
| `type` | enum | yes | `fact`, `decision`, `action`, `parameter`, `example`, `constraint`, `behavior`, `interface`, `schema`, or `open-question`. |
| `tag` | `NonemptyString` | yes | Deterministic routing label. |
| `source-id` | `SourceId` | yes | Existing parent Source. |
| `source-kind` | enum | yes | `transcript`, `notes`, `draft`, `document`, or `repo`; agrees with Source. |
| `source-chunk` | `UnitId` | yes | Existing expected unit; agrees with evidence ID. |
| `source-ref` | `NonemptyString` | yes | Exact validated locator rooted in Source `ref`. |
| `importance` | enum | no | `high`, `medium`, or `low`; omission means `medium`. |
| `refs` | `EvidenceId`[] | no | Unique existing evidence IDs; no self-reference. |

Locator forms are:

- Prose: `<source-ref>#L<start>-L<end>`
- Document: `<source-ref>:<Heading > Path>#L<start>-L<end>`
- Repository: `<source-ref>:<path>#L<start>-L<end>` or a validated symbol-qualified equivalent

A root-repository locator therefore has a form such as `@root:src/module.mjs#L1-L20`.

The ledger must be nonempty. Source identity, unit membership, source range, repository member, and locator must agree with their manifests.

## Planning Digest JSON

`digest.json` is the canonical machine representation and has these closed fields in order:

| Field | Type | Contract |
|---|---|---|
| `schemaVersion` | integer | Constant `2`. |
| `sourceRegistry` | object | Fields `path`, then exact `sha256`. |
| `ledger` | object | Fields `path`, exact `sha256`, then positive `entryCount`. |
| `configuration` | object | Sole field `snippetCodePoints`, equal to `sources.json.limits.digestSnippetCodePoints`. |
| `routing` | object | Fields `decisionActionSection`, then `decisionActionIds`. The section is the constant `Decisions and action items`. |
| `tags` | DigestTag[] | Ordinary tag groups in deterministic order. |
| `markdown` | object | Fields `path`, `sizeBytes`, and exact `sha256` for `digest.md`. |

A `DigestTag` has fields `tag`, `entryCount`, `typeCounts`, `example`, and `ids`. `typeCounts` is an array of `{type,count}` objects in Evidence Ledger type-enum order with zero counts omitted. `example` has fields `id`, then `snippet`.

All decision and action IDs appear once in `routing.decisionActionIds` and never in `tags`. Every other ledger ID appears once in exactly one tag's `ids`. The union is the complete ledger ID set.

Tags use the exact ledger `tag` string and are ordered by first appearance after decision/action entries are excluded. IDs retain canonical ledger order. The example is the highest-importance entry in the group using rank `high`, `medium`, `low`, with omitted importance treated as `medium`; ties use earliest evidence ID.

For a snippet, replace each maximal Unicode whitespace sequence with one ASCII space and trim both ends. If its code-point length exceeds the configured limit, retain the first `limit - 3` code points and append ASCII `...`. Snippet comparison and truncation operate on Unicode code points.

`digest.json` binds the exact rendered Markdown through `markdown.sha256`. Both files independently bind the Source Registry and ledger. No self-hash or circular hash is used. Both outputs are regenerated together; mutation of either invalidates the pair.

## Planning Digest Markdown

`digest.md` uses exactly this grammar:

```text
# Planning Digest v2
source-registry: <Path>
source-registry-sha256: <Digest>
ledger: <Path>
ledger-sha256: <Digest>
ledger-entries: <positive-integer>
snippet-code-points: <positive-integer>

## Decision/action routing
destination: Decisions and action items
ids: <id-list>

[## Tag
tag: <json-string>
entries: <positive-integer>
types: <type-count-list>
example-id: <EvidenceId>
example: <json-string>
ids: <id-list>

]...
```

`<id-list>` is `(none)` or IDs joined by comma plus one ASCII space. `<type-count-list>` is `type=count` values joined by comma plus one ASCII space in Evidence Ledger type-enum order. `<json-string>` is the canonical JSON string serialization of the exact tag or snippet.

There is one blank line between blocks, no trailing spaces, LF endings, and one terminal newline. Tag blocks correspond one-for-one and in order with `digest.json.tags`. Decision/action IDs occur only in the routing block. No additional heading or line is permitted.

## Outline Contract

The version-2 Outline is Markdown with this grammar:

```text
# Outline: <title>
ledger-sha256: <Digest>

## <section>
covers: <EvidenceId>, <EvidenceId>
diagram: <flow> | <EvidenceId>, ...   # optional
notes: <text>                          # optional
```

Rules:

- One title and one `ledger-sha256` line are required.
- Every section has exactly one nonempty `covers:` line.
- Every ledger ID appears exactly once across all `covers:` lines.
- Unknown, omitted, or duplicate IDs fail outline coverage.
- Decision and action IDs appear only at their selected destination and are not duplicated through tag grouping.
- Diagram evidence IDs must be covered by the same section.
- Section names are unique exact destinations for Consumed Entries.

## Consumed JSONL

Each line has this closed version-2 record shape:

| Field | Type | Required | Contract |
|---|---|---:|---|
| `id` | `EvidenceId` | yes | Existing ledger ID. |
| `section` | `NonemptyString` | yes | Exact heading in the evaluated document. |
| `resolution` | enum | no | Only `superseded`. |

Every ledger ID appears exactly once. Bare IDs, duplicate records, unknown IDs, missing document sections, and empty consumed data are invalid.

## Gate Report Envelope

| Field | Type | Required | Contract |
|---|---|---:|---|
| `schemaVersion` | integer | yes | Constant `2`. |
| `gate` | enum | yes | `extraction-audit`, `outline-coverage`, `document-coverage`, or `lint`. |
| `stage` | enum | yes | `extraction`, `outline`, `pre-review`, or `final`, subject to gate constraints below. |
| `ok` | boolean | yes | True only when all blocking checks pass. |
| `inputs` | GateInput[] | yes | Nonempty exact input identities in canonical role/path order. |
| `configuration` | object | yes | Closed gate-specific effective configuration. |
| `counts` | object | yes | Closed gate-specific counts. |
| `violations` | Violation[] | yes | Deterministically ordered; empty when `ok` is true. |

`GateInput` fields are `role`, `path`, and `sha256`. A `Violation` has `code`, optional `path`, optional positive `line`, optional `id`, and `message`.

Gate and stage constraints:

| Gate | Allowed stage | Required counts |
|---|---|---|
| `extraction-audit` | `extraction` | `expected`, `results`, `evidence`, `noEvidence`, `flagged` |
| `outline-coverage` | `outline` | `ledger`, `assigned`, `missing`, `unknown`, `duplicate` |
| `document-coverage` | `pre-review`, `final` | `ledger`, `consumed`, `uncovered`, `dangling`, `duplicate`, `missingSection` |
| `lint` | `pre-review`, `final` | `headings`, `fences`, `clarificationMarkers`, `violations` |

Extraction audit requires `--result-index <results.json>` and accepts no result-directory, fragment-directory, glob, or repeated unit-manifest input. It independently validates the index, every indexed manifest and result, every result-declared fragment, the merged ledger, and complete Source/unit/member provenance.

A pre-review report cannot satisfy a final-report input. A syntactically valid but empty required ledger or expected-unit set exits `3` and cannot produce `ok: true`.

## Semantic Review Report

| Field | Type | Required | Contract |
|---|---|---:|---|
| `schemaVersion` | integer | yes | Constant `2`. |
| `gate` | string | yes | Constant `semantic-review`. |
| `ok` | boolean | yes | True only when no unresolved error finding remains. |
| `reviewer` | string | yes | Constant `dude-pack-technical-docs-reviewer`. |
| `inputDocumentSha256` | `Digest` | yes | Draft evaluated by pre-review gates. |
| `outputDocumentSha256` | `Digest` | yes | Exact resulting reviewed document. |
| `consumedSha256` | `Digest` | yes | Consumed JSONL evaluated with the document. |
| `preReviewCoverageSha256` | `Digest` | yes | Exact pre-review coverage report file. |
| `preReviewLintSha256` | `Digest` | yes | Exact pre-review lint report file. |
| `touchedSections` | string[] | yes | Unique exact heading paths in document order. |
| `findings` | Finding[] | yes | Deterministic review findings. |

`Finding` fields are `code`, `severity`, `section`, and `resolution`. `severity` is `error`, `warning`, or `info`; `resolution` is nonempty. Any mutation after report creation invalidates the report. A targeted fix requires a new semantic review report for the resulting document.

## Limits

Every limit is a canonical decimal safe integer with lexical form `0|[1-9][0-9]*`. Signs, leading zeros, decimal points, exponents, whitespace, digit separators, partial parses, and unsafe integers are invalid. All ranges are inclusive.

Only `source-manifest.mjs` accepts limit flags. It persists every effective value in `sources.json.limits`. No downstream command accepts a limit override.

| `sources.json.limits` field | Exact flag | Default | Min | Max |
|---|---|---:|---:|---:|
| `sourcesPerRun` | `--limit-sources-per-run` | 100 | 1 | 1000 |
| `textSourceBytesPerFile` | `--limit-text-source-bytes-per-file` | 33554432 | 1 | 268435456 |
| `documentBytes` | `--limit-document-bytes` | 67108864 | 1 | 268435456 |
| `jsonBytesPerFile` | `--limit-json-bytes-per-file` | 16777216 | 1 | 67108864 |
| `jsonlBytesPerFile` | `--limit-jsonl-bytes-per-file` | 67108864 | 1 | 536870912 |
| `jsonlBytesPerLine` | `--limit-jsonl-bytes-per-line` | 1048576 | 1 | 16777216 |
| `jsonlRecords` | `--limit-jsonl-records` | 100000 | 1 | 1000000 |
| `repositoryChildrenPerDirectory` | `--limit-repository-children-per-directory` | 10000 | 1 | 100000 |
| `repositoryTraversalDepth` | `--limit-repository-traversal-depth` | 64 | 1 | 256 |
| `repositoryEncounteredEntries` | `--limit-repository-encountered-entries` | 100000 | 1 | 1000000 |
| `repositoryAdmittedFiles` | `--limit-repository-admitted-files` | 5000 | 1 | 100000 |
| `repositoryCandidateBytes` | `--limit-repository-candidate-bytes` | 268435456 | 1 | 17179869184 |
| `repositoryBytesPerAdmittedFile` | `--limit-repository-bytes-per-admitted-file` | 33554432 | 1 | 268435456 |
| `sourceWorkUnits` | `--limit-source-work-units` | 20000 | 1 | 200000 |
| `unitApproximateTokens` | `--limit-unit-approximate-tokens` | 3000 | 1 | 32000 |
| `unitOverlapApproximateTokens` | `--limit-unit-overlap-approximate-tokens` | 200 | 0 | 8000 |
| `digestSnippetCodePoints` | `--limit-digest-snippet-code-points` | 90 | 20 | 4096 |

Cross-field rules are:

- `jsonlBytesPerLine <= jsonlBytesPerFile`
- `repositoryChildrenPerDirectory <= repositoryEncounteredEntries`
- `repositoryAdmittedFiles <= repositoryEncounteredEntries`
- `repositoryBytesPerAdmittedFile <= repositoryCandidateBytes`
- `unitOverlapApproximateTokens < unitApproximateTokens`

A cross-field violation exits `2` before dependent work and replaces no output. No bound may silently clip successful work. A direct input exceeding a hard bound exits `2`. Traversal or allocation exhaustion emits `complete: false`, exits `1`, and blocks downstream work until a deliberate bounded rerun.

## Extraction-Audit Thresholds

`extraction-audit.mjs` accepts only these threshold flags:

| Flag | Stored configuration field | Type | Default | Inclusive range |
|---|---|---|---:|---:|
| `--min-entries` | `minEntries` | canonical nonnegative integer | 2 | 0 through 1000 |
| `--floor-per-1k` | `floorPer1k` | canonical decimal | 5 | 0 through 1000 |
| `--ratio` | `ratio` | canonical decimal | 0.5 | 0 through 1 |

A canonical decimal is `(?:0|[1-9][0-9]*)(?:\.[0-9]{0,5}[1-9])?`. It has at most six fractional digits and no redundant trailing zero. Exponents, signs, leading zeros, `.5`, `5.`, `5.0`, partial parses, `NaN`, and infinities are invalid.

At least one threshold must be greater than zero. Thresholds apply only to validated `status: "evidence"` units. Validated no-evidence units remain in completeness counts and are excluded from threshold calculations.

A unit is flagged when any enabled comparison is true:

- `entryCount < minEntries`
- `entryCount * 1000 / approximateTokens < floorPer1k`
- `density < ratio * medianDensity`

Comparisons use unrounded values; equality passes. The relative comparison applies only when at least three evidence units have positive token counts and their median density is positive. Median and comparisons are computed before display rounding. Any flagged unit makes the extraction gate `ok: false` and exits `1`.

## Exit Codes And Persistence

| Condition | Exit | Persistence |
|---|---:|---|
| Successful operation or passing gate | `0` | Atomically replace the declared data or report output. |
| Completed failed gate | `1` | Atomically replace the gate report with `ok: false`; preserve data and final output. |
| Repository traversal or allocation discovers an unreadable entry, unsafe descendant symlink, escaping path, changed-during-read file, per-file overflow, or traversal/allocation bound | `1` | Atomically replace only the inventory with deterministic `complete: false` accounting and violations. |
| Invalid CLI or schema, including an invocation or registry with no Source; invalid direct registered source (including a symlink repository Source); symlinked workspace root or authorization-boundary component; or invalid repository entry path, direct path, unreadable direct file, alias, containment, digest, or hard bound detected before traversal | `2` | Replace no declared output and remove every temporary artifact. |
| Missing, unreadable, malformed, stale, or hash-mismatched required index, manifest, result, or result-declared fragment | `2` | Replace no declared output and remove every temporary artifact. |
| Syntactically valid but empty required expected-unit, result, ledger, or consumed set | `3` | Replace no declared output and emit no passing completeness report. |

For index and merge specifically:

- Missing a required index-mode manifest, missing conventional result file, unexpected result file, or invalid result-declared fragment exits `2`.
- Missing `--index`, a missing index, or a missing indexed file exits `2`.
- A nonempty result set that omits an expected unit exits `2`.
- An empty expected-unit set exits `3`.
- An empty result set exits `3`, including when expected units exist.
- A validated nonempty result set that yields an empty ledger exits `3`.
- Exits `2` and `3` leave the prior index or ledger byte-for-byte unchanged.

A failed write never leaves a partial replacement or temporary artifact.

## Freshness Chain

| Step | Artifact and binding |
|---:|---|
| 1 | The Source Registry binds `@root` path semantics, registered file bytes, repository roots, output mode and `expectedTarget`, work exclusions, and all effective limits. |
| 2 | Preprocessing, heading, chunk, and repository manifests bind their Source identities, start/next ordinal handoffs, and current source or repository digests. |
| 3 | Each Extraction Result at `<workdir>/results/<UnitId>.json` binds one exact expected-unit digest, all examined members, and any result-declared fragment identity. |
| 4 | `merge-ledger.mjs --mode index` binds the exact Source Registry, complete unit-manifest set, conventional per-unit result files, and validated result-declared fragments into deterministic `results.json`. |
| 5 | `merge-ledger.mjs --mode merge` consumes only that index and binds all indexed result and fragment hashes into one exact nonempty ledger. |
| 6 | Extraction Gate Evidence binds the Source Registry, result index, unit manifests, results, fragments, ledger, effective thresholds, and complete reconciliation. |
| 7 | The planning digest JSON binds the Source Registry, ledger, rendering configuration, routing, tags, and exact digest Markdown; the Outline repeats the exact ledger digest. |
| 8 | Outline Gate Evidence binds that ledger and Outline. |
| 9 | Pre-review coverage and lint bind the same draft bytes; coverage also binds the same ledger and consumed bytes. |
| 10 | Semantic Review Evidence binds both pre-review report files, input draft, resulting reviewed document, and consumed bytes. |
| 11 | Final coverage and final lint bind the semantic-review output bytes and declare `stage: final`. |
| 12 | Finalization rehashes every supplied report, current file Source, admitted repository member, result index ancestry, draft, consumed ledger, and the authorized destination's current state. |
| 13 | Immediately before publication, finalization revalidates `output.expectedTarget`; only then may it perform atomic no-replace creation or atomic replacement. |

A changed node invalidates every descendant. Finalization requires current passing extraction, outline, semantic-review, final-coverage, and final-lint evidence; consistent pre-review ancestry; one shared reviewed-document digest; and an unchanged authorized destination state. The output path is read only from `sources.json`. Update mode additionally requires the registered update-target bytes to remain unchanged until the adjacent atomic replacement.
