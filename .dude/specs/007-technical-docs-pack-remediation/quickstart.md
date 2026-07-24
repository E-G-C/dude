# Verification Quickstart

This guide describes expected observations. It does not record test results.

## Conventions

- `<rt>`: installed `dude-pack-technical-docs-runtime/scripts` directory.
- `<tmp>`: disposable verification root.
- `<catalog>`: pack catalog directory containing `technical-docs` and optionally `writing`.
- `<root>`: canonical workspace root for the active flow; every technical-doc runtime command repeats it through `--workspace-root`.
- `<work>`: contained work directory for one flow.
- `<result-index>`: exact `<work>/results.json` authored by `merge-ledger.mjs --mode index` from complete expected-unit manifests and conventional per-unit results.
- Result directories are never passed to merge, audit, or another downstream consumer and are never recursively searched. Index mode checks one declared results directory against exact manifest-derived filenames.
- Use fresh fixtures and destinations for each flow. Do not reuse prototype work artifacts.

## Transcript-Only Intake

Prepare a WEBVTT fixture containing an actual reserved block and valid cue text beginning with `NOTE`, `STYLE`, and `REGION`.

```bash
node <rt>/source-manifest.mjs \
  --workspace-root <tmp>/transcript \
  --mode create \
  --workdir <tmp>/transcript/.td-work \
  --output <tmp>/transcript/output.md \
  --transcript <tmp>/transcript/input.vtt \
  --out <tmp>/transcript/.td-work/sources.json

node <rt>/preprocess.mjs \
  --workspace-root <tmp>/transcript \
  --sources <tmp>/transcript/.td-work/sources.json \
  --source <transcript-source-id> \
  --out <tmp>/transcript/.td-work/clean.txt \
  --json <tmp>/transcript/.td-work/preprocess.json

node <rt>/chunk.mjs \
  --workspace-root <tmp>/transcript \
  --sources <tmp>/transcript/.td-work/sources.json \
  --source <transcript-source-id> \
  --start 1 \
  --preprocess <tmp>/transcript/.td-work/preprocess.json \
  --outdir <tmp>/transcript/.td-work/chunks
```

Expected observations:

- The registry persists `workspaceRoot: "@root"`, explicit `mode: "create"`, and `expectedTarget: {state: "absent", bytes: null, sha256: null}`.
- The registry contains one transcript Source and no repository Source.
- Only actual WEBVTT structure is removed; reserved-word cue text remains.
- Every unit is `C*`, stays within the configured token budget including overlap, and retains transcript line provenance.
- Repeating the flow with identical bytes, limits, and start ordinal produces byte-identical deterministic manifests and unit files.

## Repository-Only Intake

Use a workspace-root repository fixture containing ordinary implementation files, configuration, tests, nested directories, an excluded work directory, and a fresh missing inventory-output parent.

```bash
node <rt>/source-manifest.mjs \
  --workspace-root <tmp>/repository \
  --mode create \
  --workdir <tmp>/repository/.td-work \
  --output <tmp>/repository/output.md \
  --repo <tmp>/repository \
  --out <tmp>/repository/.td-work/sources.json

node <rt>/repo-inventory.mjs \
  --workspace-root <tmp>/repository \
  --sources <tmp>/repository/.td-work/sources.json \
  --source <repository-source-id> \
  --start 1 \
  --out <tmp>/repository/.td-work/new-parent/inventory.json
```

Expected observations:

- Because the repository equals the workspace root, its Source has `path: "@root"` and `ref: "@root"`; descendant accounting paths remain ordinary workspace-relative POSIX paths.
- The missing contained output parent is created safely.
- The inventory persists `startOrdinal: 1` and the first unused `nextOrdinal`.
- Every encountered path has exactly one disposition and every non-admitted path has a reason.
- Every admitted ordinary source file is hashed and represented by one or more non-overlapping `R*` member slices.
- Work and output paths are explicitly skipped rather than re-ingested.
- `complete: true` occurs only with empty `limitHits`, no blocking rejection, and reconciled totals.
- Changing directory creation order without changing admitted content does not change identities or repository digest.

## Mixed-Source Intake

Register transcript, notes, draft, and two repository fixtures together.

