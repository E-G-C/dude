# Implementation Plan: Technical Docs Pack Remediation

## Summary

Remediate the existing `technical-docs` pack under `library/packs/technical-docs/` while preserving its namespace and public surface of exactly 5 agents, 7 skills, and 2 prompts.

The canonical feature identity is `.dude/specs/007-technical-docs-pack-remediation/spec.md`. The implementation will:

- Establish one authoritative source registry with a portable `@root` anchor, explicit source mode, output-state binding, and mandatory runtime root reconstruction.
- Preserve source identity and provenance through deterministic `C*`, `E*`, and `R*` units with independent run-wide ordinal handoffs.
- Produce complete repository accounting and one extraction result per expected unit.
- Make the existing merge CLI author a deterministic result index and merge only indexed, validated results and fragments.
- Enforce strict object-only evidence and consumed JSONL.
- Centralize bounds, path safety, alias detection, atomic writes, hashing, option validation, and CommonMark fence tracking in one runtime helper module.
- Add only two CLI helpers: source registration and freshness-aware finalization.
- Harden all 9 existing runtime scripts.
- Require digest-bound pre-review diagnostics and post-review final gates.
- Bind create, replace, and update targets to their registered expected state and reject output drift immediately before publication.
- Keep the writing pack optional with complete local guidance.
- Add authoring-only Node tests covering all four supported product behaviors and bounded live verification for three non-repository acceptance modes.
- Regenerate prototype work data under the new contracts; no legacy compatibility or migration path will be implemented.

## Technical Context

**Language/Version**: JavaScript ES modules (`.mjs`) on the Node.js version already supported by Dude; no runtime baseline change.

**Primary Dependencies**: Node built-ins only, including `node:fs`, `node:path`, `node:crypto`, `node:util`, `node:test`, `node:assert`, `node:child_process`, `node:os`, and `node:url`. No third-party package is added.

**Storage**: UTF-8 JSON, object-only JSONL, Markdown, text chunks, and digest-bound report sidecars in a declared work directory. No database or persistent service.

**Testing**: Node built-in test runner with temporary generated fixtures and public CLI invocation through `spawnSync(process.execPath, ...)`; focused pack tests, automated product coverage across all four supported behaviors, full repository tests, compose verification, lint, release verification, and three bounded live agent workflows.

**Target Platform**: Cross-platform Node execution on macOS, Linux, and Windows filesystems. Permission and symlink tests use capability probes where the host cannot enforce the condition.

**Project Type**: Library pack containing Markdown agent/skill/prompt contracts and deterministic CLI helpers nested in the existing runtime skill.

**Performance Goals**: Bounded processing with deterministic output for identical admitted inputs and configuration. Each semantic extraction unit remains at or below 3,000 approximate tokens, including overlap. No wall-clock guarantee is introduced.

**Constraints**: Preserve 5 agents, 7 skills, and 2 prompts; keep `requires.tools: []`; no new agent, skill, dependency, instruction artifact, database, workflow state, or sibling-pack dependency schema; source material remains read-only; final publication is contained and atomic; coordinator-owned workflow state remains outside pack authority.

## Guardrail Check

| Guardrail | Plan response |
|---|---|
| Prefer deterministic scripts for mechanical work | Parsing, identity allocation, result indexing, bounds, accounting, schemas, hashes, coverage, lint, and finalization remain deterministic Node operations. |
| Use the smallest design satisfying proven requirements | Add one shared internal module and only two CLI helpers. Add index and merge modes to the existing merge CLI rather than adding another executable. |
| Preserve semantic ownership | Agents retain extraction, planning, drafting, and semantic review; scripts validate structure and evidence completeness without claiming semantic understanding. |
| Preserve pack conventions | Helpers remain nested in the existing runtime skill; tests remain under top-level pack `tests/` and do not ship. |
| Preserve public surface | Manifest `provides`, routing hooks, 5 agents, 7 skills, and 2 prompts remain unchanged. |
| Preserve coordinator boundaries | Pack agents and scripts do not mutate `.dude` feature state, task state, logs, or metadata. |
| Keep writing optional | No manifest requirement is added. Installed writing guidance may refine style, while local guidance remains complete. |
| Fail closed | Unsafe paths, aliases, malformed records, unreadable inputs, duplicate identities, stale reports, output drift, and incomplete bounded work cannot authorize finalization. |
| Avoid unsupported compatibility | Unversioned prototype artifacts are rejected and regenerated under schema version 2. No legacy flag or normalization path is added. |
| Protect unrelated work | Feature 006 is protected unrelated work and remains untouched. |

## Root Cause Groups

| Group | Accepted failure pattern | Architectural correction |
|---|---|---|
| Source identity | Mixed inputs were concatenated and document heading provenance was lost. | Authoritative source registry, one-source-at-a-time processing, source-bound `C*`/`E*` manifests, and mandatory source references. |
| Repository completeness | Inventory summarized selected categories but did not account for ordinary files or deterministic `R*` work. | Complete path dispositions, content hashes, bounded deterministic work units, and per-unit extraction results. |
| Trust boundaries | Path containment, symlinks, output aliases, missing parents, and unreadable inputs were handled inconsistently. | Mandatory invocation root reconstruction plus shared canonical path, alias, safe-parent, bounded-read, and atomic-write primitives used by every script. |
| Permissive interchange | Malformed or empty JSONL, duplicate identities, self-ingestion, nondeterministic result discovery, and invalid thresholds could pass or disappear. | Strict versioned schemas, object-only JSONL, deterministic script-authored result indexing, full option validation, explicit empty-input failure, and index-driven merge. |
| Parser correctness | WEBVTT reserved words, Unicode boundaries, overlap budgets, Markdown fences, and `C#` headings were mishandled. | Source-aware WEBVTT state machine, code-point-safe budgeting, and shared CommonMark fence tracking. |
| Gate freshness | Coverage and lint could describe a revision different from the reviewed or finalized document. | Digest-bound pre-review reports, a review handoff binding input and output digests, final reports bound to the reviewed output, expected-target drift protection, and a validating finalizer. |
| Workflow drift | Agents, skills, prompts, stale names, optional-writing language, and verification evidence disagreed. | One canonical sequence across all entry points, resolvable identities, local writing fallback, contract tests, lifecycle checks, and fresh independent approval. |

## Chosen Architecture

### Authoritative Source Registry

`sources.json` is the sole registry of source identity, configuration, work/output boundaries, output mode and expected state, and effective limits for one run. Every downstream artifact references its `sourceId`; downstream files do not redefine source metadata.

Every runtime command receives `--workspace-root`. The command resolves that argument, rejects symlink roots or components, requires an existing directory, obtains its canonical real path, and keeps the host path in memory only. The registry persists `workspaceRoot: "@root"`; it never persists the host root.

The registry:

- Accepts transcript, notes, draft, document, update-document, and repository inputs.
- Requires explicit `--mode create|replace|update`; mode is never inferred from target existence.
- Records `output.expectedTarget` so finalization can reject appearance, disappearance, type changes, content drift, symlink substitution, and forbidden aliases.
- Rejects duplicate canonical paths, duplicate file identities, symlink inputs, unsafe roots, and unauthorized input/output aliases.
- Derives `Source.ref` as exactly `Source.path`; callers cannot select it.
- Allows only a repository Source to use the reserved `@root` path and reference.
- Sorts Sources by fixed kind rank (`transcript`, `notes`, `draft`, `document`, `repo`), then role and UTF-8 bytewise normalized path.
- Assigns `S001`, `S002`, and subsequent IDs from that order.
- Allows output to alias only the one Source declared as `update-target`.
- Records the work directory and output before repository traversal so generated and prior output paths receive explicit skip dispositions rather than being re-ingested.

A registry may move with an intact workspace. A downstream command accepts a new invocation root only when the registry itself and all persisted relative paths, source types, identities, and digests validate beneath the newly reconstructed root.

### Per-Source Processing

No preprocessing command accepts multiple semantic Sources.