```bash
node <rt>/source-manifest.mjs \
  --workspace-root <tmp>/mixed \
  --mode create \
  --workdir <tmp>/mixed/.td-work \
  --output <tmp>/mixed/output.md \
  --transcript <tmp>/mixed/input.vtt \
  --notes <tmp>/mixed/notes.md \
  --draft <tmp>/mixed/draft.md \
  --repo <tmp>/mixed/repository-a \
  --repo <tmp>/mixed/repository-b \
  --out <tmp>/mixed/.td-work/sources.json

node <rt>/repo-inventory.mjs \
  --workspace-root <tmp>/mixed \
  --sources <tmp>/mixed/.td-work/sources.json \
  --source <first-repository-source-id-in-registry-order> \
  --start 1 \
  --out <tmp>/mixed/.td-work/repository-a-inventory.json

node <rt>/repo-inventory.mjs \
  --workspace-root <tmp>/mixed \
  --sources <tmp>/mixed/.td-work/sources.json \
  --source <second-repository-source-id-in-registry-order> \
  --start <repository-a-inventory.nextOrdinal> \
  --out <tmp>/mixed/.td-work/repository-b-inventory.json
```

Process transcript, notes, and draft Sources independently through `preprocess.mjs` and `chunk.mjs`, repeating `--workspace-root <tmp>/mixed` on every command. Start the first applicable `C*` Source at `1` and pass each manifest's `nextOrdinal` to the next applicable `C*` Source in Source Registry order.

Inventory repository Sources in Source Registry order, not command-line argument order. Start the first repository at `1`; pass each Repository Inventory's `nextOrdinal` to the next repository. If an inventory emits no `R*` work units, its unchanged `nextOrdinal` is still passed onward. A `complete: false` inventory stops the handoff.

Expected observations:

- Registry order follows source kind, role, and normalized path.
- No preprocessing command receives more than one semantic Source.
- Unique fixture sentinels retain their own Source ID, source kind, unit, and source reference after merge.
- `C*` identities remain unique across all prose Sources; `R*` identities remain unique across repository Sources.
- Repository inventories prove a contiguous run-wide `R*` sequence through `startOrdinal` and `nextOrdinal`.
- Same-named or byte-identical files from different Sources never collapse into one identity.

## Existing-Document Update Intake

Prepare an existing Markdown document with nested or repeated headings, a `C#` heading, fenced heading-like text, and supporting evidence.

```bash
node <rt>/source-manifest.mjs \
  --workspace-root <tmp>/update \
  --mode update \
  --workdir <tmp>/update/.td-work \
  --output <tmp>/update/document.md \
  --update-document <tmp>/update/document.md \
  --notes <tmp>/update/notes.md \
  --out <tmp>/update/.td-work/sources.json

node <rt>/headings.mjs \
  --workspace-root <tmp>/update \
  --sources <tmp>/update/.td-work/sources.json \
  --source <update-source-id> \
  --out <tmp>/update/.td-work/headings.json

node <rt>/chunk.mjs \
  --workspace-root <tmp>/update \
  --sources <tmp>/update/.td-work/sources.json \
  --source <update-source-id> \
  --start 1 \
  --headings <tmp>/update/.td-work/headings.json \
  --outdir <tmp>/update/.td-work/existing
```

Process the notes independently as `C*` units, again supplying `--workspace-root <tmp>/update` and the next applicable `C*` ordinal.

Expected observations:

- The update target is the only authorized input/output alias.
- `output.expectedTarget` records `state: "file"`, the update Source's exact byte length, and the same SHA-256 digest.
- Fenced heading-like text is excluded and `C#` is preserved.
- Every `E*` unit remains within one heading boundary and retains heading path plus line provenance.
- Finalization checks the original update-target digest immediately before atomic replacement.
- Unchanged sections remain present and any superseded evidence has an explicit consumed resolution.

## Extraction Through Finalization

For each flow, have the extractor process every expected `C*`, `E*`, and `R*` unit. It must emit exactly one semantic result at `<work>/results/<UnitId>.json` and must use an explicit no-evidence result rather than fabricating evidence. An evidence result declares its fragment path, digest, and entry count; no fragment filename is inferred.

After extraction, run index mode with every complete expected-unit manifest. Index mode derives each conventional result filename, validates complete manifest coverage and exact result-directory membership, validates every result-declared fragment, and atomically authors `<work>/results.json`.

```bash
node <rt>/merge-ledger.mjs \
  --workspace-root <root> \
  --mode index \
  --sources <work>/sources.json \
  --unit-manifest <work>/intake/S001/chunks.json \
  --unit-manifest <work>/intake/S002/inventory.json \
  --results-dir <work>/results \
  --out <work>/results.json

node <rt>/merge-ledger.mjs \
  --workspace-root <root> \
  --mode merge \
  --index <work>/results.json \
  --out <work>/ledger.jsonl

node <rt>/extraction-audit.mjs \
  --workspace-root <root> \
  --sources <work>/sources.json \
  --ledger <work>/ledger.jsonl \
  --result-index <work>/results.json \
  --json <work>/extraction.json

node <rt>/ledger-digest.mjs \
  --workspace-root <root> \
  --sources <work>/sources.json \
  --ledger <work>/ledger.jsonl \
  --out <work>/digest.md \
  --json <work>/digest.json
```