- Transcript, notes, and draft Sources are normalized independently and become `C*` chunks.
- Existing-document Sources become `E*` chunks that do not cross heading boundaries.
- Repository Sources become deterministic `R*` work units through complete accounting.
- `C`, `E`, and `R` each have an independent run-wide ordinal sequence beginning at `1`.
- Applicable Sources are processed in Source Registry order. Each producer accepts `--start`, persists `startOrdinal`, and returns the first unused `nextOrdinal`.
- Repository allocation is chained explicitly: the first repository receives `--start 1`, and every later repository receives the preceding Repository Inventory's `nextOrdinal`.
- Repository Inventory IDs are contiguous across `[startOrdinal, nextOrdinal)`, and `workUnits.length` equals `nextOrdinal - startOrdinal`.
- A complete repository with no admitted content emits no work units and preserves the handoff with `startOrdinal === nextOrdinal`.
- The configured source/work-unit ceiling applies once to the run-wide `R*` sequence, not once per repository. An allocation that would exceed it produces `complete: false`, records the limit hit, and stops the handoff.
- Identical registered Sources, bytes, limits, and start ordinals produce identical unit IDs, ordering, and manifests.

### Repository Accounting and Work Units

Repository traversal records every encountered descendant path as `admitted`, `skipped`, or `rejected`, with a reason for every non-admitted disposition. It never follows a symlink for traversal or content reads. A descendant symlink is `skipped` only when its target resolves and is proven contained beneath both the canonical repository root and canonical workspace root; otherwise, including a dangling, unresolvable, or escaping target, it is `rejected` and makes the inventory incomplete. A repository Source, workspace root, or authorization-boundary component that is itself a symlink is invalid direct input and fails before traversal. A repository equal to the workspace root has `path: "@root"` and `ref: "@root"`; descendant accounting paths remain ordinary workspace-relative POSIX paths.

Every admitted ordinary text/source file is hashed and represented by one or more non-overlapping member slices. Files are processed in normalized POSIX path order and line order. Small adjacent slices may share a bounded work unit; large files split only at line boundaries. A file containing any single line larger than one unit budget is not admitted: it is recorded as an explicitly accounted `skipped` entry with reason `oversized-line`, in the same class as the existing `non-text-file` and `empty-file` skips, and such an accounted skip may coexist with `complete: true`. Line-granular `RepositoryMember` cannot express a sub-line split, so hard splitting would emit duplicate member slices, unit digests, and locators.

`R*` work units are complete only when:

- Traversal finishes within all bounds.
- Every encountered path has one disposition.
- Every admitted file byte range is represented once.
- No rejected path, unreadable entry, changed-during-read file, or unsafe descendant symlink exists; an explicitly accounted safe skipped symlink does not prevent completeness.
- No work directory or prior output was admitted.
- Unit and accounting totals reconcile.
- The inventory's `startOrdinal` and `nextOrdinal` reconcile with contiguous work-unit IDs and the run-wide allocation ceiling.

### Extraction Result Indexing and Merge

The extractor writes one semantic per-unit result object to the exact conventional path `<workdir>/results/<UnitId>.json`. Evidence results declare the exact evidence-fragment path, byte length, digest, and entry count in the result object; fragment names are not inferred. No-evidence results forbid a fragment and require a non-empty reason and complete examined-member proof.

After extraction, `merge-ledger.mjs --mode index` reads `sources.json` and every expected chunk or repository-unit manifest. It requires the supplied manifests to cover exactly the Sources that require extraction, derives every exact result path from the expected unit ID, validates all results and result-declared fragments, rejects missing, duplicate, unexpected, aliased, malformed, stale, or changed files, and atomically authors `<workdir>/results.json`.

`merge-ledger.mjs --mode merge` reads only that index. It stable-reads each indexed result, verifies its byte length and SHA-256 digest, validates result-declared fragments, performs global ledger validation and deterministic ordering, and atomically writes `ledger.jsonl`. It does not enumerate a result directory, expand a glob, rediscover result files, or reread unit manifests.

`extraction-audit.mjs` also receives only `--result-index`; it independently revalidates the index and reconciles expected units, results, examined members, fragments, ledger entries, source provenance, repository members, and density diagnostics.

### Shared Runtime Module

`scripts/lib/runtime.mjs` owns:

- Mandatory workspace-root resolution and registry-root validation.
- Strict CLI parsing and finite/ranged numeric option validation.
- Bounded UTF-8, JSON, and JSONL readers.
- Versioned schema validation and duplicate detection.
- Canonical containment checks using `lstat`, `realpath`, and regular-file/directory requirements.
- Symlink-component rejection and hard-link/file-identity alias checks where the platform exposes identity.
- Safe output-parent creation one path segment at a time.
- SHA-256 hashing and changed-during-read detection.
- Deterministic path and ID comparison.
- Atomic adjacent-file writes using exclusive temporary files, flush/close, and rename.
- Atomic no-replace publication for create mode.
- Staged directory creation with rename to an absent destination or verified identical reuse.
- Unicode code-point iteration and approximate-token accounting.
- CommonMark fence state: matching marker character, closer length at least opener length, valid indentation, and unclosed-fence preservation.
- Standard diagnostics and exit-code mapping.

The module is internal to the existing runtime skill and does not create a public skill.

### Minimal New CLI Helpers

`source-manifest.mjs` is necessary because source identity, aliases, output exclusions, explicit mode, expected target state, and limits must be resolved once rather than interpreted differently by nine scripts.

`finalize.mjs` is necessary because report freshness, source immutability, expected-target drift, exact update-target authorization, containment, and atomic publication must be enforced mechanically rather than described in agent prose.

No other CLI helper is added. Deterministic index authorship and merge remain two modes of the existing `merge-ledger.mjs`; outline validation remains a mode of `coverage.mjs`; extraction completeness remains a mode of `extraction-audit.mjs`.

### Output Drift Protection

`source-manifest.mjs` records the output target's portable expected state during registration. Create records absence. Replace records a stable read of the existing target. Update binds the output target to the registered existing-document Source and records the same bytes and digest as that Source.

`finalize.mjs` recomputes and compares this state immediately before publication. Appearance, disappearance, type change, content drift, path escape, symlink substitution, or a forbidden current identity alias fails without changing the target.

Persisted state contains normalized relative paths, byte lengths, and SHA-256 digests only. Device and inode values are recomputed transiently for alias checks and are never required to relocate a work directory. A byte-identical replacement between registration and finalization is equivalent under this portable contract.

## Machine Contracts

### Common Encoding and Identity Rules

- All structured artifacts use `schemaVersion: 2`.
- JSON uses UTF-8, fixed field order, two-space indentation, LF endings, and one terminal newline.
- JSONL contains one compact JSON object per nonblank line. Scalars, arrays, bare IDs, comments, blank-only required files, unknown fields, and malformed lines are invalid.
- Hashes are lowercase SHA-256 over exact file bytes.
- `--workspace-root` is a required invocation-only argument for `source-manifest.mjs` and every downstream CLI. It may be absolute or relative to the process working directory. Each CLI resolves it, rejects symlink roots or components, requires an existing directory, obtains its canonical real path, and retains that host path only in memory.
- The Source Registry persists `workspaceRoot: "@root"`. The exact scalar `@root` is the reserved workspace-root anchor and is not an ordinary `Path`.
- An ordinary `Path` is a nonempty normalized workspace-relative POSIX path with no absolute form, backslash, NUL, empty segment, `.` segment, or `..` segment. A `WorkspacePath` is either `@root` or an ordinary `Path`.
- Only a repository Source may use `@root` as its `path`. Work, output, file-Source, unit-file, accounting, member, index, and report paths use ordinary `Path` values.
- Every downstream CLI receives `--workspace-root`, requires the supplied registry to be contained by that root, validates `workspaceRoot: "@root"`, and resolves persisted paths beneath the in-memory canonical root. Existing paths must remain contained both lexically and after `realpath`; missing output parents use safe segment-by-segment creation.
- `source-manifest.mjs` derives each `Source.ref`; callers cannot supply it. `Source.ref` equals `Source.path`, so a workspace-root repository has `path: "@root"` and `ref: "@root"`. References remain stable when an intact workspace is relocated.
- Persisted deterministic artifacts and persisted diagnostics contain no absolute host paths. Non-persisted stderr diagnostics may include the canonical host path.
- Deterministic artifacts contain no timestamps, random IDs, or locale-dependent ordering.
- Evidence IDs use `<unitId>-F<NNN>`, with a three-digit positive ordinal local to the unit.
- Duplicate source, unit, evidence, decision, action, or consumed identities fail before authorization.