Repeat `--unit-manifest` once for every manifest required by `sources.json`. No command recursively discovers manifests, results, or fragments. Index mode checks the single declared results directory only against the exact expected filenames; merge reads only the index, and audit receives only `--result-index` for extraction membership.

Have the planner create `<work>/outline.md`, then validate exact-once assignment:

```bash
node <rt>/coverage.mjs \
  --workspace-root <root> \
  --mode outline \
  --ledger <work>/ledger.jsonl \
  --outline <work>/outline.md \
  --json <work>/outline-coverage.json
```

Have the drafter create `<work>/draft.md` and `<work>/consumed.jsonl`, then run pre-review diagnostics:

```bash
node <rt>/coverage.mjs \
  --workspace-root <root> \
  --mode document \
  --stage pre-review \
  --ledger <work>/ledger.jsonl \
  --consumed <work>/consumed.jsonl \
  --document <work>/draft.md \
  --json <work>/pre-review-coverage.json

node <rt>/lint.mjs \
  --workspace-root <root> \
  --sources <work>/sources.json \
  --stage pre-review \
  <work>/draft.md \
  --json <work>/pre-review-lint.json
```

Have `dude-pack-technical-docs-reviewer` review that exact draft and emit `<work>/review.json` plus `<work>/reviewed.md`. Run both final gates against the reviewed bytes:

```bash
node <rt>/coverage.mjs \
  --workspace-root <root> \
  --mode document \
  --stage final \
  --ledger <work>/ledger.jsonl \
  --consumed <work>/consumed.jsonl \
  --document <work>/reviewed.md \
  --json <work>/final-coverage.json

node <rt>/lint.mjs \
  --workspace-root <root> \
  --sources <work>/sources.json \
  --stage final \
  <work>/reviewed.md \
  --json <work>/final-lint.json

node <rt>/finalize.mjs \
  --workspace-root <root> \
  --sources <work>/sources.json \
  --draft <work>/reviewed.md \
  --consumed <work>/consumed.jsonl \
  --extraction <work>/extraction.json \
  --outline-coverage <work>/outline-coverage.json \
  --pre-coverage <work>/pre-review-coverage.json \
  --pre-lint <work>/pre-review-lint.json \
  --review <work>/review.json \
  --final-coverage <work>/final-coverage.json \
  --final-lint <work>/final-lint.json
```

Expected observations:

- Index mode rejects incomplete manifest coverage and missing, duplicate, unexpected, stale, aliased, malformed, or fragment-invalid inputs.
- Merge rejects malformed, unreadable, duplicate, aliased, self-referential, or empty indexed inputs and performs no directory discovery.
- Extraction audit reconciles every expected unit, result, examined member, result-declared fragment, and evidence entry from the result index.
- Every ledger ID appears once in the Outline and once in consumed JSONL.
- `digest.json` and `digest.md` bind the same Source Registry and ledger; decision/action IDs occur only in their fixed route and ordinary IDs occur in exactly one tag group.
- Pre-review reports are diagnostic only.
- Semantic review and both final reports bind one reviewed-document digest.
- The final destination, mode, and expected target come from `sources.json`; `finalize.mjs` accepts no override.
- Publication occurs only after the complete current chain is validated.

## Expected-Target Drift Rejection

Exercise all three modes with disposable targets and a complete passing report chain.

Expected observations:

- In `create`, `expectedTarget.state` is `absent`. If any filesystem object appears at the destination after registration, finalization fails and does not overwrite it.
- In `replace`, `expectedTarget.state` is `file` and records exact bytes and digest. Disappearance, type change, byte drift, symlink substitution, path escape, or a forbidden current alias fails.
- In `update`, expected bytes and digest equal the declared update-target Source. Drift of that Source or aliasing to any other protected input fails.
- Replacing a target with byte-identical regular-file content remains equivalent under the portable contract.
- Every failure preserves the prior target and leaves no partial or temporary output.

## Stale-Evidence Rejection

1. Produce a complete report chain in a disposable flow.
2. Modify `<work>/reviewed.md` after semantic review or after either final gate.
3. Invoke `finalize.mjs` with the same `--workspace-root <root>` and without refreshing the affected reports.