### `sources.json`

```text
{
  schemaVersion,
  workspaceRoot: "@root",
  workdir,
  output: {
    path, mode, updateSourceId,
    expectedTarget: { state, bytes, sha256 }
  },
  limits: { ...all 17 effective integer limits... },
  sources: [{
    id, kind, role, ref, path, pathType,
    sizeBytes?, sha256?
  }]
}
```

- `workspaceRoot` is always the literal `@root`; the invocation's canonical host root is never serialized.
- `workdir` and `output.path` are ordinary workspace-relative `Path` values.
- `mode` is required and is `create`, `replace`, or `update`; it is never inferred.
- `updateSourceId` is the update-target Source ID for `update`; otherwise it is `null`.
- `expectedTarget.state` is `absent` or `file`.
- For `state: absent`, `bytes` and `sha256` are `null`.
- For `state: file`, `bytes` is a nonnegative safe integer and `sha256` is the lowercase SHA-256 digest of the exact registered bytes.
- `create` requires the output to be absent at registration, records `state: absent`, and requires it to remain absent until atomic no-replace publication.
- `replace` requires the output to exist as a regular non-symlink file at registration, records its exact length and digest, and requires the same state immediately before publication. It forbids registering the target as a Source.
- `update` requires exactly one `--update-document`. The normalized `--output` and `--update-document` paths must be equal and identify the same existing regular non-symlink file. `expectedTarget.bytes` and `expectedTarget.sha256` equal that Source's registered size and digest.
- `--update-document` is forbidden for `create` and `replace`.
- `kind` is `transcript`, `notes`, `draft`, `document`, or `repo`.
- `role` is `input` or `update-target`. Only the `--update-document` Source has `role: update-target`.
- `path` is an ordinary `Path`, except that a repository equal to the workspace root uses `@root`.
- `ref` is derived and exactly equals `path`; no CLI option supplies it.
- `sizeBytes` and `sha256` are required for file Sources; repository content identity is established by inventory.
- At least one Source is required.
- `create` and `replace` forbid output aliasing with every Source. `update` permits only the exact update-target Source/output alias. Canonical-path, symlink, and available file-identity aliases are included in this check.
- A repository Source may contain the work directory or output path. Those registered paths receive explicit skip dispositions during traversal.
- Immediately before publication, finalization rejects target appearance, disappearance, type change, byte drift, symlink substitution, path escape, or forbidden alias and leaves the target unchanged.

### Preprocessing Report

```text
{
  schemaVersion, sourceId, sourceSha256, complete,
  output: { path, sizeBytes, sha256 },
  lineMap: [{
    outputStartLine, outputEndLine,
    sourceStartLine, sourceEndLine
  }],
  counts: {
    inputLines, outputLines, removedTimestamps,
    removedCueIds, removedTags, removedReservedBlocks
  }
}
```

`complete` must be true before chunking. Transcript parsing removes only actual WEBVTT/SRT structure. Notes and drafts retain source text apart from newline normalization.

### Heading Manifest

```text
{
  schemaVersion, sourceId, sourceSha256, complete,
  headings: [{
    level, text, path, startLine, endLine
  }]
}
```

Heading paths are hierarchical and disambiguated by source line span. Fenced headings are excluded. Closing ATX hashes are removed only when preceded by whitespace, preserving names such as `C#`.

### `C*` and `E*` Chunk Manifest

```text
{
  schemaVersion, sourceId, sourceKind, sourceSha256,
  prefix, startOrdinal, nextOrdinal,
  budget: { approximateTokens, overlapTokens },
  complete,
  units: [{
    id, file, sizeBytes, sha256, codePoints,
    approximateTokens,
    cleanRange: { startLine, endLine },
    sourceRange: { startLine, endLine },
    sourceRef, headingPath?, overlapFrom?
  }]
}
```

- `prefix` is derived from source kind and role, not freely supplied.
- `startOrdinal` is the exact invocation start and `nextOrdinal` is the first unused ordinal.
- Approximate tokens are `ceil(UnicodeCodePointCount / 4)`.
- Overlap is included inside the unit budget.
- `E*` units do not cross heading boundaries and require `headingPath`.
- Every unit requires `sourceRef`; provenance is never inferred later.

### Repository Inventory

```text
{
  schemaVersion, sourceId, rootRef,
  startOrdinal, nextOrdinal, repositoryDigest,
  limits, complete, limitHits,
  totals: {
    encountered, admitted, skipped, rejected,
    files, directories, symlinks, candidateBytes
  },
  accounting: [{
    path, pathType, disposition, reason?,
    sizeBytes?, sha256?, unitIds?
  }],
  workUnits: [{
    id, approximateTokens, digest,
    members: [{
      path, startLine, endLine,
      sizeBytes, sha256, sourceRef
    }]
  }]
}
```

- `rootRef` equals the repository Source's reference, including `@root` for a workspace-root repository.
- `startOrdinal` equals the invocation's `--start`; `nextOrdinal` is the first unused `R*` ordinal.
- Unit IDs are exactly the contiguous ordinals in `[startOrdinal, nextOrdinal)` and `workUnits.length === nextOrdinal - startOrdinal`.
- The first repository starts at `1`; later repositories start at the preceding inventory's `nextOrdinal`.
- A complete empty repository has `workUnits: []` and `nextOrdinal === startOrdinal`.
- The run-wide source/work-unit ceiling requires `nextOrdinal - 1` not to exceed the effective limit. Exhaustion writes `complete:false`, records the limit key, exits `1`, and stops authorizing handoff.
- `disposition` is `admitted`, `skipped`, or `rejected`.
- `reason` is required for `skipped` and `rejected`.
- `limitHits` is sorted and empty for a complete inventory.
- `repositoryDigest` hashes canonical accounting, work-unit membership, effective limits, ordinals, and admitted-file hashes.
- A persisted incomplete inventory has `complete:false`, exits `1`, and cannot proceed to index creation or finalization.

### Per-Unit Extraction Result

Every extractor writes exactly one strict JSON result at `<workdir>/results/<UnitId>.json`:

```text
{
  schemaVersion, unitId, sourceId, unitDigest,
  status, examined,
  fragment?, reason?
}
```

- `status` is `evidence` or `no-documentable-evidence`.
- `examined` is a nonempty array of `{sourceRef, sha256}` and must cover all unit members.
- `evidence` requires `fragment:{path,bytes,sha256,entryCount}` with `entryCount > 0`.
- The fragment path is declared by the result and is not inferred from a filename convention.
- `no-documentable-evidence` forbids `fragment` and requires a nonempty `reason`.
- Exactly one result must exist for every expected unit.

### Result Set Index (`results.json`)

`merge-ledger.mjs --mode index` atomically authors exactly one `<workdir>/results.json`. The closed root fields, in order, are:

```text
{
  schemaVersion,
  sourceRegistry: { path, bytes, sha256 },
  unitManifests: [{ sourceId, path, bytes, sha256 }],
  results: [{
    unitId, sourceId, sourceKind,
    path, bytes, sha256
  }]
}
```