Expected observations:

- Finalization exits nonzero with the digest mismatch identified.
- The authorized output remains unchanged.
- No partial or temporary output remains.
- Re-running only finalization does not help. The resulting revision requires semantic review again, followed by both final gates.

Repeat by changing a registered file Source or admitted repository member after registration. Expected observation: finalization rejects the stale source chain even if document reports were not changed.

Also substitute a pre-review report where a final report is required. Expected observation: stage mismatch is rejected.

## Standalone And Writing Composition

Create three disposable core copies: `<tmp>/standalone`, `<tmp>/writing-first`, and `<tmp>/technical-first`.

```bash
node <tmp>/standalone/.github/skills/dude-compose/compose.mjs \
  add technical-docs --root <tmp>/standalone \
  --library <catalog> --no-fetch --json

node <tmp>/writing-first/.github/skills/dude-compose/compose.mjs \
  add writing --root <tmp>/writing-first \
  --library <catalog> --no-fetch --json
node <tmp>/writing-first/.github/skills/dude-compose/compose.mjs \
  add technical-docs --root <tmp>/writing-first \
  --library <catalog> --no-fetch --json

node <tmp>/technical-first/.github/skills/dude-compose/compose.mjs \
  add technical-docs --root <tmp>/technical-first \
  --library <catalog> --no-fetch --json
node <tmp>/technical-first/.github/skills/dude-compose/compose.mjs \
  add writing --root <tmp>/technical-first \
  --library <catalog> --no-fetch --json
```

Run the same bounded smoke flow in all three roots and lint each root.

Expected observations:

- Standalone technical-docs provides the complete intake, provenance, drafting, review, and finalization contract.
- Writing-enabled runs may refine style but do not change source, evidence, gate, or output-authorization contracts.
- Both install orders resolve current skill identities.
- No required sibling-pack schema appears.

Remove technical-docs from both combined roots:

```bash
node <tmp>/writing-first/.github/skills/dude-compose/compose.mjs \
  remove technical-docs --root <tmp>/writing-first --json

node <tmp>/technical-first/.github/skills/dude-compose/compose.mjs \
  remove technical-docs --root <tmp>/technical-first --json
```

Expected observation: writing artifacts and profile ownership remain intact while all technical-docs-owned artifacts and references are gone.

## Pristine Release And Disposable Install

Build one pristine core-only release and lint it before any pack installation:

```bash
node scripts/build-release.mjs \
  --out <tmp>/pristine \
  --tag <release-tag>

node <tmp>/pristine/.github/skills/dude-lint/lint.mjs \
  <tmp>/pristine
```

Accept the pristine step only when the build exits `0`, the release contains core artifacts only, and lint reports zero failures.

Create a separate disposable copy at `<tmp>/install-check`. Do not run compose against `<tmp>/pristine`.

```bash
node <tmp>/install-check/.github/skills/dude-compose/compose.mjs \
  add technical-docs \
  --root <tmp>/install-check \
  --library <catalog> \
  --no-fetch \
  --json

node <tmp>/install-check/.github/skills/dude-lint/lint.mjs \
  <tmp>/install-check
```

Expected installed-surface observations:

- Exactly 5 technical-docs agents, 7 skills, and 2 prompts are installed under the intended namespace.
- The runtime includes the 9 hardened existing CLIs, `source-manifest.mjs`, `finalize.mjs`, and the nested shared runtime module.
- Authoring-only tests are absent.
- The profile records the complete exact inventory and lint reports zero failures.

Then remove the pack:

```bash
node <tmp>/install-check/.github/skills/dude-compose/compose.mjs \
  remove technical-docs \
  --root <tmp>/install-check \
  --json

node <tmp>/install-check/.github/skills/dude-lint/lint.mjs \
  <tmp>/install-check
```

Expected removal observations:

- No `dude-pack-technical-docs-*` artifact remains.
- The profile contains no enabled or installed technical-docs entry.
- No stale agent, skill, prompt, hook, or pack reference remains.
- The remaining disposable root lints with zero failures.
- The untouched `<tmp>/pristine` release remains available for core-only inspection.

## Acceptance Evidence

Before independent review, collect expected results from:

```bash
node --test library/packs/technical-docs/tests/*.test.mjs
node .github/skills/dude-compose/compose.mjs verify
node .github/skills/dude-lint/lint.mjs .
```

Also run full repository test discovery excluding `dist`, all four live modes above, lifecycle cleanup, and the pristine-release procedure. Treat any later mutation as invalidating the affected evidence and all downstream checks.