- `schemaVersion` is `2`.
- `sourceRegistry` identifies the exact supplied `sources.json`.
- `unitManifests` contains exactly one complete expected-unit manifest for every extraction-bearing Source, ordered by Source Registry order and manifest path.
- `results` contains exactly one validated result for every expected unit, ordered by deterministic unit-ID comparison using prefix rank `C`, `E`, `R`, then numeric ordinal.
- Every path is a normalized POSIX path relative to the directory containing `results.json`.
- Every resolved index target must remain beneath the invocation root and identify a contained, non-symlink regular file.
- The exact result path is `<workdir>/results/<UnitId>.json`; result paths are derived by index mode and never accepted from model output.
- Index mode validates each result's expected unit, source, source kind, unit digest, strict schema, exact bytes, and digest.
- For evidence results, index mode validates the result-declared fragment path, containment, distinct identity, exact bytes, digest, record count, strict evidence schema, and canonical evidence order.
- The results directory must contain exactly the expected per-unit result JSON files. Missing, duplicate, unexpected, stale extra, aliased, malformed, or changed files fail.
- Counts are derived from arrays and are not duplicated.
- Index, registry, manifests, results, fragments, output, and protected work artifacts must satisfy containment and alias rules.
- Merge mode consumes only `results.json`, verifies every indexed result's path, bytes, digest, identity, schema, and declared fragment, and never enumerates a directory or rereads unit manifests.
- Extraction audit consumes the same index through `--result-index` and independently revalidates it.

### Evidence Ledger JSONL

```text
{
  "id": "...",
  "text": "...",
  "type": "...",
  "tag": "...",
  "source-id": "...",
  "source-kind": "...",
  "source-chunk": "...",
  "source-ref": "...",
  "importance": "...",
  "refs": ["..."]
}
```

Required fields are `id`, `text`, `type`, `tag`, `source-id`, `source-kind`, `source-chunk`, and `source-ref`.

- `type` is `fact`, `decision`, `action`, `parameter`, `example`, `constraint`, `behavior`, `interface`, `schema`, or `open-question`.
- `importance` is optional `high`, `medium`, or `low`; omitted means `medium`.
- `refs` is an optional unique evidence-ID array.
- `source-id`, `source-kind`, unit prefix, unit membership, and `source-ref` must agree with source and unit manifests.
- Prose reference: `<source.ref>#L<start>-L<end>`.
- Document reference: `<source.ref>:<Heading > Path>#L<start>-L<end>`.
- Repository reference: `<source.ref>:<path>#L<start>-L<end>` or a validated symbol-qualified form.
- Merge orders records by index unit order, then numeric `F` ordinal.

### Planning Digest

`digest.json` is the canonical machine digest. Its closed fields, in order, are:

```text
{
  schemaVersion,
  sourceRegistry: { path, sha256 },
  ledger: { path, sha256, entryCount },
  configuration: { snippetCodePoints },
  routing: {
    decisionActionSection,
    decisionActionIds
  },
  tags: [{
    tag, entryCount, typeCounts,
    example: { id, snippet }, ids
  }],
  markdown: { path, sizeBytes, sha256 }
}
```

- `schemaVersion` is `2`.
- `sourceRegistry` and `ledger` bind exact bytes; `ledger.entryCount` is positive.
- `configuration.snippetCodePoints` equals `sources.json.limits.digestSnippetCodePoints`.
- `routing.decisionActionSection` is the constant `Decisions and action items`.
- All `decision` and `action` IDs appear exactly once in `routing.decisionActionIds` and never in `tags`.
- Every other ledger ID appears exactly once in one tag group's `ids`; the union is the complete ledger ID set.
- Tags use the exact ledger `tag` string and follow first appearance after decision/action entries are excluded. IDs retain canonical ledger order.
- `typeCounts` uses Evidence Ledger type-enum order with zero counts omitted.
- The example is selected by importance rank `high`, `medium`, `low`, treating omission as `medium`; ties use earliest evidence ID.
- Snippets collapse maximal Unicode whitespace to one ASCII space and trim both ends. A snippet exceeding the limit keeps the first `limit - 3` Unicode code points and appends ASCII `...`.
- `markdown` identifies the exact rendered `digest.md` bytes, avoiding a circular self-hash.

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

`<id-list>` is `(none)` or IDs joined by comma plus one ASCII space. `<type-count-list>` is `type=count` values joined by comma plus one ASCII space in Evidence Ledger type-enum order. `<json-string>` is canonical JSON string serialization. There is one blank line between blocks, no trailing spaces, LF endings, and one terminal newline. No additional heading or line is permitted. Both digest outputs are regenerated together; mutation of either invalidates the pair.

### Outline Contract

```text
# Outline: <title>
ledger-sha256: <digest>

## <section>
covers: <evidence-id>, <evidence-id>
diagram: <flow> | <evidence-id>, ...   # optional
notes: <text>                          # optional
```

Every ledger ID appears on exactly one `covers:` line. Unknown, missing, or duplicate IDs fail outline coverage. Decision and action IDs route only to their selected destination and cannot also appear through tag-group duplication.

### Consumed JSONL

```text
{"id":"C001-F001","section":"Overview"}
{"id":"E002-F003","section":"Configuration","resolution":"superseded"}
```

Allowed fields are:

- `id`: required evidence ID.
- `section`: required exact final-document heading.
- `resolution`: optional and limited to `superseded`.

Each ledger ID appears exactly once. The named section must exist in the evaluated document. Bare IDs and duplicate records are invalid.

### Gate Report Envelope

```text
{
  schemaVersion, gate, stage, ok,
  inputs: [{ role, path, sha256 }],
  configuration: { ... },
  counts: { ... },
  violations: [{ code, path?, line?, id?, message }]
}
```

- `stage` is `intake`, `extraction`, `outline`, `pre-review`, or `final`.
- Input hashes bind the report to exact artifacts.
- Violations are deterministically ordered.
- Extraction counts include expected, result, evidence, no-evidence, and flagged units.
- Outline counts include ledger, assigned, missing, unknown, and duplicate IDs.
- Document coverage counts include ledger, consumed, uncovered, dangling, duplicate, and missing-section IDs.
- Lint counts include headings, fences, clarification markers, and violations.
- A pre-review report cannot satisfy a final-report requirement.

### Semantic Review Report

```text
{
  schemaVersion,
  gate: "semantic-review",
  ok,
  reviewer,
  inputDocumentSha256,
  outputDocumentSha256,
  consumedSha256,
  preReviewCoverageSha256,
  preReviewLintSha256,
  touchedSections,
  findings: [{ code, severity, section, resolution }]
}
```

The reviewer identity is `dude-pack-technical-docs-reviewer`. Any post-report mutation invalidates the report. A targeted fix requires a new semantic report for the resulting document before final gates run.

### Limits

Every limit is a canonical decimal safe integer with lexical form `0|[1-9][0-9]*`, followed by inclusive-range validation. Positive fields reject `0`. Signs, leading zeros, decimal points, exponents, whitespace, partial parses, and unsafe integers are invalid.

Only `source-manifest.mjs` accepts limit flags. It persists every effective value in `sources.json.limits`. No downstream command accepts a limit override.

| `sources.json.limits` field | Exact flag | Default | Min | Max |
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

Cross-field rules are:

- `jsonlBytesPerLine <= jsonlBytesPerFile`
- `repositoryChildrenPerDirectory <= repositoryEncounteredEntries`
- `repositoryAdmittedFiles <= repositoryEncounteredEntries`
- `repositoryBytesPerAdmittedFile <= repositoryCandidateBytes`
- `unitOverlapApproximateTokens < unitApproximateTokens`

A cross-field violation exits `2` before dependent work and replaces no output. No limit may silently clip successful work.

### Extraction-Audit Thresholds

`extraction-audit.mjs` accepts only these threshold flags:

| Flag | Stored configuration field | Type | Default | Inclusive range |
|---|---|---|---:|---:|
| `--min-entries` | `minEntries` | canonical nonnegative integer | 2 | 0 through 1,000 |
| `--floor-per-1k` | `floorPer1k` | canonical decimal | 5 | 0 through 1,000 |
| `--ratio` | `ratio` | canonical decimal | 0.5 | 0 through 1 |

A canonical decimal is `(?:0|[1-9][0-9]*)(?:\.[0-9]{0,5}[1-9])?`. It has at most six fractional digits and no redundant trailing zero. Exponents, signs, leading zeros, `.5`, `5.`, `5.0`, partial parses, `NaN`, and infinities are invalid.

At least one threshold must be greater than zero. Thresholds apply only to validated `status: evidence` units. Validated no-evidence units remain in completeness counts and are excluded from threshold calculations.

A unit is flagged when any enabled comparison is true:

- `entryCount < minEntries`
- `entryCount * 1000 / approximateTokens < floorPer1k`
- `density < ratio * medianDensity`

Comparisons use unrounded values; equality passes. The relative comparison applies only when at least three evidence units have positive token counts and their median density is positive. Median and comparisons are computed before display rounding. Any flagged unit makes the extraction gate `ok:false` and exits `1`.

### Exit Codes and Persistence

| Condition | Exit | Persistence |
|---|---:|---|
| Successful operation or passing gate | `0` | Atomically replace the declared data or report output. |
| Completed failed gate | `1` | Atomically replace the gate report with `ok:false`; preserve data and final output. |
| Repository traversal or allocation discovers an unreadable entry, unsafe descendant symlink, escaping path, changed-during-read file, per-file overflow, or traversal/allocation bound | `1` | Atomically replace only the inventory with deterministic `complete:false` accounting and violations. |
| Invalid CLI or schema, including an invocation or registry with no Source; invalid direct registered source (including a symlink repository Source); symlinked workspace root or authorization-boundary component; or invalid repository entry path, direct path, unreadable direct file, alias, containment, digest, or hard bound detected before traversal | `2` | Replace no declared output and remove every temporary artifact. |
| Missing, unreadable, malformed, stale, or hash-mismatched required index, manifest, result, or fragment | `2` | Replace no declared output and remove every temporary artifact. |
| Syntactically valid but empty required expected-unit, result, ledger, or consumed set | `3` | Replace no declared output and emit no passing completeness report. |

For merge specifically:

- Missing `--index`, a missing index, or a missing indexed file exits `2`.
- A nonempty result set that omits an expected unit exits `2`.
- An empty expected-unit set exits `3`.
- An empty result set exits `3`, including when expected units exist.
- A validated nonempty result set that yields an empty ledger exits `3`.
- Exits `2` and `3` leave the prior ledger byte-for-byte unchanged.

A failed write never leaves a partial replacement or temporary artifact.

## Command Interfaces

`<rt>` means `.github/skills/dude-pack-technical-docs-runtime/scripts` after installation. Every runtime command requires the same logical `--workspace-root`; the canonical host path is reconstructed at invocation and is never read from a persisted artifact.

```bash
node <rt>/source-manifest.mjs \
  --workspace-root <dir> --mode <create|replace|update> \
  --workdir <dir> --output <file> \
  [--transcript <file>]... [--notes <file>]... [--draft <file>]... \
  [--document <file>]... [--update-document <file>] [--repo <dir>]... \
  [--limit-<name> <value>]... --out <sources.json>

node <rt>/preprocess.mjs \
  --workspace-root <dir> --sources <sources.json> --source <S-id> \
  --out <clean.txt> --json <preprocess.json>

node <rt>/headings.mjs \
  --workspace-root <dir> --sources <sources.json> --source <S-id> \
  --out <headings.json>

node <rt>/chunk.mjs \
  --workspace-root <dir> --sources <sources.json> \
  --source <S-id> --start <positive-int> \
  [--preprocess <preprocess.json>] [--headings <headings.json>] \
  --outdir <dir>

node <rt>/repo-inventory.mjs \
  --workspace-root <dir> --sources <sources.json> \
  --source <S-id> --start <positive-int> --out <inventory.json>

node <rt>/merge-ledger.mjs \
  --workspace-root <dir> --mode index \
  --sources <sources.json> \
  --unit-manifest <manifest> [--unit-manifest <manifest>]... \
  --results-dir <results-dir> --out <results.json>

node <rt>/merge-ledger.mjs \
  --workspace-root <dir> --mode merge \
  --index <results.json> --out <ledger.jsonl>

node <rt>/extraction-audit.mjs \
  --workspace-root <dir> --sources <sources.json> \
  --ledger <ledger.jsonl> --result-index <results.json> \
  [--min-entries <int>] [--floor-per-1k <decimal>] \
  [--ratio <decimal>] --json <extraction.json>

node <rt>/ledger-digest.mjs \
  --workspace-root <dir> --sources <sources.json> \
  --ledger <ledger.jsonl> --out <digest.md> --json <digest.json>

node <rt>/coverage.mjs \
  --workspace-root <dir> --mode outline \
  --ledger <ledger.jsonl> --outline <outline.md> \
  --json <outline-coverage.json>

node <rt>/coverage.mjs \
  --workspace-root <dir> --mode document --stage <pre-review|final> \
  --ledger <ledger.jsonl> --consumed <consumed.jsonl> \
  --document <document.md> --json <coverage.json>

node <rt>/lint.mjs \
  --workspace-root <dir> --sources <sources.json> \
  --stage <pre-review|final> <document.md> --json <lint.json>

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

`--mode` on `source-manifest.mjs` has no default. `--update-document` is required exactly once only for source mode `update`. `merge-ledger.mjs` supports only the explicit modes `index` and `merge`; there is no positional or compatibility mode. The final output destination and output mode are read from `sources.json`; `finalize.mjs` accepts neither override.

## Canonical Gate Sequence

1. **Root, source, mode, and target validation**: reconstruct the invocation root; create `sources.json`; validate source identities, containment, aliases, output exclusions, explicit mode, `expectedTarget`, and all 17 limits.
2. **Intake completeness**: preprocess and chunk each `C*` Source separately; extract headings and chunk each `E*` Source; inventory each repository into complete `R*` accounting while chaining prefix-specific ordinals.
3. **Extraction**: process every expected unit and write exactly one semantic result to `<workdir>/results/<UnitId>.json`.
4. **Deterministic result indexing**: run `merge-ledger.mjs --mode index` with the complete expected manifests; validate exact result filenames and result-declared fragments; atomically author `results.json`.
5. **Strict merge**: run `merge-ledger.mjs --mode merge`; consume only the index and atomically produce the nonempty ledger.
6. **Recall and completeness**: run extraction audit through `--result-index`; reconcile Sources, expected units, results, examined members, fragments, ledger provenance, repository members, and density diagnostics.
7. **Planning digest**: produce exact `digest.json` and `digest.md` bound to the Source Registry and ledger.
8. **Planning and exact-once outline coverage**: produce the Outline, then prove that every ledger ID is assigned exactly once.
9. **Drafting**: create the skeleton, fill each section, and write strict consumed records.
10. **Pre-review diagnostics**: run document coverage and lint with `stage:"pre-review"` against the same draft digest.
11. **Semantic review and diagrams**: review the pre-gated draft, make targeted changes, and emit a report binding the pre-review reports, input draft, resulting document, and consumed manifest.
12. **Post-review final gates**: run coverage and lint with `stage:"final"` against the review output. Both reports must bind the same document digest.
13. **Safe finalization**: recompute report and source hashes, revalidate repository members and update-source immutability, verify the digest chain, revalidate `output.expectedTarget` immediately before publication, create the safe parent, and atomically publish according to source mode.
14. **Mutation rule**: any Source, unit, result, index, fragment, ledger, digest, Outline, consumed record, draft, report, expected target, or output mutation invalidates that artifact and every dependent downstream gate. A post-review fix requires semantic review of the resulting revision followed by both final gates.

Pre-review reports are diagnostics and cannot authorize finalization. Final reports cannot be reused for a changed document. Create uses atomic no-replace publication; replace and update validate expected bytes before adjacent atomic replacement.

## Script-by-Script Changes

| Script | Status | Planned change |
|---|---|---|
| `scripts/lib/runtime.mjs` | New internal module | Implement root reconstruction, shared bounds, schemas, safe paths, aliases, atomic/no-replace writes, hashes, deterministic ordering, Unicode iteration, options, diagnostics, and CommonMark fence tracking. |
| `scripts/source-manifest.mjs` | New CLI | Register portable Sources and output once; require explicit mode; assign deterministic Source IDs; persist `@root`, limits, containment, aliases, exclusions, and `expectedTarget`. |
| `preprocess.mjs` | Harden existing | Require root reconstruction; accept one registered Source; preserve line provenance; correctly distinguish WEBVTT reserved blocks from cue IDs or cue text; use bounded reads and atomic output. |
| `headings.mjs` | Harden existing | Require root reconstruction; emit a heading manifest with hierarchical paths and line spans; share fence parsing; preserve `C#`; bind output to source digest. |
| `chunk.mjs` | Harden existing | Produce provenance-rich `C*`/`E*` units; derive prefix; persist `startOrdinal`/`nextOrdinal`; include overlap inside budget; split by Unicode code point; prevent `E*` units crossing headings; stage output safely. |
| `repo-inventory.mjs` | Harden existing | Reconstruct the root; account for every encountered descendant path; account for proven-contained descendant symlinks as skipped without following them; reject escaping paths, unsafe descendant symlinks, and invalid symlink entry points; disclose unreadable paths and all limit hits; hash admitted files; persist chained `startOrdinal`/`nextOrdinal`; construct complete deterministic `R*` units; create safe output parents. |
| `merge-ledger.mjs` | Harden existing | Add deterministic `--mode index` to require complete manifest coverage, derive and validate exact `<workdir>/results/<UnitId>.json` files and result-declared fragments, and atomically author schema-version-2 `results.json`; add `--mode merge` to consume only that index and atomically produce strict object-only `ledger.jsonl`. |
| `extraction-audit.mjs` | Harden existing | Consume only `--result-index`; independently validate index identities/digests; reconcile every expected unit and repository member with one result; apply exact threshold grammar, ranges, and density rules; emit a digest-bound report. |
| `ledger-digest.mjs` | Harden existing | Strictly parse bounded ledger data; emit the exact JSON and Markdown digest schemas; bind source/ledger hashes; enforce snippet rules, tag grouping, and exact-once decision/action routing. |
| `coverage.mjs` | Harden existing | Add `outline` and `document` modes; require object-only JSONL; enforce exact-once outline and consumed coverage; verify sections; distinguish empty consumed input from malformed input; emit stage- and digest-bound reports. |
| `lint.mjs` | Harden existing | Use shared fence tracking; enforce root reconstruction, bounded input/options, and valid Markdown constructs; emit stage- and document-digest-bound reports. |
| `scripts/finalize.mjs` | New CLI | Validate the complete report chain and current source state; revalidate `expectedTarget` immediately before publication; authorize only the exact update target; reject stale evidence and drift; safely create parents; publish through atomic no-replace or adjacent atomic rename. |

All 9 existing scripts are hardened. The two new CLIs and one internal module remain inside the existing runtime skill.

## Agent, Skill, and Prompt Changes

### Agents

| Agent | Change |
|---|---|
| `dude-pack-technical-docs-writer` | Own the canonical sequence, explicit source mode, Source Registry, prefix-specific ordinal handoffs, work directory, mutation invalidation, merge index/merge invocations, and finalizer invocation. |
| `dude-pack-technical-docs-extractor` | Process exactly one declared unit; write one semantic result to the exact conventional path; declare and emit strict evidence when present; preserve complete source provenance; never fabricate an entry to avoid a no-evidence result. |
| `dude-pack-technical-docs-planner` | Consume digest-bound input; emit the ledger digest in the Outline; assign every ID exactly once; remove stale skill-name prose. |
| `dude-pack-technical-docs-drafter` | Emit strict consumed objects exactly once; run pre-review diagnostics; preserve the local writing baseline when optional writing skills are absent. |
| `dude-pack-technical-docs-reviewer` | Perform semantic and diagram review only after pre-review diagnostics; emit the semantic review report; require re-review after any targeted post-report mutation. |

### Skills

| Skill | Change |
|---|---|
| `dude-pack-technical-docs-source-intake` | Make `sources.json` authoritative; document `@root`, explicit modes, `expectedTarget`, independent source processing, complete repository accounting, ordinal handoffs, and no legacy artifacts. |
| `dude-pack-technical-docs-evidence-ledger` | Replace permissive provenance with strict version-2 evidence, result, deterministic index/merge, Outline, and consumed contracts. |
| `dude-pack-technical-docs-traceability` | Require mandatory Source IDs/references and validate all final claims against admitted evidence. |
| `dude-pack-technical-docs-pipeline` | Establish the canonical sequence, deterministic index and merge modes, exact-once Outline, strict consumption, mutation invalidation, and local writing fallback. |
| `dude-pack-technical-docs-quality-audit` | Separate semantic review from deterministic pre/final gates and define the digest-bound review handoff. |
| `dude-pack-technical-docs-runtime` | Document all root-aware commands, modes, contracts, limits, thresholds, exit codes, safe-path rules, expected-target behavior, and finalization. |
| `dude-pack-technical-docs-diagrams` | No change; its existing semantic diagram rules remain applicable. |

### Prompts and Manifest

Both existing prompts will state the same canonical sequence, Source Registry contract, ordinal handoffs, deterministic index/merge contract, optional-writing behavior, final gate order, expected-target validation, and mutation invalidation rule.

Only the body of `pack.md` may change. Its complete frontmatter must remain byte-for-byte identical. The manifest body's hardened-runtime description and canonical workflow may be aligned, while its frontmatter inventory, routing, hooks, `provides`, and `requires.tools: []` remain unchanged.

The local writing fallback will require factual audience-oriented prose, consistent terminology, useful headings, concise active constructions, no meeting-recap narration, no unsupported claims, no filler, and tables or diagrams only when they improve comprehension. Installed writing skills may refine this baseline but cannot change intake, traceability, gates, or finalization.

Every path outside the declared workflow-alignment write set remains unchanged from base, including the diagrams skill.

## Tests and Verification

### Authoring-Only Node Tests

All automated tests live under `library/packs/technical-docs/tests/`, outside shipped categories. Fixtures are generated under the canonical real path of `os.tmpdir()`; no symlink fixture is committed.

| Test file | Coverage |
|---|---|
| `tests/runtime-repo-inventory.test.mjs` | `@root` repositories, ordinary-file accounting, deterministic `R*` units, chained ordinals, empty handoff, creation-order independence, dispositions, unreadable paths, symlinks, entry-point escape, language disclosure, missing output parent, exact bounds, and repository digest stability. |
| `tests/runtime-jsonl.test.mjs` | Exact flat result names, deterministic index and merge modes, strict evidence/results/consumed JSONL, malformed lines, scalars, arrays, blank ledgers, duplicate IDs, missing/unreadable/stale inputs, fragment declarations, aliases, merge repeatability, exact planning digest grammar, thresholds, and decision/action routing. |
| `tests/runtime-text.test.mjs` | Per-source boundaries, Source references, WEBVTT reserved-word cues, Unicode boundaries, overlap budget, hierarchical document headings, CommonMark fence matching, and `C#`. |
| `tests/runtime-bounds.test.mjs` | Exact and one-over coverage for all 17 limits, lexical and cross-field validation, direct-versus-discovered semantics, all three audit thresholds, and prior-output preservation. |
| `tests/runtime-gates.test.mjs` | Expected-unit reconciliation, no-evidence results, Outline exact-once coverage, consumed coverage, stale-report rejection, pre/final stage separation, review mutation, Source mutation, `expectedTarget` appearance/disappearance/type/byte/symlink/alias drift, atomic publication, and update-target authorization. |
| `tests/pack-contract.test.mjs` | Exact 5/7/2 surface; `pack.md` body-only change with complete frontmatter preserved byte-for-byte; resolvable pack-local references; absent retired names; canonical sequence across agents/skills/prompts; optional-writing wording; diagrams unchanged; declared write boundary; tests excluded from install inventory. |
| `tests/pack-composition.test.mjs` | Standalone install/verify/remove; both writing/technical-docs install orders; preservation of writing artifacts when technical-docs is removed; zero leftovers. |
| `tests/helpers/harness.mjs` | Shell-free CLI invocation, temporary roots, permission/symlink capability probes, deterministic artifact comparison, expected-target mutation helpers, and output-preservation assertions. |

Every test invokes public CLI commands even when pure helpers also receive focused coverage. A failed operation must leave any prior valid data output unchanged and no temporary artifact behind.

### Automated Four-Mode Product Coverage And Three Bounded Live Modes

Automated tests remain responsible for transcript-only, repository-only, mixed-source, and existing-document update product behavior. Repository-focused automated tests remain authoritative for current repository readiness. Repository-only live acceptance is deferred to separate future bounded or scoped repository work.

`tests/manual-agent-e2e.md` defines and records exactly three actual writer-agent runs:

1. **Transcript-only**: only `C*` units; valid WEBVTT cue text retained; transcript Source references preserved; final coverage and lint pass.
2. **Mixed prose**: transcript, notes, and draft remain separate with no repository Source; unique sentinels retain correct Source IDs and references without unit or ledger collisions.
3. **Existing-document update**: a prior generated document plus new transcript evidence uses explicit update mode; `E*` entries retain heading paths; unchanged content remains; superseded and replacement evidence is consumed; `expectedTarget` is checked immediately before atomic replacement.

Before any model call, each run performs deterministic intake and cost preflight reporting source count, extraction-unit count, approximate tokens, expected model calls and batches, and ETA. A run projected to exceed 20 extraction units or model calls, or 10 minutes, pauses for explicit user approval before extraction.

Each completed run records full canonical source, unit, ledger, semantic-review, final-coverage, final-lint, output-hash, and mode-specific traceability evidence. The independent reviewer receives the same final unmodified evidence set. Existing transcript-only evidence may be reused only when its complete chain is hash-current. `tech-expanded-output.md` remains user delivery and is not canonical update-mode evidence. Checked-in fixtures or simulated agent prose do not substitute for these three live runs.

### Completion Verification

Run verification in this order:

1. Focused technical-docs Node tests.
2. Three bounded live end-to-end modes, each after deterministic cost preflight and any required approval.
3. Full repository test discovery, excluding `dist`.
4. Standalone `compose verify`.
5. Dedicated standalone and writing-enabled install/remove tests.
6. Project `dude-lint` with zero failures.
7. Build a pristine core-only release output and lint that untouched output before any pack installation.
8. Create a separate disposable copy of the pristine release for technical-docs installation; never run compose against the pristine release.
9. In the disposable copy, verify the installed release-style surface contains exactly the declared agents, skills, prompts, 9 hardened existing runtime CLIs, 2 new CLIs, and the nested helper; verify authoring-only tests are absent.
10. Remove technical-docs from the disposable copy, verify zero pack-owned artifacts or stale references, and lint the remaining copy.
11. Confirm the pristine core-only release remains untouched and available for inspection.
12. Run whitespace/diff validation.
13. Obtain fresh independent review over the complete evidence set.

Any mutation after a passing step reruns that step and every affected downstream verification. Readiness requires automated product coverage across all four supported behaviors, focused tests, full tests, composition, lifecycle cleanup, lint, pristine release verification, separate disposable install/remove inspection, all three bounded live runs, and independent approval.

## Implementation Phases and Safe Dependency Order

The labels below are proposed task labels only. The Spec Lead will derive canonical task wording and durable hashes.

| Phase | Label | Work | Dependencies and focused validation |
|---|---|---|---|
| 1. Shared contracts and primitives | `T001` | Implement `runtime.mjs`, version-2 validators, root reconstruction, all bounds, paths, aliases, hashing, atomic/no-replace writes, fence tracking, and the test harness. | First slice. Validate helper-level path, option, serialization, and atomic-write tests. |
| 2. Source authority | `T002` | Implement `source-manifest.mjs`, `@root`, deterministic Source IDs, explicit modes, output exclusions, safe parents, `expectedTarget`, and Source freshness data. | Depends on `T001`. Validate duplicate, alias, symlink, containment, mode, target-state, empty-Source, and limit cases. |
| 3. Provenance-rich prose/document intake | `T003` | Harden preprocess, headings, and chunk for independent Sources, WEBVTT, heading paths, Unicode, budgets, and deterministic `C*`/`E*` ordinal allocation. | Depends on `T001` and `T002`. May proceed in parallel with `T004`; run focused text tests. |
| 4. Complete repository intake | `T004` | Harden repository traversal, accounting, bounds, hashes, safe output, root repositories, chained `startOrdinal`/`nextOrdinal`, and deterministic run-wide `R*` units. | Depends on `T001` and `T002`. May proceed in parallel with `T003`; run focused repository tests. |
| 5. Deterministic result index, merge, audit, and digest | `T005` | Harden `merge-ledger.mjs` with deterministic `--mode index` and `--mode merge`; harden extraction audit for complete reconciliation and exact thresholds; harden ledger digest for the exact JSON/Markdown grammar, snippets, groups, and routing. | Depends on `T003` and `T004`. Complete manifests and exact conventional results must produce byte-identical `results.json`, ledger, and digest outputs; run focused JSONL tests. |
| 6. Fresh gates and finalization | `T006` | Extend coverage and lint, implement semantic-review handoff validation and `finalize.mjs`, enforce the digest chain, and revalidate `expectedTarget` immediately before publication. | Depends on `T002` through `T005`. Run focused stale-report, target-drift, mutation, coverage, lint, and atomic-finalization tests. |
| 7. Pack workflow alignment | `T007` | Update only the body of `pack.md`; align 5 agents, 6 affected skills, and 2 prompts; preserve `pack.md` frontmatter byte-for-byte; leave diagrams and every path outside the declared write set unchanged. | Depends on stable commands and contracts from `T003` through `T006`. Run pack-contract tests that enforce the surface, frontmatter, references, and write boundary. |
| 8. Automated composition and lifecycle evidence | `T008` | Complete authoring-only tests, standalone/writing matrices, install/remove cleanup, and pristine-release plus separate disposable installed-surface checks. | Depends on `T007`. Run focused pack tests, then full repository tests, compose, lint, and release checks. |
| 9. Bounded live acceptance and independent approval | `T009` | Preflight and execute transcript-only, repository-free mixed prose, and prior-generated-document update with new transcript evidence; preserve full canonical evidence and obtain independent approval. | Depends on `T008`. Approval is required before extraction above 20 units or calls or 10 estimated minutes. Repository-only live acceptance is deferred. |

## Exact Source Write Inventory

### Current Paths to Modify

- [library/packs/technical-docs/pack.md](library/packs/technical-docs/pack.md) (body only; preserve complete frontmatter byte-for-byte)
- [library/packs/technical-docs/agents/dude-pack-technical-docs-writer.agent.md](library/packs/technical-docs/agents/dude-pack-technical-docs-writer.agent.md)
- [library/packs/technical-docs/agents/dude-pack-technical-docs-extractor.agent.md](library/packs/technical-docs/agents/dude-pack-technical-docs-extractor.agent.md)
- [library/packs/technical-docs/agents/dude-pack-technical-docs-planner.agent.md](library/packs/technical-docs/agents/dude-pack-technical-docs-planner.agent.md)
- [library/packs/technical-docs/agents/dude-pack-technical-docs-drafter.agent.md](library/packs/technical-docs/agents/dude-pack-technical-docs-drafter.agent.md)
- [library/packs/technical-docs/agents/dude-pack-technical-docs-reviewer.agent.md](library/packs/technical-docs/agents/dude-pack-technical-docs-reviewer.agent.md)
- [library/packs/technical-docs/prompts/dude-pack-technical-docs-write-technical-document.prompt.md](library/packs/technical-docs/prompts/dude-pack-technical-docs-write-technical-document.prompt.md)
- [library/packs/technical-docs/prompts/dude-pack-technical-docs-document-this-repository.prompt.md](library/packs/technical-docs/prompts/dude-pack-technical-docs-document-this-repository.prompt.md)
- [library/packs/technical-docs/skills/dude-pack-technical-docs-source-intake/SKILL.md](library/packs/technical-docs/skills/dude-pack-technical-docs-source-intake/SKILL.md)
- [library/packs/technical-docs/skills/dude-pack-technical-docs-evidence-ledger/SKILL.md](library/packs/technical-docs/skills/dude-pack-technical-docs-evidence-ledger/SKILL.md)
- [library/packs/technical-docs/skills/dude-pack-technical-docs-traceability/SKILL.md](library/packs/technical-docs/skills/dude-pack-technical-docs-traceability/SKILL.md)
- [library/packs/technical-docs/skills/dude-pack-technical-docs-pipeline/SKILL.md](library/packs/technical-docs/skills/dude-pack-technical-docs-pipeline/SKILL.md)
- [library/packs/technical-docs/skills/dude-pack-technical-docs-quality-audit/SKILL.md](library/packs/technical-docs/skills/dude-pack-technical-docs-quality-audit/SKILL.md)
- [library/packs/technical-docs/skills/dude-pack-technical-docs-runtime/SKILL.md](library/packs/technical-docs/skills/dude-pack-technical-docs-runtime/SKILL.md)
- [library/packs/technical-docs/skills/dude-pack-technical-docs-runtime/scripts/preprocess.mjs](library/packs/technical-docs/skills/dude-pack-technical-docs-runtime/scripts/preprocess.mjs)
- [library/packs/technical-docs/skills/dude-pack-technical-docs-runtime/scripts/chunk.mjs](library/packs/technical-docs/skills/dude-pack-technical-docs-runtime/scripts/chunk.mjs)
- [library/packs/technical-docs/skills/dude-pack-technical-docs-runtime/scripts/headings.mjs](library/packs/technical-docs/skills/dude-pack-technical-docs-runtime/scripts/headings.mjs)
- [library/packs/technical-docs/skills/dude-pack-technical-docs-runtime/scripts/repo-inventory.mjs](library/packs/technical-docs/skills/dude-pack-technical-docs-runtime/scripts/repo-inventory.mjs)
- [library/packs/technical-docs/skills/dude-pack-technical-docs-runtime/scripts/merge-ledger.mjs](library/packs/technical-docs/skills/dude-pack-technical-docs-runtime/scripts/merge-ledger.mjs)
- [library/packs/technical-docs/skills/dude-pack-technical-docs-runtime/scripts/extraction-audit.mjs](library/packs/technical-docs/skills/dude-pack-technical-docs-runtime/scripts/extraction-audit.mjs)
- [library/packs/technical-docs/skills/dude-pack-technical-docs-runtime/scripts/ledger-digest.mjs](library/packs/technical-docs/skills/dude-pack-technical-docs-runtime/scripts/ledger-digest.mjs)
- [library/packs/technical-docs/skills/dude-pack-technical-docs-runtime/scripts/coverage.mjs](library/packs/technical-docs/skills/dude-pack-technical-docs-runtime/scripts/coverage.mjs)
- [library/packs/technical-docs/skills/dude-pack-technical-docs-runtime/scripts/lint.mjs](library/packs/technical-docs/skills/dude-pack-technical-docs-runtime/scripts/lint.mjs)

### New Paths

- `library/packs/technical-docs/skills/dude-pack-technical-docs-runtime/scripts/lib/runtime.mjs`
- `library/packs/technical-docs/skills/dude-pack-technical-docs-runtime/scripts/source-manifest.mjs`
- `library/packs/technical-docs/skills/dude-pack-technical-docs-runtime/scripts/finalize.mjs`
- `library/packs/technical-docs/tests/helpers/harness.mjs`
- `library/packs/technical-docs/tests/runtime-repo-inventory.test.mjs`
- `library/packs/technical-docs/tests/runtime-jsonl.test.mjs`
- `library/packs/technical-docs/tests/runtime-text.test.mjs`
- `library/packs/technical-docs/tests/runtime-bounds.test.mjs`
- `library/packs/technical-docs/tests/runtime-gates.test.mjs`
- `library/packs/technical-docs/tests/pack-contract.test.mjs`
- `library/packs/technical-docs/tests/pack-composition.test.mjs`
- `library/packs/technical-docs/tests/manual-agent-e2e.md`

The diagrams skill is intentionally unchanged. No instruction file, dependency manifest, generated fixture, compatibility adapter, additional pack artifact, or additional CLI is added. Phase `T007` may modify only the declared manifest body, five agent files, six affected skill files, two prompt files, and its contract test; its independent validation compares all other paths to base.

## Requirements Traceability

| Requirements | Success criteria | Plan phases | Proposed labels |
|---|---|---|---|
| `FR-001` through `FR-006` | `SC-001`, `SC-002` | Source Registry, per-source `C*`/`E*` processing, strict provenance, workflow alignment, automated four-mode product coverage, and bounded three-mode live acceptance | `T002`, `T003`, `T007`, `T008`, `T009` |
| `FR-007` through `FR-014` | `SC-001`, `SC-002`, `SC-004`, `SC-005` | Shared root/path safety, output exclusions, complete repository accounting, ordinal-chained deterministic `R*` units, safe parents, expected-target binding, finalization, and automated repository readiness coverage | `T001`, `T002`, `T004`, `T006`, `T008` |
| `FR-015` through `FR-022` | `SC-003`, `SC-005` | Strict schemas, exact results, deterministic index/merge, all bounds, duplicate detection, deterministic artifacts, atomic writes, and failure preservation | `T001`, `T002`, `T005`, `T006`, `T008` |
| `FR-023` through `FR-026` | `SC-006` | WEBVTT state handling, Unicode-safe chunks, budget enforcement, CommonMark fences, `C#`, and exact decision/action routing | `T001`, `T003`, `T005`, `T008` |
| `FR-027` through `FR-030` | `SC-007` | Canonical ordering, stage-specific reports, semantic-review digest handoff, final gates, invalidation, expected-target revalidation, and safe finalization | `T005`, `T006`, `T007`, `T009` |
| `FR-031` through `FR-034` | `SC-008`, `SC-013` | Optional-writing fallback, resolvable identities, preserved namespace/public surface/frontmatter, and coordinator boundary | `T007`, `T008` |
| `FR-035` through `FR-037` | `SC-002`, `SC-006`, `SC-008`, `SC-010` | Focused runtime/contract tests, automated coverage across all four supported behaviors, standalone/writing-enabled composition, and bounded three-mode live acceptance | `T008`, `T009` |
| `FR-038` through `FR-040` | `SC-009`, `SC-011`, `SC-012` | Install/remove cleanup, full suite, compose, lint, pristine core release, separate disposable installed-surface verification, evidence refresh, and independent approval | `T008`, `T009` |
| `FR-041` | `SC-014` | Deterministic live cost preflight and approval enforcement before model extraction | `T009` |

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Semantic extraction cannot mechanically prove every meaningful fact was understood. | Prove complete Source/unit examination, require explicit no-evidence results, retain density diagnostics, use sentinel-based live fixtures, and require semantic review. |
| Files may change between registration, extraction, review, and finalization. | Hash at each boundary, detect changed-during-read files, bind reports to exact bytes, persist expected target state, and rehash all file Sources, admitted repository members, and the output target before publication. |
| Filesystem alias and permission behavior differs by platform. | Combine lexical containment, `lstat`, `realpath`, and device/inode identity where available; capability-probe symlink and unreadability tests and record any justified platform skip. |
| Atomic replacement of a populated directory is not uniformly portable. | Stage unit directories beside an absent destination; reuse only when every existing digest matches; otherwise fail without mutation. Final document publication remains atomic no-replace for create or an adjacent file rename for replace/update. |
| Bound defaults may be too low for a legitimate repository. | Permit explicit validated overrides only during source registration. Any exhausted bound remains incomplete and blocks finalization until a deliberate rerun. |
| Digest-chain or index-contract complexity could drift across scripts. | Generate and validate shared schemas through `runtime.mjs`; make one CLI mode author the authoritative index; test every stale index, report, and stage-substitution edge. |
| Optional writing guidance may vary model output. | Keep all functional contracts local and invariant; test both composition states; treat writing skills as style refinement only. |
| Release installation checks mutate the inspected directory. | Build and lint a pristine core-only release, preserve it untouched, and use a separate disposable copy for compose installation, installed-surface inspection, removal, and cleanup checks. |
| Agent-produced result or review objects could be structurally valid but semantically weak. | Keep deterministic validation separate from independent semantic review and require fresh approval over the complete evidence set. |

## Objective Registry

This plan emits no objective registry region or marker lines.
